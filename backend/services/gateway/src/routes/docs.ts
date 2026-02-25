// API Documentation routes

import { Router, Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import { logger, createResponse } from '@properpos/backend-shared';

export const docsRouter = Router();

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'ProperPOS SaaS API',
      version: '1.0.0',
      description: 'Enterprise Point of Sale System API Documentation',
      contact: {
        name: 'ProperPOS Team',
        email: 'team@properpos.com',
        url: 'https://properpos.com'
      },
      license: {
        name: 'Proprietary',
        url: 'https://properpos.com/license'
      }
    },
    servers: [
      {
        url: process.env.API_URL || 'http://localhost:3001',
        description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT Authorization header using the Bearer scheme'
        },
        TenantHeader: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Tenant-ID',
          description: 'Tenant identification header'
        }
      },
      schemas: {
        // Common response schemas
        ApiResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              description: 'Indicates if the request was successful'
            },
            data: {
              description: 'Response data (varies by endpoint)'
            },
            message: {
              type: 'string',
              description: 'Optional response message'
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Response timestamp'
            }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              enum: [false],
              description: 'Always false for error responses'
            },
            error: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  description: 'Error code'
                },
                message: {
                  type: 'string',
                  description: 'Error message'
                },
                details: {
                  description: 'Additional error details'
                },
                timestamp: {
                  type: 'string',
                  format: 'date-time',
                  description: 'Error timestamp'
                }
              }
            }
          }
        },
        PaginatedResponse: {
          allOf: [
            { $ref: '#/components/schemas/ApiResponse' },
            {
              type: 'object',
              properties: {
                meta: {
                  type: 'object',
                  properties: {
                    page: {
                      type: 'integer',
                      description: 'Current page number'
                    },
                    limit: {
                      type: 'integer',
                      description: 'Items per page'
                    },
                    total: {
                      type: 'integer',
                      description: 'Total number of items'
                    },
                    totalPages: {
                      type: 'integer',
                      description: 'Total number of pages'
                    },
                    hasMore: {
                      type: 'boolean',
                      description: 'Whether there are more pages'
                    }
                  }
                }
              }
            }
          ]
        },

        // Business entities
        Organization: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Organization ID'
            },
            name: {
              type: 'string',
              description: 'Organization name'
            },
            businessType: {
              type: 'string',
              enum: ['food', 'retail'],
              description: 'Type of business'
            },
            subscription: {
              type: 'object',
              properties: {
                plan: {
                  type: 'string',
                  enum: ['starter', 'professional', 'enterprise'],
                  description: 'Subscription plan'
                },
                status: {
                  type: 'string',
                  enum: ['active', 'suspended', 'cancelled', 'trial'],
                  description: 'Subscription status'
                }
              }
            }
          }
        },
        Product: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Product ID'
            },
            name: {
              type: 'string',
              description: 'Product name'
            },
            description: {
              type: 'string',
              description: 'Product description'
            },
            price: {
              type: 'number',
              format: 'float',
              description: 'Product price'
            },
            categoryId: {
              type: 'string',
              description: 'Category ID'
            },
            isActive: {
              type: 'boolean',
              description: 'Whether the product is active'
            }
          }
        },
        Order: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Order ID'
            },
            orderNumber: {
              type: 'string',
              description: 'Human-readable order number'
            },
            status: {
              type: 'string',
              enum: ['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'],
              description: 'Order status'
            },
            total: {
              type: 'number',
              format: 'float',
              description: 'Total order amount'
            },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  productId: {
                    type: 'string'
                  },
                  quantity: {
                    type: 'integer'
                  },
                  unitPrice: {
                    type: 'number',
                    format: 'float'
                  }
                }
              }
            }
          }
        }
      }
    },
    security: [
      {
        BearerAuth: []
      }
    ]
  },
  apis: [
    // In a real implementation, you would add paths to your route files
    './src/routes/*.ts',
    '../*/src/routes/*.ts' // Other services
  ],
};

// Generate swagger specification
const swaggerSpec = swaggerJsdoc(swaggerOptions) as { paths?: Record<string, unknown>; [key: string]: unknown };

// Add API endpoints documentation
swaggerSpec.paths = {
  '/api/v1/auth/login': {
    post: {
      tags: ['Authentication'],
      summary: 'User login',
      description: 'Authenticate user and return JWT tokens',
      security: [], // No security required for login
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                email: {
                  type: 'string',
                  format: 'email',
                  description: 'User email'
                },
                password: {
                  type: 'string',
                  description: 'User password'
                }
              },
              required: ['email', 'password']
            }
          }
        }
      },
      responses: {
        200: {
          description: 'Login successful',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ApiResponse' }
            }
          }
        },
        401: {
          description: 'Invalid credentials',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' }
            }
          }
        }
      }
    }
  },
  '/api/v1/products': {
    get: {
      tags: ['Products'],
      summary: 'Get products',
      description: 'Retrieve a list of products',
      security: [{ BearerAuth: [] }],
      parameters: [
        {
          in: 'query',
          name: 'page',
          schema: { type: 'integer', minimum: 1 },
          description: 'Page number'
        },
        {
          in: 'query',
          name: 'limit',
          schema: { type: 'integer', minimum: 1, maximum: 100 },
          description: 'Items per page'
        },
        {
          in: 'query',
          name: 'search',
          schema: { type: 'string' },
          description: 'Search term'
        }
      ],
      responses: {
        200: {
          description: 'Products retrieved successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PaginatedResponse' }
            }
          }
        }
      }
    },
    post: {
      tags: ['Products'],
      summary: 'Create product',
      description: 'Create a new product',
      security: [{ BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Product' }
          }
        }
      },
      responses: {
        201: {
          description: 'Product created successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ApiResponse' }
            }
          }
        }
      }
    }
  },
  '/api/v1/orders': {
    get: {
      tags: ['Orders'],
      summary: 'Get orders',
      description: 'Retrieve a list of orders',
      security: [{ BearerAuth: [] }],
      parameters: [
        {
          in: 'query',
          name: 'status',
          schema: {
            type: 'string',
            enum: ['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled']
          },
          description: 'Filter by order status'
        }
      ],
      responses: {
        200: {
          description: 'Orders retrieved successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PaginatedResponse' }
            }
          }
        }
      }
    },
    post: {
      tags: ['Orders'],
      summary: 'Create order',
      description: 'Create a new order',
      security: [{ BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Order' }
          }
        }
      },
      responses: {
        201: {
          description: 'Order created successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ApiResponse' }
            }
          }
        }
      }
    }
  }
};

// Swagger UI options
const swaggerUiOptions = {
  explorer: true,
  swaggerOptions: {
    docExpansion: 'none',
    filter: true,
    showRequestDuration: true,
    syntaxHighlight: {
      activate: true,
      theme: 'agate'
    }
  },
  customCss: `
    .swagger-ui .topbar { display: none }
    .swagger-ui .info { margin: 20px 0 }
    .swagger-ui .scheme-container { background: #fafafa; padding: 10px; border-radius: 4px; }
  `,
  customSiteTitle: 'ProperPOS API Documentation'
};

// Serve swagger documentation
docsRouter.use('/api', swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions));

// JSON specification endpoint
docsRouter.get('/api.json', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.json(swaggerSpec);
});

// Documentation homepage
docsRouter.get('/', (req: Request, res: Response) => {
  const docsData = {
    title: 'ProperPOS API Documentation',
    version: '1.0.0',
    description: 'Welcome to the ProperPOS SaaS API documentation',
    links: {
      swagger: '/docs/api',
      specification: '/docs/api.json',
      postman: '/docs/postman',
      examples: '/docs/examples'
    },
    services: {
      gateway: { status: 'active', port: process.env.PORT || '3001' },
      auth: { status: 'active', port: process.env.AUTH_PORT || '3002' },
      tenant: { status: 'active', port: process.env.TENANT_PORT || '3003' },
      pos: { status: 'active', port: process.env.POS_PORT || '3004' },
      inventory: { status: 'active', port: process.env.INVENTORY_PORT || '3005' },
      analytics: { status: 'active', port: process.env.ANALYTICS_PORT || '3006' },
      billing: { status: 'active', port: process.env.BILLING_PORT || '3007' },
      notification: { status: 'active', port: process.env.NOTIFICATION_PORT || '3008' },
      audit: { status: 'active', port: process.env.AUDIT_PORT || '3009' }
    }
  };

  res.json(createResponse(docsData, 'API Documentation Index'));
});

// Postman collection endpoint
docsRouter.get('/postman', (req: Request, res: Response) => {
  // In a real implementation, you would generate a Postman collection
  // from the OpenAPI specification
  res.json(createResponse({
    message: 'Postman collection endpoint - to be implemented',
    downloadUrl: '/docs/postman/collection.json'
  }));
});

// API examples
docsRouter.get('/examples', (req: Request, res: Response) => {
  const examples = {
    authentication: {
      login: {
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: {
          'Content-Type': 'application/json'
        },
        body: {
          email: 'user@example.com',
          password: 'password123'
        }
      }
    },
    products: {
      list: {
        method: 'GET',
        url: '/api/v1/products?page=1&limit=20',
        headers: {
          'Authorization': 'Bearer <your-jwt-token>',
          'X-Tenant-ID': '<your-tenant-id>'
        }
      },
      create: {
        method: 'POST',
        url: '/api/v1/products',
        headers: {
          'Authorization': 'Bearer <your-jwt-token>',
          'X-Tenant-ID': '<your-tenant-id>',
          'Content-Type': 'application/json'
        },
        body: {
          name: 'Example Product',
          description: 'Product description',
          price: 19.99,
          categoryId: 'category-id'
        }
      }
    },
    orders: {
      create: {
        method: 'POST',
        url: '/api/v1/orders',
        headers: {
          'Authorization': 'Bearer <your-jwt-token>',
          'X-Tenant-ID': '<your-tenant-id>',
          'Content-Type': 'application/json'
        },
        body: {
          orderType: 'dine-in',
          locationId: 'location-id',
          items: [
            {
              productId: 'product-id',
              quantity: 2,
              unitPrice: 19.99
            }
          ],
          payment: {
            method: 'cash',
            paidAmount: 40.00
          }
        }
      }
    }
  };

  res.json(createResponse(examples, 'API Usage Examples'));
});

// Rate limiting information
docsRouter.get('/rate-limits', (req: Request, res: Response) => {
  const rateLimitInfo = {
    default: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 1000,
      description: 'Authenticated requests'
    },
    unauthenticated: {
      windowMs: 15 * 60 * 1000,
      maxRequests: 100,
      description: 'Unauthenticated requests'
    },
    headers: {
      'X-RateLimit-Limit': 'The rate limit ceiling for that given endpoint',
      'X-RateLimit-Remaining': 'The number of requests left for the time window',
      'X-RateLimit-Reset': 'The remaining window before the rate limit resets'
    },
    tips: [
      'Use authentication to get higher rate limits',
      'Cache responses when possible',
      'Use pagination for large data sets',
      'Implement exponential backoff for retries'
    ]
  };

  res.json(createResponse(rateLimitInfo, 'Rate Limiting Information'));
});

// Log documentation access
docsRouter.use((req: Request, res: Response, next) => {
  logger.info('Documentation accessed', {
    path: req.path,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  next();
});