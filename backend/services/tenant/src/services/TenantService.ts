// Tenant service implementation

import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

import {
  logger,
  ApiError,
  getPlatformDatabase,
  getTenantDatabase,
  cache,
  UserRoles,
  BusinessTypes,
  SubscriptionPlans,
} from '@properpos/backend-shared';

interface TenantMember {
  id: string;
  email: string;
  profile: {
    firstName: string;
    lastName: string;
    avatar?: string;
  };
  role: UserRoles;
  permissions: string[];
  locationAccess: string[];
  status: 'active' | 'suspended' | 'pending';
  joinedAt: Date;
  lastActiveAt?: Date;
}

interface TenantInvitation {
  id: string;
  email: string;
  role: UserRoles;
  permissions: string[];
  locationAccess: string[];
  invitedBy: string;
  expiresAt: Date;
}

interface TenantActivity {
  id: string;
  action: string;
  description: string;
  userId?: string;
  userName?: string;
  metadata?: any;
  timestamp: Date;
  ipAddress?: string;
}

interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export class TenantService {
  /**
   * Get tenant by ID
   */
  async getTenantById(tenantId: string): Promise<any | null> {
    try {
      // Try cache first
      const cacheKey = `tenant:${tenantId}`;
      const cached = await cache.get(cacheKey);

      if (cached) {
        return cached;
      }

      // Get from database
      const tenant = await getPlatformDatabase().collection('organizations').findOne({ tenantId });

      if (!tenant) {
        return null;
      }

      // Format for response
      const tenantData = {
        id: tenant.id,
        tenantId: tenant.tenantId,
        name: tenant.name,
        businessType: tenant.businessType,
        subscription: tenant.subscription,
        settings: tenant.settings,
        branding: tenant.branding || {},
        database: {
          name: tenant.database.name,
          // Don't expose connection string for security
        },
        isActive: tenant.isActive,
        createdAt: tenant.createdAt,
        updatedAt: tenant.updatedAt,
      };

      // Cache for 30 minutes
      await cache.set(cacheKey, JSON.stringify(tenantData), 30 * 60);

      return tenantData;

    } catch (error) {
      logger.error('Failed to get tenant by ID', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to retrieve tenant information', 'TENANT_FETCH_FAILED', 500);
    }
  }

  /**
   * Get tenant settings
   */
  async getTenantSettings(tenantId: string): Promise<any> {
    try {
      const tenant = await getPlatformDatabase().collection('organizations').findOne(
        { tenantId },
        { projection: { settings: 1 } }
      );

      if (!tenant) {
        throw new ApiError('Tenant not found', 'TENANT_NOT_FOUND', 404);
      }

      return tenant.settings || {};

    } catch (error) {
      logger.error('Failed to get tenant settings', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError('Failed to retrieve tenant settings', 'SETTINGS_FETCH_FAILED', 500);
    }
  }

  /**
   * Update tenant settings
   */
  async updateTenantSettings(tenantId: string, settings: any, updatedBy: string): Promise<void> {
    try {
      // Validate settings structure
      const validSettings = this.validateSettings(settings);

      const result = await getPlatformDatabase().collection('organizations').updateOne(
        { tenantId },
        {
          $set: {
            settings: validSettings,
            updatedAt: new Date(),
          },
        }
      );

      if (result.matchedCount === 0) {
        throw new ApiError('Tenant not found', 'TENANT_NOT_FOUND', 404);
      }

      // Clear cache
      await cache.del(`tenant:${tenantId}`);

      // Log activity
      await this.logTenantActivity(tenantId, {
        action: 'settings_updated',
        description: 'Tenant settings were updated',
        userId: updatedBy,
        metadata: { updatedFields: Object.keys(settings) },
      });

      logger.audit('Tenant settings updated', {
        tenantId,
        updatedBy,
        updatedFields: Object.keys(settings),
      });

    } catch (error) {
      logger.error('Failed to update tenant settings', {
        tenantId,
        updatedBy,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError('Failed to update tenant settings', 'SETTINGS_UPDATE_FAILED', 500);
    }
  }

  /**
   * Get tenant branding
   */
  async getTenantBranding(tenantId: string): Promise<any> {
    try {
      const tenant = await getPlatformDatabase().collection('organizations').findOne(
        { tenantId },
        { projection: { branding: 1 } }
      );

      if (!tenant) {
        throw new ApiError('Tenant not found', 'TENANT_NOT_FOUND', 404);
      }

      return tenant.branding || {
        logo: null,
        name: null,
        colors: {
          primary: '#4F46E5',
          secondary: '#10B981',
          accent: '#F59E0B',
        },
        fonts: {
          primary: 'Inter, sans-serif',
          secondary: 'Inter, sans-serif',
        },
        customCss: null,
      };

    } catch (error) {
      logger.error('Failed to get tenant branding', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError('Failed to retrieve tenant branding', 'BRANDING_FETCH_FAILED', 500);
    }
  }

  /**
   * Update tenant branding
   */
  async updateTenantBranding(tenantId: string, branding: any, updatedBy: string): Promise<void> {
    try {
      const result = await getPlatformDatabase().collection('organizations').updateOne(
        { tenantId },
        {
          $set: {
            branding,
            updatedAt: new Date(),
          },
        }
      );

      if (result.matchedCount === 0) {
        throw new ApiError('Tenant not found', 'TENANT_NOT_FOUND', 404);
      }

      // Clear cache
      await cache.del(`tenant:${tenantId}`);

      // Log activity
      await this.logTenantActivity(tenantId, {
        action: 'branding_updated',
        description: 'Tenant branding was updated',
        userId: updatedBy,
        metadata: { updatedFields: Object.keys(branding) },
      });

    } catch (error) {
      logger.error('Failed to update tenant branding', {
        tenantId,
        updatedBy,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError('Failed to update tenant branding', 'BRANDING_UPDATE_FAILED', 500);
    }
  }

  /**
   * Save logo file
   */
  async saveLogo(tenantId: string, filename: string, imageBuffer: Buffer): Promise<string> {
    try {
      // In production, you'd upload to S3/CloudStorage
      // For now, save locally
      const uploadDir = path.join(process.cwd(), 'uploads', 'logos');

      // Ensure directory exists
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const filePath = path.join(uploadDir, filename);
      fs.writeFileSync(filePath, imageBuffer);

      // Return URL (in production, this would be the CDN URL)
      const logoUrl = `/uploads/logos/${filename}`;

      return logoUrl;

    } catch (error) {
      logger.error('Failed to save logo', {
        tenantId,
        filename,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to save logo', 'LOGO_SAVE_FAILED', 500);
    }
  }

  /**
   * Get tenant members
   */
  async getTenantMembers(
    tenantId: string,
    options: {
      page: number;
      limit: number;
      search?: string;
      role?: string;
      status?: string;
    }
  ): Promise<PaginatedResult<TenantMember>> {
    try {
      const { page, limit, search, role, status } = options;
      const skip = (page - 1) * limit;

      // Build query
      const matchQuery: any = {
        'tenantMemberships.tenantId': tenantId,
      };

      if (status) {
        matchQuery['tenantMemberships.status'] = status;
      }

      if (role) {
        matchQuery['tenantMemberships.role'] = role;
      }

      if (search) {
        matchQuery.$or = [
          { email: { $regex: search, $options: 'i' } },
          { 'profile.firstName': { $regex: search, $options: 'i' } },
          { 'profile.lastName': { $regex: search, $options: 'i' } },
        ];
      }

      // Get total count
      const totalCount = await getPlatformDatabase().collection('users').countDocuments(matchQuery);

      // Get users
      const users = await getPlatformDatabase().collection('users')
        .find(matchQuery)
        .skip(skip)
        .limit(limit)
        .sort({ 'profile.firstName': 1, 'profile.lastName': 1 })
        .toArray();

      // Format response
      const members: TenantMember[] = users.map((user: any) => {
        const membership = user.tenantMemberships.find((m: any) => m.tenantId === tenantId);

        return {
          id: user.id,
          email: user.email,
          profile: user.profile,
          role: membership.role,
          permissions: membership.permissions,
          locationAccess: membership.locationAccess,
          status: membership.status,
          joinedAt: membership.joinedAt,
          lastActiveAt: user.lastActiveAt,
        };
      });

      const totalPages = Math.ceil(totalCount / limit);

      return {
        data: members,
        meta: {
          page,
          limit,
          total: totalCount,
          totalPages,
          hasMore: page < totalPages,
        },
      };

    } catch (error) {
      logger.error('Failed to get tenant members', {
        tenantId,
        options,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to retrieve tenant members', 'MEMBERS_FETCH_FAILED', 500);
    }
  }

  /**
   * Invite user to tenant
   */
  async inviteUserToTenant(data: {
    tenantId: string;
    email: string;
    role: UserRoles;
    permissions: string[];
    locationAccess: string[];
    invitedBy: string;
  }): Promise<TenantInvitation> {
    try {
      // Check if user already exists and has membership
      const existingUser = await getPlatformDatabase().collection('users').findOne({
        email: data.email.toLowerCase(),
        'tenantMemberships.tenantId': data.tenantId
      });

      if (existingUser) {
        throw new ApiError('User is already a member of this tenant', 'USER_ALREADY_MEMBER', 409);
      }

      // Check for existing pending invitation
      const existingInvitation = await getPlatformDatabase().collection('tenant_invitations').findOne({
        tenantId: data.tenantId,
        email: data.email.toLowerCase(),
        status: 'pending',
        expiresAt: { $gt: new Date() }
      });

      if (existingInvitation) {
        throw new ApiError('An invitation is already pending for this email', 'INVITATION_EXISTS', 409);
      }

      // Create invitation
      const invitation: TenantInvitation = {
        id: uuidv4(),
        email: data.email.toLowerCase(),
        role: data.role,
        permissions: data.permissions,
        locationAccess: data.locationAccess,
        invitedBy: data.invitedBy,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      };

      await getPlatformDatabase().collection('tenant_invitations').insertOne({
        ...invitation,
        tenantId: data.tenantId,
        status: 'pending',
        createdAt: new Date(),
      });

      // Send invitation email (handled by notification service)
      // await this.sendInvitationEmail(invitation);

      // Log activity
      await this.logTenantActivity(data.tenantId, {
        action: 'user_invited',
        description: `User ${data.email} was invited to join the tenant`,
        userId: data.invitedBy,
        metadata: { invitedEmail: data.email, role: data.role },
      });

      return invitation;

    } catch (error) {
      logger.error('Failed to invite user to tenant', {
        tenantId: data.tenantId,
        email: data.email,
        invitedBy: data.invitedBy,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError('Failed to send invitation', 'INVITATION_FAILED', 500);
    }
  }

  /**
   * Update member role
   */
  async updateMemberRole(
    tenantId: string,
    userId: string,
    data: {
      role: UserRoles;
      permissions: string[];
      locationAccess: string[];
      updatedBy: string;
    }
  ): Promise<void> {
    try {
      const result = await getPlatformDatabase().collection('users').updateOne(
        {
          id: userId,
          'tenantMemberships.tenantId': tenantId,
        },
        {
          $set: {
            'tenantMemberships.$.role': data.role,
            'tenantMemberships.$.permissions': data.permissions,
            'tenantMemberships.$.locationAccess': data.locationAccess,
            updatedAt: new Date(),
          },
        }
      );

      if (result.matchedCount === 0) {
        throw new ApiError('User not found or not a member of this tenant', 'USER_NOT_FOUND', 404);
      }

      // Log activity
      await this.logTenantActivity(tenantId, {
        action: 'member_role_updated',
        description: `User role was updated to ${data.role}`,
        userId: data.updatedBy,
        metadata: { targetUserId: userId, newRole: data.role },
      });

    } catch (error) {
      logger.error('Failed to update member role', {
        tenantId,
        userId,
        updatedBy: data.updatedBy,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError('Failed to update member role', 'ROLE_UPDATE_FAILED', 500);
    }
  }

  /**
   * Suspend member
   */
  async suspendMember(
    tenantId: string,
    userId: string,
    data: {
      reason: string;
      suspendedBy: string;
    }
  ): Promise<void> {
    try {
      const result = await getPlatformDatabase().collection('users').updateOne(
        {
          id: userId,
          'tenantMemberships.tenantId': tenantId,
        },
        {
          $set: {
            'tenantMemberships.$.status': 'suspended',
            'tenantMemberships.$.suspensionReason': data.reason,
            'tenantMemberships.$.suspendedAt': new Date(),
            'tenantMemberships.$.suspendedBy': data.suspendedBy,
            updatedAt: new Date(),
          },
        }
      );

      if (result.matchedCount === 0) {
        throw new ApiError('User not found or not a member of this tenant', 'USER_NOT_FOUND', 404);
      }

      // Log activity
      await this.logTenantActivity(tenantId, {
        action: 'member_suspended',
        description: `User was suspended: ${data.reason}`,
        userId: data.suspendedBy,
        metadata: { targetUserId: userId, reason: data.reason },
      });

    } catch (error) {
      logger.error('Failed to suspend member', {
        tenantId,
        userId,
        suspendedBy: data.suspendedBy,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError('Failed to suspend member', 'SUSPENSION_FAILED', 500);
    }
  }

  /**
   * Reactivate member
   */
  async reactivateMember(tenantId: string, userId: string, reactivatedBy: string): Promise<void> {
    try {
      const result = await getPlatformDatabase().collection('users').updateOne(
        {
          id: userId,
          'tenantMemberships.tenantId': tenantId,
        },
        {
          $set: {
            'tenantMemberships.$.status': 'active',
            updatedAt: new Date(),
          },
          $unset: {
            'tenantMemberships.$.suspensionReason': '',
            'tenantMemberships.$.suspendedAt': '',
            'tenantMemberships.$.suspendedBy': '',
          },
        }
      );

      if (result.matchedCount === 0) {
        throw new ApiError('User not found or not a member of this tenant', 'USER_NOT_FOUND', 404);
      }

      // Log activity
      await this.logTenantActivity(tenantId, {
        action: 'member_reactivated',
        description: 'User was reactivated',
        userId: reactivatedBy,
        metadata: { targetUserId: userId },
      });

    } catch (error) {
      logger.error('Failed to reactivate member', {
        tenantId,
        userId,
        reactivatedBy,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError('Failed to reactivate member', 'REACTIVATION_FAILED', 500);
    }
  }

  /**
   * Get tenant activity
   */
  async getTenantActivity(
    tenantId: string,
    options: {
      page: number;
      limit: number;
      action?: string;
      userId?: string;
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<PaginatedResult<TenantActivity>> {
    try {
      const { page, limit, action, userId, startDate, endDate } = options;
      const skip = (page - 1) * limit;

      // Build query
      const matchQuery: any = { tenantId };

      if (action) {
        matchQuery.action = action;
      }

      if (userId) {
        matchQuery.userId = userId;
      }

      if (startDate || endDate) {
        matchQuery.timestamp = {};
        if (startDate) matchQuery.timestamp.$gte = startDate;
        if (endDate) matchQuery.timestamp.$lte = endDate;
      }

      // Get total count
      const totalCount = await getPlatformDatabase().collection('tenant_activity').countDocuments(matchQuery);

      // Get activities
      const activities = await getPlatformDatabase().collection('tenant_activity')
        .find(matchQuery)
        .skip(skip)
        .limit(limit)
        .sort({ timestamp: -1 })
        .toArray();

      const totalPages = Math.ceil(totalCount / limit);

      return {
        data: activities as TenantActivity[],
        meta: {
          page,
          limit,
          total: totalCount,
          totalPages,
          hasMore: page < totalPages,
        },
      };

    } catch (error) {
      logger.error('Failed to get tenant activity', {
        tenantId,
        options,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to retrieve tenant activity', 'ACTIVITY_FETCH_FAILED', 500);
    }
  }

  /**
   * Get tenant statistics
   */
  async getTenantStats(tenantId: string): Promise<any> {
    try {
      // Get tenant database connection
      const db = await getTenantDatabase(tenantId);

      // Run aggregation pipelines to get stats
      const [
        memberStats,
        locationStats,
        orderStats,
        revenueStats,
      ] = await Promise.all([
        this.getMemberStats(tenantId),
        this.getLocationStats(db),
        this.getOrderStats(db),
        this.getRevenueStats(db),
      ]);

      return {
        members: memberStats,
        locations: locationStats,
        orders: orderStats,
        revenue: revenueStats,
        lastUpdated: new Date().toISOString(),
      };

    } catch (error) {
      logger.error('Failed to get tenant stats', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to retrieve tenant statistics', 'STATS_FETCH_FAILED', 500);
    }
  }

  /**
   * Log tenant activity
   */
  private async logTenantActivity(tenantId: string, activity: {
    action: string;
    description: string;
    userId?: string;
    metadata?: any;
    ipAddress?: string;
  }): Promise<void> {
    try {
      const activityLog = {
        id: uuidv4(),
        tenantId,
        ...activity,
        timestamp: new Date(),
      };

      await getPlatformDatabase().collection('tenant_activity').insertOne(activityLog);

    } catch (error) {
      logger.error('Failed to log tenant activity', {
        tenantId,
        activity,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Don't throw error - logging shouldn't break the main operation
    }
  }

  /**
   * Validate settings structure
   */
  private validateSettings(settings: any): any {
    const validSettings: any = {};

    // Validate and set timezone
    if (settings.timezone) {
      // In production, validate against known timezones
      validSettings.timezone = settings.timezone;
    }

    // Validate and set currency
    if (settings.currency) {
      // In production, validate against supported currencies
      validSettings.currency = settings.currency;
    }

    // Validate and set language
    if (settings.language) {
      validSettings.language = settings.language;
    }

    // Validate business hours
    if (settings.businessHours) {
      validSettings.businessHours = settings.businessHours;
    }

    return validSettings;
  }

  /**
   * Get member statistics
   */
  private async getMemberStats(tenantId: string): Promise<any> {
    const pipeline = [
      {
        $match: { 'tenantMemberships.tenantId': tenantId }
      },
      {
        $unwind: '$tenantMemberships'
      },
      {
        $match: { 'tenantMemberships.tenantId': tenantId }
      },
      {
        $group: {
          _id: '$tenantMemberships.status',
          count: { $sum: 1 }
        }
      }
    ];

    const results = await getPlatformDatabase().collection('users').aggregate(pipeline).toArray();

    const stats = {
      total: 0,
      active: 0,
      suspended: 0,
      pending: 0,
    };

    results.forEach((result: any) => {
      stats.total += result.count;
      stats[result._id as keyof typeof stats] = result.count;
    });

    return stats;
  }

  /**
   * Get location statistics
   */
  private async getLocationStats(db: any): Promise<any> {
    const totalLocations = await db.collection('locations').countDocuments({});
    const activeLocations = await db.collection('locations').countDocuments({ isActive: true });

    return {
      total: totalLocations,
      active: activeLocations,
      inactive: totalLocations - activeLocations,
    };
  }

  /**
   * Get order statistics
   */
  private async getOrderStats(db: any): Promise<any> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [todayOrders, totalOrders] = await Promise.all([
      db.collection('orders').countDocuments({
        createdAt: { $gte: today }
      }),
      db.collection('orders').countDocuments({})
    ]);

    return {
      today: todayOrders,
      total: totalOrders,
    };
  }

  /**
   * Get revenue statistics
   */
  private async getRevenueStats(db: any): Promise<any> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const pipeline = [
      {
        $group: {
          _id: null,
          todayRevenue: {
            $sum: {
              $cond: [
                { $gte: ['$createdAt', today] },
                '$total',
                0
              ]
            }
          },
          totalRevenue: { $sum: '$total' }
        }
      }
    ];

    const results = await db.collection('orders').aggregate(pipeline).toArray();

    if (results.length === 0) {
      return {
        today: 0,
        total: 0,
      };
    }

    return {
      today: results[0].todayRevenue || 0,
      total: results[0].totalRevenue || 0,
    };
  }
}