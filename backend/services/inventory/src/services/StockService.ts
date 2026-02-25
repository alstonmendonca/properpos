// Stock management service

import Decimal from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';
import {
  logger,
  getTenantDatabase,
} from '@properpos/backend-shared';
import { ForecastingEngine, DailySalesPoint } from './ForecastingEngine';

// Local interface definitions for inventory-specific types
interface Stock {
  id?: string;
  productId: string;
  locationId: string;
  currentQuantity: number;
  committedQuantity?: number;
  availableQuantity?: number;
  lowStockThreshold?: number;
  maxStockLevel?: number;
  reorderPoint?: number;
  reorderQuantity?: number;
  averageCost?: number;
  lastMovementDate?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

interface StockMovement {
  id: string;
  productId: string;
  locationId: string;
  movementType: string;
  quantity: number;
  reason: string;
  referenceId?: string;
  fromLocationId?: string;
  toLocationId?: string;
  unitCost?: number;
  notes?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface StockAlert {
  id: string;
  productId: string;
  locationId: string;
  alertType: string;
  severity: string;
  message: string;
  currentQuantity: number;
  threshold: number;
  isActive: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  acknowledgeNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface StockForecast {
  id: string;
  productId: string;
  locationId: string;
  forecastPeriod: number;
  method: string;
  predictedDemand: number;
  recommendedOrder: number;
  confidence: number;
  historicalAverage: number;
  trend: string;
  trendStrength: number;
  seasonality: boolean;
  seasonalPattern?: number[];
  confidenceInterval70: { lower: number; upper: number };
  confidenceInterval90: { lower: number; upper: number };
  generatedAt: Date;
  validUntil: Date;
}

interface InventoryValuation {
  totalValue: number;
  totalQuantity: number;
  totalItems: number;
  lowStockItems: number;
  outOfStockItems: number;
  averageValue: number;
  valuationMethod: string;
  asOfDate: Date;
  breakdown: {
    byCategory: any[];
    byLocation: any[];
  };
}

interface Product {
  id: string;
  name: string;
  sku?: string;
  price?: number;
  cost?: number;
  categoryId?: string;
  description?: string;
}

export class StockService {
  private forecastingEngine = new ForecastingEngine();

  constructor() {}


  /**
   * Get stock levels with filtering and pagination
   */
  async getStock(tenantId: string, filters: {
    page?: number;
    limit?: number;
    locationId?: string;
    productId?: string;
    sku?: string;
    lowStock?: boolean;
    outOfStock?: boolean;
    search?: string;
    categoryId?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    userId?: string;
  } = {}): Promise<{
    stock: Stock[];
    totalCount: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const db = await getTenantDatabase(tenantId);
      const stockCollection = db.collection('stock');
      const productsCollection = db.collection('products');

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
      } = filters;

      // Build aggregation pipeline
      const pipeline: any[] = [];

      // Match stage
      const matchConditions: any = {};

      if (locationId) matchConditions.locationId = locationId;
      if (productId) matchConditions.productId = productId;

      if (lowStock) {
        matchConditions.$expr = {
          $lte: ['$currentQuantity', '$lowStockThreshold']
        };
      }

      if (outOfStock) {
        matchConditions.currentQuantity = { $lte: 0 };
      }

      pipeline.push({ $match: matchConditions });

      // Join with products collection
      pipeline.push({
        $lookup: {
          from: 'products',
          localField: 'productId',
          foreignField: 'id',
          as: 'product'
        }
      });

      pipeline.push({ $unwind: '$product' });

      // Additional filters after product join
      const additionalMatch: any = {};

      if (sku) {
        additionalMatch['product.sku'] = { $regex: sku, $options: 'i' };
      }

      if (search) {
        additionalMatch.$or = [
          { 'product.name': { $regex: search, $options: 'i' } },
          { 'product.sku': { $regex: search, $options: 'i' } },
          { 'product.description': { $regex: search, $options: 'i' } }
        ];
      }

      if (categoryId) {
        additionalMatch['product.categoryId'] = categoryId;
      }

      if (Object.keys(additionalMatch).length > 0) {
        pipeline.push({ $match: additionalMatch });
      }

      // Add computed fields
      pipeline.push({
        $addFields: {
          productName: '$product.name',
          productSku: '$product.sku',
          productPrice: '$product.price',
          stockValue: { $multiply: ['$currentQuantity', '$averageCost'] },
          isLowStock: { $lte: ['$currentQuantity', '$lowStockThreshold'] },
          isOutOfStock: { $lte: ['$currentQuantity', 0] }
        }
      });

      // Count total documents
      const countPipeline = [...pipeline, { $count: 'total' }];
      const [countResult] = await stockCollection.aggregate(countPipeline).toArray();
      const totalCount = countResult?.total || 0;

      // Sort
      const sortStage: any = {};
      sortStage[sortBy] = sortOrder === 'desc' ? -1 : 1;
      pipeline.push({ $sort: sortStage });

      // Pagination
      pipeline.push({ $skip: (page - 1) * limit });
      pipeline.push({ $limit: limit });

      // Execute main query
      const stock = await stockCollection.aggregate(pipeline).toArray();

      return {
        stock,
        totalCount,
        page,
        totalPages: Math.ceil(totalCount / limit),
      };

    } catch (error) {
      logger.error('Get stock error', {
        tenantId,
        filters,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get stock for specific product at location
   */
  async getProductStock(
    tenantId: string,
    productId: string,
    locationId: string,
    options: { includeHistory?: boolean } = {}
  ): Promise<Stock & { movements?: StockMovement[] } | null> {
    try {
      const db = await getTenantDatabase(tenantId);
      const stockCollection = db.collection('stock');

      const stock = await stockCollection.findOne({
        productId,
        locationId
      });

      if (!stock) {
        return null;
      }

      let result: any = stock;

      // Include movement history if requested
      if (options.includeHistory) {
        const movementsCollection = db.collection('stock_movements');
        const movements = await movementsCollection
          .find({ productId, locationId })
          .sort({ createdAt: -1 })
          .limit(50)
          .toArray();

        result.movements = movements;
      }

      return result;

    } catch (error) {
      logger.error('Get product stock error', {
        tenantId,
        productId,
        locationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Update stock level and thresholds
   */
  async updateStock(
    tenantId: string,
    productId: string,
    locationId: string,
    updates: {
      currentQuantity?: number;
      lowStockThreshold?: number;
      maxStockLevel?: number;
      reorderPoint?: number;
      reorderQuantity?: number;
      averageCost?: number;
      notes?: string;
      updatedBy: string;
    }
  ): Promise<void> {
    try {
      const db = await getTenantDatabase(tenantId);
      const stockCollection = db.collection('stock');

      const currentStock = await stockCollection.findOne({
        productId,
        locationId
      });

      if (!currentStock) {
        throw new Error('Stock record not found');
      }

      const updateData: any = {
        ...updates,
        updatedAt: new Date(),
      };

      // Calculate stock change if quantity is being updated
      let quantityChange = 0;
      if (updates.currentQuantity !== undefined) {
        quantityChange = new Decimal(updates.currentQuantity)
          .minus(currentStock.currentQuantity)
          .toNumber();
      }

      await stockCollection.updateOne(
        { productId, locationId },
        { $set: updateData }
      );

      // Record stock movement if quantity changed
      if (quantityChange !== 0) {
        await this.recordStockMovement(tenantId, {
          productId,
          locationId,
          movementType: quantityChange > 0 ? 'adjustment_in' : 'adjustment_out',
          quantity: Math.abs(quantityChange),
          reason: updates.notes || 'Manual adjustment',
          referenceId: `adjustment_${Date.now()}`,
          createdBy: updates.updatedBy,
        });
      }

      // Check for stock alerts
      if (updates.currentQuantity !== undefined) {
        await this.checkAndCreateStockAlerts(tenantId, productId, locationId);
      }

      logger.info('Stock updated', {
        tenantId,
        productId,
        locationId,
        quantityChange,
        updatedBy: updates.updatedBy,
      });

    } catch (error) {
      logger.error('Update stock error', {
        tenantId,
        productId,
        locationId,
        updates,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get stock movements with filtering
   */
  async getStockMovements(tenantId: string, filters: {
    page?: number;
    limit?: number;
    locationId?: string;
    productId?: string;
    movementType?: string;
    startDate?: Date;
    endDate?: Date;
    userId?: string;
    requestingUserId?: string;
  } = {}): Promise<{
    movements: StockMovement[];
    totalCount: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('stock_movements');

      const {
        page = 1,
        limit = 100,
        locationId,
        productId,
        movementType,
        startDate,
        endDate,
        userId
      } = filters;

      const query: any = {};

      if (locationId) query.locationId = locationId;
      if (productId) query.productId = productId;
      if (movementType) query.movementType = movementType;
      if (userId) query.createdBy = userId;

      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = startDate;
        if (endDate) query.createdAt.$lte = endDate;
      }

      const [movements, totalCount] = await Promise.all([
        collection
          .find(query)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .toArray(),
        collection.countDocuments(query),
      ]);

      return {
        movements,
        totalCount,
        page,
        totalPages: Math.ceil(totalCount / limit),
      };

    } catch (error) {
      logger.error('Get stock movements error', {
        tenantId,
        filters,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Record stock movement
   */
  async recordStockMovement(
    tenantId: string,
    data: {
      productId: string;
      locationId: string;
      movementType: string;
      quantity: number;
      reason: string;
      referenceId?: string;
      fromLocationId?: string;
      toLocationId?: string;
      unitCost?: number;
      notes?: string;
      createdBy: string;
    }
  ): Promise<StockMovement> {
    try {
      const db = await getTenantDatabase(tenantId);
      const movementsCollection = db.collection('stock_movements');
      const stockCollection = db.collection('stock');

      const movement: StockMovement = {
        id: uuidv4(),
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await movementsCollection.insertOne(movement);

      // Update stock levels based on movement type
      await this.applyStockMovement(tenantId, movement);

      logger.info('Stock movement recorded', {
        tenantId,
        movementId: movement.id,
        productId: movement.productId,
        locationId: movement.locationId,
        movementType: movement.movementType,
        quantity: movement.quantity,
      });

      return movement;

    } catch (error) {
      logger.error('Record stock movement error', {
        tenantId,
        data,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get stock alerts
   */
  async getStockAlerts(tenantId: string, filters: {
    page?: number;
    limit?: number;
    locationId?: string;
    alertType?: string;
    severity?: string;
    userId?: string;
  } = {}): Promise<{
    alerts: StockAlert[];
    totalCount: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('stock_alerts');

      const {
        page = 1,
        limit = 50,
        locationId,
        alertType,
        severity
      } = filters;

      const query: any = { isActive: true };

      if (locationId) query.locationId = locationId;
      if (alertType) query.alertType = alertType;
      if (severity) query.severity = severity;

      const [alerts, totalCount] = await Promise.all([
        collection
          .find(query)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .toArray(),
        collection.countDocuments(query),
      ]);

      return {
        alerts,
        totalCount,
        page,
        totalPages: Math.ceil(totalCount / limit),
      };

    } catch (error) {
      logger.error('Get stock alerts error', {
        tenantId,
        filters,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Acknowledge stock alert
   */
  async acknowledgeAlert(
    tenantId: string,
    alertId: string,
    data: { acknowledgedBy: string; note?: string }
  ): Promise<void> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('stock_alerts');

      const result = await collection.updateOne(
        { id: alertId },
        {
          $set: {
            isActive: false,
            acknowledgedBy: data.acknowledgedBy,
            acknowledgedAt: new Date(),
            acknowledgeNote: data.note,
            updatedAt: new Date(),
          },
        }
      );

      if (result.matchedCount === 0) {
        throw new Error('Stock alert not found');
      }

      logger.info('Stock alert acknowledged', {
        tenantId,
        alertId,
        acknowledgedBy: data.acknowledgedBy,
      });

    } catch (error) {
      logger.error('Acknowledge stock alert error', {
        tenantId,
        alertId,
        data,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Bulk update stock levels
   */
  async bulkUpdateStock(
    tenantId: string,
    updates: Array<{
      productId: string;
      locationId: string;
      currentQuantity?: number;
      lowStockThreshold?: number;
      maxStockLevel?: number;
      averageCost?: number;
    }>,
    updatedBy: string
  ): Promise<{ successCount: number; failureCount: number; errors: string[] }> {
    try {
      const db = await getTenantDatabase(tenantId);
      const stockCollection = db.collection('stock');

      let successCount = 0;
      let failureCount = 0;
      const errors: string[] = [];

      for (const update of updates) {
        try {
          await this.updateStock(tenantId, update.productId, update.locationId, {
            ...update,
            updatedBy,
          });
          successCount++;
        } catch (error) {
          failureCount++;
          errors.push(`${update.productId}@${update.locationId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      logger.info('Bulk stock update completed', {
        tenantId,
        totalUpdates: updates.length,
        successCount,
        failureCount,
        updatedBy,
      });

      return { successCount, failureCount, errors };

    } catch (error) {
      logger.error('Bulk update stock error', {
        tenantId,
        updatesCount: updates.length,
        updatedBy,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get inventory valuation
   */
  async getInventoryValuation(tenantId: string, filters: {
    locationId?: string;
    categoryId?: string;
    valuationMethod?: string;
    asOfDate?: Date;
    userId?: string;
  } = {}): Promise<InventoryValuation> {
    try {
      const db = await getTenantDatabase(tenantId);
      const stockCollection = db.collection('stock');

      const { locationId, categoryId, valuationMethod = 'fifo', asOfDate } = filters;

      // Build aggregation pipeline
      const pipeline: any[] = [];

      // Match conditions
      const matchConditions: any = {};
      if (locationId) matchConditions.locationId = locationId;

      pipeline.push({ $match: matchConditions });

      // Join with products
      pipeline.push({
        $lookup: {
          from: 'products',
          localField: 'productId',
          foreignField: 'id',
          as: 'product'
        }
      });

      pipeline.push({ $unwind: '$product' });

      // Filter by category if specified
      if (categoryId) {
        pipeline.push({ $match: { 'product.categoryId': categoryId } });
      }

      // Calculate valuations
      pipeline.push({
        $group: {
          _id: null,
          totalItems: { $sum: 1 },
          totalQuantity: { $sum: '$currentQuantity' },
          totalValue: { $sum: { $multiply: ['$currentQuantity', '$averageCost'] } },
          lowStockItems: {
            $sum: {
              $cond: [{ $lte: ['$currentQuantity', '$lowStockThreshold'] }, 1, 0]
            }
          },
          outOfStockItems: {
            $sum: {
              $cond: [{ $lte: ['$currentQuantity', 0] }, 1, 0]
            }
          },
          categories: { $addToSet: '$product.categoryId' },
          locations: { $addToSet: '$locationId' }
        }
      });

      const [result] = await stockCollection.aggregate(pipeline).toArray();

      if (!result) {
        return {
          totalValue: 0,
          totalQuantity: 0,
          totalItems: 0,
          lowStockItems: 0,
          outOfStockItems: 0,
          averageValue: 0,
          valuationMethod,
          asOfDate: asOfDate || new Date(),
          breakdown: {
            byCategory: [],
            byLocation: [],
          }
        };
      }

      const valuation: InventoryValuation = {
        totalValue: parseFloat(new Decimal(result.totalValue || 0).toFixed(2)),
        totalQuantity: result.totalQuantity || 0,
        totalItems: result.totalItems || 0,
        lowStockItems: result.lowStockItems || 0,
        outOfStockItems: result.outOfStockItems || 0,
        averageValue: result.totalItems > 0
          ? parseFloat(new Decimal(result.totalValue).div(result.totalItems).toFixed(2))
          : 0,
        valuationMethod,
        asOfDate: asOfDate || new Date(),
        breakdown: {
          byCategory: [],
          byLocation: [],
        }
      };

      return valuation;

    } catch (error) {
      logger.error('Get inventory valuation error', {
        tenantId,
        filters,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Generate stock demand forecast
   */
  async generateStockForecast(tenantId: string, filters: {
    locationId?: string;
    productId?: string;
    forecastPeriod?: number;
    method?: string;
    userId?: string;
  } = {}): Promise<StockForecast[]> {
    try {
      const db = await getTenantDatabase(tenantId);
      const ordersCollection = db.collection('orders');

      const {
        locationId,
        productId,
        forecastPeriod = 30,
        method = 'moving_average'
      } = filters;

      // Get historical sales data
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - (forecastPeriod * 3)); // 3x period for analysis

      const pipeline: any[] = [
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            status: { $in: ['completed', 'paid'] },
            ...(locationId && { locationId }),
          }
        },
        { $unwind: '$items' },
        {
          $match: {
            ...(productId && { 'items.productId': productId }),
          }
        },
        {
          $group: {
            _id: {
              productId: '$items.productId',
              date: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$createdAt'
                }
              }
            },
            totalQuantity: { $sum: '$items.quantity' },
            totalRevenue: { $sum: '$items.total' }
          }
        },
        {
          $group: {
            _id: '$_id.productId',
            dailySales: {
              $push: {
                date: '$_id.date',
                quantity: '$totalQuantity',
                revenue: '$totalRevenue'
              }
            },
            avgDailyQuantity: { $avg: '$totalQuantity' },
            totalQuantity: { $sum: '$totalQuantity' }
          }
        }
      ];

      const salesData = await ordersCollection.aggregate(pipeline).toArray();

      const forecasts: StockForecast[] = salesData.map((data: any) => {
        const forecast = this.calculateForecast(data, forecastPeriod, method);
        return {
          id: uuidv4(),
          productId: data._id,
          locationId: locationId || 'all',
          forecastPeriod,
          method: forecast.method,
          predictedDemand: forecast.predictedDemand,
          recommendedOrder: forecast.recommendedOrder,
          confidence: forecast.confidence,
          historicalAverage: data.avgDailyQuantity,
          trend: forecast.trend,
          trendStrength: forecast.trendStrength,
          seasonality: forecast.seasonality,
          seasonalPattern: forecast.seasonalPattern,
          confidenceInterval70: forecast.confidenceInterval70,
          confidenceInterval90: forecast.confidenceInterval90,
          generatedAt: new Date(),
          validUntil: new Date(Date.now() + forecastPeriod * 24 * 60 * 60 * 1000),
        };
      });

      return forecasts;

    } catch (error) {
      logger.error('Generate stock forecast error', {
        tenantId,
        filters,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Apply stock movement to update stock levels
   */
  private async applyStockMovement(tenantId: string, movement: StockMovement): Promise<void> {
    try {
      const db = await getTenantDatabase(tenantId);
      const stockCollection = db.collection('stock');

      const stock = await stockCollection.findOne({
        productId: movement.productId,
        locationId: movement.locationId
      });

      if (!stock) {
        // Create new stock record if it doesn't exist
        const newStock: Stock = {
          id: uuidv4(),
          productId: movement.productId,
          locationId: movement.locationId,
          currentQuantity: 0,
          committedQuantity: 0,
          availableQuantity: 0,
          lowStockThreshold: 10,
          maxStockLevel: 1000,
          reorderPoint: 20,
          reorderQuantity: 100,
          averageCost: movement.unitCost || 0,
          lastMovementDate: movement.createdAt,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await stockCollection.insertOne(newStock);
      }

      // Calculate quantity change based on movement type
      let quantityChange = 0;
      const movementQty = new Decimal(movement.quantity);

      switch (movement.movementType) {
        case 'purchase':
        case 'return':
        case 'adjustment_in':
        case 'transfer_in':
          quantityChange = movementQty.toNumber();
          break;
        case 'sale':
        case 'waste':
        case 'adjustment_out':
        case 'transfer_out':
          quantityChange = movementQty.neg().toNumber();
          break;
        default:
          quantityChange = 0;
      }

      // Update stock levels
      const updateData: any = {
        $inc: { currentQuantity: quantityChange },
        $set: {
          lastMovementDate: movement.createdAt,
          updatedAt: new Date(),
        }
      };

      // Update average cost if unit cost provided
      if (movement.unitCost && quantityChange > 0) {
        const currentStock = await stockCollection.findOne({
          productId: movement.productId,
          locationId: movement.locationId
        });

        if (currentStock) {
          const currentValue = new Decimal(currentStock.currentQuantity).mul(currentStock.averageCost);
          const newValue = movementQty.mul(movement.unitCost);
          const totalQuantity = new Decimal(currentStock.currentQuantity).plus(quantityChange);

          if (totalQuantity.gt(0)) {
            const newAverageCost = currentValue.plus(newValue).div(totalQuantity);
            updateData.$set.averageCost = newAverageCost.toNumber();
          }
        }
      }

      await stockCollection.updateOne(
        {
          productId: movement.productId,
          locationId: movement.locationId
        },
        updateData
      );

      // Update available quantity (current - committed)
      await stockCollection.updateOne(
        {
          productId: movement.productId,
          locationId: movement.locationId
        },
        [{
          $set: {
            availableQuantity: {
              $subtract: ['$currentQuantity', '$committedQuantity']
            }
          }
        }]
      );

    } catch (error) {
      logger.error('Apply stock movement error', {
        tenantId,
        movement: movement.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Check and create stock alerts if needed
   */
  private async checkAndCreateStockAlerts(
    tenantId: string,
    productId: string,
    locationId: string
  ): Promise<void> {
    try {
      const db = await getTenantDatabase(tenantId);
      const stockCollection = db.collection('stock');
      const alertsCollection = db.collection('stock_alerts');

      const stock = await stockCollection.findOne({ productId, locationId });
      if (!stock) return;

      const alerts: StockAlert[] = [];

      // Check for out of stock
      if (stock.currentQuantity <= 0) {
        alerts.push({
          id: uuidv4(),
          productId,
          locationId,
          alertType: 'out_of_stock',
          severity: 'critical',
          message: 'Product is out of stock',
          currentQuantity: stock.currentQuantity,
          threshold: 0,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      // Check for low stock
      else if (stock.currentQuantity <= stock.lowStockThreshold) {
        alerts.push({
          id: uuidv4(),
          productId,
          locationId,
          alertType: 'low_stock',
          severity: 'warning',
          message: 'Product stock is running low',
          currentQuantity: stock.currentQuantity,
          threshold: stock.lowStockThreshold,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      // Check for overstock
      if (stock.maxStockLevel > 0 && stock.currentQuantity > stock.maxStockLevel) {
        alerts.push({
          id: uuidv4(),
          productId,
          locationId,
          alertType: 'overstock',
          severity: 'info',
          message: 'Product stock exceeds maximum level',
          currentQuantity: stock.currentQuantity,
          threshold: stock.maxStockLevel,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      // Insert new alerts (avoid duplicates)
      for (const alert of alerts) {
        await alertsCollection.replaceOne(
          {
            productId,
            locationId,
            alertType: alert.alertType,
            isActive: true
          },
          alert,
          { upsert: true }
        );
      }

    } catch (error) {
      logger.error('Check stock alerts error', {
        tenantId,
        productId,
        locationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Don't throw error as this is background processing
    }
  }

  /**
   * Calculate demand forecast using specified method via ForecastingEngine
   */
  private calculateForecast(salesData: any, forecastPeriod: number, method: string) {
    const rawDailySales = salesData.dailySales || [];

    // Convert to DailySalesPoint[]
    const dailySales: DailySalesPoint[] = rawDailySales.map((d: any) => ({
      date: d.date,
      quantity: d.quantity || 0,
      revenue: d.revenue || 0,
    }));

    // Sort by date ascending
    dailySales.sort((a, b) => a.date.localeCompare(b.date));

    switch (method) {
      case 'exponential_smoothing':
        return this.forecastingEngine.exponentialSmoothing(dailySales, forecastPeriod);
      case 'ensemble':
        return this.forecastingEngine.ensemble(dailySales, forecastPeriod);
      default:
        return this.forecastingEngine.weightedMovingAverage(dailySales, forecastPeriod);
    }
  }
}