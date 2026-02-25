// Redis connection and utilities

import Redis from 'ioredis';
import { logger, logCache } from '../utils/logger';
import { ApiError } from '../utils/errors';

// Redis configuration interface
interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  retryDelayOnFailover?: number;
  maxRetriesPerRequest?: number;
  lazyConnect?: boolean;
}

// Connection state tracking for circuit breaker pattern
let connectionFailures = 0;
let lastFailureTime: number | null = null;
const MAX_FAILURES = 5;
const FAILURE_RESET_TIME = 60000; // Reset failure count after 1 minute

// Enhanced retry strategy with exponential backoff
const retryStrategy = (times: number): number | null => {
  // Reset failure count if enough time has passed
  if (lastFailureTime && Date.now() - lastFailureTime > FAILURE_RESET_TIME) {
    connectionFailures = 0;
    lastFailureTime = null;
  }

  connectionFailures++;
  lastFailureTime = Date.now();

  // Circuit breaker: stop retrying after too many failures
  if (connectionFailures > MAX_FAILURES) {
    logger.error('Redis circuit breaker triggered - too many connection failures', {
      failures: connectionFailures,
      maxFailures: MAX_FAILURES,
    });
    // Return null to stop retrying (will need manual intervention)
    return null;
  }

  // Exponential backoff with jitter, max 30 seconds
  const baseDelay = Math.min(times * 100, 3000);
  const jitter = Math.random() * 1000;
  const delay = Math.min(baseDelay + jitter, 30000);

  logger.warn(`Redis connection retry ${times} in ${delay}ms`, {
    failures: connectionFailures,
    maxFailures: MAX_FAILURES,
  });

  return delay;
};

// Default Redis configuration with enhanced error handling
const defaultConfig: RedisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
  keyPrefix: process.env.REDIS_PREFIX || 'properpos:',
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
};

// Redis options with retry strategy
const redisOptions = {
  ...defaultConfig,
  retryStrategy,
  reconnectOnError: (err: Error): boolean => {
    const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
    return targetErrors.some(e => err.message.includes(e));
  },
  enableReadyCheck: true,
  connectTimeout: 10000,
  commandTimeout: 5000,
};

// Create Redis instances with enhanced configuration
export const redis = new Redis(redisOptions);
export const redisPub = new Redis({ ...redisOptions, keyPrefix: undefined }); // Publisher without prefix
export const redisSub = new Redis({ ...redisOptions, keyPrefix: undefined }); // Subscriber without prefix

// Setup event handlers for all instances
const setupRedisEventHandlers = (instance: Redis, name: string) => {
  instance.on('connect', () => {
    connectionFailures = 0; // Reset on successful connection
    lastFailureTime = null;
    logger.info(`${name} connected`);
  });

  instance.on('ready', () => {
    logger.info(`${name} ready`);
  });

  instance.on('error', (error) => {
    logger.error(`${name} error:`, {
      message: error.message,
      code: (error as any).code,
      failures: connectionFailures,
    });
  });

  instance.on('close', () => {
    logger.warn(`${name} connection closed`);
  });

  instance.on('reconnecting', (delay: number) => {
    logger.info(`${name} reconnecting...`, { delay });
  });

  instance.on('end', () => {
    logger.warn(`${name} connection ended`);
  });
};

// Setup handlers for all Redis instances
setupRedisEventHandlers(redis, 'Redis');
setupRedisEventHandlers(redisPub, 'Redis Publisher');
setupRedisEventHandlers(redisSub, 'Redis Subscriber');

// Function to reset circuit breaker (useful after manual intervention)
export const resetRedisCircuitBreaker = (): void => {
  connectionFailures = 0;
  lastFailureTime = null;
  logger.info('Redis circuit breaker reset');
};

// Get circuit breaker status
export const getRedisCircuitBreakerStatus = (): {
  failures: number;
  maxFailures: number;
  isOpen: boolean;
  lastFailureTime: number | null;
} => ({
  failures: connectionFailures,
  maxFailures: MAX_FAILURES,
  isOpen: connectionFailures > MAX_FAILURES,
  lastFailureTime,
});

// Cache utility class
export class CacheService {
  private redis: Redis;

  constructor(redisInstance: Redis = redis) {
    this.redis = redisInstance;
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      if (value === null) {
        logCache('miss', key);
        return null;
      }

      logCache('hit', key);
      return JSON.parse(value);
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Set value in cache with optional TTL
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);

      if (ttl) {
        await this.redis.setex(key, ttl, serialized);
      } else {
        await this.redis.set(key, serialized);
      }

      logCache('set', key, { ttl });
    } catch (error) {
      logger.error('Cache set error:', error);
      throw new ApiError('Cache operation failed', 'CACHE_ERROR', 500);
    }
  }

  /**
   * Delete key from cache
   */
  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(key);
      logCache('delete', key);
    } catch (error) {
      logger.error('Cache delete error:', error);
    }
  }

  /**
   * Alias for delete
   */
  async del(key: string): Promise<void> {
    return this.delete(key);
  }

  /**
   * Set with expiration - alias for set with TTL
   */
  async setex<T>(key: string, ttl: number, value: T): Promise<void> {
    return this.set(key, value, ttl);
  }

  /**
   * Ping redis to check connection
   */
  async ping(): Promise<string> {
    return this.redis.ping();
  }

  /**
   * Delete multiple keys
   */
  async deletePattern(pattern: string): Promise<number> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        const deleted = await this.redis.del(...keys);
        logCache('delete', pattern, { count: deleted });
        return deleted;
      }
      return 0;
    } catch (error) {
      logger.error('Cache delete pattern error:', error);
      return 0;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const exists = await this.redis.exists(key);
      return exists === 1;
    } catch (error) {
      logger.error('Cache exists error:', error);
      return false;
    }
  }

  /**
   * Increment counter
   */
  async increment(key: string, ttl?: number): Promise<number> {
    try {
      const value = await this.redis.incr(key);

      if (ttl && value === 1) {
        await this.redis.expire(key, ttl);
      }

      return value;
    } catch (error) {
      logger.error('Cache increment error:', error);
      throw new ApiError('Cache increment failed', 'CACHE_ERROR', 500);
    }
  }

  /**
   * Set expiration on key
   */
  async expire(key: string, seconds: number): Promise<void> {
    try {
      await this.redis.expire(key, seconds);
    } catch (error) {
      logger.error('Cache expire error:', error);
    }
  }

  /**
   * Get remaining TTL for key
   */
  async ttl(key: string): Promise<number> {
    try {
      return await this.redis.ttl(key);
    } catch (error) {
      logger.error('Cache TTL error:', error);
      return -1;
    }
  }

  /**
   * Add item to set
   */
  async addToSet(key: string, value: string): Promise<void> {
    try {
      await this.redis.sadd(key, value);
    } catch (error) {
      logger.error('Cache add to set error:', error);
    }
  }

  /**
   * Remove item from set
   */
  async removeFromSet(key: string, value: string): Promise<void> {
    try {
      await this.redis.srem(key, value);
    } catch (error) {
      logger.error('Cache remove from set error:', error);
    }
  }

  /**
   * Check if item is in set
   */
  async isInSet(key: string, value: string): Promise<boolean> {
    try {
      const result = await this.redis.sismember(key, value);
      return result === 1;
    } catch (error) {
      logger.error('Cache is in set error:', error);
      return false;
    }
  }

  /**
   * Get all members of set
   */
  async getSetMembers(key: string): Promise<string[]> {
    try {
      return await this.redis.smembers(key);
    } catch (error) {
      logger.error('Cache get set members error:', error);
      return [];
    }
  }

  /**
   * Push item to list
   */
  async pushToList(key: string, value: string): Promise<void> {
    try {
      await this.redis.lpush(key, value);
    } catch (error) {
      logger.error('Cache push to list error:', error);
    }
  }

  /**
   * Pop item from list
   */
  async popFromList(key: string): Promise<string | null> {
    try {
      return await this.redis.rpop(key);
    } catch (error) {
      logger.error('Cache pop from list error:', error);
      return null;
    }
  }

  /**
   * Get list length
   */
  async getListLength(key: string): Promise<number> {
    try {
      return await this.redis.llen(key);
    } catch (error) {
      logger.error('Cache get list length error:', error);
      return 0;
    }
  }

  /**
   * Atomic increment with max value
   */
  async incrementWithMax(key: string, max: number, ttl?: number): Promise<number | null> {
    try {
      const pipeline = this.redis.pipeline();
      pipeline.incr(key);
      if (ttl) {
        pipeline.expire(key, ttl);
      }

      const results = await pipeline.exec();
      const value = results?.[0]?.[1] as number;

      if (value > max) {
        await this.redis.del(key);
        return null;
      }

      return value;
    } catch (error) {
      logger.error('Cache increment with max error:', error);
      return null;
    }
  }
}

// Global cache service instance
export const cache = new CacheService();

// Session management utilities
export class SessionService {
  private cache: CacheService;
  private prefix = 'session:';

  constructor(cacheService: CacheService = cache) {
    this.cache = cacheService;
  }

  /**
   * Create user session
   */
  async createSession(userId: string, sessionData: any, ttl: number = 3600): Promise<string> {
    const sessionId = `${userId}:${Date.now()}:${Math.random().toString(36).substr(2)}`;
    const key = `${this.prefix}${sessionId}`;

    const sessionInfo = {
      userId,
      sessionId,
      ...sessionData,
      createdAt: new Date().toISOString(),
    };

    // Store full session with unique ID for session management
    await this.cache.set(key, sessionInfo, ttl);

    // Also store a simple session entry for auth middleware lookup
    // The auth middleware looks for session:{userId}
    const simpleKey = `${this.prefix}${userId}`;
    await this.cache.set(simpleKey, sessionInfo, ttl);

    return sessionId;
  }

  /**
   * Get session data
   */
  async getSession(sessionId: string): Promise<any | null> {
    const key = `${this.prefix}${sessionId}`;
    return await this.cache.get(key);
  }

  /**
   * Update session
   */
  async updateSession(sessionId: string, data: any, ttl?: number): Promise<void> {
    const key = `${this.prefix}${sessionId}`;
    const existingSession = await this.cache.get(key);

    if (existingSession && typeof existingSession === 'object') {
      const updatedData = {
        ...(existingSession as object),
        ...data,
        updatedAt: new Date().toISOString(),
      };

      await this.cache.set(key, updatedData, ttl);
    }
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId: string): Promise<void> {
    const key = `${this.prefix}${sessionId}`;
    await this.cache.delete(key);
  }

  /**
   * Delete all sessions for user
   */
  async deleteUserSessions(userId: string): Promise<number> {
    const pattern = `${this.prefix}${userId}:*`;
    return await this.cache.deletePattern(pattern);
  }

  /**
   * Extend session TTL
   */
  async extendSession(sessionId: string, ttl: number): Promise<void> {
    const key = `${this.prefix}${sessionId}`;
    await this.cache.expire(key, ttl);
  }
}

// Rate limiting utilities
export class RateLimitService {
  private cache: CacheService;
  private prefix = 'ratelimit:';

  constructor(cacheService: CacheService = cache) {
    this.cache = cacheService;
  }

  /**
   * Check rate limit for key
   */
  async checkLimit(key: string, limit: number, window: number): Promise<{
    allowed: boolean;
    current: number;
    remaining: number;
    resetTime: Date;
  }> {
    const cacheKey = `${this.prefix}${key}`;
    const current = await this.cache.increment(cacheKey, window);

    const allowed = current <= limit;
    const remaining = Math.max(0, limit - current);
    const resetTime = new Date(Date.now() + window * 1000);

    return {
      allowed,
      current,
      remaining,
      resetTime,
    };
  }

  /**
   * Reset rate limit for key
   */
  async resetLimit(key: string): Promise<void> {
    const cacheKey = `${this.prefix}${key}`;
    await this.cache.delete(cacheKey);
  }
}

// Lock utilities for distributed locking
export class LockService {
  private redis: Redis;
  private prefix = 'lock:';

  constructor(redisInstance: Redis = redis) {
    this.redis = redisInstance;
  }

  /**
   * Acquire distributed lock
   */
  async acquireLock(key: string, ttl: number = 10, retries: number = 3): Promise<string | null> {
    const lockKey = `${this.prefix}${key}`;
    const lockValue = `${Date.now()}:${Math.random().toString(36).substr(2)}`;

    for (let i = 0; i < retries; i++) {
      try {
        const result = await this.redis.set(lockKey, lockValue, 'PX', ttl * 1000, 'NX');

        if (result === 'OK') {
          logger.debug('Lock acquired', { key, lockValue });
          return lockValue;
        }

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        logger.error('Lock acquisition error:', error);
      }
    }

    logger.warn('Failed to acquire lock', { key, retries });
    return null;
  }

  /**
   * Release distributed lock
   */
  async releaseLock(key: string, lockValue: string): Promise<boolean> {
    const lockKey = `${this.prefix}${key}`;

    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    try {
      const result = await this.redis.eval(script, 1, lockKey, lockValue);
      const released = result === 1;

      if (released) {
        logger.debug('Lock released', { key, lockValue });
      }

      return released;
    } catch (error) {
      logger.error('Lock release error:', error);
      return false;
    }
  }

  /**
   * Execute function with lock
   */
  async withLock<T>(
    key: string,
    fn: () => Promise<T>,
    ttl: number = 10,
    retries: number = 3
  ): Promise<T> {
    const lockValue = await this.acquireLock(key, ttl, retries);

    if (!lockValue) {
      throw new ApiError('Could not acquire lock', 'LOCK_FAILED', 429);
    }

    try {
      return await fn();
    } finally {
      await this.releaseLock(key, lockValue);
    }
  }
}

// Global service instances
export const sessionService = new SessionService();
export const rateLimitService = new RateLimitService();
export const lockService = new LockService();

// Pub/Sub utilities
export class PubSubService {
  private publisher: Redis;
  private subscriber: Redis;
  private eventHandlers: Map<string, Set<Function>> = new Map();

  constructor(pub: Redis = redisPub, sub: Redis = redisSub) {
    this.publisher = pub;
    this.subscriber = sub;

    // Set up message handler
    this.subscriber.on('message', (channel: string, message: string) => {
      this.handleMessage(channel, message);
    });
  }

  /**
   * Publish message to channel
   */
  async publish(channel: string, data: any): Promise<void> {
    try {
      const message = JSON.stringify({
        data,
        timestamp: new Date().toISOString(),
      });

      await this.publisher.publish(channel, message);
      logger.debug('Message published', { channel, data });
    } catch (error) {
      logger.error('Publish error:', error);
    }
  }

  /**
   * Subscribe to channel
   */
  async subscribe(channel: string, handler: Function): Promise<void> {
    try {
      if (!this.eventHandlers.has(channel)) {
        this.eventHandlers.set(channel, new Set());
        await this.subscriber.subscribe(channel);
        logger.debug('Subscribed to channel', { channel });
      }

      this.eventHandlers.get(channel)!.add(handler);
    } catch (error) {
      logger.error('Subscribe error:', error);
    }
  }

  /**
   * Unsubscribe from channel
   */
  async unsubscribe(channel: string, handler?: Function): Promise<void> {
    try {
      const handlers = this.eventHandlers.get(channel);

      if (handlers) {
        if (handler) {
          handlers.delete(handler);

          if (handlers.size === 0) {
            this.eventHandlers.delete(channel);
            await this.subscriber.unsubscribe(channel);
            logger.debug('Unsubscribed from channel', { channel });
          }
        } else {
          // Remove all handlers
          this.eventHandlers.delete(channel);
          await this.subscriber.unsubscribe(channel);
          logger.debug('Unsubscribed from channel', { channel });
        }
      }
    } catch (error) {
      logger.error('Unsubscribe error:', error);
    }
  }

  /**
   * Handle incoming message
   */
  private handleMessage(channel: string, message: string): void {
    try {
      const parsed = JSON.parse(message);
      const handlers = this.eventHandlers.get(channel);

      if (handlers) {
        handlers.forEach(handler => {
          try {
            handler(parsed.data, parsed.timestamp);
          } catch (error) {
            logger.error('Message handler error:', error);
          }
        });
      }
    } catch (error) {
      logger.error('Message parsing error:', error);
    }
  }
}

export const pubsub = new PubSubService();

// Health check function
export const checkRedisHealth = async (): Promise<{
  status: 'healthy' | 'unhealthy';
  details: any;
}> => {
  try {
    const ping = await redis.ping();

    if (ping === 'PONG') {
      return {
        status: 'healthy',
        details: {
          connection: 'active',
          response: ping,
          timestamp: new Date().toISOString(),
        },
      };
    }

    return {
      status: 'unhealthy',
      details: {
        connection: 'failed',
        response: ping,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      details: {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
    };
  }
};

// Redis service wrapper for health checks and common operations
export class RedisService {
  private redis: Redis;
  private cache: CacheService;

  constructor(redisInstance: Redis = redis) {
    this.redis = redisInstance;
    this.cache = new CacheService(redisInstance);
  }

  /**
   * Check Redis health
   */
  async checkHealth(): Promise<{
    status: 'healthy' | 'unhealthy';
    details: any;
  }> {
    return checkRedisHealth();
  }

  /**
   * Ping Redis to verify connection
   */
  async ping(): Promise<string> {
    return this.redis.ping();
  }

  /**
   * Get value from Redis
   */
  async get<T>(key: string): Promise<T | null> {
    return this.cache.get<T>(key);
  }

  /**
   * Set value in Redis with optional TTL
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    return this.cache.set(key, value, ttl);
  }

  /**
   * Delete key from Redis
   */
  async delete(key: string): Promise<void> {
    return this.cache.delete(key);
  }

  /**
   * Check if Redis is connected
   */
  isConnected(): boolean {
    return this.redis.status === 'ready';
  }
}

// Graceful shutdown
export const gracefulShutdown = async (): Promise<void> => {
  logger.info('Shutting down Redis connections...');

  try {
    await Promise.all([
      redis.quit(),
      redisPub.quit(),
      redisSub.quit(),
    ]);

    logger.info('Redis connections closed');
  } catch (error) {
    logger.error('Error closing Redis connections:', error);
  }
};

export default redis;