import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store';

export function useAuth() {
  const { setUser, setTenant, setLoading, clear } = useAuthStore();

  useEffect(() => {
    async function fetchTenant(userId: string) {
      console.log("Fetching tenant for user:", userId);
      const { data, error } = await supabase
        .from('tenant_users')
        .select('tenant_id, role')
        .eq('user_id', userId)
        .single();
      console.log("Tenant result:", JSON.stringify(data));
      if (error) console.log("Tenant error:", error.message, error.code);
      if (data) {
        setTenant(data.tenant_id as string, data.role as string);
      }
    }

    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        try {
          await fetchTenant(session.user.id);
        } catch (err) {
          console.log("fetchTenant threw during init:", err);
        }
      }
      setLoading(false);
    }

    void init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log("Auth state changed:", event);
        if (event === 'SIGNED_IN' && session?.user) {
          setLoading(true);
          setUser(session.user);
          try {
            await fetchTenant(session.user.id);
          } catch (err) {
            console.log("fetchTenant threw on SIGNED_IN:", err);
          } finally {
            setLoading(false);
          }
        } else if (event === 'SIGNED_OUT') {
          clear();
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [setUser, setTenant, setLoading, clear]);
}
