import { supabase } from '../lib/supabase.js';
import { AppError } from '../utils/errors.js';

export interface VoiceAccountPublic {
  id: string;
  branch_id: string | null;
  retell_agent_id: string;
  agent_name: string | null;
  phone_number: string | null;
  status: string;
  last_error: string | null;
  created_at: string;
}

class VoiceService {
  // ── Connect ────────────────────────────────────────────────────────────────

  async connectAccount(input: {
    organisationId: string;
    branchId?: string | null;
    retellAgentId: string;
    agentName?: string | null;
    phoneNumber?: string | null;
    webhookSecret?: string | null;
  }): Promise<VoiceAccountPublic> {
    if (!input.organisationId) throw new AppError('organisationId is required', 400);
    if (!input.retellAgentId) throw new AppError('retellAgentId is required', 400);

    const { data, error } = await supabase
      .from('voice_accounts')
      .insert({
        organisation_id: input.organisationId,
        branch_id: input.branchId ?? null,
        retell_agent_id: input.retellAgentId,
        agent_name: input.agentName ?? null,
        phone_number: input.phoneNumber ?? null,
        webhook_secret: input.webhookSecret ?? null,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new AppError('This Retell agent is already connected', 409);
      }
      throw new AppError(error.message);
    }

    return stripWebhookSecret(data as Record<string, unknown>) as unknown as VoiceAccountPublic;
  }

  // ── Internal: inbound routing lookup (V2/V3 call routing) ─────────────────

  async getByAgentId(retellAgentId: string): Promise<Record<string, unknown> | null> {
    const { data } = await supabase
      .from('voice_accounts')
      .select('*')
      .eq('retell_agent_id', retellAgentId)
      .maybeSingle();
    return (data as Record<string, unknown> | null) ?? null;
  }

  // ── List for UI (webhook_secret stripped) ─────────────────────────────────

  async listByOrg(organisationId: string): Promise<VoiceAccountPublic[]> {
    const { data, error } = await supabase
      .from('voice_accounts')
      .select('id, branch_id, retell_agent_id, agent_name, phone_number, status, last_error, created_at')
      .eq('organisation_id', organisationId)
      .order('created_at', { ascending: true });

    if (error) throw new AppError(error.message);
    return (data ?? []) as unknown as VoiceAccountPublic[];
  }

  // ── Status management ──────────────────────────────────────────────────────

  async updateStatus(id: string, status: 'pending' | 'connected' | 'error', lastError?: string | null): Promise<void> {
    const { error } = await supabase
      .from('voice_accounts')
      .update({ status, last_error: lastError ?? null })
      .eq('id', id);
    if (error) throw new AppError(error.message);
  }

  // ── Disconnect (hard delete — tenant re-connects fresh) ───────────────────

  async disconnect(id: string): Promise<void> {
    const { error } = await supabase
      .from('voice_accounts')
      .delete()
      .eq('id', id);
    if (error) throw new AppError(error.message);
  }

  // ── Resolve the branch that handles an account's calls ────────────────────
  // Rule: if account.branch_id is set, use it directly (explicit routing).
  // Otherwise (org-level account), pick the first branch for the org by
  // created_at asc — mirrors whatsapp.service.resolveAgentForAccount exactly
  // so routing behaviour is consistent across channels.

  async resolveAgentForAccount(account: Record<string, unknown>): Promise<{ branchId: string }> {
    if (account['branch_id']) {
      return { branchId: account['branch_id'] as string };
    }

    const { data: branches, error } = await supabase
      .from('branches')
      .select('id')
      .eq('organisation_id', account['organisation_id'] as string)
      .order('created_at', { ascending: true })
      .limit(1);

    if (error) throw new AppError(error.message);
    if (!branches || branches.length === 0) {
      throw new AppError('No branches found for this organisation', 404);
    }

    return { branchId: (branches[0] as Record<string, unknown>)['id'] as string };
  }

  // ── Ownership helper (for V4 DELETE route auth check) ────────────────────
  // Mirrors the WhatsApp approach: listByOrg is used for ownership checks in
  // routes, so this helper is not strictly required. Provided for symmetry and
  // direct use when only the id is available.

  async getOrgIdForAccount(id: string): Promise<string | null> {
    const { data } = await supabase
      .from('voice_accounts')
      .select('organisation_id')
      .eq('id', id)
      .maybeSingle();
    return (data as Record<string, unknown> | null)?.['organisation_id'] as string ?? null;
  }
}

function stripWebhookSecret(row: Record<string, unknown>): Record<string, unknown> {
  const safe = { ...row };
  delete safe['webhook_secret'];
  return safe;
}

export const voiceService = new VoiceService();
