import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { agentService } from '../services/agent.service.js';
import { ApiResponse } from '../utils/response.js';

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
