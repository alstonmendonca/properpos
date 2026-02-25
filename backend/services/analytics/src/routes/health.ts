// Health monitoring routes for Analytics Service

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
  RedisService,
  getPlatformDatabase,
} from '@properpos/backend-shared';

export const healthRoutes = Router();

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
        service: 'analytics-service',
        version: process.env.npm_package_version || '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      };

      res.json(createResponse(health, 'Analytics service is healthy'));

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

      // Get system metrics
      const systemMetrics = getSystemMetrics();

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      const overallStatus = dbHealth.status === 'healthy' && redisHealth.status === 'healthy'
                           ? 'healthy' : 'unhealthy';

      const health = {
        status: overallStatus,
        service: 'analytics-service',
        version: process.env.npm_package_version || '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        responseTime,
        checks: {
          database: dbHealth,
          redis: redisHealth,
        },
        system: systemMetrics,
      };

      const statusCode = overallStatus === 'healthy' ? 200 : 503;
      res.status(statusCode).json(createResponse(health, `Analytics service is ${overallStatus}`));

    } catch (error) {
      logger.error('Detailed health check error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(503).json(createErrorResponse('Health check failed', 'HEALTH_CHECK_FAILED'));
    }
  }
);

async function checkDatabaseHealth(): Promise<{
  status: 'healthy' | 'unhealthy';
  responseTime: number;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    const db = getPlatformDatabase();
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

async function checkRedisHealth(): Promise<{
  status: 'healthy' | 'unhealthy';
  responseTime: number;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    const testKey = `analytics_health_check_${Date.now()}`;
    const testValue = 'healthy';

    await redisService.set(testKey, testValue, 5);
    const result = await redisService.get(testKey);
    await redisService.delete(testKey);

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
 * @swagger
 * /api/v1/health/liveness:
 *   get:
 *     tags: [Health]
 *     summary: Liveness probe (Kubernetes)
 */
healthRoutes.get('/liveness',
  (req: Request, res: Response) => {
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