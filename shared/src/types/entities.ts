// Entity type definitions for ProperPOS SaaS platform

import {
  BaseEntity,
  AuditableEntity,
  SoftDeletableEntity,
  Address,
  BusinessHours,
  MonetaryValue,
  TaxConfiguration,
  MediaFile,
  BusinessTypes,
  SubscriptionPlans,
  FeatureFlags,
  UserRoles,
  OrderStatus,
  OrderTypes,
  PaymentMethods,
  InventoryTransactionTypes,
  Permissions
} from './common';

// Organization (Tenant) Entity
export interface Organization extends BaseEntity {
  tenantId: string;
  name: string;
  slug: string;
  businessType: BusinessTypes;

  subscription: {
    plan: SubscriptionPlans;
    status: 'active' | 'suspended' | 'cancelled' | 'trial';
    startDate: Date;
    endDate: Date;
    billingCycle: 'monthly' | 'yearly';
    features: FeatureFlags[];
    limits: {
      locations: number;
      users: number;
      products: number;
      monthlyOrders: number;
      storageGB: number;
    };
  };

  contactInfo: {
    ownerName: string;
    ownerEmail: string;
    phone: string;
    website?: string;
    businessRegistration?: string;
    taxId?: string;
  };

  settings: {
    timezone: string;
    currency: string;
    dateFormat: string;
    language: string;
    customDomain?: string;
  };

  locations: Location[];

  billing: {
    stripeCustomerId: string;
    paymentMethodId?: string;
    lastPaymentDate?: Date;
    nextBillingDate?: Date;
    outstandingBalance: number;
    invoiceEmail: string;
  };

  lastActiveAt: Date;
}

// Location Entity
export interface Location extends BaseEntity {
  name: string;
  organizationId: string;

  address: Address;
  businessHours: BusinessHours;

  settings: {
    defaultTaxRate: number;
    currency: string;
    receiptSettings: {
      headerText: string;
      footerText: string;
      showLogo: boolean;
      logoUrl?: string;
    };
    printerConfig: {
      receiptPrinter?: {
        type: 'thermal' | 'inkjet';
        model: string;
        connectionType: 'usb' | 'network' | 'bluetooth';
        settings: Record<string, any>;
      };
      kotPrinter?: {
        type: 'thermal';
        model: string;
        connectionType: 'usb' | 'network' | 'bluetooth';
        settings: Record<string, any>;
      };
    };
  };
}

// User Entity
export interface User extends BaseEntity {
  email: string;

  profile: {
    firstName: string;
    lastName: string;
    phone?: string;
    avatar?: string;
    timezone: string;
  };

  auth: {
    passwordHash: string;
    isEmailVerified: boolean;
    emailVerificationToken?: string;
    passwordResetToken?: string;
    passwordResetExpires?: Date;
    lastLoginAt?: Date;
    loginAttempts: number;
    lockUntil?: Date;
    mfaEnabled: boolean;
    mfaSecret?: string;
  };

  globalRole: 'superAdmin' | 'platformAdmin' | 'customer';

  tenantMemberships: {
    tenantId: string;
    role: UserRoles;
    locationAccess: string[];
    permissions: Permissions[];
    status: 'active' | 'suspended' | 'invited';
    invitedAt?: Date;
    joinedAt?: Date;
  }[];

  lastActiveAt: Date;
}

// Product Entity
export interface Product extends AuditableEntity, SoftDeletableEntity {
  productId: string;
  organizationId: string;

  name: string;
  description?: string;
  sku?: string;
  barcode?: string;

  category: {
    id: string;
    name: string;
    path: string[];
  };
  tags: string[];

  pricing: {
    basePrice: number;
    costPrice?: number;
    variants?: {
      id: string;
      name: string;
      price: number;
      sku?: string;
    }[];
  };

  tax: {
    taxable: boolean;
    taxCategory: string;
    inclusive: boolean;
  };

  businessTypeData: {
    food?: {
      isVegetarian: boolean;
      isVegan?: boolean;
      isGlutenFree?: boolean;
      allergens?: string[];
      nutritionInfo?: {
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
      };
      preparationTime: number;
      spiceLevel?: 'mild' | 'medium' | 'hot' | 'extra-hot';
      ingredients?: string[];
    };

    retail?: {
      brand?: string;
      model?: string;
      color?: string;
      size?: string;
      weight?: number;
      dimensions?: {
        length: number;
        width: number;
        height: number;
        unit: 'cm' | 'inch';
      };
      warranty?: {
        duration: number;
        unit: 'days' | 'months' | 'years';
        terms: string;
      };
    };
  };

  inventory: {
    trackInventory: boolean;
    stockLevels: {
      locationId: string;
      currentStock: number;
      reservedStock: number;
      reorderLevel: number;
      maxStock: number;
    }[];
    unit: string;
  };

  availability: {
    isActive: boolean;
    availableLocations: string[];
    availabilitySchedule?: {
      [day: string]: {
        available: boolean;
        startTime?: string;
        endTime?: string;
      };
    };
  };

  media: {
    images: MediaFile[];
  };

  analytics: {
    totalSold: number;
    revenue: number;
    averageRating?: number;
    lastSoldAt?: Date;
  };
}

// Category Entity
export interface Category extends AuditableEntity {
  categoryId: string;
  organizationId: string;

  name: string;
  description?: string;

  parentId?: string;
  path: string[];
  level: number;

  display: {
    color: string;
    icon?: string;
    image?: string;
    sortOrder: number;
  };

  settings: {
    isActive: boolean;
    availableLocations: string[];
    defaultTaxCategory?: string;
  };

  analytics: {
    productCount: number;
    totalSales: number;
    lastUpdated: Date;
  };
}

// Order Entity
export interface Order extends AuditableEntity, SoftDeletableEntity {
  orderNumber: string;
  kotNumber?: string;
  organizationId: string;

  orderType: OrderTypes;
  status: OrderStatus;

  locationId: string;
  cashierId: string;

  customer?: {
    id?: string;
    name?: string;
    phone?: string;
    email?: string;
    address?: Address;
  };

  items: OrderItem[];

  pricing: {
    subtotal: number;
    discounts: {
      type: 'percentage' | 'fixed' | 'item';
      description: string;
      amount: number;
      appliedBy: string;
    }[];
    totalDiscount: number;

    taxes: {
      name: string;
      rate: number;
      amount: number;
      inclusive: boolean;
    }[];
    totalTax: number;

    tips?: number;
    total: number;
  };

  payment: {
    method: PaymentMethods;
    status: 'pending' | 'paid' | 'partial' | 'refunded';
    paidAmount: number;
    changeAmount: number;
    transactionId?: string;
    paymentProcessor?: string;
    paymentTime?: Date;
  };

  diningInfo?: {
    tableNumber?: string;
    numberOfGuests: number;
    serverName?: string;
  };

  timestamps: {
    orderedAt: Date;
    confirmedAt?: Date;
    prepStartedAt?: Date;
    readyAt?: Date;
    servedAt?: Date;
    completedAt?: Date;
  };

  source: {
    type: 'pos' | 'online' | 'phone' | 'mobile_app';
    details?: Record<string, any>;
  };

  flags: {
    isPriority: boolean;
    isTest: boolean;
    requiresKot: boolean;
    printReceipt: boolean;
  };

  deletionReason?: string;
}

// Order Item
export interface OrderItem {
  productId: string;
  variantId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;

  modifications?: {
    type: 'add' | 'remove' | 'substitute';
    description: string;
    priceAdjustment: number;
  }[];

  notes?: string;

  tax: {
    rate: number;
    amount: number;
    inclusive: boolean;
  };

  itemStatus?: 'ordered' | 'preparing' | 'ready' | 'served';
}

// Customer Entity
export interface Customer extends AuditableEntity {
  customerId: string;
  organizationId: string;

  personalInfo: {
    firstName: string;
    lastName: string;
    email?: string;
    phone: string;
    dateOfBirth?: Date;
    gender?: 'male' | 'female' | 'other';
  };

  addresses: {
    type: 'home' | 'work' | 'other';
    address: Address;
    isDefault: boolean;
  }[];

  preferences: {
    foodPreferences?: {
      isVegetarian: boolean;
      isVegan: boolean;
      allergens: string[];
      spiceLevel: string;
    };
    communicationPreferences: {
      emailMarketing: boolean;
      smsMarketing: boolean;
      notifications: boolean;
    };
  };

  loyalty: {
    pointsBalance: number;
    totalPointsEarned: number;
    totalPointsRedeemed: number;
    tier: 'bronze' | 'silver' | 'gold' | 'platinum';
    tierStartDate: Date;
  };

  purchaseHistory: {
    totalOrders: number;
    totalSpent: number;
    averageOrderValue: number;
    firstOrderDate: Date;
    lastOrderDate: Date;
    favoriteItems: string[];
    frequentLocations: string[];
  };

  status: 'active' | 'inactive' | 'blocked';
  tags: string[];
  lastVisit: Date;
}

// Inventory Transaction Entity
export interface InventoryTransaction extends BaseEntity {
  transactionId: string;
  organizationId: string;

  productId: string;
  locationId: string;

  type: InventoryTransactionTypes;
  quantity: number;
  unitCost?: number;

  reference: {
    type: 'order' | 'purchase_order' | 'manual_adjustment' | 'transfer';
    id?: string;
  };

  stockAfterTransaction: {
    currentStock: number;
    reservedStock: number;
  };

  reason?: string;
  notes?: string;
  performedBy: string;
}

// Analytics Entities
export interface DailySalesSummary extends BaseEntity {
  date: Date;
  organizationId: string;
  locationId: string;

  sales: {
    totalOrders: number;
    totalRevenue: number;
    totalTax: number;
    totalDiscounts: number;
    averageOrderValue: number;
    peakHour: number;
  };

  orderBreakdown: {
    dineIn: number;
    takeaway: number;
    delivery: number;
    online: number;
  };

  paymentMethods: {
    cash: { count: number; amount: number; };
    card: { count: number; amount: number; };
    digital: { count: number; amount: number; };
  };

  topItems: {
    productId: string;
    name: string;
    quantitySold: number;
    revenue: number;
  }[];

  staffPerformance: {
    userId: string;
    name: string;
    ordersProcessed: number;
    totalSales: number;
  }[];

  hourlyBreakdown: {
    hour: number;
    orders: number;
    revenue: number;
  }[];
}

// Subscription Entity
export interface Subscription extends BaseEntity {
  tenantId: string;
  stripeSubscriptionId: string;

  plan: {
    id: string;
    name: string;
    price: number;
    currency: string;
    interval: 'month' | 'year';
    features: FeatureFlags[];
    limits: {
      locations: number;
      users: number;
      products: number;
      monthlyOrders: number;
      storageGB: number;
    };
  };

  billing: {
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    status: 'active' | 'canceled' | 'incomplete' | 'past_due' | 'trialing';
    cancelAtPeriodEnd: boolean;
    canceledAt?: Date;
    trialStart?: Date;
    trialEnd?: Date;
  };

  usage: {
    locations: number;
    users: number;
    products: number;
    monthlyOrders: number;
    storageUsedGB: number;
    lastUpdated: Date;
  };
}

// Subscription Add-on Entity
export interface SubscriptionAddon extends BaseEntity {
  tenantId: string;
  subscriptionId: string;
  addonType: 'extra_location' | 'extra_user' | 'extra_storage' | 'premium_support' | 'custom';
  name: string;
  description?: string;

  pricing: {
    amount: number;
    currency: string;
    billingCycle: 'monthly' | 'yearly' | 'one_time';
  };

  quantity: number;
  status: 'active' | 'cancelled' | 'pending';

  activatedAt: Date;
  expiresAt?: Date;
  cancelledAt?: Date;
  cancelledBy?: string;

  stripeItemId?: string;
  addedBy: string;
}

// Subscription Plan Entity (for available plans)
export interface SubscriptionPlan extends BaseEntity {
  name: string;
  slug: string;
  description?: string;

  monthlyPrice: number;
  yearlyPrice?: number;
  currency: string;

  features: FeatureFlags[];
  limits: {
    locations: number;
    users: number;
    products: number;
    monthlyOrders: number;
    storageGB: number;
  };

  isActive: boolean;
  isPublic: boolean;
  sortOrder: number;
  trialDays?: number;

  stripePriceIdMonthly?: string;
  stripePriceIdYearly?: string;
}

// Invoice Entity
export interface Invoice extends BaseEntity {
  tenantId: string;
  subscriptionId: string;
  invoiceNumber: string;

  amount: number;
  currency: string;
  status: 'draft' | 'pending' | 'paid' | 'failed' | 'void';

  lineItems: {
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }[];

  subtotal: number;
  tax: number;
  discount: number;
  total: number;

  dueDate: Date;
  paidAt?: Date;

  stripeInvoiceId?: string;
  paymentMethod?: string;
  paymentIntentId?: string;
}

// Usage Metrics Entity
export interface UsageMetrics extends BaseEntity {
  tenantId: string;
  period: {
    start: Date;
    end: Date;
  };

  metrics: {
    locations: number;
    users: number;
    products: number;
    orders: number;
    storageBytes: number;
    apiCalls: number;
  };

  limits: {
    locations: number;
    users: number;
    products: number;
    monthlyOrders: number;
    storageGB: number;
  };

  percentages: {
    locations: number;
    users: number;
    products: number;
    orders: number;
    storage: number;
  };
}

// Audit Log Entity
export interface AuditLog extends BaseEntity {
  tenantId?: string;

  event: {
    type: string;
    category: 'authentication' | 'order' | 'inventory' | 'user_management' | 'system';
    action: 'create' | 'read' | 'update' | 'delete';
    resource: string;
    resourceId?: string;
  };

  user: {
    id: string;
    email: string;
    role: string;
    locationId?: string;
  };

  request: {
    ipAddress: string;
    userAgent: string;
    method: string;
    endpoint: string;
    sessionId?: string;
  };

  changes?: {
    before?: Record<string, any>;
    after?: Record<string, any>;
  };

  metadata?: Record<string, any>;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
}

// Notification Entity
export interface Notification extends BaseEntity {
  tenantId: string;
  userId?: string;
  locationId?: string;

  type: string;
  title: string;
  message: string;

  data?: Record<string, any>;

  channels: {
    email?: {
      sent: boolean;
      sentAt?: Date;
      error?: string;
    };
    push?: {
      sent: boolean;
      sentAt?: Date;
      error?: string;
    };
    sms?: {
      sent: boolean;
      sentAt?: Date;
      error?: string;
    };
    inApp?: {
      read: boolean;
      readAt?: Date;
    };
  };

  priority: 'low' | 'medium' | 'high' | 'urgent';
  expiresAt?: Date;
}

// API Key Entity (for external integrations)
export interface ApiKey extends BaseEntity {
  tenantId: string;

  name: string;
  description?: string;
  keyHash: string;
  lastUsedAt?: Date;

  permissions: Permissions[];
  rateLimits: {
    requestsPerMinute: number;
    requestsPerHour: number;
    requestsPerDay: number;
  };

  ipWhitelist?: string[];
  expiresAt?: Date;
  isRevoked: boolean;
  revokedAt?: Date;
  revokedBy?: string;
}

// Webhook Entity
export interface Webhook extends BaseEntity {
  tenantId: string;

  name: string;
  url: string;
  secret: string;

  events: string[];

  status: 'active' | 'inactive' | 'failed';
  lastTriggeredAt?: Date;
  lastSuccessAt?: Date;

  retryConfig: {
    maxRetries: number;
    retryDelay: number;
    backoffMultiplier: number;
  };

  statistics: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
  };
}