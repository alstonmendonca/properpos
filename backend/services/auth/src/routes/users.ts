// User management routes

import { Router, Request, Response } from 'express';
import {
  logger,
  authenticate,
  requireRole,
  requirePermissions,
  validationMiddleware,
  createResponse,
  createErrorResponse,
  UserRoles,
  Permissions,
} from '@properpos/backend-shared';

import { UserService } from '../services/UserService';
import { AuthService } from '../services/AuthService';

export const userRoutes = Router();

// Initialize services
const userService = new UserService();
const authService = new AuthService();

/**
 * @swagger
 * /api/v1/users/profile:
 *   get:
 *     tags: [Users]
 *     summary: Get user profile
 *     security:
 *       - BearerAuth: []
 */
userRoutes.get('/profile', authenticate, async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;

  try {
    const fullUser = await userService.findById(user.id);

    if (!fullUser) {
      res.status(404).json(createErrorResponse('User not found', 'USER_NOT_FOUND'));
      return;
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

    res.json(createResponse(responseData, 'User profile retrieved'));

  } catch (error) {
    logger.error('Get user profile error', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
});

/**
 * @swagger
 * /api/v1/users/profile:
 *   put:
 *     tags: [Users]
 *     summary: Update user profile
 *     security:
 *       - BearerAuth: []
 */
userRoutes.put('/profile', authenticate, validationMiddleware.updateProfile, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { firstName, lastName, phone, timezone, language } = req.body;

  try {
    const profileData: any = {};

    if (firstName !== undefined) profileData.firstName = firstName;
    if (lastName !== undefined) profileData.lastName = lastName;
    if (phone !== undefined) profileData.phone = phone;
    if (timezone !== undefined) profileData.timezone = timezone;
    if (language !== undefined) profileData.language = language;

    await userService.updateProfile(user.id, profileData);

    logger.audit('User profile updated', {
      userId: user.id,
      updatedFields: Object.keys(profileData),
      ip: req.ip,
    });

    res.json(createResponse({}, 'Profile updated successfully'));

  } catch (error) {
    logger.error('Update user profile error', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
});

/**
 * @swagger
 * /api/v1/users/tenants:
 *   get:
 *     tags: [Users]
 *     summary: Get user's tenant memberships
 *     security:
 *       - BearerAuth: []
 */
userRoutes.get('/tenants', authenticate, async (req: Request, res: Response) => {
  const user = (req as any).user;

  try {
    const tenants = await authService.getUserTenants(user.id);

    res.json(createResponse({
      tenants,
      count: tenants.length,
    }, 'User tenants retrieved'));

  } catch (error) {
    logger.error('Get user tenants error', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
});

/**
 * @swagger
 * /api/v1/users/switch-tenant:
 *   post:
 *     tags: [Users]
 *     summary: Switch to a different tenant
 *     security:
 *       - BearerAuth: []
 */
userRoutes.post('/switch-tenant', authenticate, async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  const { tenantId } = req.body;

  if (!tenantId) {
    res.status(400).json(createErrorResponse('Tenant ID is required', 'VALIDATION_ERROR'));
    return;
  }

  try {
    // Validate user has access to this tenant
    const hasAccess = await authService.validateTenantAccess(user.id, tenantId);

    if (!hasAccess) {
      res.status(403).json(createErrorResponse('Access denied to tenant', 'TENANT_ACCESS_DENIED'));
      return;
    }

    // Get tenant information
    const tenantInfo = await authService.getTenantInfo(tenantId);

    if (!tenantInfo) {
      res.status(404).json(createErrorResponse('Tenant not found', 'TENANT_NOT_FOUND'));
      return;
    }

    logger.audit('User switched tenant', {
      userId: user.id,
      tenantId,
      ip: req.ip,
    });

    res.json(createResponse({
      tenant: tenantInfo,
      message: 'Tenant switched successfully. Please refresh your session.',
    }));

  } catch (error) {
    logger.error('Switch tenant error', {
      userId: user.id,
      tenantId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
});

/**
 * @swagger
 * /api/v1/users/{userId}/deactivate:
 *   post:
 *     tags: [Users]
 *     summary: Deactivate user account (admin only)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 */
userRoutes.post('/:userId/deactivate',
  authenticate,
  requireRole([UserRoles.SUPER_ADMIN, UserRoles.TENANT_OWNER]),
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;
    const currentUser = (req as any).user;

    try {
      // Prevent self-deactivation
      if (userId === currentUser.id) {
        res.status(400).json(createErrorResponse('Cannot deactivate your own account', 'SELF_DEACTIVATION'));
        return;
      }

      // Get target user
      const targetUser = await userService.findById(userId);

      if (!targetUser) {
        res.status(404).json(createErrorResponse('User not found', 'USER_NOT_FOUND'));
        return;
      }

      // Super admins can deactivate anyone, tenant owners can only deactivate within their tenant
      if (currentUser.globalRole !== UserRoles.SUPER_ADMIN) {
        const hasCommonTenant = targetUser.tenantMemberships.some(membership =>
          membership.status === 'active' &&
          currentUser.tenantMemberships?.some((currentMembership: any) =>
            currentMembership.tenantId === membership.tenantId &&
            currentMembership.status === 'active'
          )
        );

        if (!hasCommonTenant) {
          res.status(403).json(createErrorResponse('Cannot deactivate user outside your tenant', 'TENANT_RESTRICTION'));
          return;
        }
      }

      // Deactivate user
      await userService.deactivateUser(userId);

      logger.audit('User deactivated', {
        targetUserId: userId,
        targetUserEmail: targetUser.email,
        deactivatedBy: currentUser.id,
        ip: req.ip,
      });

      res.json(createResponse({}, 'User account deactivated successfully'));

    } catch (error) {
      logger.error('Deactivate user error', {
        userId,
        currentUserId: currentUser.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/users/stats:
 *   get:
 *     tags: [Users]
 *     summary: Get user statistics (super admin only)
 *     security:
 *       - BearerAuth: []
 */
userRoutes.get('/stats',
  authenticate,
  requireRole([UserRoles.SUPER_ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const stats = await userService.getUserStats();

      res.json(createResponse(stats, 'User statistics retrieved'));

    } catch (error) {
      logger.error('Get user statistics error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/users/delete-account:
 *   delete:
 *     tags: [Users]
 *     summary: Delete user account (self-service)
 *     security:
 *       - BearerAuth: []
 */
userRoutes.delete('/delete-account', authenticate, async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  const { password, confirmText } = req.body;

  try {
    // Require password confirmation
    if (!password) {
      res.status(400).json(createErrorResponse('Password confirmation required', 'PASSWORD_REQUIRED'));
      return;
    }

    // Require explicit confirmation text
    if (confirmText !== 'DELETE MY ACCOUNT') {
      res.status(400).json(createErrorResponse('Please type "DELETE MY ACCOUNT" to confirm', 'CONFIRMATION_REQUIRED'));
      return;
    }

    // Get full user data
    const fullUser = await userService.findById(user.id);
    if (!fullUser) {
      res.status(404).json(createErrorResponse('User not found', 'USER_NOT_FOUND'));
      return;
    }

    // Verify password
    const bcrypt = require('bcryptjs');
    const isPasswordValid = await bcrypt.compare(password, fullUser.auth.passwordHash);
    if (!isPasswordValid) {
      res.status(401).json(createErrorResponse('Invalid password', 'INVALID_PASSWORD'));
      return;
    }

    // Check if user is the only owner of any tenants
    const ownedTenants = fullUser.tenantMemberships.filter(
      m => m.role === UserRoles.TENANT_OWNER && m.status === 'active'
    );

    if (ownedTenants.length > 0) {
      // For now, prevent deletion if user owns tenants
      // In a full implementation, you'd transfer ownership or handle this differently
      res.status(400).json(createErrorResponse(
        'Cannot delete account while you own active tenants. Please transfer ownership first.',
        'TENANT_OWNERSHIP_CONFLICT'
      ));
      return;
    }

    // Mark account for deletion (in a real system, you might have a grace period)
    await userService.deactivateUser(user.id);

    logger.audit('User account deleted', {
      userId: user.id,
      email: fullUser.email,
      ip: req.ip,
    });

    res.json(createResponse({}, 'Account deletion initiated successfully'));

  } catch (error) {
    logger.error('Delete account error', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
});