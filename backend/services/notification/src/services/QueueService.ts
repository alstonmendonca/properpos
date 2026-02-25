// Queue Service - Handles notification queueing and processing

import Bull, { Queue, Job } from 'bull';
import { logger, cache } from '@properpos/backend-shared';
import { NotificationService } from './NotificationService';

interface NotificationJob {
  tenantId: string;
  userId?: string;
  locationId?: string;
  type: string;
  title: string;
  message: string;
  channels: string[];
  priority: 'low' | 'medium' | 'high' | 'urgent';
  data?: Record<string, any>;
  scheduledAt?: Date;
}

interface RetryJob {
  notificationId: string;
  tenantId: string;
  channel: string;
  attempts: number;
}

export class QueueService {
  private notificationQueue: Queue<NotificationJob> | null = null;
  private retryQueue: Queue<RetryJob> | null = null;
  private notificationService: NotificationService;
  private isInitialized: boolean = false;

  constructor() {
    this.notificationService = new NotificationService();
  }

  async initialize(): Promise<void> {
    const redisHost = process.env.REDIS_HOST || 'localhost';
    const redisPort = parseInt(process.env.REDIS_PORT || '6379');
    const redisPassword = process.env.REDIS_PASSWORD;

    const redisConfig = {
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      maxRetriesPerRequest: 3,
    };

    try {
      // Create notification queue
      this.notificationQueue = new Bull('notifications', {
        redis: redisConfig,
        defaultJobOptions: {
          removeOnComplete: 100, // Keep last 100 completed jobs
          removeOnFail: 1000, // Keep last 1000 failed jobs
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        },
      });

      // Create retry queue
      this.retryQueue = new Bull('notification-retry', {
        redis: redisConfig,
        defaultJobOptions: {
          removeOnComplete: 50,
          removeOnFail: 500,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 30000,
          },
        },
      });

      // Set up processors
      this.setupProcessors();

      // Set up event handlers
      this.setupEventHandlers();

      this.isInitialized = true;
      logger.info('Queue service initialized successfully');
    } catch (error) {
      logger.warn('Queue service initialization failed - running without queues', { error });
    }
  }

  private setupProcessors(): void {
    if (!this.notificationQueue || !this.retryQueue) return;

    // Process notification jobs
    this.notificationQueue.process('send', async (job: Job<NotificationJob>) => {
      const { data } = job;

      logger.debug('Processing notification job', {
        jobId: job.id,
        type: data.type,
        tenantId: data.tenantId,
      });

      try {
        await this.notificationService.create({
          tenantId: data.tenantId,
          userId: data.userId,
          locationId: data.locationId,
          type: data.type,
          title: data.title,
          message: data.message,
          channels: data.channels,
          priority: data.priority,
          data: data.data,
        });

        return { success: true };
      } catch (error) {
        logger.error('Failed to process notification job', {
          jobId: job.id,
          error,
        });
        throw error;
      }
    });

    // Process scheduled notifications
    this.notificationQueue.process('scheduled', async (job: Job<NotificationJob>) => {
      const { data } = job;

      logger.debug('Processing scheduled notification', {
        jobId: job.id,
        type: data.type,
        scheduledAt: data.scheduledAt,
      });

      try {
        await this.notificationService.create({
          tenantId: data.tenantId,
          userId: data.userId,
          locationId: data.locationId,
          type: data.type,
          title: data.title,
          message: data.message,
          channels: data.channels,
          priority: data.priority,
          data: data.data,
        });

        return { success: true };
      } catch (error) {
        logger.error('Failed to process scheduled notification', {
          jobId: job.id,
          error,
        });
        throw error;
      }
    });

    // Process retry jobs
    this.retryQueue.process(async (job: Job<RetryJob>) => {
      const { data } = job;

      logger.debug('Processing retry job', {
        jobId: job.id,
        notificationId: data.notificationId,
        channel: data.channel,
        attempt: data.attempts,
      });

      try {
        await this.notificationService.resend(
          data.notificationId,
          data.tenantId,
          [data.channel]
        );

        return { success: true };
      } catch (error) {
        logger.error('Failed to process retry job', {
          jobId: job.id,
          error,
        });
        throw error;
      }
    });
  }

  private setupEventHandlers(): void {
    if (!this.notificationQueue) return;

    this.notificationQueue.on('completed', (job, result) => {
      logger.debug('Notification job completed', {
        jobId: job.id,
        type: job.data.type,
      });
    });

    this.notificationQueue.on('failed', (job, error) => {
      logger.error('Notification job failed', {
        jobId: job.id,
        type: job.data.type,
        error: error.message,
        attempts: job.attemptsMade,
      });
    });

    this.notificationQueue.on('stalled', (job) => {
      logger.warn('Notification job stalled', {
        jobId: job.id,
        type: job.data.type,
      });
    });
  }

  async queueNotification(notification: NotificationJob): Promise<{ jobId: string }> {
    if (!this.notificationQueue || !this.isInitialized) {
      // Fallback to direct processing if queue is not available
      await this.notificationService.create({
        tenantId: notification.tenantId,
        userId: notification.userId,
        locationId: notification.locationId,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        channels: notification.channels,
        priority: notification.priority,
        data: notification.data,
      });
      return { jobId: 'direct' };
    }

    // Determine priority
    const priorityMap: Record<string, number> = {
      urgent: 1,
      high: 2,
      medium: 3,
      low: 4,
    };

    const job = await this.notificationQueue.add('send', notification, {
      priority: priorityMap[notification.priority] || 3,
    });

    return { jobId: job.id.toString() };
  }

  async scheduleNotification(
    notification: NotificationJob,
    scheduledAt: Date
  ): Promise<{ jobId: string }> {
    if (!this.notificationQueue || !this.isInitialized) {
      logger.warn('Queue not available - cannot schedule notification');
      throw new Error('Queue service not available');
    }

    const delay = scheduledAt.getTime() - Date.now();

    if (delay <= 0) {
      // If scheduled time is in the past, send immediately
      return this.queueNotification(notification);
    }

    const job = await this.notificationQueue.add('scheduled', {
      ...notification,
      scheduledAt,
    }, {
      delay,
    });

    logger.info('Notification scheduled', {
      jobId: job.id,
      scheduledAt,
      delay,
    });

    return { jobId: job.id.toString() };
  }

  async queueRetry(
    notificationId: string,
    tenantId: string,
    channel: string,
    delay: number = 30000
  ): Promise<{ jobId: string }> {
    if (!this.retryQueue || !this.isInitialized) {
      logger.warn('Queue not available - cannot queue retry');
      throw new Error('Queue service not available');
    }

    const job = await this.retryQueue.add({
      notificationId,
      tenantId,
      channel,
      attempts: 1,
    }, {
      delay,
    });

    return { jobId: job.id.toString() };
  }

  async getQueueStats(): Promise<{
    notifications: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
    };
    retry: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
    };
  } | null> {
    if (!this.notificationQueue || !this.retryQueue) {
      return null;
    }

    const [notificationStats, retryStats] = await Promise.all([
      this.notificationQueue.getJobCounts(),
      this.retryQueue.getJobCounts(),
    ]);

    return {
      notifications: notificationStats,
      retry: retryStats,
    };
  }

  async pauseQueue(queueName: 'notifications' | 'retry'): Promise<void> {
    const queue = queueName === 'notifications' ? this.notificationQueue : this.retryQueue;
    if (queue) {
      await queue.pause();
      logger.info(`Queue ${queueName} paused`);
    }
  }

  async resumeQueue(queueName: 'notifications' | 'retry'): Promise<void> {
    const queue = queueName === 'notifications' ? this.notificationQueue : this.retryQueue;
    if (queue) {
      await queue.resume();
      logger.info(`Queue ${queueName} resumed`);
    }
  }

  async clearQueue(queueName: 'notifications' | 'retry'): Promise<void> {
    const queue = queueName === 'notifications' ? this.notificationQueue : this.retryQueue;
    if (queue) {
      await queue.empty();
      logger.info(`Queue ${queueName} cleared`);
    }
  }

  async close(): Promise<void> {
    const closePromises: Promise<void>[] = [];

    if (this.notificationQueue) {
      closePromises.push(this.notificationQueue.close());
    }
    if (this.retryQueue) {
      closePromises.push(this.retryQueue.close());
    }

    await Promise.all(closePromises);
    logger.info('Queue service closed');
  }

  // Bulk operations
  async queueBulkNotifications(
    notifications: NotificationJob[]
  ): Promise<{ jobIds: string[] }> {
    if (!this.notificationQueue || !this.isInitialized) {
      // Fallback to direct processing
      for (const notification of notifications) {
        await this.notificationService.create({
          tenantId: notification.tenantId,
          userId: notification.userId,
          locationId: notification.locationId,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          channels: notification.channels,
          priority: notification.priority,
          data: notification.data,
        });
      }
      return { jobIds: notifications.map(() => 'direct') };
    }

    const jobs = notifications.map((notification) => ({
      name: 'send',
      data: notification,
      opts: {
        priority: notification.priority === 'urgent' ? 1 :
                 notification.priority === 'high' ? 2 :
                 notification.priority === 'low' ? 4 : 3,
      },
    }));

    const results = await this.notificationQueue.addBulk(jobs);

    return { jobIds: results.map((job) => job.id.toString()) };
  }

  isReady(): boolean {
    return this.isInitialized;
  }
}
