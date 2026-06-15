import markLight from "@/assets/01b_mark_light_transparent.svg";
import markDark from "@/assets/01a_mark_dark_transparent.svg";
import { useThemeStore } from "@/store";

export const LoadingScreen = () => {
  const { resolvedTheme } = useThemeStore();
  const mark = resolvedTheme === "dark" ? markLight : markDark;
  return (
    <div className="flex flex-col items-center justify-center min-h-screen w-full bg-background gap-6">
      <style>{`
        @keyframes nzDotPulse {
          0%, 80%, 100% { opacity: 0.25; transform: scale(0.85); }
          40% { opacity: 1; transform: scale(1); }
        }
        .nz-dot { animation: nzDotPulse 1.2s ease-in-out infinite; }
      `}</style>
      <img src={mark} alt="Ellice" className="h-12 w-12" />
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--text-tertiary))] nz-dot" style={{ animationDelay: "0ms" }} />
        <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--text-tertiary))] nz-dot" style={{ animationDelay: "160ms" }} />
        <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--text-tertiary))] nz-dot" style={{ animationDelay: "320ms" }} />
      </div>
    </div>
  );
};

export default LoadingScreen;
