// API request and response type definitions for ProperPOS SaaS

import { z } from 'zod';
import {
  ApiResponse,
  PaginationParams,
  BusinessTypes,
  SubscriptionPlans,
  UserRoles,
  OrderTypes,
  OrderStatus,
  PaymentMethods
} from './common';
import {
  Organization,
  Location,
  User,
  Product,
  Category,
  Order,
  Customer
} from './entities';

// ============ AUTHENTICATION API ============

// Login request/response
export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  rememberMe: z.boolean().optional(),
  mfaToken: z.string().optional()
});

export const LoginResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string(),
    profile: z.object({
      firstName: z.string(),
      lastName: z.string(),
      avatar: z.string().optional()
    }),
    tenantMemberships: z.array(z.object({
      tenantId: z.string(),
      role: z.nativeEnum(UserRoles),
      locationAccess: z.array(z.string())
    }))
  }),
  tokens: z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
    expiresIn: z.number()
  }),
  tenant: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    businessType: z.nativeEnum(BusinessTypes),
    subscription: z.object({
      plan: z.nativeEnum(SubscriptionPlans),
      status: z.enum(['active', 'suspended', 'cancelled', 'trial']),
      features: z.array(z.string())
    })
  }).optional()
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

// Register request
export const RegisterRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  organizationName: z.string().min(1),
  businessType: z.nativeEnum(BusinessTypes),
  phone: z.string().optional()
});

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

// ============ ORGANIZATION API ============

// Create organization request
export const CreateOrganizationRequestSchema = z.object({
  name: z.string().min(1).max(100),
  businessType: z.nativeEnum(BusinessTypes),
  contactInfo: z.object({
    ownerName: z.string().min(1),
    ownerEmail: z.string().email(),
    phone: z.string().min(1),
    website: z.string().url().optional(),
    businessRegistration: z.string().optional(),
    taxId: z.string().optional()
  }),
  settings: z.object({
    timezone: z.string(),
    currency: z.string().length(3),
    dateFormat: z.string(),
    language: z.string().length(2)
  })
});

// Update organization request
export const UpdateOrganizationRequestSchema = CreateOrganizationRequestSchema.partial();

export type CreateOrganizationRequest = z.infer<typeof CreateOrganizationRequestSchema>;
export type UpdateOrganizationRequest = z.infer<typeof UpdateOrganizationRequestSchema>;
export type OrganizationResponse = ApiResponse<Organization>;

// ============ LOCATION API ============

// Create/Update location request
export const LocationRequestSchema = z.object({
  name: z.string().min(1).max(100),
  address: z.object({
    street: z.string().min(1),
    city: z.string().min(1),
    state: z.string().min(1),
    country: z.string().min(1),
    zipCode: z.string().min(1),
    coordinates: z.object({
      latitude: z.number(),
      longitude: z.number()
    }).optional()
  }),
  businessHours: z.record(z.object({
    isOpen: z.boolean(),
    openTime: z.string().optional(),
    closeTime: z.string().optional()
  })),
  settings: z.object({
    defaultTaxRate: z.number().min(0).max(100),
    currency: z.string().length(3),
    receiptSettings: z.object({
      headerText: z.string(),
      footerText: z.string(),
      showLogo: z.boolean(),
      logoUrl: z.string().url().optional()
    })
  })
});

export type LocationRequest = z.infer<typeof LocationRequestSchema>;
export type LocationResponse = ApiResponse<Location>;
export type LocationsResponse = ApiResponse<Location[]>;

// ============ PRODUCT API ============

// Create product request
export const CreateProductRequestSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  sku: z.string().max(50).optional(),
  barcode: z.string().max(50).optional(),
  categoryId: z.string(),
  tags: z.array(z.string()).default([]),

  pricing: z.object({
    basePrice: z.number().min(0),
    costPrice: z.number().min(0).optional(),
    variants: z.array(z.object({
      name: z.string(),
      price: z.number().min(0),
      sku: z.string().optional()
    })).optional()
  }),

  tax: z.object({
    taxable: z.boolean(),
    taxCategory: z.string(),
    inclusive: z.boolean()
  }),

  businessTypeData: z.object({
    food: z.object({
      isVegetarian: z.boolean(),
      isVegan: z.boolean().optional(),
      isGlutenFree: z.boolean().optional(),
      allergens: z.array(z.string()).optional(),
      preparationTime: z.number().min(0),
      spiceLevel: z.enum(['mild', 'medium', 'hot', 'extra-hot']).optional(),
      ingredients: z.array(z.string()).optional()
    }).optional(),
    retail: z.object({
      brand: z.string().optional(),
      model: z.string().optional(),
      color: z.string().optional(),
      size: z.string().optional(),
      weight: z.number().min(0).optional()
    }).optional()
  }).optional(),

  inventory: z.object({
    trackInventory: z.boolean(),
    unit: z.string(),
    stockLevels: z.array(z.object({
      locationId: z.string(),
      currentStock: z.number().min(0),
      reorderLevel: z.number().min(0),
      maxStock: z.number().min(0)
    }))
  }),

  availability: z.object({
    isActive: z.boolean().default(true),
    availableLocations: z.array(z.string())
  })
});

// Update product request
export const UpdateProductRequestSchema = CreateProductRequestSchema.partial();

// Product query parameters
export const ProductQuerySchema = z.object({
  categoryId: z.string().optional(),
  locationId: z.string().optional(),
  isActive: z.boolean().optional(),
  search: z.string().optional(),
  tags: z.array(z.string()).optional(),
  minPrice: z.number().optional(),
  maxPrice: z.number().optional(),
  isVegetarian: z.boolean().optional(),
  trackInventory: z.boolean().optional()
}).merge(z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  sortBy: z.string().default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc')
}));

export type CreateProductRequest = z.infer<typeof CreateProductRequestSchema>;
export type UpdateProductRequest = z.infer<typeof UpdateProductRequestSchema>;
export type ProductQuery = z.infer<typeof ProductQuerySchema>;
export type ProductResponse = ApiResponse<Product>;
export type ProductsResponse = ApiResponse<Product[]>;

// ============ CATEGORY API ============

// Create category request
export const CreateCategoryRequestSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  parentId: z.string().optional(),
  display: z.object({
    color: z.string().regex(/^#[0-9A-F]{6}$/i),
    icon: z.string().optional(),
    image: z.string().url().optional(),
    sortOrder: z.number().min(0).default(0)
  }),
  settings: z.object({
    isActive: z.boolean().default(true),
    availableLocations: z.array(z.string()),
    defaultTaxCategory: z.string().optional()
  })
});

// Update category request
export const UpdateCategoryRequestSchema = CreateCategoryRequestSchema.partial();

export type CreateCategoryRequest = z.infer<typeof CreateCategoryRequestSchema>;
export type UpdateCategoryRequest = z.infer<typeof UpdateCategoryRequestSchema>;
export type CategoryResponse = ApiResponse<Category>;
export type CategoriesResponse = ApiResponse<Category[]>;

// ============ ORDER API ============

// Create order request
export const CreateOrderRequestSchema = z.object({
  orderType: z.nativeEnum(OrderTypes),
  locationId: z.string(),

  customer: z.object({
    id: z.string().optional(),
    name: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional()
  }).optional(),

  items: z.array(z.object({
    productId: z.string(),
    variantId: z.string().optional(),
    quantity: z.number().min(1),
    unitPrice: z.number().min(0),
    modifications: z.array(z.object({
      type: z.enum(['add', 'remove', 'substitute']),
      description: z.string(),
      priceAdjustment: z.number()
    })).optional(),
    notes: z.string().optional()
  })).min(1),

  discounts: z.array(z.object({
    type: z.enum(['percentage', 'fixed', 'item']),
    description: z.string(),
    amount: z.number().min(0)
  })).default([]),

  payment: z.object({
    method: z.nativeEnum(PaymentMethods),
    paidAmount: z.number().min(0),
    tips: z.number().min(0).optional()
  }),

  diningInfo: z.object({
    tableNumber: z.string().optional(),
    numberOfGuests: z.number().min(1),
    serverName: z.string().optional()
  }).optional(),

  flags: z.object({
    isPriority: z.boolean().default(false),
    requiresKot: z.boolean().default(true),
    printReceipt: z.boolean().default(true)
  }).optional()
});

// Update order request
export const UpdateOrderRequestSchema = z.object({
  status: z.nativeEnum(OrderStatus).optional(),
  items: z.array(z.object({
    productId: z.string(),
    itemStatus: z.enum(['ordered', 'preparing', 'ready', 'served']).optional()
  })).optional(),
  payment: z.object({
    status: z.enum(['pending', 'paid', 'partial', 'refunded']).optional(),
    transactionId: z.string().optional()
  }).optional()
});

// Order query parameters
export const OrderQuerySchema = z.object({
  locationId: z.string().optional(),
  status: z.nativeEnum(OrderStatus).optional(),
  orderType: z.nativeEnum(OrderTypes).optional(),
  cashierId: z.string().optional(),
  customerPhone: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  minTotal: z.number().optional(),
  maxTotal: z.number().optional()
}).merge(z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  sortBy: z.string().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
}));

export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;
export type UpdateOrderRequest = z.infer<typeof UpdateOrderRequestSchema>;
export type OrderQuery = z.infer<typeof OrderQuerySchema>;
export type OrderResponse = ApiResponse<Order>;
export type OrdersResponse = ApiResponse<Order[]>;

// ============ CUSTOMER API ============

// Create customer request
export const CreateCustomerRequestSchema = z.object({
  personalInfo: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email().optional(),
    phone: z.string().min(1),
    dateOfBirth: z.string().datetime().optional(),
    gender: z.enum(['male', 'female', 'other']).optional()
  }),
  addresses: z.array(z.object({
    type: z.enum(['home', 'work', 'other']),
    address: z.object({
      street: z.string(),
      city: z.string(),
      state: z.string(),
      country: z.string(),
      zipCode: z.string()
    }),
    isDefault: z.boolean()
  })).default([]),
  preferences: z.object({
    foodPreferences: z.object({
      isVegetarian: z.boolean().default(false),
      isVegan: z.boolean().default(false),
      allergens: z.array(z.string()).default([]),
      spiceLevel: z.string().default('medium')
    }).optional(),
    communicationPreferences: z.object({
      emailMarketing: z.boolean().default(false),
      smsMarketing: z.boolean().default(false),
      notifications: z.boolean().default(true)
    })
  }).optional(),
  tags: z.array(z.string()).default([])
});

// Update customer request
export const UpdateCustomerRequestSchema = CreateCustomerRequestSchema.partial();

// Customer query parameters
export const CustomerQuerySchema = z.object({
  search: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(['active', 'inactive', 'blocked']).optional()
}).merge(z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  sortBy: z.string().default('lastName'),
  sortOrder: z.enum(['asc', 'desc']).default('asc')
}));

export type CreateCustomerRequest = z.infer<typeof CreateCustomerRequestSchema>;
export type UpdateCustomerRequest = z.infer<typeof UpdateCustomerRequestSchema>;
export type CustomerQuery = z.infer<typeof CustomerQuerySchema>;
export type CustomerResponse = ApiResponse<Customer>;
export type CustomersResponse = ApiResponse<Customer[]>;

// ============ ANALYTICS API ============

// Analytics query parameters
export const AnalyticsQuerySchema = z.object({
  locationId: z.string().optional(),
  locationIds: z.array(z.string()).optional(),
  dateFrom: z.string().datetime(),
  dateTo: z.string().datetime(),
  period: z.enum(['day', 'week', 'month', 'year']).default('day'),
  compareToPrevoius: z.boolean().default(false),
  groupBy: z.enum(['hour', 'day', 'week', 'month']).optional()
});

// Sales summary response
export const SalesSummaryResponseSchema = z.object({
  summary: z.object({
    totalRevenue: z.number(),
    totalOrders: z.number(),
    averageOrderValue: z.number(),
    totalCustomers: z.number(),
    newCustomers: z.number(),
    repeatCustomers: z.number()
  }),
  trends: z.array(z.object({
    date: z.string(),
    revenue: z.number(),
    orders: z.number(),
    customers: z.number()
  })),
  topProducts: z.array(z.object({
    productId: z.string(),
    name: z.string(),
    quantity: z.number(),
    revenue: z.number()
  })),
  paymentMethods: z.array(z.object({
    method: z.nativeEnum(PaymentMethods),
    count: z.number(),
    amount: z.number(),
    percentage: z.number()
  }))
});

export type AnalyticsQuery = z.infer<typeof AnalyticsQuerySchema>;
export type SalesSummaryResponse = ApiResponse<z.infer<typeof SalesSummaryResponseSchema>>;

// ============ USER MANAGEMENT API ============

// Create user request
export const CreateUserRequestSchema = z.object({
  email: z.string().email(),
  profile: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    phone: z.string().optional(),
    timezone: z.string().default('UTC')
  }),
  tenantMembership: z.object({
    role: z.nativeEnum(UserRoles),
    locationAccess: z.array(z.string()),
    permissions: z.array(z.string()).optional()
  }),
  sendInvitation: z.boolean().default(true)
});

// Update user request
export const UpdateUserRequestSchema = z.object({
  profile: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    phone: z.string().optional(),
    timezone: z.string()
  }).partial().optional(),
  tenantMembership: z.object({
    role: z.nativeEnum(UserRoles),
    locationAccess: z.array(z.string()),
    permissions: z.array(z.string()),
    status: z.enum(['active', 'suspended'])
  }).partial().optional()
});

export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;
export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;
export type UserResponse = ApiResponse<User>;
export type UsersResponse = ApiResponse<User[]>;

// ============ FILE UPLOAD API ============

export const FileUploadResponseSchema = z.object({
  files: z.array(z.object({
    id: z.string(),
    filename: z.string(),
    url: z.string(),
    mimeType: z.string(),
    size: z.number()
  }))
});

export type FileUploadResponse = ApiResponse<z.infer<typeof FileUploadResponseSchema>>;

// ============ WEBHOOK API ============

export const WebhookPayloadSchema = z.object({
  event: z.string(),
  timestamp: z.string().datetime(),
  data: z.record(z.any()),
  tenant: z.object({
    id: z.string(),
    name: z.string()
  })
});

export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>;

// ============ ERROR RESPONSES ============

export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional(),
    timestamp: z.string().datetime(),
    requestId: z.string().optional()
  })
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// ============ COMMON RESPONSE WRAPPERS ============

export const PaginatedResponseSchema = <T extends z.ZodType>(dataSchema: T) => z.object({
  success: z.literal(true),
  data: z.array(dataSchema),
  meta: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
    hasMore: z.boolean()
  })
});

export const SingleResponseSchema = <T extends z.ZodType>(dataSchema: T) => z.object({
  success: z.literal(true),
  data: dataSchema
});

// Export all schemas for validation
export const ValidationSchemas = {
  LoginRequest: LoginRequestSchema,
  RegisterRequest: RegisterRequestSchema,
  CreateOrganization: CreateOrganizationRequestSchema,
  UpdateOrganization: UpdateOrganizationRequestSchema,
  LocationRequest: LocationRequestSchema,
  CreateProduct: CreateProductRequestSchema,
  UpdateProduct: UpdateProductRequestSchema,
  ProductQuery: ProductQuerySchema,
  CreateCategory: CreateCategoryRequestSchema,
  UpdateCategory: UpdateCategoryRequestSchema,
  CreateOrder: CreateOrderRequestSchema,
  UpdateOrder: UpdateOrderRequestSchema,
  OrderQuery: OrderQuerySchema,
  CreateCustomer: CreateCustomerRequestSchema,
  UpdateCustomer: UpdateCustomerRequestSchema,
  CustomerQuery: CustomerQuerySchema,
  AnalyticsQuery: AnalyticsQuerySchema,
  CreateUser: CreateUserRequestSchema,
  UpdateUser: UpdateUserRequestSchema,
  Error: ErrorResponseSchema
} as const;