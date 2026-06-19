import { formatDistanceToNow } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/nizam/StatCard";
import { Badge } from "@/components/nizam/Badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Phone, MessageSquare, MessageCircle, CircleDot, Inbox } from "lucide-react";
import { useAuthStore } from '@/store'
import { useOrganisation, useOrganisationStats, useConversations, useWhatsappAccounts } from '@/hooks'

const channelIcon = (c: string) =>
  c === "voice" ? Phone : c === "whatsapp" ? MessageCircle : MessageSquare;

type Tone = 'active' | 'pending' | 'idle'

const dotColor: Record<Tone, string> = {
  active:  '#4CAF50',
  pending: '#F59E0B',
  idle:    'hsl(var(--text-secondary))',
}

const DashboardOverview = () => {
  const navigate = useNavigate()
  const { organisationId, tenantOrgId } = useAuthStore()
  const activeOrgId = tenantOrgId ?? organisationId ?? ''
  const { data: org } = useOrganisation(activeOrgId)
  const { data: stats, isLoading: statsLoading } = useOrganisationStats(activeOrgId)
  const { data: conversations, isLoading: convsLoading } = useConversations({ limit: 5 })
  const { data: waAccounts } = useWhatsappAccounts()

  const waConnected = (waAccounts ?? []).filter(a => a.status === 'connected').length
  const waTotal     = (waAccounts ?? []).length

  const channels: Array<{ name: string; icon: typeof MessageSquare; status: string; tone: Tone; link?: string }> = [
    { name: 'Web chat',  icon: MessageSquare,  status: 'Active',        tone: 'active' },
    { name: 'WhatsApp',  icon: MessageCircle,
      status: waConnected > 0
        ? (waConnected === 1 ? '1 connected' : `${waConnected} connected`)
        : waTotal > 0 ? 'Pending setup' : 'Not connected',
      tone: waConnected > 0 ? 'active' : waTotal > 0 ? 'pending' : 'idle',
      link: '/dashboard/channels',
    },
    { name: 'Voice',     icon: Phone,          status: 'Coming soon',   tone: 'idle'   },
  ]

  const resolutionHint = stats?.total_conversations
    ? `${Math.round((stats.resolved_conversations / stats.total_conversations) * 100)}% resolution`
    : undefined

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title={org ? `Good day, ${org.name}.` : 'Good day.'}
        description="A composed view of your AI conversations, knowledge, and performance."
      />

      <div className="grid gap-4 md:grid-cols-4 mb-10">
        {statsLoading ? (
          [1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)
        ) : (
          <>
            <StatCard label="Conversations today" value={stats?.conversations_today ?? 0} />
            <StatCard label="Resolved"            value={stats?.resolved_conversations ?? 0} hint={resolutionHint} />
            <StatCard label="Active branches"     value={stats?.active_branches ?? 0} />
            <StatCard label="Total conversations" value={stats?.total_conversations ?? 0} />
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2 rounded-lg border border-border bg-surface">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h2 className="text-xs uppercase tracking-[0.2em] text-[hsl(var(--text-secondary))] font-medium">
              Recent conversations
            </h2>
          </div>

          {convsLoading ? (
            <div className="divide-y divide-border">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-start gap-4 px-6 py-4">
                  <Skeleton className="h-8 w-8 rounded-md shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <Skeleton className="h-3 w-10 shrink-0" />
                </div>
              ))}
            </div>
          ) : !conversations || conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Inbox className="h-8 w-8 text-[hsl(var(--text-tertiary))]" strokeWidth={1.5} />
              <p className="mt-3 text-sm text-[hsl(var(--text-secondary))]">No conversations yet.</p>
              <p className="mt-1 text-xs text-[hsl(var(--text-tertiary))]">
                They will appear here once customers start reaching out.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {conversations.slice(0, 5).map((conv) => {
                const Icon = channelIcon(conv.channel);
                return (
                  <li key={conv.id} className="flex items-start gap-4 px-6 py-4 hover:bg-elevated transition-colors duration-150">
                    <div className="h-8 w-8 rounded-md border border-border bg-background flex items-center justify-center shrink-0">
                      <Icon className="h-3.5 w-3.5 text-[hsl(var(--text-secondary))]" strokeWidth={1.5} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">
                        {conv.lead_name ?? conv.lead_phone ?? 'Unknown'}
                      </p>
                      <p className="text-xs text-[hsl(var(--text-secondary))] truncate mt-0.5 capitalize">
                        {conv.channel} · {conv.resolved ? 'Resolved' : 'Open'}
                      </p>
                    </div>
                    <span className="text-xs text-[hsl(var(--text-tertiary))] nz-mono shrink-0">
                      {formatDistanceToNow(new Date(conv.created_at), { addSuffix: true })}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-border bg-surface">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-xs uppercase tracking-[0.2em] text-[hsl(var(--text-secondary))] font-medium">
              Channels
            </h2>
          </div>
          <ul className="divide-y divide-border">
            {channels.map((c) => {
              const Icon = c.icon;
              return (
                <li
                  key={c.name}
                  onClick={c.link ? () => navigate(c.link!) : undefined}
                  className={`flex items-center gap-3 px-6 py-4 transition-colors duration-150${c.link ? ' cursor-pointer hover:bg-elevated' : ''}`}
                >
                  <Icon className="h-4 w-4 text-[hsl(var(--text-secondary))]" strokeWidth={1.5} />
                  <span className="text-sm text-foreground flex-1">{c.name}</span>
                  <CircleDot className="h-3 w-3" style={{ color: dotColor[c.tone] }} strokeWidth={1.5} />
                  <Badge variant={c.tone === 'active' ? 'starter' : 'neutral'}>{c.status}</Badge>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </>
  );
};

export default DashboardOverview;
