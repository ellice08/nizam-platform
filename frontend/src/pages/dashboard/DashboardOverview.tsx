import { PageHeader } from "@/components/PageHeader";

const DashboardOverview = () => {
  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Good day."
        description="A composed view of your AI conversations, knowledge, and performance."
      />
      <div className="grid gap-4 md:grid-cols-3">
        {["Conversations today", "Resolution rate", "Avg. handle time"].map((label) => (
          <div key={label} className="rounded-lg border border-border bg-card p-6">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
            <p className="mt-3 font-display text-3xl">—</p>
          </div>
        ))}
      </div>
    </>
  );
};

export default DashboardOverview;