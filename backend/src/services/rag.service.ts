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

class RagService {

  private chunkText(text: string): string[] {
    const chunkChars = CHUNK_SIZE * CHARS_PER_TOKEN;
    const overlapChars = CHUNK_OVERLAP * CHARS_PER_TOKEN;
    const chunks: string[] = [];

    const paragraphs = text.split(/\n\n+/);
    let current = '';

    for (const para of paragraphs) {
      if ((current + para).length > chunkChars && current.length > 0) {
        chunks.push(current.trim());
        const words = current.split(' ');
        const overlapWords = words.slice(
          Math.max(0, words.length - Math.floor(overlapChars / 5))
        );
        current = overlapWords.join(' ') + ' ' + para;
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
    const { text, branchId, sourceType, sourceUrl, metadata = {} } = params;

    if (!text || text.trim().length < 10) {
      throw new AppError('Document text is too short to index', 400);
    }

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

  async crawlAndIngest(params: {
    url: string
    branchId: string
    maxPages?: number
  }): Promise<{ pagesIndexed: number; chunksCreated: number; errors: string[] }> {
    const { url, branchId, maxPages = 10 } = params

    // Validate URL
    let baseUrl: URL
    try {
      baseUrl = new URL(url)
    } catch {
      throw new AppError('Invalid URL provided', 400)
    }

    const visited = new Set<string>()
    const queue: string[] = [url]
    const errors: string[] = []
    let pagesIndexed = 0
    let totalChunks = 0

    // Helper: fetch and extract text from a single page
    const fetchPage = async (pageUrl: string): Promise<{
      text: string
      links: string[]
    }> => {
      const { default: fetch } = await import('node-fetch')
      const { load } = await import('cheerio')

      const response = await fetch(pageUrl, {
        headers: {
          'User-Agent': 'NizamBot/1.0 (knowledge base indexer)',
        },
        signal: AbortSignal.timeout(10000), // 10s timeout
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${pageUrl}`)
      }

      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.includes('text/html')) {
        throw new Error(`Not an HTML page: ${contentType}`)
      }

      const html = await response.text()
      const $ = load(html)

      // Remove non-content elements
      $('script, style, nav, footer, header, iframe, noscript, svg').remove()
      $('[role="navigation"], [role="banner"], [role="complementary"]').remove()

      // Extract visible text
      const text = $('body').text()
        .replace(/\s+/g, ' ')
        .trim()

      const title = $('title').text().trim()
      const metaDesc = $('meta[name="description"]').attr('content') ?? ''
      const combined = [title, metaDesc, text].filter(Boolean).join('\n\n')

      // Extract internal links
      const links: string[] = []
      $('a[href]').each((_i, el) => {
        const href = $(el).attr('href')
        if (!href) return

        try {
          const absolute = new URL(href, pageUrl)
          // Only follow links on the same domain
          if (absolute.hostname === baseUrl.hostname) {
            // Clean the URL — remove fragments and trailing slashes
            absolute.hash = ''
            const clean = absolute.toString().replace(/\/$/, '')
            if (clean && !visited.has(clean)) {
              links.push(clean)
            }
          }
        } catch {
          // Invalid URL — skip
        }
      })

      return { text: combined, links }
    }

    // BFS crawl up to maxPages
    while (queue.length > 0 && pagesIndexed < maxPages) {
      const pageUrl = queue.shift()!

      if (visited.has(pageUrl)) continue
      visited.add(pageUrl)

      try {
        logger.info(`Crawling: ${pageUrl}`)
        const { text, links } = await fetchPage(pageUrl)

        logger.info(`Extracted ${text.length} chars from: ${pageUrl}`)
        if (text.length < 200) {
          logger.warn(`Skipping thin page (${text.length} chars): ${pageUrl}`)
          continue
        }

        const { chunksCreated } = await this.ingestText({
          text,
          branchId,
          sourceType: 'website_crawl',
          sourceUrl: pageUrl,
          metadata: { crawled_at: new Date().toISOString() },
        })

        totalChunks += chunksCreated
        pagesIndexed++

        // Add new links to queue
        for (const link of links) {
          if (!visited.has(link) && queue.length < maxPages * 2) {
            queue.push(link)
          }
        }

        // Small delay between pages — be polite to the server
        await new Promise(resolve => setTimeout(resolve, 500))

      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.error(`Failed to crawl ${pageUrl}: ${message}`)
        errors.push(`${pageUrl}: ${message}`)
      }
    }

    logger.info(
      `Crawl complete: ${pagesIndexed} pages, ${totalChunks} chunks — ${url}`
    )

    return { pagesIndexed, chunksCreated: totalChunks, errors }
  }

  async getContext(params: {
    query: string;
    branchId: string;
    matchCount?: number;
    matchThreshold?: number;
  }): Promise<string> {
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
        return '';
      }

      if (!data || data.length === 0) return '';

      return (data as Array<{ content: string }>)
        .map(row => row.content)
        .join('\n\n---\n\n');
    } catch (err) {
      logger.error(`getContext error: ${err instanceof Error ? err.message : String(err)}`);
      return '';
    }
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
