import { Minus, Plus } from "lucide-react";
import { Field, SectionTitle, StepHeader, Toggle } from "./shared";
import type { Industry, WizardState } from "../types";
import { slugify } from "../types";

type Props = {
  state: WizardState;
  set: (patch: Partial<WizardState>) => void;
};

export const Step1Org = ({ state, set }: Props) => {
  const onName = (v: string) => {
    const next: Partial<WizardState> = { companyName: v };
    if (!state.slugEdited) next.slug = slugify(v);
    set(next);
  };

  return (
    <>
      <StepHeader step={1} title="Tell us about the company" description="The basics that drive everything else." />

      <div className="grid gap-6 max-w-2xl">
        <Field label="Company name" required>
          <input className="nz-input" value={state.companyName} onChange={(e) => onName(e.target.value)} placeholder="Lagos Living Realty" />
        </Field>

        <Field label="Subdomain slug" hint="Used to generate the client login URL.">
          <input
            className="nz-input nz-mono"
            value={state.slug}
            onChange={(e) => set({ slug: slugify(e.target.value), slugEdited: true })}
            placeholder="lagos-living"
          />
          <div className="mt-3 rounded-md border border-border bg-background px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--text-tertiary))]">Your client will log in at</p>
            <p className="nz-mono text-sm text-rose mt-0.5">
              nizam.{state.slug || "your-slug"}.com
            </p>
          </div>
        </Field>

        <Field label="Industry" required>
          <select
            className="nz-input"
            value={state.industry}
            onChange={(e) => set({ industry: e.target.value as Industry })}
          >
            <option value="real_estate">Real estate agency</option>
            <option value="hospitality">Hospitality (hotel, restaurant, serviced apartment)</option>
            <option value="other">Other</option>
          </select>
        </Field>

        <Field label="Number of branches" hint="Between 1 and 20.">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => set({ branchCount: Math.max(1, state.branchCount - 1) })}
              className="h-10 w-10 rounded-md border border-border text-[hsl(var(--text-secondary))] hover:bg-elevated hover:text-foreground transition-colors duration-150 ease-nz flex items-center justify-center"
            >
              <Minus className="h-4 w-4" strokeWidth={1.5} />
            </button>
            <input
              type="number"
              min={1}
              max={20}
              value={state.branchCount}
              onChange={(e) => set({ branchCount: Math.min(20, Math.max(1, +e.target.value || 1)) })}
              className="nz-input nz-mono text-center w-20"
            />
            <button
              type="button"
              onClick={() => set({ branchCount: Math.min(20, state.branchCount + 1) })}
              className="h-10 w-10 rounded-md border border-border text-[hsl(var(--text-secondary))] hover:bg-elevated hover:text-foreground transition-colors duration-150 ease-nz flex items-center justify-center"
            >
              <Plus className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
        </Field>

        <SectionTitle>Billing</SectionTitle>
        <div className="rounded-lg border border-border bg-surface p-5 flex items-center justify-between">
          <div>
            <p className="text-sm text-foreground">Implementation fee paid</p>
            <p className="text-xs text-[hsl(var(--text-secondary))] mt-0.5">
              Toggle on once the one-time implementation fee has cleared.
            </p>
          </div>
          <Toggle checked={state.feePaid} onChange={(v) => set({ feePaid: v })} />
        </div>
      </div>
    </>
  );
};

export default Step1Org;
