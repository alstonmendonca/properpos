// Product management routes

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

import { ProductService } from '../services/ProductService';

export const productRoutes = Router();

// Initialize services
const productService = new ProductService();

/**
 * @swagger
 * /api/v1/products:
 *   get:
 *     tags: [Products]
 *     summary: Get products
 *     security:
 *       - BearerAuth: []
 *       - TenantHeader: []
 */
productRoutes.get('/',
  authenticate,
  extractTenant,
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const {
      page = 1,
      limit = 20,
      search,
      categoryId,
      isActive,
      minPrice,
      maxPrice,
      inStock,
      sortBy = 'name',
      sortOrder = 'asc'
    } = req.query;

    try {
      const filters = {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        search: search as string,
        categoryId: categoryId as string,
        isActive: isActive !== undefined ? isActive === 'true' : undefined,
        minPrice: minPrice ? parseFloat(minPrice as string) : undefined,
        maxPrice: maxPrice ? parseFloat(maxPrice as string) : undefined,
        inStock: inStock !== undefined ? inStock === 'true' : undefined,
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
      };

      const products = await productService.getProducts(tenantId, filters);

      res.json(createResponse(products, 'Products retrieved successfully'));

    } catch (error) {
      logger.error('Get products error', {
        tenantId,
        userId: user.id,
        filters: { search, categoryId, isActive },
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/products/{productId}:
 *   get:
 *     tags: [Products]
 *     summary: Get product by ID
 */
productRoutes.get('/:productId',
  authenticate,
  extractTenant,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { productId } = req.params;

    try {
      const product = await productService.getProductById(tenantId, productId);

      if (!product) {
        res.status(404).json(createErrorResponse('Product not found', 'PRODUCT_NOT_FOUND'));
        return;
      }

      res.json(createResponse(product, 'Product retrieved successfully'));

    } catch (error) {
      logger.error('Get product by ID error', {
        tenantId,
        productId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/products:
 *   post:
 *     tags: [Products]
 *     summary: Create new product
 */
productRoutes.post('/',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  requirePermissions([Permissions.PRODUCT_UPDATE]),
  validationMiddleware.createProduct,
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const productData = req.body;

    try {
      const product = await productService.createProduct(tenantId, {
        ...productData,
        createdBy: user.id,
      });

      logger.audit('Product created', {
        tenantId,
        productId: product.id,
        name: product.name,
        sku: product.sku,
        price: product.price,
        createdBy: user.id,
        ip: req.ip,
      });

      res.status(201).json(createResponse(product, 'Product created successfully'));

    } catch (error) {
      logger.error('Create product error', {
        tenantId,
        userId: user.id,
        productData,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/products/{productId}:
 *   put:
 *     tags: [Products]
 *     summary: Update product
 */
productRoutes.put('/:productId',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  requirePermissions([Permissions.PRODUCT_UPDATE]),
  validationMiddleware.updateProduct,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { productId } = req.params;
    const updates = req.body;

    try {
      const product = await productService.getProductById(tenantId, productId);

      if (!product) {
        res.status(404).json(createErrorResponse('Product not found', 'PRODUCT_NOT_FOUND'));
        return;
      }

      await productService.updateProduct(tenantId, productId, {
        ...updates,
        updatedBy: user.id,
      });

      logger.audit('Product updated', {
        tenantId,
        productId,
        updatedBy: user.id,
        updatedFields: Object.keys(updates),
        ip: req.ip,
      });

      res.json(createResponse({}, 'Product updated successfully'));

    } catch (error) {
      logger.error('Update product error', {
        tenantId,
        productId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/products/{productId}/deactivate:
 *   post:
 *     tags: [Products]
 *     summary: Deactivate product
 */
productRoutes.post('/:productId/deactivate',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  requirePermissions([Permissions.PRODUCT_UPDATE]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { productId } = req.params;
    const { reason } = req.body;

    try {
      const product = await productService.getProductById(tenantId, productId);

      if (!product) {
        res.status(404).json(createErrorResponse('Product not found', 'PRODUCT_NOT_FOUND'));
        return;
      }

      await productService.deactivateProduct(tenantId, productId, {
        reason,
        deactivatedBy: user.id,
      });

      logger.audit('Product deactivated', {
        tenantId,
        productId,
        productName: product.name,
        reason,
        deactivatedBy: user.id,
        ip: req.ip,
      });

      res.json(createResponse({}, 'Product deactivated successfully'));

    } catch (error) {
      logger.error('Deactivate product error', {
        tenantId,
        productId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/products/{productId}/reactivate:
 *   post:
 *     tags: [Products]
 *     summary: Reactivate product
 */
productRoutes.post('/:productId/reactivate',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  requirePermissions([Permissions.PRODUCT_UPDATE]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { productId } = req.params;

    try {
      const product = await productService.getProductById(tenantId, productId);

      if (!product) {
        res.status(404).json(createErrorResponse('Product not found', 'PRODUCT_NOT_FOUND'));
        return;
      }

      await productService.reactivateProduct(tenantId, productId, user.id);

      logger.audit('Product reactivated', {
        tenantId,
        productId,
        productName: product.name,
        reactivatedBy: user.id,
        ip: req.ip,
      });

      res.json(createResponse({}, 'Product reactivated successfully'));

    } catch (error) {
      logger.error('Reactivate product error', {
        tenantId,
        productId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/products/{productId}/inventory:
 *   get:
 *     tags: [Products]
 *     summary: Get product inventory across locations
 */
productRoutes.get('/:productId/inventory',
  authenticate,
  extractTenant,
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { productId } = req.params;

    try {
      const inventory = await productService.getProductInventory(tenantId, productId);

      res.json(createResponse(inventory, 'Product inventory retrieved successfully'));

    } catch (error) {
      logger.error('Get product inventory error', {
        tenantId,
        productId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/products/{productId}/inventory/{locationId}:
 *   put:
 *     tags: [Products]
 *     summary: Update product inventory for location
 */
productRoutes.put('/:productId/inventory/:locationId',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  requirePermissions([Permissions.INVENTORY_UPDATE]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { productId, locationId } = req.params;
    const { quantity, lowStockThreshold, notes } = req.body;

    try {
      // Validate location access for managers
      if (user.role === UserRoles.MANAGER) {
        const membership = user.tenantMemberships?.find((m: any) => m.tenantId === tenantId);
        const hasAccess = membership?.locationAccess?.includes(locationId) || membership?.locationAccess?.includes('*');

        if (!hasAccess) {
          res.status(403).json(createErrorResponse('Access denied to this location', 'LOCATION_ACCESS_DENIED'));
          return;
        }
      }

      await productService.updateProductInventory(tenantId, productId, locationId, {
        quantity,
        lowStockThreshold,
        notes,
        updatedBy: user.id,
      });

      logger.audit('Product inventory updated', {
        tenantId,
        productId,
        locationId,
        quantity,
        lowStockThreshold,
        updatedBy: user.id,
        ip: req.ip,
      });

      res.json(createResponse({}, 'Product inventory updated successfully'));

    } catch (error) {
      logger.error('Update product inventory error', {
        tenantId,
        productId,
        locationId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/products/bulk-update:
 *   post:
 *     tags: [Products]
 *     summary: Bulk update products
 */
productRoutes.post('/bulk-update',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  requirePermissions([Permissions.PRODUCT_UPDATE]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { productIds, updates } = req.body;

    if (!Array.isArray(productIds) || productIds.length === 0) {
      res.status(400).json(createErrorResponse('Product IDs array is required', 'INVALID_PRODUCT_IDS'));
      return;
    }

    try {
      const result = await productService.bulkUpdateProducts(tenantId, productIds, {
        ...updates,
        updatedBy: user.id,
      });

      logger.audit('Products bulk updated', {
        tenantId,
        productIds,
        updatedCount: result.modifiedCount,
        updatedBy: user.id,
        ip: req.ip,
      });

      res.json(createResponse({
        modifiedCount: result.modifiedCount,
        matchedCount: result.matchedCount,
      }, 'Products updated successfully'));

    } catch (error) {
      logger.error('Bulk update products error', {
        tenantId,
        productIds,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/products/bulk-delete:
 *   post:
 *     tags: [Products]
 *     summary: Bulk delete (soft-delete) products
 */
productRoutes.post('/bulk-delete',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  requirePermissions([Permissions.PRODUCT_UPDATE]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { productIds, reason } = req.body;

    if (!Array.isArray(productIds) || productIds.length === 0) {
      res.status(400).json(createErrorResponse('Product IDs array is required', 'INVALID_PRODUCT_IDS'));
      return;
    }

    if (productIds.length > 100) {
      res.status(400).json(createErrorResponse('Maximum 100 products can be deleted at once', 'TOO_MANY_PRODUCTS'));
      return;
    }

    try {
      const result = await productService.bulkDeleteProducts(tenantId, productIds, {
        reason,
        deletedBy: user.id,
      });

      logger.audit('Products bulk deleted', {
        tenantId,
        productIds,
        deletedCount: result.modifiedCount,
        reason,
        deletedBy: user.id,
        ip: req.ip,
      });

      res.json(createResponse({
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      }, 'Products deleted successfully'));

    } catch (error) {
      logger.error('Bulk delete products error', {
        tenantId,
        productIds,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/products/bulk-export:
 *   post:
 *     tags: [Products]
 *     summary: Bulk export products as CSV
 */
productRoutes.post('/bulk-export',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { productIds } = req.body;

    try {
      const csv = await productService.bulkExportProducts(tenantId, productIds);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="products-export.csv"');
      res.send(csv);

    } catch (error) {
      logger.error('Bulk export products error', {
        tenantId,
        productIds,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/products/low-stock:
 *   get:
 *     tags: [Products]
 *     summary: Get products with low stock
 */
productRoutes.get('/low-stock',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { locationId, limit = 50 } = req.query;

    try {
      // Validate location access for managers
      if (user.role === UserRoles.MANAGER && locationId) {
        const membership = user.tenantMemberships?.find((m: any) => m.tenantId === tenantId);
        const hasAccess = membership?.locationAccess?.includes(locationId as string) || membership?.locationAccess?.includes('*');

        if (!hasAccess) {
          res.status(403).json(createErrorResponse('Access denied to this location', 'LOCATION_ACCESS_DENIED'));
          return;
        }
      }

      const lowStockProducts = await productService.getLowStockProducts(tenantId, {
        locationId: locationId as string,
        limit: parseInt(limit as string),
      });

      res.json(createResponse(lowStockProducts, 'Low stock products retrieved successfully'));

    } catch (error) {
      logger.error('Get low stock products error', {
        tenantId,
        locationId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/products/stats:
 *   get:
 *     tags: [Products]
 *     summary: Get product statistics
 */
productRoutes.get('/stats',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { locationId, period = 'today' } = req.query;

    try {
      const stats = await productService.getProductStats(tenantId, {
        locationId: locationId as string,
        period: period as string,
      });

      res.json(createResponse(stats, 'Product statistics retrieved successfully'));

    } catch (error) {
      logger.error('Get product stats error', {
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
 * /api/v1/products/search:
 *   get:
 *     tags: [Products]
 *     summary: Search products (optimized for POS)
 */
productRoutes.get('/search',
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
      const products = await productService.searchProducts(tenantId, {
        query: q as string,
        limit: parseInt(limit as string),
        activeOnly: true, // Only return active products for POS
      });

      res.json(createResponse(products, 'Products found'));

    } catch (error) {
      logger.error('Search products error', {
        tenantId,
        query: q,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);