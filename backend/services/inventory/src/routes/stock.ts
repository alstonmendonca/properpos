// Stock management routes

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
  getTenantDatabase,
} from '@properpos/backend-shared';

import { StockService } from '../services/StockService';
import { ForecastingEngine } from '../services/ForecastingEngine';

export const stockRoutes = Router();

// Initialize services
const stockService = new StockService();
const forecastingEngine = new ForecastingEngine();

/**
 * @swagger
 * /api/v1/stock:
 *   get:
 *     tags: [Stock]
 *     summary: Get stock levels across locations
 *     security:
 *       - BearerAuth: []
 *       - TenantHeader: []
 */
stockRoutes.get('/',
  authenticate,
  extractTenant,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const {
      page = 1,
      limit = 50,
      locationId,
      productId,
      sku,
      lowStock = false,
      outOfStock = false,
      search,
      categoryId,
      sortBy = 'productName',
      sortOrder = 'asc'
    } = req.query;

    const filters = {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      locationId: locationId as string,
      productId: productId as string,
      sku: sku as string,
      lowStock: lowStock === 'true',
      outOfStock: outOfStock === 'true',
      search: search as string,
      categoryId: categoryId as string,
      sortBy: sortBy as string,
      sortOrder: sortOrder as 'asc' | 'desc',
      userId: user.id, // For location access control
    };

    try {
      const stock = await stockService.getStock(tenantId, filters);

      res.json(createResponse(stock, 'Stock levels retrieved successfully'));

    } catch (error) {
      logger.error('Get stock error', {
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
 * /api/v1/stock/{productId}/{locationId}:
 *   get:
 *     tags: [Stock]
 *     summary: Get specific product stock at location
 */
stockRoutes.get('/:productId/:locationId',
  authenticate,
  extractTenant,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { productId, locationId } = req.params;
    const { includeHistory = false } = req.query;

    try {
      const stock = await stockService.getProductStock(tenantId, productId, locationId, {
        includeHistory: includeHistory === 'true',
      });

      if (!stock) {
        res.status(404).json(createErrorResponse('Stock record not found', 'STOCK_NOT_FOUND'));
        return;
      }

      res.json(createResponse(stock, 'Product stock retrieved successfully'));

    } catch (error) {
      logger.error('Get product stock error', {
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
 * /api/v1/stock/{productId}/{locationId}:
 *   put:
 *     tags: [Stock]
 *     summary: Update stock level
 */
stockRoutes.put('/:productId/:locationId',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  validationMiddleware.updateStock,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { productId, locationId } = req.params;
    const updates = req.body;

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

      await stockService.updateStock(tenantId, productId, locationId, {
        ...updates,
        updatedBy: user.id,
      });

      logger.audit('Stock level updated', {
        tenantId,
        productId,
        locationId,
        updates: Object.keys(updates),
        updatedBy: user.id,
        ip: req.ip,
      });

      res.json(createResponse({}, 'Stock level updated successfully'));

    } catch (error) {
      logger.error('Update stock error', {
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
 * /api/v1/stock/movements:
 *   get:
 *     tags: [Stock]
 *     summary: Get stock movement history
 */
stockRoutes.get('/movements',
  authenticate,
  extractTenant,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const {
      page = 1,
      limit = 100,
      locationId,
      productId,
      movementType,
      startDate,
      endDate,
      userId: filterUserId
    } = req.query;

    const filters = {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      locationId: locationId as string,
      productId: productId as string,
      movementType: movementType as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      userId: filterUserId as string,
      requestingUserId: user.id, // For location access control
    };

    try {
      const movements = await stockService.getStockMovements(tenantId, filters);

      res.json(createResponse(movements, 'Stock movements retrieved successfully'));

    } catch (error) {
      logger.error('Get stock movements error', {
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
 * /api/v1/stock/movements:
 *   post:
 *     tags: [Stock]
 *     summary: Record manual stock movement
 */
stockRoutes.post('/movements',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  validationMiddleware.createStockMovement,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const movementData = req.body;

    try {
      // Validate location access for managers
      if (user.role === UserRoles.MANAGER && movementData.locationId) {
        const membership = user.tenantMemberships?.find((m: any) => m.tenantId === tenantId);
        const hasAccess = membership?.locationAccess?.includes(movementData.locationId) ||
                         membership?.locationAccess?.includes('*');

        if (!hasAccess) {
          res.status(403).json(createErrorResponse('Access denied to this location', 'LOCATION_ACCESS_DENIED'));
          return;
        }
      }

      const movement = await stockService.recordStockMovement(tenantId, {
        ...movementData,
        createdBy: user.id,
      });

      logger.audit('Stock movement recorded', {
        tenantId,
        movementId: movement.id,
        productId: movement.productId,
        locationId: movement.locationId,
        type: (movement as any).type || movementData.movementType,
        quantity: movement.quantity,
        createdBy: user.id,
        ip: req.ip,
      });

      res.status(201).json(createResponse(movement, 'Stock movement recorded successfully'));

    } catch (error) {
      logger.error('Record stock movement error', {
        tenantId,
        userId: user.id,
        movementData,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/stock/alerts:
 *   get:
 *     tags: [Stock]
 *     summary: Get stock alerts (low stock, out of stock, overstock)
 */
stockRoutes.get('/alerts',
  authenticate,
  extractTenant,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const {
      page = 1,
      limit = 50,
      locationId,
      alertType,
      severity
    } = req.query;

    const filters = {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      locationId: locationId as string,
      alertType: alertType as string,
      severity: severity as string,
      userId: user.id, // For location access control
    };

    try {
      const alerts = await stockService.getStockAlerts(tenantId, filters);

      res.json(createResponse(alerts, 'Stock alerts retrieved successfully'));

    } catch (error) {
      logger.error('Get stock alerts error', {
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
 * /api/v1/stock/alerts/{alertId}/acknowledge:
 *   post:
 *     tags: [Stock]
 *     summary: Acknowledge stock alert
 */
stockRoutes.post('/alerts/:alertId/acknowledge',
  authenticate,
  extractTenant,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { alertId } = req.params;
    const { note } = req.body;

    try {
      await stockService.acknowledgeAlert(tenantId, alertId, {
        acknowledgedBy: user.id,
        note,
      });

      logger.audit('Stock alert acknowledged', {
        tenantId,
        alertId,
        acknowledgedBy: user.id,
        note,
        ip: req.ip,
      });

      res.json(createResponse({}, 'Stock alert acknowledged successfully'));

    } catch (error) {
      logger.error('Acknowledge stock alert error', {
        tenantId,
        alertId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/stock/bulk-update:
 *   post:
 *     tags: [Stock]
 *     summary: Bulk update stock levels
 */
stockRoutes.post('/bulk-update',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { updates } = req.body;

    if (!Array.isArray(updates) || updates.length === 0) {
      res.status(400).json(createErrorResponse('Updates array is required', 'INVALID_UPDATES'));
      return;
    }

    try {
      // Validate location access for managers
      if (user.role === UserRoles.MANAGER) {
        const membership = user.tenantMemberships?.find((m: any) => m.tenantId === tenantId);
        const hasAccess = membership?.locationAccess?.includes('*');

        if (!hasAccess) {
          // Check each location individually
          for (const update of updates) {
            if (update.locationId && !membership?.locationAccess?.includes(update.locationId)) {
              res.status(403).json(createErrorResponse(
                `Access denied to location: ${update.locationId}`,
                'LOCATION_ACCESS_DENIED'
              ));
              return;
            }
          }
        }
      }

      const result = await stockService.bulkUpdateStock(tenantId, updates, user.id);

      logger.audit('Stock bulk update completed', {
        tenantId,
        updatesCount: updates.length,
        successCount: result.successCount,
        failureCount: result.failureCount,
        updatedBy: user.id,
        ip: req.ip,
      });

      res.json(createResponse(result, 'Bulk stock update completed'));

    } catch (error) {
      logger.error('Bulk stock update error', {
        tenantId,
        updatesCount: updates.length,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/stock/valuation:
 *   get:
 *     tags: [Stock]
 *     summary: Get inventory valuation report
 */
stockRoutes.get('/valuation',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const {
      locationId,
      categoryId,
      valuationMethod = 'fifo',
      asOfDate
    } = req.query;

    const filters = {
      locationId: locationId as string,
      categoryId: categoryId as string,
      valuationMethod: valuationMethod as string,
      asOfDate: asOfDate ? new Date(asOfDate as string) : undefined,
      userId: user.id, // For location access control
    };

    try {
      const valuation = await stockService.getInventoryValuation(tenantId, filters);

      res.json(createResponse(valuation, 'Inventory valuation retrieved successfully'));

    } catch (error) {
      logger.error('Get inventory valuation error', {
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
 * /api/v1/stock/forecast/bulk:
 *   get:
 *     tags: [Stock]
 *     summary: Get bulk stock demand forecasts for all products
 */
stockRoutes.get('/forecast/bulk',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const {
      locationId,
      forecastPeriod = 30,
      method = 'ensemble'
    } = req.query;

    const filters = {
      locationId: locationId as string,
      forecastPeriod: parseInt(forecastPeriod as string),
      method: method as string,
      userId: user.id,
    };

    try {
      const forecasts = await stockService.generateStockForecast(tenantId, filters);

      res.json(createResponse(forecasts, 'Bulk stock forecasts generated successfully'));

    } catch (error) {
      logger.error('Generate bulk stock forecast error', {
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
 * /api/v1/stock/forecast/reorder-suggestions:
 *   get:
 *     tags: [Stock]
 *     summary: Get reorder suggestions based on forecasted demand
 */
stockRoutes.get('/forecast/reorder-suggestions',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const {
      locationId,
      leadTimeDays = 7,
    } = req.query;

    const parsedLeadTimeDays = parseInt(leadTimeDays as string);

    try {
      // Generate 30-day ensemble forecasts
      const forecasts = await stockService.generateStockForecast(tenantId, {
        locationId: locationId as string,
        forecastPeriod: 30,
        method: 'ensemble',
        userId: user.id,
      });

      const db = await getTenantDatabase(tenantId);
      const stockCollection = db.collection('stock');
      const productsCollection = db.collection('products');

      const urgencyOrder: Record<string, number> = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
      };

      const suggestions = [];

      for (const forecast of forecasts) {
        // Get current stock level
        const stockRecord = await stockCollection.findOne({
          productId: forecast.productId,
          ...(locationId && { locationId: locationId as string }),
        });

        const currentStock = stockRecord?.currentQuantity ?? 0;

        // Get product name
        const product = await productsCollection.findOne({ id: forecast.productId });
        const productName = product?.name || forecast.productId;

        const suggestion = forecastingEngine.generateReorderSuggestion(
          forecast.productId,
          productName,
          forecast.locationId,
          currentStock,
          {
            predictedDemand: forecast.predictedDemand,
            recommendedOrder: forecast.recommendedOrder,
            confidence: forecast.confidence,
            confidenceInterval70: forecast.confidenceInterval70,
            confidenceInterval90: forecast.confidenceInterval90,
            trend: forecast.trend as 'increasing' | 'decreasing' | 'stable',
            trendStrength: forecast.trendStrength,
            seasonality: forecast.seasonality,
            seasonalPattern: forecast.seasonalPattern,
            daysUntilStockout: null,
            method: forecast.method,
          },
          parsedLeadTimeDays
        );

        if (suggestion.suggestedOrderQuantity > 0) {
          suggestions.push(suggestion);
        }
      }

      // Sort by urgency (critical first)
      suggestions.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

      res.json(createResponse(suggestions, 'Reorder suggestions generated successfully'));

    } catch (error) {
      logger.error('Generate reorder suggestions error', {
        tenantId,
        userId: user.id,
        locationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/stock/forecast/stockout-risk:
 *   get:
 *     tags: [Stock]
 *     summary: Get products at risk of stockout within specified days
 */
stockRoutes.get('/forecast/stockout-risk',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const {
      locationId,
      withinDays = 14,
    } = req.query;

    const parsedWithinDays = parseInt(withinDays as string);

    try {
      // Generate 30-day ensemble forecasts
      const forecasts = await stockService.generateStockForecast(tenantId, {
        locationId: locationId as string,
        forecastPeriod: 30,
        method: 'ensemble',
        userId: user.id,
      });

      const db = await getTenantDatabase(tenantId);
      const stockCollection = db.collection('stock');
      const productsCollection = db.collection('products');

      const atRiskItems = [];

      for (const forecast of forecasts) {
        // Get current stock level
        const stockRecord = await stockCollection.findOne({
          productId: forecast.productId,
          ...(locationId && { locationId: locationId as string }),
        });

        const currentStock = stockRecord?.currentQuantity ?? 0;

        // Calculate average daily demand from forecast
        const avgDailyDemand = forecast.predictedDemand / 30;

        const daysUntilStockout = forecastingEngine.calculateDaysUntilStockout(
          currentStock,
          avgDailyDemand
        );

        if (daysUntilStockout !== null && daysUntilStockout <= parsedWithinDays) {
          // Get product name
          const product = await productsCollection.findOne({ id: forecast.productId });
          const productName = product?.name || forecast.productId;

          atRiskItems.push({
            productId: forecast.productId,
            productName,
            locationId: forecast.locationId,
            currentStock,
            avgDailyDemand: Math.round(avgDailyDemand * 100) / 100,
            daysUntilStockout,
            predictedDemand: forecast.predictedDemand,
            confidence: forecast.confidence,
            trend: forecast.trend,
          });
        }
      }

      // Sort by daysUntilStockout ascending (most urgent first)
      atRiskItems.sort((a, b) => a.daysUntilStockout - b.daysUntilStockout);

      res.json(createResponse(atRiskItems, 'Stockout risk analysis generated successfully'));

    } catch (error) {
      logger.error('Generate stockout risk analysis error', {
        tenantId,
        userId: user.id,
        locationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/stock/forecast:
 *   get:
 *     tags: [Stock]
 *     summary: Get stock demand forecast
 */
stockRoutes.get('/forecast',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const {
      locationId,
      productId,
      forecastPeriod = 30, // days
      method = 'moving_average'
    } = req.query;

    const filters = {
      locationId: locationId as string,
      productId: productId as string,
      forecastPeriod: parseInt(forecastPeriod as string),
      method: method as string,
      userId: user.id,
    };

    try {
      const forecast = await stockService.generateStockForecast(tenantId, filters);

      res.json(createResponse(forecast, 'Stock forecast generated successfully'));

    } catch (error) {
      logger.error('Generate stock forecast error', {
        tenantId,
        userId: user.id,
        filters,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);
