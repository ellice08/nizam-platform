import { Mail } from "lucide-react";
import { Field, StepHeader } from "./shared";
import type { WizardState } from "../types";

type Props = { state: WizardState; set: (patch: Partial<WizardState>) => void };

export const Step6Credentials = ({ state, set }: Props) => {
  return (
    <>
      <StepHeader step={6} title="Set up client access" description="The client receives a one-time password by email." />

      <div className="space-y-6 max-w-2xl">
        <Field label="Client's preferred email address" required>
          <input className="nz-input" type="email" value={state.clientEmail} onChange={(e) => set({ clientEmail: e.target.value })} placeholder="founder@company.com" />
        </Field>

        <div className="rounded-lg border border-border bg-surface p-5 flex items-start gap-3">
          <div className="h-9 w-9 rounded-md border border-border flex items-center justify-center shrink-0 text-[hsl(var(--text-secondary))]">
            <Mail className="h-4 w-4" strokeWidth={1.5} />
          </div>
          <div>
            <p className="text-sm text-foreground">Welcome email with one-time password</p>
            <p className="text-xs text-[hsl(var(--text-secondary))] mt-1 leading-relaxed">
              We will send a welcome email to this address with a one-time password.
              The client will be prompted to set their own password on first login.
            </p>
          </div>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--text-secondary))] font-medium mb-3">Email preview</p>
          <div className="rounded-lg border border-border bg-surface overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-elevated text-xs text-[hsl(var(--text-secondary))] space-y-0.5">
              <p><span className="text-[hsl(var(--text-tertiary))]">From:</span> notifications@ellice.io</p>
              <p><span className="text-[hsl(var(--text-tertiary))]">To:</span> {state.clientEmail || "client@example.com"}</p>
              <p><span className="text-[hsl(var(--text-tertiary))]">Subject:</span> <span className="text-foreground">Your Nizam account is ready</span></p>
            </div>
            <div className="px-5 py-6 text-sm text-foreground space-y-4">
              <p>Welcome to Nizam.</p>
              <p className="text-[hsl(var(--text-secondary))]">
                Your workspace for {state.companyName || "your organisation"} is ready.
                Use the one-time password below to sign in for the first time.
              </p>
              <div className="rounded-md border border-border bg-background py-3 px-4 nz-mono text-base text-rose tracking-widest text-center">
                NZ-7F3A-92BX
              </div>
              <p className="text-xs text-[hsl(var(--text-tertiary))]">
                Sign in at nizam.{state.slug || "your-slug"}.com
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Step6Credentials;
