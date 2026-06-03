import { useState, useEffect } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Sun, Moon, Monitor } from 'lucide-react'
import { useAuthStore, useThemeStore } from '@/store'
import { supabase } from '@/lib/supabase'

const TABS = ['Profile', 'Appearance'] as const
type Tab = typeof TABS[number]

const AdminSettings = () => {
  const [activeTab, setActiveTab] = useState<Tab>('Profile')
  const { user } = useAuthStore()
  const { theme, setTheme } = useThemeStore()

  const [fullName, setFullName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)

  useEffect(() => {
    if (user) {
      setFullName((user.user_metadata?.full_name as string) ?? '')
      setDisplayName(
        (user.user_metadata?.display_name as string) ??
        (user.email?.split('@')[0] ?? '')
      )
    }
  }, [user])

  const handleSaveProfile = async () => {
    try {
      setProfileSaving(true)
      const { error } = await supabase.auth.updateUser({
        data: { full_name: fullName, display_name: displayName },
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
    if (!currentPassword) {
      toast.error('Please enter your current password')
      return
    }
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match')
      return
    }
    if (currentPassword === newPassword) {
      toast.error('New password must be different from current password')
      return
    }
    try {
      setPasswordSaving(true)

      // Verify current password by re-authenticating
      const email = user?.email
      if (!email) {
        toast.error('Could not verify account')
        return
      }
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      })
      if (verifyError) {
        toast.error('Current password is incorrect')
        return
      }

      // Now update to new password
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setCurrentPassword('')
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
        eyebrow="Administration"
        title="Settings"
        description="Manage your account and preferences."
      />

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

      {activeTab === 'Profile' && (
        <div className="max-w-xl space-y-6">
          <div className="rounded-lg border border-border bg-surface p-6 space-y-5">
            <h3 className="text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] font-medium">
              Profile
            </h3>
            <div>
              <label className="block text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-2">
                Full name
              </label>
              <input className="nz-input w-full" value={fullName}
                onChange={e => setFullName(e.target.value)} placeholder="Your full name" />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-2">
                Display name
              </label>
              <input className="nz-input w-full" value={displayName}
                onChange={e => setDisplayName(e.target.value)} placeholder="Your name" />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-2">
                Email address
              </label>
              <input className="nz-input w-full opacity-50 cursor-not-allowed"
                value={user?.email ?? ''} disabled />
              <p className="text-xs text-[hsl(var(--text-tertiary))] mt-1.5">
                Email cannot be changed here.
              </p>
            </div>
            <Button onClick={() => void handleSaveProfile()} disabled={profileSaving}
              className="bg-primary hover:bg-primary-hover text-primary-foreground">
              {profileSaving ? 'Saving…' : 'Save profile'}
            </Button>
          </div>

          <div className="rounded-lg border border-border bg-surface p-6 space-y-5">
            <h3 className="text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] font-medium">
              Change password
            </h3>
            <div>
              <label className="block text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-2">
                Current password
              </label>
              <input type="password" className="nz-input w-full" value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)} placeholder="Enter current password" />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-2">
                New password
              </label>
              <input type="password" className="nz-input w-full" value={newPassword}
                onChange={e => setNewPassword(e.target.value)} placeholder="Minimum 8 characters" />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-2">
                Confirm new password
              </label>
              <input type="password" className="nz-input w-full" value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat new password" />
            </div>
            <Button onClick={() => void handleChangePassword()}
              disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
              className="bg-primary hover:bg-primary-hover text-primary-foreground">
              {passwordSaving ? 'Changing…' : 'Change password'}
            </Button>
          </div>
        </div>
      )}

      {activeTab === 'Appearance' && (
        <div className="max-w-xl space-y-6">
          <div className="rounded-lg border border-border bg-surface p-6 space-y-5">
            <h3 className="text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] font-medium">
              Theme
            </h3>
            <p className="text-xs text-[hsl(var(--text-tertiary))] -mt-2">
              Choose how the console looks. Your preference is saved automatically.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setTheme('auto')}
                className={cn(
                  "flex-1 flex flex-col items-center gap-3 p-4 rounded-lg border-2 transition-colors duration-150",
                  theme === 'auto' ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                )}>
                <Monitor className="h-6 w-6 text-[hsl(var(--text-secondary))]" strokeWidth={1.5} />
                <span className="text-sm font-medium text-foreground">Auto</span>
                <span className="text-xs text-[hsl(var(--text-tertiary))]">Follows system</span>
              </button>
              <button onClick={() => setTheme('light')}
                className={cn(
                  "flex-1 flex flex-col items-center gap-3 p-4 rounded-lg border-2 transition-colors duration-150",
                  theme === 'light' ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                )}>
                <Sun className="h-6 w-6 text-[hsl(var(--text-secondary))]" strokeWidth={1.5} />
                <span className="text-sm font-medium text-foreground">Light</span>
                <span className="text-xs text-[hsl(var(--text-tertiary))]">Clean and bright</span>
              </button>
              <button onClick={() => setTheme('dark')}
                className={cn(
                  "flex-1 flex flex-col items-center gap-3 p-4 rounded-lg border-2 transition-colors duration-150",
                  theme === 'dark' ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                )}>
                <Moon className="h-6 w-6 text-[hsl(var(--text-secondary))]" strokeWidth={1.5} />
                <span className="text-sm font-medium text-foreground">Dark</span>
                <span className="text-xs text-[hsl(var(--text-tertiary))]">Easy on the eyes</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default AdminSettings
