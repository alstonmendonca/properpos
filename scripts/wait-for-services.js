#!/usr/bin/env node

/**
 * Wait for all ProperPOS services to be healthy
 * Used in CI/CD and local development
 */

const http = require('http');
const https = require('https');

const services = [
  { name: 'Gateway', url: 'http://localhost:3000/health' },
  { name: 'Auth', url: 'http://localhost:3001/health' },
  { name: 'Tenant', url: 'http://localhost:3002/health' },
  { name: 'POS', url: 'http://localhost:3003/health' },
  { name: 'Inventory', url: 'http://localhost:3004/health' },
  { name: 'Analytics', url: 'http://localhost:3005/health' },
  { name: 'Billing', url: 'http://localhost:3006/health' },
  { name: 'Notification', url: 'http://localhost:3008/health' },
  { name: 'Audit', url: 'http://localhost:3009/health' },
  { name: 'Frontend', url: 'http://localhost:8080' },
];

const MAX_RETRIES = 60;
const RETRY_INTERVAL = 2000; // 2 seconds

function checkService(service) {
  return new Promise((resolve) => {
    const protocol = service.url.startsWith('https') ? https : http;

    const req = protocol.get(service.url, { timeout: 5000 }, (res) => {
      resolve(res.statusCode === 200);
    });

    req.on('error', () => {
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForService(service, retries = 0) {
  const isHealthy = await checkService(service);

  if (isHealthy) {
    console.log(`✅ ${service.name} is healthy`);
    return true;
  }

  if (retries >= MAX_RETRIES) {
    console.log(`❌ ${service.name} failed to start after ${MAX_RETRIES} retries`);
    return false;
  }

  process.stdout.write(`⏳ Waiting for ${service.name}... (${retries + 1}/${MAX_RETRIES})\r`);
  await new Promise((resolve) => setTimeout(resolve, RETRY_INTERVAL));
  return waitForService(service, retries + 1);
}

async function main() {
  console.log('🚀 Waiting for ProperPOS services to be healthy...\n');

  const startTime = Date.now();
  const results = await Promise.all(services.map((s) => waitForService(s)));

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const allHealthy = results.every((r) => r);

  console.log('\n');

  if (allHealthy) {
    console.log(`✅ All services are healthy! (${duration}s)`);
    process.exit(0);
  } else {
    console.log(`❌ Some services failed to start (${duration}s)`);
    process.exit(1);
  }
}

main();
