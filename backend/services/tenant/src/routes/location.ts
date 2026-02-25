// Location management routes

import { Router, Request, Response } from 'express';

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
} from '@properpos/backend-shared';

import { LocationService } from '../services/LocationService';

export const locationRoutes = Router();

// Initialize services
const locationService = new LocationService();

/**
 * @swagger
 * /api/v1/locations:
 *   get:
 *     tags: [Locations]
 *     summary: Get all locations for current tenant
 *     security:
 *       - BearerAuth: []
 *       - TenantHeader: []
 */
locationRoutes.get('/',
  authenticate,
  extractTenant,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { page = 1, limit = 20, search, isActive } = req.query;

    try {
      // Filter by user's location access if not admin
      let locationAccess: string[] | undefined;
      if (user.role !== UserRoles.TENANT_OWNER && user.role !== UserRoles.ADMIN) {
        const membership = user.tenantMemberships?.find((m: any) => m.tenantId === tenantId);
        locationAccess = membership?.locationAccess;

        if (!locationAccess || locationAccess.length === 0) {
          res.json(createResponse({
            data: [],
            meta: { page: 1, limit: 20, total: 0, totalPages: 0, hasMore: false }
          }, 'No locations accessible'));
          return;
        }
      }

      const locations = await locationService.getLocations(tenantId, {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        search: search as string,
        isActive: isActive !== undefined ? isActive === 'true' : undefined,
        locationAccess,
      });

      res.json(createResponse(locations, 'Locations retrieved successfully'));

    } catch (error) {
      logger.error('Get locations error', {
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
 * /api/v1/locations/{locationId}:
 *   get:
 *     tags: [Locations]
 *     summary: Get location by ID
 */
locationRoutes.get('/:locationId',
  authenticate,
  extractTenant,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { locationId } = req.params;

    try {
      // Check location access
      if (user.role !== UserRoles.TENANT_OWNER && user.role !== UserRoles.ADMIN) {
        const membership = user.tenantMemberships?.find((m: any) => m.tenantId === tenantId);
        const hasAccess = membership?.locationAccess?.includes(locationId) || membership?.locationAccess?.includes('*');

        if (!hasAccess) {
          res.status(403).json(createErrorResponse('Access denied to this location', 'LOCATION_ACCESS_DENIED'));
          return;
        }
      }

      const location = await locationService.getLocationById(tenantId, locationId);

      if (!location) {
        res.status(404).json(createErrorResponse('Location not found', 'LOCATION_NOT_FOUND'));
        return;
      }

      res.json(createResponse(location, 'Location retrieved successfully'));

    } catch (error) {
      logger.error('Get location by ID error', {
        tenantId,
        locationId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/locations:
 *   post:
 *     tags: [Locations]
 *     summary: Create new location
 */
locationRoutes.post('/',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  requirePermissions([Permissions.LOCATION_MANAGE]),
  validationMiddleware.createLocation,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const locationData = req.body;

    try {
      // Check subscription limits
      const canCreateLocation = await locationService.checkLocationLimit(tenantId);

      if (!canCreateLocation.allowed) {
        res.status(403).json(createErrorResponse(
          canCreateLocation.message || 'Location limit reached',
          'LOCATION_LIMIT_REACHED'
        ));
        return;
      }

      const location = await locationService.createLocation(tenantId, {
        ...locationData,
        createdBy: user.id,
      });

      logger.audit('Location created', {
        tenantId,
        locationId: location.id,
        name: location.name,
        createdBy: user.id,
        ip: req.ip,
      });

      res.status(201).json(createResponse(location, 'Location created successfully'));

    } catch (error) {
      logger.error('Create location error', {
        tenantId,
        userId: user.id,
        locationData,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/locations/{locationId}:
 *   put:
 *     tags: [Locations]
 *     summary: Update location
 */
locationRoutes.put('/:locationId',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  requirePermissions([Permissions.LOCATION_MANAGE]),
  validationMiddleware.updateLocation,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { locationId } = req.params;
    const updates = req.body;

    try {
      // Check location access for managers
      if (user.role === UserRoles.MANAGER) {
        const membership = user.tenantMemberships?.find((m: any) => m.tenantId === tenantId);
        const hasAccess = membership?.locationAccess?.includes(locationId) || membership?.locationAccess?.includes('*');

        if (!hasAccess) {
          res.status(403).json(createErrorResponse('Access denied to this location', 'LOCATION_ACCESS_DENIED'));
          return;
        }
      }

      await locationService.updateLocation(tenantId, locationId, {
        ...updates,
        updatedBy: user.id,
      });

      logger.audit('Location updated', {
        tenantId,
        locationId,
        updatedBy: user.id,
        updatedFields: Object.keys(updates),
        ip: req.ip,
      });

      res.json(createResponse({}, 'Location updated successfully'));

    } catch (error) {
      logger.error('Update location error', {
        tenantId,
        locationId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/locations/{locationId}/deactivate:
 *   post:
 *     tags: [Locations]
 *     summary: Deactivate location
 */
locationRoutes.post('/:locationId/deactivate',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  requirePermissions([Permissions.LOCATION_MANAGE]),
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { locationId } = req.params;
    const { reason } = req.body;

    try {
      await locationService.deactivateLocation(tenantId, locationId, {
        reason,
        deactivatedBy: user.id,
      });

      logger.audit('Location deactivated', {
        tenantId,
        locationId,
        deactivatedBy: user.id,
        reason,
        ip: req.ip,
      });

      res.json(createResponse({}, 'Location deactivated successfully'));

    } catch (error) {
      logger.error('Deactivate location error', {
        tenantId,
        locationId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/locations/{locationId}/reactivate:
 *   post:
 *     tags: [Locations]
 *     summary: Reactivate location
 */
locationRoutes.post('/:locationId/reactivate',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  requirePermissions([Permissions.LOCATION_MANAGE]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { locationId } = req.params;

    try {
      // Check subscription limits before reactivating
      const canCreateLocation = await locationService.checkLocationLimit(tenantId);

      if (!canCreateLocation.allowed) {
        res.status(403).json(createErrorResponse(
          'Cannot reactivate location: subscription limit reached',
          'LOCATION_LIMIT_REACHED'
        ));
        return;
      }

      await locationService.reactivateLocation(tenantId, locationId, user.id);

      logger.audit('Location reactivated', {
        tenantId,
        locationId,
        reactivatedBy: user.id,
        ip: req.ip,
      });

      res.json(createResponse({}, 'Location reactivated successfully'));

    } catch (error) {
      logger.error('Reactivate location error', {
        tenantId,
        locationId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/locations/{locationId}/stats:
 *   get:
 *     tags: [Locations]
 *     summary: Get location statistics
 */
locationRoutes.get('/:locationId/stats',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { locationId } = req.params;
    const { period = 'today' } = req.query;

    try {
      // Check location access
      if (user.role === UserRoles.MANAGER) {
        const membership = user.tenantMemberships?.find((m: any) => m.tenantId === tenantId);
        const hasAccess = membership?.locationAccess?.includes(locationId) || membership?.locationAccess?.includes('*');

        if (!hasAccess) {
          res.status(403).json(createErrorResponse('Access denied to this location', 'LOCATION_ACCESS_DENIED'));
          return;
        }
      }

      const stats = await locationService.getLocationStats(tenantId, locationId, period as string);

      res.json(createResponse(stats, 'Location statistics retrieved'));

    } catch (error) {
      logger.error('Get location stats error', {
        tenantId,
        locationId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/locations/{locationId}/hours:
 *   get:
 *     tags: [Locations]
 *     summary: Get location operating hours
 */
locationRoutes.get('/:locationId/hours',
  authenticate,
  extractTenant,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const { locationId } = req.params;

    try {
      const hours = await locationService.getLocationHours(tenantId, locationId);

      if (!hours) {
        res.status(404).json(createErrorResponse('Location not found', 'LOCATION_NOT_FOUND'));
        return;
      }

      res.json(createResponse(hours, 'Location hours retrieved'));

    } catch (error) {
      logger.error('Get location hours error', {
        tenantId,
        locationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/locations/{locationId}/hours:
 *   put:
 *     tags: [Locations]
 *     summary: Update location operating hours
 */
locationRoutes.put('/:locationId/hours',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  requirePermissions([Permissions.LOCATION_MANAGE]),
  validationMiddleware.updateLocationHours,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { locationId } = req.params;
    const { hours } = req.body;

    try {
      // Check location access for managers
      if (user.role === UserRoles.MANAGER) {
        const membership = user.tenantMemberships?.find((m: any) => m.tenantId === tenantId);
        const hasAccess = membership?.locationAccess?.includes(locationId) || membership?.locationAccess?.includes('*');

        if (!hasAccess) {
          res.status(403).json(createErrorResponse('Access denied to this location', 'LOCATION_ACCESS_DENIED'));
          return;
        }
      }

      await locationService.updateLocationHours(tenantId, locationId, hours, user.id);

      logger.audit('Location hours updated', {
        tenantId,
        locationId,
        updatedBy: user.id,
        ip: req.ip,
      });

      res.json(createResponse({}, 'Location hours updated successfully'));

    } catch (error) {
      logger.error('Update location hours error', {
        tenantId,
        locationId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);