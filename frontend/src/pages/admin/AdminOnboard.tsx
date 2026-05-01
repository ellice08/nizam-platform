import { PageHeader } from "@/components/PageHeader";

const AdminOnboard = () => {
  return (
    <>
      <PageHeader
        eyebrow="Provisioning"
        title="Onboard a new client"
        description="Create a tenant, seed a knowledge base, and assign an agent."
      />
      <div className="rounded-lg border border-border bg-card p-8 text-muted-foreground">
        Onboarding wizard placeholder.
      </div>
    </>
  );
};

export default AdminOnboard;