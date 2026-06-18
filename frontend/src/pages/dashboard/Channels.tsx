import { useState } from 'react'
import { MessageSquare, Phone, Wifi, CheckCircle2, AlertCircle, Clock, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/nizam/Badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthStore } from '@/store'
import { useBranches } from '@/hooks'
import { useWhatsappAccounts, useConnectWhatsapp, useDisconnectWhatsapp } from '@/hooks'
import type { WhatsAppAccount } from '@/api'

// ── Status badge ──────────────────────────────────────────────────────────────

const StatusBadge = ({ status }: { status: string }) => {
  if (status === 'connected') return <Badge variant="starter">Connected</Badge>
  if (status === 'error')     return <Badge variant="rose">Error</Badge>
  return <Badge variant="neutral">Pending</Badge>
}

const StatusIcon = ({ status }: { status: string }) => {
  if (status === 'connected') return <CheckCircle2 className="h-4 w-4 text-green-500" strokeWidth={1.5} />
  if (status === 'error')     return <AlertCircle className="h-4 w-4 text-rose-400" strokeWidth={1.5} />
  return <Clock className="h-4 w-4 text-[hsl(var(--text-tertiary))]" strokeWidth={1.5} />
}

// ── Empty connect form state ──────────────────────────────────────────────────

const emptyForm = {
  phoneNumberId: '',
  accessToken: '',
  verifyToken: '',
  displayPhoneNumber: '',
  wabaId: '',
  branchId: null as string | null,
}

// ── Main page ─────────────────────────────────────────────────────────────────

const Channels = () => {
  const { organisationId, tenantOrgId } = useAuthStore()
  const activeOrgId = tenantOrgId ?? organisationId ?? ''

  const { data: accounts, isLoading: accsLoading } = useWhatsappAccounts()
  const { data: branches } = useBranches(activeOrgId)
  const { mutateAsync: connectAccount, isPending: connecting } = useConnectWhatsapp()
  const { mutateAsync: disconnectAccount, isPending: disconnecting } = useDisconnectWhatsapp()

  const [showForm, setShowForm]         = useState(false)
  const [form, setForm]                 = useState(emptyForm)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const set = (k: keyof typeof emptyForm, v: string | null) =>
    setForm(f => ({ ...f, [k]: v }))

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.phoneNumberId || !form.accessToken || !form.verifyToken) {
      toast.error('Phone Number ID, Access Token, and Verify Token are required.')
      return
    }
    try {
      await connectAccount({
        phoneNumberId:      form.phoneNumberId.trim(),
        accessToken:        form.accessToken.trim(),
        verifyToken:        form.verifyToken.trim(),
        displayPhoneNumber: form.displayPhoneNumber.trim() || undefined,
        wabaId:             form.wabaId.trim() || undefined,
        branchId:           form.branchId,
      })
      toast.success('WhatsApp number connected.')
      setForm(emptyForm)
      setShowForm(false)
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 409) {
        toast.error('This WhatsApp number is already connected.')
      } else {
        toast.error('Failed to connect. Check your credentials and try again.')
      }
    }
  }

  const handleDisconnect = async (acc: WhatsAppAccount) => {
    if (confirmDelete !== acc.id) {
      setConfirmDelete(acc.id)
      return
    }
    try {
      await disconnectAccount(acc.id)
      toast.success('WhatsApp number disconnected.')
    } catch {
      toast.error('Failed to disconnect.')
    } finally {
      setConfirmDelete(null)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Channels"
        description="Connect the channels your AI agent operates on."
      />

      <div className="space-y-6 max-w-3xl">

        {/* ── Web Chat ──────────────────────────────────────────────────────── */}
        <div className="rounded-lg border border-border bg-surface p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <MessageSquare className="h-4 w-4 text-primary" strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Web chat</p>
                <p className="text-xs text-[hsl(var(--text-tertiary))] mt-0.5">
                  Embedded chat widget for your website
                </p>
              </div>
            </div>
            <Badge variant="starter">Active</Badge>
          </div>
        </div>

        {/* ── WhatsApp ─────────────────────────────────────────────────────── */}
        <div className="rounded-lg border border-border bg-surface overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-5 border-b border-border">
            <div className="h-9 w-9 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
              <Wifi className="h-4 w-4 text-green-500" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">WhatsApp</p>
              <p className="text-xs text-[hsl(var(--text-tertiary))] mt-0.5">
                Meta WhatsApp Business API
              </p>
            </div>
          </div>

          <div className="px-6 py-5 space-y-4">
            {/* Info block */}
            <p className="text-xs text-[hsl(var(--text-secondary))] leading-relaxed">
              You'll need your WhatsApp number's <strong className="text-foreground">Phone Number ID</strong>,
              a permanent <strong className="text-foreground">access token</strong>, and{' '}
              <strong className="text-foreground">WABA ID</strong> from your Meta WhatsApp Business setup.
              Paste them here to connect.
            </p>

            {/* Connected accounts list */}
            {accsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : (accounts ?? []).length === 0 ? (
              <p className="text-sm text-[hsl(var(--text-tertiary))] py-2">
                No WhatsApp numbers connected yet.
              </p>
            ) : (
              <div className="space-y-2">
                {(accounts ?? []).map(acc => (
                  <div
                    key={acc.id}
                    className="flex items-start justify-between gap-4 rounded-lg border border-border bg-background px-4 py-3"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <StatusIcon status={acc.status} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {acc.display_phone_number || acc.phone_number_id}
                        </p>
                        <p className="text-xs text-[hsl(var(--text-tertiary))] mt-0.5">
                          {acc.branch_id
                            ? `Branch: ${branches?.find(b => b.id === acc.branch_id)?.name ?? acc.branch_id}`
                            : 'Whole organisation'}
                        </p>
                        {acc.last_error && (
                          <p className="text-xs text-rose-400 mt-1 truncate">{acc.last_error}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={acc.status} />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDisconnect(acc)}
                        disabled={disconnecting}
                        className={
                          confirmDelete === acc.id
                            ? 'border-rose-400 text-rose-400 hover:bg-rose-400/10'
                            : 'border-border text-[hsl(var(--text-secondary))]'
                        }
                        title="Disconnect this number"
                      >
                        {confirmDelete === acc.id ? (
                          'Confirm?'
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Connect form toggle */}
            <button
              type="button"
              onClick={() => { setShowForm(v => !v); setConfirmDelete(null) }}
              className="flex items-center gap-2 text-xs text-[hsl(var(--text-secondary))] hover:text-foreground transition-colors duration-150"
            >
              {showForm
                ? <><ChevronUp className="h-3.5 w-3.5" strokeWidth={1.5} /> Hide form</>
                : <><Plus className="h-3.5 w-3.5" strokeWidth={1.5} /> Connect a number</>
              }
            </button>

            {showForm && (
              <form onSubmit={handleConnect} className="space-y-3 pt-1">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-1.5">
                      Phone Number ID <span className="text-rose-400">*</span>
                    </label>
                    <input
                      className="nz-input w-full"
                      placeholder="1234567890"
                      value={form.phoneNumberId}
                      onChange={e => set('phoneNumberId', e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-1.5">
                      Display number
                    </label>
                    <input
                      className="nz-input w-full"
                      placeholder="+234 800 000 0000"
                      value={form.displayPhoneNumber}
                      onChange={e => set('displayPhoneNumber', e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-1.5">
                    Access token <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="password"
                    className="nz-input w-full font-mono"
                    placeholder="Permanent access token from Meta"
                    value={form.accessToken}
                    onChange={e => set('accessToken', e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-1.5">
                      WABA ID
                    </label>
                    <input
                      className="nz-input w-full"
                      placeholder="WhatsApp Business Account ID"
                      value={form.wabaId}
                      onChange={e => set('wabaId', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-1.5">
                      Verify token <span className="text-rose-400">*</span>
                    </label>
                    <input
                      className="nz-input w-full font-mono"
                      placeholder="Token you set in Meta webhook config"
                      value={form.verifyToken}
                      onChange={e => set('verifyToken', e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-1.5">
                    Scope
                  </label>
                  <select
                    className="nz-input w-full"
                    value={form.branchId ?? ''}
                    onChange={e => set('branchId', e.target.value || null)}
                  >
                    <option value="">Whole organisation</option>
                    {(branches ?? []).map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-[hsl(var(--text-tertiary))]">
                    Route messages to a specific branch, or the whole organisation.
                  </p>
                </div>

                <div className="flex gap-2 pt-1">
                  <Button
                    type="submit"
                    disabled={connecting}
                    className="bg-primary hover:bg-primary-hover text-primary-foreground"
                    size="sm"
                  >
                    {connecting ? 'Connecting…' : 'Connect number'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => { setShowForm(false); setForm(emptyForm) }}
                    className="border-border text-[hsl(var(--text-secondary))]"
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* ── Voice ────────────────────────────────────────────────────────── */}
        <div className="rounded-lg border border-border bg-surface p-6 opacity-60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-elevated flex items-center justify-center shrink-0">
                <Phone className="h-4 w-4 text-[hsl(var(--text-secondary))]" strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Voice</p>
                <p className="text-xs text-[hsl(var(--text-tertiary))] mt-0.5">
                  Inbound and outbound phone calls
                </p>
              </div>
            </div>
            <Badge variant="neutral">Coming soon</Badge>
          </div>
        </div>

      </div>
    </>
  )
}

export default Channels
