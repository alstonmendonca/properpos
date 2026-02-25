// User Notification Preferences Service

import { v4 as uuidv4 } from 'uuid';
import { logger, getTenantDatabase, cache } from '@properpos/backend-shared';

interface NotificationPreferences {
  id: string;
  tenantId: string;
  userId: string;
  channels: {
    email: boolean;
    sms: boolean;
    push: boolean;
    inApp: boolean;
  };
  types: Record<string, {
    enabled: boolean;
    channels?: string[];
  }>;
  quietHours: {
    enabled: boolean;
    start: string; // HH:mm format
    end: string;
    timezone: string;
  };
  frequency: 'realtime' | 'hourly' | 'daily' | 'weekly';
  createdAt: Date;
  updatedAt: Date;
}

interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

const DEFAULT_PREFERENCES: Omit<NotificationPreferences, 'id' | 'tenantId' | 'userId' | 'createdAt' | 'updatedAt'> = {
  channels: {
    email: true,
    sms: false,
    push: true,
    inApp: true,
  },
  types: {
    low_stock: { enabled: true, channels: ['email', 'inApp'] },
    order_received: { enabled: true, channels: ['push', 'inApp'] },
    payment_failed: { enabled: true, channels: ['email', 'push', 'inApp'] },
    system_alert: { enabled: true, channels: ['email', 'inApp'] },
    backup_complete: { enabled: false, channels: ['email'] },
    subscription_expiring: { enabled: true, channels: ['email', 'push', 'inApp'] },
  },
  quietHours: {
    enabled: false,
    start: '22:00',
    end: '08:00',
    timezone: 'UTC',
  },
  frequency: 'realtime',
};

export class PreferencesService {
  async getPreferences(tenantId: string, userId: string): Promise<NotificationPreferences> {
    // Check cache first
    const cacheKey = `prefs:${tenantId}:${userId}`;
    const cached = await cache.get<NotificationPreferences>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    const db = await getTenantDatabase(tenantId);
    const collection = db.collection('notification_preferences');

    let preferences = await collection.findOne({ tenantId, userId }) as unknown as NotificationPreferences;

    if (!preferences) {
      // Create default preferences
      preferences = await this.createDefaultPreferences(tenantId, userId);
    }

    // Cache for 10 minutes
    await cache.set(cacheKey, preferences, 600);

    return preferences;
  }

  private async createDefaultPreferences(
    tenantId: string,
    userId: string
  ): Promise<NotificationPreferences> {
    const db = await getTenantDatabase(tenantId);
    const collection = db.collection('notification_preferences');

    const preferences: NotificationPreferences = {
      id: uuidv4(),
      tenantId,
      userId,
      ...DEFAULT_PREFERENCES,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await collection.insertOne(preferences);

    logger.debug('Default notification preferences created', {
      tenantId,
      userId,
    });

    return preferences;
  }

  async updatePreferences(
    tenantId: string,
    userId: string,
    updates: Partial<NotificationPreferences>
  ): Promise<NotificationPreferences> {
    const db = await getTenantDatabase(tenantId);
    const collection = db.collection('notification_preferences');

    // Ensure preferences exist
    await this.getPreferences(tenantId, userId);

    const updateData: any = {
      ...updates,
      updatedAt: new Date(),
    };
    delete updateData.id;
    delete updateData.tenantId;
    delete updateData.userId;
    delete updateData.createdAt;

    const result = await collection.findOneAndUpdate(
      { tenantId, userId },
      { $set: updateData },
      { returnDocument: 'after' }
    );

    // Invalidate cache
    await cache.del(`prefs:${tenantId}:${userId}`);

    return result as unknown as NotificationPreferences;
  }

  async updateChannelPreference(
    tenantId: string,
    userId: string,
    channel: string,
    enabled: boolean
  ): Promise<NotificationPreferences> {
    const db = await getTenantDatabase(tenantId);
    const collection = db.collection('notification_preferences');

    // Ensure preferences exist
    await this.getPreferences(tenantId, userId);

    const result = await collection.findOneAndUpdate(
      { tenantId, userId },
      {
        $set: {
          [`channels.${channel}`]: enabled,
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' }
    );

    // Invalidate cache
    await cache.del(`prefs:${tenantId}:${userId}`);

    return result as unknown as NotificationPreferences;
  }

  async updateTypePreference(
    tenantId: string,
    userId: string,
    type: string,
    preference: { enabled: boolean; channels?: string[] }
  ): Promise<NotificationPreferences> {
    const db = await getTenantDatabase(tenantId);
    const collection = db.collection('notification_preferences');

    // Ensure preferences exist
    await this.getPreferences(tenantId, userId);

    const result = await collection.findOneAndUpdate(
      { tenantId, userId },
      {
        $set: {
          [`types.${type}`]: preference,
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' }
    );

    // Invalidate cache
    await cache.del(`prefs:${tenantId}:${userId}`);

    return result as unknown as NotificationPreferences;
  }

  async updateQuietHours(
    tenantId: string,
    userId: string,
    quietHours: {
      enabled: boolean;
      start?: string;
      end?: string;
      timezone?: string;
    }
  ): Promise<NotificationPreferences> {
    const db = await getTenantDatabase(tenantId);
    const collection = db.collection('notification_preferences');

    // Ensure preferences exist
    const current = await this.getPreferences(tenantId, userId);

    const updatedQuietHours = {
      enabled: quietHours.enabled,
      start: quietHours.start || current.quietHours.start,
      end: quietHours.end || current.quietHours.end,
      timezone: quietHours.timezone || current.quietHours.timezone,
    };

    const result = await collection.findOneAndUpdate(
      { tenantId, userId },
      {
        $set: {
          quietHours: updatedQuietHours,
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' }
    );

    // Invalidate cache
    await cache.del(`prefs:${tenantId}:${userId}`);

    return result as unknown as NotificationPreferences;
  }

  async resetToDefaults(tenantId: string, userId: string): Promise<NotificationPreferences> {
    const db = await getTenantDatabase(tenantId);
    const collection = db.collection('notification_preferences');

    const result = await collection.findOneAndUpdate(
      { tenantId, userId },
      {
        $set: {
          ...DEFAULT_PREFERENCES,
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after', upsert: true }
    );

    // Invalidate cache
    await cache.del(`prefs:${tenantId}:${userId}`);

    return result as unknown as NotificationPreferences;
  }

  // Check if notifications should be sent based on preferences
  async shouldSendNotification(
    tenantId: string,
    userId: string,
    type: string,
    channel: string
  ): Promise<boolean> {
    const preferences = await this.getPreferences(tenantId, userId);

    // Check if channel is enabled globally
    const channelKey = channel === 'in_app' ? 'inApp' : channel;
    if (!preferences.channels[channelKey as keyof typeof preferences.channels]) {
      return false;
    }

    // Check if notification type is enabled
    const typePreference = preferences.types[type];
    if (typePreference) {
      if (!typePreference.enabled) {
        return false;
      }
      // Check if this channel is enabled for this type
      if (typePreference.channels && !typePreference.channels.includes(channelKey)) {
        return false;
      }
    }

    // Check quiet hours
    if (preferences.quietHours.enabled && this.isInQuietHours(preferences.quietHours)) {
      // Only allow urgent notifications during quiet hours
      return false;
    }

    return true;
  }

  private isInQuietHours(quietHours: NotificationPreferences['quietHours']): boolean {
    const now = new Date();

    // Convert current time to user's timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: quietHours.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const currentTime = formatter.format(now);
    const [currentHour, currentMinute] = currentTime.split(':').map(Number);
    const currentMinutes = currentHour * 60 + currentMinute;

    const [startHour, startMinute] = quietHours.start.split(':').map(Number);
    const startMinutes = startHour * 60 + startMinute;

    const [endHour, endMinute] = quietHours.end.split(':').map(Number);
    const endMinutes = endHour * 60 + endMinute;

    // Handle overnight quiet hours (e.g., 22:00 - 08:00)
    if (startMinutes > endMinutes) {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }

    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  // Push subscription management
  async subscribeToPush(
    tenantId: string,
    userId: string,
    subscription: PushSubscriptionData,
    deviceName?: string
  ): Promise<{ subscriptionId: string }> {
    const db = await getTenantDatabase(tenantId);
    const collection = db.collection('push_subscriptions');

    const id = uuidv4();

    // Check if subscription already exists
    const existing = await collection.findOne({
      tenantId,
      userId,
      'subscription.endpoint': subscription.endpoint,
    });

    if (existing) {
      // Update existing subscription
      await collection.updateOne(
        { id: existing.id },
        {
          $set: {
            subscription,
            deviceName,
            isActive: true,
            updatedAt: new Date(),
          },
        }
      );
      return { subscriptionId: existing.id as string };
    }

    // Create new subscription
    await collection.insertOne({
      id,
      tenantId,
      userId,
      type: 'web',
      subscription,
      deviceName,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    logger.info('Push subscription added', {
      tenantId,
      userId,
      deviceName,
    });

    return { subscriptionId: id };
  }

  async unsubscribeFromPush(
    tenantId: string,
    userId: string,
    endpoint: string
  ): Promise<boolean> {
    const db = await getTenantDatabase(tenantId);
    const collection = db.collection('push_subscriptions');

    const result = await collection.deleteOne({
      tenantId,
      userId,
      'subscription.endpoint': endpoint,
    });

    return result.deletedCount > 0;
  }

  async getPushSubscriptions(
    tenantId: string,
    userId: string
  ): Promise<Array<{ id: string; deviceName?: string; createdAt: Date }>> {
    const db = await getTenantDatabase(tenantId);
    const collection = db.collection('push_subscriptions');

    const subscriptions = await collection
      .find({ tenantId, userId, isActive: true })
      .project({ id: 1, deviceName: 1, createdAt: 1 })
      .toArray();

    return subscriptions as unknown as Array<{ id: string; deviceName?: string; createdAt: Date }>;
  }
}
