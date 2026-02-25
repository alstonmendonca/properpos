// ProperPOS Billing and Subscription Management Service

import express, { Request } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import cron from 'node-cron';
import 'express-async-errors';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables early
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

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

import { subscriptionRoutes } from './routes/subscriptions';
import { billingRoutes } from './routes/billing';
import { invoiceRoutes } from './routes/invoices';
import { paymentMethodRoutes } from './routes/paymentMethods';
import { planRoutes } from './routes/plans';
import { usageRoutes } from './routes/usage';
import { webhookRoutes } from './routes/webhooks';
import { healthRoutes } from './routes/health';
import { BillingJobService } from './services/BillingJobService';


// Create Express app
const app = express();
const PORT = process.env.PORT || process.env.BILLING_PORT || 3007;

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

// Rate limiting for billing operations
const billingLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute for billing operations (more restrictive)
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many billing requests. Please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    const userId = req.headers['x-user-id'] as string;
    const tenantId = req.headers['x-tenant-id'] as string;
    return `${req.ip || req.socket.remoteAddress || 'unknown'}-${userId}-${tenantId}`;
  },
});

app.use(billingLimiter);

// Special handling for webhooks (raw body needed for signature verification)
app.use('/api/v1/webhooks', express.raw({ type: 'application/json' }));

// Request parsing for other routes
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// API version header
app.use('/api/v1', (req, res, next) => {
  req.headers['api-version'] = 'v1';
  next();
});

// Routes
app.use('/health', healthRoutes);
app.use('/api/v1/subscriptions', subscriptionRoutes);
app.use('/api/v1/billing', billingRoutes);
app.use('/api/v1/invoices', invoiceRoutes);
app.use('/api/v1/payment-methods', paymentMethodRoutes);
app.use('/api/v1/plans', planRoutes);
app.use('/api/v1/usage', usageRoutes);
app.use('/api/v1/webhooks', webhookRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json(createResponse({
    service: 'ProperPOS Billing and Subscription Management Service',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  }, 'Billing service is running'));
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
    logger.error('Billing service error', { error: apiError.message, ...errorContext });
  } else {
    logger.warn('Client error', { error: apiError.message, ...errorContext });
  }

  // Extra caution with billing errors - don't expose sensitive information
  const isDev = process.env.NODE_ENV !== 'production';
  let message = apiError.message;

  if (!isDev && (apiError.status === 401 || apiError.status === 403 || apiError.status >= 500)) {
    message = 'An error occurred processing your billing request';
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
  logger.info(`Billing service received ${signal}. Starting graceful shutdown...`);

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
  logger.error('Uncaught Exception in Billing Service:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled Rejection in Billing Service:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

// Start server and schedule billing jobs
const startServer = async () => {
  try {
    logger.info('Initializing Billing service...');

    // Initialize database connections
    await initializeDatabase();

    // Schedule billing background jobs
    scheduleBillingJobs();

    // Start HTTP server
    const server = app.listen(PORT, () => {
      logger.info(`💳 ProperPOS Billing and Subscription Management Service started successfully`, {
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

    logger.info('✅ Billing service initialized successfully');

  } catch (error) {
    logger.error('❌ Failed to start Billing service:', error);
    process.exit(1);
  }
};

/**
 * Schedule billing background jobs
 */
function scheduleBillingJobs() {
  const billingJobService = new BillingJobService();

  // Daily billing processing (runs at 2 AM)
  cron.schedule('0 2 * * *', async () => {
    logger.info('Running daily billing processing');
    try {
      const result = await billingJobService.runDailyBilling();
      logger.info('Daily billing processing completed', {
        processed: result.processed,
        succeeded: result.succeeded,
        failed: result.failed,
      });
      if (result.errors.length > 0) {
        logger.warn('Daily billing completed with errors', {
          errorCount: result.errors.length,
          errors: result.errors.slice(0, 5),
        });
      }
    } catch (error) {
      logger.error('Daily billing processing failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  });

  // Monthly subscription renewals (runs on 1st of every month at 1 AM)
  cron.schedule('0 1 1 * *', async () => {
    logger.info('Running monthly subscription renewals');
    try {
      const result = await billingJobService.runMonthlyRenewals();
      logger.info('Monthly renewals completed', {
        processed: result.processed,
        succeeded: result.succeeded,
        failed: result.failed,
      });
      if (result.errors.length > 0) {
        logger.warn('Monthly renewals completed with errors', {
          errorCount: result.errors.length,
          errors: result.errors.slice(0, 5),
        });
      }
    } catch (error) {
      logger.error('Monthly renewals failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  });

  // Failed payment retry (runs every 6 hours)
  cron.schedule('0 */6 * * *', async () => {
    logger.info('Running failed payment retry job');
    try {
      const result = await billingJobService.runFailedPaymentRetry();
      logger.info('Failed payment retry completed', {
        processed: result.processed,
        succeeded: result.succeeded,
        failed: result.failed,
      });
      if (result.errors.length > 0) {
        logger.warn('Failed payment retry completed with errors', {
          errorCount: result.errors.length,
          errors: result.errors.slice(0, 5),
        });
      }
    } catch (error) {
      logger.error('Failed payment retry failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  });

  // Usage tracking aggregation (runs every hour)
  cron.schedule('0 * * * *', async () => {
    logger.info('Running usage tracking aggregation');
    try {
      const result = await billingJobService.runUsageAggregation();
      logger.info('Usage aggregation completed', {
        processed: result.processed,
        succeeded: result.succeeded,
        failed: result.failed,
      });
      if (result.errors.length > 0) {
        logger.warn('Usage aggregation completed with errors', {
          errorCount: result.errors.length,
          errors: result.errors.slice(0, 5),
        });
      }
    } catch (error) {
      logger.error('Usage aggregation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  });

  logger.info('Billing background jobs scheduled');
}

startServer();