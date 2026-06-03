import { useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { PageHeader } from "@/components/PageHeader"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowRight } from "lucide-react"
import { useAllOrganisations } from "@/hooks"
import { useAuthStore } from "@/store"

const AdminTenantMode = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { setTenantOrg, organisationId } = useAuthStore()
  const { data: allOrgs, isLoading } = useAllOrganisations()

  const organisations = (allOrgs ?? []).filter(o => o.id !== organisationId)

  const enterTenantMode = (id: string, name: string) => {
    setTenantOrg(id, name)
    void queryClient.invalidateQueries()
    navigate('/dashboard')
  }

  return (
    <>
      <PageHeader
        eyebrow="Clients"
        title="Tenant mode"
        description="Select a client to view their dashboard as they see it."
      />

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      ) : organisations.length === 0 ? (
        <div className="rounded-lg border border-border bg-card px-6 py-10 text-center text-muted-foreground">
          No clients yet.
        </div>
      ) : (
        <div className="space-y-2">
          {organisations.map((org) => (
            <button
              key={org.id}
              onClick={() => enterTenantMode(org.id, org.name)}
              className="w-full flex items-center gap-4 rounded-lg border border-border bg-card px-6 py-4 hover:border-primary hover:bg-muted/20 transition-colors text-left group"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">{org.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{org.industry?.replace('_', ' ')} · {org.plan}</p>
              </div>
              <span className="flex items-center gap-1.5 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                Enter dashboard
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  )
}

export default AdminTenantMode
