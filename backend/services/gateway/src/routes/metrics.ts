// Metrics and monitoring routes

import { Router, Request, Response } from 'express';
import {
  logger,
  createResponse,
  requireRole,
  authenticate,
  UserRoles,
} from '@properpos/backend-shared';

export const metricsRouter = Router();

// Store metrics in memory (in production, you'd use a proper metrics store)
const metrics = {
  requests: {
    total: 0,
    successful: 0,
    failed: 0,
    byMethod: {} as Record<string, number>,
    byPath: {} as Record<string, number>,
    byStatus: {} as Record<string, number>,
  },
  response_times: [] as number[],
  errors: [] as any[],
  uptime: process.uptime(),
  startTime: Date.now(),
};

// Middleware to collect metrics
export const collectMetrics = (req: Request, res: Response, next: Function) => {
  const startTime = Date.now();

  // Track request
  metrics.requests.total++;
  metrics.requests.byMethod[req.method] = (metrics.requests.byMethod[req.method] || 0) + 1;
  metrics.requests.byPath[req.path] = (metrics.requests.byPath[req.path] || 0) + 1;

  // Track response
  const originalSend = res.send;
  res.send = function(data) {
    const responseTime = Date.now() - startTime;
    metrics.response_times.push(responseTime);

    // Keep only last 1000 response times to prevent memory leak
    if (metrics.response_times.length > 1000) {
      metrics.response_times = metrics.response_times.slice(-1000);
    }

    // Track status codes
    metrics.requests.byStatus[res.statusCode] = (metrics.requests.byStatus[res.statusCode] || 0) + 1;

    if (res.statusCode >= 200 && res.statusCode < 400) {
      metrics.requests.successful++;
    } else {
      metrics.requests.failed++;
    }

    return originalSend.call(this, data);
  };

  next();
};

// Basic metrics endpoint (public)
metricsRouter.get('/', (req: Request, res: Response) => {
  const now = Date.now();
  const uptimeMs = now - metrics.startTime;

  const basicMetrics = {
    uptime: {
      seconds: process.uptime(),
      readable: formatUptime(process.uptime()),
      since: new Date(metrics.startTime).toISOString(),
    },
    requests: {
      total: metrics.requests.total,
      successful: metrics.requests.successful,
      failed: metrics.requests.failed,
      successRate: metrics.requests.total > 0
        ? ((metrics.requests.successful / metrics.requests.total) * 100).toFixed(2) + '%'
        : '0%',
    },
    performance: {
      averageResponseTime: calculateAverage(metrics.response_times).toFixed(2) + 'ms',
      medianResponseTime: calculateMedian(metrics.response_times).toFixed(2) + 'ms',
      p95ResponseTime: calculatePercentile(metrics.response_times, 95).toFixed(2) + 'ms',
    },
    system: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      environment: process.env.NODE_ENV || 'development',
    },
    timestamp: new Date().toISOString(),
  };

  res.json(createResponse(basicMetrics, 'Gateway metrics'));
});

// Detailed metrics endpoint (admin only)
metricsRouter.get('/detailed',
  authenticate,
  requireRole([UserRoles.SUPER_ADMIN, UserRoles.TENANT_OWNER]),
  (req: Request, res: Response) => {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    const detailedMetrics = {
      requests: {
        total: metrics.requests.total,
        successful: metrics.requests.successful,
        failed: metrics.requests.failed,
        byMethod: metrics.requests.byMethod,
        byPath: Object.entries(metrics.requests.byPath)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 20) // Top 20 paths
          .reduce((obj, [path, count]) => ({ ...obj, [path]: count }), {}),
        byStatus: metrics.requests.byStatus,
      },
      performance: {
        responseTime: {
          average: calculateAverage(metrics.response_times),
          median: calculateMedian(metrics.response_times),
          p90: calculatePercentile(metrics.response_times, 90),
          p95: calculatePercentile(metrics.response_times, 95),
          p99: calculatePercentile(metrics.response_times, 99),
          min: Math.min(...metrics.response_times),
          max: Math.max(...metrics.response_times),
        },
        requestsPerSecond: metrics.requests.total / process.uptime(),
      },
      system: {
        uptime: process.uptime(),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid,
        memory: {
          rss: formatBytes(memoryUsage.rss),
          heapTotal: formatBytes(memoryUsage.heapTotal),
          heapUsed: formatBytes(memoryUsage.heapUsed),
          external: formatBytes(memoryUsage.external),
          arrayBuffers: formatBytes(memoryUsage.arrayBuffers),
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system,
        },
        loadAverage: require('os').loadavg(),
        freeMemory: formatBytes(require('os').freemem()),
        totalMemory: formatBytes(require('os').totalmem()),
      },
      errors: metrics.errors.slice(-50), // Last 50 errors
      timestamp: new Date().toISOString(),
    };

    res.json(createResponse(detailedMetrics, 'Detailed gateway metrics'));
  }
);

// Error tracking endpoint
metricsRouter.get('/errors',
  authenticate,
  requireRole([UserRoles.SUPER_ADMIN, UserRoles.TENANT_OWNER]),
  (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 100;
    const errors = metrics.errors.slice(-limit);

    res.json(createResponse({
      errors,
      total: metrics.errors.length,
      showing: errors.length,
    }, 'Recent errors'));
  }
);

// Performance trends endpoint
metricsRouter.get('/performance',
  authenticate,
  requireRole([UserRoles.SUPER_ADMIN, UserRoles.TENANT_OWNER]),
  (req: Request, res: Response) => {
    const responseTimes = metrics.response_times.slice(-100); // Last 100 requests

    const performance = {
      recentResponseTimes: responseTimes,
      trends: {
        average: calculateAverage(responseTimes),
        trend: calculateTrend(responseTimes),
      },
      distribution: {
        fast: responseTimes.filter(t => t < 100).length, // < 100ms
        normal: responseTimes.filter(t => t >= 100 && t < 500).length, // 100-500ms
        slow: responseTimes.filter(t => t >= 500 && t < 1000).length, // 500ms-1s
        verySlow: responseTimes.filter(t => t >= 1000).length, // > 1s
      },
    };

    res.json(createResponse(performance, 'Performance metrics'));
  }
);

// Reset metrics endpoint (admin only)
metricsRouter.post('/reset',
  authenticate,
  requireRole([UserRoles.SUPER_ADMIN]),
  (req: Request, res: Response) => {
    metrics.requests = {
      total: 0,
      successful: 0,
      failed: 0,
      byMethod: {},
      byPath: {},
      byStatus: {},
    };
    metrics.response_times = [];
    metrics.errors = [];
    metrics.startTime = Date.now();

    logger.info('Metrics reset by admin', {
      userId: (req as any).user?.id,
      ip: req.ip,
    });

    res.json(createResponse({
      message: 'Metrics reset successfully',
      timestamp: new Date().toISOString(),
    }));
  }
);

// Prometheus-compatible metrics endpoint
metricsRouter.get('/prometheus', (req: Request, res: Response) => {
  const prometheusMetrics = [
    `# HELP http_requests_total Total number of HTTP requests`,
    `# TYPE http_requests_total counter`,
    `http_requests_total ${metrics.requests.total}`,
    '',
    `# HELP http_request_duration_seconds HTTP request duration in seconds`,
    `# TYPE http_request_duration_seconds histogram`,
    `http_request_duration_seconds_sum ${metrics.response_times.reduce((a, b) => a + b, 0) / 1000}`,
    `http_request_duration_seconds_count ${metrics.response_times.length}`,
    '',
    `# HELP process_uptime_seconds Process uptime in seconds`,
    `# TYPE process_uptime_seconds counter`,
    `process_uptime_seconds ${process.uptime()}`,
    '',
    `# HELP process_resident_memory_bytes Resident memory size in bytes`,
    `# TYPE process_resident_memory_bytes gauge`,
    `process_resident_memory_bytes ${process.memoryUsage().rss}`,
    '',
    // Add more Prometheus metrics as needed
  ].join('\n');

  res.set('Content-Type', 'text/plain');
  res.send(prometheusMetrics);
});

// Function to track errors
export const trackError = (error: any, req?: Request) => {
  const errorInfo = {
    message: error.message,
    name: error.name,
    code: error.code || 'UNKNOWN',
    stack: error.stack,
    timestamp: new Date().toISOString(),
    ...(req && {
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: (req as any).user?.id,
    }),
  };

  metrics.errors.push(errorInfo);

  // Keep only last 1000 errors to prevent memory leak
  if (metrics.errors.length > 1000) {
    metrics.errors = metrics.errors.slice(-1000);
  }
};

// Utility functions
function calculateAverage(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return numbers.reduce((a, b) => a + b, 0) / numbers.length;
}

function calculateMedian(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function calculatePercentile(numbers: number[], percentile: number): number {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function calculateTrend(numbers: number[]): 'improving' | 'degrading' | 'stable' {
  if (numbers.length < 10) return 'stable';

  const first = numbers.slice(0, Math.floor(numbers.length / 2));
  const second = numbers.slice(Math.floor(numbers.length / 2));

  const firstAvg = calculateAverage(first);
  const secondAvg = calculateAverage(second);

  const change = ((secondAvg - firstAvg) / firstAvg) * 100;

  if (change < -5) return 'improving'; // Response times getting faster
  if (change > 5) return 'degrading';  // Response times getting slower
  return 'stable';
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  return `${days}d ${hours}h ${minutes}m ${secs}s`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}