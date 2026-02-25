// Tenant management routes

import { Router, Request, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';

import {
  logger,
  authenticate,
  extractTenant,
  requireRole,
  requirePermissions,
  validationMiddleware,
  createResponse,
  createErrorResponse,
  UserRoles,
  Permissions,
  BusinessTypes,
  SubscriptionPlans,
} from '@properpos/backend-shared';

import { TenantService } from '../services/TenantService';
import { OrganizationService } from '../services/OrganizationService';

export const tenantRoutes = Router();

// Initialize services
const tenantService = new TenantService();
const organizationService = new OrganizationService();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

/**
 * @swagger
 * /api/v1/tenants/current:
 *   get:
 *     tags: [Tenants]
 *     summary: Get current tenant information
 *     security:
 *       - BearerAuth: []
 *       - TenantHeader: []
 */
tenantRoutes.get('/current', authenticate, extractTenant, async (req: Request, res: Response): Promise<void> => {
  const tenantId = (req as any).tenant.tenantId || (req as any).tenant.tenantId;

  try {
    const tenant = await tenantService.getTenantById(tenantId);

    if (!tenant) {
      res.status(404).json(createErrorResponse('Tenant not found', 'TENANT_NOT_FOUND'));
      return;
    }

    res.json(createResponse(tenant, 'Tenant information retrieved'));

  } catch (error) {
    logger.error('Get current tenant error', {
      tenantId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
});

/**
 * @swagger
 * /api/v1/tenants/current/settings:
 *   get:
 *     tags: [Tenants]
 *     summary: Get tenant settings
 */
tenantRoutes.get('/current/settings', authenticate, extractTenant, async (req: Request, res: Response) => {
  const tenantId = (req as any).tenant.tenantId;

  try {
    const settings = await tenantService.getTenantSettings(tenantId);

    res.json(createResponse(settings, 'Tenant settings retrieved'));

  } catch (error) {
    logger.error('Get tenant settings error', {
      tenantId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
});

/**
 * @swagger
 * /api/v1/tenants/current/settings:
 *   put:
 *     tags: [Tenants]
 *     summary: Update tenant settings
 */
tenantRoutes.put('/current/settings',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  validationMiddleware.tenantSettings,
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.tenantId;
    const user = (req as any).user;
    const settings = req.body;

    try {
      await tenantService.updateTenantSettings(tenantId, settings, user.id);

      logger.audit('Tenant settings updated', {
        tenantId,
        userId: user.id,
        updatedFields: Object.keys(settings),
        ip: req.ip,
      });

      res.json(createResponse({}, 'Tenant settings updated successfully'));

    } catch (error) {
      logger.error('Update tenant settings error', {
        tenantId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/tenants/current/branding:
 *   get:
 *     tags: [Tenants]
 *     summary: Get tenant branding
 */
tenantRoutes.get('/current/branding', authenticate, extractTenant, async (req: Request, res: Response) => {
  const tenantId = (req as any).tenant.tenantId;

  try {
    const branding = await tenantService.getTenantBranding(tenantId);

    res.json(createResponse(branding, 'Tenant branding retrieved'));

  } catch (error) {
    logger.error('Get tenant branding error', {
      tenantId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
});

/**
 * @swagger
 * /api/v1/tenants/current/branding:
 *   put:
 *     tags: [Tenants]
 *     summary: Update tenant branding
 */
tenantRoutes.put('/current/branding',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.tenantId;
    const user = (req as any).user;
    const { name, colors, fonts, customCss } = req.body;

    try {
      const brandingData = {
        name,
        colors,
        fonts,
        customCss,
      };

      await tenantService.updateTenantBranding(tenantId, brandingData, user.id);

      logger.audit('Tenant branding updated', {
        tenantId,
        userId: user.id,
        ip: req.ip,
      });

      res.json(createResponse({}, 'Tenant branding updated successfully'));

    } catch (error) {
      logger.error('Update tenant branding error', {
        tenantId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/tenants/current/logo:
 *   post:
 *     tags: [Tenants]
 *     summary: Upload tenant logo
 */
tenantRoutes.post('/current/logo',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  upload.single('logo'),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.tenantId;
    const user = (req as any).user;

    try {
      if (!req.file) {
        res.status(400).json(createErrorResponse('Logo file is required', 'FILE_REQUIRED'));
        return;
      }

      // Process image
      const processedImage = await sharp(req.file.buffer)
        .resize(200, 200, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .png()
        .toBuffer();

      // Generate filename
      const filename = `logo_${tenantId}_${Date.now()}.png`;

      // Save logo (in production, you'd upload to S3/CloudStorage)
      const logoUrl = await tenantService.saveLogo(tenantId, filename, processedImage);

      await tenantService.updateTenantBranding(tenantId, { logo: logoUrl }, user.id);

      logger.audit('Tenant logo uploaded', {
        tenantId,
        userId: user.id,
        filename,
        ip: req.ip,
      });

      res.json(createResponse({
        logoUrl,
      }, 'Logo uploaded successfully'));

    } catch (error) {
      logger.error('Upload tenant logo error', {
        tenantId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/tenants/current/members:
 *   get:
 *     tags: [Tenants]
 *     summary: Get tenant members
 */
tenantRoutes.get('/current/members',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.tenantId;
    const { page = 1, limit = 20, search, role, status } = req.query;

    try {
      const filters: any = {};
      if (search) filters.search = search as string;
      if (role) filters.role = role as string;
      if (status) filters.status = status as string;

      const members = await tenantService.getTenantMembers(
        tenantId,
        {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          ...filters,
        }
      );

      res.json(createResponse(members, 'Tenant members retrieved'));

    } catch (error) {
      logger.error('Get tenant members error', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/tenants/current/members/invite:
 *   post:
 *     tags: [Tenants]
 *     summary: Invite user to tenant
 */
tenantRoutes.post('/current/members/invite',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  requirePermissions([Permissions.USER_UPDATE]),
  validationMiddleware.inviteUser,
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.tenantId;
    const user = (req as any).user;
    const { email, role, permissions, locationAccess } = req.body;

    try {
      const invitation = await tenantService.inviteUserToTenant({
        tenantId,
        email,
        role,
        permissions,
        locationAccess,
        invitedBy: user.id,
      });

      logger.audit('User invited to tenant', {
        tenantId,
        invitedBy: user.id,
        invitedEmail: email,
        role,
        ip: req.ip,
      });

      res.status(201).json(createResponse({
        invitation: {
          id: invitation.id,
          email,
          role,
          status: 'pending',
          expiresAt: invitation.expiresAt,
        },
      }, 'User invitation sent successfully'));

    } catch (error) {
      logger.error('Invite user to tenant error', {
        tenantId,
        userId: user.id,
        email,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/tenants/current/members/{userId}/role:
 *   put:
 *     tags: [Tenants]
 *     summary: Update member role
 */
tenantRoutes.put('/current/members/:userId/role',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  requirePermissions([Permissions.USER_UPDATE]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.tenantId;
    const user = (req as any).user;
    const { userId } = req.params;
    const { role, permissions, locationAccess } = req.body;

    try {
      // Prevent self-role modification for security
      if (userId === user.id) {
        res.status(400).json(createErrorResponse('Cannot modify your own role', 'SELF_ROLE_MODIFICATION'));
        return;
      }

      await tenantService.updateMemberRole(tenantId, userId, {
        role,
        permissions,
        locationAccess,
        updatedBy: user.id,
      });

      logger.audit('Member role updated', {
        tenantId,
        updatedBy: user.id,
        targetUserId: userId,
        newRole: role,
        ip: req.ip,
      });

      res.json(createResponse({}, 'Member role updated successfully'));

    } catch (error) {
      logger.error('Update member role error', {
        tenantId,
        userId: user.id,
        targetUserId: userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/tenants/current/members/{userId}/suspend:
 *   post:
 *     tags: [Tenants]
 *     summary: Suspend tenant member
 */
tenantRoutes.post('/current/members/:userId/suspend',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  requirePermissions([Permissions.USER_UPDATE]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.tenantId;
    const user = (req as any).user;
    const { userId } = req.params;
    const { reason } = req.body;

    try {
      // Prevent self-suspension
      if (userId === user.id) {
        res.status(400).json(createErrorResponse('Cannot suspend yourself', 'SELF_SUSPENSION'));
        return;
      }

      await tenantService.suspendMember(tenantId, userId, {
        reason,
        suspendedBy: user.id,
      });

      logger.audit('Member suspended', {
        tenantId,
        suspendedBy: user.id,
        targetUserId: userId,
        reason,
        ip: req.ip,
      });

      res.json(createResponse({}, 'Member suspended successfully'));

    } catch (error) {
      logger.error('Suspend member error', {
        tenantId,
        userId: user.id,
        targetUserId: userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/tenants/current/members/{userId}/reactivate:
 *   post:
 *     tags: [Tenants]
 *     summary: Reactivate suspended member
 */
tenantRoutes.post('/current/members/:userId/reactivate',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  requirePermissions([Permissions.USER_UPDATE]),
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.tenantId;
    const user = (req as any).user;
    const { userId } = req.params;

    try {
      await tenantService.reactivateMember(tenantId, userId, user.id);

      logger.audit('Member reactivated', {
        tenantId,
        reactivatedBy: user.id,
        targetUserId: userId,
        ip: req.ip,
      });

      res.json(createResponse({}, 'Member reactivated successfully'));

    } catch (error) {
      logger.error('Reactivate member error', {
        tenantId,
        userId: user.id,
        targetUserId: userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/tenants/current/activity:
 *   get:
 *     tags: [Tenants]
 *     summary: Get tenant activity log
 */
tenantRoutes.get('/current/activity',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.tenantId;
    const { page = 1, limit = 50, action, userId, startDate, endDate } = req.query;

    try {
      const filters: any = {};
      if (action) filters.action = action as string;
      if (userId) filters.userId = userId as string;
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);

      const activity = await tenantService.getTenantActivity(
        tenantId,
        {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          ...filters,
        }
      );

      res.json(createResponse(activity, 'Tenant activity retrieved'));

    } catch (error) {
      logger.error('Get tenant activity error', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/tenants/current/stats:
 *   get:
 *     tags: [Tenants]
 *     summary: Get tenant statistics
 */
tenantRoutes.get('/current/stats',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.tenantId;

    try {
      const stats = await tenantService.getTenantStats(tenantId);

      res.json(createResponse(stats, 'Tenant statistics retrieved'));

    } catch (error) {
      logger.error('Get tenant stats error', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);