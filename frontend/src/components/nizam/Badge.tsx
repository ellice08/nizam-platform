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
  starter: "bg-[#0F1F0F]",
  pro: "bg-[#1A0F0F]",
  enterprise: "bg-[#1A1510]",
};

export function Badge({ variant = "neutral", children }: { variant?: Variant; children: React.ReactNode }) {
  return (
    <span className={cn("nz-badge", variants[variant], bgs[variant])}>{children}</span>
  );
}

export default Badge;
