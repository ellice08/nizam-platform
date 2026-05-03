import { useState } from "react";
import { useParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { MessageSquare, Phone, MessageCircle, Smartphone } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTenant, useTenantStats, useConversations, useUpdateTenant } from "@/hooks";
import type { Tenant } from "@/types/api.types";

const planStyle: Record<string, React.CSSProperties> = {
  pro:        { backgroundColor: "#7A2535", borderColor: "#7A2535", color: "#fff" },
  enterprise: { backgroundColor: "#C4923A", borderColor: "#C4923A", color: "#fff" },
};
const planClass: Record<string, string> = {
  trial:      "border-border text-muted-foreground",
  starter:    "border-green-500 text-green-600",
};
function PlanBadge({ plan }: { plan: Tenant["plan"] }) {
  return (
    <Badge variant="outline" className={planClass[plan] ?? ""} style={planStyle[plan]}>
      {plan}
    </Badge>
  );
}

const channelIcon = {
  chat:      <MessageSquare className="h-3.5 w-3.5" />,
  voice:     <Phone className="h-3.5 w-3.5" />,
  whatsapp:  <MessageCircle className="h-3.5 w-3.5" />,
  sms:       <Smartphone className="h-3.5 w-3.5" />,
};

const AdminClientDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [selectedPlan, setSelectedPlan] = useState<Tenant["plan"] | "">("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  const { data: tenant, isLoading: tenantLoading } = useTenant(id ?? "");
  const { data: stats } = useTenantStats(id ?? "");
  const { data: conversations, isLoading: convsLoading } = useConversations(
    id ? { tenant_id: id, limit: 10 } : undefined
  );
  const updateTenant = useUpdateTenant();

  const currentPlan = (selectedPlan || tenant?.plan) as Tenant["plan"];

  const handleSavePlan = () => {
    if (!id || !selectedPlan) return;
    setSaveSuccess(false);
    updateTenant.mutate(
      { id, payload: { plan: selectedPlan as Tenant["plan"] } },
      { onSuccess: () => { setSaveSuccess(true); setTimeout(() => setSaveSuccess(false), 3000); } }
    );
  };

  if (tenantLoading) {
    return (
      <>
        <div className="mb-10 pb-6 border-b border-border">
          <Skeleton className="h-4 w-20 mb-2" />
          <Skeleton className="h-10 w-64" />
        </div>
        <div className="grid gap-4 md:grid-cols-4 mb-8">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      </>
    );
  }

  if (!tenant) {
    return <div className="text-muted-foreground">Client not found.</div>;
  }

  const statCards = [
    { label: "Total conversations", value: stats?.total_conversations ?? "—" },
    { label: "Resolved",            value: stats?.resolved_conversations ?? "—" },
    { label: "Active agents",       value: stats?.active_agents ?? "—" },
    { label: "Today",               value: stats?.conversations_today ?? "—" },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Client"
        title={tenant.name}
        description={`/${tenant.slug} · joined ${formatDistanceToNow(new Date(tenant.created_at), { addSuffix: true })}`}
      >
        <PlanBadge plan={tenant.plan} />
      </PageHeader>

      {/* Stats row */}
      <div className="grid gap-4 md:grid-cols-4 mb-8">
        {statCards.map(({ label, value }) => (
          <div key={label} className="rounded-lg border border-border bg-card p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
            <p className="mt-2 font-display text-3xl">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent conversations */}
        <div className="lg:col-span-2 rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="font-display text-base font-semibold">Recent conversations</h2>
          </div>
          {convsLoading ? (
            <div className="divide-y divide-border">
              {[1,2,3].map(i => (
                <div key={i} className="flex items-center gap-3 px-6 py-3">
                  <Skeleton className="h-4 w-4 rounded-full" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-5 w-16 ml-auto" />
                </div>
              ))}
            </div>
          ) : conversations?.length === 0 ? (
            <p className="px-6 py-8 text-sm text-muted-foreground">No conversations yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className="px-6 py-3 text-left text-xs uppercase tracking-[0.18em] text-muted-foreground font-medium">Channel</th>
                  <th className="px-6 py-3 text-left text-xs uppercase tracking-[0.18em] text-muted-foreground font-medium">Lead</th>
                  <th className="px-6 py-3 text-left text-xs uppercase tracking-[0.18em] text-muted-foreground font-medium">Status</th>
                  <th className="px-6 py-3 text-left text-xs uppercase tracking-[0.18em] text-muted-foreground font-medium">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {conversations?.map((conv) => (
                  <tr key={conv.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-3">
                      <span className="flex items-center gap-1.5 text-muted-foreground capitalize">
                        {channelIcon[conv.channel]}
                        {conv.channel}
                      </span>
                    </td>
                    <td className="px-6 py-3 font-medium">
                      {conv.lead_name ?? <span className="text-muted-foreground">Unknown</span>}
                    </td>
                    <td className="px-6 py-3">
                      <Badge
                        variant="outline"
                        className={conv.resolved
                          ? "border-green-500 text-green-600"
                          : "border-yellow-500 text-yellow-600"
                        }
                      >
                        {conv.resolved ? "Resolved" : "Open"}
                      </Badge>
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">
                      {formatDistanceToNow(new Date(conv.created_at), { addSuffix: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Edit plan */}
        <div className="rounded-lg border border-border bg-card p-6 h-fit">
          <h2 className="font-display text-base font-semibold mb-4">Change plan</h2>
          <div className="space-y-3">
            <Select
              value={currentPlan}
              onValueChange={(v) => setSelectedPlan(v as Tenant["plan"])}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="trial">Trial</SelectItem>
                <SelectItem value="starter">Starter</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>

            {updateTenant.isError && (
              <p className="text-xs text-destructive">Failed to update plan.</p>
            )}
            {saveSuccess && (
              <p className="text-xs text-green-600">Plan updated successfully.</p>
            )}

            <Button
              className="w-full"
              onClick={handleSavePlan}
              disabled={!selectedPlan || updateTenant.isPending}
            >
              {updateTenant.isPending ? "Saving…" : "Save plan"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

export default AdminClientDetail;
