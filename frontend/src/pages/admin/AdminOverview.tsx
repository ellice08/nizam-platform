import { PageHeader } from "@/components/PageHeader";

const AdminOverview = () => {
  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Operator console"
        description="Manage tenants, provision workspaces, and monitor platform health."
      />
      <div className="grid gap-4 md:grid-cols-3">
        {["Active clients", "Pending onboarding", "Conversations / 24h"].map((label) => (
          <div key={label} className="rounded-lg border border-border bg-card p-6">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
            <p className="mt-3 font-display text-3xl">—</p>
          </div>
        ))}
      </div>
    </>
  );
};

export default AdminOverview;