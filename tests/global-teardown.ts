// ProperPOS Global Test Teardown
import { MongoMemoryServer } from 'mongodb-memory-server';

export default async function globalTeardown() {
  const instance: MongoMemoryServer = (global as any).__MONGOD__;
  if (instance) {
    await instance.stop();
  }
  console.log('🧪 Test environment cleaned up');
}
