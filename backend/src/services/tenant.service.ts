import { supabase } from '../lib/supabase.js';
import { AppError } from '../utils/errors.js';

class TenantService {
  async getAllTenants() {
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new AppError(error.message);
    return data ?? [];
  }

  async getTenantById(tenantId: string) {
    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single();

    if (error || !tenant) throw new AppError('Tenant not found', 404);

    const [{ count: agentsCount }, { count: conversationsCount }] = await Promise.all([
      supabase.from('agents').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    ]);

    return { ...tenant as Record<string, unknown>, agentsCount: agentsCount ?? 0, conversationsCount: conversationsCount ?? 0 };
  }

  async createTenant(data: { name: string; slug: string; plan: string }) {
    const { data: tenant, error } = await supabase
      .from('tenants')
      .insert(data)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') throw new AppError('A tenant with this slug already exists', 409);
      throw new AppError(error.message);
    }

    return tenant;
  }

  async updateTenant(
    tenantId: string,
    data: Partial<{ name: string; plan: string; retell_agent_id: string; twilio_phone: string }>
  ) {
    const { data: tenant, error } = await supabase
      .from('tenants')
      .update(data)
      .eq('id', tenantId)
      .select()
      .single();

    if (error || !tenant) throw new AppError('Tenant not found', 404);
    return tenant;
  }

  async getTenantStats(tenantId: string) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      { count: total_conversations },
      { count: resolved_conversations },
      { count: active_agents },
      { count: conversations_today },
    ] = await Promise.all([
      supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('resolved', true),
      supabase.from('agents').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('created_at', todayStart.toISOString()),
    ]);

    return {
      total_conversations: total_conversations ?? 0,
      resolved_conversations: resolved_conversations ?? 0,
      active_agents: active_agents ?? 0,
      conversations_today: conversations_today ?? 0,
    };
  }
}

export const tenantService = new TenantService();
