import { apiClient } from '@/lib/axios'
import type { Conversation, ConversationFilters, ApiSuccess } from '@/types/api.types'

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

const updateConversation = async (
  id: string,
  data: { resolved?: boolean; requires_human?: boolean; lead_name?: string }
): Promise<Conversation> => {
  const response = await apiClient.patch<ApiSuccess<Conversation>>(`/api/conversations/${id}`, data)
  return response.data.data
}

export const conversationApi = {
  getConversations,
  getConversationById,
  updateConversation,
}
