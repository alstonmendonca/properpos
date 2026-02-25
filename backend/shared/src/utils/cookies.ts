// Token Cookie Utilities for secure token management
// Implements HttpOnly cookies for access and refresh tokens

import { Response, Request, CookieOptions } from 'express';

// Cookie configuration
const COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/',
};

const ACCESS_TOKEN_COOKIE = 'properpos_access_token';
const REFRESH_TOKEN_COOKIE = 'properpos_refresh_token';
const CSRF_TOKEN_COOKIE = 'properpos_csrf_token';

// Cookie expiration times
const ACCESS_TOKEN_MAX_AGE = 15 * 60 * 1000; // 15 minutes
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
const REMEMBER_ME_ACCESS_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days
const REMEMBER_ME_REFRESH_MAX_AGE = 90 * 24 * 60 * 60 * 1000; // 90 days

export interface TokenCookieOptions {
  rememberMe?: boolean;
  domain?: string;
}

/**
 * Set access token in HttpOnly cookie
 */
export const setAccessTokenCookie = (
  res: Response,
  token: string,
  options: TokenCookieOptions = {}
): void => {
  const maxAge = options.rememberMe ? REMEMBER_ME_ACCESS_MAX_AGE : ACCESS_TOKEN_MAX_AGE;

  res.cookie(ACCESS_TOKEN_COOKIE, token, {
    ...COOKIE_OPTIONS,
    maxAge,
    ...(options.domain && { domain: options.domain }),
  });
};

/**
 * Set refresh token in HttpOnly cookie
 */
export const setRefreshTokenCookie = (
  res: Response,
  token: string,
  options: TokenCookieOptions = {}
): void => {
  const maxAge = options.rememberMe ? REMEMBER_ME_REFRESH_MAX_AGE : REFRESH_TOKEN_MAX_AGE;

  res.cookie(REFRESH_TOKEN_COOKIE, token, {
    ...COOKIE_OPTIONS,
    maxAge,
    path: '/api/v1/auth', // Restrict refresh token to auth routes only
    ...(options.domain && { domain: options.domain }),
  });
};

/**
 * Set CSRF token in a non-HttpOnly cookie (readable by JavaScript)
 * This is used for CSRF protection with cookie-based auth
 */
export const setCsrfTokenCookie = (
  res: Response,
  token: string,
  options: TokenCookieOptions = {}
): void => {
  res.cookie(CSRF_TOKEN_COOKIE, token, {
    httpOnly: false, // Must be readable by JavaScript for CSRF protection
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: options.rememberMe ? REMEMBER_ME_ACCESS_MAX_AGE : ACCESS_TOKEN_MAX_AGE,
    ...(options.domain && { domain: options.domain }),
  });
};

/**
 * Set all auth cookies (access, refresh, and CSRF tokens)
 */
export const setAuthCookies = (
  res: Response,
  accessToken: string,
  refreshToken: string,
  csrfToken: string,
  options: TokenCookieOptions = {}
): void => {
  setAccessTokenCookie(res, accessToken, options);
  setRefreshTokenCookie(res, refreshToken, options);
  setCsrfTokenCookie(res, csrfToken, options);
};

/**
 * Clear all auth cookies
 */
export const clearAuthCookies = (res: Response): void => {
  const clearOptions: CookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  };

  res.clearCookie(ACCESS_TOKEN_COOKIE, clearOptions);
  res.clearCookie(REFRESH_TOKEN_COOKIE, { ...clearOptions, path: '/api/v1/auth' });
  res.clearCookie(CSRF_TOKEN_COOKIE, { ...clearOptions, httpOnly: false });
};

/**
 * Get access token from cookie or Authorization header
 * Supports both cookie-based and header-based authentication
 */
export const getAccessToken = (req: Request): string | null => {
  // First try to get from cookie
  const cookieToken = req.cookies?.[ACCESS_TOKEN_COOKIE];
  if (cookieToken) {
    return cookieToken;
  }

  // Fallback to Authorization header for backwards compatibility
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  return null;
};

/**
 * Get refresh token from cookie or request body
 * Supports both cookie-based and body-based refresh
 */
export const getRefreshToken = (req: Request): string | null => {
  // First try to get from cookie
  const cookieToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
  if (cookieToken) {
    return cookieToken;
  }

  // Fallback to request body for backwards compatibility
  return req.body?.refreshToken || null;
};

/**
 * Validate CSRF token from header against cookie
 * Used for CSRF protection with cookie-based auth
 */
export const validateCsrfToken = (req: Request): boolean => {
  const cookieToken = req.cookies?.[CSRF_TOKEN_COOKIE];
  const headerToken = req.headers['x-csrf-token'] as string;

  if (!cookieToken || !headerToken) {
    return false;
  }

  return cookieToken === headerToken;
};

/**
 * Generate a CSRF token
 */
export const generateCsrfToken = (): string => {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
};

/**
 * CSRF protection middleware
 * Validates CSRF token for state-changing requests
 */
export const csrfProtection = (req: Request, res: Response, next: Function): void => {
  // Skip CSRF check for:
  // - GET, HEAD, OPTIONS requests (safe methods)
  // - Requests with Authorization header (not using cookies)
  // - Requests without the access token cookie
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];

  if (safeMethods.includes(req.method)) {
    return next();
  }

  // If using Authorization header, skip CSRF check
  if (req.headers.authorization) {
    return next();
  }

  // If no access token cookie, skip CSRF check
  if (!req.cookies?.[ACCESS_TOKEN_COOKIE]) {
    return next();
  }

  // Validate CSRF token
  if (!validateCsrfToken(req)) {
    res.status(403).json({
      success: false,
      error: {
        code: 'CSRF_VALIDATION_FAILED',
        message: 'Invalid or missing CSRF token',
      },
    });
    return;
  }

  next();
};

export const COOKIE_NAMES = {
  ACCESS_TOKEN: ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN: REFRESH_TOKEN_COOKIE,
  CSRF_TOKEN: CSRF_TOKEN_COOKIE,
};
