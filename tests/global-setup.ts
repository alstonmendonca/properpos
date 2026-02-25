// ProperPOS Global Test Setup
import { MongoMemoryServer } from 'mongodb-memory-server';

export default async function globalSetup() {
  // Create MongoDB memory server instance
  const instance = await MongoMemoryServer.create();
  const uri = instance.getUri();

  // Store the instance URI for tests
  (global as any).__MONGOD__ = instance;
  process.env.MONGODB_URI = uri;

  console.log('🧪 Test environment initialized');
  console.log(`   MongoDB: ${uri}`);
}
