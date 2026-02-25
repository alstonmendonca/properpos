// Subscription plans management routes
import { Router, Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import Decimal from 'decimal.js';
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

export const planRoutes = Router();

/**
 * @swagger
 * /api/v1/plans:
 *   get:
 *     tags: [Plans]
 *     summary: Get all available subscription plans
 */
planRoutes.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { active, category } = req.query;
    const cacheKey = `plans:${active}:${category}`;

    // Check cache first
    const cachedPlans = await cache.get<any[]>(cacheKey);
    if (cachedPlans) {
      res.json(createResponse(cachedPlans, 'Subscription plans retrieved from cache'));
      return;
    }

    const db = getPlatformDatabase();
    const plansCollection = db.collection('subscription_plans');

    const matchFilter: any = {};
    if (active !== undefined) {
      matchFilter.isActive = active === 'true';
    }
    if (category) {
      matchFilter.category = category;
    }

    const plans = await plansCollection
      .find(matchFilter)
      .sort({ displayOrder: 1, createdAt: 1 })
      .toArray();

    // Process plans to include pricing tiers
    const processedPlans = plans.map((plan: any) => ({
      id: plan._id,
      name: plan.name,
      description: plan.description,
      category: plan.category,
      pricing: {
        monthly: plan.pricing.monthly,
        yearly: plan.pricing.yearly,
        yearlyDiscount: plan.pricing.yearlyDiscount,
      },
      features: plan.features,
      limits: plan.limits,
      trialDays: plan.trialDays || 0,
      isPopular: plan.isPopular || false,
      displayOrder: plan.displayOrder || 999,
      isActive: plan.isActive,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    }));

    // Cache for 15 minutes
    await cache.set(cacheKey, processedPlans, 900);

    logger.info('Subscription plans retrieved', {
      planCount: plans.length,
      filters: { active, category },
    });

    res.json(createResponse(processedPlans, 'Subscription plans retrieved successfully'));

  } catch (error) {
    logger.error('Error retrieving subscription plans', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json(createErrorResponse(
      'Failed to retrieve subscription plans',
      'PLANS_RETRIEVAL_FAILED'
    ));
  }
});

/**
 * @swagger
 * /api/v1/plans/{planId}:
 *   get:
 *     tags: [Plans]
 *     summary: Get specific subscription plan details
 */
planRoutes.get('/:planId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { planId } = req.params;

    if (!ObjectId.isValid(planId)) {
      res.status(400).json(createErrorResponse('Invalid plan ID', 'INVALID_PLAN_ID'));
      return;
    }

    const cacheKey = `plan:${planId}`;
    const cachedPlan = await cache.get<any>(cacheKey);
    if (cachedPlan) {
      res.json(createResponse(cachedPlan, 'Subscription plan retrieved from cache'));
      return;
    }

    const db = getPlatformDatabase();
    const plansCollection = db.collection('subscription_plans');

    const plan = await plansCollection.findOne({ _id: new ObjectId(planId) });

    if (!plan) {
      res.status(404).json(createErrorResponse('Subscription plan not found', 'PLAN_NOT_FOUND'));
      return;
    }

    const processedPlan = {
      id: plan._id,
      name: plan.name,
      description: plan.description,
      category: plan.category,
      pricing: {
        monthly: {
          amount: plan.pricing.monthly.amount,
          currency: plan.pricing.monthly.currency,
          stripePriceId: plan.pricing.monthly.stripePriceId,
        },
        yearly: {
          amount: plan.pricing.yearly.amount,
          currency: plan.pricing.yearly.currency,
          stripePriceId: plan.pricing.yearly.stripePriceId,
        },
        yearlyDiscount: plan.pricing.yearlyDiscount,
      },
      features: plan.features,
      limits: plan.limits,
      trialDays: plan.trialDays || 0,
      isPopular: plan.isPopular || false,
      isActive: plan.isActive,
      metadata: plan.metadata || {},
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    };

    // Cache for 30 minutes
    await cache.set(cacheKey, processedPlan, 1800);

    logger.info('Subscription plan retrieved', {
      planId,
      planName: plan.name,
    });

    res.json(createResponse(processedPlan, 'Subscription plan retrieved successfully'));

  } catch (error) {
    logger.error('Error retrieving subscription plan', {
      planId: req.params.planId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json(createErrorResponse(
      'Failed to retrieve subscription plan',
      'PLAN_RETRIEVAL_FAILED'
    ));
  }
});

/**
 * @swagger
 * /api/v1/plans:
 *   post:
 *     tags: [Plans]
 *     summary: Create new subscription plan (Admin only)
 */
planRoutes.post('/',
  authenticate,
  extractTenant,
  requireRole([UserRoles.ADMIN]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id: userId } = req.user!;
      const {
        name,
        description,
        category,
        pricing,
        features,
        limits,
        trialDays = 0,
        isPopular = false,
        displayOrder = 999,
        isActive = true,
        metadata = {},
      } = req.body;

      // Validate required fields
      if (!name || !pricing || !features || !limits) {
        res.status(400).json(createErrorResponse(
          'Name, pricing, features, and limits are required',
          'INVALID_PLAN_DATA'
        ));
        return;
      }

      // Validate pricing structure
      if (!pricing.monthly?.amount || !pricing.yearly?.amount) {
        res.status(400).json(createErrorResponse(
          'Monthly and yearly pricing amounts are required',
          'INVALID_PRICING_DATA'
        ));
        return;
      }

      const db = getPlatformDatabase();
      const plansCollection = db.collection('subscription_plans');

      // Check if plan name already exists
      const existingPlan = await plansCollection.findOne({ name });
      if (existingPlan) {
        res.status(400).json(createErrorResponse(
          'Plan with this name already exists',
          'PLAN_NAME_EXISTS'
        ));
        return;
      }

      // Calculate yearly discount percentage
      const monthlyAmount = new Decimal(pricing.monthly.amount);
      const yearlyAmount = new Decimal(pricing.yearly.amount);
      const yearlyEquivalent = monthlyAmount.mul(12);
      const yearlyDiscount = yearlyEquivalent.sub(yearlyAmount).div(yearlyEquivalent).mul(100);

      const newPlan = {
        name,
        description,
        category: category || 'standard',
        pricing: {
          monthly: {
            amount: monthlyAmount.toNumber(),
            currency: pricing.monthly.currency || 'usd',
            stripePriceId: pricing.monthly.stripePriceId || null,
          },
          yearly: {
            amount: yearlyAmount.toNumber(),
            currency: pricing.yearly.currency || 'usd',
            stripePriceId: pricing.yearly.stripePriceId || null,
          },
          yearlyDiscount: yearlyDiscount.toNumber(),
        },
        features,
        limits,
        trialDays,
        isPopular,
        displayOrder,
        isActive,
        metadata,
        createdBy: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await plansCollection.insertOne(newPlan);

      // Clear plans cache
      await clearPlansCache();

      logger.info('Subscription plan created', {
        planId: result.insertedId,
        planName: name,
        createdBy: userId,
      });

      res.status(201).json(createResponse({
        id: result.insertedId,
        ...newPlan,
      }, 'Subscription plan created successfully'));

    } catch (error) {
      logger.error('Error creating subscription plan', {
        userId: req.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json(createErrorResponse(
        'Failed to create subscription plan',
        'PLAN_CREATION_FAILED'
      ));
    }
  }
);

/**
 * @swagger
 * /api/v1/plans/{planId}:
 *   put:
 *     tags: [Plans]
 *     summary: Update subscription plan (Admin only)
 */
planRoutes.put('/:planId',
  authenticate,
  extractTenant,
  requireRole([UserRoles.ADMIN]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { planId } = req.params;
      const { id: userId } = req.user!;

      if (!ObjectId.isValid(planId)) {
        res.status(400).json(createErrorResponse('Invalid plan ID', 'INVALID_PLAN_ID'));
        return;
      }

      const {
        name,
        description,
        category,
        pricing,
        features,
        limits,
        trialDays,
        isPopular,
        displayOrder,
        isActive,
        metadata,
      } = req.body;

      const db = getPlatformDatabase();
      const plansCollection = db.collection('subscription_plans');

      // Check if plan exists
      const existingPlan = await plansCollection.findOne({ _id: new ObjectId(planId) });
      if (!existingPlan) {
        res.status(404).json(createErrorResponse('Subscription plan not found', 'PLAN_NOT_FOUND'));
        return;
      }

      const updateData: any = {
        updatedBy: userId,
        updatedAt: new Date(),
      };

      // Update fields if provided
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (category !== undefined) updateData.category = category;
      if (features !== undefined) updateData.features = features;
      if (limits !== undefined) updateData.limits = limits;
      if (trialDays !== undefined) updateData.trialDays = trialDays;
      if (isPopular !== undefined) updateData.isPopular = isPopular;
      if (displayOrder !== undefined) updateData.displayOrder = displayOrder;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (metadata !== undefined) updateData.metadata = metadata;

      // Update pricing if provided
      if (pricing) {
        const currentPricing = existingPlan.pricing;
        const newPricing: any = { ...currentPricing };

        if (pricing.monthly) {
          newPricing.monthly = {
            ...currentPricing.monthly,
            ...pricing.monthly,
          };
        }

        if (pricing.yearly) {
          newPricing.yearly = {
            ...currentPricing.yearly,
            ...pricing.yearly,
          };
        }

        // Recalculate yearly discount
        const monthlyAmount = new Decimal(newPricing.monthly.amount);
        const yearlyAmount = new Decimal(newPricing.yearly.amount);
        const yearlyEquivalent = monthlyAmount.mul(12);
        const yearlyDiscount = yearlyEquivalent.sub(yearlyAmount).div(yearlyEquivalent).mul(100);
        newPricing.yearlyDiscount = yearlyDiscount.toNumber();

        updateData.pricing = newPricing;
      }

      await plansCollection.updateOne(
        { _id: new ObjectId(planId) },
        { $set: updateData }
      );

      // Clear plans cache
      await clearPlansCache();

      logger.info('Subscription plan updated', {
        planId,
        updatedBy: userId,
      });

      const updatedPlan = await plansCollection.findOne({ _id: new ObjectId(planId) });
      res.json(createResponse(updatedPlan, 'Subscription plan updated successfully'));

    } catch (error) {
      logger.error('Error updating subscription plan', {
        planId: req.params.planId,
        userId: req.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json(createErrorResponse(
        'Failed to update subscription plan',
        'PLAN_UPDATE_FAILED'
      ));
    }
  }
);

/**
 * @swagger
 * /api/v1/plans/{planId}:
 *   delete:
 *     tags: [Plans]
 *     summary: Delete subscription plan (Admin only)
 */
planRoutes.delete('/:planId',
  authenticate,
  extractTenant,
  requireRole([UserRoles.ADMIN]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { planId } = req.params;
      const { id: userId } = req.user!;

      if (!ObjectId.isValid(planId)) {
        res.status(400).json(createErrorResponse('Invalid plan ID', 'INVALID_PLAN_ID'));
        return;
      }

      const db = getPlatformDatabase();
      const plansCollection = db.collection('subscription_plans');
      const subscriptionsCollection = db.collection('subscriptions');

      // Check if plan exists
      const existingPlan = await plansCollection.findOne({ _id: new ObjectId(planId) });
      if (!existingPlan) {
        res.status(404).json(createErrorResponse('Subscription plan not found', 'PLAN_NOT_FOUND'));
        return;
      }

      // Check if plan is being used by active subscriptions
      const activeSubscriptions = await subscriptionsCollection.countDocuments({
        planId: new ObjectId(planId),
        status: { $in: ['active', 'trial', 'past_due'] }
      });

      if (activeSubscriptions > 0) {
        res.status(400).json(createErrorResponse(
          'Cannot delete plan with active subscriptions. Deactivate the plan instead.',
          'PLAN_HAS_ACTIVE_SUBSCRIPTIONS'
        ));
        return;
      }

      // Soft delete (mark as inactive) instead of hard delete
      await plansCollection.updateOne(
        { _id: new ObjectId(planId) },
        {
          $set: {
            isActive: false,
            deletedBy: userId,
            deletedAt: new Date(),
            updatedAt: new Date(),
          }
        }
      );

      // Clear plans cache
      await clearPlansCache();

      logger.info('Subscription plan deleted', {
        planId,
        deletedBy: userId,
      });

      res.json(createResponse({ deleted: true }, 'Subscription plan deleted successfully'));

    } catch (error) {
      logger.error('Error deleting subscription plan', {
        planId: req.params.planId,
        userId: req.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json(createErrorResponse(
        'Failed to delete subscription plan',
        'PLAN_DELETION_FAILED'
      ));
    }
  }
);

/**
 * @swagger
 * /api/v1/plans/compare:
 *   post:
 *     tags: [Plans]
 *     summary: Compare multiple subscription plans
 */
planRoutes.post('/compare', async (req: Request, res: Response): Promise<void> => {
  try {
    const { planIds } = req.body;

    if (!planIds || !Array.isArray(planIds) || planIds.length === 0) {
      res.status(400).json(createErrorResponse(
        'PlanIds array is required',
        'INVALID_COMPARISON_DATA'
      ));
      return;
    }

    const validPlanIds = planIds.filter((id: string) => ObjectId.isValid(id));
    if (validPlanIds.length === 0) {
      res.status(400).json(createErrorResponse(
        'No valid plan IDs provided',
        'INVALID_PLAN_IDS'
      ));
      return;
    }

    const db = getPlatformDatabase();
    const plansCollection = db.collection('subscription_plans');

    const plans = await plansCollection
      .find({
        _id: { $in: validPlanIds.map(id => new ObjectId(id)) },
        isActive: true,
      })
      .toArray();

    const comparison = {
      plans: plans.map((plan: any) => ({
        id: plan._id,
        name: plan.name,
        description: plan.description,
        pricing: plan.pricing,
        features: plan.features,
        limits: plan.limits,
        trialDays: plan.trialDays,
        isPopular: plan.isPopular,
      })),
      featureComparison: generateFeatureComparison(plans),
      limitComparison: generateLimitComparison(plans),
    };

    logger.info('Plans comparison generated', {
      planIds: validPlanIds,
      planCount: plans.length,
    });

    res.json(createResponse(comparison, 'Plans comparison generated successfully'));

  } catch (error) {
    logger.error('Error generating plans comparison', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json(createErrorResponse(
      'Failed to generate plans comparison',
      'COMPARISON_GENERATION_FAILED'
    ));
  }
});

// Helper functions
async function clearPlansCache() {
  const pattern = 'plan*';
  await cache.deletePattern(pattern);
}

function generateFeatureComparison(plans: any[]) {
  const allFeatures = new Set<string>();
  plans.forEach(plan => {
    plan.features.forEach((feature: string) => allFeatures.add(feature));
  });

  return Array.from(allFeatures).map(feature => ({
    feature,
    availability: plans.map(plan => ({
      planId: plan._id,
      planName: plan.name,
      available: plan.features.includes(feature),
    })),
  }));
}

function generateLimitComparison(plans: any[]) {
  const allLimitTypes = new Set<string>();
  plans.forEach(plan => {
    plan.limits.forEach((limit: any) => allLimitTypes.add(limit.metricType));
  });

  return Array.from(allLimitTypes).map(metricType => ({
    metricType,
    limits: plans.map(plan => {
      const limit = plan.limits.find((l: any) => l.metricType === metricType);
      return {
        planId: plan._id,
        planName: plan.name,
        limit: limit ? limit.limit : 0,
        unit: limit ? limit.unit : '',
      };
    }),
  }));
}