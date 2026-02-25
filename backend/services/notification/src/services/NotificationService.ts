// Main Notification Service

import { v4 as uuidv4 } from 'uuid';
import {
  logger,
  getPlatformDatabase,
  getTenantDatabase,
  cache,
  ApiError,
} from '@properpos/backend-shared';
import { EmailService } from './EmailService';
import { SMSService } from './SMSService';
import { PushService } from './PushService';
import { InAppService } from './InAppService';
import { WebhookService } from './WebhookService';
import { QueueService } from './QueueService';

interface CreateNotificationData {
  tenantId: string;
  userId?: string;
  locationId?: string;
  type: string;
  title: string;
  message: string;
  channels?: string[];
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  data?: Record<string, any>;
  scheduledAt?: Date;
  expiresAt?: Date;
  createdBy?: string;
}

interface NotificationFilters {
  tenantId: string;
  userId?: string;
  type?: string;
  read?: boolean;
  priority?: string;
  from?: Date;
  to?: Date;
}

interface Notification {
  id: string;
  tenantId: string;
  userId?: string;
  locationId?: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, any>;
  channels: {
    email?: { sent: boolean; sentAt?: Date; error?: string };
    sms?: { sent: boolean; sentAt?: Date; error?: string };
    push?: { sent: boolean; sentAt?: Date; error?: string };
    inApp?: { read: boolean; readAt?: Date };
    webhook?: { sent: boolean; sentAt?: Date; error?: string };
  };
  priority: 'low' | 'medium' | 'high' | 'urgent';
  scheduledAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
}

export class NotificationService {
  private emailService: EmailService;
  private smsService: SMSService;
  private pushService: PushService;
  private inAppService: InAppService;
  private webhookService: WebhookService;

  constructor() {
    this.emailService = new EmailService();
    this.smsService = new SMSService();
    this.pushService = new PushService();
    this.inAppService = new InAppService();
    this.webhookService = new WebhookService();
  }

  async create(data: CreateNotificationData): Promise<Notification> {
    const db = await getTenantDatabase(data.tenantId);
    const collection = db.collection('notifications');

    const notification: Notification = {
      id: uuidv4(),
      tenantId: data.tenantId,
      userId: data.userId,
      locationId: data.locationId,
      type: data.type,
      title: data.title,
      message: data.message,
      data: data.data,
      channels: {},
      priority: data.priority || 'medium',
      scheduledAt: data.scheduledAt,
      expiresAt: data.expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: data.createdBy,
    };

    // Determine channels to use
    const channels = data.channels || ['in_app'];

    // If scheduled for later, save and queue
    if (data.scheduledAt && new Date(data.scheduledAt) > new Date()) {
      await collection.insertOne(notification);
      // Queue for scheduled delivery
      logger.info('Notification scheduled', {
        notificationId: notification.id,
        scheduledAt: data.scheduledAt,
      });
      return notification;
    }

    // Send to each channel
    await this.sendToChannels(notification, channels, data.tenantId, data.userId);

    // Save notification
    await collection.insertOne(notification);

    // Invalidate unread count cache
    if (data.userId) {
      await cache.del(`notification:unread:${data.tenantId}:${data.userId}`);
    }

    return notification;
  }

  private async sendToChannels(
    notification: Notification,
    channels: string[],
    tenantId: string,
    userId?: string
  ): Promise<void> {
    const sendPromises: Promise<void>[] = [];

    for (const channel of channels) {
      switch (channel) {
        case 'email':
          sendPromises.push(this.sendEmail(notification, tenantId, userId));
          break;
        case 'sms':
          sendPromises.push(this.sendSMS(notification, tenantId, userId));
          break;
        case 'push':
          sendPromises.push(this.sendPush(notification, tenantId, userId));
          break;
        case 'in_app':
          notification.channels.inApp = { read: false };
          break;
        case 'webhook':
          sendPromises.push(this.sendWebhook(notification, tenantId));
          break;
      }
    }

    await Promise.allSettled(sendPromises);
  }

  private async sendEmail(
    notification: Notification,
    tenantId: string,
    userId?: string
  ): Promise<void> {
    try {
      if (!userId) {
        notification.channels.email = {
          sent: false,
          error: 'No user ID provided',
        };
        return;
      }

      // Get user email from platform DB
      const user = await getPlatformDatabase().collection('users').findOne({ id: userId });
      if (!user?.email) {
        notification.channels.email = {
          sent: false,
          error: 'User email not found',
        };
        return;
      }

      await this.emailService.send({
        to: user.email,
        subject: notification.title,
        template: 'notification',
        data: {
          title: notification.title,
          message: notification.message,
          type: notification.type,
          ...notification.data,
        },
      });

      notification.channels.email = {
        sent: true,
        sentAt: new Date(),
      };
    } catch (error) {
      logger.error('Failed to send email notification', { error, notificationId: notification.id });
      notification.channels.email = {
        sent: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async sendSMS(
    notification: Notification,
    tenantId: string,
    userId?: string
  ): Promise<void> {
    try {
      if (!userId) {
        notification.channels.sms = {
          sent: false,
          error: 'No user ID provided',
        };
        return;
      }

      // Get user phone from platform DB
      const user = await getPlatformDatabase().collection('users').findOne({ id: userId });
      if (!user?.phone) {
        notification.channels.sms = {
          sent: false,
          error: 'User phone not found',
        };
        return;
      }

      await this.smsService.send({
        to: user.phone,
        message: `${notification.title}: ${notification.message}`,
      });

      notification.channels.sms = {
        sent: true,
        sentAt: new Date(),
      };
    } catch (error) {
      logger.error('Failed to send SMS notification', { error, notificationId: notification.id });
      notification.channels.sms = {
        sent: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async sendPush(
    notification: Notification,
    tenantId: string,
    userId?: string
  ): Promise<void> {
    try {
      if (!userId) {
        notification.channels.push = {
          sent: false,
          error: 'No user ID provided',
        };
        return;
      }

      await this.pushService.send({
        userId,
        tenantId,
        title: notification.title,
        body: notification.message,
        data: notification.data,
      });

      notification.channels.push = {
        sent: true,
        sentAt: new Date(),
      };
    } catch (error) {
      logger.error('Failed to send push notification', { error, notificationId: notification.id });
      notification.channels.push = {
        sent: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async sendWebhook(
    notification: Notification,
    tenantId: string
  ): Promise<void> {
    try {
      await this.webhookService.triggerEvent(tenantId, `notification.${notification.type}`, {
        notificationId: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        data: notification.data,
        priority: notification.priority,
        createdAt: notification.createdAt,
      });

      notification.channels.webhook = {
        sent: true,
        sentAt: new Date(),
      };
    } catch (error) {
      logger.error('Failed to send webhook notification', { error, notificationId: notification.id });
      notification.channels.webhook = {
        sent: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async createBulk(notifications: CreateNotificationData[]): Promise<Notification[]> {
    const results: Notification[] = [];

    for (const data of notifications) {
      try {
        const notification = await this.create(data);
        results.push(notification);
      } catch (error) {
        logger.error('Failed to create bulk notification', { error, data });
      }
    }

    return results;
  }

  async list(
    filters: NotificationFilters,
    page: number = 1,
    limit: number = 20
  ): Promise<{ notifications: Notification[]; total: number }> {
    const db = await getTenantDatabase(filters.tenantId);
    const collection = db.collection('notifications');

    const query: any = {
      tenantId: filters.tenantId,
    };

    if (filters.userId) query.userId = filters.userId;
    if (filters.type) query.type = filters.type;
    if (filters.priority) query.priority = filters.priority;
    if (filters.read !== undefined) {
      query['channels.inApp.read'] = filters.read;
    }
    if (filters.from || filters.to) {
      query.createdAt = {};
      if (filters.from) query.createdAt.$gte = filters.from;
      if (filters.to) query.createdAt.$lte = filters.to;
    }

    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      collection
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      collection.countDocuments(query),
    ]);

    return {
      notifications: notifications as unknown as Notification[],
      total,
    };
  }

  async getById(
    id: string,
    tenantId: string,
    userId?: string
  ): Promise<Notification | null> {
    const db = await getTenantDatabase(tenantId);
    const collection = db.collection('notifications');

    const query: any = { id, tenantId };
    if (userId) query.userId = userId;

    const notification = await collection.findOne(query);
    return notification as unknown as Notification | null;
  }

  async getUnreadCount(tenantId: string, userId: string): Promise<number> {
    // Check cache first
    const cacheKey = `notification:unread:${tenantId}:${userId}`;
    const cached = await cache.get<string>(cacheKey);
    if (cached !== null && typeof cached === 'string') {
      return parseInt(cached, 10);
    }

    const db = await getTenantDatabase(tenantId);
    const collection = db.collection('notifications');

    const count = await collection.countDocuments({
      tenantId,
      userId,
      'channels.inApp.read': false,
    });

    // Cache for 5 minutes
    await cache.set(cacheKey, count.toString(), 300);

    return count;
  }

  async markAsRead(
    id: string,
    tenantId: string,
    userId: string
  ): Promise<Notification | null> {
    const db = await getTenantDatabase(tenantId);
    const collection = db.collection('notifications');

    const result = await collection.findOneAndUpdate(
      { id, tenantId, userId },
      {
        $set: {
          'channels.inApp.read': true,
          'channels.inApp.readAt': new Date(),
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' }
    );

    if (result) {
      // Invalidate cache
      await cache.del(`notification:unread:${tenantId}:${userId}`);
    }

    return result as unknown as Notification | null;
  }

  async markAllAsRead(tenantId: string, userId: string): Promise<number> {
    const db = await getTenantDatabase(tenantId);
    const collection = db.collection('notifications');

    const result = await collection.updateMany(
      {
        tenantId,
        userId,
        'channels.inApp.read': false,
      },
      {
        $set: {
          'channels.inApp.read': true,
          'channels.inApp.readAt': new Date(),
          updatedAt: new Date(),
        },
      }
    );

    // Invalidate cache
    await cache.del(`notification:unread:${tenantId}:${userId}`);

    return result.modifiedCount;
  }

  async delete(
    id: string,
    tenantId: string,
    userId: string
  ): Promise<boolean> {
    const db = await getTenantDatabase(tenantId);
    const collection = db.collection('notifications');

    const result = await collection.deleteOne({ id, tenantId, userId });

    if (result.deletedCount > 0) {
      await cache.del(`notification:unread:${tenantId}:${userId}`);
    }

    return result.deletedCount > 0;
  }

  async deleteAllRead(tenantId: string, userId: string): Promise<number> {
    const db = await getTenantDatabase(tenantId);
    const collection = db.collection('notifications');

    const result = await collection.deleteMany({
      tenantId,
      userId,
      'channels.inApp.read': true,
    });

    return result.deletedCount;
  }

  async resend(
    id: string,
    tenantId: string,
    channels?: string[]
  ): Promise<Notification | null> {
    const db = await getTenantDatabase(tenantId);
    const collection = db.collection('notifications');

    const notification = await collection.findOne({ id, tenantId });
    if (!notification) {
      return null;
    }

    const typedNotification = notification as unknown as Notification;
    const channelsToResend = channels || Object.keys(typedNotification.channels);

    await this.sendToChannels(
      typedNotification,
      channelsToResend,
      tenantId,
      typedNotification.userId
    );

    // Update notification
    await collection.updateOne(
      { id, tenantId },
      {
        $set: {
          channels: typedNotification.channels,
          updatedAt: new Date(),
        },
      }
    );

    return typedNotification;
  }

  // System notification methods for internal use
  async sendSystemNotification(
    tenantId: string,
    type: string,
    title: string,
    message: string,
    options?: {
      userId?: string;
      locationId?: string;
      channels?: string[];
      priority?: 'low' | 'medium' | 'high' | 'urgent';
      data?: Record<string, any>;
    }
  ): Promise<Notification> {
    return this.create({
      tenantId,
      type,
      title,
      message,
      userId: options?.userId,
      locationId: options?.locationId,
      channels: options?.channels || ['in_app'],
      priority: options?.priority || 'medium',
      data: options?.data,
    });
  }

  // Low stock alert
  async sendLowStockAlert(
    tenantId: string,
    locationId: string,
    product: { id: string; name: string; currentStock: number; threshold: number }
  ): Promise<Notification> {
    return this.sendSystemNotification(
      tenantId,
      'low_stock',
      'Low Stock Alert',
      `${product.name} is running low (${product.currentStock} remaining, threshold: ${product.threshold})`,
      {
        locationId,
        channels: ['in_app', 'email'],
        priority: 'high',
        data: { product },
      }
    );
  }

  // Order notification
  async sendOrderNotification(
    tenantId: string,
    order: { id: string; orderNumber: string; status: string; total: number },
    userId?: string
  ): Promise<Notification> {
    return this.sendSystemNotification(
      tenantId,
      'order_received',
      'New Order Received',
      `Order #${order.orderNumber} has been placed (Total: $${order.total.toFixed(2)})`,
      {
        userId,
        channels: ['in_app', 'push'],
        priority: 'medium',
        data: { order },
      }
    );
  }

  // Payment notification
  async sendPaymentNotification(
    tenantId: string,
    type: 'success' | 'failed',
    payment: { id: string; amount: number; method: string },
    userId?: string
  ): Promise<Notification> {
    const title = type === 'success' ? 'Payment Successful' : 'Payment Failed';
    const message = type === 'success'
      ? `Payment of $${payment.amount.toFixed(2)} via ${payment.method} was successful`
      : `Payment of $${payment.amount.toFixed(2)} via ${payment.method} failed`;

    return this.sendSystemNotification(
      tenantId,
      type === 'success' ? 'payment_processed' : 'payment_failed',
      title,
      message,
      {
        userId,
        channels: type === 'failed' ? ['in_app', 'email'] : ['in_app'],
        priority: type === 'failed' ? 'high' : 'low',
        data: { payment },
      }
    );
  }

  // Subscription notification
  async sendSubscriptionNotification(
    tenantId: string,
    type: 'expiring' | 'renewed' | 'cancelled',
    subscription: { planName: string; expiresAt?: Date }
  ): Promise<Notification> {
    const titles: Record<string, string> = {
      expiring: 'Subscription Expiring Soon',
      renewed: 'Subscription Renewed',
      cancelled: 'Subscription Cancelled',
    };

    const messages: Record<string, string> = {
      expiring: `Your ${subscription.planName} subscription will expire on ${subscription.expiresAt?.toLocaleDateString()}`,
      renewed: `Your ${subscription.planName} subscription has been renewed`,
      cancelled: `Your ${subscription.planName} subscription has been cancelled`,
    };

    return this.sendSystemNotification(
      tenantId,
      'subscription_expiring',
      titles[type],
      messages[type],
      {
        channels: ['in_app', 'email'],
        priority: type === 'expiring' ? 'high' : 'medium',
        data: { subscription },
      }
    );
  }
}
