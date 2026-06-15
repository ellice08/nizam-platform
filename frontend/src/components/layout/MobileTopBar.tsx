import { useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Menu, X, LogOut, LayoutDashboard, MessagesSquare, BookOpen, Bot, BarChart3, CreditCard, Users, Settings, ShieldCheck, UserPlus, Building2, Repeat, FileText } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth.store";
import { supabase } from "@/lib/supabase";
import type { OrganisationWithDetails } from "@/types/api.types";
import { useThemeStore } from "@/store";
import { NotificationBell } from "@/components/NotificationBell";

type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean };

const adminItems: NavItem[] = [
  { to: "/admin", label: "Overview", icon: ShieldCheck, end: true },
  { to: "/admin/onboard", label: "Onboard client", icon: UserPlus },
  { to: "/admin/clients", label: "All clients", icon: Building2 },
  { to: "/admin/tenant-mode", label: "Tenant mode", icon: Repeat },
  { to: "/admin/drafts", label: "Drafts", icon: FileText },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];

const dashboardItems: NavItem[] = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/dashboard/conversations", label: "Conversations", icon: MessagesSquare },
  { to: "/dashboard/knowledge", label: "Knowledge", icon: BookOpen },
  { to: "/dashboard/agent", label: "Agent", icon: Bot },
  { to: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/dashboard/billing", label: "Billing", icon: CreditCard },
  { to: "/dashboard/users", label: "Users", icon: Users },
  { to: "/dashboard/settings", label: "Settings", icon: Settings },
];

type Props = { variant: "admin" | "dashboard"; org?: OrganisationWithDetails | null };

export function MobileTopBar({ variant, org }: Props) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { clear } = useAuthStore();
  const { theme } = useThemeStore();
  const items = variant === "admin" ? adminItems : dashboardItems;

  const brandingLogo =
    variant === "dashboard" && org?.branding_config.logo_url
      ? (theme === "dark" && (org.branding_config as Record<string, unknown>).logo_dark_url
          ? ((org.branding_config as Record<string, unknown>).logo_dark_url as string)
          : org.branding_config.logo_url)
      : null;

  const BrandMark = () => (
    brandingLogo ? (
      <img src={brandingLogo} alt={org?.name ?? ""} className="h-7 max-w-[140px] object-contain" />
    ) : (
      <span className="flex items-baseline gap-1.5">
        <span className="font-display text-xl tracking-tight text-foreground">
          {variant === "dashboard" && org?.name ? org.name : "nizam"}
        </span>
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
      </span>
    )
  );

  const handleLogout = async () => {
    await supabase.auth.signOut();
    clear();
    navigate("/login", { replace: true });
  };

  return (
    <>
      <div className="md:hidden sticky top-0 z-40 h-14 border-b border-border bg-background flex items-center justify-between px-4">
        <Link to={variant === "admin" ? "/admin" : "/dashboard"} className="flex items-center">
          <BrandMark />
        </Link>
        <div className="flex items-center gap-2">
          <NotificationBell variant="topbar" />
          <button
            aria-label="Open menu"
            onClick={() => setOpen(true)}
            className="h-9 w-9 rounded-md border border-border text-foreground flex items-center justify-center hover:bg-elevated transition-colors duration-150"
          >
            <Menu className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 w-[280px] max-w-[80%] bg-sidebar border-r border-border flex flex-col animate-nz-fade-in">
            <div className="h-14 flex items-center justify-between px-4 border-b border-border">
              <Link
                to={variant === "admin" ? "/admin" : "/dashboard"}
                onClick={() => setOpen(false)}
                className="flex items-center"
              >
                <BrandMark />
              </Link>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="h-9 w-9 rounded-md text-[hsl(var(--text-secondary))] hover:text-foreground hover:bg-surface flex items-center justify-center transition-colors duration-150"
              >
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
              {items.map((item) => {
                const active = item.end ? pathname === item.to : pathname.startsWith(item.to);
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors duration-150",
                      active
                        ? "text-foreground border-l-2 border-l-primary pl-[10px]"
                        : "text-[hsl(var(--text-secondary))] hover:text-foreground hover:bg-surface"
                    )}
                    style={active ? { backgroundColor: "hsl(var(--primary) / 0.12)" } : undefined}
                  >
                    <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                );
              })}
            </nav>

            <div className="border-t border-border p-3">
              <button
                onClick={() => {
                  setOpen(false);
                  void handleLogout();
                }}
                className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm text-[hsl(var(--text-secondary))] hover:text-foreground hover:bg-surface transition-colors duration-150"
              >
                <LogOut className="h-4 w-4" strokeWidth={1.5} />
                Sign out
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

export default MobileTopBar;
