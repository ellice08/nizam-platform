/**
 * Deletes captured_pages + document_chunks rows whose URL host is a local
 * or LAN dev address (localhost / 127.0.0.1 / 0.0.0.0 / RFC1918 private IP,
 * any port) — leftover artifacts from crawling a local dev server (including
 * from another device on the same network), not real client content.
 *
 * Usage (run from backend/):
 *   npx tsx scripts/cleanupDevTestPages.ts
 *   BRANCH_ID=<uuid> npx tsx scripts/cleanupDevTestPages.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import { supabase } from '../src/lib/supabase.js';

const BRANCH_ID = process.env['BRANCH_ID'] || null;
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0'];
const PRIVATE_IPV4 = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/;

function isLocalUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return LOCAL_HOSTS.includes(hostname) || PRIVATE_IPV4.test(hostname);
  } catch {
    return false;
  }
}

async function main() {
  console.log('Fetching captured_pages...');
  let pagesQuery = supabase.from('captured_pages').select('id, branch_id, url');
  if (BRANCH_ID) pagesQuery = pagesQuery.eq('branch_id', BRANCH_ID);
  const { data: pages, error: pagesErr } = await pagesQuery;
  if (pagesErr) throw new Error(pagesErr.message);

  const localPages = (pages ?? []).filter(p => isLocalUrl(p.url as string));
  console.log(`captured_pages: ${pages?.length ?? 0} total, ${localPages.length} local dev-test`);

  if (localPages.length === 0) {
    console.log('\nNothing to clean up.');
    process.exit(0);
  }

  console.log('\nPages to delete:');
  for (const p of localPages) {
    console.log(`  branch_id=${p.branch_id} url=${p.url}`);
  }

  let chunksDeleted = 0;
  for (const p of localPages) {
    const { data, error } = await supabase
      .from('document_chunks')
      .delete()
      .eq('branch_id', p.branch_id as string)
      .eq('source_url', p.url as string)
      .select('id');
    if (error) throw new Error(`chunk delete failed for ${p.url}: ${error.message}`);
    chunksDeleted += data?.length ?? 0;
  }
  console.log(`\nDeleted ${chunksDeleted} document_chunks row(s).`);

  const { data: deletedPages, error: delPagesErr } = await supabase
    .from('captured_pages')
    .delete()
    .in('id', localPages.map(p => p.id as string))
    .select('id');
  if (delPagesErr) throw new Error(delPagesErr.message);
  console.log(`Deleted ${deletedPages?.length ?? 0} captured_pages row(s).`);

  process.exit(0);
}

main().catch(err => {
  console.error('ERROR:', err instanceof Error ? err.message : err);
  process.exit(1);
});
