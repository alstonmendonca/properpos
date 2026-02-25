// API Integration Tests
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

// Create a minimal test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  // Auth endpoints
  app.post('/api/v1/auth/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    if (email === 'test@example.com' && password === 'password123') {
      const token = jwt.sign({ userId: 'user-123', email }, 'test-secret', { expiresIn: '1h' });
      return res.json({ token, user: { id: 'user-123', email } });
    }

    res.status(401).json({ error: 'Invalid credentials' });
  });

  // Protected endpoint
  app.get('/api/v1/me', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, 'test-secret') as any;
      res.json({ user: { id: decoded.userId, email: decoded.email } });
    } catch (error) {
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  // Products endpoints
  app.get('/api/v1/products', (req, res) => {
    res.json({
      products: [
        { id: '1', name: 'Product 1', price: 10.00 },
        { id: '2', name: 'Product 2', price: 20.00 },
      ],
      total: 2,
    });
  });

  app.post('/api/v1/products', (req, res) => {
    const { name, price } = req.body;

    if (!name || typeof price !== 'number') {
      return res.status(400).json({ error: 'Name and price required' });
    }

    res.status(201).json({
      id: 'new-product-id',
      name,
      price,
      createdAt: new Date().toISOString(),
    });
  });

  // Orders endpoints
  app.post('/api/v1/orders', (req, res) => {
    const { items, customerId } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items required' });
    }

    const total = items.reduce((sum: number, item: any) => sum + (item.quantity * item.price), 0);

    res.status(201).json({
      id: 'order-123',
      items,
      customerId,
      total,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
  });

  return app;
};

describe('API Integration Tests', () => {
  let app: express.Application;

  beforeAll(() => {
    app = createTestApp();
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('Authentication', () => {
    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'test@example.com', password: 'password123' });

      expect(response.status).toBe(200);
      expect(response.body.token).toBeDefined();
      expect(response.body.user.email).toBe('test@example.com');
    });

    it('should reject invalid credentials', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'test@example.com', password: 'wrongpassword' });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid credentials');
    });

    it('should require email and password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'test@example.com' });

      expect(response.status).toBe(400);
    });

    it('should access protected endpoint with valid token', async () => {
      // First login to get token
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'test@example.com', password: 'password123' });

      const { token } = loginResponse.body;

      // Then access protected endpoint
      const response = await request(app)
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.user.email).toBe('test@example.com');
    });

    it('should reject request without token', async () => {
      const response = await request(app).get('/api/v1/me');

      expect(response.status).toBe(401);
    });

    it('should reject request with invalid token', async () => {
      const response = await request(app)
        .get('/api/v1/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });
  });

  describe('Products API', () => {
    it('should list products', async () => {
      const response = await request(app).get('/api/v1/products');

      expect(response.status).toBe(200);
      expect(response.body.products).toBeInstanceOf(Array);
      expect(response.body.total).toBe(2);
    });

    it('should create product with valid data', async () => {
      const response = await request(app)
        .post('/api/v1/products')
        .send({ name: 'New Product', price: 15.99 });

      expect(response.status).toBe(201);
      expect(response.body.id).toBeDefined();
      expect(response.body.name).toBe('New Product');
      expect(response.body.price).toBe(15.99);
    });

    it('should reject product without name', async () => {
      const response = await request(app)
        .post('/api/v1/products')
        .send({ price: 15.99 });

      expect(response.status).toBe(400);
    });

    it('should reject product without price', async () => {
      const response = await request(app)
        .post('/api/v1/products')
        .send({ name: 'New Product' });

      expect(response.status).toBe(400);
    });
  });

  describe('Orders API', () => {
    it('should create order with valid items', async () => {
      const response = await request(app)
        .post('/api/v1/orders')
        .send({
          items: [
            { productId: '1', quantity: 2, price: 10.00 },
            { productId: '2', quantity: 1, price: 20.00 },
          ],
          customerId: 'customer-123',
        });

      expect(response.status).toBe(201);
      expect(response.body.id).toBeDefined();
      expect(response.body.total).toBe(40.00);
      expect(response.body.status).toBe('pending');
    });

    it('should reject order without items', async () => {
      const response = await request(app)
        .post('/api/v1/orders')
        .send({ customerId: 'customer-123' });

      expect(response.status).toBe(400);
    });

    it('should reject order with empty items array', async () => {
      const response = await request(app)
        .post('/api/v1/orders')
        .send({ items: [], customerId: 'customer-123' });

      expect(response.status).toBe(400);
    });
  });
});
