// Push Notification Service - Handles web push and Firebase notifications

import webPush from 'web-push';
import { logger, getPlatformDatabase, getTenantDatabase } from '@properpos/backend-shared';

interface PushOptions {
  userId: string;
  tenantId: string;
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  image?: string;
  data?: Record<string, any>;
  actions?: Array<{ action: string; title: string; icon?: string }>;
  tag?: string;
  requireInteraction?: boolean;
  silent?: boolean;
}

interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

interface PushResult {
  success: boolean;
  subscriptionsNotified: number;
  errors?: string[];
}

export class PushService {
  private isConfigured: boolean = false;
  private firebaseApp: any = null;

  constructor() {
    this.initializeWebPush();
    this.initializeFirebase();
  }

  private initializeWebPush(): void {
    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:support@properpos.com';

    if (!vapidPublicKey || !vapidPrivateKey) {
      logger.warn('Web Push not configured - missing VAPID keys');
      return;
    }

    try {
      webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
      this.isConfigured = true;
      logger.info('Web Push service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Web Push service', { error });
    }
  }

  private async initializeFirebase(): Promise<void> {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

    if (!projectId || !privateKey || !clientEmail) {
      logger.warn('Firebase Push not configured - missing credentials');
      return;
    }

    try {
      const admin = await import('firebase-admin');

      if (!admin.apps.length) {
        this.firebaseApp = admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            privateKey: privateKey.replace(/\\n/g, '\n'),
            clientEmail,
          }),
        });
        logger.info('Firebase Push service initialized successfully');
      }
    } catch (error) {
      logger.error('Failed to initialize Firebase Push service', { error });
    }
  }

  async send(options: PushOptions): Promise<PushResult> {
    const errors: string[] = [];
    let subscriptionsNotified = 0;

    // Get user's push subscriptions
    const subscriptions = await this.getUserSubscriptions(options.tenantId, options.userId);

    if (subscriptions.length === 0) {
      logger.debug('No push subscriptions found for user', {
        userId: options.userId,
        tenantId: options.tenantId,
      });
      return { success: true, subscriptionsNotified: 0 };
    }

    const payload = JSON.stringify({
      title: options.title,
      body: options.body,
      icon: options.icon || '/icons/notification-icon.png',
      badge: options.badge || '/icons/badge-icon.png',
      image: options.image,
      data: options.data,
      actions: options.actions,
      tag: options.tag,
      requireInteraction: options.requireInteraction,
      silent: options.silent,
    });

    // Send to all subscriptions
    for (const subscription of subscriptions) {
      try {
        if (subscription.type === 'web' && subscription.subscription) {
          await this.sendWebPush(subscription.subscription, payload);
        } else if (subscription.type === 'firebase' && subscription.token) {
          await this.sendFirebasePush(subscription.token, options);
        }
        subscriptionsNotified++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push(errorMessage);

        // If subscription is invalid, remove it
        if (this.isExpiredSubscription(error)) {
          await this.removeSubscription(options.tenantId, options.userId, subscription.id);
        }
      }
    }

    logger.info('Push notifications sent', {
      userId: options.userId,
      tenantId: options.tenantId,
      subscriptionsNotified,
      errors: errors.length,
    });

    return {
      success: errors.length === 0,
      subscriptionsNotified,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  private async sendWebPush(subscription: PushSubscription, payload: string): Promise<void> {
    if (!this.isConfigured) {
      throw new Error('Web Push not configured');
    }

    await webPush.sendNotification(subscription, payload);
  }

  private async sendFirebasePush(token: string, options: PushOptions): Promise<void> {
    if (!this.firebaseApp) {
      throw new Error('Firebase not configured');
    }

    const admin = await import('firebase-admin');

    await admin.messaging().send({
      token,
      notification: {
        title: options.title,
        body: options.body,
        imageUrl: options.image,
      },
      data: options.data ? this.flattenData(options.data) : undefined,
      android: {
        priority: 'high',
        notification: {
          clickAction: 'FLUTTER_NOTIFICATION_CLICK',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: options.silent ? undefined : 'default',
            badge: 1,
          },
        },
      },
    });
  }

  private flattenData(data: Record<string, any>): Record<string, string> {
    const flattened: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
      flattened[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }
    return flattened;
  }

  private isExpiredSubscription(error: any): boolean {
    // Check for common expired subscription error codes
    if (error.statusCode === 410 || error.statusCode === 404) {
      return true;
    }
    if (error.code === 'messaging/registration-token-not-registered') {
      return true;
    }
    return false;
  }

  async getUserSubscriptions(
    tenantId: string,
    userId: string
  ): Promise<Array<{ id: string; type: 'web' | 'firebase'; subscription?: PushSubscription; token?: string }>> {
    const db = await getTenantDatabase(tenantId);
    const collection = db.collection('push_subscriptions');

    const subscriptions = await collection
      .find({ userId, tenantId, isActive: true })
      .toArray();

    return subscriptions.map((s: any) => ({
      id: s.id,
      type: s.type,
      subscription: s.subscription,
      token: s.token,
    }));
  }

  async addSubscription(
    tenantId: string,
    userId: string,
    type: 'web' | 'firebase',
    data: PushSubscription | string,
    deviceName?: string
  ): Promise<{ id: string }> {
    const db = await getTenantDatabase(tenantId);
    const collection = db.collection('push_subscriptions');

    const id = `push_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const endpoint = type === 'web' ? (data as PushSubscription).endpoint : data as string;

    // Check if subscription already exists
    const existing = await collection.findOne({
      tenantId,
      userId,
      $or: [
        { 'subscription.endpoint': endpoint },
        { token: endpoint },
      ],
    });

    if (existing) {
      // Update existing subscription
      await collection.updateOne(
        { id: existing.id },
        {
          $set: {
            isActive: true,
            updatedAt: new Date(),
            deviceName,
          },
        }
      );
      return { id: existing.id };
    }

    // Create new subscription
    await collection.insertOne({
      id,
      tenantId,
      userId,
      type,
      subscription: type === 'web' ? data : undefined,
      token: type === 'firebase' ? data : undefined,
      deviceName,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return { id };
  }

  async removeSubscription(
    tenantId: string,
    userId: string,
    subscriptionId: string
  ): Promise<boolean> {
    const db = await getTenantDatabase(tenantId);
    const collection = db.collection('push_subscriptions');

    const result = await collection.deleteOne({
      id: subscriptionId,
      tenantId,
      userId,
    });

    return result.deletedCount > 0;
  }

  async removeSubscriptionByEndpoint(
    tenantId: string,
    userId: string,
    endpoint: string
  ): Promise<boolean> {
    const db = await getTenantDatabase(tenantId);
    const collection = db.collection('push_subscriptions');

    const result = await collection.deleteOne({
      tenantId,
      userId,
      $or: [
        { 'subscription.endpoint': endpoint },
        { token: endpoint },
      ],
    });

    return result.deletedCount > 0;
  }

  // Send to all users in a location
  async sendToLocation(
    tenantId: string,
    locationId: string,
    options: Omit<PushOptions, 'userId' | 'tenantId'>
  ): Promise<{ usersNotified: number; errors: string[] }> {
    const db = await getTenantDatabase(tenantId);

    // Get all users with subscriptions at this location
    const subscriptions = await db.collection('push_subscriptions')
      .distinct('userId', { tenantId, locationId, isActive: true });

    let usersNotified = 0;
    const errors: string[] = [];

    for (const userId of subscriptions) {
      try {
        const result = await this.send({
          ...options,
          userId,
          tenantId,
        });
        if (result.subscriptionsNotified > 0) {
          usersNotified++;
        }
        if (result.errors) {
          errors.push(...result.errors);
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : 'Unknown error');
      }
    }

    return { usersNotified, errors };
  }

  // Get VAPID public key for client
  getVapidPublicKey(): string | null {
    return process.env.VAPID_PUBLIC_KEY || null;
  }

  async verifyConnection(): Promise<{ web: boolean; firebase: boolean }> {
    return {
      web: this.isConfigured,
      firebase: !!this.firebaseApp,
    };
  }
}
