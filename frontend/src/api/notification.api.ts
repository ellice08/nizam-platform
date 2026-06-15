import { apiClient } from '@/lib/axios'
import type { ApiSuccess } from '@/types/api.types'

export type NotificationType = 'lead' | 'escalation' | 'support_ticket' | 'support_reply' | 'system'

export interface AppNotification {
  id: string
  organisation_id: string
  branch_id: string | null
  type: NotificationType
  title: string
  body: string | null
  link: string | null
  entity_type: string | null
  entity_id: string | null
  read_by: string[]
  created_at: string
}

export interface NotificationListResponse {
  notifications: AppNotification[]
  unread_count: number
}

export const notificationApi = {
  list: async (limit = 30): Promise<NotificationListResponse> => {
    const response = await apiClient.get<ApiSuccess<NotificationListResponse>>(
      `/api/notifications?limit=${limit}`
    )
    return response.data.data
  },

  markRead: async (id: string): Promise<void> => {
    await apiClient.post(`/api/notifications/${id}/read`)
  },

  markAllRead: async (): Promise<void> => {
    await apiClient.post('/api/notifications/read-all')
  },
}
