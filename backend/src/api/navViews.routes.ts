import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { supabase } from '../lib/supabase.js';
import { ApiResponse } from '../utils/response.js';
import { AppError } from '../utils/errors.js';

const router = Router();

const SECTIONS = ['conversations', 'support'] as const;

const markViewedSchema = z.object({
  section: z.enum(SECTIONS),
});

// POST /api/nav-views/mark-viewed — records that the acting user just opened
// a nav section, so its badge count (conversations needs-attention, support
// open-tickets) resets to only what's changed since. See lib/navViews.ts.
router.post('/mark-viewed', authenticate, validate(markViewedSchema), async (req, res, next) => {
  try {
    const { section } = req.body as { section: typeof SECTIONS[number] };

    const { error } = await supabase
      .from('user_section_views')
      .upsert(
        { user_id: req.user.id, section, last_viewed_at: new Date().toISOString() },
        { onConflict: 'user_id,section' }
      );

    if (error) throw new AppError(error.message, 500);
    res.json(ApiResponse.success({ ok: true }));
  } catch (err) { next(err); }
});

export default router;
