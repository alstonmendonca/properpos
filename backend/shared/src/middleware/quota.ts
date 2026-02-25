// Tenant Quota Enforcement Middleware
// Enforces subscription limits for locations, users, products, orders, and storage

import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { ApiError } from '../utils/errors';
import { logger } from '../utils/logger';
import { DatabaseService } from '../database/service';
import { cache } from '../database/redis';

const dbService = new DatabaseService();

export interface TenantLimits {
  locations: number;
  users: number;
  products: number;
  monthlyOrders: number;
  storageGB: number;
}

export interface QuotaUsage {
  locations: number;
  users: number;
  products: number;
  monthlyOrders: number;
  storageBytes: number;
  lastUpdated: Date;
}

// Cache TTL for usage counts (5 minutes)
const USAGE_CACHE_TTL = 300;

/**
 * Get current usage for a tenant
 */
export async function getTenantUsage(tenantId: string): Promise<QuotaUsage> {
  const cacheKey = `quota:usage:${tenantId}`;

  // Try to get from cache first
  try {
    const cached = await cache.get<QuotaUsage>(cacheKey);
    if (cached) {
      return cached;
    }
  } catch {
    // Cache miss or error, continue to calculate
  }

  const tenantDb = await dbService.getTenantDB(tenantId);
  const platformDb = dbService.getPlatformDB();

  // Get counts in parallel
  const [
    locationCount,
    userCount,
    productCount,
    monthlyOrderCount,
    storageUsage,
  ] = await Promise.all([
    getLocationCount(tenantDb),
    getUserCount(platformDb, tenantId),
    getProductCount(tenantDb),
    getMonthlyOrderCount(tenantDb),
    getStorageUsage(tenantDb, tenantId),
  ]);

  const usage: QuotaUsage = {
    locations: locationCount,
    users: userCount,
    products: productCount,
    monthlyOrders: monthlyOrderCount,
    storageBytes: storageUsage,
    lastUpdated: new Date(),
  };

  // Cache the usage
  try {
    await cache.set(cacheKey, usage, USAGE_CACHE_TTL);
  } catch {
    logger.warn('Failed to cache tenant usage', { tenantId });
  }

  return usage;
}

/**
 * Invalidate usage cache for a tenant
 */
export async function invalidateUsageCache(tenantId: string): Promise<void> {
  const cacheKey = `quota:usage:${tenantId}`;
  try {
    await cache.del(cacheKey);
  } catch (error) {
    logger.warn('Failed to invalidate usage cache', { tenantId, error });
  }
}

/**
 * Get location count for a tenant
 */
async function getLocationCount(connection: mongoose.Connection): Promise<number> {
  const db = connection.db;
  if (!db) {
    throw new Error('Database connection not established');
  }
  return db.collection('locations').countDocuments({ isActive: true });
}

/**
 * Get user count for a tenant
 */
async function getUserCount(platformConnection: mongoose.Connection, tenantId: string): Promise<number> {
  const db = platformConnection.db;
  if (!db) {
    throw new Error('Platform database connection not established');
  }
  return db.collection('tenant_memberships').countDocuments({
    tenantId,
    status: 'active',
  });
}

/**
 * Get product count for a tenant
 */
async function getProductCount(connection: mongoose.Connection): Promise<number> {
  const db = connection.db;
  if (!db) {
    throw new Error('Database connection not established');
  }
  return db.collection('products').countDocuments({ isActive: true });
}

/**
 * Get monthly order count for a tenant
 */
async function getMonthlyOrderCount(connection: mongoose.Connection): Promise<number> {
  const db = connection.db;
  if (!db) {
    throw new Error('Database connection not established');
  }
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  return db.collection('orders').countDocuments({
    createdAt: { $gte: startOfMonth },
  });
}

/**
 * Get storage usage for a tenant (in bytes)
 */
async function getStorageUsage(connection: mongoose.Connection, tenantId: string): Promise<number> {
  let totalBytes = 0;

  try {
    const db = connection.db;
    if (!db) {
      throw new Error('Database connection not established');
    }
    // Get database stats for the tenant's collections
    const stats = await db.stats();
    totalBytes += stats.dataSize || 0;

    // Get uploaded files size
    const filesCollection = db.collection('uploaded_files');
    const result = await filesCollection.aggregate([
      { $group: { _id: null, totalSize: { $sum: '$size' } } },
    ]).toArray();

    const firstResult = result[0];
    if (firstResult && firstResult.totalSize) {
      totalBytes += firstResult.totalSize as number;
    }
  } catch (error) {
    logger.warn('Failed to calculate storage usage', { tenantId, error });
  }

  return totalBytes;
}

/**
 * Check if a specific quota would be exceeded
 */
export async function checkQuotaLimit(
  tenantId: string,
  limitType: keyof Omit<TenantLimits, 'storageGB'>,
  limits: TenantLimits,
  additionalCount: number = 1
): Promise<{ allowed: boolean; current: number; limit: number; remaining: number }> {
  const usage = await getTenantUsage(tenantId);
  const current = usage[limitType];
  const limit = limits[limitType];
  const remaining = Math.max(0, limit - current);
  const allowed = current + additionalCount <= limit;

  return { allowed, current, limit, remaining };
}

/**
 * Check storage quota
 */
export async function checkStorageQuota(
  tenantId: string,
  limits: TenantLimits,
  additionalBytes: number = 0
): Promise<{ allowed: boolean; usedGB: number; limitGB: number; remainingGB: number }> {
  const usage = await getTenantUsage(tenantId);
  const usedBytes = usage.storageBytes;
  const limitBytes = limits.storageGB * 1024 * 1024 * 1024;
  const remainingBytes = Math.max(0, limitBytes - usedBytes);
  const allowed = usedBytes + additionalBytes <= limitBytes;

  return {
    allowed,
    usedGB: usedBytes / (1024 * 1024 * 1024),
    limitGB: limits.storageGB,
    remainingGB: remainingBytes / (1024 * 1024 * 1024),
  };
}

/**
 * Generic quota enforcement middleware factory
 */
export function enforceQuota(
  limitType: keyof Omit<TenantLimits, 'storageGB'>,
  resourceName: string
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenant = (req as any).tenant;
      if (!tenant) {
        return next(new ApiError('Tenant information required', 'TENANT_REQUIRED', 400));
      }

      const tenantId = tenant.id || tenant.tenantId;
      const limits = tenant.subscription?.limits as TenantLimits;

      if (!limits) {
        // No limits configured, allow the request
        return next();
      }

      const quotaCheck = await checkQuotaLimit(tenantId, limitType, limits);

      if (!quotaCheck.allowed) {
        logger.warn('Quota limit exceeded', {
          tenantId,
          limitType,
          current: quotaCheck.current,
          limit: quotaCheck.limit,
        });

        return next(
          new ApiError(
            `${resourceName} limit reached. Your plan allows ${quotaCheck.limit} ${resourceName.toLowerCase()}s. ` +
            `Please upgrade your plan or remove existing ${resourceName.toLowerCase()}s.`,
            'QUOTA_EXCEEDED',
            403,
            {
              limitType,
              current: quotaCheck.current,
              limit: quotaCheck.limit,
              remaining: quotaCheck.remaining,
            }
          )
        );
      }

      // Attach quota info to request for downstream use
      (req as any).quotaInfo = {
        [limitType]: quotaCheck,
      };

      next();
    } catch (error) {
      logger.error('Quota check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  };
}

/**
 * Middleware to enforce location limits
 */
export const enforceLocationQuota = enforceQuota('locations', 'Location');

/**
 * Middleware to enforce user limits
 */
export const enforceUserQuota = enforceQuota('users', 'User');

/**
 * Middleware to enforce product limits
 */
export const enforceProductQuota = enforceQuota('products', 'Product');

/**
 * Middleware to enforce monthly order limits
 */
export const enforceOrderQuota = enforceQuota('monthlyOrders', 'Monthly order');

/**
 * Middleware to enforce storage limits
 */
export const enforceStorageQuota = (additionalBytesKey?: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenant = (req as any).tenant;
      if (!tenant) {
        return next(new ApiError('Tenant information required', 'TENANT_REQUIRED', 400));
      }

      const tenantId = tenant.id || tenant.tenantId;
      const limits = tenant.subscription?.limits as TenantLimits;

      if (!limits) {
        return next();
      }

      // Get additional bytes from request if key is provided
      let additionalBytes = 0;
      if (additionalBytesKey && (req as any)[additionalBytesKey]) {
        additionalBytes = (req as any)[additionalBytesKey];
      } else if (req.file) {
        additionalBytes = req.file.size;
      } else if (req.files && Array.isArray(req.files)) {
        additionalBytes = (req.files as Express.Multer.File[]).reduce((sum, file) => sum + file.size, 0);
      }

      const storageCheck = await checkStorageQuota(tenantId, limits, additionalBytes);

      if (!storageCheck.allowed) {
        logger.warn('Storage quota exceeded', {
          tenantId,
          usedGB: storageCheck.usedGB.toFixed(2),
          limitGB: storageCheck.limitGB,
        });

        return next(
          new ApiError(
            `Storage limit reached. Your plan allows ${storageCheck.limitGB}GB. ` +
            `Currently using ${storageCheck.usedGB.toFixed(2)}GB. ` +
            `Please upgrade your plan or delete some files.`,
            'STORAGE_QUOTA_EXCEEDED',
            403,
            {
              limitType: 'storage',
              usedGB: storageCheck.usedGB,
              limitGB: storageCheck.limitGB,
              remainingGB: storageCheck.remainingGB,
            }
          )
        );
      }

      (req as any).storageQuotaInfo = storageCheck;
      next();
    } catch (error) {
      logger.error('Storage quota check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      next(error);
    }
  };
};

/**
 * Comprehensive quota check middleware - checks all limits
 */
export const checkAllQuotas = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) {
      return next();
    }

    const tenantId = tenant.id || tenant.tenantId;
    const limits = tenant.subscription?.limits as TenantLimits;

    if (!limits) {
      return next();
    }

    const usage = await getTenantUsage(tenantId);

    // Calculate usage percentages
    const quotaStatus = {
      locations: {
        used: usage.locations,
        limit: limits.locations,
        percentage: Math.round((usage.locations / limits.locations) * 100),
        warning: usage.locations >= limits.locations * 0.8,
        exceeded: usage.locations >= limits.locations,
      },
      users: {
        used: usage.users,
        limit: limits.users,
        percentage: Math.round((usage.users / limits.users) * 100),
        warning: usage.users >= limits.users * 0.8,
        exceeded: usage.users >= limits.users,
      },
      products: {
        used: usage.products,
        limit: limits.products,
        percentage: Math.round((usage.products / limits.products) * 100),
        warning: usage.products >= limits.products * 0.8,
        exceeded: usage.products >= limits.products,
      },
      monthlyOrders: {
        used: usage.monthlyOrders,
        limit: limits.monthlyOrders,
        percentage: Math.round((usage.monthlyOrders / limits.monthlyOrders) * 100),
        warning: usage.monthlyOrders >= limits.monthlyOrders * 0.8,
        exceeded: usage.monthlyOrders >= limits.monthlyOrders,
      },
      storage: {
        usedBytes: usage.storageBytes,
        usedGB: usage.storageBytes / (1024 * 1024 * 1024),
        limitGB: limits.storageGB,
        percentage: Math.round((usage.storageBytes / (limits.storageGB * 1024 * 1024 * 1024)) * 100),
        warning: usage.storageBytes >= limits.storageGB * 1024 * 1024 * 1024 * 0.8,
        exceeded: usage.storageBytes >= limits.storageGB * 1024 * 1024 * 1024,
      },
    };

    // Attach quota status to request
    (req as any).quotaStatus = quotaStatus;

    // Log warnings for quotas near limit
    const warnings: string[] = [];
    if (quotaStatus.locations.warning && !quotaStatus.locations.exceeded) {
      warnings.push('locations');
    }
    if (quotaStatus.users.warning && !quotaStatus.users.exceeded) {
      warnings.push('users');
    }
    if (quotaStatus.products.warning && !quotaStatus.products.exceeded) {
      warnings.push('products');
    }
    if (quotaStatus.monthlyOrders.warning && !quotaStatus.monthlyOrders.exceeded) {
      warnings.push('monthlyOrders');
    }
    if (quotaStatus.storage.warning && !quotaStatus.storage.exceeded) {
      warnings.push('storage');
    }

    if (warnings.length > 0) {
      logger.info('Tenant approaching quota limits', {
        tenantId,
        warnings,
      });
    }

    next();
  } catch (error) {
    logger.error('Quota status check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    next(error);
  }
};

/**
 * Get quota status for a tenant (useful for API endpoints)
 */
export async function getQuotaStatus(
  tenantId: string,
  limits: TenantLimits
): Promise<{
  usage: QuotaUsage;
  limits: TenantLimits;
  percentages: Record<string, number>;
  warnings: string[];
  exceeded: string[];
}> {
  const usage = await getTenantUsage(tenantId);

  const percentages = {
    locations: Math.round((usage.locations / limits.locations) * 100),
    users: Math.round((usage.users / limits.users) * 100),
    products: Math.round((usage.products / limits.products) * 100),
    monthlyOrders: Math.round((usage.monthlyOrders / limits.monthlyOrders) * 100),
    storage: Math.round((usage.storageBytes / (limits.storageGB * 1024 * 1024 * 1024)) * 100),
  };

  const warnings: string[] = [];
  const exceeded: string[] = [];

  for (const [key, percentage] of Object.entries(percentages)) {
    if (percentage >= 100) {
      exceeded.push(key);
    } else if (percentage >= 80) {
      warnings.push(key);
    }
  }

  return {
    usage,
    limits,
    percentages,
    warnings,
    exceeded,
  };
}

/**
 * Middleware to add quota headers to response
 */
export const addQuotaHeaders = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const quotaStatus = (req as any).quotaStatus;

  if (quotaStatus) {
    // Add headers for each quota type
    res.setHeader('X-Quota-Locations-Used', quotaStatus.locations.used);
    res.setHeader('X-Quota-Locations-Limit', quotaStatus.locations.limit);
    res.setHeader('X-Quota-Users-Used', quotaStatus.users.used);
    res.setHeader('X-Quota-Users-Limit', quotaStatus.users.limit);
    res.setHeader('X-Quota-Products-Used', quotaStatus.products.used);
    res.setHeader('X-Quota-Products-Limit', quotaStatus.products.limit);
    res.setHeader('X-Quota-Orders-Used', quotaStatus.monthlyOrders.used);
    res.setHeader('X-Quota-Orders-Limit', quotaStatus.monthlyOrders.limit);
    res.setHeader('X-Quota-Storage-Used-GB', quotaStatus.storage.usedGB.toFixed(2));
    res.setHeader('X-Quota-Storage-Limit-GB', quotaStatus.storage.limitGB);
  }

  next();
};
