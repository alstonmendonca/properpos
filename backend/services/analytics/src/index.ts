// ProperPOS Analytics and Business Intelligence Service

import path from 'path';
import dotenv from 'dotenv';

// Load environment variables early before other imports
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import cron from 'node-cron';
import 'express-async-errors';

import {
  logger,
  ApiError,
  normalizeError,
  isOperationalError,
  generateCorrelationId,
  initializeDatabase,
  gracefulShutdown as shutdownDB,
  gracefulShutdown as shutdownRedis,
  createErrorResponse,
  createResponse,
} from '@properpos/backend-shared';

import { salesRoutes } from './routes/sales';
import { reportsRoutes } from './routes/reports';
import { dashboardRoutes } from './routes/dashboard';
import { kpiRoutes } from './routes/kpi';
import { forecastRoutes } from './routes/forecast';
import { exportRoutes } from './routes/export';
import { healthRoutes } from './routes/health';
import { AnalyticsAggregationService } from './services/AnalyticsAggregationService';

// Load environment variables
dotenv.config();

// Create Express app
const app = express();
const PORT = process.env.PORT || process.env.ANALYTICS_PORT || 3006;

// Trust proxy
app.set('trust proxy', 1);

// Correlation ID middleware
app.use((req, res, next) => {
  const correlationId = req.headers['x-correlation-id'] as string || generateCorrelationId();
  req.headers['x-correlation-id'] = correlationId;
  res.set('X-Correlation-ID', correlationId);
  next();
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for API service
}));

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
  credentials: true,
}));

// Compression
app.use(compression());

// Request logging
app.use(morgan('combined', {
  stream: {
    write: (message: string) => {
      logger.http(message.trim());
    },
  },
  skip: (req) => req.path === '/health',
}));

// Rate limiting for analytics operations
const analyticsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute for analytics operations
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many analytics requests. Please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = req.headers['x-user-id'] as string;
    const tenantId = req.headers['x-tenant-id'] as string;
    return `${req.ip}-${userId}-${tenantId}`;
  },
});

app.use(analyticsLimiter);

// Request parsing
app.use(express.json({ limit: '10mb' })); // Higher limit for report data
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API version header
app.use('/api/v1', (req, res, next) => {
  req.headers['api-version'] = 'v1';
  next();
});

// Routes
app.use('/health', healthRoutes);
app.use('/api/v1/sales', salesRoutes);
app.use('/api/v1/reports', reportsRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/kpi', kpiRoutes);
app.use('/api/v1/forecast', forecastRoutes);
app.use('/api/v1/export', exportRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json(createResponse({
    service: 'ProperPOS Analytics and Business Intelligence Service',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  }, 'Analytics service is running'));
});

// 404 handler
app.use('*', (req, res) => {
  logger.warn('Route not found', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  res.status(404).json(createErrorResponse(
    `Route ${req.method} ${req.originalUrl} not found`,
    'ROUTE_NOT_FOUND'
  ));
});

// Global error handler
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const apiError = normalizeError(error);

  // Log error with context
  const errorContext = {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.headers['x-user-id'],
    tenantId: req.headers['x-tenant-id'],
    correlationId: req.headers['x-correlation-id'],
    stack: apiError.stack,
  };

  if (apiError.status >= 500 || !isOperationalError(apiError)) {
    logger.error('Analytics service error', { error: apiError.message, ...errorContext });
  } else {
    logger.warn('Client error', { error: apiError.message, ...errorContext });
  }

  const isDev = process.env.NODE_ENV !== 'production';
  let message = apiError.message;

  if (!isDev && (apiError.status === 401 || apiError.status === 403)) {
    message = 'Access denied';
  }

  const response = {
    success: false,
    error: {
      code: apiError.code,
      message,
      ...(isDev && { stack: apiError.stack }),
      ...(apiError.details && { details: apiError.details }),
      timestamp: new Date().toISOString(),
      correlationId: req.headers['x-correlation-id'],
    },
  };

  res.status(apiError.status).json(response);
});

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`Analytics service received ${signal}. Starting graceful shutdown...`);

  const server = app.listen();
  server.close(async () => {
    logger.info('HTTP server closed');

    try {
      await Promise.all([
        shutdownDB(),
        shutdownRedis(),
      ]);

      logger.info('All connections closed. Exiting...');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  });

  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception in Analytics Service:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled Rejection in Analytics Service:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

// Start server and schedule jobs
const startServer = async () => {
  try {
    logger.info('Initializing Analytics service...');

    // Initialize database connections
    await initializeDatabase();

    // Schedule background analytics jobs
    scheduleAnalyticsJobs();

    // Start HTTP server
    const server = app.listen(PORT, () => {
      logger.info(`📊 ProperPOS Analytics and Business Intelligence Service started successfully`, {
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        nodeVersion: process.version,
        pid: process.pid,
      });
    });

    server.on('error', (error: any) => {
      if (error.syscall !== 'listen') {
        throw error;
      }

      const bind = typeof PORT === 'string' ? 'Pipe ' + PORT : 'Port ' + PORT;

      switch (error.code) {
        case 'EACCES':
          logger.error(bind + ' requires elevated privileges');
          process.exit(1);
          break;
        case 'EADDRINUSE':
          logger.error(bind + ' is already in use');
          process.exit(1);
          break;
        default:
          throw error;
      }
    });

    logger.info('✅ Analytics service initialized successfully');

  } catch (error) {
    logger.error('❌ Failed to start Analytics service:', error);
    process.exit(1);
  }
};

/**
 * Schedule background analytics jobs
 */
function scheduleAnalyticsJobs() {
  const aggregationService = new AnalyticsAggregationService();

  // Daily analytics aggregation (runs at 1 AM)
  cron.schedule('0 1 * * *', async () => {
    logger.info('Running daily analytics aggregation');
    try {
      const result = await aggregationService.runDailyAggregation();
      logger.info('Daily aggregation completed', {
        tenantsProcessed: result.tenantsProcessed,
        locationsProcessed: result.locationsProcessed,
        errors: result.errors.length,
      });
      if (result.errors.length > 0) {
        logger.warn('Daily aggregation completed with errors', {
          errorCount: result.errors.length,
          errors: result.errors.slice(0, 5), // Log first 5 errors
        });
      }
    } catch (error) {
      logger.error('Daily analytics aggregation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  });

  // Weekly analytics summary (runs every Sunday at 2 AM)
  cron.schedule('0 2 * * 0', async () => {
    logger.info('Running weekly analytics summary');
    try {
      const result = await aggregationService.runWeeklySummary();
      logger.info('Weekly summary completed', {
        tenantsProcessed: result.tenantsProcessed,
        locationsProcessed: result.locationsProcessed,
        errors: result.errors.length,
      });
      if (result.errors.length > 0) {
        logger.warn('Weekly summary completed with errors', {
          errorCount: result.errors.length,
          errors: result.errors.slice(0, 5),
        });
      }
    } catch (error) {
      logger.error('Weekly analytics summary failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  });

  // Monthly reports (runs on 1st of every month at 3 AM)
  cron.schedule('0 3 1 * *', async () => {
    logger.info('Running monthly analytics reports');
    try {
      const result = await aggregationService.runMonthlyReports();
      logger.info('Monthly reports completed', {
        tenantsProcessed: result.tenantsProcessed,
        locationsProcessed: result.locationsProcessed,
        errors: result.errors.length,
      });
      if (result.errors.length > 0) {
        logger.warn('Monthly reports completed with errors', {
          errorCount: result.errors.length,
          errors: result.errors.slice(0, 5),
        });
      }
    } catch (error) {
      logger.error('Monthly analytics reports failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  });

  logger.info('Analytics background jobs scheduled');
}

startServer();