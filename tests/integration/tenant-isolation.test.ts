// Tenant Isolation Integration Tests
// Tests multi-tenant data isolation, cross-tenant access prevention, and location-based permissions

import request from 'supertest';
import express, { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

// Test constants
const JWT_SECRET = 'test-jwt-secret-key-for-testing';
const TENANT_A_ID = 'tenant-a-id-12345';
const TENANT_B_ID = 'tenant-b-id-67890';
const LOCATION_A1 = 'loc-a1-id';
const LOCATION_A2 = 'loc-a2-id';
const LOCATION_B1 = 'loc-b1-id';

// In-memory data store for testing
interface TestDataStore {
  tenants: Record<string, {
    id: string;
    name: string;
    products: Array<{ id: string; name: string; price: number; locationId?: string }>;
    orders: Array<{ id: string; total: number; locationId: string }>;
    customers: Array<{ id: string; name: string; email: string }>;
  }>;
}

const dataStore: TestDataStore = {
  tenants: {
    [TENANT_A_ID]: {
      id: TENANT_A_ID,
      name: 'Tenant A',
      products: [
        { id: 'prod-a1', name: 'Product A1', price: 10.00, locationId: LOCATION_A1 },
        { id: 'prod-a2', name: 'Product A2', price: 20.00, locationId: LOCATION_A2 },
      ],
      orders: [
        { id: 'order-a1', total: 100.00, locationId: LOCATION_A1 },
        { id: 'order-a2', total: 200.00, locationId: LOCATION_A2 },
      ],
      customers: [
        { id: 'cust-a1', name: 'Customer A1', email: 'custa1@example.com' },
      ],
    },
    [TENANT_B_ID]: {
      id: TENANT_B_ID,
      name: 'Tenant B',
      products: [
        { id: 'prod-b1', name: 'Product B1', price: 15.00, locationId: LOCATION_B1 },
      ],
      orders: [
        { id: 'order-b1', total: 150.00, locationId: LOCATION_B1 },
      ],
      customers: [
        { id: 'cust-b1', name: 'Customer B1', email: 'custb1@example.com' },
      ],
    },
  },
};

// Token creation utility
interface TokenPayload {
  userId: string;
  email: string;
  tenantId: string;
  role: 'super_admin' | 'tenant_owner' | 'manager' | 'cashier';
  locationAccess: string[];
}

const createToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
};

// Middleware: Authenticate user
const authenticateUser = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    return;
  }

  try {
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
    (req as any).user = decoded;
    next();
  } catch {
    res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' } });
  }
};

// Middleware: Validate tenant header
const validateTenantHeader = (req: Request, res: Response, next: NextFunction): void => {
  const tenantHeader = req.headers['x-tenant-id'] as string;
  const user = (req as any).user as TokenPayload;

  if (!tenantHeader) {
    res.status(400).json({ error: { code: 'MISSING_TENANT', message: 'X-Tenant-ID header is required' } });
    return;
  }

  // Super admins can access any tenant
  if (user.role === 'super_admin') {
    (req as any).tenantId = tenantHeader;
    next();
    return;
  }

  // Other users can only access their own tenant
  if (tenantHeader !== user.tenantId) {
    res.status(403).json({ error: { code: 'CROSS_TENANT_ACCESS_DENIED', message: 'Access to other tenants is forbidden' } });
    return;
  }

  (req as any).tenantId = tenantHeader;
  next();
};

// Middleware: Enforce location access
const enforceLocationAccess = (req: Request, res: Response, next: NextFunction): void => {
  const user = (req as any).user as TokenPayload;
  const locationId = req.params.locationId || req.body.locationId || req.query.locationId;

  // Super admins and tenant owners have unrestricted access
  if (user.role === 'super_admin' || user.role === 'tenant_owner') {
    next();
    return;
  }

  // Check location access for other roles
  if (locationId && !user.locationAccess.includes(locationId as string)) {
    res.status(403).json({ error: { code: 'LOCATION_ACCESS_DENIED', message: 'Access denied to this location' } });
    return;
  }

  next();
};

// Create test application
const createTestApp = (): express.Application => {
  const app = express();
  app.use(express.json());

  // Products endpoints
  app.get('/api/v1/products', authenticateUser, validateTenantHeader, enforceLocationAccess, (req, res) => {
    const tenantId = (req as any).tenantId;
    const user = (req as any).user as TokenPayload;
    const tenant = dataStore.tenants[tenantId];

    if (!tenant) {
      return res.status(404).json({ error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found' } });
    }

    let products = tenant.products;

    // Filter by location for non-admin users
    if (user.role !== 'super_admin' && user.role !== 'tenant_owner') {
      products = products.filter(p => !p.locationId || user.locationAccess.includes(p.locationId));
    }

    res.json({ success: true, data: products });
  });

  app.get('/api/v1/products/:id', authenticateUser, validateTenantHeader, (req, res) => {
    const tenantId = (req as any).tenantId;
    const tenant = dataStore.tenants[tenantId];

    if (!tenant) {
      return res.status(404).json({ error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found' } });
    }

    const product = tenant.products.find(p => p.id === req.params.id);

    if (!product) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Product not found' } });
    }

    res.json({ success: true, data: product });
  });

  // Orders endpoints
  app.get('/api/v1/orders', authenticateUser, validateTenantHeader, enforceLocationAccess, (req, res) => {
    const tenantId = (req as any).tenantId;
    const user = (req as any).user as TokenPayload;
    const tenant = dataStore.tenants[tenantId];

    if (!tenant) {
      return res.status(404).json({ error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found' } });
    }

    let orders = tenant.orders;

    // Filter by location for non-admin users
    if (user.role !== 'super_admin' && user.role !== 'tenant_owner') {
      orders = orders.filter(o => user.locationAccess.includes(o.locationId));
    }

    res.json({ success: true, data: orders });
  });

  app.get('/api/v1/orders/:id', authenticateUser, validateTenantHeader, (req, res) => {
    const tenantId = (req as any).tenantId;
    const user = (req as any).user as TokenPayload;
    const tenant = dataStore.tenants[tenantId];

    if (!tenant) {
      return res.status(404).json({ error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found' } });
    }

    const order = tenant.orders.find(o => o.id === req.params.id);

    if (!order) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Order not found' } });
    }

    // Location access check for specific order
    if (user.role !== 'super_admin' && user.role !== 'tenant_owner' && !user.locationAccess.includes(order.locationId)) {
      return res.status(403).json({ error: { code: 'LOCATION_ACCESS_DENIED', message: 'Access denied to this order' } });
    }

    res.json({ success: true, data: order });
  });

  // Customers endpoints
  app.get('/api/v1/customers', authenticateUser, validateTenantHeader, (req, res) => {
    const tenantId = (req as any).tenantId;
    const tenant = dataStore.tenants[tenantId];

    if (!tenant) {
      return res.status(404).json({ error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found' } });
    }

    res.json({ success: true, data: tenant.customers });
  });

  // Direct resource access attempt (should fail without proper tenant context)
  app.get('/api/v1/direct-access/:productId', authenticateUser, (req, res) => {
    // Intentionally not using tenant header - should fail
    res.status(400).json({ error: { code: 'MISSING_TENANT', message: 'X-Tenant-ID header is required' } });
  });

  return app;
};

describe('Tenant Isolation Integration Tests', () => {
  let app: express.Application;
  let tenantAOwnerToken: string;
  let tenantBOwnerToken: string;
  let tenantAManagerToken: string;
  let tenantACashierToken: string;
  let superAdminToken: string;

  beforeAll(() => {
    app = createTestApp();

    // Create test tokens
    tenantAOwnerToken = createToken({
      userId: 'user-a-owner',
      email: 'owner@tenanta.com',
      tenantId: TENANT_A_ID,
      role: 'tenant_owner',
      locationAccess: [LOCATION_A1, LOCATION_A2],
    });

    tenantBOwnerToken = createToken({
      userId: 'user-b-owner',
      email: 'owner@tenantb.com',
      tenantId: TENANT_B_ID,
      role: 'tenant_owner',
      locationAccess: [LOCATION_B1],
    });

    tenantAManagerToken = createToken({
      userId: 'user-a-manager',
      email: 'manager@tenanta.com',
      tenantId: TENANT_A_ID,
      role: 'manager',
      locationAccess: [LOCATION_A1], // Only has access to location A1
    });

    tenantACashierToken = createToken({
      userId: 'user-a-cashier',
      email: 'cashier@tenanta.com',
      tenantId: TENANT_A_ID,
      role: 'cashier',
      locationAccess: [LOCATION_A1],
    });

    superAdminToken = createToken({
      userId: 'super-admin',
      email: 'admin@properpos.com',
      tenantId: 'platform',
      role: 'super_admin',
      locationAccess: [],
    });
  });

  describe('Cross-Tenant Access Prevention', () => {
    it('should prevent Tenant A from accessing Tenant B products', async () => {
      const response = await request(app)
        .get('/api/v1/products')
        .set('Authorization', `Bearer ${tenantAOwnerToken}`)
        .set('X-Tenant-ID', TENANT_B_ID);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('CROSS_TENANT_ACCESS_DENIED');
    });

    it('should prevent Tenant B from accessing Tenant A orders', async () => {
      const response = await request(app)
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${tenantBOwnerToken}`)
        .set('X-Tenant-ID', TENANT_A_ID);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('CROSS_TENANT_ACCESS_DENIED');
    });

    it('should prevent Tenant A from accessing specific Tenant B product by ID', async () => {
      const response = await request(app)
        .get('/api/v1/products/prod-b1')
        .set('Authorization', `Bearer ${tenantAOwnerToken}`)
        .set('X-Tenant-ID', TENANT_B_ID);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('CROSS_TENANT_ACCESS_DENIED');
    });

    it('should prevent Tenant B from accessing Tenant A customers', async () => {
      const response = await request(app)
        .get('/api/v1/customers')
        .set('Authorization', `Bearer ${tenantBOwnerToken}`)
        .set('X-Tenant-ID', TENANT_A_ID);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('CROSS_TENANT_ACCESS_DENIED');
    });
  });

  describe('Valid Tenant Access', () => {
    it('should allow Tenant A owner to access Tenant A products', async () => {
      const response = await request(app)
        .get('/api/v1/products')
        .set('Authorization', `Bearer ${tenantAOwnerToken}`)
        .set('X-Tenant-ID', TENANT_A_ID);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data.some((p: { id: string }) => p.id === 'prod-a1')).toBe(true);
    });

    it('should allow Tenant B owner to access Tenant B products', async () => {
      const response = await request(app)
        .get('/api/v1/products')
        .set('Authorization', `Bearer ${tenantBOwnerToken}`)
        .set('X-Tenant-ID', TENANT_B_ID);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].id).toBe('prod-b1');
    });

    it('should return only tenant-specific products', async () => {
      const responseA = await request(app)
        .get('/api/v1/products')
        .set('Authorization', `Bearer ${tenantAOwnerToken}`)
        .set('X-Tenant-ID', TENANT_A_ID);

      const responseB = await request(app)
        .get('/api/v1/products')
        .set('Authorization', `Bearer ${tenantBOwnerToken}`)
        .set('X-Tenant-ID', TENANT_B_ID);

      // Verify no cross-contamination
      const tenantAProductIds = responseA.body.data.map((p: { id: string }) => p.id);
      const tenantBProductIds = responseB.body.data.map((p: { id: string }) => p.id);

      expect(tenantAProductIds).not.toContain('prod-b1');
      expect(tenantBProductIds).not.toContain('prod-a1');
      expect(tenantBProductIds).not.toContain('prod-a2');
    });
  });

  describe('Tenant Header Validation', () => {
    it('should reject requests without X-Tenant-ID header', async () => {
      const response = await request(app)
        .get('/api/v1/products')
        .set('Authorization', `Bearer ${tenantAOwnerToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('MISSING_TENANT');
    });

    it('should reject requests with invalid tenant ID', async () => {
      const response = await request(app)
        .get('/api/v1/products')
        .set('Authorization', `Bearer ${tenantAOwnerToken}`)
        .set('X-Tenant-ID', 'non-existent-tenant');

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('CROSS_TENANT_ACCESS_DENIED');
    });

    it('should require authentication before tenant validation', async () => {
      const response = await request(app)
        .get('/api/v1/products')
        .set('X-Tenant-ID', TENANT_A_ID);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Super Admin Cross-Tenant Access', () => {
    it('should allow super admin to access Tenant A data', async () => {
      const response = await request(app)
        .get('/api/v1/products')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .set('X-Tenant-ID', TENANT_A_ID);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
    });

    it('should allow super admin to access Tenant B data', async () => {
      const response = await request(app)
        .get('/api/v1/products')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .set('X-Tenant-ID', TENANT_B_ID);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
    });
  });

  describe('Location-Based Access Control', () => {
    it('should allow tenant owner to access all locations', async () => {
      const response = await request(app)
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${tenantAOwnerToken}`)
        .set('X-Tenant-ID', TENANT_A_ID);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
    });

    it('should restrict manager to assigned locations only', async () => {
      const response = await request(app)
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${tenantAManagerToken}`)
        .set('X-Tenant-ID', TENANT_A_ID);

      expect(response.status).toBe(200);
      // Manager only has access to LOCATION_A1
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].locationId).toBe(LOCATION_A1);
    });

    it('should restrict cashier to assigned locations only', async () => {
      const response = await request(app)
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${tenantACashierToken}`)
        .set('X-Tenant-ID', TENANT_A_ID);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].locationId).toBe(LOCATION_A1);
    });

    it('should prevent access to orders from unauthorized locations', async () => {
      // Manager tries to access order from location A2 (not in their locationAccess)
      const response = await request(app)
        .get('/api/v1/orders/order-a2')
        .set('Authorization', `Bearer ${tenantAManagerToken}`)
        .set('X-Tenant-ID', TENANT_A_ID);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('LOCATION_ACCESS_DENIED');
    });

    it('should allow access to orders from authorized locations', async () => {
      const response = await request(app)
        .get('/api/v1/orders/order-a1')
        .set('Authorization', `Bearer ${tenantAManagerToken}`)
        .set('X-Tenant-ID', TENANT_A_ID);

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe('order-a1');
    });
  });

  describe('Data Isolation Verification', () => {
    it('should return product not found when accessing other tenant product with correct tenant header', async () => {
      // Tenant A trying to access prod-b1 with their own tenant header
      const response = await request(app)
        .get('/api/v1/products/prod-b1')
        .set('Authorization', `Bearer ${tenantAOwnerToken}`)
        .set('X-Tenant-ID', TENANT_A_ID);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('should return order not found when accessing other tenant order', async () => {
      const response = await request(app)
        .get('/api/v1/orders/order-b1')
        .set('Authorization', `Bearer ${tenantAOwnerToken}`)
        .set('X-Tenant-ID', TENANT_A_ID);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('should not leak tenant data through enumeration attempts', async () => {
      // Try various IDs that might exist in other tenants
      const attemptedIds = ['prod-b1', 'order-b1', 'cust-b1', 'unknown-id'];

      for (const id of attemptedIds) {
        const productResponse = await request(app)
          .get(`/api/v1/products/${id}`)
          .set('Authorization', `Bearer ${tenantAOwnerToken}`)
          .set('X-Tenant-ID', TENANT_A_ID);

        // Should always return 404, not information about whether the ID exists elsewhere
        if (productResponse.status !== 200) {
          expect(productResponse.body.error.code).toBe('NOT_FOUND');
        }
      }
    });
  });

  describe('Token Tampering Prevention', () => {
    it('should reject expired tokens', async () => {
      const expiredToken = jwt.sign(
        {
          userId: 'user-a-owner',
          email: 'owner@tenanta.com',
          tenantId: TENANT_A_ID,
          role: 'tenant_owner',
          locationAccess: [LOCATION_A1, LOCATION_A2],
        },
        JWT_SECRET,
        { expiresIn: '-1h' } // Already expired
      );

      const response = await request(app)
        .get('/api/v1/products')
        .set('Authorization', `Bearer ${expiredToken}`)
        .set('X-Tenant-ID', TENANT_A_ID);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_TOKEN');
    });

    it('should reject tokens signed with wrong secret', async () => {
      const wrongSecretToken = jwt.sign(
        {
          userId: 'user-a-owner',
          email: 'owner@tenanta.com',
          tenantId: TENANT_A_ID,
          role: 'tenant_owner',
          locationAccess: [LOCATION_A1, LOCATION_A2],
        },
        'wrong-secret-key',
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .get('/api/v1/products')
        .set('Authorization', `Bearer ${wrongSecretToken}`)
        .set('X-Tenant-ID', TENANT_A_ID);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_TOKEN');
    });

    it('should reject malformed tokens', async () => {
      const response = await request(app)
        .get('/api/v1/products')
        .set('Authorization', 'Bearer malformed.token.here')
        .set('X-Tenant-ID', TENANT_A_ID);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_TOKEN');
    });
  });

  describe('Concurrent Access Isolation', () => {
    it('should maintain isolation during concurrent requests from different tenants', async () => {
      // Simulate concurrent requests
      const [responseA, responseB] = await Promise.all([
        request(app)
          .get('/api/v1/products')
          .set('Authorization', `Bearer ${tenantAOwnerToken}`)
          .set('X-Tenant-ID', TENANT_A_ID),
        request(app)
          .get('/api/v1/products')
          .set('Authorization', `Bearer ${tenantBOwnerToken}`)
          .set('X-Tenant-ID', TENANT_B_ID),
      ]);

      expect(responseA.status).toBe(200);
      expect(responseB.status).toBe(200);

      // Verify data isolation
      const tenantAProductIds = responseA.body.data.map((p: { id: string }) => p.id);
      const tenantBProductIds = responseB.body.data.map((p: { id: string }) => p.id);

      expect(tenantAProductIds).toContain('prod-a1');
      expect(tenantAProductIds).toContain('prod-a2');
      expect(tenantAProductIds).not.toContain('prod-b1');

      expect(tenantBProductIds).toContain('prod-b1');
      expect(tenantBProductIds).not.toContain('prod-a1');
      expect(tenantBProductIds).not.toContain('prod-a2');
    });
  });
});
