// Enhanced Authorization Middleware
// Provides resource-level access control and per-location permissions

import { Request, Response, NextFunction } from 'express';
import { UserRoles, Permissions, ROLE_PERMISSIONS } from '@properpos/shared';
import { ApiError } from '../utils/errors';
import { logger } from '../utils/logger';
import { DatabaseService } from '../database/service';
import { cache } from '../database/redis';

const dbService = new DatabaseService();

// Cache TTL for authorization data (5 minutes)
const AUTH_CACHE_TTL = 300;

export interface AuthorizationContext {
  userId: string;
  userRole: UserRoles;
  tenantId: string;
  locationAccess: string[];
  permissions: Permissions[];
}

export interface ResourceAccess {
  resource: string;
  resourceId?: string;
  action: 'create' | 'read' | 'update' | 'delete' | 'list';
  locationId?: string;
}

/**
 * Resource permission mapping
 * Maps resource types to required permissions for each action
 */
export const RESOURCE_PERMISSIONS: Record<string, Record<string, Permissions>> = {
  order: {
    create: Permissions.ORDER_CREATE,
    read: Permissions.ORDER_READ,
    update: Permissions.ORDER_UPDATE,
    delete: Permissions.ORDER_DELETE,
    list: Permissions.ORDER_READ,
    refund: Permissions.ORDER_REFUND,
  },
  product: {
    create: Permissions.PRODUCT_CREATE,
    read: Permissions.PRODUCT_READ,
    update: Permissions.PRODUCT_UPDATE,
    delete: Permissions.PRODUCT_DELETE,
    list: Permissions.PRODUCT_READ,
  },
  customer: {
    create: Permissions.CUSTOMER_CREATE,
    read: Permissions.CUSTOMER_READ,
    update: Permissions.CUSTOMER_UPDATE,
    delete: Permissions.CUSTOMER_DELETE,
    list: Permissions.CUSTOMER_READ,
  },
  inventory: {
    read: Permissions.INVENTORY_READ,
    update: Permissions.INVENTORY_UPDATE,
    transfer: Permissions.INVENTORY_TRANSFER,
    list: Permissions.INVENTORY_READ,
  },
  analytics: {
    read: Permissions.ANALYTICS_READ,
    list: Permissions.ANALYTICS_READ,
  },
  report: {
    read: Permissions.ANALYTICS_READ,
    generate: Permissions.REPORTS_GENERATE,
    export: Permissions.REPORTS_EXPORT,
    list: Permissions.ANALYTICS_READ,
  },
  user: {
    create: Permissions.USER_CREATE,
    read: Permissions.USER_READ,
    update: Permissions.USER_UPDATE,
    delete: Permissions.USER_DELETE,
    list: Permissions.USER_READ,
  },
  location: {
    create: Permissions.LOCATION_MANAGE,
    read: Permissions.LOCATION_SWITCH,
    update: Permissions.LOCATION_MANAGE,
    delete: Permissions.LOCATION_MANAGE,
    list: Permissions.LOCATION_SWITCH,
  },
  settings: {
    read: Permissions.SYSTEM_SETTINGS,
    update: Permissions.SYSTEM_SETTINGS,
  },
};

/**
 * Roles that have unrestricted access to all locations
 */
const UNRESTRICTED_LOCATION_ROLES: UserRoles[] = [
  UserRoles.SUPER_ADMIN,
  UserRoles.TENANT_OWNER,
];

/**
 * Check if user has a specific permission
 */
export function hasPermission(
  userPermissions: Permissions[],
  requiredPermission: Permissions
): boolean {
  return userPermissions.includes(requiredPermission);
}

/**
 * Check if user has any of the specified permissions
 */
export function hasAnyPermission(
  userPermissions: Permissions[],
  requiredPermissions: Permissions[]
): boolean {
  return requiredPermissions.some((p) => userPermissions.includes(p));
}

/**
 * Check if user has all specified permissions
 */
export function hasAllPermissions(
  userPermissions: Permissions[],
  requiredPermissions: Permissions[]
): boolean {
  return requiredPermissions.every((p) => userPermissions.includes(p));
}

/**
 * Check if user has unrestricted location access
 */
export function hasUnrestrictedLocationAccess(role: UserRoles): boolean {
  return UNRESTRICTED_LOCATION_ROLES.includes(role);
}

/**
 * Check if user can access a specific location
 */
export function canAccessLocation(
  userRole: UserRoles,
  userLocationAccess: string[],
  targetLocationId: string
): boolean {
  if (hasUnrestrictedLocationAccess(userRole)) {
    return true;
  }
  return userLocationAccess.includes(targetLocationId);
}

/**
 * Get authorization context from request
 */
export function getAuthContext(req: Request): AuthorizationContext | null {
  if (!req.user) {
    return null;
  }

  return {
    userId: req.user.id,
    userRole: req.user.role,
    tenantId: req.user.tenantId || '',
    locationAccess: req.user.locationAccess || [],
    permissions: req.user.permissions || ROLE_PERMISSIONS[req.user.role] || [],
  };
}

/**
 * Middleware factory for resource-level authorization
 */
export function authorizeResource(
  resource: string,
  action: string,
  options?: {
    locationIdParam?: string;
    resourceIdParam?: string;
    ownershipCheck?: boolean;
  }
) {
  const {
    locationIdParam = 'locationId',
    resourceIdParam = 'id',
    ownershipCheck = false,
  } = options || {};

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const context = getAuthContext(req);
      if (!context) {
        throw new ApiError('Authentication required', 'UNAUTHORIZED', 401);
      }

      // Get required permission for this resource action
      const resourcePermissions = RESOURCE_PERMISSIONS[resource];
      if (!resourcePermissions) {
        logger.warn('Unknown resource type for authorization', { resource });
        throw new ApiError('Invalid resource type', 'INVALID_RESOURCE', 400);
      }

      const requiredPermission = resourcePermissions[action];
      if (!requiredPermission) {
        logger.warn('Unknown action for resource authorization', { resource, action });
        throw new ApiError('Invalid action', 'INVALID_ACTION', 400);
      }

      // Check permission
      if (!hasPermission(context.permissions, requiredPermission)) {
        logger.warn('Permission denied', {
          userId: context.userId,
          resource,
          action,
          requiredPermission,
        });
        throw new ApiError(
          `You do not have permission to ${action} ${resource}s`,
          'PERMISSION_DENIED',
          403
        );
      }

      // Check location access if locationId is provided
      const locationId =
        req.params[locationIdParam] ||
        req.body[locationIdParam] ||
        req.query[locationIdParam] as string;

      if (locationId && !canAccessLocation(context.userRole, context.locationAccess, locationId)) {
        logger.warn('Location access denied', {
          userId: context.userId,
          locationId,
          userLocations: context.locationAccess,
        });
        throw new ApiError(
          'You do not have access to this location',
          'LOCATION_ACCESS_DENIED',
          403
        );
      }

      // Check resource ownership if required
      if (ownershipCheck && req.params[resourceIdParam]) {
        const isOwner = await checkResourceOwnership(
          resource,
          req.params[resourceIdParam],
          context,
          locationId
        );

        if (!isOwner) {
          throw new ApiError(
            `You do not have access to this ${resource}`,
            'RESOURCE_ACCESS_DENIED',
            403
          );
        }
      }

      // Attach authorization info to request
      (req as any).authContext = context;
      (req as any).authorizedResource = { resource, action, locationId };

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Check if user owns or has access to a specific resource
 */
async function checkResourceOwnership(
  resource: string,
  resourceId: string,
  context: AuthorizationContext,
  locationId?: string
): Promise<boolean> {
  // Super admins and tenant owners have access to everything in their tenant
  if (hasUnrestrictedLocationAccess(context.userRole)) {
    return true;
  }

  try {
    const tenantConnection = await dbService.getTenantDB(context.tenantId);
    const tenantDb = tenantConnection.db;
    if (!tenantDb) {
      throw new Error('Tenant database connection not established');
    }
    let collection: string;
    let query: Record<string, unknown>;

    switch (resource) {
      case 'order':
        collection = 'orders';
        query = {
          $or: [{ id: resourceId }, { _id: resourceId }],
        };
        if (!hasUnrestrictedLocationAccess(context.userRole)) {
          query.locationId = { $in: context.locationAccess };
        }
        break;

      case 'product':
        collection = 'products';
        query = {
          $or: [{ id: resourceId }, { _id: resourceId }],
        };
        break;

      case 'customer':
        collection = 'customers';
        query = {
          $or: [{ id: resourceId }, { _id: resourceId }],
        };
        break;

      case 'inventory':
        collection = 'inventory';
        query = {
          $or: [{ id: resourceId }, { _id: resourceId }],
        };
        if (!hasUnrestrictedLocationAccess(context.userRole)) {
          query.locationId = { $in: context.locationAccess };
        }
        break;

      default:
        // For unknown resources, allow access if user has location access
        return locationId ? context.locationAccess.includes(locationId) : true;
    }

    const doc = await tenantDb.collection(collection).findOne(query);
    return !!doc;
  } catch (error) {
    logger.error('Resource ownership check failed', {
      resource,
      resourceId,
      userId: context.userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

/**
 * Middleware to ensure user can only access their locations' data
 */
export const enforceLocationScope = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const context = getAuthContext(req);
    if (!context) {
      throw new ApiError('Authentication required', 'UNAUTHORIZED', 401);
    }

    // Super admins and tenant owners bypass location scoping
    if (hasUnrestrictedLocationAccess(context.userRole)) {
      return next();
    }

    // Get location ID from various sources
    const locationId =
      req.params.locationId ||
      req.body.locationId ||
      req.query.locationId as string;

    if (locationId && !canAccessLocation(context.userRole, context.locationAccess, locationId)) {
      throw new ApiError(
        'Access denied to this location',
        'LOCATION_ACCESS_DENIED',
        403
      );
    }

    // Attach accessible locations to request for query scoping
    (req as any).accessibleLocations = context.locationAccess;

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware to filter query results by location access
 * Adds location filter to database queries
 */
export const scopeByLocation = (locationField: string = 'locationId') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const context = getAuthContext(req);
    if (!context) {
      return next(new ApiError('Authentication required', 'UNAUTHORIZED', 401));
    }

    // Super admins and tenant owners see all data
    if (hasUnrestrictedLocationAccess(context.userRole)) {
      return next();
    }

    // Add location filter to query params for downstream handlers
    (req as any).locationFilter = {
      [locationField]: { $in: context.locationAccess },
    };

    next();
  };
};

/**
 * Verify all required permissions for an endpoint
 */
export function requireAllPermissions(...permissions: Permissions[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const context = getAuthContext(req);
    if (!context) {
      return next(new ApiError('Authentication required', 'UNAUTHORIZED', 401));
    }

    if (!hasAllPermissions(context.permissions, permissions)) {
      const missing = permissions.filter((p) => !context.permissions.includes(p));
      logger.warn('Missing required permissions', {
        userId: context.userId,
        missing,
        required: permissions,
      });
      return next(
        new ApiError(
          'Insufficient permissions for this operation',
          'INSUFFICIENT_PERMISSIONS',
          403,
          { missing, required: permissions }
        )
      );
    }

    next();
  };
}

/**
 * Verify any of the required permissions for an endpoint
 */
export function requireAnyPermission(...permissions: Permissions[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const context = getAuthContext(req);
    if (!context) {
      return next(new ApiError('Authentication required', 'UNAUTHORIZED', 401));
    }

    if (!hasAnyPermission(context.permissions, permissions)) {
      logger.warn('No matching permissions', {
        userId: context.userId,
        required: permissions,
        userPermissions: context.permissions,
      });
      return next(
        new ApiError(
          'You do not have any of the required permissions',
          'INSUFFICIENT_PERMISSIONS',
          403,
          { required: permissions }
        )
      );
    }

    next();
  };
}

/**
 * Authorization decorator for specific actions
 */
export const authorize = {
  // Order operations
  createOrder: authorizeResource('order', 'create'),
  readOrder: authorizeResource('order', 'read', { ownershipCheck: true }),
  updateOrder: authorizeResource('order', 'update', { ownershipCheck: true }),
  deleteOrder: authorizeResource('order', 'delete', { ownershipCheck: true }),
  listOrders: authorizeResource('order', 'list'),
  refundOrder: authorizeResource('order', 'refund', { ownershipCheck: true }),

  // Product operations
  createProduct: authorizeResource('product', 'create'),
  readProduct: authorizeResource('product', 'read'),
  updateProduct: authorizeResource('product', 'update'),
  deleteProduct: authorizeResource('product', 'delete'),
  listProducts: authorizeResource('product', 'list'),

  // Customer operations
  createCustomer: authorizeResource('customer', 'create'),
  readCustomer: authorizeResource('customer', 'read'),
  updateCustomer: authorizeResource('customer', 'update'),
  deleteCustomer: authorizeResource('customer', 'delete'),
  listCustomers: authorizeResource('customer', 'list'),

  // Inventory operations
  readInventory: authorizeResource('inventory', 'read'),
  updateInventory: authorizeResource('inventory', 'update'),
  transferInventory: authorizeResource('inventory', 'transfer'),
  listInventory: authorizeResource('inventory', 'list'),

  // Analytics operations
  readAnalytics: authorizeResource('analytics', 'read'),
  generateReport: authorizeResource('report', 'generate'),
  exportReport: authorizeResource('report', 'export'),

  // User operations
  createUser: authorizeResource('user', 'create'),
  readUser: authorizeResource('user', 'read'),
  updateUser: authorizeResource('user', 'update'),
  deleteUser: authorizeResource('user', 'delete'),
  listUsers: authorizeResource('user', 'list'),

  // Location operations
  createLocation: authorizeResource('location', 'create'),
  readLocation: authorizeResource('location', 'read'),
  updateLocation: authorizeResource('location', 'update'),
  deleteLocation: authorizeResource('location', 'delete'),
  listLocations: authorizeResource('location', 'list'),

  // Settings operations
  readSettings: authorizeResource('settings', 'read'),
  updateSettings: authorizeResource('settings', 'update'),
};

/**
 * Log authorization event for audit trail
 */
export function logAuthorizationEvent(
  context: AuthorizationContext,
  action: string,
  resource: string,
  resourceId: string | undefined,
  result: 'allowed' | 'denied',
  reason?: string
): void {
  logger.info('Authorization event', {
    userId: context.userId,
    userRole: context.userRole,
    tenantId: context.tenantId,
    action,
    resource,
    resourceId,
    result,
    reason,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Get user's effective permissions (including role-based and custom)
 */
export async function getEffectivePermissions(
  userId: string,
  tenantId: string
): Promise<Permissions[]> {
  const cacheKey = `permissions:${userId}:${tenantId}`;

  try {
    const cached = await cache.get<Permissions[]>(cacheKey);
    if (cached) {
      return cached;
    }
  } catch {
    // Cache miss
  }

  try {
    const platformConnection = dbService.getPlatformDB();
    const platformDb = platformConnection.db;
    if (!platformDb) {
      throw new Error('Platform database connection not established');
    }
    const membership = await platformDb.collection('tenant_memberships').findOne({
      userId,
      tenantId,
      status: 'active',
    });

    if (!membership) {
      return [];
    }

    // Combine role permissions with any custom permissions
    const rolePermissions = ROLE_PERMISSIONS[membership.role as UserRoles] || [];
    const customPermissions = (membership.permissions as Permissions[]) || [];
    const effectivePermissions = [...new Set([...rolePermissions, ...customPermissions])];

    // Cache the result
    try {
      await cache.set(cacheKey, effectivePermissions, AUTH_CACHE_TTL);
    } catch {
      // Cache write failed
    }

    return effectivePermissions as Permissions[];
  } catch (error) {
    logger.error('Failed to get effective permissions', {
      userId,
      tenantId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return [];
  }
}

/**
 * Invalidate permission cache for a user
 */
export async function invalidatePermissionCache(userId: string, tenantId: string): Promise<void> {
  const cacheKey = `permissions:${userId}:${tenantId}`;
  try {
    await cache.del(cacheKey);
  } catch (error) {
    logger.warn('Failed to invalidate permission cache', { userId, tenantId });
  }
}
