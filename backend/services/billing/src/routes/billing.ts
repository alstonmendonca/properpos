import { Router, Request, Response } from 'express';
import {
  logger,
  authenticate,
  extractTenant,
  requireRole,
  createResponse,
  createErrorResponse,
  UserRoles,
  getPlatformDatabase,
} from '@properpos/backend-shared';

import { SubscriptionService } from '../services/SubscriptionService';

export const billingRoutes = Router();

const subscriptionService = new SubscriptionService();

billingRoutes.get('/subscription',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.user!.tenantId || req.tenant?.id;
    const user = req.user!;

    if (!tenantId) {
      res.status(400).json(createErrorResponse('Tenant ID is required', 'TENANT_ID_REQUIRED'));
      return;
    }

    try {
      const subscription = await subscriptionService.getSubscription(tenantId);

      if (!subscription) {
        res.status(404).json(createErrorResponse('No subscription found for this tenant', 'SUBSCRIPTION_NOT_FOUND'));
        return;
      }

      res.json(createResponse(subscription, 'Subscription retrieved successfully'));
    } catch (error) {
      logger.error('Get subscription error', {
        tenantId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
);

billingRoutes.get('/invoices',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.user!.tenantId || req.tenant?.id;
    const user = req.user!;

    if (!tenantId) {
      res.status(400).json(createErrorResponse('Tenant ID is required', 'TENANT_ID_REQUIRED'));
      return;
    }

    const {
      page = '1',
      limit = '10',
      status,
      startDate,
      endDate,
    } = req.query;

    const filters = {
      page: parseInt(page as string, 10),
      limit: parseInt(limit as string, 10),
      status: status as string | undefined,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    };

    try {
      const result = await subscriptionService.getSubscriptionInvoices(tenantId, filters);

      res.json(createResponse(result, 'Invoices retrieved successfully'));
    } catch (error) {
      logger.error('Get invoices error', {
        tenantId,
        userId: user.id,
        filters,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
);

billingRoutes.get('/plans',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const db = getPlatformDatabase();
      const plansCollection = db.collection('subscription_plans');

      const plans = await plansCollection
        .find({ isActive: true })
        .sort({ displayOrder: 1, createdAt: 1 })
        .toArray();

      if (plans.length === 0) {
        const defaultPlans = getDefaultPlans();
        res.json(createResponse(defaultPlans, 'Default subscription plans retrieved successfully'));
        return;
      }

      const processedPlans = plans.map((plan: any) => ({
        id: plan._id || plan.id,
        name: plan.name,
        slug: plan.slug,
        description: plan.description,
        category: plan.category,
        pricing: plan.pricing || {
          monthly: { amount: plan.monthlyPrice, currency: plan.currency || 'usd' },
          yearly: { amount: plan.yearlyPrice, currency: plan.currency || 'usd' },
        },
        features: plan.features,
        limits: plan.limits,
        trialDays: plan.trialDays || 0,
        isPopular: plan.isPopular || false,
        displayOrder: plan.displayOrder || 999,
        isActive: plan.isActive,
      }));

      res.json(createResponse(processedPlans, 'Subscription plans retrieved successfully'));
    } catch (error) {
      logger.error('Get plans error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      const defaultPlans = getDefaultPlans();
      res.json(createResponse(defaultPlans, 'Default subscription plans retrieved successfully'));
    }
  }
);

billingRoutes.post('/subscribe',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.user!.tenantId || req.tenant?.id;
    const user = req.user!;

    if (!tenantId) {
      res.status(400).json(createErrorResponse('Tenant ID is required', 'TENANT_ID_REQUIRED'));
      return;
    }

    const { planId, billingCycle, paymentMethodId, couponCode } = req.body;

    if (!planId) {
      res.status(400).json(createErrorResponse('Plan ID is required', 'PLAN_ID_REQUIRED'));
      return;
    }

    if (!billingCycle || !['monthly', 'yearly'].includes(billingCycle)) {
      res.status(400).json(createErrorResponse('Valid billing cycle (monthly or yearly) is required', 'INVALID_BILLING_CYCLE'));
      return;
    }

    try {
      const existingSubscription = await subscriptionService.getSubscription(tenantId);
      if (existingSubscription && !['cancelled', 'expired'].includes(existingSubscription.status)) {
        res.status(400).json(createErrorResponse(
          'An active subscription already exists for this tenant. Use the plan change endpoint to switch plans.',
          'SUBSCRIPTION_EXISTS'
        ));
        return;
      }

      const subscription = await subscriptionService.createSubscription(tenantId, {
        planId,
        billingCycle,
        paymentMethodId,
        couponCode,
        createdBy: user.id,
      });

      logger.audit('Subscription created via billing endpoint', {
        tenantId,
        subscriptionId: subscription.id,
        planId,
        billingCycle,
        createdBy: user.id,
        ip: req.ip,
      });

      res.status(201).json(createResponse(subscription, 'Subscription created successfully'));
    } catch (error) {
      logger.error('Subscribe error', {
        tenantId,
        userId: user.id,
        planId,
        billingCycle,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
);

billingRoutes.post('/cancel',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.user!.tenantId || req.tenant?.id;
    const user = req.user!;

    if (!tenantId) {
      res.status(400).json(createErrorResponse('Tenant ID is required', 'TENANT_ID_REQUIRED'));
      return;
    }

    const { reason, cancelAtPeriodEnd = true } = req.body;

    try {
      const subscription = await subscriptionService.getSubscription(tenantId);

      if (!subscription) {
        res.status(404).json(createErrorResponse('No subscription found', 'SUBSCRIPTION_NOT_FOUND'));
        return;
      }

      if (subscription.status === 'cancelled') {
        res.status(400).json(createErrorResponse('Subscription is already cancelled', 'SUBSCRIPTION_ALREADY_CANCELLED'));
        return;
      }

      const cancelledSubscription = await subscriptionService.cancelSubscription(tenantId, {
        reason: reason || 'Cancelled by user',
        cancelAtPeriodEnd,
        cancelledBy: user.id,
      });

      logger.audit('Subscription cancelled via billing endpoint', {
        tenantId,
        subscriptionId: subscription.id,
        reason,
        cancelAtPeriodEnd,
        cancelledBy: user.id,
        ip: req.ip,
      });

      res.json(createResponse(cancelledSubscription, 'Subscription cancelled successfully'));
    } catch (error) {
      logger.error('Cancel subscription error', {
        tenantId,
        userId: user.id,
        reason,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
);

billingRoutes.put('/update-payment',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.user!.tenantId || req.tenant?.id;
    const user = req.user!;

    if (!tenantId) {
      res.status(400).json(createErrorResponse('Tenant ID is required', 'TENANT_ID_REQUIRED'));
      return;
    }

    const { paymentMethodId } = req.body;

    if (!paymentMethodId) {
      res.status(400).json(createErrorResponse('Payment method ID is required', 'PAYMENT_METHOD_ID_REQUIRED'));
      return;
    }

    try {
      const subscription = await subscriptionService.getSubscription(tenantId);

      if (!subscription) {
        res.status(404).json(createErrorResponse('No subscription found', 'SUBSCRIPTION_NOT_FOUND'));
        return;
      }

      await subscriptionService.updatePaymentMethod(tenantId, paymentMethodId, user.id);

      logger.audit('Payment method updated via billing endpoint', {
        tenantId,
        subscriptionId: subscription.id,
        paymentMethodId,
        updatedBy: user.id,
        ip: req.ip,
      });

      res.json(createResponse({ updated: true, paymentMethodId }, 'Payment method updated successfully'));
    } catch (error) {
      logger.error('Update payment method error', {
        tenantId,
        userId: user.id,
        paymentMethodId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
);

billingRoutes.get('/history',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.user!.tenantId || req.tenant?.id;
    const user = req.user!;

    if (!tenantId) {
      res.status(400).json(createErrorResponse('Tenant ID is required', 'TENANT_ID_REQUIRED'));
      return;
    }

    const {
      page = '1',
      limit = '20',
      startDate,
      endDate,
    } = req.query;

    try {
      const db = getPlatformDatabase();
      const invoicesCollection = db.collection('invoices');

      const query: any = { tenantId };

      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate as string);
        if (endDate) query.createdAt.$lte = new Date(endDate as string);
      }

      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);

      const [invoices, totalCount] = await Promise.all([
        invoicesCollection
          .find(query)
          .sort({ createdAt: -1 })
          .skip((pageNum - 1) * limitNum)
          .limit(limitNum)
          .toArray(),
        invoicesCollection.countDocuments(query),
      ]);

      const totalAmount = await invoicesCollection.aggregate([
        { $match: { ...query, status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]).toArray();

      res.json(createResponse({
        invoices,
        pagination: {
          page: pageNum,
          limit: limitNum,
          totalCount,
          totalPages: Math.ceil(totalCount / limitNum),
        },
        summary: {
          totalPaid: totalAmount.length > 0 ? totalAmount[0].total : 0,
          invoiceCount: totalCount,
        },
      }, 'Billing history retrieved successfully'));
    } catch (error) {
      logger.error('Get billing history error', {
        tenantId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
);

billingRoutes.get('/upcoming',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.user!.tenantId || req.tenant?.id;
    const user = req.user!;

    if (!tenantId) {
      res.status(400).json(createErrorResponse('Tenant ID is required', 'TENANT_ID_REQUIRED'));
      return;
    }

    try {
      const subscription = await subscriptionService.getSubscription(tenantId);

      if (!subscription) {
        res.json(createResponse({
          hasUpcoming: false,
          message: 'No active subscription found',
        }, 'No upcoming billing'));
        return;
      }

      const addons = await subscriptionService.getSubscriptionAddons(tenantId);
      const addonTotal = addons.reduce((sum: number, addon: any) => {
        if (addon.status === 'active') {
          return sum + (addon.pricing?.amount || 0) * (addon.quantity || 1);
        }
        return sum;
      }, 0);

      const upcoming = {
        hasUpcoming: ['active', 'trialing', 'past_due'].includes(subscription.status),
        subscription: {
          planName: subscription.planName,
          billingCycle: subscription.billingCycle,
          amount: subscription.amount,
          currency: subscription.currency,
          status: subscription.status,
        },
        nextBillingDate: subscription.nextBillingDate,
        currentPeriodEnd: subscription.currentPeriodEnd,
        estimatedAmount: subscription.amount + addonTotal,
        addons: addons.filter((a: any) => a.status === 'active').map((addon: any) => ({
          name: addon.name,
          amount: addon.pricing?.amount || 0,
          quantity: addon.quantity || 1,
        })),
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd || false,
      };

      res.json(createResponse(upcoming, 'Upcoming billing retrieved successfully'));
    } catch (error) {
      logger.error('Get upcoming billing error', {
        tenantId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
);

billingRoutes.post('/retry-payment',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.user!.tenantId || req.tenant?.id;
    const user = req.user!;

    if (!tenantId) {
      res.status(400).json(createErrorResponse('Tenant ID is required', 'TENANT_ID_REQUIRED'));
      return;
    }

    try {
      const subscription = await subscriptionService.getSubscription(tenantId);

      if (!subscription) {
        res.status(404).json(createErrorResponse('No subscription found', 'SUBSCRIPTION_NOT_FOUND'));
        return;
      }

      if (subscription.status !== 'past_due') {
        res.status(400).json(createErrorResponse(
          'Payment retry is only available for past due subscriptions',
          'SUBSCRIPTION_NOT_PAST_DUE'
        ));
        return;
      }

      const db = getPlatformDatabase();
      const subscriptionsCollection = db.collection('subscriptions');

      await subscriptionsCollection.updateOne(
        { tenantId },
        {
          $set: {
            paymentRetryRequested: true,
            paymentRetryRequestedAt: new Date(),
            paymentRetryRequestedBy: user.id,
            updatedAt: new Date(),
          },
        }
      );

      logger.audit('Payment retry requested', {
        tenantId,
        subscriptionId: subscription.id,
        requestedBy: user.id,
        ip: req.ip,
      });

      res.json(createResponse({
        retryInitiated: true,
        subscriptionId: subscription.id,
        status: subscription.status,
      }, 'Payment retry initiated successfully'));
    } catch (error) {
      logger.error('Retry payment error', {
        tenantId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
);

function getDefaultPlans() {
  return [
    {
      id: 'free',
      name: 'Free',
      slug: 'free',
      description: 'Get started with basic POS features',
      category: 'standard',
      pricing: {
        monthly: { amount: 0, currency: 'usd' },
        yearly: { amount: 0, currency: 'usd' },
        yearlyDiscount: 0,
      },
      features: [
        'Single location',
        'Up to 100 products',
        'Basic reporting',
        'Email support',
      ],
      limits: {
        locations: 1,
        users: 2,
        products: 100,
        monthlyOrders: 500,
        storageGB: 1,
      },
      trialDays: 0,
      isPopular: false,
      displayOrder: 1,
      isActive: true,
    },
    {
      id: 'starter',
      name: 'Starter',
      slug: 'starter',
      description: 'Perfect for small businesses getting started',
      category: 'standard',
      pricing: {
        monthly: { amount: 29, currency: 'usd' },
        yearly: { amount: 290, currency: 'usd' },
        yearlyDiscount: 17,
      },
      features: [
        'Up to 2 locations',
        'Up to 1,000 products',
        'Standard reporting',
        'Inventory management',
        'Customer management',
        'Email & chat support',
      ],
      limits: {
        locations: 2,
        users: 5,
        products: 1000,
        monthlyOrders: 2000,
        storageGB: 5,
      },
      trialDays: 14,
      isPopular: false,
      displayOrder: 2,
      isActive: true,
    },
    {
      id: 'professional',
      name: 'Professional',
      slug: 'professional',
      description: 'For growing businesses that need more power',
      category: 'standard',
      pricing: {
        monthly: { amount: 79, currency: 'usd' },
        yearly: { amount: 790, currency: 'usd' },
        yearlyDiscount: 17,
      },
      features: [
        'Up to 10 locations',
        'Unlimited products',
        'Advanced reporting & analytics',
        'Inventory management',
        'Customer loyalty program',
        'Multi-location management',
        'API access',
        'Priority support',
      ],
      limits: {
        locations: 10,
        users: 25,
        products: -1,
        monthlyOrders: 10000,
        storageGB: 25,
      },
      trialDays: 14,
      isPopular: true,
      displayOrder: 3,
      isActive: true,
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      slug: 'enterprise',
      description: 'For large organizations with custom requirements',
      category: 'enterprise',
      pricing: {
        monthly: { amount: 199, currency: 'usd' },
        yearly: { amount: 1990, currency: 'usd' },
        yearlyDiscount: 17,
      },
      features: [
        'Unlimited locations',
        'Unlimited products',
        'Custom reporting & analytics',
        'Advanced inventory management',
        'Customer loyalty program',
        'Multi-location management',
        'Full API access',
        'Dedicated account manager',
        'Custom integrations',
        'SLA guarantee',
        'White-label options',
        '24/7 phone support',
      ],
      limits: {
        locations: -1,
        users: -1,
        products: -1,
        monthlyOrders: -1,
        storageGB: 100,
      },
      trialDays: 30,
      isPopular: false,
      displayOrder: 4,
      isActive: true,
    },
  ];
}
