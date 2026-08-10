import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { claudeService } from '../services/claude.service.js';
import { supabase } from '../lib/supabase.js';
import { ApiResponse } from '../utils/response.js';
import { AppError } from '../utils/errors.js';
import { randomUUID } from 'crypto';

const router = Router();

const chatSchema = z.object({
  message: z.string().min(1).max(2000),
  session_id: z.string().uuid().optional(),
  channel: z.enum(['chat', 'voice', 'whatsapp']).default('chat'),
  branch_id: z.string().uuid().optional(),
  lead_name: z.string().optional(),
  lead_phone: z.string().optional(),
});

// POST /api/chat
router.post('/', authenticate, validate(chatSchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { message, session_id, channel, branch_id, lead_name, lead_phone } =
      req.body as z.infer<typeof chatSchema>;

    const resolvedBranchId = branch_id ?? req.tenant.branch_id ?? undefined;

    if (!resolvedBranchId) {
      throw new AppError('branch_id is required', 400);
    }

    const sessionId = session_id ?? randomUUID();

    const resolvedLeadName = lead_name ??
      (channel === 'chat' ? 'Dashboard test' : null);

    const result = await claudeService.chat({
      branchId: resolvedBranchId,
      message,
      sessionId,
      channel: channel ?? 'chat',
      leadName: resolvedLeadName ?? undefined,
      leadPhone: lead_phone,
      // This route already ran through `authenticate` — req.user/req.tenant
      // are already verified, no need to re-resolve (see lib/optionalAuth.ts,
      // used instead by the public widget route). For ticket attribution only
      // (claudeService.raiseSupportTicket); harmless no-op for any agent
      // without a support_request intent, since the tag is never emitted.
      authenticatedUserId: req.user.id,
      authenticatedOrgId: req.tenant.organisation_id || undefined,
    });

    res.json(ApiResponse.success(result, 'Message processed'));
  } catch (err) {
    next(err);
  }
});

// GET /api/chat/session/:sessionId
router.get('/session/:sessionId', authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('call_id', req.params['sessionId'])
      .maybeSingle();

    if (error) throw new AppError(error.message, 500);
    if (!data) throw new AppError('Session not found', 404);

    res.json(ApiResponse.success(data));
  } catch (err) {
    next(err);
  }
});

export default router;
