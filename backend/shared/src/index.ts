// Main entry point for ProperPOS Backend Shared Library

// Export configuration
export * from './config';

// Export all middleware
export * from './middleware/auth';
// Export authorization with renamed 'authorize' to avoid conflict with auth middleware
export {
  type AuthorizationContext,
  type ResourceAccess,
  RESOURCE_PERMISSIONS,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  hasUnrestrictedLocationAccess,
  canAccessLocation,
  getAuthContext,
  authorizeResource,
  enforceLocationScope,
  scopeByLocation,
  requireAllPermissions,
  requireAnyPermission,
  authorize as resourceAuthorize,
  logAuthorizationEvent,
  getEffectivePermissions,
  invalidatePermissionCache,
} from './middleware/authorization';
export * from './middleware/validation';
export * from './middleware/security';
export * from './middleware/quota';

// Export error utilities
export * from './utils/errors';

// Export cookie utilities for token management
export * from './utils/cookies';

// Export logging utilities - rename logHealthCheck to avoid conflict with health service
export {
  logger,
  logError,
  PerformanceTimer,
  generateCorrelationId,
  logAnalytics,
  logMetrics,
  logDatabase,
  logExternalCall,
  logCache,
  logHealthCheck as logHealthCheckFromLogger,
  flushLogs,
  morganToken,
} from './utils/logger';

// Export database utilities - rename checkDatabaseHealth to avoid conflict with health service
export {
  tenantDB,
  baseSchemaFields,
  softDeleteFields,
  timestampPlugin,
  softDeletePlugin,
  auditPlugin,
  tenantPlugin,
  initializeDatabase,
  checkDatabaseHealth as checkDatabaseHealthFromMongo,
  gracefulShutdown,
  mongoose,
  getPlatformDB,
  platformDB,
} from './database/mongodb';

// Helper function to get tenant database connection - returns mongoose.Connection
export const getTenantDB = async (tenantId: string) => {
  const { tenantDB } = require('./database/mongodb');
  return tenantDB.getTenantDB(tenantId);
};

// Helper function to get tenant database Db object - returns mongodb Db
export const getTenantDatabase = async (tenantId: string) => {
  const { tenantDB } = require('./database/mongodb');
  const connection = await tenantDB.getTenantDB(tenantId);
  const db = connection.db;
  if (!db) {
    throw new Error(`Tenant database not connected for tenant: ${tenantId}`);
  }
  return db;
};

// Helper function to get platform database Db object - returns mongodb Db
export const getPlatformDatabase = () => {
  const { tenantDB } = require('./database/mongodb');
  const connection = tenantDB.getPlatformDB();
  const db = connection.db;
  if (!db) {
    throw new Error('Platform database not connected');
  }
  return db;
};

export * from './database/service';
export * from './database/indexes';
export * from './database/migrations';

// Export communication services
export * from './services/email';
export * from './services/sms';
// Export health service (includes checkDatabaseHealth and logHealthCheck)
export * from './services/health';
export {
  redis,
  redisPub,
  redisSub,
  CacheService,
  cache,
  SessionService,
  sessionService,
  RateLimitService,
  rateLimitService,
  LockService,
  lockService,
  PubSubService,
  pubsub,
  RedisService,
  checkRedisHealth,
  gracefulShutdown as redisGracefulShutdown
} from './database/redis';

// Re-export shared types and utilities
export * from '@properpos/shared';

// Version information
export const BACKEND_SHARED_VERSION = '1.0.0';

// Default configurations
export const DEFAULT_CONFIG = {
  JWT: {
    SECRET: process.env.JWT_SECRET || 'your-secret-key',
    EXPIRES_IN: process.env.JWT_EXPIRES_IN || '15m',
    REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    ALGORITHM: 'HS256' as const,
  },
  CORS: {
    ORIGIN: process.env.CORS_ORIGIN || '*',
    METHODS: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    ALLOWED_HEADERS: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'X-Tenant-ID',
      'X-Correlation-ID',
    ],
    CREDENTIALS: true,
  },
  RATE_LIMIT: {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_REQUESTS: 1000,
  },
  CACHE: {
    DEFAULT_TTL: 300, // 5 minutes
    SESSION_TTL: 3600, // 1 hour
  },
  DATABASE: {
    MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/properpos_platform',
    REDIS_HOST: process.env.REDIS_HOST || 'localhost',
    REDIS_PORT: parseInt(process.env.REDIS_PORT || '6379'),
  },
};

// Common HTTP response helpers
export const createResponse = <T>(data: T, message?: string) => ({
  success: true,
  data,
  message,
  timestamp: new Date().toISOString(),
});

export const createErrorResponse = (
  message: string,
  code: string = 'INTERNAL_ERROR',
  details?: any
) => ({
  success: false,
  error: {
    code,
    message,
    details,
    timestamp: new Date().toISOString(),
  },
});

// Pagination helpers
export const createPaginatedResponse = <T>(
  data: T[],
  page: number,
  limit: number,
  total: number,
  message?: string
) => ({
  success: true,
  data,
  message,
  meta: {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    hasMore: page * limit < total,
  },
  timestamp: new Date().toISOString(),
});

// Common validation schemas
export const commonValidation = {
  objectId: /^[0-9a-fA-F]{24}$/,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  phone: /^[+]?[1-9][\d\s\-()]{8,}$/,
  url: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/,
};

// Environment helpers
export const isProduction = () => process.env.NODE_ENV === 'production';
export const isDevelopment = () => process.env.NODE_ENV === 'development';
export const isTest = () => process.env.NODE_ENV === 'test';

// Service discovery helpers (for microservices)
export const getServiceUrl = (serviceName: string): string => {
  const baseUrl = process.env.SERVICE_BASE_URL || 'http://localhost';
  const servicePort = process.env[`${serviceName.toUpperCase()}_PORT`] || '3000';
  return `${baseUrl}:${servicePort}`;
};

export const SERVICE_PORTS = {
  GATEWAY: process.env.GATEWAY_PORT || '3001',
  AUTH: process.env.AUTH_PORT || '3002',
  TENANT: process.env.TENANT_PORT || '3003',
  POS: process.env.POS_PORT || '3004',
  INVENTORY: process.env.INVENTORY_PORT || '3005',
  ANALYTICS: process.env.ANALYTICS_PORT || '3006',
  BILLING: process.env.BILLING_PORT || '3007',
  NOTIFICATION: process.env.NOTIFICATION_PORT || '3008',
  AUDIT: process.env.AUDIT_PORT || '3009',
} as const;