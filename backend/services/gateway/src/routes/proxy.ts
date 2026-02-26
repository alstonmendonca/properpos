// API Gateway proxy router - Routes requests to microservices

import { Router } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import {
  logger,
  authenticate,
  extractTenant,
  requireRole,
  requirePermissions,
  optionalAuth,
  ApiError,
  SERVICE_PORTS,
  Permissions,
  UserRoles,
} from '@properpos/backend-shared';

export const proxyRouter = Router();

// Service base URLs
const getServiceUrl = (serviceName: string, port: string) => {
  const host = process.env.SERVICE_HOST || 'localhost';
  return `http://${host}:${port}`;
};

const SERVICES = {
  AUTH: getServiceUrl('auth', SERVICE_PORTS.AUTH),
  TENANT: getServiceUrl('tenant', SERVICE_PORTS.TENANT),
  POS: getServiceUrl('pos', SERVICE_PORTS.POS),
  INVENTORY: getServiceUrl('inventory', SERVICE_PORTS.INVENTORY),
  ANALYTICS: getServiceUrl('analytics', SERVICE_PORTS.ANALYTICS),
  BILLING: getServiceUrl('billing', SERVICE_PORTS.BILLING),
  NOTIFICATION: getServiceUrl('notification', SERVICE_PORTS.NOTIFICATION),
  AUDIT: getServiceUrl('audit', SERVICE_PORTS.AUDIT),
};

// Proxy configuration
const createProxy = (target: string, pathPrefix: string) => {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    // Don't rewrite paths - services expect the full path like /api/v1/auth/register
    // pathRewrite: {
    //   [`^/api/v1${pathPrefix}`]: '/api/v1',
    // },
    timeout: 30000,
    proxyTimeout: 30000,

    // Add correlation ID and forward headers
    onProxyReq: (proxyReq, req) => {
      const correlationId = req.headers['x-correlation-id'] as string;
      const user = (req as any).user;
      const tenant = (req as any).tenant;

      if (correlationId) {
        proxyReq.setHeader('X-Correlation-ID', correlationId);
      }

      if (user) {
        proxyReq.setHeader('X-User-ID', user.id);
        proxyReq.setHeader('X-User-Role', user.role);
        if (user.tenantId) {
          proxyReq.setHeader('X-User-Tenant', user.tenantId);
        }
      }

      if (tenant) {
        proxyReq.setHeader('X-Tenant-ID', tenant.id);
        proxyReq.setHeader('X-Tenant-Plan', tenant.subscription.plan);
      }

      // Re-stream body if it was parsed by express.json()
      // This is necessary because body-parser consumes the stream
      if (req.body && Object.keys(req.body).length > 0) {
        const bodyData = JSON.stringify(req.body);
        proxyReq.setHeader('Content-Type', 'application/json');
        proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
        proxyReq.write(bodyData);
      }

      // Log proxy request
      logger.debug('Proxying request', {
        method: req.method,
        path: req.path,
        target,
        userId: user?.id,
        tenantId: tenant?.id,
        correlationId,
      });
    },

    onProxyRes: (proxyRes, req) => {
      const correlationId = req.headers['x-correlation-id'] as string;

      if (correlationId) {
        proxyRes.headers['X-Correlation-ID'] = correlationId;
      }

      // Log response
      logger.debug('Proxy response', {
        method: req.method,
        path: req.path,
        status: proxyRes.statusCode,
        correlationId,
      });
    },

    onError: (err, req, res) => {
      logger.error('Proxy error', {
        error: err.message,
        method: req.method,
        path: req.path,
        target,
      });

      if (!res.headersSent) {
        res.status(502).json({
          success: false,
          error: {
            code: 'PROXY_ERROR',
            message: 'Service temporarily unavailable',
            timestamp: new Date().toISOString(),
          },
        });
      }
    },
  });
};

// Authentication service routes (public endpoints)
proxyRouter.use('/auth/login', createProxy(SERVICES.AUTH, '/auth'));
proxyRouter.use('/auth/register', createProxy(SERVICES.AUTH, '/auth'));
proxyRouter.use('/auth/forgot-password', createProxy(SERVICES.AUTH, '/auth'));
proxyRouter.use('/auth/reset-password', createProxy(SERVICES.AUTH, '/auth'));
proxyRouter.use('/auth/verify-email', createProxy(SERVICES.AUTH, '/auth'));

// Protected authentication routes
proxyRouter.use('/auth/refresh', authenticate, createProxy(SERVICES.AUTH, '/auth'));
proxyRouter.use('/auth/logout', authenticate, createProxy(SERVICES.AUTH, '/auth'));
proxyRouter.use('/auth/me', authenticate, createProxy(SERVICES.AUTH, '/auth'));

// Organization/Tenant routes
proxyRouter.use('/organizations',
  authenticate,
  extractTenant,
  requireRole([UserRoles.SUPER_ADMIN, UserRoles.TENANT_OWNER]),
  createProxy(SERVICES.TENANT, '/organizations')
);

proxyRouter.use('/locations',
  authenticate,
  extractTenant,
  requirePermissions(Permissions.LOCATION_MANAGE),
  createProxy(SERVICES.TENANT, '/locations')
);

// Product management routes
proxyRouter.use('/products',
  authenticate,
  extractTenant,
  requirePermissions([
    Permissions.PRODUCT_READ,
    Permissions.PRODUCT_CREATE,
    Permissions.PRODUCT_UPDATE,
    Permissions.PRODUCT_DELETE
  ]),
  createProxy(SERVICES.POS, '/products')
);

proxyRouter.use('/categories',
  authenticate,
  extractTenant,
  requirePermissions([
    Permissions.PRODUCT_READ,
    Permissions.PRODUCT_CREATE
  ]),
  createProxy(SERVICES.POS, '/categories')
);

// Order management routes
proxyRouter.use('/orders',
  authenticate,
  extractTenant,
  requirePermissions([
    Permissions.ORDER_READ,
    Permissions.ORDER_CREATE,
    Permissions.ORDER_UPDATE,
    Permissions.ORDER_DELETE
  ]),
  createProxy(SERVICES.POS, '/orders')
);

// Customer management routes
proxyRouter.use('/customers',
  authenticate,
  extractTenant,
  requirePermissions([
    Permissions.CUSTOMER_READ,
    Permissions.CUSTOMER_CREATE,
    Permissions.CUSTOMER_UPDATE,
    Permissions.CUSTOMER_DELETE
  ]),
  createProxy(SERVICES.POS, '/customers')
);

// Inventory management routes
proxyRouter.use('/inventory',
  authenticate,
  extractTenant,
  requirePermissions([
    Permissions.INVENTORY_READ,
    Permissions.INVENTORY_UPDATE,
    Permissions.INVENTORY_TRANSFER
  ]),
  createProxy(SERVICES.INVENTORY, '/inventory')
);

// Analytics routes (admin and manager access)
proxyRouter.use('/analytics',
  authenticate,
  extractTenant,
  requireRole([
    UserRoles.SUPER_ADMIN,
    UserRoles.TENANT_OWNER,
    UserRoles.ADMIN,
    UserRoles.MANAGER
  ]),
  requirePermissions([
    Permissions.ANALYTICS_READ,
    Permissions.REPORTS_GENERATE
  ]),
  createProxy(SERVICES.ANALYTICS, '/analytics')
);

// Reports routes
proxyRouter.use('/reports',
  authenticate,
  extractTenant,
  requireRole([
    UserRoles.SUPER_ADMIN,
    UserRoles.TENANT_OWNER,
    UserRoles.ADMIN,
    UserRoles.MANAGER
  ]),
  requirePermissions([
    Permissions.REPORTS_GENERATE,
    Permissions.REPORTS_EXPORT
  ]),
  createProxy(SERVICES.ANALYTICS, '/reports')
);

// Billing routes (tenant owners only)
proxyRouter.use('/billing',
  authenticate,
  extractTenant,
  requireRole([UserRoles.SUPER_ADMIN, UserRoles.TENANT_OWNER]),
  createProxy(SERVICES.BILLING, '/billing')
);

// User management routes
proxyRouter.use('/users',
  authenticate,
  extractTenant,
  requirePermissions([
    Permissions.USER_READ,
    Permissions.USER_CREATE,
    Permissions.USER_UPDATE,
    Permissions.USER_DELETE
  ]),
  createProxy(SERVICES.AUTH, '/users')
);

// Notification routes
proxyRouter.use('/notifications',
  authenticate,
  extractTenant,
  createProxy(SERVICES.NOTIFICATION, '/notifications')
);

// File upload routes (with size limits)
proxyRouter.use('/files',
  authenticate,
  extractTenant,
  createProxy(SERVICES.POS, '/files') // POS service handles file uploads
);

// Webhook routes (for external integrations)
proxyRouter.use('/webhooks',
  optionalAuth, // Webhooks might not have user authentication
  createProxy(SERVICES.NOTIFICATION, '/webhooks')
);

// Audit log routes (admin access only)
proxyRouter.use('/audit',
  authenticate,
  extractTenant,
  requireRole([
    UserRoles.SUPER_ADMIN,
    UserRoles.TENANT_OWNER,
    UserRoles.ADMIN
  ]),
  requirePermissions(Permissions.SYSTEM_LOGS),
  createProxy(SERVICES.AUDIT, '/audit')
);

// System administration routes (super admin only)
proxyRouter.use('/admin',
  authenticate,
  requireRole(UserRoles.SUPER_ADMIN),
  createProxy(SERVICES.TENANT, '/admin')
);

// Public endpoints (no authentication required)
proxyRouter.use('/public',
  createProxy(SERVICES.POS, '/public')
);

// Health checks for services (internal use)
proxyRouter.get('/services/:serviceName/health', async (req, res): Promise<void> => {
  const { serviceName } = req.params;
  const serviceUrl = (SERVICES as any)[serviceName.toUpperCase()];

  if (!serviceUrl) {
    res.status(404).json({
      success: false,
      error: {
        code: 'SERVICE_NOT_FOUND',
        message: `Service ${serviceName} not found`,
      },
    });
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${serviceUrl}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await response.json().catch(() => ({}));

    res.json({
      success: true,
      data: {
        service: serviceName,
        status: response.ok ? 'healthy' : 'unhealthy',
        statusCode: response.status,
        url: serviceUrl,
        details: data,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    res.status(503).json({
      success: false,
      error: {
        code: 'SERVICE_UNHEALTHY',
        message: `Service ${serviceName} is ${isTimeout ? 'not responding' : 'unhealthy'}`,
        details: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

// Route not found handler
proxyRouter.use('*', (req, res) => {
  logger.warn('API route not found', {
    method: req.method,
    path: req.path,
    ip: req.ip,
  });

  res.status(404).json({
    success: false,
    error: {
      code: 'API_ROUTE_NOT_FOUND',
      message: `API route ${req.method} ${req.path} not found`,
      timestamp: new Date().toISOString(),
    },
  });
});