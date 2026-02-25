// Organization management routes

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
  BusinessTypes,
  SubscriptionPlans,
} from '@properpos/backend-shared';

import { OrganizationService } from '../services/OrganizationService';

export const organizationRoutes = Router();

// Initialize services
const organizationService = new OrganizationService();

/**
 * @swagger
 * /api/v1/organizations:
 *   get:
 *     tags: [Organizations]
 *     summary: Get organizations (super admin only)
 *     security:
 *       - BearerAuth: []
 */
organizationRoutes.get('/',
  authenticate,
  requireRole([UserRoles.SUPER_ADMIN]),
  async (req: Request, res: Response) => {
    const {
      page = 1,
      limit = 20,
      search,
      businessType,
      subscriptionStatus,
      subscriptionPlan
    } = req.query;

    try {
      const organizations = await organizationService.getOrganizations({
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        search: search as string,
        businessType: businessType as BusinessTypes,
        subscriptionStatus: subscriptionStatus as string,
        subscriptionPlan: subscriptionPlan as SubscriptionPlans,
      });

      res.json(createResponse(organizations, 'Organizations retrieved successfully'));

    } catch (error) {
      logger.error('Get organizations error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}:
 *   get:
 *     tags: [Organizations]
 *     summary: Get organization by ID
 */
organizationRoutes.get('/:organizationId',
  authenticate,
  requireRole([UserRoles.SUPER_ADMIN, UserRoles.TENANT_OWNER]),
  async (req: Request, res: Response): Promise<void> => {
    const { organizationId } = req.params;
    const user = (req as any).user;

    try {
      const organization = await organizationService.getOrganizationById(organizationId);

      if (!organization) {
        res.status(404).json(createErrorResponse('Organization not found', 'ORGANIZATION_NOT_FOUND'));
        return;
      }

      // If not super admin, check if user belongs to this organization
      if (user.globalRole !== UserRoles.SUPER_ADMIN) {
        const hasAccess = user.tenantMemberships?.some((membership: any) =>
          membership.tenantId === organization.tenantId && membership.status === 'active'
        );

        if (!hasAccess) {
          res.status(403).json(createErrorResponse('Access denied', 'ACCESS_DENIED'));
          return;
        }
      }

      res.json(createResponse(organization, 'Organization retrieved successfully'));

    } catch (error) {
      logger.error('Get organization by ID error', {
        organizationId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/organizations:
 *   post:
 *     tags: [Organizations]
 *     summary: Create new organization (super admin only)
 */
organizationRoutes.post('/',
  authenticate,
  requireRole([UserRoles.SUPER_ADMIN]),
  validationMiddleware.createOrganization,
  async (req: Request, res: Response) => {
    const user = (req as any).user;
    const { name, businessType, ownerId, settings } = req.body;

    try {
      const organization = await organizationService.createOrganization({
        name,
        businessType,
        ownerId,
        settings,
      });

      logger.audit('Organization created by admin', {
        organizationId: organization.id,
        tenantId: organization.tenantId,
        name,
        businessType,
        ownerId,
        createdBy: user.id,
        ip: req.ip,
      });

      res.status(201).json(createResponse({
        organization: {
          id: organization.id,
          tenantId: organization.tenantId,
          name: organization.name,
          businessType: organization.businessType,
          subscription: organization.subscription,
          createdAt: organization.createdAt,
        },
      }, 'Organization created successfully'));

    } catch (error) {
      logger.error('Create organization error', {
        name,
        businessType,
        ownerId,
        createdBy: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}:
 *   put:
 *     tags: [Organizations]
 *     summary: Update organization
 */
organizationRoutes.put('/:organizationId',
  authenticate,
  requireRole([UserRoles.SUPER_ADMIN, UserRoles.TENANT_OWNER]),
  validationMiddleware.updateOrganization,
  async (req: Request, res: Response): Promise<void> => {
    const { organizationId } = req.params;
    const user = (req as any).user;
    const updates = req.body;

    try {
      // Get organization first to check permissions
      const organization = await organizationService.getOrganizationById(organizationId);

      if (!organization) {
        res.status(404).json(createErrorResponse('Organization not found', 'ORGANIZATION_NOT_FOUND'));
        return;
      }

      // If not super admin, check if user is owner of this organization
      if (user.globalRole !== UserRoles.SUPER_ADMIN) {
        const hasOwnerAccess = user.tenantMemberships?.some((membership: any) =>
          membership.tenantId === organization.tenantId &&
          membership.status === 'active' &&
          membership.role === UserRoles.TENANT_OWNER
        );

        if (!hasOwnerAccess) {
          res.status(403).json(createErrorResponse('Only organization owners can update organization details', 'ACCESS_DENIED'));
          return;
        }
      }

      await organizationService.updateOrganization(organizationId, updates, user.id);

      logger.audit('Organization updated', {
        organizationId,
        tenantId: organization.tenantId,
        updatedBy: user.id,
        updatedFields: Object.keys(updates),
        ip: req.ip,
      });

      res.json(createResponse({}, 'Organization updated successfully'));

    } catch (error) {
      logger.error('Update organization error', {
        organizationId,
        updatedBy: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/suspend:
 *   post:
 *     tags: [Organizations]
 *     summary: Suspend organization (super admin only)
 */
organizationRoutes.post('/:organizationId/suspend',
  authenticate,
  requireRole([UserRoles.SUPER_ADMIN]),
  async (req: Request, res: Response): Promise<void> => {
    const { organizationId } = req.params;
    const user = (req as any).user;
    const { reason } = req.body;

    if (!reason) {
      res.status(400).json(createErrorResponse('Suspension reason is required', 'REASON_REQUIRED'));
      return;
    }

    try {
      await organizationService.suspendOrganization(organizationId, reason, user.id);

      logger.audit('Organization suspended', {
        organizationId,
        suspendedBy: user.id,
        reason,
        ip: req.ip,
      });

      res.json(createResponse({}, 'Organization suspended successfully'));

    } catch (error) {
      logger.error('Suspend organization error', {
        organizationId,
        suspendedBy: user.id,
        reason,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/reactivate:
 *   post:
 *     tags: [Organizations]
 *     summary: Reactivate suspended organization (super admin only)
 */
organizationRoutes.post('/:organizationId/reactivate',
  authenticate,
  requireRole([UserRoles.SUPER_ADMIN]),
  async (req: Request, res: Response) => {
    const { organizationId } = req.params;
    const user = (req as any).user;

    try {
      await organizationService.reactivateOrganization(organizationId, user.id);

      logger.audit('Organization reactivated', {
        organizationId,
        reactivatedBy: user.id,
        ip: req.ip,
      });

      res.json(createResponse({}, 'Organization reactivated successfully'));

    } catch (error) {
      logger.error('Reactivate organization error', {
        organizationId,
        reactivatedBy: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/organizations/{organizationId}/delete:
 *   delete:
 *     tags: [Organizations]
 *     summary: Delete organization (super admin only)
 */
organizationRoutes.delete('/:organizationId',
  authenticate,
  requireRole([UserRoles.SUPER_ADMIN]),
  async (req: Request, res: Response): Promise<void> => {
    const { organizationId } = req.params;
    const user = (req as any).user;
    const { confirmText } = req.body;

    // Require explicit confirmation
    if (confirmText !== 'DELETE ORGANIZATION') {
      res.status(400).json(createErrorResponse(
        'Please type "DELETE ORGANIZATION" to confirm deletion',
        'CONFIRMATION_REQUIRED'
      ));
      return;
    }

    try {
      await organizationService.deleteOrganization(organizationId, user.id);

      logger.audit('Organization deleted', {
        organizationId,
        deletedBy: user.id,
        ip: req.ip,
      });

      res.json(createResponse({}, 'Organization deletion initiated'));

    } catch (error) {
      logger.error('Delete organization error', {
        organizationId,
        deletedBy: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/organizations/stats:
 *   get:
 *     tags: [Organizations]
 *     summary: Get organization statistics (super admin only)
 */
organizationRoutes.get('/stats',
  authenticate,
  requireRole([UserRoles.SUPER_ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const stats = await organizationService.getOrganizationStats();

      res.json(createResponse(stats, 'Organization statistics retrieved'));

    } catch (error) {
      logger.error('Get organization statistics error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);