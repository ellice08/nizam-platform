type StatCardProps = {
  label: string;
  value: string | number;
  hint?: string;
};

export function StatCard({ label, value, hint }: StatCardProps) {
  return (
    <div className="rounded-lg border border-border bg-surface border-l-[3px] border-l-primary p-6">
      <p className="text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--text-secondary))] font-medium">
        {label}
      </p>
      <p className="mt-3 nz-mono text-3xl text-foreground tabular-nums">{value}</p>
      {hint && <p className="mt-2 text-xs text-[hsl(var(--text-tertiary))]">{hint}</p>}
    </div>
  );
}

export default StatCard;
