// NOTE: When billing is implemented, billing events (invoice generated, payment failed,
// plan changed, etc.) should emit createNotification({ audience: 'operator', type: 'billing', ... })
// so they surface in the operator bell. No billing code path exists yet.

import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { supabase } from '../lib/supabase.js';
import { ApiResponse } from '../utils/response.js';
import { AppError } from '../utils/errors.js';

const router = Router();

const ROLE_RANK: Record<string, number> = {
  super_admin: 5,
  org_admin: 4,
  branch_admin: 3,
  branch_staff: 2,
  org_viewer: 1,
  branch_viewer: 1,
};

type Tenant = { role: string; organisation_id: string; branch_id: string | null };

// Single source of truth for "can this tenant see this notification".
// Audience-aware: 'operator' rows are only visible to super_admin in normal mode;
// 'tenant' rows are only visible to tenant users (or super_admin in tenant mode).
function isVisibleTo(n: Record<string, unknown>, tenant: Tenant): boolean {
  const audience = (n['audience'] as string) ?? 'tenant';

  if (tenant.role === 'super_admin') {
    const activeOrg = tenant.organisation_id;
    if (activeOrg && activeOrg.length > 0) {
      // Tenant mode (X-Tenant-Org-Id set): act as that tenant — only tenant-audience rows for that org.
      return audience === 'tenant' && n['organisation_id'] === activeOrg;
    }
    // Normal operator mode: only operator-audience rows.
    return audience === 'operator';
  }

  // Tenant users: only tenant-audience rows.
  if (audience !== 'tenant') return false;
  if (n['organisation_id'] !== tenant.organisation_id) return false;
  // Branch scope: org-wide (null branch_id) is always visible.
  // Org-level users (null tenant.branch_id) see all branches.
  if (n['branch_id'] != null && tenant.branch_id != null && n['branch_id'] !== tenant.branch_id) {
    return false;
  }
  // Role gate.
  const minRole = n['min_role'] as string | null;
  if (minRole) {
    if ((ROLE_RANK[tenant.role] ?? 0) < (ROLE_RANK[minRole] ?? 0)) return false;
  }
  return true;
}

function isUnreadFor(n: Record<string, unknown>, userId: string): boolean {
  const readBy = Array.isArray(n['read_by']) ? (n['read_by'] as string[]) : [];
  return !readBy.includes(userId);
}

// Shared DB query used by GET / and read-all so they can't drift.
// Applies audience + org filters at the DB level; isVisibleTo() is the TS final authority.
async function buildVisibleQuery(tenant: Tenant, limit: number): Promise<Record<string, unknown>[]> {
  const isSuper = tenant.role === 'super_admin';
  const activeOrg = tenant.organisation_id;

  let q = supabase.from('notifications').select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!isSuper) {
    q = q.eq('audience', 'tenant').eq('organisation_id', activeOrg);
  } else if (activeOrg && activeOrg.length > 0) {
    // Tenant mode: same filter as a tenant user.
    q = q.eq('audience', 'tenant').eq('organisation_id', activeOrg);
  } else {
    // Normal operator mode: only operator rows.
    q = q.eq('audience', 'operator');
  }

  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).filter(n => isVisibleTo(n, tenant));
}

// GET /api/notifications
router.get('/', authenticate, async (req, res, next) => {
  try {
    const rawLimit = parseInt((req.query['limit'] as string) ?? '30', 10);
    const limit = Math.min(Math.max(isNaN(rawLimit) ? 30 : rawLimit, 1), 100);

    const visible = await buildVisibleQuery(req.tenant as Tenant, limit);
    const unread_count = visible.filter(n => isUnreadFor(n, req.user.id)).length;

    res.json(ApiResponse.success({ notifications: visible, unread_count }));
  } catch (err) {
    next(err);
  }
});

// POST /api/notifications/read-all — must be before /:id/read to avoid route shadowing
router.post('/read-all', authenticate, async (req, res, next) => {
  try {
    const visible = await buildVisibleQuery(req.tenant as Tenant, 500);
    const userId = req.user.id;
    const unread = visible.filter(n => isUnreadFor(n, userId));

    for (const n of unread) {
      const readBy = Array.isArray(n['read_by']) ? (n['read_by'] as string[]) : [];
      const updated = [...new Set([...readBy, userId])];
      await supabase.from('notifications').update({ read_by: updated }).eq('id', n['id']);
    }

    res.json(ApiResponse.success({ marked: unread.length }));
  } catch (err) {
    next(err);
  }
});

// POST /api/notifications/:id/read
router.post('/:id/read', authenticate, async (req, res, next) => {
  try {
    const id = req.params['id'] as string;

    const { data: row } = await supabase
      .from('notifications').select('*').eq('id', id).maybeSingle();
    if (!row) throw new AppError('Not found', 404);

    const n = row as Record<string, unknown>;
    if (!isVisibleTo(n, req.tenant as Tenant)) throw new AppError('Forbidden', 403);

    const userId = req.user.id;
    const readBy = Array.isArray(n['read_by']) ? (n['read_by'] as string[]) : [];
    if (!readBy.includes(userId)) {
      const updated = [...new Set([...readBy, userId])];
      await supabase.from('notifications').update({ read_by: updated }).eq('id', id);
    }

    res.json(ApiResponse.success({ ok: true }));
  } catch (err) {
    next(err);
  }
});

export default router;
