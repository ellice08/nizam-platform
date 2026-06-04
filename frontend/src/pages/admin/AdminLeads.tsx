import { useEffect, useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { PageHeader } from "@/components/PageHeader"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Mail, Send, X, Phone, Building2, CheckCircle2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { apiClient } from "@/lib/axios"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

type Lead = {
  id: string
  name: string
  email: string
  company: string | null
  phone: string | null
  industry: string | null
  message: string | null
  status: string
  notes: string | null
  created_at: string
  contacted_at: string | null
}

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'closed', label: 'Closed' },
]

const industryLabel: Record<string, string> = {
  real_estate: "Real estate",
  hospitality: "Hospitality",
  other: "Other",
}

const StatusPill = ({ status }: { status: string }) => {
  const styles: Record<string, string> = {
    new: "bg-primary/10 text-primary",
    contacted: "bg-green-500/10 text-green-600",
    closed: "bg-elevated text-[hsl(var(--text-tertiary))]",
  }
  return (
    <span className={cn("inline-flex items-center text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider", styles[status] ?? styles.new)}>
      {status}
    </span>
  )
}

const DEFAULT_INVITE_MESSAGE = `Thank you for your interest in Nizam.

I'd love to set up a short call to understand your needs and show you how Nizam can orchestrate AI voice and chat for your organisation.

Please use the link below to find a time that works for you, or simply reply to this email with your availability.`

const AdminLeads = () => {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState<Lead | null>(null)

  // Session invite modal
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteMessage, setInviteMessage] = useState(DEFAULT_INVITE_MESSAGE)
  const [schedulingLink, setSchedulingLink] = useState('')
  const [sending, setSending] = useState(false)

  const fetchLeads = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('interest_submissions')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      setLeads((data ?? []) as Lead[])
    } catch {
      toast.error('Failed to load leads')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void fetchLeads() }, [])

  const filtered = filter === 'all' ? leads : leads.filter(l => l.status === filter)

  const updateStatus = async (lead: Lead, status: string) => {
    try {
      const patch: Record<string, unknown> = { status }
      if (status === 'contacted') patch.contacted_at = new Date().toISOString()
      await supabase.from('interest_submissions').update(patch).eq('id', lead.id)
      toast.success(`Marked as ${status}`)
      void fetchLeads()
      if (selected?.id === lead.id) setSelected({ ...selected, status })
    } catch {
      toast.error('Failed to update status')
    }
  }

  const openMailto = (lead: Lead) => {
    const subject = encodeURIComponent('Your Nizam request')
    const body = encodeURIComponent(`Hello ${lead.name},\n\n`)
    window.location.href = `mailto:${lead.email}?subject=${subject}&body=${body}`
  }

  const sendInvite = async () => {
    if (!selected) return
    if (!inviteMessage.trim()) {
      toast.error('Message cannot be empty')
      return
    }
    try {
      setSending(true)
      await apiClient.post('/api/leads/session-invite', {
        to: selected.email,
        name: selected.name,
        message: inviteMessage,
        scheduling_link: schedulingLink.trim() || undefined,
      })
      toast.success(`Session invite sent to ${selected.email}`)
      await updateStatus(selected, 'contacted')
      setInviteOpen(false)
      setSchedulingLink('')
      setInviteMessage(DEFAULT_INVITE_MESSAGE)
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? 'Failed to send invite')
    } finally {
      setSending(false)
    }
  }

  const newCount = leads.filter(l => l.status === 'new').length

  return (
    <>
      <PageHeader
        eyebrow="Clients"
        title="Leads"
        description="Interest form submissions from prospective clients."
      />

      {/* Filter tabs */}
      <div className="flex items-center gap-1 rounded-md border border-border bg-card p-1 mb-6 w-fit">
        {STATUS_FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "px-3 py-1.5 text-xs rounded transition-colors duration-150",
              filter === f.key
                ? "bg-elevated text-foreground"
                : "text-[hsl(var(--text-secondary))] hover:text-foreground"
            )}
          >
            {f.label}
            {f.key === 'new' && newCount > 0 && (
              <span className="ml-1.5 text-primary">({newCount})</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex gap-6">
        {/* List */}
        <div className={cn("flex-1 transition-all", selected ? "max-w-[55%]" : "w-full")}>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-lg border border-border bg-card px-6 py-10 text-center text-muted-foreground">
              No leads in this view.
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(lead => (
                <button
                  key={lead.id}
                  onClick={() => setSelected(lead)}
                  className={cn(
                    "w-full text-left flex items-center gap-4 rounded-lg border bg-card px-5 py-4 transition-colors",
                    selected?.id === lead.id
                      ? "border-primary"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground truncate">{lead.name}</p>
                      <StatusPill status={lead.status} />
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {lead.company ?? '—'} · {lead.email}
                    </p>
                  </div>
                  <span className="text-xs text-[hsl(var(--text-tertiary))] nz-mono shrink-0">
                    {formatDistanceToNow(new Date(lead.created_at), { addSuffix: true })}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="w-[45%] rounded-lg border border-border bg-card p-6 h-fit sticky top-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="font-display text-xl text-foreground">{selected.name}</h2>
                <div className="mt-1"><StatusPill status={selected.status} /></div>
              </div>
              <button onClick={() => setSelected(null)}
                className="text-[hsl(var(--text-tertiary))] hover:text-foreground">
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>

            <div className="space-y-3 text-sm mb-6">
              <div className="flex items-center gap-2 text-[hsl(var(--text-secondary))]">
                <Mail className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                <span className="text-foreground">{selected.email}</span>
              </div>
              {selected.phone && (
                <div className="flex items-center gap-2 text-[hsl(var(--text-secondary))]">
                  <Phone className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                  <span className="text-foreground">{selected.phone}</span>
                </div>
              )}
              {selected.company && (
                <div className="flex items-center gap-2 text-[hsl(var(--text-secondary))]">
                  <Building2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                  <span className="text-foreground">{selected.company}</span>
                </div>
              )}
              {selected.industry && (
                <p className="text-xs text-[hsl(var(--text-tertiary))]">
                  Industry: {industryLabel[selected.industry] ?? selected.industry}
                </p>
              )}
            </div>

            {selected.message && (
              <div className="mb-6">
                <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-2 font-medium">
                  Their message
                </p>
                <div className="rounded-md border border-border bg-background p-3 text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                  {selected.message}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="space-y-2">
              <Button
                onClick={() => { setInviteOpen(true) }}
                className="w-full bg-primary hover:bg-primary-hover text-primary-foreground gap-2"
              >
                <Send className="h-3.5 w-3.5" strokeWidth={1.5} />
                Send session invite
              </Button>
              <Button
                variant="outline"
                onClick={() => openMailto(selected)}
                className="w-full border-border gap-2"
              >
                <Mail className="h-3.5 w-3.5" strokeWidth={1.5} />
                Open in mail client
              </Button>

              <div className="flex gap-2 pt-2">
                {selected.status !== 'contacted' && (
                  <Button variant="outline" size="sm"
                    onClick={() => void updateStatus(selected, 'contacted')}
                    className="flex-1 border-border text-xs gap-1">
                    <CheckCircle2 className="h-3 w-3" strokeWidth={1.5} />
                    Mark contacted
                  </Button>
                )}
                {selected.status !== 'closed' && (
                  <Button variant="outline" size="sm"
                    onClick={() => void updateStatus(selected, 'closed')}
                    className="flex-1 border-border text-xs">
                    Close
                  </Button>
                )}
                {selected.status !== 'new' && (
                  <Button variant="outline" size="sm"
                    onClick={() => void updateStatus(selected, 'new')}
                    className="flex-1 border-border text-xs">
                    Reopen
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Session invite modal */}
      {inviteOpen && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-8 shadow-lg">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-xl text-foreground">Send session invite</h2>
              <button onClick={() => setInviteOpen(false)}
                className="text-[hsl(var(--text-tertiary))] hover:text-foreground">
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>
            <p className="text-sm text-[hsl(var(--text-secondary))] mb-4">
              To: <span className="text-foreground">{selected.email}</span>
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-2">
                  Message
                </label>
                <textarea
                  className="nz-textarea h-40"
                  value={inviteMessage}
                  onChange={e => setInviteMessage(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-2">
                  Scheduling link (optional)
                </label>
                <input
                  className="nz-input w-full"
                  value={schedulingLink}
                  onChange={e => setSchedulingLink(e.target.value)}
                  placeholder="https://calendly.com/..."
                />
                <p className="text-xs text-[hsl(var(--text-tertiary))] mt-1.5">
                  Adds a "Schedule a conversation" button to the email.
                </p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <Button onClick={() => void sendInvite()} disabled={sending}
                className="flex-1 bg-primary hover:bg-primary-hover text-primary-foreground">
                {sending ? 'Sending…' : 'Send invite'}
              </Button>
              <Button variant="outline" onClick={() => setInviteOpen(false)}
                className="border-border">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default AdminLeads
