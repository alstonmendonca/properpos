/**
 * Environment Configuration System
 *
 * Provides environment-specific configurations for development, staging, and production.
 * All values can be overridden via environment variables.
 */

type Environment = 'development' | 'staging' | 'production' | 'test';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  authWindowMs: number;
  authMaxRequests: number;
  sensitiveWindowMs: number;
  sensitiveMaxRequests: number;
}

interface CacheConfig {
  defaultTTL: number;
  sessionTTL: number;
  permissionTTL: number;
  analyticsTTL: number;
  productTTL: number;
}

interface DatabaseConfig {
  mongodbPlatformPoolSize: number;
  mongodbTenantPoolSize: number;
  mongodbMinPoolSize: number;
  redisMaxRetries: number;
  redisRetryDelayMs: number;
  connectionTimeoutMs: number;
}

interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  includeStack: boolean;
  prettyPrint: boolean;
  enableApiLogging: boolean;
  enableQueryLogging: boolean;
}

interface SecurityConfig {
  jwtExpiresIn: string;
  jwtRefreshExpiresIn: string;
  bcryptRounds: number;
  maxLoginAttempts: number;
  lockoutDurationMs: number;
  corsMaxAge: number;
  csrfEnabled: boolean;
}

interface ApiConfig {
  defaultTimeoutMs: number;
  analyticsTimeoutMs: number;
  uploadTimeoutMs: number;
  bulkTimeoutMs: number;
  maxRequestSizeMb: number;
}

interface FeatureFlags {
  enableMFA: boolean;
  enableWebPush: boolean;
  enableEmailNotifications: boolean;
  enableSMSNotifications: boolean;
  enableAnalyticsAggregation: boolean;
  enableAutoBackup: boolean;
}

interface EnvironmentConfig {
  rateLimit: RateLimitConfig;
  cache: CacheConfig;
  database: DatabaseConfig;
  logging: LoggingConfig;
  security: SecurityConfig;
  api: ApiConfig;
  features: FeatureFlags;
}

// Development configuration - relaxed limits, verbose logging
const developmentConfig: EnvironmentConfig = {
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 10000, // Very high for development
    authWindowMs: 15 * 60 * 1000,
    authMaxRequests: 100,
    sensitiveWindowMs: 60 * 60 * 1000,
    sensitiveMaxRequests: 50,
  },
  cache: {
    defaultTTL: 60, // 1 minute - short for development
    sessionTTL: 3600, // 1 hour
    permissionTTL: 60, // 1 minute
    analyticsTTL: 60,
    productTTL: 60,
  },
  database: {
    mongodbPlatformPoolSize: 10,
    mongodbTenantPoolSize: 5,
    mongodbMinPoolSize: 1,
    redisMaxRetries: 3,
    redisRetryDelayMs: 1000,
    connectionTimeoutMs: 30000,
  },
  logging: {
    level: 'debug',
    includeStack: true,
    prettyPrint: true,
    enableApiLogging: true,
    enableQueryLogging: true,
  },
  security: {
    jwtExpiresIn: '1h', // Longer for development convenience
    jwtRefreshExpiresIn: '30d',
    bcryptRounds: 10,
    maxLoginAttempts: 100, // Very high for development
    lockoutDurationMs: 60 * 1000, // 1 minute
    corsMaxAge: 0, // No caching in development
    csrfEnabled: false, // Disabled for easier API testing
  },
  api: {
    defaultTimeoutMs: 60000, // 1 minute
    analyticsTimeoutMs: 120000,
    uploadTimeoutMs: 300000,
    bulkTimeoutMs: 180000,
    maxRequestSizeMb: 50,
  },
  features: {
    enableMFA: true,
    enableWebPush: false,
    enableEmailNotifications: false, // Use Mailtrap in development
    enableSMSNotifications: false,
    enableAnalyticsAggregation: true,
    enableAutoBackup: false,
  },
};

// Staging configuration - production-like with some relaxed limits
const stagingConfig: EnvironmentConfig = {
  rateLimit: {
    windowMs: 15 * 60 * 1000,
    maxRequests: 2000,
    authWindowMs: 15 * 60 * 1000,
    authMaxRequests: 20,
    sensitiveWindowMs: 60 * 60 * 1000,
    sensitiveMaxRequests: 10,
  },
  cache: {
    defaultTTL: 180, // 3 minutes
    sessionTTL: 3600,
    permissionTTL: 300,
    analyticsTTL: 300,
    productTTL: 180,
  },
  database: {
    mongodbPlatformPoolSize: 25,
    mongodbTenantPoolSize: 10,
    mongodbMinPoolSize: 3,
    redisMaxRetries: 5,
    redisRetryDelayMs: 2000,
    connectionTimeoutMs: 20000,
  },
  logging: {
    level: 'info',
    includeStack: true,
    prettyPrint: false,
    enableApiLogging: true,
    enableQueryLogging: false,
  },
  security: {
    jwtExpiresIn: '30m',
    jwtRefreshExpiresIn: '14d',
    bcryptRounds: 12,
    maxLoginAttempts: 10,
    lockoutDurationMs: 15 * 60 * 1000, // 15 minutes
    corsMaxAge: 3600, // 1 hour
    csrfEnabled: true,
  },
  api: {
    defaultTimeoutMs: 30000,
    analyticsTimeoutMs: 60000,
    uploadTimeoutMs: 120000,
    bulkTimeoutMs: 90000,
    maxRequestSizeMb: 25,
  },
  features: {
    enableMFA: true,
    enableWebPush: true,
    enableEmailNotifications: true,
    enableSMSNotifications: false, // Save SMS costs in staging
    enableAnalyticsAggregation: true,
    enableAutoBackup: true,
  },
};

// Production configuration - strict security, optimized performance
const productionConfig: EnvironmentConfig = {
  rateLimit: {
    windowMs: 15 * 60 * 1000,
    maxRequests: 1000,
    authWindowMs: 15 * 60 * 1000,
    authMaxRequests: 10,
    sensitiveWindowMs: 60 * 60 * 1000,
    sensitiveMaxRequests: 5,
  },
  cache: {
    defaultTTL: 300, // 5 minutes
    sessionTTL: 3600,
    permissionTTL: 600, // 10 minutes
    analyticsTTL: 600,
    productTTL: 300,
  },
  database: {
    mongodbPlatformPoolSize: 50,
    mongodbTenantPoolSize: 15,
    mongodbMinPoolSize: 5,
    redisMaxRetries: 10,
    redisRetryDelayMs: 3000,
    connectionTimeoutMs: 10000,
  },
  logging: {
    level: 'info',
    includeStack: false, // Don't leak stack traces in production logs
    prettyPrint: false,
    enableApiLogging: false, // Performance optimization
    enableQueryLogging: false,
  },
  security: {
    jwtExpiresIn: '15m',
    jwtRefreshExpiresIn: '7d',
    bcryptRounds: 14,
    maxLoginAttempts: 5,
    lockoutDurationMs: 30 * 60 * 1000, // 30 minutes
    corsMaxAge: 86400, // 24 hours
    csrfEnabled: true,
  },
  api: {
    defaultTimeoutMs: 30000,
    analyticsTimeoutMs: 60000,
    uploadTimeoutMs: 120000,
    bulkTimeoutMs: 90000,
    maxRequestSizeMb: 10,
  },
  features: {
    enableMFA: true,
    enableWebPush: true,
    enableEmailNotifications: true,
    enableSMSNotifications: true,
    enableAnalyticsAggregation: true,
    enableAutoBackup: true,
  },
};

// Test configuration - fast and isolated
const testConfig: EnvironmentConfig = {
  rateLimit: {
    windowMs: 1000,
    maxRequests: 100000,
    authWindowMs: 1000,
    authMaxRequests: 100000,
    sensitiveWindowMs: 1000,
    sensitiveMaxRequests: 100000,
  },
  cache: {
    defaultTTL: 1,
    sessionTTL: 60,
    permissionTTL: 1,
    analyticsTTL: 1,
    productTTL: 1,
  },
  database: {
    mongodbPlatformPoolSize: 5,
    mongodbTenantPoolSize: 2,
    mongodbMinPoolSize: 1,
    redisMaxRetries: 1,
    redisRetryDelayMs: 100,
    connectionTimeoutMs: 5000,
  },
  logging: {
    level: 'error', // Only log errors in tests
    includeStack: true,
    prettyPrint: false,
    enableApiLogging: false,
    enableQueryLogging: false,
  },
  security: {
    jwtExpiresIn: '1h',
    jwtRefreshExpiresIn: '1d',
    bcryptRounds: 4, // Fast for tests
    maxLoginAttempts: 1000,
    lockoutDurationMs: 1000,
    corsMaxAge: 0,
    csrfEnabled: false,
  },
  api: {
    defaultTimeoutMs: 5000,
    analyticsTimeoutMs: 10000,
    uploadTimeoutMs: 10000,
    bulkTimeoutMs: 10000,
    maxRequestSizeMb: 10,
  },
  features: {
    enableMFA: false,
    enableWebPush: false,
    enableEmailNotifications: false,
    enableSMSNotifications: false,
    enableAnalyticsAggregation: false,
    enableAutoBackup: false,
  },
};

const configs: Record<Environment, EnvironmentConfig> = {
  development: developmentConfig,
  staging: stagingConfig,
  production: productionConfig,
  test: testConfig,
};

/**
 * Get the current environment
 */
export function getEnvironment(): Environment {
  const env = process.env.NODE_ENV as Environment;
  if (env && configs[env]) {
    return env;
  }
  return 'development';
}

/**
 * Get environment-specific configuration
 * Values can be overridden via environment variables
 */
export function getConfig(): EnvironmentConfig {
  const env = getEnvironment();
  const baseConfig = configs[env];

  // Allow environment variable overrides
  return {
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '') || baseConfig.rateLimit.windowMs,
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '') || baseConfig.rateLimit.maxRequests,
      authWindowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '') || baseConfig.rateLimit.authWindowMs,
      authMaxRequests: parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS || '') || baseConfig.rateLimit.authMaxRequests,
      sensitiveWindowMs: parseInt(process.env.SENSITIVE_RATE_LIMIT_WINDOW_MS || '') || baseConfig.rateLimit.sensitiveWindowMs,
      sensitiveMaxRequests: parseInt(process.env.SENSITIVE_RATE_LIMIT_MAX_REQUESTS || '') || baseConfig.rateLimit.sensitiveMaxRequests,
    },
    cache: {
      defaultTTL: parseInt(process.env.CACHE_DEFAULT_TTL || '') || baseConfig.cache.defaultTTL,
      sessionTTL: parseInt(process.env.CACHE_SESSION_TTL || '') || baseConfig.cache.sessionTTL,
      permissionTTL: parseInt(process.env.CACHE_PERMISSION_TTL || '') || baseConfig.cache.permissionTTL,
      analyticsTTL: parseInt(process.env.CACHE_ANALYTICS_TTL || '') || baseConfig.cache.analyticsTTL,
      productTTL: parseInt(process.env.CACHE_PRODUCT_TTL || '') || baseConfig.cache.productTTL,
    },
    database: {
      mongodbPlatformPoolSize: parseInt(process.env.MONGODB_PLATFORM_POOL_SIZE || '') || baseConfig.database.mongodbPlatformPoolSize,
      mongodbTenantPoolSize: parseInt(process.env.MONGODB_TENANT_POOL_SIZE || '') || baseConfig.database.mongodbTenantPoolSize,
      mongodbMinPoolSize: parseInt(process.env.MONGODB_MIN_POOL_SIZE || '') || baseConfig.database.mongodbMinPoolSize,
      redisMaxRetries: parseInt(process.env.REDIS_MAX_RETRIES || '') || baseConfig.database.redisMaxRetries,
      redisRetryDelayMs: parseInt(process.env.REDIS_RETRY_DELAY_MS || '') || baseConfig.database.redisRetryDelayMs,
      connectionTimeoutMs: parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || '') || baseConfig.database.connectionTimeoutMs,
    },
    logging: {
      level: (process.env.LOG_LEVEL as LoggingConfig['level']) || baseConfig.logging.level,
      includeStack: process.env.LOG_INCLUDE_STACK === 'true' || baseConfig.logging.includeStack,
      prettyPrint: process.env.LOG_PRETTY_PRINT === 'true' || baseConfig.logging.prettyPrint,
      enableApiLogging: process.env.ENABLE_API_LOGGING === 'true' || baseConfig.logging.enableApiLogging,
      enableQueryLogging: process.env.ENABLE_QUERY_LOGGING === 'true' || baseConfig.logging.enableQueryLogging,
    },
    security: {
      jwtExpiresIn: process.env.JWT_EXPIRES_IN || baseConfig.security.jwtExpiresIn,
      jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || baseConfig.security.jwtRefreshExpiresIn,
      bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '') || baseConfig.security.bcryptRounds,
      maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '') || baseConfig.security.maxLoginAttempts,
      lockoutDurationMs: parseInt(process.env.LOCKOUT_DURATION_MS || '') || baseConfig.security.lockoutDurationMs,
      corsMaxAge: parseInt(process.env.CORS_MAX_AGE || '') || baseConfig.security.corsMaxAge,
      csrfEnabled: process.env.CSRF_ENABLED !== 'false' && baseConfig.security.csrfEnabled,
    },
    api: {
      defaultTimeoutMs: parseInt(process.env.API_DEFAULT_TIMEOUT_MS || '') || baseConfig.api.defaultTimeoutMs,
      analyticsTimeoutMs: parseInt(process.env.API_ANALYTICS_TIMEOUT_MS || '') || baseConfig.api.analyticsTimeoutMs,
      uploadTimeoutMs: parseInt(process.env.API_UPLOAD_TIMEOUT_MS || '') || baseConfig.api.uploadTimeoutMs,
      bulkTimeoutMs: parseInt(process.env.API_BULK_TIMEOUT_MS || '') || baseConfig.api.bulkTimeoutMs,
      maxRequestSizeMb: parseInt(process.env.API_MAX_REQUEST_SIZE_MB || '') || baseConfig.api.maxRequestSizeMb,
    },
    features: {
      enableMFA: process.env.FEATURE_MFA !== 'false' && baseConfig.features.enableMFA,
      enableWebPush: process.env.FEATURE_WEB_PUSH === 'true' || baseConfig.features.enableWebPush,
      enableEmailNotifications: process.env.FEATURE_EMAIL !== 'false' && baseConfig.features.enableEmailNotifications,
      enableSMSNotifications: process.env.FEATURE_SMS === 'true' || baseConfig.features.enableSMSNotifications,
      enableAnalyticsAggregation: process.env.FEATURE_ANALYTICS !== 'false' && baseConfig.features.enableAnalyticsAggregation,
      enableAutoBackup: process.env.FEATURE_AUTO_BACKUP === 'true' || baseConfig.features.enableAutoBackup,
    },
  };
}

/**
 * Validate required environment variables for production
 */
export function validateProductionEnv(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const env = getEnvironment();

  if (env !== 'production') {
    return { valid: true, errors: [] };
  }

  // Required in production
  const requiredVars = [
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'MONGODB_URI',
    'REDIS_URL',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'SMTP_HOST',
    'SMTP_USER',
    'SMTP_PASS',
  ];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      errors.push(`Missing required environment variable: ${varName}`);
    }
  }

  // JWT secret must be at least 32 characters
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters long');
  }

  if (process.env.JWT_REFRESH_SECRET && process.env.JWT_REFRESH_SECRET.length < 32) {
    errors.push('JWT_REFRESH_SECRET must be at least 32 characters long');
  }

  // CORS origin should not be wildcard in production
  if (process.env.CORS_ORIGIN === '*') {
    errors.push('CORS_ORIGIN should not be wildcard (*) in production');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Export config types for external use
export type {
  Environment,
  EnvironmentConfig,
  RateLimitConfig,
  CacheConfig,
  DatabaseConfig,
  LoggingConfig,
  SecurityConfig,
  ApiConfig,
  FeatureFlags,
};

// Export singleton config instance
export const config = getConfig();
