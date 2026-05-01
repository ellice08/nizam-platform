import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store';

export function useAuth() {
  const { setUser, setTenant, setLoading, clear } = useAuthStore();

  useEffect(() => {
    async function fetchTenant(userId: string) {
      const { data } = await supabase
        .from('tenant_users')
        .select('tenant_id, role')
        .eq('user_id', userId)
        .single();
      if (data) {
        setTenant(data.tenant_id as string, data.role as string);
      }
    }

    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        await fetchTenant(session.user.id);
      }
      setLoading(false);
    }

    void init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          setUser(session.user);
          await fetchTenant(session.user.id);
          setLoading(false);
        } else if (event === 'SIGNED_OUT') {
          clear();
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [setUser, setTenant, setLoading, clear]);
}
