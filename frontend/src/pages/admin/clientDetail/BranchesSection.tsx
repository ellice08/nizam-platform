import { useState } from 'react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { organisationApi } from '@/api'
import { useBranches, useCreateBranch } from '@/hooks'
import type { Branch } from '@/types/api.types'

// Branches (wizard Step 3) made re-editable. TIMEZONE matters most here: it
// was previously set once during onboarding and editable nowhere afterwards,
// even though the Agent page's business-hours/after-hours logic depends on it.
// Same option list the wizard's Step3Branches offers, kept in sync.
const TIMEZONES = [
  'Africa/Lagos',
  'Africa/Accra',
  'Africa/Nairobi',
  'Europe/London',
  'America/New_York',
]

type Draft = { name: string; location: string; timezone: string }

export function BranchesSection({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient()
  const { data: branches, isLoading } = useBranches(orgId)
  const createBranch = useCreateBranch()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>({ name: '', location: '', timezone: TIMEZONES[0] })
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['branches', orgId] })

  const startEdit = (b: Branch) => {
    setAdding(false)
    setConfirmDelete(null)
    setEditingId(b.id)
    setDraft({
      name: b.name ?? '',
      location: (b as unknown as { location?: string }).location ?? '',
      timezone: (b as unknown as { timezone?: string }).timezone ?? TIMEZONES[0],
    })
  }

  const saveEdit = async () => {
    if (!editingId) return
    if (!draft.name.trim()) { toast.error('Branch name is required'); return }
    setBusy(true)
    try {
      await organisationApi.updateBranch(orgId, editingId, {
        name: draft.name.trim(),
        location: draft.location.trim(),
        timezone: draft.timezone,
      })
      await refresh()
      setEditingId(null)
      toast.success('Branch updated')
    } catch {
      toast.error('Failed to update branch')
    } finally { setBusy(false) }
  }

  const saveNew = () => {
    if (!draft.name.trim()) { toast.error('Branch name is required'); return }
    createBranch.mutate(
      { orgId, payload: { name: draft.name.trim(), location: draft.location.trim(), timezone: draft.timezone } },
      {
        onSuccess: () => {
          void refresh()
          setAdding(false)
          setDraft({ name: '', location: '', timezone: TIMEZONES[0] })
          toast.success('Branch added')
        },
        onError: () => toast.error('Failed to add branch'),
      },
    )
  }

  const remove = async (branchId: string) => {
    if (confirmDelete !== branchId) { setConfirmDelete(branchId); return }
    setBusy(true)
    try {
      await organisationApi.deleteBranch(orgId, branchId)
      await refresh()
      toast.success('Branch removed')
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message
      toast.error(msg ?? 'Failed to remove branch')
    } finally {
      setBusy(false)
      setConfirmDelete(null)
    }
  }

  const list = branches ?? []

  const draftFields = (
    <div className="space-y-2 mt-2">
      <input
        className="nz-input w-full"
        placeholder="Branch name"
        value={draft.name}
        onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
      />
      <input
        className="nz-input w-full"
        placeholder="City / location"
        value={draft.location}
        onChange={e => setDraft(d => ({ ...d, location: e.target.value }))}
      />
      <div>
        <label className="block text-xs text-muted-foreground mb-1">
          Timezone — drives business hours and after-hours replies
        </label>
        <select
          className="nz-input w-full"
          value={draft.timezone}
          onChange={e => setDraft(d => ({ ...d, timezone: e.target.value }))}
        >
          {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
        </select>
      </div>
    </div>
  )

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-display text-base font-semibold">Branches</h2>
        <span className="text-xs text-muted-foreground">{list.length}</span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Each branch has its own agent, knowledge base and channels.
      </p>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <ul className="space-y-2">
          {list.map(b => {
            const branch = b as unknown as { id: string; name: string; location?: string; timezone?: string }
            const isEditing = editingId === branch.id
            return (
              <li key={branch.id} className="rounded-md border border-border px-3 py-2.5">
                {isEditing ? (
                  <>
                    {draftFields}
                    <div className="flex gap-2 mt-3">
                      <Button size="sm" onClick={() => { void saveEdit() }} disabled={busy}>
                        <Check className="h-3.5 w-3.5 mr-1.5" strokeWidth={1.5} />
                        {busy ? 'Saving…' : 'Save'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)} disabled={busy}>
                        Cancel
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{branch.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {branch.location || 'No location set'} · {branch.timezone || 'No timezone'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => startEdit(b)}>Edit</Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { void remove(branch.id) }}
                        disabled={busy || list.length <= 1}
                        title={list.length <= 1 ? 'An organisation must keep at least one branch' : 'Remove branch'}
                        className={confirmDelete === branch.id ? 'border-destructive text-destructive' : ''}
                      >
                        {confirmDelete === branch.id
                          ? 'Confirm?'
                          : <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {adding ? (
        <div className="rounded-md border border-border px-3 py-2.5 mt-2">
          {draftFields}
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={saveNew} disabled={createBranch.isPending}>
              {createBranch.isPending ? 'Adding…' : 'Add branch'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAdding(false)}>
              <X className="h-3.5 w-3.5 mr-1.5" strokeWidth={1.5} /> Cancel
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setEditingId(null)
            setDraft({ name: '', location: '', timezone: TIMEZONES[0] })
            setAdding(true)
          }}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-3"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} /> Add a branch
        </button>
      )}
    </div>
  )
}

export default BranchesSection
