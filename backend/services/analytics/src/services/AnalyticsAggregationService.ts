// Analytics Aggregation Service for scheduled data processing

import Decimal from 'decimal.js';
import moment from 'moment';

import {
  logger,
  DatabaseService,
} from '@properpos/backend-shared';

export interface DailyAggregation {
  tenantId: string;
  locationId: string;
  date: Date;
  dateString: string;
  metrics: {
    totalRevenue: number;
    totalOrders: number;
    averageOrderValue: number;
    totalItems: number;
    uniqueCustomers: number;
    newCustomers: number;
    returningCustomers: number;
  };
  hourlyBreakdown: Array<{
    hour: number;
    revenue: number;
    orders: number;
  }>;
  topProducts: Array<{
    productId: string;
    productName: string;
    quantity: number;
    revenue: number;
  }>;
  topCategories: Array<{
    categoryId: string;
    categoryName: string;
    revenue: number;
  }>;
  paymentMethods: Array<{
    method: string;
    count: number;
    total: number;
  }>;
  createdAt: Date;
}

export interface WeeklySummary {
  tenantId: string;
  locationId: string;
  weekStart: Date;
  weekEnd: Date;
  weekNumber: number;
  year: number;
  metrics: {
    totalRevenue: number;
    totalOrders: number;
    averageOrderValue: number;
    totalItems: number;
    uniqueCustomers: number;
    averageDailyRevenue: number;
    peakDay: string;
    peakRevenue: number;
  };
  comparison: {
    revenueChange: number;
    revenueChangePercent: number;
    ordersChange: number;
    ordersChangePercent: number;
  };
  dailyBreakdown: Array<{
    date: string;
    dayName: string;
    revenue: number;
    orders: number;
  }>;
  topProducts: Array<{
    productId: string;
    productName: string;
    quantity: number;
    revenue: number;
  }>;
  createdAt: Date;
}

export interface MonthlyReport {
  tenantId: string;
  locationId: string;
  month: number;
  year: number;
  monthString: string;
  metrics: {
    totalRevenue: number;
    totalOrders: number;
    averageOrderValue: number;
    totalItems: number;
    uniqueCustomers: number;
    newCustomers: number;
    averageDailyRevenue: number;
  };
  comparison: {
    revenueChange: number;
    revenueChangePercent: number;
    ordersChange: number;
    ordersChangePercent: number;
    previousMonthRevenue: number;
    previousMonthOrders: number;
  };
  weeklyTrend: Array<{
    weekNumber: number;
    revenue: number;
    orders: number;
  }>;
  categoryBreakdown: Array<{
    categoryId: string;
    categoryName: string;
    revenue: number;
    percentage: number;
  }>;
  topProducts: Array<{
    productId: string;
    productName: string;
    quantity: number;
    revenue: number;
  }>;
  customerMetrics: {
    totalCustomers: number;
    newCustomers: number;
    returningCustomers: number;
    customerRetentionRate: number;
    averageRevenuePerCustomer: number;
  };
  performance: 'excellent' | 'good' | 'average' | 'poor';
  createdAt: Date;
}

export class AnalyticsAggregationService {
  private dbService: DatabaseService;

  constructor() {
    this.dbService = new DatabaseService();
  }

  /**
   * Get all active tenant IDs from the platform database
   */
  async getActiveTenantIds(): Promise<string[]> {
    try {
      const connection = this.dbService.getPlatformDB();
      const tenantsCollection = connection.db.collection('tenants');

      const tenants = await tenantsCollection
        .find({ isActive: true, isDeleted: { $ne: true } })
        .project({ id: 1 })
        .toArray();

      return tenants.map(t => t.id);
    } catch (error) {
      logger.error('Failed to get active tenants', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Get location IDs for a tenant
   */
  async getTenantLocationIds(tenantId: string): Promise<string[]> {
    try {
      const connection = await this.dbService.getTenantDB(tenantId);
      const locationsCollection = connection.db.collection('locations');

      const locations = await locationsCollection
        .find({ isActive: true, isDeleted: { $ne: true } })
        .project({ id: 1 })
        .toArray();

      return locations.map(l => l.id);
    } catch (error) {
      logger.error('Failed to get tenant locations', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Run daily aggregation for all tenants
   */
  async runDailyAggregation(): Promise<{
    tenantsProcessed: number;
    locationsProcessed: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let tenantsProcessed = 0;
    let locationsProcessed = 0;

    try {
      const tenantIds = await this.getActiveTenantIds();
      logger.info(`Starting daily aggregation for ${tenantIds.length} tenants`);

      const yesterday = moment().subtract(1, 'day').startOf('day').toDate();

      for (const tenantId of tenantIds) {
        try {
          const locationIds = await this.getTenantLocationIds(tenantId);

          // Process each location
          for (const locationId of locationIds) {
            try {
              await this.aggregateDailyData(tenantId, locationId, yesterday);
              locationsProcessed++;
            } catch (error) {
              const errorMsg = `Daily aggregation failed for tenant ${tenantId}, location ${locationId}: ${error instanceof Error ? error.message : 'Unknown'}`;
              errors.push(errorMsg);
              logger.error(errorMsg);
            }
          }

          // Also aggregate at tenant level (all locations combined)
          try {
            await this.aggregateDailyData(tenantId, 'all', yesterday);
          } catch (error) {
            const errorMsg = `Daily aggregation failed for tenant ${tenantId} (all locations): ${error instanceof Error ? error.message : 'Unknown'}`;
            errors.push(errorMsg);
            logger.error(errorMsg);
          }

          tenantsProcessed++;
        } catch (error) {
          const errorMsg = `Failed to process tenant ${tenantId}: ${error instanceof Error ? error.message : 'Unknown'}`;
          errors.push(errorMsg);
          logger.error(errorMsg);
        }
      }

      logger.info('Daily aggregation completed', {
        tenantsProcessed,
        locationsProcessed,
        errorCount: errors.length,
      });

      return { tenantsProcessed, locationsProcessed, errors };
    } catch (error) {
      logger.error('Daily aggregation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Aggregate daily data for a specific tenant and location
   */
  async aggregateDailyData(tenantId: string, locationId: string, date: Date): Promise<DailyAggregation> {
    const connection = await this.dbService.getTenantDB(tenantId);
    const ordersCollection = connection.db.collection('orders');
    const aggregationsCollection = connection.db.collection('analytics_daily');

    const startOfDay = moment(date).startOf('day').toDate();
    const endOfDay = moment(date).endOf('day').toDate();
    const dateString = moment(date).format('YYYY-MM-DD');

    // Check if aggregation already exists
    const existing = await aggregationsCollection.findOne({
      tenantId,
      locationId,
      dateString,
    });

    if (existing) {
      logger.info('Daily aggregation already exists, skipping', { tenantId, locationId, dateString });
      return existing as unknown as DailyAggregation;
    }

    // Build base query
    const baseQuery: any = {
      createdAt: { $gte: startOfDay, $lte: endOfDay },
      status: { $in: ['completed', 'paid'] },
    };

    if (locationId !== 'all') {
      baseQuery.locationId = locationId;
    }

    // Get basic metrics
    const metricsResult = await ordersCollection.aggregate([
      { $match: baseQuery },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$total' },
          totalOrders: { $sum: 1 },
          totalItems: { $sum: { $size: '$items' } },
          uniqueCustomers: { $addToSet: '$customerId' },
        },
      },
    ]).toArray();

    const metrics = metricsResult[0] || {
      totalRevenue: 0,
      totalOrders: 0,
      totalItems: 0,
      uniqueCustomers: [],
    };

    const uniqueCustomerCount = metrics.uniqueCustomers.filter((id: any) => id != null).length;
    const avgOrderValue = metrics.totalOrders > 0 ? metrics.totalRevenue / metrics.totalOrders : 0;

    // Get customer breakdown (new vs returning)
    const customerBreakdown = await this.getCustomerBreakdown(
      ordersCollection,
      baseQuery,
      startOfDay
    );

    // Get hourly breakdown
    const hourlyBreakdown = await ordersCollection.aggregate([
      { $match: baseQuery },
      {
        $group: {
          _id: { $hour: '$createdAt' },
          revenue: { $sum: '$total' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]).toArray();

    // Fill all 24 hours
    const hourlyData = Array.from({ length: 24 }, (_, hour) => {
      const data = hourlyBreakdown.find(h => h._id === hour);
      return {
        hour,
        revenue: data ? parseFloat(new Decimal(data.revenue).toFixed(2)) : 0,
        orders: data ? data.orders : 0,
      };
    });

    // Get top products
    const topProducts = await ordersCollection.aggregate([
      { $match: baseQuery },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          productName: { $first: '$items.name' },
          quantity: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.total' },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
    ]).toArray();

    // Get top categories
    const topCategories = await ordersCollection.aggregate([
      { $match: baseQuery },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.productId',
          foreignField: 'id',
          as: 'product',
        },
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$product.categoryId',
          categoryName: { $first: '$product.categoryName' },
          revenue: { $sum: '$items.total' },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 5 },
    ]).toArray();

    // Get payment methods
    const paymentMethods = await ordersCollection.aggregate([
      { $match: baseQuery },
      {
        $group: {
          _id: '$paymentMethod',
          count: { $sum: 1 },
          total: { $sum: '$total' },
        },
      },
      { $sort: { total: -1 } },
    ]).toArray();

    // Create aggregation document
    const aggregation: DailyAggregation = {
      tenantId,
      locationId,
      date: startOfDay,
      dateString,
      metrics: {
        totalRevenue: parseFloat(new Decimal(metrics.totalRevenue).toFixed(2)),
        totalOrders: metrics.totalOrders,
        averageOrderValue: parseFloat(new Decimal(avgOrderValue).toFixed(2)),
        totalItems: metrics.totalItems,
        uniqueCustomers: uniqueCustomerCount,
        newCustomers: customerBreakdown.newCustomers,
        returningCustomers: customerBreakdown.returningCustomers,
      },
      hourlyBreakdown: hourlyData,
      topProducts: topProducts.map(p => ({
        productId: p._id,
        productName: p.productName || 'Unknown',
        quantity: p.quantity,
        revenue: parseFloat(new Decimal(p.revenue).toFixed(2)),
      })),
      topCategories: topCategories.map(c => ({
        categoryId: c._id || 'uncategorized',
        categoryName: c.categoryName || 'Uncategorized',
        revenue: parseFloat(new Decimal(c.revenue).toFixed(2)),
      })),
      paymentMethods: paymentMethods.map(pm => ({
        method: pm._id || 'unknown',
        count: pm.count,
        total: parseFloat(new Decimal(pm.total).toFixed(2)),
      })),
      createdAt: new Date(),
    };

    // Store the aggregation
    await aggregationsCollection.insertOne(aggregation);

    logger.info('Daily aggregation completed', {
      tenantId,
      locationId,
      dateString,
      totalRevenue: aggregation.metrics.totalRevenue,
      totalOrders: aggregation.metrics.totalOrders,
    });

    return aggregation;
  }

  /**
   * Run weekly summary for all tenants
   */
  async runWeeklySummary(): Promise<{
    tenantsProcessed: number;
    locationsProcessed: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let tenantsProcessed = 0;
    let locationsProcessed = 0;

    try {
      const tenantIds = await this.getActiveTenantIds();
      logger.info(`Starting weekly summary for ${tenantIds.length} tenants`);

      // Get last week's date range
      const lastWeekStart = moment().subtract(1, 'week').startOf('week').toDate();
      const lastWeekEnd = moment().subtract(1, 'week').endOf('week').toDate();

      for (const tenantId of tenantIds) {
        try {
          const locationIds = await this.getTenantLocationIds(tenantId);

          for (const locationId of locationIds) {
            try {
              await this.generateWeeklySummary(tenantId, locationId, lastWeekStart, lastWeekEnd);
              locationsProcessed++;
            } catch (error) {
              const errorMsg = `Weekly summary failed for tenant ${tenantId}, location ${locationId}: ${error instanceof Error ? error.message : 'Unknown'}`;
              errors.push(errorMsg);
              logger.error(errorMsg);
            }
          }

          // Tenant-wide summary
          try {
            await this.generateWeeklySummary(tenantId, 'all', lastWeekStart, lastWeekEnd);
          } catch (error) {
            const errorMsg = `Weekly summary failed for tenant ${tenantId} (all locations): ${error instanceof Error ? error.message : 'Unknown'}`;
            errors.push(errorMsg);
            logger.error(errorMsg);
          }

          tenantsProcessed++;
        } catch (error) {
          const errorMsg = `Failed to process tenant ${tenantId}: ${error instanceof Error ? error.message : 'Unknown'}`;
          errors.push(errorMsg);
          logger.error(errorMsg);
        }
      }

      logger.info('Weekly summary completed', {
        tenantsProcessed,
        locationsProcessed,
        errorCount: errors.length,
      });

      return { tenantsProcessed, locationsProcessed, errors };
    } catch (error) {
      logger.error('Weekly summary failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Generate weekly summary for a specific tenant and location
   */
  async generateWeeklySummary(
    tenantId: string,
    locationId: string,
    weekStart: Date,
    weekEnd: Date
  ): Promise<WeeklySummary> {
    const connection = await this.dbService.getTenantDB(tenantId);
    const ordersCollection = connection.db.collection('orders');
    const summariesCollection = connection.db.collection('analytics_weekly');

    const weekNumber = moment(weekStart).week();
    const year = moment(weekStart).year();

    // Check if summary already exists
    const existing = await summariesCollection.findOne({
      tenantId,
      locationId,
      weekNumber,
      year,
    });

    if (existing) {
      logger.info('Weekly summary already exists, skipping', { tenantId, locationId, weekNumber, year });
      return existing as unknown as WeeklySummary;
    }

    // Build base query
    const baseQuery: any = {
      createdAt: { $gte: weekStart, $lte: weekEnd },
      status: { $in: ['completed', 'paid'] },
    };

    if (locationId !== 'all') {
      baseQuery.locationId = locationId;
    }

    // Get weekly metrics
    const metricsResult = await ordersCollection.aggregate([
      { $match: baseQuery },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$total' },
          totalOrders: { $sum: 1 },
          totalItems: { $sum: { $size: '$items' } },
          uniqueCustomers: { $addToSet: '$customerId' },
        },
      },
    ]).toArray();

    const metrics = metricsResult[0] || {
      totalRevenue: 0,
      totalOrders: 0,
      totalItems: 0,
      uniqueCustomers: [],
    };

    const uniqueCustomerCount = metrics.uniqueCustomers.filter((id: any) => id != null).length;
    const avgOrderValue = metrics.totalOrders > 0 ? metrics.totalRevenue / metrics.totalOrders : 0;

    // Get daily breakdown
    const dailyBreakdown = await ordersCollection.aggregate([
      { $match: baseQuery },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
          },
          revenue: { $sum: '$total' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]).toArray();

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const formattedDaily = dailyBreakdown.map(d => ({
      date: d._id,
      dayName: dayNames[moment(d._id).day()],
      revenue: parseFloat(new Decimal(d.revenue).toFixed(2)),
      orders: d.orders,
    }));

    // Find peak day
    const peakDay = formattedDaily.reduce((max, day) =>
      day.revenue > max.revenue ? day : max,
      { date: '', dayName: 'N/A', revenue: 0, orders: 0 }
    );

    // Get previous week comparison
    const prevWeekStart = moment(weekStart).subtract(1, 'week').toDate();
    const prevWeekEnd = moment(weekEnd).subtract(1, 'week').toDate();

    const prevQuery = {
      ...baseQuery,
      createdAt: { $gte: prevWeekStart, $lte: prevWeekEnd },
    };

    const prevMetricsResult = await ordersCollection.aggregate([
      { $match: prevQuery },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$total' },
          totalOrders: { $sum: 1 },
        },
      },
    ]).toArray();

    const prevMetrics = prevMetricsResult[0] || { totalRevenue: 0, totalOrders: 0 };

    const revenueChange = metrics.totalRevenue - prevMetrics.totalRevenue;
    const revenueChangePercent = prevMetrics.totalRevenue > 0
      ? (revenueChange / prevMetrics.totalRevenue) * 100
      : 0;

    const ordersChange = metrics.totalOrders - prevMetrics.totalOrders;
    const ordersChangePercent = prevMetrics.totalOrders > 0
      ? (ordersChange / prevMetrics.totalOrders) * 100
      : 0;

    // Get top products for the week
    const topProducts = await ordersCollection.aggregate([
      { $match: baseQuery },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          productName: { $first: '$items.name' },
          quantity: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.total' },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
    ]).toArray();

    // Create summary document
    const summary: WeeklySummary = {
      tenantId,
      locationId,
      weekStart,
      weekEnd,
      weekNumber,
      year,
      metrics: {
        totalRevenue: parseFloat(new Decimal(metrics.totalRevenue).toFixed(2)),
        totalOrders: metrics.totalOrders,
        averageOrderValue: parseFloat(new Decimal(avgOrderValue).toFixed(2)),
        totalItems: metrics.totalItems,
        uniqueCustomers: uniqueCustomerCount,
        averageDailyRevenue: parseFloat(new Decimal(metrics.totalRevenue / 7).toFixed(2)),
        peakDay: peakDay.dayName,
        peakRevenue: peakDay.revenue,
      },
      comparison: {
        revenueChange: parseFloat(new Decimal(revenueChange).toFixed(2)),
        revenueChangePercent: parseFloat(new Decimal(revenueChangePercent).toFixed(2)),
        ordersChange,
        ordersChangePercent: parseFloat(new Decimal(ordersChangePercent).toFixed(2)),
      },
      dailyBreakdown: formattedDaily,
      topProducts: topProducts.map(p => ({
        productId: p._id,
        productName: p.productName || 'Unknown',
        quantity: p.quantity,
        revenue: parseFloat(new Decimal(p.revenue).toFixed(2)),
      })),
      createdAt: new Date(),
    };

    // Store the summary
    await summariesCollection.insertOne(summary);

    logger.info('Weekly summary completed', {
      tenantId,
      locationId,
      weekNumber,
      year,
      totalRevenue: summary.metrics.totalRevenue,
      totalOrders: summary.metrics.totalOrders,
    });

    return summary;
  }

  /**
   * Run monthly reports for all tenants
   */
  async runMonthlyReports(): Promise<{
    tenantsProcessed: number;
    locationsProcessed: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let tenantsProcessed = 0;
    let locationsProcessed = 0;

    try {
      const tenantIds = await this.getActiveTenantIds();
      logger.info(`Starting monthly reports for ${tenantIds.length} tenants`);

      // Get last month
      const lastMonthStart = moment().subtract(1, 'month').startOf('month').toDate();
      const lastMonthEnd = moment().subtract(1, 'month').endOf('month').toDate();
      const month = moment(lastMonthStart).month() + 1;
      const year = moment(lastMonthStart).year();

      for (const tenantId of tenantIds) {
        try {
          const locationIds = await this.getTenantLocationIds(tenantId);

          for (const locationId of locationIds) {
            try {
              await this.generateMonthlyReport(tenantId, locationId, month, year, lastMonthStart, lastMonthEnd);
              locationsProcessed++;
            } catch (error) {
              const errorMsg = `Monthly report failed for tenant ${tenantId}, location ${locationId}: ${error instanceof Error ? error.message : 'Unknown'}`;
              errors.push(errorMsg);
              logger.error(errorMsg);
            }
          }

          // Tenant-wide report
          try {
            await this.generateMonthlyReport(tenantId, 'all', month, year, lastMonthStart, lastMonthEnd);
          } catch (error) {
            const errorMsg = `Monthly report failed for tenant ${tenantId} (all locations): ${error instanceof Error ? error.message : 'Unknown'}`;
            errors.push(errorMsg);
            logger.error(errorMsg);
          }

          tenantsProcessed++;
        } catch (error) {
          const errorMsg = `Failed to process tenant ${tenantId}: ${error instanceof Error ? error.message : 'Unknown'}`;
          errors.push(errorMsg);
          logger.error(errorMsg);
        }
      }

      logger.info('Monthly reports completed', {
        tenantsProcessed,
        locationsProcessed,
        errorCount: errors.length,
      });

      return { tenantsProcessed, locationsProcessed, errors };
    } catch (error) {
      logger.error('Monthly reports failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Generate monthly report for a specific tenant and location
   */
  async generateMonthlyReport(
    tenantId: string,
    locationId: string,
    month: number,
    year: number,
    monthStart: Date,
    monthEnd: Date
  ): Promise<MonthlyReport> {
    const connection = await this.dbService.getTenantDB(tenantId);
    const ordersCollection = connection.db.collection('orders');
    const customersCollection = connection.db.collection('customers');
    const reportsCollection = connection.db.collection('analytics_monthly');

    const monthString = `${year}-${String(month).padStart(2, '0')}`;

    // Check if report already exists
    const existing = await reportsCollection.findOne({
      tenantId,
      locationId,
      month,
      year,
    });

    if (existing) {
      logger.info('Monthly report already exists, skipping', { tenantId, locationId, month, year });
      return existing as unknown as MonthlyReport;
    }

    // Build base query
    const baseQuery: any = {
      createdAt: { $gte: monthStart, $lte: monthEnd },
      status: { $in: ['completed', 'paid'] },
    };

    if (locationId !== 'all') {
      baseQuery.locationId = locationId;
    }

    // Get monthly metrics
    const metricsResult = await ordersCollection.aggregate([
      { $match: baseQuery },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$total' },
          totalOrders: { $sum: 1 },
          totalItems: { $sum: { $size: '$items' } },
          uniqueCustomers: { $addToSet: '$customerId' },
        },
      },
    ]).toArray();

    const metrics = metricsResult[0] || {
      totalRevenue: 0,
      totalOrders: 0,
      totalItems: 0,
      uniqueCustomers: [],
    };

    const uniqueCustomerCount = metrics.uniqueCustomers.filter((id: any) => id != null).length;
    const avgOrderValue = metrics.totalOrders > 0 ? metrics.totalRevenue / metrics.totalOrders : 0;
    const daysInMonth = moment(monthStart).daysInMonth();
    const avgDailyRevenue = metrics.totalRevenue / daysInMonth;

    // Get previous month comparison
    const prevMonthStart = moment(monthStart).subtract(1, 'month').startOf('month').toDate();
    const prevMonthEnd = moment(monthStart).subtract(1, 'month').endOf('month').toDate();

    const prevQuery = {
      ...baseQuery,
      createdAt: { $gte: prevMonthStart, $lte: prevMonthEnd },
    };

    const prevMetricsResult = await ordersCollection.aggregate([
      { $match: prevQuery },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$total' },
          totalOrders: { $sum: 1 },
        },
      },
    ]).toArray();

    const prevMetrics = prevMetricsResult[0] || { totalRevenue: 0, totalOrders: 0 };

    const revenueChange = metrics.totalRevenue - prevMetrics.totalRevenue;
    const revenueChangePercent = prevMetrics.totalRevenue > 0
      ? (revenueChange / prevMetrics.totalRevenue) * 100
      : 0;

    const ordersChange = metrics.totalOrders - prevMetrics.totalOrders;
    const ordersChangePercent = prevMetrics.totalOrders > 0
      ? (ordersChange / prevMetrics.totalOrders) * 100
      : 0;

    // Get weekly trend
    const weeklyTrend = await ordersCollection.aggregate([
      { $match: baseQuery },
      {
        $group: {
          _id: { $week: '$createdAt' },
          revenue: { $sum: '$total' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]).toArray();

    // Get category breakdown
    const categoryBreakdown = await ordersCollection.aggregate([
      { $match: baseQuery },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.productId',
          foreignField: 'id',
          as: 'product',
        },
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$product.categoryId',
          categoryName: { $first: '$product.categoryName' },
          revenue: { $sum: '$items.total' },
        },
      },
      { $sort: { revenue: -1 } },
    ]).toArray();

    const totalCategoryRevenue = categoryBreakdown.reduce((sum, c) => sum + c.revenue, 0);

    // Get top products
    const topProducts = await ordersCollection.aggregate([
      { $match: baseQuery },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          productName: { $first: '$items.name' },
          quantity: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.total' },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
    ]).toArray();

    // Get customer metrics
    const customerMetrics = await this.calculateCustomerMetrics(
      ordersCollection,
      customersCollection,
      baseQuery,
      prevQuery
    );

    // Determine performance rating
    let performance: 'excellent' | 'good' | 'average' | 'poor' = 'average';
    if (revenueChangePercent > 20) performance = 'excellent';
    else if (revenueChangePercent > 10) performance = 'good';
    else if (revenueChangePercent > 0) performance = 'average';
    else performance = 'poor';

    // Create report document
    const report: MonthlyReport = {
      tenantId,
      locationId,
      month,
      year,
      monthString,
      metrics: {
        totalRevenue: parseFloat(new Decimal(metrics.totalRevenue).toFixed(2)),
        totalOrders: metrics.totalOrders,
        averageOrderValue: parseFloat(new Decimal(avgOrderValue).toFixed(2)),
        totalItems: metrics.totalItems,
        uniqueCustomers: uniqueCustomerCount,
        newCustomers: customerMetrics.newCustomers,
        averageDailyRevenue: parseFloat(new Decimal(avgDailyRevenue).toFixed(2)),
      },
      comparison: {
        revenueChange: parseFloat(new Decimal(revenueChange).toFixed(2)),
        revenueChangePercent: parseFloat(new Decimal(revenueChangePercent).toFixed(2)),
        ordersChange,
        ordersChangePercent: parseFloat(new Decimal(ordersChangePercent).toFixed(2)),
        previousMonthRevenue: parseFloat(new Decimal(prevMetrics.totalRevenue).toFixed(2)),
        previousMonthOrders: prevMetrics.totalOrders,
      },
      weeklyTrend: weeklyTrend.map(w => ({
        weekNumber: w._id,
        revenue: parseFloat(new Decimal(w.revenue).toFixed(2)),
        orders: w.orders,
      })),
      categoryBreakdown: categoryBreakdown.map(c => ({
        categoryId: c._id || 'uncategorized',
        categoryName: c.categoryName || 'Uncategorized',
        revenue: parseFloat(new Decimal(c.revenue).toFixed(2)),
        percentage: totalCategoryRevenue > 0
          ? parseFloat(new Decimal(c.revenue / totalCategoryRevenue * 100).toFixed(2))
          : 0,
      })),
      topProducts: topProducts.map(p => ({
        productId: p._id,
        productName: p.productName || 'Unknown',
        quantity: p.quantity,
        revenue: parseFloat(new Decimal(p.revenue).toFixed(2)),
      })),
      customerMetrics,
      performance,
      createdAt: new Date(),
    };

    // Store the report
    await reportsCollection.insertOne(report);

    logger.info('Monthly report completed', {
      tenantId,
      locationId,
      month,
      year,
      totalRevenue: report.metrics.totalRevenue,
      totalOrders: report.metrics.totalOrders,
      performance: report.performance,
    });

    return report;
  }

  /**
   * Helper: Get customer breakdown (new vs returning)
   */
  private async getCustomerBreakdown(
    ordersCollection: any,
    baseQuery: any,
    periodStart: Date
  ): Promise<{ newCustomers: number; returningCustomers: number }> {
    try {
      // Get customers who ordered in this period
      const customerOrders = await ordersCollection.aggregate([
        { $match: { ...baseQuery, customerId: { $exists: true, $ne: null } } },
        {
          $group: {
            _id: '$customerId',
            firstOrderInPeriod: { $min: '$createdAt' },
          },
        },
      ]).toArray();

      // For each customer, check if they had orders before this period
      let newCustomers = 0;
      let returningCustomers = 0;

      for (const customer of customerOrders) {
        const previousOrders = await ordersCollection.countDocuments({
          customerId: customer._id,
          createdAt: { $lt: periodStart },
          status: { $in: ['completed', 'paid'] },
        });

        if (previousOrders > 0) {
          returningCustomers++;
        } else {
          newCustomers++;
        }
      }

      return { newCustomers, returningCustomers };
    } catch (error) {
      logger.error('Failed to get customer breakdown', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return { newCustomers: 0, returningCustomers: 0 };
    }
  }

  /**
   * Helper: Calculate customer metrics for monthly report
   */
  private async calculateCustomerMetrics(
    ordersCollection: any,
    customersCollection: any,
    currentQuery: any,
    previousQuery: any
  ): Promise<{
    totalCustomers: number;
    newCustomers: number;
    returningCustomers: number;
    customerRetentionRate: number;
    averageRevenuePerCustomer: number;
  }> {
    try {
      // Current period customers
      const currentCustomerData = await ordersCollection.aggregate([
        { $match: { ...currentQuery, customerId: { $exists: true, $ne: null } } },
        {
          $group: {
            _id: '$customerId',
            totalSpent: { $sum: '$total' },
          },
        },
      ]).toArray();

      // Previous period customers
      const previousCustomerIds = await ordersCollection.distinct('customerId', {
        ...previousQuery,
        customerId: { $exists: true, $ne: null },
      });

      const currentCustomerIds = currentCustomerData.map((c: any) => c._id);
      const totalCustomers = currentCustomerIds.length;
      const totalSpent = currentCustomerData.reduce((sum: number, c: any) => sum + c.totalSpent, 0);

      // Calculate new vs returning
      const returningCustomerIds = currentCustomerIds.filter((id: string) =>
        previousCustomerIds.includes(id)
      );
      const returningCustomers = returningCustomerIds.length;
      const newCustomers = totalCustomers - returningCustomers;

      // Retention rate
      const retentionRate = previousCustomerIds.length > 0
        ? (returningCustomers / previousCustomerIds.length) * 100
        : 0;

      const avgRevenuePerCustomer = totalCustomers > 0 ? totalSpent / totalCustomers : 0;

      return {
        totalCustomers,
        newCustomers,
        returningCustomers,
        customerRetentionRate: parseFloat(new Decimal(retentionRate).toFixed(2)),
        averageRevenuePerCustomer: parseFloat(new Decimal(avgRevenuePerCustomer).toFixed(2)),
      };
    } catch (error) {
      logger.error('Failed to calculate customer metrics', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return {
        totalCustomers: 0,
        newCustomers: 0,
        returningCustomers: 0,
        customerRetentionRate: 0,
        averageRevenuePerCustomer: 0,
      };
    }
  }
}
