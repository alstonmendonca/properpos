// ProperPOS Global Test Teardown
module.exports = async function globalTeardown() {
  const instance = globalThis.__MONGOD__;
  if (instance) {
    await instance.stop();
  }
};
