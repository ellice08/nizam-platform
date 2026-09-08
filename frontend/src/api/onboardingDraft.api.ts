import { apiClient } from '@/lib/axios'
import type { ApiSuccess } from '@/types/api.types'

export interface OnboardingDraft {
  id: string
  step_completed: number
  draft_data: Record<string, unknown>
  status: string
  last_saved_at: string
  created_at: string
  organisation_id?: string | null
}

export const onboardingDraftApi = {
  list: async (): Promise<OnboardingDraft[]> => {
    const response = await apiClient.get<ApiSuccess<OnboardingDraft[]>>('/api/onboarding-drafts')
    return response.data.data
  },

  get: async (id: string): Promise<OnboardingDraft> => {
    const response = await apiClient.get<ApiSuccess<OnboardingDraft>>(`/api/onboarding-drafts/${id}`)
    return response.data.data
  },

  create: async (payload: {
    step_completed: number
    draft_data: Record<string, unknown>
    status?: string
  }): Promise<OnboardingDraft> => {
    const response = await apiClient.post<ApiSuccess<OnboardingDraft>>('/api/onboarding-drafts', payload)
    return response.data.data
  },

  update: async (
    id: string,
    payload: Partial<{
      step_completed: number
      draft_data: Record<string, unknown>
      status: string
      organisation_id: string
      last_saved_at: string
    }>
  ): Promise<OnboardingDraft> => {
    const response = await apiClient.patch<ApiSuccess<OnboardingDraft>>(`/api/onboarding-drafts/${id}`, payload)
    return response.data.data
  },

  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/onboarding-drafts/${id}`)
  },
}
