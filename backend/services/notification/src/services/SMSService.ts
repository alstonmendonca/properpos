// SMS Service - Handles SMS notifications via Twilio

import { logger } from '@properpos/backend-shared';

interface SMSOptions {
  to: string;
  message: string;
  from?: string;
}

interface SMSResult {
  sid: string;
  status: string;
  to: string;
}

export class SMSService {
  private client: any = null;
  private fromNumber: string;
  private isConfigured: boolean = false;

  constructor() {
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER || '';
    this.initializeClient();
  }

  private async initializeClient(): Promise<void> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken || !this.fromNumber) {
      logger.warn('SMS service not configured - missing Twilio credentials');
      return;
    }

    try {
      // Dynamic import for Twilio
      const twilio = await import('twilio');
      this.client = twilio.default(accountSid, authToken);
      this.isConfigured = true;
      logger.info('SMS service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize SMS service', { error });
    }
  }

  async send(options: SMSOptions): Promise<SMSResult> {
    if (!this.isConfigured || !this.client) {
      logger.warn('SMS not sent - service not configured', { to: options.to });
      return {
        sid: 'not-configured',
        status: 'not_configured',
        to: options.to,
      };
    }

    try {
      // Format phone number
      const to = this.formatPhoneNumber(options.to);
      const from = options.from || this.fromNumber;

      // Truncate message if too long (SMS limit is 1600 characters)
      const message = options.message.length > 1600
        ? options.message.substring(0, 1597) + '...'
        : options.message;

      const result = await this.client.messages.create({
        body: message,
        to,
        from,
      });

      logger.info('SMS sent successfully', {
        sid: result.sid,
        to,
        status: result.status,
      });

      return {
        sid: result.sid,
        status: result.status,
        to,
      };
    } catch (error) {
      logger.error('Failed to send SMS', {
        error,
        to: options.to,
      });
      throw error;
    }
  }

  async sendBulk(messages: SMSOptions[]): Promise<Array<SMSResult & { error?: string }>> {
    const results: Array<SMSResult & { error?: string }> = [];

    for (const msg of messages) {
      try {
        const result = await this.send(msg);
        results.push(result);
      } catch (error) {
        results.push({
          sid: '',
          status: 'failed',
          to: msg.to,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  private formatPhoneNumber(phone: string): string {
    // Remove all non-numeric characters except +
    let formatted = phone.replace(/[^\d+]/g, '');

    // Add + if not present and number is 10+ digits
    if (!formatted.startsWith('+') && formatted.length >= 10) {
      // Assume US number if 10 digits
      if (formatted.length === 10) {
        formatted = '+1' + formatted;
      } else {
        formatted = '+' + formatted;
      }
    }

    return formatted;
  }

  async getMessageStatus(sid: string): Promise<{ status: string; errorCode?: string }> {
    if (!this.isConfigured || !this.client) {
      return { status: 'not_configured' };
    }

    try {
      const message = await this.client.messages(sid).fetch();
      return {
        status: message.status,
        errorCode: message.errorCode,
      };
    } catch (error) {
      logger.error('Failed to get SMS status', { error, sid });
      throw error;
    }
  }

  async verifyConnection(): Promise<boolean> {
    if (!this.isConfigured || !this.client) {
      return false;
    }

    try {
      // Try to fetch account info to verify credentials
      await this.client.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
      return true;
    } catch {
      return false;
    }
  }

  // Check if phone number can receive SMS
  async lookupNumber(phone: string): Promise<{
    valid: boolean;
    carrier?: string;
    type?: string;
  }> {
    if (!this.isConfigured || !this.client) {
      return { valid: false };
    }

    try {
      const formatted = this.formatPhoneNumber(phone);
      const lookup = await this.client.lookups.v1
        .phoneNumbers(formatted)
        .fetch({ type: ['carrier'] });

      return {
        valid: true,
        carrier: lookup.carrier?.name,
        type: lookup.carrier?.type,
      };
    } catch (error) {
      return { valid: false };
    }
  }
}
