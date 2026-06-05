import { useEffect, useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { PageHeader } from "@/components/PageHeader"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Plus, X, Phone, Mail, ArrowLeft, Send, LifeBuoy } from "lucide-react"
import { apiClient } from "@/lib/axios"
import { useAuthStore } from "@/store"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

type Ticket = {
  id: string
  subject: string
  priority: string
  status: string
  created_by_name: string | null
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
type SupportContact = { support_email: string; support_phone: string }

const STATUS_STYLES: Record<string, string> = {
  open: "bg-primary/10 text-primary",
  in_progress: "bg-yellow-500/10 text-yellow-600",
  resolved: "bg-green-500/10 text-green-600",
  closed: "bg-elevated text-[hsl(var(--text-tertiary))]",
}
const statusLabel = (s: string) => s.replace('_', ' ')

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
]

const StatusPill = ({ status }: { status: string }) => (
  <span className={cn("inline-flex items-center text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider whitespace-nowrap", STATUS_STYLES[status] ?? STATUS_STYLES.open)}>
    {statusLabel(status)}
  </span>
)

const VIEWER_ROLES = ['org_viewer', 'branch_viewer']

const Support = () => {
  const { role } = useAuthStore()
  const isViewer = VIEWER_ROLES.includes(role ?? '')

  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [contact, setContact] = useState<SupportContact | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [threadLoading, setThreadLoading] = useState(false)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)

  const [showCreate, setShowCreate] = useState(false)
  const [subject, setSubject] = useState('')
  const [priority, setPriority] = useState('normal')
  const [message, setMessage] = useState('')
  const [creating, setCreating] = useState(false)

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

  const fetchContact = async () => {
    try {
      const res = await apiClient.get('/api/support/contact')
      setContact(res.data.data)
    } catch { /* non-critical */ }
  }

  useEffect(() => { void fetchTickets(); void fetchContact() }, [])

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

  const selectedTicket = tickets.find(t => t.id === selectedId) ?? null

  const handleCreate = async () => {
    if (!subject.trim() || !message.trim()) {
      toast.error('Please enter a subject and message')
      return
    }
    try {
      setCreating(true)
      await apiClient.post('/api/support/tickets', {
        subject: subject.trim(),
        priority,
        message: message.trim(),
      })
      toast.success('Support ticket raised')
      setShowCreate(false)
      setSubject(''); setPriority('normal'); setMessage('')
      void fetchTickets()
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? 'Failed to raise ticket')
    } finally {
      setCreating(false)
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
    } catch {
      toast.error('Failed to send reply')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Organisation"
        title="Support"
        description="Raise a request and our team will follow up with you."
      />

      {/* Support contact bar — responsive: stacks on mobile */}
      <div className="rounded-lg border border-border bg-surface p-4 mb-6 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
        <div className="flex items-center gap-2 text-sm">
          <LifeBuoy className="h-4 w-4 text-primary shrink-0" strokeWidth={1.5} />
          <span className="text-[hsl(var(--text-secondary))]">Need direct help?</span>
        </div>
        {contact && (
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-6 sm:ml-auto">
            <a href={`mailto:${contact.support_email}`}
              className="flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors">
              <Mail className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
              <span className="break-all">{contact.support_email}</span>
            </a>
            <a href={`tel:${contact.support_phone}`}
              className="flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors">
              <Phone className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
              {contact.support_phone}
            </a>
          </div>
        )}
      </div>

      {/* MOBILE: when a ticket is selected, show only the thread (full width).
          DESKTOP: list + thread side by side. */}
      <div className="flex flex-col lg:flex-row gap-6">

        {/* Ticket list — hidden on mobile when a ticket is open */}
        <div className={cn(
          "flex-1 lg:max-w-[40%]",
          selectedId ? "hidden lg:block" : "block"
        )}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs uppercase tracking-[0.18em] text-[hsl(var(--text-secondary))] font-medium">
              Your tickets
            </h2>
            {!isViewer && (
              <Button size="sm" onClick={() => setShowCreate(true)}
                className="bg-primary hover:bg-primary-hover text-primary-foreground gap-1.5">
                <Plus className="h-3.5 w-3.5" strokeWidth={1.5} /> New
              </Button>
            )}
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
            </div>
          ) : tickets.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface px-6 py-10 text-center text-sm text-[hsl(var(--text-secondary))]">
              No tickets yet.{!isViewer && " Raise one and we'll be in touch."}
            </div>
          ) : (
            <div className="space-y-2">
              {tickets.map(t => (
                <button key={t.id} onClick={() => void openTicket(t.id)}
                  className={cn(
                    "w-full text-left rounded-lg border bg-surface px-4 py-3 transition-colors",
                    selectedId === t.id ? "border-primary" : "border-border hover:border-primary/50"
                  )}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-foreground text-sm truncate flex-1">{t.subject}</p>
                    <StatusPill status={t.status} />
                  </div>
                  <p className="text-xs text-[hsl(var(--text-tertiary))] mt-1 nz-mono">
                    {formatDistanceToNow(new Date(t.updated_at), { addSuffix: true })}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Thread — full width on mobile when open */}
        {selectedId && (
          <div className="flex-1 rounded-lg border border-border bg-surface flex flex-col min-h-[400px] lg:min-h-[500px]">
            <div className="flex items-center gap-3 px-4 sm:px-6 py-4 border-b border-border">
              <button onClick={() => setSelectedId(null)}
                className="lg:hidden text-[hsl(var(--text-secondary))] hover:text-foreground shrink-0">
                <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
              </button>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground truncate">{selectedTicket?.subject}</p>
                {selectedTicket && <div className="mt-1"><StatusPill status={selectedTicket.status} /></div>}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
              {threadLoading ? (
                <div className="space-y-3">
                  {[1, 2].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
                </div>
              ) : messages.map(m => (
                <div key={m.id} className={cn("flex", m.author_role === 'support' ? "justify-start" : "justify-end")}>
                  <div className={cn(
                    "max-w-[85%] rounded-lg px-4 py-2.5",
                    m.author_role === 'support'
                      ? "bg-elevated border border-border"
                      : "bg-primary/10 border border-primary/20"
                  )}>
                    <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--text-tertiary))] mb-1">
                      {m.author_role === 'support' ? 'Nizam Support' : (m.author_name ?? 'You')}
                    </p>
                    <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{m.body}</p>
                    <p className="text-[10px] text-[hsl(var(--text-tertiary))] mt-1.5 nz-mono">
                      {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {!isViewer && selectedTicket?.status !== 'closed' && (
              <div className="border-t border-border p-3 sm:p-4 flex gap-2">
                <textarea
                  className="nz-textarea flex-1 h-12 min-h-[3rem] max-h-32 resize-none"
                  placeholder="Type your reply…"
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleReply() }
                  }}
                />
                <Button onClick={() => void handleReply()} disabled={sending || !reply.trim()}
                  className="bg-primary hover:bg-primary-hover text-primary-foreground shrink-0 self-end">
                  <Send className="h-4 w-4" strokeWidth={1.5} />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create ticket modal — responsive */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 sm:p-8 shadow-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-xl text-foreground">Raise a support ticket</h2>
              <button onClick={() => setShowCreate(false)}
                className="text-[hsl(var(--text-tertiary))] hover:text-foreground">
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-2">Subject</label>
                <input className="nz-input w-full" value={subject}
                  onChange={e => setSubject(e.target.value)} placeholder="Brief summary of your issue" />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-2">Priority</label>
                <select className="nz-input w-full" value={priority} onChange={e => setPriority(e.target.value)}>
                  {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-2">Message</label>
                <textarea className="nz-textarea w-full h-32" value={message}
                  onChange={e => setMessage(e.target.value)} placeholder="Describe what you need help with…" />
              </div>
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-3 mt-6">
              <Button variant="outline" onClick={() => setShowCreate(false)} className="border-border flex-1">
                Cancel
              </Button>
              <Button onClick={() => void handleCreate()} disabled={creating}
                className="bg-primary hover:bg-primary-hover text-primary-foreground flex-1">
                {creating ? 'Submitting…' : 'Submit ticket'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default Support
