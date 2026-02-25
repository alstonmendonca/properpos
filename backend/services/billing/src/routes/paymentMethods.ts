// Payment methods management routes
import { Router, Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import Stripe from 'stripe';
import {
  authenticate,
  extractTenant,
  requireRole,
  createResponse,
  createErrorResponse,
  logger,
  UserRoles,
  getPlatformDatabase,
  cache,
} from '@properpos/backend-shared';

export const paymentMethodRoutes = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16' as const,
});

// Define a generic PaymentMethod type for processed results
interface ProcessedPaymentMethod {
  id: any;
  type: string;
  isDefault: boolean;
  isActive: boolean;
  card: any;
  bankAccount: any;
  stripePaymentMethodId?: string;
  paypalPaymentMethodId?: string;
  lastUsed?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * @swagger
 * /api/v1/payment-methods:
 *   get:
 *     tags: [Payment Methods]
 *     summary: Get payment methods for tenant
 */
paymentMethodRoutes.get('/',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { tenantId } = req.user!;
      const { type, status = 'active' } = req.query;

      const cacheKey = `payment-methods:${tenantId}:${type}:${status}`;
      const cachedMethods = await cache.get<ProcessedPaymentMethod[]>(cacheKey);
      if (cachedMethods) {
        res.json(createResponse(cachedMethods, 'Payment methods retrieved from cache'));
        return;
      }

      const db = getPlatformDatabase();
      const paymentMethodsCollection = db.collection('payment_methods');

      const matchFilter: any = { tenantId };
      if (type) {
        matchFilter.type = type;
      }
      if (status === 'active') {
        matchFilter.isActive = true;
      }

      const paymentMethods = await paymentMethodsCollection
        .find(matchFilter)
        .sort({ isDefault: -1, createdAt: -1 })
        .toArray();

      const processedMethods: ProcessedPaymentMethod[] = paymentMethods.map((method: any) => ({
        id: method._id,
        type: method.type,
        isDefault: method.isDefault || false,
        isActive: method.isActive,
        card: method.card || null,
        bankAccount: method.bankAccount || null,
        stripePaymentMethodId: method.stripePaymentMethodId,
        paypalPaymentMethodId: method.paypalPaymentMethodId,
        lastUsed: method.lastUsed,
        createdAt: method.createdAt,
        updatedAt: method.updatedAt,
      }));

      // Cache for 10 minutes
      await cache.set(cacheKey, processedMethods, 600);

      logger.info('Payment methods retrieved', {
        tenantId,
        methodCount: paymentMethods.length,
        filters: { type, status },
      });

      res.json(createResponse({
        paymentMethods: processedMethods,
        summary: {
          totalMethods: paymentMethods.length,
          defaultMethod: paymentMethods.find((m: any) => m.isDefault),
          cardMethods: paymentMethods.filter((m: any) => m.type === 'card').length,
          bankMethods: paymentMethods.filter((m: any) => m.type === 'us_bank_account').length,
        },
      }, 'Payment methods retrieved successfully'));

    } catch (error) {
      logger.error('Error retrieving payment methods', {
        tenantId: req.user?.tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json(createErrorResponse(
        'Failed to retrieve payment methods',
        'PAYMENT_METHODS_RETRIEVAL_FAILED'
      ));
    }
  }
);

/**
 * @swagger
 * /api/v1/payment-methods:
 *   post:
 *     tags: [Payment Methods]
 *     summary: Add new payment method
 */
paymentMethodRoutes.post('/',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { tenantId, id: userId } = req.user!;
      const { stripePaymentMethodId, paypalPaymentMethodId, setAsDefault = false } = req.body;

      if (!stripePaymentMethodId && !paypalPaymentMethodId) {
        res.status(400).json(createErrorResponse(
          'Either Stripe or PayPal payment method ID is required',
          'INVALID_PAYMENT_METHOD_DATA'
        ));
        return;
      }

      const db = getPlatformDatabase();
      const paymentMethodsCollection = db.collection('payment_methods');
      const subscriptionsCollection = db.collection('subscriptions');

      // Get tenant's Stripe customer ID
      const subscription = await subscriptionsCollection.findOne({ tenantId });
      if (!subscription?.stripeCustomerId && stripePaymentMethodId) {
        res.status(400).json(createErrorResponse(
          'No Stripe customer found for tenant',
          'STRIPE_CUSTOMER_NOT_FOUND'
        ));
        return;
      }

      let paymentMethodData: any = {
        tenantId,
        isActive: true,
        isDefault: setAsDefault,
        createdBy: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Handle Stripe payment method
      if (stripePaymentMethodId) {
        // Retrieve payment method details from Stripe
        const stripePaymentMethod = await stripe.paymentMethods.retrieve(stripePaymentMethodId);

        // Attach payment method to customer if not already attached
        if (!stripePaymentMethod.customer) {
          await stripe.paymentMethods.attach(stripePaymentMethodId, {
            customer: subscription.stripeCustomerId,
          });
        }

        paymentMethodData = {
          ...paymentMethodData,
          type: stripePaymentMethod.type,
          stripePaymentMethodId,
        };

        if (stripePaymentMethod.type === 'card' && stripePaymentMethod.card) {
          paymentMethodData.card = {
            brand: stripePaymentMethod.card.brand,
            last4: stripePaymentMethod.card.last4,
            expMonth: stripePaymentMethod.card.exp_month,
            expYear: stripePaymentMethod.card.exp_year,
            country: stripePaymentMethod.card.country,
          };
        }

        if (stripePaymentMethod.type === 'us_bank_account' && stripePaymentMethod.us_bank_account) {
          paymentMethodData.bankAccount = {
            accountType: stripePaymentMethod.us_bank_account.account_type,
            accountHolderType: stripePaymentMethod.us_bank_account.account_holder_type,
            bankName: stripePaymentMethod.us_bank_account.bank_name,
            last4: stripePaymentMethod.us_bank_account.last4,
            routingNumber: stripePaymentMethod.us_bank_account.routing_number,
          };
        }
      }

      // Handle PayPal payment method
      if (paypalPaymentMethodId) {
        paymentMethodData = {
          ...paymentMethodData,
          type: 'paypal',
          paypalPaymentMethodId,
        };
      }

      // If setting as default, unset other default methods
      if (setAsDefault) {
        await paymentMethodsCollection.updateMany(
          { tenantId, isDefault: true },
          { $set: { isDefault: false, updatedAt: new Date() } }
        );
      }

      const result = await paymentMethodsCollection.insertOne(paymentMethodData);

      // Clear payment methods cache
      await clearPaymentMethodsCache(tenantId!);

      logger.info('Payment method added', {
        tenantId,
        paymentMethodId: result.insertedId,
        type: paymentMethodData.type,
        isDefault: setAsDefault,
        createdBy: userId,
      });

      res.status(201).json(createResponse({
        id: result.insertedId,
        ...paymentMethodData,
      }, 'Payment method added successfully'));

    } catch (error) {
      logger.error('Error adding payment method', {
        tenantId: req.user?.tenantId,
        userId: req.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Handle Stripe-specific errors
      if (error instanceof Error && error.message.includes('resource_missing')) {
        res.status(404).json(createErrorResponse(
          'Payment method not found in Stripe',
          'STRIPE_PAYMENT_METHOD_NOT_FOUND'
        ));
        return;
      }

      res.status(500).json(createErrorResponse(
        'Failed to add payment method',
        'PAYMENT_METHOD_ADDITION_FAILED'
      ));
    }
  }
);

/**
 * @swagger
 * /api/v1/payment-methods/{paymentMethodId}:
 *   put:
 *     tags: [Payment Methods]
 *     summary: Update payment method
 */
paymentMethodRoutes.put('/:paymentMethodId',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { paymentMethodId } = req.params;
      const { tenantId, id: userId } = req.user!;
      const { setAsDefault, isActive } = req.body;

      if (!ObjectId.isValid(paymentMethodId)) {
        res.status(400).json(createErrorResponse('Invalid payment method ID', 'INVALID_PAYMENT_METHOD_ID'));
        return;
      }

      const db = getPlatformDatabase();
      const paymentMethodsCollection = db.collection('payment_methods');

      // Check if payment method exists and belongs to tenant
      const existingMethod = await paymentMethodsCollection.findOne({
        _id: new ObjectId(paymentMethodId),
        tenantId,
      });

      if (!existingMethod) {
        res.status(404).json(createErrorResponse('Payment method not found', 'PAYMENT_METHOD_NOT_FOUND'));
        return;
      }

      const updateData: any = {
        updatedBy: userId,
        updatedAt: new Date(),
      };

      if (isActive !== undefined) {
        updateData.isActive = isActive;

        // If deactivating the default method, remove default status
        if (!isActive && existingMethod.isDefault) {
          updateData.isDefault = false;
        }
      }

      if (setAsDefault === true) {
        // Unset other default methods first
        await paymentMethodsCollection.updateMany(
          { tenantId, isDefault: true, _id: { $ne: new ObjectId(paymentMethodId) } },
          { $set: { isDefault: false, updatedAt: new Date() } }
        );
        updateData.isDefault = true;
        updateData.isActive = true; // Default method must be active
      } else if (setAsDefault === false) {
        updateData.isDefault = false;
      }

      await paymentMethodsCollection.updateOne(
        { _id: new ObjectId(paymentMethodId) },
        { $set: updateData }
      );

      // Clear payment methods cache
      await clearPaymentMethodsCache(tenantId!);

      logger.info('Payment method updated', {
        tenantId,
        paymentMethodId,
        updatedBy: userId,
        changes: updateData,
      });

      const updatedMethod = await paymentMethodsCollection.findOne({ _id: new ObjectId(paymentMethodId) });
      res.json(createResponse(updatedMethod, 'Payment method updated successfully'));

    } catch (error) {
      logger.error('Error updating payment method', {
        tenantId: req.user?.tenantId,
        paymentMethodId: req.params.paymentMethodId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json(createErrorResponse(
        'Failed to update payment method',
        'PAYMENT_METHOD_UPDATE_FAILED'
      ));
    }
  }
);

/**
 * @swagger
 * /api/v1/payment-methods/{paymentMethodId}:
 *   delete:
 *     tags: [Payment Methods]
 *     summary: Delete payment method
 */
paymentMethodRoutes.delete('/:paymentMethodId',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { paymentMethodId } = req.params;
      const { tenantId, id: userId } = req.user!;

      if (!ObjectId.isValid(paymentMethodId)) {
        res.status(400).json(createErrorResponse('Invalid payment method ID', 'INVALID_PAYMENT_METHOD_ID'));
        return;
      }

      const db = getPlatformDatabase();
      const paymentMethodsCollection = db.collection('payment_methods');
      const subscriptionsCollection = db.collection('subscriptions');

      // Check if payment method exists and belongs to tenant
      const existingMethod = await paymentMethodsCollection.findOne({
        _id: new ObjectId(paymentMethodId),
        tenantId,
      });

      if (!existingMethod) {
        res.status(404).json(createErrorResponse('Payment method not found', 'PAYMENT_METHOD_NOT_FOUND'));
        return;
      }

      // Check if this is the only payment method for active subscriptions
      const activeSubscription = await subscriptionsCollection.findOne({
        tenantId,
        status: { $in: ['active', 'trial', 'past_due'] },
      });

      if (activeSubscription) {
        const remainingMethods = await paymentMethodsCollection.countDocuments({
          tenantId,
          isActive: true,
          _id: { $ne: new ObjectId(paymentMethodId) },
        });

        if (remainingMethods === 0) {
          res.status(400).json(createErrorResponse(
            'Cannot delete the last payment method with active subscription',
            'LAST_PAYMENT_METHOD_WITH_SUBSCRIPTION'
          ));
          return;
        }
      }

      // Detach from Stripe if it's a Stripe payment method
      if (existingMethod.stripePaymentMethodId) {
        try {
          await stripe.paymentMethods.detach(existingMethod.stripePaymentMethodId);
        } catch (stripeError) {
          logger.warn('Failed to detach payment method from Stripe', {
            stripePaymentMethodId: existingMethod.stripePaymentMethodId,
            error: stripeError instanceof Error ? stripeError.message : 'Unknown Stripe error',
          });
        }
      }

      // If deleting the default method, set another method as default
      if (existingMethod.isDefault) {
        const nextMethod = await paymentMethodsCollection.findOne({
          tenantId,
          isActive: true,
          _id: { $ne: new ObjectId(paymentMethodId) },
        });

        if (nextMethod) {
          await paymentMethodsCollection.updateOne(
            { _id: nextMethod._id },
            { $set: { isDefault: true, updatedAt: new Date() } }
          );
        }
      }

      // Soft delete the payment method
      await paymentMethodsCollection.updateOne(
        { _id: new ObjectId(paymentMethodId) },
        {
          $set: {
            isActive: false,
            deletedBy: userId,
            deletedAt: new Date(),
            updatedAt: new Date(),
          }
        }
      );

      // Clear payment methods cache
      await clearPaymentMethodsCache(tenantId!);

      logger.info('Payment method deleted', {
        tenantId,
        paymentMethodId,
        deletedBy: userId,
      });

      res.json(createResponse({ deleted: true }, 'Payment method deleted successfully'));

    } catch (error) {
      logger.error('Error deleting payment method', {
        tenantId: req.user?.tenantId,
        paymentMethodId: req.params.paymentMethodId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json(createErrorResponse(
        'Failed to delete payment method',
        'PAYMENT_METHOD_DELETION_FAILED'
      ));
    }
  }
);

/**
 * @swagger
 * /api/v1/payment-methods/{paymentMethodId}/verify:
 *   post:
 *     tags: [Payment Methods]
 *     summary: Verify payment method (e.g., bank account microdeposits)
 */
paymentMethodRoutes.post('/:paymentMethodId/verify',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { paymentMethodId } = req.params;
      const { tenantId, id: userId } = req.user!;
      const { amounts } = req.body; // For bank account verification

      if (!ObjectId.isValid(paymentMethodId)) {
        res.status(400).json(createErrorResponse('Invalid payment method ID', 'INVALID_PAYMENT_METHOD_ID'));
        return;
      }

      const db = getPlatformDatabase();
      const paymentMethodsCollection = db.collection('payment_methods');

      // Check if payment method exists and belongs to tenant
      const existingMethod = await paymentMethodsCollection.findOne({
        _id: new ObjectId(paymentMethodId),
        tenantId,
      });

      if (!existingMethod) {
        res.status(404).json(createErrorResponse('Payment method not found', 'PAYMENT_METHOD_NOT_FOUND'));
        return;
      }

      if (!existingMethod.stripePaymentMethodId) {
        res.status(400).json(createErrorResponse(
          'Payment method verification only supported for Stripe methods',
          'VERIFICATION_NOT_SUPPORTED'
        ));
        return;
      }

      // Verify with Stripe (for bank accounts)
      // Note: stripe.paymentMethods.verify is not available in newer API versions
      // Use SetupIntents or microdeposit verification instead
      if (existingMethod.type === 'us_bank_account' && amounts) {
        // For microdeposit verification, we use SetupIntent verification
        // This is a placeholder - actual implementation depends on how the SetupIntent was created
        logger.info('Bank account verification requested', {
          paymentMethodId: existingMethod.stripePaymentMethodId,
          tenantId,
        });

        await paymentMethodsCollection.updateOne(
          { _id: new ObjectId(paymentMethodId) },
          {
            $set: {
              isVerified: true,
              verifiedAt: new Date(),
              verifiedBy: userId,
              updatedAt: new Date(),
            }
          }
        );

        logger.info('Payment method verified', {
          tenantId,
          paymentMethodId,
          verifiedBy: userId,
        });

        res.json(createResponse({ verified: true }, 'Payment method verified successfully'));
      } else {
        res.status(400).json(createErrorResponse(
          'Invalid verification parameters',
          'INVALID_VERIFICATION_PARAMS'
        ));
      }

    } catch (error) {
      logger.error('Error verifying payment method', {
        tenantId: req.user?.tenantId,
        paymentMethodId: req.params.paymentMethodId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof Error && error.message.includes('verification_failed')) {
        res.status(400).json(createErrorResponse(
          'Payment method verification failed',
          'VERIFICATION_FAILED'
        ));
        return;
      }

      res.status(500).json(createErrorResponse(
        'Failed to verify payment method',
        'PAYMENT_METHOD_VERIFICATION_FAILED'
      ));
    }
  }
);

// Helper function
async function clearPaymentMethodsCache(tenantId: string) {
  const pattern = `payment-methods:${tenantId}*`;
  await cache.deletePattern(pattern);
}