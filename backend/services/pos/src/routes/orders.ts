// Order management routes

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

import {
  logger,
  authenticate,
  extractTenant,
  requireRole,
  requirePermissions,
  validationMiddleware,
  createResponse,
  createErrorResponse,
  UserRoles,
  Permissions,
} from '@properpos/backend-shared';

import { OrderService } from '../services/OrderService';
import { PaymentService } from '../services/PaymentService';

export const orderRoutes = Router();

// Initialize services
const orderService = new OrderService();
const paymentService = new PaymentService();

/**
 * @swagger
 * /api/v1/orders:
 *   get:
 *     tags: [Orders]
 *     summary: Get orders for location
 *     security:
 *       - BearerAuth: []
 *       - TenantHeader: []
 */
orderRoutes.get('/',
  authenticate,
  extractTenant,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const {
      page = 1,
      limit = 20,
      locationId,
      status,
      startDate,
      endDate,
      customerId,
      orderNumber,
      minTotal,
      maxTotal
    } = req.query;

    try {
      // Validate location access
      const locationAccess = await orderService.validateLocationAccess(
        tenantId,
        locationId as string,
        user.id
      );

      if (!locationAccess.allowed) {
        res.status(403).json(createErrorResponse(
          locationAccess.message || 'Access denied to location',
          'LOCATION_ACCESS_DENIED'
        ));
        return;
      }

      const filters: any = {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
      };

      if (locationId) filters.locationId = locationId as string;
      if (status) filters.status = status as string;
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);
      if (customerId) filters.customerId = customerId as string;
      if (orderNumber) filters.orderNumber = orderNumber as string;
      if (minTotal) filters.minTotal = parseFloat(minTotal as string);
      if (maxTotal) filters.maxTotal = parseFloat(maxTotal as string);

      const orders = await orderService.getOrders(tenantId, filters);

      res.json(createResponse(orders, 'Orders retrieved successfully'));

    } catch (error) {
      logger.error('Get orders error', {
        tenantId,
        userId: user.id,
        filters: { locationId, status, startDate, endDate },
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/orders/{orderId}:
 *   get:
 *     tags: [Orders]
 *     summary: Get order by ID
 */
orderRoutes.get('/:orderId',
  authenticate,
  extractTenant,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { orderId } = req.params;

    try {
      const order = await orderService.getOrderById(tenantId, orderId);

      if (!order) {
        res.status(404).json(createErrorResponse('Order not found', 'ORDER_NOT_FOUND'));
        return;
      }

      // Validate location access
      const locationAccess = await orderService.validateLocationAccess(
        tenantId,
        order.locationId,
        user.id
      );

      if (!locationAccess.allowed) {
        res.status(403).json(createErrorResponse(
          'Access denied to this order',
          'ORDER_ACCESS_DENIED'
        ));
        return;
      }

      res.json(createResponse(order, 'Order retrieved successfully'));

    } catch (error) {
      logger.error('Get order by ID error', {
        tenantId,
        orderId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/orders:
 *   post:
 *     tags: [Orders]
 *     summary: Create new order
 */
orderRoutes.post('/',
  authenticate,
  extractTenant,
  requirePermissions([Permissions.ORDER_CREATE]),
  validationMiddleware.createOrder,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const orderData = req.body;

    try {
      // Validate location access
      const locationAccess = await orderService.validateLocationAccess(
        tenantId,
        orderData.locationId,
        user.id
      );

      if (!locationAccess.allowed) {
        res.status(403).json(createErrorResponse(
          locationAccess.message || 'Access denied to location',
          'LOCATION_ACCESS_DENIED'
        ));
        return;
      }

      const order = await orderService.createOrder(tenantId, {
        ...orderData,
        createdBy: user.id,
        cashierId: user.id,
      });

      logger.audit('Order created', {
        tenantId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        locationId: order.locationId,
        total: order.total,
        createdBy: user.id,
        ip: req.ip,
      });

      res.status(201).json(createResponse(order, 'Order created successfully'));

    } catch (error) {
      logger.error('Create order error', {
        tenantId,
        userId: user.id,
        orderData,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/orders/{orderId}/status:
 *   put:
 *     tags: [Orders]
 *     summary: Update order status
 */
orderRoutes.put('/:orderId/status',
  authenticate,
  extractTenant,
  requirePermissions([Permissions.ORDER_UPDATE]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { orderId } = req.params;
    const { status, note } = req.body;

    const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      res.status(400).json(createErrorResponse(
        'Invalid order status',
        'INVALID_ORDER_STATUS'
      ));
      return;
    }

    try {
      const order = await orderService.getOrderById(tenantId, orderId);

      if (!order) {
        res.status(404).json(createErrorResponse('Order not found', 'ORDER_NOT_FOUND'));
        return;
      }

      // Validate location access
      const locationAccess = await orderService.validateLocationAccess(
        tenantId,
        order.locationId,
        user.id
      );

      if (!locationAccess.allowed) {
        res.status(403).json(createErrorResponse(
          'Access denied to this order',
          'ORDER_ACCESS_DENIED'
        ));
        return;
      }

      await orderService.updateOrderStatus(tenantId, orderId, {
        status,
        note,
        updatedBy: user.id,
      });

      logger.audit('Order status updated', {
        tenantId,
        orderId,
        previousStatus: order.status,
        newStatus: status,
        updatedBy: user.id,
        ip: req.ip,
      });

      res.json(createResponse({}, 'Order status updated successfully'));

    } catch (error) {
      logger.error('Update order status error', {
        tenantId,
        orderId,
        status,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/orders/{orderId}/items:
 *   put:
 *     tags: [Orders]
 *     summary: Update order items
 */
orderRoutes.put('/:orderId/items',
  authenticate,
  extractTenant,
  requirePermissions([Permissions.ORDER_UPDATE]),
  validationMiddleware.updateOrderItems,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { orderId } = req.params;
    const { items } = req.body;

    try {
      const order = await orderService.getOrderById(tenantId, orderId);

      if (!order) {
        res.status(404).json(createErrorResponse('Order not found', 'ORDER_NOT_FOUND'));
        return;
      }

      // Check if order can be modified
      if (!['pending', 'confirmed'].includes(order.status)) {
        res.status(400).json(createErrorResponse(
          'Order cannot be modified in current status',
          'ORDER_NOT_MODIFIABLE'
        ));
        return;
      }

      // Validate location access
      const locationAccess = await orderService.validateLocationAccess(
        tenantId,
        order.locationId,
        user.id
      );

      if (!locationAccess.allowed) {
        res.status(403).json(createErrorResponse(
          'Access denied to this order',
          'ORDER_ACCESS_DENIED'
        ));
        return;
      }

      const updatedOrder = await orderService.updateOrderItems(tenantId, orderId, {
        items,
        updatedBy: user.id,
      });

      logger.audit('Order items updated', {
        tenantId,
        orderId,
        itemCount: items.length,
        newTotal: updatedOrder.total,
        updatedBy: user.id,
        ip: req.ip,
      });

      res.json(createResponse(updatedOrder, 'Order items updated successfully'));

    } catch (error) {
      logger.error('Update order items error', {
        tenantId,
        orderId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/orders/{orderId}/payment:
 *   post:
 *     tags: [Orders]
 *     summary: Process payment for order
 */
orderRoutes.post('/:orderId/payment',
  authenticate,
  extractTenant,
  requirePermissions([Permissions.ORDER_UPDATE]),
  validationMiddleware.processPayment,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { orderId } = req.params;
    const paymentData = req.body;

    try {
      const order = await orderService.getOrderById(tenantId, orderId);

      if (!order) {
        res.status(404).json(createErrorResponse('Order not found', 'ORDER_NOT_FOUND'));
        return;
      }

      // Validate location access
      const locationAccess = await orderService.validateLocationAccess(
        tenantId,
        order.locationId,
        user.id
      );

      if (!locationAccess.allowed) {
        res.status(403).json(createErrorResponse(
          'Access denied to this order',
          'ORDER_ACCESS_DENIED'
        ));
        return;
      }

      // Check if order can accept payment
      if (order.paymentStatus === 'paid') {
        res.status(400).json(createErrorResponse(
          'Order is already paid',
          'ORDER_ALREADY_PAID'
        ));
        return;
      }

      const paymentResult = await paymentService.processPayment(tenantId, {
        orderId,
        ...paymentData,
        processedBy: user.id,
      });

      logger.audit('Order payment processed', {
        tenantId,
        orderId,
        paymentMethod: paymentData.method,
        amount: paymentData.amount,
        processedBy: user.id,
        paymentId: paymentResult.paymentId,
        ip: req.ip,
      });

      res.json(createResponse(paymentResult, 'Payment processed successfully'));

    } catch (error) {
      logger.error('Process payment error', {
        tenantId,
        orderId,
        paymentData,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/orders/{orderId}/refund:
 *   post:
 *     tags: [Orders]
 *     summary: Process refund for order
 */
orderRoutes.post('/:orderId/refund',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  requirePermissions([Permissions.ORDER_REFUND]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { orderId } = req.params;
    const { amount, reason, items } = req.body;

    try {
      const order = await orderService.getOrderById(tenantId, orderId);

      if (!order) {
        res.status(404).json(createErrorResponse('Order not found', 'ORDER_NOT_FOUND'));
        return;
      }

      // Validate location access
      const locationAccess = await orderService.validateLocationAccess(
        tenantId,
        order.locationId,
        user.id
      );

      if (!locationAccess.allowed) {
        res.status(403).json(createErrorResponse(
          'Access denied to this order',
          'ORDER_ACCESS_DENIED'
        ));
        return;
      }

      const refundResult = await paymentService.processRefund(tenantId, {
        orderId,
        amount,
        reason,
        items,
        processedBy: user.id,
      });

      logger.audit('Order refund processed', {
        tenantId,
        orderId,
        refundAmount: amount,
        reason,
        processedBy: user.id,
        refundId: refundResult.refundId,
        ip: req.ip,
      });

      res.json(createResponse(refundResult, 'Refund processed successfully'));

    } catch (error) {
      logger.error('Process refund error', {
        tenantId,
        orderId,
        amount,
        reason,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/orders/{orderId}/cancel:
 *   post:
 *     tags: [Orders]
 *     summary: Cancel order
 */
orderRoutes.post('/:orderId/cancel',
  authenticate,
  extractTenant,
  requirePermissions([Permissions.ORDER_UPDATE]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { orderId } = req.params;
    const { reason } = req.body;

    try {
      const order = await orderService.getOrderById(tenantId, orderId);

      if (!order) {
        res.status(404).json(createErrorResponse('Order not found', 'ORDER_NOT_FOUND'));
        return;
      }

      // Validate location access
      const locationAccess = await orderService.validateLocationAccess(
        tenantId,
        order.locationId,
        user.id
      );

      if (!locationAccess.allowed) {
        res.status(403).json(createErrorResponse(
          'Access denied to this order',
          'ORDER_ACCESS_DENIED'
        ));
        return;
      }

      await orderService.cancelOrder(tenantId, orderId, {
        reason,
        cancelledBy: user.id,
      });

      logger.audit('Order cancelled', {
        tenantId,
        orderId,
        reason,
        cancelledBy: user.id,
        ip: req.ip,
      });

      res.json(createResponse({}, 'Order cancelled successfully'));

    } catch (error) {
      logger.error('Cancel order error', {
        tenantId,
        orderId,
        reason,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/orders/stats:
 *   get:
 *     tags: [Orders]
 *     summary: Get order statistics
 */
orderRoutes.get('/stats',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { locationId, period = 'today' } = req.query;

    try {
      // Validate location access if specific location requested
      if (locationId) {
        const locationAccess = await orderService.validateLocationAccess(
          tenantId,
          locationId as string,
          user.id
        );

        if (!locationAccess.allowed) {
          res.status(403).json(createErrorResponse(
            locationAccess.message || 'Access denied to location',
            'LOCATION_ACCESS_DENIED'
          ));
          return;
        }
      }

      const stats = await orderService.getOrderStats(tenantId, {
        locationId: locationId as string,
        period: period as string,
        userId: user.id, // For location filtering based on user access
      });

      res.json(createResponse(stats, 'Order statistics retrieved'));

    } catch (error) {
      logger.error('Get order stats error', {
        tenantId,
        locationId,
        period,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/orders/bulk-status:
 *   post:
 *     tags: [Orders]
 *     summary: Bulk update order status
 */
orderRoutes.post('/bulk-status',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  requirePermissions([Permissions.ORDER_UPDATE]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { orderIds, status } = req.body;

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      res.status(400).json(createErrorResponse('Order IDs array is required', 'INVALID_ORDER_IDS'));
      return;
    }

    if (orderIds.length > 100) {
      res.status(400).json(createErrorResponse('Maximum 100 orders can be updated at once', 'TOO_MANY_ORDERS'));
      return;
    }

    if (!status) {
      res.status(400).json(createErrorResponse('Status is required', 'STATUS_REQUIRED'));
      return;
    }

    try {
      const result = await orderService.bulkUpdateStatus(tenantId, orderIds, status, {
        updatedBy: user.id,
      });

      logger.audit('Orders bulk status updated', {
        tenantId,
        orderIds,
        newStatus: status,
        modifiedCount: result.modifiedCount,
        updatedBy: user.id,
        ip: req.ip,
      });

      res.json(createResponse(result, 'Orders status updated successfully'));

    } catch (error) {
      logger.error('Bulk update order status error', {
        tenantId,
        orderIds,
        status,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/orders/bulk-cancel:
 *   post:
 *     tags: [Orders]
 *     summary: Bulk cancel orders
 */
orderRoutes.post('/bulk-cancel',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  requirePermissions([Permissions.ORDER_UPDATE]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { orderIds, reason } = req.body;

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      res.status(400).json(createErrorResponse('Order IDs array is required', 'INVALID_ORDER_IDS'));
      return;
    }

    if (orderIds.length > 100) {
      res.status(400).json(createErrorResponse('Maximum 100 orders can be cancelled at once', 'TOO_MANY_ORDERS'));
      return;
    }

    try {
      const result = await orderService.bulkCancel(tenantId, orderIds, {
        reason,
        cancelledBy: user.id,
      });

      logger.audit('Orders bulk cancelled', {
        tenantId,
        orderIds,
        reason,
        modifiedCount: result.modifiedCount,
        cancelledBy: user.id,
        ip: req.ip,
      });

      res.json(createResponse(result, 'Orders cancelled successfully'));

    } catch (error) {
      logger.error('Bulk cancel orders error', {
        tenantId,
        orderIds,
        reason,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/orders/bulk-export:
 *   post:
 *     tags: [Orders]
 *     summary: Bulk export orders as CSV
 */
orderRoutes.post('/bulk-export',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { orderIds } = req.body;

    try {
      const csv = await orderService.bulkExportOrders(tenantId, orderIds);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="orders-export.csv"');
      res.send(csv);

    } catch (error) {
      logger.error('Bulk export orders error', {
        tenantId,
        orderIds,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);