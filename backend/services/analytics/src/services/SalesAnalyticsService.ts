// Sales analytics service

import Decimal from 'decimal.js';
import moment from 'moment';
import _ from 'lodash';

import {
  logger,
  getTenantDatabase,
  Order,
  OrderItem,
  Customer,
  Product
} from '@properpos/backend-shared';
import { Db } from 'mongodb';

// Type for aggregation result items
interface AggregationResult {
  _id: any;
  [key: string]: any;
}

// Type for hourly breakdown result
interface HourlyBreakdownItem {
  hour: number;
  revenue: number;
  orders: number;
}

// Type for daily breakdown result
interface DailyBreakdownItem {
  day: string;
  revenue: number;
  orders: number;
}

// Type for customer aggregation result
interface CustomerAggregationResult {
  _id: string;
  totalSpent: number;
  totalOrders: number;
  firstOrderDate: Date;
  lastOrderDate: Date;
}

// Type for customer with loyalty
interface CustomerWithLoyalty {
  id: string;
  name?: string;
  loyaltyTier?: string;
  [key: string]: any;
}

export class SalesAnalyticsService {
  constructor() {}

  private async getDb(tenantId: string): Promise<Db> {
    return getTenantDatabase(tenantId);
  }

  /**
   * Get comprehensive sales overview
   */
  async getSalesOverview(tenantId: string, filters: {
    period?: string;
    locationId?: string;
    compareWith?: string;
    startDate?: Date;
    endDate?: Date;
    userId?: string;
  } = {}): Promise<{
    currentPeriod: {
      totalSales: number;
      totalOrders: number;
      averageOrderValue: number;
      totalCustomers: number;
      totalItems: number;
    };
    comparison?: {
      totalSales: { value: number; change: number; changePercent: number };
      totalOrders: { value: number; change: number; changePercent: number };
      averageOrderValue: { value: number; change: number; changePercent: number };
      totalCustomers: { value: number; change: number; changePercent: number };
    };
    period: string;
    dateRange: { startDate: Date; endDate: Date };
  }> {
    try {
      const db = await this.getDb(tenantId);
      const ordersCollection = db.collection<Order>('orders');

      const { startDate, endDate } = this.getDateRange(filters.period, filters.startDate, filters.endDate);

      // Build base query
      const baseQuery: any = {
        createdAt: { $gte: startDate, $lte: endDate },
        status: { $in: ['completed', 'paid'] }
      };

      if (filters.locationId) {
        baseQuery.locationId = filters.locationId;
      }

      // Get current period data
      const currentPeriod = await this.calculatePeriodMetrics(ordersCollection, baseQuery);

      let comparison: any = undefined;

      // Get comparison data if requested
      if (filters.compareWith) {
        const comparisonDateRange = this.getComparisonDateRange(
          filters.compareWith,
          startDate,
          endDate,
          filters.period
        );

        const comparisonQuery = {
          ...baseQuery,
          createdAt: { $gte: comparisonDateRange.startDate, $lte: comparisonDateRange.endDate }
        };

        const previousPeriod = await this.calculatePeriodMetrics(ordersCollection, comparisonQuery);

        comparison = {
          totalSales: this.calculateChange(currentPeriod.totalSales, previousPeriod.totalSales),
          totalOrders: this.calculateChange(currentPeriod.totalOrders, previousPeriod.totalOrders),
          averageOrderValue: this.calculateChange(currentPeriod.averageOrderValue, previousPeriod.averageOrderValue),
          totalCustomers: this.calculateChange(currentPeriod.totalCustomers, previousPeriod.totalCustomers),
        };
      }

      return {
        currentPeriod,
        comparison,
        period: filters.period || 'today',
        dateRange: { startDate, endDate },
      };

    } catch (error) {
      logger.error('Get sales overview error', {
        tenantId,
        filters,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get sales trends over time
   */
  async getSalesTrends(tenantId: string, filters: {
    period?: string;
    granularity?: string;
    locationId?: string;
    categoryId?: string;
    productId?: string;
    startDate?: Date;
    endDate?: Date;
    userId?: string;
  } = {}): Promise<{
    data: Array<{
      date: string;
      totalSales: number;
      totalOrders: number;
      averageOrderValue: number;
    }>;
    summary: {
      totalSales: number;
      totalOrders: number;
      averageOrderValue: number;
      trend: 'increasing' | 'decreasing' | 'stable';
    };
  }> {
    try {
      const db = await this.getDb(tenantId);
      const ordersCollection = db.collection<Order>('orders');

      const { startDate, endDate } = this.getDateRange(filters.period, filters.startDate, filters.endDate);
      const granularity = filters.granularity || 'day';

      // Build aggregation pipeline
      const pipeline: any[] = [
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            status: { $in: ['completed', 'paid'] },
            ...(filters.locationId && { locationId: filters.locationId }),
          }
        }
      ];

      // Add product/category filters if specified
      if (filters.productId || filters.categoryId) {
        pipeline.push({ $unwind: '$items' });

        if (filters.productId) {
          pipeline.push({ $match: { 'items.productId': filters.productId } });
        }

        if (filters.categoryId) {
          pipeline.push({
            $lookup: {
              from: 'products',
              localField: 'items.productId',
              foreignField: 'id',
              as: 'product'
            }
          });
          pipeline.push({ $match: { 'product.categoryId': filters.categoryId } });
        }

        // Re-group by order
        pipeline.push({
          $group: {
            _id: '$_id',
            createdAt: { $first: '$createdAt' },
            total: { $first: '$total' },
            items: { $push: '$items' }
          }
        });
      }

      // Group by time period
      const dateFormat = this.getDateFormat(granularity);
      pipeline.push({
        $group: {
          _id: {
            $dateToString: {
              format: dateFormat,
              date: '$createdAt'
            }
          },
          totalSales: { $sum: '$total' },
          totalOrders: { $sum: 1 },
          averageOrderValue: { $avg: '$total' }
        }
      });

      pipeline.push({ $sort: { '_id': 1 } });

      const results = await ordersCollection.aggregate(pipeline).toArray() as AggregationResult[];

      // Format data
      const data = results.map((item) => ({
        date: item._id,
        totalSales: parseFloat(new Decimal(item.totalSales).toFixed(2)),
        totalOrders: item.totalOrders,
        averageOrderValue: parseFloat(new Decimal(item.averageOrderValue).toFixed(2)),
      }));

      // Calculate summary and trend
      const totalSales = data.reduce((sum, item) => sum + item.totalSales, 0);
      const totalOrders = data.reduce((sum, item) => sum + item.totalOrders, 0);
      const averageOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;

      // Simple trend calculation
      let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
      if (data.length > 2) {
        const firstHalf = data.slice(0, Math.floor(data.length / 2));
        const secondHalf = data.slice(Math.floor(data.length / 2));

        const firstHalfAvg = firstHalf.reduce((sum, item) => sum + item.totalSales, 0) / firstHalf.length;
        const secondHalfAvg = secondHalf.reduce((sum, item) => sum + item.totalSales, 0) / secondHalf.length;

        if (secondHalfAvg > firstHalfAvg * 1.1) {
          trend = 'increasing';
        } else if (secondHalfAvg < firstHalfAvg * 0.9) {
          trend = 'decreasing';
        }
      }

      return {
        data,
        summary: {
          totalSales: parseFloat(new Decimal(totalSales).toFixed(2)),
          totalOrders,
          averageOrderValue: parseFloat(new Decimal(averageOrderValue).toFixed(2)),
          trend,
        },
      };

    } catch (error) {
      logger.error('Get sales trends error', {
        tenantId,
        filters,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get top-selling products
   */
  async getTopProducts(tenantId: string, filters: {
    period?: string;
    limit?: number;
    locationId?: string;
    categoryId?: string;
    sortBy?: string;
    startDate?: Date;
    endDate?: Date;
    userId?: string;
  } = {}): Promise<Array<{
    productId: string;
    productName: string;
    sku: string;
    categoryName?: string;
    totalQuantity: number;
    totalRevenue: number;
    totalOrders: number;
    averagePrice: number;
    averageQuantityPerOrder: number;
  }>> {
    try {
      const db = await this.getDb(tenantId);
      const ordersCollection = db.collection<Order>('orders');

      const { startDate, endDate } = this.getDateRange(filters.period, filters.startDate, filters.endDate);
      const limit = filters.limit || 10;
      const sortBy = filters.sortBy || 'revenue';

      const pipeline: any[] = [
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            status: { $in: ['completed', 'paid'] },
            ...(filters.locationId && { locationId: filters.locationId }),
          }
        },
        { $unwind: '$items' },
        {
          $lookup: {
            from: 'products',
            localField: 'items.productId',
            foreignField: 'id',
            as: 'product'
          }
        },
        { $unwind: '$product' }
      ];

      // Add category filter if specified
      if (filters.categoryId) {
        pipeline.push({ $match: { 'product.categoryId': filters.categoryId } });
      }

      // Group by product
      pipeline.push({
        $group: {
          _id: '$items.productId',
          productName: { $first: '$product.name' },
          sku: { $first: '$product.sku' },
          categoryName: { $first: '$product.categoryName' },
          totalQuantity: { $sum: '$items.quantity' },
          totalRevenue: { $sum: '$items.total' },
          totalOrders: { $sum: 1 },
          averagePrice: { $avg: '$items.price' },
          averageQuantityPerOrder: { $avg: '$items.quantity' },
        }
      });

      // Sort by specified metric
      const sortField = sortBy === 'quantity' ? 'totalQuantity' :
                       sortBy === 'orders' ? 'totalOrders' : 'totalRevenue';

      pipeline.push({ $sort: { [sortField]: -1 } });
      pipeline.push({ $limit: limit });

      const results = await ordersCollection.aggregate(pipeline).toArray() as AggregationResult[];

      return results.map((item) => ({
        productId: item._id,
        productName: item.productName,
        sku: item.sku,
        categoryName: item.categoryName,
        totalQuantity: item.totalQuantity,
        totalRevenue: parseFloat(new Decimal(item.totalRevenue).toFixed(2)),
        totalOrders: item.totalOrders,
        averagePrice: parseFloat(new Decimal(item.averagePrice).toFixed(2)),
        averageQuantityPerOrder: parseFloat(new Decimal(item.averageQuantityPerOrder).toFixed(2)),
      }));

    } catch (error) {
      logger.error('Get top products error', {
        tenantId,
        filters,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get sales breakdown by category
   */
  async getSalesByCategory(tenantId: string, filters: {
    period?: string;
    locationId?: string;
    includeSubcategories?: boolean;
    startDate?: Date;
    endDate?: Date;
    userId?: string;
  } = {}): Promise<Array<{
    categoryId: string;
    categoryName: string;
    totalRevenue: number;
    totalQuantity: number;
    totalOrders: number;
    averageOrderValue: number;
    percentage: number;
  }>> {
    try {
      const db = await this.getDb(tenantId);
      const ordersCollection = db.collection<Order>('orders');

      const { startDate, endDate } = this.getDateRange(filters.period, filters.startDate, filters.endDate);

      const pipeline: any[] = [
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            status: { $in: ['completed', 'paid'] },
            ...(filters.locationId && { locationId: filters.locationId }),
          }
        },
        { $unwind: '$items' },
        {
          $lookup: {
            from: 'products',
            localField: 'items.productId',
            foreignField: 'id',
            as: 'product'
          }
        },
        { $unwind: '$product' },
        {
          $lookup: {
            from: 'categories',
            localField: 'product.categoryId',
            foreignField: 'id',
            as: 'category'
          }
        },
        { $unwind: '$category' },
        {
          $group: {
            _id: '$product.categoryId',
            categoryName: { $first: '$category.name' },
            totalRevenue: { $sum: '$items.total' },
            totalQuantity: { $sum: '$items.quantity' },
            orders: { $addToSet: '$_id' },
          }
        },
        {
          $addFields: {
            totalOrders: { $size: '$orders' },
            averageOrderValue: { $divide: ['$totalRevenue', { $size: '$orders' }] }
          }
        },
        { $sort: { totalRevenue: -1 } }
      ];

      const results = await ordersCollection.aggregate(pipeline).toArray() as AggregationResult[];

      // Calculate total revenue for percentage calculation
      const totalRevenue = results.reduce((sum, item) => sum + item.totalRevenue, 0);

      return results.map((item) => ({
        categoryId: item._id,
        categoryName: item.categoryName,
        totalRevenue: parseFloat(new Decimal(item.totalRevenue).toFixed(2)),
        totalQuantity: item.totalQuantity,
        totalOrders: item.totalOrders,
        averageOrderValue: parseFloat(new Decimal(item.averageOrderValue).toFixed(2)),
        percentage: totalRevenue > 0
          ? parseFloat(new Decimal(item.totalRevenue).div(totalRevenue).mul(100).toFixed(2))
          : 0,
      }));

    } catch (error) {
      logger.error('Get sales by category error', {
        tenantId,
        filters,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get sales breakdown by location
   */
  async getSalesByLocation(tenantId: string, filters: {
    period?: string;
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<Array<{
    locationId: string;
    locationName: string;
    totalRevenue: number;
    totalOrders: number;
    averageOrderValue: number;
    percentage: number;
    topProducts: Array<{ productId: string; productName: string; revenue: number }>;
  }>> {
    try {
      const db = await this.getDb(tenantId);
      const ordersCollection = db.collection<Order>('orders');
      const locationsCollection = db.collection('locations');

      const { startDate, endDate } = this.getDateRange(filters.period, filters.startDate, filters.endDate);

      const pipeline: any[] = [
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            status: { $in: ['completed', 'paid'] }
          }
        },
        {
          $group: {
            _id: '$locationId',
            totalRevenue: { $sum: '$total' },
            totalOrders: { $sum: 1 },
            averageOrderValue: { $avg: '$total' },
            orders: { $push: '$$ROOT' }
          }
        },
        { $sort: { totalRevenue: -1 } }
      ];

      const results = await ordersCollection.aggregate(pipeline).toArray() as AggregationResult[];

      // Get location names
      const locationIds = results.map(item => item._id);
      const locations = await locationsCollection
        .find({ id: { $in: locationIds } })
        .toArray() as AggregationResult[];

      const locationMap = new Map(locations.map(loc => [loc.id, loc.name]));

      // Calculate total revenue for percentages
      const totalRevenue = results.reduce((sum, item) => sum + item.totalRevenue, 0);

      // Process each location
      const locationData = await Promise.all(results.map(async (item) => {
        // Get top products for this location
        const topProducts = await this.getTopProductsForLocation(
          ordersCollection,
          item._id,
          startDate,
          endDate
        );

        return {
          locationId: item._id,
          locationName: locationMap.get(item._id) || 'Unknown Location',
          totalRevenue: parseFloat(new Decimal(item.totalRevenue).toFixed(2)),
          totalOrders: item.totalOrders,
          averageOrderValue: parseFloat(new Decimal(item.averageOrderValue).toFixed(2)),
          percentage: totalRevenue > 0
            ? parseFloat(new Decimal(item.totalRevenue).div(totalRevenue).mul(100).toFixed(2))
            : 0,
          topProducts: topProducts.slice(0, 5), // Top 5 products per location
        };
      }));

      return locationData;

    } catch (error) {
      logger.error('Get sales by location error', {
        tenantId,
        filters,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get sales breakdown by time periods
   */
  async getSalesByTime(tenantId: string, filters: {
    period?: string;
    timeUnit?: string;
    locationId?: string;
    startDate?: Date;
    endDate?: Date;
    userId?: string;
  } = {}): Promise<{
    hourlyBreakdown?: Array<{ hour: number; revenue: number; orders: number }>;
    dailyBreakdown?: Array<{ day: string; revenue: number; orders: number }>;
    weeklyBreakdown?: Array<{ week: number; revenue: number; orders: number }>;
    monthlyBreakdown?: Array<{ month: string; revenue: number; orders: number }>;
    insights: {
      peakHour?: number;
      peakDay?: string;
      slowestHour?: number;
      slowestDay?: string;
    };
  }> {
    try {
      const db = await this.getDb(tenantId);
      const ordersCollection = db.collection<Order>('orders');

      const { startDate, endDate } = this.getDateRange(filters.period, filters.startDate, filters.endDate);
      const timeUnit = filters.timeUnit || 'hour';

      const baseMatch = {
        createdAt: { $gte: startDate, $lte: endDate },
        status: { $in: ['completed', 'paid'] },
        ...(filters.locationId && { locationId: filters.locationId }),
      };

      let breakdown: any = {};
      let insights: any = {};

      switch (timeUnit) {
        case 'hour':
          breakdown.hourlyBreakdown = await this.getHourlyBreakdown(ordersCollection, baseMatch);
          const peakHour = _.maxBy(breakdown.hourlyBreakdown, 'revenue') as HourlyBreakdownItem | undefined;
          const slowestHour = _.minBy(breakdown.hourlyBreakdown, 'revenue') as HourlyBreakdownItem | undefined;
          insights.peakHour = peakHour?.hour;
          insights.slowestHour = slowestHour?.hour;
          break;

        case 'day':
          breakdown.dailyBreakdown = await this.getDailyBreakdown(ordersCollection, baseMatch);
          const peakDay = _.maxBy(breakdown.dailyBreakdown, 'revenue') as DailyBreakdownItem | undefined;
          const slowestDay = _.minBy(breakdown.dailyBreakdown, 'revenue') as DailyBreakdownItem | undefined;
          insights.peakDay = peakDay?.day;
          insights.slowestDay = slowestDay?.day;
          break;

        case 'week':
          breakdown.weeklyBreakdown = await this.getWeeklyBreakdown(ordersCollection, baseMatch);
          break;

        case 'month':
          breakdown.monthlyBreakdown = await this.getMonthlyBreakdown(ordersCollection, baseMatch);
          break;
      }

      return {
        ...breakdown,
        insights,
      };

    } catch (error) {
      logger.error('Get sales by time error', {
        tenantId,
        filters,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get sales performance metrics
   */
  async getSalesPerformance(tenantId: string, filters: {
    period?: string;
    compareWith?: string;
    locationId?: string;
    target?: number;
    startDate?: Date;
    endDate?: Date;
    userId?: string;
  } = {}): Promise<{
    current: {
      revenue: number;
      orders: number;
      averageOrderValue: number;
      itemsSold: number;
    };
    comparison: {
      revenue: { change: number; changePercent: number };
      orders: { change: number; changePercent: number };
      averageOrderValue: { change: number; changePercent: number };
      itemsSold: { change: number; changePercent: number };
    };
    target?: {
      revenue: { target: number; achieved: number; percentage: number };
    };
    performance: 'excellent' | 'good' | 'average' | 'poor';
  }> {
    try {
      const db = await this.getDb(tenantId);
      const ordersCollection = db.collection<Order>('orders');

      const { startDate, endDate } = this.getDateRange(filters.period, filters.startDate, filters.endDate);

      const baseQuery: any = {
        createdAt: { $gte: startDate, $lte: endDate },
        status: { $in: ['completed', 'paid'] }
      };

      if (filters.locationId) {
        baseQuery.locationId = filters.locationId;
      }

      // Get current period metrics
      const current = await this.calculatePeriodMetrics(ordersCollection, baseQuery);

      // Get comparison data
      let comparison: any = {};
      if (filters.compareWith) {
        const comparisonDateRange = this.getComparisonDateRange(
          filters.compareWith,
          startDate,
          endDate,
          filters.period
        );

        const comparisonQuery = {
          ...baseQuery,
          createdAt: { $gte: comparisonDateRange.startDate, $lte: comparisonDateRange.endDate }
        };

        const previous = await this.calculatePeriodMetrics(ordersCollection, comparisonQuery);

        comparison = {
          revenue: this.calculateChange(current.totalSales, previous.totalSales),
          orders: this.calculateChange(current.totalOrders, previous.totalOrders),
          averageOrderValue: this.calculateChange(current.averageOrderValue, previous.averageOrderValue),
          itemsSold: this.calculateChange(current.totalItems, previous.totalItems),
        };
      }

      // Calculate target achievement
      let target: any = undefined;
      if (filters.target) {
        const percentage = (current.totalSales / filters.target) * 100;
        target = {
          revenue: {
            target: filters.target,
            achieved: current.totalSales,
            percentage: parseFloat(percentage.toFixed(2)),
          },
        };
      }

      // Determine performance level
      let performance: 'excellent' | 'good' | 'average' | 'poor' = 'average';
      if (comparison.revenue?.changePercent) {
        const changePercent = comparison.revenue.changePercent;
        if (changePercent > 20) performance = 'excellent';
        else if (changePercent > 10) performance = 'good';
        else if (changePercent > 0) performance = 'average';
        else performance = 'poor';
      }

      return {
        current: {
          revenue: current.totalSales,
          orders: current.totalOrders,
          averageOrderValue: current.averageOrderValue,
          itemsSold: current.totalItems,
        },
        comparison,
        target,
        performance,
      };

    } catch (error) {
      logger.error('Get sales performance error', {
        tenantId,
        filters,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get conversion metrics
   */
  async getConversionMetrics(tenantId: string, filters: {
    period?: string;
    locationId?: string;
    startDate?: Date;
    endDate?: Date;
    userId?: string;
  } = {}): Promise<{
    totalSessions: number;
    completedOrders: number;
    conversionRate: number;
    abandonedCarts: number;
    abandonmentRate: number;
    averageSessionValue: number;
    topExitPoints: Array<{ step: string; exits: number; rate: number }>;
  }> {
    try {
      // This is a placeholder implementation
      // In a real system, you'd track user sessions and cart abandonment
      const db = await this.getDb(tenantId);
      const ordersCollection = db.collection<Order>('orders');

      const { startDate, endDate } = this.getDateRange(filters.period, filters.startDate, filters.endDate);

      const baseQuery: any = {
        createdAt: { $gte: startDate, $lte: endDate }
      };

      if (filters.locationId) {
        baseQuery.locationId = filters.locationId;
      }

      const totalOrders = await ordersCollection.countDocuments(baseQuery);
      const completedOrders = await ordersCollection.countDocuments({
        ...baseQuery,
        status: { $in: ['completed', 'paid'] }
      });

      const cancelledOrders = await ordersCollection.countDocuments({
        ...baseQuery,
        status: 'cancelled'
      });

      // Placeholder calculations
      const totalSessions = Math.floor(totalOrders * 1.5); // Estimate based on orders
      const conversionRate = totalSessions > 0 ? (completedOrders / totalSessions) * 100 : 0;
      const abandonmentRate = totalOrders > 0 ? (cancelledOrders / totalOrders) * 100 : 0;

      return {
        totalSessions,
        completedOrders,
        conversionRate: parseFloat(conversionRate.toFixed(2)),
        abandonedCarts: cancelledOrders,
        abandonmentRate: parseFloat(abandonmentRate.toFixed(2)),
        averageSessionValue: 0, // Would need session tracking
        topExitPoints: [], // Would need detailed session tracking
      };

    } catch (error) {
      logger.error('Get conversion metrics error', {
        tenantId,
        filters,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get customer analysis
   */
  async getCustomerAnalysis(tenantId: string, filters: {
    period?: string;
    locationId?: string;
    segment?: string;
    startDate?: Date;
    endDate?: Date;
    userId?: string;
  } = {}): Promise<{
    totalCustomers: number;
    newCustomers: number;
    returningCustomers: number;
    averageOrdersPerCustomer: number;
    averageRevenuePerCustomer: number;
    customerLifetimeValue: number;
    loyaltyDistribution: {
      bronze: number;
      silver: number;
      gold: number;
      platinum: number;
    };
    topCustomers: Array<{
      customerId: string;
      customerName: string;
      totalSpent: number;
      totalOrders: number;
      lastOrderDate: Date;
    }>;
  }> {
    try {
      const db = await this.getDb(tenantId);
      const ordersCollection = db.collection<Order>('orders');
      const customersCollection = db.collection<Customer>('customers');

      const { startDate, endDate } = this.getDateRange(filters.period, filters.startDate, filters.endDate);

      const baseQuery: any = {
        createdAt: { $gte: startDate, $lte: endDate },
        status: { $in: ['completed', 'paid'] }
      };

      if (filters.locationId) {
        baseQuery.locationId = filters.locationId;
      }

      // Customer analysis pipeline
      const pipeline: any[] = [
        { $match: baseQuery },
        { $match: { customerId: { $exists: true, $ne: null } } },
        {
          $group: {
            _id: '$customerId',
            totalSpent: { $sum: '$total' },
            totalOrders: { $sum: 1 },
            firstOrderDate: { $min: '$createdAt' },
            lastOrderDate: { $max: '$createdAt' }
          }
        }
      ];

      const customerData = await ordersCollection.aggregate(pipeline).toArray() as CustomerAggregationResult[];

      // Get customer details
      const customerIds = customerData.map(item => item._id);
      const customers = await customersCollection
        .find({ id: { $in: customerIds } })
        .toArray() as CustomerWithLoyalty[];

      const customerMap = new Map(customers.map((cust) => [cust.id, cust]));

      // Calculate metrics
      const totalCustomers = customerData.length;
      const newCustomers = customerData.filter((item) =>
        moment(item.firstOrderDate).isSame(moment(item.lastOrderDate), 'day')
      ).length;
      const returningCustomers = totalCustomers - newCustomers;

      const totalRevenue = customerData.reduce((sum, item) => sum + item.totalSpent, 0);
      const totalOrders = customerData.reduce((sum, item) => sum + item.totalOrders, 0);

      const averageOrdersPerCustomer = totalCustomers > 0 ? totalOrders / totalCustomers : 0;
      const averageRevenuePerCustomer = totalCustomers > 0 ? totalRevenue / totalCustomers : 0;

      // Get loyalty distribution
      const loyaltyDistribution = {
        bronze: customers.filter((c) => c.loyaltyTier === 'bronze').length,
        silver: customers.filter((c) => c.loyaltyTier === 'silver').length,
        gold: customers.filter((c) => c.loyaltyTier === 'gold').length,
        platinum: customers.filter((c) => c.loyaltyTier === 'platinum').length,
      };

      // Get top customers
      const topCustomers = customerData
        .sort((a, b) => b.totalSpent - a.totalSpent)
        .slice(0, 10)
        .map((item) => {
          const customer = customerMap.get(item._id);
          return {
            customerId: item._id,
            customerName: customer?.name || 'Unknown Customer',
            totalSpent: parseFloat(new Decimal(item.totalSpent).toFixed(2)),
            totalOrders: item.totalOrders,
            lastOrderDate: item.lastOrderDate,
          };
        });

      return {
        totalCustomers,
        newCustomers,
        returningCustomers,
        averageOrdersPerCustomer: parseFloat(averageOrdersPerCustomer.toFixed(2)),
        averageRevenuePerCustomer: parseFloat(new Decimal(averageRevenuePerCustomer).toFixed(2)),
        customerLifetimeValue: parseFloat(new Decimal(averageRevenuePerCustomer * 2.5).toFixed(2)), // Estimate
        loyaltyDistribution,
        topCustomers,
      };

    } catch (error) {
      logger.error('Get customer analysis error', {
        tenantId,
        filters,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get real-time sales data
   */
  async getRealTimeSales(tenantId: string, filters: {
    locationId?: string;
    userId?: string;
  } = {}): Promise<{
    todaySales: number;
    todayOrders: number;
    hourlyRevenue: Array<{ hour: number; revenue: number }>;
    recentOrders: Array<{
      orderId: string;
      orderNumber: string;
      total: number;
      createdAt: Date;
      customerName?: string;
    }>;
    currentHourRevenue: number;
    currentHourOrders: number;
  }> {
    try {
      const db = await this.getDb(tenantId);
      const ordersCollection = db.collection<Order>('orders');

      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());

      const baseQuery: any = {
        status: { $in: ['completed', 'paid'] }
      };

      if (filters.locationId) {
        baseQuery.locationId = filters.locationId;
      }

      // Today's sales
      const todayQuery = {
        ...baseQuery,
        createdAt: { $gte: startOfDay }
      };

      const todayStats = await ordersCollection.aggregate([
        { $match: todayQuery },
        {
          $group: {
            _id: null,
            totalSales: { $sum: '$total' },
            totalOrders: { $sum: 1 }
          }
        }
      ]).toArray();

      const todaySales = todayStats[0]?.totalSales || 0;
      const todayOrders = todayStats[0]?.totalOrders || 0;

      // Current hour sales
      const currentHourQuery = {
        ...baseQuery,
        createdAt: { $gte: startOfHour }
      };

      const currentHourStats = await ordersCollection.aggregate([
        { $match: currentHourQuery },
        {
          $group: {
            _id: null,
            totalSales: { $sum: '$total' },
            totalOrders: { $sum: 1 }
          }
        }
      ]).toArray();

      const currentHourRevenue = currentHourStats[0]?.totalSales || 0;
      const currentHourOrders = currentHourStats[0]?.totalOrders || 0;

      // Hourly breakdown for today
      const hourlyBreakdown = await this.getHourlyBreakdown(ordersCollection, {
        ...baseQuery,
        createdAt: { $gte: startOfDay }
      });

      // Recent orders
      const recentOrders = await ordersCollection
        .find(baseQuery)
        .sort({ createdAt: -1 })
        .limit(10)
        .toArray();

      const formattedRecentOrders = recentOrders.map((order) => ({
        orderId: order.id,
        orderNumber: order.orderNumber,
        total: order.pricing.total,
        createdAt: order.createdAt,
        customerName: order.customer?.name,
      }));

      return {
        todaySales: parseFloat(new Decimal(todaySales).toFixed(2)),
        todayOrders,
        hourlyRevenue: hourlyBreakdown,
        recentOrders: formattedRecentOrders,
        currentHourRevenue: parseFloat(new Decimal(currentHourRevenue).toFixed(2)),
        currentHourOrders,
      };

    } catch (error) {
      logger.error('Get real-time sales error', {
        tenantId,
        filters,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  // Private helper methods

  private getDateRange(period?: string, startDate?: Date, endDate?: Date): { startDate: Date; endDate: Date } {
    if (startDate && endDate) {
      return { startDate, endDate };
    }

    const now = moment();
    let start: moment.Moment;
    let end = moment();

    switch (period) {
      case 'today':
        start = moment().startOf('day');
        break;
      case 'yesterday':
        start = moment().subtract(1, 'day').startOf('day');
        end = moment().subtract(1, 'day').endOf('day');
        break;
      case 'week':
        start = moment().startOf('week');
        break;
      case 'last_week':
        start = moment().subtract(1, 'week').startOf('week');
        end = moment().subtract(1, 'week').endOf('week');
        break;
      case 'month':
        start = moment().startOf('month');
        break;
      case 'last_month':
        start = moment().subtract(1, 'month').startOf('month');
        end = moment().subtract(1, 'month').endOf('month');
        break;
      case 'year':
        start = moment().startOf('year');
        break;
      default:
        start = moment().startOf('day');
    }

    return {
      startDate: start.toDate(),
      endDate: end.toDate(),
    };
  }

  private getComparisonDateRange(
    compareWith: string,
    currentStart: Date,
    currentEnd: Date,
    period?: string
  ): { startDate: Date; endDate: Date } {
    const duration = moment(currentEnd).diff(moment(currentStart), 'milliseconds');

    switch (compareWith) {
      case 'previous_period':
        return {
          startDate: moment(currentStart).subtract(duration, 'milliseconds').toDate(),
          endDate: moment(currentStart).subtract(1, 'millisecond').toDate(),
        };
      case 'previous_year':
        return {
          startDate: moment(currentStart).subtract(1, 'year').toDate(),
          endDate: moment(currentEnd).subtract(1, 'year').toDate(),
        };
      default:
        return this.getDateRange(compareWith);
    }
  }

  private getDateFormat(granularity: string): string {
    switch (granularity) {
      case 'hour':
        return '%Y-%m-%d %H:00';
      case 'day':
        return '%Y-%m-%d';
      case 'week':
        return '%Y-W%U';
      case 'month':
        return '%Y-%m';
      case 'year':
        return '%Y';
      default:
        return '%Y-%m-%d';
    }
  }

  private async calculatePeriodMetrics(collection: any, query: any): Promise<{
    totalSales: number;
    totalOrders: number;
    averageOrderValue: number;
    totalCustomers: number;
    totalItems: number;
  }> {
    const pipeline = [
      { $match: query },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$total' },
          totalOrders: { $sum: 1 },
          totalItems: { $sum: { $size: '$items' } },
          uniqueCustomers: { $addToSet: '$customerId' }
        }
      }
    ];

    const [result] = await collection.aggregate(pipeline).toArray();

    if (!result) {
      return {
        totalSales: 0,
        totalOrders: 0,
        averageOrderValue: 0,
        totalCustomers: 0,
        totalItems: 0,
      };
    }

    const totalCustomers = result.uniqueCustomers.filter((id: any) => id != null).length;
    const averageOrderValue = result.totalOrders > 0 ? result.totalSales / result.totalOrders : 0;

    return {
      totalSales: parseFloat(new Decimal(result.totalSales).toFixed(2)),
      totalOrders: result.totalOrders,
      averageOrderValue: parseFloat(new Decimal(averageOrderValue).toFixed(2)),
      totalCustomers,
      totalItems: result.totalItems,
    };
  }

  private calculateChange(current: number, previous: number): {
    value: number;
    change: number;
    changePercent: number;
  } {
    const change = current - previous;
    const changePercent = previous !== 0 ? (change / previous) * 100 : 0;

    return {
      value: previous,
      change: parseFloat(new Decimal(change).toFixed(2)),
      changePercent: parseFloat(new Decimal(changePercent).toFixed(2)),
    };
  }

  private async getTopProductsForLocation(
    collection: any,
    locationId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Array<{ productId: string; productName: string; revenue: number }>> {
    const pipeline = [
      {
        $match: {
          locationId,
          createdAt: { $gte: startDate, $lte: endDate },
          status: { $in: ['completed', 'paid'] }
        }
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          productName: { $first: '$items.name' },
          revenue: { $sum: '$items.total' }
        }
      },
      { $sort: { revenue: -1 } },
      { $limit: 5 }
    ];

    const results = await collection.aggregate(pipeline).toArray() as AggregationResult[];

    return results.map((item) => ({
      productId: item._id,
      productName: item.productName,
      revenue: parseFloat(new Decimal(item.revenue).toFixed(2)),
    }));
  }

  private async getHourlyBreakdown(collection: any, baseMatch: any): Promise<Array<{
    hour: number;
    revenue: number;
    orders: number;
  }>> {
    const pipeline = [
      { $match: baseMatch },
      {
        $group: {
          _id: { $hour: '$createdAt' },
          revenue: { $sum: '$total' },
          orders: { $sum: 1 }
        }
      },
      { $sort: { '_id': 1 } }
    ];

    const results = await collection.aggregate(pipeline).toArray() as AggregationResult[];

    // Fill in missing hours with 0 values
    const hourlyData = Array.from({ length: 24 }, (_, hour) => {
      const data = results.find((item) => item._id === hour);
      return {
        hour,
        revenue: data ? parseFloat(new Decimal(data.revenue).toFixed(2)) : 0,
        orders: data ? data.orders : 0,
      };
    });

    return hourlyData;
  }

  private async getDailyBreakdown(collection: any, baseMatch: any): Promise<Array<{
    day: string;
    revenue: number;
    orders: number;
  }>> {
    const pipeline = [
      { $match: baseMatch },
      {
        $group: {
          _id: { $dayOfWeek: '$createdAt' },
          revenue: { $sum: '$total' },
          orders: { $sum: 1 }
        }
      },
      { $sort: { '_id': 1 } }
    ];

    const results = await collection.aggregate(pipeline).toArray() as AggregationResult[];
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    return dayNames.map((dayName, index) => {
      const dayOfWeek = index === 0 ? 7 : index; // MongoDB uses 1-7 for Sunday-Saturday
      const data = results.find((item) => item._id === dayOfWeek);
      return {
        day: dayName,
        revenue: data ? parseFloat(new Decimal(data.revenue).toFixed(2)) : 0,
        orders: data ? data.orders : 0,
      };
    });
  }

  private async getWeeklyBreakdown(collection: any, baseMatch: any): Promise<Array<{
    week: number;
    revenue: number;
    orders: number;
  }>> {
    const pipeline = [
      { $match: baseMatch },
      {
        $group: {
          _id: { $week: '$createdAt' },
          revenue: { $sum: '$total' },
          orders: { $sum: 1 }
        }
      },
      { $sort: { '_id': 1 } }
    ];

    const results = await collection.aggregate(pipeline).toArray() as AggregationResult[];

    return results.map((item) => ({
      week: item._id,
      revenue: parseFloat(new Decimal(item.revenue).toFixed(2)),
      orders: item.orders,
    }));
  }

  private async getMonthlyBreakdown(collection: any, baseMatch: any): Promise<Array<{
    month: string;
    revenue: number;
    orders: number;
  }>> {
    const pipeline = [
      { $match: baseMatch },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          revenue: { $sum: '$total' },
          orders: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ];

    const results = await collection.aggregate(pipeline).toArray() as AggregationResult[];

    return results.map((item) => ({
      month: `${item._id.year}-${String(item._id.month).padStart(2, '0')}`,
      revenue: parseFloat(new Decimal(item.revenue).toFixed(2)),
      orders: item.orders,
    }));
  }
}