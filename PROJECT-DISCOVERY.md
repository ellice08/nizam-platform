# PROJECT DISCOVERY — Nizam Platform

**Phase 0 · Discovery, architecture audit and context handoff**
Produced read-only. No source file, configuration, dependency, route, schema or
product behaviour was modified. Nothing was committed or pushed.

**Audience:** the senior product/UX/engineering collaborator joining the redesign.
**Purpose:** transfer historical context that the current implementation does not
express on its own.

---

## Classification key

Every significant claim below is tagged with its source of truth:

| Tag | Meaning |
|---|---|
| **[A]** | Locked product decision |
| **[B]** | Documented architectural decision (CLAUDE.md) |
| **[C]** | Current implementation (verified in code/DB this session) |
| **[D]** | Historical implementation decision |
| **[E]** | Inferred behaviour (reasoning, not verified) |
| **[F]** | Unknown — cannot be determined from the repository |

`[C]`, `[E]` and `[F]` are never treated as product requirements.

---

## 1. Existing documentation reviewed

| Source | Status |
|---|---|
| `CLAUDE.md` (1,093 lines) | **The real documentation.** Rich, current, maintained under an explicit rule that it be updated in the same session as any non-trivial change. Primary context source. |
| `INFORMATION-ARCHITECTURE.md` | Prior IA/UX audit. **Present but gitignored** — see §2 warning. Treated as verified prior work and extended here. |
| `README.md` (root) | Contains one line: `# Nizam Platform`. No content. |
| `frontend/README.md` | **Unmodified Lovable scaffold** (`"Welcome to your Lovable project / TODO: Document your project here"`). Origin signal — see §21. |
| Nested `CLAUDE.md` | None. Only the root file. |
| `schema.sql` | **[B]** CLAUDE.md explicitly flags this as STALE (references a `tenant_id` model that is not live). Do not trust it; trust the live tables. |
| Dedicated docs/ directory | Does not exist. |
| API documentation | Does not exist as a document. Routes are the contract. |
| Design-system documentation | Does not exist as a document. Tokens exist in code (§13). |
| Test documentation | Does not exist. One example test file total (§19). |

**Assessment:** this project's institutional memory lives almost entirely in
`CLAUDE.md`. That is unusually good for a project of this age, and it is the
single most valuable artefact for the redesign. It is also a single point of
failure.

---

## 2. IMPORTANT — `INFORMATION-ARCHITECTURE.md` is gitignored

**[C] Verified.** `.gitignore` line 30 contains `INFORMATION-ARCHITECTURE.md`.
The file exists on this machine but is **not in the repository**.

A collaborator cloning the repo will **not receive it**. This was a deliberate
instruction at the time it was produced ("create it locally, do not commit"), but
it is now a context-transfer hazard: the prior IA audit is invisible to anyone
who was not present.

**This report deliberately re-states its key findings** so that it is
self-sufficient, but the IA document contains a fuller route-by-route and
panel-by-panel breakdown that is worth circulating by other means.

**Recommendation (not actioned):** decide explicitly whether that file should be
committed, folded into this report, or kept local.

---

## 3. Executive summary

Nizam is a **multi-tenant AI customer-service and lead-handling SaaS**. Each
tenant configures an AI agent that speaks to *their* customers across web chat,
WhatsApp and voice, answering only from that tenant's uploaded knowledge, and
handing off to humans when it cannot. Product/company brand is **Ellice
Systems**; the product is **Nizam**. Entry market is **Nigerian real estate**.

**The core product is built and functional.** Chat, voice, WhatsApp, the agent
brain, RAG retrieval, escalation, notifications, analytics, channels, widget
theming and an in-app support assistant all work and are deployed.

**The state of the product is not the state of the design.** The functional
surface has been built feature-by-feature, and the information architecture has
accumulated rather than been designed. The single most consequential structural
observation in this audit:

> **The product's navigation reflects how the system was implemented, not how
> the work is actually done.** Configuration for one conceptual thing is spread
> across three pages; two different things share one label; and one top-level
> nav slot is occupied by a page that does nothing.

**Highest-severity findings:**

1. **[C] The public, unauthenticated `POST /api/widget/chat` has no rate
   limiting**, while a code comment states that it does. Every call costs LLM
   tokens. This is a live cost/abuse exposure. (§19 P0)
2. **[A]→[C] Multi-branch is a locked Phase-1 commitment; the implementation is
   operator-only and largely single-branch.** First-branch assumptions have
   already produced live bugs. One unfixed instance remains. (§7)
3. **[C] Billing has no data source.** `usage_logs` and `conversation_analysis`
   exist, contain **0 rows**, and are referenced **nowhere** in the backend.
   Metered billing cannot be built until instrumentation exists. (§18)
4. **[C] Branch authorization is enforced in exactly one route file** and is
   incomplete for branch-scoped roles. (§11)

---

## 4. What this product is

**Product:** an AI receptionist/agent platform sold to businesses.
**Problem solved:** businesses lose leads because enquiries arrive at all hours
across several channels and go unanswered, or are answered inconsistently.
**Value proposition:** an agent that answers accurately *from your own
knowledge*, captures the lead, and escalates honestly when it cannot help —
rather than inventing an answer.

**The product's defining constraint is truthfulness.** **[A][B]** The single most
load-bearing product decision in the codebase is *never mislead a client's
customers*. It explains architecture choices that would otherwise look
over-engineered:

- Voice uses a Custom LLM WebSocket (Option A) rather than Retell's
  function-calling mode, **[B][D]** *because the latter reworded and invented
  facts*. Our backend is the verbatim voice.
- Chunking deliberately sacrifices token efficiency for retrieval precision,
  because blending facts across products produced a fabricated property.
- The agent refuses to state anything not explicit in retrieved context, and
  hands off instead.

Any redesign that makes the agent "more helpful" by loosening these boundaries
is working against the product's core promise.

**Intended users:**
- **Tenant businesses** (currently Nigerian real-estate firms) — their staff run
  the dashboard.
- **Their customers** — never see the dashboard; they meet the agent via the web
  widget, WhatsApp or a phone call.
- **The operator (Ellice Systems)** — onboards and supports tenants.

---

## 5. Feature status

| Area | Status | Basis |
|---|---|---|
| Agent brain (chat/voice/WhatsApp shared) | **Stable, business-critical** | [C][B] |
| RAG retrieval + ingestion | **Stable, business-critical** | [C][B] |
| Web chat widget | **Stable** | [C] |
| Voice (Retell Custom LLM WS) | **Working**; ASR weak on Nigerian English | [B][C] |
| WhatsApp | **Built, never live-tested** — blocked on a usable number | [B] |
| Conversations inbox | **Stable** | [C] |
| Escalation + notifications ledger | **Stable, intricate** — see §10 | [B][C] |
| Knowledge + authoring guidance | **Stable** | [C] |
| Analytics (in-product charts) | **Working** | [C] |
| Onboarding wizard (8 steps) | **Working** | [C] |
| Platform Assistant (dogfooding) | **Complete for v1** | [B][C] |
| Client detail settings surface | **Recently added, verified** | [C] |
| **Billing** | **Placeholder only — no data source** | [C] |
| **Multi-branch UX** | **Locked, not implemented** | [A]→[C] |
| **Subdomain routing** | **Locked, never built** | [A]→[C] |
| **Per-niche labels** | **Locked, never built** | [A]→[C] |
| Product analytics/observability | **Absent** | [C] |
| Automated tests | **Effectively absent** (1 example file) | [C] |

**Explicitly out of scope / deferred [B]:** programmatic Retell agent creation;
WhatsApp Embedded Signup (Tech Provider); resolution-learning loop; v2
scoped read-tools for the Platform Assistant.

---

## 6. Architecture

### Frontend
- **React 18 + TypeScript + Vite**; deployed on **Vercel**, auto-deploy from `main`.
- **Routing:** `react-router-dom` v6, all routes declared in one file (`App.tsx`).
- **Server state:** TanStack Query. **Client state:** Zustand (`auth.store`,
  `theme.store`), persisted to `localStorage`.
- **API layer:** a single Axios instance (`lib/axios.ts`) whose request
  interceptor attaches the Supabase bearer token plus `X-Tenant-Org-Id` /
  `X-Tenant-Branch-Id`. **This interceptor is the backbone of tenant scoping** —
  see §12.
- **Styling:** Tailwind + CSS custom properties + shadcn/ui (27 Radix
  primitives). **Forms:** react-hook-form + zod (present as dependencies;
  adoption is inconsistent — several pages use raw `useState`).
- **Notifications:** `sonner` toasts. **[C] Two toast systems are installed** —
  `sonner` and a shadcn `use-toast`/`Toaster` — both mounted in `App.tsx`.

### Backend
- **Node/Express + TypeScript**, deployed on **Railway**, auto-deploy from `main`.
- **17 route modules**: agents, analytics, auth, chat, conversations, ingest,
  intents, leads, nav-views, notifications, organisations, support, users,
  version, voice, whatsapp, widget.
- **Persistence:** Supabase (Postgres + pgvector).
  **[B] The backend uses the SERVICE_ROLE key and therefore bypasses RLS.** RLS
  exists on sensitive tables as defence-in-depth but must never be relied on for
  backend authorization — every scoping decision is application code.
- **Response envelope [B]:** `ApiResponse.success(...)`; the frontend unwraps
  `response.data.data`.
- **Background workers:** two in-process sweepers started at boot
  (`escalationSweeper` 60s, `chatSummarySweeper` 60s).
- **Security middleware:** `helmet()` is applied. **`express-rate-limit` is a
  dependency but is never imported or applied** (§19 P0).
- **Logging:** Winston, **Console transport only** — logs live only in Railway's
  stream.

### External services
OpenAI (chat + embeddings), Anthropic (alternate provider), Retell (voice),
Meta Cloud API (WhatsApp), Resend (email), Supabase (DB/auth/storage).
**[C] `stripe` and `twilio` are installed dependencies but imported nowhere.**

### Environment variables (names only — no values)
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`,
`ANTHROPIC_API_KEY`, `EMBEDDING_MODEL`, `RETELL_API_KEY`, `RESEND_API_KEY`,
`RESEND_FROM_EMAIL`, `SUPPORT_DEFAULT_EMAIL`, `SUPPORT_DEFAULT_PHONE`,
`FRONTEND_URL`, `CORS_EXTRA_ORIGINS`, `PORT`, `NODE_ENV`,
`STRIPE_SECRET_KEY`*, `STRIPE_WEBHOOK_SECRET`*, `TWILIO_ACCOUNT_SID`*,
`TWILIO_AUTH_TOKEN`*, `VITE_API_URL`, `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`, `VITE_WIDGET_URL`, `WIDGET_API_BASE`.
`*` = stub/unused. **[B]** CLAUDE.md instructs that the Stripe stubs be ignored.

**Deployment gotcha [B]:** an unpushed commit once cost hours of "the fix
doesn't work" debugging. `GET /api/version` returns the deployed commit and
exists specifically to end that class of confusion. **Use it before debugging
anything that "works on disk".**

---

## 7. The branch model — locked decision vs implementation

### The locked product decision **[A]**
- Organisation admins get a **Branches view** and **per-branch drill-down**.
- **"Add/remove branches" is an org-admin permission.**
- Role scoping: `org_admin` = all branches; `branch_admin`/`branch_staff` = own
  branch; `org_viewer`/`branch_viewer` = read-only at their level.

### The current implementation **[C]**
- Branch management is **operator-only**, on `/admin/clients/:id`.
- **The tenant dashboard has no branches UI at all.**
- Every real tenant has exactly one branch today.

**This is a documented divergence, not a design choice.** CLAUDE.md §9a records
it as such. Do not conclude from the UI that multi-branch is unwanted.

### First-branch assumptions — inventory **[C], verified this session**

| Location | Nature | Risk |
|---|---|---|
| `api/widget.routes.ts:204` (`POST /widget/ingest`) | **Bare, unordered `.limit(1)`** | **HIGH — unfixed.** Widget auto-capture can write knowledge into an arbitrary branch of a multi-branch org. This is the same bug pattern already fixed for `/config` and `/chat` via `resolveBranchId`, but `/ingest` was never migrated. |
| `api/widget.routes.ts:87` | Unordered agent pick within a branch | Low |
| `pages/dashboard/Knowledge.tsx:31`, `Agent.tsx:29` | `branches?.[0]` fallback | Medium — correct only while orgs have one branch |
| `pages/admin/AdminClientDetail.tsx:109` | `branches?.[0]` for conversations | Medium |
| `clientDetail/AgentNicheSection.tsx:21` | `agents?.[0]` | Medium |
| `services/voice.service.ts`, `whatsapp.service.ts` | `.limit(1)` **with** `ORDER BY created_at` | Low — deliberate, documented org-level fallback |

**Branch-aware vs branch-agnostic:**
- *Branch-aware:* conversations scoping, RAG (chunks are branch-scoped),
  agents, channels accounts, the Platform Assistant pin.
- *Branch-agnostic:* the entire tenant navigation, Overview, Analytics, Users,
  Settings, Billing. **There is no branch dimension in the UI at all.**

**Implication for the redesign:** multi-branch is not a feature to bolt on
later — it changes what the navigation must express. It should be settled
during the IA work, not after (§23).

---

## 8. Route map

**Three surfaces**, defined by three layout wrappers in `App.tsx`.

| Surface | Wrapper | Gate |
|---|---|---|
| Public | `PublicLayout` | none |
| Tenant dashboard | `AppLayout variant="dashboard"` | `ProtectedRoute` — any authenticated user |
| Operator | `AppLayout variant="admin"` | `ProtectedRoute requireAdmin` — super-admin only |

**[C] There is no per-route role check below the admin/non-admin split.**
Role granularity below that line is **navigation-only** on the frontend
(`ROLE_NAV` hides items) with enforcement at the API. A `branch_staff` who types
`/dashboard/agent` directly reaches the page; the API is what stops them
mutating. This is defensible but should be a conscious decision, not an
accident.

### Public
| Path | Component | Reachable from |
|---|---|---|
| `/` | `Index` | navbar, logo |
| `/login` | `auth/Login` | navbar, CTA, any unauthenticated redirect |
| `/signup` | `auth/Signup` | navbar "Request access" |
| `/redirect` | `auth/Redirect` | **programmatic only** — post-login router |
| `/first-login` | `auth/FirstLogin` | **programmatic only** |
| `*` | `NotFound` | fallback |

### Tenant dashboard — all 10 routes appear in nav for at least one role
`/dashboard` (Overview) · `/conversations` · `/channels` · `/knowledge` ·
`/agent` · `/analytics` · `/billing` · `/users` · `/settings` · `/support`

Deep links: `?c=<conversationId>` (Conversations) and `?t=<ticketId>` (Support),
both emitted by notifications.

### Operator
`/admin` · `/admin/onboard` · `/admin/leads` · `/admin/support` ·
`/admin/clients` · `/admin/clients/:id` · `/admin/tenant-mode` ·
`/admin/drafts` · `/admin/assistant/{agent,knowledge,conversations}` ·
`/admin/settings`

### Wayfinding findings
- **No true orphans.** Every route is reachable.
- `/admin/clients/:id` is the only nav-absent route — a conventional detail
  view — but it is also the **only** place branches, branding and niche can be
  edited. Significant functionality behind a row click.
- **[C] A super-admin who navigates to `/dashboard` has no link back to
  `/admin`.** Tenant-mode offers "Exit client view", but a plain visit strands
  them; they must edit the URL. This is a genuine "how do I get back?" failure.
- The conversation detail panel has **no route of its own** beyond `?c=`. It is
  not deep-linkable as a first-class object, and browser Back does not close it.

---

## 9. Navigation & information architecture

### Tenant sidebar (`getDashboardSections`)
**Workspace:** Overview · Conversations · Channels · Knowledge · Agent ·
Analytics · Billing · Users
**Organisation:** Settings · Support

### Operator sidebar (`adminSections`, static, no role filtering)
**Administration:** Overview · Onboard client
**Clients:** Leads · Support · All clients · Tenant mode · Drafts
**Platform Assistant:** Agent · Knowledge · Conversations
**Account:** Settings

### Desktop vs mobile **[C]**
| | Desktop | Mobile |
|---|---|---|
| Nav model | persistent sidebar, **grouped with section labels** | hamburger drawer, **flat list, section labels dropped** |
| Collapse | yes | n/a |
| **Theme toggle** | **yes** | **absent entirely** |
| Role badge / user email | yes | no |

**Mobile users cannot switch light/dark at all.** Not a responsive-layout bug —
a missing control.

### Grouping & mapping failures (highest-value IA findings)

These are the findings that should drive the redesign. Each is a case of
**controls living away from the thing they affect**:

1. **"Agent" is not one place.** Agent identity, tone, instructions, intents,
   business hours, escalation contacts *and* the embed snippet are on
   `/agent`; the widget's appearance and channel credentials are on
   `/channels`; the org's brand colours are on `/settings`. A user changing "how
   my agent looks and behaves" must visit three pages.
2. **"Theme" means two different things** — Settings→Theme is the *dashboard*;
   Channels→Web chat→Theme mode is the *widget*. Same word, different objects,
   neither disambiguated. Same problem for brand colour vs widget colour.
3. **Business hours live on the Agent page**, not Settings — and **timezone,
   which business hours depend on, is not tenant-editable at all**.
4. **"Support" means opposite things on the two surfaces** — tenant Support =
   raise a ticket *to* Nizam; operator Support = the queue *of* those tickets.
   Same label, same icon, opposite direction.
5. **Settings mixes organisation and personal concerns** in one untabbed page
   (org name, industry, brand colours, logo *and* profile, email, password,
   theme). An operator ends up with two profile editors for the same user.
6. **Billing occupies a top-level Workspace slot while being a placeholder** —
   which reads as broken rather than unbuilt.
7. **Analytics has a "By client" table on a tenant-scoped page** — cross-client
   data, meaningful only to a super-admin.

**Do not read these as "too many pages".** The count is fine; the *mapping* is
wrong. Consolidating by user intent matters more than reducing item count.

---

## 10. Core workflows

### Agent turn (the system's spine) **[B]**
`chat()` (web + WhatsApp) and `chatStream()` (voice) **share two extracted
helpers** — `prepareTurn()` (setup, RAG, prompt assembly) and `finalizeTurn()`
(tag parsing/stripping, lead extraction, escalation, persistence,
notifications). **They were deliberately factored this way so the three channels
cannot drift.** Any change to conversational behaviour must be made in the
shared helpers, and must be regression-checked across all three channels.

**Control tags:** the model appends `<<ESCALATE>>`, `<<INTENT:key>>`,
`<<LEAD ...>>`, `<<TICKET ...>>`; these are parsed and stripped before display.
Voice has a tag-safe streaming emitter so tags are never spoken.

### Escalation & notification ledger **[B] — the most intricate logic in the product**
Multiple emission paths (chat/voice finalize, the sweeper, the voice call-end
hook) coordinate through **atomic per-conversation DB claims** so an event is
never announced twice or missed:
- `escalated_at` is the latch (**not** `requires_human`, because after-hours sets
  that and would permanently suppress real escalations);
- `newEscalation` is **edge-triggered**;
- lead announcement uses an atomic `UPDATE … WHERE … IS NULL RETURNING` claim;
- emails are **consolidated**, not per-turn.

> **This is the highest-risk area in the codebase for a redesign to disturb.**
> The correctness lives in ordering and claim discipline, not in any UI.

### RAG pipeline **[B]**
Ingest → `normaliseExtractedText` → `chunkText` (**a blank line is a hard chunk
boundary; one block = one chunk**) → embed → store per branch.
Retrieval is **dual-query** (bare message + contextualised) merged and deduped.

**Two calibrated constants that do not transfer:**
- `MATCH_THRESHOLD = 0.30` — calibrated for `text-embedding-3-small`. The
  previous 0.6 was calibrated for ada-002 and would drop 11 of 16 legitimate
  queries under the current model.
- **Mixed embedding models fail silently** — both models are 1536-dimensional,
  so a mixed corpus returns plausible-looking scores while stale chunks sink out
  of reach. Presents exactly like "the agent forgot things".

### Other traced workflows
Auth (`/login` → `/redirect` → role-based landing, with `/first-login`
interception); onboarding (8-step wizard, ends in provisioning, not replayable);
knowledge upload (with post-upload structure advisory); channel connection;
conversation resolution (with optional resolution note); support ticket (manual
or agent-raised via `<<TICKET>>`); tenant-mode impersonation.

---

## 11. Roles & permissions

**[A] The six-role model is locked.** All six are referenced in the backend, so
it is genuinely implemented rather than aspirational.

### Permissions matrix — nav access **[C]**

| Area | super_admin | org_admin | branch_admin | branch_staff | org_viewer | branch_viewer |
|---|---|---|---|---|---|---|
| Overview | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Conversations | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Channels | ✓ | ✓ | ✓ | — | — | — |
| Knowledge | ✓ | ✓ | ✓ | — | — | — |
| Agent | ✓ | ✓ | ✓ | — | — | — |
| Analytics | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Billing | ✓ | ✓ | ✓ | — | — | — |
| Users | ✓ | ✓ | — | — | — | — |
| Settings | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Support | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/admin/*` | ✓ | — | — | — | — | — |

Unknown/null role falls back to the `branch_viewer` set.

### Gaps against the locked model **[C]**
1. **`branch_staff`, `org_viewer` and `branch_viewer` currently receive an
   identical nav set.** The locked model distinguishes *staff* (works the
   queue) from *viewer* (read-only), but no UI difference expresses it —
   viewers appear able to action conversations.
2. **Branch scoping is enforced in one place.** `getBranchIds()` is defined
   **inside `conversation.routes.ts`**, not a shared lib. It returns
   `[req.tenant.branch_id]` if set, **otherwise every branch in the org**. So a
   branch-scoped user whose `tenant_users.branch_id` is NULL silently receives
   org-wide data. Conversations is the only area with real branch enforcement.
3. **No org-admin branch management** (§7).

---

## 12. Data & API flow

**Canonical flow:** user action → component → TanStack Query hook →
`organisationApi`/`*Api` → Axios interceptor (**attaches token + tenant
headers**) → Express route (`authenticate` → role guard → validate) → service →
Supabase → `ApiResponse.success` → `data.data` unwrap → cache → UI.

### Where a redesign could accidentally break data flow

1. **The Axios interceptor is load-bearing.** All tenant scoping rides on
   headers it injects from `auth.store`. Any refactor of state management or
   the API layer must preserve `X-Tenant-Org-Id` / `X-Tenant-Branch-Id`.
2. **Tenant-scope pinning is a shared mechanism with two deliberately different
   behaviours** (§14). Changing one affects the other.
3. **[C] Query keys are inconsistent and have already caused a live bug.**
   `useBranches` → `['organisations', orgId, 'branches', tenantOrgId]`;
   `useAgentsByOrg` → `['agents', 'org', orgId]`. Invalidating a plausible-but-
   wrong key matched nothing, so a **successful save showed a success toast and
   left stale data on screen** — indistinguishable from a failed save. Fixed for
   two call sites; the underlying inconsistency remains.
4. **`match_documents` RPC returns only `id, content, metadata, similarity`** —
   no `source_url`. Attributing results by `source_url` silently mislabels
   everything. This produced one wrong measurement during this session.
5. **The response envelope is a hand-rolled contract**, not generated. There are
   no shared types in practice.

**[C] `shared/types/index.ts` (68 lines) is imported by neither frontend nor
backend — dead code.** CLAUDE.md's claim that "the frontend owns its API types"
is accurate; the directory is a misleading leftover.

---

## 13. Design system

**[C] A real token system exists** — 69 CSS custom properties in `index.css`,
mapped through `tailwind.config.ts`. This is better than typical and should be
built on, not replaced.

- **Typography:** three families — `display` (Cormorant Garamond, serif),
  `sans` (Inter), `mono` (JetBrains Mono). The serif display face is a genuine
  brand asset and a differentiator from generic SaaS.
- **Colour:** semantic tokens (`--background`, `--surface`, `--elevated`,
  `--card`, `--border`, `--primary` + `--primary-hover`, `--secondary`,
  `--accent`, `--destructive`, `--rose`, `--muted`, plus `--text-secondary` /
  `--text-tertiary`) and a full parallel `--sidebar-*` set. Light and dark
  defined.
- **Radius:** single `--radius` with `calc()` derivations.
- **Motion:** one custom easing token (`ease-nz`).

### The inconsistency that matters
**Two parallel styling systems coexist:** the token/shadcn system *and* a
hand-rolled `nz-*` utility layer (`.nz-card`, `.nz-input`, `.nz-textarea`,
`.nz-badge`, `.nz-stat`, `.nz-skeleton`, `.nz-mono`, `.nz-flash`). Pages mix
them freely — some inputs are `<input className="nz-input">`, others are the
shadcn `<Input>`. Same for cards and badges.

**Also present:** two toast systems (`sonner` + shadcn `use-toast`), both
mounted; several bespoke status-pill implementations; text colours frequently
written as raw `text-[hsl(var(--text-secondary))]` rather than a semantic
utility.

**Assessment:** the foundation is sound. The problem is **two vocabularies for
the same concepts**, which is what makes the surface feel assembled.

---

## 14. The Platform Assistant — intentional reuse **[B]**

**This is deliberate and technically sound. Do not classify it as duplication.**

- **What is shared:** the tenant `Agent`, `Knowledge` and `Conversations` page
  components, unchanged in content.
- **What is scoped:** they are pinned to the operator's own "Platform Support"
  branch under Ellice Systems.
- **How:** `PlatformAssistantScope` sets the same `tenantOrgId`/`tenantBranchId`
  pin that tenant-mode uses, then **restores the previous pin on unmount** so it
  cannot clobber a real tenant-mode session.
- **Deliberate difference from tenant-mode:** tenant-mode navigates to
  `/dashboard` and shows a "Viewing as" banner; the assistant routes stay under
  `/admin` where that banner is hard-gated off, so they read as a native
  operator section.
- **Data boundary:** Ellice Systems is excluded from client lists and
  cross-client analytics via `PLATFORM_ORG_ID`, so the operator's own org never
  appears as a client.
- **Permissions:** super-admin only, inherited from the `/admin` wrapper.

**Assessment: architecturally sound.** One cosmetic consequence: the assistant's
Agent page shows a tenant-style "Embed code" panel in an operator context.

---

## 15. States, responsive behaviour, accessibility

### States **[C]**
Well covered: loading skeletons, empty states, destructive confirmations
(typed-email for user deletion, two-step confirm for branches), saving/disabled
states, advisory (non-blocking) warnings.

Gaps:
- **No unsaved-changes protection anywhere.** Navigating away from a
  half-edited Agent page loses work silently.
- **No offline/network-failure state.** Errors surface as generic toasts.
- **No permission-denied state** — restricted areas are hidden from nav rather
  than explained.
- **[C] No React error boundary exists.** A render error blanks the app.

### Responsive
Breakpoints are Tailwind defaults; `2xl` at 1400px. Sidebar → drawer at `md`.
Tables hide columns progressively.
Weakest points: **dense tables on mobile**, the **conversation detail panel**
(designed for a wide split view), the **916-line Channels page** with long
credential forms, and **Recharts** charts in narrow columns.

### Accessibility
Positive: Radix primitives provide focus trapping, labelled dialogs and keyboard
semantics for free; icon buttons generally carry `aria-label`/`title`.
Concerns: **the amber advisory colour on muted text is likely below 4.5:1**
(unverified — needs measurement); several interactive elements are bare `<div>`
or `<button>` without roles; **no `prefers-reduced-motion` handling**; small
touch targets (`h-3.5 w-3.5` icons in `sm` buttons); the mobile drawer's
missing theme toggle is also an accessibility regression for low-vision users.

---

## 16. Analytics & observability

**[C] There is no product analytics provider.** No PostHog, Mixpanel, Segment,
Amplitude, GA or Plausible — verified by dependency and source search.
**No error tracking** (no Sentry). **No monitoring/APM.**

- The "Analytics" product area is **in-product business reporting for tenants**
  (conversation volume, conversion, escalation rate, intent breakdown) — not
  telemetry about product usage.
- Backend logging is Winston → **Console transport only**.
- `GET /api/version` is the one deliberate observability affordance.

**Consequence for the redesign:** there is **no baseline usage data**. Nobody
can currently answer "which pages do tenants actually use?" This should be
instrumented *before* large IA changes if those changes are to be evaluated.

---

## 17. Billing assessment

### What exists **[C]**
- A nav item and a 132-line `Billing.tsx`: a plan card, "Usage this cycle"
  (Conversations, Voice minutes), an "Implementation fee pending" note, and an
  "Upgrade plan" CTA.
- `organisations.plan` (trial/starter/pro/enterprise) — used for **display and
  operator editing only**.
- `STRIPE_*` env stubs. **[B] CLAUDE.md instructs these be ignored** — the
  intended providers are **Paystack or Flutterwave** (undecided), because Stripe
  is limited in Nigeria.

### What does not exist
No payment provider integration, no subscription state, no webhooks, no
invoices, no payment states, no upgrade/downgrade/cancellation flow, no plan
limits or enforcement, **and no usage metering**.

### The dependency chain — traced, and it is broken at the source
```
conversation/activity → usage tracking → usage_logs → billing calc
                        ^^^^^^^^^^^^^^   ^^^^^^^^^^
                        DOES NOT EXIST   EMPTY (0 rows)
```
**[C] Verified live:** `usage_logs` and `conversation_analysis` both exist, both
contain **0 rows**, and `grep` finds **zero references to either anywhere in
`backend/src`**. Nothing writes to them.

The Billing page's "Usage this cycle" figures are therefore **not** derived from
`usage_logs`.
**[F] Unknown:** what those displayed numbers are actually computed from —
worth confirming before anyone treats them as billable.

### To complete billing safely
1. **Instrument usage first.** Decide the billable unit (conversations? voice
   minutes? resolutions?) and write to `usage_logs` at the emission points.
   **This is the first task, not provider integration.**
2. Choose Paystack vs Flutterwave; use **hosted checkout only** — never handle
   card data.
3. Model subscription state per org, with webhook handling for payment events.
4. Define plans/limits, including **voice = premium tier** (voice costs
   ~$0.15–0.30/min all-in and must be covered by the tier).
5. Only then build the UI.

**Multi-branch interacts with billing** — the locked model treats >1 branch as a
plan lever, so branch limits are a billing concern too.

---

## 18. Technical debt

### P0 — dangerous
1. **No rate limiting on public, unauthenticated, LLM-cost-incurring
   endpoints.** `POST /api/widget/chat` and `POST /api/widget/ingest` are open
   to the internet and cost money per call. **A comment at
   `widget.routes.ts:130` states rate limiting is handled app-level; it is
   not** — `express-rate-limit` is installed but never imported. The misleading
   comment makes the gap less likely to be noticed.
2. **`POST /api/widget/ingest` unordered branch resolution** (§7) — writes
   knowledge to a nondeterministic branch on multi-branch orgs.
3. **No error boundary** — one render error blanks the application.

### P1 — before major redesign
4. **Inconsistent query keys** → silent stale-UI after successful writes (§12).
5. **Branch scoping enforced in one route file**, incomplete for NULL
   `branch_id` (§11).
6. **Effectively no test coverage** (1 example file) — a redesign of this size
   with no regression net is the single largest process risk.
7. **Two styling vocabularies + two toast systems** (§13).
8. **Oversized page components:** Channels 916, Settings 808, Agent 609,
   AdminOnboard 709, Users 470, Knowledge 451 lines. These are where redesign
   work will be slowest and riskiest.

### P2 — during redesign
9. Duplicated embed-code and label maps (partially consolidated already).
10. Settings mixing org and personal concerns.
11. `AdminOnboard` provisioning is a long imperative sequence with partial
    failure modes.
12. Mobile nav lacking theme toggle and role context.

### P3 — cleanup
13. `shared/types/index.ts` dead code; `stripe`/`twilio` unused dependencies;
    Lovable scaffold README; stale `schema.sql`.

---

## 19. UX audit — against the eight principles

- **Purpose** — Strong at the feature level. Weak at the surface level: Billing
  occupies prime navigation while doing nothing.
- **Agency** — Good in the agent config; weak in recovery (no unsaved-changes
  guard, no way back to `/admin` from `/dashboard`).
- **Familiarity** — Conventional patterns, well used. Radix gives solid
  behaviour.
- **Flexibility** — Strong for operators (tenant-mode, client detail); weak for
  tenants (no branch view, no timezone, no niche control).
- **Simplicity** — **The main gap.** Not too many features; the *mapping* is
  wrong (§9). Simplicity here means putting controls near what they affect, not
  removing pages.
- **Structure** — Two-group tenant nav is sound; operator nav is
  implementation-shaped ("Drafts", "Tenant mode" are internal mechanics
  presented as destinations).
- **Forgiveness** — Best-developed area: typed-email deletion, two-step
  confirms, non-destructive advisories, the niche-change dialog offering
  "change only" vs "change and replace". **This is a genuine craft strength.**
- **Craft** — Uneven. Real care in the destructive-action and advisory work;
  much less in spacing/typography consistency across pages.

---

## 20. "AI-generated feel" audit

### Structural signals (assessable from code — higher confidence)
1. **Feature-shaped grouping** — nav mirrors implementation modules, not user
   intent. The clearest tell.
2. **Every page is the same shape** — `PageHeader` + a stack of bordered
   `rounded-lg` cards. Uniform container regardless of content type; the page
   provides no hierarchy of its own.
3. **Card-per-concept reflex** — Channels renders three near-identical channel
   cards each containing a list plus a credential form; Overview wraps four
   numbers in four identical bordered boxes.
4. **Two vocabularies for one concept** (`nz-*` vs shadcn) — the signature of
   incremental assembly.
5. **Uniform section headers** — nearly every panel uses the same
   `text-xs uppercase tracking-[0.2em]` label, so nothing is emphasised because
   everything is.
6. **Lovable scaffold README** — confirms a generated starting point.

### Visual signals (**lower confidence — code-only inference; needs rendered review**)
7. Possible excess of bordered containers and rounded corners.
8. Badge density on list rows.
9. Generic microcopy in places ("Persona, voice, guardrails, and escalation").

**The underlying product problem is not decoration.** It is that **screens were
assembled feature-by-feature without a layout system that distinguishes
primary work from configuration from reference data.** Making it more minimal
would not fix that; giving pages an intentional information hierarchy would.

**Counter-note:** the serif display face, restrained palette and considered
destructive-action design are *not* generic. There is real design intent here to
build on.

---

## 21. What should be PRESERVED

Do not rewrite these:

1. **The shared `prepareTurn`/`finalizeTurn` architecture** — the reason three
   channels behave identically.
2. **All RAG boundaries and anti-fabrication rules** **[A]** — the product's
   core promise. Includes: only state facts explicit in context; mandatory
   disambiguation; no cross-unit blending; hand off rather than guess.
3. **The escalation/notification ledger discipline** — atomic claims,
   edge-triggering, consolidated email. Fragile and correct.
4. **Chunking policy** — blank line = hard boundary; one block = one chunk. A
   deliberate precision-over-efficiency trade with a documented failure it
   prevents.
5. **`MATCH_THRESHOLD` and the model-specific calibration discipline.**
6. **The Platform Assistant reuse pattern** **[B]** — intentional and sound.
7. **The six-role model** **[A]**.
8. **Destructive-action and advisory patterns** — the best UX craft in the app.
9. **The design tokens and the serif/sans/mono type system.**
10. **`GET /api/version`** and the deploy-verification discipline.
11. **`CLAUDE.md` itself and its maintenance rule.**

---

## 22. What should CHANGE

Ranked by value. Each: problem → evidence → recommendation → risk.

1. **Rate-limit public widget endpoints.** *Evidence:* no `express-rate-limit`
   usage; misleading comment. *Risk if unfixed:* unbounded LLM spend.
   *Complexity: Low.*
2. **Regroup IA by user intent** (§9). *Evidence:* agent configuration split
   across three pages; "theme" ambiguous. *Preserve:* every existing capability.
   *Complexity: High.*
3. **Give Billing an honest state.** Either remove from top-level nav until
   real, or present it explicitly as not-yet-available. *Complexity: Low.*
4. **Introduce the branch dimension** **[A]** — settle during IA, not after.
   *Complexity: High.*
5. **Unify the two styling vocabularies and pick one toast system.**
   *Complexity: Medium.*
6. **Add unsaved-changes protection and an error boundary.** *Complexity: Low.*
7. **Add a super-admin path back to `/admin`.** *Complexity: Low.*
8. **Differentiate staff vs viewer in the UI** to match the locked model.
   *Complexity: Medium.*
9. **Instrument usage** — prerequisite for billing *and* for evaluating the
   redesign. *Complexity: Medium.*
10. **Establish a regression net** before large refactors. *Complexity: Medium.*

---

## 23. Recommended information architecture (proposal, not a decision)

Principle: **group by the object the user is working on**, and put the branch
dimension in the shell rather than inside pages.

- **Shell:** organisation → **branch switcher** (new, required by [A]) → page.
- **Work** (daily): Conversations (primary), Overview/Insights.
- **The Agent** (one object, currently three pages): Behaviour (identity, tone,
  instructions, intents) · Knowledge · Channels & appearance · Test.
- **Organisation:** Branches (new) · Team · Billing · Organisation settings.
- **Personal:** profile, password, theme — separated from organisation settings.
- **Operator:** Clients (list → detail as the hub) · Onboarding (wizard +
  drafts merged) · Support queue · Platform Assistant (unchanged).

Renames worth considering: "Tenant mode" → "View as client"; "Drafts" folded
into Onboarding; tenant "Support" → "Help & support" to distinguish it from the
operator queue.

**Explicitly not recommended:** reducing page count for its own sake.

---

## 24. Recommended design direction

- **Hierarchy over uniformity.** Distinguish *work surfaces* (dense, functional
  — Conversations), *configuration surfaces* (calm, grouped, forgiving — Agent,
  Settings) and *reference surfaces* (scannable — Analytics). Today all three
  look identical.
- **Fewer container types, more typographic hierarchy.** Lean on the serif
  display face and weight/scale rather than adding borders to separate things.
- **Density is a feature** in the inbox; whitespace is not automatically
  premium.
- **One component vocabulary**, with tokens as the only source of colour and
  spacing.
- **Motion:** functional only (state transitions, focus), respecting
  `prefers-reduced-motion`.
- **Preserve the existing forgiveness patterns** and extend them (unsaved
  changes, undo where feasible).

---

## 25. Known risks & constraints

- **[B] CORS pins the dev origin to `http://localhost:8080`** — `:8090`/`:5173`
  are 403'd. `.claude/launch.json` sets `autoPort: false` for this reason.
- **[B] Service-role key bypasses RLS** — authorization is application code only.
- **[B] Changing `EMBEDDING_MODEL` is a platform-wide re-index in one
  maintenance window**, and invalidates `MATCH_THRESHOLD`.
- **[B] Prompt changes must be additive** — rewording existing rules has caused
  regressions.
- **[B] `conversations.notes` is `ConversationNote[]`, never a string** — writing
  a string crashed the panel once.
- **Widget `data-disable-capture`** — any embed without it auto-ingests the host
  page into the tenant's live KB. Has polluted a real KB more than once.
- **WhatsApp is untested live**; **Nigerian telephony for voice is unsolved**.
- **No test net; no analytics baseline; no error tracking.**

---

## 26. Unknowns — questions for the product owner

| # | Unknown | Why it matters | What would resolve it |
|---|---|---|---|
| 1 | What are Billing's "Usage this cycle" numbers computed from, given `usage_logs` is empty? | If they are illustrative, the page is misleading; if derived, there is undocumented logic. | Trace the component's data source with the owner. |
| 2 | What is the billable unit — conversations, resolutions, voice minutes, or seats? | Determines the entire metering design. | Product decision. |
| 3 | Paystack or Flutterwave? | Blocks billing architecture. | Product decision. |
| 4 | Is the staff/viewer distinction meant to be enforced in UI, or is API enforcement sufficient? | Affects role work and the permissions matrix. | Product decision against the locked model. |
| 5 | Is per-niche label editing per-tenant, or per-niche-template? | Different data models. | Clarify the original decision. |
| 6 | For subdomain routing — vanity domains per client, or `*.nizam.app` subdomains? | Very different DNS/auth/cookie work. | Clarify the original decision. |
| 7 | Should `INFORMATION-ARCHITECTURE.md` be committed? | It is currently invisible to collaborators. | Owner decision. |
| 8 | Who are the real users — is the buyer also the daily operator? | The IA assumes one persona per surface today. | User research. |
| 9 | Is `conversation_analysis` intended for analytics, QA, or the resolution-learning loop? | Affects whether it is instrumented or dropped. | Clarify intent. |
| 10 | Target devices — how much real mobile usage? | Determines how much mobile investment the redesign warrants. | Analytics (which do not yet exist) or owner knowledge. |

---

## 27. Recommended implementation sequence

Dependency-driven rather than the generic order:

1. **Safety first (P0):** rate limiting, error boundary, `/widget/ingest` branch
   fix. *Independent of design; do immediately.*
2. **Instrumentation:** basic analytics + error tracking + usage logging — so
   the redesign can be measured and billing is unblocked later.
3. **Regression net:** smoke tests over the agent turn, escalation ledger and
   RAG retrieval — the three areas where breakage is silent and expensive.
4. **IA decisions on paper**, including the branch dimension and role
   differentiation. *No code.*
5. **Design system consolidation** — one component vocabulary, one toast
   system. Enables everything downstream.
6. **Application shell + navigation** — implements the IA and branch switcher.
7. **Page-by-page**, in ascending risk: Overview → Analytics → Knowledge →
   Settings (split personal/org) → Users → Channels → Agent → Conversations.
   *Conversations last on the tenant side: it is the highest-traffic surface and
   touches the escalation ledger.*
8. **Multi-branch UX** once the shell supports it.
9. **Billing** once usage data exists.
10. **Responsive + accessibility pass**, then QA.

**Rationale for ordering:** steps 1–3 reduce the cost of every later mistake.
Step 5 before 6–7 prevents rebuilding components twice. Billing last because it
is blocked on step 2, not on design.

---

## 28. COMPLETE PROJECT BRIEF

**Product.** Nizam, by Ellice Systems — a multi-tenant AI customer-service and
lead-handling platform. Each tenant gets an AI agent that answers their
customers on web chat, WhatsApp and voice, using only that tenant's knowledge.

**Business purpose.** Capture and qualify leads that would otherwise be lost to
unanswered enquiries, without ever misleading a customer. Entry market: Nigerian
real estate.

**Users & roles.** Tenant businesses (six-role model, locked: `org_admin`,
`branch_admin`, `branch_staff`, `org_viewer`, `branch_viewer`, plus operator
`super_admin`); their customers, who only meet the agent; and the operator, who
onboards and supports tenants.

**Core workflows.** Onboard a client (8-step operator wizard) → upload knowledge
→ configure the agent → embed the widget / connect WhatsApp or voice → customers
converse → agent answers from RAG, captures leads, escalates honestly → team
works the inbox → analytics.

**Architecture.** React/Vite/TS on Vercel; Node/Express/TS on Railway; Supabase
(Postgres + pgvector). TanStack Query + Zustand; Axios interceptor carries auth
and tenant-scope headers. Backend uses the service-role key and **bypasses
RLS** — authorization is application code.

**The spine.** `chat()` and `chatStream()` share `prepareTurn()` and
`finalizeTurn()` so chat, WhatsApp and voice cannot drift. Escalation uses
atomic per-conversation DB claims. RAG treats a blank line as a hard chunk
boundary; `MATCH_THRESHOLD` and the embedding model are jointly calibrated and
fail *silently* if mismatched.

**Navigation.** Three surfaces (public, `/dashboard/*`, `/admin/*`). No orphan
routes. The real problem is mapping, not volume: agent configuration is split
across three pages, "theme" and "Support" each mean two different things, and
Billing holds a top-level slot while being a placeholder.

**Locked decisions.** Six-role model; RAG boundaries and anti-fabrication;
multi-branch with org-admin branch management; subdomain routing; per-niche
editable labels; Platform Assistant reuse.

**Known divergences.** Multi-branch is operator-only and single-branch in
practice; subdomain routing was never built (the `subdomain` column is stored
but nothing routes on it); per-niche labels were never built
(`defaultLabelsByIndustry` exists only inside the wizard).

**Billing.** Placeholder UI only. `usage_logs` and `conversation_analysis` are
empty and referenced nowhere — **there is no usage metering**, so billing is
blocked on instrumentation, not on a payment provider. Stripe stubs exist but
Paystack/Flutterwave is the intended direction (Nigeria).

**Analytics.** None. No product analytics, no error tracking, no APM. The
"Analytics" page is tenant-facing business reporting.

**Design system.** Genuine token system (69 CSS custom properties + Tailwind)
and a distinctive serif/sans/mono type stack — worth preserving. Undermined by
two parallel component vocabularies (`nz-*` and shadcn) and two toast systems.

**Testing.** One example test file. No regression net.

**Biggest risks.** Unrate-limited public LLM endpoints (live cost exposure);
first-branch assumptions (one unfixed, in `/widget/ingest`); branch
authorization enforced in a single route file; no tests.

**Redesign direction.** Not "more minimal" — *intentional*. Give pages a
hierarchy that distinguishes work surfaces from configuration surfaces from
reference surfaces; group controls next to what they affect; put the branch
dimension in the shell; unify the component vocabulary; preserve the
truthfulness architecture and the forgiveness patterns absolutely.

**Sequence.** Safety fixes → instrumentation → regression net → IA on paper →
design-system consolidation → shell/navigation → pages by ascending risk →
multi-branch → billing → responsive/a11y → QA.

---

*End of discovery report. No code, configuration, schema or product behaviour
was modified in producing it.*
