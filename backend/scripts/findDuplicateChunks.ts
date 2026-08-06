/**
 * Read-only investigation: find exact-duplicate document_chunks (same
 * branch_id + same content) across all branches, or one branch if BRANCH_ID
 * is set. Does not delete or modify anything.
 *
 * Usage (run from backend/):
 *   npx tsx scripts/findDuplicateChunks.ts
 *   BRANCH_ID=<uuid> npx tsx scripts/findDuplicateChunks.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import { createHash } from 'crypto';
import { supabase } from '../src/lib/supabase.js';

const BRANCH_ID = process.env['BRANCH_ID'] || null;

type Row = {
  id: string;
  branch_id: string;
  content: string;
  source_url: string | null;
  source_type: string | null;
  created_at: string;
};

async function fetchAll(): Promise<Row[]> {
  const rows: Row[] = [];
  const pageSize = 1000;
  let from = 0;

  for (;;) {
    let query = supabase
      .from('document_chunks')
      .select('id, branch_id, content, source_url, source_type, created_at')
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);

    if (BRANCH_ID) query = query.eq('branch_id', BRANCH_ID);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    rows.push(...(data as Row[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function main() {
  console.log('Fetching document_chunks (read-only)...');
  const rows = await fetchAll();
  console.log(`Total chunks scanned: ${rows.length}`);

  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const key = row.branch_id + ':' + createHash('sha256').update(row.content).digest('hex');
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }

  const dupGroups = Array.from(groups.values()).filter(g => g.length > 1);
  const dupExtraRows = dupGroups.reduce((sum, g) => sum + (g.length - 1), 0);

  console.log(`\nDuplicate groups (same branch + exact content): ${dupGroups.length}`);
  console.log(`Extra rows that would be removed by a keep-oldest cleanup: ${dupExtraRows}`);

  const bySource = new Map<string, number>();
  for (const g of dupGroups) {
    for (const row of g.slice(1)) {
      const key = `${row.source_type ?? 'unknown'} | ${row.source_url ?? '(no source_url)'}`;
      bySource.set(key, (bySource.get(key) ?? 0) + 1);
    }
  }

  console.log('\nExtra (duplicate) rows by source:');
  for (const [key, count] of Array.from(bySource.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count.toString().padStart(4)}  ${key}`);
  }

  console.log('\nAll duplicate groups:');
  for (const g of dupGroups) {
    console.log(`\n  branch_id=${g[0].branch_id}`);
    console.log(`  content: "${g[0].content.slice(0, 80).replace(/\n/g, ' ')}..."`);
    console.log(`  ${g.length} copies:`);
    for (const row of g) {
      console.log(`    id=${row.id} source_type=${row.source_type} source_url=${row.source_url} created_at=${row.created_at}`);
    }
  }

  process.exit(0);
}

main().catch(err => {
  console.error('ERROR:', err instanceof Error ? err.message : err);
  process.exit(1);
});
