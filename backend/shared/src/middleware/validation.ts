// Validation Middleware using Zod schemas

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ValidationSchemas } from '@properpos/shared';
import { ApiError } from '../utils/errors';
import { logger } from '../utils/logger';

// Validation targets
export type ValidationTarget = 'body' | 'query' | 'params' | 'headers';

/**
 * Generic validation middleware factory
 */
export const validate = <T extends z.ZodType>(
  schema: T,
  target: ValidationTarget = 'body'
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const data = req[target];
    try {
      const validatedData = schema.parse(data);

      // Replace the original data with validated data
      (req as any)[target] = validatedData;

      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = new ApiError(
          'Validation failed',
          'VALIDATION_ERROR',
          400,
          {
            errors: error.issues.map(issue => ({
              path: issue.path.join('.'),
              message: issue.message,
              code: issue.code,
            })),
          }
        );

        // Log validation errors for debugging
        logger.warn('Validation error', {
          target,
          errors: validationError.details,
          originalData: data,
        });

        return next(validationError);
      }
      next(error);
    }
  };
};

/**
 * Validate request body
 */
export const validateBody = <T extends z.ZodType>(schema: T) => {
  return validate(schema, 'body');
};

/**
 * Validate query parameters
 */
export const validateQuery = <T extends z.ZodType>(schema: T) => {
  return validate(schema, 'query');
};

/**
 * Validate URL parameters
 */
export const validateParams = <T extends z.ZodType>(schema: T) => {
  return validate(schema, 'params');
};

/**
 * Validate headers
 */
export const validateHeaders = <T extends z.ZodType>(schema: T) => {
  return validate(schema, 'headers');
};

// Common parameter schemas
export const commonParams = {
  id: z.object({
    id: z.string().min(1, 'ID is required'),
  }),

  tenantId: z.object({
    tenantId: z.string().min(1, 'Tenant ID is required'),
  }),

  locationId: z.object({
    locationId: z.string().min(1, 'Location ID is required'),
  }),

  pagination: z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
    sortBy: z.string().default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
    search: z.string().optional(),
  }),

  // Enhanced date range validation
  dateRange: z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }).refine(
    data => {
      if (data.startDate && data.endDate) {
        return new Date(data.startDate) <= new Date(data.endDate);
      }
      return true;
    },
    { message: 'End date must be after start date' }
  ).refine(
    data => {
      // Max date range validation: 1 year max
      if (data.startDate && data.endDate) {
        const start = new Date(data.startDate);
        const end = new Date(data.endDate);
        const maxRangeMs = 365 * 24 * 60 * 60 * 1000; // 1 year
        return (end.getTime() - start.getTime()) <= maxRangeMs;
      }
      return true;
    },
    { message: 'Date range cannot exceed 1 year' }
  ),

  // Date with no future dates allowed
  pastDate: z.string().datetime().refine(
    date => new Date(date) <= new Date(),
    { message: 'Date cannot be in the future' }
  ),

  // Date with no past dates allowed (for scheduling)
  futureDate: z.string().datetime().refine(
    date => new Date(date) >= new Date(),
    { message: 'Date must be in the future' }
  ),

  // Date within reasonable bounds (not too far in past or future)
  boundedDate: z.string().datetime().refine(
    date => {
      const d = new Date(date);
      const now = new Date();
      const minDate = new Date(now.getFullYear() - 10, 0, 1); // 10 years ago
      const maxDate = new Date(now.getFullYear() + 5, 11, 31); // 5 years in future
      return d >= minDate && d <= maxDate;
    },
    { message: 'Date must be within 10 years in the past and 5 years in the future' }
  ),

  // Date only (no time component) - YYYY-MM-DD format
  dateOnly: z.string().regex(
    /^\d{4}-\d{2}-\d{2}$/,
    { message: 'Date must be in YYYY-MM-DD format' }
  ).refine(
    date => {
      const d = new Date(date);
      return !isNaN(d.getTime());
    },
    { message: 'Invalid date' }
  ),

  // Time only - HH:mm or HH:mm:ss format
  timeOnly: z.string().regex(
    /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/,
    { message: 'Time must be in HH:mm or HH:mm:ss format' }
  ),
};

// Pre-configured validation middleware for common schemas
export const validationMiddleware = {
  // Authentication
  login: validateBody(ValidationSchemas.LoginRequest),
  register: validateBody(ValidationSchemas.RegisterRequest),

  // Organization
  createOrganization: validateBody(ValidationSchemas.CreateOrganization),
  updateOrganization: validateBody(ValidationSchemas.UpdateOrganization),

  // Location
  createLocation: validateBody(ValidationSchemas.LocationRequest),
  updateLocation: validateBody(ValidationSchemas.LocationRequest),

  // Products
  createProduct: validateBody(ValidationSchemas.CreateProduct),
  updateProduct: validateBody(ValidationSchemas.UpdateProduct),
  productQuery: validateQuery(ValidationSchemas.ProductQuery),

  // Categories
  createCategory: validateBody(ValidationSchemas.CreateCategory),
  updateCategory: validateBody(ValidationSchemas.UpdateCategory),

  // Orders
  createOrder: validateBody(ValidationSchemas.CreateOrder),
  updateOrder: validateBody(ValidationSchemas.UpdateOrder),
  orderQuery: validateQuery(ValidationSchemas.OrderQuery),

  // Customers
  createCustomer: validateBody(ValidationSchemas.CreateCustomer),
  updateCustomer: validateBody(ValidationSchemas.UpdateCustomer),
  customerQuery: validateQuery(ValidationSchemas.CustomerQuery),

  // Analytics
  analyticsQuery: validateQuery(ValidationSchemas.AnalyticsQuery),

  // Users
  createUser: validateBody(ValidationSchemas.CreateUser),
  updateUser: validateBody(ValidationSchemas.UpdateUser),
  updateProfile: validateBody(ValidationSchemas.UpdateUser),

  // Common parameters
  idParam: validateParams(commonParams.id),
  tenantIdParam: validateParams(commonParams.tenantId),
  locationIdParam: validateParams(commonParams.locationId),
  paginationQuery: validateQuery(commonParams.pagination),
  dateRangeQuery: validateQuery(commonParams.dateRange),

  // Tenant settings (passthrough for now)
  tenantSettings: (req: Request, res: Response, next: NextFunction) => next(),
  updateLocationHours: (req: Request, res: Response, next: NextFunction) => next(),

  // Inventory - Stock Movement
  createStockMovement: validateBody(z.object({
    productId: z.string().min(1, 'Product ID is required'),
    locationId: z.string().min(1, 'Location ID is required'),
    type: z.enum(['in', 'out', 'adjustment', 'transfer', 'return', 'waste', 'damage']),
    quantity: z.number().int().positive('Quantity must be a positive integer'),
    reason: z.string().min(1, 'Reason is required').max(500),
    referenceNumber: z.string().optional(),
    notes: z.string().max(1000).optional(),
    cost: z.number().min(0).optional(),
    destinationLocationId: z.string().optional(), // For transfers
  }).refine(data => {
    // If type is transfer, destinationLocationId is required
    if (data.type === 'transfer' && !data.destinationLocationId) {
      return false;
    }
    return true;
  }, { message: 'Destination location is required for transfers' })),

  // Inventory - Update Stock
  updateStock: validateBody(z.object({
    productId: z.string().min(1, 'Product ID is required'),
    locationId: z.string().min(1, 'Location ID is required'),
    currentStock: z.number().int().min(0, 'Stock cannot be negative').optional(),
    reorderLevel: z.number().int().min(0).optional(),
    maxStock: z.number().int().min(0).optional(),
    isTracked: z.boolean().optional(),
  }).refine(data => {
    if (data.reorderLevel !== undefined && data.maxStock !== undefined) {
      return data.maxStock >= data.reorderLevel;
    }
    return true;
  }, { message: 'Max stock must be greater than or equal to reorder level' })),

  // Inventory - Create Purchase Order
  createPurchaseOrder: validateBody(z.object({
    supplierId: z.string().min(1, 'Supplier ID is required'),
    locationId: z.string().min(1, 'Location ID is required'),
    items: z.array(z.object({
      productId: z.string().min(1, 'Product ID is required'),
      quantity: z.number().int().positive('Quantity must be positive'),
      unitCost: z.number().min(0, 'Unit cost cannot be negative'),
      notes: z.string().max(500).optional(),
    })).min(1, 'At least one item is required'),
    expectedDeliveryDate: z.string().datetime().optional(),
    notes: z.string().max(1000).optional(),
    shippingCost: z.number().min(0).optional(),
    taxAmount: z.number().min(0).optional(),
  })),

  // Inventory - Update Purchase Order
  updatePurchaseOrder: validateBody(z.object({
    status: z.enum(['draft', 'pending', 'approved', 'ordered', 'partial', 'received', 'cancelled']).optional(),
    items: z.array(z.object({
      productId: z.string().min(1),
      quantity: z.number().int().positive(),
      unitCost: z.number().min(0),
      notes: z.string().max(500).optional(),
    })).optional(),
    expectedDeliveryDate: z.string().datetime().optional(),
    notes: z.string().max(1000).optional(),
    shippingCost: z.number().min(0).optional(),
    taxAmount: z.number().min(0).optional(),
  })),

  // Inventory - Receive Purchase Order
  receivePurchaseOrder: validateBody(z.object({
    items: z.array(z.object({
      productId: z.string().min(1, 'Product ID is required'),
      quantityReceived: z.number().int().min(0, 'Quantity received cannot be negative'),
      quantityDamaged: z.number().int().min(0).optional().default(0),
      notes: z.string().max(500).optional(),
    })).min(1, 'At least one item is required'),
    receivedDate: z.string().datetime().optional(),
    receivedBy: z.string().optional(),
    notes: z.string().max(1000).optional(),
    invoiceNumber: z.string().max(100).optional(),
  })),

  // Orders - Update Order Items
  updateOrderItems: validateBody(z.object({
    items: z.array(z.object({
      productId: z.string().min(1, 'Product ID is required'),
      quantity: z.number().int().positive('Quantity must be positive'),
      unitPrice: z.number().min(0, 'Unit price cannot be negative'),
      notes: z.string().max(500).optional(),
      modifiers: z.array(z.object({
        id: z.string(),
        name: z.string(),
        price: z.number().min(0),
      })).optional(),
      discountType: z.enum(['percentage', 'fixed']).optional(),
      discountValue: z.number().min(0).optional(),
    })).min(1, 'At least one item is required'),
  })),

  // Users - Invite User
  inviteUser: validateBody(z.object({
    email: z.string().email('Invalid email format'),
    role: z.enum(['tenant_owner', 'manager', 'staff', 'cashier']),
    firstName: z.string().min(1, 'First name is required').max(100),
    lastName: z.string().min(1, 'Last name is required').max(100),
    locationAccess: z.array(z.string()).optional(),
    permissions: z.array(z.string()).optional(),
    sendEmail: z.boolean().optional().default(true),
  })),

  // Billing - Create Subscription
  createSubscription: validateBody(z.object({
    planId: z.string().min(1, 'Plan ID is required'),
    billingCycle: z.enum(['monthly', 'yearly']),
    paymentMethodId: z.string().optional(),
    couponCode: z.string().max(50).optional(),
    trialDays: z.number().int().min(0).max(90).optional(),
    metadata: z.record(z.string()).optional(),
  })),

  // Billing - Upgrade Subscription
  upgradeSubscription: validateBody(z.object({
    newPlanId: z.string().min(1, 'New plan ID is required'),
    billingCycle: z.enum(['monthly', 'yearly']).optional(),
    prorated: z.boolean().optional().default(true),
    effectiveDate: z.enum(['immediate', 'next_billing_cycle']).optional().default('immediate'),
  })),

  // Billing - Downgrade Subscription
  downgradeSubscription: validateBody(z.object({
    newPlanId: z.string().min(1, 'New plan ID is required'),
    billingCycle: z.enum(['monthly', 'yearly']).optional(),
    effectiveDate: z.enum(['immediate', 'next_billing_cycle']).optional().default('next_billing_cycle'),
    reason: z.string().max(500).optional(),
  })),

  // Billing - Update Subscription Plan
  updateSubscriptionPlan: validateBody(z.object({
    planId: z.string().min(1, 'Plan ID is required').optional(),
    billingCycle: z.enum(['monthly', 'yearly']).optional(),
    quantity: z.number().int().positive().optional(), // For seat-based plans
    addons: z.array(z.object({
      addonId: z.string().min(1),
      quantity: z.number().int().positive().optional().default(1),
    })).optional(),
    couponCode: z.string().max(50).optional(),
  })),

  // Billing - Process Payment
  processPayment: validateBody(z.object({
    amount: z.number().positive('Amount must be positive'),
    currency: z.string().length(3, 'Currency must be 3-letter code').default('USD'),
    paymentMethodId: z.string().min(1, 'Payment method ID is required'),
    description: z.string().max(500).optional(),
    metadata: z.record(z.string()).optional(),
    idempotencyKey: z.string().max(100).optional(),
    savePaymentMethod: z.boolean().optional().default(false),
  })),
};

/**
 * Sanitize and validate file uploads
 */
export const validateFileUpload = (options: {
  maxSize?: number;
  allowedTypes?: string[];
  maxFiles?: number;
  required?: boolean;
} = {}) => {
  const {
    maxSize = 5 * 1024 * 1024, // 5MB
    allowedTypes = ['image/jpeg', 'image/png', 'image/webp'],
    maxFiles = 1,
    required = false,
  } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const files = req.files as Express.Multer.File[] | undefined;
    const file = req.file as Express.Multer.File | undefined;

    // Check if file is required
    if (required && !file && (!files || files.length === 0)) {
      return next(new ApiError('File is required', 'FILE_REQUIRED', 400));
    }

    // If no files and not required, continue
    if (!file && (!files || files.length === 0)) {
      return next();
    }

    const filesToValidate = files || (file ? [file] : []);

    // Check number of files
    if (filesToValidate.length > maxFiles) {
      return next(new ApiError(
        `Maximum ${maxFiles} files allowed`,
        'TOO_MANY_FILES',
        400
      ));
    }

    // Validate each file
    for (const uploadedFile of filesToValidate) {
      // Check file size
      if (uploadedFile.size > maxSize) {
        return next(new ApiError(
          `File size exceeds ${Math.round(maxSize / 1024 / 1024)}MB limit`,
          'FILE_TOO_LARGE',
          400
        ));
      }

      // Check file type
      if (!allowedTypes.includes(uploadedFile.mimetype)) {
        return next(new ApiError(
          `File type ${uploadedFile.mimetype} not allowed`,
          'INVALID_FILE_TYPE',
          400
        ));
      }

      // Sanitize filename
      if (uploadedFile.originalname) {
        uploadedFile.originalname = uploadedFile.originalname
          .replace(/[^a-zA-Z0-9.-]/g, '_')
          .replace(/_+/g, '_')
          .toLowerCase();
      }
    }

    next();
  };
};

/**
 * Validate JSON structure
 */
export const validateJson = (req: Request, res: Response, next: NextFunction): void => {
  const contentType = req.headers['content-type'];

  if (contentType && contentType.includes('application/json')) {
    if (req.method !== 'GET' && req.method !== 'DELETE' && !req.body) {
      return next(new ApiError('Invalid JSON body', 'INVALID_JSON', 400));
    }
  }

  next();
};

/**
 * Validate business hours format
 */
export const validateBusinessHours = (hours: any): boolean => {
  const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;

  if (typeof hours !== 'object' || !hours) {
    return false;
  }

  for (const [day, schedule] of Object.entries(hours)) {
    if (!validDays.includes(day.toLowerCase())) {
      return false;
    }

    if (typeof schedule !== 'object' || !schedule) {
      return false;
    }

    const { isOpen, openTime, closeTime } = schedule as any;

    if (typeof isOpen !== 'boolean') {
      return false;
    }

    if (isOpen) {
      if (!openTime || !closeTime) {
        return false;
      }

      if (!timeRegex.test(openTime) || !timeRegex.test(closeTime)) {
        return false;
      }

      // Check if open time is before close time
      const [openHour, openMin] = openTime.split(':').map(Number);
      const [closeHour, closeMin] = closeTime.split(':').map(Number);

      if (openHour > closeHour || (openHour === closeHour && openMin >= closeMin)) {
        return false;
      }
    }
  }

  return true;
};

/**
 * Custom validation for complex business rules
 */
export const validateBusinessRules = {
  // Validate order items
  orderItems: (items: any[]): boolean => {
    if (!Array.isArray(items) || items.length === 0) {
      return false;
    }

    return items.every(item => {
      return (
        item.productId &&
        typeof item.quantity === 'number' &&
        item.quantity > 0 &&
        typeof item.unitPrice === 'number' &&
        item.unitPrice >= 0
      );
    });
  },

  // Validate discount rules
  discounts: (discounts: any[], orderTotal: number): boolean => {
    if (!Array.isArray(discounts)) {
      return false;
    }

    let totalDiscount = 0;

    for (const discount of discounts) {
      if (!discount.type || !['percentage', 'fixed'].includes(discount.type)) {
        return false;
      }

      if (typeof discount.amount !== 'number' || discount.amount < 0) {
        return false;
      }

      if (discount.type === 'percentage' && discount.amount > 100) {
        return false;
      }

      if (discount.type === 'fixed') {
        totalDiscount += discount.amount;
      } else if (discount.type === 'percentage') {
        totalDiscount += (orderTotal * discount.amount) / 100;
      }
    }

    return totalDiscount <= orderTotal;
  },

  // Validate inventory levels
  inventoryLevels: (levels: any[]): boolean => {
    if (!Array.isArray(levels)) {
      return false;
    }

    return levels.every(level => {
      return (
        level.locationId &&
        typeof level.currentStock === 'number' &&
        typeof level.reorderLevel === 'number' &&
        typeof level.maxStock === 'number' &&
        level.currentStock >= 0 &&
        level.reorderLevel >= 0 &&
        level.maxStock >= level.reorderLevel &&
        level.currentStock <= level.maxStock
      );
    });
  },
};

/**
 * Middleware to validate tenant-specific constraints
 */
export const validateTenantConstraints = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.tenant) {
      return next(new ApiError('Tenant information required', 'TENANT_REQUIRED', 400));
    }

    const { subscription } = req.tenant;
    const limits = (subscription as any).limits;

    // Here you would add specific constraint validations based on the request
    // For example, checking if creating a new location would exceed the limit

    next();
  } catch (error) {
    next(error);
  }
};