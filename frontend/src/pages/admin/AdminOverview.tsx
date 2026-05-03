import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAllTenants } from "@/hooks";
import type { Tenant } from "@/types/api.types";

const planStyle: Record<string, React.CSSProperties> = {
  pro:        { backgroundColor: "#7A2535", borderColor: "#7A2535", color: "#fff" },
  enterprise: { backgroundColor: "#C4923A", borderColor: "#C4923A", color: "#fff" },
};

const planClass: Record<string, string> = {
  trial:      "border-border text-muted-foreground",
  starter:    "border-green-500 text-green-600",
  pro:        "",
  enterprise: "",
};

function PlanBadge({ plan }: { plan: Tenant["plan"] }) {
  return (
    <Badge
      variant="outline"
      className={planClass[plan] ?? ""}
      style={planStyle[plan]}
    >
      {plan}
    </Badge>
  );
}

const AdminOverview = () => {
  const navigate = useNavigate();
  const { data: tenants, isLoading, isError } = useAllTenants();

  const total   = tenants?.length ?? 0;
  const trial   = tenants?.filter((t) => t.plan === "trial").length ?? 0;
  const paid    = tenants?.filter((t) => t.plan !== "trial").length ?? 0;

  const stats = [
    { label: "Total clients",   value: isLoading ? null : total },
    { label: "Trial",           value: isLoading ? null : trial },
    { label: "Paid",            value: isLoading ? null : paid  },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Operator console"
        description="Manage tenants, provision workspaces, and monitor platform health."
      >
        <Button onClick={() => navigate("/admin/onboard")} size="sm">
          + Onboard client
        </Button>
      </PageHeader>

      {/* Stats row */}
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        {stats.map(({ label, value }) => (
          <div key={label} className="rounded-lg border border-border bg-card p-6">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
            {value === null ? (
              <Skeleton className="mt-3 h-9 w-16" />
            ) : (
              <p className="mt-3 font-display text-3xl">{value}</p>
            )}
          </div>
        ))}
      </div>

      {/* Tenants table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="font-display text-lg font-semibold">Clients</h2>
        </div>

        {isError && (
          <div className="px-6 py-8 text-sm text-destructive">
            Failed to load tenants. Check your connection and permissions.
          </div>
        )}

        {isLoading && (
          <div className="divide-y divide-border">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-5 w-16 ml-auto" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-14" />
              </div>
            ))}
          </div>
        )}

        {!isLoading && !isError && tenants && (
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-[0.18em] text-muted-foreground font-medium">Name</th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-[0.18em] text-muted-foreground font-medium">Plan</th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-[0.18em] text-muted-foreground font-medium">Joined</th>
                <th className="px-6 py-3 text-right text-xs uppercase tracking-[0.18em] text-muted-foreground font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tenants.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-muted-foreground">
                    No clients yet.{" "}
                    <button
                      className="text-primary underline-offset-4 hover:underline"
                      onClick={() => navigate("/admin/onboard")}
                    >
                      Onboard the first one.
                    </button>
                  </td>
                </tr>
              )}
              {tenants.map((tenant) => (
                <tr
                  key={tenant.id}
                  className="hover:bg-muted/20 cursor-pointer transition-colors"
                  onClick={() => navigate(`/admin/clients/${tenant.id}`)}
                >
                  <td className="px-6 py-4 font-medium">{tenant.name}</td>
                  <td className="px-6 py-4">
                    <PlanBadge plan={tenant.plan} />
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {formatDistanceToNow(new Date(tenant.created_at), { addSuffix: true })}
                  </td>
                  <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/admin/clients/${tenant.id}`)}
                    >
                      View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
};

export default AdminOverview;
