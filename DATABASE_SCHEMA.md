# ProperPOS SaaS - Database Schema Design

## Overview
Multi-tenant database architecture with separate databases per tenant for complete data isolation, plus shared platform databases for system-wide data.

## Database Strategy: **Database per Tenant**

### Database Naming Convention
```
Platform Databases:
- properpos_platform          # Platform-wide data (organizations, subscriptions)
- properpos_auth             # Authentication and user management
- properpos_analytics_global # Cross-tenant analytics and benchmarking

Tenant Databases:
- properpos_tenant_{tenant_id}     # Operational data per tenant
- properpos_analytics_{tenant_id}  # Analytics data per tenant
- properpos_audit_{tenant_id}      # Audit logs per tenant
```

## 1. Platform Database Schema

### Organizations Collection
```typescript
interface Organization {
  _id: ObjectId;
  tenantId: string;                    // Unique tenant identifier
  name: string;                        // Business name
  slug: string;                        // URL-friendly identifier
  businessType: 'food' | 'retail';    // Core business type

  // Subscription Information
  subscription: {
    plan: 'starter' | 'professional' | 'enterprise';
    status: 'active' | 'suspended' | 'cancelled' | 'trial';
    startDate: Date;
    endDate: Date;
    billingCycle: 'monthly' | 'yearly';
    features: string[];                // Enabled features for this plan
    limits: {
      locations: number;
      users: number;
      products: number;
      monthlyOrders: number;
    };
  };

  // Contact & Business Info
  contactInfo: {
    ownerName: string;
    ownerEmail: string;
    phone: string;
    website?: string;
    businessRegistration?: string;
    taxId?: string;
  };

  // Platform Settings
  settings: {
    timezone: string;
    currency: string;
    dateFormat: string;
    language: string;
    customDomain?: string;            // For enterprise customers
  };

  // Multi-location Support
  locations: Location[];

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  lastActiveAt: Date;
  isActive: boolean;

  // Billing Information
  billing: {
    stripeCustomerId: string;
    paymentMethodId?: string;
    lastPaymentDate?: Date;
    nextBillingDate?: Date;
    outstandingBalance: number;
    invoiceEmail: string;
  };
}

interface Location {
  id: string;
  name: string;

  // Address Information
  address: {
    street: string;
    city: string;
    state: string;
    country: string;
    zipCode: string;
    coordinates?: {
      latitude: number;
      longitude: number;
    };
  };

  // Business Operations
  businessHours: {
    [day: string]: {
      isOpen: boolean;
      openTime?: string;    // "09:00"
      closeTime?: string;   // "22:00"
    };
  };

  // Location-specific Settings
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
        settings: object;
      };
      kotPrinter?: {
        type: 'thermal';
        model: string;
        connectionType: 'usb' | 'network' | 'bluetooth';
        settings: object;
      };
    };
  };

  // Status
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

### Users Collection (Platform-wide)
```typescript
interface PlatformUser {
  _id: ObjectId;
  email: string;                       // Unique across platform
  passwordHash: string;                // bcrypt hash

  // User Profile
  profile: {
    firstName: string;
    lastName: string;
    phone?: string;
    avatar?: string;
    timezone: string;
  };

  // Authentication
  auth: {
    isEmailVerified: boolean;
    emailVerificationToken?: string;
    passwordResetToken?: string;
    passwordResetExpires?: Date;
    lastLoginAt?: Date;
    loginAttempts: number;
    lockUntil?: Date;
    mfaEnabled: boolean;
    mfaSecret?: string;                // For TOTP
  };

  // Platform Access
  globalRole: 'superAdmin' | 'platformAdmin' | 'customer';

  // Tenant Associations
  tenantMemberships: {
    tenantId: string;
    role: 'owner' | 'admin' | 'manager' | 'cashier';
    locationAccess: string[];          // Array of location IDs
    permissions: string[];             // Granular permissions
    status: 'active' | 'suspended' | 'invited';
    invitedAt?: Date;
    joinedAt?: Date;
  }[];

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  lastActiveAt: Date;
  isActive: boolean;
}
```

### Subscriptions Collection
```typescript
interface Subscription {
  _id: ObjectId;
  tenantId: string;
  stripeSubscriptionId: string;

  plan: {
    id: string;
    name: string;
    price: number;
    currency: string;
    interval: 'month' | 'year';
    features: string[];
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

  createdAt: Date;
  updatedAt: Date;
}
```

## 2. Tenant Database Schema

Each tenant gets their own database with the following collections:

### Products Collection
```typescript
interface Product {
  _id: ObjectId;
  productId: string;                   // Tenant-unique ID

  // Basic Information
  name: string;
  description?: string;
  sku?: string;                        // Stock Keeping Unit
  barcode?: string;

  // Categorization
  category: {
    id: string;
    name: string;
    path: string[];                    // For hierarchical categories
  };
  tags: string[];

  // Pricing (supports multiple pricing models)
  pricing: {
    basePrice: number;
    costPrice?: number;                // For margin calculation
    variants?: {                      // For different sizes, options
      id: string;
      name: string;
      price: number;
      sku?: string;
    }[];
  };

  // Tax Configuration
  tax: {
    taxable: boolean;
    taxCategory: string;               // For different tax rates
    inclusive: boolean;                // Price includes tax
  };

  // Business Type Specific Fields
  businessTypeData: {
    // Food Service Specific
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
      preparationTime: number;         // In minutes
      spiceLevel?: 'mild' | 'medium' | 'hot' | 'extra-hot';
      ingredients?: string[];
    };

    // Retail Specific
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

  // Inventory Tracking
  inventory: {
    trackInventory: boolean;
    stockLevels: {
      locationId: string;
      currentStock: number;
      reservedStock: number;           // For pending orders
      reorderLevel: number;
      maxStock: number;
    }[];
    unit: string;                      // 'pieces', 'kg', 'liters', etc.
  };

  // Availability
  availability: {
    isActive: boolean;
    availableLocations: string[];      // Location IDs where available
    availabilitySchedule?: {
      [day: string]: {
        available: boolean;
        startTime?: string;
        endTime?: string;
      };
    };
  };

  // Media
  media: {
    images: {
      url: string;
      altText?: string;
      isPrimary: boolean;
    }[];
  };

  // Analytics Data
  analytics: {
    totalSold: number;
    revenue: number;
    averageRating?: number;
    lastSoldAt?: Date;
  };

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;                   // User ID
  isDeleted: boolean;
  deletedAt?: Date;
}
```

### Categories Collection
```typescript
interface Category {
  _id: ObjectId;
  categoryId: string;

  name: string;
  description?: string;

  // Hierarchy Support
  parentId?: string;                   // For nested categories
  path: string[];                      // Full path from root
  level: number;                       // Depth in hierarchy

  // Display Options
  display: {
    color: string;                     // Hex color for UI
    icon?: string;                     // Icon identifier
    image?: string;                    // Category image URL
    sortOrder: number;
  };

  // Business Logic
  settings: {
    isActive: boolean;
    availableLocations: string[];
    defaultTaxCategory?: string;
  };

  // Analytics
  analytics: {
    productCount: number;
    totalSales: number;
    lastUpdated: Date;
  };

  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}
```

### Orders Collection
```typescript
interface Order {
  _id: ObjectId;
  orderNumber: string;                 // Human-readable order number
  kotNumber?: string;                  // Kitchen Order Ticket number

  // Order Details
  orderType: 'dine-in' | 'takeaway' | 'delivery' | 'online';
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'served' | 'completed' | 'cancelled';

  // Location & Staff
  locationId: string;
  cashierId: string;                   // User ID of cashier

  // Customer Information
  customer?: {
    id?: string;                       // Reference to customer if registered
    name?: string;
    phone?: string;
    email?: string;
    address?: object;                  // For delivery orders
  };

  // Order Items
  items: {
    productId: string;
    variantId?: string;
    name: string;                      // Snapshot of product name
    quantity: number;
    unitPrice: number;
    totalPrice: number;

    // Customizations
    modifications?: {
      type: 'add' | 'remove' | 'substitute';
      description: string;
      priceAdjustment: number;
    }[];

    // Special Instructions
    notes?: string;

    // Tax Information
    tax: {
      rate: number;
      amount: number;
      inclusive: boolean;
    };

    // Status Tracking (for food orders)
    itemStatus?: 'ordered' | 'preparing' | 'ready' | 'served';
  }[];

  // Pricing Breakdown
  pricing: {
    subtotal: number;                  // Before discounts and tax
    discounts: {
      type: 'percentage' | 'fixed' | 'item';
      description: string;
      amount: number;
      appliedBy: string;               // User ID
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

    total: number;                     // Final amount
  };

  // Payment Information
  payment: {
    method: 'cash' | 'card' | 'digital_wallet' | 'credit' | 'online';
    status: 'pending' | 'paid' | 'partial' | 'refunded';
    paidAmount: number;
    changeAmount: number;
    transactionId?: string;
    paymentProcessor?: string;         // Stripe, Square, etc.
    paymentTime?: Date;
  };

  // Table Management (for dine-in)
  diningInfo?: {
    tableNumber?: string;
    numberOfGuests: number;
    serverName?: string;
  };

  // Timing Information
  timestamps: {
    orderedAt: Date;
    confirmedAt?: Date;
    prepStartedAt?: Date;
    readyAt?: Date;
    servedAt?: Date;
    completedAt?: Date;
  };

  // Order Source
  source: {
    type: 'pos' | 'online' | 'phone' | 'mobile_app';
    details?: object;                  // Source-specific details
  };

  // Special Flags
  flags: {
    isPriority: boolean;
    isTest: boolean;                   // For test orders
    requiresKot: boolean;
    printReceipt: boolean;
  };

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: string;
  deletionReason?: string;
}
```

### Customers Collection
```typescript
interface Customer {
  _id: ObjectId;
  customerId: string;

  // Personal Information
  personalInfo: {
    firstName: string;
    lastName: string;
    email?: string;
    phone: string;                     // Primary identifier
    dateOfBirth?: Date;
    gender?: 'male' | 'female' | 'other';
  };

  // Contact Details
  addresses: {
    type: 'home' | 'work' | 'other';
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
    isDefault: boolean;
  }[];

  // Customer Preferences
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

  // Loyalty Program
  loyalty: {
    pointsBalance: number;
    totalPointsEarned: number;
    totalPointsRedeemed: number;
    tier: 'bronze' | 'silver' | 'gold' | 'platinum';
    tierStartDate: Date;
  };

  // Purchase History Summary
  purchaseHistory: {
    totalOrders: number;
    totalSpent: number;
    averageOrderValue: number;
    firstOrderDate: Date;
    lastOrderDate: Date;
    favoriteItems: string[];           // Product IDs
    frequentLocations: string[];       // Location IDs
  };

  // Status
  status: 'active' | 'inactive' | 'blocked';
  tags: string[];                      // Custom tags

  createdAt: Date;
  updatedAt: Date;
  lastVisit: Date;
}
```

### Inventory Transactions Collection
```typescript
interface InventoryTransaction {
  _id: ObjectId;
  transactionId: string;

  // Product Information
  productId: string;
  locationId: string;

  // Transaction Details
  type: 'sale' | 'purchase' | 'adjustment' | 'transfer' | 'return' | 'waste';
  quantity: number;                    // Positive for increases, negative for decreases
  unitCost?: number;                   // Cost per unit at time of transaction

  // Context
  reference: {
    type: 'order' | 'purchase_order' | 'manual_adjustment' | 'transfer';
    id?: string;                       // Reference to related document
  };

  // Stock Levels After Transaction
  stockAfterTransaction: {
    currentStock: number;
    reservedStock: number;
  };

  // Additional Information
  reason?: string;                     // For adjustments and waste
  notes?: string;
  performedBy: string;                 // User ID

  createdAt: Date;
}
```

## 3. Analytics Database Schema

### Daily Sales Summary Collection
```typescript
interface DailySalesSummary {
  _id: ObjectId;
  date: Date;                          // Start of day
  locationId: string;

  // Sales Metrics
  sales: {
    totalOrders: number;
    totalRevenue: number;
    totalTax: number;
    totalDiscounts: number;
    averageOrderValue: number;
    peakHour: number;                  // Hour with highest sales (0-23)
  };

  // Order Breakdown
  orderBreakdown: {
    dineIn: number;
    takeaway: number;
    delivery: number;
    online: number;
  };

  // Payment Methods
  paymentMethods: {
    cash: { count: number; amount: number; };
    card: { count: number; amount: number; };
    digital: { count: number; amount: number; };
  };

  // Top Performing Items
  topItems: {
    productId: string;
    name: string;
    quantitySold: number;
    revenue: number;
  }[];

  // Staff Performance
  staffPerformance: {
    userId: string;
    name: string;
    ordersProcessed: number;
    totalSales: number;
  }[];

  // Hourly Breakdown
  hourlyBreakdown: {
    hour: number;                      // 0-23
    orders: number;
    revenue: number;
  }[];

  createdAt: Date;
  updatedAt: Date;
}
```

## 4. Audit Log Schema

### Audit Logs Collection
```typescript
interface AuditLog {
  _id: ObjectId;

  // Event Information
  event: {
    type: string;                      // 'order.created', 'user.login', etc.
    category: 'authentication' | 'order' | 'inventory' | 'user_management' | 'system';
    action: 'create' | 'read' | 'update' | 'delete';
    resource: string;                  // Resource affected
    resourceId?: string;               // ID of affected resource
  };

  // User Context
  user: {
    id: string;
    email: string;
    role: string;
    locationId?: string;
  };

  // Request Context
  request: {
    ipAddress: string;
    userAgent: string;
    method: string;
    endpoint: string;
    sessionId?: string;
  };

  // Changes Made
  changes?: {
    before?: object;                   // Previous state
    after?: object;                    // New state
  };

  // Additional Context
  metadata?: object;                   // Event-specific data
  severity: 'low' | 'medium' | 'high' | 'critical';

  timestamp: Date;
}
```

## Indexing Strategy

### Platform Database Indexes
```javascript
// Organizations
db.organizations.createIndex({ "tenantId": 1 }, { unique: true });
db.organizations.createIndex({ "slug": 1 }, { unique: true });
db.organizations.createIndex({ "subscription.status": 1 });

// Users
db.users.createIndex({ "email": 1 }, { unique: true });
db.users.createIndex({ "tenantMemberships.tenantId": 1 });
```

### Tenant Database Indexes
```javascript
// Products
db.products.createIndex({ "productId": 1 }, { unique: true });
db.products.createIndex({ "category.id": 1 });
db.products.createIndex({ "availability.isActive": 1, "availability.availableLocations": 1 });
db.products.createIndex({ "name": "text", "description": "text" });

// Orders
db.orders.createIndex({ "orderNumber": 1 }, { unique: true });
db.orders.createIndex({ "locationId": 1, "createdAt": -1 });
db.orders.createIndex({ "status": 1, "locationId": 1 });
db.orders.createIndex({ "customer.phone": 1 });
db.orders.createIndex({ "createdAt": -1 });

// Customers
db.customers.createIndex({ "personalInfo.phone": 1 }, { unique: true });
db.customers.createIndex({ "personalInfo.email": 1 }, { sparse: true });
```

## Data Migration Strategy

### Phase 1: Schema Creation
1. Create platform databases and collections
2. Set up indexes and validation rules
3. Create tenant database templates

### Phase 2: Data Migration
1. Extract organizations from existing data
2. Migrate user accounts with tenant associations
3. Transform existing POS data to new schema
4. Migrate product catalogs and categories

### Phase 3: Validation
1. Data integrity checks
2. Performance testing with migrated data
3. Backup and rollback procedures
4. User acceptance testing

This schema design provides a robust foundation for a multi-tenant SaaS POS system with complete data isolation, scalability, and comprehensive feature support for both food service and retail businesses.