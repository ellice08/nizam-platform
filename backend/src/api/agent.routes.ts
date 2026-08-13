import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { agentService } from '../services/agent.service.js';
import { ApiResponse } from '../utils/response.js';
import { AppError } from '../utils/errors.js';
import { supabase } from '../lib/supabase.js';

const router = express.Router();

function requireOrgAdminOrAbove(req: Request, res: Response, next: NextFunction): void {
  const adminRoles = ['super_admin', 'org_admin', 'branch_admin'];
  if (!adminRoles.includes(req.tenant.role)) {
    res.status(403).json(ApiResponse.error('Insufficient permissions', 'Forbidden'));
    return;
  }
  next();
}

const createAgentSchema = z.object({
  name: z.string().min(1).optional(),
  niche: z.string().optional(),
  tone: z.string().optional(),
  system_prompt: z.string().optional(),
});

const updateAgentSchema = z.object({
  name: z.string().min(1).optional(),
  niche: z.string().optional(),
  tone: z.string().optional(),
  language: z.string().optional(),
  system_prompt: z.string().optional(),
  channels: z.array(z.string()).optional(),
  escalation_contacts: z.array(z.unknown()).optional(),
  response_time_config: z.unknown().optional(),
  retell_agent_id: z.string().optional(),
});

// GET /api/agents/branch/:branchId
router.get('/branch/:branchId', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { branchId } = req.params;
  const isSuperAdmin = req.tenant.role === 'super_admin';
  const isOwnBranch = req.tenant.branch_id === branchId;
  if (!isSuperAdmin && !isOwnBranch) {
    res.status(403).json(ApiResponse.error('Insufficient permissions', 'Forbidden'));
    return;
  }
  const agent = await agentService.getAgentByBranch(branchId as string);
  res.json(ApiResponse.success(agent));
});

// GET /api/agents/org/:orgId
router.get('/org/:orgId', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { orgId } = req.params;
  const isSuperAdmin = req.tenant.role === 'super_admin';
  const isOwnOrg = req.tenant.organisation_id === orgId;
  if (!isSuperAdmin && !isOwnOrg) {
    res.status(403).json(ApiResponse.error('Insufficient permissions', 'Forbidden'));
    return;
  }
  const agents = await agentService.getAgentsByOrg(orgId as string);
  res.json(ApiResponse.success(agents));
});

// POST /api/agents/branch/:branchId
router.post('/branch/:branchId', authenticate, requireOrgAdminOrAbove, validate(createAgentSchema), async (req: Request, res: Response): Promise<void> => {
  const { branchId } = req.params;
  const agent = await agentService.createAgent(
    branchId as string,
    req.body as { name?: string; niche?: string; tone?: string; system_prompt?: string }
  );
  res.status(201).json(ApiResponse.success(agent, 'Agent created'));
});

// GET /api/agents/:agentId/default-prompt
// Returns the default instruction text for this agent, so the Agent page's
// "Load default instructions" button gives the client a working prompt to edit
// instead of a blank textarea.
//
// "Default" resolves to the niche template the agent was created from
// (agent.service.ts does the same lookup at creation), with {{agent_name}} /
// {{company_name}} substituted. If the agent has no niche, or no template
// exists for it, we return the generic persona line the runtime falls back to.
//
// Contains no secrets — niche templates are prompt copy, and the guardrails
// that wrap every prompt (RAG rules, control tags) are deliberately NOT
// included: they always apply regardless of this field, so shipping them here
// would imply the client is responsible for maintaining them.
router.get('/:agentId/default-prompt', authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { agentId } = req.params;

    const { data: agent } = await supabase
      .from('agents')
      .select('id, name, niche, branch_id, branches(organisation_id)')
      .eq('id', agentId as string)
      .maybeSingle();

    if (!agent) throw new AppError('Agent not found', 404);

    // Ownership — same shape as the org check above: super-admin bypasses,
    // otherwise the agent's org must match the caller's.
    const agentRow = agent as Record<string, unknown>;
    const branch = agentRow['branches'] as { organisation_id?: string } | null;
    const agentOrgId = branch?.organisation_id;
    const isSuperAdmin = req.tenant.role === 'super_admin';
    if (!isSuperAdmin && agentOrgId !== req.tenant.organisation_id) {
      res.status(403).json(ApiResponse.error('Insufficient permissions', 'Forbidden'));
      return;
    }

    const agentName = (agentRow['name'] as string) ?? 'Aria';
    // ?niche= lets the client-detail niche editor PREVIEW the template it is
    // about to switch to, before anything is written. Absent, we resolve the
    // agent's current niche (the "Load default instructions" case).
    const rawNiche = req.query['niche'];
    const nicheOverride = typeof rawNiche === 'string' ? rawNiche : undefined;
    const niche = nicheOverride ?? (agentRow['niche'] as string | null);

    let orgName = 'your company';
    if (agentOrgId) {
      const { data: org } = await supabase
        .from('organisations').select('name').eq('id', agentOrgId).maybeSingle();
      orgName = ((org as { name?: string } | null)?.name) ?? orgName;
    }

    let prompt: string | null = null;
    if (niche) {
      const { data: template } = await supabase
        .from('niche_templates')
        .select('system_prompt_template')
        .eq('niche', niche)
        .maybeSingle();
      const raw = (template as { system_prompt_template?: string } | null)?.system_prompt_template;
      if (raw) {
        prompt = raw
          .replace(/\{\{agent_name\}\}/g, agentName)
          .replace(/\{\{company_name\}\}/g, orgName);
      }
    }

    const source = prompt ? 'niche_template' : 'generic';
    if (!prompt) prompt = `You are ${agentName}, a warm and helpful assistant.`;

    res.json(ApiResponse.success({ prompt, source, niche: niche ?? null }));
  } catch (err) {
    next(err);
  }
});

// PATCH /api/agents/:agentId
router.patch('/:agentId', authenticate, requireOrgAdminOrAbove, validate(updateAgentSchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { agentId } = req.params;
    const agent = await agentService.updateAgent(agentId as string, req.body);
    res.json(ApiResponse.success(agent, 'Agent updated'));
  } catch (err) {
    next(err);
  }
});

export default router;
