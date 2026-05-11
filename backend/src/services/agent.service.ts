import { supabase } from '../lib/supabase.js';
import { AppError } from '../utils/errors.js';

class AgentService {
  async getAgentByBranch(branchId: string) {
    const { data, error } = await supabase
      .from('agents')
      .select('*')
      .eq('branch_id', branchId)
      .maybeSingle();

    if (error) throw new AppError(error.message);
    return data ?? null;
  }

  async getAgentsByOrg(orgId: string) {
    const { data: branches, error: branchError } = await supabase
      .from('branches')
      .select('id')
      .eq('organisation_id', orgId);

    if (branchError) throw new AppError(branchError.message);

    const branchIds = (branches ?? []).map((b: Record<string, unknown>) => b.id as string);
    if (branchIds.length === 0) return [];

    const { data, error } = await supabase
      .from('agents')
      .select('*')
      .in('branch_id', branchIds);

    if (error) throw new AppError(error.message);
    return data ?? [];
  }

  async createAgent(
    branchId: string,
    input: { name?: string; niche?: string; tone?: string; system_prompt?: string }
  ) {
    const { data, error } = await supabase
      .from('agents')
      .insert({ branch_id: branchId, ...input })
      .select()
      .single();

    if (error) throw new AppError(error.message);
    return data;
  }

  async updateAgent(
    agentId: string,
    branchId: string,
    input: Partial<{ name: string; niche: string; tone: string; system_prompt: string; active: boolean }>
  ) {
    const { data, error } = await supabase
      .from('agents')
      .update(input)
      .eq('id', agentId)
      .eq('branch_id', branchId)
      .select()
      .single();

    if (error || !data) throw new AppError('Agent not found', 404);
    return data;
  }
}

export const agentService = new AgentService();
