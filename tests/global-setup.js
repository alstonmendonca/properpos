// ProperPOS Global Test Setup
const { MongoMemoryServer } = require('mongodb-memory-server');

module.exports = async function globalSetup() {
  const instance = await MongoMemoryServer.create();
  const uri = instance.getUri();

  globalThis.__MONGOD__ = instance;
  process.env.MONGODB_URI = uri;
};
