#!/usr/bin/env node

/**
 * Seed demo data for ProperPOS
 * Creates sample tenants, users, products, and orders for testing
 */

const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';

// Demo tenant data
const demoTenant = {
  _id: 'demo-tenant-001',
  name: 'Demo Coffee Shop',
  slug: 'demo-coffee-shop',
  status: 'active',
  subscription: {
    plan: 'professional',
    status: 'active',
    trialEndsAt: null,
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  },
  settings: {
    currency: 'USD',
    timezone: 'America/Los_Angeles',
    taxRate: 8.5,
  },
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Demo users
const demoUsers = [
  {
    _id: 'demo-user-001',
    email: 'demo@properpos.com',
    password: 'demo123', // Will be hashed
    name: 'Demo User',
    role: 'owner',
    tenantId: 'demo-tenant-001',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    _id: 'demo-user-002',
    email: 'cashier@properpos.com',
    password: 'cashier123',
    name: 'Demo Cashier',
    role: 'cashier',
    tenantId: 'demo-tenant-001',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

// Demo categories
const demoCategories = [
  { _id: 'cat-001', name: 'Coffee', slug: 'coffee', tenantId: 'demo-tenant-001' },
  { _id: 'cat-002', name: 'Tea', slug: 'tea', tenantId: 'demo-tenant-001' },
  { _id: 'cat-003', name: 'Pastries', slug: 'pastries', tenantId: 'demo-tenant-001' },
  { _id: 'cat-004', name: 'Sandwiches', slug: 'sandwiches', tenantId: 'demo-tenant-001' },
  { _id: 'cat-005', name: 'Merchandise', slug: 'merchandise', tenantId: 'demo-tenant-001' },
];

// Demo products
const demoProducts = [
  // Coffee
  { _id: 'prod-001', name: 'Espresso', price: 3.50, categoryId: 'cat-001', sku: 'COF-001', stock: 100 },
  { _id: 'prod-002', name: 'Americano', price: 4.00, categoryId: 'cat-001', sku: 'COF-002', stock: 100 },
  { _id: 'prod-003', name: 'Latte', price: 5.00, categoryId: 'cat-001', sku: 'COF-003', stock: 100 },
  { _id: 'prod-004', name: 'Cappuccino', price: 4.75, categoryId: 'cat-001', sku: 'COF-004', stock: 100 },
  { _id: 'prod-005', name: 'Mocha', price: 5.50, categoryId: 'cat-001', sku: 'COF-005', stock: 100 },
  // Tea
  { _id: 'prod-006', name: 'Green Tea', price: 3.00, categoryId: 'cat-002', sku: 'TEA-001', stock: 100 },
  { _id: 'prod-007', name: 'Earl Grey', price: 3.00, categoryId: 'cat-002', sku: 'TEA-002', stock: 100 },
  { _id: 'prod-008', name: 'Chai Latte', price: 4.50, categoryId: 'cat-002', sku: 'TEA-003', stock: 100 },
  // Pastries
  { _id: 'prod-009', name: 'Croissant', price: 3.50, categoryId: 'cat-003', sku: 'PAS-001', stock: 50 },
  { _id: 'prod-010', name: 'Chocolate Muffin', price: 3.75, categoryId: 'cat-003', sku: 'PAS-002', stock: 40 },
  { _id: 'prod-011', name: 'Blueberry Scone', price: 3.25, categoryId: 'cat-003', sku: 'PAS-003', stock: 35 },
  // Sandwiches
  { _id: 'prod-012', name: 'Turkey Club', price: 9.50, categoryId: 'cat-004', sku: 'SAN-001', stock: 30 },
  { _id: 'prod-013', name: 'Veggie Wrap', price: 8.00, categoryId: 'cat-004', sku: 'SAN-002', stock: 25 },
  { _id: 'prod-014', name: 'Grilled Cheese', price: 7.00, categoryId: 'cat-004', sku: 'SAN-003', stock: 30 },
  // Merchandise
  { _id: 'prod-015', name: 'Coffee Mug', price: 15.00, categoryId: 'cat-005', sku: 'MER-001', stock: 20 },
  { _id: 'prod-016', name: 'Tote Bag', price: 12.00, categoryId: 'cat-005', sku: 'MER-002', stock: 15 },
].map((p) => ({
  ...p,
  tenantId: 'demo-tenant-001',
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
}));

// Demo customers
const demoCustomers = [
  { _id: 'cust-001', name: 'John Smith', email: 'john@example.com', phone: '555-0101', loyaltyPoints: 150 },
  { _id: 'cust-002', name: 'Jane Doe', email: 'jane@example.com', phone: '555-0102', loyaltyPoints: 320 },
  { _id: 'cust-003', name: 'Bob Wilson', email: 'bob@example.com', phone: '555-0103', loyaltyPoints: 75 },
  { _id: 'cust-004', name: 'Alice Brown', email: 'alice@example.com', phone: '555-0104', loyaltyPoints: 500 },
  { _id: 'cust-005', name: 'Charlie Davis', email: 'charlie@example.com', phone: '555-0105', loyaltyPoints: 200 },
].map((c) => ({
  ...c,
  tenantId: 'demo-tenant-001',
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
}));

// Generate random orders
function generateOrders(count) {
  const orders = [];
  const statuses = ['completed', 'completed', 'completed', 'pending', 'preparing'];
  const paymentMethods = ['cash', 'card', 'card', 'card'];

  for (let i = 0; i < count; i++) {
    const orderDate = new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000);
    const itemCount = Math.floor(Math.random() * 4) + 1;
    const items = [];
    let subtotal = 0;

    for (let j = 0; j < itemCount; j++) {
      const product = demoProducts[Math.floor(Math.random() * demoProducts.length)];
      const quantity = Math.floor(Math.random() * 3) + 1;
      const itemTotal = product.price * quantity;
      subtotal += itemTotal;

      items.push({
        productId: product._id,
        name: product.name,
        quantity,
        unitPrice: product.price,
        total: itemTotal,
      });
    }

    const tax = subtotal * 0.085;
    const total = subtotal + tax;

    orders.push({
      _id: `order-${String(i + 1).padStart(4, '0')}`,
      orderNumber: `ORD-${String(i + 1).padStart(6, '0')}`,
      tenantId: 'demo-tenant-001',
      customerId: Math.random() > 0.5 ? demoCustomers[Math.floor(Math.random() * demoCustomers.length)]._id : null,
      items,
      subtotal: Math.round(subtotal * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      total: Math.round(total * 100) / 100,
      status: statuses[Math.floor(Math.random() * statuses.length)],
      paymentMethod: paymentMethods[Math.floor(Math.random() * paymentMethods.length)],
      paidAt: orderDate,
      createdAt: orderDate,
      updatedAt: orderDate,
    });
  }

  return orders;
}

async function seedDatabase() {
  console.log('🌱 Seeding ProperPOS demo data...\n');

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB\n');

    // Platform database
    const platformDb = client.db('properpos_platform');

    // Clear existing demo data
    console.log('🗑️  Clearing existing demo data...');
    await platformDb.collection('tenants').deleteOne({ _id: 'demo-tenant-001' });
    await platformDb.collection('users').deleteMany({ tenantId: 'demo-tenant-001' });

    // Seed tenant
    console.log('📦 Seeding tenant...');
    await platformDb.collection('tenants').insertOne(demoTenant);

    // Seed users with hashed passwords
    console.log('👤 Seeding users...');
    const hashedUsers = await Promise.all(
      demoUsers.map(async (user) => ({
        ...user,
        password: await bcrypt.hash(user.password, 12),
      }))
    );
    await platformDb.collection('users').insertMany(hashedUsers);

    // Tenant database
    const tenantDb = client.db('properpos_tenant_demo-tenant-001');

    // Clear tenant collections
    console.log('🗑️  Clearing tenant data...');
    await tenantDb.collection('categories').deleteMany({});
    await tenantDb.collection('products').deleteMany({});
    await tenantDb.collection('customers').deleteMany({});
    await tenantDb.collection('orders').deleteMany({});

    // Seed categories
    console.log('📁 Seeding categories...');
    await tenantDb.collection('categories').insertMany(demoCategories);

    // Seed products
    console.log('🏷️  Seeding products...');
    await tenantDb.collection('products').insertMany(demoProducts);

    // Seed customers
    console.log('👥 Seeding customers...');
    await tenantDb.collection('customers').insertMany(demoCustomers);

    // Seed orders
    console.log('📝 Seeding orders...');
    const orders = generateOrders(100);
    await tenantDb.collection('orders').insertMany(orders);

    // Create indexes
    console.log('📇 Creating indexes...');
    await tenantDb.collection('products').createIndex({ sku: 1 }, { unique: true });
    await tenantDb.collection('products').createIndex({ categoryId: 1 });
    await tenantDb.collection('orders').createIndex({ orderNumber: 1 }, { unique: true });
    await tenantDb.collection('orders').createIndex({ createdAt: -1 });
    await tenantDb.collection('orders').createIndex({ customerId: 1 });

    console.log('\n✅ Demo data seeded successfully!');
    console.log('\n📋 Demo Credentials:');
    console.log('   Email: demo@properpos.com');
    console.log('   Password: demo123');
    console.log('\n   Cashier Email: cashier@properpos.com');
    console.log('   Cashier Password: cashier123');

  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

seedDatabase();
