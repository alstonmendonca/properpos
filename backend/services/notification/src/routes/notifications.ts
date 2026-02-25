// Notification routes

import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import {
  logger,
  createResponse,
  createPaginatedResponse,
  createErrorResponse,
  authenticate,
  extractTenant,
} from '@properpos/backend-shared';
import { NotificationService } from '../services/NotificationService';

export const notificationRoutes = Router();
const notificationService = new NotificationService();

// Validation middleware
const validate = (req: Request, res: Response, next: Function): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json(createErrorResponse(
      'Validation failed',
      'VALIDATION_ERROR',
      errors.array()
    ));
    return;
  }
  next();
};

// Create/Send notification
notificationRoutes.post('/',
  authenticate,
  extractTenant,
  [
    body('type').isString().notEmpty().withMessage('Notification type is required'),
    body('title').isString().notEmpty().withMessage('Title is required'),
    body('message').isString().notEmpty().withMessage('Message is required'),
    body('channels').optional().isArray().withMessage('Channels must be an array'),
    body('channels.*').optional().isIn(['email', 'sms', 'push', 'in_app', 'webhook']),
    body('userId').optional().isString(),
    body('locationId').optional().isString(),
    body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
    body('data').optional().isObject(),
    body('scheduledAt').optional().isISO8601(),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const createdBy = (req as any).user?.id;

      const notification = await notificationService.create({
        tenantId,
        ...req.body,
        createdBy,
      });

      logger.info('Notification created', {
        tenantId,
        notificationId: notification.id,
        type: notification.type,
        channels: req.body.channels,
      });

      res.status(201).json(createResponse(notification, 'Notification created successfully'));
    } catch (error) {
      logger.error('Error creating notification', { error });
      throw error;
    }
  }
);

// Send bulk notifications
notificationRoutes.post('/bulk',
  authenticate,
  extractTenant,
  [
    body('notifications').isArray({ min: 1, max: 100 }).withMessage('Notifications array required (1-100 items)'),
    body('notifications.*.type').isString().notEmpty(),
    body('notifications.*.title').isString().notEmpty(),
    body('notifications.*.message').isString().notEmpty(),
    body('notifications.*.userId').optional().isString(),
    body('notifications.*.channels').optional().isArray(),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const createdBy = (req as any).user?.id;

      const results = await notificationService.createBulk(
        req.body.notifications.map((n: any) => ({
          tenantId,
          ...n,
          createdBy,
        }))
      );

      logger.info('Bulk notifications created', {
        tenantId,
        count: results.length,
      });

      res.status(201).json(createResponse(results, `${results.length} notifications created`));
    } catch (error) {
      logger.error('Error creating bulk notifications', { error });
      throw error;
    }
  }
);

// List notifications for user
notificationRoutes.get('/',
  authenticate,
  extractTenant,
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('type').optional().isString(),
    query('read').optional().isBoolean().toBoolean(),
    query('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
    query('from').optional().isISO8601(),
    query('to').optional().isISO8601(),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const userId = (req as any).user?.id;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const filters: any = {
        tenantId,
        userId,
      };

      if (req.query.type) filters.type = req.query.type;
      if (req.query.read !== undefined) filters.read = req.query.read;
      if (req.query.priority) filters.priority = req.query.priority;
      if (req.query.from) filters.from = new Date(req.query.from as string);
      if (req.query.to) filters.to = new Date(req.query.to as string);

      const { notifications, total } = await notificationService.list(filters, page, limit);

      res.json(createPaginatedResponse(
        notifications,
        page,
        limit,
        total,
        'Notifications retrieved successfully'
      ));
    } catch (error) {
      logger.error('Error listing notifications', { error });
      throw error;
    }
  }
);

// Get unread count
notificationRoutes.get('/unread-count',
  authenticate,
  extractTenant,
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const userId = (req as any).user?.id;

      const count = await notificationService.getUnreadCount(tenantId, userId);

      res.json(createResponse({ count }, 'Unread count retrieved'));
    } catch (error) {
      logger.error('Error getting unread count', { error });
      throw error;
    }
  }
);

// Get notification by ID
notificationRoutes.get('/:id',
  authenticate,
  extractTenant,
  [
    param('id').isString().notEmpty(),
  ],
  validate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const userId = (req as any).user?.id;

      const notification = await notificationService.getById(
        req.params.id,
        tenantId,
        userId
      );

      if (!notification) {
        res.status(404).json(createErrorResponse(
          'Notification not found',
          'NOT_FOUND'
        ));
        return;
      }

      res.json(createResponse(notification, 'Notification retrieved'));
    } catch (error) {
      logger.error('Error getting notification', { error });
      throw error;
    }
  }
);

// Mark notification as read
notificationRoutes.post('/:id/read',
  authenticate,
  extractTenant,
  [
    param('id').isString().notEmpty(),
  ],
  validate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const userId = (req as any).user?.id;

      const notification = await notificationService.markAsRead(
        req.params.id,
        tenantId,
        userId
      );

      if (!notification) {
        res.status(404).json(createErrorResponse(
          'Notification not found',
          'NOT_FOUND'
        ));
        return;
      }

      logger.info('Notification marked as read', {
        tenantId,
        notificationId: req.params.id,
        userId,
      });

      res.json(createResponse(notification, 'Notification marked as read'));
    } catch (error) {
      logger.error('Error marking notification as read', { error });
      throw error;
    }
  }
);

// Mark all notifications as read
notificationRoutes.post('/read-all',
  authenticate,
  extractTenant,
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const userId = (req as any).user?.id;

      const count = await notificationService.markAllAsRead(tenantId, userId);

      logger.info('All notifications marked as read', {
        tenantId,
        userId,
        count,
      });

      res.json(createResponse({ count }, `${count} notifications marked as read`));
    } catch (error) {
      logger.error('Error marking all notifications as read', { error });
      throw error;
    }
  }
);

// Delete notification
notificationRoutes.delete('/:id',
  authenticate,
  extractTenant,
  [
    param('id').isString().notEmpty(),
  ],
  validate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const userId = (req as any).user?.id;

      const deleted = await notificationService.delete(
        req.params.id,
        tenantId,
        userId
      );

      if (!deleted) {
        res.status(404).json(createErrorResponse(
          'Notification not found',
          'NOT_FOUND'
        ));
        return;
      }

      logger.info('Notification deleted', {
        tenantId,
        notificationId: req.params.id,
        userId,
      });

      res.json(createResponse({ deleted: true }, 'Notification deleted'));
    } catch (error) {
      logger.error('Error deleting notification', { error });
      throw error;
    }
  }
);

// Delete all read notifications
notificationRoutes.delete('/read/all',
  authenticate,
  extractTenant,
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const userId = (req as any).user?.id;

      const count = await notificationService.deleteAllRead(tenantId, userId);

      logger.info('All read notifications deleted', {
        tenantId,
        userId,
        count,
      });

      res.json(createResponse({ count }, `${count} notifications deleted`));
    } catch (error) {
      logger.error('Error deleting read notifications', { error });
      throw error;
    }
  }
);

// Resend notification
notificationRoutes.post('/:id/resend',
  authenticate,
  extractTenant,
  [
    param('id').isString().notEmpty(),
    body('channels').optional().isArray(),
    body('channels.*').optional().isIn(['email', 'sms', 'push', 'in_app', 'webhook']),
  ],
  validate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const userId = (req as any).user?.id;

      const notification = await notificationService.resend(
        req.params.id,
        tenantId,
        req.body.channels
      );

      if (!notification) {
        res.status(404).json(createErrorResponse(
          'Notification not found',
          'NOT_FOUND'
        ));
        return;
      }

      logger.info('Notification resent', {
        tenantId,
        notificationId: req.params.id,
        channels: req.body.channels,
      });

      res.json(createResponse(notification, 'Notification resent'));
    } catch (error) {
      logger.error('Error resending notification', { error });
      throw error;
    }
  }
);
