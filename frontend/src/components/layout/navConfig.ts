import {
  LayoutDashboard,
  MessagesSquare,
  BookOpen,
  Bot,
  BarChart3,
  CreditCard,
  Users,
  Settings,
  UserPlus,
  ShieldCheck,
  Building2,
  Repeat,
  FileText,
  Inbox,
  LifeBuoy,
  Radio,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

// ── Admin ────────────────────────────────────────────────────────────────────

export const adminSections: NavSection[] = [
  {
    label: "Administration",
    items: [
      { to: "/admin", label: "Overview", icon: ShieldCheck, end: true },
      { to: "/admin/onboard", label: "Onboard client", icon: UserPlus },
    ],
  },
  {
    label: "Clients",
    items: [
      { to: "/admin/leads", label: "Leads", icon: Inbox },
      { to: "/admin/support", label: "Support", icon: LifeBuoy },
      { to: "/admin/clients", label: "All clients", icon: Building2 },
      { to: "/admin/tenant-mode", label: "Tenant mode", icon: Repeat },
      { to: "/admin/drafts", label: "Drafts", icon: FileText },
    ],
  },
  {
    label: "Account",
    items: [
      { to: "/admin/settings", label: "Settings", icon: Settings },
    ],
  },
];

// ── Dashboard (role-filtered) ─────────────────────────────────────────────────

const ALL_WORKSPACE_ITEMS: NavItem[] = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/dashboard/conversations", label: "Conversations", icon: MessagesSquare },
  { to: "/dashboard/channels", label: "Channels", icon: Radio },
  { to: "/dashboard/knowledge", label: "Knowledge", icon: BookOpen },
  { to: "/dashboard/agent", label: "Agent", icon: Bot },
  { to: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/dashboard/billing", label: "Billing", icon: CreditCard },
  { to: "/dashboard/users", label: "Users", icon: Users },
];

const ALL_ORG_ITEMS: NavItem[] = [
  { to: "/dashboard/settings", label: "Settings", icon: Settings },
  { to: "/dashboard/support", label: "Support", icon: LifeBuoy },
];

const ROLE_NAV: Record<string, string[]> = {
  super_admin: [
    "/dashboard",
    "/dashboard/conversations",
    "/dashboard/channels",
    "/dashboard/knowledge",
    "/dashboard/agent",
    "/dashboard/analytics",
    "/dashboard/billing",
    "/dashboard/users",
    "/dashboard/settings",
    "/dashboard/support",
  ],
  org_admin: [
    "/dashboard",
    "/dashboard/conversations",
    "/dashboard/channels",
    "/dashboard/knowledge",
    "/dashboard/agent",
    "/dashboard/analytics",
    "/dashboard/billing",
    "/dashboard/users",
    "/dashboard/settings",
    "/dashboard/support",
  ],
  branch_admin: [
    "/dashboard",
    "/dashboard/conversations",
    "/dashboard/channels",
    "/dashboard/knowledge",
    "/dashboard/agent",
    "/dashboard/analytics",
    "/dashboard/billing",
    "/dashboard/settings",
    "/dashboard/support",
  ],
  branch_staff: [
    "/dashboard",
    "/dashboard/conversations",
    "/dashboard/analytics",
    "/dashboard/settings",
    "/dashboard/support",
  ],
  org_viewer: [
    "/dashboard",
    "/dashboard/conversations",
    "/dashboard/analytics",
    "/dashboard/settings",
    "/dashboard/support",
  ],
  branch_viewer: [
    "/dashboard",
    "/dashboard/conversations",
    "/dashboard/analytics",
    "/dashboard/settings",
    "/dashboard/support",
  ],
};

export function getDashboardSections(role: string | null): NavSection[] {
  const allowed = ROLE_NAV[role ?? ""] ?? ROLE_NAV["branch_viewer"];
  const workspaceItems = ALL_WORKSPACE_ITEMS.filter(item => allowed.includes(item.to));
  const orgItems = ALL_ORG_ITEMS.filter(item => allowed.includes(item.to));
  const sections: NavSection[] = [];
  if (workspaceItems.length > 0) sections.push({ label: "Workspace", items: workspaceItems });
  if (orgItems.length > 0) sections.push({ label: "Organisation", items: orgItems });
  return sections;
}

// ── Helper: flat list for mobile ──────────────────────────────────────────────

export function navFor(variant: "admin" | "dashboard", role?: string | null): NavItem[] {
  if (variant === "admin") return adminSections.flatMap(s => s.items);
  return getDashboardSections(role ?? null).flatMap(s => s.items);
}
