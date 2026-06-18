import { apiClient } from '@/lib/axios'

export interface WhatsAppAccount {
  id: string
  branch_id: string | null
  phone_number_id: string
  display_phone_number?: string | null
  waba_id?: string | null
  verify_token: string
  status: string
  last_error?: string | null
  created_at: string
}

export const whatsappApi = {
  list: async (): Promise<WhatsAppAccount[]> => {
    const { data } = await apiClient.get('/api/whatsapp/accounts')
    return data?.data ?? data ?? []
  },

  connect: async (payload: {
    phoneNumberId: string
    accessToken: string
    verifyToken: string
    displayPhoneNumber?: string
    wabaId?: string
    branchId?: string | null
  }): Promise<WhatsAppAccount> => {
    const { data } = await apiClient.post('/api/whatsapp/accounts', payload)
    return data?.data ?? data
  },

  disconnect: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/whatsapp/accounts/${id}`)
  },
}
