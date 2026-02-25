// Advanced Security Middleware for ProperPOS SaaS

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { ApiError } from '../utils/errors';
import { redis } from '../database/redis';

/**
 * Input sanitization middleware
 * Prevents XSS and injection attacks
 */
export const sanitizeInput = (req: Request, res: Response, next: NextFunction): void => {
  const sanitize = (obj: any): any => {
    if (typeof obj === 'string') {
      // Remove potential XSS vectors
      return obj
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '')
        .replace(/data:/gi, 'data-blocked:')
        .trim();
    }
    if (Array.isArray(obj)) {
      return obj.map(sanitize);
    }
    if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const key of Object.keys(obj)) {
        // Prevent prototype pollution
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
          continue;
        }
        sanitized[key] = sanitize(obj[key]);
      }
      return sanitized;
    }
    return obj;
  };

  if (req.body) {
    req.body = sanitize(req.body);
  }
  if (req.query) {
    req.query = sanitize(req.query);
  }
  if (req.params) {
    req.params = sanitize(req.params);
  }

  next();
};

/**
 * SQL injection prevention for MongoDB
 * Blocks common NoSQL injection patterns
 */
export const preventNoSQLInjection = (req: Request, res: Response, next: NextFunction): void => {
  const checkForInjection = (obj: any, path: string = ''): void => {
    if (obj && typeof obj === 'object') {
      for (const key of Object.keys(obj)) {
        // Block MongoDB operators in user input
        if (key.startsWith('$')) {
          logger.security('NoSQL injection attempt detected', {
            path: `${path}.${key}`,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            url: req.originalUrl,
          });
          throw new ApiError('Invalid input detected', 'INVALID_INPUT', 400);
        }
        checkForInjection(obj[key], `${path}.${key}`);
      }
    }
  };

  try {
    checkForInjection(req.body, 'body');
    checkForInjection(req.query, 'query');
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * CSRF protection middleware
 */
export const csrfProtection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  // Skip for safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip for API token authentication (webhooks, etc.)
  if (req.headers['x-api-key']) {
    return next();
  }

  const csrfToken = req.headers['x-csrf-token'] as string;
  const sessionId = req.headers['x-session-id'] as string || (req as any).user?.id;

  if (!csrfToken || !sessionId) {
    return next(new ApiError('CSRF token required', 'CSRF_REQUIRED', 403));
  }

  // Verify CSRF token
  const storedToken = await redis.get(`csrf:${sessionId}`);
  if (!storedToken || storedToken !== csrfToken) {
    logger.security('CSRF token mismatch', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.originalUrl,
      sessionId,
    });
    return next(new ApiError('Invalid CSRF token', 'CSRF_INVALID', 403));
  }

  next();
};

/**
 * Generate CSRF token for a session
 */
export const generateCsrfToken = async (sessionId: string): Promise<string> => {
  const token = crypto.randomBytes(32).toString('hex');
  await redis.setex(`csrf:${sessionId}`, 3600, token); // 1 hour expiry
  return token;
};

/**
 * IP-based blocking middleware
 */
export const ipBlocklist = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const ip = req.ip || req.connection.remoteAddress || '';

  // Check if IP is blocked
  const isBlocked = await redis.get(`blocked:ip:${ip}`);
  if (isBlocked) {
    logger.security('Blocked IP attempted access', { ip });
    return next(new ApiError('Access denied', 'IP_BLOCKED', 403));
  }

  next();
};

/**
 * Add IP to blocklist
 */
export const blockIP = async (ip: string, reason: string, durationSeconds: number = 86400): Promise<void> => {
  await redis.setex(`blocked:ip:${ip}`, durationSeconds, reason);
  logger.security('IP blocked', { ip, reason, duration: durationSeconds });
};

/**
 * Failed login tracking for brute force protection
 */
export const trackFailedLogin = async (identifier: string, ip: string): Promise<{ blocked: boolean; attempts: number }> => {
  const ipKey = `failed:ip:${ip}`;
  const userKey = `failed:user:${identifier}`;
  const lockoutKey = `lockout:${identifier}`;

  // Check if already locked out
  const isLockedOut = await redis.get(lockoutKey);
  if (isLockedOut) {
    return { blocked: true, attempts: -1 };
  }

  // Increment failed attempts
  const [ipAttempts, userAttempts] = await Promise.all([
    redis.incr(ipKey),
    redis.incr(userKey),
  ]);

  // Set expiry on first attempt
  if (ipAttempts === 1) await redis.expire(ipKey, 3600); // 1 hour
  if (userAttempts === 1) await redis.expire(userKey, 3600); // 1 hour

  // Block if too many attempts
  const MAX_IP_ATTEMPTS = 20;
  const MAX_USER_ATTEMPTS = 5;

  if (ipAttempts > MAX_IP_ATTEMPTS) {
    await blockIP(ip, 'Too many failed login attempts', 3600);
    return { blocked: true, attempts: ipAttempts };
  }

  if (userAttempts > MAX_USER_ATTEMPTS) {
    // Lock account for 15 minutes
    await redis.setex(lockoutKey, 900, 'locked');
    logger.security('Account locked due to failed attempts', { identifier, attempts: userAttempts });
    return { blocked: true, attempts: userAttempts };
  }

  return { blocked: false, attempts: userAttempts };
};

/**
 * Reset failed login attempts on successful login
 */
export const resetFailedLogins = async (identifier: string, ip: string): Promise<void> => {
  await Promise.all([
    redis.del(`failed:ip:${ip}`),
    redis.del(`failed:user:${identifier}`),
  ]);
};

/**
 * Request fingerprinting for suspicious activity detection
 */
export const fingerprintRequest = (req: Request): string => {
  const components = [
    req.headers['user-agent'] || '',
    req.headers['accept-language'] || '',
    req.headers['accept-encoding'] || '',
    req.ip || '',
  ];

  return crypto.createHash('sha256').update(components.join('|')).digest('hex').substring(0, 16);
};

/**
 * Detect suspicious activity patterns
 */
export const detectSuspiciousActivity = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const fingerprint = fingerprintRequest(req);
  const userId = (req as any).user?.id;

  if (!userId) {
    return next();
  }

  const key = `fingerprint:${userId}`;
  const storedFingerprints = await redis.smembers(key);

  // Allow up to 3 different fingerprints per user
  if (storedFingerprints.length >= 3 && !storedFingerprints.includes(fingerprint)) {
    logger.security('Suspicious activity - multiple device fingerprints', {
      userId,
      newFingerprint: fingerprint,
      existingFingerprints: storedFingerprints.length,
      ip: req.ip,
    });

    // Don't block, just flag for review
    res.set('X-Security-Flag', 'multiple-devices');
  }

  // Track fingerprint
  await redis.sadd(key, fingerprint);
  await redis.expire(key, 86400 * 7); // 7 days

  next();
};

/**
 * API key authentication for external integrations
 */
export const apiKeyAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    return next(new ApiError('API key required', 'API_KEY_REQUIRED', 401));
  }

  // Hash the API key for lookup
  const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');

  // Look up API key
  const keyData = await redis.get(`apikey:${hashedKey}`);
  if (!keyData) {
    logger.security('Invalid API key used', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });
    return next(new ApiError('Invalid API key', 'API_KEY_INVALID', 401));
  }

  const { tenantId, permissions, rateLimit } = JSON.parse(keyData);

  // Set tenant context
  (req as any).apiKey = {
    tenantId,
    permissions,
    rateLimit,
  };

  next();
};

/**
 * Content type validation
 */
export const validateContentType = (allowedTypes: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      const contentType = req.headers['content-type']?.split(';')[0];

      if (!contentType || !allowedTypes.includes(contentType)) {
        return next(new ApiError(
          `Invalid content type. Allowed: ${allowedTypes.join(', ')}`,
          'INVALID_CONTENT_TYPE',
          415
        ));
      }
    }

    next();
  };
};

/**
 * Request size validation per endpoint
 */
export const validateRequestSize = (maxSizeBytes: number) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);

    if (contentLength > maxSizeBytes) {
      return next(new ApiError(
        `Request too large. Maximum size: ${maxSizeBytes} bytes`,
        'REQUEST_TOO_LARGE',
        413
      ));
    }

    next();
  };
};

/**
 * Security headers middleware (additional to helmet)
 */
export const additionalSecurityHeaders = (req: Request, res: Response, next: NextFunction): void => {
  // Prevent MIME type sniffing
  res.set('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking
  res.set('X-Frame-Options', 'DENY');

  // XSS protection (for older browsers)
  res.set('X-XSS-Protection', '1; mode=block');

  // Referrer policy
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions policy
  res.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  // Remove powered by header
  res.removeHeader('X-Powered-By');

  next();
};

/**
 * Two-Factor Authentication verification
 */
export const verify2FA = async (userId: string, code: string): Promise<boolean> => {
  const storedSecret = await redis.get(`2fa:secret:${userId}`);
  if (!storedSecret) {
    return false;
  }

  // TOTP verification using speakeasy would go here
  // For now, return basic implementation
  const expectedCode = await redis.get(`2fa:code:${userId}`);
  return expectedCode === code;
};

/**
 * Generate and store 2FA setup data
 */
export const setup2FA = async (userId: string): Promise<{ secret: string; qrCode: string }> => {
  const secret = crypto.randomBytes(20).toString('hex');
  await redis.setex(`2fa:secret:${userId}`, 600, secret); // 10 min setup window

  // In production, use speakeasy to generate proper TOTP secret and QR code
  const qrCode = `otpauth://totp/ProperPOS:${userId}?secret=${secret}&issuer=ProperPOS`;

  return { secret, qrCode };
};

export default {
  sanitizeInput,
  preventNoSQLInjection,
  csrfProtection,
  generateCsrfToken,
  ipBlocklist,
  blockIP,
  trackFailedLogin,
  resetFailedLogins,
  fingerprintRequest,
  detectSuspiciousActivity,
  apiKeyAuth,
  validateContentType,
  validateRequestSize,
  additionalSecurityHeaders,
  verify2FA,
  setup2FA,
};
