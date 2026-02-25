// Health check routes

import { Router, Request, Response } from 'express';
import { logger, createResponse, getPlatformDatabase, cache, checkDatabaseHealthFromMongo } from '@properpos/backend-shared';

// Create alias for checkDatabaseHealth
const checkDatabaseHealth = checkDatabaseHealthFromMongo;

export const healthRoutes = Router();

/**
 * @swagger
 * /health:
 *   get:
 *     tags: [Health]
 *     summary: Basic health check
 *     description: Returns service health status
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: healthy
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                     uptime:
 *                       type: number
 *                       description: Service uptime in seconds
 */
healthRoutes.get('/', (req: Request, res: Response) => {
  res.json(createResponse({
    status: 'healthy',
    service: 'ProperPOS Authentication Service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  }, 'Authentication service is healthy'));
});

/**
 * @swagger
 * /health/detailed:
 *   get:
 *     tags: [Health]
 *     summary: Detailed health check
 *     description: Returns detailed health status including database and cache connectivity
 *     responses:
 *       200:
 *         description: Service is healthy
 *       503:
 *         description: Service is unhealthy
 */
healthRoutes.get('/detailed', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const checks: Record<string, any> = {};
  let isHealthy = true;

  try {
    // Check database connectivity
    try {
      const dbStart = Date.now();
      await getPlatformDatabase().admin().ping();
      checks.database = {
        status: 'healthy',
        responseTime: Date.now() - dbStart,
        connection: 'connected',
      };
    } catch (error) {
      checks.database = {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        connection: 'failed',
      };
      isHealthy = false;
    }

    // Check cache connectivity
    try {
      const cacheStart = Date.now();
      await cache.ping();
      checks.cache = {
        status: 'healthy',
        responseTime: Date.now() - cacheStart,
        connection: 'connected',
      };
    } catch (error) {
      checks.cache = {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        connection: 'failed',
      };
      isHealthy = false;
    }

    // System information
    const memoryUsage = process.memoryUsage();
    checks.system = {
      status: 'healthy',
      memory: {
        used: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
        total: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
        usage: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100), // %
      },
      uptime: process.uptime(),
      pid: process.pid,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
    };

    const responseData = {
      status: isHealthy ? 'healthy' : 'unhealthy',
      service: 'ProperPOS Authentication Service',
      timestamp: new Date().toISOString(),
      responseTime: Date.now() - startTime,
      checks,
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
    };

    if (!isHealthy) {
      logger.warn('Health check failed', { checks });
      res.status(503).json({
        success: false,
        error: {
          code: 'SERVICE_UNHEALTHY',
          message: 'One or more health checks failed',
          details: responseData,
        },
      });
      return;
    }

    res.json(createResponse(responseData, 'Authentication service is healthy'));

  } catch (error) {
    logger.error('Health check error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(503).json({
      success: false,
      error: {
        code: 'HEALTH_CHECK_ERROR',
        message: 'Health check failed',
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime,
      },
    });
  }
});

/**
 * @swagger
 * /health/readiness:
 *   get:
 *     tags: [Health]
 *     summary: Readiness check
 *     description: Indicates if the service is ready to accept requests
 */
healthRoutes.get('/readiness', async (req: Request, res: Response) => {
  try {
    // Check if service can handle requests
    // This is typically used by Kubernetes readiness probes

    // Check database connectivity
    await getPlatformDatabase().admin().ping();

    res.json(createResponse({
      status: 'ready',
      timestamp: new Date().toISOString(),
    }, 'Service is ready'));

  } catch (error) {
    logger.error('Readiness check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(503).json({
      success: false,
      error: {
        code: 'SERVICE_NOT_READY',
        message: 'Service is not ready to accept requests',
        timestamp: new Date().toISOString(),
      },
    });
  }
});

/**
 * @swagger
 * /health/liveness:
 *   get:
 *     tags: [Health]
 *     summary: Liveness check
 *     description: Indicates if the service is alive (used by Kubernetes liveness probes)
 */
healthRoutes.get('/liveness', (req: Request, res: Response) => {
  // Simple liveness check - if we can respond, we're alive
  res.json(createResponse({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }, 'Service is alive'));
});

/**
 * @swagger
 * /health/metrics:
 *   get:
 *     tags: [Health]
 *     summary: Basic service metrics
 *     description: Returns basic performance metrics
 */
healthRoutes.get('/metrics', (req: Request, res: Response) => {
  const memoryUsage = process.memoryUsage();

  const metrics = {
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      rss: memoryUsage.rss,
      heapTotal: memoryUsage.heapTotal,
      heapUsed: memoryUsage.heapUsed,
      external: memoryUsage.external,
      arrayBuffers: memoryUsage.arrayBuffers,
    },
    cpu: process.cpuUsage(),
    version: {
      node: process.version,
      v8: process.versions.v8,
    },
    environment: process.env.NODE_ENV || 'development',
  };

  res.json(createResponse(metrics, 'Service metrics retrieved'));
});

// Export a function to perform health checks
export const performHealthCheck = async (): Promise<{ healthy: boolean; details: any }> => {
  const checks: any = {};
  let healthy = true;

  try {
    // Database check
    await getPlatformDatabase().admin().ping();
    checks.database = { status: 'healthy' };
  } catch (error) {
    checks.database = {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
    healthy = false;
  }

  try {
    // Cache check
    await cache.ping();
    checks.cache = { status: 'healthy' };
  } catch (error) {
    checks.cache = {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
    healthy = false;
  }

  return {
    healthy,
    details: {
      timestamp: new Date().toISOString(),
      checks,
    },
  };
};