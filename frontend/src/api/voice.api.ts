import { apiClient } from '@/lib/axios'

export interface VoiceAccount {
  id: string
  branch_id: string | null
  retell_agent_id: string
  agent_name?: string | null
  phone_number?: string | null
  status: string
  last_error?: string | null
  created_at: string
}

export const voiceApi = {
  list: async (): Promise<VoiceAccount[]> => {
    const { data } = await apiClient.get('/api/voice/accounts')
    return data?.data ?? data ?? []
  },

  connect: async (payload: {
    retellAgentId: string
    agentName?: string
    phoneNumber?: string
    branchId?: string | null
  }): Promise<VoiceAccount> => {
    const { data } = await apiClient.post('/api/voice/accounts', payload)
    return data?.data ?? data
  },

  disconnect: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/voice/accounts/${id}`)
  },
}
