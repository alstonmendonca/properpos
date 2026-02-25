// User notification preferences routes

import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import {
  logger,
  createResponse,
  createErrorResponse,
  authenticate,
  extractTenant,
} from '@properpos/backend-shared';
import { PreferencesService } from '../services/PreferencesService';

export const preferencesRoutes = Router();
const preferencesService = new PreferencesService();

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

// Get notification preferences
preferencesRoutes.get('/',
  authenticate,
  extractTenant,
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const userId = (req as any).user?.id;

      const preferences = await preferencesService.getPreferences(tenantId, userId);

      res.json(createResponse(preferences, 'Preferences retrieved'));
    } catch (error) {
      logger.error('Error getting preferences', { error });
      throw error;
    }
  }
);

// Update notification preferences
preferencesRoutes.put('/',
  authenticate,
  extractTenant,
  [
    body('channels').optional().isObject(),
    body('channels.email').optional().isBoolean(),
    body('channels.sms').optional().isBoolean(),
    body('channels.push').optional().isBoolean(),
    body('channels.inApp').optional().isBoolean(),
    body('types').optional().isObject(),
    body('quietHours').optional().isObject(),
    body('quietHours.enabled').optional().isBoolean(),
    body('quietHours.start').optional().matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
    body('quietHours.end').optional().matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
    body('quietHours.timezone').optional().isString(),
    body('frequency').optional().isIn(['realtime', 'hourly', 'daily', 'weekly']),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const userId = (req as any).user?.id;

      const preferences = await preferencesService.updatePreferences(
        tenantId,
        userId,
        req.body
      );

      logger.audit('Notification preferences updated', {
        tenantId,
        userId,
      });

      res.json(createResponse(preferences, 'Preferences updated'));
    } catch (error) {
      logger.error('Error updating preferences', { error });
      throw error;
    }
  }
);

// Update channel preference
preferencesRoutes.patch('/channels/:channel',
  authenticate,
  extractTenant,
  [
    body('enabled').isBoolean().withMessage('Enabled must be a boolean'),
  ],
  validate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const userId = (req as any).user?.id;
      const channel = req.params.channel;

      if (!['email', 'sms', 'push', 'inApp'].includes(channel)) {
        res.status(400).json(createErrorResponse(
          'Invalid channel',
          'INVALID_CHANNEL'
        ));
        return;
      }

      const preferences = await preferencesService.updateChannelPreference(
        tenantId,
        userId,
        channel,
        req.body.enabled
      );

      logger.info('Channel preference updated', {
        tenantId,
        userId,
        channel,
        enabled: req.body.enabled,
      });

      res.json(createResponse(preferences, `${channel} preference updated`));
    } catch (error) {
      logger.error('Error updating channel preference', { error });
      throw error;
    }
  }
);

// Update notification type preference
preferencesRoutes.patch('/types/:type',
  authenticate,
  extractTenant,
  [
    body('enabled').isBoolean().withMessage('Enabled must be a boolean'),
    body('channels').optional().isArray(),
    body('channels.*').optional().isIn(['email', 'sms', 'push', 'inApp']),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const userId = (req as any).user?.id;
      const type = req.params.type;

      const preferences = await preferencesService.updateTypePreference(
        tenantId,
        userId,
        type,
        req.body
      );

      logger.info('Notification type preference updated', {
        tenantId,
        userId,
        type,
        enabled: req.body.enabled,
      });

      res.json(createResponse(preferences, `${type} preference updated`));
    } catch (error) {
      logger.error('Error updating type preference', { error });
      throw error;
    }
  }
);

// Update quiet hours
preferencesRoutes.patch('/quiet-hours',
  authenticate,
  extractTenant,
  [
    body('enabled').isBoolean().withMessage('Enabled must be a boolean'),
    body('start').optional().matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
    body('end').optional().matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
    body('timezone').optional().isString(),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const userId = (req as any).user?.id;

      const preferences = await preferencesService.updateQuietHours(
        tenantId,
        userId,
        req.body
      );

      logger.info('Quiet hours updated', {
        tenantId,
        userId,
        enabled: req.body.enabled,
      });

      res.json(createResponse(preferences, 'Quiet hours updated'));
    } catch (error) {
      logger.error('Error updating quiet hours', { error });
      throw error;
    }
  }
);

// Reset preferences to defaults
preferencesRoutes.post('/reset',
  authenticate,
  extractTenant,
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const userId = (req as any).user?.id;

      const preferences = await preferencesService.resetToDefaults(tenantId, userId);

      logger.info('Preferences reset to defaults', {
        tenantId,
        userId,
      });

      res.json(createResponse(preferences, 'Preferences reset to defaults'));
    } catch (error) {
      logger.error('Error resetting preferences', { error });
      throw error;
    }
  }
);

// Subscribe to push notifications
preferencesRoutes.post('/push/subscribe',
  authenticate,
  extractTenant,
  [
    body('subscription').isObject().withMessage('Subscription object is required'),
    body('subscription.endpoint').isString().notEmpty(),
    body('subscription.keys').isObject(),
    body('subscription.keys.p256dh').isString().notEmpty(),
    body('subscription.keys.auth').isString().notEmpty(),
    body('deviceName').optional().isString(),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const userId = (req as any).user?.id;

      const result = await preferencesService.subscribeToPush(
        tenantId,
        userId,
        req.body.subscription,
        req.body.deviceName
      );

      logger.info('Push subscription added', {
        tenantId,
        userId,
        deviceName: req.body.deviceName,
      });

      res.json(createResponse(result, 'Push subscription added'));
    } catch (error) {
      logger.error('Error subscribing to push', { error });
      throw error;
    }
  }
);

// Unsubscribe from push notifications
preferencesRoutes.post('/push/unsubscribe',
  authenticate,
  extractTenant,
  [
    body('endpoint').isString().notEmpty().withMessage('Endpoint is required'),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const userId = (req as any).user?.id;

      await preferencesService.unsubscribeFromPush(
        tenantId,
        userId,
        req.body.endpoint
      );

      logger.info('Push subscription removed', {
        tenantId,
        userId,
      });

      res.json(createResponse({ unsubscribed: true }, 'Push subscription removed'));
    } catch (error) {
      logger.error('Error unsubscribing from push', { error });
      throw error;
    }
  }
);
