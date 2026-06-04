import { Resend } from 'resend';
import { env } from '../config/env.js';
import logger from '../utils/logger.js';

class NotificationService {
  private resend = new Resend(env.RESEND_API_KEY);

  async sendWelcomeEmail(params: {
    email: string;
    otp: string;
    organisationName: string;
    loginUrl: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const { email, otp, organisationName, loginUrl } = params;

      const { error } = await this.resend.emails.send({
        from: env.RESEND_FROM_EMAIL,
        to: email,
        subject: `Your ${organisationName} AI system is ready — Nizam`,
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#0E0E0C;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"
    style="background:#0E0E0C;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0"
          style="background:#141410;border:1px solid #2A2A26;
          border-radius:8px;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 24px;
              border-bottom:1px solid #2A2A26;">
              <p style="margin:0;font-size:24px;font-weight:600;
                color:#FAFAFA;letter-spacing:-0.02em;">nizam</p>
              <p style="margin:4px 0 0;font-size:12px;
                color:#555550;">by Ellice Systems</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 8px;font-size:11px;
                font-weight:600;color:#7A2535;
                text-transform:uppercase;letter-spacing:0.12em;">
                Welcome
              </p>
              <h1 style="margin:0 0 16px;font-size:24px;
                font-weight:600;color:#FAFAFA;line-height:1.3;">
                Your AI system is ready
              </h1>
              <p style="margin:0 0 24px;font-size:14px;
                color:#888880;line-height:1.6;">
                Your ${organisationName} workspace on Nizam has been
                configured and is ready to go live. Use the credentials
                below to log in for the first time.
              </p>

              <!-- OTP Card -->
              <table width="100%" cellpadding="0" cellspacing="0"
                style="background:#0E0E0C;border:1px solid #2A2A26;
                border-radius:6px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 4px;font-size:11px;
                      color:#555550;text-transform:uppercase;
                      letter-spacing:0.1em;">One-time password</p>
                    <p style="margin:0;font-size:28px;font-weight:600;
                      color:#FAFAFA;font-family:monospace;
                      letter-spacing:0.15em;">${otp}</p>
                    <p style="margin:8px 0 0;font-size:12px;
                      color:#555550;">
                      You will be prompted to set a new password
                      on first login.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0"
                style="margin-bottom:24px;">
                <tr>
                  <td align="center">
                    <a href="${loginUrl}"
                      style="display:inline-block;padding:12px 32px;
                      background:#7A2535;color:#FAFAFA;
                      text-decoration:none;border-radius:6px;
                      font-size:14px;font-weight:600;">
                      Log in to your dashboard
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:12px;color:#555550;
                line-height:1.6;">
                Or copy this link:<br>
                <a href="${loginUrl}"
                  style="color:#C4909A;word-break:break-all;">
                  ${loginUrl}
                </a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #2A2A26;">
              <p style="margin:0;font-size:11px;color:#555550;">
                Nizam by Ellice Systems &middot;
                This email was sent to ${email}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `,
      });

      if (error) {
        logger.error(`Resend email failed: ${email}`, { error });
        return { success: false, error: (error as { message?: string }).message ?? String(error) };
      }

      logger.info(`Welcome email sent successfully: ${email}`);
      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error(`sendWelcomeEmail exception: ${params.email}`, { err });
      return { success: false, error: message };
    }
  }

  async sendEscalationAlert(params: {
    toEmails: string[];
    customerName: string;
    channel: string;
    transcript: string;
    question: string;
    branchName: string;
    urgent?: boolean;
  }): Promise<{ success: boolean }> {
    try {
      const { toEmails, customerName, channel, transcript, question, branchName, urgent } = params;

      await this.resend.emails.send({
        from: env.RESEND_FROM_EMAIL,
        to: toEmails,
        subject: `${urgent ? '[URGENT] ' : ''}Customer escalation — ${branchName} — ${channel}`,
        html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0E0E0C;
  font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"
    style="background:#0E0E0C;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0"
          style="background:#141410;border:1px solid #2A2A26;
          border-radius:8px;">
          <tr>
            <td style="padding:24px 32px;
              border-bottom:1px solid #2A2A26;">
              <p style="margin:0;font-size:11px;color:#7A2535;
                font-weight:600;text-transform:uppercase;
                letter-spacing:0.12em;">Action required</p>
              <h2 style="margin:8px 0 0;font-size:20px;
                color:#FAFAFA;">Customer needs your attention</h2>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px;">
              <p style="margin:0 0 16px;font-size:13px;
                color:#888880;">
                <strong style="color:#FAFAFA;">Branch:</strong>
                ${branchName}<br>
                <strong style="color:#FAFAFA;">Channel:</strong>
                ${channel}<br>
                <strong style="color:#FAFAFA;">Customer:</strong>
                ${customerName}<br>
                <strong style="color:#FAFAFA;">Asked:</strong>
                ${question}
              </p>
              <p style="margin:0 0 8px;font-size:11px;
                color:#555550;text-transform:uppercase;
                letter-spacing:0.1em;">Conversation transcript</p>
              <div style="background:#0E0E0C;border:1px solid #2A2A26;
                border-radius:6px;padding:16px;font-size:13px;
                color:#888880;line-height:1.6;
                white-space:pre-wrap;">${transcript}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;
              border-top:1px solid #2A2A26;">
              <p style="margin:0;font-size:11px;color:#555550;">
                Nizam by Ellice Systems
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `,
      });

      return { success: true };
    } catch (err) {
      logger.error('sendEscalationAlert exception', { err });
      return { success: false };
    }
  }

  async sendSessionInvite(params: {
    to: string;
    name: string;
    message: string;
    schedulingLink?: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const { to, name, message, schedulingLink } = params;

      const { error } = await this.resend.emails.send({
        from: env.RESEND_FROM_EMAIL,
        to,
        subject: `Let's talk about your AI workspace — Nizam`,
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#0E0E0C;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0E0E0C;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0"
          style="background:#141410;border:1px solid #2A2A26;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="padding:32px 40px 24px;border-bottom:1px solid #2A2A26;">
              <p style="margin:0;font-size:24px;font-weight:600;color:#FAFAFA;letter-spacing:-0.02em;">nizam</p>
              <p style="margin:4px 0 0;font-size:12px;color:#555550;">by Ellice Systems</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 8px;font-size:11px;font-weight:600;color:#7A2535;text-transform:uppercase;letter-spacing:0.12em;">
                Your request
              </p>
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;color:#FAFAFA;line-height:1.3;">
                Hello ${name},
              </h1>
              <div style="margin:0 0 24px;font-size:14px;color:#888880;line-height:1.7;white-space:pre-wrap;">${message}</div>
              ${schedulingLink ? `
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td align="center">
                    <a href="${schedulingLink}"
                      style="display:inline-block;padding:12px 32px;background:#7A2535;color:#FAFAFA;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">
                      Schedule a conversation
                    </a>
                  </td>
                </tr>
              </table>
              ` : ''}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #2A2A26;">
              <p style="margin:0;font-size:11px;color:#555550;">
                Nizam by Ellice Systems
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `,
      });

      if (error) {
        logger.error(`Session invite email failed: ${to}`, { error });
        return { success: false, error: (error as { message?: string }).message ?? String(error) };
      }
      logger.info(`Session invite sent: ${to}`);
      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error(`sendSessionInvite exception: ${params.to}`, { err });
      return { success: false, error: message };
    }
  }
}

export const notificationService = new NotificationService();
