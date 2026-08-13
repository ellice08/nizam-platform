import { apiClient } from '@/lib/axios'
import { supabase } from '@/lib/supabase'
import type {
  Organisation,
  OrganisationWithDetails,
  OrganisationStats,
  Branch,
  Agent,
  CreateOrganisationPayload,
  UpdateOrganisationPayload,
  CreateBranchPayload,
  ApiSuccess,
} from '@/types/api.types'

type BusinessHoursConfig = {
  enabled: boolean
  mode: "simple" | "custom"
  days: Record<string, { open: string; close: string; closed: boolean }>
}

export type CreateAgentPayload = {
  branch_id: string
  name?: string
  voice_id?: string
  tone?: string
  language?: string
  niche?: string
  system_prompt?: string
  channels?: string[]
  escalation_contacts?: Array<{ name: string; phone: string; email: string }>
  response_time_config?: {
    confirmation_hours: number
    callback_window_hours: number
    after_hours_message: string
    confirmation_enabled?: boolean
    business_hours?: BusinessHoursConfig
  }
}

export type UpdateAgentPayload = Partial<{
  name: string
  voice_id: string
  tone: string
  language: string
  system_prompt: string
  channels: string[]
  escalation_contacts: Array<{ name: string; phone: string; email: string }>
  response_time_config: {
    confirmation_hours: number
    callback_window_hours: number
    after_hours_message: string
    confirmation_enabled?: boolean
    business_hours?: BusinessHoursConfig
  }
}>

const getAllOrganisations = async (): Promise<Organisation[]> => {
  const response = await apiClient.get<ApiSuccess<Organisation[]>>('/api/organisations')
  return response.data.data
}

const getOrganisationById = async (id: string): Promise<OrganisationWithDetails> => {
  const response = await apiClient.get<ApiSuccess<OrganisationWithDetails>>(`/api/organisations/${id}`)
  return response.data.data
}

const createOrganisation = async (payload: CreateOrganisationPayload): Promise<Organisation> => {
  const response = await apiClient.post<ApiSuccess<Organisation>>('/api/organisations', payload)
  return response.data.data
}

const updateOrganisation = async (id: string, payload: UpdateOrganisationPayload): Promise<Organisation> => {
  const response = await apiClient.patch<ApiSuccess<Organisation>>(`/api/organisations/${id}`, payload)
  return response.data.data
}

const getOrganisationStats = async (id: string): Promise<OrganisationStats> => {
  const response = await apiClient.get<ApiSuccess<OrganisationStats>>(`/api/organisations/${id}/stats`)
  return response.data.data
}

const getBranches = async (orgId: string): Promise<Branch[]> => {
  const response = await apiClient.get<ApiSuccess<Branch[]>>(`/api/organisations/${orgId}/branches`)
  return response.data.data
}

const createBranch = async (orgId: string, payload: CreateBranchPayload): Promise<Branch> => {
  const response = await apiClient.post<ApiSuccess<Branch>>(`/api/organisations/${orgId}/branches`, payload)
  return response.data.data
}

const updateBranch = async (orgId: string, branchId: string, payload: {
  name?: string
  location?: string
  timezone?: string
}): Promise<Branch> => {
  const response = await apiClient.patch<ApiSuccess<Branch>>(
    `/api/organisations/${orgId}/branches/${branchId}`, payload)
  return response.data.data
}

const deleteBranch = async (orgId: string, branchId: string): Promise<{ deleted: boolean }> => {
  const response = await apiClient.delete<ApiSuccess<{ deleted: boolean }>>(
    `/api/organisations/${orgId}/branches/${branchId}`)
  return response.data.data
}

const deleteOrganisation = async (id: string): Promise<{ deleted: boolean }> => {
  const response = await apiClient.delete<ApiSuccess<{ deleted: boolean }>>(`/api/organisations/${id}`)
  return response.data.data
}

const getAgentByBranch = async (branchId: string): Promise<Agent> => {
  const response = await apiClient.get<ApiSuccess<Agent>>(`/api/agents/branch/${branchId}`)
  return response.data.data
}

const getAgentsByOrg = async (organisationId: string): Promise<Agent[]> => {
  const response = await apiClient.get<ApiSuccess<Agent[]>>(`/api/agents/org/${organisationId}`)
  return response.data.data
}

const createAgent = async (payload: CreateAgentPayload): Promise<Agent> => {
  const response = await apiClient.post<ApiSuccess<Agent>>('/api/agents', payload)
  return response.data.data
}

const updateAgent = async (agentId: string, payload: UpdateAgentPayload): Promise<Agent> => {
  const response = await apiClient.patch<ApiSuccess<Agent>>(`/api/agents/${agentId}`, payload)
  return response.data.data
}

const getDefaultAgentPrompt = async (agentId: string, niche?: string): Promise<{
  prompt: string
  source: 'niche_template' | 'generic'
  niche: string | null
}> => {
  const response = await apiClient.get<ApiSuccess<{
    prompt: string
    source: 'niche_template' | 'generic'
    niche: string | null
  }>>(`/api/agents/${agentId}/default-prompt${niche ? `?niche=${encodeURIComponent(niche)}` : ''}`)
  return response.data.data
}

const uploadDocuments = async (
  branchId: string,
  files: File[]
): Promise<{
  results: Array<{ filename: string; chunksCreated: number; documentChunks?: number; textChars?: number; oneBlockRisk?: boolean; error?: string }>
  totalChunks: number
}> => {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token

  const formData = new FormData()
  formData.append('branch_id', branchId)
  files.forEach(file => formData.append('files', file))

  const response = await fetch(
    `${import.meta.env.VITE_API_URL as string}/api/ingest/upload`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    }
  )
  const json = await response.json() as { data: { results: Array<{ filename: string; chunksCreated: number; documentChunks?: number; textChars?: number; oneBlockRisk?: boolean; error?: string }>; totalChunks: number }; error?: { message?: string } }
  if (!response.ok) throw new Error(json.error?.message ?? 'Upload failed')
  return json.data
}

const getKnowledgeSources = async (branchId: string): Promise<Array<{
  source_url: string
  source_type: string
  chunk_count: number
  last_crawled_at: string | null
}>> => {
  const response = await apiClient.get<ApiSuccess<Array<{
    source_url: string
    source_type: string
    chunk_count: number
    last_crawled_at: string | null
  }>>>(`/api/ingest/sources/${branchId}`)
  return response.data.data
}

const deleteKnowledgeSource = async (
  branchId: string,
  sourceUrl: string
): Promise<{ deleted: number }> => {
  const response = await apiClient.delete<ApiSuccess<{ deleted: number }>>(
    '/api/ingest/source',
    { data: { branch_id: branchId, source_url: sourceUrl } }
  )
  return response.data.data
}

const crawlWebsite = async (params: {
  url: string
  branchId: string
}): Promise<{
  pagesIndexed: number
  chunksCreated: number
}> => {
  const response = await apiClient.post<ApiSuccess<{
    pagesIndexed: number
    chunksCreated: number
  }>>('/api/ingest/crawl', {
    url: params.url,
    branch_id: params.branchId,
  })
  return response.data.data
}

const sendChatMessage = async (params: {
  message: string
  branchId: string
  sessionId?: string
  channel?: 'chat' | 'voice' | 'whatsapp'
}): Promise<{
  reply: string
  sessionId: string
  conversationId: string
  requiresHuman: boolean
}> => {
  const response = await apiClient.post<ApiSuccess<{
    reply: string
    sessionId: string
    conversationId: string
    requiresHuman: boolean
  }>>('/api/chat', {
    message: params.message,
    branch_id: params.branchId,
    session_id: params.sessionId,
    channel: params.channel ?? 'chat',
  })
  return response.data.data
}

export type AvailableRole = {
  value: string
  label: string
  disabled: boolean
  reason: string | null
}

const getAvailableRoles = async (): Promise<AvailableRole[]> => {
  const response = await apiClient.get<ApiSuccess<AvailableRole[]>>(
    '/api/users/available-roles'
  )
  return response.data.data
}

export type OrgUser = {
  id: string
  email: string
  name: string
  role: string
  first_login: boolean
  active: boolean
  created_at: string
}

const getOrgUsers = async (): Promise<OrgUser[]> => {
  const response = await apiClient.get<ApiSuccess<OrgUser[]>>('/api/users')
  return response.data.data
}

const createOrgUser = async (payload: {
  email: string
  role: string
  name?: string
}): Promise<{ success: boolean; userId?: string }> => {
  const response = await apiClient.post<ApiSuccess<{
    success: boolean
    userId?: string
  }>>('/api/users', payload)
  return response.data.data
}

const updateOrgUser = async (
  userId: string,
  payload: { role?: string; active?: boolean }
): Promise<{ updated: boolean }> => {
  const response = await apiClient.patch<ApiSuccess<{ updated: boolean }>>(
    `/api/users/${userId}`,
    payload
  )
  return response.data.data
}

const resetOrgUserPassword = async (
  userId: string
): Promise<{ sent: boolean }> => {
  const response = await apiClient.post<ApiSuccess<{ sent: boolean }>>(
    `/api/users/${userId}/reset-password`,
    {}
  )
  return response.data.data
}

const deleteOrgUser = async (
  userId: string
): Promise<{ deleted: boolean }> => {
  const response = await apiClient.delete<ApiSuccess<{ deleted: boolean }>>(
    `/api/users/${userId}`
  )
  return response.data.data
}

export const organisationApi = {
  updateBranch,
  deleteBranch,
  getDefaultAgentPrompt,
  getAllOrganisations,
  getOrganisationById,
  createOrganisation,
  updateOrganisation,
  deleteOrganisation,
  getOrganisationStats,
  getBranches,
  createBranch,
  getAgentByBranch,
  getAgentsByOrg,
  createAgent,
  updateAgent,
  uploadDocuments,
  crawlWebsite,
  getKnowledgeSources,
  deleteKnowledgeSource,
  sendChatMessage,
  getOrgUsers,
  createOrgUser,
  updateOrgUser,
  resetOrgUserPassword,
  deleteOrgUser,
  getAvailableRoles,
}
