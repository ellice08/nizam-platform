import { Outlet } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store'
import { PLATFORM_ORG_ID, PLATFORM_ASSISTANT_BRANCH_ID, PLATFORM_ORG_NAME } from '@/lib/platformAssistant'

// Pins the tenant-scope fields — the SAME org/branch pin tenant-mode uses
// (tenantOrgId/tenantOrgName/tenantBranchId in auth.store.ts, which every
// dashboard page + the axios interceptor already read) — to the Platform
// Support org/branch for the lifetime of the mounted /admin/assistant/*
// route subtree, then restores whatever was there before on unmount. This
// is deliberately NOT the same flow as real tenant-mode (AdminTenantMode.tsx
// navigates to /dashboard and shows the "Viewing as" banner) — these routes
// stay under the admin AppLayout (variant="admin"), where that banner is
// hard-gated off (see AppLayout.tsx), so it reads as a native operator
// section, not impersonation. Snapshot/restore means it can't clobber a
// real tenant-mode session active elsewhere in the same browser tab.
export function PlatformAssistantScope() {
  const queryClient = useQueryClient()
  const snapshotRef = useRef<{ orgId: string | null; orgName: string | null; branchId: string | null } | null>(null)

  useEffect(() => {
    const { tenantOrgId, tenantOrgName, tenantBranchId, setTenantOrg } = useAuthStore.getState()
    snapshotRef.current = { orgId: tenantOrgId, orgName: tenantOrgName, branchId: tenantBranchId }

    setTenantOrg(PLATFORM_ORG_ID, PLATFORM_ORG_NAME, PLATFORM_ASSISTANT_BRANCH_ID)
    void queryClient.invalidateQueries()

    return () => {
      const snap = snapshotRef.current
      const { setTenantOrg: restore, clearTenantOrg } = useAuthStore.getState()
      if (snap?.orgId) {
        restore(snap.orgId, snap.orgName ?? '', snap.branchId)
      } else {
        clearTenantOrg()
      }
      void queryClient.invalidateQueries()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <Outlet />
}

export default PlatformAssistantScope
