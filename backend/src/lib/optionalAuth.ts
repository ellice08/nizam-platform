import { supabase } from './supabase.js';

export interface AuthenticatedContext {
  userId: string;
  organisationId: string;
}

// Best-effort OPTIONAL auth for public routes (currently: widget.routes.ts's
// /chat, for ticket attribution — see claude.service.ts's raiseSupportTicket
// and CLAUDE.md §8 Tier 3 [8a]). Same verification as auth.middleware's
// required path (supabase.auth.getUser on the bearer token) — the only
// difference is this NEVER throws/401s: a missing or invalid token just
// degrades to unattributed (null), since auth is optional on these routes.
// NEVER trust a client-supplied org/user id directly; this is the only way
// {userId, organisationId} may enter ChatParams.
export async function resolveOptionalAuth(authHeader: string | undefined): Promise<AuthenticatedContext | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;

    // Super-admins have no tenant_users row (see auth.middleware.ts) — there's
    // no single "their org" to attribute a widget-raised ticket to from a
    // bare token, so treat as unattributed rather than guessing.
    if ((user.app_metadata as Record<string, unknown>)?.role === 'super_admin') return null;

    const { data: tenantUser } = await supabase
      .from('tenant_users')
      .select('organisation_id')
      .eq('user_id', user.id)
      .maybeSingle();

    const organisationId = tenantUser?.organisation_id as string | undefined;
    if (!organisationId) return null;

    return { userId: user.id, organisationId };
  } catch {
    return null;
  }
}
