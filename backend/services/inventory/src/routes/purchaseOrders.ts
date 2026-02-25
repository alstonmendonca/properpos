// Purchase order management routes

import { Router, Request, Response } from 'express';

import {
  logger,
  authenticate,
  extractTenant,
  requireRole,
  validationMiddleware,
  createResponse,
  createErrorResponse,
  UserRoles,
} from '@properpos/backend-shared';

import { PurchaseOrderService } from '../services/PurchaseOrderService';

export const purchaseOrderRoutes = Router();

// Initialize services
const purchaseOrderService = new PurchaseOrderService();

/**
 * @swagger
 * /api/v1/purchase-orders:
 *   get:
 *     tags: [Purchase Orders]
 *     summary: Get purchase orders with filtering and pagination
 *     security:
 *       - BearerAuth: []
 *       - TenantHeader: []
 */
purchaseOrderRoutes.get('/',
  authenticate,
  extractTenant,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const {
      page = 1,
      limit = 20,
      status,
      supplierId,
      locationId,
      startDate,
      endDate,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const filters = {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      status: status as string,
      supplierId: supplierId as string,
      locationId: locationId as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      search: search as string,
      sortBy: sortBy as string,
      sortOrder: sortOrder as 'asc' | 'desc',
    };

    try {
      const orders = await purchaseOrderService.getPurchaseOrders(tenantId, filters);

      res.json(createResponse(orders, 'Purchase orders retrieved successfully'));

    } catch (error) {
      logger.error('Get purchase orders error', {
        tenantId,
        userId: user.id,
        filters,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/purchase-orders/{orderId}:
 *   get:
 *     tags: [Purchase Orders]
 *     summary: Get purchase order by ID
 */
purchaseOrderRoutes.get('/:orderId',
  authenticate,
  extractTenant,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { orderId } = req.params;

    try {
      const order = await purchaseOrderService.getPurchaseOrderById(tenantId, orderId);

      if (!order) {
        res.status(404).json(createErrorResponse('Purchase order not found', 'PURCHASE_ORDER_NOT_FOUND'));
        return;
      }

      res.json(createResponse(order, 'Purchase order retrieved successfully'));

    } catch (error) {
      logger.error('Get purchase order by ID error', {
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
 * /api/v1/purchase-orders:
 *   post:
 *     tags: [Purchase Orders]
 *     summary: Create new purchase order
 */
purchaseOrderRoutes.post('/',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  validationMiddleware.createPurchaseOrder,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const orderData = req.body;

    try {
      const order = await purchaseOrderService.createPurchaseOrder(tenantId, {
        ...orderData,
        createdBy: user.id,
      });

      logger.audit('Purchase order created', {
        tenantId,
        orderId: order.id,
        supplierId: order.supplierId,
        totalAmount: order.totalAmount,
        createdBy: user.id,
        ip: req.ip,
      });

      res.status(201).json(createResponse(order, 'Purchase order created successfully'));

    } catch (error) {
      logger.error('Create purchase order error', {
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
 * /api/v1/purchase-orders/{orderId}:
 *   put:
 *     tags: [Purchase Orders]
 *     summary: Update purchase order
 */
purchaseOrderRoutes.put('/:orderId',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  validationMiddleware.updatePurchaseOrder,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { orderId } = req.params;
    const updates = req.body;

    try {
      const order = await purchaseOrderService.getPurchaseOrderById(tenantId, orderId);

      if (!order) {
        res.status(404).json(createErrorResponse('Purchase order not found', 'PURCHASE_ORDER_NOT_FOUND'));
        return;
      }

      // Check if order can be updated
      if (!['draft', 'pending'].includes(order.status)) {
        res.status(400).json(createErrorResponse(
          'Purchase order cannot be updated in current status',
          'PURCHASE_ORDER_NOT_UPDATABLE'
        ));
        return;
      }

      await purchaseOrderService.updatePurchaseOrder(tenantId, orderId, {
        ...updates,
        updatedBy: user.id,
      });

      logger.audit('Purchase order updated', {
        tenantId,
        orderId,
        updatedBy: user.id,
        updatedFields: Object.keys(updates),
        ip: req.ip,
      });

      res.json(createResponse({}, 'Purchase order updated successfully'));

    } catch (error) {
      logger.error('Update purchase order error', {
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
 * /api/v1/purchase-orders/{orderId}/status:
 *   put:
 *     tags: [Purchase Orders]
 *     summary: Update purchase order status
 */
purchaseOrderRoutes.put('/:orderId/status',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { orderId } = req.params;
    const { status, notes } = req.body;

    const validStatuses = ['draft', 'pending', 'approved', 'ordered', 'partially_received', 'received', 'cancelled'];
    if (!validStatuses.includes(status)) {
      res.status(400).json(createErrorResponse(
        'Invalid purchase order status',
        'INVALID_PURCHASE_ORDER_STATUS'
      ));
      return;
    }

    try {
      const order = await purchaseOrderService.getPurchaseOrderById(tenantId, orderId);

      if (!order) {
        res.status(404).json(createErrorResponse('Purchase order not found', 'PURCHASE_ORDER_NOT_FOUND'));
        return;
      }

      await purchaseOrderService.updatePurchaseOrderStatus(tenantId, orderId, {
        status,
        notes,
        updatedBy: user.id,
      });

      logger.audit('Purchase order status updated', {
        tenantId,
        orderId,
        previousStatus: order.status,
        newStatus: status,
        updatedBy: user.id,
        ip: req.ip,
      });

      res.json(createResponse({}, 'Purchase order status updated successfully'));

    } catch (error) {
      logger.error('Update purchase order status error', {
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
 * /api/v1/purchase-orders/{orderId}/receive:
 *   post:
 *     tags: [Purchase Orders]
 *     summary: Receive purchase order (full or partial)
 */
purchaseOrderRoutes.post('/:orderId/receive',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  validationMiddleware.receivePurchaseOrder,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { orderId } = req.params;
    const receiptData = req.body;

    try {
      const order = await purchaseOrderService.getPurchaseOrderById(tenantId, orderId);

      if (!order) {
        res.status(404).json(createErrorResponse('Purchase order not found', 'PURCHASE_ORDER_NOT_FOUND'));
        return;
      }

      // Check if order can be received
      if (!['approved', 'ordered', 'partially_received'].includes(order.status)) {
        res.status(400).json(createErrorResponse(
          'Purchase order cannot be received in current status',
          'PURCHASE_ORDER_NOT_RECEIVABLE'
        ));
        return;
      }

      const receipt = await purchaseOrderService.receivePurchaseOrder(tenantId, orderId, {
        ...receiptData,
        receivedBy: user.id,
      });

      logger.audit('Purchase order received', {
        tenantId,
        orderId,
        receiptId: receipt.id,
        totalReceived: receipt.totalReceived,
        receivedBy: user.id,
        ip: req.ip,
      });

      res.status(201).json(createResponse(receipt, 'Purchase order received successfully'));

    } catch (error) {
      logger.error('Receive purchase order error', {
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
 * /api/v1/purchase-orders/{orderId}/cancel:
 *   post:
 *     tags: [Purchase Orders]
 *     summary: Cancel purchase order
 */
purchaseOrderRoutes.post('/:orderId/cancel',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { orderId } = req.params;
    const { reason } = req.body;

    try {
      const order = await purchaseOrderService.getPurchaseOrderById(tenantId, orderId);

      if (!order) {
        res.status(404).json(createErrorResponse('Purchase order not found', 'PURCHASE_ORDER_NOT_FOUND'));
        return;
      }

      // Check if order can be cancelled
      if (['received', 'cancelled'].includes(order.status)) {
        res.status(400).json(createErrorResponse(
          'Purchase order cannot be cancelled in current status',
          'PURCHASE_ORDER_NOT_CANCELLABLE'
        ));
        return;
      }

      await purchaseOrderService.cancelPurchaseOrder(tenantId, orderId, {
        reason,
        cancelledBy: user.id,
      });

      logger.audit('Purchase order cancelled', {
        tenantId,
        orderId,
        reason,
        cancelledBy: user.id,
        ip: req.ip,
      });

      res.json(createResponse({}, 'Purchase order cancelled successfully'));

    } catch (error) {
      logger.error('Cancel purchase order error', {
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
 * /api/v1/purchase-orders/{orderId}/receipts:
 *   get:
 *     tags: [Purchase Orders]
 *     summary: Get purchase order receipt history
 */
purchaseOrderRoutes.get('/:orderId/receipts',
  authenticate,
  extractTenant,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { orderId } = req.params;

    try {
      const receipts = await purchaseOrderService.getPurchaseOrderReceipts(tenantId, orderId);

      res.json(createResponse(receipts, 'Purchase order receipts retrieved successfully'));

    } catch (error) {
      logger.error('Get purchase order receipts error', {
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
 * /api/v1/purchase-orders/generate-from-reorder:
 *   post:
 *     tags: [Purchase Orders]
 *     summary: Generate purchase orders from reorder points
 */
purchaseOrderRoutes.post('/generate-from-reorder',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { locationId, supplierId, autoApprove = false } = req.body;

    try {
      const orders = await purchaseOrderService.generateFromReorderPoints(tenantId, {
        locationId,
        supplierId,
        autoApprove,
        createdBy: user.id,
      });

      logger.audit('Purchase orders generated from reorder points', {
        tenantId,
        ordersGenerated: orders.length,
        locationId,
        supplierId,
        autoApprove,
        createdBy: user.id,
        ip: req.ip,
      });

      res.status(201).json(createResponse(orders, 'Purchase orders generated successfully'));

    } catch (error) {
      logger.error('Generate purchase orders from reorder error', {
        tenantId,
        locationId,
        supplierId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/purchase-orders/stats:
 *   get:
 *     tags: [Purchase Orders]
 *     summary: Get purchase order statistics
 */
purchaseOrderRoutes.get('/stats',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const {
      locationId,
      supplierId,
      period = 'month',
      startDate,
      endDate
    } = req.query;

    const filters = {
      locationId: locationId as string,
      supplierId: supplierId as string,
      period: period as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    };

    try {
      const stats = await purchaseOrderService.getPurchaseOrderStats(tenantId, filters);

      res.json(createResponse(stats, 'Purchase order statistics retrieved successfully'));

    } catch (error) {
      logger.error('Get purchase order stats error', {
        tenantId,
        userId: user.id,
        filters,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);