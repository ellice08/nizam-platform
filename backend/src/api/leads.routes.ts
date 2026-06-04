import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { notificationService } from '../services/notification.service.js';
import { ApiResponse } from '../utils/response.js';
import { AppError } from '../utils/errors.js';

const router = Router();

const sessionInviteSchema = z.object({
  to: z.string().email(),
  name: z.string().min(1),
  message: z.string().min(1),
  scheduling_link: z.string().url().optional().or(z.literal('')),
});

// POST /api/leads/session-invite — super admin only
router.post('/session-invite', authenticate, validate(sessionInviteSchema), async (req, res, next) => {
  try {
    if (req.tenant.role !== 'super_admin') {
      throw new AppError('Forbidden', 403);
    }
    const { to, name, message, scheduling_link } = req.body as {
      to: string; name: string; message: string; scheduling_link?: string;
    };
    const result = await notificationService.sendSessionInvite({
      to,
      name,
      message,
      schedulingLink: scheduling_link || undefined,
    });
    if (!result.success) {
      throw new AppError(result.error ?? 'Failed to send email', 500);
    }
    res.json(ApiResponse.success(result, 'Session invite sent'));
  } catch (err) {
    next(err);
  }
});

export default router;
