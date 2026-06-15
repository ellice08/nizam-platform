import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store";
import { organisationApi } from "@/api";
import LoadingScreen from "@/components/LoadingScreen";

const ROLE_PRIORITY: Record<string, number> = {
  super_admin: 5,
  org_admin: 4,
  branch_admin: 3,
  branch_staff: 2,
  viewer: 1,
};

const Login = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword(
        {
          email: email.trim(),
          password,
        },
      );

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      const user = data.user;
      if (!user) {
        setError("Login failed — please try again.");
        setLoading(false);
        return;
      }

      // Set the user immediately — we have it right here, no need to
      // wait for the SIGNED_IN event which is unreliable when a stale
      // session already exists in the browser.
      useAuthStore.getState().setUser(user);

      const appRole = user.app_metadata?.role as string | undefined;

      if (appRole === "super_admin") {
        // Fetch the super admin's own org (Ellice Systems) so we can
        // exclude it from client lists
        const { data: ownTenant } = await supabase
          .from("tenant_users")
          .select("organisation_id")
          .eq("user_id", user.id)
          .maybeSingle();
        useAuthStore
          .getState()
          .setOrganisation(
            (ownTenant?.organisation_id as string) ?? "",
            null,
            "super_admin",
          );
        useAuthStore.getState().setFirstLogin(false);
      } else {
        const { data: tenantRows } = await supabase
          .from("tenant_users")
          .select("organisation_id, branch_id, role, first_login")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true });

        if (tenantRows && tenantRows.length > 0) {
          const best = tenantRows.reduce((prev, curr) => {
            const pp = ROLE_PRIORITY[prev.role as string] ?? 0;
            const cp = ROLE_PRIORITY[curr.role as string] ?? 0;
            return cp > pp ? curr : prev;
          });
          useAuthStore
            .getState()
            .setOrganisation(
              best.organisation_id as string,
              best.branch_id as string | null,
              best.role as string,
            );
          useAuthStore
            .getState()
            .setFirstLogin((best.first_login as boolean | null) ?? false);
        } else {
          // No tenant record — user exists in Auth but not yet provisioned.
          // Let Redirect.tsx send them back to /login with a clear state.
          setError(
            "Your account is not yet linked to an organisation. Please contact your administrator.",
          );
          useAuthStore.getState().clear();
          setLoading(false);
          return;
        }
      }

      // Warm the org/branding cache BEFORE navigating so the dashboard renders fully
      // branded with no pop-in. Bounded by a timeout so a slow fetch never hangs login.
      const resolvedOrgId = useAuthStore.getState().organisationId;
      const isSuper = useAuthStore.getState().isAdmin;
      if (resolvedOrgId && !isSuper) {
        await Promise.race([
          queryClient.prefetchQuery({
            queryKey: ["organisations", resolvedOrgId],
            queryFn: () => organisationApi.getOrganisationById(resolvedOrgId),
          }),
          new Promise((resolve) => setTimeout(resolve, 3500)),
        ]);
      }

      // Store is fully populated — release the loading gate and route.
      useAuthStore.getState().setLoading(false);
      navigate("/redirect", { replace: true });
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred.",
      );
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <section className="container max-w-md py-20">
      <p className="text-[10px] uppercase tracking-[0.22em] text-gold mb-2">
        Welcome back
      </p>
      <h1 className="font-display text-4xl font-semibold mb-8">
        Sign in to Nizam
      </h1>
      <form className="space-y-5" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            autoComplete="email"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <PasswordInput
            id="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            autoComplete="current-password"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted-foreground">
        New to Nizam?{" "}
        <Link
          to="/signup"
          className="text-primary underline-offset-4 hover:underline"
        >
          Request access
        </Link>
      </p>
    </section>
  );
};

export default Login;
