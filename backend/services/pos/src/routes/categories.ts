// Product category management routes

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

import { CategoryService } from '../services/CategoryService';

export const categoryRoutes = Router();

// Initialize services
const categoryService = new CategoryService();

/**
 * @swagger
 * /api/v1/categories:
 *   get:
 *     tags: [Categories]
 *     summary: Get all categories
 *     security:
 *       - BearerAuth: []
 *       - TenantHeader: []
 */
categoryRoutes.get('/',
  authenticate,
  extractTenant,
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { includeInactive = false } = req.query;

    try {
      const categories = await categoryService.getCategories(tenantId, {
        includeInactive: includeInactive === 'true',
      });

      res.json(createResponse(categories, 'Categories retrieved successfully'));

    } catch (error) {
      logger.error('Get categories error', {
        tenantId,
        userId: user.id,
        includeInactive,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/categories/{categoryId}:
 *   get:
 *     tags: [Categories]
 *     summary: Get category by ID
 */
categoryRoutes.get('/:categoryId',
  authenticate,
  extractTenant,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { categoryId } = req.params;

    try {
      const category = await categoryService.getCategoryById(tenantId, categoryId);

      if (!category) {
        res.status(404).json(createErrorResponse('Category not found', 'CATEGORY_NOT_FOUND'));
        return;
      }

      res.json(createResponse(category, 'Category retrieved successfully'));

    } catch (error) {
      logger.error('Get category by ID error', {
        tenantId,
        categoryId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/categories:
 *   post:
 *     tags: [Categories]
 *     summary: Create new category
 */
categoryRoutes.post('/',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  requirePermissions([Permissions.PRODUCT_UPDATE]),
  validationMiddleware.createCategory,
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const categoryData = req.body;

    try {
      const category = await categoryService.createCategory(tenantId, {
        ...categoryData,
        createdBy: user.id,
      });

      logger.audit('Category created', {
        tenantId,
        categoryId: category.id,
        name: category.name,
        parentId: category.parentId,
        createdBy: user.id,
        ip: req.ip,
      });

      res.status(201).json(createResponse(category, 'Category created successfully'));

    } catch (error) {
      logger.error('Create category error', {
        tenantId,
        userId: user.id,
        categoryData,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/categories/{categoryId}:
 *   put:
 *     tags: [Categories]
 *     summary: Update category
 */
categoryRoutes.put('/:categoryId',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  requirePermissions([Permissions.PRODUCT_UPDATE]),
  validationMiddleware.updateCategory,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { categoryId } = req.params;
    const updates = req.body;

    try {
      const category = await categoryService.getCategoryById(tenantId, categoryId);

      if (!category) {
        res.status(404).json(createErrorResponse('Category not found', 'CATEGORY_NOT_FOUND'));
        return;
      }

      await categoryService.updateCategory(tenantId, categoryId, {
        ...updates,
        updatedBy: user.id,
      });

      logger.audit('Category updated', {
        tenantId,
        categoryId,
        updatedBy: user.id,
        updatedFields: Object.keys(updates),
        ip: req.ip,
      });

      res.json(createResponse({}, 'Category updated successfully'));

    } catch (error) {
      logger.error('Update category error', {
        tenantId,
        categoryId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/categories/{categoryId}/deactivate:
 *   post:
 *     tags: [Categories]
 *     summary: Deactivate category
 */
categoryRoutes.post('/:categoryId/deactivate',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  requirePermissions([Permissions.PRODUCT_UPDATE]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { categoryId } = req.params;

    try {
      const category = await categoryService.getCategoryById(tenantId, categoryId);

      if (!category) {
        res.status(404).json(createErrorResponse('Category not found', 'CATEGORY_NOT_FOUND'));
        return;
      }

      // Check if category has active products
      const hasActiveProducts = await categoryService.hasActiveProducts(tenantId, categoryId);
      if (hasActiveProducts) {
        res.status(400).json(createErrorResponse(
          'Cannot deactivate category with active products',
          'CATEGORY_HAS_ACTIVE_PRODUCTS'
        ));
        return;
      }

      await categoryService.deactivateCategory(tenantId, categoryId, user.id);

      logger.audit('Category deactivated', {
        tenantId,
        categoryId,
        categoryName: category.name,
        deactivatedBy: user.id,
        ip: req.ip,
      });

      res.json(createResponse({}, 'Category deactivated successfully'));

    } catch (error) {
      logger.error('Deactivate category error', {
        tenantId,
        categoryId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/categories/{categoryId}/reactivate:
 *   post:
 *     tags: [Categories]
 *     summary: Reactivate category
 */
categoryRoutes.post('/:categoryId/reactivate',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  requirePermissions([Permissions.PRODUCT_UPDATE]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { categoryId } = req.params;

    try {
      const category = await categoryService.getCategoryById(tenantId, categoryId);

      if (!category) {
        res.status(404).json(createErrorResponse('Category not found', 'CATEGORY_NOT_FOUND'));
        return;
      }

      await categoryService.reactivateCategory(tenantId, categoryId, user.id);

      logger.audit('Category reactivated', {
        tenantId,
        categoryId,
        categoryName: category.name,
        reactivatedBy: user.id,
        ip: req.ip,
      });

      res.json(createResponse({}, 'Category reactivated successfully'));

    } catch (error) {
      logger.error('Reactivate category error', {
        tenantId,
        categoryId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/categories/{categoryId}/products:
 *   get:
 *     tags: [Categories]
 *     summary: Get products in category
 */
categoryRoutes.get('/:categoryId/products',
  authenticate,
  extractTenant,
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { categoryId } = req.params;
    const { page = 1, limit = 20, activeOnly = true } = req.query;

    try {
      const products = await categoryService.getCategoryProducts(tenantId, categoryId, {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        activeOnly: activeOnly === 'true',
      });

      res.json(createResponse(products, 'Category products retrieved successfully'));

    } catch (error) {
      logger.error('Get category products error', {
        tenantId,
        categoryId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);