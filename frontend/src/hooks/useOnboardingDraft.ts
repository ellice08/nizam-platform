import { useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'

export const useOnboardingDraft = (existingDraftId?: string | null) => {
  const draftIdRef = useRef<string | null>(existingDraftId ?? null)

  const saveDraft = useCallback(async (
    stepCompleted: number,
    draftData: Record<string, unknown>
  ) => {
    try {
      if (draftIdRef.current) {
        await supabase
          .from('onboarding_drafts')
          .update({
            step_completed: stepCompleted,
            draft_data: draftData,
            last_saved_at: new Date().toISOString(),
          })
          .eq('id', draftIdRef.current)
      } else {
        const { data } = await supabase
          .from('onboarding_drafts')
          .insert({
            step_completed: stepCompleted,
            draft_data: draftData,
            status: 'in_progress',
            last_saved_at: new Date().toISOString(),
          })
          .select()
          .single()
        if (data) draftIdRef.current = (data as { id: string }).id
      }
      return { success: true }
    } catch (err) {
      console.error('Draft save error:', err)
      return { success: false }
    }
  }, [])

  const loadDraft = useCallback(async (draftId: string) => {
    try {
      const { data, error } = await supabase
        .from('onboarding_drafts')
        .select('*')
        .eq('id', draftId)
        .maybeSingle()
      if (error || !data) return null
      draftIdRef.current = draftId
      return data as {
        id: string
        step_completed: number
        draft_data: Record<string, unknown>
        status: string
      }
    } catch (err) {
      console.error('Draft load error:', err)
      return null
    }
  }, [])

  const completeDraft = useCallback(async (organisationId: string) => {
    if (!draftIdRef.current) return
    await supabase
      .from('onboarding_drafts')
      .update({
        status: 'complete',
        organisation_id: organisationId,
      })
      .eq('id', draftIdRef.current)
  }, [])

  return { saveDraft, loadDraft, completeDraft, draftId: draftIdRef.current }
}
