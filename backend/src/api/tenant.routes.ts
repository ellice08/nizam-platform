import express from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { tenantService } from '../services/tenant.service.js';
import { ApiResponse } from '../utils/response.js';

const router = express.Router();

const createTenantSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).refine((v) => /^[a-z0-9-]+$/.test(v), {
    message: 'Slug must only contain lowercase letters, numbers, and hyphens',
  }),
  plan: z.enum(['trial', 'starter', 'pro', 'enterprise']).default('trial'),
});

const updateTenantSchema = z.object({
  name: z.string().optional(),
  plan: z.enum(['trial', 'starter', 'pro', 'enterprise']).optional(),
  retell_agent_id: z.string().optional(),
  twilio_phone: z.string().optional(),
});

// GET /api/tenants
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  if (req.tenant.role !== 'super_admin') {
    res.status(403).json(ApiResponse.error('Insufficient permissions', 'Forbidden'));
    return;
  }
  const tenants = await tenantService.getAllTenants();
  res.json(ApiResponse.success(tenants));
});

// POST /api/tenants
router.post('/', authenticate, validate(createTenantSchema), async (req: Request, res: Response): Promise<void> => {
  if (req.tenant.role !== 'super_admin') {
    res.status(403).json(ApiResponse.error('Insufficient permissions', 'Forbidden'));
    return;
  }
  const tenant = await tenantService.createTenant(req.body as { name: string; slug: string; plan: string });
  res.status(201).json(ApiResponse.success(tenant, 'Tenant created'));
});

// GET /api/tenants/:id
router.get('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  const isSuperAdmin = req.tenant.role === 'super_admin';
  const isOwnTenant = req.tenant.tenant_id === req.params['id'];
  if (!isSuperAdmin && !isOwnTenant) {
    res.status(403).json(ApiResponse.error('Insufficient permissions', 'Forbidden'));
    return;
  }
  const tenant = await tenantService.getTenantById(req.params['id'] as string);
  res.json(ApiResponse.success(tenant));
});

// PATCH /api/tenants/:id
router.patch('/:id', authenticate, validate(updateTenantSchema), async (req: Request, res: Response): Promise<void> => {
  if (req.tenant.role !== 'super_admin') {
    res.status(403).json(ApiResponse.error('Insufficient permissions', 'Forbidden'));
    return;
  }
  const tenant = await tenantService.updateTenant(req.params['id'] as string, req.body as Partial<{ name: string; plan: string; retell_agent_id: string; twilio_phone: string }>);
  res.json(ApiResponse.success(tenant, 'Tenant updated'));
});

// GET /api/tenants/:id/stats
router.get('/:id/stats', authenticate, async (req: Request, res: Response): Promise<void> => {
  const isSuperAdmin = req.tenant.role === 'super_admin';
  const isOwnTenant = req.tenant.tenant_id === req.params['id'];
  if (!isSuperAdmin && !isOwnTenant) {
    res.status(403).json(ApiResponse.error('Insufficient permissions', 'Forbidden'));
    return;
  }
  const stats = await tenantService.getTenantStats(req.params['id'] as string);
  res.json(ApiResponse.success(stats));
});

export default router;
