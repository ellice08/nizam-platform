import { supabase } from '../lib/supabase.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import logger from '../utils/logger.js';
import { notificationService } from './notification.service.js';

class AuthService {
  generateOTP(): string {
    // 8-char OTP from unambiguous chars (no 0/O, 1/I/L)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let otp = '';
    for (let i = 0; i < 8; i++) {
      otp += chars[Math.floor(Math.random() * chars.length)];
    }
    return otp;
  }

  async inviteClient(params: {
    email: string;
    organisationId: string;
    organisationName: string;
    role?: string;
  }): Promise<{ success: boolean; userId?: string }> {
    const { email, organisationId, organisationName, role = 'org_admin' } = params;

    const otp = this.generateOTP();

    // Create Supabase Auth user with OTP as initial password
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: otp,
      email_confirm: true,
    });

    let userId: string;

    if (authError) {
      const isExisting =
        authError.code === 'email_exists' ||
        authError.status === 422 ||
        (authError.message ?? '').toLowerCase().includes('already registered')

      if (!isExisting) {
        logger.error(`Failed to create auth user: ${email}`, { authError })
        throw new AppError(`Failed to create user account: ${authError.message}`, 400)
      }

      logger.info(`User already exists, linking to org: ${email}`)
      const { data: existingList } = await supabase.auth.admin.listUsers()
      const existingUser = existingList?.users?.find(u => u.email === email)

      if (!existingUser) {
        throw new AppError('User exists but could not be found', 400)
      }

      userId = existingUser.id
    } else {
      userId = authData.user.id
    }

    // Link user to organisation in tenant_users
    await this.createTenantUserRecord(userId, organisationId, role);

    // Send welcome email (non-fatal if it fails)
    const loginUrl = `${env.FRONTEND_URL ?? 'https://nizam-platform.vercel.app'}/login`;
    const emailResult = await notificationService.sendWelcomeEmail({
      email,
      otp,
      organisationName,
      loginUrl,
    });

    if (!emailResult.success) {
      logger.warn(`Welcome email failed — user was still created: ${email}`, { error: emailResult.error });
    }

    logger.info(`Client invited successfully: ${email} → org ${organisationId}`);
    return { success: true, userId };
  }

  private async createTenantUserRecord(
    userId: string,
    organisationId: string,
    role: string,
  ): Promise<void> {
    const { error } = await supabase
      .from('tenant_users')
      .upsert(
        {
          user_id: userId,
          organisation_id: organisationId,
          branch_id: null,
          role,
          first_login: true,
        },
        { onConflict: 'organisation_id,user_id' },
      );

    if (error) {
      logger.error(`Failed to create tenant_user record: userId=${userId} orgId=${organisationId}`, { error });
      throw new AppError('Failed to link user to organisation', 500);
    }
  }
}

export const authService = new AuthService();
