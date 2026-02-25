// Authentication and Authorization Middleware

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { UserRoles, Permissions, ROLE_PERMISSIONS } from '@properpos/shared';
import { ApiError } from '../utils/errors';
import { logger } from '../utils/logger';
import { redis } from '../database/redis';
import { getAccessToken } from '../utils/cookies';

// Extend Express Request type to include user and tenant information
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: UserRoles;
        tenantId?: string;
        locationAccess?: string[];
        permissions?: Permissions[];
      };
      tenant?: {
        id: string;
        name: string;
        slug: string;
        subscription: {
          plan: string;
          status: string;
          features: string[];
        };
      };
    }
  }
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRoles;
  tenantId?: string;
  locationAccess?: string[];
  permissions?: Permissions[];
  iat?: number;
  exp?: number;
}

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ALGORITHM: jwt.Algorithm = 'HS256';
const MIN_SECRET_LENGTH = 32;

// Validate JWT secret at module load time
if (!JWT_SECRET) {
  throw new Error(
    'CRITICAL: JWT_SECRET environment variable is not set. ' +
    'This is required for secure token generation. ' +
    'Please set JWT_SECRET to a secure random string of at least 32 characters.'
  );
}

if (JWT_SECRET.length < MIN_SECRET_LENGTH) {
  throw new Error(
    `CRITICAL: JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters long. ` +
    `Current length: ${JWT_SECRET.length}. ` +
    'Please use a secure random string for production.'
  );
}

// Warn if using obvious test/development secrets
const WEAK_SECRETS = ['your-secret-key', 'secret', 'test', 'development', 'changeme'];
if (WEAK_SECRETS.some(weak => JWT_SECRET.toLowerCase().includes(weak))) {
  logger.warn(
    'WARNING: JWT_SECRET appears to contain a weak or default value. ' +
    'Please use a cryptographically secure random string in production.'
  );
}

/**
 * Middleware to authenticate JWT tokens
 * Supports both HttpOnly cookies and Authorization header
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Get token from cookie or Authorization header
    const token = getAccessToken(req);

    if (!token) {
      throw new ApiError('Access token required', 'UNAUTHORIZED', 401);
    }

    // Check if token is blacklisted
    const isBlacklisted = await redis.get(`blacklist:${token}`);
    if (isBlacklisted) {
      throw new ApiError('Token has been revoked', 'TOKEN_REVOKED', 401);
    }

    // Verify and decode token
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: [JWT_ALGORITHM],
    }) as JWTPayload;

    // Check if user session is valid
    const sessionKey = `session:${decoded.userId}`;
    const sessionData = await redis.get(sessionKey);

    if (!sessionData) {
      throw new ApiError('Session expired', 'SESSION_EXPIRED', 401);
    }

    // Set user information in request
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      tenantId: decoded.tenantId,
      locationAccess: decoded.locationAccess || [],
      permissions: decoded.permissions || ROLE_PERMISSIONS[decoded.role] || [],
    };

    // Log authentication for audit
    logger.info('User authenticated', {
      userId: req.user.id,
      email: req.user.email,
      role: req.user.role,
      tenantId: req.user.tenantId,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return next(new ApiError('Invalid token', 'TOKEN_INVALID', 401));
    }
    if (error instanceof jwt.TokenExpiredError) {
      return next(new ApiError('Token expired', 'TOKEN_EXPIRED', 401));
    }
    next(error);
  }
};

/**
 * Middleware to extract tenant information
 */
export const extractTenant = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string || req.user?.tenantId;

    if (!tenantId) {
      throw new ApiError('Tenant ID required', 'TENANT_REQUIRED', 400);
    }

    // Get tenant information from cache or database
    const tenantKey = `tenant:${tenantId}`;
    let tenantData = await redis.get(tenantKey);

    if (!tenantData) {
      // If not in cache, we would fetch from database here
      // For now, we'll throw an error
      throw new ApiError('Tenant not found', 'TENANT_NOT_FOUND', 404);
    }

    req.tenant = JSON.parse(tenantData);

    // Verify user has access to this tenant
    if (req.user && req.user.tenantId !== tenantId) {
      throw new ApiError('Access denied to tenant', 'TENANT_ACCESS_DENIED', 403);
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware to check if user has required role
 */
export const requireRole = (roles: UserRoles | UserRoles[]) => {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new ApiError('Authentication required', 'UNAUTHORIZED', 401));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new ApiError(
        'Insufficient role permissions',
        'INSUFFICIENT_ROLE',
        403
      ));
    }

    next();
  };
};

/**
 * Middleware to authorize user based on roles (string array version)
 * Alias for requireRole with string array support
 */
export const authorize = (roles: string | string[]) => {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new ApiError('Authentication required', 'UNAUTHORIZED', 401));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new ApiError(
        'Insufficient role permissions',
        'INSUFFICIENT_ROLE',
        403
      ));
    }

    next();
  };
};

/**
 * Middleware to check if user has required permissions
 */
export const requirePermissions = (permissions: Permissions | Permissions[]) => {
  const requiredPermissions = Array.isArray(permissions) ? permissions : [permissions];

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new ApiError('Authentication required', 'UNAUTHORIZED', 401));
    }

    const userPermissions = req.user.permissions || [];
    const hasPermission = requiredPermissions.every(permission =>
      userPermissions.includes(permission)
    );

    if (!hasPermission) {
      return next(new ApiError(
        'Insufficient permissions',
        'INSUFFICIENT_PERMISSIONS',
        403
      ));
    }

    next();
  };
};

/**
 * Middleware to check location access
 */
export const requireLocationAccess = (locationId?: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new ApiError('Authentication required', 'UNAUTHORIZED', 401));
    }

    // Get location ID from parameter, body, or query
    const targetLocationId = locationId ||
      req.params.locationId ||
      req.body.locationId ||
      req.query.locationId as string;

    if (!targetLocationId) {
      return next(new ApiError('Location ID required', 'LOCATION_REQUIRED', 400));
    }

    // Super admin and tenant owner have access to all locations
    if (req.user.role === UserRoles.SUPER_ADMIN || req.user.role === UserRoles.TENANT_OWNER) {
      return next();
    }

    // Check if user has access to this location
    const locationAccess = req.user.locationAccess || [];
    if (!locationAccess.includes(targetLocationId)) {
      return next(new ApiError(
        'Access denied to location',
        'LOCATION_ACCESS_DENIED',
        403
      ));
    }

    next();
  };
};

/**
 * Middleware to check subscription features
 */
export const requireFeature = (feature: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.tenant) {
      return next(new ApiError('Tenant information required', 'TENANT_REQUIRED', 400));
    }

    const subscribedFeatures = req.tenant.subscription.features || [];
    if (!subscribedFeatures.includes(feature)) {
      return next(new ApiError(
        `Feature '${feature}' not available in your subscription plan`,
        'FEATURE_NOT_AVAILABLE',
        403
      ));
    }

    next();
  };
};

/**
 * Optional authentication - doesn't fail if no token provided
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    // If token is provided, validate it
    await authenticate(req, res, next);
  } catch (error) {
    // For optional auth, we don't throw errors
    next();
  }
};

/**
 * Generate JWT token
 */
export const generateToken = (payload: Omit<JWTPayload, 'iat' | 'exp'>): string => {
  const expiresIn = process.env.JWT_EXPIRES_IN || '15m';
  return jwt.sign(payload, JWT_SECRET, {
    algorithm: JWT_ALGORITHM,
    expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
  });
};

/**
 * Generate refresh token with unique token ID (jti) for rotation
 */
export const generateRefreshToken = (userId: string, rememberMe: boolean = false): string => {
  const expiresIn = rememberMe
    ? (process.env.JWT_REMEMBER_REFRESH_EXPIRES_IN || '90d')
    : (process.env.JWT_REFRESH_EXPIRES_IN || '7d');

  // Generate unique token ID for rotation tracking
  const jti = crypto.randomBytes(16).toString('hex');

  return jwt.sign(
    {
      userId,
      type: 'refresh',
      jti, // Unique token identifier for rotation
    },
    JWT_SECRET,
    {
      algorithm: JWT_ALGORITHM,
      expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
    }
  );
};

/**
 * Verify refresh token and check if it's been revoked
 */
export const verifyRefreshToken = async (token: string): Promise<{ userId: string; jti: string }> => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: [JWT_ALGORITHM],
    }) as { userId: string; type: string; jti: string };

    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }

    // Check if refresh token has been revoked (used for rotation)
    const isRevoked = await redis.get(`refresh_revoked:${decoded.jti}`);
    if (isRevoked) {
      // Token was already used - potential token theft
      logger.security('Attempted reuse of rotated refresh token', {
        userId: decoded.userId,
        jti: decoded.jti,
      });

      // Revoke all refresh tokens for this user (security measure)
      await revokeAllUserRefreshTokens(decoded.userId);

      throw new ApiError(
        'Refresh token has been revoked. Please log in again.',
        'REFRESH_TOKEN_REVOKED',
        401
      );
    }

    return { userId: decoded.userId, jti: decoded.jti };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError('Invalid refresh token', 'INVALID_REFRESH_TOKEN', 401);
  }
};

/**
 * Rotate refresh token - invalidate old token and issue new one
 * This is called during token refresh to implement refresh token rotation
 */
export const rotateRefreshToken = async (
  oldToken: string,
  userId: string,
  rememberMe: boolean = false
): Promise<string> => {
  try {
    // Decode old token to get jti
    const decoded = jwt.decode(oldToken) as { jti: string; exp: number } | null;

    if (decoded?.jti) {
      // Mark old token as revoked with TTL matching token expiry
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        await redis.setex(`refresh_revoked:${decoded.jti}`, ttl, userId);
      }
    }

    // Generate new refresh token
    const newToken = generateRefreshToken(userId, rememberMe);

    logger.audit('Refresh token rotated', {
      userId,
      oldJti: decoded?.jti,
    });

    return newToken;
  } catch (error) {
    logger.error('Error rotating refresh token:', error);
    throw error;
  }
};

/**
 * Revoke all refresh tokens for a user
 * Used when suspicious activity is detected or user changes password
 */
export const revokeAllUserRefreshTokens = async (userId: string): Promise<void> => {
  // Store a marker that invalidates all tokens issued before this time
  await redis.set(`user_refresh_invalidated:${userId}`, Date.now().toString());
  // Set a long TTL (90 days) to cover the max token lifetime
  await redis.expire(`user_refresh_invalidated:${userId}`, 90 * 24 * 60 * 60);

  logger.security('All refresh tokens revoked for user', { userId });
};

/**
 * Blacklist token (for logout)
 */
export const blacklistToken = async (token: string): Promise<void> => {
  try {
    const decoded = jwt.decode(token) as JWTPayload;
    if (decoded && decoded.exp) {
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        await redis.setex(`blacklist:${token}`, ttl, 'true');
      }
    }
  } catch (error) {
    logger.error('Error blacklisting token:', error);
  }
};

/**
 * Rate limiting by user
 */
export const rateLimitByUser = (maxRequests: number = 100, windowMs: number = 60000) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      return next();
    }

    const key = `ratelimit:user:${req.user.id}`;
    const current = await redis.incr(key);

    if (current === 1) {
      await redis.expire(key, Math.ceil(windowMs / 1000));
    }

    if (current > maxRequests) {
      throw new ApiError(
        'Too many requests',
        'RATE_LIMIT_EXCEEDED',
        429
      );
    }

    // Set rate limit headers
    res.set({
      'X-RateLimit-Limit': maxRequests.toString(),
      'X-RateLimit-Remaining': Math.max(0, maxRequests - current).toString(),
      'X-RateLimit-Reset': new Date(Date.now() + windowMs).toISOString(),
    });

    next();
  };
};