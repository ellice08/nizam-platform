import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useConversationsNeedingAttentionCount } from './useConversations'
import { useOpenSupportTicketCount } from './useSupport'
import { navViewsApi } from '@/api'
import type { NavBadgeSection } from '@/api'

// Nav-item badge counts, keyed by path — same shape AppSidebar/MobileTopBar
// already use to look up NavItems.
//
// Conversations is dashboard-only: there's no operator-side equivalent —
// /admin/leads is sales leads for onboarding new Nizam clients, not a
// cross-tenant customer-conversation queue — so that query stays disabled
// (never fetched, not just hidden) on the admin console.
//
// Support fires on BOTH surfaces. The backend endpoint itself is role-aware
// (mirrors GET /api/support/tickets' scoping): tenant users get their own
// org's open-ticket count, the operator gets the real cross-tenant count
// across every organisation. Same query, same hook — only the path key (and
// therefore which nav item it's attached to) differs by variant.
export function useNavBadgeCounts(variant: 'admin' | 'dashboard'): Record<string, number> {
  const isDashboard = variant === 'dashboard'
  const { data: conversationsCount } = useConversationsNeedingAttentionCount(isDashboard)
  const { data: supportCount } = useOpenSupportTicketCount(true)

  if (isDashboard) {
    return {
      '/dashboard/conversations': conversationsCount ?? 0,
      '/dashboard/support': supportCount ?? 0,
    }
  }

  return {
    '/admin/support': supportCount ?? 0,
  }
}

// Call on mount from the page that "is" a badged section (Conversations,
// Support) — records that the user just opened it (POST
// /api/nav-views/mark-viewed) and immediately invalidates that section's
// badge-count query so the nav badge clears right away, not on the next
// 25s poll. This is what makes the badges self-clear on open, per section.
export function useMarkSectionViewed() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (section: NavBadgeSection) => navViewsApi.markViewed(section),
    onSuccess: (_data, section) => {
      void queryClient.invalidateQueries({ queryKey: [section === 'conversations' ? 'conversations' : 'support'] })
    },
  })
}
