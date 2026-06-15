import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { supabase } from '../lib/supabase.js'
import { authenticate } from '../middleware/auth.middleware.js'
import { authService } from '../services/auth.service.js'
import { notificationService } from '../services/notification.service.js'
import { ApiResponse } from '../utils/response.js'
import { AppError } from '../utils/errors.js'
import { env } from '../config/env.js'
import logger from '../utils/logger.js'

const router = Router()

// All routes require authentication and org_admin or super_admin
function requireOrgAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!['super_admin', 'org_admin'].includes(req.tenant.role)) {
    return next(new AppError('Forbidden', 403))
  }
  next()
}

// GET /api/users/available-roles — roles the calling admin can assign
// Must be registered before /:userId patterns
router.get('/available-roles', authenticate, requireOrgAdmin, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.tenant.organisation_id

    const { data: existingUsers } = await supabase
      .from('tenant_users')
      .select('role')
      .eq('organisation_id', orgId)

    const roles = existingUsers?.map(u => u.role) ?? []

    const hasBranchAdmin = roles.includes('branch_admin')
    const orgViewerCount = roles.filter(r => r === 'org_viewer').length

    const available = [
      { value: 'branch_admin', label: 'Branch Admin',
        disabled: hasBranchAdmin,
        reason: hasBranchAdmin ? 'Already has a branch admin' : null },
      { value: 'branch_staff', label: 'Staff',
        disabled: false, reason: null },
      { value: 'org_viewer', label: 'Org Viewer',
        disabled: orgViewerCount >= 2,
        reason: orgViewerCount >= 2 ? 'Maximum 2 org viewers reached' : null },
      { value: 'branch_viewer', label: 'Branch Viewer',
        disabled: false, reason: null },
    ]

    res.json(ApiResponse.success(available))
  } catch (err) {
    next(err)
  }
})

// GET /api/users — list users in this organisation
router.get('/', authenticate, requireOrgAdmin, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.tenant.organisation_id

    const { data: tenantUsers, error } = await supabase
      .from('tenant_users')
      .select('user_id, role, first_login, active')
      .eq('organisation_id', orgId)
      .neq('role', 'super_admin')

    if (error) throw new AppError('Failed to fetch users', 500)

    // Get auth user details for each tenant user
    const userIds = (tenantUsers ?? []).map(u => u.user_id)

    const { data: authList } = await supabase.auth.admin.listUsers()
    const authUsers = (authList?.users ?? []).filter(u => userIds.includes(u.id))

    const users = (tenantUsers ?? []).map(tu => {
      const authUser = authUsers.find(u => u.id === tu.user_id)
      return {
        id: tu.user_id,
        email: authUser?.email ?? '',
        name: (authUser?.user_metadata?.full_name as string) ?? '',
        role: tu.role,
        first_login: tu.first_login,
        active: tu.active ?? true,
        created_at: authUser?.created_at ?? '',
      }
    })

    res.json(ApiResponse.success(users))
  } catch (err) {
    next(err)
  }
})

// POST /api/users — create a new user in this organisation
router.post('/', authenticate, requireOrgAdmin, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, role = 'branch_staff', name } = req.body as {
      email?: string
      role?: string
      name?: string
    }

    if (!email) throw new AppError('email is required', 400)

    const orgId = req.tenant.organisation_id

    // Validate role is allowed
    const allowedRoles = [
      'branch_admin', 'branch_staff',
      'org_viewer', 'branch_viewer'
    ]
    if (!allowedRoles.includes(role)) {
      throw new AppError(
        `Invalid role. Allowed: ${allowedRoles.join(', ')}`,
        400
      )
    }

    // Check if user already exists in this org
    const { data: authList } = await supabase.auth.admin.listUsers()
    const existingAuthUser = authList?.users?.find(
      u => u.email === email
    )
    if (existingAuthUser) {
      const { data: existingTenant } = await supabase
        .from('tenant_users')
        .select('user_id, role')
        .eq('user_id', existingAuthUser.id)
        .eq('organisation_id', orgId)
        .maybeSingle()

      if (existingTenant) {
        throw new AppError(
          'This user already exists in your organisation',
          409
        )
      }
    }

    // Enforce one branch_admin per org
    if (role === 'branch_admin') {
      const { data: existingBranchAdmin } = await supabase
        .from('tenant_users')
        .select('user_id')
        .eq('organisation_id', orgId)
        .eq('role', 'branch_admin')
        .maybeSingle()

      if (existingBranchAdmin) {
        throw new AppError(
          'This organisation already has a branch admin',
          409
        )
      }
    }

    // Enforce two org_viewers max per org
    if (role === 'org_viewer') {
      const { data: existingViewers } = await supabase
        .from('tenant_users')
        .select('user_id')
        .eq('organisation_id', orgId)
        .eq('role', 'org_viewer')

      if ((existingViewers ?? []).length >= 2) {
        throw new AppError(
          'Maximum of 2 org viewers allowed per organisation',
          409
        )
      }
    }

    // Get org name for welcome email
    const { data: org } = await supabase
      .from('organisations')
      .select('name')
      .eq('id', orgId)
      .single()

    if (!org) throw new AppError('Organisation not found', 404)

    const result = await authService.inviteClient({
      email,
      organisationId: orgId,
      organisationName: (org as Record<string, unknown>).name as string,
      role,
      name,
    })

    void notificationService.createNotification({
      organisationId: orgId || null,
      branchId: req.tenant.branch_id ?? null,
      type: 'system', title: 'New team member added', minRole: 'org_admin',
    });

    res.status(201).json(ApiResponse.success(result, 'User invited successfully'))
  } catch (err) {
    next(err)
  }
})

// PATCH /api/users/:userId — update role or active status
router.patch('/:userId', authenticate, requireOrgAdmin, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { userId } = req.params as { userId: string }
    const { role, active } = req.body as { role?: string; active?: boolean }
    const orgId = req.tenant.organisation_id

    const update: Record<string, unknown> = {}
    if (role !== undefined) update.role = role
    if (active !== undefined) update.active = active

    if (Object.keys(update).length === 0) {
      throw new AppError('Nothing to update', 400)
    }

    const { error } = await supabase
      .from('tenant_users')
      .update(update)
      .eq('user_id', userId)
      .eq('organisation_id', orgId)

    if (error) throw new AppError('Failed to update user', 500)

    res.json(ApiResponse.success({ updated: true }))
  } catch (err) {
    next(err)
  }
})

// POST /api/users/:userId/reset-password — send new OTP
router.post('/:userId/reset-password', authenticate, requireOrgAdmin, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { userId } = req.params as { userId: string }
    const orgId = req.tenant.organisation_id

    // Verify user belongs to this org
    const { data: tenantUser } = await supabase
      .from('tenant_users')
      .select('user_id')
      .eq('user_id', userId)
      .eq('organisation_id', orgId)
      .maybeSingle()

    if (!tenantUser) throw new AppError('User not found', 404)

    // Get user email
    const { data: { user: authUser } } = await supabase.auth.admin.getUserById(userId)
    if (!authUser?.email) throw new AppError('User not found', 404)

    // Generate new OTP
    const otp = authService.generateOTP()

    // Update password and reset first_login
    const [, updateResult] = await Promise.all([
      supabase.auth.admin.updateUserById(userId, { password: otp }),
      supabase.from('tenant_users')
        .update({ first_login: true })
        .eq('user_id', userId)
        .eq('organisation_id', orgId)
    ])

    if (updateResult.error) throw new AppError('Failed to reset password', 500)

    // Get org name
    const { data: org } = await supabase
      .from('organisations')
      .select('name')
      .eq('id', orgId)
      .single()

    const loginUrl = `${env.FRONTEND_URL}/login`
    await notificationService.sendWelcomeEmail({
      email: authUser.email,
      otp,
      organisationName: (org as Record<string, unknown>)?.name as string ?? '',
      loginUrl,
    })

    res.json(ApiResponse.success({ sent: true }, 'Password reset email sent'))
  } catch (err) {
    next(err)
  }
})

// DELETE /api/users/:userId — remove user from org and delete auth account
router.delete('/:userId', authenticate, requireOrgAdmin, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { userId } = req.params as { userId: string }
    const orgId = req.tenant.organisation_id

    // Verify user belongs to this org and is not super_admin
    const { data: tenantUser } = await supabase
      .from('tenant_users')
      .select('user_id, role')
      .eq('user_id', userId)
      .eq('organisation_id', orgId)
      .maybeSingle()

    if (!tenantUser) throw new AppError('User not found', 404)
    const userRole = (tenantUser as Record<string, unknown>).role as string
    if (userRole === 'super_admin') {
      throw new AppError('Cannot delete super admin', 403)
    }
    if (userRole === 'org_admin') {
      throw new AppError('Cannot delete org admin — edit their role instead', 403)
    }

    // Remove from tenant_users
    await supabase
      .from('tenant_users')
      .delete()
      .eq('user_id', userId)
      .eq('organisation_id', orgId)

    // Delete from Supabase Auth
    await supabase.auth.admin.deleteUser(userId)

    logger.info(`User deleted: ${userId} from org ${orgId}`)
    res.json(ApiResponse.success({ deleted: true }))
  } catch (err) {
    next(err)
  }
})

export default router
