// Common types shared across the ProperPOS SaaS platform

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    hasMore?: boolean;
  };
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

// Base entity interface
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  isActive: boolean;
}

// Audit trail interface
export interface AuditableEntity extends BaseEntity {
  version: number;
  lastModifiedBy?: string;
}

// Soft delete support
export interface SoftDeletableEntity extends BaseEntity {
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: string;
  deletionReason?: string;
}

// Geographic location
export interface Address {
  street: string;
  city: string;
  state: string;
  country: string;
  zipCode: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
}

// File/Media types
export interface MediaFile {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  altText?: string;
  tags?: string[];
}

// Business hours configuration
export interface BusinessHours {
  [key: string]: {
    isOpen: boolean;
    openTime?: string;    // HH:MM format
    closeTime?: string;   // HH:MM format
  };
}

// Currency and monetary values
export interface MonetaryValue {
  amount: number;
  currency: string;
}

// Tax configuration
export interface TaxConfiguration {
  rate: number;
  name: string;
  isInclusive: boolean;
  isActive: boolean;
}

// Error types
export enum ErrorCodes {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  TENANT_NOT_FOUND = 'TENANT_NOT_FOUND',
  SUBSCRIPTION_EXPIRED = 'SUBSCRIPTION_EXPIRED',
  FEATURE_NOT_AVAILABLE = 'FEATURE_NOT_AVAILABLE',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  INVALID_TOKEN = 'INVALID_TOKEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS'
}

// Event types for audit logs
export enum EventTypes {
  // Authentication events
  USER_LOGIN = 'user.login',
  USER_LOGOUT = 'user.logout',
  USER_LOGIN_FAILED = 'user.login_failed',
  PASSWORD_CHANGED = 'user.password_changed',

  // Order events
  ORDER_CREATED = 'order.created',
  ORDER_UPDATED = 'order.updated',
  ORDER_CANCELLED = 'order.cancelled',
  ORDER_COMPLETED = 'order.completed',
  ORDER_REFUNDED = 'order.refunded',

  // Product events
  PRODUCT_CREATED = 'product.created',
  PRODUCT_UPDATED = 'product.updated',
  PRODUCT_DELETED = 'product.deleted',

  // Inventory events
  INVENTORY_ADJUSTED = 'inventory.adjusted',
  INVENTORY_TRANSFER = 'inventory.transfer',
  LOW_STOCK_ALERT = 'inventory.low_stock_alert',

  // System events
  SYSTEM_BACKUP_CREATED = 'system.backup_created',
  SYSTEM_MAINTENANCE = 'system.maintenance',
  DATA_EXPORT = 'system.data_export',

  // Billing events
  PAYMENT_PROCESSED = 'billing.payment_processed',
  PAYMENT_FAILED = 'billing.payment_failed',
  SUBSCRIPTION_UPDATED = 'billing.subscription_updated'
}

// Permissions system
export enum Permissions {
  // Order management
  ORDER_CREATE = 'order:create',
  ORDER_READ = 'order:read',
  ORDER_UPDATE = 'order:update',
  ORDER_DELETE = 'order:delete',
  ORDER_REFUND = 'order:refund',

  // Product management
  PRODUCT_CREATE = 'product:create',
  PRODUCT_READ = 'product:read',
  PRODUCT_UPDATE = 'product:update',
  PRODUCT_DELETE = 'product:delete',

  // Inventory management
  INVENTORY_READ = 'inventory:read',
  INVENTORY_UPDATE = 'inventory:update',
  INVENTORY_TRANSFER = 'inventory:transfer',

  // Customer management
  CUSTOMER_CREATE = 'customer:create',
  CUSTOMER_READ = 'customer:read',
  CUSTOMER_UPDATE = 'customer:update',
  CUSTOMER_DELETE = 'customer:delete',

  // Analytics and reports
  ANALYTICS_READ = 'analytics:read',
  REPORTS_GENERATE = 'reports:generate',
  REPORTS_EXPORT = 'reports:export',

  // User management
  USER_CREATE = 'user:create',
  USER_READ = 'user:read',
  USER_UPDATE = 'user:update',
  USER_DELETE = 'user:delete',

  // System administration
  SYSTEM_SETTINGS = 'system:settings',
  SYSTEM_BACKUP = 'system:backup',
  SYSTEM_LOGS = 'system:logs',

  // Multi-location
  LOCATION_MANAGE = 'location:manage',
  LOCATION_SWITCH = 'location:switch'
}

export type PermissionSet = Permissions[];

// Role definitions
export enum UserRoles {
  SUPER_ADMIN = 'super_admin',      // Platform administrator
  TENANT_OWNER = 'tenant_owner',     // Organization owner
  ADMIN = 'admin',                   // Full access within tenant
  MANAGER = 'manager',               // Management functions
  CASHIER = 'cashier',               // POS operations only
  STAFF = 'staff',                   // Limited access
  VIEWER = 'viewer'                  // Read-only access
}

// Feature flags
export enum FeatureFlags {
  MULTI_LOCATION = 'multi_location',
  ADVANCED_ANALYTICS = 'advanced_analytics',
  INVENTORY_MANAGEMENT = 'inventory_management',
  LOYALTY_PROGRAM = 'loyalty_program',
  ONLINE_ORDERING = 'online_ordering',
  TABLE_MANAGEMENT = 'table_management',
  STAFF_MANAGEMENT = 'staff_management',
  CUSTOM_RECEIPTS = 'custom_receipts',
  API_ACCESS = 'api_access',
  WEBHOOK_NOTIFICATIONS = 'webhook_notifications',
  ADVANCED_REPORTING = 'advanced_reporting',
  MOBILE_APP = 'mobile_app'
}

// Subscription plans
export enum SubscriptionPlans {
  STARTER = 'starter',
  PROFESSIONAL = 'professional',
  ENTERPRISE = 'enterprise'
}

export interface SubscriptionFeatures {
  locations: number;
  users: number;
  products: number;
  monthlyOrders: number;
  storageGB: number;
  features: FeatureFlags[];
}

// Business types
export enum BusinessTypes {
  FOOD_SERVICE = 'food',
  FOOD = 'food',
  RETAIL = 'retail'
}

// Order statuses
export enum OrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  PREPARING = 'preparing',
  READY = 'ready',
  SERVED = 'served',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

// Payment methods
export enum PaymentMethods {
  CASH = 'cash',
  CARD = 'card',
  DIGITAL_WALLET = 'digital_wallet',
  CREDIT = 'credit',
  ONLINE = 'online'
}

// Order types
export enum OrderTypes {
  DINE_IN = 'dine-in',
  TAKEAWAY = 'takeaway',
  DELIVERY = 'delivery',
  ONLINE = 'online'
}

// Inventory transaction types
export enum InventoryTransactionTypes {
  SALE = 'sale',
  PURCHASE = 'purchase',
  ADJUSTMENT = 'adjustment',
  TRANSFER = 'transfer',
  RETURN = 'return',
  WASTE = 'waste'
}

// Notification types
export enum NotificationTypes {
  LOW_STOCK = 'low_stock',
  ORDER_RECEIVED = 'order_received',
  PAYMENT_FAILED = 'payment_failed',
  SYSTEM_ALERT = 'system_alert',
  BACKUP_COMPLETE = 'backup_complete',
  SUBSCRIPTION_EXPIRING = 'subscription_expiring'
}

// Analytics time periods
export enum TimePeriods {
  TODAY = 'today',
  YESTERDAY = 'yesterday',
  THIS_WEEK = 'this_week',
  LAST_WEEK = 'last_week',
  THIS_MONTH = 'this_month',
  LAST_MONTH = 'last_month',
  THIS_YEAR = 'this_year',
  LAST_YEAR = 'last_year',
  CUSTOM = 'custom'
}

// Sort directions
export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc'
}

// File upload constraints
export const FILE_CONSTRAINTS = {
  MAX_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  MAX_FILES_PER_UPLOAD: 10
} as const;

// API rate limits
export const RATE_LIMITS = {
  DEFAULT: 100,      // requests per minute
  AUTHENTICATED: 1000,
  PREMIUM: 5000,
  WEBHOOK: 10000
} as const;

// Database constraints
export const DB_CONSTRAINTS = {
  MAX_STRING_LENGTH: 500,
  MAX_TEXT_LENGTH: 5000,
  MAX_ARRAY_LENGTH: 100,
  MIN_PASSWORD_LENGTH: 8,
  MAX_PASSWORD_LENGTH: 128
} as const;