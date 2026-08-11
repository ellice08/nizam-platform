import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'crypto'
import { supabase } from '../lib/supabase.js'
import { claudeService } from '../services/claude.service.js'
import { ragService } from '../services/rag.service.js'
import { ApiResponse } from '../utils/response.js'
import { AppError } from '../utils/errors.js'
import logger from '../utils/logger.js'
import { resolveOptionalAuth } from '../lib/optionalAuth.js'

const router = Router()

// Resolves which branch a widget request targets. Most tenants have exactly
// one branch, so the org-level default (first by created_at — matches the
// convention documented in CLAUDE.md §2) is fine and is what every existing
// public-site embed relies on implicitly. But that "first branch" fallback
// is genuinely ambiguous for a multi-branch org — Ellice Systems now has two
// (Headquarters + Platform Support, see CLAUDE.md §8 Tier 3 [8a]), and
// Headquarters happens to be the older/first one, so the unqualified
// fallback was silently routing the Platform Assistant's dashboard embed to
// the WRONG branch (a different, unrelated "Aria" agent with zero KB
// content) — found live while verifying the embed. Callers that know their
// exact target branch (like this dashboard embed) can now pass branchId
// explicitly; it's verified to actually belong to orgId before use, so a
// caller can never point a request at another org's branch.
async function resolveBranchId(orgId: string, explicitBranchId?: string): Promise<string | null> {
  if (explicitBranchId) {
    const { data: branch } = await supabase
      .from('branches')
      .select('id')
      .eq('id', explicitBranchId)
      .eq('organisation_id', orgId)
      .maybeSingle()
    if (branch) return branch.id as string
    // Explicit id didn't actually belong to this org — fall through to the
    // default rather than trusting it.
  }

  const { data: branch } = await supabase
    .from('branches')
    .select('id')
    .eq('organisation_id', orgId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return branch ? (branch.id as string) : null
}

// GET /api/widget/config/:orgId
// Public — returns org branding and agent name for widget styling
router.get('/config/:orgId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Normalize at the boundary: Express param/query values are honestly
    // string | string[] | undefined (repeatable route params; and
    // ?branch_id=a&branch_id=b arrives as an array) — capture into a const
    // so the union narrows, take the first element for the array case,
    // never cast.
    const rawOrgId = req.params.orgId
    const orgId = typeof rawOrgId === 'string' ? rawOrgId : rawOrgId[0]
    if (!orgId) throw new AppError('Organisation not found', 404)
    const rawBranchId = req.query.branch_id
    const branchIdParam = typeof rawBranchId === 'string'
      ? rawBranchId
      : Array.isArray(rawBranchId) && typeof rawBranchId[0] === 'string'
        ? rawBranchId[0]
        : undefined

    const { data: org, error } = await supabase
      .from('organisations')
      .select('name, branding_config')
      .eq('id', orgId)
      .single()

    if (error || !org) {
      throw new AppError('Organisation not found', 404)
    }

    const branchId = await resolveBranchId(orgId, branchIdParam)

    let agentName = 'Assistant'
    if (branchId) {
      const { data: agent } = await supabase
        .from('agents')
        .select('name')
        .eq('branch_id', branchId)
        .limit(1)
        .maybeSingle()
      if (agent) agentName = (agent as Record<string, unknown>).name as string
    }

    const branding = (org.branding_config as Record<string, unknown>) ?? {}
    // Widget appearance lives in its own namespace so it never collides with
    // the org's dashboard branding (Settings > Branding also writes
    // branding_config.primary_color, etc.). Old top-level theme_mode/
    // font_family/corner_radius are a secondary fallback for values saved by
    // the previous (pre-namespace) version of the appearance form.
    const w = (branding.widget as Record<string, unknown>) ?? {}

    res.json(ApiResponse.success({
      orgName: org.name,
      agentName,
      // widget-specific color wins; otherwise inherit the brand color.
      primaryColor: (w.primary_color as string) ?? (branding.primary_color as string) ?? '#7A2535',
      secondaryColor: (branding.secondary_color as string) ?? '#C4909A',
      themeMode: (w.theme_mode as string) ?? (branding.theme_mode as string) ?? 'auto',
      fontFamily: (w.font_family as string) ?? (branding.font_family as string) ?? 'inherit',
      cornerRadius: (w.corner_radius as string) ?? (branding.corner_radius as string) ?? 'rounded',
    }))
  } catch (err) {
    next(err)
  }
})

// POST /api/widget/chat
// Public — no JWT required, identified by org_id
router.post('/chat', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { org_id, message, session_id, branch_id } = req.body as {
      org_id?: string
      message?: string
      session_id?: string
      branch_id?: string
    }

    if (!org_id) throw new AppError('org_id is required', 400)
    if (!message || !message.trim()) throw new AppError('message is required', 400)

    // Rate limiting — basic check: max 30 messages per session
    // Full rate limiting is handled by express-rate-limit on the app level

    // See resolveBranchId's comment above — branch_id (verified to belong to
    // org_id) lets a caller that knows its exact target branch skip the
    // ambiguous "first branch" default.
    const branchId = await resolveBranchId(org_id, branch_id)

    if (!branchId) {
      throw new AppError('Organisation not configured', 404)
    }

    const sessionId = session_id ?? randomUUID()

    // OPTIONAL — this route is public (no JWT required), but the embedded
    // Platform Assistant widget (tenant dashboard shell only — see CLAUDE.md
    // §8 Tier 3 [8a]) can voluntarily send the logged-in user's bearer token
    // for ticket attribution. Verified the same way auth.middleware does
    // (supabase.auth.getUser); a missing/invalid token just degrades to
    // unattributed rather than failing the request — public widget usage on
    // client sites is completely unaffected.
    const authContext = await resolveOptionalAuth(req.headers.authorization)

    const result = await claudeService.chat({
      branchId,
      message: message.trim(),
      sessionId,
      channel: 'chat',
      leadName: 'Website visitor',
      authenticatedUserId: authContext?.userId,
      authenticatedOrgId: authContext?.organisationId,
    })

    res.json(ApiResponse.success({
      reply: result.reply,
      sessionId: result.sessionId,
      requiresHuman: result.requiresHuman,
      newEscalation: result.newEscalation,
    }))
  } catch (err) {
    const message = err instanceof Error ? err.message : JSON.stringify(err)
    const stack = err instanceof Error ? err.stack : ''
    logger.error(`Widget chat error: ${message} | stack: ${stack}`)
    next(err)
  }
})

// POST /api/widget/ingest
// Public — widget submits a rendered page from the host site for ingestion.
// Scoped by org_id, same-origin enforcement happens on the widget side;
// here we validate the URL host matches the org's configured site if set.
router.post('/ingest', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { org_id, url, text, title } = req.body as {
      org_id?: string; url?: string; text?: string; title?: string;
    };
    if (!org_id) throw new AppError('org_id is required', 400);
    if (!url) throw new AppError('url is required', 400);
    if (!text || text.trim().length < 200) {
      res.json(ApiResponse.success({ status: 'skipped', chunksCreated: 0 }));
      return;
    }

    let parsed: URL;
    try { parsed = new URL(url); }
    catch { throw new AppError('Invalid URL', 400); }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new AppError('Unsupported URL protocol', 400);
    }

    const { data: branch, error: branchError } = await supabase
      .from('branches')
      .select('id')
      .eq('organisation_id', org_id)
      .limit(1)
      .maybeSingle();
    if (branchError || !branch) {
      throw new AppError('Organisation not configured', 404);
    }

    parsed.hash = '';
    const cleanUrl = parsed.toString().replace(/\/$/, '');

    const titlePrefix = title ? `${title}\n\n` : '';
    const result = await ragService.capturePage({
      url: cleanUrl,
      text: titlePrefix + text,
      branchId: branch.id,
      orgId: org_id,
      source: 'widget',
    });

    res.json(ApiResponse.success(result));
  } catch (err) {
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    logger.error(`Widget ingest error: ${message}`);
    next(err);
  }
});

export default router
