import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  MessagesSquare,
  BookOpen,
  Bot,
  BarChart3,
  CreditCard,
  Users,
  UserPlus,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth.store";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const dashboardSections: NavSection[] = [
  {
    label: "Workspace",
    items: [
      { to: "/dashboard", label: "Overview", icon: LayoutDashboard, end: true },
      { to: "/dashboard/conversations", label: "Conversations", icon: MessagesSquare },
      { to: "/dashboard/knowledge", label: "Knowledge", icon: BookOpen },
      { to: "/dashboard/agent", label: "Agent", icon: Bot },
      { to: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
      { to: "/dashboard/billing", label: "Billing", icon: CreditCard },
    ],
  },
];

const adminSections: NavSection[] = [
  {
    label: "Administration",
    items: [
      { to: "/admin", label: "Overview", icon: ShieldCheck, end: true },
      { to: "/admin/onboard", label: "Onboard client", icon: UserPlus },
    ],
  },
];

type AppSidebarProps = {
  variant: "admin" | "dashboard";
};

export function AppSidebar({ variant }: AppSidebarProps) {
  const sections = variant === "admin" ? adminSections : dashboardSections;
  const { pathname } = useLocation();
  const { user, role, isAdmin } = useAuthStore();
  const email = user?.email ?? "";
  const roleLabel = isAdmin ? "Admin" : (role ?? "");

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="h-16 flex items-center gap-2 px-6 border-b border-sidebar-border">
        <span className="h-2 w-2 rounded-full bg-gold" aria-hidden />
        <span className="font-display text-xl font-semibold tracking-tight text-sidebar-foreground">
          Nizam
        </span>
        {variant === "admin" && (
          <span className="ml-auto text-[10px] uppercase tracking-[0.18em] text-gold">
            Admin
          </span>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-6 space-y-8">
        {sections.map((section) => (
          <div key={section.label}>
            <p className="px-3 mb-2 text-[10px] uppercase tracking-[0.2em] text-sidebar-foreground/50">
              {section.label}
            </p>
            <ul className="space-y-1">
              {section.items.map((item) => {
                const active =
                  item.end ? pathname === item.to : pathname.startsWith(item.to);
                const Icon = item.icon;
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "absolute left-0 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full transition-all",
                          active ? "bg-gold opacity-100 shadow-[0_0_8px_hsl(var(--gold))]" : "opacity-0"
                        )}
                      />
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {variant === "admin" && (
          <div>
            <p className="px-3 mb-2 text-[10px] uppercase tracking-[0.2em] text-sidebar-foreground/50">
              Clients
            </p>
            <div className="px-3 py-2 text-xs text-sidebar-foreground/60 flex items-center gap-2">
              <Users className="h-3.5 w-3.5" />
              Select a client to view details
            </div>
          </div>
        )}
      </nav>

      <div className="border-t border-sidebar-border px-6 py-4 text-xs text-sidebar-foreground/50">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <p className="truncate">{email}</p>
          {roleLabel && (
            <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-[0.15em] bg-sidebar-accent text-sidebar-accent-foreground">
              {roleLabel}
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}

export default AppSidebar;