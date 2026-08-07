import { apiClient } from '@/lib/axios'
import type { Conversation, ConversationFilters, ConversationNote, ApiSuccess } from '@/types/api.types'

const getConversations = async (filters?: ConversationFilters): Promise<Conversation[]> => {
  const response = await apiClient.get<ApiSuccess<Conversation[]>>('/api/conversations', {
    params: filters,
  })
  return response.data.data
}

const getConversationById = async (id: string): Promise<Conversation> => {
  const response = await apiClient.get<ApiSuccess<Conversation>>(`/api/conversations/${id}`)
  return response.data.data
}

const getNeedsAttentionCount = async (): Promise<number> => {
  const response = await apiClient.get<ApiSuccess<{ count: number }>>('/api/conversations/needs-attention-count')
  return response.data.data.count
}

const updateConversation = async (
  id: string,
  data: {
    resolved?: boolean
    requires_human?: boolean
    lead_name?: string
    notes?: ConversationNote[]
    actioned_by?: string
    actioned_at?: string
    callback_completed?: boolean
  }
): Promise<Conversation> => {
  const response = await apiClient.patch<ApiSuccess<Conversation>>(`/api/conversations/${id}`, data)
  return response.data.data
}

export const conversationApi = {
  getConversations,
  getConversationById,
  getNeedsAttentionCount,
  updateConversation,
}
