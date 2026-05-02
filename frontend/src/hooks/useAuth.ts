import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store';

export function useAuth() {
  const { setUser, setTenant, setLoading, clear } = useAuthStore();

  useEffect(() => {
    async function fetchTenant(userId: string): Promise<void> {
      console.log("Fetching tenant for user:", userId);
      try {
        const { data, error } = await supabase
          .from('tenant_users')
          .select('tenant_id, role')
          .eq('user_id', userId)
          .maybeSingle();

        if (error) {
          console.log("Tenant fetch error:", error.message);
          return;
        }
        if (!data) {
          console.log("No tenant found for user:", userId);
          return;
        }
        console.log("Tenant result:", JSON.stringify(data));
        setTenant(data.tenant_id as string, data.role as string);
      } catch (err) {
        console.log("Tenant fetch threw:", err);
      }
    }

    async function init() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setUser(session.user);
          await fetchTenant(session.user.id);
        }
      } catch (err) {
        console.log("Auth init error:", err);
      } finally {
        setLoading(false);
      }
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
