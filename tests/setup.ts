// ProperPOS Test Setup
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import Redis from 'ioredis-mock';

// Global test setup
let mongoServer: MongoMemoryServer;
let mongoClient: MongoClient;

// Mock Redis
jest.mock('ioredis', () => require('ioredis-mock'));

// Setup before all tests
beforeAll(async () => {
  // Start in-memory MongoDB
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();

  // Set environment variables for tests
  process.env.MONGODB_URI = mongoUri;
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';
  process.env.JWT_EXPIRES_IN = '15m';
  process.env.JWT_REFRESH_EXPIRES_IN = '7d';
  process.env.NODE_ENV = 'test';

  // Connect to MongoDB
  mongoClient = new MongoClient(mongoUri);
  await mongoClient.connect();

  // Store in global for access in tests
  (global as any).__MONGO_URI__ = mongoUri;
  (global as any).__MONGO_CLIENT__ = mongoClient;
});

// Cleanup after all tests
afterAll(async () => {
  if (mongoClient) {
    await mongoClient.close();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
});

// Reset database between tests
afterEach(async () => {
  if (mongoClient) {
    const db = mongoClient.db();
    const collections = await db.listCollections().toArray();
    for (const collection of collections) {
      await db.collection(collection.name).deleteMany({});
    }
  }
});

// Global test utilities
export const getTestMongoClient = (): MongoClient => {
  return (global as any).__MONGO_CLIENT__;
};

export const getTestMongoUri = (): string => {
  return (global as any).__MONGO_URI__;
};

// Mock console errors to keep test output clean
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: ReactDOM.render is no longer supported')
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});
