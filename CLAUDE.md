# CLAUDE.md — Nizam project context

> Read this first, every session. It captures the architecture (what exists) and — more
> importantly — the **unfinished work in detail**: the decisions already made, the open
> questions, and the gotchas already discovered. The codebase tells you *what* is built;
> this file tells you *why*, and *what's left and how to approach it*.
>
> **Maintenance rule: this file is the reference point and must stay current.** After any
> non-trivial change to the codebase (new feature, architecture decision, schema change, a
> bug whose root cause taught something non-obvious, a tier item completed or added, an
> external-dependency status change) — update the relevant section here in the same
> session, before considering the work done. Small/mechanical edits (typo fixes, formatting)
> don't need an entry. When in doubt, err toward recording it — this file is only useful if
> it stays truthful.

---

## 0. TL;DR

**Nizam** is a multi-tenant AI customer-service / lead-handling SaaS. Each tenant
("organisation") configures an AI agent that talks to *their* customers across web chat,
WhatsApp, and voice — using the tenant's own knowledge base, intents, and branding.
Product/company brand = **"Ellice" / Ellice Systems**; the product is **"Nizam"**.
Entry market: **Nigerian real estate**. Primary test tenant: **"Maryam Orgaization"**
(org id `3029e48c-541d-4d43-a42e-8daa9d17d7ee`, branch `4ce9fab9-0f7f-4ed8-adde-ee456a3fa21b`,
agent `4ab4e549-cbc0-47a9-a9af-0212351354b0`).

Status: **core product built** (chat, voice, WhatsApp, analytics, channels, widget theming,
notifications). Remaining: a polish/hygiene tail, a couple of feature builds, external-account
threads (WhatsApp number, Retell Nigerian number), and **billing (the deliberate finale)**.

---

## 1. Repos, deploy, and the golden rules

| | |
|---|---|
| **backend/** | Node/Express + TypeScript. Supabase (Postgres) as DB. Deployed on **Railway** (auto-deploys on push to `main`). Node 22, global `fetch` available. |
| **frontend/** | React + Vite + TypeScript + shadcn/ui + Tailwind. Deployed on **Vercel** (auto on push). |
| **shared types** | `frontend/src/types/` (there is no separate shared package in practice; the frontend owns its API types). |
| GitHub | `ellice08/nizam-platform` (single repo, backend + frontend). |
| Backend URL | `https://nizam-platform-production.up.railway.app` |
| Frontend URL | `https://nizam-platform.vercel.app` |

**GOLDEN RULES (learned the hard way):**
1. **ALWAYS push to `main`.** Railway/Vercel deploy from it. An unpushed commit once caused
   hours of "the fix doesn't work" debugging — the code was correct on disk but stale in prod.
2. **When "works on disk, wrong in app": FIRST verify the deployed commit.** Hit
   `GET /api/version` (see §7) or compare `git log --oneline -1` to Railway's deployment commit
   before debugging anything else.
3. **Supabase backend uses the SERVICE_ROLE key** → it *bypasses RLS*. RLS is enabled on
   sensitive tables (`whatsapp_accounts`, `voice_accounts`) as defense-in-depth, but the
   backend is unaffected. Never assume RLS is filtering backend queries — it isn't.
4. **API envelope:** backend wraps responses in `ApiResponse.success(...)`. Frontend must
   unwrap `response.data.data`. New frontend API fns should mirror the existing ones.
5. **Prompt changes are ADDITIVE.** When changing agent behavior, ADD a rule near its
   siblings — do NOT reword/restructure existing rules. Rewording has caused regressions.

---

## 2. The data model (Supabase, key tables)

- **organisations** — tenants. `branding_config` (jsonb) holds dashboard branding AND, under a
  nested `widget` key, the chat-widget theme (see §5.6). `name`.
- **branches** — each org has ≥1 branch (first one, "Main Office", auto-created). `timezone`
  (drives after-hours logic). Org-level routing falls back to the first branch by `created_at`.
- **agents** — per-branch agent config: `name`, `system_prompt`, `tone`, `llm_provider`,
  `llm_model`, `escalation_contacts`, `response_time_config`, `escalation` intents live in a
  separate table. NOTE: `system_prompt` REPLACES the default base prompt when set (guardrails
  still wrap around it). `tone` and intent `required` flags ARE now wired (were decorative).
- **intents** — configurable per-agent intents (id, agent_id, key, label, description,
  `fields` jsonb `[{key,label,required}]`, position, enabled, unique(agent_id,key)). A 'general'
  baseline is always handled in the prompt generator, never a table row.
- **conversations** — the inbox spine. Columns actually used: id, branch_id, agent_id, channel
  ('chat'|'voice'|'whatsapp'), call_id (thread key; = sessionId; = Retell call_id for voice),
  lead_name, lead_phone, lead_email, messages (jsonb `[{role,content}]`), recording_url,
  resolved, requires_human, sentiment, notes (jsonb `[{text,added_by,added_at}]` —
  ConversationNote[], NOT a string!), intent, booking_details, actioned_by/at, created_at,
  updated_at, **escalated_at**, **lead_announced_at**, **escalation_pending_since**,
  **summarized_at** (last-summarized-at, not summarized-once — see §6a), **summary_regenerations**
  (sweeper-driven regen count, capped — see §6a).
  (schema.sql is STALE — it references a `tenant_id` model that isn't live. Trust the live table.)
- **document_chunks** — RAG chunks (pgvector embeddings). Retrieved via the `match_documents`
  RPC (params: query_embedding, p_branch_id, match_count, match_threshold).
- **captured_pages** — website-crawl ingestion source for document_chunks.
- **whatsapp_accounts** — per-tenant WhatsApp (phone_number_id unique = routing key,
  access_token AES-256-GCM encrypted, verify_token, status). RLS on.
- **voice_accounts** — per-tenant Retell (retell_agent_id unique = routing key, agent_name,
  phone_number, webhook_secret, status). No encryption (no secret; agent_id isn't sensitive). RLS on.
- **notifications** — bell items. type, title, body, link, entity_type, entity_id, audience
  ('tenant'|'operator'), read_by (jsonb array of user_ids → per-user read), min_role.
- **whatsapp_processed_messages** — dedup table (message_id pk) for Meta webhook retries.

---

## 3. The agent brain (backend/src/services/claude.service.ts)

This is the heart. **chat()** drives web chat + WhatsApp; **chatStream()** drives voice.
They SHARE two extracted helpers so they can never drift:
- **prepareTurn()** — all setup: agent fetch, intents, RAG context, system-prompt assembly,
  conversation get/create, message history, provider/model choice, after-hours computation.
- **the finalize/post-process block** — tag detection/stripping, lead extraction, escalation
  decision, conversation persistence, notification/email emission.

**Prompt assembly** (in prepareTurn): `RAG_BEFORE` + `buildIntentHandling(intents)` + `RAG_AFTER`,
then appended: tone block, KNOWLEDGE BASE context, contact/afterHours/confirmation contexts.
- Base prompt = `agents.system_prompt` if set, else a rich default receptionist persona.
- **Control tags** the model appends and we strip before display: `<<ESCALATE>>`,
  `<<INTENT:key>>`, `<<LEAD name="" phone="" email="" date="" subject="">>`. Streaming has a
  **tag-safe emitter** so tags are never spoken aloud (buffers on `<`, discards `<<...>>`).
- **Model choice:** `agents.llm_model` override, else provider default (openai→gpt-4o,
  anthropic→claude-sonnet). **Voice channel uses gpt-4o-mini** for faster time-to-first-token.
- **Tone** (professional/friendly/formal) → a concrete style-instruction block (wired, subtle
  by design — don't crank it into caricature).

**Prompt behavioral rules that exist (don't duplicate/break these):**
- Anti-fabrication: only state facts explicit in the KB context; never merge facts across
  properties; if not present, hand off. (Fixed a real hallucination — invented a "Marina in
  Lagos" by conflating chunks. This is critical to "never mislead clients".)
- Mandatory disambiguation: if a name matches >1 KB entry, MUST ask which — never assume.
- No markdown in replies (widget/voice render plain text). No mentioning "knowledge base",
  "context", "system" to the customer.
- No re-asking for contact once name + one method held (any purpose, incl. bookings).
- Required intent fields ENFORCED: never confirm an intent action until all `required:true`
  fields (+ name + one contact) are collected.
- Confirmation timing: honest response-time promises — never promise "within X hours" if X
  extends past business close; say "before we close today" (≥30 min left) or next business day.

---

## 4. RAG (backend/src/services/rag.service.ts)

- `getContext({query, branchId, matchCount=8, matchThreshold=0.6})` → embeds query, calls
  `match_documents` RPC, joins chunk contents.
- **Dual-query retrieval:** prepareTurn searches BOTH the bare latest message AND a
  contextualized query (last ~6 turns + message), merges/dedupes (bare-first). This fixes:
  (a) subject-less follow-ups ("how many sqm is it") retrieving blind, AND (b) fresh-subject
  or topic-switch queries being diluted by conversation context. Don't revert to single-query.
- **Threshold history:** was 0.7 (too strict → empty context → confident false negatives),
  dropped to 0.45 (too loose → conflation/hallucination), settled at 0.6 with structured data.
- **THE BIG LESSON:** the agent can only be as good as the KB. Website-crawl + FAQ chunks gave
  estate-level marketing copy with NO per-unit prices ("PRICE CHUNKS: 0") — every price the old
  agent quoted was HALLUCINATED. Fix = structured per-unit documents (one self-contained chunk
  per unit: name + project + cluster + type + price + size + features, every block repeating the
  project name, plus explicit disambiguation lines). See §8 "knowledge-quality productization".

---

## 5. Channels

### 5.1 Web chat widget (frontend/public/widget.js — vanilla JS, ~1000 lines)
- Script-injected onto host sites: `<script src=".../widget.js" data-org-id data-api>`.
- Runs in the host DOM (not iframe) → can read host theme directly.
- Fetches `GET /api/widget/config/:orgId` for branding + theme.
- **Auto-theming:** detects host mode (prefers-color-scheme + host body bg luminance — host bg
  WINS), host font, an accent fallback; palette is CSS-variabled. Tenant overrides (mode/color/
  font/radius) from config beat detection. Override precedence: config > detected > default.
  Live re-applies on OS dark/light flip.

### 5.2 Voice (Retell — Option A: Custom LLM WebSocket) — the biggest build
- **backend/src/api/voice.websocket.ts** — the brain. Retell connects
  `wss://<backend>/llm-websocket/{call_id}`. We send config + begin-message, handle
  interaction_type: ping_pong (echo), call_details (route by agent_id → tenant), update_only
  (ignore), response_required/reminder_required (→ chatStream, verbatim streamed reply).
  Turn-safety: track latest response_id, DROP stale ones (VA2 overlapping-transcript race).
- **backend/src/api/voice.routes.ts** — call-event webhook (call_started/ended/analyzed →
  store transcript, recording_url, sentiment, summary-note) + tenant CRUD (/accounts).
- **Retell signature:** HMAC-SHA256 of RAW body with RETELL_API_KEY, header X-Retell-Signature
  (`v=ts,d=digest`, 5-min replay window). Raw body captured via express.json verify callback.
- **Why Option A (not function-calling B2):** B2 let Retell's LLM REWORD/garble our answers and
  invent facts — unacceptable for "never mislead clients". Option A = our backend IS the verbatim
  voice. Streaming (chatStream) fixed the latency (time-to-first-token, not completion).
- **Agent setup is MANUAL per tenant for now:** create a Custom LLM agent in Retell dashboard,
  point its Custom LLM URL at our wss endpoint, set its webhook URL, paste the agent_id into
  Nizam (Channels page). Programmatic creation = a scale-later item.
- **KNOWN OPEN:** ASR/accent transcription is weak on Nigerian English (see §8). Nigerian phone
  numbers for real inbound = unsolved (see §8 Retell-number).

### 5.3 WhatsApp (Meta Cloud API — built, awaiting live test)
- Per-tenant numbers, all through ONE Meta app. Manual credential connection now; Embedded
  Signup (Tech Provider) is the sustainable upgrade later — same routing architecture.
- backend/src/api/whatsapp.routes.ts: GET/POST webhook (verify + HMAC signature + parse +
  dedup + route by phone_number_id → agent → chat() → send via Graph API) + tenant CRUD.
- Tokens AES-256-GCM encrypted at rest (WHATSAPP_TOKEN_KEY, 32-byte hex; lib/tokenCrypto.ts).
- Env: WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_TOKEN_KEY.
- **STATUS: fully built, never live-tested** — blocked on a usable WhatsApp number (Meta dev
  account KYC/SMS friction for Nigeria). When a number is available: config walkthrough + one
  message test. Threading reuses call_id (= sender's WA number). Fresh-thread-on-resolved is a
  parked refinement (currently reuses any thread by call_id).

### 5.4 Channels page (frontend) & Overview card
- DATA-DRIVEN: channels derived from real accounts (web chat always-on, whatsapp_accounts,
  voice_accounts), not a hardcoded list. Adding a channel = one registry entry. Auto-refresh
  (refetchInterval 45s + refetchOnWindowFocus). Voice/WhatsApp connect+disconnect UIs live here.
  Widget appearance controls live on the Web chat card (write to branding_config.widget only).

### 5.6 Widget theme namespace
- `branding_config.primary_color` = dashboard/brand color (Settings Branding tab owns it).
- `branding_config.widget = {theme_mode, primary_color, font_family, corner_radius}` = widget
  ONLY. Widget inherits brand color as default but a widget-specific color never touches the
  dashboard. Backend merge is DEEP on the widget key.

---

## 6. Escalation & notifications (the part that took the most iteration — read carefully)

The mental model: **every emission path must consult one atomic per-conversation ledger** so the
same event is never announced twice or missed. There are multiple emission paths (finalize for
chat+voice, the sweeper, the voice call-end hook) and they MUST coordinate via DB state.

- **Escalation latch = `conversations.escalated_at`** (NOT `requires_human`). Critical: after-hours
  sets requires_human, so if the latch read requires_human, one after-hours turn would permanently
  suppress real escalations (silent abandonment bug). escalated_at is set ONLY by a real escalation edge.
- **`newEscalation` is EDGE-triggered:** `escalationSignalThisTurn && !alreadyEscalated`. Handoff
  phrases ("someone will be in touch") recur every post-handoff turn → without the edge, they re-fired
  alerts. Only the transition INTO escalation notifies.
- **Lead announcement is ATOMIC:** claim via
  `UPDATE conversations SET lead_announced_at=now() WHERE id=? AND lead_announced_at IS NULL RETURNING id`.
  Only the winner emits. Fixes the voice race (overlapping transcript turns both seeing "lead complete"
  with different phone parses → duplicate notifications). Also prevents a changed value re-emitting.
- **Email consolidation (no noisy per-turn emails):** on escalation, set
  `escalation_pending_since`, DON'T email yet. Email fires when: lead captured (chat/WhatsApp send
  now; voice DEFERS to call-end), OR voice call_ended hook (`sendPendingEscalation`), OR the
  **escalationSweeper.ts** interval (60s; chat idle >5min, voice idle >15min → fallback email
  "no contact captured"). After-hours (no signal) also routes through pending, not immediate email.
- **In-app: needs-attention is SUPERSEDED by lead-captured** for the same conversation
  (supersedeNotification deletes the earlier row by entity_type/entity_id/type). Guarded against the
  voice race: the needs-attention insert re-checks lead_announced_at first, plus a delayed re-supersede.

**If you touch this: preserve the ledger discipline. Don't add an emission path that skips the
atomic claim or the pending flag.**

---

## 6a. Resolution notes & chat summaries

Two related, separately-triggered features layered onto notes/resolve — not part of the
escalation ledger above, but touch the same `conversations.notes` array so the same "never
write a string, never duplicate" discipline applies.

- **Human resolution note (frontend-only, skippable):** `ConversationPanel.tsx`'s "Mark
  resolved" button, when going from unresolved→resolved (NOT when un-resolving), opens a Dialog
  asking what was done. "Save & resolve" appends a note (`added_by` = acting user's email, same
  as manual notes) then resolves in one PATCH; "Skip" resolves with no note. No backend change —
  the existing `notes` field on `PATCH /api/conversations/:id` already accepts an arbitrary array.
- **System chat/WhatsApp summary (`claudeService.summarizeConversation`)** — voice gets its
  summary for free from Retell's `call_analysis.call_summary` at call end (voice.routes.ts); chat
  and WhatsApp have no equivalent provider-side analysis, so we generate one ourselves
  (gpt-4o-mini, 2-3 sentences: what the customer wanted / what happened / what's outstanding).
  Voice is excluded from both triggers below (already covered).
  - **Triggers:** (1) resolve path (`conversation.routes.ts` PATCH, fires whenever `resolved:true`
    is in the request body) — calls with `{ bypassCap: true }`. (2) **chatSummarySweeper.ts** — 1min
    interval, 3min inactivity threshold (mirrors escalationSweeper's shape/logging, not its
    timing — summaries aren't escalation-urgent, they're just meant to feel near-live).
  - **`summarized_at` means "last summarized at", not "summarized once".** If a conversation gets
    new messages after being summarized and then goes quiet again, the summary REGENERATES and
    REPLACES the existing `added_by:'system'` note in place (found by `added_by==='system'`) —
    never appends a second one. The panel only ever shows one system summary.
  - **Atomic claim is a compare-and-swap**, not the simpler `WHERE IS NULL` pattern used elsewhere
    in §6: `UPDATE conversations SET summarized_at=now() WHERE id=? AND summarized_at = <value just
    read> RETURNING id` — `.is('summarized_at', null)` for the first summary (previous value was
    null), `.eq('summarized_at', previousValue)` for a refresh (previous value was a real
    timestamp). This still guarantees exactly one winner when the sweeper and a resolve-triggered
    call race on the same conversation, but — unlike `lead_announced_at`/`escalated_at`, which are
    "claim once, forever set" — this claim is reusable because the compared-against value changes
    every time.
  - **Churn cap:** sweeper-driven regenerations capped at `MAX_SWEEPER_REGENERATIONS = 2`
    (`conversations.summary_regenerations`, exported from claude.service.ts) — so 3
    sweeper-generated summaries total per conversation. The resolve path's `bypassCap:true` call
    always runs regardless of the cap AND never increments the counter, so it can never itself get
    capped out. On a generation failure or empty completion, `summarized_at` rolls back to its
    pre-claim value (not hardcoded to null) so a later attempt can retry without corrupting
    already-summarized state.
  - **Why the sweeper does a broad DB prefilter + per-row refine, not one query:** "has this
    conversation had activity since its last summary" is `summarized_at < updated_at` — a
    column-to-column comparison PostgREST can't filter on directly. Same broad-prefilter-then-
    per-row-check shape escalationSweeper already uses for its own per-channel refinement.

---

## 7. Conventions & gotchas

- **`/api/version`** (see §8 status) returns the deployed commit — use it to end stale-deploy
  confusion. `RAILWAY_GIT_COMMIT_SHA` is the source.
- notifications carry entity_type/entity_id = conversation for supersede + deep-linking.
- `notes` on conversations is `ConversationNote[]` = `{text, added_by, added_at}` — NEVER write a
  string there (crashed the panel once: "notes.map is not a function"). Voice summary is stored as
  one such note object.
- PDF ingestion: `pdf-parse` has an ENOENT self-test bug — import from `pdf-parse/lib/pdf-parse.js`,
  not the package root.
- Human user context (the person building this, "Ellice"): email drafts use office-title-first
  ("Dear ED Operations,"), sign-off "Warm regards,". (Relevant only if drafting emails for them.)

---

## 8. UNFINISHED WORK — detailed (this is the point of this file)

Ordered by the agreed tiers. For each: **what · why · decisions made · open questions · gotchas · approach.**

### TIER 1 — do before any external demo/pitch (correctness + security)

**[1] Key rotation — URGENT, likely still OUTSTANDING**
- *What:* rotate the Supabase SERVICE_ROLE key and the Retell API key.
- *Why:* both were pasted into a chat during debugging → treat as exposed. Service-role = full DB
  access, bypasses RLS. Must be clean before investors/clients see the system.
- *Decisions:* Supabase — rolling the JWT secret regenerates BOTH anon + service_role (broader blast
  radius); update Railway + local .env for service_role, and frontend/Vercel for anon. Check if the
  project has the newer individually-revocable secret-keys system (revoke just the exposed one, no
  anon-key churn). Retell — delete/regenerate the key (use the webhook-badged one for signature
  verification), update Railway + local, log out other sessions.
- *Gotcha:* after rotating, confirm backend still reads/writes DB (Conversations page loads) and the
  frontend still works (anon key). Retell signature verification must still pass on a test call.
- *Approach:* dashboard clicking, not code. Do it carefully, verify each side.

**[2] `GET /api/version` — DONE**
- *What:* public endpoint returning `{commit, deployedAt, env}`. `backend/src/api/version.routes.ts`,
  mounted first in `registerRoutes` (`backend/src/api/index.ts`). commit = `RAILWAY_GIT_COMMIT_SHA`
  ?? `GIT_COMMIT` ?? `'unknown'`; deployedAt = timestamp captured once at module load (boot time);
  env = `NODE_ENV`. No auth (no global auth gate runs before `registerRoutes`, so it's public like
  the other unauthenticated routes, e.g. widget.routes.ts).
- *Why:* ends the recurring "is the deployed build current?" forensics (cost hours once).
- *Status:* shipped — commit `4a24ba3`, pushed to `main`.

**[3] KB hygiene — (a) DONE, (b) DONE, (c) investigated, cleanup NOT yet run**
- *(a) Delete-confirmation:* shipped — `frontend/src/pages/dashboard/Knowledge.tsx` now opens an
  `AlertDialog` (same pattern as `AdminClientDetail.tsx`) showing the doc/page name + chunk count
  before calling the existing `deleteSource` mutation. Verified live against the Maryam tenant:
  Cancel leaves data untouched, Confirm deletes and the list refreshes. Commit `08b65a6`.
- *(b) PDF ingestion:* the `pdf-parse/lib/pdf-parse.js` subpath-import fix (avoids the package's
  ENOENT self-test) is confirmed in place at `backend/src/api/ingest.routes.ts:44`. Walkthrough to
  verify end-to-end: upload a real text-layer PDF (not a scanned image — no OCR) under 10MB on the
  Knowledge page; watch for the "Uploading and indexing…" state then a green check + chunk count in
  the Upload results panel (a red X + inline error means extraction failed — check backend logs for
  "Failed to process <filename>"); confirm the file appears in the Documents list with N chunks; then
  ask the agent a question only answerable from that PDF's content to confirm the full RAG round-trip,
  not just extraction.
- *(c) Duplicates — DONE.* Root cause: `ragService.crawlAndIngest()` (used by the Knowledge page's
  "Add page" button → `POST /api/ingest/crawl`) called `ingestText()` directly per crawled page with
  no content-hash check and no delete-before-insert, and — despite the UI copy already saying "add a
  single page" — it was actually a BFS crawler following same-domain links up to `maxPages` (10). The
  widget's silent auto-capture path (`ragService.capturePage()`, used by `POST /api/widget/ingest`) was
  never the problem — it was already properly deduped (content-hash skip / delete-then-replace).
  **Fix shipped:** `crawlAndIngest` is removed. "Add page" now calls a new `ragService.captureSinglePage()`
  — fetches exactly the one URL server-side (no link-following) and routes through the existing
  `capturePage()` dedup logic, so it now matches its own UI copy and can't create duplicates on re-run.
  `POST /api/ingest/crawl` and `organisationApi.crawlWebsite` dropped `maxPages`/`errors` (dead once
  crawling is single-page — a request now either fully succeeds or throws, no per-page partial failures).
  **Cleanup run:** `backend/scripts/cleanupDuplicateChunks.ts` (keep-oldest) removed 2 exact-duplicate
  chunk rows. `backend/scripts/cleanupDevTestPages.ts` removed every `captured_pages` row (and their
  chunks) whose host was localhost/127.0.0.1/a private LAN IP — turned out to be **all 40** captured_pages
  in the DB; none were real client content. Final state: 45 `document_chunks`, all from the one real
  uploaded document; 0 `captured_pages`. `backend/scripts/findDuplicateChunks.ts` stays as a read-only
  audit tool for future checks. Near-duplicate (non-exact) detection for LLM-enriched chunks is still
  unsolved — tracked in §9.
- *Why:* demo integrity (don't delete knowledge on stage) + RAG quality (dupes/crawl noise dilute
  retrieval).

**[4] ASR / accent swap (Retell dashboard)**
- *What:* switch the Retell agent's Realtime Transcription provider/model to something accent-robust
  (try Deepgram or alternatives listed). Also nudge Reminder Message Frequency 10s→15-20s; look for
  Backchanneling toggle (workspace/Global Settings).
- *Why:* Nigerian-accented English is mis-transcribed ("crown fillers" for grand villas, "semi
  detached trailer" for twin villa, garbled names/phone digits). A misheard phone number = lost lead;
  a live demo with these errors undercuts the pitch.
- *Gotcha:* audio INPUT quality is half the problem — the user found faint web-test audio worsened
  it. Test the ASR in good audio conditions (quiet room, decent mic, ideally a real phone call).
- *Approach:* dashboard setting, then a clean test call. This is config, not code.

### TIER 2 — polish that makes it feel like a finished product

**[5] Nav badges (DONE) + chat auto-summary (DONE) + human resolution note (DONE) — all shipped**
- *Nav badges — DONE.* Conversations and Support nav items show a count badge
  (`AppSidebar.tsx` + `MobileTopBar.tsx`, both driven by `navConfig.ts`, on BOTH the tenant
  dashboard and the operator/admin console). Exactly mirrors `NotificationBell`'s badge: same pill
  markup (`<span className="relative shrink-0">{Icon}{badge}</span>`, badge absolute-positioned
  top-right of the icon, "9+" cap), same data-fetch shape (react-query, `refetchInterval: 25000`,
  `refetchOnWindowFocus: true`). Shared via `useNavBadgeCounts(variant)` so all nav surfaces read
  one hook.
  - **Both counts are work-queue counts, not historical tallies — self-clearing by design.**
    Conversations = `requires_human:true AND resolved:false AND actioned_by IS NULL`
    (`GET /api/conversations/needs-attention-count`, scoped via the existing `getBranchIds`
    helper, count-only query, registered BEFORE `/:id` so it isn't shadowed by that param route).
    `actioned_by` is set by ANY `PATCH /api/conversations/:id` (note added, marked handled,
    resolved — conversation.routes.ts always stamps it, not just on resolve), so the badge clears
    the moment an operator touches the conversation at all, not only on resolve. **Known tradeoff:**
    `actioned_by` is never reset back to null anywhere — a conversation that gets re-escalated
    after already being actioned once will NOT reappear in this count. Verified live: actioning one
    of ~70 real unactioned test-escalations (accumulated from this session's testing) dropped the
    count by exactly 1.
  - Support = `status = 'open'` only (NOT `in_progress` — that means someone already picked it up,
    so it's off the queue) for the relevant org. **Chosen over "unread" because `support_tickets`
    has no per-ticket read/unread state** — status is the only tenant-facing signal the Support
    page tracks. Tying the badge to notification `read_by` instead was considered and rejected: a
    notification goes "read" the moment someone opens the bell dropdown, clearing the nav badge
    without the ticket itself being addressed.
  - **Support badge also exists on `/admin` (operator/super-admin console).** Investigated first
    whether there's an operator-side Conversations equivalent to match — there isn't:
    `/admin/leads` is sales leads for onboarding NEW Nizam clients (prospects), not a cross-tenant
    customer-conversation queue, so Conversations stays dashboard-only (its query passes
    `enabled:false` on the admin variant — never fetched there, not just hidden). Support's
    `GET /api/support/tickets/open-count` is role-aware, mirroring `GET /tickets`'s own scoping
    exactly: non-super-admin always org-scoped; super-admin org-scoped only while impersonating a
    tenant (`organisation_id` set), otherwise counts open tickets across every organisation — the
    operator's real cross-tenant queue. Same endpoint, same hook, serves both surfaces; only the
    path key (`/dashboard/support` vs `/admin/support`) differs. **Not click-verified on `/admin`
    itself** (no super-admin login available this session) — verified instead by directly comparing
    the cross-tenant-scoped query against the single-org-scoped query against live data, confirming
    the branching logic executes correctly; worth a quick manual check next time you're in the
    operator console.
  - **View-tracked on top of the work-queue filters, so the badge is a clean slate on open, not a
    permanent backlog counter.** `user_section_views(user_id, section, last_viewed_at)` — opening
    Conversations or Support (`Conversations.tsx`/`Support.tsx`/`AdminSupport.tsx`, on mount) POSTs
    `/api/nav-views/mark-viewed {section}`, which upserts `last_viewed_at=now()` for that user+
    section. Both count endpoints then add `updated_at > last_viewed_at` on top of their existing
    filters (`lib/navViews.ts`'s `getLastViewedAt`) — so a user's first-ever visit still shows the
    true backlog (matches original behavior, `last_viewed_at` row doesn't exist yet → no filter
    applied), but every visit after that resets to zero, climbing again only as things change
    post-visit. The mark-viewed mutation also invalidates the badge-count query client-side so the
    nav badge updates immediately, not on the next 25s poll. Verified live end-to-end: badge showed
    the real backlog → visiting the page dropped it to 0 immediately → inserting a fresh escalated
    conversation directly (simulating new activity) made the Conversations badge climb back to 1
    without a page visit, while Support stayed at 0 (independent per-section tracking, confirmed).
- *Human resolution note — DONE:* `ConversationPanel.tsx`'s "Mark resolved" now opens a skippable
  dialog asking what was done, before resolving (see §6a). Un-resolving stays a one-click toggle.
- *Chat auto-summary — DONE, and taken further than the original scope:* originally scoped as
  resolve-only; shipped as a refreshable system summary with BOTH triggers (resolve AND a 3-min
  inactivity sweeper), because a resolve-only summary would never update if the conversation
  reopened with more messages after being summarized once. See §6a for the full design
  (`claudeService.summarizeConversation`, `chatSummarySweeper.ts`, the `summarized_at` /
  `summary_regenerations` columns, the compare-and-swap claim, the 2-regeneration cap).
- *NOTE — distinct from [8b] below:* the user ALSO wants a bigger idea — resolved conversations +
  resolution notes become RETRIEVABLE KNOWLEDGE so recurring issues get handled from past resolutions.
  That's the "resolution-learning loop" — a separate Tier-3 design, NOT this simple summary. Don't
  conflate them.

**[6] In-app voice test button (Channels voice card)**
- *What:* a "Test call" button that opens an in-browser web call to the tenant's Retell agent (Retell
  web-call SDK), like the existing chat test.
- *Why:* lets the user (and later clients) demo/verify voice without the Retell dashboard — strong
  "self-serve" pitch beat.
- *Approach:* Retell web-call SDK in the frontend, pointed at the tenant's agent_id.

### TIER 3 — bigger builds, real value, not pitch-blocking

**[7] Site aesthetics / layout regroup / routes**
- *What:* a design pass — regroup nav/routes, improve layout & visual polish. Subjective; needs a
  dedicated session with the user driving taste. Also: the user asked how to create custom
  Claude/design agents — pair a design-focused agent (strong system prompt + reference material) with
  this. There is no official "product designer agent marketplace"; build one via Claude Code
  agents/skills + CLAUDE.md guidance.

**[8a] In-app platform assistant (dogfooding) — IN PROGRESS, architecture DECIDED**
- *What:* a support/helper agent embedded in the Nizam dashboard itself — answers product
  questions, guides navigation, and raises a support ticket when it can't help. Literally Nizam
  configured to support Nizam's own users.
- *Why:* reduces support load; is a strong demo story (dogfooding the exact product being sold).
- *Architecture — DECIDED after debate:* **NO fake tenant.** The assistant lives on a dedicated
  **"Platform Support" branch** under the operator org **Ellice Systems**
  (`59f59492-9039-4bcf-8826-d25bd2603eb4`), managed from the OPERATOR dashboard by mounting the
  existing TENANT Agent/Knowledge/Conversations components, scoped to that branch. Reuses
  everything already built (agent config, KB, inbox) instead of a parallel system.
- *Diagnosis ability, v1 (this build) — knowledge-based only:* decision-tree troubleshooting
  entries live IN the KB as regular documents — no new "diagnosis engine" for v1. The approved
  product-docs KB is `nizam-product-kb.md` (repo/user's copy); upload it as-is to seed the
  assistant.
- *Ticket creation:* a new control tag, `<<TICKET subject="" detail="">>`, handled in the SHARED
  finalize block (same place `<<ESCALATE>>`/`<<LEAD>>` are handled — see §3) so voice/chat/
  WhatsApp can't drift. Gated so ONLY agents with the `support_request` intent get the
  instruction in their system prompt (mirrors how other intent-specific instructions are already
  scoped). Tickets are attributed via OPTIONAL authenticated widget context: bearer token →
  `supabase.auth.getUser()` → resolved org/user flows into `ChatParams` — NEVER trust a
  client-supplied org_id/user_id directly.
- *Widget embedding:* the assistant widget embeds in the TENANT dashboard shell ONLY (not on
  client-facing public sites). Reuses `public/widget.js` unchanged, plus a new OPTIONAL
  auth-token config field — public/anonymous widget usage on client sites is unaffected.
- *Build order:* (1) setup script — DONE, see below; (2) operator-nav mounting — DONE, see below;
  (3) KB upload — DONE, see below; (4) `<<TICKET>>` tag — shared finalize handling + intent
  gating — DONE, see below; (5) embed — widget.js mounted in the tenant dashboard shell with the
  auth-token config — DONE, see below. **[8a] is COMPLETE for v1.**
- *(1) Setup script — DONE.* `backend/scripts/setupPlatformAssistant.ts` (same shape as
  `connectTestVoice.ts`: dotenv-first, idempotent — reuses an existing branch/agent/intent by
  name/key instead of duplicating, safe to re-run). Creates branch **"Platform Support"**
  (`cd61745b-fab5-4297-a0d9-59c27c30fa34`) under Ellice Systems — `location` and `business_hours`
  left at their DB defaults (empirically confirmed nullable/defaulted, not copied from
  Headquarters; only `timezone` is copied, per the original ask) — and agent **"Nizam Assistant"**
  (`c85e1bc2-cc33-47b8-81ab-25fb10cbbbfe`, tone `friendly`, `llm_provider`/`llm_model` set
  explicitly to `openai`/`gpt-4o` matching every other agent row even though those columns turned
  out to have matching DB defaults) with the `support_request` intent
  (`75ce9422-6481-49d5-8191-3c53e46efb05`). `system_prompt` is the full REPLACE-the-default prompt
  agreed in this session (anti-internals/anti-other-customers/anti-invention rules, ticket-raising
  instruction, plain-text-short-replies). Verified idempotent by running it twice.
- *Org exclusion — DONE, done alongside the setup script since the new branch made it visible
  immediately.* Ellice Systems (`PLATFORM_ORG_ID`, new `backend/src/config/constants.ts`) was NOT
  previously excluded from tenant-facing operator surfaces — `organisationService
  .getAllOrganisations()` (backs `/admin/clients` AND the `/admin/tenant-mode` impersonation
  switcher AND `AdminOverview.tsx`'s client count) and `analyticsService.getAllBranchIds()` /
  `getCrossClientOverview()` (cross-client `/api/analytics/overview` + `/volume` when a
  super-admin isn't impersonating anyone) all queried every org/branch with no filter. Now all
  three add `.neq('id'|'organisation_id', PLATFORM_ORG_ID)`. Deliberately also removes Ellice
  Systems from the tenant-mode switcher — correct per the architecture decision above: the
  operator manages Platform Support directly from `/admin`, never by impersonating Ellice Systems
  as if it were a client. Verified live: all three now return the platform org's data/branches
  filtered out (confirmed against the real DB — `getAllOrganisations` 1 org, not 2;
  `getAllBranchIds` excludes both of Ellice's branches; `getCrossClientOverview` breakdown has no
  Ellice Systems row).
- *(2) Operator-nav mounting — DONE.* New routes `/admin/assistant/agent|knowledge|conversations`
  reuse `Agent.tsx`/`Knowledge.tsx`/`Conversations.tsx` UNCHANGED IN CONTENT — no parallel
  operator-side pages built. Super-admin-gated for free (nested inside the existing admin
  `ProtectedRoute`+`AppLayout` wrapper in `App.tsx`, same as every other `/admin/*` route).
  **Pinning mechanism — extended tenant-mode's existing scoping machinery rather than inventing a
  new one:** every dashboard page already resolves its org via `tenantOrgId ?? organisationId`
  (the `auth.store.ts` field tenant-mode sets); reusing it meant ZERO changes to org-resolution
  logic in the three pages. That mechanism only ever pinned ORG though — fine while every real
  tenant had exactly one branch (so "first branch of org" was always correct), wrong now that
  Ellice Systems has two (Headquarters + Platform Support). Extended with a parallel
  `tenantBranchId` field + `X-Tenant-Branch-Id` header + `req.tenant.branch_id` (was hardcoded
  null for super-admin in `auth.middleware.ts`) — same shape as the existing org pin, just for
  branch. `Knowledge.tsx`/`Agent.tsx`'s branch-resolution fallback chain now prefers
  `tenantBranchId` first; `Conversations.tsx` needed no client-side change (entirely server-driven
  via `req.tenant`/`getBranchIds`). New `PlatformAssistantScope.tsx` sets this pin on mount,
  restores whatever was there before on unmount (can't clobber a real tenant-mode session active
  elsewhere) — deliberately NOT real tenant-mode's flow (which navigates to `/dashboard` and shows
  a "Viewing as" banner): these routes stay under the admin `AppLayout`, where that banner is
  hard-gated to `variant === 'dashboard'`, so it reads as a native operator section for free, no
  extra flag needed.
  **Backend scope handling needed — less than expected.** Agent/branch/knowledge routes already
  had a super-admin bypass on their ownership checks (`isSuperAdmin || isOwnOrg`-style, ignoring
  `req.tenant` entirely for super-admin), and Knowledge's own API calls already pass `branch_id`
  explicitly rather than relying on server-side derivation — both already worked before this
  change. Only the conversations family actually needed the new header, since `getBranchIds()`
  derives branch scope from `req.tenant.branch_id`.
  **Bug found and fixed along the way:** `Agent.tsx` picked `agents?.[0]` (first agent across the
  WHOLE org, `useAgentsByOrg`, no branch filter) — harmless for every existing single-branch
  tenant, wrong now that Ellice Systems has two agents. Fixed to filter by the resolved branch
  first. A concrete instance of the first-branch-assumption debt tracked in §8 Tier 3 [9a].
  **Nav:** new admin nav section "Platform Assistant" (Agent/Knowledge/Conversations) in
  `navConfig.ts`. Also fixed while verifying this live: the desktop sidebar's nav container had
  `overflow-hidden` (clipping instead of scrolling once the list grew) — the mobile drawer nav
  already scrolled correctly; desktop now matches.
  **Verified live** by the user as a real super-admin (no super-admin login available to Claude
  this session): both desktop and mobile nav show the new section; Agent page shows "Nizam
  Assistant" (tone friendly); Knowledge and Conversations both load scoped to the Platform Support
  branch.
- *(3) KB upload — DONE.* Uploaded via a one-off backend script (not the UI — the Claude Browser
  sandbox can't inject files into a native OS file picker; the script does exactly what
  `POST /api/ingest/upload`'s `extractText` + `ragService.ingestText` do, just invoked directly),
  scoped to the Platform Support branch. Final state: 33 chunks under one document, "Nizam
  Platform — Product Knowledge Base.pdf".
  **Found and fixed a real CORS bug while verifying this live** (not a data problem, despite
  first appearing as one): the backend's `Access-Control-Allow-Headers` allowlist
  (`backend/src/index.ts`) explicitly listed `x-tenant-org-id` but not the new
  `x-tenant-branch-id` from (2) above — so EVERY request made while scoped to Platform Assistant
  was silently blocked by the browser's CORS preflight before ever reaching the backend, which is
  why Knowledge/Agent/Conversations all looked empty despite the upload having worked
  server-side. Fixed by adding `x-tenant-branch-id` to the allowlist. Gotcha hit while diagnosing:
  browsers cache CORS preflight (`OPTIONS`) responses, so after deploying the fix, stale-cached
  rejections kept showing in the console for a bit even though fresh requests were already
  succeeding — don't trust lingering console errors without confirming against a fresh
  request/reload.
  **Also found (and cleaned up) duplicate/mangled ingestion batches** on this branch: 3 near-
  identical ingestion runs of the same PDF existed by the time this was caught (only one was
  knowingly run via this session's script — the other two are unexplained, possibly a
  pre-CORS-fix browser attempt), two of them under a mojibake-corrupted `source_url` (`â` in place
  of the em dash, likely a `multer`/multipart filename-encoding issue on whichever path produced
  them — not reproduced or fixed at the code level, just cleaned up in data). Deduped with the
  existing `cleanupDuplicateChunks.ts` (scoped via `BRANCH_ID` env var) down to one copy per
  unique chunk, then normalized every surviving row's `source_url` to one consistent
  (correctly-encoded) value so the Knowledge page displays a clean filename instead of the
  mangled one.
- *(4) `<<TICKET>>` tag — DONE.* A new control tag (`backend/src/services/claude.service.ts`) lets
  the assistant raise a real `support_tickets` row mid-conversation, not just hand off via the
  existing ESCALATE/LEAD path.
  **Gating:** the TICKET instruction is appended in `buildIntentHandling()` only when
  `intents.some(i => i.key === 'support_request')` — client-facing agents never see it. Verified
  live: an equivalent billing scenario against the Maryam Orgaization branch (no `support_request`
  intent) never emits the tag.
  **Prompt tuning (a real regression found during live testing):** the first phrasing made TICKET
  a separate judgment call ("if the issue can't be resolved, raise a ticket") — gpt-4o reliably
  ignored it, treating `<<INTENT:support_request>>` + `<<LEAD ...>>` as sufficient on their own
  and never emitting TICKET at all, even mid-escalation. Fixed by tying it 1:1 to the intent tag
  instead: "every time you append `<<INTENT:support_request>>`, you MUST ALSO append
  `<<TICKET subject="" detail="">>` in that same reply." This is a concrete trigger the model
  reliably follows, confirmed across repeated live turns. Over-emission across turns is harmless —
  `raiseSupportTicket` is idempotent (see below).
  **Finalize:** parsed/stripped in the shared `finalizeTurn` (between the LEAD strip and the
  generic `<<...>>` safety net), so `chat()` and `chatStream()` both get it for free. The
  streaming `TagSafeEmitter`'s generic discard already covered it with no changes needed.
  **Attribution — architecture decision made mid-build:** the original spec called for an OPTIONAL
  bearer-token flow (unattributed ticket if absent, matching the LEAD pattern). Built that way
  first (`backend/src/lib/optionalAuth.ts`, mirrors `auth.middleware.ts`'s `supabase.auth.getUser`
  but degrades to `null` instead of 401ing), wired into the already-authenticated `POST /api/chat`
  (free via `req.user`/`req.tenant`) and the public `POST /widget/chat` (verifies its own token).
  Live testing then hit `support_tickets.created_by` being `NOT NULL` in the live schema — and
  discussing the fix surfaced that unattributed tickets shouldn't exist in the first place: the
  assistant only ever lives inside the authenticated tenant dashboard shell (this build's own
  architecture decision, top of this section), so a legitimate ticket-raiser is always a real
  logged-in user; a public, unauthenticated widget visitor asking for help is an enquiry/lead-
  capture case (the existing ESCALATE/LEAD path), never a ticket-raiser. **Decision: raising a
  ticket now REQUIRES a verified `authenticatedUserId`+`authenticatedOrgId`; if absent,
  `raiseSupportTicket` logs and skips creating a ticket** — nothing is silently lost, since the
  standard escalation notification (email + in-app bell, §6) still fires regardless of whether a
  structured ticket exists. `lib/optionalAuth.ts` and the widget-route wiring stay in place
  unchanged (still correct infrastructure for step 5's dashboard-embedded widget, which will carry
  a real bearer token) — only `raiseSupportTicket`'s handling of the "no attribution" case changed.
  **Idempotency:** plain check-then-insert keyed on `(conversation_id, status IN
  ('open','in_progress'))` — deliberately NOT an atomic claim column like `lead_announced_at`/
  `escalated_at`/`summarized_at` (§6), because TICKET emission is single-threaded per conversation
  turn (no overlapping-transcript race like voice's lead capture). Comment in code notes it should
  be promoted to an atomic claim if a second raising path is ever added.
  **Ticket shape:** `conversation_id` (new column — `ALTER TABLE support_tickets ADD COLUMN
  IF NOT EXISTS conversation_id uuid REFERENCES conversations(id);`, run directly against
  Supabase) so the team can open the source transcript; `organisation_id`/`created_by`/
  `created_by_email`/`created_by_name` from the verified auth context; `status: 'open'`,
  `priority: 'normal'`; a `support_messages` row with the model's `detail` text so the ticket
  reads the same as a human-submitted one; notification emission (email to
  `SUPPORT_DEFAULT_EMAIL` + in-app bell) mirrors `support.routes.ts`'s existing manual-ticket
  route exactly.
  **Live-verified** (direct `claudeService.chat()` calls against the Platform Support branch,
  simulating a billing/plan-change conversation with a real authenticated user id): tag never
  leaks into the visible reply; exactly one ticket created once name+contact are collected; a
  repeat qualifying message in the same conversation does not create a duplicate.
- *(5) Dashboard embed — DONE.* `frontend/src/components/PlatformAssistantEmbed.tsx` injects
  `public/widget.js` (REUSED, not forked) into the tenant dashboard shell, mounted from
  `AppLayout.tsx` behind `variant === "dashboard"` — so it can never appear on `/admin/*`
  (which renders `AppLayout variant="admin"`) or on `PublicLayout` marketing pages.
  **All widget.js changes are opt-in `data-*` attributes that no-op when absent, so the public
  embed on tenant sites is byte-for-byte unchanged in behavior:**
  - `data-token` → sent as `Authorization: Bearer` on `POST /api/widget/chat`, which is what lets
    `finalizeTurn`/`raiseSupportTicket` resolve `authenticatedUserId`/`authenticatedOrgId` (step 4).
    Read FRESH on every send (not captured at init) because the React wrapper rewrites the
    attribute from `supabase.auth.onAuthStateChange` as the session auto-refreshes — a
    long-open dashboard tab would otherwise fall back to no ticket once the original token expired.
  - `data-disable-capture` → skips `capturePage()`/`runSiteSweep()` entirely. Those exist to crawl a
    TENANT's public marketing site; without this the dashboard's own React UI would be ingested as
    "knowledge" into the assistant's KB.
  - `data-branch-id` → see the branch-resolution bug below.
  - `data-theme-mode`/`-primary-color`/`-font-family`/`-corner-radius` → embed-time appearance
    overrides applied on top of the fetched `/api/widget/config`, WITHOUT touching
    `organisations.branding_config` (which would change the assistant's look everywhere else too).
  **Theme:** the dashboard's light/dark toggle is in-app state, NOT a `prefers-color-scheme`
  change, so widget.js's `watchAutoTheme()` media-query listener never fires for it. Rather than
  make detection cleverer, widget.js now exposes `window.NizamAssistantWidget.setThemeMode(mode)`
  and the React wrapper pushes the dashboard's real `resolvedTheme` on mount and on every change.
  Verified live in both modes (light `--nzw-bg #FFFFFF`/text `#1A1A16`; dark `#0E0E0C`/`#FAFAFA`),
  including a mid-session toggle re-theming the already-open panel.
  **No collision:** the only other fixed bottom-right element in the dashboard is the React Query
  Devtools button, which is `import.meta.env.DEV`-gated and never ships — default widget position
  kept as-is.
  **SPA-lifecycle hardening (no-ops for the traditional multi-page public embed):** `buildWidget()`
  bails if `#nizam-widget-root` already exists and the injected `<style>` is deduped by id; the
  React wrapper removes both the widget DOM (appended to `document.body`, outside React's tree)
  and the script tag on unmount. Verified live: leaving the dashboard removes both, returning
  re-mounts exactly one root and one style tag.
  **BUG FOUND AND FIXED — wrong branch (the big one).** `widget.routes.ts` resolved an org's branch
  with a bare `.limit(1)` and NO `.order()`, so for a multi-branch org it picked an arbitrary
  branch — for Ellice Systems that was **Headquarters** (an unrelated pre-existing "Aria" agent
  with ZERO KB chunks) instead of **Platform Support** (Nizam Assistant, the 33 chunks from step 3).
  Every product question therefore escalated as unanswerable, which looked like a KB/RAG failure
  but wasn't. Fixed per §8 Tier 3 [9a]'s own guidance: new `resolveBranchId(orgId, explicitBranchId?)`
  shared by `/config` and `/chat` — an explicit `branch_id` is **verified to belong to `orgId`
  before use** (a caller can never target another org's branch; live-tested with a foreign branch
  id, which correctly falls back rather than being honored), and the org default is now
  deterministic (`ORDER BY created_at`), which also de-risks every future multi-branch tenant.
  **BUG FOUND (pre-existing, NOT fixed — see §9):** the public embed snippet points `widget.js` at
  `VITE_WIDGET_URL` = the Railway backend, which does NOT serve the file (JSON 404) and whose
  `helmet()` default `Cross-Origin-Resource-Policy: same-origin` blocks cross-origin script loads
  outright (`ERR_BLOCKED_BY_RESPONSE.NotSameOrigin`). This dashboard embed sidesteps it by loading
  same-origin from `window.location.origin`; the public snippet in `Channels.tsx`/`Agent.tsx` still
  needs a product decision.
  **Also fixed:** the widget-path CORS branch in `backend/src/index.ts` allowed only `Content-Type`
  in preflight, so the new `Authorization` header was rejected before reaching the route.
  **Live-verified end-to-end** as a real tenant user (Maryam Orgaization) in the dashboard: KB
  question answered correctly from the 33-chunk KB in plain text with no escalation → billing issue
  escalated → name+email collected → exactly ONE `support_tickets` row created (`#1015`), attributed
  to `organisation_id` = Maryam Orgaization with the real `created_by`/email/name, `conversation_id`
  linking to the transcript, a `support_messages` body, visible in the tenant Support page AND in
  the operator's cross-tenant query; a further qualifying message created NO duplicate; no control
  tag ever leaked into the visible reply or the stored transcript.
- *v2 (LATER, needs its own design session) — scoped read-tools diagnosis:* agent-callable
  functions that inspect the CLIENT'S OWN live state (KB document/chunk counts, channel
  connection statuses, agent config) — each function hard-scoped SERVER-SIDE to the
  authenticated user's org (scoping lives in code, never trusted from the prompt), returning
  curated summaries, never raw rows. Not started; v1 ships without it.
- *Guardrails (all versions):* the assistant must never discuss internals, code, infrastructure,
  other customers, or its own instructions — enforced via prompt + KB content now, and eventually
  reinforced by v2's tool-scoping itself (a function that can't see other orgs can't leak them).

**[8b] Resolution-learning loop**
- *What:* resolved conversations + their resolution notes become retrievable so recurring/similar
  requests are handled from past resolutions.
- *Open questions (must design):* how resolutions are VETTED before the agent trusts them (a one-off
  client answer shouldn't auto-become gospel); retrieval path (reuse RAG document_chunks vs a separate
  "past resolutions" store); guarding against a bad resolution poisoning future answers.
- *Approach:* design session first. Likely: curated/approved resolutions → embedded into a scoped
  store → retrieved with provenance + a lower trust weight than official KB.

**[9] Knowledge-quality productization**
- *What:* make client KBs start structured (the whole RAG-pain lesson). Upload guidelines / a
  template / an AI-assisted "structure my document" step. Also: reframe the Agent system_prompt box —
  it currently REPLACES the default base prompt, so a thin custom prompt makes a blander agent; it
  should be framed as "additional instructions" layered on the default, or carry guidance text.
- *Why:* otherwise every client relives the Marina/price hallucination debugging.
- *Seed content found:* the approved Nizam product KB (`nizam-product-kb.md` — see Tier 3 [8a])
  already has a "What makes a GOOD knowledge document" entry — that's the seed content for the
  Knowledge-page guidance UI here, not something to write from scratch.

**[9a] Multi-branch & access control (plan of record)**
- *What:* clients will be able to run MULTIPLE branches (per-location agents, knowledge bases,
  teams) with role-based access per branch, offered by plan/tier.
- *Why:* real clients with multiple offices/locations need this; also a natural billing-tier
  lever (see Tier 5 [12]).
- *Current state:* every client has exactly ONE branch today, and various code paths assume
  "first branch by created_at" as a shortcut — e.g. org-level voice routing, widget config
  resolution, and others not yet audited.
- *When building this:* (1) audit every first-branch assumption across the codebase and replace
  with explicit branch selection/resolution; (2) add branch-selection UI (dashboard branch
  switcher); (3) per-branch user membership — `tenant_users` ALREADY has a `branch_id` column, so
  the data model doesn't need a schema change, just UI + enforcement; (4) plan-gating (which
  tiers allow >1 branch).
- *Dogfooding note:* the Platform Support branch setup (Tier 3 [8a]) deliberately exercises the
  multi-branch path NOW, ahead of the full feature — Ellice Systems will have ≥2 branches
  (whatever exists today + Platform Support) before any client does.
- *Gotcha:* no new code should hardcode a first-branch assumption from here on — every new
  branch-scoped feature should take an explicit branch_id, not silently fall back to "the first
  one."

**[9b] First-login onboarding tour (final-stage polish)**
- *What:* an interactive walkthrough for new users on first login — a guided tour (react-joyride
  or similar) of the dashboard: knowledge upload → agent config → embed code → inbox. Possibly
  paired with a short video.
- *Why:* self-serve onboarding; reduces the "what do I do first" drop-off.
- *Connects to [9]:* the tour is where knowledge-quality guidance actually gets TAUGHT to a new
  user, not just documented — ties directly into the Knowledge-page guidance UI above.
- *Timing — deliberately LAST:* build this at the final polish stage, once the UI is settled
  (i.e. after the Tier 3 [7] design pass), so the tour doesn't end up touring a UI that then
  changes out from under it.

### TIER 4 — external-dependency threads (run in parallel, not blocking)

**[10] WhatsApp live test** — see §5.3. Fires when a usable number lands. Everything is built.

**[11] Retell number / Nigerian telephony**
- *Blocker found:* Retell's number-purchase requires ID verification whose COUNTRY dropdown lacks
  Nigeria (comes before the document-type step). Cannot self-serve a US number this way.
- *Options:* (a) message Retell support for a manual-review path for unsupported countries (cheap,
  parallel); (b) friend's US ID — works but the account is then KYC'd to their identity, a liability
  to unwind for a real business (must be with full consent); (c) **BYO number via SIP** — get a number
  from a provider whose KYC passes (Twilio accepts Nigerian docs more readily; or **Africa's Talking**
  for a real +234 number) and trunk it into Retell (Custom Telephony). Option (c) also solves the
  PRODUCTION Nigerian-number question (test numbers don't dial from Nigeria anyway).
- *Approach:* support message now; research Africa's Talking ↔ Retell SIP/BYOC integration
  specifically before committing (not verified yet). This is the real production telephony answer.

### TIER 5 — the finale

**[12] Billing**
- *What:* subscription/usage billing for tenants. NOT Stripe (limited in Nigeria) — **Paystack or
  Flutterwave** (undecided). Use HOSTED checkout (never handle card data). Plans/tiers — this is where
  **voice = premium tier** lives (voice's ~$0.15-0.30/min all-in cost must be covered by the tier).
  Subscription state per org, provider webhooks for payment events, gating features by tier.
- *Why last:* self-contained (no AI), and it wants everything else stable + the tier structure informed
  by the final feature set. env has STRIPE_* stubs (ignore) and the Billing nav placeholder exists.
- *Gotcha:* safety — never touch card data; hosted checkout only.

---

## 9. Parked small bugs / refinements (low priority)
- WhatsApp: fresh-thread-on-resolved (currently reuses any thread by call_id; agreed future = thread
  on resolved=false + 24h recency).
- whatsapp_processed_messages pruning (grows unbounded).
- Resend domain verification (test mode currently).
- Notification auto-expiry/dismiss (parked).
- Post-close voice `chat()` waste (a turn can run after the socket closed — guarded now, but verify).
- Booking flow occasionally over-asks — mostly fixed; watch for recurrence.
- Near-duplicate detection for LLM-enriched chunks (unsolved): the enrichment pass in
  `ragService.enrichContent()` generates Q&A/summary passages at temperature 0.2, so the same
  underlying fact re-ingested (re-uploaded doc, re-crawled page with minor edits) can produce
  textually different but semantically identical chunks — exact-hash dedup (`findDuplicateChunks.ts`,
  `capturePage`'s content-hash) won't catch these, only byte-identical duplicates. No fix scoped yet
  (options would be embedding-similarity dedup at ingest time, or hashing the source text pre-enrichment
  rather than the enriched output). **Preferred mitigation is upstream, not a dedup algorithm:**
  structured, deliberate uploads (see §8 Tier 3 [9] "knowledge-quality productization") mean fewer
  ad-hoc re-ingests in the first place, which is the actual source of near-duplicate drift.
- Badge counting refinement (see §8 Tier 2 [5]): badges currently clear on VIEW (per-user
  seen-state) — if unhandled work slips through unnoticed as a result, upgrade the model to
  view-tracked AND unactioned combined (only clear on view AND require an explicit action, not
  either alone).
- "Add page" (Knowledge, single-page capture) takes ~30s end-to-end (dominated by OpenAI
  enrichment) with no progress indication beyond the disabled button — needs a UX progress hint.
- Operator Support badge across-tenant scope (see §8 Tier 2 [5]): logic-verified but not
  click-verified on `/admin` itself — confirm live next time there's a super-admin session.
- Retell account MFA is dependent on a friend's phone (borrowed for 2FA) — add TOTP or a backup
  method once account access is available again.
- ~~**PUBLIC widget embed snippet points at a URL that can't serve it**~~ — **FIXED.** The snippet
  in `Channels.tsx`/`Agent.tsx` built `src="${VITE_WIDGET_URL}/widget.js"` with `VITE_WIDGET_URL`
  set to the Railway BACKEND, which (a) 404s `/widget.js` (JSON, from the SPA catch-all) and
  (b) sends `helmet()`'s default `Cross-Origin-Resource-Policy: same-origin`, blocking a
  cross-origin `<script>` load outright — so the copy-paste embed a tenant put on their own site
  never loaded. Invisible from inside the dashboard, whose own embed loads same-origin.
  **Decision: serve it from the Vercel FRONTEND origin** — `widget.js` is `frontend/public/`, a
  static asset of the frontend; the backend has no business serving it and its security headers
  were NOT loosened. Vercel already serves it correctly with no changes needed (verified:
  `200`, `content-type: application/javascript`, `access-control-allow-origin: *`, and no
  restrictive CORP header).
  - Both inline copies of the builder are gone; there is now ONE source of truth,
    `frontend/src/lib/widgetEmbed.ts` (`buildEmbedCode`). Duplication is why the wrong host
    survived in two places.
  - **`VITE_WIDGET_URL` is now OPTIONAL and only means "override the host" (custom domain/CDN);
    the default is the frontend's own origin**, which is correct in production without any env
    var at all. Because the deployment env may still carry the old backend value, `resolveWidgetHost()`
    treats a configured value EQUAL TO the API base as that stale misconfiguration and ignores it —
    so production is correct even if Vercel's project settings were never updated. `.env` /
    `.env.example` updated (the old `.env.example` comment actively asserted the wrong thing:
    "widget.js is served by the Railway backend, not this Vercel deployment").
  - **Verified cross-origin for real**, not just by reading headers: a scratch page served from a
    third origin (`localhost:9876`, distinct from both vercel.app and railway.app) loaded the
    script, rendered, auto-themed to the host page, and chatted against the Maryam tenant, getting
    a correct KB answer about Hutu Orchards.
  - **GOTCHA worth knowing (bit me during that test):** a bare test page WILL have its own content
    auto-ingested into the tenant's live KB — `capturePage()`/`runSiteSweep()` fire on any embed
    without `data-disable-capture="true"`. The first run put 12 junk chunks into Maryam's KB
    (removed). On a REAL tenant site that behavior is wanted; on a throwaway test page always add
    `data-disable-capture="true"`.
- Sidebar dark/light toggle did not respond to synthetic clicks at its own reported coordinates
  during browser-automation testing (the same button worked when clicked via `element.click()`) —
  most likely a browser-pane coordinate/scaling artifact rather than a product bug, but it was
  never fully explained. Worth a real human click-check on desktop before assuming it's fine.

---

## 10. How to work in this repo
- Read this file + the relevant service before editing. Prefer additive prompt changes.
- Build (`npm run build` backend / `tsc --noEmit` frontend), commit, PUSH to main, then verify via
  `/api/version` + a real test (transcript for agent changes).
- For agent-behavior changes: test on the Maryam test tenant, check a transcript, watch for regressions
  in the OTHER channels (chat/voice/whatsapp share the brain).
- **Before ending any session that changed code, decisions, or status: update the relevant
  section(s) of this file** (new gotcha → §7, tier item done/blocked/re-scoped → §8, schema
  change → §2, new service/flow → §3-6). This file drifting out of date defeats its purpose.
