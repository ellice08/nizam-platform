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
  updated_at, **escalated_at**, **lead_announced_at**, **escalation_pending_since**.
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

**[5] Nav badges + chat auto-summary**
- *Nav badges:* Conversations and Support nav items should show a count/indicator for new/unread
  items, like Notifications already does. Data-driven, small UI+query feature.
- *Chat auto-summary:* generate an AI summary into conversation Notes for CHAT conversations
  (parity with voice, which summarizes at call-end). **Trigger decision (user's call): ON RESOLUTION
  first** — when a client marks resolved. Rationale from the user: the client should add how it was
  resolved; the summary anchors that. Inactivity/both can be added later by the system.
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

**[8a] In-app platform assistant (dogfooding)**
- *What:* a floating helper in the Nizam dashboard that answers product questions, guides navigation,
  and raises a support ticket when it can't help.
- *Why:* reduces support load; is literally Nizam pointed at itself (great demo story).
- *Approach:* Nizam's own widget/agent, KB = Nizam product docs, plus a create-support-ticket
  function. Reuses existing agent + widget + support infrastructure.

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
