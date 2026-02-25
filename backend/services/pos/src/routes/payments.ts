// Payment management routes

import { Router, Request, Response } from 'express';

import {
  logger,
  authenticate,
  extractTenant,
  requirePermissions,
  validationMiddleware,
  createResponse,
  createErrorResponse,
  Permissions,
} from '@properpos/backend-shared';

import { PaymentService } from '../services/PaymentService';

export const paymentRoutes = Router();

// Initialize service
const paymentService = new PaymentService();

/**
 * @swagger
 * /api/v1/payments/process:
 *   post:
 *     tags: [Payments]
 *     summary: Process payment for an order
 *     security:
 *       - BearerAuth: []
 *       - TenantHeader: []
 */
paymentRoutes.post('/process',
  authenticate,
  extractTenant,
  validationMiddleware.processPayment,
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;

    try {
      const result = await paymentService.processPayment(tenantId, {
        ...req.body,
        processedBy: user.id,
      });

      res.status(200).json(createResponse(result, 'Payment processed successfully'));

    } catch (error: any) {
      logger.error('Payment processing failed', { error: error.message, tenantId });
      res.status(error.status || 500).json(createErrorResponse(
        error.message || 'Payment processing failed',
        error.code || 'PAYMENT_ERROR'
      ));
    }
  }
);

/**
 * @swagger
 * /api/v1/payments/refund:
 *   post:
 *     tags: [Payments]
 *     summary: Process refund for an order
 *     security:
 *       - BearerAuth: []
 *       - TenantHeader: []
 */
paymentRoutes.post('/refund',
  authenticate,
  extractTenant,
  requirePermissions(Permissions.ORDER_REFUND),
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;

    try {
      const result = await paymentService.processRefund(tenantId, {
        ...req.body,
        processedBy: user.id,
      });

      res.status(200).json(createResponse(result, 'Refund processed successfully'));

    } catch (error: any) {
      logger.error('Refund processing failed', { error: error.message, tenantId });
      res.status(error.status || 500).json(createErrorResponse(
        error.message || 'Refund processing failed',
        error.code || 'REFUND_ERROR'
      ));
    }
  }
);

/**
 * @swagger
 * /api/v1/payments/order/{orderId}:
 *   get:
 *     tags: [Payments]
 *     summary: Get payment history for an order
 *     security:
 *       - BearerAuth: []
 *       - TenantHeader: []
 */
paymentRoutes.get('/order/:orderId',
  authenticate,
  extractTenant,
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.id;
    const { orderId } = req.params;

    try {
      const result = await paymentService.getOrderPayments(tenantId, orderId);

      res.status(200).json(createResponse(result, 'Payment history retrieved successfully'));

    } catch (error: any) {
      logger.error('Failed to get payment history', { error: error.message, tenantId, orderId });
      res.status(error.status || 500).json(createErrorResponse(
        error.message || 'Failed to retrieve payment history',
        error.code || 'PAYMENT_HISTORY_ERROR'
      ));
    }
  }
);
