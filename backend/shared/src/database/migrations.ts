// Database Migration Framework for ProperPOS
// Manages schema versioning and data migrations for MongoDB

import { Db, Collection, MongoClient } from 'mongodb';
import { logger } from '../utils/logger';

export interface Migration {
  version: number;
  name: string;
  description: string;
  up: (db: Db) => Promise<void>;
  down: (db: Db) => Promise<void>;
}

export interface MigrationRecord {
  version: number;
  name: string;
  appliedAt: Date;
  executionTimeMs: number;
  success: boolean;
  error?: string;
}

export interface MigrationStatus {
  currentVersion: number;
  pendingMigrations: number;
  appliedMigrations: MigrationRecord[];
  lastApplied?: MigrationRecord;
}

const MIGRATION_COLLECTION = '_migrations';

/**
 * Migration Manager class
 * Handles database schema versioning and migrations
 */
export class MigrationManager {
  private db: Db;
  private migrations: Map<number, Migration> = new Map();
  private migrationCollection: Collection<MigrationRecord>;

  constructor(db: Db) {
    this.db = db;
    this.migrationCollection = db.collection(MIGRATION_COLLECTION);
  }

  /**
   * Register a migration
   */
  registerMigration(migration: Migration): void {
    if (this.migrations.has(migration.version)) {
      throw new Error(`Migration version ${migration.version} already registered`);
    }
    this.migrations.set(migration.version, migration);
    logger.debug('Migration registered', {
      version: migration.version,
      name: migration.name,
    });
  }

  /**
   * Register multiple migrations
   */
  registerMigrations(migrations: Migration[]): void {
    for (const migration of migrations) {
      this.registerMigration(migration);
    }
  }

  /**
   * Get current database version
   */
  async getCurrentVersion(): Promise<number> {
    const lastMigration = await this.migrationCollection
      .find({ success: true })
      .sort({ version: -1 })
      .limit(1)
      .toArray();

    const first = lastMigration[0];
    return first ? first.version : 0;
  }

  /**
   * Get migration status
   */
  async getStatus(): Promise<MigrationStatus> {
    const currentVersion = await this.getCurrentVersion();
    const appliedMigrations = await this.migrationCollection
      .find({})
      .sort({ version: 1 })
      .toArray();

    const registeredVersions = Array.from(this.migrations.keys()).sort((a, b) => a - b);
    const pendingVersions = registeredVersions.filter((v) => v > currentVersion);

    return {
      currentVersion,
      pendingMigrations: pendingVersions.length,
      appliedMigrations,
      lastApplied: appliedMigrations.length > 0
        ? appliedMigrations[appliedMigrations.length - 1]
        : undefined,
    };
  }

  /**
   * Get pending migrations
   */
  async getPendingMigrations(): Promise<Migration[]> {
    const currentVersion = await this.getCurrentVersion();
    const registeredVersions = Array.from(this.migrations.keys())
      .filter((v) => v > currentVersion)
      .sort((a, b) => a - b);

    return registeredVersions
      .map((v) => this.migrations.get(v))
      .filter((m): m is Migration => m !== undefined);
  }

  /**
   * Run all pending migrations
   */
  async migrate(): Promise<MigrationRecord[]> {
    const pending = await this.getPendingMigrations();
    const results: MigrationRecord[] = [];

    logger.info('Starting migrations', {
      pendingCount: pending.length,
      migrations: pending.map((m) => ({ version: m.version, name: m.name })),
    });

    for (const migration of pending) {
      const result = await this.runMigration(migration, 'up');
      results.push(result);

      if (!result.success) {
        logger.error('Migration failed, stopping migration process', {
          version: migration.version,
          name: migration.name,
          error: result.error,
        });
        break;
      }
    }

    return results;
  }

  /**
   * Run a specific migration
   */
  async runMigration(
    migration: Migration,
    direction: 'up' | 'down'
  ): Promise<MigrationRecord> {
    const startTime = Date.now();
    let success = false;
    let error: string | undefined;

    logger.info(`Running migration ${direction}`, {
      version: migration.version,
      name: migration.name,
      description: migration.description,
    });

    try {
      if (direction === 'up') {
        await migration.up(this.db);
      } else {
        await migration.down(this.db);
      }
      success = true;
      logger.info('Migration completed successfully', {
        version: migration.version,
        name: migration.name,
        direction,
        executionTimeMs: Date.now() - startTime,
      });
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Migration failed', {
        version: migration.version,
        name: migration.name,
        direction,
        error,
        stack: err instanceof Error ? err.stack : undefined,
      });
    }

    const record: MigrationRecord = {
      version: migration.version,
      name: migration.name,
      appliedAt: new Date(),
      executionTimeMs: Date.now() - startTime,
      success,
      error,
    };

    // Record the migration result
    if (direction === 'up') {
      await this.migrationCollection.insertOne(record);
    } else {
      // For rollback, remove the migration record
      await this.migrationCollection.deleteOne({ version: migration.version });
    }

    return record;
  }

  /**
   * Rollback to a specific version
   */
  async rollback(targetVersion: number = 0): Promise<MigrationRecord[]> {
    const currentVersion = await this.getCurrentVersion();
    const results: MigrationRecord[] = [];

    if (targetVersion >= currentVersion) {
      logger.info('No rollback needed', { currentVersion, targetVersion });
      return results;
    }

    // Get migrations to rollback in reverse order
    const versionsToRollback = Array.from(this.migrations.keys())
      .filter((v) => v > targetVersion && v <= currentVersion)
      .sort((a, b) => b - a); // Reverse order

    logger.info('Starting rollback', {
      currentVersion,
      targetVersion,
      migrationsToRollback: versionsToRollback,
    });

    for (const version of versionsToRollback) {
      const migration = this.migrations.get(version);
      if (!migration) {
        logger.warn('Migration not found for rollback', { version });
        continue;
      }

      const result = await this.runMigration(migration, 'down');
      results.push(result);

      if (!result.success) {
        logger.error('Rollback failed, stopping rollback process', {
          version: migration.version,
          name: migration.name,
          error: result.error,
        });
        break;
      }
    }

    return results;
  }

  /**
   * Rollback last migration
   */
  async rollbackLast(): Promise<MigrationRecord | null> {
    const currentVersion = await this.getCurrentVersion();
    if (currentVersion === 0) {
      logger.info('No migrations to rollback');
      return null;
    }

    const migration = this.migrations.get(currentVersion);
    if (!migration) {
      logger.warn('Migration not found for rollback', { version: currentVersion });
      return null;
    }

    return this.runMigration(migration, 'down');
  }

  /**
   * Reset all migrations (dangerous - use with caution)
   */
  async reset(): Promise<MigrationRecord[]> {
    logger.warn('Resetting all migrations');
    return this.rollback(0);
  }

  /**
   * Check if database is up to date
   */
  async isUpToDate(): Promise<boolean> {
    const pending = await this.getPendingMigrations();
    return pending.length === 0;
  }

  /**
   * Get migration by version
   */
  getMigration(version: number): Migration | undefined {
    return this.migrations.get(version);
  }

  /**
   * Get all registered migrations
   */
  getAllMigrations(): Migration[] {
    return Array.from(this.migrations.values()).sort((a, b) => a.version - b.version);
  }
}

/**
 * Create a migration definition
 */
export function createMigration(
  version: number,
  name: string,
  description: string,
  up: (db: Db) => Promise<void>,
  down: (db: Db) => Promise<void>
): Migration {
  return { version, name, description, up, down };
}

/**
 * Platform migrations
 * These run against the platform database
 */
export const PLATFORM_MIGRATIONS: Migration[] = [
  createMigration(
    1,
    'initial_schema',
    'Create initial platform collections and indexes',
    async (db) => {
      // Create users collection with schema validation
      await db.createCollection('users', {
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['email', 'auth'],
            properties: {
              email: { bsonType: 'string' },
              auth: {
                bsonType: 'object',
                required: ['passwordHash'],
                properties: {
                  passwordHash: { bsonType: 'string' },
                },
              },
            },
          },
        },
      });

      // Create tenants collection
      await db.createCollection('tenants');

      // Create tenant_memberships collection
      await db.createCollection('tenant_memberships');

      // Create subscriptions collection
      await db.createCollection('subscriptions');

      logger.info('Created initial platform collections');
    },
    async (db) => {
      await db.collection('users').drop().catch(() => {});
      await db.collection('tenants').drop().catch(() => {});
      await db.collection('tenant_memberships').drop().catch(() => {});
      await db.collection('subscriptions').drop().catch(() => {});
      logger.info('Dropped initial platform collections');
    }
  ),

  createMigration(
    2,
    'add_subscription_addons',
    'Add subscription_addons collection for add-on tracking',
    async (db) => {
      await db.createCollection('subscription_addons');
      await db.collection('subscription_addons').createIndex(
        { tenantId: 1, status: 1 },
        { name: 'addons_tenant_status' }
      );
      logger.info('Created subscription_addons collection');
    },
    async (db) => {
      await db.collection('subscription_addons').drop().catch(() => {});
      logger.info('Dropped subscription_addons collection');
    }
  ),

  createMigration(
    3,
    'add_usage_metrics',
    'Add usage tracking collections for quota management',
    async (db) => {
      await db.createCollection('usage_metrics');
      await db.createCollection('usage_alerts');

      await db.collection('usage_metrics').createIndex(
        { tenantId: 1, period: 1 },
        { unique: true, name: 'usage_tenant_period_unique' }
      );

      await db.collection('usage_alerts').createIndex(
        { tenantId: 1, createdAt: -1 },
        { name: 'alerts_tenant_date' }
      );

      logger.info('Created usage tracking collections');
    },
    async (db) => {
      await db.collection('usage_metrics').drop().catch(() => {});
      await db.collection('usage_alerts').drop().catch(() => {});
      logger.info('Dropped usage tracking collections');
    }
  ),

  createMigration(
    4,
    'add_coupons_collection',
    'Add coupons collection for discount management',
    async (db) => {
      await db.createCollection('coupons');
      await db.collection('coupons').createIndex(
        { code: 1 },
        { unique: true, name: 'coupons_code_unique' }
      );
      await db.collection('coupons').createIndex(
        { isActive: 1, validFrom: 1, validUntil: 1 },
        { name: 'coupons_active_validity' }
      );
      logger.info('Created coupons collection');
    },
    async (db) => {
      await db.collection('coupons').drop().catch(() => {});
      logger.info('Dropped coupons collection');
    }
  ),

  createMigration(
    5,
    'add_failed_payments',
    'Add failed_payments collection for payment retry tracking',
    async (db) => {
      await db.createCollection('failed_payments');
      await db.collection('failed_payments').createIndex(
        { subscriptionId: 1, resolved: 1 },
        { name: 'failed_payments_subscription' }
      );
      await db.collection('failed_payments').createIndex(
        { createdAt: -1 },
        { name: 'failed_payments_date' }
      );
      logger.info('Created failed_payments collection');
    },
    async (db) => {
      await db.collection('failed_payments').drop().catch(() => {});
      logger.info('Dropped failed_payments collection');
    }
  ),
];

/**
 * Tenant migrations
 * These run against individual tenant databases
 */
export const TENANT_MIGRATIONS: Migration[] = [
  createMigration(
    1,
    'initial_tenant_schema',
    'Create initial tenant collections',
    async (db) => {
      await db.createCollection('locations');
      await db.createCollection('products');
      await db.createCollection('categories');
      await db.createCollection('orders');
      await db.createCollection('customers');
      await db.createCollection('inventory');
      await db.createCollection('stock_movements');
      logger.info('Created initial tenant collections');
    },
    async (db) => {
      await db.collection('locations').drop().catch(() => {});
      await db.collection('products').drop().catch(() => {});
      await db.collection('categories').drop().catch(() => {});
      await db.collection('orders').drop().catch(() => {});
      await db.collection('customers').drop().catch(() => {});
      await db.collection('inventory').drop().catch(() => {});
      await db.collection('stock_movements').drop().catch(() => {});
      logger.info('Dropped initial tenant collections');
    }
  ),

  createMigration(
    2,
    'add_analytics_collections',
    'Add analytics aggregation collections',
    async (db) => {
      await db.createCollection('analytics_daily');
      await db.createCollection('analytics_weekly');
      await db.createCollection('analytics_monthly');
      await db.createCollection('analytics_events');

      // Add TTL index for events
      await db.collection('analytics_events').createIndex(
        { createdAt: 1 },
        { expireAfterSeconds: 90 * 24 * 60 * 60, name: 'events_ttl' }
      );

      logger.info('Created analytics collections');
    },
    async (db) => {
      await db.collection('analytics_daily').drop().catch(() => {});
      await db.collection('analytics_weekly').drop().catch(() => {});
      await db.collection('analytics_monthly').drop().catch(() => {});
      await db.collection('analytics_events').drop().catch(() => {});
      logger.info('Dropped analytics collections');
    }
  ),

  createMigration(
    3,
    'add_purchase_orders',
    'Add purchase order and supplier collections',
    async (db) => {
      await db.createCollection('purchase_orders');
      await db.createCollection('suppliers');

      await db.collection('purchase_orders').createIndex(
        { orderNumber: 1 },
        { unique: true, name: 'po_number_unique' }
      );

      await db.collection('suppliers').createIndex(
        { isActive: 1 },
        { name: 'suppliers_active' }
      );

      logger.info('Created purchase order collections');
    },
    async (db) => {
      await db.collection('purchase_orders').drop().catch(() => {});
      await db.collection('suppliers').drop().catch(() => {});
      logger.info('Dropped purchase order collections');
    }
  ),

  createMigration(
    4,
    'add_audit_logs',
    'Add audit logging collection',
    async (db) => {
      await db.createCollection('audit_logs');

      await db.collection('audit_logs').createIndex(
        { 'user.id': 1, timestamp: -1 },
        { name: 'audit_user_date' }
      );

      await db.collection('audit_logs').createIndex(
        { 'event.type': 1, timestamp: -1 },
        { name: 'audit_event_date' }
      );

      // Add TTL index for audit logs (1 year retention)
      await db.collection('audit_logs').createIndex(
        { timestamp: 1 },
        { expireAfterSeconds: 365 * 24 * 60 * 60, name: 'audit_ttl' }
      );

      logger.info('Created audit_logs collection');
    },
    async (db) => {
      await db.collection('audit_logs').drop().catch(() => {});
      logger.info('Dropped audit_logs collection');
    }
  ),

  createMigration(
    5,
    'add_uploaded_files',
    'Add file storage tracking collection',
    async (db) => {
      await db.createCollection('uploaded_files');

      await db.collection('uploaded_files').createIndex(
        { entityType: 1, entityId: 1 },
        { name: 'files_entity' }
      );

      await db.collection('uploaded_files').createIndex(
        { createdAt: -1 },
        { name: 'files_created' }
      );

      logger.info('Created uploaded_files collection');
    },
    async (db) => {
      await db.collection('uploaded_files').drop().catch(() => {});
      logger.info('Dropped uploaded_files collection');
    }
  ),
];

/**
 * Create and initialize migration manager for platform database
 */
export function createPlatformMigrationManager(db: Db): MigrationManager {
  const manager = new MigrationManager(db);
  manager.registerMigrations(PLATFORM_MIGRATIONS);
  return manager;
}

/**
 * Create and initialize migration manager for tenant database
 */
export function createTenantMigrationManager(db: Db): MigrationManager {
  const manager = new MigrationManager(db);
  manager.registerMigrations(TENANT_MIGRATIONS);
  return manager;
}

/**
 * Run migrations on application startup
 */
export async function runStartupMigrations(
  platformDb: Db,
  options?: { autoMigrate?: boolean }
): Promise<{
  platform: MigrationStatus;
  migrationsRun: MigrationRecord[];
}> {
  const { autoMigrate = process.env.AUTO_MIGRATE === 'true' } = options || {};

  const platformManager = createPlatformMigrationManager(platformDb);
  const platformStatus = await platformManager.getStatus();

  logger.info('Platform migration status', {
    currentVersion: platformStatus.currentVersion,
    pendingMigrations: platformStatus.pendingMigrations,
  });

  let migrationsRun: MigrationRecord[] = [];

  if (platformStatus.pendingMigrations > 0) {
    if (autoMigrate) {
      logger.info('Running pending platform migrations');
      migrationsRun = await platformManager.migrate();
    } else {
      logger.warn('Pending migrations found but AUTO_MIGRATE is not enabled', {
        pendingCount: platformStatus.pendingMigrations,
      });
    }
  }

  return {
    platform: await platformManager.getStatus(),
    migrationsRun,
  };
}
