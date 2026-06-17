import { useState, useEffect, useMemo } from "react";
import { formatDistanceToNow } from 'date-fns'
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/nizam/Badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare, MessageCircle, Phone, Search, Inbox, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useConversations, useHighlightOnArrival, useOrgIntents } from '@/hooks'
import { useAuthStore } from '@/store'
import { buildIntentLabelMap, intentLabel } from '@/lib/intentLabels'
import type { Conversation } from '@/types/api.types'
import ConversationPanel from '@/components/dashboard/ConversationPanel'

const tabs = [
  { key: "all",      label: "All" },
  { key: "voice",    label: "Voice" },
  { key: "chat",     label: "Chat" },
  { key: "whatsapp", label: "WhatsApp" },
];

const channelIcon = (c: string) =>
  c === "voice" ? Phone : c === "whatsapp" ? MessageCircle : MessageSquare;

const StatusBadge = ({ conv }: { conv: Conversation }) => {
  if (conv.resolved)           return <Badge variant="starter">Resolved</Badge>;
  if (conv.requires_human)     return <Badge variant="pro">Escalated</Badge>;
  if (conv.callback_requested) return <Badge variant="rose">Callback</Badge>;
  return <Badge variant="neutral">Open</Badge>;
};

const Conversations = () => {
  const { organisationId, tenantOrgId } = useAuthStore()
  const activeOrgId = tenantOrgId ?? organisationId ?? ''
  const { data: orgIntents } = useOrgIntents(activeOrgId)
  const intentMap = useMemo(() => buildIntentLabelMap(orgIntents ?? []), [orgIntents])

  const [tab, setTab]                   = useState("all");
  const [showResolved, setShowResolved] = useState(true);
  const [query, setQuery]               = useState("");
  const [selected, setSelected]         = useState<string | null>(null);

  const channelFilter = tab !== "all"
    ? (tab as 'chat' | 'voice' | 'whatsapp')
    : undefined;

  const resolvedFilter = showResolved ? undefined : (false as boolean | undefined);

  const { data: conversations, isLoading, isFetching, refetch, dataUpdatedAt } = useConversations({
    channel: channelFilter,
    resolved: resolvedFilter,
    limit: 50,
  });

  const rows = (conversations ?? []).filter((r) => {
    if (!query) return true;
    const haystack = `${r.lead_name ?? ''} ${r.lead_phone ?? ''}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  const { targetId, isFlashing } = useHighlightOnArrival('c', !isLoading && rows.length > 0);

  // Auto-open the deep-linked conversation when arriving from a notification.
  useEffect(() => {
    if (targetId && selected !== targetId) setSelected(targetId);
  }, [targetId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex gap-0 -mx-4 sm:-mx-6 -mt-6 h-[calc(100vh-4rem)] min-w-0">

      {/* Left — conversation list */}
      <div className={cn(
        "flex flex-col transition-all duration-200 overflow-hidden px-4 sm:px-6 pt-6",
        selected ? "hidden md:flex md:w-[55%]" : "w-full"
      )}>
        <PageHeader
          eyebrow="Inbox"
          title="Conversations"
          description="Voice and chat sessions across all channels."
        />

        <div className="rounded-lg border border-border bg-surface overflow-hidden flex-1 min-h-0 flex flex-col">
          {/* Toolbar */}
          <div className="flex flex-col md:flex-row md:items-center gap-3 px-6 py-4 border-b border-border shrink-0">
            <div className="flex items-center gap-1 rounded-md border border-border bg-background p-1">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "px-3 py-1.5 text-xs rounded transition-colors duration-150 ease-nz",
                    tab === t.key
                      ? "bg-elevated text-foreground"
                      : "text-[hsl(var(--text-secondary))] hover:text-foreground"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <label className="flex items-center gap-2 text-xs text-[hsl(var(--text-secondary))] select-none">
              <input
                type="checkbox"
                checked={showResolved}
                onChange={(e) => setShowResolved(e.target.checked)}
                className="accent-primary"
              />
              Show resolved
            </label>

            <div className="relative md:ml-auto md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[hsl(var(--text-tertiary))]" strokeWidth={1.5} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by lead"
                className="nz-input pl-9 h-9"
              />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => refetch()}
                disabled={isFetching}
                className="inline-flex items-center gap-1.5 text-xs text-[hsl(var(--text-secondary))] hover:text-foreground transition-colors disabled:opacity-50"
                title="Refresh conversations"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
                Refresh
              </button>
              {dataUpdatedAt ? (
                <span className="text-[11px] text-[hsl(var(--text-tertiary))]">
                  Updated {formatDistanceToNow(new Date(dataUpdatedAt), { addSuffix: true })}
                </span>
              ) : null}
            </div>
          </div>

          {/* Body */}
          <div className="overflow-y-auto flex-1">
            {isLoading ? (
              <div className="divide-y divide-border">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="flex items-center gap-4 px-6 py-4">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-12 ml-auto" />
                    <Skeleton className="h-5 w-16" />
                  </div>
                ))}
              </div>

            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20">
                <Inbox className="h-8 w-8 text-[hsl(var(--text-tertiary))]" strokeWidth={1.5} />
                <p className="mt-3 text-sm text-[hsl(var(--text-secondary))] text-center max-w-sm">
                  {!query && !conversations?.length
                    ? "No conversations yet. Conversations will appear here once customers start reaching out."
                    : "No conversations match these filters."}
                </p>
              </div>

            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-elevated text-[hsl(var(--text-secondary))]">
                  <tr className="text-left">
                    <th className="hidden sm:table-cell px-3 sm:px-6 py-3 text-[10px] uppercase tracking-wider font-medium">Channel</th>
                    <th className="px-3 sm:px-6 py-3 text-[10px] uppercase tracking-wider font-medium">Lead</th>
                    {!selected && <th className="hidden md:table-cell px-3 sm:px-6 py-3 text-[10px] uppercase tracking-wider font-medium">Contact</th>}
                    <th className="hidden sm:table-cell px-3 sm:px-6 py-3 text-[10px] uppercase tracking-wider font-medium">Time</th>
                    <th className="px-3 sm:px-6 py-3 text-[10px] uppercase tracking-wider font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const Icon = channelIcon(r.channel);
                    const isSelected = selected === r.id;
                    return (
                      <tr
                        key={r.id}
                        onClick={() => setSelected(r.id)}
                        className={cn(
                          "border-t border-border cursor-pointer transition-colors duration-150",
                          isSelected
                            ? "bg-elevated border-l-2 border-l-primary"
                            : "bg-background hover:bg-elevated",
                          isFlashing(r.id) && "nz-flash",
                        )}
                      >
                        <td className="hidden sm:table-cell px-3 sm:px-6 py-4 capitalize text-[hsl(var(--text-secondary))]">
                          <div className="flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
                            {r.channel}
                          </div>
                        </td>
                        <td className="px-3 sm:px-6 py-4 text-foreground">
                          <div className="flex items-center gap-2">
                            <Icon className="sm:hidden h-3.5 w-3.5 shrink-0 text-[hsl(var(--text-secondary))]" strokeWidth={1.5} />
                            <span className="truncate">{r.lead_name ?? 'Unknown caller'}</span>
                          </div>
                          {r.intent && r.intent !== 'general' && (
                            <span className="block text-[11px] text-[hsl(var(--text-tertiary))]">
                              {intentLabel(r.intent, intentMap)}
                            </span>
                          )}
                          <div className="sm:hidden mt-1 text-[10px] nz-mono text-[hsl(var(--text-tertiary))]">
                            {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                          </div>
                        </td>
                        {!selected && (
                          <td className="hidden md:table-cell px-3 sm:px-6 py-4 nz-mono text-[hsl(var(--text-secondary))]">{r.lead_phone ?? r.lead_email ?? '—'}</td>
                        )}
                        <td className="hidden sm:table-cell px-3 sm:px-6 py-4 nz-mono text-[hsl(var(--text-secondary))]">
                          {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                        </td>
                        <td className="px-3 sm:px-6 py-4"><StatusBadge conv={r} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right — detail panel */}
      {selected && (
        <div className="w-full md:w-[45%] md:border-l border-border flex flex-col overflow-hidden">
          <ConversationPanel
            conversationId={selected}
            onClose={() => setSelected(null)}
          />
        </div>
      )}
    </div>
  );
};

export default Conversations;
