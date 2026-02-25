// Sales analytics routes

import { Router, Request, Response } from 'express';

import {
  logger,
  authenticate,
  extractTenant,
  requireRole,
  requirePermissions,
  createResponse,
  createErrorResponse,
  UserRoles,
  Permissions,
} from '@properpos/backend-shared';

import { SalesAnalyticsService } from '../services/SalesAnalyticsService';

export const salesRoutes = Router();

// Initialize services
const salesAnalyticsService = new SalesAnalyticsService();

/**
 * @swagger
 * /api/v1/sales/overview:
 *   get:
 *     tags: [Sales Analytics]
 *     summary: Get sales overview with key metrics
 *     security:
 *       - BearerAuth: []
 *       - TenantHeader: []
 */
salesRoutes.get('/overview',
  authenticate,
  extractTenant,
  requirePermissions([Permissions.ANALYTICS_READ]),
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const {
      period = 'today',
      locationId,
      compareWith,
      startDate,
      endDate
    } = req.query;

    const filters = {
      period: period as string,
      locationId: locationId as string,
      compareWith: compareWith as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      userId: user.id, // For location access control
    };

    try {
      const overview = await salesAnalyticsService.getSalesOverview(tenantId, filters);

      res.json(createResponse(overview, 'Sales overview retrieved successfully'));

    } catch (error) {
      logger.error('Get sales overview error', {
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
 * /api/v1/sales/trends:
 *   get:
 *     tags: [Sales Analytics]
 *     summary: Get sales trends over time
 */
salesRoutes.get('/trends',
  authenticate,
  extractTenant,
  requirePermissions([Permissions.ANALYTICS_READ]),
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const {
      period = 'week',
      granularity = 'day',
      locationId,
      categoryId,
      productId,
      startDate,
      endDate
    } = req.query;

    const filters = {
      period: period as string,
      granularity: granularity as string,
      locationId: locationId as string,
      categoryId: categoryId as string,
      productId: productId as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      userId: user.id,
    };

    try {
      const trends = await salesAnalyticsService.getSalesTrends(tenantId, filters);

      res.json(createResponse(trends, 'Sales trends retrieved successfully'));

    } catch (error) {
      logger.error('Get sales trends error', {
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
 * /api/v1/sales/top-products:
 *   get:
 *     tags: [Sales Analytics]
 *     summary: Get top-selling products
 */
salesRoutes.get('/top-products',
  authenticate,
  extractTenant,
  requirePermissions([Permissions.ANALYTICS_READ]),
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const {
      period = 'month',
      limit = 10,
      locationId,
      categoryId,
      sortBy = 'revenue', // revenue, quantity, profit
      startDate,
      endDate
    } = req.query;

    const filters = {
      period: period as string,
      limit: parseInt(limit as string),
      locationId: locationId as string,
      categoryId: categoryId as string,
      sortBy: sortBy as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      userId: user.id,
    };

    try {
      const topProducts = await salesAnalyticsService.getTopProducts(tenantId, filters);

      res.json(createResponse(topProducts, 'Top products retrieved successfully'));

    } catch (error) {
      logger.error('Get top products error', {
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
 * /api/v1/sales/by-category:
 *   get:
 *     tags: [Sales Analytics]
 *     summary: Get sales breakdown by category
 */
salesRoutes.get('/by-category',
  authenticate,
  extractTenant,
  requirePermissions([Permissions.ANALYTICS_READ]),
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const {
      period = 'month',
      locationId,
      includeSubcategories = true,
      startDate,
      endDate
    } = req.query;

    const filters = {
      period: period as string,
      locationId: locationId as string,
      includeSubcategories: includeSubcategories === 'true',
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      userId: user.id,
    };

    try {
      const categoryBreakdown = await salesAnalyticsService.getSalesByCategory(tenantId, filters);

      res.json(createResponse(categoryBreakdown, 'Sales by category retrieved successfully'));

    } catch (error) {
      logger.error('Get sales by category error', {
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
 * /api/v1/sales/by-location:
 *   get:
 *     tags: [Sales Analytics]
 *     summary: Get sales breakdown by location
 */
salesRoutes.get('/by-location',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  requirePermissions([Permissions.ANALYTICS_READ]),
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const {
      period = 'month',
      startDate,
      endDate
    } = req.query;

    const filters = {
      period: period as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    };

    try {
      const locationBreakdown = await salesAnalyticsService.getSalesByLocation(tenantId, filters);

      res.json(createResponse(locationBreakdown, 'Sales by location retrieved successfully'));

    } catch (error) {
      logger.error('Get sales by location error', {
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
 * /api/v1/sales/by-time:
 *   get:
 *     tags: [Sales Analytics]
 *     summary: Get sales breakdown by time periods (hourly, daily, etc.)
 */
salesRoutes.get('/by-time',
  authenticate,
  extractTenant,
  requirePermissions([Permissions.ANALYTICS_READ]),
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const {
      period = 'week',
      timeUnit = 'hour', // hour, day, week, month
      locationId,
      startDate,
      endDate
    } = req.query;

    const filters = {
      period: period as string,
      timeUnit: timeUnit as string,
      locationId: locationId as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      userId: user.id,
    };

    try {
      const timeBreakdown = await salesAnalyticsService.getSalesByTime(tenantId, filters);

      res.json(createResponse(timeBreakdown, 'Sales by time retrieved successfully'));

    } catch (error) {
      logger.error('Get sales by time error', {
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
 * /api/v1/sales/performance:
 *   get:
 *     tags: [Sales Analytics]
 *     summary: Get sales performance metrics and comparisons
 */
salesRoutes.get('/performance',
  authenticate,
  extractTenant,
  requirePermissions([Permissions.ANALYTICS_READ]),
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const {
      period = 'month',
      compareWith = 'previous_period',
      locationId,
      target, // Target sales amount for comparison
      startDate,
      endDate
    } = req.query;

    const filters = {
      period: period as string,
      compareWith: compareWith as string,
      locationId: locationId as string,
      target: target ? parseFloat(target as string) : undefined,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      userId: user.id,
    };

    try {
      const performance = await salesAnalyticsService.getSalesPerformance(tenantId, filters);

      res.json(createResponse(performance, 'Sales performance retrieved successfully'));

    } catch (error) {
      logger.error('Get sales performance error', {
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
 * /api/v1/sales/conversion:
 *   get:
 *     tags: [Sales Analytics]
 *     summary: Get sales conversion metrics
 */
salesRoutes.get('/conversion',
  authenticate,
  extractTenant,
  requirePermissions([Permissions.ANALYTICS_READ]),
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const {
      period = 'month',
      locationId,
      startDate,
      endDate
    } = req.query;

    const filters = {
      period: period as string,
      locationId: locationId as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      userId: user.id,
    };

    try {
      const conversion = await salesAnalyticsService.getConversionMetrics(tenantId, filters);

      res.json(createResponse(conversion, 'Conversion metrics retrieved successfully'));

    } catch (error) {
      logger.error('Get conversion metrics error', {
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
 * /api/v1/sales/customer-analysis:
 *   get:
 *     tags: [Sales Analytics]
 *     summary: Get customer behavior analysis
 */
salesRoutes.get('/customer-analysis',
  authenticate,
  extractTenant,
  requirePermissions([Permissions.ANALYTICS_READ, Permissions.CUSTOMER_READ]),
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const {
      period = 'month',
      locationId,
      segment = 'all', // all, new, returning, loyal
      startDate,
      endDate
    } = req.query;

    const filters = {
      period: period as string,
      locationId: locationId as string,
      segment: segment as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      userId: user.id,
    };

    try {
      const customerAnalysis = await salesAnalyticsService.getCustomerAnalysis(tenantId, filters);

      res.json(createResponse(customerAnalysis, 'Customer analysis retrieved successfully'));

    } catch (error) {
      logger.error('Get customer analysis error', {
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
 * /api/v1/sales/real-time:
 *   get:
 *     tags: [Sales Analytics]
 *     summary: Get real-time sales data
 */
salesRoutes.get('/real-time',
  authenticate,
  extractTenant,
  requirePermissions([Permissions.ANALYTICS_READ]),
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { locationId } = req.query;

    const filters = {
      locationId: locationId as string,
      userId: user.id,
    };

    try {
      const realTimeData = await salesAnalyticsService.getRealTimeSales(tenantId, filters);

      res.json(createResponse(realTimeData, 'Real-time sales data retrieved successfully'));

    } catch (error) {
      logger.error('Get real-time sales error', {
        tenantId,
        userId: user.id,
        filters,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);