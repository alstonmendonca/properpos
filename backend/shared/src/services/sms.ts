// SMS service stub for shared library

import { logger } from '../utils/logger';

export interface SMSOptions {
  to: string;
  message: string;
  from?: string;
}

export class SMSService {
  private initialized = false;

  constructor() {
    // Initialize if SMS credentials are provided (e.g., Twilio)
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      this.initialized = true;
      logger.info('SMSService initialized');
    } else {
      logger.warn('SMSService not configured - missing SMS credentials');
    }
  }

  async send(options: SMSOptions): Promise<{ messageId: string } | null> {
    if (!this.initialized) {
      logger.warn('SMSService: Attempted to send SMS but service not configured', {
        to: options.to,
      });
      return null;
    }

    // In production, this would send via Twilio or similar
    logger.info('SMSService: Would send SMS', {
      to: options.to,
      messageLength: options.message.length,
    });

    return { messageId: `mock-sms-${Date.now()}` };
  }

  async sendTemplate(
    to: string,
    templateName: string,
    data: Record<string, any>
  ): Promise<{ messageId: string } | null> {
    // Build message from template data
    const message = data.message || `Notification from ProperPOS: ${templateName}`;
    return this.send({ to, message });
  }

  isConfigured(): boolean {
    return this.initialized;
  }
}
