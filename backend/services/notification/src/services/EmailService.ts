// Email Service - Handles email notifications

import nodemailer from 'nodemailer';
import Handlebars from 'handlebars';
import { logger } from '@properpos/backend-shared';

interface EmailOptions {
  to: string | string[];
  subject: string;
  template?: string;
  html?: string;
  text?: string;
  data?: Record<string, any>;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
}

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private templates: Map<string, EmailTemplate> = new Map();

  constructor() {
    this.initializeTransporter();
    this.registerDefaultTemplates();
  }

  private initializeTransporter(): void {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587');
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      logger.warn('Email service not configured - missing SMTP credentials');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
    });

    // Verify connection
    this.transporter.verify((error) => {
      if (error) {
        logger.error('Email service connection failed', { error });
      } else {
        logger.info('Email service connected successfully');
      }
    });
  }

  private registerDefaultTemplates(): void {
    // Notification template
    this.templates.set('notification', {
      subject: '{{title}}',
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{title}}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .card { background: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .header { text-align: center; margin-bottom: 30px; }
    .logo { font-size: 24px; font-weight: bold; color: #4F46E5; }
    .title { font-size: 20px; font-weight: 600; margin-bottom: 15px; color: #1f2937; }
    .message { font-size: 16px; color: #4b5563; margin-bottom: 20px; }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #9ca3af; }
    .button { display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">ProperPOS</div>
      </div>
      <div class="title">{{title}}</div>
      <div class="message">{{message}}</div>
      {{#if actionUrl}}
      <div style="text-align: center; margin-top: 20px;">
        <a href="{{actionUrl}}" class="button">{{actionText}}</a>
      </div>
      {{/if}}
    </div>
    <div class="footer">
      <p>This email was sent by ProperPOS. If you didn't expect this email, please ignore it.</p>
      <p>&copy; {{year}} ProperPOS. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
      text: `{{title}}\n\n{{message}}\n\n{{#if actionUrl}}{{actionText}}: {{actionUrl}}{{/if}}\n\n---\nThis email was sent by ProperPOS.`,
    });

    // Low stock alert template
    this.templates.set('low_stock', {
      subject: 'Low Stock Alert: {{productName}}',
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .card { background: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .alert-header { background: #FEF2F2; border-left: 4px solid #EF4444; padding: 15px; margin-bottom: 20px; border-radius: 4px; }
    .alert-title { font-size: 18px; font-weight: 600; color: #DC2626; }
    .stock-info { background: #f9fafb; padding: 15px; border-radius: 6px; margin: 20px 0; }
    .stock-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .stock-row:last-child { border-bottom: none; }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="alert-header">
        <div class="alert-title">Low Stock Alert</div>
      </div>
      <p>The following product is running low on stock:</p>
      <div class="stock-info">
        <div class="stock-row"><strong>Product:</strong> <span>{{productName}}</span></div>
        <div class="stock-row"><strong>Current Stock:</strong> <span>{{currentStock}}</span></div>
        <div class="stock-row"><strong>Threshold:</strong> <span>{{threshold}}</span></div>
        <div class="stock-row"><strong>Location:</strong> <span>{{locationName}}</span></div>
      </div>
      <p>Please reorder this item soon to avoid stockouts.</p>
    </div>
    <div class="footer">
      <p>&copy; {{year}} ProperPOS. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
      text: `Low Stock Alert\n\nProduct: {{productName}}\nCurrent Stock: {{currentStock}}\nThreshold: {{threshold}}\nLocation: {{locationName}}\n\nPlease reorder this item soon to avoid stockouts.`,
    });

    // Order notification template
    this.templates.set('order_received', {
      subject: 'New Order #{{orderNumber}}',
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .card { background: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .order-header { background: #ECFDF5; border-left: 4px solid #10B981; padding: 15px; margin-bottom: 20px; border-radius: 4px; }
    .order-title { font-size: 18px; font-weight: 600; color: #059669; }
    .order-info { background: #f9fafb; padding: 15px; border-radius: 6px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="order-header">
        <div class="order-title">New Order Received</div>
      </div>
      <p>A new order has been placed:</p>
      <div class="order-info">
        <p><strong>Order Number:</strong> #{{orderNumber}}</p>
        <p><strong>Total:</strong> \${{total}}</p>
        <p><strong>Status:</strong> {{status}}</p>
        <p><strong>Date:</strong> {{date}}</p>
      </div>
    </div>
    <div class="footer">
      <p>&copy; {{year}} ProperPOS. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
      text: `New Order Received\n\nOrder Number: #{{orderNumber}}\nTotal: \${{total}}\nStatus: {{status}}\nDate: {{date}}`,
    });

    // Payment notification template
    this.templates.set('payment', {
      subject: 'Payment {{status}}: \${{amount}}',
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .card { background: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .success-header { background: #ECFDF5; border-left: 4px solid #10B981; padding: 15px; margin-bottom: 20px; border-radius: 4px; }
    .failed-header { background: #FEF2F2; border-left: 4px solid #EF4444; padding: 15px; margin-bottom: 20px; border-radius: 4px; }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="{{#if success}}success-header{{else}}failed-header{{/if}}">
        <div style="font-size: 18px; font-weight: 600;">Payment {{status}}</div>
      </div>
      <p><strong>Amount:</strong> \${{amount}}</p>
      <p><strong>Method:</strong> {{method}}</p>
      <p><strong>Date:</strong> {{date}}</p>
      {{#unless success}}
      <p style="color: #DC2626;">Please update your payment method to avoid service interruption.</p>
      {{/unless}}
    </div>
    <div class="footer">
      <p>&copy; {{year}} ProperPOS. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`,
      text: `Payment {{status}}\n\nAmount: \${{amount}}\nMethod: {{method}}\nDate: {{date}}`,
    });
  }

  async send(options: EmailOptions): Promise<{ messageId: string }> {
    if (!this.transporter) {
      logger.warn('Email not sent - service not configured', { to: options.to });
      return { messageId: 'not-configured' };
    }

    let html = options.html;
    let text = options.text;
    let subject = options.subject;

    // Use template if specified
    if (options.template) {
      const template = this.templates.get(options.template);
      if (template) {
        const data = {
          ...options.data,
          year: new Date().getFullYear(),
        };
        html = Handlebars.compile(template.html)(data);
        text = Handlebars.compile(template.text)(data);
        subject = Handlebars.compile(template.subject)(data);
      }
    }

    try {
      const info = await this.transporter.sendMail({
        from: process.env.SMTP_FROM || 'ProperPOS <noreply@properpos.com>',
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        cc: options.cc,
        bcc: options.bcc,
        replyTo: options.replyTo,
        subject,
        html,
        text,
        attachments: options.attachments,
      });

      logger.info('Email sent successfully', {
        messageId: info.messageId,
        to: options.to,
        subject,
      });

      return { messageId: info.messageId };
    } catch (error) {
      logger.error('Failed to send email', {
        error,
        to: options.to,
        subject,
      });
      throw error;
    }
  }

  async sendBulk(emails: EmailOptions[]): Promise<Array<{ to: string; messageId?: string; error?: string }>> {
    const results: Array<{ to: string; messageId?: string; error?: string }> = [];

    for (const email of emails) {
      try {
        const result = await this.send(email);
        results.push({
          to: Array.isArray(email.to) ? email.to[0] : email.to,
          messageId: result.messageId,
        });
      } catch (error) {
        results.push({
          to: Array.isArray(email.to) ? email.to[0] : email.to,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  registerTemplate(name: string, template: EmailTemplate): void {
    this.templates.set(name, template);
  }

  async verifyConnection(): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }

    try {
      await this.transporter.verify();
      return true;
    } catch {
      return false;
    }
  }
}
