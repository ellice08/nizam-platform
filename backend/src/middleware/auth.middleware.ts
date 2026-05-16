import type { Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase.js';
import { ApiResponse } from '../utils/response.js';

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json(ApiResponse.error('No token provided', 'Unauthorized'));
    return;
  }

  const token = authHeader.slice(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    res.status(401).json(ApiResponse.error('Invalid or expired token', 'Unauthorized'));
    return;
  }

  req.user = { id: user.id };

  // Super admin is determined by app_metadata set via Supabase admin API
  if ((user.app_metadata as Record<string, unknown>)?.role === 'super_admin') {
    req.tenant = { organisation_id: '', branch_id: null, role: 'super_admin' };
    next();
    return;
  }

  const { data: tenantUser, error: tenantError } = await supabase
    .from('tenant_users')
    .select('organisation_id, branch_id, role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (tenantError || !tenantUser) {
    res.status(403).json(ApiResponse.error('User is not associated with any organisation', 'Forbidden'));
    return;
  }

  req.tenant = {
    organisation_id: tenantUser.organisation_id as string,
    branch_id: tenantUser.branch_id as string | null,
    role: tenantUser.role as string,
  };

  next();
}
