import { useState, useEffect } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
  UserPlus, Shield,
  RefreshCw, Trash2, UserX, UserCheck,
  X, AlertTriangle
} from 'lucide-react'
import { organisationApi } from '@/api'
import type { OrgUser } from '@/api/organisation.api'
import { formatDistanceToNow } from 'date-fns'

const ROLES = [
  { value: 'org_admin', label: 'Org Admin' },
  { value: 'branch_admin', label: 'Branch Admin' },
  { value: 'branch_staff', label: 'Staff' },
  { value: 'viewer', label: 'Viewer' },
]

const roleLabel = (role: string) =>
  ROLES.find(r => r.value === role)?.label ?? role

const StatusBadge = ({ user }: { user: OrgUser }) => {
  if (user.first_login) return (
    <span className="inline-flex items-center gap-1.5 text-xs text-yellow-400">
      <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
      Pending setup
    </span>
  )
  if (!user.active) return (
    <span className="inline-flex items-center gap-1.5 text-xs text-[hsl(var(--text-tertiary))]">
      <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--text-tertiary))]" />
      Inactive
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-[#4CAF50]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#4CAF50]" />
      Active
    </span>
  )
}

const Users = () => {
  const [users, setUsers] = useState<OrgUser[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editUser, setEditUser] = useState<OrgUser | null>(null)
  const [deleteUser, setDeleteUser] = useState<OrgUser | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Create form state
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState('branch_staff')

  // Edit form state
  const [editRole, setEditRole] = useState('')

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const data = await organisationApi.getOrgUsers()
      setUsers(data)
    } catch {
      toast.error('Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void fetchUsers() }, [])

  const handleCreate = async () => {
    if (!newEmail.trim()) return
    try {
      setActionLoading('create')
      await organisationApi.createOrgUser({
        email: newEmail.trim(),
        role: newRole
      })
      toast.success(`Invite sent to ${newEmail}`)
      setShowCreate(false)
      setNewEmail('')
      setNewRole('branch_staff')
      void fetchUsers()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to invite user')
    } finally {
      setActionLoading(null)
    }
  }

  const handleEdit = async () => {
    if (!editUser) return
    try {
      setActionLoading('edit')
      await organisationApi.updateOrgUser(editUser.id, { role: editRole })
      toast.success('User updated')
      setEditUser(null)
      void fetchUsers()
    } catch {
      toast.error('Failed to update user')
    } finally {
      setActionLoading(null)
    }
  }

  const handleToggleActive = async (user: OrgUser) => {
    try {
      setActionLoading(user.id + '-toggle')
      await organisationApi.updateOrgUser(user.id, { active: !user.active })
      toast.success(user.active ? 'User deactivated' : 'User activated')
      void fetchUsers()
    } catch {
      toast.error('Failed to update user')
    } finally {
      setActionLoading(null)
    }
  }

  const handleResetPassword = async (user: OrgUser) => {
    try {
      setActionLoading(user.id + '-reset')
      await organisationApi.resetOrgUserPassword(user.id)
      toast.success(`Password reset email sent to ${user.email}`)
    } catch {
      toast.error('Failed to send reset email')
    } finally {
      setActionLoading(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteUser || deleteConfirm !== deleteUser.email) return
    try {
      setActionLoading('delete')
      await organisationApi.deleteOrgUser(deleteUser.id)
      toast.success('User deleted')
      setDeleteUser(null)
      setDeleteConfirm('')
      void fetchUsers()
    } catch {
      toast.error('Failed to delete user')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Organisation"
        title="Users"
        description="Manage team members and their access."
      />

      {/* Invite button */}
      <div className="flex justify-end mb-6">
        <Button
          onClick={() => setShowCreate(true)}
          className="bg-primary hover:bg-primary-hover text-primary-foreground gap-2"
        >
          <UserPlus size={14} strokeWidth={1.5} />
          Invite user
        </Button>
      </div>

      {/* Users table */}
      <div className="rounded-lg border border-border bg-surface overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-[hsl(var(--text-secondary))]">
            Loading users…
          </div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-sm text-[hsl(var(--text-secondary))]">
            No users yet. Invite your first team member.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-6 py-3 text-[10px] uppercase tracking-wider font-medium text-[hsl(var(--text-secondary))]">Email</th>
                <th className="px-6 py-3 text-[10px] uppercase tracking-wider font-medium text-[hsl(var(--text-secondary))]">Role</th>
                <th className="px-6 py-3 text-[10px] uppercase tracking-wider font-medium text-[hsl(var(--text-secondary))]">Status</th>
                <th className="px-6 py-3 text-[10px] uppercase tracking-wider font-medium text-[hsl(var(--text-secondary))]">Joined</th>
                <th className="px-6 py-3 text-[10px] uppercase tracking-wider font-medium text-[hsl(var(--text-secondary))]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-elevated transition-colors duration-150">
                  <td className="px-6 py-4 text-foreground">{user.email}</td>
                  <td className="px-6 py-4">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-elevated border border-border text-[hsl(var(--text-secondary))]">
                      {roleLabel(user.role)}
                    </span>
                  </td>
                  <td className="px-6 py-4"><StatusBadge user={user} /></td>
                  <td className="px-6 py-4 text-[hsl(var(--text-tertiary))] nz-mono text-xs">
                    {user.created_at
                      ? formatDistanceToNow(new Date(user.created_at), { addSuffix: true })
                      : '—'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {/* Edit role */}
                      <button
                        onClick={() => { setEditUser(user); setEditRole(user.role) }}
                        className="p-1.5 rounded text-[hsl(var(--text-secondary))] hover:text-foreground hover:bg-surface transition-colors duration-150"
                        title="Edit role"
                      >
                        <Shield size={13} strokeWidth={1.5} />
                      </button>

                      {/* Reset password */}
                      <button
                        onClick={() => void handleResetPassword(user)}
                        disabled={actionLoading === user.id + '-reset'}
                        className="p-1.5 rounded text-[hsl(var(--text-secondary))] hover:text-foreground hover:bg-surface transition-colors duration-150 disabled:opacity-40"
                        title="Send password reset"
                      >
                        <RefreshCw size={13} strokeWidth={1.5}
                          className={actionLoading === user.id + '-reset' ? 'animate-spin' : ''} />
                      </button>

                      {/* Deactivate / Activate */}
                      <button
                        onClick={() => void handleToggleActive(user)}
                        disabled={actionLoading === user.id + '-toggle'}
                        className="p-1.5 rounded text-[hsl(var(--text-secondary))] hover:text-foreground hover:bg-surface transition-colors duration-150 disabled:opacity-40"
                        title={user.active ? 'Deactivate' : 'Activate'}
                      >
                        {user.active
                          ? <UserX size={13} strokeWidth={1.5} />
                          : <UserCheck size={13} strokeWidth={1.5} />}
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => { setDeleteUser(user); setDeleteConfirm('') }}
                        className="p-1.5 rounded text-[hsl(var(--text-secondary))] hover:text-destructive hover:bg-surface transition-colors duration-150"
                        title="Delete user"
                      >
                        <Trash2 size={13} strokeWidth={1.5} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── CREATE MODAL ── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-8 shadow-lg">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-xl text-foreground">Invite team member</h2>
              <button onClick={() => setShowCreate(false)}
                className="p-1.5 rounded text-[hsl(var(--text-tertiary))] hover:text-foreground hover:bg-elevated transition-colors">
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-2">
                  Email address
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  className="nz-input w-full"
                  onKeyDown={e => e.key === 'Enter' && void handleCreate()}
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-2">
                  Role
                </label>
                <select
                  value={newRole}
                  onChange={e => setNewRole(e.target.value)}
                  className="nz-input w-full"
                >
                  {ROLES.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <Button
                onClick={() => void handleCreate()}
                disabled={!newEmail.trim() || actionLoading === 'create'}
                className="flex-1 bg-primary hover:bg-primary-hover text-primary-foreground"
              >
                {actionLoading === 'create' ? 'Sending…' : 'Send invite'}
              </Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}
                className="border-border text-[hsl(var(--text-secondary))]">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT MODAL ── */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-8 shadow-lg">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-xl text-foreground">Edit user</h2>
              <button onClick={() => setEditUser(null)}
                className="p-1.5 rounded text-[hsl(var(--text-tertiary))] hover:text-foreground hover:bg-elevated transition-colors">
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>
            <p className="text-sm text-[hsl(var(--text-secondary))] mb-4">{editUser.email}</p>
            <div>
              <label className="block text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-2">
                Role
              </label>
              <select
                value={editRole}
                onChange={e => setEditRole(e.target.value)}
                className="nz-input w-full"
              >
                {ROLES.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-3 mt-6">
              <Button
                onClick={() => void handleEdit()}
                disabled={actionLoading === 'edit'}
                className="flex-1 bg-primary hover:bg-primary-hover text-primary-foreground"
              >
                {actionLoading === 'edit' ? 'Saving…' : 'Save changes'}
              </Button>
              <Button variant="outline" onClick={() => setEditUser(null)}
                className="border-border text-[hsl(var(--text-secondary))]">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRMATION MODAL ── */}
      {deleteUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-destructive/30 bg-surface p-8 shadow-lg">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle size={16} strokeWidth={1.5} className="text-destructive" />
                </div>
                <h2 className="font-display text-xl text-foreground">Delete user</h2>
              </div>
              <button onClick={() => { setDeleteUser(null); setDeleteConfirm('') }}
                className="p-1.5 rounded text-[hsl(var(--text-tertiary))] hover:text-foreground hover:bg-elevated transition-colors">
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>
            <p className="text-sm text-[hsl(var(--text-secondary))] mb-4">
              This will permanently delete <span className="text-foreground font-medium">{deleteUser.email}</span> and
              remove all their access. This cannot be undone.
            </p>
            <div>
              <label className="block text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-2">
                Type the email address to confirm
              </label>
              <input
                type="text"
                value={deleteConfirm}
                onChange={e => setDeleteConfirm(e.target.value)}
                placeholder={deleteUser.email}
                className="nz-input w-full"
                onKeyDown={e => e.key === 'Enter' && void handleDelete()}
              />
            </div>
            <div className="flex gap-3 mt-6">
              <Button
                onClick={() => void handleDelete()}
                disabled={deleteConfirm !== deleteUser.email || actionLoading === 'delete'}
                className="flex-1 bg-destructive hover:bg-destructive/90 text-white disabled:opacity-40"
              >
                {actionLoading === 'delete' ? 'Deleting…' : 'Delete user'}
              </Button>
              <Button variant="outline"
                onClick={() => { setDeleteUser(null); setDeleteConfirm('') }}
                className="border-border text-[hsl(var(--text-secondary))]">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default Users
