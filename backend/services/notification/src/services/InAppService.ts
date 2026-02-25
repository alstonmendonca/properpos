// In-App Notification Service - Handles database-stored notifications

import { v4 as uuidv4 } from 'uuid';
import { logger, getTenantDatabase, cache } from '@properpos/backend-shared';

interface InAppNotification {
  id: string;
  tenantId: string;
  userId: string;
  locationId?: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, any>;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  read: boolean;
  readAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
}

interface CreateInAppNotificationData {
  tenantId: string;
  userId: string;
  locationId?: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, any>;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  expiresAt?: Date;
}

export class InAppService {
  async create(data: CreateInAppNotificationData): Promise<InAppNotification> {
    const db = await getTenantDatabase(data.tenantId);
    const collection = db.collection('in_app_notifications');

    const notification: InAppNotification = {
      id: uuidv4(),
      tenantId: data.tenantId,
      userId: data.userId,
      locationId: data.locationId,
      type: data.type,
      title: data.title,
      message: data.message,
      data: data.data,
      priority: data.priority || 'medium',
      read: false,
      expiresAt: data.expiresAt,
      createdAt: new Date(),
    };

    await collection.insertOne(notification);

    // Invalidate unread count cache
    await cache.del(`inapp:unread:${data.tenantId}:${data.userId}`);

    logger.debug('In-app notification created', {
      notificationId: notification.id,
      userId: data.userId,
      type: data.type,
    });

    return notification;
  }

  async createBulk(notifications: CreateInAppNotificationData[]): Promise<InAppNotification[]> {
    if (notifications.length === 0) return [];

    // Group by tenant for batch insert
    const byTenant = new Map<string, CreateInAppNotificationData[]>();
    for (const n of notifications) {
      const existing = byTenant.get(n.tenantId) || [];
      existing.push(n);
      byTenant.set(n.tenantId, existing);
    }

    const results: InAppNotification[] = [];

    for (const [tenantId, items] of byTenant) {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('in_app_notifications');

      const docs: InAppNotification[] = items.map((data) => ({
        id: uuidv4(),
        tenantId: data.tenantId,
        userId: data.userId,
        locationId: data.locationId,
        type: data.type,
        title: data.title,
        message: data.message,
        data: data.data,
        priority: data.priority || 'medium',
        read: false,
        expiresAt: data.expiresAt,
        createdAt: new Date(),
      }));

      await collection.insertMany(docs);

      // Invalidate caches for affected users
      const userIds = [...new Set(items.map((i) => i.userId))];
      await Promise.all(
        userIds.map((userId) => cache.del(`inapp:unread:${tenantId}:${userId}`))
      );

      results.push(...docs);
    }

    return results;
  }

  async getByUserId(
    tenantId: string,
    userId: string,
    options?: {
      page?: number;
      limit?: number;
      type?: string;
      read?: boolean;
      priority?: string;
    }
  ): Promise<{ notifications: InAppNotification[]; total: number }> {
    const db = await getTenantDatabase(tenantId);
    const collection = db.collection('in_app_notifications');

    const page = options?.page || 1;
    const limit = options?.limit || 20;
    const skip = (page - 1) * limit;

    const query: any = {
      tenantId,
      userId,
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: { $gt: new Date() } },
      ],
    };

    if (options?.type) query.type = options.type;
    if (options?.read !== undefined) query.read = options.read;
    if (options?.priority) query.priority = options.priority;

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
      notifications: notifications as unknown as InAppNotification[],
      total,
    };
  }

  async getUnreadCount(tenantId: string, userId: string): Promise<number> {
    // Check cache first
    const cacheKey = `inapp:unread:${tenantId}:${userId}`;
    const cached = await cache.get<string>(cacheKey);
    if (cached !== null && typeof cached === 'string') {
      return parseInt(cached, 10);
    }

    const db = await getTenantDatabase(tenantId);
    const collection = db.collection('in_app_notifications');

    const count = await collection.countDocuments({
      tenantId,
      userId,
      read: false,
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: { $gt: new Date() } },
      ],
    });

    // Cache for 5 minutes
    await cache.set(cacheKey, count.toString(), 300);

    return count;
  }

  async markAsRead(
    tenantId: string,
    userId: string,
    notificationId: string
  ): Promise<InAppNotification | null> {
    const db = await getTenantDatabase(tenantId);
    const collection = db.collection('in_app_notifications');

    const result = await collection.findOneAndUpdate(
      { id: notificationId, tenantId, userId },
      {
        $set: {
          read: true,
          readAt: new Date(),
        },
      },
      { returnDocument: 'after' }
    );

    if (result) {
      await cache.del(`inapp:unread:${tenantId}:${userId}`);
    }

    return result as unknown as InAppNotification | null;
  }

  async markAllAsRead(tenantId: string, userId: string): Promise<number> {
    const db = await getTenantDatabase(tenantId);
    const collection = db.collection('in_app_notifications');

    const result = await collection.updateMany(
      { tenantId, userId, read: false },
      {
        $set: {
          read: true,
          readAt: new Date(),
        },
      }
    );

    await cache.del(`inapp:unread:${tenantId}:${userId}`);

    return result.modifiedCount;
  }

  async delete(
    tenantId: string,
    userId: string,
    notificationId: string
  ): Promise<boolean> {
    const db = await getTenantDatabase(tenantId);
    const collection = db.collection('in_app_notifications');

    const result = await collection.deleteOne({
      id: notificationId,
      tenantId,
      userId,
    });

    if (result.deletedCount > 0) {
      await cache.del(`inapp:unread:${tenantId}:${userId}`);
    }

    return result.deletedCount > 0;
  }

  async deleteAllRead(tenantId: string, userId: string): Promise<number> {
    const db = await getTenantDatabase(tenantId);
    const collection = db.collection('in_app_notifications');

    const result = await collection.deleteMany({
      tenantId,
      userId,
      read: true,
    });

    return result.deletedCount;
  }

  async deleteExpired(tenantId: string): Promise<number> {
    const db = await getTenantDatabase(tenantId);
    const collection = db.collection('in_app_notifications');

    const result = await collection.deleteMany({
      tenantId,
      expiresAt: { $lt: new Date() },
    });

    logger.info('Expired in-app notifications deleted', {
      tenantId,
      count: result.deletedCount,
    });

    return result.deletedCount;
  }

  // Send notification to multiple users
  async sendToUsers(
    tenantId: string,
    userIds: string[],
    notification: Omit<CreateInAppNotificationData, 'tenantId' | 'userId'>
  ): Promise<InAppNotification[]> {
    const notifications = userIds.map((userId) => ({
      ...notification,
      tenantId,
      userId,
    }));

    return this.createBulk(notifications);
  }

  // Send notification to all users in a location
  async sendToLocation(
    tenantId: string,
    locationId: string,
    notification: Omit<CreateInAppNotificationData, 'tenantId' | 'userId' | 'locationId'>
  ): Promise<{ usersNotified: number }> {
    const db = await getTenantDatabase(tenantId);

    // Get all active users at this location
    const users = await db.collection('location_users')
      .find({ tenantId, locationId, isActive: true })
      .toArray();

    if (users.length === 0) {
      return { usersNotified: 0 };
    }

    const notifications = users.map((user: any) => ({
      ...notification,
      tenantId,
      userId: user.userId,
      locationId,
    }));

    await this.createBulk(notifications);

    return { usersNotified: users.length };
  }

  // Get notification by ID
  async getById(
    tenantId: string,
    notificationId: string
  ): Promise<InAppNotification | null> {
    const db = await getTenantDatabase(tenantId);
    const collection = db.collection('in_app_notifications');

    const notification = await collection.findOne({
      id: notificationId,
      tenantId,
    });

    return notification as unknown as InAppNotification | null;
  }
}
