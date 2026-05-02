import express from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { conversationService } from '../services/conversation.service.js';
import { ApiResponse } from '../utils/response.js';

const router = express.Router();

const updateConversationSchema = z.object({
  resolved: z.boolean().optional(),
  requires_human: z.boolean().optional(),
  lead_name: z.string().optional(),
});

// GET /api/conversations
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  const isSuperAdmin = req.tenant.role === 'super_admin';
  const tenantId = isSuperAdmin && req.query['tenant_id']
    ? (req.query['tenant_id'] as string)
    : req.tenant.tenant_id;

  const filters = {
    channel: req.query['channel'] as string | undefined,
    resolved: req.query['resolved'] !== undefined ? req.query['resolved'] === 'true' : undefined,
    limit: req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : undefined,
    offset: req.query['offset'] ? parseInt(req.query['offset'] as string, 10) : undefined,
  };

  const conversations = await conversationService.getConversations(tenantId, filters);
  res.json(ApiResponse.success(conversations));
});

// GET /api/conversations/:id
router.get('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  const conversation = await conversationService.getConversationById(
    req.params['id'] as string,
    req.tenant.tenant_id
  );
  res.json(ApiResponse.success(conversation));
});

// PATCH /api/conversations/:id
router.patch('/:id', authenticate, validate(updateConversationSchema), async (req: Request, res: Response): Promise<void> => {
  const conversation = await conversationService.updateConversation(
    req.params['id'] as string,
    req.tenant.tenant_id,
    req.body as Partial<{ resolved: boolean; requires_human: boolean; lead_name: string }>
  );
  res.json(ApiResponse.success(conversation, 'Conversation updated'));
});

export default router;
