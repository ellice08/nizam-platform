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
    const { email, role = 'branch_staff' } = req.body as {
      email?: string
      role?: string
    }

    if (!email) throw new AppError('email is required', 400)

    const orgId = req.tenant.organisation_id

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
    })

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

    const loginUrl = `${env.FRONTEND_URL ?? 'https://nizam-platform.vercel.app'}/login`
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
    if ((tenantUser as Record<string, unknown>).role === 'super_admin') {
      throw new AppError('Cannot delete super admin', 403)
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
