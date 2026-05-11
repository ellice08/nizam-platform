import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/nizam/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuthStore } from '@/store'
import { useOrganisationStats, useConversations } from '@/hooks'

const sentimentData = [
  { day: "Mon", score: 0.62 },
  { day: "Tue", score: 0.71 },
  { day: "Wed", score: 0.68 },
  { day: "Thu", score: 0.74 },
  { day: "Fri", score: 0.78 },
  { day: "Sat", score: 0.81 },
  { day: "Sun", score: 0.76 },
];

const topics = [
  { topic: "Pricing & availability", share: 38 },
  { topic: "Tour scheduling",        share: 24 },
  { topic: "Tenancy questions",      share: 16 },
  { topic: "Payment & deposits",     share: 12 },
  { topic: "Other",                  share: 10 },
];

const Analytics = () => {
  const { organisationId } = useAuthStore()
  const { data: stats, isLoading: statsLoading } = useOrganisationStats(organisationId ?? '')
  const { data: conversations } = useConversations({ limit: 100 })

  const channelData = [
    { name: "Chat",     value: conversations?.filter(c => c.channel === 'chat').length     ?? 0 },
    { name: "Voice",    value: conversations?.filter(c => c.channel === 'voice').length    ?? 0 },
    { name: "WhatsApp", value: conversations?.filter(c => c.channel === 'whatsapp').length ?? 0 },
  ]

  const resolutionRate = stats?.total_conversations
    ? `${Math.round((stats.resolved_conversations / stats.total_conversations) * 100)}%`
    : '—'

  return (
    <>
      <PageHeader
        eyebrow="Insights"
        title="Analytics"
        description="Volume, sentiment, and outcomes across channels."
      >
        <select className="nz-input w-44 h-9">
          <option>Last 7 days</option>
          <option>Last 30 days</option>
          <option>Last 90 days</option>
        </select>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-4 mb-10">
        {statsLoading ? (
          [1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)
        ) : (
          <>
            <StatCard label="Total conversations" value={stats?.total_conversations ?? 0} />
            <StatCard label="Resolved"            value={stats?.resolved_conversations ?? 0} hint={resolutionRate} />
            <StatCard label="Today"               value={stats?.conversations_today ?? 0} />
            <StatCard label="Resolution rate"     value={resolutionRate} />
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-10">
        {/* Channel bar chart — real data */}
        <div className="rounded-lg border border-border bg-surface p-6">
          <h3 className="text-xs uppercase tracking-[0.2em] text-[hsl(var(--text-secondary))] font-medium mb-6">
            Conversations by channel
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={channelData}>
                <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" stroke="hsl(var(--text-secondary))" fontSize={11} />
                <YAxis stroke="hsl(var(--text-secondary))" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--elevated))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  cursor={{ fill: "hsl(var(--elevated))" }}
                />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sentiment line chart — placeholder */}
        <div className="rounded-lg border border-border bg-surface p-6">
          <h3 className="text-xs uppercase tracking-[0.2em] text-[hsl(var(--text-secondary))] font-medium mb-6">
            Sentiment over time
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sentimentData}>
                <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="day" stroke="hsl(var(--text-secondary))" fontSize={11} />
                <YAxis stroke="hsl(var(--text-secondary))" fontSize={11} domain={[0, 1]} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--elevated))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                />
                <Line type="monotone" dataKey="score" stroke="hsl(var(--rose))" strokeWidth={2} dot={{ fill: "hsl(var(--rose))", r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-4 text-xs text-[hsl(var(--text-tertiary))]">
            Sentiment and topic analysis activates after your first 10 conversations.
          </p>
        </div>
      </div>

      {/* Topics — placeholder */}
      <div className="rounded-lg border border-border bg-surface p-6">
        <h3 className="text-xs uppercase tracking-[0.2em] text-[hsl(var(--text-secondary))] font-medium mb-4">
          Top topics
        </h3>
        <div className="space-y-3">
          {topics.map((t) => (
            <div key={t.topic}>
              <div className="flex items-center justify-between text-sm">
                <span className="text-foreground">{t.topic}</span>
                <span className="nz-mono text-[hsl(var(--text-secondary))]">{t.share}%</span>
              </div>
              <div className="mt-2 h-1.5 bg-elevated rounded-sm overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${t.share * 2}%` }} />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-6 text-xs text-[hsl(var(--text-tertiary))]">
          Sentiment and topic analysis activates after your first 10 conversations.
        </p>
      </div>
    </>
  );
};

export default Analytics;
