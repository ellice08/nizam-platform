import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { conversationApi } from '@/api'
import { useAuthStore } from '@/store'
import type { ConversationFilters, ConversationNote } from '@/types/api.types'

export const useConversations = (filters?: ConversationFilters) => {
  const { tenantOrgId } = useAuthStore()
  return useQuery({
    queryKey: ['conversations', tenantOrgId, filters],
    queryFn: () => conversationApi.getConversations(filters),
    staleTime: 15000,
    refetchInterval: 25000,
    refetchOnWindowFocus: true,
  })
}

export const useConversation = (id: string) => {
  const { tenantOrgId } = useAuthStore()
  return useQuery({
    queryKey: ['conversations', tenantOrgId, id],
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
      data: {
        resolved?: boolean
        requires_human?: boolean
        lead_name?: string
        notes?: ConversationNote[]
        actioned_by?: string
        actioned_at?: string
        callback_completed?: boolean
      }
    }) => conversationApi.updateConversation(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
  })
}
