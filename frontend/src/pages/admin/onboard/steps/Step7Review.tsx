import { AlertTriangle, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StepHeader } from "./shared";
import type { WizardState } from "../types";

type Props = {
  state: WizardState;
  goto: (step: number) => void;
  onProvision: () => void;
};

const Card = ({ title, step, goto, children }: { title: string; step: number; goto: (s: number) => void; children: React.ReactNode }) => (
  <div className="rounded-lg border border-border bg-surface p-6">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-xs uppercase tracking-[0.2em] text-[hsl(var(--text-secondary))] font-medium">{title}</h3>
      <button onClick={() => goto(step)} className="text-xs text-rose hover:text-foreground inline-flex items-center gap-1.5 transition-colors duration-150 ease-nz">
        <Pencil className="h-3 w-3" strokeWidth={1.5} /> Edit
      </button>
    </div>
    <div className="text-sm text-foreground space-y-1.5">{children}</div>
  </div>
);

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="flex items-baseline justify-between gap-4">
    <span className="text-xs text-[hsl(var(--text-secondary))]">{k}</span>
    <span className="text-sm text-foreground text-right">{v}</span>
  </div>
);

const telephonyLabel: Record<string, string> = {
  new_standard: "New standard number",
  new_vanity: "New vanity number",
  existing_sim: "Existing SIM",
  existing_vanity: "Existing vanity",
};

export const Step7Review = ({ state, goto, onProvision }: Props) => {
  const missing: string[] = [];
  if (!state.companyName) missing.push("Company name");
  if (!state.slug) missing.push("Subdomain slug");
  if (!state.clientEmail) missing.push("Client email");
  state.branches.slice(0, state.branchCount).forEach((b, i) => {
    if (!b.name) missing.push(`Branch ${i + 1} name`);
  });

  return (
    <>
      <StepHeader step={7} title="Review and go live" description="Check everything before provisioning." />

      <div className="grid gap-4 max-w-3xl">
        <Card title="Organisation" step={1} goto={goto}>
          <Row k="Name" v={state.companyName || "—"} />
          <Row k="Slug" v={<span className="nz-mono text-rose">{state.slug || "—"}</span>} />
          <Row k="Industry" v={state.industry.replace("_", " ")} />
          <Row k="Branches" v={<span className="nz-mono">{state.branchCount}</span>} />
          <Row k="Implementation fee" v={state.feePaid ? "Paid" : "Pending"} />
        </Card>

        <Card title="Branding" step={2} goto={goto}>
          <Row k="Logo" v={state.logoName ?? "Not uploaded"} />
          <Row k="Primary" v={<span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full border border-border" style={{ background: state.primaryColor }} /><span className="nz-mono text-xs">{state.primaryColor}</span></span>} />
          <Row k="Secondary" v={<span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full border border-border" style={{ background: state.secondaryColor }} /><span className="nz-mono text-xs">{state.secondaryColor}</span></span>} />
        </Card>

        <Card title="Branches" step={3} goto={goto}>
          {state.branches.slice(0, state.branchCount).map((b) => (
            <Row key={b.id} k={b.name || "—"} v={`${b.city || "—"} · ${telephonyLabel[b.telephony]}`} />
          ))}
        </Card>

        <Card title="Agent" step={4} goto={goto}>
          {state.branches.slice(0, state.branchCount).map((b) => (
            <Row key={b.id} k={b.name || "—"} v={`${b.agentName} · ${b.tone} · ${b.voice.replace("_", " ")}`} />
          ))}
        </Card>

        <Card title="Knowledge base" step={5} goto={goto}>
          {state.branches.slice(0, state.branchCount).map((b) => (
            <Row key={b.id} k={b.name || "—"} v={`${b.files.length} file${b.files.length === 1 ? "" : "s"}${b.crawlEnabled ? " · website crawl" : ""}`} />
          ))}
        </Card>

        <Card title="Credentials" step={6} goto={goto}>
          <Row k="Client email" v={state.clientEmail || "—"} />
        </Card>

        {missing.length > 0 && (
          <div className="rounded-md border border-primary bg-[hsl(var(--rose-subtle))] px-4 py-3 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-primary-subtle mt-0.5" strokeWidth={1.5} />
            <div className="text-sm">
              <p className="text-foreground">Missing information</p>
              <p className="text-xs text-[hsl(var(--text-secondary))] mt-1">{missing.join(", ")}</p>
            </div>
          </div>
        )}

        <div className="mt-4">
          <Button
            onClick={onProvision}
            disabled={missing.length > 0}
            className="w-full h-12 bg-primary hover:bg-primary-hover text-primary-foreground text-base disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Provision and go live
          </Button>
          <p className="mt-3 text-xs text-[hsl(var(--text-tertiary))] text-center">
            This will create all accounts, provision phone numbers, and send the welcome email.
          </p>
        </div>
      </div>
    </>
  );
};

export default Step7Review;
