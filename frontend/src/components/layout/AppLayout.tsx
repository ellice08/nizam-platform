import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";

type AppLayoutProps = {
  variant: "admin" | "dashboard";
};

export function AppLayout({ variant }: AppLayoutProps) {
  return (
    <div className="min-h-screen w-full flex bg-background text-foreground">
      <AppSidebar variant={variant} />
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 px-6 md:px-10 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AppLayout;