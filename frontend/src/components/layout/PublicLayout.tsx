import { Outlet } from "react-router-dom";
import { PublicNavbar } from "./PublicNavbar";

export function PublicLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <PublicNavbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-border py-8">
        <div className="container flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-[hsl(var(--text-secondary))]">
          <p>© {new Date().getFullYear()} Nizam. A product of Ellice Systems.</p>
          <p className="font-display italic">Order, refined.</p>
        </div>
      </footer>
    </div>
  );
}

export default PublicLayout;
