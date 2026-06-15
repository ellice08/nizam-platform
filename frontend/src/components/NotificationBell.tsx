import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, UserPlus, AlertCircle, LifeBuoy, MessageSquare, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from "@/hooks";
import { useAuthStore } from "@/store";
import { cn } from "@/lib/utils";
import type { AppNotification, NotificationType } from "@/api/notification.api";

const TYPE_CONFIG: Record<NotificationType, { icon: LucideIcon; color: string }> = {
  lead:           { icon: UserPlus,       color: "text-primary" },
  escalation:     { icon: AlertCircle,    color: "text-destructive" },
  support_ticket: { icon: LifeBuoy,       color: "text-[hsl(var(--text-secondary))]" },
  support_reply:  { icon: MessageSquare,  color: "text-[hsl(var(--text-secondary))]" },
  system:         { icon: Settings,       color: "text-[hsl(var(--text-tertiary))]" },
};

interface NotificationBellProps {
  variant?: "sidebar" | "topbar";
  collapsed?: boolean;
}

export function NotificationBell({ variant = "topbar", collapsed = false }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const currentUserId = user?.id ?? "";

  const { data } = useNotifications();
  const { mutate: markRead } = useMarkNotificationRead();
  const { mutate: markAllRead } = useMarkAllNotificationsRead();

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unread_count ?? 0;

  const isUnread = (n: AppNotification) => !n.read_by.includes(currentUserId);

  const handleRowClick = (n: AppNotification) => {
    markRead(n.id);
    if (n.link) {
      navigate(n.link);
      setOpen(false);
    }
  };

  const badge = unreadCount > 0 ? (
    <span className="absolute -top-1.5 -right-1.5 h-4 min-w-[1rem] px-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center leading-none pointer-events-none">
      {unreadCount > 9 ? "9+" : unreadCount}
    </span>
  ) : null;

  const panel = (
    <PopoverContent
      side={variant === "sidebar" ? "right" : "bottom"}
      align={variant === "sidebar" ? "start" : "end"}
      sideOffset={8}
      className="p-0 w-80 max-h-[400px] flex flex-col border-border bg-surface shadow-lg"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <span className="text-sm font-medium text-foreground">Notifications</span>
        {unreadCount > 0 && (
          <button
            onClick={() => markAllRead()}
            className="text-xs text-[hsl(var(--text-secondary))] hover:text-foreground transition-colors duration-150"
          >
            Mark all read
          </button>
        )}
      </div>

      <div className="overflow-y-auto flex-1">
        {notifications.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-[hsl(var(--text-secondary))]">
            No notifications yet
          </div>
        ) : (
          notifications.map((n) => {
            const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.system;
            const Icon = cfg.icon;
            const unread = isUnread(n);
            return (
              <button
                key={n.id}
                onClick={() => handleRowClick(n)}
                className={cn(
                  "w-full text-left flex items-start gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-elevated transition-colors duration-150",
                  unread && "bg-primary/5"
                )}
              >
                <span className={cn("mt-0.5 shrink-0", cfg.color)}>
                  <Icon className="h-4 w-4" strokeWidth={1.5} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className={cn(
                      "text-sm leading-snug",
                      unread ? "font-medium text-foreground" : "text-foreground"
                    )}>
                      {n.title}
                    </span>
                    {unread && (
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                    )}
                  </div>
                  {n.body && (
                    <p className="mt-0.5 text-xs text-[hsl(var(--text-secondary))] line-clamp-2">
                      {n.body}
                    </p>
                  )}
                  <p className="mt-1 text-[10px] text-[hsl(var(--text-tertiary))]">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </PopoverContent>
  );

  if (variant === "sidebar") {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            title={collapsed ? "Notifications" : undefined}
            className={cn(
              "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm w-full transition-colors duration-150 ease-nz",
              collapsed && "justify-center",
              "text-[hsl(var(--text-secondary))] hover:text-foreground hover:bg-surface"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="relative shrink-0">
              <Bell className="h-4 w-4" strokeWidth={1.5} />
              {badge}
            </span>
            {!collapsed && <span className="truncate">Notifications</span>}
          </button>
        </PopoverTrigger>
        {panel}
      </Popover>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label="Notifications"
          className="relative h-9 w-9 rounded-md border border-border text-foreground flex items-center justify-center hover:bg-elevated transition-colors duration-150"
        >
          <Bell className="h-4 w-4" strokeWidth={1.5} />
          {badge}
        </button>
      </PopoverTrigger>
      {panel}
    </Popover>
  );
}

export default NotificationBell;
