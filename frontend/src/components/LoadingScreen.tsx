import markLight from "@/assets/01b_mark_light_transparent.svg";
import markDark from "@/assets/01a_mark_dark_transparent.svg";
import { useThemeStore } from "@/store";

export const LoadingScreen = () => {
  const { resolvedTheme } = useThemeStore();
  const mark = resolvedTheme === "dark" ? markLight : markDark;
  return (
    <div className="flex flex-col items-center justify-center min-h-screen w-full bg-background gap-6">
      <img src={mark} alt="Ellice" className="h-16 w-16 animate-pulse" />
      <div className="h-5 w-5 rounded-full border-2 border-[hsl(var(--text-tertiary))] border-t-transparent animate-spin" />
    </div>
  );
};

export default LoadingScreen;
