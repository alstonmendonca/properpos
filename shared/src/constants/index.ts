// Constants and configuration for ProperPOS SaaS platform

import { FeatureFlags, SubscriptionPlans, UserRoles, Permissions } from '../types/common';

// ============ SUBSCRIPTION CONFIGURATION ============

export const SUBSCRIPTION_LIMITS = {
  [SubscriptionPlans.STARTER]: {
    locations: 1,
    users: 5,
    products: 100,
    monthlyOrders: 1000,
    storageGB: 1,
    features: [
      FeatureFlags.INVENTORY_MANAGEMENT,
      FeatureFlags.CUSTOM_RECEIPTS
    ] as FeatureFlags[]
  },
  [SubscriptionPlans.PROFESSIONAL]: {
    locations: 5,
    users: 25,
    products: 1000,
    monthlyOrders: 10000,
    storageGB: 10,
    features: [
      FeatureFlags.MULTI_LOCATION,
      FeatureFlags.ADVANCED_ANALYTICS,
      FeatureFlags.INVENTORY_MANAGEMENT,
      FeatureFlags.LOYALTY_PROGRAM,
      FeatureFlags.STAFF_MANAGEMENT,
      FeatureFlags.CUSTOM_RECEIPTS,
      FeatureFlags.API_ACCESS
    ] as FeatureFlags[]
  },
  [SubscriptionPlans.ENTERPRISE]: {
    locations: -1, // Unlimited
    users: -1,     // Unlimited
    products: -1,  // Unlimited
    monthlyOrders: -1, // Unlimited
    storageGB: 100,
    features: Object.values(FeatureFlags) as FeatureFlags[]
  }
} as const;

export const SUBSCRIPTION_PRICES = {
  [SubscriptionPlans.STARTER]: {
    monthly: 4900, // $49.00 in cents
    yearly: 47040  // $470.40 in cents (20% discount)
  },
  [SubscriptionPlans.PROFESSIONAL]: {
    monthly: 9900,  // $99.00 in cents
    yearly: 95040   // $950.40 in cents (20% discount)
  },
  [SubscriptionPlans.ENTERPRISE]: {
    monthly: 29900, // $299.00 in cents
    yearly: 287040  // $2,870.40 in cents (20% discount)
  }
} as const;

// ============ ROLE-BASED PERMISSIONS ============

export const ROLE_PERMISSIONS = {
  [UserRoles.SUPER_ADMIN]: Object.values(Permissions) as Permissions[],
  [UserRoles.TENANT_OWNER]: [
    Permissions.ORDER_CREATE,
    Permissions.ORDER_READ,
    Permissions.ORDER_UPDATE,
    Permissions.ORDER_DELETE,
    Permissions.ORDER_REFUND,
    Permissions.PRODUCT_CREATE,
    Permissions.PRODUCT_READ,
    Permissions.PRODUCT_UPDATE,
    Permissions.PRODUCT_DELETE,
    Permissions.INVENTORY_READ,
    Permissions.INVENTORY_UPDATE,
    Permissions.INVENTORY_TRANSFER,
    Permissions.CUSTOMER_CREATE,
    Permissions.CUSTOMER_READ,
    Permissions.CUSTOMER_UPDATE,
    Permissions.CUSTOMER_DELETE,
    Permissions.ANALYTICS_READ,
    Permissions.REPORTS_GENERATE,
    Permissions.REPORTS_EXPORT,
    Permissions.USER_CREATE,
    Permissions.USER_READ,
    Permissions.USER_UPDATE,
    Permissions.USER_DELETE,
    Permissions.SYSTEM_SETTINGS,
    Permissions.SYSTEM_BACKUP,
    Permissions.SYSTEM_LOGS,
    Permissions.LOCATION_MANAGE,
    Permissions.LOCATION_SWITCH
  ] as Permissions[],
  [UserRoles.ADMIN]: [
    Permissions.ORDER_CREATE,
    Permissions.ORDER_READ,
    Permissions.ORDER_UPDATE,
    Permissions.ORDER_DELETE,
    Permissions.ORDER_REFUND,
    Permissions.PRODUCT_CREATE,
    Permissions.PRODUCT_READ,
    Permissions.PRODUCT_UPDATE,
    Permissions.PRODUCT_DELETE,
    Permissions.INVENTORY_READ,
    Permissions.INVENTORY_UPDATE,
    Permissions.INVENTORY_TRANSFER,
    Permissions.CUSTOMER_CREATE,
    Permissions.CUSTOMER_READ,
    Permissions.CUSTOMER_UPDATE,
    Permissions.CUSTOMER_DELETE,
    Permissions.ANALYTICS_READ,
    Permissions.REPORTS_GENERATE,
    Permissions.REPORTS_EXPORT,
    Permissions.USER_CREATE,
    Permissions.USER_READ,
    Permissions.USER_UPDATE,
    Permissions.SYSTEM_SETTINGS,
    Permissions.LOCATION_SWITCH
  ] as Permissions[],
  [UserRoles.MANAGER]: [
    Permissions.ORDER_CREATE,
    Permissions.ORDER_READ,
    Permissions.ORDER_UPDATE,
    Permissions.ORDER_REFUND,
    Permissions.PRODUCT_READ,
    Permissions.PRODUCT_UPDATE,
    Permissions.INVENTORY_READ,
    Permissions.INVENTORY_UPDATE,
    Permissions.CUSTOMER_CREATE,
    Permissions.CUSTOMER_READ,
    Permissions.CUSTOMER_UPDATE,
    Permissions.ANALYTICS_READ,
    Permissions.REPORTS_GENERATE,
    Permissions.USER_READ,
    Permissions.LOCATION_SWITCH
  ] as Permissions[],
  [UserRoles.CASHIER]: [
    Permissions.ORDER_CREATE,
    Permissions.ORDER_READ,
    Permissions.ORDER_UPDATE,
    Permissions.PRODUCT_READ,
    Permissions.CUSTOMER_READ,
    Permissions.CUSTOMER_UPDATE
  ] as Permissions[],
  [UserRoles.STAFF]: [
    Permissions.ORDER_CREATE,
    Permissions.ORDER_READ,
    Permissions.ORDER_UPDATE,
    Permissions.PRODUCT_READ,
    Permissions.CUSTOMER_READ
  ] as Permissions[],
  [UserRoles.VIEWER]: [
    Permissions.ORDER_READ,
    Permissions.PRODUCT_READ,
    Permissions.CUSTOMER_READ,
    Permissions.ANALYTICS_READ
  ] as Permissions[]
} as const;

// ============ API CONFIGURATION ============

export const API_CONFIG = {
  VERSION: 'v1',
  BASE_PATH: '/api/v1',
  RATE_LIMITS: {
    DEFAULT: 100,      // requests per minute
    AUTHENTICATED: 1000,
    PREMIUM: 5000,
    WEBHOOK: 10000
  },
  TIMEOUT: {
    DEFAULT: 30000,    // 30 seconds
    UPLOAD: 300000,    // 5 minutes
    ANALYTICS: 60000   // 1 minute
  },
  PAGINATION: {
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100,
    MIN_LIMIT: 1
  }
} as const;

// ============ FILE UPLOAD CONFIGURATION ============

export const UPLOAD_CONFIG = {
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  MAX_FILES_PER_REQUEST: 10,
  ALLOWED_IMAGE_TYPES: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
  ],
  ALLOWED_DOCUMENT_TYPES: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv'
  ],
  STORAGE_PATHS: {
    PRODUCT_IMAGES: 'products/images',
    CATEGORY_IMAGES: 'categories/images',
    RECEIPTS: 'receipts',
    EXPORTS: 'exports',
    BACKUPS: 'backups',
    USER_AVATARS: 'users/avatars',
    ORGANIZATION_LOGOS: 'organizations/logos'
  }
} as const;

// ============ BUSINESS RULES ============

export const BUSINESS_RULES = {
  ORDER: {
    MAX_ITEMS_PER_ORDER: 50,
    MAX_QUANTITY_PER_ITEM: 999,
    MAX_DISCOUNT_PERCENTAGE: 100,
    MIN_ORDER_TOTAL: 0.01,
    MAX_ORDER_TOTAL: 999999.99,
    ORDER_NUMBER_PREFIX: 'ORD',
    KOT_NUMBER_PREFIX: 'KOT'
  },
  CUSTOMER: {
    MAX_ADDRESSES: 5,
    MAX_TAGS: 10,
    LOYALTY_TIERS: {
      BRONZE: { minSpent: 0, pointsMultiplier: 1 },
      SILVER: { minSpent: 1000, pointsMultiplier: 1.2 },
      GOLD: { minSpent: 5000, pointsMultiplier: 1.5 },
      PLATINUM: { minSpent: 10000, pointsMultiplier: 2 }
    },
    POINTS_PER_DOLLAR: 10
  },
  INVENTORY: {
    MAX_STOCK_LEVEL: 999999,
    DEFAULT_REORDER_LEVEL: 10,
    LOW_STOCK_THRESHOLD: 5,
    NEGATIVE_STOCK_ALLOWED: false
  },
  PRODUCT: {
    MAX_VARIANTS: 10,
    MAX_MODIFICATIONS: 20,
    MAX_ALLERGENS: 15,
    MAX_INGREDIENTS: 50,
    MAX_TAGS: 10,
    MIN_PRICE: 0.01,
    MAX_PRICE: 999999.99
  },
  ANALYTICS: {
    MAX_DATE_RANGE_DAYS: 365,
    CACHE_TTL_MINUTES: 15,
    MAX_EXPORT_RECORDS: 10000
  }
} as const;

// ============ NOTIFICATION SETTINGS ============

export const NOTIFICATION_CONFIG = {
  TYPES: {
    LOW_STOCK: 'low_stock',
    ORDER_RECEIVED: 'order_received',
    PAYMENT_FAILED: 'payment_failed',
    SYSTEM_ALERT: 'system_alert',
    BACKUP_COMPLETE: 'backup_complete',
    SUBSCRIPTION_EXPIRING: 'subscription_expiring'
  },
  CHANNELS: {
    EMAIL: 'email',
    SMS: 'sms',
    PUSH: 'push',
    IN_APP: 'in_app',
    WEBHOOK: 'webhook'
  },
  PRIORITIES: {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    URGENT: 'urgent'
  },
  RETRY_CONFIG: {
    MAX_RETRIES: 3,
    RETRY_DELAY: 5000, // 5 seconds
    BACKOFF_MULTIPLIER: 2
  }
} as const;

// ============ SECURITY CONFIGURATION ============

export const SECURITY_CONFIG = {
  JWT: {
    ACCESS_TOKEN_EXPIRY: '15m',
    REFRESH_TOKEN_EXPIRY: '7d',
    ALGORITHM: 'RS256'
  },
  PASSWORD: {
    MIN_LENGTH: 8,
    MAX_LENGTH: 128,
    BCRYPT_ROUNDS: 12,
    REQUIRE_UPPERCASE: true,
    REQUIRE_LOWERCASE: true,
    REQUIRE_NUMBERS: true,
    REQUIRE_SYMBOLS: true
  },
  SESSION: {
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_DURATION: 900000, // 15 minutes
    INACTIVITY_TIMEOUT: 3600000, // 1 hour
    CONCURRENT_SESSIONS: 3
  },
  MFA: {
    TOTP_WINDOW: 2,
    TOTP_STEP: 30,
    BACKUP_CODES_COUNT: 8
  },
  API_KEYS: {
    LENGTH: 32,
    PREFIX: 'pk_',
    EXPIRY_DAYS: 365
  }
} as const;

// ============ CURRENCY CONFIGURATION ============

export const CURRENCY_CONFIG = {
  SUPPORTED_CURRENCIES: [
    { code: 'USD', symbol: '$', name: 'US Dollar', decimals: 2 },
    { code: 'EUR', symbol: '€', name: 'Euro', decimals: 2 },
    { code: 'GBP', symbol: '£', name: 'British Pound', decimals: 2 },
    { code: 'INR', symbol: '₹', name: 'Indian Rupee', decimals: 2 },
    { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', decimals: 2 },
    { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', decimals: 2 },
    { code: 'JPY', symbol: '¥', name: 'Japanese Yen', decimals: 0 },
    { code: 'CNY', symbol: '¥', name: 'Chinese Yuan', decimals: 2 }
  ],
  DEFAULT_CURRENCY: 'USD',
  EXCHANGE_RATE_API: 'https://api.exchangerate-api.com/v4/latest/'
} as const;

// ============ TIME AND DATE CONFIGURATION ============

export const TIME_CONFIG = {
  DEFAULT_TIMEZONE: 'UTC',
  DATE_FORMATS: [
    'MM/DD/YYYY',
    'DD/MM/YYYY',
    'YYYY-MM-DD',
    'DD-MM-YYYY'
  ],
  TIME_FORMATS: [
    '12h', // 12-hour format
    '24h'  // 24-hour format
  ],
  BUSINESS_HOURS: {
    DEFAULT: {
      monday: { isOpen: true, openTime: '09:00', closeTime: '17:00' },
      tuesday: { isOpen: true, openTime: '09:00', closeTime: '17:00' },
      wednesday: { isOpen: true, openTime: '09:00', closeTime: '17:00' },
      thursday: { isOpen: true, openTime: '09:00', closeTime: '17:00' },
      friday: { isOpen: true, openTime: '09:00', closeTime: '17:00' },
      saturday: { isOpen: false },
      sunday: { isOpen: false }
    }
  }
} as const;

// ============ PAYMENT CONFIGURATION ============

export const PAYMENT_CONFIG = {
  PROVIDERS: {
    STRIPE: 'stripe',
    PAYPAL: 'paypal',
    SQUARE: 'square'
  },
  SUPPORTED_METHODS: [
    'cash',
    'card',
    'digital_wallet',
    'credit',
    'online'
  ],
  WEBHOOK_TOLERANCE: 300, // 5 minutes
  REFUND_WINDOW_DAYS: 30
} as const;

// ============ INTEGRATION CONFIGURATION ============

export const INTEGRATION_CONFIG = {
  WEBHOOKS: {
    TIMEOUT: 10000, // 10 seconds
    MAX_RETRIES: 3,
    RETRY_DELAYS: [1000, 5000, 15000] // 1s, 5s, 15s
  },
  EXTERNAL_APIS: {
    GOOGLE_PLACES: {
      TIMEOUT: 5000,
      RATE_LIMIT: 1000 // requests per day
    },
    TWILIO: {
      TIMEOUT: 10000,
      RATE_LIMIT: 1000 // requests per day
    },
    SENDGRID: {
      TIMEOUT: 10000,
      RATE_LIMIT: 40000 // requests per day
    }
  }
} as const;

// ============ ERROR CODES ============

export const ERROR_CODES = {
  // Authentication errors
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  MFA_REQUIRED: 'MFA_REQUIRED',

  // Authorization errors
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  TENANT_ACCESS_DENIED: 'TENANT_ACCESS_DENIED',
  LOCATION_ACCESS_DENIED: 'LOCATION_ACCESS_DENIED',

  // Validation errors
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INVALID_INPUT: 'INVALID_INPUT',
  REQUIRED_FIELD_MISSING: 'REQUIRED_FIELD_MISSING',

  // Business logic errors
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  ORDER_ALREADY_COMPLETED: 'ORDER_ALREADY_COMPLETED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  SUBSCRIPTION_EXPIRED: 'SUBSCRIPTION_EXPIRED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',

  // System errors
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  FILE_UPLOAD_FAILED: 'FILE_UPLOAD_FAILED',
  BACKUP_FAILED: 'BACKUP_FAILED',

  // Rate limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS'
} as const;

// ============ CACHE CONFIGURATION ============

export const CACHE_CONFIG = {
  TTL: {
    SHORT: 300,      // 5 minutes
    MEDIUM: 1800,    // 30 minutes
    LONG: 3600,      // 1 hour
    VERY_LONG: 86400 // 24 hours
  },
  KEYS: {
    USER_SESSION: 'session:user:',
    ORGANIZATION_CONFIG: 'org:config:',
    PRODUCT_CATALOG: 'products:',
    ANALYTICS_DATA: 'analytics:',
    RATE_LIMIT: 'ratelimit:'
  }
} as const;

// ============ MONITORING AND LOGGING ============

export const MONITORING_CONFIG = {
  LOG_LEVELS: ['error', 'warn', 'info', 'debug'] as const,
  METRICS: {
    RESPONSE_TIME_BUCKETS: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
    RATE_LIMITING_WINDOW: 60000, // 1 minute
    HEALTH_CHECK_INTERVAL: 30000 // 30 seconds
  },
  ALERTS: {
    ERROR_RATE_THRESHOLD: 0.05, // 5%
    RESPONSE_TIME_THRESHOLD: 2000, // 2 seconds
    DISK_USAGE_THRESHOLD: 0.85 // 85%
  }
} as const;

// Export all constants for easy importing
export * from '../types/common';
export * from '../types/entities';
export * from '../types/api';