import { useState } from "react";
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
  const { organisationId, tenantOrgId } = useAuthStore()
  const activeOrgId = tenantOrgId ?? organisationId ?? ''
  const { data: stats, isLoading: statsLoading } = useOrganisationStats(activeOrgId)
  const { data: conversations } = useConversations({ limit: 100 })

  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d')

  const getDateCutoff = (range: '7d' | '30d' | '90d' | 'all') => {
    if (range === 'all') return null
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 90
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    return cutoff
  }

  const cutoff = getDateCutoff(dateRange)

  const filteredConversations = (conversations ?? []).filter(c => {
    if (!cutoff) return true
    return new Date(c.created_at) >= cutoff
  })

  const totalFiltered = filteredConversations.length
  const resolvedFiltered = filteredConversations.filter(c => c.resolved).length
  const todayFiltered = filteredConversations.filter(c => {
    const today = new Date()
    const d = new Date(c.created_at)
    return (
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear()
    )
  }).length
  const resolutionRate = totalFiltered
    ? `${Math.round((resolvedFiltered / totalFiltered) * 100)}%`
    : '—'

  const channelData = [
    { name: "Chat",     value: filteredConversations.filter(c => c.channel === 'chat').length },
    { name: "Voice",    value: filteredConversations.filter(c => c.channel === 'voice').length },
    { name: "WhatsApp", value: filteredConversations.filter(c => c.channel === 'whatsapp').length },
  ]

  return (
    <>
      <PageHeader
        eyebrow="Insights"
        title="Analytics"
        description="Volume, sentiment, and outcomes across channels."
      >
        <select
          className="nz-input w-44 h-9"
          value={dateRange}
          onChange={e => setDateRange(e.target.value as '7d' | '30d' | '90d' | 'all')}
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="all">All time</option>
        </select>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-4 mb-4">
        {statsLoading ? (
          [1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)
        ) : (
          <>
            <StatCard label="Total conversations" value={totalFiltered} />
            <StatCard label="Resolved"            value={resolvedFiltered} hint={resolutionRate} />
            <StatCard label="Today"               value={todayFiltered} />
            <StatCard label="Resolution rate"     value={resolutionRate} />
          </>
        )}
      </div>

      <p className="text-xs text-[hsl(var(--text-tertiary))] mb-6">
        {dateRange === 'all'
          ? 'Showing all time data'
          : `Showing last ${dateRange === '7d' ? '7' : dateRange === '30d' ? '30' : '90'} days`}
      </p>

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
