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
function isVisibleTo(n: Record<string, unknown>, tenant: Tenant): boolean {
  // super_admin sees everything across all orgs
  if (tenant.role === 'super_admin') return true;
  // must be same org
  if (n['organisation_id'] !== tenant.organisation_id) return false;
  // branch scope: org-wide (null branch) always visible; branch-specific only to that branch.
  // org-level admins (no branch_id on tenant) see all branches in the org.
  if (n['branch_id'] != null && tenant.branch_id != null && n['branch_id'] !== tenant.branch_id) {
    return false;
  }
  // role gate
  const minRole = n['min_role'] as string | null;
  if (minRole) {
    const need = ROLE_RANK[minRole] ?? 0;
    const have = ROLE_RANK[tenant.role] ?? 0;
    if (have < need) return false;
  }
  return true;
}

function isUnreadFor(n: Record<string, unknown>, userId: string): boolean {
  const readBy = Array.isArray(n['read_by']) ? (n['read_by'] as string[]) : [];
  return !readBy.includes(userId);
}

async function queryVisible(tenant: Tenant, limit: number): Promise<Record<string, unknown>[]> {
  const isSuper = tenant.role === 'super_admin';
  let q = supabase.from('notifications').select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (!isSuper) q = q.eq('organisation_id', tenant.organisation_id);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).filter(n => isVisibleTo(n, tenant));
}

// GET /api/notifications
router.get('/', authenticate, async (req, res, next) => {
  try {
    const rawLimit = parseInt((req.query['limit'] as string) ?? '30', 10);
    const limit = Math.min(Math.max(isNaN(rawLimit) ? 30 : rawLimit, 1), 100);

    const visible = await queryVisible(req.tenant as Tenant, limit);
    const unread_count = visible.filter(n => isUnreadFor(n, req.user.id)).length;

    res.json(ApiResponse.success({ notifications: visible, unread_count }));
  } catch (err) {
    next(err);
  }
});

// POST /api/notifications/read-all — must be before /:id/read to avoid route shadowing
router.post('/read-all', authenticate, async (req, res, next) => {
  try {
    const visible = await queryVisible(req.tenant as Tenant, 500);
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
