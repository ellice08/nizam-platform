import { supabase } from '../lib/supabase.js';
import { AppError } from '../utils/errors.js';

interface ConversationFilters {
  channel?: string;
  resolved?: boolean;
  limit?: number;
  offset?: number;
}

type ConversationUpdateData = Partial<{
  resolved: boolean;
  requires_human: boolean;
  messages: unknown[];
  lead_name: string;
  callback_requested: boolean;
  callback_completed: boolean;
  actioned_by: string;
  actioned_at: string;
  notes: Array<{ text: string; added_by: string; added_at: string }>;
  sentiment: string;
}>;

class ConversationService {
  async getConversations(branchId: string, filters: ConversationFilters = {}) {
    const { channel, resolved, limit = 50, offset = 0 } = filters;

    let query = supabase
      .from('conversations')
      .select('*')
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (channel !== undefined) query = query.eq('channel', channel);
    if (resolved !== undefined) query = query.eq('resolved', resolved);

    const { data, error } = await query;
    if (error) throw new AppError(error.message);
    return data ?? [];
  }

  async getConversationsByBranches(branchIds: string[], filters: ConversationFilters = {}) {
    if (branchIds.length === 0) return [];

    const { channel, resolved, limit = 50, offset = 0 } = filters;

    let query = supabase
      .from('conversations')
      .select('*')
      .in('branch_id', branchIds)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (channel !== undefined) query = query.eq('channel', channel);
    if (resolved !== undefined) query = query.eq('resolved', resolved);

    const { data, error } = await query;
    if (error) throw new AppError(error.message);
    return data ?? [];
  }

  async getConversationById(conversationId: string, branchId: string) {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .eq('branch_id', branchId)
      .single();

    if (error || !data) throw new AppError('Conversation not found', 404);
    return data;
  }

  async getConversationByIdForBranches(conversationId: string, branchIds: string[]) {
    if (branchIds.length === 0) throw new AppError('Conversation not found', 404);

    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .in('branch_id', branchIds)
      .single();

    if (error || !data) throw new AppError('Conversation not found', 404);
    return data;
  }

  async createConversation(data: {
    branch_id: string;
    channel: string;
    lead_name?: string;
    lead_phone?: string;
    agent_id?: string;
  }) {
    const { data: conversation, error } = await supabase
      .from('conversations')
      .insert(data)
      .select()
      .single();

    if (error) throw new AppError(error.message);
    return conversation;
  }

  async updateConversation(conversationId: string, branchId: string, data: ConversationUpdateData) {
    const { data: conversation, error } = await supabase
      .from('conversations')
      .update(data)
      .eq('id', conversationId)
      .eq('branch_id', branchId)
      .select()
      .single();

    if (error || !conversation) throw new AppError('Conversation not found', 404);
    return conversation;
  }

  async updateConversationForBranches(
    conversationId: string,
    branchIds: string[],
    data: ConversationUpdateData
  ) {
    if (branchIds.length === 0) throw new AppError('Conversation not found', 404);

    const { data: existing } = await supabase
      .from('conversations')
      .select('id, branch_id')
      .eq('id', conversationId)
      .in('branch_id', branchIds)
      .maybeSingle();

    if (!existing) throw new AppError('Conversation not found', 404);

    const { data: conversation, error } = await supabase
      .from('conversations')
      .update(data)
      .eq('id', conversationId)
      .select()
      .single();

    if (error) throw new AppError(error.message, 500);
    if (!conversation) throw new AppError('Conversation not found', 404);
    return conversation;
  }
}

export const conversationService = new ConversationService();
