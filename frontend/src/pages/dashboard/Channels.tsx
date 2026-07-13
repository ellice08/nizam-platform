import { useState } from 'react'
import type { ComponentType } from 'react'
import { MessageSquare, Phone, Wifi, CheckCircle2, AlertCircle, Clock, Plus, Trash2, ChevronUp, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/nizam/Badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthStore } from '@/store'
import {
  useBranches,
  useWhatsappAccounts, useConnectWhatsapp, useDisconnectWhatsapp,
  useVoiceAccounts, useConnectVoice, useDisconnectVoice,
} from '@/hooks'
import type { WhatsAppAccount, VoiceAccount } from '@/api'
import type { Branch } from '@/types/api.types'

// ── Shared status bits ──────────────────────────────────────────────────────

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

// Summary badge for a channel section header, derived from its accounts —
// this is what makes each section's status data-driven instead of hardcoded.
const accountsSummaryBadge = (accounts: Array<{ status: string }> | undefined) => {
  const list = accounts ?? []
  const connected = list.filter(a => a.status === 'connected').length
  if (connected > 0) return <Badge variant="starter">{connected === 1 ? '1 connected' : `${connected} connected`}</Badge>
  if (list.length > 0) return <Badge variant="neutral">Pending setup</Badge>
  return <Badge variant="neutral">Not connected</Badge>
}

// ── Generic section shell — the channel registry renders through this ──────
// Adding a future channel means adding one entry to the `channels` array
// below; this component only needs an icon, copy, a status badge, and a body.

interface ChannelEntry {
  key: string
  name: string
  description: string
  icon: ComponentType<{ className?: string; strokeWidth?: number }>
  iconWrapClass: string
  iconClass: string
  statusBadge: React.ReactNode
  body: React.ReactNode
}

const ChannelSection = ({ name, description, icon: Icon, iconWrapClass, iconClass, statusBadge, body }: ChannelEntry) => (
  <div className="rounded-lg border border-border bg-surface overflow-hidden">
    <div className="flex items-center justify-between gap-3 px-6 py-5 border-b border-border">
      <div className="flex items-center gap-3">
        <div className={`h-9 w-9 rounded-lg ${iconWrapClass} flex items-center justify-center shrink-0`}>
          <Icon className={`h-4 w-4 ${iconClass}`} strokeWidth={1.5} />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{name}</p>
          <p className="text-xs text-[hsl(var(--text-tertiary))] mt-0.5">{description}</p>
        </div>
      </div>
      {statusBadge}
    </div>
    <div className="px-6 py-5 space-y-4">{body}</div>
  </div>
)

// ── Web chat body — embed snippet (moved here from Agent.tsx; that copy is
// left in place for now) plus a placeholder for upcoming appearance settings.

const WebChatBody = () => {
  const { organisationId } = useAuthStore()
  const widgetHost = import.meta.env.VITE_WIDGET_URL ?? window.location.origin
  const apiBase = import.meta.env.VITE_API_URL ?? 'https://nizam-platform-production.up.railway.app'
  const embedCode = `<script src="${widgetHost}/widget.js"\n  data-org-id="${organisationId ?? ''}"\n  data-api="${apiBase}"></script>`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(embedCode)
      toast.success('Copied to clipboard')
    } catch {
      toast.error('Failed to copy')
    }
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-[0.2em] text-[hsl(var(--text-secondary))] font-medium">
          Embed code
        </h3>
        <button
          onClick={handleCopy}
          className="text-xs text-[hsl(var(--text-secondary))] hover:text-foreground transition-colors flex items-center gap-1.5"
        >
          <Copy className="h-3 w-3" strokeWidth={1.5} /> Copy
        </button>
      </div>
      <pre className="nz-mono text-xs bg-background border border-border rounded-md p-4 overflow-x-auto text-[hsl(var(--text-secondary))] whitespace-pre-wrap break-all sm:whitespace-pre sm:break-normal">
{embedCode}
      </pre>
      <p className="text-xs text-[hsl(var(--text-tertiary))]">
        Paste this snippet into the <code className="nz-mono">&lt;head&gt;</code> of your website to activate the chat widget.
      </p>
      <p className="text-xs text-[hsl(var(--text-tertiary))] pt-3 border-t border-border">
        Appearance settings coming soon.
      </p>
    </>
  )
}

// ── WhatsApp body ────────────────────────────────────────────────────────────

const emptyWhatsappForm = {
  phoneNumberId: '',
  accessToken: '',
  verifyToken: '',
  displayPhoneNumber: '',
  wabaId: '',
  branchId: null as string | null,
}

const WhatsAppBody = ({
  accounts, accsLoading, branches,
}: { accounts: WhatsAppAccount[] | undefined; accsLoading: boolean; branches: Branch[] | undefined }) => {
  const { mutateAsync: connectAccount, isPending: connecting } = useConnectWhatsapp()
  const { mutateAsync: disconnectAccount, isPending: disconnecting } = useDisconnectWhatsapp()

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyWhatsappForm)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const set = (k: keyof typeof emptyWhatsappForm, v: string | null) =>
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
      setForm(emptyWhatsappForm)
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
      <p className="text-xs text-[hsl(var(--text-secondary))] leading-relaxed">
        You'll need your WhatsApp number's <strong className="text-foreground">Phone Number ID</strong>,
        a permanent <strong className="text-foreground">access token</strong>, and{' '}
        <strong className="text-foreground">WABA ID</strong> from your Meta WhatsApp Business setup.
        Paste them here to connect.
      </p>

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
              onClick={() => { setShowForm(false); setForm(emptyWhatsappForm) }}
              className="border-border text-[hsl(var(--text-secondary))]"
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </>
  )
}

// ── Voice body ───────────────────────────────────────────────────────────────

const emptyVoiceForm = {
  retellAgentId: '',
  agentName: '',
  phoneNumber: '',
  branchId: null as string | null,
}

const VoiceBody = ({
  accounts, accsLoading, branches,
}: { accounts: VoiceAccount[] | undefined; accsLoading: boolean; branches: Branch[] | undefined }) => {
  const { mutateAsync: connectAccount, isPending: connecting } = useConnectVoice()
  const { mutateAsync: disconnectAccount, isPending: disconnecting } = useDisconnectVoice()

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyVoiceForm)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const set = (k: keyof typeof emptyVoiceForm, v: string | null) =>
    setForm(f => ({ ...f, [k]: v }))

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.retellAgentId) {
      toast.error('Retell Agent ID is required.')
      return
    }
    try {
      await connectAccount({
        retellAgentId: form.retellAgentId.trim(),
        agentName:     form.agentName.trim() || undefined,
        phoneNumber:   form.phoneNumber.trim() || undefined,
        branchId:      form.branchId,
      })
      toast.success('Voice agent connected.')
      setForm(emptyVoiceForm)
      setShowForm(false)
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 409) {
        toast.error('This Retell agent is already connected.')
      } else {
        toast.error('Failed to connect. Check the Agent ID and try again.')
      }
    }
  }

  const handleDisconnect = async (acc: VoiceAccount) => {
    if (confirmDelete !== acc.id) {
      setConfirmDelete(acc.id)
      return
    }
    try {
      await disconnectAccount(acc.id)
      toast.success('Voice agent disconnected.')
    } catch {
      toast.error('Failed to disconnect.')
    } finally {
      setConfirmDelete(null)
    }
  }

  return (
    <>
      <p className="text-xs text-[hsl(var(--text-secondary))] leading-relaxed">
        Create a Custom LLM agent in your Retell dashboard pointed at our voice endpoint,
        then paste its <strong className="text-foreground">Agent ID</strong> here.
      </p>

      {accsLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
        </div>
      ) : (accounts ?? []).length === 0 ? (
        <p className="text-sm text-[hsl(var(--text-tertiary))] py-2">
          No voice agents connected yet.
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
                    {acc.agent_name || acc.retell_agent_id}
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
                  title="Disconnect this agent"
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

      <button
        type="button"
        onClick={() => { setShowForm(v => !v); setConfirmDelete(null) }}
        className="flex items-center gap-2 text-xs text-[hsl(var(--text-secondary))] hover:text-foreground transition-colors duration-150"
      >
        {showForm
          ? <><ChevronUp className="h-3.5 w-3.5" strokeWidth={1.5} /> Hide form</>
          : <><Plus className="h-3.5 w-3.5" strokeWidth={1.5} /> Connect a voice agent</>
        }
      </button>

      {showForm && (
        <form onSubmit={handleConnect} className="space-y-3 pt-1">
          <div>
            <label className="block text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-1.5">
              Retell Agent ID <span className="text-rose-400">*</span>
            </label>
            <input
              className="nz-input w-full font-mono"
              placeholder="agent_xxxxxxxxxxxxxxxx"
              value={form.retellAgentId}
              onChange={e => set('retellAgentId', e.target.value)}
              required
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-1.5">
                Agent name
              </label>
              <input
                className="nz-input w-full"
                placeholder="Front Desk"
                value={form.agentName}
                onChange={e => set('agentName', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-1.5">
                Phone number
              </label>
              <input
                className="nz-input w-full"
                placeholder="+234 800 000 0000"
                value={form.phoneNumber}
                onChange={e => set('phoneNumber', e.target.value)}
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
              Route calls to a specific branch, or the whole organisation.
            </p>
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              type="submit"
              disabled={connecting}
              className="bg-primary hover:bg-primary-hover text-primary-foreground"
              size="sm"
            >
              {connecting ? 'Connecting…' : 'Connect agent'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { setShowForm(false); setForm(emptyVoiceForm) }}
              className="border-border text-[hsl(var(--text-secondary))]"
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const Channels = () => {
  const { organisationId, tenantOrgId } = useAuthStore()
  const activeOrgId = tenantOrgId ?? organisationId ?? ''

  const { data: branches } = useBranches(activeOrgId)
  const { data: waAccounts, isLoading: waLoading } = useWhatsappAccounts()
  const { data: voiceAccounts, isLoading: voiceLoading } = useVoiceAccounts()

  // Channel registry — adding a future channel means adding one entry here.
  const channels: ChannelEntry[] = [
    {
      key: 'webchat',
      name: 'Web chat',
      description: 'Embedded on your site',
      icon: MessageSquare,
      iconWrapClass: 'bg-primary/10',
      iconClass: 'text-primary',
      statusBadge: <Badge variant="starter">Active</Badge>,
      body: <WebChatBody />,
    },
    {
      key: 'whatsapp',
      name: 'WhatsApp',
      description: 'Meta WhatsApp Business API',
      icon: Wifi,
      iconWrapClass: 'bg-green-500/10',
      iconClass: 'text-green-500',
      statusBadge: accountsSummaryBadge(waAccounts),
      body: <WhatsAppBody accounts={waAccounts} accsLoading={waLoading} branches={branches} />,
    },
    {
      key: 'voice',
      name: 'Voice',
      description: 'Inbound phone calls via Retell',
      icon: Phone,
      iconWrapClass: 'bg-blue-500/10',
      iconClass: 'text-blue-500',
      statusBadge: accountsSummaryBadge(voiceAccounts),
      body: <VoiceBody accounts={voiceAccounts} accsLoading={voiceLoading} branches={branches} />,
    },
  ]

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Channels"
        description="Connect the channels your AI agent operates on."
      />

      <div className="space-y-6 max-w-3xl">
        {channels.map(c => <ChannelSection key={c.key} {...c} />)}
      </div>
    </>
  )
}

export default Channels
