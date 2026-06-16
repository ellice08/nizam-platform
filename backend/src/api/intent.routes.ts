import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { intentService } from '../services/intent.service.js';
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

async function verifyAgentAccess(agentId: string, req: Request): Promise<void> {
  const { data: agent } = await supabase
    .from('agents')
    .select('branch_id')
    .eq('id', agentId)
    .maybeSingle();
  if (!agent) throw new AppError('Agent not found', 404);

  const { data: branch } = await supabase
    .from('branches')
    .select('organisation_id')
    .eq('id', (agent as Record<string, unknown>)['branch_id'] as string)
    .maybeSingle();
  if (!branch) throw new AppError('Branch not found', 404);

  const isSuperAdmin = req.tenant.role === 'super_admin';
  const isOwnBranch = req.tenant.branch_id === (agent as Record<string, unknown>)['branch_id'];
  const isOwnOrg = req.tenant.organisation_id === (branch as Record<string, unknown>)['organisation_id'];
  if (!isSuperAdmin && !isOwnBranch && !isOwnOrg) {
    throw new AppError('Forbidden', 403);
  }
}

const intentFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  required: z.boolean().optional(),
});

const createIntentSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]+$/, 'key must be lowercase alphanumeric or underscore'),
  label: z.string().min(1),
  description: z.string().optional(),
  fields: z.array(intentFieldSchema).optional(),
  position: z.number().int().optional(),
  enabled: z.boolean().optional(),
});

const updateIntentSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]+$/, 'key must be lowercase alphanumeric or underscore').optional(),
  label: z.string().min(1).optional(),
  description: z.string().optional(),
  fields: z.array(intentFieldSchema).optional(),
  position: z.number().int().optional(),
  enabled: z.boolean().optional(),
});

// GET /api/agents/:agentId/intents
router.get('/agents/:agentId/intents', authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await verifyAgentAccess(req.params['agentId'] as string, req);
    const intents = await intentService.listByAgent(req.params['agentId'] as string);
    res.json(ApiResponse.success(intents));
  } catch (err) { next(err); }
});

// POST /api/agents/:agentId/intents
router.post('/agents/:agentId/intents', authenticate, requireOrgAdminOrAbove, validate(createIntentSchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await verifyAgentAccess(req.params['agentId'] as string, req);
    const intent = await intentService.create(req.params['agentId'] as string, req.body);
    res.status(201).json(ApiResponse.success(intent, 'Intent created'));
  } catch (err) { next(err); }
});

// PATCH /api/intents/:id
router.patch('/intents/:id', authenticate, requireOrgAdminOrAbove, validate(updateIntentSchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { data: intent } = await supabase
      .from('intents').select('agent_id').eq('id', req.params['id'] as string).maybeSingle();
    if (!intent) throw new AppError('Intent not found', 404);
    await verifyAgentAccess((intent as Record<string, unknown>)['agent_id'] as string, req);
    const updated = await intentService.update(req.params['id'] as string, req.body);
    res.json(ApiResponse.success(updated, 'Intent updated'));
  } catch (err) { next(err); }
});

// DELETE /api/intents/:id
router.delete('/intents/:id', authenticate, requireOrgAdminOrAbove, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { data: intent } = await supabase
      .from('intents').select('agent_id').eq('id', req.params['id'] as string).maybeSingle();
    if (!intent) throw new AppError('Intent not found', 404);
    await verifyAgentAccess((intent as Record<string, unknown>)['agent_id'] as string, req);
    await intentService.remove(req.params['id'] as string);
    res.json(ApiResponse.success({ ok: true }, 'Intent deleted'));
  } catch (err) { next(err); }
});

export default router;
