import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { organisationApi } from '@/api'
import { useAuthStore } from '@/store'
import type { CreateOrganisationPayload, UpdateOrganisationPayload, CreateBranchPayload } from '@/types/api.types'
import type { UpdateAgentPayload } from '@/api/organisation.api'

export const useAllOrganisations = () => {
  const { isAdmin } = useAuthStore()
  return useQuery({
    queryKey: ['organisations'],
    queryFn: organisationApi.getAllOrganisations,
    enabled: isAdmin,
    staleTime: 30000,
  })
}

export const useOrganisation = (id: string) => {
  return useQuery({
    queryKey: ['organisations', id],
    queryFn: () => organisationApi.getOrganisationById(id),
    enabled: !!id,
  })
}

export const useOrganisationStats = (id: string) => {
  return useQuery({
    queryKey: ['organisations', id, 'stats'],
    queryFn: () => organisationApi.getOrganisationStats(id),
    enabled: !!id,
    refetchInterval: 60000,
  })
}

export const useBranches = (orgId: string) => {
  return useQuery({
    queryKey: ['organisations', orgId, 'branches'],
    queryFn: () => organisationApi.getBranches(orgId),
    enabled: !!orgId,
  })
}

export const useCreateOrganisation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateOrganisationPayload) => organisationApi.createOrganisation(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['organisations'] })
    },
  })
}

export const useUpdateOrganisation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateOrganisationPayload }) =>
      organisationApi.updateOrganisation(id, payload),
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ['organisations'] })
      void queryClient.invalidateQueries({ queryKey: ['organisations', id] })
    },
  })
}

export const useDeleteOrganisation = () => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: (id: string) => organisationApi.deleteOrganisation(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['organisations'] })
      navigate('/admin')
    },
  })
}

export const useCreateBranch = (orgId: string) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateBranchPayload) => organisationApi.createBranch(orgId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['organisations', orgId, 'branches'] })
      void queryClient.invalidateQueries({ queryKey: ['organisations', orgId] })
    },
  })
}

export const useAgentByBranch = (branchId: string) => {
  return useQuery({
    queryKey: ['agents', 'branch', branchId],
    queryFn: () => organisationApi.getAgentByBranch(branchId),
    enabled: !!branchId,
  })
}

export const useAgentsByOrg = (orgId: string) => {
  return useQuery({
    queryKey: ['agents', 'org', orgId],
    queryFn: () => organisationApi.getAgentsByOrg(orgId),
    enabled: !!orgId,
  })
}

export const useUpdateAgent = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ agentId, payload }: { agentId: string; payload: UpdateAgentPayload }) =>
      organisationApi.updateAgent(agentId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['agents'] })
    },
  })
}

export const useKnowledgeSources = (branchId: string | null) => {
  return useQuery({
    queryKey: ['knowledge', 'sources', branchId],
    queryFn: () => organisationApi.getKnowledgeSources(branchId!),
    enabled: !!branchId,
    staleTime: 30000,
  })
}

export const useDeleteKnowledgeSource = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ branchId, sourceUrl }: { branchId: string; sourceUrl: string }) =>
      organisationApi.deleteKnowledgeSource(branchId, sourceUrl),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['knowledge', 'sources'] })
    },
  })
}
