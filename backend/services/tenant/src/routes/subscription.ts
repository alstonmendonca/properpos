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
  SubscriptionPlans,
} from '@properpos/backend-shared';

import { SubscriptionService } from '../services/SubscriptionService';
import { OrganizationService } from '../services/OrganizationService';

export const subscriptionRoutes = Router();

// Initialize services
const subscriptionService = new SubscriptionService();
const organizationService = new OrganizationService();

/**
 * @swagger
 * /api/v1/subscriptions/current:
 *   get:
 *     tags: [Subscriptions]
 *     summary: Get current subscription details
 *     security:
 *       - BearerAuth: []
 *       - TenantHeader: []
 */
subscriptionRoutes.get('/current',
  authenticate,
  extractTenant,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;

    try {
      const subscription = await subscriptionService.getSubscriptionByTenantId(tenantId);

      if (!subscription) {
        res.status(404).json(createErrorResponse('Subscription not found', 'SUBSCRIPTION_NOT_FOUND'));
        return;
      }

      res.json(createResponse(subscription, 'Subscription details retrieved'));

    } catch (error) {
      logger.error('Get current subscription error', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/subscriptions/plans:
 *   get:
 *     tags: [Subscriptions]
 *     summary: Get available subscription plans
 */
subscriptionRoutes.get('/plans', async (req: Request, res: Response) => {
  try {
    const plans = await subscriptionService.getAvailablePlans();

    res.json(createResponse(plans, 'Subscription plans retrieved'));

  } catch (error) {
    logger.error('Get subscription plans error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
});

/**
 * @swagger
 * /api/v1/subscriptions/current/upgrade:
 *   post:
 *     tags: [Subscriptions]
 *     summary: Upgrade subscription plan
 */
subscriptionRoutes.post('/current/upgrade',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER]),
  validationMiddleware.upgradeSubscription,
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { plan, billingCycle, paymentMethodId } = req.body;

    try {
      const upgradeResult = await subscriptionService.upgradeSubscription({
        tenantId,
        newPlan: plan,
        billingCycle,
        paymentMethodId,
        upgradedBy: user.id,
      });

      logger.audit('Subscription upgraded', {
        tenantId,
        upgradedBy: user.id,
        fromPlan: upgradeResult.previousPlan,
        toPlan: plan,
        billingCycle,
        ip: req.ip,
      });

      res.json(createResponse(upgradeResult, 'Subscription upgraded successfully'));

    } catch (error) {
      logger.error('Upgrade subscription error', {
        tenantId,
        userId: user.id,
        plan,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/subscriptions/current/downgrade:
 *   post:
 *     tags: [Subscriptions]
 *     summary: Downgrade subscription plan
 */
subscriptionRoutes.post('/current/downgrade',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER]),
  validationMiddleware.downgradeSubscription,
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { plan, effectiveDate } = req.body;

    try {
      const downgradeResult = await subscriptionService.downgradeSubscription({
        tenantId,
        newPlan: plan,
        effectiveDate: effectiveDate ? new Date(effectiveDate) : undefined,
        downgradedBy: user.id,
      });

      logger.audit('Subscription downgraded', {
        tenantId,
        downgradedBy: user.id,
        fromPlan: downgradeResult.previousPlan,
        toPlan: plan,
        effectiveDate: downgradeResult.effectiveDate,
        ip: req.ip,
      });

      res.json(createResponse(downgradeResult, 'Subscription downgrade scheduled'));

    } catch (error) {
      logger.error('Downgrade subscription error', {
        tenantId,
        userId: user.id,
        plan,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/subscriptions/current/cancel:
 *   post:
 *     tags: [Subscriptions]
 *     summary: Cancel subscription
 */
subscriptionRoutes.post('/current/cancel',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER]),
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { reason, cancelImmediately = false } = req.body;

    try {
      const cancellationResult = await subscriptionService.cancelSubscription({
        tenantId,
        reason,
        cancelImmediately,
        cancelledBy: user.id,
      });

      logger.audit('Subscription cancelled', {
        tenantId,
        cancelledBy: user.id,
        reason,
        cancelImmediately,
        effectiveDate: cancellationResult.effectiveDate,
        ip: req.ip,
      });

      res.json(createResponse(cancellationResult, 'Subscription cancellation processed'));

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

/**
 * @swagger
 * /api/v1/subscriptions/current/reactivate:
 *   post:
 *     tags: [Subscriptions]
 *     summary: Reactivate cancelled subscription
 */
subscriptionRoutes.post('/current/reactivate',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER]),
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { paymentMethodId } = req.body;

    try {
      const reactivationResult = await subscriptionService.reactivateSubscription({
        tenantId,
        paymentMethodId,
        reactivatedBy: user.id,
      });

      logger.audit('Subscription reactivated', {
        tenantId,
        reactivatedBy: user.id,
        ip: req.ip,
      });

      res.json(createResponse(reactivationResult, 'Subscription reactivated successfully'));

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
 * /api/v1/subscriptions/current/billing-cycle:
 *   put:
 *     tags: [Subscriptions]
 *     summary: Change billing cycle
 */
subscriptionRoutes.put('/current/billing-cycle',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { billingCycle } = req.body;

    if (!['monthly', 'yearly'].includes(billingCycle)) {
      res.status(400).json(createErrorResponse('Invalid billing cycle', 'INVALID_BILLING_CYCLE'));
      return;
    }

    try {
      const result = await subscriptionService.changeBillingCycle({
        tenantId,
        newBillingCycle: billingCycle,
        changedBy: user.id,
      });

      logger.audit('Billing cycle changed', {
        tenantId,
        changedBy: user.id,
        newBillingCycle: billingCycle,
        effectiveDate: result.effectiveDate,
        ip: req.ip,
      });

      res.json(createResponse(result, 'Billing cycle updated successfully'));

    } catch (error) {
      logger.error('Change billing cycle error', {
        tenantId,
        userId: user.id,
        billingCycle,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/subscriptions/current/payment-method:
 *   put:
 *     tags: [Subscriptions]
 *     summary: Update payment method
 */
subscriptionRoutes.put('/current/payment-method',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { paymentMethodId } = req.body;

    if (!paymentMethodId) {
      res.status(400).json(createErrorResponse('Payment method ID is required', 'PAYMENT_METHOD_REQUIRED'));
      return;
    }

    try {
      await subscriptionService.updatePaymentMethod({
        tenantId,
        paymentMethodId,
        updatedBy: user.id,
      });

      logger.audit('Payment method updated', {
        tenantId,
        updatedBy: user.id,
        paymentMethodId,
        ip: req.ip,
      });

      res.json(createResponse({}, 'Payment method updated successfully'));

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

/**
 * @swagger
 * /api/v1/subscriptions/current/usage:
 *   get:
 *     tags: [Subscriptions]
 *     summary: Get current usage statistics
 */
subscriptionRoutes.get('/current/usage',
  authenticate,
  extractTenant,
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.id;

    try {
      const usage = await subscriptionService.getCurrentUsage(tenantId);

      res.json(createResponse(usage, 'Usage statistics retrieved'));

    } catch (error) {
      logger.error('Get usage statistics error', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/subscriptions/current/invoices:
 *   get:
 *     tags: [Subscriptions]
 *     summary: Get subscription invoices
 */
subscriptionRoutes.get('/current/invoices',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.id;
    const { page = 1, limit = 20, status } = req.query;

    try {
      const invoices = await subscriptionService.getInvoices(tenantId, {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        status: status as string,
      });

      res.json(createResponse(invoices, 'Invoices retrieved'));

    } catch (error) {
      logger.error('Get invoices error', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/subscriptions/current/trial/extend:
 *   post:
 *     tags: [Subscriptions]
 *     summary: Extend trial period (super admin only)
 */
subscriptionRoutes.post('/current/trial/extend',
  authenticate,
  extractTenant,
  requireRole([UserRoles.SUPER_ADMIN]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { days, reason } = req.body;

    if (!days || days <= 0) {
      res.status(400).json(createErrorResponse('Number of days must be positive', 'INVALID_DAYS'));
      return;
    }

    try {
      const result = await subscriptionService.extendTrial({
        tenantId,
        additionalDays: days,
        reason,
        extendedBy: user.id,
      });

      logger.audit('Trial extended', {
        tenantId,
        extendedBy: user.id,
        additionalDays: days,
        newTrialEnd: result.newTrialEnd,
        reason,
        ip: req.ip,
      });

      res.json(createResponse(result, 'Trial period extended successfully'));

    } catch (error) {
      logger.error('Extend trial error', {
        tenantId,
        userId: user.id,
        days,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);