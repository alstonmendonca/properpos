// Health check routes for API Gateway

import { Router, Request, Response } from 'express';
import {
  logger,
  createResponse,
  createErrorResponse,
  checkDatabaseHealthFromMongo,
  checkRedisHealth,
  logHealthCheck,
} from '@properpos/backend-shared';

// Alias for easier use
const checkDatabaseHealth = checkDatabaseHealthFromMongo;

export const healthRouter = Router();

// Basic health check
healthRouter.get('/', async (req: Request, res: Response) => {
  const healthData = {
    status: 'healthy',
    service: 'api-gateway',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    pid: process.pid,
  };

  logHealthCheck('api-gateway', 'healthy', healthData);
  res.json(createResponse(healthData));
});

// Detailed health check with dependencies
healthRouter.get('/detailed', async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    // Check all dependencies
    const [databaseHealth, redisHealth] = await Promise.allSettled([
      checkDatabaseHealth(),
      checkRedisHealth(),
    ]);

    // Parse results
    const dbStatus = databaseHealth.status === 'fulfilled' ? databaseHealth.value : {
      status: 'unhealthy',
      details: { error: (databaseHealth as PromiseRejectedResult).reason.message },
    };

    const redisStatus = redisHealth.status === 'fulfilled' ? redisHealth.value : {
      status: 'unhealthy',
      details: { error: (redisHealth as PromiseRejectedResult).reason.message },
    };

    // Determine overall health
    const isHealthy = dbStatus.status === 'healthy' && redisStatus.status === 'healthy';
    const overallStatus = isHealthy ? 'healthy' : 'unhealthy';

    const healthData = {
      status: overallStatus,
      service: 'api-gateway',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      responseTime: `${Date.now() - startTime}ms`,
      environment: process.env.NODE_ENV || 'development',

      // System information
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid,
        memory: {
          used: process.memoryUsage(),
          free: require('os').freemem(),
          total: require('os').totalmem(),
        },
        cpu: {
          usage: process.cpuUsage(),
          loadAverage: require('os').loadavg(),
        },
      },

      // Dependencies health
      dependencies: {
        database: dbStatus,
        redis: redisStatus,
      },

      // Microservices health (we'll check these if they're running)
      services: await checkMicroservicesHealth(),
    };

    logHealthCheck('api-gateway', overallStatus, healthData);

    if (isHealthy) {
      res.json(createResponse(healthData));
    } else {
      res.status(503).json(createErrorResponse(
        'Service unhealthy - one or more dependencies are down',
        'SERVICE_UNHEALTHY',
        healthData
      ));
    }
  } catch (error) {
    const errorData = {
      status: 'unhealthy',
      service: 'api-gateway',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      responseTime: `${Date.now() - startTime}ms`,
    };

    logger.error('Health check failed:', error);
    logHealthCheck('api-gateway', 'unhealthy', errorData);

    res.status(503).json(createErrorResponse(
      'Health check failed',
      'HEALTH_CHECK_FAILED',
      errorData
    ));
  }
});

// Individual service health checks
healthRouter.get('/database', async (req: Request, res: Response) => {
  try {
    const health = await checkDatabaseHealth();

    if (health.status === 'healthy') {
      res.json(createResponse(health.details));
    } else {
      res.status(503).json(createErrorResponse(
        'Database unhealthy',
        'DATABASE_UNHEALTHY',
        health.details
      ));
    }
  } catch (error) {
    res.status(503).json(createErrorResponse(
      'Database health check failed',
      'DATABASE_CHECK_FAILED',
      { error: error instanceof Error ? error.message : 'Unknown error' }
    ));
  }
});

healthRouter.get('/redis', async (req: Request, res: Response) => {
  try {
    const health = await checkRedisHealth();

    if (health.status === 'healthy') {
      res.json(createResponse(health.details));
    } else {
      res.status(503).json(createErrorResponse(
        'Redis unhealthy',
        'REDIS_UNHEALTHY',
        health.details
      ));
    }
  } catch (error) {
    res.status(503).json(createErrorResponse(
      'Redis health check failed',
      'REDIS_CHECK_FAILED',
      { error: error instanceof Error ? error.message : 'Unknown error' }
    ));
  }
});

// Readiness probe (for Kubernetes)
healthRouter.get('/ready', async (req: Request, res: Response) => {
  try {
    // Quick check of essential services
    await Promise.all([
      checkDatabaseHealth(),
      checkRedisHealth(),
    ]);

    res.status(200).json({ status: 'ready' });
  } catch (error) {
    res.status(503).json({ status: 'not ready', error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Liveness probe (for Kubernetes)
healthRouter.get('/live', (req: Request, res: Response) => {
  // Simple liveness check - if we can respond, we're alive
  res.status(200).json({ status: 'alive' });
});

// Helper function to check microservices health via HTTP
async function checkMicroservicesHealth() {
  const host = process.env.SERVICE_HOST || 'localhost';
  const timeout = parseInt(process.env.HEALTH_CHECK_TIMEOUT || '3000');

  const services = [
    { name: 'auth', host, port: process.env.AUTH_PORT || '3002', healthPath: '/health' },
    { name: 'tenant', host, port: process.env.TENANT_PORT || '3003', healthPath: '/health' },
    { name: 'pos', host, port: process.env.POS_PORT || '3004', healthPath: '/health' },
    { name: 'inventory', host, port: process.env.INVENTORY_PORT || '3005', healthPath: '/health' },
    { name: 'analytics', host, port: process.env.ANALYTICS_PORT || '3006', healthPath: '/health' },
    { name: 'billing', host, port: process.env.BILLING_PORT || '3007', healthPath: '/health' },
    { name: 'notification', host, port: process.env.NOTIFICATION_PORT || '3008', healthPath: '/health' },
    { name: 'audit', host, port: process.env.AUDIT_PORT || '3009', healthPath: '/health' },
  ];

  const healthChecks = services.map(async (service) => {
    const startTime = Date.now();
    const url = `http://${service.host}:${service.port}${service.healthPath}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      });

      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      if (response.ok) {
        let data;
        try {
          data = await response.json();
        } catch {
          data = null;
        }

        return {
          name: service.name,
          status: 'healthy' as const,
          port: service.port,
          responseTime,
          version: data?.data?.version,
          uptime: data?.data?.uptime,
          lastChecked: new Date().toISOString(),
        };
      } else {
        return {
          name: service.name,
          status: 'unhealthy' as const,
          port: service.port,
          responseTime,
          error: `HTTP ${response.status}: ${response.statusText}`,
          lastChecked: new Date().toISOString(),
        };
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      let errorMessage: string;

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMessage = 'Connection timeout';
        } else if ((error as NodeJS.ErrnoException).code === 'ECONNREFUSED') {
          errorMessage = 'Connection refused - service may be down';
        } else if ((error as NodeJS.ErrnoException).code === 'ENOTFOUND') {
          errorMessage = 'Host not found';
        } else {
          errorMessage = error.message;
        }
      } else {
        errorMessage = 'Unknown error';
      }

      return {
        name: service.name,
        status: 'unhealthy' as const,
        port: service.port,
        responseTime,
        error: errorMessage,
        lastChecked: new Date().toISOString(),
      };
    }
  });

  return await Promise.all(healthChecks);
}