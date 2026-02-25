// Health check routes for Notification Service

import { Router, Request, Response } from 'express';
import { logger, createResponse, getPlatformDatabase, cache, checkDatabaseHealthFromMongo } from '@properpos/backend-shared';

// Alias for checkDatabaseHealth
const checkDatabaseHealth = checkDatabaseHealthFromMongo;

export const healthRoutes = Router();

healthRoutes.get('/', (req: Request, res: Response) => {
  res.json(createResponse({
    status: 'healthy',
    service: 'ProperPOS Notification Service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    channels: ['email', 'sms', 'push', 'in_app', 'webhook'],
  }, 'Notification service is healthy'));
});

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

    // Check cache/queue connectivity (Redis)
    try {
      const cacheStart = Date.now();
      await cache.ping();
      checks.cache = {
        status: 'healthy',
        responseTime: Date.now() - cacheStart,
        connection: 'connected',
      };
      checks.queue = {
        status: 'healthy',
        connection: 'connected',
      };
    } catch (error) {
      checks.cache = {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        connection: 'failed',
      };
      checks.queue = {
        status: 'degraded',
        note: 'Queue may be unavailable',
      };
      isHealthy = false;
    }

    // Check notification channels
    checks.channels = {
      email: {
        status: process.env.SMTP_HOST ? 'configured' : 'not_configured',
      },
      sms: {
        status: process.env.TWILIO_ACCOUNT_SID ? 'configured' : 'not_configured',
      },
      push: {
        status: process.env.FIREBASE_PROJECT_ID ? 'configured' : 'not_configured',
      },
      in_app: {
        status: 'available',
      },
      webhook: {
        status: 'available',
      },
    };

    // System information
    const memoryUsage = process.memoryUsage();
    checks.system = {
      status: 'healthy',
      memory: {
        used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        usage: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100),
      },
      uptime: process.uptime(),
      pid: process.pid,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
    };

    const responseData = {
      status: isHealthy ? 'healthy' : 'unhealthy',
      service: 'ProperPOS Notification Service',
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

    res.json(createResponse(responseData, 'Notification service is healthy'));
    return;

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

healthRoutes.get('/readiness', async (req: Request, res: Response): Promise<void> => {
  try {
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

healthRoutes.get('/liveness', (req: Request, res: Response) => {
  res.json(createResponse({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }, 'Service is alive'));
});

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
