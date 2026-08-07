import { useQuery } from '@tanstack/react-query'
import { supportApi } from '@/api'
import { useAuthStore } from '@/store'

export const useOpenSupportTicketCount = (enabled = true) => {
  const { tenantOrgId } = useAuthStore()
  return useQuery({
    queryKey: ['support', tenantOrgId, 'open-ticket-count'],
    queryFn: () => supportApi.getOpenTicketCount(),
    enabled,
    refetchInterval: 25000,
    refetchOnWindowFocus: true,
  })
}
