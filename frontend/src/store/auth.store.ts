import { create } from 'zustand';
import type { User } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  organisationId: string | null;
  branchId: string | null;
  role: string | null;
  isAdmin: boolean;
  isLoading: boolean;
  firstLogin: boolean;
  tenantOrgId: string | null;
  tenantOrgName: string | null;
  // Optional branch pin alongside tenantOrgId — tenant-mode never set this
  // (every real tenant so far has exactly one branch, so "first branch of
  // org" was always correct), but a caller with a specific branch to pin
  // to (e.g. the Platform Assistant section, see auth.middleware.ts) can
  // pass one via setTenantOrg's third arg.
  tenantBranchId: string | null;
  setUser: (user: User | null) => void;
  setOrganisation: (organisationId: string, branchId: string | null, role: string) => void;
  setLoading: (loading: boolean) => void;
  setFirstLogin: (firstLogin: boolean) => void;
  setTenantOrg: (id: string, name: string, branchId?: string | null) => void;
  clearTenantOrg: () => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  organisationId: null,
  branchId: null,
  role: null,
  isAdmin: false,
  isLoading: true,
  firstLogin: false,
  tenantOrgId: null,
  tenantOrgName: null,
  tenantBranchId: null,

  setUser: (user) => set({ user }),

  setOrganisation: (organisationId, branchId, role) =>
    set({ organisationId, branchId, role, isAdmin: role === 'super_admin' }),

  setLoading: (loading) => set({ isLoading: loading }),

  setFirstLogin: (firstLogin) => set({ firstLogin }),

  setTenantOrg: (id, name, branchId = null) => set({ tenantOrgId: id, tenantOrgName: name, tenantBranchId: branchId }),

  clearTenantOrg: () => set({ tenantOrgId: null, tenantOrgName: null, tenantBranchId: null }),

  clear: () =>
    set({ user: null, organisationId: null, branchId: null, role: null, isAdmin: false, isLoading: false, firstLogin: false, tenantOrgId: null, tenantOrgName: null, tenantBranchId: null }),
}));
