import { useQuery } from '@tanstack/react-query'
import { intentApi } from '@/api'

export const useOrgIntents = (orgId: string | null | undefined) => {
  return useQuery({
    queryKey: ['org-intents', orgId],
    queryFn: () => intentApi.listByOrg(orgId!),
    enabled: !!orgId,
  })
}
