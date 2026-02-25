// Email service for ProperPOS with nodemailer integration

import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  template?: string;
  data?: Record<string, any>;
  from?: string;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

export interface SendResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

// Email templates
const EMAIL_TEMPLATES: Record<string, (data: Record<string, any>) => { subject: string; html: string; text: string }> = {
  'trial-ending-3-days': (data) => ({
    subject: `Your ProperPOS trial ends in 3 days`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">Your Trial is Ending Soon</h1>
        <p>Hi ${data.userName || 'there'},</p>
        <p>Your ProperPOS trial for <strong>${data.organizationName}</strong> will end in <strong>3 days</strong> on ${data.trialEndDate}.</p>
        <p>To continue enjoying all the features of ProperPOS without interruption, please add a payment method before your trial expires.</p>
        <div style="margin: 30px 0;">
          <a href="${data.upgradeUrl || '#'}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
            Upgrade Now
          </a>
        </div>
        <p>What you'll keep with an active subscription:</p>
        <ul>
          <li>Unlimited POS transactions</li>
          <li>Advanced analytics and reporting</li>
          <li>Multi-location support</li>
          <li>Priority customer support</li>
        </ul>
        <p>Questions? Reply to this email or contact our support team.</p>
        <p>Best regards,<br>The ProperPOS Team</p>
      </div>
    `,
    text: `Your Trial is Ending Soon

Hi ${data.userName || 'there'},

Your ProperPOS trial for ${data.organizationName} will end in 3 days on ${data.trialEndDate}.

To continue enjoying all the features of ProperPOS without interruption, please add a payment method before your trial expires.

Visit ${data.upgradeUrl || 'your dashboard'} to upgrade now.

Questions? Reply to this email or contact our support team.

Best regards,
The ProperPOS Team`
  }),

  'trial-ending-1-day': (data) => ({
    subject: `[Action Required] Your ProperPOS trial ends tomorrow`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #DC2626;">Final Reminder: Trial Ends Tomorrow</h1>
        <p>Hi ${data.userName || 'there'},</p>
        <p>This is your final reminder that your ProperPOS trial for <strong>${data.organizationName}</strong> ends <strong>tomorrow</strong> (${data.trialEndDate}).</p>
        <p style="background-color: #FEF2F2; padding: 15px; border-radius: 6px; border-left: 4px solid #DC2626;">
          <strong>Important:</strong> If you don't upgrade, you'll lose access to your account and all stored data.
        </p>
        <div style="margin: 30px 0;">
          <a href="${data.upgradeUrl || '#'}" style="background-color: #DC2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
            Upgrade Now to Keep Your Data
          </a>
        </div>
        <p>Need more time? Contact our support team and we may be able to extend your trial.</p>
        <p>Best regards,<br>The ProperPOS Team</p>
      </div>
    `,
    text: `FINAL REMINDER: Trial Ends Tomorrow

Hi ${data.userName || 'there'},

This is your final reminder that your ProperPOS trial for ${data.organizationName} ends tomorrow (${data.trialEndDate}).

IMPORTANT: If you don't upgrade, you'll lose access to your account and all stored data.

Visit ${data.upgradeUrl || 'your dashboard'} to upgrade now and keep your data.

Need more time? Contact our support team and we may be able to extend your trial.

Best regards,
The ProperPOS Team`
  }),

  'trial-expired': (data) => ({
    subject: `Your ProperPOS trial has ended`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">Your Trial Has Ended</h1>
        <p>Hi ${data.userName || 'there'},</p>
        <p>Your ProperPOS trial for <strong>${data.organizationName}</strong> has ended.</p>
        <p>Don't worry - your data is still safe and waiting for you. Reactivate your account anytime to pick up right where you left off.</p>
        <div style="margin: 30px 0;">
          <a href="${data.upgradeUrl || '#'}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
            Reactivate Your Account
          </a>
        </div>
        <p>We'd love to have you back!</p>
        <p>Best regards,<br>The ProperPOS Team</p>
      </div>
    `,
    text: `Your Trial Has Ended

Hi ${data.userName || 'there'},

Your ProperPOS trial for ${data.organizationName} has ended.

Don't worry - your data is still safe and waiting for you. Reactivate your account anytime to pick up right where you left off.

Visit ${data.upgradeUrl || 'your dashboard'} to reactivate your account.

We'd love to have you back!

Best regards,
The ProperPOS Team`
  }),

  'payment-failed': (data) => ({
    subject: `[Action Required] Payment failed for your ProperPOS subscription`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #DC2626;">Payment Failed</h1>
        <p>Hi ${data.userName || 'there'},</p>
        <p>We were unable to process your payment of <strong>${data.amount}</strong> for your ProperPOS subscription.</p>
        <p>Please update your payment method to avoid service interruption.</p>
        <div style="margin: 30px 0;">
          <a href="${data.billingUrl || '#'}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
            Update Payment Method
          </a>
        </div>
        <p>If you believe this is an error, please contact our support team.</p>
        <p>Best regards,<br>The ProperPOS Team</p>
      </div>
    `,
    text: `Payment Failed

Hi ${data.userName || 'there'},

We were unable to process your payment of ${data.amount} for your ProperPOS subscription.

Please update your payment method to avoid service interruption.

Visit ${data.billingUrl || 'your billing page'} to update your payment method.

If you believe this is an error, please contact our support team.

Best regards,
The ProperPOS Team`
  }),

  'subscription-renewed': (data) => ({
    subject: `Your ProperPOS subscription has been renewed`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #059669;">Subscription Renewed</h1>
        <p>Hi ${data.userName || 'there'},</p>
        <p>Your ProperPOS subscription has been successfully renewed.</p>
        <div style="background-color: #F0FDF4; padding: 15px; border-radius: 6px; margin: 20px 0;">
          <p style="margin: 0;"><strong>Plan:</strong> ${data.planName}</p>
          <p style="margin: 5px 0;"><strong>Amount:</strong> ${data.amount}</p>
          <p style="margin: 0;"><strong>Next billing date:</strong> ${data.nextBillingDate}</p>
        </div>
        <p>Thank you for being a ProperPOS customer!</p>
        <p>Best regards,<br>The ProperPOS Team</p>
      </div>
    `,
    text: `Subscription Renewed

Hi ${data.userName || 'there'},

Your ProperPOS subscription has been successfully renewed.

Plan: ${data.planName}
Amount: ${data.amount}
Next billing date: ${data.nextBillingDate}

Thank you for being a ProperPOS customer!

Best regards,
The ProperPOS Team`
  }),
};

export class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private initialized = false;
  private defaultFrom: string;

  constructor() {
    this.defaultFrom = process.env.SMTP_FROM || 'ProperPOS <noreply@properpos.com>';

    // Initialize if SMTP credentials are provided
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        this.transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });
        this.initialized = true;
        logger.info('EmailService initialized with SMTP');
      } catch (error) {
        logger.error('Failed to initialize EmailService', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    } else {
      logger.warn('EmailService not configured - missing SMTP credentials');
    }
  }

  async send(options: EmailOptions): Promise<SendResult | null> {
    const recipients = Array.isArray(options.to) ? options.to : [options.to];

    if (!this.initialized || !this.transporter) {
      logger.warn('EmailService: Email not sent - service not configured', {
        to: recipients,
        subject: options.subject,
      });
      // Return mock result in development
      if (process.env.NODE_ENV === 'development') {
        return {
          messageId: `dev-mock-${Date.now()}`,
          accepted: recipients,
          rejected: [],
        };
      }
      return null;
    }

    try {
      const mailOptions: nodemailer.SendMailOptions = {
        from: options.from || this.defaultFrom,
        to: recipients.join(', '),
        subject: options.subject,
        html: options.html,
        text: options.text,
        replyTo: options.replyTo,
        attachments: options.attachments,
      };

      const result = await this.transporter.sendMail(mailOptions);

      logger.info('Email sent successfully', {
        messageId: result.messageId,
        to: recipients,
        subject: options.subject,
      });

      return {
        messageId: result.messageId,
        accepted: result.accepted as string[],
        rejected: result.rejected as string[],
      };
    } catch (error) {
      logger.error('Failed to send email', {
        to: recipients,
        subject: options.subject,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async sendTemplate(
    to: string | string[],
    templateName: string,
    data: Record<string, any>
  ): Promise<SendResult | null> {
    const template = EMAIL_TEMPLATES[templateName];

    if (!template) {
      logger.error('Email template not found', { templateName });
      throw new Error(`Email template '${templateName}' not found`);
    }

    const { subject, html, text } = template(data);

    return this.send({
      to,
      subject,
      html,
      text,
    });
  }

  /**
   * Send trial ending notification (3 days before)
   */
  async sendTrialEnding3Days(
    email: string,
    data: {
      userName?: string;
      organizationName: string;
      trialEndDate: string;
      upgradeUrl?: string;
    }
  ): Promise<SendResult | null> {
    return this.sendTemplate(email, 'trial-ending-3-days', data);
  }

  /**
   * Send trial ending notification (1 day before)
   */
  async sendTrialEnding1Day(
    email: string,
    data: {
      userName?: string;
      organizationName: string;
      trialEndDate: string;
      upgradeUrl?: string;
    }
  ): Promise<SendResult | null> {
    return this.sendTemplate(email, 'trial-ending-1-day', data);
  }

  /**
   * Send trial expired notification
   */
  async sendTrialExpired(
    email: string,
    data: {
      userName?: string;
      organizationName: string;
      upgradeUrl?: string;
    }
  ): Promise<SendResult | null> {
    return this.sendTemplate(email, 'trial-expired', data);
  }

  /**
   * Send payment failed notification
   */
  async sendPaymentFailed(
    email: string,
    data: {
      userName?: string;
      amount: string;
      billingUrl?: string;
    }
  ): Promise<SendResult | null> {
    return this.sendTemplate(email, 'payment-failed', data);
  }

  /**
   * Send subscription renewed notification
   */
  async sendSubscriptionRenewed(
    email: string,
    data: {
      userName?: string;
      planName: string;
      amount: string;
      nextBillingDate: string;
    }
  ): Promise<SendResult | null> {
    return this.sendTemplate(email, 'subscription-renewed', data);
  }

  isConfigured(): boolean {
    return this.initialized;
  }

  /**
   * Verify SMTP connection
   */
  async verify(): Promise<boolean> {
    if (!this.transporter) return false;
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      logger.error('SMTP verification failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }
}

// Singleton instance
export const emailService = new EmailService();
