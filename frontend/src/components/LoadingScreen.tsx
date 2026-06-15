export const LoadingScreen = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen w-full bg-background gap-5">
      <div className="flex flex-col items-center gap-3 animate-pulse">
        <span className="font-display text-3xl font-semibold tracking-tight text-foreground">
          Nizam
        </span>
        <div className="h-5 w-5 rounded-full border-2 border-[hsl(var(--text-tertiary))] border-t-transparent animate-spin" />
      </div>
    </div>
  );
};

export default LoadingScreen;
