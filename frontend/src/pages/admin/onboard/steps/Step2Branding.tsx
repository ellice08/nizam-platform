import { useRef } from "react";
import { UploadCloud, X } from "lucide-react";
import { Field, StepHeader } from "./shared";
import type { WizardState } from "../types";

type Props = {
  state: WizardState;
  set: (patch: Partial<WizardState>) => void;
};

const ColourRow = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) => (
  <Field label={label}>
    <div className="flex items-center gap-3">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-10 rounded cursor-pointer border border-border bg-transparent p-0.5"
      />
      <input
        className="nz-input nz-mono w-36"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={7}
      />
      <span
        className="h-8 w-8 rounded-full border border-border shrink-0"
        style={{ background: value }}
      />
    </div>
  </Field>
);

const LogoUpload = ({
  label,
  file,
  name,
  onFile,
  onClear,
  hint,
}: {
  label: string;
  file: File | null;
  name: string | null;
  onFile: (f: File) => void;
  onClear: () => void;
  hint?: string;
}) => {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <Field label={label}>
      {file || name ? (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-surface">
          <span className="text-sm text-foreground truncate flex-1">{name}</span>
          <button
            type="button"
            onClick={onClear}
            className="text-[hsl(var(--text-tertiary))] hover:text-destructive transition-colors"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="w-full rounded-lg border border-dashed border-border bg-surface hover:bg-elevated transition-colors duration-150 py-8 flex flex-col items-center"
        >
          <UploadCloud className="h-6 w-6 text-[hsl(var(--text-tertiary))]" strokeWidth={1.5} />
          <p className="mt-2 text-sm text-[hsl(var(--text-secondary))]">
            {hint ?? "Click to upload"}
          </p>
          <p className="mt-0.5 text-xs text-[hsl(var(--text-tertiary))]">PNG, JPG, SVG · max 2MB</p>
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
    </Field>
  );
};

export const Step2Branding = ({ state, set }: Props) => {
  return (
    <>
      <StepHeader step={2} title="Brand and identity" description="The look the client's customers will see." />

      <div className="grid lg:grid-cols-[1fr_360px] gap-8">
        <div className="space-y-6 max-w-xl">

          {/* Logos */}
          <LogoUpload
            label="Logo (light mode)"
            file={state.logoFile}
            name={state.logoName}
            onFile={(f) => set({ logoFile: f, logoName: f.name })}
            onClear={() => set({ logoFile: null, logoName: null })}
            hint="Primary logo — used on light backgrounds"
          />
          <LogoUpload
            label="Logo (dark mode) — optional"
            file={state.logoDarkFile}
            name={state.logoDarkName}
            onFile={(f) => set({ logoDarkFile: f, logoDarkName: f.name })}
            onClear={() => set({ logoDarkFile: null, logoDarkName: null })}
            hint="Falls back to primary logo if not set"
          />

          {/* Colours */}
          <ColourRow label="Primary colour" value={state.primaryColor}
            onChange={(v) => set({ primaryColor: v })} />
          <ColourRow label="Primary hover" value={state.primaryHoverColor}
            onChange={(v) => set({ primaryHoverColor: v })} />
          <ColourRow label="Secondary colour" value={state.secondaryColor}
            onChange={(v) => set({ secondaryColor: v })} />
          <ColourRow label="Accent (highlights & badges)" value={state.accentColor}
            onChange={(v) => set({ accentColor: v })} />
          <ColourRow label="Background override" value={state.backgroundColor}
            onChange={(v) => set({ backgroundColor: v })} />
        </div>

        {/* Live preview */}
        <aside className="rounded-lg border border-border bg-surface p-5">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--text-secondary))] font-medium mb-4">
            Live preview
          </p>
          <div className="rounded-md border border-border overflow-hidden"
            style={{ background: state.backgroundColor }}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border"
              style={{ borderColor: `${state.primaryColor}33` }}>
              {state.logoFile ? (
                <img
                  src={URL.createObjectURL(state.logoFile)}
                  alt="Logo preview"
                  className="h-6 max-w-[100px] object-contain"
                />
              ) : (
                <span className="font-display text-base" style={{ color: state.primaryColor }}>
                  {state.companyName || "Your company"}
                </span>
              )}
            </div>
            <div className="p-4 space-y-3">
              <div className="text-xs px-3 py-2 rounded-md text-white font-medium"
                style={{ background: state.primaryColor }}>
                Active nav item
              </div>
              <div className="text-xs px-3 py-2 rounded-md text-white font-medium"
                style={{ background: state.primaryHoverColor }}>
                Hover state
              </div>
              <span className="inline-block text-[10px] px-2 py-0.5 rounded font-medium uppercase tracking-wider"
                style={{ background: state.accentColor + '22', color: state.accentColor }}>
                Escalated
              </span>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
};

export default Step2Branding;
