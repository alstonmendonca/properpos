// Comprehensive seed data script for ProperPOS
// Run with: npx ts-node scripts/seed-data.ts

import { MongoClient, Db } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://admin:password@localhost:27017/properpos_platform?authSource=admin';

// Test user credentials
const TEST_USER = {
  email: 'demo@properpos.com',
  password: 'Demo123!',
  firstName: 'Demo',
  lastName: 'User',
};

const TEST_TENANT_ID = 'demo-tenant-001';
const TEST_ORG_ID = 'demo-org-001';
const TEST_USER_ID = 'demo-user-001';
const TEST_LOCATION_ID = 'demo-location-001';

// Category IDs
const CATEGORY_IDS = {
  beverages: 'cat-beverages-001',
  mainDishes: 'cat-main-dishes-001',
  appetizers: 'cat-appetizers-001',
  desserts: 'cat-desserts-001',
  sides: 'cat-sides-001',
};

// Product IDs
const PRODUCT_IDS = {
  coffee: 'prod-coffee-001',
  latte: 'prod-latte-001',
  cappuccino: 'prod-cappuccino-001',
  burger: 'prod-burger-001',
  pizza: 'prod-pizza-001',
  pasta: 'prod-pasta-001',
  salad: 'prod-salad-001',
  fries: 'prod-fries-001',
  cake: 'prod-cake-001',
  iceCream: 'prod-icecream-001',
};

// Customer IDs
const CUSTOMER_IDS = {
  john: 'cust-john-001',
  jane: 'cust-jane-001',
  bob: 'cust-bob-001',
};

async function seedPlatformDatabase(client: MongoClient) {
  const db = client.db('properpos_platform');

  console.log('Seeding platform database...');

  // Clear existing demo data
  await db.collection('users').deleteMany({ id: TEST_USER_ID });
  await db.collection('organizations').deleteMany({ tenantId: TEST_TENANT_ID });

  // Create password hash
  const passwordHash = await bcrypt.hash(TEST_USER.password, 12);

  // Create demo organization
  const organization = {
    id: TEST_ORG_ID,
    tenantId: TEST_TENANT_ID,
    name: 'Demo Restaurant',
    businessType: 'food',
    subscription: {
      plan: 'starter',
      status: 'active',
      trialStartsAt: new Date(),
      trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      maxLocations: 3,
      maxUsers: 10,
      features: ['basic_pos', 'inventory', 'basic_reports', 'customer_management'],
    },
    settings: {
      timezone: 'America/New_York',
      currency: 'USD',
      language: 'en',
      businessHours: {
        monday: { open: '09:00', close: '22:00', closed: false },
        tuesday: { open: '09:00', close: '22:00', closed: false },
        wednesday: { open: '09:00', close: '22:00', closed: false },
        thursday: { open: '09:00', close: '22:00', closed: false },
        friday: { open: '09:00', close: '23:00', closed: false },
        saturday: { open: '10:00', close: '23:00', closed: false },
        sunday: { open: '10:00', close: '21:00', closed: false },
      },
    },
    database: {
      name: `properpos_tenant_${TEST_TENANT_ID}`,
      connectionString: `mongodb://localhost:27017/properpos_tenant_${TEST_TENANT_ID}`,
    },
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.collection('organizations').insertOne(organization);
  console.log('  Created demo organization');

  // Create demo user
  const user = {
    id: TEST_USER_ID,
    email: TEST_USER.email,
    profile: {
      firstName: TEST_USER.firstName,
      lastName: TEST_USER.lastName,
      phone: '+1234567890',
      avatar: null,
      timezone: 'America/New_York',
      language: 'en',
    },
    globalRole: 'tenant_owner',
    tenantMemberships: [
      {
        tenantId: TEST_TENANT_ID,
        role: 'tenant_owner',
        permissions: ['*'],
        locationAccess: ['*'],
        status: 'active',
        joinedAt: new Date(),
      },
    ],
    auth: {
      passwordHash,
      isEmailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpires: null,
      mfaEnabled: false,
      mfaSecret: null,
      passwordResetToken: null,
      passwordResetExpires: null,
      loginAttempts: 0,
      lockUntil: null,
      lastLoginAt: new Date(),
    },
    isActive: true,
    lastActiveAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.collection('users').insertOne(user);
  console.log('  Created demo user');

  return { organization, user };
}

async function seedTenantDatabase(client: MongoClient) {
  const dbName = `properpos_tenant_${TEST_TENANT_ID}`;
  const db = client.db(dbName);

  console.log(`Seeding tenant database: ${dbName}...`);

  // Clear existing data
  await db.collection('locations').deleteMany({});
  await db.collection('categories').deleteMany({});
  await db.collection('products').deleteMany({});
  await db.collection('customers').deleteMany({});
  await db.collection('orders').deleteMany({});
  await db.collection('inventory').deleteMany({});

  // Create location
  const location = {
    id: TEST_LOCATION_ID,
    name: 'Main Restaurant',
    address: {
      street: '123 Main Street',
      city: 'New York',
      state: 'NY',
      postalCode: '10001',
      country: 'US',
    },
    contact: {
      phone: '+1234567890',
      email: 'main@demoresturant.com',
    },
    settings: {
      timezone: 'America/New_York',
      currency: 'USD',
      taxRate: 8.875,
      receiptSettings: {
        showLogo: true,
        footerText: 'Thank you for dining with us!',
      },
    },
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.collection('locations').insertOne(location);
  console.log('  Created location');

  // Create categories
  const categories = [
    { id: CATEGORY_IDS.beverages, name: 'Beverages', description: 'Hot and cold drinks', sortOrder: 1, isActive: true },
    { id: CATEGORY_IDS.mainDishes, name: 'Main Dishes', description: 'Entrees and main courses', sortOrder: 2, isActive: true },
    { id: CATEGORY_IDS.appetizers, name: 'Appetizers', description: 'Starters and small plates', sortOrder: 3, isActive: true },
    { id: CATEGORY_IDS.desserts, name: 'Desserts', description: 'Sweet treats', sortOrder: 4, isActive: true },
    { id: CATEGORY_IDS.sides, name: 'Sides', description: 'Side dishes', sortOrder: 5, isActive: true },
  ].map(cat => ({
    ...cat,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  await db.collection('categories').insertMany(categories);
  console.log('  Created categories');

  // Create products
  const products = [
    { id: PRODUCT_IDS.coffee, name: 'Coffee', description: 'Freshly brewed coffee', categoryId: CATEGORY_IDS.beverages, price: 2.99, cost: 0.50, sku: 'BEV-001' },
    { id: PRODUCT_IDS.latte, name: 'Latte', description: 'Espresso with steamed milk', categoryId: CATEGORY_IDS.beverages, price: 4.99, cost: 1.00, sku: 'BEV-002' },
    { id: PRODUCT_IDS.cappuccino, name: 'Cappuccino', description: 'Espresso with foamed milk', categoryId: CATEGORY_IDS.beverages, price: 4.49, cost: 0.90, sku: 'BEV-003' },
    { id: PRODUCT_IDS.burger, name: 'Classic Burger', description: 'Beef patty with lettuce, tomato, and cheese', categoryId: CATEGORY_IDS.mainDishes, price: 12.99, cost: 4.00, sku: 'MAIN-001' },
    { id: PRODUCT_IDS.pizza, name: 'Margherita Pizza', description: 'Classic pizza with tomato, mozzarella, and basil', categoryId: CATEGORY_IDS.mainDishes, price: 14.99, cost: 4.50, sku: 'MAIN-002' },
    { id: PRODUCT_IDS.pasta, name: 'Spaghetti Carbonara', description: 'Pasta with bacon, egg, and parmesan', categoryId: CATEGORY_IDS.mainDishes, price: 13.99, cost: 3.50, sku: 'MAIN-003' },
    { id: PRODUCT_IDS.salad, name: 'Caesar Salad', description: 'Romaine lettuce with caesar dressing', categoryId: CATEGORY_IDS.appetizers, price: 8.99, cost: 2.00, sku: 'APP-001' },
    { id: PRODUCT_IDS.fries, name: 'French Fries', description: 'Crispy golden fries', categoryId: CATEGORY_IDS.sides, price: 4.99, cost: 1.00, sku: 'SIDE-001' },
    { id: PRODUCT_IDS.cake, name: 'Chocolate Cake', description: 'Rich chocolate layer cake', categoryId: CATEGORY_IDS.desserts, price: 6.99, cost: 2.00, sku: 'DES-001' },
    { id: PRODUCT_IDS.iceCream, name: 'Vanilla Ice Cream', description: 'Creamy vanilla ice cream', categoryId: CATEGORY_IDS.desserts, price: 4.99, cost: 1.50, sku: 'DES-002' },
  ].map(prod => ({
    ...prod,
    isActive: true,
    taxable: true,
    trackInventory: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  await db.collection('products').insertMany(products);
  console.log('  Created products');

  // Create inventory
  const inventory = products.map(prod => ({
    id: uuidv4(),
    productId: prod.id,
    locationId: TEST_LOCATION_ID,
    quantity: Math.floor(Math.random() * 100) + 20,
    lowStockThreshold: 10,
    reorderPoint: 15,
    reorderQuantity: 50,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  await db.collection('inventory').insertMany(inventory);
  console.log('  Created inventory');

  // Create customers
  const customers = [
    { id: CUSTOMER_IDS.john, firstName: 'John', lastName: 'Smith', email: 'john.smith@example.com', phone: '+1111111111' },
    { id: CUSTOMER_IDS.jane, firstName: 'Jane', lastName: 'Doe', email: 'jane.doe@example.com', phone: '+2222222222' },
    { id: CUSTOMER_IDS.bob, firstName: 'Bob', lastName: 'Wilson', email: 'bob.wilson@example.com', phone: '+3333333333' },
  ].map(cust => ({
    ...cust,
    loyaltyPoints: Math.floor(Math.random() * 500),
    totalSpent: Math.floor(Math.random() * 1000),
    visitCount: Math.floor(Math.random() * 20) + 1,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  await db.collection('customers').insertMany(customers);
  console.log('  Created customers');

  // Create sample orders
  const orderStatuses = ['completed', 'completed', 'completed', 'preparing', 'pending'];
  const paymentMethods = ['cash', 'card', 'card', 'card'];

  const orders = [];
  for (let i = 0; i < 15; i++) {
    const orderItems = [
      { productId: PRODUCT_IDS.burger, productName: 'Classic Burger', quantity: 1, unitPrice: 12.99, totalPrice: 12.99 },
      { productId: PRODUCT_IDS.fries, productName: 'French Fries', quantity: 2, unitPrice: 4.99, totalPrice: 9.98 },
      { productId: PRODUCT_IDS.coffee, productName: 'Coffee', quantity: 1, unitPrice: 2.99, totalPrice: 2.99 },
    ];

    const subtotal = orderItems.reduce((sum, item) => sum + item.totalPrice, 0);
    const tax = subtotal * 0.08875;
    const total = subtotal + tax;

    const customerIds = [CUSTOMER_IDS.john, CUSTOMER_IDS.jane, CUSTOMER_IDS.bob, null];
    const customerId = customerIds[Math.floor(Math.random() * customerIds.length)];

    orders.push({
      id: uuidv4(),
      orderNumber: `ORD-${String(1000 + i).padStart(6, '0')}`,
      locationId: TEST_LOCATION_ID,
      customerId,
      items: orderItems,
      subtotal,
      tax,
      discount: 0,
      total,
      status: orderStatuses[Math.floor(Math.random() * orderStatuses.length)],
      paymentMethod: paymentMethods[Math.floor(Math.random() * paymentMethods.length)],
      paymentStatus: 'paid',
      notes: '',
      createdBy: TEST_USER_ID,
      createdAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000), // Random time in last 7 days
      updatedAt: new Date(),
    });
  }

  await db.collection('orders').insertMany(orders);
  console.log('  Created orders');

  // Create indexes
  await db.collection('products').createIndex({ name: 'text', description: 'text' });
  await db.collection('products').createIndex({ categoryId: 1, isActive: 1 });
  await db.collection('orders').createIndex({ orderNumber: 1 }, { unique: true });
  await db.collection('orders').createIndex({ createdAt: -1 });
  await db.collection('orders').createIndex({ locationId: 1, status: 1 });
  await db.collection('inventory').createIndex({ productId: 1, locationId: 1 }, { unique: true });
  await db.collection('customers').createIndex({ email: 1 }, { sparse: true });
  console.log('  Created indexes');

  return { location, categories, products, customers, orders };
}

async function main() {
  console.log('='.repeat(60));
  console.log('ProperPOS Seed Data Script');
  console.log('='.repeat(60));
  console.log('');

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB');
    console.log('');

    await seedPlatformDatabase(client);
    console.log('');

    await seedTenantDatabase(client);
    console.log('');

    console.log('='.repeat(60));
    console.log('Seed data created successfully!');
    console.log('');
    console.log('Demo credentials:');
    console.log(`  Email: ${TEST_USER.email}`);
    console.log(`  Password: ${TEST_USER.password}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('Error seeding data:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
