/**
 * Keep-oldest cleanup for exact-duplicate document_chunks (same branch_id +
 * same content). Companion to findDuplicateChunks.ts (which is read-only) —
 * this one actually deletes. Prints what it found and what it deleted.
 *
 * Usage (run from backend/):
 *   npx tsx scripts/cleanupDuplicateChunks.ts
 *   BRANCH_ID=<uuid> npx tsx scripts/cleanupDuplicateChunks.ts
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
  console.log('Fetching document_chunks...');
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

  if (dupGroups.length === 0) {
    console.log('\nNo duplicate groups found. Nothing to clean up.');
    process.exit(0);
  }

  console.log(`\nDuplicate groups found: ${dupGroups.length}`);

  const idsToDelete: string[] = [];
  for (const g of dupGroups) {
    // Rows come out sorted by created_at ascending (query order), so g[0] is oldest.
    const [keep, ...rest] = g;
    console.log(`\n  branch_id=${keep.branch_id}`);
    console.log(`  content: "${keep.content.slice(0, 80).replace(/\n/g, ' ')}..."`);
    console.log(`  KEEP   id=${keep.id} source_url=${keep.source_url} created_at=${keep.created_at}`);
    for (const row of rest) {
      console.log(`  DELETE id=${row.id} source_url=${row.source_url} created_at=${row.created_at}`);
      idsToDelete.push(row.id);
    }
  }

  console.log(`\nDeleting ${idsToDelete.length} row(s)...`);
  const { data, error } = await supabase
    .from('document_chunks')
    .delete()
    .in('id', idsToDelete)
    .select('id');

  if (error) {
    console.error('ERROR during delete:', error.message);
    process.exit(1);
  }

  console.log(`Deleted ${data?.length ?? 0} row(s).`);
  process.exit(0);
}

main().catch(err => {
  console.error('ERROR:', err instanceof Error ? err.message : err);
  process.exit(1);
});
