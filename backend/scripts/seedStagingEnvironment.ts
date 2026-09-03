/**
 * One-off script: bootstrap a fresh STAGING Supabase project after schema.sql
 * has been run against it. Creates the one thing schema.sql cannot carry over
 * (an auth.users row — Supabase Auth is project-scoped) plus the one storage
 * bucket the app assumes exists (see CLAUDE.md / the staging architecture
 * discovery: `logos`, uploaded to directly from the frontend, no
 * bucket-creation code anywhere). Idempotent: reuses an existing user/bucket
 * instead of failing or duplicating.
 *
 * SAFETY: this creates a super_admin auth user, so it must never run against
 * production. Two independent guards enforce that — see below. Both must
 * pass before anything is written.
 *
 * Usage (run from backend/):
 *   SUPABASE_URL=https://<staging-ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<staging-service-role-key> \
 *   CONFIRM_STAGING=yes \
 *   ADMIN_EMAIL=admin@yourcompany.com \
 *   ADMIN_PASSWORD='<strong-password>' \
 *     npx tsx scripts/seedStagingEnvironment.ts
 */

// dotenv is loaded transitively when the services import env.ts, but we call
// it first so process.env is populated before any Zod validation — and,
// critically, before the production-project guard below reads SUPABASE_URL.
import dotenv from 'dotenv';
dotenv.config();

// ── Guard 1: refuse to run against the known production project ref ────────
// The service-role key this script needs is the most dangerous credential in
// the app (bypasses RLS) — a copy-pasted .env pointed at prod would let this
// script create a real super_admin user in production. Hardcoding the prod
// ref (not reading it from anywhere overridable) means this check can't be
// silently defeated by the same misconfiguration it's meant to catch.
const PRODUCTION_PROJECT_REF = 'mgcivcpjrqbuojxeqaox';

const rawSupabaseUrl = process.env['SUPABASE_URL'];
if (!rawSupabaseUrl) {
  console.error('ERROR: SUPABASE_URL env var is required.');
  process.exit(1);
}

if (rawSupabaseUrl.includes(PRODUCTION_PROJECT_REF)) {
  console.error(
    `ERROR: SUPABASE_URL points at the PRODUCTION project (${PRODUCTION_PROJECT_REF}).\n` +
    'This script creates a super_admin auth user and must only run against a staging project.\n' +
    'Refusing to continue.'
  );
  process.exit(1);
}

// ── Guard 2: explicit opt-in, independent of which URL is configured ───────
if (process.env['CONFIRM_STAGING'] !== 'yes') {
  console.error(
    'ERROR: CONFIRM_STAGING=yes is required to run this script.\n' +
    'This is a second, independent guard on top of the production-URL check above — set it explicitly.'
  );
  process.exit(1);
}

const ADMIN_EMAIL = process.env['ADMIN_EMAIL'];
const ADMIN_PASSWORD = process.env['ADMIN_PASSWORD'];

if (!ADMIN_EMAIL) {
  console.error('ERROR: ADMIN_EMAIL env var is required.');
  process.exit(1);
}
if (!ADMIN_PASSWORD) {
  console.error('ERROR: ADMIN_PASSWORD env var is required.');
  process.exit(1);
}

// PRODUCTION'S "logos" BUCKET IS PUBLIC. Confirmed by usage, not by reading
// the bucket config directly (not retrievable from code): every read site —
// frontend/src/pages/admin/AdminOnboard.tsx and
// frontend/src/pages/dashboard/Settings.tsx — calls
// supabase.storage.from('logos').getPublicUrl(path) exclusively. getPublicUrl
// returns a URL string regardless of bucket visibility, but the app never
// falls back to createSignedUrl anywhere, so a private bucket would make
// every uploaded logo/avatar silently 403 when rendered as an <img src>.
// Since that's not a known bug, production must be public. Override with
// LOGOS_BUCKET_PUBLIC=false if you deliberately want staging to differ.
const LOGOS_BUCKET_PUBLIC = process.env['LOGOS_BUCKET_PUBLIC'] !== 'false';

import { supabase } from '../src/lib/supabase.js';

try {
  console.log(`Target project: ${rawSupabaseUrl}`);
  console.log('Production guard: passed (URL does not match production ref).');
  console.log('Confirmation guard: passed (CONFIRM_STAGING=yes).\n');

  // 1. Auth user — reuse if it already exists
  let userId: string;

  const { data: createData, error: createErr } = await supabase.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
  });

  if (createErr) {
    const isExisting =
      createErr.code === 'email_exists' ||
      createErr.status === 422 ||
      (createErr.message ?? '').toLowerCase().includes('already registered');

    if (!isExisting) {
      throw new Error(`Failed to create auth user: ${createErr.message}`);
    }

    console.log(`User ${ADMIN_EMAIL} already exists — looking up instead.`);
    const { data: list, error: listErr } = await supabase.auth.admin.listUsers();
    if (listErr) throw new Error(`Failed to list users: ${listErr.message}`);

    const existing = list?.users?.find(u => u.email === ADMIN_EMAIL);
    if (!existing) throw new Error(`User ${ADMIN_EMAIL} reported as existing but could not be found.`);

    userId = existing.id;
    console.log(`Found existing user (${userId}).`);
  } else {
    userId = createData.user.id;
    console.log(`Created auth user ${ADMIN_EMAIL} (${userId}).`);
  }

  // 2. Grant super_admin — merge into existing app_metadata, don't replace it
  const { data: currentUserData, error: getErr } = await supabase.auth.admin.getUserById(userId);
  if (getErr || !currentUserData?.user) {
    throw new Error(`Failed to read back user before updating app_metadata: ${getErr?.message ?? 'not found'}`);
  }

  const existingAppMetadata = (currentUserData.user.app_metadata ?? {}) as Record<string, unknown>;

  if (existingAppMetadata['role'] === 'super_admin') {
    console.log('User already has app_metadata.role = super_admin — no update needed.');
  } else {
    const { error: updateErr } = await supabase.auth.admin.updateUserById(userId, {
      app_metadata: { ...existingAppMetadata, role: 'super_admin' },
    });
    if (updateErr) throw new Error(`Failed to grant super_admin: ${updateErr.message}`);
    console.log('Granted app_metadata.role = super_admin.');
  }

  // Verify by reading the user back — don't trust the update call's own echo
  const { data: verifyData, error: verifyErr } = await supabase.auth.admin.getUserById(userId);
  if (verifyErr || !verifyData?.user) {
    throw new Error(`Failed to verify role after update: ${verifyErr?.message ?? 'not found'}`);
  }
  const verifiedRole = (verifyData.user.app_metadata as Record<string, unknown> | undefined)?.['role'];
  console.log(`Verified: user ${ADMIN_EMAIL} now has app_metadata.role = "${verifiedRole as string}".`);

  if (verifiedRole !== 'super_admin') {
    throw new Error(`Verification failed — expected role "super_admin", got "${verifiedRole as string}".`);
  }

  // 3. Storage bucket — reuse if it already exists
  const { data: buckets, error: listBucketsErr } = await supabase.storage.listBuckets();
  if (listBucketsErr) throw new Error(`Failed to list storage buckets: ${listBucketsErr.message}`);

  const existingBucket = buckets?.find(b => b.name === 'logos');

  if (existingBucket) {
    console.log(`Bucket "logos" already exists (public=${existingBucket.public}) — reusing.`);
    if (existingBucket.public !== LOGOS_BUCKET_PUBLIC) {
      console.warn(
        `WARNING: existing bucket's public=${existingBucket.public} does not match the requested ` +
        `public=${LOGOS_BUCKET_PUBLIC}. Not changing it automatically — update it in Supabase Studio if needed.`
      );
    }
  } else {
    const { error: createBucketErr } = await supabase.storage.createBucket('logos', {
      public: LOGOS_BUCKET_PUBLIC,
    });
    if (createBucketErr) throw new Error(`Failed to create "logos" bucket: ${createBucketErr.message}`);
    console.log(`Created bucket "logos" (public=${LOGOS_BUCKET_PUBLIC}).`);
  }

  console.log('\n=== Staging environment seed complete ===');
  console.log(`Admin user: ${ADMIN_EMAIL} (${userId}), role=super_admin`);
  console.log('Bucket:     logos');
  console.log(
    '\nNOTE: this script only covers the auth user + storage bucket. It does not run ' +
    'backend/database/schema.sql, does not create the match_documents function body, does not set up ' +
    'RLS policies, and does not seed any organisation/branch/agent/tenant_users rows — see ' +
    'PROJECT-DISCOVERY.md / the staging architecture notes for the full checklist.'
  );
  process.exit(0);

} catch (err) {
  console.error('ERROR:', err instanceof Error ? err.message : err);
  process.exit(1);
}
