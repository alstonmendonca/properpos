// Webhook routes for external integrations

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
import { WebhookService } from '../services/WebhookService';

export const webhookRoutes = Router();
const webhookService = new WebhookService();

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

// Register webhook endpoint
webhookRoutes.post('/endpoints',
  authenticate,
  extractTenant,
  [
    body('name').isString().notEmpty().withMessage('Name is required'),
    body('url').isURL().withMessage('Valid URL is required'),
    body('events').isArray({ min: 1 }).withMessage('At least one event is required'),
    body('events.*').isString().notEmpty(),
    body('secret').optional().isString(),
    body('headers').optional().isObject(),
    body('isActive').optional().isBoolean(),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const createdBy = (req as any).user?.id;

      const webhook = await webhookService.createEndpoint({
        tenantId,
        ...req.body,
        createdBy,
      });

      logger.audit('Webhook endpoint created', {
        tenantId,
        webhookId: webhook.id,
        url: webhook.url,
        events: webhook.events,
        createdBy,
      });

      res.status(201).json(createResponse(webhook, 'Webhook endpoint created'));
    } catch (error) {
      logger.error('Error creating webhook endpoint', { error });
      throw error;
    }
  }
);

// List webhook endpoints
webhookRoutes.get('/endpoints',
  authenticate,
  extractTenant,
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('isActive').optional().isBoolean().toBoolean(),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const filters: any = { tenantId };
      if (req.query.isActive !== undefined) {
        filters.isActive = req.query.isActive;
      }

      const { endpoints, total } = await webhookService.listEndpoints(filters, page, limit);

      res.json(createPaginatedResponse(
        endpoints,
        page,
        limit,
        total,
        'Webhook endpoints retrieved'
      ));
    } catch (error) {
      logger.error('Error listing webhook endpoints', { error });
      throw error;
    }
  }
);

// Get webhook endpoint by ID
webhookRoutes.get('/endpoints/:id',
  authenticate,
  extractTenant,
  [
    param('id').isString().notEmpty(),
  ],
  validate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;

      const webhook = await webhookService.getEndpointById(req.params.id, tenantId);

      if (!webhook) {
        res.status(404).json(createErrorResponse(
          'Webhook endpoint not found',
          'NOT_FOUND'
        ));
        return;
      }

      res.json(createResponse(webhook, 'Webhook endpoint retrieved'));
    } catch (error) {
      logger.error('Error getting webhook endpoint', { error });
      throw error;
    }
  }
);

// Update webhook endpoint
webhookRoutes.put('/endpoints/:id',
  authenticate,
  extractTenant,
  [
    param('id').isString().notEmpty(),
    body('name').optional().isString().notEmpty(),
    body('url').optional().isURL(),
    body('events').optional().isArray({ min: 1 }),
    body('secret').optional().isString(),
    body('headers').optional().isObject(),
    body('isActive').optional().isBoolean(),
  ],
  validate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const updatedBy = (req as any).user?.id;

      const webhook = await webhookService.updateEndpoint(
        req.params.id,
        tenantId,
        { ...req.body, updatedBy }
      );

      if (!webhook) {
        res.status(404).json(createErrorResponse(
          'Webhook endpoint not found',
          'NOT_FOUND'
        ));
        return;
      }

      logger.audit('Webhook endpoint updated', {
        tenantId,
        webhookId: req.params.id,
        updatedBy,
      });

      res.json(createResponse(webhook, 'Webhook endpoint updated'));
    } catch (error) {
      logger.error('Error updating webhook endpoint', { error });
      throw error;
    }
  }
);

// Delete webhook endpoint
webhookRoutes.delete('/endpoints/:id',
  authenticate,
  extractTenant,
  [
    param('id').isString().notEmpty(),
  ],
  validate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const deletedBy = (req as any).user?.id;

      const deleted = await webhookService.deleteEndpoint(req.params.id, tenantId);

      if (!deleted) {
        res.status(404).json(createErrorResponse(
          'Webhook endpoint not found',
          'NOT_FOUND'
        ));
        return;
      }

      logger.audit('Webhook endpoint deleted', {
        tenantId,
        webhookId: req.params.id,
        deletedBy,
      });

      res.json(createResponse({ deleted: true }, 'Webhook endpoint deleted'));
    } catch (error) {
      logger.error('Error deleting webhook endpoint', { error });
      throw error;
    }
  }
);

// Test webhook endpoint
webhookRoutes.post('/endpoints/:id/test',
  authenticate,
  extractTenant,
  [
    param('id').isString().notEmpty(),
  ],
  validate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;

      const result = await webhookService.testEndpoint(req.params.id, tenantId);

      if (!result) {
        res.status(404).json(createErrorResponse(
          'Webhook endpoint not found',
          'NOT_FOUND'
        ));
        return;
      }

      logger.info('Webhook endpoint tested', {
        tenantId,
        webhookId: req.params.id,
        success: result.success,
      });

      res.json(createResponse(result, result.success ? 'Webhook test successful' : 'Webhook test failed'));
    } catch (error) {
      logger.error('Error testing webhook endpoint', { error });
      throw error;
    }
  }
);

// Get webhook delivery history
webhookRoutes.get('/endpoints/:id/deliveries',
  authenticate,
  extractTenant,
  [
    param('id').isString().notEmpty(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('status').optional().isIn(['pending', 'success', 'failed']),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const filters: any = {
        webhookId: req.params.id,
        tenantId,
      };
      if (req.query.status) filters.status = req.query.status;

      const { deliveries, total } = await webhookService.getDeliveryHistory(filters, page, limit);

      res.json(createPaginatedResponse(
        deliveries,
        page,
        limit,
        total,
        'Webhook deliveries retrieved'
      ));
    } catch (error) {
      logger.error('Error getting webhook deliveries', { error });
      throw error;
    }
  }
);

// Retry failed delivery
webhookRoutes.post('/deliveries/:deliveryId/retry',
  authenticate,
  extractTenant,
  [
    param('deliveryId').isString().notEmpty(),
  ],
  validate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;

      const result = await webhookService.retryDelivery(req.params.deliveryId, tenantId);

      if (!result) {
        res.status(404).json(createErrorResponse(
          'Webhook delivery not found',
          'NOT_FOUND'
        ));
        return;
      }

      logger.info('Webhook delivery retried', {
        tenantId,
        deliveryId: req.params.deliveryId,
      });

      res.json(createResponse(result, 'Webhook delivery retry initiated'));
    } catch (error) {
      logger.error('Error retrying webhook delivery', { error });
      throw error;
    }
  }
);

// Manually trigger webhook event
webhookRoutes.post('/trigger',
  authenticate,
  extractTenant,
  [
    body('event').isString().notEmpty().withMessage('Event type is required'),
    body('payload').isObject().withMessage('Payload is required'),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const triggeredBy = (req as any).user?.id;

      const result = await webhookService.triggerEvent(
        tenantId,
        req.body.event,
        req.body.payload
      );

      logger.info('Webhook event triggered', {
        tenantId,
        event: req.body.event,
        endpointsNotified: result.endpointsNotified,
        triggeredBy,
      });

      res.json(createResponse(result, `Event triggered to ${result.endpointsNotified} endpoints`));
    } catch (error) {
      logger.error('Error triggering webhook event', { error });
      throw error;
    }
  }
);
