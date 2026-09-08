import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { supabase } from '../lib/supabase.js';
import { ApiResponse } from '../utils/response.js';
import { AppError } from '../utils/errors.js';

// onboarding_drafts previously went straight from the frontend to Supabase
// (anon key), with RLS enabled and ZERO policies — meaning every insert/
// select/update/delete against it was silently denied by Postgres's
// default-deny. The autosave feature and the AdminDrafts list have never
// actually persisted/loaded anything in production. Migrated onto Express
// (service_role, same super_admin gate as every other /admin/* route) so
// this table gets real access control from the one place the rest of the
// app already trusts, instead of a second RLS policy to maintain.
const router = express.Router();

function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.tenant.role !== 'super_admin') {
    res.status(403).json(ApiResponse.error('Insufficient permissions', 'Forbidden'));
    return;
  }
  next();
}

const createDraftSchema = z.object({
  step_completed: z.number().int().min(0).default(0),
  draft_data: z.record(z.string(), z.unknown()).default({}),
  status: z.string().default('in_progress'),
});

const updateDraftSchema = z.object({
  step_completed: z.number().int().min(0).optional(),
  draft_data: z.record(z.string(), z.unknown()).optional(),
  status: z.string().optional(),
  organisation_id: z.string().uuid().optional(),
  last_saved_at: z.string().optional(),
}).refine(data => Object.keys(data).length > 0, { message: 'No fields to update' });

// GET /api/onboarding-drafts — list in-progress drafts (AdminDrafts.tsx)
router.get('/', authenticate, requireSuperAdmin, async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { data, error } = await supabase
      .from('onboarding_drafts')
      .select('*')
      .eq('status', 'in_progress')
      .order('last_saved_at', { ascending: false });
    if (error) throw new AppError(error.message, 500);
    res.json(ApiResponse.success(data ?? []));
  } catch (err) { next(err); }
});

// GET /api/onboarding-drafts/:id — load one draft (resume flow)
router.get('/:id', authenticate, requireSuperAdmin, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { data, error } = await supabase
      .from('onboarding_drafts')
      .select('*')
      .eq('id', req.params['id'] as string)
      .maybeSingle();
    if (error) throw new AppError(error.message, 500);
    if (!data) throw new AppError('Draft not found', 404);
    res.json(ApiResponse.success(data));
  } catch (err) { next(err); }
});

// POST /api/onboarding-drafts — create (first autosave of a new wizard session)
router.post('/', authenticate, requireSuperAdmin, validate(createDraftSchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = req.body as { step_completed: number; draft_data: Record<string, unknown>; status: string };
    const { data, error } = await supabase
      .from('onboarding_drafts')
      .insert({
        step_completed: body.step_completed,
        draft_data: body.draft_data,
        status: body.status,
        last_saved_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw new AppError(error.message, 500);
    res.status(201).json(ApiResponse.success(data, 'Draft created'));
  } catch (err) { next(err); }
});

// PATCH /api/onboarding-drafts/:id — subsequent autosaves, and the
// wizard-completion update (status: 'complete', organisation_id set)
router.patch('/:id', authenticate, requireSuperAdmin, validate(updateDraftSchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const patch = req.body as Partial<{
      step_completed: number;
      draft_data: Record<string, unknown>;
      status: string;
      organisation_id: string;
      last_saved_at: string;
    }>;
    // Autosave always bumps last_saved_at unless the caller explicitly set one
    // (the wizard-completion call doesn't need to — it's not a "save").
    if (patch.status !== 'complete' && !patch.last_saved_at) {
      patch.last_saved_at = new Date().toISOString();
    }
    const { data, error } = await supabase
      .from('onboarding_drafts')
      .update(patch)
      .eq('id', req.params['id'] as string)
      .select()
      .maybeSingle();
    if (error) throw new AppError(error.message, 500);
    if (!data) throw new AppError('Draft not found', 404);
    res.json(ApiResponse.success(data, 'Draft updated'));
  } catch (err) { next(err); }
});

// DELETE /api/onboarding-drafts/:id
router.delete('/:id', authenticate, requireSuperAdmin, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { data, error } = await supabase
      .from('onboarding_drafts')
      .delete()
      .eq('id', req.params['id'] as string)
      .select()
      .maybeSingle();
    if (error) throw new AppError(error.message, 500);
    if (!data) throw new AppError('Draft not found', 404);
    res.json(ApiResponse.success(null, 'Draft deleted'));
  } catch (err) { next(err); }
});

export default router;
