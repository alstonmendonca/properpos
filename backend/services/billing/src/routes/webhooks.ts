// Webhook handling routes for payment processing
import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import {
  logger,
  createResponse,
  createErrorResponse,
  getPlatformDatabase,
} from '@properpos/backend-shared';

export const webhookRoutes = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16' as const,
});

/**
 * @swagger
 * /api/v1/webhooks/stripe:
 *   post:
 *     tags: [Webhooks]
 *     summary: Handle Stripe webhook events
 */
webhookRoutes.post('/stripe', async (req: Request, res: Response): Promise<void> => {
  let event: Stripe.Event;
  const signature = req.headers['stripe-signature'] as string;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (error) {
    logger.error('Stripe webhook signature verification failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(400).json(createErrorResponse('Webhook signature verification failed', 'INVALID_SIGNATURE'));
    return;
  }

  try {
    // Handle the event
    switch (event.type) {
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.trial_will_end':
        await handleTrialWillEnd(event.data.object as Stripe.Subscription);
        break;
      case 'payment_method.attached':
        await handlePaymentMethodAttached(event.data.object as Stripe.PaymentMethod);
        break;
      case 'payment_method.detached':
        await handlePaymentMethodDetached(event.data.object as Stripe.PaymentMethod);
        break;
      default:
        logger.info('Unhandled Stripe webhook event', { eventType: event.type });
    }

    logger.info('Stripe webhook processed successfully', {
      eventType: event.type,
      eventId: event.id,
    });

    res.json(createResponse({ received: true }, 'Stripe webhook processed successfully'));

  } catch (error) {
    logger.error('Error processing Stripe webhook', {
      eventType: event.type,
      eventId: event.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json(createErrorResponse('Webhook processing failed', 'WEBHOOK_PROCESSING_FAILED'));
  }
});

/**
 * @swagger
 * /api/v1/webhooks/paypal:
 *   post:
 *     tags: [Webhooks]
 *     summary: Handle PayPal webhook events
 */
webhookRoutes.post('/paypal', async (req: Request, res: Response): Promise<void> => {
  try {
    const { event_type, resource } = req.body;

    // Handle PayPal webhook events
    switch (event_type) {
      case 'BILLING.SUBSCRIPTION.ACTIVATED':
        await handlePayPalSubscriptionActivated(resource);
        break;
      case 'BILLING.SUBSCRIPTION.CANCELLED':
        await handlePayPalSubscriptionCancelled(resource);
        break;
      case 'PAYMENT.SALE.COMPLETED':
        await handlePayPalPaymentCompleted(resource);
        break;
      case 'PAYMENT.SALE.DENIED':
        await handlePayPalPaymentFailed(resource);
        break;
      default:
        logger.info('Unhandled PayPal webhook event', { eventType: event_type });
    }

    logger.info('PayPal webhook processed successfully', {
      eventType: event_type,
      resourceId: resource?.id,
    });

    res.json(createResponse({ received: true }, 'PayPal webhook processed successfully'));

  } catch (error) {
    logger.error('Error processing PayPal webhook', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json(createErrorResponse('PayPal webhook processing failed', 'WEBHOOK_PROCESSING_FAILED'));
  }
});

// Stripe webhook handlers
async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  if (!invoice.subscription) return;

  const db = getPlatformDatabase();
  const subscriptionsCollection = db.collection('subscriptions');

  await subscriptionsCollection.updateOne(
    { stripeSubscriptionId: invoice.subscription },
    {
      $set: {
        status: 'active',
        currentPeriodStart: new Date(invoice.period_start * 1000),
        currentPeriodEnd: new Date(invoice.period_end * 1000),
        updatedAt: new Date(),
      },
      $push: {
        invoiceHistory: {
          invoiceId: invoice.id,
          amount: invoice.amount_paid,
          status: 'paid',
          paidAt: new Date(),
        },
      },
    }
  );

  logger.info('Invoice payment succeeded', {
    invoiceId: invoice.id,
    subscriptionId: invoice.subscription,
    amount: invoice.amount_paid,
  });
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  if (!invoice.subscription) return;

  const db = getPlatformDatabase();
  const subscriptionsCollection = db.collection('subscriptions');

  await subscriptionsCollection.updateOne(
    { stripeSubscriptionId: invoice.subscription },
    {
      $set: {
        status: 'past_due',
        updatedAt: new Date(),
      },
      $push: {
        invoiceHistory: {
          invoiceId: invoice.id,
          amount: invoice.amount_due,
          status: 'failed',
          failedAt: new Date(),
        },
      },
    }
  );

  logger.warn('Invoice payment failed', {
    invoiceId: invoice.id,
    subscriptionId: invoice.subscription,
    amount: invoice.amount_due,
  });
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  const db = getPlatformDatabase();
  const subscriptionsCollection = db.collection('subscriptions');

  await subscriptionsCollection.updateOne(
    { stripeSubscriptionId: subscription.id },
    {
      $set: {
        status: subscription.status,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        updatedAt: new Date(),
      },
    }
  );

  logger.info('Subscription created', {
    subscriptionId: subscription.id,
    customerId: subscription.customer,
    status: subscription.status,
  });
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const db = getPlatformDatabase();
  const subscriptionsCollection = db.collection('subscriptions');

  await subscriptionsCollection.updateOne(
    { stripeSubscriptionId: subscription.id },
    {
      $set: {
        status: subscription.status,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        updatedAt: new Date(),
      },
    }
  );

  logger.info('Subscription updated', {
    subscriptionId: subscription.id,
    status: subscription.status,
  });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const db = getPlatformDatabase();
  const subscriptionsCollection = db.collection('subscriptions');

  await subscriptionsCollection.updateOne(
    { stripeSubscriptionId: subscription.id },
    {
      $set: {
        status: 'cancelled',
        cancelledAt: new Date(),
        updatedAt: new Date(),
      },
    }
  );

  logger.info('Subscription cancelled', {
    subscriptionId: subscription.id,
  });
}

async function handleTrialWillEnd(subscription: Stripe.Subscription) {
  const db = getPlatformDatabase();
  const subscriptionsCollection = db.collection('subscriptions');
  const tenantsCollection = db.collection('tenants');
  const usersCollection = db.collection('users');

  // Find the subscription and tenant to send notification
  const subscriptionDoc = await subscriptionsCollection.findOne({
    stripeSubscriptionId: subscription.id,
  });

  if (subscriptionDoc) {
    // Get tenant details
    const tenant = await tenantsCollection.findOne({ id: subscriptionDoc.tenantId });
    if (!tenant) {
      logger.warn('Tenant not found for trial ending notification', {
        tenantId: subscriptionDoc.tenantId,
      });
      return;
    }

    // Get tenant owner/admin email
    const ownerEmail = tenant.contactInfo?.ownerEmail || tenant.billing?.invoiceEmail;
    if (!ownerEmail) {
      logger.warn('No email found for trial ending notification', {
        tenantId: subscriptionDoc.tenantId,
      });
      return;
    }

    // Calculate days until trial ends
    const trialEndDate = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;
    if (!trialEndDate) {
      logger.warn('No trial end date found', { subscriptionId: subscription.id });
      return;
    }

    const now = new Date();
    const daysUntilEnd = Math.ceil((trialEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const formattedEndDate = trialEndDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const baseUrl = process.env.FRONTEND_URL || 'https://app.properpos.com';
    const upgradeUrl = `${baseUrl}/settings/billing`;

    // Import email service
    const { emailService } = await import('@properpos/backend-shared');

    // Send appropriate email based on days remaining
    try {
      if (daysUntilEnd <= 1) {
        await emailService.sendTrialEnding1Day(ownerEmail, {
          userName: tenant.contactInfo?.ownerName,
          organizationName: tenant.name,
          trialEndDate: formattedEndDate,
          upgradeUrl,
        });
        logger.info('Trial ending 1-day notification sent', {
          tenantId: subscriptionDoc.tenantId,
          email: ownerEmail,
        });
      } else if (daysUntilEnd <= 3) {
        await emailService.sendTrialEnding3Days(ownerEmail, {
          userName: tenant.contactInfo?.ownerName,
          organizationName: tenant.name,
          trialEndDate: formattedEndDate,
          upgradeUrl,
        });
        logger.info('Trial ending 3-day notification sent', {
          tenantId: subscriptionDoc.tenantId,
          email: ownerEmail,
        });
      }
    } catch (emailError) {
      logger.error('Failed to send trial ending email', {
        tenantId: subscriptionDoc.tenantId,
        error: emailError instanceof Error ? emailError.message : 'Unknown error',
      });
    }

    logger.info('Trial will end soon', {
      subscriptionId: subscription.id,
      tenantId: subscriptionDoc.tenantId,
      trialEnd: subscription.trial_end,
      daysUntilEnd,
    });
  }
}

async function handlePaymentMethodAttached(paymentMethod: Stripe.PaymentMethod) {
  const db = getPlatformDatabase();
  const paymentMethodsCollection = db.collection('payment_methods');

  await paymentMethodsCollection.updateOne(
    { stripePaymentMethodId: paymentMethod.id },
    {
      $set: {
        type: paymentMethod.type,
        card: paymentMethod.card ? {
          brand: paymentMethod.card.brand,
          last4: paymentMethod.card.last4,
          expMonth: paymentMethod.card.exp_month,
          expYear: paymentMethod.card.exp_year,
        } : null,
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );

  logger.info('Payment method attached', {
    paymentMethodId: paymentMethod.id,
    customerId: paymentMethod.customer,
    type: paymentMethod.type,
  });
}

async function handlePaymentMethodDetached(paymentMethod: Stripe.PaymentMethod) {
  const db = getPlatformDatabase();
  const paymentMethodsCollection = db.collection('payment_methods');

  await paymentMethodsCollection.deleteOne({
    stripePaymentMethodId: paymentMethod.id,
  });

  logger.info('Payment method detached', {
    paymentMethodId: paymentMethod.id,
  });
}

// PayPal webhook handlers
async function handlePayPalSubscriptionActivated(resource: any) {
  const db = getPlatformDatabase();
  const subscriptionsCollection = db.collection('subscriptions');

  await subscriptionsCollection.updateOne(
    { paypalSubscriptionId: resource.id },
    {
      $set: {
        status: 'active',
        updatedAt: new Date(),
      },
    }
  );

  logger.info('PayPal subscription activated', {
    subscriptionId: resource.id,
  });
}

async function handlePayPalSubscriptionCancelled(resource: any) {
  const db = getPlatformDatabase();
  const subscriptionsCollection = db.collection('subscriptions');

  await subscriptionsCollection.updateOne(
    { paypalSubscriptionId: resource.id },
    {
      $set: {
        status: 'cancelled',
        cancelledAt: new Date(),
        updatedAt: new Date(),
      },
    }
  );

  logger.info('PayPal subscription cancelled', {
    subscriptionId: resource.id,
  });
}

async function handlePayPalPaymentCompleted(resource: any) {
  logger.info('PayPal payment completed', {
    paymentId: resource.id,
    amount: resource.amount,
  });
}

async function handlePayPalPaymentFailed(resource: any) {
  logger.warn('PayPal payment failed', {
    paymentId: resource.id,
    amount: resource.amount,
  });
}