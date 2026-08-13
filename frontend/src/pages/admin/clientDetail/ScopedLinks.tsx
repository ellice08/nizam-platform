import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Bot, BookOpen, Radio, ArrowRight } from 'lucide-react'
import { useAuthStore } from '@/store'

// Link-outs to the full-featured tenant pages, rather than rebuilding a second
// editor for agent config, knowledge and channels here.
//
// SCOPING MECHANISM: the same tenant-org pin AdminTenantMode uses —
// setTenantOrg(id, name) from auth.store, then navigate to the tenant route.
// Every dashboard page already resolves its org via `tenantOrgId ?? organisationId`
// and the axios interceptor sends X-Tenant-Org-Id, so the operator lands on the
// real page with this client in scope and the "Viewing as" banner visible
// (AppLayout renders it for variant="dashboard" whenever a pin is set), which
// keeps the state obvious and gives a one-click way out.
//
// Deliberately NOT PlatformAssistantScope's variant: that one pins silently and
// restores on unmount because those routes stay inside /admin and should read as
// a native operator section. Here we are genuinely leaving the operator console
// and entering the client's own dashboard, so the visible banner is correct.
const LINKS = [
  {
    to: '/dashboard/agent',
    label: 'Agent configuration',
    description: 'Name, tone, instructions, intents, business hours, escalation contacts',
    icon: Bot,
  },
  {
    to: '/dashboard/knowledge',
    label: 'Knowledge base',
    description: 'Uploaded documents and captured pages',
    icon: BookOpen,
  },
  {
    to: '/dashboard/channels',
    label: 'Channels & credentials',
    description: 'Web chat widget, WhatsApp and voice connections',
    icon: Radio,
  },
]

export function ScopedLinks({ orgId, orgName }: { orgId: string; orgName: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { setTenantOrg } = useAuthStore()

  const open = (to: string) => {
    setTenantOrg(orgId, orgName)
    void queryClient.invalidateQueries()
    navigate(to)
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="font-display text-base font-semibold mb-1">Manage in the client's dashboard</h2>
      <p className="text-xs text-muted-foreground mb-4">
        These open the client's own pages with {orgName} in scope. You'll see a "Viewing as" banner
        and can exit back to the console from there.
      </p>

      <div className="space-y-2">
        {LINKS.map(l => {
          const Icon = l.icon
          return (
            <button
              key={l.to}
              onClick={() => open(l.to)}
              className="w-full flex items-center gap-3 rounded-md border border-border px-3 py-2.5 text-left hover:border-primary hover:bg-muted/20 transition-colors group"
            >
              <Icon className="h-4 w-4 text-muted-foreground shrink-0" strokeWidth={1.5} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{l.label}</p>
                <p className="text-xs text-muted-foreground truncate">{l.description}</p>
              </div>
              <ArrowRight
                className="h-3.5 w-3.5 text-primary opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                strokeWidth={1.5}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default ScopedLinks
