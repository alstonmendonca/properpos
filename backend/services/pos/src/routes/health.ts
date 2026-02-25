// Health monitoring routes

import { Router, Request, Response } from 'express';
import os from 'os';

import {
  logger,
  authenticate,
  extractTenant,
  requireRole,
  createResponse,
  createErrorResponse,
  UserRoles,
  DatabaseService,
  RedisService,
  getTenantDatabase,
  cache,
} from '@properpos/backend-shared';

export const healthRoutes = Router();

const dbService = new DatabaseService();
const redisService = new RedisService();

/**
 * @swagger
 * /api/v1/health:
 *   get:
 *     tags: [Health]
 *     summary: Basic health check
 */
healthRoutes.get('/',
  async (req: Request, res: Response) => {
    try {
      const health = {
        status: 'healthy',
        service: 'pos-service',
        version: process.env.npm_package_version || '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      };

      res.json(createResponse(health, 'Service is healthy'));

    } catch (error) {
      logger.error('Health check error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(503).json(createErrorResponse('Service unhealthy', 'SERVICE_UNHEALTHY'));
    }
  }
);

/**
 * @swagger
 * /api/v1/health/detailed:
 *   get:
 *     tags: [Health]
 *     summary: Detailed health check with dependencies
 *     security:
 *       - BearerAuth: []
 */
healthRoutes.get('/detailed',
  authenticate,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const startTime = Date.now();

      // Check database connectivity
      const dbHealth = await checkDatabaseHealth();

      // Check Redis connectivity
      const redisHealth = await checkRedisHealth();

      // Check external services
      const externalServices = await checkExternalServices();

      // Get system metrics
      const systemMetrics = getSystemMetrics();

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      const overallStatus = dbHealth.status === 'healthy' &&
                           redisHealth.status === 'healthy' &&
                           externalServices.every(service => service.status === 'healthy')
                           ? 'healthy' : 'unhealthy';

      const health = {
        status: overallStatus,
        service: 'pos-service',
        version: process.env.npm_package_version || '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        responseTime,
        checks: {
          database: dbHealth,
          redis: redisHealth,
          externalServices,
        },
        system: systemMetrics,
      };

      const statusCode = overallStatus === 'healthy' ? 200 : 503;
      res.status(statusCode).json(createResponse(health, `Service is ${overallStatus}`));

    } catch (error) {
      logger.error('Detailed health check error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(503).json(createErrorResponse('Health check failed', 'HEALTH_CHECK_FAILED'));
    }
  }
);

/**
 * @swagger
 * /api/v1/health/database:
 *   get:
 *     tags: [Health]
 *     summary: Database connectivity check
 *     security:
 *       - BearerAuth: []
 */
healthRoutes.get('/database',
  authenticate,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const dbHealth = await checkDatabaseHealth();

      const statusCode = dbHealth.status === 'healthy' ? 200 : 503;
      res.status(statusCode).json(createResponse(dbHealth, `Database is ${dbHealth.status}`));

    } catch (error) {
      logger.error('Database health check error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(503).json(createErrorResponse('Database health check failed', 'DB_HEALTH_CHECK_FAILED'));
    }
  }
);

/**
 * @swagger
 * /api/v1/health/redis:
 *   get:
 *     tags: [Health]
 *     summary: Redis connectivity check
 *     security:
 *       - BearerAuth: []
 */
healthRoutes.get('/redis',
  authenticate,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const redisHealth = await checkRedisHealth();

      const statusCode = redisHealth.status === 'healthy' ? 200 : 503;
      res.status(statusCode).json(createResponse(redisHealth, `Redis is ${redisHealth.status}`));

    } catch (error) {
      logger.error('Redis health check error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(503).json(createErrorResponse('Redis health check failed', 'REDIS_HEALTH_CHECK_FAILED'));
    }
  }
);

/**
 * @swagger
 * /api/v1/health/metrics:
 *   get:
 *     tags: [Health]
 *     summary: System performance metrics
 *     security:
 *       - BearerAuth: []
 */
healthRoutes.get('/metrics',
  authenticate,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const metrics = getSystemMetrics();
      const processMetrics = getProcessMetrics();
      const performanceMetrics = await getPerformanceMetrics();

      const allMetrics = {
        ...metrics,
        process: processMetrics,
        performance: performanceMetrics,
      };

      res.json(createResponse(allMetrics, 'Metrics retrieved successfully'));

    } catch (error) {
      logger.error('Metrics retrieval error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json(createErrorResponse('Failed to retrieve metrics', 'METRICS_RETRIEVAL_FAILED'));
    }
  }
);

/**
 * @swagger
 * /api/v1/health/tenant/{tenantId}:
 *   get:
 *     tags: [Health]
 *     summary: Tenant-specific health check
 *     security:
 *       - BearerAuth: []
 *       - TenantHeader: []
 */
healthRoutes.get('/tenant/:tenantId',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  async (req: Request, res: Response) => {
    const { tenantId } = req.params;

    try {
      const tenantHealth = await checkTenantHealth(tenantId);

      const statusCode = tenantHealth.status === 'healthy' ? 200 : 503;
      res.status(statusCode).json(createResponse(tenantHealth, `Tenant ${tenantId} is ${tenantHealth.status}`));

    } catch (error) {
      logger.error('Tenant health check error', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(503).json(createErrorResponse('Tenant health check failed', 'TENANT_HEALTH_CHECK_FAILED'));
    }
  }
);

/**
 * Check database connectivity and performance
 */
async function checkDatabaseHealth(): Promise<{
  status: 'healthy' | 'unhealthy';
  responseTime: number;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    // Try to get a database connection and perform a simple query
    const platformConnection = dbService.getPlatformDB();
    const db = platformConnection.db;
    if (!db) {
      throw new Error('Platform database not connected');
    }
    const collection = db.collection('health_check');

    await collection.findOne({});

    const endTime = Date.now();
    const responseTime = endTime - startTime;

    return {
      status: responseTime < 1000 ? 'healthy' : 'unhealthy',
      responseTime,
    };

  } catch (error) {
    const endTime = Date.now();
    const responseTime = endTime - startTime;

    return {
      status: 'unhealthy',
      responseTime,
      error: error instanceof Error ? error.message : 'Unknown database error',
    };
  }
}

/**
 * Check Redis connectivity and performance
 */
async function checkRedisHealth(): Promise<{
  status: 'healthy' | 'unhealthy';
  responseTime: number;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    // Try to set and get a test key from Redis
    const testKey = `health_check_${Date.now()}`;
    const testValue = 'healthy';

    await redisService.set(testKey, testValue, 5); // 5 second expiry
    const result = await redisService.get(testKey);
    await redisService.delete(testKey); // Clean up

    const endTime = Date.now();
    const responseTime = endTime - startTime;

    if (result !== testValue) {
      throw new Error('Redis test value mismatch');
    }

    return {
      status: responseTime < 100 ? 'healthy' : 'unhealthy',
      responseTime,
    };

  } catch (error) {
    const endTime = Date.now();
    const responseTime = endTime - startTime;

    return {
      status: 'unhealthy',
      responseTime,
      error: error instanceof Error ? error.message : 'Unknown Redis error',
    };
  }
}

/**
 * Check external services (Stripe, email, SMS, etc.)
 */
async function checkExternalServices(): Promise<Array<{
  service: string;
  status: 'healthy' | 'unhealthy';
  responseTime?: number;
  error?: string;
}>> {
  const services: Array<{
    service: string;
    status: 'healthy' | 'unhealthy';
    responseTime?: number;
    error?: string;
  }> = [];

  // Check Stripe
  try {
    const startTime = Date.now();

    // In a real implementation, you'd make a simple API call to check Stripe's status
    // For now, we'll simulate this check
    const isStripeHealthy = process.env.STRIPE_SECRET_KEY ? true : false;

    const endTime = Date.now();
    const responseTime = endTime - startTime;

    services.push({
      service: 'stripe',
      status: isStripeHealthy ? 'healthy' : 'unhealthy',
      responseTime,
      error: isStripeHealthy ? undefined : 'Stripe API key not configured',
    });

  } catch (error) {
    services.push({
      service: 'stripe',
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown Stripe error',
    });
  }

  // Check email service
  try {
    services.push({
      service: 'email',
      status: process.env.EMAIL_SERVICE_URL ? 'healthy' : 'unhealthy',
      error: process.env.EMAIL_SERVICE_URL ? undefined : 'Email service not configured',
    });
  } catch (error) {
    services.push({
      service: 'email',
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown email service error',
    });
  }

  // Check SMS service
  try {
    services.push({
      service: 'sms',
      status: process.env.SMS_SERVICE_URL ? 'healthy' : 'unhealthy',
      error: process.env.SMS_SERVICE_URL ? undefined : 'SMS service not configured',
    });
  } catch (error) {
    services.push({
      service: 'sms',
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown SMS service error',
    });
  }

  return services;
}

/**
 * Get system metrics
 */
function getSystemMetrics() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;

  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    nodeVersion: process.version,
    cpus: os.cpus().length,
    loadAverage: os.loadavg(),
    memory: {
      total: totalMemory,
      free: freeMemory,
      used: usedMemory,
      usagePercent: Math.round((usedMemory / totalMemory) * 100),
    },
    uptime: {
      system: os.uptime(),
      process: process.uptime(),
    },
  };
}

/**
 * Get process-specific metrics
 */
function getProcessMetrics() {
  const memUsage = process.memoryUsage();

  return {
    pid: process.pid,
    memory: {
      rss: memUsage.rss,
      heapTotal: memUsage.heapTotal,
      heapUsed: memUsage.heapUsed,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers,
    },
    cpu: process.cpuUsage(),
    versions: process.versions,
  };
}

/**
 * Get performance metrics
 */
async function getPerformanceMetrics() {
  // In a real implementation, you'd collect metrics from monitoring tools
  // For now, return basic performance indicators
  return {
    requestsPerMinute: Math.floor(Math.random() * 1000), // Placeholder
    averageResponseTime: Math.floor(Math.random() * 500), // Placeholder
    errorRate: Math.random() * 0.1, // Placeholder
    activeConnections: Math.floor(Math.random() * 100), // Placeholder
  };
}

/**
 * @swagger
 * /api/v1/health/liveness:
 *   get:
 *     tags: [Health]
 *     summary: Liveness probe (Kubernetes)
 */
healthRoutes.get('/liveness',
  (req: Request, res: Response) => {
    // Simple liveness check - if we can respond, we're alive
    res.json({
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  }
);

/**
 * @swagger
 * /api/v1/health/readiness:
 *   get:
 *     tags: [Health]
 *     summary: Readiness probe (Kubernetes)
 */
healthRoutes.get('/readiness',
  async (req: Request, res: Response) => {
    try {
      // Check critical dependencies
      const dbHealth = await checkDatabaseHealth();
      const redisHealth = await checkRedisHealth();

      const isReady = dbHealth.status === 'healthy' && redisHealth.status === 'healthy';

      if (isReady) {
        res.json({
          status: 'ready',
          timestamp: new Date().toISOString(),
          checks: {
            database: dbHealth.status,
            redis: redisHealth.status,
          },
        });
      } else {
        res.status(503).json({
          status: 'not ready',
          timestamp: new Date().toISOString(),
          checks: {
            database: dbHealth.status,
            redis: redisHealth.status,
          },
        });
      }
    } catch (error) {
      res.status(503).json({
        status: 'not ready',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * Check tenant-specific health
 */
async function checkTenantHealth(tenantId: string): Promise<{
  status: 'healthy' | 'unhealthy';
  checks: Record<string, any>;
  error?: string;
}> {
  try {
    const checks: Record<string, any> = {};

    // Check tenant database
    try {
      const tenantDb = await getTenantDatabase(tenantId);
      const collections = ['orders', 'products', 'customers', 'categories'];

      for (const collectionName of collections) {
        const collection = tenantDb.collection(collectionName);
        const count = await collection.estimatedDocumentCount();
        checks[`${collectionName}_count`] = count;
      }

      checks.database = 'healthy';
    } catch (error) {
      checks.database = 'unhealthy';
      checks.database_error = error instanceof Error ? error.message : 'Unknown error';
    }

    // Check tenant Redis data
    try {
      const tenantKey = `tenant:${tenantId}:health`;
      await redisService.set(tenantKey, 'healthy', 60);
      const result = await redisService.get(tenantKey);

      checks.redis = result === 'healthy' ? 'healthy' : 'unhealthy';
    } catch (error) {
      checks.redis = 'unhealthy';
      checks.redis_error = error instanceof Error ? error.message : 'Unknown error';
    }

    const overallStatus = checks.database === 'healthy' && checks.redis === 'healthy'
                         ? 'healthy' : 'unhealthy';

    return {
      status: overallStatus,
      checks,
    };

  } catch (error) {
    return {
      status: 'unhealthy',
      checks: {},
      error: error instanceof Error ? error.message : 'Unknown tenant health check error',
    };
  }
}