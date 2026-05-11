import { create } from 'zustand';
import type { User } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  organisationId: string | null;
  branchId: string | null;
  role: string | null;
  isAdmin: boolean;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setOrganisation: (organisationId: string, branchId: string | null, role: string) => void;
  setLoading: (loading: boolean) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  organisationId: null,
  branchId: null,
  role: null,
  isAdmin: false,
  isLoading: true,

  setUser: (user) => set({ user }),

  setOrganisation: (organisationId, branchId, role) =>
    set({ organisationId, branchId, role, isAdmin: role === 'super_admin' }),

  setLoading: (loading) => set({ isLoading: loading }),

  clear: () =>
    set({ user: null, organisationId: null, branchId: null, role: null, isAdmin: false, isLoading: false }),
}));
