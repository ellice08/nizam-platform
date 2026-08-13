import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { organisationService } from '../services/organisation.service.js';
import { branchService } from '../services/branch.service.js';
import { supabase } from '../lib/supabase.js';
import { notificationService } from '../services/notification.service.js';
import { ApiResponse } from '../utils/response.js';
import { AppError } from '../utils/errors.js';
import { intentService } from '../services/intent.service.js';

const router = express.Router();

function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.tenant.role !== 'super_admin') {
    res.status(403).json(ApiResponse.error('Insufficient permissions', 'Forbidden'));
    return;
  }
  next();
}

const createOrganisationSchema = z.object({
  name: z.string().min(2),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Slug must only contain lowercase letters, numbers, and hyphens'),
  industry: z.string().optional(),
  plan: z.string().optional(),
});

// Known branding_config keys get explicit validation (theme_mode/corner_radius
// as strict enums so a bad value 400s instead of silently landing in the DB);
// .passthrough() keeps other/future keys (logo_url, colors, etc.) accepted
// as-is, matching the previously fully-permissive behavior for those.
const brandingConfigSchema = z.object({
  logo_url: z.string().nullable().optional(),
  logo_dark_url: z.string().nullable().optional(),
  primary_color: z.string().optional(),
  primary_hover_color: z.string().optional(),
  secondary_color: z.string().optional(),
  accent_color: z.string().optional(),
  background_color: z.string().optional(),
  font: z.string().optional(),
  theme_mode: z.enum(['light', 'dark', 'auto']).optional(),
  font_family: z.string().optional(),
  corner_radius: z.enum(['sharp', 'rounded', 'pill']).optional(),
}).passthrough();

const updateOrganisationSchema = z.object({
  name: z.string().optional(),
  industry: z.string().optional(),
  plan: z.string().optional(),
  subdomain: z.string().optional(),
  branding_config: brandingConfigSchema.optional(),
});

const createBranchSchema = z.object({
  name: z.string().min(1),
  location: z.string().optional(),
  timezone: z.string().optional(),
});

const updateBranchSchema = z.object({
  name: z.string().min(1).optional(),
  location: z.string().optional(),
  timezone: z.string().optional(),
});

// GET /api/organisations
router.get('/', authenticate, requireSuperAdmin, async (_req: Request, res: Response): Promise<void> => {
  const organisations = await organisationService.getAllOrganisations();
  res.json(ApiResponse.success(organisations));
});

// POST /api/organisations
router.post('/', authenticate, requireSuperAdmin, validate(createOrganisationSchema), async (req: Request, res: Response): Promise<void> => {
  const org = await organisationService.createOrganisation(
    req.body as { name: string; slug: string; industry?: string; plan?: string }
  );
  const orgRecord = org as Record<string, unknown>;
  void notificationService.createNotification({
    organisationId: orgRecord['id'] as string,
    audience: 'operator',
    type: 'system', title: 'New client onboarded',
    body: orgRecord['name'] as string,
    link: '/admin/clients',
    entityType: 'organisation', entityId: orgRecord['id'] as string, minRole: null,
  });
  res.status(201).json(ApiResponse.success(org, 'Organisation created'));
});

// GET /api/organisations/:id
router.get('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  const isSuperAdmin = req.tenant.role === 'super_admin';
  const isOwnOrg = req.tenant.organisation_id === req.params['id'];
  if (!isSuperAdmin && !isOwnOrg) {
    res.status(403).json(ApiResponse.error('Insufficient permissions', 'Forbidden'));
    return;
  }
  const org = await organisationService.getOrganisationById(req.params['id'] as string);
  res.json(ApiResponse.success(org));
});

// PATCH /api/organisations/:id
router.patch('/:id', authenticate, validate(updateOrganisationSchema), async (req: Request, res: Response): Promise<void> => {
  const isSuperAdmin = req.tenant.role === 'super_admin'
  const isOwnOrgAdmin = req.tenant.role === 'org_admin' &&
    req.tenant.organisation_id === req.params['id']

  if (!isSuperAdmin && !isOwnOrgAdmin) {
    res.status(403).json(ApiResponse.error('Insufficient permissions', 'Forbidden'))
    return
  }

  // org_admin can only update name, industry, branding_config
  // not plan, subdomain (super_admin only fields)
  if (!isSuperAdmin) {
    const body = req.body as Record<string, unknown>
    delete body.plan
    delete body.subdomain
  }

  const org = await organisationService.updateOrganisation(
    req.params['id'] as string,
    req.body as Partial<{ name: string; industry: string; plan: string; subdomain: string; branding_config: unknown }>
  );
  res.json(ApiResponse.success(org, 'Organisation updated'));
});

// DELETE /api/organisations/:id
router.delete('/:id', authenticate, requireSuperAdmin, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await organisationService.deleteOrganisation(req.params['id'] as string);
    res.json(ApiResponse.success(result, 'Organisation deleted'));
  } catch (err) {
    next(err);
  }
});

// GET /api/organisations/:id/stats
router.get('/:id/stats', authenticate, async (req: Request, res: Response): Promise<void> => {
  const isSuperAdmin = req.tenant.role === 'super_admin';
  const isOwnOrg = req.tenant.organisation_id === req.params['id'];
  if (!isSuperAdmin && !isOwnOrg) {
    res.status(403).json(ApiResponse.error('Insufficient permissions', 'Forbidden'));
    return;
  }
  const stats = await organisationService.getOrganisationStats(req.params['id'] as string);
  res.json(ApiResponse.success(stats));
});

// GET /api/organisations/:id/branches
router.get('/:id/branches', authenticate, async (req: Request, res: Response): Promise<void> => {
  const isSuperAdmin = req.tenant.role === 'super_admin';
  const isOwnOrg = req.tenant.organisation_id === req.params['id'];
  if (!isSuperAdmin && !isOwnOrg) {
    res.status(403).json(ApiResponse.error('Insufficient permissions', 'Forbidden'));
    return;
  }
  const branches = await branchService.getBranchesByOrg(req.params['id'] as string);
  res.json(ApiResponse.success(branches));
});

// GET /api/organisations/:id/intents
router.get('/:id/intents', authenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const isSuperAdmin = req.tenant.role === 'super_admin';
    const isOwnOrg = req.tenant.organisation_id === req.params['id'];
    if (!isSuperAdmin && !isOwnOrg) {
      res.status(403).json(ApiResponse.error('Insufficient permissions', 'Forbidden'));
      return;
    }
    const intents = await intentService.listByOrg(req.params['id'] as string);
    res.json(ApiResponse.success(intents));
  } catch (err) { next(err); }
});

// POST /api/organisations/:id/branches
router.post('/:id/branches', authenticate, requireSuperAdmin, validate(createBranchSchema), async (req: Request, res: Response): Promise<void> => {
  const branch = await branchService.createBranch(
    req.params['id'] as string,
    req.body as { name: string; location?: string; timezone?: string }
  );
  res.status(201).json(ApiResponse.success(branch, 'Branch created'));
});

// PATCH /api/organisations/:id/branches/:branchId
// Post-onboarding branch editing. Timezone in particular was previously set
// once in the wizard (Step 3) and editable nowhere afterwards, even though
// after-hours/business-hours behaviour depends on it.
router.patch('/:id/branches/:branchId', authenticate, requireSuperAdmin, validate(updateBranchSchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const branch = await branchService.updateBranch(
      req.params['branchId'] as string,
      req.params['id'] as string,
      req.body as Partial<{ name: string; location: string; timezone: string }>,
    );
    res.json(ApiResponse.success(branch, 'Branch updated'));
  } catch (err) { next(err); }
});

// DELETE /api/organisations/:id/branches/:branchId
// Refuses to remove the last branch: org-level routing falls back to the first
// branch by created_at (CLAUDE.md §2), so an org with zero branches would have
// no agent, no knowledge scope and no widget target.
router.delete('/:id/branches/:branchId', authenticate, requireSuperAdmin, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.params['id'] as string;
    const branchId = req.params['branchId'] as string;

    const branches = await branchService.getBranchesByOrg(orgId);
    if (!branches.some((b: Record<string, unknown>) => b['id'] === branchId)) {
      throw new AppError('Branch not found', 404);
    }
    if (branches.length <= 1) {
      throw new AppError('Cannot remove the only branch — an organisation must keep at least one.', 400);
    }

    const { error } = await supabase
      .from('branches')
      .delete()
      .eq('id', branchId)
      .eq('organisation_id', orgId);
    if (error) throw new AppError(error.message, 500);

    res.json(ApiResponse.success({ deleted: true }, 'Branch removed'));
  } catch (err) { next(err); }
});

export default router;
