// Subscription management routes

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

import { SubscriptionService } from '../services/SubscriptionService';

export const subscriptionRoutes = Router();

// Initialize services
const subscriptionService = new SubscriptionService();

/**
 * @swagger
 * /api/v1/subscriptions:
 *   get:
 *     tags: [Subscriptions]
 *     summary: Get tenant subscription details
 *     security:
 *       - BearerAuth: []
 *       - TenantHeader: []
 */
subscriptionRoutes.get('/',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;

    try {
      const subscription = await subscriptionService.getSubscription(tenantId);

      if (!subscription) {
        res.status(404).json(createErrorResponse('No subscription found', 'SUBSCRIPTION_NOT_FOUND'));
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

/**
 * @swagger
 * /api/v1/subscriptions:
 *   post:
 *     tags: [Subscriptions]
 *     summary: Create new subscription
 */
subscriptionRoutes.post('/',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  validationMiddleware.createSubscription,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const subscriptionData = req.body;

    try {
      // Check if subscription already exists
      const existingSubscription = await subscriptionService.getSubscription(tenantId);
      if (existingSubscription) {
        res.status(400).json(createErrorResponse(
          'Subscription already exists for this tenant',
          'SUBSCRIPTION_EXISTS'
        ));
        return;
      }

      const subscription = await subscriptionService.createSubscription(tenantId, {
        ...subscriptionData,
        createdBy: user.id,
      });

      logger.audit('Subscription created', {
        tenantId,
        subscriptionId: subscription.id,
        planId: subscription.planId,
        billingCycle: subscription.billingCycle,
        createdBy: user.id,
        ip: req.ip,
      });

      res.status(201).json(createResponse(subscription, 'Subscription created successfully'));

    } catch (error) {
      logger.error('Create subscription error', {
        tenantId,
        userId: user.id,
        subscriptionData,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/subscriptions/plan:
 *   put:
 *     tags: [Subscriptions]
 *     summary: Update subscription plan
 */
subscriptionRoutes.put('/plan',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  validationMiddleware.updateSubscriptionPlan,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { planId, billingCycle, effectiveDate } = req.body;

    try {
      const subscription = await subscriptionService.getSubscription(tenantId);
      if (!subscription) {
        res.status(404).json(createErrorResponse('No subscription found', 'SUBSCRIPTION_NOT_FOUND'));
        return;
      }

      const updatedSubscription = await subscriptionService.changePlan(tenantId, {
        planId,
        billingCycle,
        effectiveDate: effectiveDate ? new Date(effectiveDate) : undefined,
        changedBy: user.id,
      });

      logger.audit('Subscription plan changed', {
        tenantId,
        subscriptionId: subscription.id,
        previousPlan: subscription.planId,
        newPlan: planId,
        previousBillingCycle: subscription.billingCycle,
        newBillingCycle: billingCycle,
        changedBy: user.id,
        ip: req.ip,
      });

      res.json(createResponse(updatedSubscription, 'Subscription plan updated successfully'));

    } catch (error) {
      logger.error('Update subscription plan error', {
        tenantId,
        planId,
        billingCycle,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/subscriptions/cancel:
 *   post:
 *     tags: [Subscriptions]
 *     summary: Cancel subscription
 */
subscriptionRoutes.post('/cancel',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { reason, cancelAtPeriodEnd = true } = req.body;

    try {
      const subscription = await subscriptionService.getSubscription(tenantId);
      if (!subscription) {
        res.status(404).json(createErrorResponse('No subscription found', 'SUBSCRIPTION_NOT_FOUND'));
        return;
      }

      if (subscription.status === 'cancelled') {
        res.status(400).json(createErrorResponse(
          'Subscription is already cancelled',
          'SUBSCRIPTION_ALREADY_CANCELLED'
        ));
        return;
      }

      const cancelledSubscription = await subscriptionService.cancelSubscription(tenantId, {
        reason,
        cancelAtPeriodEnd,
        cancelledBy: user.id,
      });

      logger.audit('Subscription cancelled', {
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
        reason,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/subscriptions/reactivate:
 *   post:
 *     tags: [Subscriptions]
 *     summary: Reactivate cancelled subscription
 */
subscriptionRoutes.post('/reactivate',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { planId, billingCycle } = req.body;

    try {
      const subscription = await subscriptionService.getSubscription(tenantId);
      if (!subscription) {
        res.status(404).json(createErrorResponse('No subscription found', 'SUBSCRIPTION_NOT_FOUND'));
        return;
      }

      if (subscription.status !== 'cancelled') {
        res.status(400).json(createErrorResponse(
          'Only cancelled subscriptions can be reactivated',
          'SUBSCRIPTION_NOT_CANCELLED'
        ));
        return;
      }

      const reactivatedSubscription = await subscriptionService.reactivateSubscription(tenantId, {
        planId: planId || subscription.planId,
        billingCycle: billingCycle || subscription.billingCycle,
        reactivatedBy: user.id,
      });

      logger.audit('Subscription reactivated', {
        tenantId,
        subscriptionId: subscription.id,
        planId: planId || subscription.planId,
        billingCycle: billingCycle || subscription.billingCycle,
        reactivatedBy: user.id,
        ip: req.ip,
      });

      res.json(createResponse(reactivatedSubscription, 'Subscription reactivated successfully'));

    } catch (error) {
      logger.error('Reactivate subscription error', {
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
 * /api/v1/subscriptions/usage:
 *   get:
 *     tags: [Subscriptions]
 *     summary: Get current usage metrics
 */
subscriptionRoutes.get('/usage',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { period = 'current_month' } = req.query;

    try {
      const usage = await subscriptionService.getUsageMetrics(tenantId, {
        period: period as string,
      });

      res.json(createResponse(usage, 'Usage metrics retrieved successfully'));

    } catch (error) {
      logger.error('Get usage metrics error', {
        tenantId,
        period,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/subscriptions/invoices:
 *   get:
 *     tags: [Subscriptions]
 *     summary: Get subscription invoices
 */
subscriptionRoutes.get('/invoices',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const {
      page = 1,
      limit = 10,
      status,
      startDate,
      endDate
    } = req.query;

    const filters = {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      status: status as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    };

    try {
      const invoices = await subscriptionService.getSubscriptionInvoices(tenantId, filters);

      res.json(createResponse(invoices, 'Subscription invoices retrieved successfully'));

    } catch (error) {
      logger.error('Get subscription invoices error', {
        tenantId,
        userId: user.id,
        filters,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/subscriptions/payment-method:
 *   put:
 *     tags: [Subscriptions]
 *     summary: Update default payment method for subscription
 */
subscriptionRoutes.put('/payment-method',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { paymentMethodId } = req.body;

    if (!paymentMethodId) {
      res.status(400).json(createErrorResponse(
        'Payment method ID is required',
        'PAYMENT_METHOD_ID_REQUIRED'
      ));
      return;
    }

    try {
      const subscription = await subscriptionService.getSubscription(tenantId);
      if (!subscription) {
        res.status(404).json(createErrorResponse('No subscription found', 'SUBSCRIPTION_NOT_FOUND'));
        return;
      }

      await subscriptionService.updatePaymentMethod(tenantId, paymentMethodId, user.id);

      logger.audit('Subscription payment method updated', {
        tenantId,
        subscriptionId: subscription.id,
        paymentMethodId,
        updatedBy: user.id,
        ip: req.ip,
      });

      res.json(createResponse({}, 'Payment method updated successfully'));

    } catch (error) {
      logger.error('Update payment method error', {
        tenantId,
        paymentMethodId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/subscriptions/preview:
 *   post:
 *     tags: [Subscriptions]
 *     summary: Preview subscription plan change
 */
subscriptionRoutes.post('/preview',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { planId, billingCycle } = req.body;

    try {
      const subscription = await subscriptionService.getSubscription(tenantId);
      if (!subscription) {
        res.status(404).json(createErrorResponse('No subscription found', 'SUBSCRIPTION_NOT_FOUND'));
        return;
      }

      const preview = await subscriptionService.previewPlanChange(tenantId, {
        planId,
        billingCycle,
      });

      res.json(createResponse(preview, 'Plan change preview generated successfully'));

    } catch (error) {
      logger.error('Preview plan change error', {
        tenantId,
        planId,
        billingCycle,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/subscriptions/trial:
 *   post:
 *     tags: [Subscriptions]
 *     summary: Start trial subscription
 */
subscriptionRoutes.post('/trial',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { planId, trialDays = 14 } = req.body;

    try {
      // Check if tenant already has/had a subscription
      const existingSubscription = await subscriptionService.getSubscription(tenantId);
      if (existingSubscription) {
        res.status(400).json(createErrorResponse(
          'Trial is only available for new customers',
          'TRIAL_NOT_AVAILABLE'
        ));
        return;
      }

      const trialSubscription = await subscriptionService.startTrial(tenantId, {
        planId,
        trialDays,
        startedBy: user.id,
      });

      logger.audit('Trial subscription started', {
        tenantId,
        subscriptionId: trialSubscription.id,
        planId,
        trialDays,
        startedBy: user.id,
        ip: req.ip,
      });

      res.status(201).json(createResponse(trialSubscription, 'Trial subscription started successfully'));

    } catch (error) {
      logger.error('Start trial error', {
        tenantId,
        planId,
        trialDays,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/subscriptions/addons:
 *   get:
 *     tags: [Subscriptions]
 *     summary: Get subscription add-ons
 */
subscriptionRoutes.get('/addons',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;

    try {
      const addons = await subscriptionService.getSubscriptionAddons(tenantId);

      res.json(createResponse(addons, 'Subscription add-ons retrieved successfully'));

    } catch (error) {
      logger.error('Get subscription add-ons error', {
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
 * /api/v1/subscriptions/addons:
 *   post:
 *     tags: [Subscriptions]
 *     summary: Add subscription add-on
 */
subscriptionRoutes.post('/addons',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { addonType, name, description, amount, currency, billingCycle, quantity = 1 } = req.body;

    try {
      const subscription = await subscriptionService.getSubscription(tenantId);
      if (!subscription) {
        res.status(404).json(createErrorResponse('No subscription found', 'SUBSCRIPTION_NOT_FOUND'));
        return;
      }

      const addon = await subscriptionService.addSubscriptionAddon(tenantId, {
        addonType,
        name,
        description,
        amount,
        currency,
        billingCycle,
        quantity,
        addedBy: user.id,
      });

      logger.audit('Subscription add-on added', {
        tenantId,
        subscriptionId: subscription.id,
        addonType,
        name,
        quantity,
        addedBy: user.id,
        ip: req.ip,
      });

      res.status(201).json(createResponse(addon, 'Add-on added to subscription successfully'));

    } catch (error) {
      logger.error('Add subscription add-on error', {
        tenantId,
        addonType,
        name,
        quantity,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/subscriptions/addons/{addonId}:
 *   delete:
 *     tags: [Subscriptions]
 *     summary: Remove subscription add-on
 */
subscriptionRoutes.delete('/addons/:addonId',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { addonId } = req.params;

    try {
      const subscription = await subscriptionService.getSubscription(tenantId);
      if (!subscription) {
        res.status(404).json(createErrorResponse('No subscription found', 'SUBSCRIPTION_NOT_FOUND'));
        return;
      }

      await subscriptionService.removeSubscriptionAddon(tenantId, addonId, user.id);

      logger.audit('Subscription add-on removed', {
        tenantId,
        subscriptionId: subscription.id,
        addonId,
        removedBy: user.id,
        ip: req.ip,
      });

      res.json(createResponse({}, 'Add-on removed from subscription successfully'));

    } catch (error) {
      logger.error('Remove subscription add-on error', {
        tenantId,
        addonId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);