import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { organisationApi } from '@/api'
import { useAgentsByOrg } from '@/hooks'

// Agent niche — the wizard sets this from the org's INDUSTRY at provisioning
// (AdminOnboard.tsx: `niche: state.industry`) and never revisits it, so the
// two silently diverge. That is how a real-estate client ended up running a
// hospitality prompt. This is the only place a niche can be corrected.
const NICHES = [
  { value: 'real_estate', label: 'Real estate' },
  { value: 'hospitality', label: 'Hospitality' },
]

export function AgentNicheSection({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient()
  const { data: agents, isLoading } = useAgentsByOrg(orgId)
  const agent = agents?.[0]

  const [selected, setSelected] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [previewPrompt, setPreviewPrompt] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { setSelected(agent?.niche ?? '') }, [agent?.id, agent?.niche])

  const currentPrompt = (agent?.system_prompt ?? '').trim()
  const dirty = !!agent && selected !== (agent.niche ?? '')

  // "Customised" = the stored prompt differs from the template its CURRENT
  // niche would produce. We resolve that from the server rather than guessing,
  // so an untouched client (prompt === its template) is not falsely warned
  // about losing work, and a client who really did edit theirs always is.
  const [templateForCurrentNiche, setTemplateForCurrentNiche] = useState<string | null>(null)
  useEffect(() => {
    if (!agent?.id || !agent?.niche) { setTemplateForCurrentNiche(null); return }
    let cancelled = false
    organisationApi.getDefaultAgentPrompt(agent.id, agent.niche)
      .then(r => { if (!cancelled) setTemplateForCurrentNiche(r.prompt.trim()) })
      .catch(() => { if (!cancelled) setTemplateForCurrentNiche(null) })
    return () => { cancelled = true }
  }, [agent?.id, agent?.niche])

  const isCustomised =
    currentPrompt.length > 0 &&
    templateForCurrentNiche !== null &&
    currentPrompt !== templateForCurrentNiche

  const openConfirm = async () => {
    if (!agent?.id) return
    setBusy(true)
    try {
      const { prompt } = await organisationApi.getDefaultAgentPrompt(agent.id, selected)
      setPreviewPrompt(prompt)
      setConfirmOpen(true)
    } catch {
      toast.error('Could not load the template for that niche')
    } finally { setBusy(false) }
  }

  // Two distinct outcomes, deliberately separate buttons in the dialog:
  // switch the niche only (keep the prompt), or switch AND replace the prompt.
  // A niche change never silently rewrites custom instructions.
  const apply = async (replacePrompt: boolean) => {
    if (!agent?.id) return
    setBusy(true)
    try {
      await organisationApi.updateAgent(agent.id, {
        niche: selected,
        ...(replacePrompt && previewPrompt ? { system_prompt: previewPrompt } : {}),
      })
      await queryClient.invalidateQueries({ queryKey: ['agents', orgId] })
      await queryClient.invalidateQueries()
      setConfirmOpen(false)
      toast.success(replacePrompt ? 'Niche and instructions updated' : 'Niche updated — instructions left as they were')
    } catch {
      toast.error('Failed to update the niche')
    } finally { setBusy(false) }
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="font-display text-base font-semibold mb-2">Agent niche</h2>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  if (!agent) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="font-display text-base font-semibold mb-2">Agent niche</h2>
        <p className="text-sm text-muted-foreground">This client has no agent yet.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="font-display text-base font-semibold mb-1">Agent niche</h2>
      <p className="text-xs text-muted-foreground mb-4">
        Sets the behavioural template the agent starts from. Chosen once during onboarding from the
        client's industry — correct it here if it no longer matches.
      </p>

      <div className="space-y-3">
        <select
          className="nz-input w-full"
          value={selected}
          onChange={e => setSelected(e.target.value)}
        >
          {!agent.niche && <option value="">— not set —</option>}
          {NICHES.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
        </select>

        {isCustomised && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" strokeWidth={1.5} />
            <p className="text-xs text-muted-foreground leading-relaxed">
              This client has customised their instructions — they differ from the
              {' '}{NICHES.find(n => n.value === agent.niche)?.label ?? agent.niche} template. Changing
              the niche will not overwrite that unless you explicitly choose to.
            </p>
          </div>
        )}

        <Button
          onClick={() => { void openConfirm() }}
          disabled={!dirty || busy || !selected}
          className="w-full"
        >
          {busy ? 'Checking…' : 'Change niche'}
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Change niche to {NICHES.find(n => n.value === selected)?.label ?? selected}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  The niche decides which behavioural template this agent's instructions come from.
                  It changes how the agent introduces itself and what it assumes customers are
                  asking about.
                </p>

                {isCustomised ? (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2">
                    <p className="text-xs leading-relaxed">
                      <span className="font-medium text-foreground">
                        This client has customised their instructions.
                      </span>{' '}
                      Replacing them will discard that customisation permanently. Choose
                      "Change niche only" to keep their current wording.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs">
                    Their current instructions match the existing template, so replacing them loses
                    nothing.
                  </p>
                )}

                {previewPrompt && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                      New template
                    </p>
                    <pre className="nz-mono text-[11px] bg-muted/40 border border-border rounded-md p-2.5 max-h-40 overflow-y-auto whitespace-pre-wrap">
                      {previewPrompt}
                    </pre>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button variant="outline" onClick={() => { void apply(false) }} disabled={busy}>
              Change niche only
            </Button>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void apply(true) }} disabled={busy}>
              Change niche and replace instructions
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default AgentNicheSection
