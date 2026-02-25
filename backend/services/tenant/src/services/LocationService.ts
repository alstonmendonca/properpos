// Location service implementation

import { v4 as uuidv4 } from 'uuid';

import {
  logger,
  ApiError,
  getPlatformDatabase,
  getTenantDatabase,
  cache,
} from '@properpos/backend-shared';

interface Location {
  id: string;
  name: string;
  description?: string;
  address: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    coordinates?: {
      latitude: number;
      longitude: number;
    };
  };
  contact: {
    phone?: string;
    email?: string;
    website?: string;
  };
  settings: {
    timezone: string;
    currency: string;
    taxRate: number;
    receiptSettings: {
      showLogo: boolean;
      footerText: string;
      includeQr: boolean;
    };
    businessHours: Record<string, {
      open: string;
      close: string;
      closed: boolean;
    }>;
  };
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  deactivatedAt?: Date;
  deactivatedBy?: string;
  deactivationReason?: string;
}

interface LocationStats {
  orders: {
    today: number;
    thisWeek: number;
    thisMonth: number;
  };
  revenue: {
    today: number;
    thisWeek: number;
    thisMonth: number;
  };
  products: {
    total: number;
    active: number;
  };
  customers: {
    total: number;
    returning: number;
  };
}

export class LocationService {
  /**
   * Get locations for tenant
   */
  async getLocations(
    tenantId: string,
    options: {
      page: number;
      limit: number;
      search?: string;
      isActive?: boolean;
      locationAccess?: string[];
    }
  ): Promise<{
    data: Location[];
    meta: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasMore: boolean;
    };
  }> {
    try {
      const { page, limit, search, isActive, locationAccess } = options;
      const skip = (page - 1) * limit;

      // Get tenant database
      const db = await getTenantDatabase(tenantId);

      // Build query
      const query: any = {};

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { 'address.city': { $regex: search, $options: 'i' } },
          { 'address.state': { $regex: search, $options: 'i' } },
        ];
      }

      if (isActive !== undefined) {
        query.isActive = isActive;
      }

      // Filter by location access if provided
      if (locationAccess && !locationAccess.includes('*')) {
        query.id = { $in: locationAccess };
      }

      // Get total count
      const totalCount = await db.collection('locations').countDocuments(query);

      // Get locations
      const locations = await db.collection('locations')
        .find(query)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .toArray();

      const totalPages = Math.ceil(totalCount / limit);

      return {
        data: locations as Location[],
        meta: {
          page,
          limit,
          total: totalCount,
          totalPages,
          hasMore: page < totalPages,
        },
      };

    } catch (error) {
      logger.error('Failed to get locations', {
        tenantId,
        options,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to retrieve locations', 'LOCATIONS_FETCH_FAILED', 500);
    }
  }

  /**
   * Get location by ID
   */
  async getLocationById(tenantId: string, locationId: string): Promise<Location | null> {
    try {
      const db = await getTenantDatabase(tenantId);

      const location = await db.collection('locations').findOne({ id: locationId });

      return location as Location | null;

    } catch (error) {
      logger.error('Failed to get location by ID', {
        tenantId,
        locationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to retrieve location', 'LOCATION_FETCH_FAILED', 500);
    }
  }

  /**
   * Create new location
   */
  async createLocation(
    tenantId: string,
    data: Omit<Location, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Location> {
    try {
      const db = await getTenantDatabase(tenantId);

      const location: Location = {
        ...data,
        id: uuidv4(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.collection('locations').insertOne(location);

      logger.audit('Location created', {
        tenantId,
        locationId: location.id,
        name: location.name,
        createdBy: data.createdBy,
      });

      return location;

    } catch (error) {
      logger.error('Failed to create location', {
        tenantId,
        data,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to create location', 'LOCATION_CREATION_FAILED', 500);
    }
  }

  /**
   * Update location
   */
  async updateLocation(
    tenantId: string,
    locationId: string,
    updates: Partial<Omit<Location, 'id' | 'createdAt' | 'createdBy'>> & {
      updatedBy: string;
    }
  ): Promise<void> {
    try {
      const db = await getTenantDatabase(tenantId);

      const updateData: any = {
        ...updates,
        updatedAt: new Date(),
      };

      const result = await db.collection('locations').updateOne(
        { id: locationId },
        { $set: updateData }
      );

      if (result.matchedCount === 0) {
        throw new ApiError('Location not found', 'LOCATION_NOT_FOUND', 404);
      }

      logger.audit('Location updated', {
        tenantId,
        locationId,
        updatedBy: updates.updatedBy,
        updatedFields: Object.keys(updates).filter(key => key !== 'updatedBy'),
      });

    } catch (error) {
      logger.error('Failed to update location', {
        tenantId,
        locationId,
        updates,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError('Failed to update location', 'LOCATION_UPDATE_FAILED', 500);
    }
  }

  /**
   * Deactivate location
   */
  async deactivateLocation(
    tenantId: string,
    locationId: string,
    data: {
      reason?: string;
      deactivatedBy: string;
    }
  ): Promise<void> {
    try {
      const db = await getTenantDatabase(tenantId);

      // Check if this is the only active location
      const activeLocationCount = await db.collection('locations').countDocuments({
        isActive: true,
        id: { $ne: locationId }
      });

      if (activeLocationCount === 0) {
        throw new ApiError('Cannot deactivate the only active location', 'LAST_LOCATION_ERROR', 400);
      }

      const result = await db.collection('locations').updateOne(
        { id: locationId },
        {
          $set: {
            isActive: false,
            deactivatedAt: new Date(),
            deactivatedBy: data.deactivatedBy,
            deactivationReason: data.reason,
            updatedAt: new Date(),
          },
        }
      );

      if (result.matchedCount === 0) {
        throw new ApiError('Location not found', 'LOCATION_NOT_FOUND', 404);
      }

      logger.audit('Location deactivated', {
        tenantId,
        locationId,
        deactivatedBy: data.deactivatedBy,
        reason: data.reason,
      });

    } catch (error) {
      logger.error('Failed to deactivate location', {
        tenantId,
        locationId,
        data,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError('Failed to deactivate location', 'LOCATION_DEACTIVATION_FAILED', 500);
    }
  }

  /**
   * Reactivate location
   */
  async reactivateLocation(tenantId: string, locationId: string, reactivatedBy: string): Promise<void> {
    try {
      const db = await getTenantDatabase(tenantId);

      const result = await db.collection('locations').updateOne(
        { id: locationId },
        {
          $set: {
            isActive: true,
            updatedAt: new Date(),
          },
          $unset: {
            deactivatedAt: '',
            deactivatedBy: '',
            deactivationReason: '',
          },
        }
      );

      if (result.matchedCount === 0) {
        throw new ApiError('Location not found', 'LOCATION_NOT_FOUND', 404);
      }

      logger.audit('Location reactivated', {
        tenantId,
        locationId,
        reactivatedBy,
      });

    } catch (error) {
      logger.error('Failed to reactivate location', {
        tenantId,
        locationId,
        reactivatedBy,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError('Failed to reactivate location', 'LOCATION_REACTIVATION_FAILED', 500);
    }
  }

  /**
   * Check location limit for subscription
   */
  async checkLocationLimit(tenantId: string): Promise<{
    allowed: boolean;
    current: number;
    limit: number;
    message?: string;
  }> {
    try {
      // Get organization subscription details
      const organization = await getPlatformDatabase().collection('organizations').findOne({ tenantId });

      if (!organization) {
        throw new ApiError('Organization not found', 'ORGANIZATION_NOT_FOUND', 404);
      }

      const locationLimit = organization.subscription.maxLocations;

      // If unlimited
      if (locationLimit === -1 || locationLimit === 999) {
        return {
          allowed: true,
          current: 0,
          limit: -1,
        };
      }

      // Get current active location count
      const db = await getTenantDatabase(tenantId);
      const currentCount = await db.collection('locations').countDocuments({ isActive: true });

      const allowed = currentCount < locationLimit;

      return {
        allowed,
        current: currentCount,
        limit: locationLimit,
        message: allowed ? undefined : `Location limit reached (${currentCount}/${locationLimit}). Please upgrade your subscription.`,
      };

    } catch (error) {
      logger.error('Failed to check location limit', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError('Failed to check location limit', 'LOCATION_LIMIT_CHECK_FAILED', 500);
    }
  }

  /**
   * Get location statistics
   */
  async getLocationStats(tenantId: string, locationId: string, period: string = 'today'): Promise<LocationStats> {
    try {
      const db = await getTenantDatabase(tenantId);

      // Calculate date ranges
      const now = new Date();
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);

      const thisWeek = new Date(now);
      thisWeek.setDate(now.getDate() - now.getDay());
      thisWeek.setHours(0, 0, 0, 0);

      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Get order statistics
      const [
        todayOrders,
        weekOrders,
        monthOrders,
        todayRevenue,
        weekRevenue,
        monthRevenue,
        totalProducts,
        activeProducts,
        totalCustomers,
      ] = await Promise.all([
        // Order counts
        db.collection('orders').countDocuments({
          locationId,
          createdAt: { $gte: today }
        }),
        db.collection('orders').countDocuments({
          locationId,
          createdAt: { $gte: thisWeek }
        }),
        db.collection('orders').countDocuments({
          locationId,
          createdAt: { $gte: thisMonth }
        }),

        // Revenue aggregations
        this.getRevenueForPeriod(db, locationId, today),
        this.getRevenueForPeriod(db, locationId, thisWeek),
        this.getRevenueForPeriod(db, locationId, thisMonth),

        // Product counts
        db.collection('products').countDocuments({}),
        db.collection('products').countDocuments({ isActive: true }),

        // Customer count
        db.collection('customers').countDocuments({}),
      ]);

      return {
        orders: {
          today: todayOrders,
          thisWeek: weekOrders,
          thisMonth: monthOrders,
        },
        revenue: {
          today: todayRevenue,
          thisWeek: weekRevenue,
          thisMonth: monthRevenue,
        },
        products: {
          total: totalProducts,
          active: activeProducts,
        },
        customers: {
          total: totalCustomers,
          returning: 0, // Would calculate based on repeat orders
        },
      };

    } catch (error) {
      logger.error('Failed to get location statistics', {
        tenantId,
        locationId,
        period,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to retrieve location statistics', 'LOCATION_STATS_FAILED', 500);
    }
  }

  /**
   * Get location operating hours
   */
  async getLocationHours(tenantId: string, locationId: string): Promise<Location['settings']['businessHours'] | null> {
    try {
      const db = await getTenantDatabase(tenantId);

      const location = await db.collection('locations').findOne(
        { id: locationId },
        { projection: { 'settings.businessHours': 1 } }
      );

      if (!location) {
        return null;
      }

      return location.settings?.businessHours || null;

    } catch (error) {
      logger.error('Failed to get location hours', {
        tenantId,
        locationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to retrieve location hours', 'LOCATION_HOURS_FETCH_FAILED', 500);
    }
  }

  /**
   * Update location operating hours
   */
  async updateLocationHours(
    tenantId: string,
    locationId: string,
    hours: Location['settings']['businessHours'],
    updatedBy: string
  ): Promise<void> {
    try {
      const db = await getTenantDatabase(tenantId);

      const result = await db.collection('locations').updateOne(
        { id: locationId },
        {
          $set: {
            'settings.businessHours': hours,
            updatedAt: new Date(),
          },
        }
      );

      if (result.matchedCount === 0) {
        throw new ApiError('Location not found', 'LOCATION_NOT_FOUND', 404);
      }

      logger.audit('Location hours updated', {
        tenantId,
        locationId,
        updatedBy,
      });

    } catch (error) {
      logger.error('Failed to update location hours', {
        tenantId,
        locationId,
        updatedBy,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError('Failed to update location hours', 'LOCATION_HOURS_UPDATE_FAILED', 500);
    }
  }

  /**
   * Get all locations for a tenant (used by other services)
   */
  async getAllLocationIds(tenantId: string): Promise<string[]> {
    try {
      const db = await getTenantDatabase(tenantId);

      const locations = await db.collection('locations')
        .find({ isActive: true }, { projection: { id: 1 } })
        .toArray();

      return locations.map((loc: any) => loc.id);

    } catch (error) {
      logger.error('Failed to get all location IDs', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to retrieve location IDs', 'LOCATION_IDS_FETCH_FAILED', 500);
    }
  }

  /**
   * Validate location access for user
   */
  async validateLocationAccess(tenantId: string, locationId: string, userId: string): Promise<boolean> {
    try {
      // Get user's tenant membership
      const user = await getPlatformDatabase().collection('users').findOne(
        { id: userId },
        { projection: { tenantMemberships: 1, globalRole: 1 } }
      );

      if (!user) {
        return false;
      }

      // Super admins have access to all locations
      if (user.globalRole === 'super_admin') {
        return true;
      }

      // Find tenant membership
      const membership = user.tenantMemberships?.find((m: any) =>
        m.tenantId === tenantId && m.status === 'active'
      );

      if (!membership) {
        return false;
      }

      // Tenant owners and admins have access to all locations
      if (membership.role === 'tenant_owner' || membership.role === 'admin') {
        return true;
      }

      // Check specific location access
      const locationAccess = membership.locationAccess || [];
      return locationAccess.includes('*') || locationAccess.includes(locationId);

    } catch (error) {
      logger.error('Failed to validate location access', {
        tenantId,
        locationId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return false;
    }
  }

  /**
   * Get revenue for a specific period
   */
  private async getRevenueForPeriod(db: any, locationId: string, fromDate: Date): Promise<number> {
    const pipeline = [
      {
        $match: {
          locationId,
          createdAt: { $gte: fromDate },
          status: { $in: ['completed', 'paid'] }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$total' }
        }
      }
    ];

    const results = await db.collection('orders').aggregate(pipeline).toArray();
    return results.length > 0 ? results[0].totalRevenue : 0;
  }
}