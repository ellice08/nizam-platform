import { cn } from "@/lib/utils";
import { useThemeStore } from "@/store";

interface ElliceLockupProps {
  className?: string;
}

const style = `.wml { font-family: 'Pinyon Script', Palatino, serif; }`;

export const ElliceLockup = ({ className }: ElliceLockupProps) => {
  const { resolvedTheme } = useThemeStore();

  if (resolvedTheme === "dark") {
    return (
      <svg viewBox="0 0 620 120" xmlns="http://www.w3.org/2000/svg" className={cn("h-8 w-auto", className)}>
        <g transform="translate(20, 20)">
          <rect x="5.44" y="5.44" width="31.84" height="31.84" rx="5.44" fill="#7A2535" />
          <rect x="42.72" y="5.44" width="31.84" height="31.84" rx="5.44" fill="rgba(250,250,250,0.15)" />
          <rect x="5.44" y="42.72" width="31.84" height="31.84" rx="5.44" fill="rgba(250,250,250,0.15)" />
          <rect x="42.72" y="42.72" width="31.84" height="31.84" rx="5.44" fill="#C4923A" />
        </g>
        <defs>
          <style>{style}</style>
        </defs>
        <text className="wml" x="359" y="58%" fontSize="64" fill="#FAFAFA" textAnchor="middle" dominantBaseline="middle">ellice</text>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 620 120" xmlns="http://www.w3.org/2000/svg" className={cn("h-8 w-auto", className)}>
      <g transform="translate(20, 20)">
        <rect x="5.44" y="5.44" width="31.84" height="31.84" rx="5.44" fill="#7A2535" />
        <rect x="42.72" y="5.44" width="31.84" height="31.84" rx="5.44" fill="rgba(14,14,12,0.12)" />
        <rect x="5.44" y="42.72" width="31.84" height="31.84" rx="5.44" fill="rgba(14,14,12,0.12)" />
        <rect x="42.72" y="42.72" width="31.84" height="31.84" rx="5.44" fill="#C4923A" />
      </g>
      <defs>
        <style>{style}</style>
      </defs>
      <text className="wml" x="359" y="58%" fontSize="64" fill="#0E0E0C" textAnchor="middle" dominantBaseline="middle">ellice</text>
    </svg>
  );
};

export default ElliceLockup;
