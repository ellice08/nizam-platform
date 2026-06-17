import { useQuery } from '@tanstack/react-query'
import { analyticsApi } from '@/api'
import { useAuthStore } from '@/store'

export const useAnalyticsOverview = (from?: string, to?: string) => {
  const { tenantOrgId } = useAuthStore()
  return useQuery({
    queryKey: ['analytics', 'overview', from, to, tenantOrgId],
    queryFn: () => analyticsApi.overview(from, to),
  })
}

export const useAnalyticsVolume = (from?: string, to?: string) => {
  const { tenantOrgId } = useAuthStore()
  return useQuery({
    queryKey: ['analytics', 'volume', from, to, tenantOrgId],
    queryFn: () => analyticsApi.volume(from, to),
  })
}
