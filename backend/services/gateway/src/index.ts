// ProperPOS API Gateway - Main entry point and request router

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import 'express-async-errors';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from project root
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

import {
  logger,
  ApiError,
  normalizeError,
  isOperationalError,
  generateCorrelationId,
  morganToken,
  initializeDatabase,
  checkDatabaseHealth,
  checkRedisHealth,
  gracefulShutdown as shutdownDB,
  gracefulShutdown as shutdownRedis,
  DEFAULT_CONFIG,
  createErrorResponse,
  createResponse,
  csrfProtection,
} from '@properpos/backend-shared';

import { proxyRouter } from './routes/proxy';
import { healthRouter } from './routes/health';
import { docsRouter } from './routes/docs';
import { metricsRouter } from './routes/metrics';

// Create Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Correlation ID middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const correlationId = req.headers['x-correlation-id'] as string || generateCorrelationId();
  req.headers['x-correlation-id'] = correlationId;
  res.set('X-Correlation-ID', correlationId);
  next();
});

// Security middleware with enhanced CSP
const isProduction = process.env.NODE_ENV === 'production';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline needed for some UI frameworks
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https:", "data:"],
      connectSrc: ["'self'", ...(isProduction ? [] : ["ws://localhost:*"])], // Allow websockets in dev
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: isProduction ? [] : undefined,
    },
    reportOnly: false,
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  noSniff: true,
  xssFilter: true,
  hidePoweredBy: true,
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
}));

// CORS configuration - stricter in production
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (like mobile apps or curl requests) only in development
    if (!origin) {
      if (isProduction) {
        // In production, require origin for browser requests
        // But allow server-to-server requests (no origin)
        return callback(null, true);
      }
      return callback(null, true);
    }

    const allowedOrigins = process.env.CORS_ORIGIN?.split(',').map(o => o.trim()) || ['http://localhost:3000'];

    // In production, never allow wildcard
    const isAllowed = isProduction
      ? allowedOrigins.includes(origin)
      : allowedOrigins.includes(origin) || allowedOrigins.includes('*');

    if (isAllowed) {
      callback(null, true);
    } else {
      logger.security('CORS violation attempt', {
        origin,
        allowedOrigins: allowedOrigins.filter(o => o !== '*'), // Don't log wildcard
        ip: '', // Will be populated by request context
      });
      callback(new Error('Not allowed by CORS'), false);
    }
  },
  methods: DEFAULT_CONFIG.CORS.METHODS,
  allowedHeaders: [...DEFAULT_CONFIG.CORS.ALLOWED_HEADERS, 'X-CSRF-Token'], // Add CSRF token header
  exposedHeaders: ['X-Correlation-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  credentials: true, // Required for cookies
  optionsSuccessStatus: 200, // For legacy browser support
  maxAge: 86400, // Cache preflight for 24 hours
};

app.use(cors(corsOptions));

// Cookie parser middleware (required for cookie-based authentication)
app.use(cookieParser());

// CSRF protection middleware (validates CSRF token for cookie-based auth)
app.use(csrfProtection);

// Compression middleware
app.use(compression({
  filter: (req: Request, res: Response) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6,
  threshold: 1024, // Only compress responses larger than 1KB
}));

// Request logging
app.use(morgan('combined', {
  stream: {
    write: (message: string) => {
      logger.http(message.trim());
    },
  },
  skip: (req: Request) => {
    // Skip logging for health checks and static assets
    return req.path === '/health' || req.path.startsWith('/docs');
  },
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: DEFAULT_CONFIG.RATE_LIMIT.WINDOW_MS,
  max: (req: Request) => {
    // Different limits based on authentication
    if (req.headers.authorization) {
      return DEFAULT_CONFIG.RATE_LIMIT.MAX_REQUESTS;
    }
    return 100; // Lower limit for unauthenticated requests
  },
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this IP, please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    // Rate limit by IP and user ID if authenticated
    const user = (req as any).user;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    return user ? `${ip}-${user.id}` : ip;
  },
});

app.use(limiter);

// Stricter rate limiting for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per 15 minutes
  message: {
    success: false,
    error: {
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts. Please try again in 15 minutes.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    // Rate limit by IP for auth endpoints
    return req.ip || req.socket.remoteAddress || 'unknown';
  },
  skip: (req: Request): boolean => {
    // Only apply to login and password-related endpoints
    const authPaths = ['/login', '/forgot-password', '/reset-password'];
    return !authPaths.some(path => req.path.includes(path));
  },
});

// Apply stricter rate limit to auth routes
app.use('/api/v1/auth', authLimiter);

// Even stricter rate limiting for password reset and MFA
const sensitiveAuthLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 requests per hour
  message: {
    success: false,
    error: {
      code: 'SENSITIVE_AUTH_RATE_LIMIT_EXCEEDED',
      message: 'Too many attempts. Please try again in 1 hour.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    // Rate limit by IP + email (if provided) for sensitive operations
    const email = req.body?.email || '';
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    return `${ip}:${email}`;
  },
});

// Apply to sensitive auth operations
app.use('/api/v1/auth/forgot-password', sensitiveAuthLimiter);
app.use('/api/v1/auth/reset-password', sensitiveAuthLimiter);
app.use('/api/v1/auth/enable-mfa', sensitiveAuthLimiter);
app.use('/api/v1/auth/disable-mfa', sensitiveAuthLimiter);

// Speed limiting (slow down repeated requests)
const speedLimiter = slowDown({
  windowMs: 5 * 60 * 1000, // 5 minutes
  delayAfter: 50, // Allow 50 requests per 5 minutes at full speed
  delayMs: 500, // Add 500ms delay per request after delayAfter
  maxDelayMs: 20000, // Maximum delay of 20 seconds
  keyGenerator: (req: Request): string => req.ip || req.socket.remoteAddress || 'unknown',
});

app.use(speedLimiter);

// Request parsing middleware
app.use(express.json({
  limit: '10mb',
  verify: (req: any, res: Response, buf: Buffer) => {
    req.rawBody = buf;
  },
}));

app.use(express.urlencoded({
  extended: true,
  limit: '10mb',
}));

// Request size monitoring
app.use((req: Request, res: Response, next: NextFunction) => {
  const contentLength = req.headers['content-length'];
  if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
    logger.warn('Large request detected', {
      contentLength,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });
  }
  next();
});

// API versioning middleware
app.use('/api/v1', (req: Request, res: Response, next: NextFunction) => {
  req.headers['api-version'] = 'v1';
  next();
});

// Routes
app.use('/health', healthRouter);
app.use('/docs', docsRouter);
app.use('/metrics', metricsRouter);
app.use('/api/v1', proxyRouter);

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json(createResponse({
    service: 'ProperPOS API Gateway',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    correlationId: req.headers['x-correlation-id'],
  }, 'ProperPOS API Gateway is running'));
});

// 404 handler
app.use('*', (req: Request, res: Response) => {
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
app.use((error: any, req: Request, res: Response, next: NextFunction) => {
  const apiError = normalizeError(error);

  // Log error with context
  const errorContext = {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: (req as any).user?.id,
    tenantId: (req as any).tenant?.id,
    correlationId: req.headers['x-correlation-id'],
    stack: apiError.stack,
  };

  if (apiError.status >= 500 || !isOperationalError(apiError)) {
    logger.error('Application error', { error: apiError.message, ...errorContext });
  } else {
    logger.warn('Client error', { error: apiError.message, ...errorContext });
  }

  // Don't expose internal errors in production
  const isDev = process.env.NODE_ENV !== 'production';
  const response = {
    success: false,
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(isDev && { stack: apiError.stack }),
      ...(apiError.details && { details: apiError.details }),
      timestamp: new Date().toISOString(),
      correlationId: req.headers['x-correlation-id'],
    },
  };

  res.status(apiError.status).json(response);
});

// Graceful shutdown handling
let isShuttingDown = false;

const gracefulShutdown = async (signal: string) => {
  // Prevent multiple shutdown attempts
  if (isShuttingDown) {
    logger.info(`Shutdown already in progress, ignoring ${signal}`);
    return;
  }
  isShuttingDown = true;

  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  // Force shutdown after 30 seconds
  const forceShutdownTimeout = setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);

  try {
    // Stop accepting new connections
    if (serverInstance) {
      await new Promise<void>((resolve, reject) => {
        serverInstance!.close((err) => {
          if (err) {
            logger.error('Error closing HTTP server:', err);
            reject(err);
          } else {
            logger.info('HTTP server closed - no longer accepting connections');
            resolve();
          }
        });
      });
    }

    // Close database connections
    logger.info('Closing database connections...');
    await Promise.all([
      shutdownDB(),
      shutdownRedis(),
    ]);

    logger.info('All connections closed. Exiting gracefully.');
    clearTimeout(forceShutdownTimeout);
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    clearTimeout(forceShutdownTimeout);
    process.exit(1);
  }
};

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Store server reference for graceful shutdown
let serverInstance: ReturnType<typeof app.listen> | null = null;

// Initialize and start server
const startServer = async () => {
  try {
    // Initialize database connections
    logger.info('Initializing database connections...');
    await initializeDatabase();

    // Start HTTP server
    serverInstance = app.listen(PORT, () => {
      logger.info(`ProperPOS API Gateway started successfully`, {
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        nodeVersion: process.version,
        pid: process.pid,
      });
    });

    // Handle server errors
    serverInstance.on('error', (error: any) => {
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

    // Set keep-alive timeout to prevent hanging connections during shutdown
    serverInstance.keepAliveTimeout = 65000; // Slightly higher than ALB default (60s)
    serverInstance.headersTimeout = 66000; // Slightly higher than keepAliveTimeout

    // Log successful startup
    logger.info('All services initialized successfully');

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();