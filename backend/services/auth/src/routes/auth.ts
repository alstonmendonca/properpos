// Authentication routes

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';

import {
  logger,
  ApiError,
  authenticate,
  optionalAuth,
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
  blacklistToken,
  rotateRefreshToken,
  revokeAllUserRefreshTokens,
  sessionService,
  cache,
  validationMiddleware,
  createResponse,
  createErrorResponse,
  tenantDB,
  UserRoles,
  BusinessTypes,
  SubscriptionPlans,
  Permissions,
  setAuthCookies,
  clearAuthCookies,
  getRefreshToken,
  generateCsrfToken,
  setAccessTokenCookie,
  setRefreshTokenCookie,
  setCsrfTokenCookie,
} from '@properpos/backend-shared';

import { AuthService } from '../services/AuthService';
import { UserService } from '../services/UserService';
import { EmailService } from '../services/EmailService';

export const authRoutes = Router();

// Initialize services
const authService = new AuthService();
const userService = new UserService();
const emailService = new EmailService();

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     tags: [Authentication]
 *     summary: User login
 *     description: Authenticate user with email and password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *               rememberMe:
 *                 type: boolean
 *               mfaToken:
 *                 type: string
 *                 description: Required if MFA is enabled
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 *       423:
 *         description: Account locked
 */
authRoutes.post('/login', validationMiddleware.login, async (req: Request, res: Response): Promise<void> => {
  const { email, password, rememberMe = false, mfaToken } = req.body;
  const startTime = Date.now();

  try {
    // Get user from database
    const user = await userService.findByEmail(email);
    if (!user) {
      // Log failed login attempt
      logger.security('Login attempt with non-existent email', {
        email,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });

      // Use same error message to avoid user enumeration
      throw ApiError.unauthorized('Invalid email or password');
    }

    // Check if account is locked
    if (user.auth.lockUntil && user.auth.lockUntil > new Date()) {
      logger.security('Login attempt on locked account', {
        userId: user.id,
        email,
        ip: req.ip,
        lockUntil: user.auth.lockUntil,
      });

      throw new ApiError(
        'Account temporarily locked due to too many failed login attempts',
        'ACCOUNT_LOCKED',
        423
      );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.auth.passwordHash);
    if (!isPasswordValid) {
      // Increment login attempts
      await userService.incrementLoginAttempts(user.id);

      logger.security('Failed login attempt', {
        userId: user.id,
        email,
        ip: req.ip,
        attempts: user.auth.loginAttempts + 1,
      });

      throw ApiError.unauthorized('Invalid email or password');
    }

    // Check if MFA is enabled
    if (user.auth.mfaEnabled) {
      if (!mfaToken) {
        // Return special response indicating MFA is required
        res.status(200).json(createResponse({
          mfaRequired: true,
          userId: user.id, // Only return user ID for MFA verification
        }, 'MFA token required'));
        return;
      }

      // Verify MFA token
      const isMfaValid = speakeasy.totp.verify({
        secret: user.auth.mfaSecret!,
        encoding: 'base32',
        token: mfaToken,
        window: 2, // Allow 2 time steps of drift
      });

      if (!isMfaValid) {
        logger.security('Invalid MFA token', {
          userId: user.id,
          email,
          ip: req.ip,
        });

        throw ApiError.unauthorized('Invalid MFA token');
      }
    }

    // Check if account is active
    if (!user.isActive) {
      logger.security('Login attempt on inactive account', {
        userId: user.id,
        email,
        ip: req.ip,
      });

      throw new ApiError('Account is deactivated', 'ACCOUNT_INACTIVE', 403);
    }

    // Get tenant information for primary tenant membership
    const primaryTenant = user.tenantMemberships.find(m => m.status === 'active');
    let tenantInfo = null;

    if (primaryTenant) {
      tenantInfo = await authService.getTenantInfo(primaryTenant.tenantId);
    }

    // Generate tokens
    const accessToken = generateToken({
      userId: user.id,
      email: user.email,
      role: primaryTenant?.role || UserRoles.VIEWER,
      tenantId: primaryTenant?.tenantId,
      locationAccess: primaryTenant?.locationAccess || [],
      permissions: (primaryTenant?.permissions || []) as Permissions[],
    });

    const refreshToken = generateRefreshToken(user.id, rememberMe);
    const csrfToken = generateCsrfToken();

    // Set HttpOnly cookies for tokens
    setAuthCookies(res, accessToken, refreshToken, csrfToken, { rememberMe });

    // Create session
    const sessionId = await sessionService.createSession(user.id, {
      email: user.email,
      role: primaryTenant?.role,
      tenantId: primaryTenant?.tenantId,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      rememberMe,
    }, rememberMe ? 90 * 24 * 3600 : 7 * 24 * 3600); // 90 days or 7 days

    // Reset login attempts on successful login
    await userService.resetLoginAttempts(user.id);

    // Update last login time
    await userService.updateLastLogin(user.id);

    // Log successful login
    logger.audit('User login successful', {
      userId: user.id,
      email: user.email,
      tenantId: primaryTenant?.tenantId,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      sessionId,
      responseTime: Date.now() - startTime,
    });

    // Prepare response data
    // Note: Tokens are now primarily sent via HttpOnly cookies
    // but also included in response body for backwards compatibility
    const responseData = {
      user: {
        id: user.id,
        email: user.email,
        profile: {
          firstName: user.profile.firstName,
          lastName: user.profile.lastName,
          avatar: user.profile.avatar,
          timezone: user.profile.timezone,
        },
        tenantMemberships: user.tenantMemberships.filter(m => m.status === 'active'),
        lastLoginAt: new Date().toISOString(),
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: rememberMe ? 30 * 24 * 60 * 60 : 15 * 60, // seconds
        csrfToken, // CSRF token for cookie-based auth
      },
      session: {
        id: sessionId,
        expiresAt: new Date(Date.now() + (rememberMe ? 90 : 7) * 24 * 60 * 60 * 1000).toISOString(),
      },
      tenant: tenantInfo,
    };

    res.json(createResponse(responseData, 'Login successful'));

  } catch (error) {
    logger.error('Login error', {
      email,
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: req.ip,
      responseTime: Date.now() - startTime,
    });

    throw error;
  }
});

/**
 * @swagger
 * /api/v1/auth/register:
 *   post:
 *     tags: [Authentication]
 *     summary: User registration
 *     description: Register a new user and organization
 */
authRoutes.post('/register', validationMiddleware.register, async (req: Request, res: Response) => {
  const {
    email,
    password,
    firstName,
    lastName,
    organizationName,
    businessType,
    phone,
  } = req.body;

  try {
    // Check if user already exists
    const existingUser = await userService.findByEmail(email);
    if (existingUser) {
      throw ApiError.conflict('Email address is already registered');
    }

    // Create user and organization in a transaction-like operation
    const registrationResult = await authService.registerUserWithOrganization({
      user: {
        email,
        password,
        firstName,
        lastName,
        phone,
      },
      organization: {
        name: organizationName,
        businessType,
      },
    });

    // Send verification email
    try {
      await emailService.sendVerificationEmail(
        email,
        firstName,
        registrationResult.emailVerificationToken
      );
    } catch (emailError) {
      logger.error('Failed to send verification email', {
        email,
        error: emailError instanceof Error ? emailError.message : 'Unknown error',
      });
      // Don't fail registration if email fails
    }

    logger.audit('User registration successful', {
      userId: registrationResult.user.id,
      email,
      organizationId: registrationResult.organization.id,
      businessType,
      ip: req.ip,
    });

    res.status(201).json(createResponse({
      user: {
        id: registrationResult.user.id,
        email: registrationResult.user.email,
      },
      organization: {
        id: registrationResult.organization.id,
        name: registrationResult.organization.name,
      },
      message: 'Registration successful. Please check your email to verify your account.',
    }, 'Registration completed'));

  } catch (error) {
    logger.error('Registration error', {
      email,
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: req.ip,
    });

    throw error;
  }
});

/**
 * @swagger
 * /api/v1/auth/refresh:
 *   post:
 *     tags: [Authentication]
 *     summary: Refresh access token with token rotation
 *     description: |
 *       Refreshes the access token using the refresh token.
 *       Implements refresh token rotation - the old refresh token is
 *       invalidated and a new one is issued for enhanced security.
 */
authRoutes.post('/refresh', async (req: Request, res: Response) => {
  // Get refresh token from cookie or request body
  const refreshToken = getRefreshToken(req);

  if (!refreshToken) {
    throw ApiError.unauthorized('Refresh token is required');
  }

  try {
    // Verify refresh token (now async to check revocation)
    const { userId } = await verifyRefreshToken(refreshToken);

    // Get user data
    const user = await userService.findById(userId);
    if (!user || !user.isActive) {
      throw ApiError.unauthorized('User not found or inactive');
    }

    // Get primary tenant
    const primaryTenant = user.tenantMemberships.find(m => m.status === 'active');

    // Check for session to determine if rememberMe was set
    const sessionKey = `session:${userId}`;
    const sessionData = await cache.get<{ rememberMe?: boolean }>(sessionKey);
    const rememberMe = sessionData ? sessionData.rememberMe : false;

    // Generate new access token
    const accessToken = generateToken({
      userId: user.id,
      email: user.email,
      role: primaryTenant?.role || UserRoles.VIEWER,
      tenantId: primaryTenant?.tenantId,
      locationAccess: primaryTenant?.locationAccess || [],
      permissions: (primaryTenant?.permissions || []) as Permissions[],
    });

    // Rotate refresh token (invalidate old, generate new)
    const newRefreshToken = await rotateRefreshToken(refreshToken, userId, rememberMe);
    const csrfToken = generateCsrfToken();

    // Set new tokens in HttpOnly cookies
    setAccessTokenCookie(res, accessToken, { rememberMe });
    setRefreshTokenCookie(res, newRefreshToken, { rememberMe });
    setCsrfTokenCookie(res, csrfToken, { rememberMe });

    logger.audit('Token refresh successful with rotation', {
      userId: user.id,
      ip: req.ip,
    });

    // Return tokens in response body for backwards compatibility
    res.json(createResponse({
      accessToken,
      refreshToken: newRefreshToken,
      csrfToken,
      expiresIn: rememberMe ? 30 * 24 * 60 * 60 : 15 * 60, // seconds
    }, 'Token refreshed successfully'));

  } catch (error) {
    logger.security('Token refresh failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: req.ip,
    });

    throw error;
  }
});

/**
 * @swagger
 * /api/v1/auth/logout:
 *   post:
 *     tags: [Authentication]
 *     summary: User logout
 */
authRoutes.post('/logout', authenticate, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const authHeader = req.headers.authorization;

  try {
    // Blacklist the current access token (from header or cookie)
    if (authHeader) {
      const token = authHeader.split(' ')[1];
      await blacklistToken(token);
    }

    // Also blacklist token from cookie if present
    const cookieToken = req.cookies?.properpos_access_token;
    if (cookieToken && cookieToken !== authHeader?.split(' ')[1]) {
      await blacklistToken(cookieToken);
    }

    // Delete all user sessions
    await sessionService.deleteUserSessions(user.id);

    // Clear HttpOnly cookies
    clearAuthCookies(res);

    logger.audit('User logout', {
      userId: user.id,
      ip: req.ip,
    });

    res.json(createResponse({}, 'Logout successful'));

  } catch (error) {
    logger.error('Logout error', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
});

/**
 * @swagger
 * /api/v1/auth/forgot-password:
 *   post:
 *     tags: [Authentication]
 *     summary: Forgot password
 */
authRoutes.post('/forgot-password', async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email) {
    throw ApiError.validationError('Email is required');
  }

  try {
    const user = await userService.findByEmail(email);

    // Always return success to avoid user enumeration
    const message = 'If an account with that email exists, a password reset link has been sent.';

    if (user && user.isActive) {
      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Save reset token
      await userService.savePasswordResetToken(user.id, resetToken, resetExpires);

      // Send reset email
      try {
        await emailService.sendPasswordResetEmail(
          email,
          user.profile.firstName,
          resetToken
        );

        logger.audit('Password reset requested', {
          userId: user.id,
          email,
          ip: req.ip,
        });
      } catch (emailError) {
        logger.error('Failed to send password reset email', {
          email,
          error: emailError instanceof Error ? emailError.message : 'Unknown error',
        });
      }
    }

    res.json(createResponse({}, message));

  } catch (error) {
    logger.error('Forgot password error', {
      email,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    // Always return success for security
    res.json(createResponse({}, 'If an account with that email exists, a password reset link has been sent.'));
  }
});

/**
 * @swagger
 * /api/v1/auth/reset-password:
 *   post:
 *     tags: [Authentication]
 *     summary: Reset password with token
 */
authRoutes.post('/reset-password', async (req: Request, res: Response) => {
  const { token, password } = req.body;

  if (!token || !password) {
    throw ApiError.validationError('Token and new password are required');
  }

  if (password.length < 8) {
    throw ApiError.validationError('Password must be at least 8 characters long');
  }

  try {
    const user = await userService.findByResetToken(token);

    if (!user || !user.auth.passwordResetExpires || user.auth.passwordResetExpires < new Date()) {
      throw ApiError.unauthorized('Invalid or expired reset token');
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password, 12);

    // Update password and clear reset token
    await userService.updatePassword(user.id, passwordHash);
    await userService.clearPasswordResetToken(user.id);

    // Invalidate all existing sessions
    await sessionService.deleteUserSessions(user.id);

    logger.audit('Password reset completed', {
      userId: user.id,
      email: user.email,
      ip: req.ip,
    });

    res.json(createResponse({}, 'Password reset successful'));

  } catch (error) {
    logger.error('Password reset error', {
      token,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
});

/**
 * @swagger
 * /api/v1/auth/verify-email:
 *   post:
 *     tags: [Authentication]
 *     summary: Verify email address
 */
authRoutes.post('/verify-email', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.body;

  if (!token) {
    throw ApiError.validationError('Verification token is required');
  }

  try {
    const user = await userService.findByVerificationToken(token);

    if (!user) {
      throw ApiError.unauthorized('Invalid verification token');
    }

    if (user.auth.isEmailVerified) {
      res.json(createResponse({}, 'Email already verified'));
      return;
    }

    // Mark email as verified
    await userService.verifyEmail(user.id);

    logger.audit('Email verification completed', {
      userId: user.id,
      email: user.email,
      ip: req.ip,
    });

    res.json(createResponse({}, 'Email verified successfully'));

  } catch (error) {
    logger.error('Email verification error', {
      token,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
});

/**
 * @swagger
 * /api/v1/auth/me:
 *   get:
 *     tags: [Authentication]
 *     summary: Get current user info
 */
authRoutes.get('/me', authenticate, async (req: Request, res: Response) => {
  const user = (req as any).user;

  try {
    const fullUser = await userService.findById(user.id);

    if (!fullUser) {
      throw ApiError.notFound('User not found');
    }

    const responseData = {
      id: fullUser.id,
      email: fullUser.email,
      profile: fullUser.profile,
      globalRole: fullUser.globalRole,
      tenantMemberships: fullUser.tenantMemberships.filter(m => m.status === 'active'),
      auth: {
        isEmailVerified: fullUser.auth.isEmailVerified,
        mfaEnabled: fullUser.auth.mfaEnabled,
        lastLoginAt: fullUser.auth.lastLoginAt,
      },
      lastActiveAt: fullUser.lastActiveAt,
      createdAt: fullUser.createdAt,
    };

    res.json(createResponse(responseData, 'User information retrieved'));

  } catch (error) {
    logger.error('Get user info error', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
});

/**
 * @swagger
 * /api/v1/auth/change-password:
 *   post:
 *     tags: [Authentication]
 *     summary: Change password (authenticated)
 */
authRoutes.post('/change-password', authenticate, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw ApiError.validationError('Current password and new password are required');
  }

  if (newPassword.length < 8) {
    throw ApiError.validationError('New password must be at least 8 characters long');
  }

  try {
    const fullUser = await userService.findById(user.id);
    if (!fullUser) {
      throw ApiError.notFound('User not found');
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, fullUser.auth.passwordHash);
    if (!isCurrentPasswordValid) {
      throw ApiError.unauthorized('Current password is incorrect');
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // Update password
    await userService.updatePassword(fullUser.id, newPasswordHash);

    // Invalidate all other sessions (keep current session)
    // In a real implementation, you'd keep the current session active

    logger.audit('Password changed', {
      userId: user.id,
      ip: req.ip,
    });

    res.json(createResponse({}, 'Password changed successfully'));

  } catch (error) {
    logger.error('Change password error', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
});

/**
 * @swagger
 * /api/v1/auth/enable-mfa:
 *   post:
 *     tags: [Authentication]
 *     summary: Enable multi-factor authentication
 */
authRoutes.post('/enable-mfa', authenticate, async (req: Request, res: Response) => {
  const user = (req as any).user;

  try {
    const fullUser = await userService.findById(user.id);
    if (!fullUser) {
      throw ApiError.notFound('User not found');
    }

    if (fullUser.auth.mfaEnabled) {
      throw ApiError.conflict('MFA is already enabled');
    }

    // Generate MFA secret
    const secret = speakeasy.generateSecret({
      name: `ProperPOS (${fullUser.email})`,
      issuer: 'ProperPOS',
      length: 32,
    });

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

    // Save secret (temporarily, until verified)
    await userService.saveMfaSecret(fullUser.id, secret.base32);

    res.json(createResponse({
      secret: secret.base32,
      qrCode: qrCodeUrl,
      manualEntryKey: secret.base32,
    }, 'MFA setup initiated. Please verify with your authenticator app.'));

  } catch (error) {
    logger.error('Enable MFA error', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
});

/**
 * @swagger
 * /api/v1/auth/verify-mfa:
 *   post:
 *     tags: [Authentication]
 *     summary: Verify and enable MFA
 */
authRoutes.post('/verify-mfa', authenticate, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { token } = req.body;

  if (!token) {
    throw ApiError.validationError('MFA token is required');
  }

  try {
    const fullUser = await userService.findById(user.id);
    if (!fullUser || !fullUser.auth.mfaSecret) {
      throw ApiError.notFound('MFA setup not found');
    }

    // Verify token
    const isValid = speakeasy.totp.verify({
      secret: fullUser.auth.mfaSecret,
      encoding: 'base32',
      token,
      window: 2,
    });

    if (!isValid) {
      throw ApiError.unauthorized('Invalid MFA token');
    }

    // Enable MFA
    await userService.enableMfa(fullUser.id);

    logger.audit('MFA enabled', {
      userId: user.id,
      ip: req.ip,
    });

    res.json(createResponse({}, 'MFA enabled successfully'));

  } catch (error) {
    logger.error('Verify MFA error', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
});

/**
 * @swagger
 * /api/v1/auth/disable-mfa:
 *   post:
 *     tags: [Authentication]
 *     summary: Disable multi-factor authentication
 */
authRoutes.post('/disable-mfa', authenticate, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { password, mfaToken } = req.body;

  if (!password || !mfaToken) {
    throw ApiError.validationError('Password and MFA token are required');
  }

  try {
    const fullUser = await userService.findById(user.id);
    if (!fullUser) {
      throw ApiError.notFound('User not found');
    }

    if (!fullUser.auth.mfaEnabled) {
      throw ApiError.conflict('MFA is not enabled');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, fullUser.auth.passwordHash);
    if (!isPasswordValid) {
      throw ApiError.unauthorized('Invalid password');
    }

    // Verify MFA token
    const isMfaValid = speakeasy.totp.verify({
      secret: fullUser.auth.mfaSecret!,
      encoding: 'base32',
      token: mfaToken,
      window: 2,
    });

    if (!isMfaValid) {
      throw ApiError.unauthorized('Invalid MFA token');
    }

    // Disable MFA
    await userService.disableMfa(fullUser.id);

    logger.audit('MFA disabled', {
      userId: user.id,
      ip: req.ip,
    });

    res.json(createResponse({}, 'MFA disabled successfully'));

  } catch (error) {
    logger.error('Disable MFA error', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
});