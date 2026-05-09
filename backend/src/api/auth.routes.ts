import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { authService } from '../services/auth.service.js';
import { organisationService } from '../services/organisation.service.js';
import { ApiResponse } from '../utils/response.js';
import { AppError } from '../utils/errors.js';

const router = Router();

const inviteSchema = z.object({
  email: z.string().email(),
  organisation_id: z.string().uuid(),
  role: z.enum(['org_admin', 'branch_admin', 'branch_staff', 'viewer']).optional(),
});

// POST /api/auth/invite
// Super admin only — create a Supabase Auth user, link to org, send welcome email
router.post(
  '/invite',
  authenticate,
  validate(inviteSchema),
  async (req, res, next) => {
    try {
      if (req.tenant.role !== 'super_admin') {
        throw new AppError('Forbidden', 403);
      }

      const { email, organisation_id, role = 'org_admin' } = req.body as {
        email: string;
        organisation_id: string;
        role?: string;
      };

      const org = await organisationService.getOrganisationById(organisation_id) as unknown as { name: string };

      const result = await authService.inviteClient({
        email,
        organisationId: organisation_id,
        organisationName: org.name,
        role,
      });

      res.status(201).json(ApiResponse.success(result, 'Client invited successfully'));
    } catch (err) {
      next(err);
    }
  },
);

export default router;
