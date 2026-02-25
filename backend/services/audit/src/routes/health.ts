// Health check routes for Audit Service

import { Router, Request, Response } from 'express';
import { logger, createResponse, getPlatformDatabase, cache, checkDatabaseHealthFromMongo } from '@properpos/backend-shared';

export const healthRoutes = Router();

healthRoutes.get('/', (req: Request, res: Response) => {
  res.json(createResponse({
    status: 'healthy',
    service: 'ProperPOS Audit Service',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    features: ['audit_logging', 'search', 'export', 'retention'],
  }, 'Audit service is healthy'));
});

healthRoutes.get('/detailed', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const checks: Record<string, any> = {};
  let isHealthy = true;

  try {
    // Check database connectivity
    try {
      const dbStart = Date.now();
      await getPlatformDatabase().db.admin().ping();
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

    // Retention policy status
    checks.retention = {
      status: 'active',
      defaultRetentionDays: parseInt(process.env.AUDIT_RETENTION_DAYS || '90'),
    };

    const responseData = {
      status: isHealthy ? 'healthy' : 'unhealthy',
      service: 'ProperPOS Audit Service',
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

    res.json(createResponse(responseData, 'Audit service is healthy'));

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
    await getPlatformDatabase().db.admin().ping();

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
