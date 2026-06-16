import { useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { formatDistanceToNow } from "date-fns"
import { PageHeader } from "@/components/PageHeader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAllOrganisations, useHighlightOnArrival } from "@/hooks"
import { useAuthStore } from "@/store"
import { cn } from "@/lib/utils"
import type { Organisation } from "@/types/api.types"

const planStyle: Record<string, React.CSSProperties> = {
  pro:        { backgroundColor: "#7A2535", borderColor: "#7A2535", color: "#fff" },
  enterprise: { backgroundColor: "#C4923A", borderColor: "#C4923A", color: "#fff" },
}
const planClass: Record<string, string> = {
  trial: "border-border text-muted-foreground",
  starter: "border-green-500 text-green-600",
  pro: "", enterprise: "",
}
function PlanBadge({ plan }: { plan: Organisation["plan"] }) {
  return <Badge variant="outline" className={planClass[plan] ?? ""} style={planStyle[plan]}>{plan}</Badge>
}
const industryLabel: Record<string, string> = {
  real_estate: "Real estate", hospitality: "Hospitality", other: "Other",
}

const AdminClients = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { setTenantOrg, organisationId } = useAuthStore()
  const { data: allOrgs, isLoading, isError } = useAllOrganisations()
  const { targetId, isFlashing } = useHighlightOnArrival('client')
  const flashRowRef = useRef<HTMLTableRowElement | null>(null)

  // Scroll the highlighted row into view once the list renders.
  useEffect(() => {
    if (targetId && flashRowRef.current) {
      flashRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [targetId, allOrgs])

  // Exclude the super admin's own org (Ellice Systems)
  const organisations = (allOrgs ?? []).filter(o => o.id !== organisationId)

  return (
    <>
      <PageHeader
        eyebrow="Clients"
        title="All clients"
        description="Every organisation on the platform."
      >
        <Button onClick={() => navigate("/admin/onboard")} size="sm">
          + Onboard client
        </Button>
      </PageHeader>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {isError && (
          <div className="px-6 py-8 text-sm text-destructive">
            Failed to load organisations.
          </div>
        )}
        {isLoading && (
          <div className="divide-y divide-border">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-5 w-16 ml-auto" />
                <Skeleton className="h-8 w-14" />
              </div>
            ))}
          </div>
        )}
        {!isLoading && !isError && (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-muted/30">
              <tr>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-[0.18em] text-muted-foreground font-medium">Name</th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-[0.18em] text-muted-foreground font-medium">Industry</th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-[0.18em] text-muted-foreground font-medium">Plan</th>
                <th className="px-6 py-3 text-left text-xs uppercase tracking-[0.18em] text-muted-foreground font-medium">Joined</th>
                <th className="px-6 py-3 text-right text-xs uppercase tracking-[0.18em] text-muted-foreground font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {organisations.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-muted-foreground">
                    No clients yet.
                  </td>
                </tr>
              )}
              {organisations.map((org) => (
                <tr
                  key={org.id}
                  ref={org.id === targetId ? flashRowRef : null}
                  className={cn(
                    "hover:bg-muted/20 cursor-pointer transition-colors",
                    isFlashing(org.id) && "nz-flash",
                  )}
                  onClick={() => navigate(`/admin/clients/${org.id}`)}
                >
                  <td className="px-6 py-4 font-medium">{org.name}</td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {industryLabel[org.industry] ?? org.industry}
                  </td>
                  <td className="px-6 py-4"><PlanBadge plan={org.plan} /></td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {formatDistanceToNow(new Date(org.created_at), { addSuffix: true })}
                  </td>
                  <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <Button variant="outline" size="sm"
                      onClick={() => navigate(`/admin/clients/${org.id}`)}>
                      View
                    </Button>
                    <Button variant="outline" size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        setTenantOrg(org.id, org.name)
                        void queryClient.invalidateQueries()
                        navigate('/dashboard')
                      }}
                      className="ml-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground">
                      Act as
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </>
  )
}

export default AdminClients
