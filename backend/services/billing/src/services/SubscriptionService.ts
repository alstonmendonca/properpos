// Subscription management service

import Decimal from 'decimal.js';
import Stripe from 'stripe';
import moment from 'moment';

import {
  logger,
  getPlatformDatabase,
  getTenantDatabase,
  FeatureFlags,
} from '@properpos/backend-shared';

// Local billing-specific subscription interface (different from shared Subscription type)
interface BillingSubscription {
  id: string;
  tenantId: string;
  planId: string;
  planName: string;
  billingCycle: 'monthly' | 'yearly';
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  nextBillingDate: Date;
  amount: number;
  currency: string;
  trialEndDate?: Date | null;
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  paypalSubscriptionId?: string;
  paymentMethodId?: string;
  couponCode?: string;
  discountAmount?: number;
  features?: FeatureFlags[];
  limits?: {
    locations?: number;
    users?: number;
    products?: number;
    monthlyOrders?: number;
    storageGB?: number;
  };
  cancelledAt?: Date;
  cancelledBy?: string;
  cancellationReason?: string;
  effectiveCancelDate?: Date;
  planChangedAt?: Date;
  replacedBy?: string;
  createdBy: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Local billing-specific plan interface
interface BillingPlan {
  id: string;
  name: string;
  slug: string;
  description?: string;
  monthlyPrice: number;
  yearlyPrice?: number;
  currency: string;
  features: FeatureFlags[];
  limits: {
    locations: number;
    users: number;
    products: number;
    monthlyOrders: number;
    storageGB: number;
  };
  isActive: boolean;
  isPublic: boolean;
  sortOrder: number;
  trialDays?: number;
  stripeProductId?: string;
  stripePriceIdMonthly?: string;
  stripePriceIdYearly?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Local invoice interface
interface BillingInvoice {
  id: string;
  tenantId: string;
  subscriptionId: string;
  stripeInvoiceId?: string;
  number: string;
  status: 'draft' | 'open' | 'paid' | 'uncollectible' | 'void';
  amount: number;
  currency: string;
  dueDate: Date;
  paidAt?: Date;
  lineItems: {
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

// Local usage metrics interface
interface BillingUsageMetrics {
  period: string;
  startDate: Date;
  endDate: Date;
  orders: number;
  products: number;
  users: number;
  storageUsed: number;
  apiCalls: number;
  features: {
    multiLocation?: boolean;
    advancedReporting?: boolean;
    inventoryManagement?: boolean;
    [key: string]: boolean | undefined;
  };
}

// Local subscription addon interface
interface BillingSubscriptionAddon {
  id: string;
  tenantId: string;
  subscriptionId: string;
  addonType: 'extra_location' | 'extra_user' | 'extra_storage' | 'premium_support' | 'custom';
  name: string;
  description?: string;
  pricing: {
    amount: number;
    currency: string;
    billingCycle: 'monthly' | 'yearly' | 'one_time';
  };
  quantity: number;
  status: 'active' | 'cancelled' | 'pending';
  activatedAt: Date;
  expiresAt?: Date;
  cancelledAt?: Date;
  cancelledBy?: string;
  stripeItemId?: string;
  addedBy: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Coupon type definitions
interface Coupon {
  id: string;
  code: string;
  name: string;
  description?: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  maxUses?: number;
  currentUses: number;
  minAmount?: number;
  maxDiscount?: number;
  applicablePlans?: string[]; // Empty means all plans
  validFrom: Date;
  validUntil?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface CouponValidationResult {
  isValid: boolean;
  coupon?: Coupon;
  discountAmount: Decimal;
  errorMessage?: string;
}

export class SubscriptionService {
  private stripe: Stripe;

  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2023-10-16' as const,
    });
  }

  /**
   * Get subscription for tenant
   */
  async getSubscription(tenantId: string): Promise<BillingSubscription | null> {
    try {
      const db = getPlatformDatabase();
      const collection = db.collection('subscriptions');

      const subscription = await collection.findOne({ tenantId });
      return subscription;

    } catch (error) {
      logger.error('Get subscription error', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Create new subscription
   */
  async createSubscription(
    tenantId: string,
    data: {
      planId: string;
      billingCycle: 'monthly' | 'yearly';
      paymentMethodId?: string;
      couponCode?: string;
      createdBy: string;
    }
  ): Promise<BillingSubscription> {
    try {
      const db = getPlatformDatabase();
      const subscriptionsCollection = db.collection('subscriptions');
      const plansCollection = db.collection('subscription_plans');

      // Get plan details
      const plan = await plansCollection.findOne({ id: data.planId });
      if (!plan) {
        throw new Error('Subscription plan not found');
      }

      // Calculate pricing based on billing cycle
      const basePrice = data.billingCycle === 'yearly'
        ? new Decimal(plan.yearlyPrice || plan.monthlyPrice * 12)
        : new Decimal(plan.monthlyPrice);

      // Apply coupon if provided
      let discountAmount = new Decimal(0);
      let validatedCoupon: Coupon | undefined;
      if (data.couponCode) {
        const couponResult = await this.validateAndApplyCoupon(
          data.couponCode,
          basePrice,
          data.planId
        );

        if (!couponResult.isValid) {
          throw new Error(couponResult.errorMessage || 'Invalid coupon code');
        }

        discountAmount = couponResult.discountAmount;
        validatedCoupon = couponResult.coupon;

        // Increment coupon usage
        if (validatedCoupon) {
          await this.incrementCouponUsage(validatedCoupon.id);
        }
      }

      const finalPrice = basePrice.minus(discountAmount);

      // Create Stripe subscription if payment method provided
      let stripeSubscriptionId: string | undefined;
      if (data.paymentMethodId) {
        const stripeSubscription = await this.stripe.subscriptions.create({
          customer: tenantId, // Assuming tenant ID is used as Stripe customer ID
          items: [{
            price_data: {
              currency: 'usd',
              product: plan.stripeProductId!,
              unit_amount: finalPrice.mul(100).toNumber(), // Convert to cents
              recurring: {
                interval: data.billingCycle === 'yearly' ? 'year' : 'month',
              },
            },
          }],
          default_payment_method: data.paymentMethodId,
        });

        stripeSubscriptionId = stripeSubscription.id;
      }

      // Calculate trial and billing dates
      const now = new Date();
      const trialEndDate = plan.trialDays
        ? moment(now).add(plan.trialDays, 'days').toDate()
        : now;

      const nextBillingDate = moment(trialEndDate)
        .add(1, data.billingCycle === 'yearly' ? 'year' : 'month')
        .toDate();

      const subscription: BillingSubscription = {
        id: require('uuid').v4(),
        tenantId,
        planId: data.planId,
        planName: plan.name,
        billingCycle: data.billingCycle,
        status: plan.trialDays ? 'trialing' : 'active',
        currentPeriodStart: now,
        currentPeriodEnd: trialEndDate,
        nextBillingDate,
        amount: finalPrice.toNumber(),
        currency: 'USD',
        trialEndDate: plan.trialDays ? trialEndDate : null,
        stripeSubscriptionId,
        paymentMethodId: data.paymentMethodId,
        couponCode: data.couponCode,
        discountAmount: discountAmount.toNumber(),
        features: plan.features,
        limits: plan.limits,
        createdBy: data.createdBy,
        createdAt: now,
        updatedAt: now,
      };

      await subscriptionsCollection.insertOne(subscription);

      logger.info('Subscription created', {
        tenantId,
        subscriptionId: subscription.id,
        planId: data.planId,
        billingCycle: data.billingCycle,
        amount: subscription.amount,
      });

      return subscription;

    } catch (error) {
      logger.error('Create subscription error', {
        tenantId,
        data,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Change subscription plan
   */
  async changePlan(
    tenantId: string,
    data: {
      planId: string;
      billingCycle: 'monthly' | 'yearly';
      effectiveDate?: Date;
      changedBy: string;
    }
  ): Promise<BillingSubscription> {
    try {
      const db = getPlatformDatabase();
      const subscriptionsCollection = db.collection('subscriptions');
      const plansCollection = db.collection('subscription_plans');

      const subscription = await subscriptionsCollection.findOne({ tenantId });
      if (!subscription) {
        throw new Error('Subscription not found');
      }

      const newPlan = await plansCollection.findOne({ id: data.planId });
      if (!newPlan) {
        throw new Error('New subscription plan not found');
      }

      // Calculate new pricing
      const newAmount = data.billingCycle === 'yearly'
        ? new Decimal(newPlan.yearlyPrice || newPlan.monthlyPrice * 12)
        : new Decimal(newPlan.monthlyPrice);

      const effectiveDate = data.effectiveDate || new Date();

      // Update Stripe subscription if exists
      if (subscription.stripeSubscriptionId) {
        await this.stripe.subscriptions.update(subscription.stripeSubscriptionId, {
          items: [{
            id: subscription.stripeSubscriptionId, // This would need to be the subscription item ID
            price_data: {
              currency: 'usd',
              product: newPlan.stripeProductId!,
              unit_amount: newAmount.mul(100).toNumber(),
              recurring: {
                interval: data.billingCycle === 'yearly' ? 'year' : 'month',
              },
            },
          }],
        });
      }

      // Update subscription
      const updatedSubscription = {
        ...subscription,
        planId: data.planId,
        planName: newPlan.name,
        billingCycle: data.billingCycle,
        amount: newAmount.toNumber(),
        features: newPlan.features,
        limits: newPlan.limits,
        updatedBy: data.changedBy,
        updatedAt: new Date(),
        planChangedAt: effectiveDate,
      };

      await subscriptionsCollection.replaceOne({ tenantId }, updatedSubscription);

      logger.info('Subscription plan changed', {
        tenantId,
        subscriptionId: subscription.id,
        previousPlan: subscription.planId,
        newPlan: data.planId,
        newAmount: newAmount.toNumber(),
      });

      return updatedSubscription;

    } catch (error) {
      logger.error('Change plan error', {
        tenantId,
        data,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(
    tenantId: string,
    data: {
      reason: string;
      cancelAtPeriodEnd: boolean;
      cancelledBy: string;
    }
  ): Promise<BillingSubscription> {
    try {
      const db = getPlatformDatabase();
      const collection = db.collection('subscriptions');

      const subscription = await collection.findOne({ tenantId });
      if (!subscription) {
        throw new Error('Subscription not found');
      }

      // Cancel Stripe subscription if exists
      if (subscription.stripeSubscriptionId) {
        await this.stripe.subscriptions.update(subscription.stripeSubscriptionId, {
          cancel_at_period_end: data.cancelAtPeriodEnd,
        });

        if (!data.cancelAtPeriodEnd) {
          await this.stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
        }
      }

      const cancelledAt = new Date();
      const effectiveCancelDate = data.cancelAtPeriodEnd
        ? subscription.currentPeriodEnd
        : cancelledAt;

      const updatedSubscription = {
        ...subscription,
        status: data.cancelAtPeriodEnd ? 'cancel_at_period_end' : 'cancelled',
        cancelledAt,
        cancelledBy: data.cancelledBy,
        cancellationReason: data.reason,
        effectiveCancelDate,
        updatedAt: cancelledAt,
      };

      await collection.replaceOne({ tenantId }, updatedSubscription);

      logger.info('Subscription cancelled', {
        tenantId,
        subscriptionId: subscription.id,
        reason: data.reason,
        cancelAtPeriodEnd: data.cancelAtPeriodEnd,
        effectiveCancelDate,
      });

      return updatedSubscription;

    } catch (error) {
      logger.error('Cancel subscription error', {
        tenantId,
        data,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Reactivate subscription
   */
  async reactivateSubscription(
    tenantId: string,
    data: {
      planId: string;
      billingCycle: 'monthly' | 'yearly';
      reactivatedBy: string;
    }
  ): Promise<BillingSubscription> {
    try {
      const db = getPlatformDatabase();
      const collection = db.collection('subscriptions');

      const subscription = await collection.findOne({ tenantId });
      if (!subscription) {
        throw new Error('Subscription not found');
      }

      if (subscription.status !== 'cancelled') {
        throw new Error('Only cancelled subscriptions can be reactivated');
      }

      // Create new subscription (easier than reactivating old one)
      const reactivatedSubscription = await this.createSubscription(tenantId, {
        planId: data.planId,
        billingCycle: data.billingCycle,
        paymentMethodId: subscription.paymentMethodId,
        createdBy: data.reactivatedBy,
      });

      // Mark old subscription as replaced
      await collection.updateOne(
        { tenantId },
        {
          $set: {
            status: 'replaced',
            replacedBy: reactivatedSubscription.id,
            updatedAt: new Date(),
          }
        }
      );

      logger.info('Subscription reactivated', {
        tenantId,
        oldSubscriptionId: subscription.id,
        newSubscriptionId: reactivatedSubscription.id,
        planId: data.planId,
      });

      return reactivatedSubscription;

    } catch (error) {
      logger.error('Reactivate subscription error', {
        tenantId,
        data,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get usage metrics
   */
  async getUsageMetrics(
    tenantId: string,
    options: { period?: string } = {}
  ): Promise<BillingUsageMetrics> {
    try {
      const db = await getTenantDatabase(tenantId);

      // This would aggregate usage data from various collections
      const { period = 'current_month' } = options;

      // Get date range for period
      const now = moment();
      let startDate: Date;

      switch (period) {
        case 'current_month':
          startDate = now.clone().startOf('month').toDate();
          break;
        case 'last_month':
          startDate = now.clone().subtract(1, 'month').startOf('month').toDate();
          break;
        case 'last_30_days':
          startDate = now.clone().subtract(30, 'days').toDate();
          break;
        default:
          startDate = now.clone().startOf('month').toDate();
      }

      const endDate = now.toDate();

      // Aggregate usage from various sources
      const [orderCount, productCount, userCount, storageUsed] = await Promise.all([
        this.getOrderCount(db, startDate, endDate),
        this.getProductCount(db),
        this.getUserCount(tenantId),
        this.getStorageUsage(tenantId),
      ]);

      const usage: BillingUsageMetrics = {
        period,
        startDate,
        endDate,
        orders: orderCount,
        products: productCount,
        users: userCount,
        storageUsed,
        apiCalls: 0, // Would track API calls
        features: {
          multiLocation: true,
          advancedReporting: true,
          inventoryManagement: true,
          // ... other features based on subscription plan
        }
      };

      return usage;

    } catch (error) {
      logger.error('Get usage metrics error', {
        tenantId,
        options,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get subscription invoices
   */
  async getSubscriptionInvoices(
    tenantId: string,
    filters: {
      page?: number;
      limit?: number;
      status?: string;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<{
    invoices: BillingInvoice[];
    totalCount: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const db = getPlatformDatabase();
      const collection = db.collection('invoices');

      const {
        page = 1,
        limit = 10,
        status,
        startDate,
        endDate
      } = filters;

      const query: any = { tenantId };

      if (status) query.status = status;
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = startDate;
        if (endDate) query.createdAt.$lte = endDate;
      }

      const [invoices, totalCount] = await Promise.all([
        collection
          .find(query)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .toArray(),
        collection.countDocuments(query),
      ]);

      return {
        invoices,
        totalCount,
        page,
        totalPages: Math.ceil(totalCount / limit),
      };

    } catch (error) {
      logger.error('Get subscription invoices error', {
        tenantId,
        filters,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Update payment method
   */
  async updatePaymentMethod(
    tenantId: string,
    paymentMethodId: string,
    updatedBy: string
  ): Promise<void> {
    try {
      const db = getPlatformDatabase();
      const collection = db.collection('subscriptions');

      const subscription = await collection.findOne({ tenantId });
      if (!subscription) {
        throw new Error('Subscription not found');
      }

      // Update Stripe subscription if exists
      if (subscription.stripeSubscriptionId) {
        await this.stripe.subscriptions.update(subscription.stripeSubscriptionId, {
          default_payment_method: paymentMethodId,
        });
      }

      await collection.updateOne(
        { tenantId },
        {
          $set: {
            paymentMethodId,
            updatedBy,
            updatedAt: new Date(),
          },
        }
      );

      logger.info('Subscription payment method updated', {
        tenantId,
        subscriptionId: subscription.id,
        paymentMethodId,
      });

    } catch (error) {
      logger.error('Update payment method error', {
        tenantId,
        paymentMethodId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Preview plan change
   */
  async previewPlanChange(
    tenantId: string,
    data: {
      planId: string;
      billingCycle: 'monthly' | 'yearly';
    }
  ): Promise<{
    currentPlan: { name: string; amount: number; billingCycle: string };
    newPlan: { name: string; amount: number; billingCycle: string };
    prorationAmount: number;
    effectiveDate: Date;
    nextBillingDate: Date;
  }> {
    try {
      const db = getPlatformDatabase();
      const subscriptionsCollection = db.collection('subscriptions');
      const plansCollection = db.collection('subscription_plans');

      const subscription = await subscriptionsCollection.findOne({ tenantId });
      if (!subscription) {
        throw new Error('Subscription not found');
      }

      const newPlan = await plansCollection.findOne({ id: data.planId });
      if (!newPlan) {
        throw new Error('New subscription plan not found');
      }

      const newAmount = data.billingCycle === 'yearly'
        ? new Decimal(newPlan.yearlyPrice || newPlan.monthlyPrice * 12)
        : new Decimal(newPlan.monthlyPrice);

      // Calculate proration (simplified)
      const currentAmount = new Decimal(subscription.amount);
      const prorationAmount = newAmount.minus(currentAmount);

      const effectiveDate = new Date();
      const nextBillingDate = moment(subscription.nextBillingDate).toDate();

      return {
        currentPlan: {
          name: subscription.planName,
          amount: subscription.amount,
          billingCycle: subscription.billingCycle,
        },
        newPlan: {
          name: newPlan.name,
          amount: newAmount.toNumber(),
          billingCycle: data.billingCycle,
        },
        prorationAmount: prorationAmount.toNumber(),
        effectiveDate,
        nextBillingDate,
      };

    } catch (error) {
      logger.error('Preview plan change error', {
        tenantId,
        data,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Start trial subscription
   */
  async startTrial(
    tenantId: string,
    data: {
      planId: string;
      trialDays: number;
      startedBy: string;
    }
  ): Promise<BillingSubscription> {
    try {
      const db = getPlatformDatabase();
      const plansCollection = db.collection('subscription_plans');

      const plan = await plansCollection.findOne({ id: data.planId });
      if (!plan) {
        throw new Error('Subscription plan not found');
      }

      // Create trial subscription (no payment method required)
      const now = new Date();
      const trialEndDate = moment(now).add(data.trialDays, 'days').toDate();

      const subscription: BillingSubscription = {
        id: require('uuid').v4(),
        tenantId,
        planId: data.planId,
        planName: plan.name,
        billingCycle: 'monthly', // Default for trial
        status: 'trialing',
        currentPeriodStart: now,
        currentPeriodEnd: trialEndDate,
        nextBillingDate: trialEndDate,
        amount: 0, // Free during trial
        currency: 'USD',
        trialEndDate,
        features: plan.features,
        limits: plan.limits,
        createdBy: data.startedBy,
        createdAt: now,
        updatedAt: now,
      };

      const subscriptionsCollection = db.collection('subscriptions');
      await subscriptionsCollection.insertOne(subscription);

      logger.info('Trial subscription started', {
        tenantId,
        subscriptionId: subscription.id,
        planId: data.planId,
        trialDays: data.trialDays,
        trialEndDate,
      });

      return subscription;

    } catch (error) {
      logger.error('Start trial error', {
        tenantId,
        data,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  // Coupon validation and management methods

  /**
   * Validate and calculate discount for a coupon code
   */
  async validateAndApplyCoupon(
    couponCode: string,
    basePrice: Decimal,
    planId: string
  ): Promise<CouponValidationResult> {
    try {
      const db = getPlatformDatabase();
      const couponsCollection = db.collection('coupons');

      // Find the coupon by code (case-insensitive)
      const coupon = await couponsCollection.findOne({
        code: { $regex: new RegExp(`^${couponCode}$`, 'i') },
      });

      // Coupon not found
      if (!coupon) {
        return {
          isValid: false,
          discountAmount: new Decimal(0),
          errorMessage: 'Coupon code not found',
        };
      }

      // Check if coupon is active
      if (!coupon.isActive) {
        return {
          isValid: false,
          discountAmount: new Decimal(0),
          errorMessage: 'This coupon is no longer active',
        };
      }

      // Check validity dates
      const now = new Date();
      if (coupon.validFrom > now) {
        return {
          isValid: false,
          discountAmount: new Decimal(0),
          errorMessage: 'This coupon is not yet valid',
        };
      }

      if (coupon.validUntil && coupon.validUntil < now) {
        return {
          isValid: false,
          discountAmount: new Decimal(0),
          errorMessage: 'This coupon has expired',
        };
      }

      // Check usage limit
      if (coupon.maxUses && coupon.currentUses >= coupon.maxUses) {
        return {
          isValid: false,
          discountAmount: new Decimal(0),
          errorMessage: 'This coupon has reached its usage limit',
        };
      }

      // Check if coupon is applicable to the plan
      if (coupon.applicablePlans && coupon.applicablePlans.length > 0) {
        if (!coupon.applicablePlans.includes(planId)) {
          return {
            isValid: false,
            discountAmount: new Decimal(0),
            errorMessage: 'This coupon is not valid for the selected plan',
          };
        }
      }

      // Check minimum amount requirement
      if (coupon.minAmount && basePrice.lessThan(coupon.minAmount)) {
        return {
          isValid: false,
          discountAmount: new Decimal(0),
          errorMessage: `Minimum amount of $${coupon.minAmount} required for this coupon`,
        };
      }

      // Calculate discount amount
      let discountAmount: Decimal;
      if (coupon.discountType === 'percentage') {
        discountAmount = basePrice.mul(coupon.discountValue).div(100);
      } else {
        discountAmount = new Decimal(coupon.discountValue);
      }

      // Apply maximum discount cap if set
      if (coupon.maxDiscount) {
        const maxDiscountDecimal = new Decimal(coupon.maxDiscount);
        if (discountAmount.greaterThan(maxDiscountDecimal)) {
          discountAmount = maxDiscountDecimal;
        }
      }

      // Ensure discount doesn't exceed the base price
      if (discountAmount.greaterThan(basePrice)) {
        discountAmount = basePrice;
      }

      logger.info('Coupon validated successfully', {
        couponCode,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        calculatedDiscount: discountAmount.toNumber(),
      });

      return {
        isValid: true,
        coupon,
        discountAmount,
      };

    } catch (error) {
      logger.error('Coupon validation error', {
        couponCode,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        isValid: false,
        discountAmount: new Decimal(0),
        errorMessage: 'Error validating coupon',
      };
    }
  }

  /**
   * Increment the usage count for a coupon
   */
  private async incrementCouponUsage(couponId: string): Promise<void> {
    try {
      const db = getPlatformDatabase();
      const couponsCollection = db.collection('coupons');

      await couponsCollection.updateOne(
        { id: couponId },
        {
          $inc: { currentUses: 1 },
          $set: { updatedAt: new Date() },
        }
      );

      logger.info('Coupon usage incremented', { couponId });
    } catch (error) {
      logger.error('Error incrementing coupon usage', {
        couponId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get coupon by code (for display purposes)
   */
  async getCouponByCode(couponCode: string): Promise<Coupon | null> {
    try {
      const db = getPlatformDatabase();
      const couponsCollection = db.collection('coupons');

      return await couponsCollection.findOne({
        code: { $regex: new RegExp(`^${couponCode}$`, 'i') },
        isActive: true,
      });
    } catch (error) {
      logger.error('Get coupon error', {
        couponCode,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Create a new coupon (admin only)
   */
  async createCoupon(data: {
    code: string;
    name: string;
    description?: string;
    discountType: 'percentage' | 'fixed';
    discountValue: number;
    maxUses?: number;
    minAmount?: number;
    maxDiscount?: number;
    applicablePlans?: string[];
    validFrom?: Date;
    validUntil?: Date;
    createdBy: string;
  }): Promise<Coupon> {
    try {
      const db = getPlatformDatabase();
      const couponsCollection = db.collection('coupons');

      // Check for duplicate code
      const existing = await couponsCollection.findOne({
        code: { $regex: new RegExp(`^${data.code}$`, 'i') },
      });

      if (existing) {
        throw new Error('A coupon with this code already exists');
      }

      const now = new Date();
      const coupon: Coupon = {
        id: require('uuid').v4(),
        code: data.code.toUpperCase(),
        name: data.name,
        description: data.description,
        discountType: data.discountType,
        discountValue: data.discountValue,
        maxUses: data.maxUses,
        currentUses: 0,
        minAmount: data.minAmount,
        maxDiscount: data.maxDiscount,
        applicablePlans: data.applicablePlans,
        validFrom: data.validFrom || now,
        validUntil: data.validUntil,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };

      await couponsCollection.insertOne(coupon);

      logger.info('Coupon created', {
        couponId: coupon.id,
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
      });

      return coupon;
    } catch (error) {
      logger.error('Create coupon error', {
        data,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get all active add-ons for a subscription
   */
  async getSubscriptionAddons(tenantId: string): Promise<BillingSubscriptionAddon[]> {
    try {
      const db = getPlatformDatabase();
      const addonsCollection = db.collection('subscription_addons');

      const addons = await addonsCollection
        .find({
          tenantId,
          status: 'active',
        })
        .toArray();

      return addons;
    } catch (error) {
      logger.error('Get subscription addons error', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Add an add-on to a subscription
   */
  async addSubscriptionAddon(
    tenantId: string,
    data: {
      addonType: 'extra_location' | 'extra_user' | 'extra_storage' | 'premium_support' | 'custom';
      name: string;
      description?: string;
      amount: number;
      currency?: string;
      billingCycle?: 'monthly' | 'yearly' | 'one_time';
      quantity?: number;
      addedBy: string;
    }
  ): Promise<BillingSubscriptionAddon> {
    try {
      const db = getPlatformDatabase();
      const subscriptionsCollection = db.collection('subscriptions');
      const addonsCollection = db.collection('subscription_addons');

      // Get the current subscription
      const subscription = await subscriptionsCollection.findOne({ tenantId });
      if (!subscription) {
        throw new Error('Subscription not found');
      }

      if (subscription.status !== 'active' && subscription.status !== 'trialing') {
        throw new Error('Cannot add add-ons to inactive subscription');
      }

      const now = new Date();
      const addon: BillingSubscriptionAddon = {
        id: require('uuid').v4(),
        tenantId,
        subscriptionId: subscription.id,
        addonType: data.addonType,
        name: data.name,
        description: data.description,
        pricing: {
          amount: data.amount,
          currency: data.currency || 'USD',
          billingCycle: data.billingCycle || 'monthly',
        },
        quantity: data.quantity || 1,
        status: 'active',
        isActive: true,
        activatedAt: now,
        addedBy: data.addedBy,
        createdAt: now,
        updatedAt: now,
      };

      // Create Stripe subscription item if applicable
      if (subscription.stripeSubscriptionId && addon.pricing.billingCycle !== 'one_time') {
        try {
          // Create a price for this add-on
          const price = await this.stripe.prices.create({
            unit_amount: Math.round(addon.pricing.amount * 100),
            currency: addon.pricing.currency.toLowerCase(),
            recurring: {
              interval: addon.pricing.billingCycle === 'yearly' ? 'year' : 'month',
            },
            product_data: {
              name: addon.name,
            },
          });

          // Add the item to the Stripe subscription
          const subscriptionItem = await this.stripe.subscriptionItems.create({
            subscription: subscription.stripeSubscriptionId,
            price: price.id,
            quantity: addon.quantity,
          });

          addon.stripeItemId = subscriptionItem.id;
        } catch (stripeError) {
          logger.warn('Failed to create Stripe subscription item', {
            tenantId,
            addonType: data.addonType,
            error: stripeError instanceof Error ? stripeError.message : 'Unknown error',
          });
          // Continue without Stripe integration
        }
      }

      // Save the add-on
      await addonsCollection.insertOne(addon);

      // Update subscription limits based on add-on type
      await this.updateSubscriptionLimitsForAddon(tenantId, addon, 'add');

      logger.info('Subscription add-on added', {
        tenantId,
        addonId: addon.id,
        addonType: addon.addonType,
        amount: addon.pricing.amount,
      });

      return addon;
    } catch (error) {
      logger.error('Add subscription addon error', {
        tenantId,
        data,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Remove an add-on from a subscription
   */
  async removeSubscriptionAddon(tenantId: string, addonId: string, removedBy: string): Promise<void> {
    try {
      const db = getPlatformDatabase();
      const addonsCollection = db.collection('subscription_addons');

      const addon = await addonsCollection.findOne({
        id: addonId,
        tenantId,
        status: 'active',
      });

      if (!addon) {
        throw new Error('Add-on not found or already cancelled');
      }

      // Remove from Stripe if applicable
      if (addon.stripeItemId) {
        try {
          await this.stripe.subscriptionItems.del(addon.stripeItemId);
        } catch (stripeError) {
          logger.warn('Failed to remove Stripe subscription item', {
            tenantId,
            addonId,
            stripeItemId: addon.stripeItemId,
            error: stripeError instanceof Error ? stripeError.message : 'Unknown error',
          });
        }
      }

      // Update add-on status
      const now = new Date();
      await addonsCollection.updateOne(
        { id: addonId },
        {
          $set: {
            status: 'cancelled',
            cancelledAt: now,
            cancelledBy: removedBy,
            updatedAt: now,
          },
        }
      );

      // Update subscription limits
      await this.updateSubscriptionLimitsForAddon(tenantId, addon, 'remove');

      logger.info('Subscription add-on removed', {
        tenantId,
        addonId,
        addonType: addon.addonType,
        removedBy,
      });
    } catch (error) {
      logger.error('Remove subscription addon error', {
        tenantId,
        addonId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Helper to update subscription limits when add-ons change
   */
  private async updateSubscriptionLimitsForAddon(
    tenantId: string,
    addon: BillingSubscriptionAddon,
    action: 'add' | 'remove'
  ): Promise<void> {
    const db = getPlatformDatabase();
    const subscriptionsCollection = db.collection('subscriptions');

    const multiplier = action === 'add' ? 1 : -1;
    const updateQuery: any = { updatedAt: new Date() };

    switch (addon.addonType) {
      case 'extra_location':
        updateQuery['limits.locations'] = { $inc: addon.quantity * multiplier };
        break;
      case 'extra_user':
        updateQuery['limits.users'] = { $inc: addon.quantity * multiplier };
        break;
      case 'extra_storage':
        // Assume each unit is 10GB
        updateQuery['limits.storageGB'] = { $inc: addon.quantity * 10 * multiplier };
        break;
    }

    if (Object.keys(updateQuery).length > 1) {
      await subscriptionsCollection.updateOne({ tenantId }, { $set: updateQuery });
    }
  }

  // Private helper methods
  private async getOrderCount(db: any, startDate: Date, endDate: Date): Promise<number> {
    const ordersCollection = db.collection('orders');
    return await ordersCollection.countDocuments({
      createdAt: { $gte: startDate, $lte: endDate },
      status: { $in: ['completed', 'paid'] }
    });
  }

  private async getProductCount(db: any): Promise<number> {
    const productsCollection = db.collection('products');
    return await productsCollection.countDocuments({ isActive: true });
  }

  private async getUserCount(tenantId: string): Promise<number> {
    const sharedDb = getPlatformDatabase();
    const membershipsCollection = sharedDb.collection('tenant_memberships');
    return await membershipsCollection.countDocuments({
      tenantId,
      status: 'active'
    });
  }

  /**
   * Calculate storage usage for a tenant
   * Returns storage used in bytes
   */
  private async getStorageUsage(tenantId: string): Promise<number> {
    try {
      let totalBytes = 0;

      // Get tenant database
      const db = await getTenantDatabase(tenantId);

      // Calculate collection sizes
      const collectionsToMeasure = [
        'products',
        'orders',
        'customers',
        'inventory',
        'stock_movements',
        'analytics_daily',
        'analytics_weekly',
        'analytics_monthly',
        'receipts',
        'audit_logs',
      ];

      for (const collectionName of collectionsToMeasure) {
        try {
          const stats = await db.command({ collStats: collectionName });
          if (stats && stats.storageSize) {
            totalBytes += stats.storageSize;
          }
        } catch (err) {
          // Collection might not exist yet, skip
        }
      }

      // Get file storage usage (uploaded images, receipts, etc.)
      const filesCollection = db.collection('uploaded_files');
      const filesAggregation = await filesCollection.aggregate([
        { $match: { tenantId } },
        { $group: { _id: null, totalSize: { $sum: '$fileSize' } } },
      ]).toArray();

      if (filesAggregation.length > 0 && filesAggregation[0].totalSize) {
        totalBytes += filesAggregation[0].totalSize;
      }

      // Get receipt PDFs size
      const receiptsCollection = db.collection('receipts');
      const receiptsAggregation = await receiptsCollection.aggregate([
        { $match: { 'pdf.size': { $exists: true } } },
        { $group: { _id: null, totalSize: { $sum: '$pdf.size' } } },
      ]).toArray();

      if (receiptsAggregation.length > 0 && receiptsAggregation[0].totalSize) {
        totalBytes += receiptsAggregation[0].totalSize;
      }

      // Log storage calculation
      logger.debug('Storage usage calculated', {
        tenantId,
        totalBytes,
        totalMB: (totalBytes / (1024 * 1024)).toFixed(2),
        totalGB: (totalBytes / (1024 * 1024 * 1024)).toFixed(4),
      });

      return totalBytes;
    } catch (error) {
      logger.error('Storage usage calculation error', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Return 0 on error rather than failing
      return 0;
    }
  }

  /**
   * Get storage usage in human-readable format
   */
  async getStorageUsageDetails(tenantId: string): Promise<{
    usedBytes: number;
    usedMB: number;
    usedGB: number;
    limitGB: number;
    percentUsed: number;
    breakdown: {
      database: number;
      files: number;
      receipts: number;
    };
  }> {
    try {
      const subscription = await this.getSubscription(tenantId);
      const limitGB = subscription?.limits?.storageGB || 5; // Default 5GB

      let databaseBytes = 0;
      let filesBytes = 0;
      let receiptsBytes = 0;

      const db = await getTenantDatabase(tenantId);

      // Database storage
      const collectionsToMeasure = [
        'products', 'orders', 'customers', 'inventory',
        'stock_movements', 'analytics_daily', 'analytics_weekly',
        'analytics_monthly', 'audit_logs',
      ];

      for (const collectionName of collectionsToMeasure) {
        try {
          const stats = await db.command({ collStats: collectionName });
          if (stats && stats.storageSize) {
            databaseBytes += stats.storageSize;
          }
        } catch (err) {
          // Collection might not exist
        }
      }

      // File storage
      const filesCollection = db.collection('uploaded_files');
      const filesAgg = await filesCollection.aggregate([
        { $group: { _id: null, totalSize: { $sum: '$fileSize' } } },
      ]).toArray();
      if (filesAgg.length > 0) {
        filesBytes = filesAgg[0].totalSize || 0;
      }

      // Receipts storage
      const receiptsCollection = db.collection('receipts');
      const receiptsAgg = await receiptsCollection.aggregate([
        { $match: { 'pdf.size': { $exists: true } } },
        { $group: { _id: null, totalSize: { $sum: '$pdf.size' } } },
      ]).toArray();
      if (receiptsAgg.length > 0) {
        receiptsBytes = receiptsAgg[0].totalSize || 0;
      }

      const totalBytes = databaseBytes + filesBytes + receiptsBytes;
      const totalMB = totalBytes / (1024 * 1024);
      const totalGB = totalBytes / (1024 * 1024 * 1024);
      const percentUsed = (totalGB / limitGB) * 100;

      return {
        usedBytes: totalBytes,
        usedMB: parseFloat(totalMB.toFixed(2)),
        usedGB: parseFloat(totalGB.toFixed(4)),
        limitGB,
        percentUsed: parseFloat(percentUsed.toFixed(2)),
        breakdown: {
          database: databaseBytes,
          files: filesBytes,
          receipts: receiptsBytes,
        },
      };
    } catch (error) {
      logger.error('Get storage usage details error', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
}