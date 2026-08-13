import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useUpdateOrganisation } from '@/hooks'
import type { OrganisationWithDetails } from '@/types/api.types'

// Branding (wizard Step 2) made re-editable. Writes only into
// branding_config, and only the keys it owns — the object is merged
// server-side, so the widget's own namespace (branding_config.widget, §5.6)
// is never touched from here.
const COLOURS: Array<{ key: string; label: string }> = [
  { key: 'primary_color', label: 'Primary' },
  { key: 'primary_hover_color', label: 'Primary hover' },
  { key: 'secondary_color', label: 'Secondary' },
  { key: 'accent_color', label: 'Accent' },
  { key: 'background_color', label: 'Background' },
]

export function BrandingSection({ org }: { org: OrganisationWithDetails }) {
  const updateOrg = useUpdateOrganisation()
  const config = (org.branding_config ?? {}) as Record<string, unknown>

  const [colours, setColours] = useState<Record<string, string>>({})
  const [logoUrl, setLogoUrl] = useState('')
  const [logoDarkUrl, setLogoDarkUrl] = useState('')

  useEffect(() => {
    const next: Record<string, string> = {}
    COLOURS.forEach(c => { next[c.key] = (config[c.key] as string) ?? '' })
    setColours(next)
    setLogoUrl((config.logo_url as string) ?? '')
    setLogoDarkUrl((config.logo_dark_url as string) ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org.id])

  const handleSave = () => {
    const branding_config: Record<string, unknown> = { ...config }
    COLOURS.forEach(c => {
      if (colours[c.key]?.trim()) branding_config[c.key] = colours[c.key].trim()
      else delete branding_config[c.key]
    })
    branding_config.logo_url = logoUrl.trim() || null
    branding_config.logo_dark_url = logoDarkUrl.trim() || null

    updateOrg.mutate(
      { id: org.id, payload: { branding_config } },
      {
        onSuccess: () => toast.success('Branding saved'),
        onError: () => toast.error('Failed to save branding'),
      },
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="font-display text-base font-semibold mb-1">Branding</h2>
      <p className="text-xs text-muted-foreground mb-4">
        Applies to this client's dashboard. The chat widget's own appearance is set separately on
        their Channels page.
      </p>

      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Logo URL</label>
            <input
              className="nz-input w-full"
              value={logoUrl}
              onChange={e => setLogoUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Logo URL (dark mode)</label>
            <input
              className="nz-input w-full"
              value={logoDarkUrl}
              onChange={e => setLogoDarkUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>
        </div>

        <div className="space-y-2">
          {COLOURS.map(c => (
            <div key={c.key} className="flex items-center gap-3">
              <label className="text-xs text-muted-foreground w-28 shrink-0">{c.label}</label>
              <input
                type="color"
                value={/^#[0-9a-f]{6}$/i.test(colours[c.key] ?? '') ? colours[c.key] : '#000000'}
                onChange={e => setColours(v => ({ ...v, [c.key]: e.target.value }))}
                className="h-8 w-10 rounded border border-border bg-transparent cursor-pointer shrink-0"
                aria-label={`${c.label} colour`}
              />
              <input
                className="nz-input flex-1 nz-mono text-xs"
                value={colours[c.key] ?? ''}
                onChange={e => setColours(v => ({ ...v, [c.key]: e.target.value }))}
                placeholder="#7A2535"
              />
            </div>
          ))}
        </div>

        <Button onClick={handleSave} disabled={updateOrg.isPending} className="w-full">
          {updateOrg.isPending ? 'Saving…' : 'Save branding'}
        </Button>
      </div>
    </div>
  )
}

export default BrandingSection
