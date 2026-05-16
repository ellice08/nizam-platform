import { useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'

export const useOnboardingDraft = () => {
  const draftIdRef = useRef<string | null>(null)

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

  return { saveDraft, completeDraft, draftId: draftIdRef.current }
}
