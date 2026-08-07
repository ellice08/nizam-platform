import express from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { conversationService } from '../services/conversation.service.js';
import { claudeService } from '../services/claude.service.js';
import { supabase } from '../lib/supabase.js';
import { ApiResponse } from '../utils/response.js';
import { AppError } from '../utils/errors.js';

const router = express.Router();

async function getBranchIds(req: Request): Promise<string[]> {
  if (req.tenant.branch_id) {
    return [req.tenant.branch_id];
  }
  const { data: branches } = await supabase
    .from('branches')
    .select('id')
    .eq('organisation_id', req.tenant.organisation_id);
  return (branches ?? []).map((b: Record<string, unknown>) => b.id as string);
}

const updateConversationSchema = z.object({
  resolved: z.boolean().optional(),
  requires_human: z.boolean().optional(),
  lead_name: z.string().optional(),
  callback_requested: z.boolean().optional(),
  callback_completed: z.boolean().optional(),
  notes: z.array(z.object({
    text: z.string(),
    added_by: z.string(),
    added_at: z.string(),
  })).optional(),
  sentiment: z.string().optional(),
});

// GET /api/conversations
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  const isSuperAdmin = req.tenant.role === 'super_admin';

  const filters = {
    channel: req.query['channel'] as string | undefined,
    resolved: req.query['resolved'] !== undefined ? req.query['resolved'] === 'true' : undefined,
    limit: req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : undefined,
    offset: req.query['offset'] ? parseInt(req.query['offset'] as string, 10) : undefined,
  };

  if (isSuperAdmin && req.query['branch_id']) {
    const conversations = await conversationService.getConversations(req.query['branch_id'] as string, filters);
    res.json(ApiResponse.success(conversations));
    return;
  }

  if (req.tenant.branch_id) {
    const conversations = await conversationService.getConversations(req.tenant.branch_id, filters);
    res.json(ApiResponse.success(conversations));
    return;
  }

  // Org-level user: get conversations for all branches in their organisation
  const branchIds = await getBranchIds(req);
  const conversations = await conversationService.getConversationsByBranches(branchIds, filters);
  res.json(ApiResponse.success(conversations));
});

// GET /api/conversations/needs-attention-count — for the Conversations nav
// badge. Must be registered before /:id so it isn't shadowed by that param
// route. Count-only query (no row data) since the badge only needs a number.
// A work-queue count, not a historical tally: actioned_by IS NULL excludes
// anything an operator has already touched via PATCH (note added, marked
// handled, resolved/un-resolved), so the badge self-clears. Known tradeoff —
// actioned_by is never reset, so a conversation that gets re-escalated after
// already being actioned once won't reappear in this count.
router.get('/needs-attention-count', authenticate, async (req: Request, res: Response): Promise<void> => {
  const branchIds = await getBranchIds(req);
  if (branchIds.length === 0) {
    res.json(ApiResponse.success({ count: 0 }));
    return;
  }

  const { count, error } = await supabase
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .in('branch_id', branchIds)
    .eq('requires_human', true)
    .eq('resolved', false)
    .is('actioned_by', null);

  if (error) throw new AppError(error.message, 500);
  res.json(ApiResponse.success({ count: count ?? 0 }));
});

// GET /api/conversations/:id
router.get('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  const branchIds = await getBranchIds(req);

  if (branchIds.length === 1 && branchIds[0]) {
    const conversation = await conversationService.getConversationById(req.params['id'] as string, branchIds[0]);
    res.json(ApiResponse.success(conversation));
    return;
  }

  const conversation = await conversationService.getConversationByIdForBranches(req.params['id'] as string, branchIds);
  res.json(ApiResponse.success(conversation));
});

// PATCH /api/conversations/:id
router.patch('/:id', authenticate, validate(updateConversationSchema), async (req: Request, res: Response): Promise<void> => {
  const branchIds = await getBranchIds(req);
  const updateData = {
    ...(req.body as Partial<{
      resolved: boolean;
      requires_human: boolean;
      lead_name: string;
      callback_requested: boolean;
      callback_completed: boolean;
      notes: Array<{ text: string; added_by: string; added_at: string }>;
      sentiment: string;
    }>),
    actioned_by: req.user.id,
    actioned_at: new Date().toISOString(),
  };

  if (branchIds.length === 1 && branchIds[0]) {
    const conversation = await conversationService.updateConversation(req.params['id'] as string, branchIds[0], updateData);
    if (updateData.resolved) void claudeService.summarizeConversation(req.params['id'] as string, { bypassCap: true });
    res.json(ApiResponse.success(conversation, 'Conversation updated'));
    return;
  }

  const conversation = await conversationService.updateConversationForBranches(req.params['id'] as string, branchIds, updateData);
  if (updateData.resolved) void claudeService.summarizeConversation(req.params['id'] as string, { bypassCap: true });
  res.json(ApiResponse.success(conversation, 'Conversation updated'));
});

export default router;
