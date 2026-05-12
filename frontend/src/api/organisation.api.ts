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

const uploadDocuments = async (
  branchId: string,
  files: File[]
): Promise<{
  results: Array<{ filename: string; chunksCreated: number; error?: string }>
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
  const json = await response.json() as { data: { results: Array<{ filename: string; chunksCreated: number; error?: string }>; totalChunks: number }; error?: { message?: string } }
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

export const organisationApi = {
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
  getKnowledgeSources,
  deleteKnowledgeSource,
  sendChatMessage,
}
