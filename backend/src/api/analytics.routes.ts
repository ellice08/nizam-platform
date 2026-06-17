import express from 'express';
import type { Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { analyticsService } from '../services/analytics.service.js';
import { ApiResponse } from '../utils/response.js';

const router = express.Router();

function parseRange(query: Record<string, unknown>) {
  const from = typeof query['from'] === 'string' ? query['from'] : undefined;
  const to = typeof query['to'] === 'string' ? query['to'] : undefined;
  return { from, to };
}

function isCrossClient(req: Request): boolean {
  const { role, organisation_id } = req.tenant;
  return role === 'super_admin' && (!organisation_id || organisation_id.length === 0);
}

// GET /api/analytics/overview
router.get('/overview', authenticate, async (req: Request, res: Response): Promise<void> => {
  const range = parseRange(req.query as Record<string, unknown>);

  if (isCrossClient(req)) {
    const data = await analyticsService.getCrossClientOverview(range);
    res.json(ApiResponse.success(data));
    return;
  }

  const branchIds = await analyticsService.resolveBranchIds(req.tenant.organisation_id);
  const data = await analyticsService.getOverview(branchIds, range);
  res.json(ApiResponse.success(data));
});

// GET /api/analytics/volume
router.get('/volume', authenticate, async (req: Request, res: Response): Promise<void> => {
  const range = parseRange(req.query as Record<string, unknown>);

  let branchIds: string[];
  if (isCrossClient(req)) {
    branchIds = await analyticsService.getAllBranchIds();
  } else {
    branchIds = await analyticsService.resolveBranchIds(req.tenant.organisation_id);
  }

  const data = await analyticsService.getVolume(branchIds, range);
  res.json(ApiResponse.success(data));
});

export default router;
