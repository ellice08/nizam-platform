import { useCallback, useRef } from 'react'
import { onboardingDraftApi } from '@/api'

// Was direct-Supabase (anon key) — RLS was enabled on onboarding_drafts with
// ZERO policies, so every insert/select/update was silently denied by
// Postgres and none of this ever actually persisted. Migrated onto the
// Express API (super_admin-gated, same as the rest of /admin/*).
export const useOnboardingDraft = (existingDraftId?: string | null) => {
  const draftIdRef = useRef<string | null>(existingDraftId ?? null)

  const saveDraft = useCallback(async (
    stepCompleted: number,
    draftData: Record<string, unknown>
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      if (draftIdRef.current) {
        await onboardingDraftApi.update(draftIdRef.current, {
          step_completed: stepCompleted,
          draft_data: draftData,
        })
      } else {
        const draft = await onboardingDraftApi.create({
          step_completed: stepCompleted,
          draft_data: draftData,
          status: 'in_progress',
        })
        draftIdRef.current = draft.id
      }
      return { success: true }
    } catch (err) {
      console.error('Draft save error:', err)
      const message = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message
      return { success: false, error: message ?? 'Failed to save draft' }
    }
  }, [])

  const loadDraft = useCallback(async (draftId: string) => {
    try {
      const draft = await onboardingDraftApi.get(draftId)
      draftIdRef.current = draftId
      return draft
    } catch (err) {
      console.error('Draft load error:', err)
      return null
    }
  }, [])

  const completeDraft = useCallback(async (organisationId: string) => {
    if (!draftIdRef.current) return
    try {
      await onboardingDraftApi.update(draftIdRef.current, {
        status: 'complete',
        organisation_id: organisationId,
      })
    } catch (err) {
      // Non-fatal: the org is already provisioned by this point, and the
      // draft is just cleanup bookkeeping. Log it so it's visible, but don't
      // block/alarm the operator who just finished onboarding a real client.
      console.error('Draft completion error:', err)
    }
  }, [])

  return { saveDraft, loadDraft, completeDraft, draftId: draftIdRef.current }
}
