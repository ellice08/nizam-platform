import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store'

const fetchAndSetOrganisation = async (userId: string) => {
  try {
    const { data, error } = await supabase
      .from('tenant_users')
      .select('organisation_id, branch_id, role')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw error
    if (data) {
      useAuthStore.getState().setOrganisation(
        data.organisation_id,
        data.branch_id,
        data.role
      )
    }
  } catch (err) {
    console.error('Organisation fetch error:', err)
  }
}

export const useAuth = () => {
  const { setUser, setLoading, clear } = useAuthStore()

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return
      if (session?.user) {
        setUser(session.user)
        await fetchAndSetOrganisation(session.user.id)
      }
      if (mounted) setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return
        if (event === 'SIGNED_OUT') {
          clear()
          setLoading(false)
        }
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])
}
