import { useConversationsNeedingAttentionCount } from './useConversations'
import { useOpenSupportTicketCount } from './useSupport'

// Nav-item badge counts, keyed by path — same shape AppSidebar/MobileTopBar
// already use to look up NavItems. Dashboard-only: the admin console has no
// single tenant to scope these counts to, so the underlying queries stay
// disabled there (never fetched, not just hidden).
export function useNavBadgeCounts(variant: 'admin' | 'dashboard'): Record<string, number> {
  const enabled = variant === 'dashboard'
  const { data: conversationsCount } = useConversationsNeedingAttentionCount(enabled)
  const { data: supportCount } = useOpenSupportTicketCount(enabled)

  if (!enabled) return {}

  return {
    '/dashboard/conversations': conversationsCount ?? 0,
    '/dashboard/support': supportCount ?? 0,
  }
}
