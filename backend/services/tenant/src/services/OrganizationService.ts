// Organization service implementation

import { v4 as uuidv4 } from 'uuid';

import {
  logger,
  ApiError,
  getPlatformDatabase,
  cache,
  BusinessTypes,
  SubscriptionPlans,
} from '@properpos/backend-shared';

interface Organization {
  id: string;
  tenantId: string;
  name: string;
  businessType: BusinessTypes;
  subscription: {
    plan: SubscriptionPlans;
    status: 'active' | 'cancelled' | 'suspended' | 'trial' | 'past_due';
    trialStartsAt?: Date;
    trialEndsAt?: Date;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    maxLocations: number;
    maxUsers: number;
    features: string[];
    billingCycle: 'monthly' | 'yearly';
    amount: number;
    currency: string;
  };
  settings: {
    timezone: string;
    currency: string;
    language: string;
    businessHours: Record<string, any>;
    taxSettings: {
      defaultRate: number;
      inclusive: boolean;
      regions: Array<{
        name: string;
        rate: number;
      }>;
    };
    receiptSettings: {
      showLogo: boolean;
      footerText: string;
      includeQr: boolean;
    };
  };
  branding?: {
    logo?: string;
    name?: string;
    colors: {
      primary: string;
      secondary: string;
      accent: string;
    };
    fonts: {
      primary: string;
      secondary: string;
    };
    customCss?: string;
  };
  database: {
    name: string;
    connectionString: string;
  };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class OrganizationService {
  /**
   * Create new organization
   */
  async createOrganization(data: {
    name: string;
    businessType: BusinessTypes;
    ownerId: string;
    settings?: Partial<Organization['settings']>;
  }): Promise<Organization> {
    try {
      const tenantId = uuidv4();
      const organizationId = uuidv4();
      const databaseName = `tenant_${tenantId.replace(/-/g, '_')}`;

      const organization: Organization = {
        id: organizationId,
        tenantId,
        name: data.name,
        businessType: data.businessType,
        subscription: {
          plan: SubscriptionPlans.STARTER,
          status: 'trial',
          trialStartsAt: new Date(),
          trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          maxLocations: 1,
          maxUsers: 5,
          features: this.getDefaultFeatures(SubscriptionPlans.STARTER),
          billingCycle: 'monthly',
          amount: 0, // Trial is free
          currency: 'USD',
        },
        settings: {
          timezone: 'UTC',
          currency: 'USD',
          language: 'en',
          businessHours: this.getDefaultBusinessHours(),
          taxSettings: {
            defaultRate: 0,
            inclusive: false,
            regions: [],
          },
          receiptSettings: {
            showLogo: true,
            footerText: 'Thank you for your business!',
            includeQr: false,
          },
          ...data.settings,
        },
        database: {
          name: databaseName,
          connectionString: `mongodb+srv://cluster/${databaseName}`,
        },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Insert into database
      await getPlatformDatabase().collection('organizations').insertOne(organization);

      // Cache organization data
      await cache.set(
        `tenant:${tenantId}`,
        JSON.stringify(organization),
        24 * 60 * 60 // 24 hours
      );

      logger.audit('Organization created', {
        organizationId: organization.id,
        tenantId,
        name: data.name,
        businessType: data.businessType,
        ownerId: data.ownerId,
      });

      return organization;

    } catch (error) {
      logger.error('Failed to create organization', {
        name: data.name,
        businessType: data.businessType,
        ownerId: data.ownerId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to create organization', 'ORGANIZATION_CREATION_FAILED', 500);
    }
  }

  /**
   * Get organization by ID
   */
  async getOrganizationById(organizationId: string): Promise<Organization | null> {
    try {
      const organization = await getPlatformDatabase().collection('organizations').findOne({
        id: organizationId
      });

      return organization as Organization | null;

    } catch (error) {
      logger.error('Failed to get organization by ID', {
        organizationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to retrieve organization', 'ORGANIZATION_FETCH_FAILED', 500);
    }
  }

  /**
   * Get organization by tenant ID
   */
  async getOrganizationByTenantId(tenantId: string): Promise<Organization | null> {
    try {
      const organization = await getPlatformDatabase().collection('organizations').findOne({
        tenantId
      });

      return organization as Organization | null;

    } catch (error) {
      logger.error('Failed to get organization by tenant ID', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to retrieve organization', 'ORGANIZATION_FETCH_FAILED', 500);
    }
  }

  /**
   * Update organization
   */
  async updateOrganization(
    organizationId: string,
    updates: Partial<Pick<Organization, 'name' | 'businessType' | 'settings' | 'branding'>>,
    updatedBy: string
  ): Promise<void> {
    try {
      const updateData: any = {
        ...updates,
        updatedAt: new Date(),
      };

      const result = await getPlatformDatabase().collection('organizations').updateOne(
        { id: organizationId },
        { $set: updateData }
      );

      if (result.matchedCount === 0) {
        throw new ApiError('Organization not found', 'ORGANIZATION_NOT_FOUND', 404);
      }

      // Clear cache
      const organization = await this.getOrganizationById(organizationId);
      if (organization) {
        await cache.del(`tenant:${organization.tenantId}`);
      }

      logger.audit('Organization updated', {
        organizationId,
        updatedBy,
        updatedFields: Object.keys(updates),
      });

    } catch (error) {
      logger.error('Failed to update organization', {
        organizationId,
        updatedBy,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError('Failed to update organization', 'ORGANIZATION_UPDATE_FAILED', 500);
    }
  }

  /**
   * Suspend organization
   */
  async suspendOrganization(organizationId: string, reason: string, suspendedBy: string): Promise<void> {
    try {
      const result = await getPlatformDatabase().collection('organizations').updateOne(
        { id: organizationId },
        {
          $set: {
            'subscription.status': 'suspended',
            'subscription.suspensionReason': reason,
            'subscription.suspendedAt': new Date(),
            'subscription.suspendedBy': suspendedBy,
            updatedAt: new Date(),
          },
        }
      );

      if (result.matchedCount === 0) {
        throw new ApiError('Organization not found', 'ORGANIZATION_NOT_FOUND', 404);
      }

      // Clear cache
      const organization = await this.getOrganizationById(organizationId);
      if (organization) {
        await cache.del(`tenant:${organization.tenantId}`);
      }

      logger.audit('Organization suspended', {
        organizationId,
        suspendedBy,
        reason,
      });

    } catch (error) {
      logger.error('Failed to suspend organization', {
        organizationId,
        suspendedBy,
        reason,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError('Failed to suspend organization', 'ORGANIZATION_SUSPENSION_FAILED', 500);
    }
  }

  /**
   * Reactivate organization
   */
  async reactivateOrganization(organizationId: string, reactivatedBy: string): Promise<void> {
    try {
      const result = await getPlatformDatabase().collection('organizations').updateOne(
        { id: organizationId },
        {
          $set: {
            'subscription.status': 'active',
            updatedAt: new Date(),
          },
          $unset: {
            'subscription.suspensionReason': '',
            'subscription.suspendedAt': '',
            'subscription.suspendedBy': '',
          },
        }
      );

      if (result.matchedCount === 0) {
        throw new ApiError('Organization not found', 'ORGANIZATION_NOT_FOUND', 404);
      }

      // Clear cache
      const organization = await this.getOrganizationById(organizationId);
      if (organization) {
        await cache.del(`tenant:${organization.tenantId}`);
      }

      logger.audit('Organization reactivated', {
        organizationId,
        reactivatedBy,
      });

    } catch (error) {
      logger.error('Failed to reactivate organization', {
        organizationId,
        reactivatedBy,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError('Failed to reactivate organization', 'ORGANIZATION_REACTIVATION_FAILED', 500);
    }
  }

  /**
   * Delete organization
   */
  async deleteOrganization(organizationId: string, deletedBy: string): Promise<void> {
    try {
      // Get organization first
      const organization = await this.getOrganizationById(organizationId);
      if (!organization) {
        throw new ApiError('Organization not found', 'ORGANIZATION_NOT_FOUND', 404);
      }

      // In a real implementation, you'd:
      // 1. Cancel subscriptions
      // 2. Archive data
      // 3. Remove tenant database
      // 4. Clean up all related records

      // For now, just mark as inactive
      await getPlatformDatabase().collection('organizations').updateOne(
        { id: organizationId },
        {
          $set: {
            isActive: false,
            deletedAt: new Date(),
            deletedBy,
            updatedAt: new Date(),
          },
        }
      );

      // Clear cache
      await cache.del(`tenant:${organization.tenantId}`);

      logger.audit('Organization deleted', {
        organizationId,
        tenantId: organization.tenantId,
        deletedBy,
      });

    } catch (error) {
      logger.error('Failed to delete organization', {
        organizationId,
        deletedBy,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError('Failed to delete organization', 'ORGANIZATION_DELETION_FAILED', 500);
    }
  }

  /**
   * Get organizations (admin endpoint)
   */
  async getOrganizations(filters: {
    page: number;
    limit: number;
    search?: string;
    businessType?: BusinessTypes;
    subscriptionStatus?: string;
    subscriptionPlan?: SubscriptionPlans;
  }): Promise<{
    data: Organization[];
    meta: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasMore: boolean;
    };
  }> {
    try {
      const { page, limit, search, businessType, subscriptionStatus, subscriptionPlan } = filters;
      const skip = (page - 1) * limit;

      // Build query
      const query: any = { isActive: true };

      if (search) {
        query.name = { $regex: search, $options: 'i' };
      }

      if (businessType) {
        query.businessType = businessType;
      }

      if (subscriptionStatus) {
        query['subscription.status'] = subscriptionStatus;
      }

      if (subscriptionPlan) {
        query['subscription.plan'] = subscriptionPlan;
      }

      // Get total count
      const totalCount = await getPlatformDatabase().collection('organizations').countDocuments(query);

      // Get organizations
      const organizations = await getPlatformDatabase().collection('organizations')
        .find(query)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .toArray();

      const totalPages = Math.ceil(totalCount / limit);

      return {
        data: organizations as Organization[],
        meta: {
          page,
          limit,
          total: totalCount,
          totalPages,
          hasMore: page < totalPages,
        },
      };

    } catch (error) {
      logger.error('Failed to get organizations', {
        filters,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to retrieve organizations', 'ORGANIZATIONS_FETCH_FAILED', 500);
    }
  }

  /**
   * Get organization statistics
   */
  async getOrganizationStats(): Promise<{
    total: number;
    byBusinessType: Record<string, number>;
    bySubscriptionStatus: Record<string, number>;
    bySubscriptionPlan: Record<string, number>;
    trialExpiringSoon: number;
  }> {
    try {
      const [
        totalResult,
        businessTypeResults,
        subscriptionStatusResults,
        subscriptionPlanResults,
        trialExpiringResults,
      ] = await Promise.all([
        getPlatformDatabase().collection('organizations').countDocuments({ isActive: true }),

        getPlatformDatabase().collection('organizations').aggregate([
          { $match: { isActive: true } },
          { $group: { _id: '$businessType', count: { $sum: 1 } } }
        ]).toArray(),

        getPlatformDatabase().collection('organizations').aggregate([
          { $match: { isActive: true } },
          { $group: { _id: '$subscription.status', count: { $sum: 1 } } }
        ]).toArray(),

        getPlatformDatabase().collection('organizations').aggregate([
          { $match: { isActive: true } },
          { $group: { _id: '$subscription.plan', count: { $sum: 1 } } }
        ]).toArray(),

        getPlatformDatabase().collection('organizations').countDocuments({
          isActive: true,
          'subscription.status': 'trial',
          'subscription.trialEndsAt': {
            $gte: new Date(),
            $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // Next 7 days
          }
        })
      ]);

      // Format results
      const byBusinessType: Record<string, number> = {};
      businessTypeResults.forEach((result: any) => {
        byBusinessType[result._id] = result.count;
      });

      const bySubscriptionStatus: Record<string, number> = {};
      subscriptionStatusResults.forEach((result: any) => {
        bySubscriptionStatus[result._id] = result.count;
      });

      const bySubscriptionPlan: Record<string, number> = {};
      subscriptionPlanResults.forEach((result: any) => {
        bySubscriptionPlan[result._id] = result.count;
      });

      return {
        total: totalResult,
        byBusinessType,
        bySubscriptionStatus,
        bySubscriptionPlan,
        trialExpiringSoon: trialExpiringResults,
      };

    } catch (error) {
      logger.error('Failed to get organization statistics', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to retrieve organization statistics', 'ORGANIZATION_STATS_FAILED', 500);
    }
  }

  /**
   * Get default features for subscription plan
   */
  private getDefaultFeatures(plan: SubscriptionPlans): string[] {
    const features: Record<SubscriptionPlans, string[]> = {
      [SubscriptionPlans.STARTER]: [
        'basic_pos',
        'inventory_management',
        'basic_reports',
        'single_location',
        'up_to_5_users'
      ],
      [SubscriptionPlans.PROFESSIONAL]: [
        'advanced_pos',
        'inventory_management',
        'advanced_reports',
        'multi_location',
        'up_to_25_users',
        'customer_management',
        'loyalty_program',
        'integrations'
      ],
      [SubscriptionPlans.ENTERPRISE]: [
        'enterprise_pos',
        'advanced_inventory',
        'custom_reports',
        'unlimited_locations',
        'unlimited_users',
        'advanced_customer_management',
        'advanced_loyalty',
        'all_integrations',
        'api_access',
        'white_label',
        'priority_support'
      ],
    };

    return features[plan] || features[SubscriptionPlans.STARTER];
  }

  /**
   * Get default business hours
   */
  private getDefaultBusinessHours(): Record<string, any> {
    const defaultHours = {
      open: '09:00',
      close: '17:00',
      closed: false,
    };

    return {
      monday: { ...defaultHours },
      tuesday: { ...defaultHours },
      wednesday: { ...defaultHours },
      thursday: { ...defaultHours },
      friday: { ...defaultHours },
      saturday: { ...defaultHours, open: '10:00', close: '16:00' },
      sunday: { ...defaultHours, open: '12:00', close: '16:00' },
    };
  }
}