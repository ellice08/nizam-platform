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

const fetchAndSetOrganisation = async (userId: string, appRole?: string) => {
  // Super admin is identified by app_metadata on the Supabase user object.
  // They may not have a tenant_users row — bypass the DB lookup entirely.
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

    console.log('Auth: resolved role:', best.role, 'for user:', userId)

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

    // Restore existing session on page load
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

        if (event === 'SIGNED_IN' && session?.user) {
          setUser(session.user)
          await fetchAndSetOrganisation(
            session.user.id,
            session.user.app_metadata?.role as string | undefined
          )
          setLoading(false)
        }

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
