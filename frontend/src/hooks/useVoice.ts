import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { voiceApi } from '@/api'
import { useAuthStore } from '@/store'

export const useVoiceAccounts = () => {
  const { tenantOrgId } = useAuthStore()
  return useQuery({
    queryKey: ['voice-accounts', tenantOrgId],
    queryFn: () => voiceApi.list(),
    refetchInterval: 45_000,
    refetchOnWindowFocus: true,
  })
}

export const useConnectVoice = () => {
  const queryClient = useQueryClient()
  const { tenantOrgId } = useAuthStore()
  return useMutation({
    mutationFn: voiceApi.connect,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['voice-accounts', tenantOrgId] })
    },
  })
}

export const useDisconnectVoice = () => {
  const queryClient = useQueryClient()
  const { tenantOrgId } = useAuthStore()
  return useMutation({
    mutationFn: (id: string) => voiceApi.disconnect(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['voice-accounts', tenantOrgId] })
    },
  })
}
