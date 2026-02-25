// Billing Job Service for scheduled billing tasks

import moment from 'moment';
import Stripe from 'stripe';

import {
  logger,
  getPlatformDatabase,
} from '@properpos/backend-shared';

import { SubscriptionService } from './SubscriptionService';

interface ProcessingResult {
  processed: number;
  succeeded: number;
  failed: number;
  errors: string[];
}

// Extended subscription interface for billing operations
interface BillingSubscription {
  id: string;
  tenantId: string;
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  paymentMethodId?: string;
  planId: string;
  planName: string;
  status: string;
  billingCycle: 'monthly' | 'yearly';
  amount: number;
  currency: string;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  nextBillingDate?: Date;
  trialEndDate?: Date;
  cancelAtPeriodEnd?: boolean;
  lastPaymentDate?: Date;
  lastPaymentAmount?: number;
}

export class BillingJobService {
  private subscriptionService: SubscriptionService;
  private stripe: Stripe;

  constructor() {
    this.subscriptionService = new SubscriptionService();
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2023-10-16' as const,
    });
  }

  /**
   * Daily billing processing
   * - Process subscriptions due for billing
   * - Handle trial expirations
   * - Send billing reminders
   */
  async runDailyBilling(): Promise<ProcessingResult> {
    const result: ProcessingResult = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: [],
    };

    try {
      const db = getPlatformDatabase();
      const subscriptionsCollection = db.collection('subscriptions');

      const today = moment().startOf('day').toDate();
      const tomorrow = moment().add(1, 'day').startOf('day').toDate();

      // 1. Process trial expirations
      const expiringTrials = await subscriptionsCollection
        .find({
          status: 'trialing',
          trialEndDate: { $gte: today, $lt: tomorrow },
        })
        .toArray();

      for (const subscription of expiringTrials) {
        result.processed++;
        try {
          await this.handleTrialExpiration(subscription);
          result.succeeded++;
        } catch (error) {
          result.failed++;
          result.errors.push(`Trial expiration failed for ${subscription.tenantId}: ${error instanceof Error ? error.message : 'Unknown'}`);
        }
      }

      // 2. Process subscriptions due for billing today
      const dueBillings = await subscriptionsCollection
        .find({
          status: 'active',
          nextBillingDate: { $gte: today, $lt: tomorrow },
        })
        .toArray();

      for (const subscription of dueBillings) {
        result.processed++;
        try {
          await this.processBilling(subscription);
          result.succeeded++;
        } catch (error) {
          result.failed++;
          result.errors.push(`Billing failed for ${subscription.tenantId}: ${error instanceof Error ? error.message : 'Unknown'}`);
        }
      }

      // 3. Send billing reminders (3 days before due date)
      const reminderDate = moment().add(3, 'days').startOf('day').toDate();
      const reminderEndDate = moment().add(4, 'days').startOf('day').toDate();

      const needReminder = await subscriptionsCollection
        .find({
          status: 'active',
          nextBillingDate: { $gte: reminderDate, $lt: reminderEndDate },
        })
        .toArray();

      for (const subscription of needReminder) {
        try {
          await this.sendBillingReminder(subscription);
        } catch (error) {
          logger.warn('Failed to send billing reminder', {
            tenantId: subscription.tenantId,
            error: error instanceof Error ? error.message : 'Unknown',
          });
        }
      }

      logger.info('Daily billing processing completed', result);
      return result;
    } catch (error) {
      logger.error('Daily billing processing failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Monthly subscription renewals
   * - Process yearly subscriptions due for renewal
   * - Generate renewal invoices
   */
  async runMonthlyRenewals(): Promise<ProcessingResult> {
    const result: ProcessingResult = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: [],
    };

    try {
      const db = getPlatformDatabase();
      const subscriptionsCollection = db.collection('subscriptions');

      const startOfMonth = moment().startOf('month').toDate();
      const endOfMonth = moment().endOf('month').toDate();

      // Find subscriptions expiring this month
      const expiringSubscriptions = await subscriptionsCollection
        .find({
          status: 'active',
          currentPeriodEnd: { $gte: startOfMonth, $lte: endOfMonth },
          cancelAtPeriodEnd: { $ne: true },
        })
        .toArray();

      for (const subscription of expiringSubscriptions) {
        result.processed++;
        try {
          await this.processRenewal(subscription);
          result.succeeded++;
        } catch (error) {
          result.failed++;
          result.errors.push(`Renewal failed for ${subscription.tenantId}: ${error instanceof Error ? error.message : 'Unknown'}`);
        }
      }

      logger.info('Monthly renewals processing completed', result);
      return result;
    } catch (error) {
      logger.error('Monthly renewals processing failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Failed payment retry
   * - Retry failed payments
   * - Update subscription status after multiple failures
   */
  async runFailedPaymentRetry(): Promise<ProcessingResult> {
    const result: ProcessingResult = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: [],
    };

    try {
      const db = getPlatformDatabase();
      const subscriptionsCollection = db.collection('subscriptions');
      const failedPaymentsCollection = db.collection('failed_payments');

      // Find subscriptions with past_due status
      const pastDueSubscriptions = await subscriptionsCollection
        .find({
          status: 'past_due',
        })
        .toArray();

      for (const subscription of pastDueSubscriptions) {
        result.processed++;

        // Check retry history
        const retryHistory = await failedPaymentsCollection.findOne({
          subscriptionId: subscription.id,
          resolved: false,
        });

        const retryCount = retryHistory?.retryCount || 0;
        const maxRetries = 3;

        if (retryCount >= maxRetries) {
          // Max retries exceeded, suspend subscription
          try {
            await subscriptionsCollection.updateOne(
              { id: subscription.id },
              {
                $set: {
                  status: 'suspended',
                  suspendedAt: new Date(),
                  suspendedReason: 'Payment failed after multiple retries',
                  updatedAt: new Date(),
                },
              }
            );

            logger.warn('Subscription suspended due to payment failures', {
              tenantId: subscription.tenantId,
              subscriptionId: subscription.id,
              retryCount,
            });

            result.failed++;
            result.errors.push(`Subscription ${subscription.tenantId} suspended after ${retryCount} failed retries`);
          } catch (error) {
            result.failed++;
            result.errors.push(`Failed to suspend ${subscription.tenantId}: ${error instanceof Error ? error.message : 'Unknown'}`);
          }
          continue;
        }

        // Attempt payment retry
        try {
          const success = await this.retryPayment(subscription);

          if (success) {
            // Mark subscription as active
            await subscriptionsCollection.updateOne(
              { id: subscription.id },
              {
                $set: {
                  status: 'active',
                  updatedAt: new Date(),
                },
              }
            );

            // Resolve the failed payment record
            await failedPaymentsCollection.updateOne(
              { subscriptionId: subscription.id, resolved: false },
              {
                $set: {
                  resolved: true,
                  resolvedAt: new Date(),
                },
              }
            );

            result.succeeded++;
            logger.info('Payment retry succeeded', {
              tenantId: subscription.tenantId,
              subscriptionId: subscription.id,
            });
          } else {
            // Update retry count
            await failedPaymentsCollection.updateOne(
              { subscriptionId: subscription.id, resolved: false },
              {
                $inc: { retryCount: 1 },
                $set: { lastRetryAt: new Date() },
              },
              { upsert: true }
            );

            result.failed++;
            logger.warn('Payment retry failed', {
              tenantId: subscription.tenantId,
              subscriptionId: subscription.id,
              retryCount: retryCount + 1,
            });
          }
        } catch (error) {
          result.failed++;
          result.errors.push(`Retry failed for ${subscription.tenantId}: ${error instanceof Error ? error.message : 'Unknown'}`);
        }
      }

      logger.info('Failed payment retry completed', result);
      return result;
    } catch (error) {
      logger.error('Failed payment retry processing failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Usage tracking aggregation
   * - Aggregate usage metrics for all tenants
   * - Check for usage limit violations
   */
  async runUsageAggregation(): Promise<ProcessingResult> {
    const result: ProcessingResult = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: [],
    };

    try {
      const db = getPlatformDatabase();
      const tenantsCollection = db.collection('tenants');
      const usageMetricsCollection = db.collection('usage_metrics');

      // Get all active tenants
      const activeTenants = await tenantsCollection
        .find({ isActive: true })
        .project({ id: 1, name: 1 })
        .toArray();

      for (const tenant of activeTenants) {
        result.processed++;

        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const metrics: any = await this.subscriptionService.getUsageMetrics(tenant.id);

          // Store usage metrics - structure may vary based on subscription service implementation
          await usageMetricsCollection.updateOne(
            {
              tenantId: tenant.id,
              period: 'current',
            },
            {
              $set: {
                tenantId: tenant.id,
                period: 'current',
                metrics: {
                  locations: metrics.locations?.current ?? metrics.locations ?? 0,
                  users: metrics.users?.current ?? metrics.users ?? 0,
                  products: metrics.products?.current ?? metrics.products ?? 0,
                  orders: metrics.ordersThisMonth?.current ?? metrics.orders ?? 0,
                  storageBytes: (metrics.storage?.current ?? metrics.storageUsed ?? 0) * 1024 * 1024 * 1024,
                },
                limits: {
                  locations: metrics.locations?.limit ?? 0,
                  users: metrics.users?.limit ?? 0,
                  products: metrics.products?.limit ?? 0,
                  monthlyOrders: metrics.ordersThisMonth?.limit ?? 0,
                  storageGB: metrics.storage?.limit ?? 0,
                },
                percentages: {
                  locations: metrics.locations?.percentage ?? 0,
                  users: metrics.users?.percentage ?? 0,
                  products: metrics.products?.percentage ?? 0,
                  orders: metrics.ordersThisMonth?.percentage ?? 0,
                  storage: metrics.storage?.percentage ?? 0,
                },
                updatedAt: new Date(),
              },
            },
            { upsert: true }
          );

          // Check for limit violations
          const violations = this.checkLimitViolations(metrics);
          if (violations.length > 0) {
            await this.handleLimitViolations(tenant.id, violations);
          }

          result.succeeded++;
        } catch (error) {
          result.failed++;
          result.errors.push(`Usage aggregation failed for ${tenant.id}: ${error instanceof Error ? error.message : 'Unknown'}`);
        }
      }

      logger.info('Usage aggregation completed', result);
      return result;
    } catch (error) {
      logger.error('Usage aggregation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  // Private helper methods

  private async handleTrialExpiration(subscription: BillingSubscription): Promise<void> {
    const db = getPlatformDatabase();
    const subscriptionsCollection = db.collection('subscriptions');

    // Check if payment method exists
    if (subscription.paymentMethodId) {
      // Convert to paid subscription
      try {
        await this.processBilling(subscription);
        await subscriptionsCollection.updateOne(
          { id: subscription.id },
          {
            $set: {
              status: 'active',
              updatedAt: new Date(),
            },
          }
        );

        logger.info('Trial converted to paid subscription', {
          tenantId: subscription.tenantId,
          subscriptionId: subscription.id,
        });
      } catch (error) {
        // Set to past_due if payment fails
        await subscriptionsCollection.updateOne(
          { id: subscription.id },
          {
            $set: {
              status: 'past_due',
              updatedAt: new Date(),
            },
          }
        );
        throw error;
      }
    } else {
      // No payment method, downgrade to free or suspend
      await subscriptionsCollection.updateOne(
        { id: subscription.id },
        {
          $set: {
            status: 'expired',
            expiredAt: new Date(),
            updatedAt: new Date(),
          },
        }
      );

      logger.info('Trial expired without payment method', {
        tenantId: subscription.tenantId,
        subscriptionId: subscription.id,
      });

      // TODO: Send trial expiration notification
    }
  }

  private async processBilling(subscription: BillingSubscription): Promise<void> {
    if (!subscription.stripeCustomerId || !subscription.paymentMethodId) {
      throw new Error('No payment method configured');
    }

    // Create payment intent
    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: Math.round(subscription.amount * 100),
      currency: subscription.currency.toLowerCase(),
      customer: subscription.stripeCustomerId,
      payment_method: subscription.paymentMethodId,
      off_session: true,
      confirm: true,
      metadata: {
        tenantId: subscription.tenantId,
        subscriptionId: subscription.id,
      },
    });

    if (paymentIntent.status !== 'succeeded') {
      throw new Error(`Payment failed with status: ${paymentIntent.status}`);
    }

    // Update subscription billing dates
    const db = getPlatformDatabase();
    const subscriptionsCollection = db.collection('subscriptions');

    const now = new Date();
    const nextBillingDate = subscription.billingCycle === 'yearly'
      ? moment(now).add(1, 'year').toDate()
      : moment(now).add(1, 'month').toDate();

    await subscriptionsCollection.updateOne(
      { id: subscription.id },
      {
        $set: {
          currentPeriodStart: now,
          currentPeriodEnd: nextBillingDate,
          nextBillingDate,
          lastPaymentDate: now,
          lastPaymentAmount: subscription.amount,
          updatedAt: now,
        },
      }
    );

    // Create invoice record
    await this.createInvoice(subscription, paymentIntent.id);

    logger.info('Billing processed successfully', {
      tenantId: subscription.tenantId,
      subscriptionId: subscription.id,
      amount: subscription.amount,
      paymentIntentId: paymentIntent.id,
    });
  }

  private async processRenewal(subscription: BillingSubscription): Promise<void> {
    // For Stripe subscriptions, renewal is automatic
    if (subscription.stripeSubscriptionId) {
      logger.info('Subscription renewal managed by Stripe', {
        tenantId: subscription.tenantId,
        subscriptionId: subscription.id,
      });
      return;
    }

    // For manual subscriptions, process billing
    await this.processBilling(subscription);
  }

  private async retryPayment(subscription: BillingSubscription): Promise<boolean> {
    try {
      if (!subscription.stripeCustomerId || !subscription.paymentMethodId) {
        return false;
      }

      // Get the latest unpaid invoice
      const invoices = await this.stripe.invoices.list({
        customer: subscription.stripeCustomerId,
        status: 'open',
        limit: 1,
      });

      if (invoices.data.length > 0) {
        const invoice = invoices.data[0];
        const result = await this.stripe.invoices.pay(invoice.id);
        return result.status === 'paid';
      }

      // No open invoice, try creating a new payment
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(subscription.amount * 100),
        currency: subscription.currency.toLowerCase(),
        customer: subscription.stripeCustomerId,
        payment_method: subscription.paymentMethodId,
        off_session: true,
        confirm: true,
      });

      return paymentIntent.status === 'succeeded';
    } catch (error) {
      logger.error('Payment retry error', {
        tenantId: subscription.tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  private async sendBillingReminder(subscription: BillingSubscription): Promise<void> {
    // TODO: Implement email notification
    logger.info('Billing reminder sent', {
      tenantId: subscription.tenantId,
      nextBillingDate: subscription.nextBillingDate,
      amount: subscription.amount,
    });
  }

  private async createInvoice(subscription: BillingSubscription, paymentIntentId: string): Promise<void> {
    const db = getPlatformDatabase();
    const invoicesCollection = db.collection('invoices');

    const now = new Date();
    const invoiceNumber = `INV-${moment(now).format('YYYYMMDD')}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    await invoicesCollection.insertOne({
      id: require('uuid').v4(),
      tenantId: subscription.tenantId,
      subscriptionId: subscription.id,
      invoiceNumber,
      amount: subscription.amount,
      currency: subscription.currency,
      status: 'paid',
      lineItems: [
        {
          description: `${subscription.planName} - ${subscription.billingCycle} subscription`,
          quantity: 1,
          unitPrice: subscription.amount,
          total: subscription.amount,
        },
      ],
      subtotal: subscription.amount,
      tax: 0,
      discount: 0,
      total: subscription.amount,
      dueDate: now,
      paidAt: now,
      stripePaymentIntentId: paymentIntentId,
      createdAt: now,
      updatedAt: now,
    });
  }

  private checkLimitViolations(metrics: any): string[] {
    const violations: string[] = [];
    const warningThreshold = 80;
    const criticalThreshold = 100;

    if (metrics.locations.percentage >= criticalThreshold) {
      violations.push(`Location limit exceeded: ${metrics.locations.current}/${metrics.locations.limit}`);
    } else if (metrics.locations.percentage >= warningThreshold) {
      violations.push(`Location limit warning: ${metrics.locations.percentage}% used`);
    }

    if (metrics.users.percentage >= criticalThreshold) {
      violations.push(`User limit exceeded: ${metrics.users.current}/${metrics.users.limit}`);
    } else if (metrics.users.percentage >= warningThreshold) {
      violations.push(`User limit warning: ${metrics.users.percentage}% used`);
    }

    if (metrics.products.percentage >= criticalThreshold) {
      violations.push(`Product limit exceeded: ${metrics.products.current}/${metrics.products.limit}`);
    } else if (metrics.products.percentage >= warningThreshold) {
      violations.push(`Product limit warning: ${metrics.products.percentage}% used`);
    }

    if (metrics.ordersThisMonth.percentage >= criticalThreshold) {
      violations.push(`Monthly order limit exceeded: ${metrics.ordersThisMonth.current}/${metrics.ordersThisMonth.limit}`);
    } else if (metrics.ordersThisMonth.percentage >= warningThreshold) {
      violations.push(`Monthly order limit warning: ${metrics.ordersThisMonth.percentage}% used`);
    }

    if (metrics.storage.percentage >= criticalThreshold) {
      violations.push(`Storage limit exceeded: ${metrics.storage.current}GB/${metrics.storage.limit}GB`);
    } else if (metrics.storage.percentage >= warningThreshold) {
      violations.push(`Storage limit warning: ${metrics.storage.percentage}% used`);
    }

    return violations;
  }

  private async handleLimitViolations(tenantId: string, violations: string[]): Promise<void> {
    const db = getPlatformDatabase();
    const alertsCollection = db.collection('usage_alerts');

    await alertsCollection.insertOne({
      id: require('uuid').v4(),
      tenantId,
      violations,
      severity: violations.some(v => v.includes('exceeded')) ? 'critical' : 'warning',
      notified: false,
      createdAt: new Date(),
    });

    logger.warn('Usage limit violations detected', {
      tenantId,
      violations,
    });

    // TODO: Send notification to tenant admin
  }
}
