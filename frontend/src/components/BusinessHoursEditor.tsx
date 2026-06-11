import { cn } from "@/lib/utils";

export type BusinessHours = {
  enabled: boolean;
  mode: "simple" | "custom";
  days: Record<
    "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun",
    { open: string; close: string; closed: boolean }
  >;
};

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
const DAY_KEYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS: Record<DayKey, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu",
  fri: "Fri", sat: "Sat", sun: "Sun",
};

function InlineField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))]">
        {label}
      </label>
      {children}
    </div>
  );
}

function InlineToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-10 rounded-full border transition-colors duration-150",
          checked ? "bg-primary border-primary" : "bg-background border-border"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-foreground transition-all duration-150",
            checked ? "left-[1.125rem]" : "left-0.5"
          )}
        />
      </button>
      {label && <span className="text-sm text-foreground">{label}</span>}
    </label>
  );
}

export function BusinessHoursEditor({
  value,
  onChange,
}: {
  value: BusinessHours;
  onChange: (bh: BusinessHours) => void;
}) {
  const openDays = DAY_KEYS.filter((d) => !value.days[d].closed);
  const firstOpen = openDays[0] ?? "mon";

  const setDay = (day: DayKey, patch: Partial<BusinessHours["days"][DayKey]>) => {
    onChange({
      ...value,
      days: { ...value.days, [day]: { ...value.days[day], ...patch } },
    });
  };

  const setSimpleTime = (field: "open" | "close", time: string) => {
    const updatedDays = { ...value.days };
    for (const d of DAY_KEYS) {
      if (!updatedDays[d].closed) {
        updatedDays[d] = { ...updatedDays[d], [field]: time };
      }
    }
    onChange({ ...value, days: updatedDays });
  };

  return (
    <div className="rounded-lg border border-border bg-elevated p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Business hours</p>
        <InlineToggle
          checked={value.enabled}
          onChange={(v) => onChange({ ...value, enabled: v })}
          label="Enabled"
        />
      </div>

      {value.enabled && (
        <>
          {/* Day chips */}
          <div className="flex flex-wrap gap-1.5">
            {DAY_KEYS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDay(d, { closed: !value.days[d].closed })}
                className={cn(
                  "px-3 py-1 rounded-full text-xs border transition-colors duration-150",
                  !value.days[d].closed
                    ? "bg-primary border-primary text-primary-foreground"
                    : "border-border bg-transparent text-[hsl(var(--text-secondary))] hover:text-foreground hover:bg-surface"
                )}
              >
                {DAY_LABELS[d]}
              </button>
            ))}
          </div>

          {value.mode === "simple" ? (
            <>
              <div className="flex items-center gap-4">
                <InlineField label="Open">
                  <input
                    type="time"
                    className="nz-input nz-mono w-36"
                    value={value.days[firstOpen].open}
                    onChange={(e) => setSimpleTime("open", e.target.value)}
                  />
                </InlineField>
                <InlineField label="Close">
                  <input
                    type="time"
                    className="nz-input nz-mono w-36"
                    value={value.days[firstOpen].close}
                    onChange={(e) => setSimpleTime("close", e.target.value)}
                  />
                </InlineField>
              </div>
              <button
                type="button"
                onClick={() => onChange({ ...value, mode: "custom" })}
                className="text-xs text-[hsl(var(--text-secondary))] underline underline-offset-2 hover:text-foreground transition-colors duration-150"
              >
                Set custom hours per day
              </button>
            </>
          ) : (
            <>
              <div className="space-y-2">
                {openDays.map((d) => (
                  <div key={d} className="flex items-center gap-3">
                    <span className="text-xs text-[hsl(var(--text-secondary))] w-8 shrink-0">
                      {DAY_LABELS[d]}
                    </span>
                    <input
                      type="time"
                      className="nz-input nz-mono w-32"
                      value={value.days[d].open}
                      onChange={(e) => setDay(d, { open: e.target.value })}
                    />
                    <span className="text-xs text-[hsl(var(--text-tertiary))]">to</span>
                    <input
                      type="time"
                      className="nz-input nz-mono w-32"
                      value={value.days[d].close}
                      onChange={(e) => setDay(d, { close: e.target.value })}
                    />
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => onChange({ ...value, mode: "simple" })}
                className="text-xs text-[hsl(var(--text-secondary))] underline underline-offset-2 hover:text-foreground transition-colors duration-150"
              >
                Back to simple hours
              </button>
            </>
          )}

          <p className="text-xs text-[hsl(var(--text-tertiary))]">
            Outside these hours, visitors receive your after-hours message instead of the usual follow-up.
          </p>
        </>
      )}
    </div>
  );
}
