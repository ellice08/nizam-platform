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
    agentData: {
      name?: string;
      voice_id?: string;
      tone?: string;
      language?: string;
      niche?: string;
      system_prompt?: string;
      channels?: string[];
      escalation_contacts?: unknown[];
      response_time_config?: unknown;
      orgName?: string;
    }
  ) {
    const { orgName, ...insertFields } = agentData;
    let systemPrompt = insertFields.system_prompt;

    // If no system prompt provided, resolve from niche template
    if (!systemPrompt && insertFields.niche) {
      const { data: template } = await supabase
        .from('niche_templates')
        .select('system_prompt_template')
        .eq('niche', insertFields.niche)
        .maybeSingle();

      if (template && (template as Record<string, unknown>).system_prompt_template) {
        systemPrompt = (template as Record<string, unknown>).system_prompt_template as string;
        systemPrompt = systemPrompt
          .replace(/\{\{agent_name\}\}/g, agentData.name ?? 'Aria')
          .replace(/\{\{company_name\}\}/g, orgName ?? '[Company Name]');
      }
    }

    const { data, error } = await supabase
      .from('agents')
      .insert({ branch_id: branchId, ...insertFields, system_prompt: systemPrompt })
      .select()
      .single();

    if (error) throw new AppError(error.message);
    return data;
  }

  async getOrCreateAgent(branchId: string) {
    const existing = await this.getAgentByBranch(branchId);
    if (existing) return existing;
    return await this.createAgent(branchId, { name: 'Aria', tone: 'professional' });
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
