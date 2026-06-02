import { useState, useEffect } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store'
import { useOrganisation } from '@/hooks'
import { organisationApi } from '@/api'
import { supabase } from '@/lib/supabase'

const INDUSTRIES = [
  { value: 'real_estate', label: 'Real Estate' },
  { value: 'hospitality', label: 'Hospitality' },
  { value: 'other', label: 'Other' },
]

const TABS = ['General', 'Branding', 'Profile'] as const
type Tab = typeof TABS[number]

// Simple hex colour input with preview swatch
const ColourInput = ({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) => (
  <div>
    <label className="block text-xs uppercase tracking-wider
      text-[hsl(var(--text-secondary))] mb-2">
      {label}
    </label>
    <div className="flex items-center gap-3">
      <div
        className="h-9 w-9 rounded-lg border border-border shrink-0"
        style={{ background: value }}
      />
      <input
        type="color"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-9 w-9 rounded cursor-pointer border-0 bg-transparent p-0"
      />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="#000000"
        className="nz-input nz-mono flex-1"
        maxLength={7}
      />
    </div>
  </div>
)

const Settings = () => {
  const [activeTab, setActiveTab] = useState<Tab>('General')
  const { organisationId, tenantOrgId, user } = useAuthStore()
  const activeOrgId = tenantOrgId ?? organisationId ?? ''
  const { data: org, refetch } = useOrganisation(activeOrgId)

  // General tab state
  const [orgName, setOrgName] = useState('')
  const [industry, setIndustry] = useState('real_estate')
  const [generalSaving, setGeneralSaving] = useState(false)

  // Branding tab state
  const [primaryColor, setPrimaryColor] = useState('#7A2535')
  const [secondaryColor, setSecondaryColor] = useState('#C4909A')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [brandingSaving, setBrandingSaving] = useState(false)

  // Profile tab state
  const [fullName, setFullName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)

  // Populate from org data
  useEffect(() => {
    if (org) {
      setOrgName(org.name ?? '')
      setIndustry((org.industry as string) ?? 'real_estate')
      const branding = org.branding_config as Record<string, unknown>
      if (branding?.primary_color) setPrimaryColor(branding.primary_color as string)
      if (branding?.secondary_color) setSecondaryColor(branding.secondary_color as string)
      if (branding?.logo_url) setLogoUrl(branding.logo_url as string)
    }
  }, [org])

  // Populate display name and full name from auth user
  useEffect(() => {
    if (user) {
      setFullName(
        (user.user_metadata?.full_name as string) ?? ''
      )
      setDisplayName(
        (user.user_metadata?.display_name as string) ??
        (user.email?.split('@')[0] ?? '')
      )
    }
  }, [user])

  const handleSaveGeneral = async () => {
    if (!organisationId) return
    try {
      setGeneralSaving(true)
      await organisationApi.updateOrganisation(organisationId, {
        name: orgName,
        industry: industry as 'real_estate' | 'hospitality' | 'other',
      })
      await refetch()
      toast.success('Organisation settings saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setGeneralSaving(false)
    }
  }

  const handleSaveBranding = async () => {
    if (!organisationId) return
    try {
      setBrandingSaving(true)
      await organisationApi.updateOrganisation(organisationId, {
        branding_config: {
          logo_url: org?.branding_config.logo_url ?? null,
          font: org?.branding_config.font ?? '',
          primary_color: primaryColor,
          secondary_color: secondaryColor,
        },
      })
      await refetch()
      toast.success('Brand colours saved — refresh to see changes across the dashboard')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setBrandingSaving(false)
    }
  }

  const handleLogoUpload = async (file: File) => {
    if (!activeOrgId) return

    if (!['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'].includes(file.type)) {
      toast.error('Please upload a PNG, JPG, SVG or WebP file')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo must be under 2MB')
      return
    }

    try {
      setLogoUploading(true)

      const ext = file.name.split('.').pop()
      const path = `${activeOrgId}/logo.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(path, file, { upsert: true })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('logos')
        .getPublicUrl(path)

      const existing = (org?.branding_config as Record<string, unknown>) ?? {}
      await organisationApi.updateOrganisation(activeOrgId, {
        branding_config: {
          ...existing,
          logo_url: publicUrl,
        },
      })

      setLogoUrl(publicUrl)
      await refetch()
      toast.success('Logo uploaded successfully')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload logo')
    } finally {
      setLogoUploading(false)
    }
  }

  const handleLogoRemove = async () => {
    if (!activeOrgId) return
    try {
      setLogoUploading(true)
      const existing = (org?.branding_config as Record<string, unknown>) ?? {}
      await organisationApi.updateOrganisation(activeOrgId, {
        branding_config: {
          ...existing,
          logo_url: null,
        },
      })
      setLogoUrl(null)
      await refetch()
      toast.success('Logo removed')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove logo')
    } finally {
      setLogoUploading(false)
    }
  }

  const handleSaveProfile = async () => {
    try {
      setProfileSaving(true)
      const { error } = await supabase.auth.updateUser({
        data: {
          full_name: fullName,
          display_name: displayName,
        },
      })
      if (error) throw error
      toast.success('Profile updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setProfileSaving(false)
    }
  }

  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    try {
      setPasswordSaving(true)
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setNewPassword('')
      setConfirmPassword('')
      toast.success('Password changed successfully')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to change password')
    } finally {
      setPasswordSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Organisation"
        title="Settings"
        description="Manage your organisation and account preferences."
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-8 border-b border-border">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2.5 text-sm transition-colors duration-150 -mb-px border-b-2",
              activeTab === tab
                ? "border-primary text-foreground font-medium"
                : "border-transparent text-[hsl(var(--text-secondary))] hover:text-foreground"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── GENERAL TAB ── */}
      {activeTab === 'General' && (
        <div className="max-w-xl space-y-6">
          <div className="rounded-lg border border-border bg-surface p-6 space-y-5">
            <h3 className="text-xs uppercase tracking-wider
              text-[hsl(var(--text-secondary))] font-medium">
              Organisation details
            </h3>
            <div>
              <label className="block text-xs uppercase tracking-wider
                text-[hsl(var(--text-secondary))] mb-2">
                Organisation name
              </label>
              <input
                className="nz-input w-full"
                value={orgName}
                onChange={e => setOrgName(e.target.value)}
                placeholder="Company name"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider
                text-[hsl(var(--text-secondary))] mb-2">
                Industry
              </label>
              <select
                className="nz-input w-full"
                value={industry}
                onChange={e => setIndustry(e.target.value)}
              >
                {INDUSTRIES.map(i => (
                  <option key={i.value} value={i.value}>{i.label}</option>
                ))}
              </select>
            </div>
            <Button
              onClick={() => void handleSaveGeneral()}
              disabled={generalSaving}
              className="bg-primary hover:bg-primary-hover text-primary-foreground"
            >
              {generalSaving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      )}

      {/* ── BRANDING TAB ── */}
      {activeTab === 'Branding' && (
        <div className="max-w-xl space-y-6">
          <div className="rounded-lg border border-border bg-surface p-6 space-y-5">
            <h3 className="text-xs uppercase tracking-wider
              text-[hsl(var(--text-secondary))] font-medium">
              Brand colours
            </h3>
            <p className="text-xs text-[hsl(var(--text-tertiary))] -mt-2">
              These colours apply across your dashboard and embedded chat widget.
            </p>
            <ColourInput
              label="Primary colour"
              value={primaryColor}
              onChange={setPrimaryColor}
            />
            <ColourInput
              label="Secondary colour"
              value={secondaryColor}
              onChange={setSecondaryColor}
            />

            {/* Live preview */}
            <div>
              <p className="text-xs uppercase tracking-wider
                text-[hsl(var(--text-secondary))] mb-3 font-medium">
                Preview
              </p>
              <div className="rounded-lg border border-border bg-elevated p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full"
                    style={{ background: primaryColor }} />
                  <span className="text-xs text-foreground">Primary</span>
                  <span className="nz-mono text-xs text-[hsl(var(--text-tertiary))]">
                    {primaryColor}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full"
                    style={{ background: secondaryColor }} />
                  <span className="text-xs text-foreground">Secondary</span>
                  <span className="nz-mono text-xs text-[hsl(var(--text-tertiary))]">
                    {secondaryColor}
                  </span>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    className="px-3 py-1.5 rounded text-xs text-white font-medium"
                    style={{ background: primaryColor }}
                  >
                    Button
                  </button>
                  <button
                    className="px-3 py-1.5 rounded text-xs text-white font-medium"
                    style={{ background: secondaryColor }}
                  >
                    Secondary
                  </button>
                </div>
              </div>
            </div>

            {/* Logo upload */}
            <div>
              <p className="text-xs uppercase tracking-wider
                text-[hsl(var(--text-secondary))] mb-3 font-medium">
                Logo
              </p>
              <p className="text-xs text-[hsl(var(--text-tertiary))] mb-3">
                Shown in the sidebar. PNG, JPG, SVG or WebP, max 2MB.
              </p>

              {logoUrl ? (
                <div className="flex items-center gap-4 mb-3">
                  <img
                    src={logoUrl}
                    alt="Organisation logo"
                    className="h-10 max-w-[160px] object-contain rounded border border-border bg-elevated p-1"
                  />
                  <button
                    onClick={() => void handleLogoRemove()}
                    disabled={logoUploading}
                    className="text-xs text-destructive hover:text-destructive/80 transition-colors disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="mb-3">
                  <label
                    className={cn(
                      "flex items-center justify-center w-full h-24 rounded-lg border-2 border-dashed border-border cursor-pointer transition-colors duration-150",
                      logoUploading
                        ? "opacity-50 cursor-not-allowed"
                        : "hover:border-primary hover:bg-primary/5"
                    )}
                  >
                    <div className="text-center">
                      {logoUploading ? (
                        <p className="text-xs text-[hsl(var(--text-secondary))]">Uploading…</p>
                      ) : (
                        <>
                          <p className="text-xs text-[hsl(var(--text-secondary))]">
                            Click to upload logo
                          </p>
                          <p className="text-[10px] text-[hsl(var(--text-tertiary))] mt-1">
                            PNG, JPG, SVG, WebP · max 2MB
                          </p>
                        </>
                      )}
                    </div>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml,image/webp"
                      className="hidden"
                      disabled={logoUploading}
                      onChange={e => {
                        const file = e.target.files?.[0]
                        if (file) void handleLogoUpload(file)
                      }}
                    />
                  </label>
                </div>
              )}
            </div>

            <Button
              onClick={() => void handleSaveBranding()}
              disabled={brandingSaving}
              className="bg-primary hover:bg-primary-hover text-primary-foreground"
            >
              {brandingSaving ? 'Saving…' : 'Save brand colours'}
            </Button>
          </div>
        </div>
      )}

      {/* ── PROFILE TAB ── */}
      {activeTab === 'Profile' && (
        <div className="max-w-xl space-y-6">
          {/* Display name */}
          <div className="rounded-lg border border-border bg-surface p-6 space-y-5">
            <h3 className="text-xs uppercase tracking-wider
              text-[hsl(var(--text-secondary))] font-medium">
              Profile
            </h3>
            <div>
              <label className="block text-xs uppercase tracking-wider
                text-[hsl(var(--text-secondary))] mb-2">
                Full name
              </label>
              <input
                className="nz-input w-full"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Your full name"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider
                text-[hsl(var(--text-secondary))] mb-2">
                Display name
              </label>
              <input
                className="nz-input w-full"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Your name"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider
                text-[hsl(var(--text-secondary))] mb-2">
                Email address
              </label>
              <input
                className="nz-input w-full opacity-50 cursor-not-allowed"
                value={user?.email ?? ''}
                disabled
              />
              <p className="text-xs text-[hsl(var(--text-tertiary))] mt-1.5">
                Email cannot be changed here.
              </p>
            </div>
            <Button
              onClick={() => void handleSaveProfile()}
              disabled={profileSaving}
              className="bg-primary hover:bg-primary-hover text-primary-foreground"
            >
              {profileSaving ? 'Saving…' : 'Save profile'}
            </Button>
          </div>

          {/* Change password */}
          <div className="rounded-lg border border-border bg-surface p-6 space-y-5">
            <h3 className="text-xs uppercase tracking-wider
              text-[hsl(var(--text-secondary))] font-medium">
              Change password
            </h3>
            <div>
              <label className="block text-xs uppercase tracking-wider
                text-[hsl(var(--text-secondary))] mb-2">
                New password
              </label>
              <input
                type="password"
                className="nz-input w-full"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Minimum 8 characters"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider
                text-[hsl(var(--text-secondary))] mb-2">
                Confirm new password
              </label>
              <input
                type="password"
                className="nz-input w-full"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
              />
            </div>
            <Button
              onClick={() => void handleChangePassword()}
              disabled={passwordSaving || !newPassword || !confirmPassword}
              className="bg-primary hover:bg-primary-hover text-primary-foreground"
            >
              {passwordSaving ? 'Changing…' : 'Change password'}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}

export default Settings
