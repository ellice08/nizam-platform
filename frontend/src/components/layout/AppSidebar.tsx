import { useState } from "react";
import { NavLink, useLocation, Link, useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  LogOut,
  Sun,
  Moon,
} from "lucide-react";
import { adminSections, getDashboardSections } from "./navConfig";
import type { NavItem, NavSection } from "./navConfig";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth.store";
import { useThemeStore } from "@/store";
import { supabase } from "@/lib/supabase";
import type { OrganisationWithDetails } from "@/types/api.types";
import markLight from "@/assets/01b_mark_light_transparent.svg";
import markDark from "@/assets/01a_mark_dark_transparent.svg";
import { NotificationBell } from "@/components/NotificationBell";
import { useNavBadgeCounts } from "@/hooks";


type AppSidebarProps = {
  variant: "admin" | "dashboard"
  org?: OrganisationWithDetails | null
};

export function AppSidebar({ variant, org }: AppSidebarProps) {
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const { user, role, isAdmin, clear } = useAuthStore();
  const { theme, resolvedTheme, toggleTheme } = useThemeStore();
  const navigate = useNavigate();
  const email = user?.email ?? "";
  const roleLabel = isAdmin ? "Admin" : (role ?? "");

  const sections: NavSection[] = variant === "admin"
    ? adminSections
    : getDashboardSections(role);
  const badgeCounts = useNavBadgeCounts(variant);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    clear();
    navigate("/login", { replace: true });
  };

  return (
    <aside
      onClick={() => {
        if (collapsed) setCollapsed(false);
      }}
      className={cn(
        "hidden md:flex shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-150 ease-nz",
        "sticky top-0 h-screen",
        collapsed ? "w-[72px] cursor-pointer" : "w-64"
      )}
    >
      <div
        className={cn(
          "h-16 flex items-center gap-2 border-b border-sidebar-border",
          collapsed ? "justify-center px-2" : "justify-center px-6"
        )}
      >
        <Link
          to={variant === "admin" ? "/admin" : "/dashboard"}
          onClick={(e) => e.stopPropagation()}
          className="flex items-baseline gap-1.5"
        >
          {!collapsed && (
            variant === "dashboard" && org?.branding_config.logo_url ? (
              <img
                src={
                  theme === 'dark' && (org.branding_config as Record<string, unknown>).logo_dark_url
                    ? (org.branding_config as Record<string, unknown>).logo_dark_url as string
                    : org.branding_config.logo_url!
                }
                alt={org.name}
                className="h-7 max-w-[120px] object-contain"
              />
            ) : variant === "admin" ? (
              <img
                src={resolvedTheme === 'dark' ? markLight : markDark}
                alt="Ellice"
                className="h-7 w-7 object-contain"
              />
            ) : (
              <span className="font-display text-2xl tracking-tight text-foreground">
                {org?.name ?? "nizam"}
              </span>
            )
          )}
          <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
        </Link>
        {!collapsed && variant === "admin" && (
          <span className="ml-auto text-[10px] uppercase tracking-[0.18em] text-primary">
            Admin
          </span>
        )}
      </div>

      <nav className="flex-1 overflow-hidden px-3 py-6 space-y-8">
        <div>
          <NotificationBell variant="sidebar" collapsed={collapsed} />
        </div>
        {sections.map((section) => (
          <div key={section.label}>
            {!collapsed && (
              <p className="px-3 mb-2 text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--text-secondary))]">
                {section.label}
              </p>
            )}
            <ul className="space-y-1">
              {section.items.map((item) => {
                const active = item.end ? pathname === item.to : pathname.startsWith(item.to);
                const Icon = item.icon;
                const badgeCount = badgeCounts[item.to] ?? 0;
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      onClick={(e) => e.stopPropagation()}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-150 ease-nz",
                        collapsed && "justify-center",
                        active
                          ? "text-foreground border-l-2 border-l-primary pl-[10px]"
                          : "text-[hsl(var(--text-secondary))] hover:text-foreground hover:bg-surface"
                      )}
                      style={active ? { backgroundColor: "hsl(var(--primary) / 0.12)" } : undefined}
                    >
                      <span className="relative shrink-0">
                        <Icon className="h-4 w-4" strokeWidth={1.5} />
                        {badgeCount > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 h-4 min-w-[1rem] px-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center leading-none pointer-events-none">
                            {badgeCount > 9 ? "9+" : badgeCount}
                          </span>
                        )}
                      </span>
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setCollapsed((c) => !c);
          }}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs text-[hsl(var(--text-secondary))] hover:text-foreground hover:bg-surface transition-colors duration-150 ease-nz border-b border-sidebar-border"
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.5} /> : (
            <>
              <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
              <span>Collapse</span>
            </>
          )}
        </button>
        {!collapsed && (
          <div className="px-4 py-4 text-xs text-sidebar-foreground/50">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <p className="truncate">{email}</p>
              {roleLabel && (
                <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-[0.15em] bg-sidebar-accent text-sidebar-accent-foreground">
                  {roleLabel}
                </span>
              )}
            </div>
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleTheme();
          }}
          className={cn(
            "w-full flex items-center gap-2 px-4 py-2.5 text-xs text-[hsl(var(--text-secondary))] hover:text-foreground hover:bg-surface transition-colors duration-150 ease-nz",
            collapsed && "justify-center"
          )}
          title={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {resolvedTheme === 'dark'
            ? <Sun className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
            : <Moon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
          }
          {!collapsed && (
            <span>{resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          )}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleLogout();
          }}
          className={cn(
            "w-full flex items-center gap-2 px-4 py-2.5 text-xs text-[hsl(var(--text-secondary))] hover:text-foreground hover:bg-surface transition-colors duration-150 ease-nz",
            collapsed && "justify-center"
          )}
        >
          <LogOut className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}

export default AppSidebar;
