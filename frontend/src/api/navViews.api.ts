import { apiClient } from '@/lib/axios'

export type NavBadgeSection = 'conversations' | 'support'

export const navViewsApi = {
  markViewed: async (section: NavBadgeSection): Promise<void> => {
    await apiClient.post('/api/nav-views/mark-viewed', { section })
  },
}
