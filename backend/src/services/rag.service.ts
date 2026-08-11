import OpenAI from 'openai';
import { createHash } from 'crypto';
import { supabase } from '../lib/supabase.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import logger from '../utils/logger.js';

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;
const CHARS_PER_TOKEN = 4;

// Repairs the text-layer artefacts that document extraction (mainly PDF)
// leaves behind, BEFORE chunking and embedding. Clients will keep uploading
// PDFs, so this protects every future tenant rather than one document.
//
// Deliberately conservative — it only touches whitespace and invisible
// characters, never word content, and it PRESERVES blank lines because
// chunkText() splits paragraphs on \n\n. Measured effect on retrieval is
// small (+0.003–0.013 cosine on real queries); the real wins are that
// zero-width characters can genuinely fuse words for downstream consumers,
// and that collapsing justified-text runs trims ~6% of tokens per chunk.
export function normaliseExtractedText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')                    // CRLF/CR → LF
    .replace(/[\u200B-\u200D\uFEFF]/g, '')      // zero-width chars — the only
                                                // artefact that truly fuses words
    .replace(/[\u00A0\u2007\u202F]/g, ' ')      // non-breaking/figure spaces → real space
    .replace(/[ \t]{2,}/g, ' ')                 // justified-text runs ("villa  250  SQM")
    .replace(/[ \t]+\n/g, '\n')                 // trailing spaces before a newline
    .replace(/\n{3,}/g, '\n\n')                 // cap blank-line runs, keep paragraph breaks
    .trim();
}

class RagService {

  // Splits a single oversized block at the most structural boundary
  // available, so a hard split never lands mid-entry when a softer boundary
  // exists. Order matters: line breaks first, because listing tables and
  // spec sheets are line-oriented and a per-line split keeps one unit's
  // fields together.
  private splitIntoUnits(text: string): string[] {
    if (/\n/.test(text)) return text.split(/(?<=\n)/);
    const sentences = text.split(/(?<=[.!?])\s+/);
    if (sentences.length > 1) {
      return sentences.map((s, i, arr) => (i < arr.length - 1 ? `${s} ` : s));
    }
    return text.split(/(?<=\s)/);
  }

  // Last resort for a single unbroken run with no whitespace at all (rare —
  // e.g. a long URL or base64 blob). Backs off to the last space when there
  // is one, so we still avoid cutting mid-word where possible.
  private hardSlice(text: string, maxChars: number): string[] {
    const out: string[] = [];
    let rest = text;
    while (rest.length > maxChars) {
      const window = rest.slice(0, maxChars);
      const lastSpace = window.lastIndexOf(' ');
      const cut = lastSpace > maxChars * 0.6 ? lastSpace : maxChars;
      out.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut);
    }
    if (rest.trim()) out.push(rest.trim());
    return out;
  }

  // Trailing context carried into the next chunk, bounded in CHARACTERS.
  // It used to take a fixed 40 words (overlapChars / 5, assuming 5 chars per
  // word), which is unbounded in practice: 40 trailing words of URLs carried
  // ~500 chars instead of 200, so chunks ran well past their budget (a real
  // 2561-char chunk in the Maryam KB came from the social-links section).
  // Word-granular, so overlap never starts mid-word.
  private tailOverlap(text: string, maxChars: number): string {
    const words = text.split(' ');
    let out = '';
    for (let i = words.length - 1; i >= 0; i--) {
      const next = out ? `${words[i]} ${out}` : words[i];
      if (next.length > maxChars) break;
      out = next;
    }
    return out;
  }

  private splitOversized(text: string, maxChars: number): string[] {
    if (text.length <= maxChars) return [text];

    const pieces: string[] = [];
    let current = '';
    for (const unit of this.splitIntoUnits(text)) {
      if (current && (current + unit).length > maxChars) {
        pieces.push(current.trim());
        current = unit;
      } else {
        current += unit;
      }
    }
    if (current.trim()) pieces.push(current.trim());

    return pieces.flatMap(p => (p.length <= maxChars ? [p] : this.hardSlice(p, maxChars)));
  }

  private chunkText(text: string): string[] {
    const chunkChars = CHUNK_SIZE * CHARS_PER_TOKEN;
    const overlapChars = CHUNK_OVERLAP * CHARS_PER_TOKEN;
    const chunks: string[] = [];

    // Hard-split any paragraph that alone blows the budget BEFORE
    // accumulating. Without this a PDF table — which extracts as one giant
    // paragraph with no blank lines — became a single oversized chunk: the
    // Maryam KB had 22/36 chunks over target (max 3805 chars) and one chunk
    // holding SIX distinct units, which is exactly the cross-unit conflation
    // that causes the agent to blend facts between properties (see §4).
    const paragraphs = text
      .split(/\n\n+/)
      .flatMap(para => this.splitOversized(para, chunkChars));

    let current = '';

    for (const para of paragraphs) {
      if ((current + para).length > chunkChars && current.length > 0) {
        chunks.push(current.trim());
        current = this.tailOverlap(current, overlapChars) + ' ' + para;
      } else {
        current = current ? current + '\n\n' + para : para;
      }
    }

    if (current.trim().length > 0) {
      chunks.push(current.trim());
    }

    if (chunks.length === 0 && text.length > 0) {
      for (let i = 0; i < text.length; i += chunkChars - overlapChars) {
        chunks.push(text.slice(i, i + chunkChars).trim());
      }
    }

    return chunks.filter(c => c.length > 50);
  }

  private async embedText(text: string): Promise<number[]> {
    const response = await openai.embeddings.create({
      model: env.EMBEDDING_MODEL,
      input: text.replace(/\n/g, ' '),
    });
    return response.data[0].embedding;
  }

  async ingestText(params: {
    text: string;
    branchId: string;
    sourceType: 'upload' | 'website_crawl';
    sourceUrl?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ chunksCreated: number }> {
    const { text: rawText, branchId, sourceType, sourceUrl, metadata = {} } = params;

    if (!rawText || rawText.trim().length < 10) {
      throw new AppError('Document text is too short to index', 400);
    }

    // Repair extraction artefacts once, here — every ingestion path (upload,
    // single-page capture, widget auto-capture) funnels through this method,
    // so this is the one place that covers them all. Everything downstream
    // (chunking, embedding, enrichment) sees the cleaned text.
    const text = normaliseExtractedText(rawText);

    const chunks = this.chunkText(text);

    if (chunks.length === 0) {
      throw new AppError('No indexable content found in document', 400);
    }

    logger.info(`Ingesting ${chunks.length} chunks for branch ${branchId}`);

    let inserted = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      try {
        const embedding = await this.embedText(chunk);

        const { error } = await supabase
          .from('document_chunks')
          .insert({
            branch_id: branchId,
            content: chunk,
            metadata: {
              ...metadata,
              chunk_index: i,
              total_chunks: chunks.length,
              source_url: sourceUrl ?? null,
            },
            source_type: sourceType,
            source_url: sourceUrl ?? null,
            embedding,
          });

        if (error) {
          logger.error(`Failed to insert chunk ${i} for branch ${branchId}: ${error.message}`);
        } else {
          inserted++;
        }
      } catch (err) {
        logger.error(`Failed to embed chunk ${i}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    logger.info(`Ingested ${inserted}/${chunks.length} chunks for branch ${branchId}`);

    // Enrichment pass — generate Q&A + summary chunks for phrasing-robust retrieval.
    // Additive: failures here never affect the raw chunks already inserted.
    try {
      const enrichmentPassages = await this.enrichContent(text);
      for (let j = 0; j < enrichmentPassages.length; j++) {
        const passage = enrichmentPassages[j];
        try {
          const embedding = await this.embedText(passage);
          const { error } = await supabase
            .from('document_chunks')
            .insert({
              branch_id: branchId,
              content: passage,
              metadata: {
                ...metadata,
                enriched: true,
                enrichment_index: j,
                source_url: sourceUrl ?? null,
              },
              source_type: sourceType,
              source_url: sourceUrl ?? null,
              embedding,
            });
          if (error) {
            logger.error(`Failed to insert enrichment chunk ${j}: ${error.message}`);
          } else {
            inserted++;
          }
        } catch (err) {
          logger.error(`Failed to embed enrichment chunk ${j}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      if (enrichmentPassages.length > 0) {
        logger.info(`Enrichment added ${enrichmentPassages.length} passages for branch ${branchId}`);
      }
    } catch (err) {
      logger.error(`Enrichment pass error: ${err instanceof Error ? err.message : String(err)}`);
    }

    return { chunksCreated: inserted };
  }

  private async enrichContent(text: string): Promise<string[]> {
    try {
      const trimmed = text.replace(/\s+/g, ' ').trim();
      if (trimmed.length < 300) return [];

      const input = trimmed.slice(0, 12000);

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 900,
        messages: [
          {
            role: 'system',
            content:
              'You turn business content into retrieval-friendly Q&A. ' +
              'From the provided text, produce a JSON object with two fields: ' +
              '"summary" (2-3 sentence plain-language summary of the key facts) and ' +
              '"qa" (an array of up to 10 objects, each {"q": question, "a": answer}). ' +
              'Generate the natural questions a real customer would ask, and answer ' +
              'ONLY using facts present in the text — never invent prices, sizes, names, ' +
              'or details. Cover concrete facts: names, prices, sizes, locations, ' +
              'features, availability, contact info. Keep answers concise and factual. ' +
              'Respond with ONLY the JSON object, no markdown, no preamble.',
          },
          { role: 'user', content: input },
        ],
        response_format: { type: 'json_object' },
      });

      const raw = completion.choices[0]?.message?.content ?? '';
      if (!raw) return [];

      let parsed: { summary?: string; qa?: Array<{ q?: string; a?: string }> };
      try {
        parsed = JSON.parse(raw);
      } catch {
        return [];
      }

      const passages: string[] = [];
      if (parsed.summary && parsed.summary.trim().length > 20) {
        passages.push(`Summary: ${parsed.summary.trim()}`);
      }
      if (Array.isArray(parsed.qa)) {
        for (const pair of parsed.qa.slice(0, 10)) {
          if (pair?.q && pair?.a) {
            passages.push(`Q: ${String(pair.q).trim()}\nA: ${String(pair.a).trim()}`);
          }
        }
      }
      return passages;
    } catch (err) {
      logger.error(`Enrichment failed: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  async capturePage(params: {
    url: string;
    text: string;
    branchId: string;
    orgId: string;
    source?: string;
  }): Promise<{ status: 'skipped' | 'created' | 'updated'; chunksCreated: number }> {
    const { url, text, branchId, orgId, source = 'widget' } = params;

    const cleanText = (text ?? '').replace(/\s+/g, ' ').trim();
    if (cleanText.length < 200) {
      return { status: 'skipped', chunksCreated: 0 };
    }

    const contentHash = createHash('sha256').update(cleanText).digest('hex');

    const { data: existing } = await supabase
      .from('captured_pages')
      .select('id, content_hash')
      .eq('branch_id', branchId)
      .eq('url', url)
      .maybeSingle();

    if (existing && existing.content_hash === contentHash) {
      await supabase
        .from('captured_pages')
        .update({ captured_at: new Date().toISOString() })
        .eq('id', existing.id);
      return { status: 'skipped', chunksCreated: 0 };
    }

    if (existing) {
      await supabase
        .from('document_chunks')
        .delete()
        .eq('branch_id', branchId)
        .eq('source_url', url);
    }

    const { chunksCreated } = await this.ingestText({
      text: cleanText,
      branchId,
      sourceType: 'website_crawl',
      sourceUrl: url,
      metadata: { captured_at: new Date().toISOString(), capture_source: source },
    });

    await supabase
      .from('captured_pages')
      .upsert({
        branch_id: branchId,
        org_id: orgId,
        url,
        content_hash: contentHash,
        char_count: cleanText.length,
        captured_at: new Date().toISOString(),
        source,
      }, { onConflict: 'branch_id,url' });

    return { status: existing ? 'updated' : 'created', chunksCreated };
  }

  // Fetches exactly one URL server-side and indexes it through capturePage,
  // so manual "Add page" gets the same content-hash dedup / delete-before-
  // replace behavior as the widget's auto-capture path — no link-following,
  // genuinely a single page (see CLAUDE.md §8[3c] for why this replaced the
  // old BFS crawlAndIngest, which had no dedup and silently followed links
  // despite the UI calling it a single-page add).
  async captureSinglePage(params: {
    url: string
    branchId: string
    orgId: string
  }): Promise<{ status: 'skipped' | 'created' | 'updated'; chunksCreated: number }> {
    const { url, branchId, orgId } = params

    try {
      new URL(url)
    } catch {
      throw new AppError('Invalid URL provided', 400)
    }

    const { default: fetch } = await import('node-fetch')
    const { load } = await import('cheerio')

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'NizamBot/1.0 (knowledge base indexer)',
      },
      signal: AbortSignal.timeout(10000), // 10s timeout
    })

    if (!response.ok) {
      throw new AppError(`Failed to fetch page: HTTP ${response.status}`, 400)
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html')) {
      throw new AppError(`URL did not return an HTML page (${contentType})`, 400)
    }

    const html = await response.text()
    const $ = load(html)

    // Remove non-content elements
    $('script, style, nav, footer, header, iframe, noscript, svg').remove()
    $('[role="navigation"], [role="banner"], [role="complementary"]').remove()

    const text = $('body').text().replace(/\s+/g, ' ').trim()
    const title = $('title').text().trim()
    const metaDesc = $('meta[name="description"]').attr('content') ?? ''
    const combined = [title, metaDesc, text].filter(Boolean).join('\n\n')

    return this.capturePage({ url, text: combined, branchId, orgId, source: 'manual' })
  }

  // Returns the raw matched chunk contents (no joining) so callers can merge
  // and dedupe results from multiple searches (see prepareTurn's dual-query
  // retrieval). getContext below wraps this for the single-query, joined-
  // string use case.
  async getContextChunks(params: {
    query: string;
    branchId: string;
    matchCount?: number;
    matchThreshold?: number;
  }): Promise<string[]> {
    // Default tightened 0.45 -> 0.6: with per-unit structured chunks now in
    // the knowledge base, correct matches score high, so the looser floor was
    // only admitting conflation-fodder (thin, tangential chunks that gave the
    // model raw material to blend facts across properties). The contextualized
    // retrieval query (see prepareTurn) also means legitimate follow-ups score
    // higher on their own, reducing the need for a lenient floor.
    const { query, branchId, matchCount = 8, matchThreshold = 0.6 } = params;

    try {
      const embedding = await this.embedText(query);

      const { data, error } = await supabase.rpc('match_documents', {
        query_embedding: embedding,
        p_branch_id: branchId,
        match_count: matchCount,
        match_threshold: matchThreshold,
      });

      if (error) {
        logger.error(`RAG search error: ${error.message}`);
        return [];
      }

      if (!data || data.length === 0) return [];

      return (data as Array<{ content: string }>).map(row => row.content);
    } catch (err) {
      logger.error(`getContext error: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  async getContext(params: {
    query: string;
    branchId: string;
    matchCount?: number;
    matchThreshold?: number;
  }): Promise<string> {
    const chunks = await this.getContextChunks(params);
    return chunks.join('\n\n---\n\n');
  }

  async deleteChunksBySource(params: {
    branchId: string;
    sourceUrl: string;
  }): Promise<{ deleted: number }> {
    const { branchId, sourceUrl } = params;

    const { data, error } = await supabase
      .from('document_chunks')
      .delete()
      .eq('branch_id', branchId)
      .eq('source_url', sourceUrl)
      .select();

    if (error) throw new AppError(error.message, 500);
    return { deleted: data?.length ?? 0 };
  }

  async deleteAllChunks(branchId: string): Promise<{ deleted: number }> {
    const { data, error } = await supabase
      .from('document_chunks')
      .delete()
      .eq('branch_id', branchId)
      .select();

    if (error) throw new AppError(error.message, 500);
    return { deleted: data?.length ?? 0 };
  }

  async listSources(branchId: string): Promise<Array<{
    source_url: string;
    source_type: string;
    chunk_count: number;
    last_crawled_at: string | null;
  }>> {
    const { data, error } = await supabase
      .from('document_chunks')
      .select('source_url, source_type, last_crawled_at')
      .eq('branch_id', branchId)
      .not('source_url', 'is', null);

    if (error) throw new AppError(error.message, 500);

    const sourceMap = new Map<string, {
      source_url: string;
      source_type: string;
      chunk_count: number;
      last_crawled_at: string | null;
    }>();

    for (const row of data ?? []) {
      const key = row.source_url as string;
      if (!key) continue;
      if (sourceMap.has(key)) {
        sourceMap.get(key)!.chunk_count++;
      } else {
        sourceMap.set(key, {
          source_url: key,
          source_type: row.source_type as string,
          chunk_count: 1,
          last_crawled_at: (row.last_crawled_at as string | null) ?? null,
        });
      }
    }

    return Array.from(sourceMap.values());
  }
}

export const ragService = new RagService();
