import { useEffect, useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { PageHeader } from "@/components/PageHeader"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Send, ArrowLeft, Settings2, X } from "lucide-react"
import { apiClient } from "@/lib/axios"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { useHighlightOnArrival } from "@/hooks"

type Ticket = {
  id: string
  organisation_id: string
  organisation_name: string | null
  ticket_number: number | null
  subject: string
  priority: string
  status: string
  created_by_name: string | null
  created_by_email: string | null
  created_by_role: string | null
  created_at: string
  updated_at: string
}
type Message = {
  id: string
  author_role: string
  author_name: string | null
  body: string
  created_at: string
}

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'closed', label: 'Closed' },
]
const STATUS_STYLES: Record<string, string> = {
  open: "bg-primary/10 text-primary",
  in_progress: "bg-yellow-500/10 text-yellow-600",
  resolved: "bg-green-500/10 text-green-600",
  closed: "bg-elevated text-[hsl(var(--text-tertiary))]",
}
const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-rose-500/10 text-rose-500",
  normal: "bg-elevated text-[hsl(var(--text-secondary))]",
  low: "bg-elevated text-[hsl(var(--text-tertiary))]",
}
const statusLabel = (s: string) => s.replace('_', ' ')

const roleLabel = (r: string | null) => {
  if (!r) return ''
  return ({
    org_admin: 'Org Admin',
    branch_admin: 'Branch Admin',
    branch_staff: 'Staff',
    org_viewer: 'Org Viewer',
    branch_viewer: 'Branch Viewer',
  } as Record<string, string>)[r] ?? r
}

const StatusPill = ({ status }: { status: string }) => (
  <span className={cn("inline-flex items-center text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider whitespace-nowrap", STATUS_STYLES[status] ?? STATUS_STYLES.open)}>
    {statusLabel(status)}
  </span>
)

const AdminSupport = () => {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [threadLoading, setThreadLoading] = useState(false)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)

  // Contact editor modal
  const [contactOpen, setContactOpen] = useState(false)
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [savingContact, setSavingContact] = useState(false)

  const fetchTickets = async () => {
    try {
      setLoading(true)
      const res = await apiClient.get('/api/support/tickets')
      setTickets(res.data.data ?? [])
    } catch {
      toast.error('Failed to load tickets')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void fetchTickets() }, [])

  const filtered = filter === 'all' ? tickets : tickets.filter(t => t.status === filter)
  const selectedTicket = tickets.find(t => t.id === selectedId) ?? null

  const openTicket = async (id: string) => {
    setSelectedId(id)
    setThreadLoading(true)
    try {
      const res = await apiClient.get(`/api/support/tickets/${id}`)
      setMessages(res.data.data.messages ?? [])
    } catch {
      toast.error('Failed to load conversation')
    } finally {
      setThreadLoading(false)
    }
  }

  const handleReply = async () => {
    if (!reply.trim() || !selectedId) return
    try {
      setSending(true)
      await apiClient.post(`/api/support/tickets/${selectedId}/messages`, { body: reply.trim() })
      setReply('')
      await openTicket(selectedId)
      void fetchTickets()
      toast.success('Reply sent — client notified by email')
    } catch {
      toast.error('Failed to send reply')
    } finally {
      setSending(false)
    }
  }

  const setStatus = async (status: string) => {
    if (!selectedId) return
    try {
      await apiClient.patch(`/api/support/tickets/${selectedId}/status`, { status })
      toast.success(`Marked ${statusLabel(status)}`)
      void fetchTickets()
    } catch {
      toast.error('Failed to update status')
    }
  }

  const openContactEditor = async () => {
    if (!selectedTicket) return
    try {
      const res = await apiClient.get('/api/support/contact')
      setContactEmail(res.data.data?.support_email ?? '')
      setContactPhone(res.data.data?.support_phone ?? '')
    } catch { /* defaults */ }
    setContactOpen(true)
  }

  const saveContact = async () => {
    if (!selectedTicket) return
    try {
      setSavingContact(true)
      await apiClient.put('/api/support/contact', {
        organisation_id: selectedTicket.organisation_id,
        support_email: contactEmail.trim() || undefined,
        support_phone: contactPhone.trim() || undefined,
      })
      toast.success('Support contact updated for this client')
      setContactOpen(false)
    } catch {
      toast.error('Failed to save contact')
    } finally {
      setSavingContact(false)
    }
  }

  const openCount = tickets.filter(t => t.status === 'open').length

  const { targetId, isFlashing } = useHighlightOnArrival('t', !loading && tickets.length > 0)

  // Auto-open the deep-linked ticket when arriving from a notification.
  useEffect(() => {
    if (targetId && targetId !== selectedId) {
      setSelectedId(targetId)
      void openTicket(targetId)
    }
  }, [targetId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <PageHeader
        eyebrow="Clients"
        title="Support"
        description="Support tickets raised by clients across all organisations."
      />

      {/* Filter tabs — scrollable on mobile */}
      <div className="overflow-x-auto -mx-1 px-1 mb-6">
        <div className="flex items-center gap-1 rounded-md border border-border bg-card p-1 w-fit">
          {STATUS_FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={cn(
                "px-3 py-1.5 text-xs rounded transition-colors duration-150 whitespace-nowrap",
                filter === f.key ? "bg-elevated text-foreground" : "text-[hsl(var(--text-secondary))] hover:text-foreground"
              )}>
              {f.label}
              {f.key === 'open' && openCount > 0 && <span className="ml-1.5 text-primary">({openCount})</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">

        {/* List — hidden on mobile when a ticket is open */}
        <div className={cn("flex-1 lg:max-w-[40%]", selectedId ? "hidden lg:block" : "block")}>
          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="rounded-lg border border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
              No tickets in this view.
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(t => (
                <button key={t.id} onClick={() => void openTicket(t.id)}
                  className={cn(
                    "w-full text-left rounded-lg border bg-card px-4 py-3 transition-colors",
                    selectedId === t.id ? "border-primary" : "border-border hover:border-primary/50",
                    isFlashing(t.id) && "nz-flash",
                  )}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {t.ticket_number && (
                          <span className="text-[10px] nz-mono text-primary shrink-0">#{t.ticket_number}</span>
                        )}
                        <p className="font-medium text-foreground text-sm truncate">{t.subject}</p>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {t.organisation_name ?? 'Unknown org'}
                      </p>
                    </div>
                    <StatusPill status={t.status} />
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider", PRIORITY_STYLES[t.priority] ?? PRIORITY_STYLES.normal)}>
                      {t.priority}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {t.created_by_name ?? t.created_by_email ?? 'Client'}
                      {t.created_by_role && (
                        <span className="text-[hsl(var(--text-tertiary))]"> · {roleLabel(t.created_by_role)}</span>
                      )}
                    </span>
                    <span className="text-[10px] text-[hsl(var(--text-tertiary))] nz-mono ml-auto">
                      {formatDistanceToNow(new Date(t.updated_at), { addSuffix: true })}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Thread */}
        {selectedId && (
          <div className="flex-1 rounded-lg border border-border bg-card flex flex-col min-h-[400px] lg:min-h-[520px]">
            <div className="flex items-center gap-3 px-4 sm:px-6 py-4 border-b border-border">
              <button onClick={() => setSelectedId(null)}
                className="lg:hidden text-[hsl(var(--text-secondary))] hover:text-foreground shrink-0">
                <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {selectedTicket?.ticket_number && (
                    <span className="text-[11px] nz-mono text-primary shrink-0">#{selectedTicket.ticket_number}</span>
                  )}
                  <p className="font-medium text-foreground truncate">{selectedTicket?.subject}</p>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {selectedTicket?.organisation_name ?? 'Unknown org'}
                  {' · '}
                  {selectedTicket?.created_by_name ?? selectedTicket?.created_by_email}
                  {selectedTicket?.created_by_role && ` (${roleLabel(selectedTicket.created_by_role)})`}
                </p>
              </div>
              <button onClick={() => void openContactEditor()}
                title="Edit support contact for this client"
                className="text-[hsl(var(--text-secondary))] hover:text-foreground shrink-0">
                <Settings2 className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>

            {/* Status actions — wrap on mobile */}
            <div className="flex flex-wrap gap-2 px-4 sm:px-6 py-3 border-b border-border">
              {['open','in_progress','resolved','closed'].map(s => (
                <button key={s} onClick={() => void setStatus(s)}
                  className={cn(
                    "text-[11px] px-2.5 py-1 rounded-full border transition-colors",
                    selectedTicket?.status === s
                      ? "border-primary text-primary bg-primary/5"
                      : "border-border text-[hsl(var(--text-secondary))] hover:text-foreground"
                  )}>
                  {statusLabel(s)}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
              {threadLoading ? (
                <div className="space-y-3">{[1,2].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
              ) : messages.map(m => (
                <div key={m.id} className={cn("flex", m.author_role === 'support' ? "justify-end" : "justify-start")}>
                  <div className={cn(
                    "max-w-[85%] rounded-lg px-4 py-2.5",
                    m.author_role === 'support' ? "bg-primary/10 border border-primary/20" : "bg-elevated border border-border"
                  )}>
                    <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--text-tertiary))] mb-1">
                      {m.author_role === 'support' ? 'You (Support)' : (m.author_name ?? 'Client')}
                    </p>
                    <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{m.body}</p>
                    <p className="text-[10px] text-[hsl(var(--text-tertiary))] mt-1.5 nz-mono">
                      {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-border p-3 sm:p-4 flex gap-2">
              <textarea
                className="nz-textarea flex-1 h-12 min-h-[3rem] max-h-32 resize-none"
                placeholder="Reply to the client… (they'll be emailed)"
                value={reply}
                onChange={e => setReply(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleReply() } }}
              />
              <Button onClick={() => void handleReply()} disabled={sending || !reply.trim()}
                className="bg-primary hover:bg-primary-hover text-primary-foreground shrink-0 self-end">
                <Send className="h-4 w-4" strokeWidth={1.5} />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Contact editor modal */}
      {contactOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 sm:p-8 shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-display text-xl text-foreground">Support contact</h2>
              <button onClick={() => setContactOpen(false)} className="text-[hsl(var(--text-tertiary))] hover:text-foreground">
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>
            <p className="text-xs text-[hsl(var(--text-tertiary))] mb-6">
              Override the support email and phone shown to this client. Leave blank to use the Ellice Systems default.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-2">Support email</label>
                <input className="nz-input w-full" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="Alameenellice@gmail.com" />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-2">Support phone</label>
                <input className="nz-input w-full" value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="07033788353" />
              </div>
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-3 mt-6">
              <Button variant="outline" onClick={() => setContactOpen(false)} className="border-border flex-1">Cancel</Button>
              <Button onClick={() => void saveContact()} disabled={savingContact}
                className="bg-primary hover:bg-primary-hover text-primary-foreground flex-1">
                {savingContact ? 'Saving…' : 'Save contact'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default AdminSupport
