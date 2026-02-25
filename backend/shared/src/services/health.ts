// Shared health check service for ProperPOS microservices

import os from 'os';
import { Db } from 'mongodb';
import { logger } from '../utils/logger';

export interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  responseTime?: number;
  error?: string;
  details?: Record<string, any>;
}

export interface ServiceHealth {
  status: 'healthy' | 'unhealthy' | 'degraded';
  service: string;
  version: string;
  timestamp: string;
  uptime: number;
  responseTime?: number;
  checks?: Record<string, HealthStatus>;
  system?: SystemMetrics;
}

export interface SystemMetrics {
  hostname: string;
  platform: NodeJS.Platform;
  arch: string;
  nodeVersion: string;
  cpus: number;
  loadAverage: number[];
  memory: {
    total: number;
    free: number;
    used: number;
    usagePercent: number;
  };
  uptime: {
    system: number;
    process: number;
  };
}

export interface MicroserviceConfig {
  name: string;
  host: string;
  port: string | number;
  healthPath?: string;
}

/**
 * Get system metrics
 */
export function getSystemMetrics(): SystemMetrics {
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
export function getProcessMetrics() {
  const memUsage = process.memoryUsage();

  return {
    pid: process.pid,
    memory: {
      rss: memUsage.rss,
      heapTotal: memUsage.heapTotal,
      heapUsed: memUsage.heapUsed,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers,
      rssFormatted: formatBytes(memUsage.rss),
      heapUsedFormatted: formatBytes(memUsage.heapUsed),
    },
    cpu: process.cpuUsage(),
    versions: process.versions,
  };
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Check database connectivity with timeout
 */
export async function checkDatabaseHealth(
  db: Db,
  timeoutMs: number = 5000,
  thresholdMs: number = 1000
): Promise<HealthStatus> {
  const startTime = Date.now();

  try {
    // Create a timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Database health check timeout')), timeoutMs);
    });

    // Perform the health check
    const checkPromise = db.admin().ping();

    await Promise.race([checkPromise, timeoutPromise]);

    const responseTime = Date.now() - startTime;

    return {
      status: responseTime < thresholdMs ? 'healthy' : 'degraded',
      responseTime,
      details: {
        connection: 'connected',
        databaseName: db.databaseName,
      },
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;

    return {
      status: 'unhealthy',
      responseTime,
      error: error instanceof Error ? error.message : 'Unknown database error',
      details: {
        connection: 'failed',
      },
    };
  }
}

/**
 * Check Redis connectivity with timeout
 */
export async function checkRedisHealthWithClient(
  redisClient: {
    ping(): Promise<string>;
    set(key: string, value: string, options?: { EX: number }): Promise<any>;
    get(key: string): Promise<string | null>;
    del(key: string): Promise<number>;
  },
  timeoutMs: number = 5000,
  thresholdMs: number = 100
): Promise<HealthStatus> {
  const startTime = Date.now();

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Redis health check timeout')), timeoutMs);
    });

    // Test connection with ping
    const pingPromise = redisClient.ping();
    await Promise.race([pingPromise, timeoutPromise]);

    // Test read/write with a test key
    const testKey = `health_check_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const testValue = 'healthy';

    await redisClient.set(testKey, testValue, { EX: 10 });
    const result = await redisClient.get(testKey);
    await redisClient.del(testKey);

    if (result !== testValue) {
      throw new Error('Redis read/write verification failed');
    }

    const responseTime = Date.now() - startTime;

    return {
      status: responseTime < thresholdMs ? 'healthy' : 'degraded',
      responseTime,
      details: {
        connection: 'connected',
        readWrite: 'verified',
      },
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;

    return {
      status: 'unhealthy',
      responseTime,
      error: error instanceof Error ? error.message : 'Unknown Redis error',
      details: {
        connection: 'failed',
      },
    };
  }
}

/**
 * Check microservice health via HTTP
 */
export async function checkMicroserviceHealth(
  config: MicroserviceConfig,
  timeoutMs: number = 5000
): Promise<HealthStatus & { name: string; port: string | number }> {
  const startTime = Date.now();
  const healthPath = config.healthPath || '/health';
  const url = `http://${config.host}:${config.port}${healthPath}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
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
        name: config.name,
        port: config.port,
        status: 'healthy',
        responseTime,
        details: {
          statusCode: response.status,
          version: data?.data?.version,
          uptime: data?.data?.uptime,
        },
      };
    } else {
      return {
        name: config.name,
        port: config.port,
        status: 'unhealthy',
        responseTime,
        error: `HTTP ${response.status}: ${response.statusText}`,
        details: {
          statusCode: response.status,
        },
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
      name: config.name,
      port: config.port,
      status: 'unhealthy',
      responseTime,
      error: errorMessage,
      details: {
        url,
      },
    };
  }
}

/**
 * Check multiple microservices health in parallel
 */
export async function checkAllMicroservicesHealth(
  services: MicroserviceConfig[],
  timeoutMs: number = 5000
): Promise<Array<HealthStatus & { name: string; port: string | number }>> {
  const healthChecks = services.map((service) =>
    checkMicroserviceHealth(service, timeoutMs)
  );

  return Promise.all(healthChecks);
}

/**
 * Get default microservices configuration
 */
export function getDefaultMicroservicesConfig(): MicroserviceConfig[] {
  const host = process.env.SERVICE_HOST || 'localhost';

  return [
    { name: 'auth', host, port: process.env.AUTH_PORT || '3002', healthPath: '/health' },
    { name: 'tenant', host, port: process.env.TENANT_PORT || '3003', healthPath: '/health' },
    { name: 'pos', host, port: process.env.POS_PORT || '3004', healthPath: '/health' },
    { name: 'inventory', host, port: process.env.INVENTORY_PORT || '3005', healthPath: '/health' },
    { name: 'analytics', host, port: process.env.ANALYTICS_PORT || '3006', healthPath: '/health' },
    { name: 'billing', host, port: process.env.BILLING_PORT || '3007', healthPath: '/health' },
    { name: 'notification', host, port: process.env.NOTIFICATION_PORT || '3008', healthPath: '/health' },
    { name: 'audit', host, port: process.env.AUDIT_PORT || '3009', healthPath: '/health' },
  ];
}

/**
 * Calculate overall health status from individual checks
 */
export function calculateOverallHealth(
  checks: Record<string, HealthStatus>
): 'healthy' | 'unhealthy' | 'degraded' {
  const statuses = Object.values(checks).map((check) => check.status);

  if (statuses.every((s) => s === 'healthy')) {
    return 'healthy';
  }

  if (statuses.some((s) => s === 'unhealthy')) {
    return 'unhealthy';
  }

  return 'degraded';
}

/**
 * Create a standard health response object
 */
export function createHealthResponse(
  serviceName: string,
  version: string,
  checks: Record<string, HealthStatus>,
  includeSystem: boolean = false
): ServiceHealth {
  const overallStatus = calculateOverallHealth(checks);

  const response: ServiceHealth = {
    status: overallStatus,
    service: serviceName,
    version,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks,
  };

  if (includeSystem) {
    response.system = getSystemMetrics();
  }

  return response;
}

/**
 * Log health check results
 */
export function logHealthCheck(
  serviceName: string,
  status: string,
  details?: Record<string, any>
): void {
  const logData = {
    service: serviceName,
    status,
    timestamp: new Date().toISOString(),
    ...details,
  };

  if (status === 'healthy') {
    logger.debug('Health check passed', logData);
  } else if (status === 'degraded') {
    logger.warn('Health check degraded', logData);
  } else {
    logger.error('Health check failed', logData);
  }
}

/**
 * Create express router handlers for standard health endpoints
 */
export function createHealthEndpoints(
  serviceName: string,
  version: string,
  getDatabaseHealth: () => Promise<HealthStatus>,
  getRedisHealth: () => Promise<HealthStatus>,
  additionalChecks?: () => Promise<Record<string, HealthStatus>>
) {
  return {
    /**
     * Basic health check - returns immediately if service is running
     */
    basic: async () => {
      return {
        status: 'healthy',
        service: serviceName,
        version,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      };
    },

    /**
     * Detailed health check - checks all dependencies
     */
    detailed: async () => {
      const startTime = Date.now();

      const [dbHealth, redisHealth] = await Promise.allSettled([
        getDatabaseHealth(),
        getRedisHealth(),
      ]);

      const checks: Record<string, HealthStatus> = {
        database:
          dbHealth.status === 'fulfilled'
            ? dbHealth.value
            : { status: 'unhealthy', error: (dbHealth as PromiseRejectedResult).reason?.message },
        redis:
          redisHealth.status === 'fulfilled'
            ? redisHealth.value
            : { status: 'unhealthy', error: (redisHealth as PromiseRejectedResult).reason?.message },
      };

      // Add any additional checks
      if (additionalChecks) {
        const additional = await additionalChecks();
        Object.assign(checks, additional);
      }

      const response = createHealthResponse(serviceName, version, checks, true);
      response.responseTime = Date.now() - startTime;

      logHealthCheck(serviceName, response.status, { checks, responseTime: response.responseTime });

      return response;
    },

    /**
     * Liveness probe - service is alive if it can respond
     */
    liveness: () => {
      return {
        status: 'alive',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      };
    },

    /**
     * Readiness probe - service is ready to accept traffic
     */
    readiness: async () => {
      const [dbHealth, redisHealth] = await Promise.allSettled([
        getDatabaseHealth(),
        getRedisHealth(),
      ]);

      const isReady =
        dbHealth.status === 'fulfilled' &&
        dbHealth.value.status !== 'unhealthy' &&
        redisHealth.status === 'fulfilled' &&
        redisHealth.value.status !== 'unhealthy';

      return {
        status: isReady ? 'ready' : 'not ready',
        timestamp: new Date().toISOString(),
        checks: {
          database: dbHealth.status === 'fulfilled' ? dbHealth.value.status : 'unhealthy',
          redis: redisHealth.status === 'fulfilled' ? redisHealth.value.status : 'unhealthy',
        },
      };
    },

    /**
     * Metrics endpoint - returns performance metrics
     */
    metrics: () => {
      return {
        timestamp: new Date().toISOString(),
        system: getSystemMetrics(),
        process: getProcessMetrics(),
      };
    },
  };
}
