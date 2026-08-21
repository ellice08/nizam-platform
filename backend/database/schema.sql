-- =============================================================================
-- Nizam Platform — Database Schema (regenerated from LIVE production)
-- =============================================================================
--
-- Regenerated read-only from the live Supabase project via introspection.
-- Zero writes were made to the database in producing this file.
--
-- PROVENANCE — read this before trusting any section below.
--
-- No pg_dump or psql binary was available in this environment, and backend/.env
-- contains only SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (a PostgREST JWT, not
-- a Postgres password) — there is no direct Postgres connection string on this
-- machine. PostgREST does not expose `information_schema` or `pg_catalog`
-- (both confirmed 404 on this project), and no `exec_sql`-style RPC exists to
-- run arbitrary introspection queries. The only available source was the
-- PostgREST OpenAPI descriptor (`GET {SUPABASE_URL}/rest/v1/`), which on this
-- Supabase/PostgREST version embeds real, verified metadata: column names,
-- Postgres types, NOT NULL (via the `required` list), DEFAULT expressions,
-- and — usefully — inline Primary Key and Foreign Key markers.
--
-- VERIFIED LIVE (high confidence — sourced from the OpenAPI descriptor,
--   cross-checked against row counts and application code this session):
--     • all 23 public table names
--     • every column name, Postgres type, NOT NULL / nullable, DEFAULT
--     • every Primary Key
--     • every Foreign Key relationship
--     • the pgvector column type and dimension (document_chunks.embedding,
--       vector(1536))
--     • the exact call signature of the one exposed RPC, match_documents
--       (query_embedding vector, p_branch_id uuid, match_count int,
--       match_threshold float8) — confirmed against rag.service.ts's actual
--       caller, which matches exactly
--
-- NOT RETRIEVABLE in this environment (none of these are exposed via
--   PostgREST under any circumstance — this is a hard capability limit, not
--   an oversight):
--     • UNIQUE constraints (e.g. intents(agent_id,key), voice_accounts
--       .retell_agent_id, whatsapp_accounts.phone_number_id — all documented
--       in CLAUDE.md as unique, NONE independently verifiable here)
--     • CHECK constraints
--     • indexes (including whether the pgvector ivfflat/hnsw index still
--       exists, and under what parameters)
--     • RLS policies — CLAUDE.md documents RLS as enabled on
--       whatsapp_accounts and voice_accounts only (defense-in-depth; the
--       backend's service-role key bypasses it regardless). That claim is
--       carried forward below as DOCUMENTED, NOT INDEPENDENTLY VERIFIED.
--     • the SQL BODY of match_documents — only its call signature is
--       exposed. The version below is a RECONSTRUCTED CANDIDATE, not a
--       confirmed copy of the live function. See the warning at its
--       definition.
--     • triggers, sequences, and any function other than match_documents
--       (only one RPC is exposed at all, confirmed)
--
-- DO NOT run this file against a database that already has data in it: it
-- has no IF NOT EXISTS / DROP guards. It is written for a fresh, empty
-- Supabase project, per the stated staging use case.
--
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================================================
-- TABLES  (verified live — see provenance note above)
-- =============================================================================

CREATE TABLE public.organisations (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "industry" text DEFAULT 'other',
  "subdomain" text,
  "plan" text DEFAULT 'trial',
  "paystack_customer_id" text,
  "stripe_customer_id" text,
  "branding_config" jsonb,
  "implementation_paid" boolean DEFAULT false,
  "support_expires_at" timestamptz,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE public.branches (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "organisation_id" uuid,
  "name" text NOT NULL,
  "location" text,
  "timezone" text DEFAULT 'Africa/Lagos',
  "business_hours" jsonb,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  PRIMARY KEY (id)
);

ALTER TABLE public.branches ADD CONSTRAINT branches_organisation_id_fkey FOREIGN KEY ("organisation_id") REFERENCES public.organisations("id");

CREATE TABLE public.agents (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "branch_id" uuid,
  "name" text DEFAULT 'Aria',
  "voice_id" text,
  "tone" text DEFAULT 'professional',
  "language" text DEFAULT 'English',
  "niche" text DEFAULT 'other',
  "system_prompt" text,
  "channels" jsonb,
  "capabilities" jsonb,
  "retell_agent_id" text,
  "escalation_contacts" jsonb,
  "rag_boundary_enforced" boolean DEFAULT true,
  "response_time_config" jsonb,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  "llm_provider" text DEFAULT 'openai',
  "llm_model" text DEFAULT 'gpt-4o',
  PRIMARY KEY (id)
);

ALTER TABLE public.agents ADD CONSTRAINT agents_branch_id_fkey FOREIGN KEY ("branch_id") REFERENCES public.branches("id");

CREATE TABLE public.captured_pages (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "branch_id" uuid NOT NULL,
  "org_id" uuid NOT NULL,
  "url" text NOT NULL,
  "content_hash" text NOT NULL,
  "char_count" integer NOT NULL DEFAULT 0,
  "captured_at" timestamptz NOT NULL DEFAULT now(),
  "source" text NOT NULL DEFAULT 'widget',
  PRIMARY KEY (id)
);

CREATE TABLE public.phone_numbers (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "branch_id" uuid,
  "number" text NOT NULL,
  "provider" text DEFAULT 'twilio',
  "label" text,
  "channel" text DEFAULT 'voice',
  "is_primary" boolean DEFAULT false,
  "is_vanity" boolean DEFAULT false,
  "vanity_operator" text,
  "routes_to_number_id" uuid,
  "africas_talking_virtual_number" text,
  "divert_code" text,
  "created_at" timestamptz DEFAULT now(),
  PRIMARY KEY (id)
);

ALTER TABLE public.phone_numbers ADD CONSTRAINT phone_numbers_branch_id_fkey FOREIGN KEY ("branch_id") REFERENCES public.branches("id");

ALTER TABLE public.phone_numbers ADD CONSTRAINT phone_numbers_routes_to_number_id_fkey FOREIGN KEY ("routes_to_number_id") REFERENCES public.phone_numbers("id");

CREATE TABLE public.conversations (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "branch_id" uuid,
  "agent_id" uuid,
  "channel" text,
  "source_number_id" uuid,
  "lead_name" text,
  "lead_phone" text,
  "lead_email" text,
  "messages" jsonb,
  "call_id" text,
  "recording_url" text,
  "resolved" boolean DEFAULT false,
  "requires_human" boolean DEFAULT false,
  "callback_requested" boolean DEFAULT false,
  "preferred_callback_time" text,
  "callback_completed" boolean DEFAULT false,
  "sentiment" text,
  "niche_fields" jsonb,
  "actioned_by" uuid,
  "actioned_at" timestamptz,
  "notes" jsonb,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  "intent" text,
  "booking_details" jsonb,
  "escalation_pending_since" timestamptz,
  "escalated_at" timestamptz,
  "lead_announced_at" timestamptz,
  "summarized_at" timestamptz,
  "summary_regenerations" integer NOT NULL DEFAULT 0,
  PRIMARY KEY (id)
);

ALTER TABLE public.conversations ADD CONSTRAINT conversations_branch_id_fkey FOREIGN KEY ("branch_id") REFERENCES public.branches("id");

ALTER TABLE public.conversations ADD CONSTRAINT conversations_agent_id_fkey FOREIGN KEY ("agent_id") REFERENCES public.agents("id");

ALTER TABLE public.conversations ADD CONSTRAINT conversations_source_number_id_fkey FOREIGN KEY ("source_number_id") REFERENCES public.phone_numbers("id");

CREATE TABLE public.conversation_analysis (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "conversation_id" uuid,
  "sentiment" text,
  "topic" text,
  "lead_captured" boolean DEFAULT false,
  "action_requested" boolean DEFAULT false,
  "lead_score" integer,
  "follow_up_needed" boolean DEFAULT false,
  "analyzed_at" timestamptz DEFAULT now(),
  PRIMARY KEY (id)
);

ALTER TABLE public.conversation_analysis ADD CONSTRAINT conversation_analysis_conversation_id_fkey FOREIGN KEY ("conversation_id") REFERENCES public.conversations("id");

CREATE TABLE public.document_chunks (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "branch_id" uuid,
  "content" text NOT NULL,
  "metadata" jsonb,
  "source_type" text DEFAULT 'upload',
  "source_url" text,
  "last_crawled_at" timestamptz,
  "embedding" vector(1536),
  "created_at" timestamptz DEFAULT now(),
  "content_hash" text,
  PRIMARY KEY (id)
);

ALTER TABLE public.document_chunks ADD CONSTRAINT document_chunks_branch_id_fkey FOREIGN KEY ("branch_id") REFERENCES public.branches("id");

CREATE TABLE public.intents (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "agent_id" uuid NOT NULL,
  "key" text NOT NULL,
  "label" text NOT NULL,
  "description" text,
  "fields" jsonb NOT NULL,
  "position" integer NOT NULL DEFAULT 0,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE public.interest_requests (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "company_name" text NOT NULL,
  "industry" text,
  "locations_count" integer,
  "channels_needed" jsonb,
  "contact_name" text,
  "contact_email" text,
  "contact_phone" text,
  "message" text,
  "status" text DEFAULT 'new',
  "created_at" timestamptz DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE public.interest_submissions (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "email" text NOT NULL,
  "company" text,
  "phone" text,
  "industry" text,
  "message" text,
  "status" text NOT NULL DEFAULT 'new',
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "contacted_at" timestamptz,
  PRIMARY KEY (id)
);

CREATE TABLE public.niche_templates (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "niche" text NOT NULL,
  "name" text NOT NULL,
  "system_prompt_template" text,
  "lead_capture_fields" jsonb,
  "default_dashboard_labels" jsonb,
  "conversation_flows" jsonb,
  "created_at" timestamptz DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE public.notifications (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "organisation_id" uuid NOT NULL,
  "branch_id" uuid,
  "type" text NOT NULL,
  "title" text NOT NULL,
  "body" text,
  "link" text,
  "entity_type" text,
  "entity_id" uuid,
  "min_role" text,
  "read_by" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "audience" text NOT NULL DEFAULT 'tenant',
  PRIMARY KEY (id)
);

CREATE TABLE public.onboarding_drafts (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "interest_request_id" uuid,
  "organisation_id" uuid,
  "step_completed" integer DEFAULT 0,
  "draft_data" jsonb,
  "status" text DEFAULT 'in_progress',
  "last_saved_at" timestamptz DEFAULT now(),
  "created_at" timestamptz DEFAULT now(),
  PRIMARY KEY (id)
);

ALTER TABLE public.onboarding_drafts ADD CONSTRAINT onboarding_drafts_interest_request_id_fkey FOREIGN KEY ("interest_request_id") REFERENCES public.interest_requests("id");

ALTER TABLE public.onboarding_drafts ADD CONSTRAINT onboarding_drafts_organisation_id_fkey FOREIGN KEY ("organisation_id") REFERENCES public.organisations("id");

CREATE TABLE public.support_contacts (
  "organisation_id" uuid NOT NULL,
  "support_email" text,
  "support_phone" text,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organisation_id)
);

ALTER TABLE public.support_contacts ADD CONSTRAINT support_contacts_organisation_id_fkey FOREIGN KEY ("organisation_id") REFERENCES public.organisations("id");

CREATE TABLE public.support_tickets (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "organisation_id" uuid NOT NULL,
  "created_by" uuid NOT NULL,
  "created_by_email" text,
  "created_by_name" text,
  "subject" text NOT NULL,
  "priority" text NOT NULL DEFAULT 'normal',
  "status" text NOT NULL DEFAULT 'open',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "ticket_number" bigint,
  "created_by_role" text,
  "conversation_id" uuid,
  PRIMARY KEY (id)
);

ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_organisation_id_fkey FOREIGN KEY ("organisation_id") REFERENCES public.organisations("id");

ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_conversation_id_fkey FOREIGN KEY ("conversation_id") REFERENCES public.conversations("id");

CREATE TABLE public.support_messages (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "ticket_id" uuid NOT NULL,
  "author_role" text NOT NULL,
  "author_name" text,
  "body" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

ALTER TABLE public.support_messages ADD CONSTRAINT support_messages_ticket_id_fkey FOREIGN KEY ("ticket_id") REFERENCES public.support_tickets("id");

CREATE TABLE public.tenant_users (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "organisation_id" uuid,
  "branch_id" uuid,
  "user_id" uuid,
  "role" text DEFAULT 'branch_staff',
  "first_login" boolean DEFAULT true,
  "created_at" timestamptz DEFAULT now(),
  "active" boolean DEFAULT true,
  PRIMARY KEY (id)
);

ALTER TABLE public.tenant_users ADD CONSTRAINT tenant_users_organisation_id_fkey FOREIGN KEY ("organisation_id") REFERENCES public.organisations("id");

ALTER TABLE public.tenant_users ADD CONSTRAINT tenant_users_branch_id_fkey FOREIGN KEY ("branch_id") REFERENCES public.branches("id");

CREATE TABLE public.usage_logs (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "branch_id" uuid,
  "conversation_id" uuid,
  "channel" text,
  "duration_seconds" integer,
  "message_count" integer,
  "retell_cost_usd" numeric DEFAULT 0,
  "telephony_cost_usd" numeric DEFAULT 0,
  "llm_cost_usd" numeric DEFAULT 0,
  "total_cost_usd" numeric DEFAULT 0,
  "logged_at" timestamptz DEFAULT now(),
  PRIMARY KEY (id)
);

ALTER TABLE public.usage_logs ADD CONSTRAINT usage_logs_branch_id_fkey FOREIGN KEY ("branch_id") REFERENCES public.branches("id");

ALTER TABLE public.usage_logs ADD CONSTRAINT usage_logs_conversation_id_fkey FOREIGN KEY ("conversation_id") REFERENCES public.conversations("id");

CREATE TABLE public.user_section_views (
  "user_id" uuid NOT NULL,
  "section" text NOT NULL,
  "last_viewed_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, section)
);

CREATE TABLE public.voice_accounts (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "organisation_id" uuid NOT NULL,
  "branch_id" uuid,
  "retell_agent_id" text NOT NULL,
  "agent_name" text,
  "phone_number" text,
  "webhook_secret" text,
  "status" text NOT NULL DEFAULT 'pending',
  "last_error" text,
  "created_at" timestamptz DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE public.whatsapp_accounts (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "organisation_id" uuid NOT NULL,
  "branch_id" uuid,
  "phone_number_id" text NOT NULL,
  "display_phone_number" text,
  "waba_id" text,
  "access_token_encrypted" text NOT NULL,
  "access_token_iv" text NOT NULL,
  "access_token_tag" text NOT NULL,
  "verify_token" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "last_error" text,
  "created_at" timestamptz DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE public.whatsapp_processed_messages (
  "message_id" text NOT NULL,
  "processed_at" timestamptz DEFAULT now(),
  PRIMARY KEY (message_id)
);

-- =============================================================================
-- ANOMALIES FOUND DURING REGENERATION
-- =============================================================================
--
-- These are observations from comparing live schema + row counts against
-- CLAUDE.md and the application code this session. None of this required a
-- live-DB write to determine — all read-only SELECT/introspection.
--
-- 1. TWO overlapping lead-capture tables, and only one is live.
--      interest_requests     — 0 rows. Zero references anywhere in
--                               backend/src OR frontend/src. Genuinely dead —
--                               not documented in CLAUDE.md at all.
--      interest_submissions  — 1 row, ACTIVELY USED, but NOT through the
--                               Express API: frontend/src/pages/admin/
--                               AdminLeads.tsx queries it directly via the
--                               browser's Supabase client (anon key), the
--                               ONLY screen in the app that bypasses the
--                               backend entirely. This means interest_
--                               submissions' access control is governed by
--                               its own RLS policy (unverified, per the
--                               provenance note above) rather than the
--                               service-role/application-code pattern every
--                               other table relies on. Worth resolving
--                               before this table is touched in a redesign.
--
-- 2. phone_numbers — 0 rows, zero references in backend/src or frontend/src,
--      yet the schema is unexpectedly sophisticated: africas_talking_
--      virtual_number, divert_code, is_vanity, vanity_operator, provider,
--      routes_to_number_id. CLAUDE.md §8 Tier 4 [11] frames Nigerian
--      telephony/Africa's Talking as an UNSOLVED, still-being-researched
--      problem — this table reads like a target schema that was designed
--      ahead of that work and never wired up. Worth surfacing to whoever
--      picks that item back up, since the data model may already reflect
--      real thinking that predates the current CLAUDE.md entry.
--
-- 3. usage_logs — 0 rows, zero references in backend/src (matches this
--      session's earlier finding). The schema itself is NOT a stub: it
--      separately tracks llm_cost_usd, retell_cost_usd, telephony_cost_usd,
--      total_cost_usd, duration_seconds, message_count per branch/channel/
--      conversation — a genuinely-designed cost model, just never wired to
--      write. Relevant to CLAUDE.md's Tier 5 [12] billing item: the
--      remaining work is instrumentation (write to this shape), not
--      designing a usage model from scratch.
--
-- 4. agents.rag_boundary_enforced (boolean) — exists live, not mentioned
--      anywhere in CLAUDE.md's RAG section (§4) or elsewhere. Given RAG
--      boundary enforcement is documented as a locked, security-relevant
--      product decision, an UNDOCUMENTED per-agent boolean that plausibly
--      controls it is worth a direct question to the team before any
--      redesign work touches Agent configuration or RAG.
--
-- 5. agents.capabilities (jsonb) and agents.channels (jsonb) — present live;
--      CLAUDE.md's Channels page description states channel status is
--      derived from whatsapp_accounts/voice_accounts/web-chat-always-on,
--      "not a hardcoded list" — these two agent-level columns are not
--      referenced in that description. Not confirmed dead (no backend grep
--      was run for every possible read site), but worth checking before
--      assuming they are load-bearing.
--
-- 6. organisations.paystack_customer_id + implementation_paid +
--      support_expires_at — none mentioned in CLAUDE.md's billing section,
--      which frames billing as "not started, provider undecided between
--      Paystack/Flutterwave." A live paystack_customer_id column suggests
--      more billing-adjacent groundwork already exists at the schema level
--      than the current CLAUDE.md narrative describes. Does not change the
--      earlier finding that usage_logs is empty and unwritten — metering is
--      still the blocking gap — but the customer/plan side may be further
--      along than documented.
--
-- 7. schema.sql (the file this replaces) described a `tenants` /
--      `tenant_id` model. NO `tenants` table exists live — confirms
--      CLAUDE.md's own flag that the old file is stale. Its RLS policies
--      and its match_documents body (p_tenant_id) both reference that
--      non-existent model and must not be reused as-is; see below.
--
-- =============================================================================
-- ROW-LEVEL SECURITY  — DOCUMENTED, NOT INDEPENDENTLY VERIFIED
-- =============================================================================
--
-- Per CLAUDE.md §1 [B]: RLS is enabled on whatsapp_accounts and voice_
-- accounts as defense-in-depth (access tokens / webhook secrets), and the
-- backend's SERVICE_ROLE key bypasses RLS regardless — RLS is not what
-- protects tenant data at the API layer; application code is.
--
-- This could NOT be confirmed against pg_catalog.pg_tables.rowsecurity or
-- pg_policies in this session (no access route — see provenance note). The
-- OLD schema.sql's RLS policies (tenant_isolation on conversations, agents,
-- document_chunks, conversation_analysis, all keyed on a `tenants` table
-- that does not exist live) are confirmed STALE by finding #7 above and are
-- NOT carried forward here.
--
-- If interest_submissions is genuinely reachable via the anon key from the
-- browser (finding #1), IT MUST have a real, working RLS policy — that
-- policy's exact definition is unknown and should be pulled directly from
-- Supabase Studio (Database → Policies) before this file is trusted as
-- complete for a staging clone that needs AdminLeads to work.
--
-- ALTER TABLE public.whatsapp_accounts ENABLE ROW LEVEL SECURITY; -- [B] documented, unverified
-- ALTER TABLE public.voice_accounts ENABLE ROW LEVEL SECURITY;    -- [B] documented, unverified
-- (policy bodies unknown — pull from Supabase Studio, do not guess)

-- =============================================================================
-- INDEXES — NOT RETRIEVABLE; ONE IS OPERATIONALLY CRITICAL
-- =============================================================================
--
-- Index definitions are not exposed via PostgREST and could not be verified.
-- The OLD schema.sql included an ivfflat cosine index on document_chunks.
-- embedding. Whether that specific index (or a newer hnsw one) still exists
-- on the live table is UNKNOWN. Without SOME vector index, RAG retrieval
-- still returns correct results but degrades to a sequential scan per query
-- as document_chunks grows — worth confirming directly in Supabase Studio
-- rather than assuming this line is safe to skip:
--
-- CREATE INDEX document_chunks_embedding_idx ON public.document_chunks
--   USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100); -- unverified live; carried forward from the old file as a reasonable default only

-- =============================================================================
-- FUNCTIONS
-- =============================================================================
--
-- match_documents — call signature VERIFIED LIVE (see provenance note).
-- The SQL body below is a RECONSTRUCTED CANDIDATE, not a confirmed copy of
-- the live function — PostgREST never exposes function bodies. It is built
-- from: the verified parameter names/types and return shape (id, content,
-- metadata, similarity — this exact 4-column shape was independently
-- confirmed against a live RPC call earlier this project), CLAUDE.md §4's
-- extensive documentation of this function's behaviour (branch-scoped,
-- cosine similarity, threshold + count parameters), and pgvector's `<=>`
-- cosine-distance operator being the only operator that produces a
-- normalised similarity score in the 0–1 range the MATCH_THRESHOLD
-- calibration story in CLAUDE.md depends on.
--
-- DO NOT deploy this to any environment that matters without confirming the
-- real body first (Supabase Studio → Database → Functions → match_documents
-- → Definition). The old schema.sql's version filters on p_tenant_id against
-- a `tenants` table that does not exist live and MUST NOT be used.
--
-- One more precision note: the OpenAPI descriptor confirms match_count and
-- match_threshold are OPTIONAL (absent from the RPC's "required" list), which
-- means the live function DOES have SQL-level defaults for both — but it does
-- not reveal what those default VALUES are. The 8 / 0.30 below are the
-- application's own call-site defaults (rag.service.ts always passes both
-- explicitly, so the SQL defaults are never actually exercised and can't be
-- observed that way either) — carried forward as a reasonable placeholder,
-- NOT a confirmed value for the live function's DEFAULT clause.

CREATE OR REPLACE FUNCTION public.match_documents(
  query_embedding vector(1536),
  p_branch_id uuid,
  match_count int DEFAULT 8,
  match_threshold float8 DEFAULT 0.30
)
RETURNS TABLE(id uuid, content text, metadata jsonb, similarity float8)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id, dc.content, dc.metadata,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM public.document_chunks dc
  WHERE dc.branch_id = p_branch_id
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- =============================================================================
-- END — regenerated read-only; no writes were made to the live database.
-- =============================================================================
