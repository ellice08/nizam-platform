import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/nizam/Badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Check } from "lucide-react";
import { useAuthStore } from '@/store'
import { useOrganisation } from '@/hooks'
import type { Organisation } from '@/types/api.types'

type PlanVariant = Organisation['plan']

const planFeatures: Record<PlanVariant, string[]> = {
  trial:      ["1 branch", "500 conversations/month", "Web chat only", "Email support"],
  starter:    ["Up to 2 branches", "2,000 conversations/month", "Chat + WhatsApp", "Email support"],
  pro:        ["Up to 5 branches", "10,000 conversations/month", "WhatsApp + voice + chat", "Priority support"],
  enterprise: ["Unlimited branches", "Unlimited conversations", "All channels", "Dedicated account manager"],
}

const Billing = () => {
  const { organisationId } = useAuthStore()
  const { data: org, isLoading } = useOrganisation(organisationId ?? '')

  const plan: PlanVariant = org?.plan ?? 'trial'
  const features = planFeatures[plan]

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Billing"
        description="Plan, usage, and invoices."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Plan card */}
        <div className="lg:col-span-2 rounded-lg border border-border bg-surface p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[hsl(var(--text-secondary))]">Current plan</p>
              {isLoading ? (
                <Skeleton className="mt-2 h-9 w-24" />
              ) : (
                <p className="font-display text-3xl mt-2 text-foreground capitalize">{plan}</p>
              )}
            </div>
            {!isLoading && <Badge variant={plan}>{plan}</Badge>}
          </div>

          <hr className="my-6 border-border" />

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-4 w-48" />)}
            </div>
          ) : (
            <ul className="space-y-2 text-sm text-[hsl(var(--text-secondary))]">
              {features.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-primary" strokeWidth={1.5} /> {f}
                </li>
              ))}
            </ul>
          )}

          <hr className="my-6 border-border" />

          {isLoading ? (
            <Skeleton className="h-5 w-56" />
          ) : org?.implementation_paid ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-[#4CAF50]">
              <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
              Implementation fee paid
            </span>
          ) : (
            <div>
              <span className="text-xs text-yellow-500">Implementation fee pending</span>
              <p className="text-xs text-[hsl(var(--text-tertiary))] mt-1">
                Contact Ellice Systems to complete payment.
              </p>
            </div>
          )}
        </div>

        {/* Usage card */}
        <div className="rounded-lg border border-border bg-surface p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-[hsl(var(--text-secondary))] mb-4">Usage this cycle</p>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-foreground">Conversations</span>
                <span className="nz-mono text-[hsl(var(--text-secondary))]">— / —</span>
              </div>
              <div className="mt-2 h-1.5 bg-elevated rounded-sm overflow-hidden">
                <div className="h-full bg-primary" style={{ width: "0%" }} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-foreground">Voice minutes</span>
                <span className="nz-mono text-[hsl(var(--text-secondary))]">— / —</span>
              </div>
              <div className="mt-2 h-1.5 bg-elevated rounded-sm overflow-hidden">
                <div className="h-full bg-rose" style={{ width: "0%" }} />
              </div>
            </div>
          </div>
          <p className="mt-4 text-xs text-[hsl(var(--text-tertiary))]">
            Detailed usage tracking activates in the next platform update.
          </p>
        </div>

        {/* Upgrade CTA */}
        <div className="lg:col-span-3 rounded-lg border border-border bg-surface p-6 flex items-center justify-between">
          <div>
            <p className="font-display text-2xl text-foreground">Need more headroom?</p>
            <p className="text-sm text-[hsl(var(--text-secondary))] mt-1">
              Move to Enterprise for unlimited branches, dedicated infrastructure, and SLA.
            </p>
          </div>
          <Button className="bg-primary hover:bg-primary-hover text-primary-foreground">Upgrade plan</Button>
        </div>
      </div>

      <p className="mt-6 text-xs text-[hsl(var(--text-tertiary))] text-center">
        Detailed usage tracking and automated billing activates in the next platform update.
      </p>
    </>
  );
};

export default Billing;
