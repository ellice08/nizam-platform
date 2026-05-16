import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { MessageSquare, Phone, MessageCircle, Smartphone, Building2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useOrganisation,
  useOrganisationStats,
  useBranches,
  useConversations,
  useUpdateOrganisation,
  useDeleteOrganisation,
} from "@/hooks";
import { useAuthStore } from "@/store";
import type { Organisation } from "@/types/api.types";

const planStyle: Record<string, React.CSSProperties> = {
  pro:        { backgroundColor: "#7A2535", borderColor: "#7A2535", color: "#fff" },
  enterprise: { backgroundColor: "#C4923A", borderColor: "#C4923A", color: "#fff" },
};
const planClass: Record<string, string> = {
  trial:      "border-border text-muted-foreground",
  starter:    "border-green-500 text-green-600",
};
function PlanBadge({ plan }: { plan: Organisation["plan"] }) {
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

const INDUSTRY_LABELS: Record<Organisation["industry"], string> = {
  real_estate: "Real estate",
  hospitality: "Hospitality",
  other:       "Other",
};

const AdminClientDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { isAdmin } = useAuthStore();

  const [editName, setEditName] = useState("");
  const [editPlan, setEditPlan] = useState<Organisation["plan"] | "">("");
  const [editIndustry, setEditIndustry] = useState<Organisation["industry"] | "">("");
  const [settingsSaveSuccess, setSettingsSaveSuccess] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const { data: org, isLoading: orgLoading } = useOrganisation(id ?? "");
  const { data: stats } = useOrganisationStats(id ?? "");
  const { data: branches } = useBranches(id ?? "");
  const clientBranchId = branches?.[0]?.id;
  const { data: conversations, isLoading: convsLoading } = useConversations({ limit: 10, branch_id: clientBranchId });
  const updateOrg = useUpdateOrganisation();
  const deleteOrg = useDeleteOrganisation();

  useEffect(() => {
    if (org) {
      setEditName(org.name);
      setEditPlan(org.plan);
      setEditIndustry(org.industry);
    }
  }, [org?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveSettings = () => {
    if (!id) return;
    setSettingsSaveSuccess(false);
    const payload: Parameters<typeof updateOrg.mutate>[0]["payload"] = {};
    if (editName && editName !== org?.name) payload.name = editName;
    if (editPlan && editPlan !== org?.plan) payload.plan = editPlan as Organisation["plan"];
    if (editIndustry && editIndustry !== org?.industry) payload.industry = editIndustry as Organisation["industry"];
    if (Object.keys(payload).length === 0) return;
    updateOrg.mutate(
      { id, payload },
      {
        onSuccess: () => {
          setSettingsSaveSuccess(true);
          setTimeout(() => setSettingsSaveSuccess(false), 3000);
        },
      }
    );
  };

  const handleDeleteConfirm = () => {
    if (!id) return;
    deleteOrg.mutate(id);
  };

  if (orgLoading) {
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

  if (!org) {
    return <div className="text-muted-foreground">Client not found.</div>;
  }

  const statCards = [
    { label: "Total conversations", value: stats?.total_conversations ?? "—" },
    { label: "Resolved",            value: stats?.resolved_conversations ?? "—" },
    { label: "Active branches",     value: stats?.active_branches ?? "—" },
    { label: "Today",               value: stats?.conversations_today ?? "—" },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Client"
        title={org.name}
        description={`/${org.slug} · joined ${formatDistanceToNow(new Date(org.created_at), { addSuffix: true })}`}
      >
        <PlanBadge plan={org.plan} />
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

        {/* Right column */}
        <div className="flex flex-col gap-6">
          {/* Organisation settings — super_admin only */}
          {isAdmin && (
            <div className="rounded-lg border border-border bg-card p-6">
              <h2 className="font-display text-base font-semibold mb-4">Organisation settings</h2>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-name">Name</Label>
                  <Input
                    id="edit-name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-plan">Plan</Label>
                  <Select
                    value={editPlan}
                    onValueChange={(v) => setEditPlan(v as Organisation["plan"])}
                  >
                    <SelectTrigger id="edit-plan">
                      <SelectValue placeholder="Select plan" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="trial">Trial</SelectItem>
                      <SelectItem value="starter">Starter</SelectItem>
                      <SelectItem value="pro">Pro</SelectItem>
                      <SelectItem value="enterprise">Enterprise</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-industry">Industry</Label>
                  <Select
                    value={editIndustry}
                    onValueChange={(v) => setEditIndustry(v as Organisation["industry"])}
                  >
                    <SelectTrigger id="edit-industry">
                      <SelectValue placeholder="Select industry">
                        {editIndustry ? INDUSTRY_LABELS[editIndustry as Organisation["industry"]] : undefined}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="real_estate">Real estate</SelectItem>
                      <SelectItem value="hospitality">Hospitality</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {updateOrg.isError && (
                  <p className="text-xs text-destructive">Failed to save settings.</p>
                )}
                {settingsSaveSuccess && (
                  <p className="text-xs text-green-600">Settings saved successfully.</p>
                )}

                <Button
                  className="w-full"
                  onClick={handleSaveSettings}
                  disabled={updateOrg.isPending}
                >
                  {updateOrg.isPending ? "Saving…" : "Save settings"}
                </Button>
              </div>
            </div>
          )}

          {/* Branches */}
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-display text-base font-semibold">Branches</h2>
              <span className="ml-auto text-xs text-muted-foreground">{org.branches.length}</span>
            </div>
            {org.branches.length === 0 ? (
              <p className="px-6 py-4 text-sm text-muted-foreground">No branches yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {org.branches.map((branch) => (
                  <li key={branch.id} className="px-6 py-3">
                    <p className="text-sm font-medium">{branch.name}</p>
                    {branch.location && (
                      <p className="text-xs text-muted-foreground mt-0.5">{branch.location}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Danger zone — super_admin only */}
          {isAdmin && (
            <div className="rounded-lg border bg-card p-6" style={{ borderColor: "#7A2535" }}>
              <h2 className="font-display text-base font-semibold text-destructive mb-1">
                Danger zone
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                Permanently delete this organisation and all associated data. This cannot be undone.
              </p>
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => setDeleteDialogOpen(true)}
                disabled={deleteOrg.isPending}
              >
                {deleteOrg.isPending ? "Deleting…" : "Delete organisation"}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{org.name}</strong> and all branches,
              conversations, agents, and knowledge base content. This action cannot be reversed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default AdminClientDetail;
