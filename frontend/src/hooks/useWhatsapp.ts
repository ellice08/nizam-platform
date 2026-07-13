import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { whatsappApi } from '@/api'
import { useAuthStore } from '@/store'

export const useWhatsappAccounts = () => {
  const { tenantOrgId } = useAuthStore()
  return useQuery({
    queryKey: ['whatsapp-accounts', tenantOrgId],
    queryFn: () => whatsappApi.list(),
    refetchInterval: 45_000,
    refetchOnWindowFocus: true,
  })
}

export const useConnectWhatsapp = () => {
  const queryClient = useQueryClient()
  const { tenantOrgId } = useAuthStore()
  return useMutation({
    mutationFn: whatsappApi.connect,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['whatsapp-accounts', tenantOrgId] })
    },
  })
}

export const useDisconnectWhatsapp = () => {
  const queryClient = useQueryClient()
  const { tenantOrgId } = useAuthStore()
  return useMutation({
    mutationFn: (id: string) => whatsappApi.disconnect(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['whatsapp-accounts', tenantOrgId] })
    },
  })
}
