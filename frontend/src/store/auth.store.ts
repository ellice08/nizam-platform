import { create } from 'zustand';
import type { User } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  tenantId: string | null;
  role: string | null;
  isAdmin: boolean;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setTenant: (tenantId: string, role: string) => void;
  setLoading: (loading: boolean) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  tenantId: null,
  role: null,
  isAdmin: false,
  isLoading: true,

  setUser: (user) => set({ user }),

  setTenant: (tenantId, role) =>
    set({ tenantId, role, isAdmin: role === 'super_admin' }),

  setLoading: (loading) => set({ isLoading: loading }),

  clear: () =>
    set({ user: null, tenantId: null, role: null, isAdmin: false, isLoading: false }),
}));
