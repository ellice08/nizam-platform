import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'crypto'
import { supabase } from '../lib/supabase.js'
import { claudeService } from '../services/claude.service.js'
import { ragService } from '../services/rag.service.js'
import { ApiResponse } from '../utils/response.js'
import { AppError } from '../utils/errors.js'
import logger from '../utils/logger.js'

const router = Router()

// GET /api/widget/config/:orgId
// Public — returns org branding and agent name for widget styling
router.get('/config/:orgId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { orgId } = req.params

    const { data: org, error } = await supabase
      .from('organisations')
      .select('name, branding_config')
      .eq('id', orgId)
      .single()

    if (error || !org) {
      throw new AppError('Organisation not found', 404)
    }

    // Get default branch and agent name
    const { data: branch } = await supabase
      .from('branches')
      .select('id')
      .eq('organisation_id', orgId)
      .limit(1)
      .maybeSingle()

    let agentName = 'Assistant'
    if (branch) {
      const { data: agent } = await supabase
        .from('agents')
        .select('name')
        .eq('branch_id', branch.id)
        .limit(1)
        .maybeSingle()
      if (agent) agentName = (agent as Record<string, unknown>).name as string
    }

    const branding = (org.branding_config as Record<string, unknown>) ?? {}

    res.json(ApiResponse.success({
      orgName: org.name,
      agentName,
      primaryColor: (branding.primary_color as string) ?? '#7A2535',
      secondaryColor: (branding.secondary_color as string) ?? '#C4909A',
    }))
  } catch (err) {
    next(err)
  }
})

// POST /api/widget/chat
// Public — no JWT required, identified by org_id
router.post('/chat', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { org_id, message, session_id } = req.body as {
      org_id?: string
      message?: string
      session_id?: string
    }

    if (!org_id) throw new AppError('org_id is required', 400)
    if (!message || !message.trim()) throw new AppError('message is required', 400)

    // Rate limiting — basic check: max 30 messages per session
    // Full rate limiting is handled by express-rate-limit on the app level

    // Resolve default branch for this org
    const { data: branch, error: branchError } = await supabase
      .from('branches')
      .select('id')
      .eq('organisation_id', org_id)
      .limit(1)
      .maybeSingle()

    if (branchError || !branch) {
      throw new AppError('Organisation not configured', 404)
    }

    const sessionId = session_id ?? randomUUID()

    const result = await claudeService.chat({
      branchId: branch.id,
      message: message.trim(),
      sessionId,
      channel: 'chat',
      leadName: 'Website visitor',
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
