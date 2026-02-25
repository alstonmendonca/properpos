// Customer management routes

import { Router, Request, Response } from 'express';

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

import { CustomerService } from '../services/CustomerService';

export const customerRoutes = Router();

// Initialize services
const customerService = new CustomerService();

/**
 * @swagger
 * /api/v1/customers:
 *   get:
 *     tags: [Customers]
 *     summary: Get customers with pagination and filtering
 *     security:
 *       - BearerAuth: []
 *       - TenantHeader: []
 */
customerRoutes.get('/',
  authenticate,
  extractTenant,
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const {
      page = 1,
      limit = 20,
      search,
      isActive,
      orderBy = 'name',
      sortOrder = 'asc'
    } = req.query;

    try {
      const filters = {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        search: search as string,
        isActive: isActive !== undefined ? isActive === 'true' : undefined,
        orderBy: orderBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
      };

      const customers = await customerService.getCustomers(tenantId, filters);

      res.json(createResponse(customers, 'Customers retrieved successfully'));

    } catch (error) {
      logger.error('Get customers error', {
        tenantId,
        userId: user.id,
        filters: { search, isActive },
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/customers/{customerId}:
 *   get:
 *     tags: [Customers]
 *     summary: Get customer by ID
 */
customerRoutes.get('/:customerId',
  authenticate,
  extractTenant,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { customerId } = req.params;

    try {
      const customer = await customerService.getCustomerById(tenantId, customerId);

      if (!customer) {
        res.status(404).json(createErrorResponse('Customer not found', 'CUSTOMER_NOT_FOUND'));
        return;
      }

      res.json(createResponse(customer, 'Customer retrieved successfully'));

    } catch (error) {
      logger.error('Get customer by ID error', {
        tenantId,
        customerId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/customers:
 *   post:
 *     tags: [Customers]
 *     summary: Create new customer
 */
customerRoutes.post('/',
  authenticate,
  extractTenant,
  requirePermissions([Permissions.CUSTOMER_UPDATE]),
  validationMiddleware.createCustomer,
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const customerData = req.body;

    try {
      const customer = await customerService.createCustomer(tenantId, {
        ...customerData,
        createdBy: user.id,
      });

      logger.audit('Customer created', {
        tenantId,
        customerId: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        createdBy: user.id,
        ip: req.ip,
      });

      res.status(201).json(createResponse(customer, 'Customer created successfully'));

    } catch (error) {
      logger.error('Create customer error', {
        tenantId,
        userId: user.id,
        customerData,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/customers/{customerId}:
 *   put:
 *     tags: [Customers]
 *     summary: Update customer
 */
customerRoutes.put('/:customerId',
  authenticate,
  extractTenant,
  requirePermissions([Permissions.CUSTOMER_UPDATE]),
  validationMiddleware.updateCustomer,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { customerId } = req.params;
    const updates = req.body;

    try {
      const customer = await customerService.getCustomerById(tenantId, customerId);

      if (!customer) {
        res.status(404).json(createErrorResponse('Customer not found', 'CUSTOMER_NOT_FOUND'));
        return;
      }

      await customerService.updateCustomer(tenantId, customerId, {
        ...updates,
        updatedBy: user.id,
      });

      logger.audit('Customer updated', {
        tenantId,
        customerId,
        updatedBy: user.id,
        updatedFields: Object.keys(updates),
        ip: req.ip,
      });

      res.json(createResponse({}, 'Customer updated successfully'));

    } catch (error) {
      logger.error('Update customer error', {
        tenantId,
        customerId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/customers/{customerId}/deactivate:
 *   post:
 *     tags: [Customers]
 *     summary: Deactivate customer
 */
customerRoutes.post('/:customerId/deactivate',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  requirePermissions([Permissions.CUSTOMER_UPDATE]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { customerId } = req.params;
    const { reason } = req.body;

    try {
      const customer = await customerService.getCustomerById(tenantId, customerId);

      if (!customer) {
        res.status(404).json(createErrorResponse('Customer not found', 'CUSTOMER_NOT_FOUND'));
        return;
      }

      await customerService.deactivateCustomer(tenantId, customerId, {
        reason,
        deactivatedBy: user.id,
      });

      logger.audit('Customer deactivated', {
        tenantId,
        customerId,
        customerName: customer.name,
        reason,
        deactivatedBy: user.id,
        ip: req.ip,
      });

      res.json(createResponse({}, 'Customer deactivated successfully'));

    } catch (error) {
      logger.error('Deactivate customer error', {
        tenantId,
        customerId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/customers/{customerId}/reactivate:
 *   post:
 *     tags: [Customers]
 *     summary: Reactivate customer
 */
customerRoutes.post('/:customerId/reactivate',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  requirePermissions([Permissions.CUSTOMER_UPDATE]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { customerId } = req.params;

    try {
      const customer = await customerService.getCustomerById(tenantId, customerId);

      if (!customer) {
        res.status(404).json(createErrorResponse('Customer not found', 'CUSTOMER_NOT_FOUND'));
        return;
      }

      await customerService.reactivateCustomer(tenantId, customerId, user.id);

      logger.audit('Customer reactivated', {
        tenantId,
        customerId,
        customerName: customer.name,
        reactivatedBy: user.id,
        ip: req.ip,
      });

      res.json(createResponse({}, 'Customer reactivated successfully'));

    } catch (error) {
      logger.error('Reactivate customer error', {
        tenantId,
        customerId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/customers/{customerId}/orders:
 *   get:
 *     tags: [Customers]
 *     summary: Get customer order history
 */
customerRoutes.get('/:customerId/orders',
  authenticate,
  extractTenant,
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { customerId } = req.params;
    const { page = 1, limit = 10, status } = req.query;

    try {
      const orders = await customerService.getCustomerOrders(tenantId, customerId, {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        status: status as string,
      });

      res.json(createResponse(orders, 'Customer orders retrieved successfully'));

    } catch (error) {
      logger.error('Get customer orders error', {
        tenantId,
        customerId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/customers/{customerId}/stats:
 *   get:
 *     tags: [Customers]
 *     summary: Get customer statistics
 */
customerRoutes.get('/:customerId/stats',
  authenticate,
  extractTenant,
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { customerId } = req.params;
    const { period = 'all' } = req.query;

    try {
      const stats = await customerService.getCustomerStats(tenantId, customerId, {
        period: period as string,
      });

      res.json(createResponse(stats, 'Customer statistics retrieved successfully'));

    } catch (error) {
      logger.error('Get customer stats error', {
        tenantId,
        customerId,
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
 * /api/v1/customers/{customerId}/loyalty:
 *   get:
 *     tags: [Customers]
 *     summary: Get customer loyalty information
 */
customerRoutes.get('/:customerId/loyalty',
  authenticate,
  extractTenant,
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { customerId } = req.params;

    try {
      const loyalty = await customerService.getCustomerLoyalty(tenantId, customerId);

      res.json(createResponse(loyalty, 'Customer loyalty information retrieved successfully'));

    } catch (error) {
      logger.error('Get customer loyalty error', {
        tenantId,
        customerId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/customers/{customerId}/loyalty/points:
 *   post:
 *     tags: [Customers]
 *     summary: Add or redeem loyalty points
 */
customerRoutes.post('/:customerId/loyalty/points',
  authenticate,
  extractTenant,
  requirePermissions([Permissions.CUSTOMER_UPDATE]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { customerId } = req.params;
    const { points, action, reason, orderId } = req.body;

    if (!['add', 'redeem'].includes(action)) {
      res.status(400).json(createErrorResponse('Invalid action', 'INVALID_ACTION'));
      return;
    }

    try {
      const result = await customerService.updateLoyaltyPoints(tenantId, customerId, {
        points,
        action,
        reason,
        orderId,
        processedBy: user.id,
      });

      logger.audit('Customer loyalty points updated', {
        tenantId,
        customerId,
        points,
        action,
        reason,
        processedBy: user.id,
        ip: req.ip,
      });

      res.json(createResponse(result, `Loyalty points ${action}ed successfully`));

    } catch (error) {
      logger.error('Update loyalty points error', {
        tenantId,
        customerId,
        points,
        action,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/customers/search:
 *   get:
 *     tags: [Customers]
 *     summary: Search customers (optimized for POS)
 */
customerRoutes.get('/search',
  authenticate,
  extractTenant,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { q, limit = 10 } = req.query;

    if (!q || (q as string).trim().length < 2) {
      res.status(400).json(createErrorResponse('Search query must be at least 2 characters', 'INVALID_SEARCH_QUERY'));
      return;
    }

    try {
      const customers = await customerService.searchCustomers(tenantId, {
        query: q as string,
        limit: parseInt(limit as string),
        activeOnly: true,
      });

      res.json(createResponse(customers, 'Customers found'));

    } catch (error) {
      logger.error('Search customers error', {
        tenantId,
        query: q,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/customers/bulk-update:
 *   post:
 *     tags: [Customers]
 *     summary: Bulk update customers
 */
customerRoutes.post('/bulk-update',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  requirePermissions([Permissions.CUSTOMER_UPDATE]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { customerIds, updates } = req.body;

    if (!Array.isArray(customerIds) || customerIds.length === 0) {
      res.status(400).json(createErrorResponse('Customer IDs array is required', 'INVALID_CUSTOMER_IDS'));
      return;
    }

    if (customerIds.length > 100) {
      res.status(400).json(createErrorResponse('Maximum 100 customers can be updated at once', 'TOO_MANY_CUSTOMERS'));
      return;
    }

    try {
      const result = await customerService.bulkUpdateCustomers(tenantId, customerIds, updates, {
        updatedBy: user.id,
      });

      logger.audit('Customers bulk updated', {
        tenantId,
        customerIds,
        updatedCount: result.modifiedCount,
        updatedBy: user.id,
        ip: req.ip,
      });

      res.json(createResponse({
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      }, 'Customers updated successfully'));

    } catch (error) {
      logger.error('Bulk update customers error', {
        tenantId,
        customerIds,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/customers/bulk-deactivate:
 *   post:
 *     tags: [Customers]
 *     summary: Bulk deactivate customers
 */
customerRoutes.post('/bulk-deactivate',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  requirePermissions([Permissions.CUSTOMER_UPDATE]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { customerIds, reason } = req.body;

    if (!Array.isArray(customerIds) || customerIds.length === 0) {
      res.status(400).json(createErrorResponse('Customer IDs array is required', 'INVALID_CUSTOMER_IDS'));
      return;
    }

    if (customerIds.length > 100) {
      res.status(400).json(createErrorResponse('Maximum 100 customers can be deactivated at once', 'TOO_MANY_CUSTOMERS'));
      return;
    }

    try {
      const result = await customerService.bulkDeactivateCustomers(tenantId, customerIds, {
        reason,
        deactivatedBy: user.id,
      });

      logger.audit('Customers bulk deactivated', {
        tenantId,
        customerIds,
        deactivatedCount: result.modifiedCount,
        reason,
        deactivatedBy: user.id,
        ip: req.ip,
      });

      res.json(createResponse({
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      }, 'Customers deactivated successfully'));

    } catch (error) {
      logger.error('Bulk deactivate customers error', {
        tenantId,
        customerIds,
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
 * /api/v1/customers/bulk-export:
 *   post:
 *     tags: [Customers]
 *     summary: Bulk export customers as CSV
 */
customerRoutes.post('/bulk-export',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { customerIds } = req.body;

    try {
      const csv = await customerService.bulkExportCustomers(tenantId, customerIds);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="customers-export.csv"');
      res.send(csv);

    } catch (error) {
      logger.error('Bulk export customers error', {
        tenantId,
        customerIds,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);