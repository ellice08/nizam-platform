import { Link } from "react-router-dom";
import { Check, CheckCircle2, Copy, Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProvisionStep } from "../../AdminOnboard";
import type { WizardState } from "../types";

type Props = {
  state: WizardState;
  onAnother: () => void;
  provisionResults?: ProvisionStep[];
  organisationId?: string | null;
};

const HandoverRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center gap-3 px-5 py-3 border-t border-border first:border-t-0">
    <div className="flex-1 min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--text-secondary))]">{label}</p>
      <p className="nz-mono text-xs text-foreground truncate mt-1">{value}</p>
    </div>
    <button className="text-xs text-[hsl(var(--text-secondary))] hover:text-foreground inline-flex items-center gap-1.5 transition-colors duration-150">
      <Copy className="h-3 w-3" strokeWidth={1.5} /> Copy
    </button>
  </div>
);

const defaultResults: ProvisionStep[] = [
  { id: "org",      label: "Organisation created",      status: "done" },
  { id: "branches", label: "Branches configured",        status: "done" },
  { id: "agents",   label: "AI agent configuration",     status: "pending", note: "Requires Retell API setup" },
  { id: "phones",   label: "Phone number provisioning",  status: "pending", note: "Requires Twilio / Africa's Talking setup" },
  { id: "email",    label: "Welcome email",              status: "pending", note: "Pending backend endpoint" },
];

export const Step8Done = ({ state, onAnother, provisionResults, organisationId }: Props) => {
  const results = provisionResults && provisionResults.length > 0 ? provisionResults : defaultResults;
  const clientDetailPath = organisationId
    ? `/admin/clients/${organisationId}`
    : `/admin/clients/${state.slug || "new"}`;

  return (
    <div className="max-w-2xl mx-auto py-6 animate-nz-fade-in">
      <div className="text-center">
        <div className="mx-auto h-16 w-16 rounded-full border-2 border-primary flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-primary" strokeWidth={1.5} />
        </div>
        <h1 className="mt-6 font-display text-5xl tracking-tight text-foreground">Client is live</h1>
        <p className="mt-3 text-[hsl(var(--text-secondary))]">
          {state.companyName || "The client"} has been onboarded successfully.
        </p>
      </div>

      <div className="mt-10 rounded-lg border border-border bg-surface divide-y divide-border">
        {results.map((r) => (
          <div key={r.id} className="flex items-start gap-3 px-5 py-3.5">
            <div className="mt-0.5 h-5 w-5 flex items-center justify-center shrink-0">
              {r.status === "done"    && <Check className="h-4 w-4 text-green-500"    strokeWidth={2}   />}
              {r.status === "pending" && <Info  className="h-4 w-4 text-yellow-500"   strokeWidth={1.5} />}
              {r.status === "error"   && <X     className="h-4 w-4 text-destructive"  strokeWidth={1.5} />}
            </div>
            <div className="min-w-0">
              <span className="text-sm text-foreground">{r.label}</span>
              {r.note && <p className="text-xs text-muted-foreground mt-0.5">{r.note}</p>}
            </div>
          </div>
        ))}
      </div>

      <section className="mt-8">
        <h3 className="text-xs uppercase tracking-[0.2em] text-[hsl(var(--text-secondary))] font-medium mb-3">Handover pack</h3>
        <div className="rounded-lg border border-border bg-surface">
          <HandoverRow label="Login URL"     value={`https://nizam.${state.slug || "your-slug"}.com`} />
          <HandoverRow label="Embed code"    value={`<script src="https://cdn.nizam.io/embed.js" data-org="${state.slug}"></script>`} />
          <HandoverRow label="SIM divert codes" value="**21*+2348001234567#" />
          <HandoverRow label="WhatsApp setup"   value="Open WhatsApp Business → settings → migrate" />
        </div>
      </section>

      <div className="mt-10 flex flex-col sm:flex-row gap-3">
        <Button asChild className="flex-1 bg-primary hover:bg-primary-hover text-primary-foreground">
          <Link to={clientDetailPath}>View client dashboard</Link>
        </Button>
        <Button
          onClick={onAnother}
          variant="outline"
          className="flex-1 border-border bg-transparent hover:bg-elevated text-foreground"
        >
          Onboard another client
        </Button>
      </div>
    </div>
  );
};

export default Step8Done;
