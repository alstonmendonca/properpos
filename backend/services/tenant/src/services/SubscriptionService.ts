// Subscription service implementation

import { v4 as uuidv4 } from 'uuid';

import {
  logger,
  ApiError,
  getPlatformDatabase,
  getTenantDatabase,
  cache,
  SubscriptionPlans,
} from '@properpos/backend-shared';

interface Subscription {
  id: string;
  tenantId: string;
  organizationId: string;
  plan: SubscriptionPlans;
  status: 'active' | 'cancelled' | 'suspended' | 'trial' | 'past_due';
  billingCycle: 'monthly' | 'yearly';
  amount: number;
  currency: string;
  trialStartsAt?: Date;
  trialEndsAt?: Date;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  maxLocations: number;
  maxUsers: number;
  features: string[];
  paymentMethodId?: string;
  stripeSubscriptionId?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface PlanDetails {
  id: SubscriptionPlans;
  name: string;
  description: string;
  features: string[];
  limits: {
    locations: number;
    users: number;
    products: number;
    orders: number;
  };
  pricing: {
    monthly: number;
    yearly: number;
  };
  popular?: boolean;
}

export class SubscriptionService {
  /**
   * Get subscription by tenant ID
   */
  async getSubscriptionByTenantId(tenantId: string): Promise<Subscription | null> {
    try {
      // Get organization first
      const organization = await getPlatformDatabase().collection('organizations').findOne({ tenantId });

      if (!organization) {
        return null;
      }

      // Format subscription data from organization
      const subscription: Subscription = {
        id: organization.id,
        tenantId: organization.tenantId,
        organizationId: organization.id,
        plan: organization.subscription.plan,
        status: organization.subscription.status,
        billingCycle: organization.subscription.billingCycle,
        amount: organization.subscription.amount,
        currency: organization.subscription.currency,
        trialStartsAt: organization.subscription.trialStartsAt,
        trialEndsAt: organization.subscription.trialEndsAt,
        currentPeriodStart: organization.subscription.currentPeriodStart,
        currentPeriodEnd: organization.subscription.currentPeriodEnd,
        maxLocations: organization.subscription.maxLocations,
        maxUsers: organization.subscription.maxUsers,
        features: organization.subscription.features,
        paymentMethodId: organization.subscription.paymentMethodId,
        stripeSubscriptionId: organization.subscription.stripeSubscriptionId,
        createdAt: organization.createdAt,
        updatedAt: organization.updatedAt,
      };

      return subscription;

    } catch (error) {
      logger.error('Failed to get subscription by tenant ID', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to retrieve subscription', 'SUBSCRIPTION_FETCH_FAILED', 500);
    }
  }

  /**
   * Get available subscription plans
   */
  async getAvailablePlans(): Promise<PlanDetails[]> {
    const plans: PlanDetails[] = [
      {
        id: SubscriptionPlans.STARTER,
        name: 'Starter',
        description: 'Perfect for small businesses just getting started',
        features: [
          'Basic POS functionality',
          'Inventory management',
          'Basic reports',
          'Single location',
          'Up to 5 users',
          'Email support'
        ],
        limits: {
          locations: 1,
          users: 5,
          products: 1000,
          orders: 10000,
        },
        pricing: {
          monthly: 29,
          yearly: 290, // 2 months free
        },
      },
      {
        id: SubscriptionPlans.PROFESSIONAL,
        name: 'Professional',
        description: 'Ideal for growing businesses with multiple locations',
        features: [
          'Advanced POS features',
          'Advanced inventory management',
          'Advanced reporting & analytics',
          'Multi-location support',
          'Up to 25 users',
          'Customer management',
          'Loyalty programs',
          'Third-party integrations',
          'Priority support'
        ],
        limits: {
          locations: 10,
          users: 25,
          products: 10000,
          orders: 100000,
        },
        pricing: {
          monthly: 79,
          yearly: 790,
        },
        popular: true,
      },
      {
        id: SubscriptionPlans.ENTERPRISE,
        name: 'Enterprise',
        description: 'Advanced features for large organizations',
        features: [
          'All Professional features',
          'Unlimited locations',
          'Unlimited users',
          'Custom reporting',
          'Advanced customer management',
          'Advanced loyalty programs',
          'All integrations',
          'API access',
          'White-label options',
          'Dedicated support',
          'Custom training'
        ],
        limits: {
          locations: -1, // Unlimited
          users: -1, // Unlimited
          products: -1, // Unlimited
          orders: -1, // Unlimited
        },
        pricing: {
          monthly: 199,
          yearly: 1990,
        },
      },
    ];

    return plans;
  }

  /**
   * Upgrade subscription
   */
  async upgradeSubscription(data: {
    tenantId: string;
    newPlan: SubscriptionPlans;
    billingCycle: 'monthly' | 'yearly';
    paymentMethodId?: string;
    upgradedBy: string;
  }): Promise<{
    previousPlan: SubscriptionPlans;
    newPlan: SubscriptionPlans;
    effectiveDate: Date;
    prorationAmount?: number;
  }> {
    try {
      // Get current organization/subscription
      const organization = await getPlatformDatabase().collection('organizations').findOne({
        tenantId: data.tenantId
      });

      if (!organization) {
        throw new ApiError('Organization not found', 'ORGANIZATION_NOT_FOUND', 404);
      }

      const previousPlan = organization.subscription.plan;
      const planDetails = await this.getPlanDetails(data.newPlan);

      if (!planDetails) {
        throw new ApiError('Invalid subscription plan', 'INVALID_PLAN', 400);
      }

      // Calculate new pricing
      const newAmount = data.billingCycle === 'yearly'
        ? planDetails.pricing.yearly
        : planDetails.pricing.monthly;

      // Update subscription
      const updateData: Record<string, any> = {
        'subscription.plan': data.newPlan,
        'subscription.billingCycle': data.billingCycle,
        'subscription.amount': newAmount,
        'subscription.status': 'active',
        'subscription.maxLocations': planDetails.limits.locations === -1 ? 999 : planDetails.limits.locations,
        'subscription.maxUsers': planDetails.limits.users === -1 ? 999 : planDetails.limits.users,
        'subscription.features': this.getPlanFeatures(data.newPlan),
        'subscription.currentPeriodStart': new Date(),
        'subscription.currentPeriodEnd': new Date(Date.now() + (data.billingCycle === 'yearly' ? 365 : 30) * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
      };

      if (data.paymentMethodId) {
        updateData['subscription.paymentMethodId'] = data.paymentMethodId;
      }

      await getPlatformDatabase().collection('organizations').updateOne(
        { tenantId: data.tenantId },
        { $set: updateData }
      );

      // Clear cache
      await cache.del(`tenant:${data.tenantId}`);

      // Log subscription change
      await this.logSubscriptionChange({
        tenantId: data.tenantId,
        action: 'upgrade',
        previousPlan,
        newPlan: data.newPlan,
        changedBy: data.upgradedBy,
      });

      return {
        previousPlan,
        newPlan: data.newPlan,
        effectiveDate: new Date(),
        prorationAmount: 0, // Would calculate proration in real implementation
      };

    } catch (error) {
      logger.error('Failed to upgrade subscription', {
        tenantId: data.tenantId,
        newPlan: data.newPlan,
        upgradedBy: data.upgradedBy,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError('Failed to upgrade subscription', 'SUBSCRIPTION_UPGRADE_FAILED', 500);
    }
  }

  /**
   * Downgrade subscription
   */
  async downgradeSubscription(data: {
    tenantId: string;
    newPlan: SubscriptionPlans;
    effectiveDate?: Date;
    downgradedBy: string;
  }): Promise<{
    previousPlan: SubscriptionPlans;
    newPlan: SubscriptionPlans;
    effectiveDate: Date;
  }> {
    try {
      const organization = await getPlatformDatabase().collection('organizations').findOne({
        tenantId: data.tenantId
      });

      if (!organization) {
        throw new ApiError('Organization not found', 'ORGANIZATION_NOT_FOUND', 404);
      }

      const previousPlan = organization.subscription.plan;
      const effectiveDate = data.effectiveDate || organization.subscription.currentPeriodEnd;

      // Schedule downgrade for end of current billing period
      await getPlatformDatabase().collection('subscription_changes').insertOne({
        id: uuidv4(),
        tenantId: data.tenantId,
        changeType: 'downgrade',
        previousPlan,
        newPlan: data.newPlan,
        effectiveDate,
        scheduledBy: data.downgradedBy,
        status: 'scheduled',
        createdAt: new Date(),
      });

      await this.logSubscriptionChange({
        tenantId: data.tenantId,
        action: 'downgrade_scheduled',
        previousPlan,
        newPlan: data.newPlan,
        changedBy: data.downgradedBy,
        effectiveDate,
      });

      return {
        previousPlan,
        newPlan: data.newPlan,
        effectiveDate,
      };

    } catch (error) {
      logger.error('Failed to downgrade subscription', {
        tenantId: data.tenantId,
        newPlan: data.newPlan,
        downgradedBy: data.downgradedBy,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError('Failed to downgrade subscription', 'SUBSCRIPTION_DOWNGRADE_FAILED', 500);
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(data: {
    tenantId: string;
    reason?: string;
    cancelImmediately?: boolean;
    cancelledBy: string;
  }): Promise<{
    effectiveDate: Date;
    refundAmount?: number;
  }> {
    try {
      const organization = await getPlatformDatabase().collection('organizations').findOne({
        tenantId: data.tenantId
      });

      if (!organization) {
        throw new ApiError('Organization not found', 'ORGANIZATION_NOT_FOUND', 404);
      }

      const effectiveDate = data.cancelImmediately
        ? new Date()
        : organization.subscription.currentPeriodEnd;

      const updateData: any = {
        'subscription.cancellationReason': data.reason,
        'subscription.cancelledAt': new Date(),
        'subscription.cancelledBy': data.cancelledBy,
        'subscription.cancellationEffectiveDate': effectiveDate,
        updatedAt: new Date(),
      };

      if (data.cancelImmediately) {
        updateData['subscription.status'] = 'cancelled';
      }

      await getPlatformDatabase().collection('organizations').updateOne(
        { tenantId: data.tenantId },
        { $set: updateData }
      );

      // Clear cache
      await cache.del(`tenant:${data.tenantId}`);

      await this.logSubscriptionChange({
        tenantId: data.tenantId,
        action: 'cancel',
        changedBy: data.cancelledBy,
        metadata: { reason: data.reason, immediate: data.cancelImmediately },
      });

      return {
        effectiveDate,
        refundAmount: data.cancelImmediately ? 0 : undefined, // Would calculate refund in real implementation
      };

    } catch (error) {
      logger.error('Failed to cancel subscription', {
        tenantId: data.tenantId,
        cancelledBy: data.cancelledBy,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError('Failed to cancel subscription', 'SUBSCRIPTION_CANCELLATION_FAILED', 500);
    }
  }

  /**
   * Reactivate subscription
   */
  async reactivateSubscription(data: {
    tenantId: string;
    paymentMethodId?: string;
    reactivatedBy: string;
  }): Promise<{
    effectiveDate: Date;
    nextBillingDate: Date;
  }> {
    try {
      const organization = await getPlatformDatabase().collection('organizations').findOne({
        tenantId: data.tenantId
      });

      if (!organization) {
        throw new ApiError('Organization not found', 'ORGANIZATION_NOT_FOUND', 404);
      }

      if (organization.subscription.status === 'active') {
        throw new ApiError('Subscription is already active', 'SUBSCRIPTION_ALREADY_ACTIVE', 400);
      }

      const now = new Date();
      const nextBillingDate = new Date(now);

      if (organization.subscription.billingCycle === 'yearly') {
        nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
      } else {
        nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
      }

      const updateData: any = {
        'subscription.status': 'active',
        'subscription.currentPeriodStart': now,
        'subscription.currentPeriodEnd': nextBillingDate,
        'subscription.reactivatedAt': now,
        'subscription.reactivatedBy': data.reactivatedBy,
        updatedAt: now,
      };

      if (data.paymentMethodId) {
        updateData['subscription.paymentMethodId'] = data.paymentMethodId;
      }

      // Clear cancellation fields
      updateData.$unset = {
        'subscription.cancellationReason': '',
        'subscription.cancelledAt': '',
        'subscription.cancelledBy': '',
        'subscription.cancellationEffectiveDate': '',
      };

      await getPlatformDatabase().collection('organizations').updateOne(
        { tenantId: data.tenantId },
        { $set: updateData, $unset: updateData.$unset }
      );

      // Clear cache
      await cache.del(`tenant:${data.tenantId}`);

      await this.logSubscriptionChange({
        tenantId: data.tenantId,
        action: 'reactivate',
        changedBy: data.reactivatedBy,
      });

      return {
        effectiveDate: now,
        nextBillingDate,
      };

    } catch (error) {
      logger.error('Failed to reactivate subscription', {
        tenantId: data.tenantId,
        reactivatedBy: data.reactivatedBy,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError('Failed to reactivate subscription', 'SUBSCRIPTION_REACTIVATION_FAILED', 500);
    }
  }

  /**
   * Change billing cycle
   */
  async changeBillingCycle(data: {
    tenantId: string;
    newBillingCycle: 'monthly' | 'yearly';
    changedBy: string;
  }): Promise<{
    effectiveDate: Date;
    newAmount: number;
  }> {
    try {
      const organization = await getPlatformDatabase().collection('organizations').findOne({
        tenantId: data.tenantId
      });

      if (!organization) {
        throw new ApiError('Organization not found', 'ORGANIZATION_NOT_FOUND', 404);
      }

      const planDetails = await this.getPlanDetails(organization.subscription.plan);
      if (!planDetails) {
        throw new ApiError('Invalid subscription plan', 'INVALID_PLAN', 400);
      }

      const newAmount = data.newBillingCycle === 'yearly'
        ? planDetails.pricing.yearly
        : planDetails.pricing.monthly;

      // Update billing cycle at the end of current period
      const effectiveDate = organization.subscription.currentPeriodEnd;

      await getPlatformDatabase().collection('subscription_changes').insertOne({
        id: uuidv4(),
        tenantId: data.tenantId,
        changeType: 'billing_cycle_change',
        previousBillingCycle: organization.subscription.billingCycle,
        newBillingCycle: data.newBillingCycle,
        effectiveDate,
        scheduledBy: data.changedBy,
        status: 'scheduled',
        createdAt: new Date(),
      });

      return {
        effectiveDate,
        newAmount,
      };

    } catch (error) {
      logger.error('Failed to change billing cycle', {
        tenantId: data.tenantId,
        newBillingCycle: data.newBillingCycle,
        changedBy: data.changedBy,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError('Failed to change billing cycle', 'BILLING_CYCLE_CHANGE_FAILED', 500);
    }
  }

  /**
   * Update payment method
   */
  async updatePaymentMethod(data: {
    tenantId: string;
    paymentMethodId: string;
    updatedBy: string;
  }): Promise<void> {
    try {
      const result = await getPlatformDatabase().collection('organizations').updateOne(
        { tenantId: data.tenantId },
        {
          $set: {
            'subscription.paymentMethodId': data.paymentMethodId,
            updatedAt: new Date(),
          },
        }
      );

      if (result.matchedCount === 0) {
        throw new ApiError('Organization not found', 'ORGANIZATION_NOT_FOUND', 404);
      }

      // Clear cache
      await cache.del(`tenant:${data.tenantId}`);

      await this.logSubscriptionChange({
        tenantId: data.tenantId,
        action: 'payment_method_updated',
        changedBy: data.updatedBy,
      });

    } catch (error) {
      logger.error('Failed to update payment method', {
        tenantId: data.tenantId,
        updatedBy: data.updatedBy,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError('Failed to update payment method', 'PAYMENT_METHOD_UPDATE_FAILED', 500);
    }
  }

  /**
   * Get current usage
   */
  async getCurrentUsage(tenantId: string): Promise<{
    locations: { used: number; limit: number };
    users: { used: number; limit: number };
    orders: { current: number; limit: number };
    storage: { used: number; limit: number };
  }> {
    try {
      // Get subscription limits
      const organization = await getPlatformDatabase().collection('organizations').findOne({ tenantId });

      if (!organization) {
        throw new ApiError('Organization not found', 'ORGANIZATION_NOT_FOUND', 404);
      }

      // Get tenant database
      const db = await getTenantDatabase(tenantId);

      // Count current usage
      const [locationCount, userCount, orderCount] = await Promise.all([
        db.collection('locations').countDocuments({ isActive: true }),
        getPlatformDatabase().collection('users').countDocuments({
          'tenantMemberships': {
            $elemMatch: {
              tenantId,
              status: 'active'
            }
          }
        }),
        db.collection('orders').countDocuments({
          createdAt: {
            $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
          }
        }),
      ]);

      return {
        locations: {
          used: locationCount,
          limit: organization.subscription.maxLocations,
        },
        users: {
          used: userCount,
          limit: organization.subscription.maxUsers,
        },
        orders: {
          current: orderCount,
          limit: -1, // No limit on orders
        },
        storage: {
          used: 0, // Would calculate actual storage usage
          limit: -1, // No limit on storage
        },
      };

    } catch (error) {
      logger.error('Failed to get current usage', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to retrieve usage statistics', 'USAGE_FETCH_FAILED', 500);
    }
  }

  /**
   * Get invoices
   */
  async getInvoices(
    tenantId: string,
    options: {
      page: number;
      limit: number;
      status?: string;
    }
  ): Promise<{
    data: any[];
    meta: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasMore: boolean;
    };
  }> {
    try {
      // In a real implementation, you'd fetch from Stripe or billing system
      // For now, return mock data
      const mockInvoices = [
        {
          id: 'inv_001',
          number: 'INV-2024-001',
          amount: 79.00,
          currency: 'USD',
          status: 'paid',
          createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          paidAt: new Date(Date.now() - 29 * 24 * 60 * 60 * 1000),
          downloadUrl: '/invoices/inv_001.pdf',
        },
      ];

      return {
        data: mockInvoices,
        meta: {
          page: options.page,
          limit: options.limit,
          total: mockInvoices.length,
          totalPages: 1,
          hasMore: false,
        },
      };

    } catch (error) {
      logger.error('Failed to get invoices', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to retrieve invoices', 'INVOICES_FETCH_FAILED', 500);
    }
  }

  /**
   * Extend trial
   */
  async extendTrial(data: {
    tenantId: string;
    additionalDays: number;
    reason?: string;
    extendedBy: string;
  }): Promise<{
    newTrialEnd: Date;
  }> {
    try {
      const organization = await getPlatformDatabase().collection('organizations').findOne({ tenantId: data.tenantId });

      if (!organization) {
        throw new ApiError('Organization not found', 'ORGANIZATION_NOT_FOUND', 404);
      }

      if (organization.subscription.status !== 'trial') {
        throw new ApiError('Organization is not on trial', 'NOT_ON_TRIAL', 400);
      }

      const currentTrialEnd = organization.subscription.trialEndsAt || new Date();
      const newTrialEnd = new Date(currentTrialEnd.getTime() + data.additionalDays * 24 * 60 * 60 * 1000);

      await getPlatformDatabase().collection('organizations').updateOne(
        { tenantId: data.tenantId },
        {
          $set: {
            'subscription.trialEndsAt': newTrialEnd,
            'subscription.currentPeriodEnd': newTrialEnd,
            updatedAt: new Date(),
          },
        }
      );

      // Clear cache
      await cache.del(`tenant:${data.tenantId}`);

      await this.logSubscriptionChange({
        tenantId: data.tenantId,
        action: 'trial_extended',
        changedBy: data.extendedBy,
        metadata: { additionalDays: data.additionalDays, reason: data.reason },
      });

      return {
        newTrialEnd,
      };

    } catch (error) {
      logger.error('Failed to extend trial', {
        tenantId: data.tenantId,
        additionalDays: data.additionalDays,
        extendedBy: data.extendedBy,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError('Failed to extend trial', 'TRIAL_EXTENSION_FAILED', 500);
    }
  }

  /**
   * Get plan details
   */
  private async getPlanDetails(plan: SubscriptionPlans): Promise<PlanDetails | null> {
    const plans = await this.getAvailablePlans();
    return plans.find(p => p.id === plan) || null;
  }

  /**
   * Get plan features
   */
  private getPlanFeatures(plan: SubscriptionPlans): string[] {
    const featureMap: Record<SubscriptionPlans, string[]> = {
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

    return featureMap[plan] || [];
  }

  /**
   * Log subscription change
   */
  private async logSubscriptionChange(data: {
    tenantId: string;
    action: string;
    previousPlan?: SubscriptionPlans;
    newPlan?: SubscriptionPlans;
    changedBy: string;
    effectiveDate?: Date;
    metadata?: any;
  }): Promise<void> {
    try {
      await getPlatformDatabase().collection('subscription_history').insertOne({
        id: uuidv4(),
        tenantId: data.tenantId,
        action: data.action,
        previousPlan: data.previousPlan,
        newPlan: data.newPlan,
        changedBy: data.changedBy,
        effectiveDate: data.effectiveDate,
        metadata: data.metadata,
        timestamp: new Date(),
      });

    } catch (error) {
      logger.error('Failed to log subscription change', {
        tenantId: data.tenantId,
        action: data.action,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Don't throw error - logging shouldn't break the main operation
    }
  }
}