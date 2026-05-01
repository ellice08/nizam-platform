import { useParams } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";

const AdminClientDetail = () => {
  const { id } = useParams<{ id: string }>();
  return (
    <>
      <PageHeader
        eyebrow="Client"
        title={`Client ${id ?? ""}`}
        description="Tenant-level configuration, usage, and billing."
      />
      <div className="rounded-lg border border-border bg-card p-8 text-muted-foreground">
        Client detail placeholder.
      </div>
    </>
  );
};

export default AdminClientDetail;