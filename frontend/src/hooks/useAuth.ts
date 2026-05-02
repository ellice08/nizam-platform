import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store'

const fetchAndSetTenant = async (userId: string) => {
  try {
    const { data, error } = await supabase
      .from('tenant_users')
      .select('tenant_id, role')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw error
    if (data) {
      useAuthStore.getState().setTenant(data.tenant_id, data.role)
    }
  } catch (err) {
    console.error('Tenant fetch error:', err)
  }
}

export const useAuth = () => {
  const { setUser, setLoading, clear } = useAuthStore()

  useEffect(() => {
    // Single source of truth — only use getSession on mount
    // onAuthStateChange handles everything after that
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user)
        await fetchAndSetTenant(session.user.id)
      }
      // Always set loading false after initial check
      // regardless of whether a session exists or not
      setLoading(false)
    })

    // This listener only handles changes AFTER initial load
    // It will fire on login, logout, and token refresh
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          setUser(session.user)
          await fetchAndSetTenant(session.user.id)
          setLoading(false)
        }
        if (event === 'SIGNED_OUT') {
          clear()
          setLoading(false)
        }
        // INITIAL_SESSION event fires on load — ignore it here
        // because getSession() above already handles it
      }
    )

    return () => subscription.unsubscribe()
  }, [])
}
