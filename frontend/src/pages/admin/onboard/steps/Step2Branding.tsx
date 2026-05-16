import { useRef } from "react";
import { UploadCloud } from "lucide-react";
import { Field, StepHeader } from "./shared";
import type { WizardState } from "../types";

type Props = {
  state: WizardState;
  set: (patch: Partial<WizardState>) => void;
};

export const Step2Branding = ({ state, set }: Props) => {
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <>
      <StepHeader step={2} title="Brand and identity" description="The look the client's customers will see." />

      <div className="grid lg:grid-cols-[1fr_360px] gap-8">
        <div className="space-y-6 max-w-xl">
          <Field label="Logo">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="w-full rounded-lg border border-dashed border-border bg-surface hover:bg-elevated transition-colors duration-150 ease-nz py-12 flex flex-col items-center"
            >
              <UploadCloud className="h-8 w-8 text-[hsl(var(--text-tertiary))]" strokeWidth={1.5} />
              <p className="mt-3 text-sm text-foreground">
                {state.logoName ?? "Drop logo here or click to upload"}
              </p>
              <p className="mt-1 text-xs text-[hsl(var(--text-tertiary))]">PNG, JPG, or SVG</p>
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              className="hidden"
              onChange={(e) => set({ logoName: e.target.files?.[0]?.name ?? null })}
            />
          </Field>

          <Field label="Primary colour">
            <div className="flex items-center gap-3">
              <input
                className="nz-input nz-mono w-40"
                value={state.primaryColor}
                onChange={(e) => set({ primaryColor: e.target.value })}
              />
              <span className="h-10 w-10 rounded-full border border-border" style={{ background: state.primaryColor }} />
            </div>
          </Field>

          <Field label="Secondary colour">
            <div className="flex items-center gap-3">
              <input
                className="nz-input nz-mono w-40"
                value={state.secondaryColor}
                onChange={(e) => set({ secondaryColor: e.target.value })}
              />
              <span className="h-10 w-10 rounded-full border border-border" style={{ background: state.secondaryColor }} />
            </div>
          </Field>
        </div>

        <aside className="rounded-lg border border-border bg-surface p-5">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--text-secondary))] font-medium mb-4">Live preview</p>
          <div className="rounded-md border border-border bg-background overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: state.primaryColor }} />
              <span className="font-display text-base text-foreground">{state.companyName || "Your company"}</span>
            </div>
            <div className="p-4 space-y-3">
              <div className="text-xs px-3 py-2 rounded-md text-foreground" style={{ background: state.primaryColor }}>
                Active nav item
              </div>
              <button
                type="button"
                className="w-full rounded-md py-2 text-sm text-foreground"
                style={{ background: state.primaryColor }}
              >
                Primary action
              </button>
              <span
                className="inline-block nz-badge"
                style={{ background: state.secondaryColor + "22", color: state.secondaryColor }}
              >
                Lead captured
              </span>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
};

export default Step2Branding;
