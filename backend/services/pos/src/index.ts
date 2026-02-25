// ProperPOS Point of Sale Service

import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from root .env file
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

import express, { Request } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
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

import { orderRoutes } from './routes/orders';
import { productRoutes } from './routes/products';
import { categoryRoutes } from './routes/categories';
import { customerRoutes } from './routes/customers';
import { paymentRoutes } from './routes/payments';
import { receiptRoutes } from './routes/receipts';
import { healthRoutes } from './routes/health';


// Create Express app
const app = express();
const PORT = process.env.PORT || process.env.POS_PORT || 3004;

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

// Rate limiting with higher limits for POS operations
const posLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 200, // 200 requests per minute for POS operations
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    const userId = req.headers['x-user-id'] as string;
    const tenantId = req.headers['x-tenant-id'] as string;
    const locationId = req.headers['x-location-id'] as string;
    return `${req.ip || req.socket.remoteAddress || 'unknown'}-${userId || 'anon'}-${tenantId || 'none'}-${locationId || 'none'}`;
  },
});

app.use(posLimiter);

// Request parsing
app.use(express.json({ limit: '2mb' })); // Higher limit for receipt images
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// API version header
app.use('/api/v1', (req, res, next) => {
  req.headers['api-version'] = 'v1';
  next();
});

// Routes
app.use('/health', healthRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/customers', customerRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/receipts', receiptRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json(createResponse({
    service: 'ProperPOS Point of Sale Service',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  }, 'POS service is running'));
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
    locationId: req.headers['x-location-id'],
    correlationId: req.headers['x-correlation-id'],
    stack: apiError.stack,
  };

  if (apiError.status >= 500 || !isOperationalError(apiError)) {
    logger.error('POS service error', { error: apiError.message, ...errorContext });
  } else {
    logger.warn('Client error', { error: apiError.message, ...errorContext });
  }

  // Don't expose sensitive POS errors in production
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
  logger.info(`POS service received ${signal}. Starting graceful shutdown...`);

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
  logger.error('Uncaught Exception in POS Service:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled Rejection in POS Service:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

// Start server
const startServer = async () => {
  try {
    logger.info('Initializing POS service...');

    // Initialize database connections
    await initializeDatabase();

    // Start HTTP server
    const server = app.listen(PORT, () => {
      logger.info(`🛒 ProperPOS Point of Sale Service started successfully`, {
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

    logger.info('✅ POS service initialized successfully');

  } catch (error) {
    logger.error('❌ Failed to start POS service:', error);
    process.exit(1);
  }
};

startServer();