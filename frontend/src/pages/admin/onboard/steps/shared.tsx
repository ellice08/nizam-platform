import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export const StepHeader = ({ step, title, description }: { step: number; title: string; description?: string }) => (
  <header className="mb-10">
    <p className="text-[10px] uppercase tracking-[0.22em] text-primary mb-3 font-medium">
      Step {step} of 8
    </p>
    <h1 className="font-display text-4xl text-foreground tracking-tight">{title}</h1>
    {description && (
      <p className="mt-3 text-[hsl(var(--text-secondary))] max-w-2xl">{description}</p>
    )}
  </header>
);

export const Field = ({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) => (
  <div className="space-y-2">
    <label className="text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))]">
      {label} {required && <span className="text-primary normal-case lowercase tracking-normal">·</span>}
    </label>
    {children}
    {hint && <p className="text-xs text-[hsl(var(--text-tertiary))]">{hint}</p>}
  </div>
);

export const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-xs uppercase tracking-[0.2em] text-[hsl(var(--text-secondary))] font-medium mb-4 mt-2">
    {children}
  </h3>
);

export const OptionCard = ({
  icon: Icon,
  title,
  description,
  tag,
  selected,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  tag?: string;
  selected: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "text-left rounded-lg border p-5 transition-colors duration-150 ease-nz",
      selected
        ? "border-primary bg-[hsl(var(--primary)/0.08)]"
        : "border-border bg-surface hover:bg-elevated"
    )}
  >
    <div className="flex items-start gap-3">
      <div
        className={cn(
          "h-9 w-9 rounded-md flex items-center justify-center shrink-0 border",
          selected ? "border-primary text-primary" : "border-border text-[hsl(var(--text-secondary))]"
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={1.5} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm text-foreground">{title}</p>
          {tag && (
            <span className="nz-badge bg-rose-subtle text-rose">{tag}</span>
          )}
        </div>
        <p className="mt-1 text-xs text-[hsl(var(--text-secondary))] leading-relaxed">{description}</p>
      </div>
    </div>
  </button>
);

export const Toggle = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) => (
  <label className="flex items-center gap-3 cursor-pointer select-none">
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-10 rounded-full border transition-colors duration-150 ease-nz",
        checked ? "bg-primary border-primary" : "bg-background border-border"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-4 w-4 rounded-full bg-foreground transition-all duration-150 ease-nz",
          checked ? "left-[1.125rem]" : "left-0.5"
        )}
      />
    </button>
    {label && <span className="text-sm text-foreground">{label}</span>}
  </label>
);
