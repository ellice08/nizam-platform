import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tenantApi } from '@/api'
import { useAuthStore } from '@/store'
import type { CreateTenantPayload, UpdateTenantPayload } from '@/types/api.types'

export const useAllTenants = () => {
  const { isAdmin } = useAuthStore()
  return useQuery({
    queryKey: ['tenants'],
    queryFn: tenantApi.getAllTenants,
    enabled: isAdmin,
    staleTime: 30000,
  })
}

export const useTenant = (id: string) => {
  return useQuery({
    queryKey: ['tenants', id],
    queryFn: () => tenantApi.getTenantById(id),
    enabled: !!id,
  })
}

export const useTenantStats = (id: string) => {
  return useQuery({
    queryKey: ['tenants', id, 'stats'],
    queryFn: () => tenantApi.getTenantStats(id),
    enabled: !!id,
    refetchInterval: 60000,
  })
}

export const useCreateTenant = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateTenantPayload) => tenantApi.createTenant(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tenants'] })
    },
  })
}

export const useUpdateTenant = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateTenantPayload }) =>
      tenantApi.updateTenant(id, payload),
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ['tenants'] })
      void queryClient.invalidateQueries({ queryKey: ['tenants', id] })
    },
  })
}
