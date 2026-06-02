import { cn } from "@/lib/utils";

type Variant = "trial" | "starter" | "pro" | "enterprise" | "neutral" | "rose";

const variants: Record<Variant, string> = {
  trial: "bg-elevated text-[hsl(var(--text-secondary))]",
  starter: "text-[#4CAF50]",
  pro: "text-primary-subtle",
  enterprise: "text-rose",
  neutral: "bg-elevated text-[hsl(var(--text-secondary))]",
  rose: "bg-rose-subtle text-rose",
};

const bgs: Partial<Record<Variant, string>> = {
  starter: "bg-green-500/10",
  pro: "bg-primary/10",
  enterprise: "bg-rose/10",
};

export function Badge({ variant = "neutral", children }: { variant?: Variant; children: React.ReactNode }) {
  return (
    <span className={cn("nz-badge", variants[variant], bgs[variant])}>{children}</span>
  );
}

export default Badge;
