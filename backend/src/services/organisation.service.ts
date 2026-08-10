import { supabase } from '../lib/supabase.js';
import { AppError } from '../utils/errors.js';
import { agentService } from './agent.service.js';
import { PLATFORM_ORG_ID } from '../config/constants.js';

class OrganisationService {
  // Excludes Ellice Systems (the operator's own org, PLATFORM_ORG_ID) — it's
  // the platform, not a client, and shouldn't show up in the client list.
  async getAllOrganisations() {
    const { data, error } = await supabase
      .from('organisations')
      .select('*')
      .neq('id', PLATFORM_ORG_ID)
      .order('created_at', { ascending: false });

    if (error) throw new AppError(error.message);
    return data ?? [];
  }

  async getOrganisationById(orgId: string) {
    const { data: org, error } = await supabase
      .from('organisations')
      .select('*')
      .eq('id', orgId)
      .single();

    if (error || !org) throw new AppError('Organisation not found', 404);

    const [
      { count: branchCount },
      { count: userCount },
      { data: branches },
    ] = await Promise.all([
      supabase.from('branches').select('*', { count: 'exact', head: true }).eq('organisation_id', orgId),
      supabase.from('tenant_users').select('*', { count: 'exact', head: true }).eq('organisation_id', orgId),
      supabase.from('branches').select('*').eq('organisation_id', orgId).order('created_at', { ascending: true }),
    ]);

    return {
      ...(org as Record<string, unknown>),
      branchCount: branchCount ?? 0,
      userCount: userCount ?? 0,
      branches: branches ?? [],
    };
  }

  async createOrganisation(data: { name: string; slug: string; industry?: string; plan?: string }) {
    const { data: org, error } = await supabase
      .from('organisations')
      .insert(data)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') throw new AppError('An organisation with this slug already exists', 409);
      throw new AppError(error.message);
    }

    const { data: branch } = await supabase
      .from('branches')
      .insert({ organisation_id: (org as Record<string, unknown>).id, name: 'Main Office' })
      .select()
      .single();

    if (branch) {
      await agentService.createAgent(
        (branch as Record<string, unknown>).id as string,
        { name: 'Aria', niche: data.industry, tone: 'professional', orgName: data.name }
      );
    }

    return org;
  }

  async updateOrganisation(
    orgId: string,
    data: Partial<{ name: string; industry: string; plan: string; branding_config: unknown; subdomain: string }>
  ) {
    const updateData: Record<string, unknown> = { ...data };

    // branding_config is jsonb — merge into the existing value instead of
    // overwriting the whole column, so a partial update (e.g. just the new
    // theme fields) never clobbers unrelated branding keys (logo_url, colors,
    // font, etc. set by a different save path).
    if (data.branding_config && typeof data.branding_config === 'object') {
      const { data: existing } = await supabase
        .from('organisations')
        .select('branding_config')
        .eq('id', orgId)
        .maybeSingle();

      const existingBranding = (existing as Record<string, unknown> | null)?.['branding_config'] as Record<string, unknown> | null ?? {};
      const incomingBranding = data.branding_config as Record<string, unknown>;

      // Shallow merge handles every top-level key except `widget` — that one
      // needs its own deep merge, otherwise a widget-only save (e.g. just
      // { theme_mode }) would blow away the other widget fields already
      // saved (primary_color, font_family, corner_radius), and a Branding-tab
      // save (no `widget` key at all) must leave branding_config.widget
      // completely untouched.
      const existingWidget = existingBranding.widget as Record<string, unknown> | undefined;
      const incomingWidget = incomingBranding.widget as Record<string, unknown> | undefined;

      const mergedBranding: Record<string, unknown> = { ...existingBranding, ...incomingBranding };
      if (existingWidget || incomingWidget) {
        mergedBranding.widget = { ...existingWidget, ...incomingWidget };
      }

      updateData.branding_config = mergedBranding;
    }

    const { data: org, error } = await supabase
      .from('organisations')
      .update(updateData)
      .eq('id', orgId)
      .select()
      .single();

    if (error || !org) throw new AppError('Organisation not found', 404);
    return org;
  }

  async deleteOrganisation(orgId: string) {
    const { data: org, error: fetchError } = await supabase
      .from('organisations')
      .select('id')
      .eq('id', orgId)
      .single();

    if (fetchError || !org) throw new AppError('Organisation not found', 404);

    const { data: tenantUsers } = await supabase
      .from('tenant_users')
      .select('user_id')
      .eq('organisation_id', orgId);

    const userIds = (tenantUsers ?? []).map((u: Record<string, unknown>) => u.user_id as string);

    await Promise.all(userIds.map((uid) => supabase.auth.admin.deleteUser(uid)));

    const { error: deleteError } = await supabase
      .from('organisations')
      .delete()
      .eq('id', orgId);

    if (deleteError) throw new AppError(deleteError.message);

    return { deleted: true };
  }

  async getOrganisationStats(orgId: string) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: branches } = await supabase
      .from('branches')
      .select('id')
      .eq('organisation_id', orgId);

    const branchIds = (branches ?? []).map((b: Record<string, unknown>) => b.id as string);

    if (branchIds.length === 0) {
      return {
        total_conversations: 0,
        resolved_conversations: 0,
        active_branches: 0,
        conversations_today: 0,
      };
    }

    const [
      { count: total_conversations },
      { count: resolved_conversations },
      { count: active_branches },
      { count: conversations_today },
    ] = await Promise.all([
      supabase.from('conversations').select('*', { count: 'exact', head: true }).in('branch_id', branchIds),
      supabase.from('conversations').select('*', { count: 'exact', head: true }).in('branch_id', branchIds).eq('resolved', true),
      supabase.from('branches').select('*', { count: 'exact', head: true }).eq('organisation_id', orgId),
      supabase.from('conversations').select('*', { count: 'exact', head: true }).in('branch_id', branchIds).gte('created_at', todayStart.toISOString()),
    ]);

    return {
      total_conversations: total_conversations ?? 0,
      resolved_conversations: resolved_conversations ?? 0,
      active_branches: active_branches ?? 0,
      conversations_today: conversations_today ?? 0,
    };
  }
}

export const organisationService = new OrganisationService();
