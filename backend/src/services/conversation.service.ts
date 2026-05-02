import { supabase } from '../lib/supabase.js';
import { AppError } from '../utils/errors.js';

interface ConversationFilters {
  channel?: string;
  resolved?: boolean;
  limit?: number;
  offset?: number;
}

class ConversationService {
  async getConversations(tenantId: string, filters: ConversationFilters = {}) {
    const { channel, resolved, limit = 50, offset = 0 } = filters;

    let query = supabase
      .from('conversations')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (channel !== undefined) query = query.eq('channel', channel);
    if (resolved !== undefined) query = query.eq('resolved', resolved);

    const { data, error } = await query;
    if (error) throw new AppError(error.message);
    return data ?? [];
  }

  async getConversationById(conversationId: string, tenantId: string) {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !data) throw new AppError('Conversation not found', 404);
    return data;
  }

  async createConversation(data: {
    tenant_id: string;
    channel: string;
    lead_name?: string;
    lead_phone?: string;
  }) {
    const { data: conversation, error } = await supabase
      .from('conversations')
      .insert(data)
      .select()
      .single();

    if (error) throw new AppError(error.message);
    return conversation;
  }

  async updateConversation(
    conversationId: string,
    tenantId: string,
    data: Partial<{ resolved: boolean; requires_human: boolean; messages: unknown[]; lead_name: string }>
  ) {
    const { data: conversation, error } = await supabase
      .from('conversations')
      .update(data)
      .eq('id', conversationId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error || !conversation) throw new AppError('Conversation not found', 404);
    return conversation;
  }
}

export const conversationService = new ConversationService();
