import { PageHeader } from "@/components/PageHeader";

const Billing = () => (
  <>
    <PageHeader
      eyebrow="Account"
      title="Billing"
      description="Plan, usage, and invoices."
    />
    <div className="rounded-lg border border-border bg-card p-8 text-muted-foreground">
      Billing placeholder.
    </div>
  </>
);

export default Billing;