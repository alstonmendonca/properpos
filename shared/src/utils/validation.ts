// Validation utilities for ProperPOS SaaS platform

import { z } from 'zod';

// Common validation patterns
export const ValidationPatterns = {
  // Email validation with business rules
  email: z.string()
    .email('Invalid email format')
    .min(5, 'Email must be at least 5 characters')
    .max(254, 'Email must not exceed 254 characters')
    .toLowerCase()
    .transform(email => email.trim()),

  // Phone number validation (international format)
  phone: z.string()
    .min(10, 'Phone number must be at least 10 digits')
    .max(15, 'Phone number must not exceed 15 digits')
    .regex(/^[+]?[1-9][\d\s\-()]+$/, 'Invalid phone number format'),

  // Password validation with security requirements
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters')
    .regex(/^(?=.*[a-z])/, 'Password must contain at least one lowercase letter')
    .regex(/^(?=.*[A-Z])/, 'Password must contain at least one uppercase letter')
    .regex(/^(?=.*\d)/, 'Password must contain at least one number')
    .regex(/^(?=.*[@$!%*?&])/, 'Password must contain at least one special character'),

  // URL validation
  url: z.string()
    .url('Invalid URL format')
    .max(2048, 'URL must not exceed 2048 characters'),

  // MongoDB ObjectId validation
  objectId: z.string()
    .regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId format'),

  // UUID validation
  uuid: z.string()
    .uuid('Invalid UUID format'),

  // Alphanumeric with specific characters
  slug: z.string()
    .min(3, 'Slug must be at least 3 characters')
    .max(50, 'Slug must not exceed 50 characters')
    .regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens')
    .transform(slug => slug.toLowerCase().trim()),

  // Business name validation
  businessName: z.string()
    .min(2, 'Business name must be at least 2 characters')
    .max(100, 'Business name must not exceed 100 characters')
    .regex(/^[a-zA-Z0-9\s\-&.'"]+$/, 'Business name contains invalid characters')
    .transform(name => name.trim()),

  // SKU/Product code validation
  sku: z.string()
    .min(1, 'SKU cannot be empty')
    .max(50, 'SKU must not exceed 50 characters')
    .regex(/^[A-Z0-9\-_]+$/i, 'SKU can only contain letters, numbers, hyphens, and underscores')
    .transform(sku => sku.toUpperCase().trim()),

  // Currency code validation (ISO 4217)
  currency: z.string()
    .length(3, 'Currency code must be exactly 3 characters')
    .regex(/^[A-Z]{3}$/, 'Currency code must be 3 uppercase letters')
    .refine(code => ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD', 'JPY', 'CNY'].includes(code), {
      message: 'Unsupported currency code'
    }),

  // Timezone validation
  timezone: z.string()
    .min(1, 'Timezone cannot be empty')
    .refine(tz => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, 'Invalid timezone'),

  // Color hex validation
  hexColor: z.string()
    .regex(/^#[0-9A-F]{6}$/i, 'Color must be a valid hex code (e.g., #FF0000)'),

  // Percentage validation (0-100)
  percentage: z.number()
    .min(0, 'Percentage cannot be negative')
    .max(100, 'Percentage cannot exceed 100'),

  // Positive number validation
  positiveNumber: z.number()
    .min(0, 'Value must be positive or zero'),

  // Price validation (supports up to 2 decimal places)
  price: z.number()
    .min(0, 'Price cannot be negative')
    .max(999999.99, 'Price cannot exceed 999,999.99')
    .multipleOf(0.01, 'Price can have at most 2 decimal places'),

  // Quantity validation
  quantity: z.number()
    .int('Quantity must be a whole number')
    .min(1, 'Quantity must be at least 1')
    .max(9999, 'Quantity cannot exceed 9,999'),

  // Tax rate validation
  taxRate: z.number()
    .min(0, 'Tax rate cannot be negative')
    .max(50, 'Tax rate cannot exceed 50%')
    .multipleOf(0.01, 'Tax rate can have at most 2 decimal places'),

  // Latitude validation
  latitude: z.number()
    .min(-90, 'Latitude must be between -90 and 90')
    .max(90, 'Latitude must be between -90 and 90'),

  // Longitude validation
  longitude: z.number()
    .min(-180, 'Longitude must be between -180 and 180')
    .max(180, 'Longitude must be between -180 and 180'),

  // Date validation
  dateString: z.string()
    .datetime('Invalid date format. Use ISO 8601 format'),

  // Time validation (HH:MM format)
  timeString: z.string()
    .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be in HH:MM format'),

  // File size validation (in bytes)
  fileSize: z.number()
    .min(1, 'File cannot be empty')
    .max(5 * 1024 * 1024, 'File size cannot exceed 5MB'),

  // MIME type validation for images
  imageMimeType: z.string()
    .regex(/^image\/(jpeg|jpg|png|webp|gif)$/, 'File must be a valid image (JPEG, PNG, WebP, or GIF)'),

  // IP address validation
  ipAddress: z.string()
    .regex(/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/, 'Invalid IP address format'),

  // Version number validation (semantic versioning)
  version: z.string()
    .regex(/^\d+\.\d+\.\d+$/, 'Version must follow semantic versioning format (e.g., 1.0.0)')
} as const;

// Custom validation functions
export const CustomValidators = {
  // Validate that end date is after start date
  dateRange: (startDate: string, endDate: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return start < end;
  },

  // Validate business hours
  businessHours: (hours: Record<string, { isOpen: boolean; openTime?: string; closeTime?: string }>) => {
    const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    for (const [day, schedule] of Object.entries(hours)) {
      if (!validDays.includes(day.toLowerCase())) {
        return false;
      }

      if (schedule.isOpen) {
        if (!schedule.openTime || !schedule.closeTime) {
          return false;
        }

        const openTime = schedule.openTime.split(':').map(Number);
        const closeTime = schedule.closeTime.split(':').map(Number);

        const openHour = openTime[0] ?? 0;
        const openMin = openTime[1] ?? 0;
        const closeHour = closeTime[0] ?? 0;
        const closeMin = closeTime[1] ?? 0;

        // Check if open time is before close time
        if (openHour > closeHour || (openHour === closeHour && openMin >= closeMin)) {
          return false;
        }
      }
    }

    return true;
  },

  // Validate that at least one location is provided
  atLeastOneLocation: (locations: string[]) => {
    return locations.length > 0;
  },

  // Validate product availability schedule
  availabilitySchedule: (schedule: Record<string, { available: boolean; startTime?: string; endTime?: string }>) => {
    for (const [day, availability] of Object.entries(schedule)) {
      if (availability.available && (!availability.startTime || !availability.endTime)) {
        return false;
      }
    }
    return true;
  },

  // Validate order item modifications
  orderModifications: (modifications: Array<{ type: string; priceAdjustment: number }>) => {
    return modifications.every(mod => {
      if (mod.type === 'remove' && mod.priceAdjustment > 0) {
        return false; // Removing items should not increase price
      }
      return true;
    });
  },

  // Validate inventory levels
  inventoryLevels: (levels: Array<{ currentStock: number; reorderLevel: number; maxStock: number }>) => {
    return levels.every(level => {
      return level.reorderLevel <= level.currentStock && level.currentStock <= level.maxStock;
    });
  },

  // Validate discount amount against order total
  discountValidation: (discounts: Array<{ type: string; amount: number }>, orderTotal: number) => {
    let totalDiscount = 0;

    for (const discount of discounts) {
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

  // Validate payment amount
  paymentValidation: (paidAmount: number, orderTotal: number, paymentMethod: string) => {
    if (paymentMethod === 'cash') {
      return paidAmount >= orderTotal; // Cash payments must be at least order total
    }
    return Math.abs(paidAmount - orderTotal) < 0.01; // Allow for minor rounding differences
  },

  // Validate subscription limits
  subscriptionLimits: (current: Record<string, number>, limits: Record<string, number>) => {
    for (const [key, value] of Object.entries(current)) {
      if (limits[key] !== undefined && value > limits[key]) {
        return false;
      }
    }
    return true;
  },

  // Validate webhook URL accessibility
  webhookUrl: async (url: string): Promise<boolean> => {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      return response.status < 400;
    } catch {
      return false;
    }
  },

  // Validate API key permissions
  apiKeyPermissions: (permissions: string[], userPermissions: string[]) => {
    return permissions.every(permission => userPermissions.includes(permission));
  }
} as const;

// Validation error formatter
export const formatValidationError = (error: z.ZodError) => {
  return {
    code: 'VALIDATION_ERROR',
    message: 'Validation failed',
    details: error.issues.map(issue => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code
    }))
  };
};

// Schema composition helpers
export const createPaginationSchema = (defaultLimit = 20, maxLimit = 100) => {
  return z.object({
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(maxLimit).default(defaultLimit),
    sortBy: z.string().default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
    search: z.string().optional()
  });
};

export const createDateRangeSchema = () => {
  return z.object({
    startDate: ValidationPatterns.dateString,
    endDate: ValidationPatterns.dateString
  }).refine(
    data => CustomValidators.dateRange(data.startDate, data.endDate),
    { message: 'End date must be after start date' }
  );
};

// Request validation middleware helper
export const validateRequest = <T extends z.ZodType>(schema: T) => {
  return (data: unknown): z.infer<T> => {
    try {
      return schema.parse(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw formatValidationError(error);
      }
      throw error;
    }
  };
};

// Sanitization helpers
export const Sanitizers = {
  // Remove HTML tags and dangerous characters
  sanitizeText: (text: string): string => {
    return text
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/[<>'"&]/g, '') // Remove potentially dangerous characters
      .trim();
  },

  // Sanitize SQL-like input
  sanitizeQuery: (query: string): string => {
    return query
      .replace(/[';]/g, '') // Remove semicolons and quotes
      .replace(/[\x00-\x1f\x7f-\x9f]/g, '') // Remove control characters
      .trim();
  },

  // Sanitize file names
  sanitizeFileName: (filename: string): string => {
    return filename
      .replace(/[^a-zA-Z0-9.-]/g, '_') // Replace non-alphanumeric characters with underscore
      .replace(/_{2,}/g, '_') // Replace multiple underscores with single
      .toLowerCase();
  },

  // Sanitize URLs
  sanitizeUrl: (url: string): string => {
    try {
      const parsedUrl = new URL(url);
      // Only allow http and https protocols
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Invalid protocol');
      }
      return parsedUrl.toString();
    } catch {
      throw new Error('Invalid URL');
    }
  }
} as const;