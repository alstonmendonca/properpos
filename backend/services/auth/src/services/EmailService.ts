// Email service implementation

import nodemailer from 'nodemailer';
import { logger, ApiError } from '@properpos/backend-shared';

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export class EmailService {
  private transporter: nodemailer.Transporter;
  private fromAddress: string;
  private baseUrl: string;

  constructor() {
    this.fromAddress = process.env.EMAIL_FROM || 'noreply@properpos.com';
    this.baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    // Configure email transporter
    this.transporter = nodemailer.createTransport(this.getEmailConfig());

    // Verify configuration
    this.verifyConnection();
  }

  /**
   * Get email configuration based on environment
   */
  private getEmailConfig(): EmailConfig {
    // In production, you'd use a service like SendGrid, AWS SES, or Mailgun
    if (process.env.NODE_ENV === 'production') {
      return {
        host: process.env.SMTP_HOST || 'smtp.sendgrid.net',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER || '',
          pass: process.env.SMTP_PASS || '',
        },
      };
    }

    // Development/test configuration (Ethereal Email for testing)
    return {
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: process.env.ETHEREAL_USER || 'ethereal.user@ethereal.email',
        pass: process.env.ETHEREAL_PASS || 'ethereal-password',
      },
    };
  }

  /**
   * Verify email connection
   */
  private async verifyConnection(): Promise<void> {
    try {
      await this.transporter.verify();
      logger.info('Email service connected successfully');
    } catch (error) {
      logger.error('Email service connection failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Don't throw error in development - allow service to start without email
      if (process.env.NODE_ENV === 'production') {
        throw new Error('Email service configuration failed');
      }
    }
  }

  /**
   * Send email verification email
   */
  async sendVerificationEmail(
    email: string,
    firstName: string,
    verificationToken: string
  ): Promise<void> {
    try {
      const verificationUrl = `${this.baseUrl}/auth/verify-email?token=${verificationToken}`;

      const template = this.getVerificationEmailTemplate(firstName, verificationUrl);

      await this.sendEmail({
        to: email,
        subject: template.subject,
        html: template.html,
        text: template.text,
      });

      logger.info('Verification email sent', { email, firstName });

    } catch (error) {
      logger.error('Failed to send verification email', {
        email,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to send verification email', 'EMAIL_SEND_FAILED', 500);
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(
    email: string,
    firstName: string,
    resetToken: string
  ): Promise<void> {
    try {
      const resetUrl = `${this.baseUrl}/auth/reset-password?token=${resetToken}`;

      const template = this.getPasswordResetEmailTemplate(firstName, resetUrl);

      await this.sendEmail({
        to: email,
        subject: template.subject,
        html: template.html,
        text: template.text,
      });

      logger.info('Password reset email sent', { email, firstName });

    } catch (error) {
      logger.error('Failed to send password reset email', {
        email,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to send password reset email', 'EMAIL_SEND_FAILED', 500);
    }
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(
    email: string,
    firstName: string,
    organizationName: string
  ): Promise<void> {
    try {
      const template = this.getWelcomeEmailTemplate(firstName, organizationName);

      await this.sendEmail({
        to: email,
        subject: template.subject,
        html: template.html,
        text: template.text,
      });

      logger.info('Welcome email sent', { email, firstName, organizationName });

    } catch (error) {
      logger.error('Failed to send welcome email', {
        email,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Don't throw error for welcome email - it's not critical
    }
  }

  /**
   * Send team invitation email
   */
  async sendTeamInvitationEmail(
    email: string,
    inviterName: string,
    organizationName: string,
    invitationToken: string,
    role: string
  ): Promise<void> {
    try {
      const invitationUrl = `${this.baseUrl}/auth/accept-invitation?token=${invitationToken}`;

      const template = this.getTeamInvitationEmailTemplate(
        inviterName,
        organizationName,
        invitationUrl,
        role
      );

      await this.sendEmail({
        to: email,
        subject: template.subject,
        html: template.html,
        text: template.text,
      });

      logger.info('Team invitation email sent', {
        email,
        inviterName,
        organizationName,
        role,
      });

    } catch (error) {
      logger.error('Failed to send team invitation email', {
        email,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to send invitation email', 'EMAIL_SEND_FAILED', 500);
    }
  }

  /**
   * Send generic email
   */
  private async sendEmail(options: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<void> {
    const mailOptions = {
      from: {
        name: 'ProperPOS',
        address: this.fromAddress,
      },
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    };

    const info = await this.transporter.sendMail(mailOptions);

    if (process.env.NODE_ENV !== 'production') {
      logger.debug('Email sent (preview available)', {
        messageId: info.messageId,
        previewUrl: nodemailer.getTestMessageUrl(info),
      });
    }
  }

  /**
   * Get email verification template
   */
  private getVerificationEmailTemplate(firstName: string, verificationUrl: string): EmailTemplate {
    const subject = 'Verify your ProperPOS account';

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>${subject}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; padding: 20px 0; border-bottom: 2px solid #4F46E5; }
            .logo { font-size: 24px; font-weight: bold; color: #4F46E5; }
            .content { padding: 30px 0; }
            .button {
              display: inline-block;
              background: #4F46E5;
              color: white;
              padding: 12px 30px;
              text-decoration: none;
              border-radius: 5px;
              margin: 20px 0;
            }
            .footer {
              border-top: 1px solid #eee;
              padding-top: 20px;
              text-align: center;
              color: #666;
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">ProperPOS</div>
            </div>

            <div class="content">
              <h2>Welcome to ProperPOS, ${firstName}!</h2>

              <p>Thank you for signing up for ProperPOS. To complete your registration and start using your account, please verify your email address by clicking the button below:</p>

              <p style="text-align: center;">
                <a href="${verificationUrl}" class="button">Verify Email Address</a>
              </p>

              <p>If the button doesn't work, copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #4F46E5;">${verificationUrl}</p>

              <p><strong>This verification link will expire in 24 hours.</strong></p>

              <p>If you didn't create an account with ProperPOS, please ignore this email.</p>

              <p>Best regards,<br>The ProperPOS Team</p>
            </div>

            <div class="footer">
              <p>© 2024 ProperPOS. All rights reserved.</p>
              <p>This is an automated email, please do not reply.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
      Welcome to ProperPOS, ${firstName}!

      Thank you for signing up for ProperPOS. To complete your registration and start using your account, please verify your email address by visiting the following link:

      ${verificationUrl}

      This verification link will expire in 24 hours.

      If you didn't create an account with ProperPOS, please ignore this email.

      Best regards,
      The ProperPOS Team
    `;

    return { subject, html, text };
  }

  /**
   * Get password reset email template
   */
  private getPasswordResetEmailTemplate(firstName: string, resetUrl: string): EmailTemplate {
    const subject = 'Reset your ProperPOS password';

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>${subject}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; padding: 20px 0; border-bottom: 2px solid #4F46E5; }
            .logo { font-size: 24px; font-weight: bold; color: #4F46E5; }
            .content { padding: 30px 0; }
            .button {
              display: inline-block;
              background: #EF4444;
              color: white;
              padding: 12px 30px;
              text-decoration: none;
              border-radius: 5px;
              margin: 20px 0;
            }
            .footer {
              border-top: 1px solid #eee;
              padding-top: 20px;
              text-align: center;
              color: #666;
              font-size: 12px;
            }
            .warning {
              background: #FEF3C7;
              border: 1px solid #F59E0B;
              padding: 15px;
              border-radius: 5px;
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">ProperPOS</div>
            </div>

            <div class="content">
              <h2>Password Reset Request</h2>

              <p>Hi ${firstName},</p>

              <p>We received a request to reset the password for your ProperPOS account. If you made this request, click the button below to set a new password:</p>

              <p style="text-align: center;">
                <a href="${resetUrl}" class="button">Reset Password</a>
              </p>

              <p>If the button doesn't work, copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #4F46E5;">${resetUrl}</p>

              <div class="warning">
                <strong>⚠️ Security Notice:</strong>
                <ul>
                  <li>This password reset link will expire in 1 hour</li>
                  <li>If you didn't request this reset, please ignore this email</li>
                  <li>Your password will remain unchanged until you click the link above</li>
                </ul>
              </div>

              <p>For security reasons, we recommend choosing a strong password that you haven't used elsewhere.</p>

              <p>Best regards,<br>The ProperPOS Team</p>
            </div>

            <div class="footer">
              <p>© 2024 ProperPOS. All rights reserved.</p>
              <p>This is an automated email, please do not reply.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
      Password Reset Request

      Hi ${firstName},

      We received a request to reset the password for your ProperPOS account. If you made this request, visit the following link to set a new password:

      ${resetUrl}

      Security Notice:
      - This password reset link will expire in 1 hour
      - If you didn't request this reset, please ignore this email
      - Your password will remain unchanged until you click the link above

      For security reasons, we recommend choosing a strong password that you haven't used elsewhere.

      Best regards,
      The ProperPOS Team
    `;

    return { subject, html, text };
  }

  /**
   * Get welcome email template
   */
  private getWelcomeEmailTemplate(firstName: string, organizationName: string): EmailTemplate {
    const subject = 'Welcome to ProperPOS - Let\'s get started!';

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>${subject}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; padding: 20px 0; border-bottom: 2px solid #4F46E5; }
            .logo { font-size: 24px; font-weight: bold; color: #4F46E5; }
            .content { padding: 30px 0; }
            .button {
              display: inline-block;
              background: #4F46E5;
              color: white;
              padding: 12px 30px;
              text-decoration: none;
              border-radius: 5px;
              margin: 20px 0;
            }
            .features {
              background: #F9FAFB;
              padding: 20px;
              border-radius: 5px;
              margin: 20px 0;
            }
            .footer {
              border-top: 1px solid #eee;
              padding-top: 20px;
              text-align: center;
              color: #666;
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">ProperPOS</div>
            </div>

            <div class="content">
              <h2>Welcome to ProperPOS, ${firstName}! 🎉</h2>

              <p>Congratulations on successfully creating your ProperPOS account for <strong>${organizationName}</strong>!</p>

              <p>Your 30-day free trial has started. Here's what you can do next:</p>

              <div class="features">
                <h3>Getting Started:</h3>
                <ul>
                  <li>✅ Set up your first location</li>
                  <li>📦 Add your products and categories</li>
                  <li>👥 Invite team members</li>
                  <li>🛒 Start processing orders</li>
                  <li>📊 View analytics and reports</li>
                </ul>
              </div>

              <p style="text-align: center;">
                <a href="${this.baseUrl}/dashboard" class="button">Go to Dashboard</a>
              </p>

              <p><strong>Need Help?</strong></p>
              <ul>
                <li>📚 Check out our <a href="${this.baseUrl}/docs">documentation</a></li>
                <li>💬 Contact support at support@properpos.com</li>
                <li>🎥 Watch our <a href="${this.baseUrl}/tutorials">video tutorials</a></li>
              </ul>

              <p>We're excited to help you streamline your business operations!</p>

              <p>Best regards,<br>The ProperPOS Team</p>
            </div>

            <div class="footer">
              <p>© 2024 ProperPOS. All rights reserved.</p>
              <p>You're receiving this because you created a ProperPOS account.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
      Welcome to ProperPOS, ${firstName}!

      Congratulations on successfully creating your ProperPOS account for ${organizationName}!

      Your 30-day free trial has started. Here's what you can do next:

      Getting Started:
      - Set up your first location
      - Add your products and categories
      - Invite team members
      - Start processing orders
      - View analytics and reports

      Visit your dashboard: ${this.baseUrl}/dashboard

      Need Help?
      - Check out our documentation: ${this.baseUrl}/docs
      - Contact support at support@properpos.com
      - Watch our video tutorials: ${this.baseUrl}/tutorials

      We're excited to help you streamline your business operations!

      Best regards,
      The ProperPOS Team
    `;

    return { subject, html, text };
  }

  /**
   * Get team invitation email template
   */
  private getTeamInvitationEmailTemplate(
    inviterName: string,
    organizationName: string,
    invitationUrl: string,
    role: string
  ): EmailTemplate {
    const subject = `You're invited to join ${organizationName} on ProperPOS`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>${subject}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; padding: 20px 0; border-bottom: 2px solid #4F46E5; }
            .logo { font-size: 24px; font-weight: bold; color: #4F46E5; }
            .content { padding: 30px 0; }
            .button {
              display: inline-block;
              background: #10B981;
              color: white;
              padding: 12px 30px;
              text-decoration: none;
              border-radius: 5px;
              margin: 20px 0;
            }
            .invitation-box {
              background: #F0F9FF;
              border: 1px solid #0EA5E9;
              padding: 20px;
              border-radius: 5px;
              margin: 20px 0;
            }
            .footer {
              border-top: 1px solid #eee;
              padding-top: 20px;
              text-align: center;
              color: #666;
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">ProperPOS</div>
            </div>

            <div class="content">
              <h2>You're invited to join a team! 👥</h2>

              <div class="invitation-box">
                <p><strong>${inviterName}</strong> has invited you to join <strong>${organizationName}</strong> on ProperPOS.</p>
                <p><strong>Role:</strong> ${role}</p>
              </div>

              <p>ProperPOS is a modern point-of-sale system that helps businesses manage their operations efficiently.</p>

              <p style="text-align: center;">
                <a href="${invitationUrl}" class="button">Accept Invitation</a>
              </p>

              <p>If the button doesn't work, copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #4F46E5;">${invitationUrl}</p>

              <p><strong>This invitation will expire in 7 days.</strong></p>

              <p>If you don't want to join this team, you can safely ignore this email.</p>

              <p>Questions? Contact us at support@properpos.com</p>

              <p>Best regards,<br>The ProperPOS Team</p>
            </div>

            <div class="footer">
              <p>© 2024 ProperPOS. All rights reserved.</p>
              <p>This invitation was sent by ${inviterName} from ${organizationName}.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
      You're invited to join a team!

      ${inviterName} has invited you to join ${organizationName} on ProperPOS.

      Role: ${role}

      ProperPOS is a modern point-of-sale system that helps businesses manage their operations efficiently.

      Accept your invitation: ${invitationUrl}

      This invitation will expire in 7 days.

      If you don't want to join this team, you can safely ignore this email.

      Questions? Contact us at support@properpos.com

      Best regards,
      The ProperPOS Team
    `;

    return { subject, html, text };
  }
}