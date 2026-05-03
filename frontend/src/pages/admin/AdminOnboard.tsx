import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateTenant } from "@/hooks";
import type { Tenant } from "@/types/api.types";
import type { AxiosError } from "axios";

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

const AdminOnboard = () => {
  const navigate = useNavigate();
  const createTenant = useCreateTenant();

  const [name, setName]       = useState("");
  const [slug, setSlug]       = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [plan, setPlan]       = useState<Tenant["plan"]>("trial");

  // Auto-generate slug from name unless user has manually edited it
  useEffect(() => {
    if (!slugEdited) {
      setSlug(toSlug(name));
    }
  }, [name, slugEdited]);

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSlugEdited(true);
    setSlug(e.target.value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !slug) return;
    createTenant.mutate(
      { name, slug, plan },
      {
        onSuccess: (tenant) => {
          navigate(`/admin/clients/${tenant.id}`);
        },
      }
    );
  };

  const apiError = createTenant.error as AxiosError<{ error: string }> | null;
  const errorMessage =
    apiError?.response?.data?.error ?? apiError?.message ?? null;

  return (
    <>
      <PageHeader
        eyebrow="Provisioning"
        title="Onboard a new client"
        description="Create a tenant workspace and assign a subscription plan."
      />

      <div className="max-w-lg rounded-lg border border-border bg-card p-8">
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="name">Agency name</Label>
            <Input
              id="name"
              placeholder="Acme Real Estate"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">
              Slug{" "}
              <span className="text-muted-foreground font-normal text-xs">(URL-safe identifier)</span>
            </Label>
            <div className="flex items-center gap-0">
              <span className="inline-flex h-10 items-center rounded-l-md border border-r-0 border-border bg-muted px-3 text-sm text-muted-foreground select-none">
                /
              </span>
              <Input
                id="slug"
                placeholder="acme-real-estate"
                value={slug}
                onChange={handleSlugChange}
                className="rounded-l-none"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="plan">Plan</Label>
            <Select value={plan} onValueChange={(v) => setPlan(v as Tenant["plan"])}>
              <SelectTrigger id="plan">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="trial">Trial</SelectItem>
                <SelectItem value="starter">Starter</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {errorMessage && (
            <p className="text-sm text-destructive">{errorMessage}</p>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={createTenant.isPending || !name || !slug}
          >
            {createTenant.isPending ? "Creating…" : "Create workspace"}
          </Button>
        </form>
      </div>
    </>
  );
};

export default AdminOnboard;
