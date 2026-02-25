// Usage tracking and monitoring routes
import { Router, Request, Response } from 'express';
import Decimal from 'decimal.js';
import {
  authenticate,
  extractTenant,
  requireRole,
  createResponse,
  createErrorResponse,
  logger,
  UserRoles,
  getPlatformDatabase,
  getTenantDatabase,
  cache,
} from '@properpos/backend-shared';

export const usageRoutes = Router();

/**
 * @swagger
 * /api/v1/usage:
 *   get:
 *     tags: [Usage]
 *     summary: Get usage metrics for tenant
 */
usageRoutes.get('/',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { tenantId } = req.user!;
      const { period = 'current', metricType } = req.query;

      const db = await getTenantDatabase(tenantId!);
      const usageCollection = db.collection('usage_metrics');

      // Get usage metrics for the specified period
      let startDate: Date, endDate: Date;

      if (period === 'current') {
        startDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        endDate = new Date();
      } else if (period === 'previous') {
        const currentMonth = new Date();
        startDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
        endDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 0);
      } else {
        startDate = new Date(req.query.startDate as string);
        endDate = new Date(req.query.endDate as string);
      }

      const matchFilter: any = {
        timestamp: { $gte: startDate, $lte: endDate },
      };

      if (metricType) {
        matchFilter.metricType = metricType;
      }

      // Aggregate usage metrics
      const usageData = await usageCollection.aggregate([
        { $match: matchFilter },
        {
          $group: {
            _id: '$metricType',
            totalUsage: { $sum: '$quantity' },
            averageDaily: { $avg: '$quantity' },
            peakUsage: { $max: '$quantity' },
            totalCost: { $sum: '$cost' },
            usageCount: { $sum: 1 },
          }
        },
        {
          $project: {
            metricType: '$_id',
            totalUsage: 1,
            averageDaily: { $round: ['$averageDaily', 2] },
            peakUsage: 1,
            totalCost: { $round: ['$totalCost', 2] },
            usageCount: 1,
            _id: 0,
          }
        }
      ]).toArray();

      // Get current limits
      const limits = await getCurrentUsageLimits(tenantId!);

      // Calculate usage percentages
      const usageWithPercentages = usageData.map((usage: any) => {
        const limit = limits.find((l: any) => l.metricType === usage.metricType);
        const usagePercent = limit ? (usage.totalUsage / limit.limit) * 100 : 0;

        return {
          ...usage,
          limit: limit?.limit || 0,
          usagePercent: Math.round(usagePercent * 100) / 100,
          status: usagePercent >= 95 ? 'critical' : usagePercent >= 80 ? 'warning' : 'normal',
        };
      });

      logger.info('Usage metrics retrieved', {
        tenantId,
        period,
        metricCount: usageData.length,
      });

      res.json(createResponse({
        period,
        startDate,
        endDate,
        usage: usageWithPercentages,
        summary: {
          totalMetrics: usageData.length,
          totalCost: usageData.reduce((sum: number, u: any) => sum + u.totalCost, 0),
          criticalAlerts: usageWithPercentages.filter((u: any) => u.status === 'critical').length,
        },
      }, 'Usage metrics retrieved successfully'));

    } catch (error) {
      logger.error('Error retrieving usage metrics', {
        tenantId: req.user?.tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json(createErrorResponse(
        'Failed to retrieve usage metrics',
        'USAGE_RETRIEVAL_FAILED'
      ));
    }
  }
);

/**
 * @swagger
 * /api/v1/usage/track:
 *   post:
 *     tags: [Usage]
 *     summary: Track usage metrics
 */
usageRoutes.post('/track',
  authenticate,
  extractTenant,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { tenantId, id: userId } = req.user!;
      const { metricType, quantity, metadata = {} } = req.body;

      if (!metricType || quantity === undefined) {
        res.status(400).json(createErrorResponse(
          'MetricType and quantity are required',
          'INVALID_USAGE_DATA'
        ));
        return;
      }

      const db = await getTenantDatabase(tenantId!);
      const usageCollection = db.collection('usage_metrics');

      // Calculate cost based on metric type and quantity
      const cost = await calculateUsageCost(tenantId!, metricType, quantity);

      // Create usage record
      const usageRecord = {
        tenantId,
        userId,
        metricType,
        quantity: new Decimal(quantity).toNumber(),
        cost: cost.toNumber(),
        timestamp: new Date(),
        metadata,
        createdAt: new Date(),
      };

      await usageCollection.insertOne(usageRecord);

      // Update real-time usage cache
      await updateUsageCache(tenantId!, metricType, quantity);

      // Check usage limits and send alerts if necessary
      await checkUsageLimits(tenantId!);

      logger.info('Usage tracked', {
        tenantId,
        metricType,
        quantity,
        cost: cost.toNumber(),
      });

      res.json(createResponse({
        tracked: true,
        metricType,
        quantity,
        cost: cost.toNumber(),
        timestamp: usageRecord.timestamp,
      }, 'Usage tracked successfully'));

    } catch (error) {
      logger.error('Error tracking usage', {
        tenantId: req.user?.tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json(createErrorResponse(
        'Failed to track usage',
        'USAGE_TRACKING_FAILED'
      ));
    }
  }
);

/**
 * @swagger
 * /api/v1/usage/limits:
 *   get:
 *     tags: [Usage]
 *     summary: Get usage limits for tenant
 */
usageRoutes.get('/limits',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { tenantId } = req.user!;
      const limits = await getCurrentUsageLimits(tenantId!);

      // Get current usage for comparison
      const currentUsage = await getCurrentUsage(tenantId!);

      const limitsWithUsage = limits.map((limit: any) => {
        const usage = currentUsage.find((u: any) => u.metricType === limit.metricType);
        const usagePercent = usage ? (usage.currentUsage / limit.limit) * 100 : 0;

        return {
          ...limit,
          currentUsage: usage?.currentUsage || 0,
          usagePercent: Math.round(usagePercent * 100) / 100,
          remaining: Math.max(0, limit.limit - (usage?.currentUsage || 0)),
          status: usagePercent >= 95 ? 'critical' : usagePercent >= 80 ? 'warning' : 'normal',
        };
      });

      logger.info('Usage limits retrieved', {
        tenantId,
        limitCount: limits.length,
      });

      res.json(createResponse({
        limits: limitsWithUsage,
        summary: {
          totalLimits: limits.length,
          criticalAlerts: limitsWithUsage.filter((l: any) => l.status === 'critical').length,
          warningAlerts: limitsWithUsage.filter((l: any) => l.status === 'warning').length,
        },
      }, 'Usage limits retrieved successfully'));

    } catch (error) {
      logger.error('Error retrieving usage limits', {
        tenantId: req.user?.tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json(createErrorResponse(
        'Failed to retrieve usage limits',
        'USAGE_LIMITS_RETRIEVAL_FAILED'
      ));
    }
  }
);

/**
 * @swagger
 * /api/v1/usage/alerts:
 *   get:
 *     tags: [Usage]
 *     summary: Get usage alerts for tenant
 */
usageRoutes.get('/alerts',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { tenantId } = req.user!;
      const { status, limit = 50 } = req.query;

      const db = await getTenantDatabase(tenantId!);
      const alertsCollection = db.collection('usage_alerts');

      const matchFilter: any = {};
      if (status) {
        matchFilter.status = status;
      }

      const alerts = await alertsCollection
        .find(matchFilter)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit as string))
        .toArray();

      logger.info('Usage alerts retrieved', {
        tenantId,
        alertCount: alerts.length,
      });

      res.json(createResponse({
        alerts,
        summary: {
          totalAlerts: alerts.length,
          unreadAlerts: alerts.filter((a: any) => !a.acknowledged).length,
        },
      }, 'Usage alerts retrieved successfully'));

    } catch (error) {
      logger.error('Error retrieving usage alerts', {
        tenantId: req.user?.tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json(createErrorResponse(
        'Failed to retrieve usage alerts',
        'USAGE_ALERTS_RETRIEVAL_FAILED'
      ));
    }
  }
);

/**
 * @swagger
 * /api/v1/usage/export:
 *   get:
 *     tags: [Usage]
 *     summary: Export usage data
 */
usageRoutes.get('/export',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { tenantId } = req.user!;
      const { format = 'json', startDate, endDate } = req.query;

      const db = await getTenantDatabase(tenantId!);
      const usageCollection = db.collection('usage_metrics');

      const dateFilter: any = {};
      if (startDate) dateFilter.$gte = new Date(startDate as string);
      if (endDate) dateFilter.$lte = new Date(endDate as string);

      const matchFilter: any = {};
      if (Object.keys(dateFilter).length > 0) {
        matchFilter.timestamp = dateFilter;
      }

      const usageData = await usageCollection
        .find(matchFilter)
        .sort({ timestamp: -1 })
        .toArray();

      if (format === 'csv') {
        // Convert to CSV format
        const csvHeader = 'Timestamp,Metric Type,Quantity,Cost,User ID,Metadata\n';
        const csvData = usageData.map((usage: any) =>
          `${usage.timestamp.toISOString()},${usage.metricType},${usage.quantity},${usage.cost},${usage.userId},"${JSON.stringify(usage.metadata)}"`
        ).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="usage-export.csv"');
        res.send(csvHeader + csvData);
      } else {
        res.json(createResponse({
          exportFormat: format,
          recordCount: usageData.length,
          data: usageData,
        }, 'Usage data exported successfully'));
      }

      logger.info('Usage data exported', {
        tenantId,
        format,
        recordCount: usageData.length,
      });

    } catch (error) {
      logger.error('Error exporting usage data', {
        tenantId: req.user?.tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json(createErrorResponse(
        'Failed to export usage data',
        'USAGE_EXPORT_FAILED'
      ));
    }
  }
);

// Helper functions
async function getCurrentUsageLimits(tenantId: string) {
  const db = getPlatformDatabase();
  const subscriptionsCollection = db.collection('subscriptions');

  const subscription = await subscriptionsCollection.findOne(
    { tenantId, status: { $in: ['active', 'trial'] } }
  );

  if (!subscription) {
    return getDefaultLimits();
  }

  // Get plan limits from subscription
  const planLimits = subscription.plan?.limits || getDefaultLimits();

  return planLimits.map((limit: any) => ({
    ...limit,
    subscriptionId: subscription._id,
  }));
}

async function getCurrentUsage(tenantId: string) {
  const cacheKey = `usage:current:${tenantId}`;
  const cachedUsage = await cache.get<any[]>(cacheKey);

  if (cachedUsage) {
    return cachedUsage;
  }

  // Calculate current month usage from database
  const db = await getTenantDatabase(tenantId);
  const usageCollection = db.collection('usage_metrics');

  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const currentUsageData = await usageCollection.aggregate([
    {
      $match: {
        timestamp: { $gte: startOfMonth }
      }
    },
    {
      $group: {
        _id: '$metricType',
        currentUsage: { $sum: '$quantity' }
      }
    },
    {
      $project: {
        metricType: '$_id',
        currentUsage: 1,
        _id: 0,
      }
    }
  ]).toArray();

  // Cache for 5 minutes
  await cache.set(cacheKey, currentUsageData, 300);

  return currentUsageData;
}

async function calculateUsageCost(tenantId: string, metricType: string, quantity: number): Promise<Decimal> {
  const db = getPlatformDatabase();
  const pricingCollection = db.collection('pricing_rules');

  const pricingRule = await pricingCollection.findOne({
    metricType,
    tenantId: { $in: [tenantId, null] } // Tenant-specific or global pricing
  });

  if (!pricingRule) {
    return new Decimal(0); // No cost if no pricing rule
  }

  const quantityDecimal = new Decimal(quantity);
  const unitCost = new Decimal(pricingRule.unitCost || 0);

  return quantityDecimal.mul(unitCost);
}

async function updateUsageCache(tenantId: string, metricType: string, quantity: number) {
  const cacheKey = `usage:current:${tenantId}`;
  const cachedUsage = await cache.get<any[]>(cacheKey);

  let currentUsageArr: any[] = [];
  if (cachedUsage) {
    currentUsageArr = cachedUsage;
  }

  const existingMetric = currentUsageArr.find((u: any) => u.metricType === metricType);
  if (existingMetric) {
    existingMetric.currentUsage += quantity;
  } else {
    currentUsageArr.push({ metricType, currentUsage: quantity });
  }

  await cache.set(cacheKey, currentUsageArr, 300);
}

async function checkUsageLimits(tenantId: string) {
  const limits = await getCurrentUsageLimits(tenantId);
  const currentUsage = await getCurrentUsage(tenantId);

  for (const limit of limits) {
    const usage = currentUsage.find((u: any) => u.metricType === limit.metricType);
    if (!usage) continue;

    const usagePercent = (usage.currentUsage / limit.limit) * 100;

    if (usagePercent >= 95) {
      await createUsageAlert(tenantId, limit.metricType, 'critical', usagePercent, limit.limit, usage.currentUsage);
    } else if (usagePercent >= 80) {
      await createUsageAlert(tenantId, limit.metricType, 'warning', usagePercent, limit.limit, usage.currentUsage);
    }
  }
}

async function createUsageAlert(
  tenantId: string,
  metricType: string,
  level: string,
  usagePercent: number,
  limit: number,
  currentUsage: number
) {
  const db = await getTenantDatabase(tenantId);
  const alertsCollection = db.collection('usage_alerts');

  // Check if similar alert already exists (prevent spam)
  const existingAlert = await alertsCollection.findOne({
    metricType,
    level,
    acknowledged: false,
    createdAt: { $gte: new Date(Date.now() - 3600000) } // Last hour
  });

  if (existingAlert) return; // Don't create duplicate alerts

  const alert = {
    tenantId,
    metricType,
    level,
    message: `Usage for ${metricType} has reached ${usagePercent.toFixed(1)}% of limit`,
    usagePercent,
    limit,
    currentUsage,
    acknowledged: false,
    createdAt: new Date(),
  };

  await alertsCollection.insertOne(alert);

  logger.warn('Usage alert created', {
    tenantId,
    metricType,
    level,
    usagePercent,
  });
}

function getDefaultLimits() {
  return [
    { metricType: 'transactions', limit: 1000, unit: 'count' },
    { metricType: 'api_calls', limit: 10000, unit: 'count' },
    { metricType: 'storage', limit: 1073741824, unit: 'bytes' }, // 1GB
    { metricType: 'users', limit: 10, unit: 'count' },
    { metricType: 'locations', limit: 3, unit: 'count' },
  ];
}