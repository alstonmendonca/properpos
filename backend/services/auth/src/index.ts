// ProperPOS Authentication Service

import path from 'path';
import dotenv from 'dotenv';

// Load environment variables early before other imports that may need them
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

import express, { Request } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
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

import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/users';
import { healthRoutes } from './routes/health';

// Create Express app
const app = express();
const PORT = process.env.PORT || process.env.AUTH_PORT || 3002;

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

// Rate limiting for auth endpoints (more restrictive)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per 15 minutes for auth endpoints
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts. Please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    // Rate limit by IP and email if provided
    const email = req.body?.email;
    return email ? `${req.ip}-${email}` : req.ip || req.socket.remoteAddress || 'unknown';
  },
});

// Speed limiting for auth endpoints
const authSpeedLimiter = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 3, // Start slowing down after 3 requests
  delayMs: 1000, // Add 1 second delay per request
  maxDelayMs: 20000, // Maximum delay of 20 seconds
});

// General rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  keyGenerator: (req: Request): string => {
    const userId = req.headers['x-user-id'] as string;
    return userId ? `${req.ip}-${userId}` : req.ip || req.socket.remoteAddress || 'unknown';
  },
});

app.use(generalLimiter);

// Request parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// API version header
app.use('/api/v1', (req, res, next) => {
  req.headers['api-version'] = 'v1';
  next();
});

// Routes
app.use('/health', healthRoutes);
app.use('/api/v1/auth', authLimiter, authSpeedLimiter, authRoutes);
app.use('/api/v1/users', userRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json(createResponse({
    service: 'ProperPOS Authentication Service',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  }, 'Authentication service is running'));
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
    correlationId: req.headers['x-correlation-id'],
    stack: apiError.stack,
  };

  if (apiError.status >= 500 || !isOperationalError(apiError)) {
    logger.error('Authentication service error', { error: apiError.message, ...errorContext });
  } else {
    logger.warn('Client error', { error: apiError.message, ...errorContext });
  }

  // Security: Don't expose sensitive auth errors in production
  const isDev = process.env.NODE_ENV !== 'production';
  let message = apiError.message;

  // Sanitize sensitive error messages in production
  if (!isDev && apiError.status === 401) {
    message = 'Authentication failed';
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
  logger.info(`Auth service received ${signal}. Starting graceful shutdown...`);

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
  logger.error('Uncaught Exception in Auth Service:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled Rejection in Auth Service:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

// Start server
const startServer = async () => {
  try {
    logger.info('Initializing authentication service...');

    // Initialize database connections
    await initializeDatabase();

    // Start HTTP server
    const server = app.listen(PORT, () => {
      logger.info(`🔐 ProperPOS Authentication Service started successfully`, {
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

    logger.info('✅ Authentication service initialized successfully');

  } catch (error) {
    logger.error('❌ Failed to start authentication service:', error);
    process.exit(1);
  }
};

startServer();