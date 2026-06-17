import { useState, useMemo } from "react";
import { format, parseISO } from "date-fns";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/nizam/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuthStore } from "@/store";
import { useAnalyticsOverview, useAnalyticsVolume, useOrgIntents } from "@/hooks";
import { buildIntentLabelMap, intentLabel } from "@/lib/intentLabels";

// Backend returns conversion_rate / escalation_rate already as percent (0-100 scale,
// e.g. 45.0 for 45%). Just round and append the symbol.
function formatPct(x: number | undefined | null): string {
  if (x === undefined || x === null) return "—";
  return `${Math.round(x)}%`;
}

const Analytics = () => {
  const { organisationId, tenantOrgId } = useAuthStore();
  const activeOrgId = tenantOrgId ?? organisationId ?? "";
  const { data: orgIntents } = useOrgIntents(activeOrgId);
  const intentMap = useMemo(() => buildIntentLabelMap(orgIntents ?? []), [orgIntents]);

  const [dateRange, setDateRange] = useState<"7d" | "30d" | "90d" | "all">("30d");

  const { from, to } = useMemo(() => {
    const toD = new Date();
    if (dateRange === "all") return { from: undefined, to: undefined };
    const days = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90;
    const fromD = new Date();
    fromD.setDate(fromD.getDate() - days);
    return { from: fromD.toISOString(), to: toD.toISOString() };
  }, [dateRange]);

  const { data: overview, isLoading: ovLoading } = useAnalyticsOverview(from, to);
  const { data: volume, isLoading: volLoading } = useAnalyticsVolume(from, to);

  const isCrossClient = !!overview?.per_client;

  const breakdown = overview?.intent_breakdown ?? [];

  const realIntents = breakdown
    .filter(i => i.intent && i.intent !== "none" && i.intent !== "general")
    .map(i => ({ label: intentLabel(i.intent, intentMap), count: i.count }));

  const generalCount = breakdown
    .filter(i => i.intent === "general")
    .reduce((s, i) => s + i.count, 0);

  const noneCount = breakdown
    .filter(i => !i.intent || i.intent === "none")
    .reduce((s, i) => s + i.count, 0);

  const chartData = [
    ...realIntents,
    ...(generalCount > 0 ? [{ label: "General enquiry", count: generalCount }] : []),
    ...(noneCount > 0 ? [{ label: "No intent", count: noneCount }] : []),
  ].sort((a, b) => b.count - a.count);

  const volumeIsEmpty =
    !volume || volume.length === 0 || volume.every(p => p.conversations === 0);

  const perClient = (overview?.per_client ?? [])
    .slice()
    .sort((a, b) => b.total_conversations - a.total_conversations);

  return (
    <>
      <PageHeader
        eyebrow="Insights"
        title="Analytics"
        description="Volume, conversion, and intent breakdown across all channels."
      >
        <select
          className="nz-input w-44 h-9"
          value={dateRange}
          onChange={e => setDateRange(e.target.value as "7d" | "30d" | "90d" | "all")}
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="all">All time</option>
        </select>
      </PageHeader>

      {/* Stat cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        {ovLoading ? (
          [1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)
        ) : (
          <>
            <StatCard
              label="Total conversations"
              value={overview?.total_conversations ?? 0}
            />
            <StatCard
              label="Leads captured"
              value={overview?.leads_captured ?? 0}
            />
            <StatCard
              label="Conversion rate"
              value={formatPct(overview?.conversion_rate)}
            />
            <StatCard
              label="Escalation rate"
              value={formatPct(overview?.escalation_rate)}
              hint={`${overview?.escalations ?? 0} escalated`}
            />
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-6">
        {/* Volume trend */}
        <div className="rounded-lg border border-border bg-surface p-6">
          <h3 className="text-xs uppercase tracking-[0.2em] text-[hsl(var(--text-secondary))] font-medium mb-6">
            Conversations over time
          </h3>
          {volLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : volumeIsEmpty ? (
            <div className="h-64 flex items-center justify-center">
              <p className="text-sm text-[hsl(var(--text-tertiary))]">
                No conversations in this range yet.
              </p>
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={volume}>
                  <defs>
                    <linearGradient id="convGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="date"
                    stroke="hsl(var(--text-secondary))"
                    fontSize={11}
                    tickFormatter={d => format(parseISO(d as string), "MMM d")}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    stroke="hsl(var(--text-secondary))"
                    fontSize={11}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--elevated))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelFormatter={d => format(parseISO(d as string), "dd MMM yyyy")}
                  />
                  <Area
                    type="monotone"
                    dataKey="conversations"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#convGrad)"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Intent breakdown */}
        <div className="rounded-lg border border-border bg-surface p-6">
          <h3 className="text-xs uppercase tracking-[0.2em] text-[hsl(var(--text-secondary))] font-medium mb-6">
            What customers want
          </h3>
          {ovLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : chartData.length === 0 ? (
            <div className="h-64 flex items-center justify-center">
              <p className="text-sm text-[hsl(var(--text-tertiary))]">
                No conversations in this range yet.
              </p>
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={chartData} margin={{ left: 8, right: 16 }}>
                  <CartesianGrid stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis
                    type="number"
                    stroke="hsl(var(--text-secondary))"
                    fontSize={11}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    stroke="hsl(var(--text-secondary))"
                    fontSize={11}
                    width={120}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--elevated))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    cursor={{ fill: "hsl(var(--elevated))" }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Cross-client table (super_admin normal mode only) */}
      {isCrossClient && perClient.length > 0 && (
        <div className="rounded-lg border border-border bg-surface overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="text-xs uppercase tracking-[0.2em] text-[hsl(var(--text-secondary))] font-medium">
              By client
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-elevated">
                <tr>
                  <th className="px-6 py-3 text-left text-xs uppercase tracking-[0.18em] text-[hsl(var(--text-secondary))] font-medium">
                    Client
                  </th>
                  <th className="px-6 py-3 text-right text-xs uppercase tracking-[0.18em] text-[hsl(var(--text-secondary))] font-medium">
                    Conversations
                  </th>
                  <th className="px-6 py-3 text-right text-xs uppercase tracking-[0.18em] text-[hsl(var(--text-secondary))] font-medium">
                    Leads
                  </th>
                  <th className="px-6 py-3 text-right text-xs uppercase tracking-[0.18em] text-[hsl(var(--text-secondary))] font-medium">
                    Conversion
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {perClient.map(c => (
                  <tr key={c.org_id} className="bg-background hover:bg-elevated transition-colors duration-150">
                    <td className="px-6 py-3 font-medium text-foreground">{c.org_name}</td>
                    <td className="px-6 py-3 text-right nz-mono text-[hsl(var(--text-secondary))]">
                      {c.total_conversations}
                    </td>
                    <td className="px-6 py-3 text-right nz-mono text-[hsl(var(--text-secondary))]">
                      {c.leads_captured}
                    </td>
                    <td className="px-6 py-3 text-right nz-mono text-[hsl(var(--text-secondary))]">
                      {formatPct(c.conversion_rate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
};

export default Analytics;
