import { supabase } from '../lib/supabase.js';
import { AppError } from '../utils/errors.js';
import { encrypt, decrypt } from '../lib/tokenCrypto.js';

// Columns that must never leave the server (raw crypto material).
const TOKEN_COLS = ['access_token_encrypted', 'access_token_iv', 'access_token_tag'] as const;

function stripTokenFields(row: Record<string, unknown>): Record<string, unknown> {
  const safe = { ...row };
  for (const col of TOKEN_COLS) delete safe[col];
  return safe;
}

export interface WhatsAppAccountPublic {
  id: string;
  organisation_id: string;
  branch_id: string | null;
  phone_number_id: string;
  display_phone_number: string | null;
  waba_id: string | null;
  verify_token: string | null;
  status: string;
  last_error: string | null;
  created_at: string;
}

class WhatsAppService {
  // ── Connect ────────────────────────────────────────────────────────────────

  async connectAccount(input: {
    organisationId: string;
    branchId?: string | null;
    phoneNumberId: string;
    displayPhoneNumber?: string | null;
    wabaId?: string | null;
    accessToken: string;
    verifyToken: string;
  }): Promise<WhatsAppAccountPublic> {
    const { ciphertext, iv, tag } = encrypt(input.accessToken);

    const { data, error } = await supabase
      .from('whatsapp_accounts')
      .insert({
        organisation_id: input.organisationId,
        branch_id: input.branchId ?? null,
        phone_number_id: input.phoneNumberId,
        display_phone_number: input.displayPhoneNumber ?? null,
        waba_id: input.wabaId ?? null,
        access_token_encrypted: ciphertext,
        access_token_iv: iv,
        access_token_tag: tag,
        verify_token: input.verifyToken,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new AppError('This WhatsApp number is already connected', 409);
      }
      throw new AppError(error.message);
    }

    return stripTokenFields(data as Record<string, unknown>) as unknown as WhatsAppAccountPublic;
  }

  // ── Internal: inbound routing lookup (INCLUDES token fields — server only) ─

  async getByPhoneNumberId(phoneNumberId: string): Promise<Record<string, unknown> | null> {
    const { data } = await supabase
      .from('whatsapp_accounts')
      .select('*')
      .eq('phone_number_id', phoneNumberId)
      .maybeSingle();
    return (data as Record<string, unknown> | null) ?? null;
  }

  // ── Internal: decrypt token for outbound API calls (W3) ───────────────────

  getDecryptedToken(account: Record<string, unknown>): string {
    return decrypt(
      account['access_token_encrypted'] as string,
      account['access_token_iv'] as string,
      account['access_token_tag'] as string,
    );
  }

  // ── List for UI (token fields stripped) ───────────────────────────────────

  async listByOrg(organisationId: string): Promise<WhatsAppAccountPublic[]> {
    const { data, error } = await supabase
      .from('whatsapp_accounts')
      .select('id, organisation_id, branch_id, phone_number_id, display_phone_number, waba_id, verify_token, status, last_error, created_at')
      .eq('organisation_id', organisationId)
      .order('created_at', { ascending: true });

    if (error) throw new AppError(error.message);
    return (data ?? []) as unknown as WhatsAppAccountPublic[];
  }

  // ── Status management ──────────────────────────────────────────────────────

  async updateStatus(id: string, status: 'pending' | 'connected' | 'error', lastError?: string | null): Promise<void> {
    const { error } = await supabase
      .from('whatsapp_accounts')
      .update({ status, last_error: lastError ?? null })
      .eq('id', id);
    if (error) throw new AppError(error.message);
  }

  // ── Disconnect (hard delete — tenant re-connects fresh) ───────────────────

  async disconnect(id: string): Promise<void> {
    const { error } = await supabase
      .from('whatsapp_accounts')
      .delete()
      .eq('id', id);
    if (error) throw new AppError(error.message);
  }

  // ── Resolve the branch that handles an account's messages (W2) ────────────
  // Rule: if account.branch_id is set, use it directly (explicit routing).
  // Otherwise (org-level account), pick the first branch for the org by
  // created_at asc — mirrors organisation.service which always inserts a
  // "Main Office" branch first on org creation; that branch holds the primary agent.

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
}

export const whatsAppService = new WhatsAppService();
