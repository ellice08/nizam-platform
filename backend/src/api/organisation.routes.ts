import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { organisationService } from '../services/organisation.service.js';
import { branchService } from '../services/branch.service.js';
import { ApiResponse } from '../utils/response.js';

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

const updateOrganisationSchema = z.object({
  name: z.string().optional(),
  industry: z.string().optional(),
  plan: z.string().optional(),
  subdomain: z.string().optional(),
  branding_config: z.unknown().optional(),
});

const createBranchSchema = z.object({
  name: z.string().min(1),
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

// POST /api/organisations/:id/branches
router.post('/:id/branches', authenticate, requireSuperAdmin, validate(createBranchSchema), async (req: Request, res: Response): Promise<void> => {
  const branch = await branchService.createBranch(
    req.params['id'] as string,
    req.body as { name: string; location?: string; timezone?: string }
  );
  res.status(201).json(ApiResponse.success(branch, 'Branch created'));
});

export default router;
