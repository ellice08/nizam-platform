import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { conversationApi } from '@/api'
import type { ConversationFilters } from '@/types/api.types'

export const useConversations = (filters?: ConversationFilters) => {
  return useQuery({
    queryKey: ['conversations', filters],
    queryFn: () => conversationApi.getConversations(filters),
    staleTime: 15000,
  })
}

export const useConversation = (id: string) => {
  return useQuery({
    queryKey: ['conversations', id],
    queryFn: () => conversationApi.getConversationById(id),
    enabled: !!id,
  })
}

export const useUpdateConversation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string
      data: { resolved?: boolean; requires_human?: boolean; lead_name?: string }
    }) => conversationApi.updateConversation(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
  })
}
