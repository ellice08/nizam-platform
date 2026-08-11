/**
 * reindexBranch — re-embed a branch's knowledge chunks under the CURRENT
 * EMBEDDING_MODEL, and audit which model each chunk was embedded with.
 *
 * WHY THIS EXISTS
 * Embeddings from different models are not comparable — but they are also not
 * detectably incomparable. text-embedding-3-small defaults to 1536 dimensions,
 * the same as the older ada-002, so a branch holding a mix does NOT error:
 * match_documents still runs, still returns rows, and still reports
 * plausible-looking similarity scores. The stale chunks simply sink out of
 * reach. That presents exactly like "the agent forgot things", which is the
 * same signature as a KB gap or a wrong-branch bug — easy to misdiagnose for
 * hours. See CLAUDE.md §7.
 *
 * Consequences that shape this script:
 *  - EMBEDDING_MODEL is ONE global env var, but embeddings are stored PER
 *    BRANCH. Changing it strands every branch not re-indexed — including the
 *    Platform Support branch behind the in-app assistant. A model switch is a
 *    platform-wide operation, so `--all-branches` exists, but it runs branches
 *    SEQUENTIALLY with a report after each: discover a problem on one branch,
 *    not all of them.
 *  - ragService reads env at call time, so what matters is the model the
 *    DEPLOYED backend uses, not your local .env. Run `--audit` against the
 *    same environment before trusting a switch.
 *
 * Every chunk this script writes is stamped with metadata.embedding_model, so
 * a mixed corpus becomes visible to `--audit` instead of silent. Chunks
 * written before that stamp existed report as "(unstamped — pre-dates
 * reindexBranch)"; on a branch that has never been re-indexed they are all
 * whatever model was configured when they were ingested.
 *
 * USAGE
 *   npx tsx scripts/reindexBranch.ts --audit
 *   npx tsx scripts/reindexBranch.ts --branch <uuid>            (dry run)
 *   npx tsx scripts/reindexBranch.ts --branch <uuid> --apply
 *   npx tsx scripts/reindexBranch.ts --all-branches --apply
 *   ... add --normalise to also repair extraction artefacts in stored content
 *
 * Re-embeds from STORED CONTENT: it does not re-chunk, so no source file is
 * needed and it is safe for branches whose original upload is long gone. To
 * pick up chunkText changes you must re-ingest from source instead.
 */
import dotenv from 'dotenv';
dotenv.config();

import OpenAI from 'openai';
import { supabase } from '../src/lib/supabase.js';
import { env } from '../src/config/env.js';
import { normaliseExtractedText } from '../src/services/rag.service.js';

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const val = (f: string): string | undefined => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};

const APPLY = has('--apply');
const NORMALISE = has('--normalise');
const MODEL = env.EMBEDDING_MODEL;

type Chunk = { id: string; branch_id: string; content: string; metadata: Record<string, unknown> | null };

async function fetchChunks(branchId?: string): Promise<Chunk[]> {
  let q = supabase.from('document_chunks').select('id, branch_id, content, metadata');
  if (branchId) q = q.eq('branch_id', branchId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Chunk[];
}

async function branchLabel(branchId: string): Promise<string> {
  const { data } = await supabase
    .from('branches').select('name, organisation_id').eq('id', branchId).maybeSingle();
  if (!data) return branchId;
  const { data: org } = await supabase
    .from('organisations').select('name').eq('id', (data as any).organisation_id).maybeSingle();
  return `${(org as any)?.name ?? '?'} / ${(data as any).name}`;
}

async function audit(): Promise<void> {
  const chunks = await fetchChunks();
  const byBranch = new Map<string, Map<string, number>>();
  for (const c of chunks) {
    const model = (c.metadata?.embedding_model as string) ?? '(unstamped — pre-dates reindexBranch)';
    if (!byBranch.has(c.branch_id)) byBranch.set(c.branch_id, new Map());
    const m = byBranch.get(c.branch_id)!;
    m.set(model, (m.get(model) ?? 0) + 1);
  }

  console.log(`Configured EMBEDDING_MODEL in THIS environment: ${MODEL}`);
  console.log(`Total chunks: ${chunks.length} across ${byBranch.size} branch(es)\n`);

  let mixed = 0;
  for (const [branchId, models] of byBranch) {
    console.log(`${await branchLabel(branchId)}  [${branchId}]`);
    for (const [model, n] of models) console.log(`    ${String(n).padStart(4)}  ${model}`);
    if (models.size > 1) {
      mixed++;
      console.log('    *** MIXED MODELS ON ONE BRANCH — retrieval is silently degraded here ***');
    }
    console.log('');
  }
  if (mixed) {
    console.log(`${mixed} branch(es) hold more than one embedding model. Re-index them.`);
  } else {
    console.log('No branch holds more than one stamped model.');
    console.log('NOTE: unstamped chunks could still be any model — this cannot be detected');
    console.log('retroactively, only prevented going forward. Re-index to make it certain.');
  }
}

async function reindexBranch(branchId: string): Promise<void> {
  const label = await branchLabel(branchId);
  const chunks = await fetchChunks(branchId);
  console.log(`\n=== ${label}  [${branchId}] ===`);
  console.log(`chunks: ${chunks.length} | target model: ${MODEL} | normalise content: ${NORMALISE}`);

  if (!chunks.length) { console.log('nothing to do'); return; }
  if (!APPLY) {
    const sample = chunks[0];
    const after = NORMALISE ? normaliseExtractedText(sample.content) : sample.content;
    console.log('DRY RUN — no writes. Sample chunk would become:');
    console.log(`  ${JSON.stringify(after.slice(0, 160))}…`);
    console.log(`  (content ${sample.content.length} → ${after.length} chars)`);
    return;
  }

  let ok = 0, failed = 0;
  for (const c of chunks) {
    const content = NORMALISE ? normaliseExtractedText(c.content) : c.content;
    try {
      const res = await openai.embeddings.create({ model: MODEL, input: content.replace(/\n/g, ' ') });
      const embedding = res.data[0].embedding;
      const { error } = await supabase
        .from('document_chunks')
        .update({
          content,
          embedding,
          metadata: { ...(c.metadata ?? {}), embedding_model: MODEL, reindexed_at: new Date().toISOString() },
        })
        .eq('id', c.id);
      if (error) { failed++; console.error(`  chunk ${c.id.slice(0, 8)} update failed: ${error.message}`); }
      else ok++;
    } catch (err) {
      failed++;
      console.error(`  chunk ${c.id.slice(0, 8)} embed failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(`re-embedded ${ok}/${chunks.length}${failed ? ` (${failed} FAILED — branch is now MIXED, re-run before using it)` : ''}`);

  // Verify the branch is uniform afterwards rather than trusting the counter.
  const after = await fetchChunks(branchId);
  const models = new Set(after.map(c => (c.metadata?.embedding_model as string) ?? '(unstamped)'));
  console.log(`verify: ${models.size === 1 ? 'UNIFORM' : 'MIXED'} → ${[...models].join(', ')}`);
}

async function main(): Promise<void> {
  if (has('--audit')) { await audit(); return; }

  const branchId = val('--branch');
  if (!branchId && !has('--all-branches')) {
    console.error('Specify --branch <uuid>, or --all-branches, or --audit.');
    process.exit(1);
  }

  if (!APPLY) console.log('DRY RUN (pass --apply to write)\n');

  if (branchId) { await reindexBranch(branchId); return; }

  const all = await fetchChunks();
  const branchIds = [...new Set(all.map(c => c.branch_id))];
  console.log(`${branchIds.length} branch(es) with chunks. Running SEQUENTIALLY.`);
  for (const id of branchIds) await reindexBranch(id);
  console.log('\nAll branches processed. Spot-check retrieval on each before considering this done.');
}

main().catch(err => { console.error('ERROR:', err instanceof Error ? err.message : err); process.exit(1); });
