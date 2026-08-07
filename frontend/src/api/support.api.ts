import { apiClient } from '@/lib/axios'
import type { ApiSuccess } from '@/types/api.types'

export const supportApi = {
  getOpenTicketCount: async (): Promise<number> => {
    const response = await apiClient.get<ApiSuccess<{ count: number }>>('/api/support/tickets/open-count')
    return response.data.data.count
  },
}
