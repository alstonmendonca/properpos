// Logging utilities with Winston

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { Request, Response, NextFunction } from 'express';
import { AsyncLocalStorage } from 'async_hooks';

// Async local storage for request context
interface RequestContext {
  correlationId: string;
  userId?: string;
  tenantId?: string;
  locationId?: string;
  requestId?: string;
  userEmail?: string;
  ip?: string;
  method?: string;
  path?: string;
  startTime?: number;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

// Get current context from async local storage
export const getRequestContext = (): RequestContext | undefined => {
  return asyncLocalStorage.getStore();
};

// Set context for the current async context
export const setRequestContext = <T>(context: RequestContext, fn: () => T): T => {
  return asyncLocalStorage.run(context, fn);
};

// Generate unique correlation ID
export const generateCorrelationId = (): string => {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
};

// Middleware to set request context
export const requestContextMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Get or generate correlation ID
  const correlationId = (req.headers['x-correlation-id'] as string) || generateCorrelationId();

  // Set correlation ID header for response tracking
  res.setHeader('X-Correlation-ID', correlationId);

  const user = (req as any).user;
  const tenant = (req as any).tenant;

  const context: RequestContext = {
    correlationId,
    userId: user?.id || user?.userId,
    tenantId: tenant?.id || (req.headers['x-tenant-id'] as string),
    locationId: user?.locationId,
    userEmail: user?.email,
    ip: req.ip || req.socket?.remoteAddress,
    method: req.method,
    path: req.path,
    startTime: Date.now(),
  };

  // Run the rest of the request in this context
  asyncLocalStorage.run(context, () => {
    next();
  });
};

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

// Add colors to winston
winston.addColors(colors);

// Determine log level based on environment
const level = (): string => {
  const env = process.env.NODE_ENV || 'development';
  const isDevelopment = env === 'development';
  return isDevelopment ? 'debug' : 'warn';
};

// Format that adds request context to logs
const contextFormat = winston.format((info) => {
  const context = getRequestContext();
  if (context) {
    info.correlationId = context.correlationId;
    info.userId = info.userId || context.userId;
    info.tenantId = info.tenantId || context.tenantId;
    info.locationId = info.locationId || context.locationId;
    info.ip = info.ip || context.ip;
  }
  return info;
});

// Custom format for console output with context
const consoleFormat = winston.format.combine(
  contextFormat(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, service, correlationId, userId, tenantId, ...meta } = info;
    const contextStr = correlationId ? `[${String(correlationId).substring(0, 8)}]` : '';
    const userStr = userId ? `[u:${String(userId).substring(0, 8)}]` : '';
    const tenantStr = tenantId ? `[t:${String(tenantId).substring(0, 8)}]` : '';
    const metaStr = Object.keys(meta).length > 0 ? '\n' + JSON.stringify(meta, null, 2) : '';
    return `${timestamp} ${contextStr}${userStr}${tenantStr} [${service || 'APP'}] ${level}: ${message}${metaStr}`;
  })
);

// Custom format for file output with full context and stack traces
const fileFormat = winston.format.combine(
  contextFormat(),
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.printf((info) => {
    // Ensure stack traces are always included for errors
    if (info.level === 'error' && info.stack) {
      info.stackTrace = info.stack;
    }
    // Add structured metadata
    const output = {
      ...info,
      timestamp: info.timestamp,
      level: info.level,
      message: info.message,
      service: info.service,
      correlationId: info.correlationId,
      userId: info.userId,
      tenantId: info.tenantId,
      locationId: info.locationId,
      ip: info.ip,
      type: info.type,
    };
    return JSON.stringify(output);
  })
);

// Create transports array
const transports = [];

// Console transport for development
if (process.env.NODE_ENV !== 'production') {
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
    })
  );
}

// File transports for production
if (process.env.NODE_ENV === 'production') {
  // Error log file
  transports.push(
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      format: fileFormat,
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true,
    })
  );

  // Combined log file
  transports.push(
    new DailyRotateFile({
      filename: 'logs/combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      format: fileFormat,
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true,
    })
  );

  // Audit log file (for security-related events)
  transports.push(
    new DailyRotateFile({
      filename: 'logs/audit-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'info',
      format: fileFormat,
      maxSize: '20m',
      maxFiles: '30d',
      zippedArchive: true,
    })
  );
}

// Create the logger
const logger = winston.createLogger({
  level: level(),
  levels,
  defaultMeta: {
    service: process.env.SERVICE_NAME || 'properpos-api',
  },
  transports,
  exitOnError: false,
});

// Log startup information
logger.info('Logger initialized', {
  level: level(),
  environment: process.env.NODE_ENV || 'development',
  service: process.env.SERVICE_NAME || 'properpos-api',
});

// Extended logger interface
interface ExtendedLogger extends winston.Logger {
  audit: (message: string, meta?: any) => void;
  security: (message: string, meta?: any) => void;
  business: (message: string, meta?: any) => void;
  performance: (message: string, meta?: any) => void;
  request: (req: Request, message?: string) => void;
}

// Create extended logger with custom methods
const extendedLogger = logger as ExtendedLogger;

// Audit logging for compliance and security
extendedLogger.audit = (message: string, meta: any = {}) => {
  logger.info(message, {
    ...meta,
    type: 'audit',
    timestamp: new Date().toISOString(),
  });
};

// Security-related logging
extendedLogger.security = (message: string, meta: any = {}) => {
  logger.warn(message, {
    ...meta,
    type: 'security',
    timestamp: new Date().toISOString(),
  });
};

// Business logic logging
extendedLogger.business = (message: string, meta: any = {}) => {
  logger.info(message, {
    ...meta,
    type: 'business',
    timestamp: new Date().toISOString(),
  });
};

// Performance logging
extendedLogger.performance = (message: string, meta: any = {}) => {
  logger.info(message, {
    ...meta,
    type: 'performance',
    timestamp: new Date().toISOString(),
  });
};

// Request logging
extendedLogger.request = (req: Request, message: string = 'HTTP Request') => {
  const user = (req as any).user;
  const tenant = (req as any).tenant;

  logger.http(message, {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: user?.id,
    tenantId: tenant?.id,
    correlationId: req.headers['x-correlation-id'],
    timestamp: new Date().toISOString(),
  });
};

// Error logging utility with full stack traces
export const logError = (error: Error, context?: any) => {
  const requestContext = getRequestContext();

  // Parse stack trace into structured format
  const parseStack = (stack?: string): { file: string; line: string; column: string; function: string }[] => {
    if (!stack) return [];
    return stack.split('\n').slice(1).map(line => {
      const match = line.match(/at\s+(?:(.+?)\s+)?\(?(.+?):(\d+):(\d+)\)?/);
      if (match) {
        return {
          function: match[1] || '<anonymous>',
          file: match[2],
          line: match[3],
          column: match[4],
        };
      }
      return { function: '', file: line.trim(), line: '', column: '' };
    }).filter(f => f.file);
  };

  const errorInfo = {
    // Error details
    name: error.name,
    message: error.message,
    stack: error.stack,
    stackFrames: parseStack(error.stack),

    // Request context
    correlationId: requestContext?.correlationId,
    userId: requestContext?.userId,
    tenantId: requestContext?.tenantId,
    locationId: requestContext?.locationId,
    ip: requestContext?.ip,
    path: requestContext?.path,
    method: requestContext?.method,

    // Additional context
    timestamp: new Date().toISOString(),
    ...context,
  };

  // Classify and log error
  if (error.name === 'ValidationError' || error.message.includes('validation')) {
    logger.warn('Validation error', errorInfo);
  } else if (
    error.message.toLowerCase().includes('unauthorized') ||
    error.message.toLowerCase().includes('forbidden') ||
    error.message.toLowerCase().includes('authentication')
  ) {
    extendedLogger.security('Security error', errorInfo);
  } else if (error.name === 'MongoError' || error.name === 'MongoServerError') {
    logger.error('Database error', errorInfo);
  } else if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
    logger.error('Timeout error', errorInfo);
  } else {
    logger.error('Application error', errorInfo);
  }
};

// Performance timing utility
export class PerformanceTimer {
  private startTime: [number, number];
  private name: string;

  constructor(name: string) {
    this.name = name;
    this.startTime = process.hrtime();
  }

  end(meta: any = {}): void {
    const endTime = process.hrtime(this.startTime);
    const duration = endTime[0] * 1000 + endTime[1] / 1000000; // Convert to milliseconds

    extendedLogger.performance(`${this.name} completed`, {
      ...meta,
      duration: `${duration.toFixed(2)}ms`,
      operation: this.name,
    });
  }
}

// Log structured data for analytics
export const logAnalytics = (event: string, data: any = {}) => {
  logger.info('Analytics event', {
    event,
    data,
    timestamp: new Date().toISOString(),
    type: 'analytics',
  });
};

// Log business metrics
export const logMetrics = (metric: string, value: number, tags: any = {}) => {
  extendedLogger.business('Business metric', {
    metric,
    value,
    tags,
    timestamp: new Date().toISOString(),
  });
};

// Log database operations
export const logDatabase = (operation: string, collection: string, meta: any = {}) => {
  logger.debug('Database operation', {
    operation,
    collection,
    ...meta,
    timestamp: new Date().toISOString(),
    type: 'database',
  });
};

// Log external API calls
export const logExternalCall = (service: string, endpoint: string, method: string, duration?: number, meta: any = {}) => {
  logger.info('External API call', {
    service,
    endpoint,
    method,
    duration: duration ? `${duration}ms` : undefined,
    ...meta,
    timestamp: new Date().toISOString(),
    type: 'external_api',
  });
};

// Log cache operations
export const logCache = (operation: 'hit' | 'miss' | 'set' | 'delete', key: string, meta: any = {}) => {
  logger.debug('Cache operation', {
    operation,
    key,
    ...meta,
    timestamp: new Date().toISOString(),
    type: 'cache',
  });
};

// Health check logging
export const logHealthCheck = (service: string, status: 'healthy' | 'unhealthy', details?: any) => {
  const logLevel = status === 'healthy' ? 'info' : 'error';
  logger.log(logLevel, `Health check: ${service}`, {
    service,
    status,
    details,
    timestamp: new Date().toISOString(),
    type: 'health_check',
  });
};

// Cleanup function for graceful shutdown
export const flushLogs = async (): Promise<void> => {
  return new Promise((resolve) => {
    logger.end(() => {
      resolve();
    });
  });
};

// Morgan token for request logging
export const morganToken = (tokens: any, req: any, res: any) => {
  const user = req.user;
  const tenant = req.tenant;

  return JSON.stringify({
    method: tokens.method(req, res),
    url: tokens.url(req, res),
    status: tokens.status(req, res),
    contentLength: tokens.res(req, res, 'content-length'),
    responseTime: tokens['response-time'](req, res),
    userAgent: tokens['user-agent'](req, res),
    userId: user?.id,
    tenantId: tenant?.id,
    ip: req.ip,
    correlationId: req.headers['x-correlation-id'],
  });
};

export { extendedLogger as logger };
export default extendedLogger;