import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store'

const ROLE_PRIORITY: Record<string, number> = {
  super_admin: 5,
  org_admin: 4,
  branch_admin: 3,
  branch_staff: 2,
  viewer: 1,
}

export const fetchAndSetOrganisation = async (userId: string, appRole?: string) => {
  if (appRole === 'super_admin') {
    useAuthStore.getState().setOrganisation('', null, 'super_admin')
    useAuthStore.getState().setFirstLogin(false)
    return
  }

  try {
    const { data, error } = await supabase
      .from('tenant_users')
      .select('organisation_id, branch_id, role, first_login')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })

    if (error) throw error
    if (!data || data.length === 0) {
      console.warn('No tenant_users record found for:', userId)
      return
    }

    const best = data.reduce((prev, curr) => {
      const prevPriority = ROLE_PRIORITY[prev.role] ?? 0
      const currPriority = ROLE_PRIORITY[curr.role] ?? 0
      return currPriority > prevPriority ? curr : prev
    })

    useAuthStore.getState().setOrganisation(
      best.organisation_id,
      best.branch_id,
      best.role
    )
    useAuthStore.getState().setFirstLogin(best.first_login ?? false)
  } catch (err) {
    console.error('Organisation fetch error:', err)
  }
}

export const useAuth = () => {
  const { setUser, setLoading, clear } = useAuthStore()

  useEffect(() => {
    let mounted = true

    // Restore an existing session when the page loads or is refreshed.
    // Fresh logins are handled entirely inside Login.tsx — this path
    // only runs when there is already a stored session in the browser.
    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!mounted) return

        if (session?.user) {
          setUser(session.user)
          await fetchAndSetOrganisation(
            session.user.id,
            session.user.app_metadata?.role as string | undefined
          )
        }
      } catch (err) {
        console.error('Auth init error:', err)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return

        if (event === 'SIGNED_OUT') {
          clear()
        }

        if (event === 'TOKEN_REFRESHED' && session?.user) {
          setUser(session.user)
        }
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])
}
