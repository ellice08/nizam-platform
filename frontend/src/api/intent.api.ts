import { apiClient } from '@/lib/axios'

export interface IntentField { key: string; label: string; required?: boolean }

export interface AgentIntent {
  id?: string
  key: string
  label: string
  description?: string | null
  fields: IntentField[]
  position?: number
  enabled?: boolean
}

export const intentApi = {
  list: async (agentId: string): Promise<AgentIntent[]> => {
    const { data } = await apiClient.get(`/api/agents/${agentId}/intents`)
    return data?.data ?? data ?? []
  },
  create: async (agentId: string, intent: Omit<AgentIntent, 'id'>): Promise<AgentIntent> => {
    const { data } = await apiClient.post(`/api/agents/${agentId}/intents`, intent)
    return data?.data ?? data
  },
  update: async (id: string, patch: Partial<AgentIntent>): Promise<AgentIntent> => {
    const { data } = await apiClient.patch(`/api/intents/${id}`, patch)
    return data?.data ?? data
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/intents/${id}`)
  },
}
