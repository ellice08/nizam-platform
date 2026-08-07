import { useConversationsNeedingAttentionCount } from './useConversations'
import { useOpenSupportTicketCount } from './useSupport'

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
