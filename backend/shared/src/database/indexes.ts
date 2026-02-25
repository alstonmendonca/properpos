// Database index definitions and creation for ProperPOS

import { Db } from 'mongodb';
import { logger } from '../utils/logger';

export interface IndexDefinition {
  collection: string;
  indexes: Array<{
    keys: Record<string, 1 | -1 | 'text'>;
    options?: {
      unique?: boolean;
      sparse?: boolean;
      expireAfterSeconds?: number;
      name?: string;
      background?: boolean;
      partialFilterExpression?: Record<string, any>;
    };
  }>;
}

// Platform database indexes (shared across all tenants)
export const PLATFORM_INDEXES: IndexDefinition[] = [
  {
    collection: 'users',
    indexes: [
      { keys: { email: 1 }, options: { unique: true, name: 'users_email_unique' } },
      { keys: { 'auth.emailVerificationToken': 1 }, options: { sparse: true, name: 'users_verification_token' } },
      { keys: { 'auth.passwordResetToken': 1 }, options: { sparse: true, name: 'users_reset_token' } },
      { keys: { globalRole: 1 }, options: { name: 'users_global_role' } },
      { keys: { createdAt: -1 }, options: { name: 'users_created_at' } },
    ],
  },
  {
    collection: 'tenants',
    indexes: [
      { keys: { id: 1 }, options: { unique: true, name: 'tenants_id_unique' } },
      { keys: { slug: 1 }, options: { unique: true, name: 'tenants_slug_unique' } },
      { keys: { isActive: 1 }, options: { name: 'tenants_active' } },
      { keys: { 'billing.stripeCustomerId': 1 }, options: { sparse: true, name: 'tenants_stripe_customer' } },
      { keys: { createdAt: -1 }, options: { name: 'tenants_created_at' } },
    ],
  },
  {
    collection: 'tenant_memberships',
    indexes: [
      { keys: { tenantId: 1, userId: 1 }, options: { unique: true, name: 'memberships_tenant_user_unique' } },
      { keys: { userId: 1 }, options: { name: 'memberships_user' } },
      { keys: { tenantId: 1, status: 1 }, options: { name: 'memberships_tenant_status' } },
    ],
  },
  {
    collection: 'subscriptions',
    indexes: [
      { keys: { tenantId: 1 }, options: { unique: true, name: 'subscriptions_tenant_unique' } },
      { keys: { stripeSubscriptionId: 1 }, options: { sparse: true, name: 'subscriptions_stripe' } },
      { keys: { status: 1 }, options: { name: 'subscriptions_status' } },
      { keys: { nextBillingDate: 1 }, options: { name: 'subscriptions_next_billing' } },
      { keys: { trialEndDate: 1 }, options: { sparse: true, name: 'subscriptions_trial_end' } },
    ],
  },
  {
    collection: 'subscription_plans',
    indexes: [
      { keys: { id: 1 }, options: { unique: true, name: 'plans_id_unique' } },
      { keys: { slug: 1 }, options: { unique: true, name: 'plans_slug_unique' } },
      { keys: { isActive: 1, isPublic: 1 }, options: { name: 'plans_active_public' } },
    ],
  },
  {
    collection: 'subscription_addons',
    indexes: [
      { keys: { tenantId: 1, status: 1 }, options: { name: 'addons_tenant_status' } },
      { keys: { subscriptionId: 1 }, options: { name: 'addons_subscription' } },
    ],
  },
  {
    collection: 'invoices',
    indexes: [
      { keys: { tenantId: 1, createdAt: -1 }, options: { name: 'invoices_tenant_date' } },
      { keys: { invoiceNumber: 1 }, options: { unique: true, name: 'invoices_number_unique' } },
      { keys: { status: 1 }, options: { name: 'invoices_status' } },
      { keys: { stripeInvoiceId: 1 }, options: { sparse: true, name: 'invoices_stripe' } },
    ],
  },
  {
    collection: 'coupons',
    indexes: [
      { keys: { code: 1 }, options: { unique: true, name: 'coupons_code_unique' } },
      { keys: { isActive: 1 }, options: { name: 'coupons_active' } },
      { keys: { validFrom: 1, validUntil: 1 }, options: { name: 'coupons_validity' } },
    ],
  },
  {
    collection: 'failed_payments',
    indexes: [
      { keys: { subscriptionId: 1, resolved: 1 }, options: { name: 'failed_payments_subscription' } },
      { keys: { createdAt: -1 }, options: { name: 'failed_payments_date' } },
    ],
  },
  {
    collection: 'usage_metrics',
    indexes: [
      { keys: { tenantId: 1, period: 1 }, options: { unique: true, name: 'usage_tenant_period_unique' } },
      { keys: { updatedAt: -1 }, options: { name: 'usage_updated' } },
    ],
  },
  {
    collection: 'usage_alerts',
    indexes: [
      { keys: { tenantId: 1, notified: 1 }, options: { name: 'alerts_tenant_notified' } },
      { keys: { createdAt: -1 }, options: { name: 'alerts_created' } },
    ],
  },
];

// Tenant database indexes (per-tenant collections)
export const TENANT_INDEXES: IndexDefinition[] = [
  {
    collection: 'locations',
    indexes: [
      { keys: { id: 1 }, options: { unique: true, name: 'locations_id_unique' } },
      { keys: { isActive: 1 }, options: { name: 'locations_active' } },
    ],
  },
  {
    collection: 'products',
    indexes: [
      { keys: { id: 1 }, options: { unique: true, name: 'products_id_unique' } },
      { keys: { sku: 1 }, options: { unique: true, sparse: true, name: 'products_sku_unique' } },
      { keys: { barcode: 1 }, options: { sparse: true, name: 'products_barcode' } },
      { keys: { 'category.id': 1 }, options: { name: 'products_category' } },
      { keys: { isActive: 1 }, options: { name: 'products_active' } },
      { keys: { name: 'text', description: 'text' }, options: { name: 'products_text_search' } },
      { keys: { createdAt: -1 }, options: { name: 'products_created' } },
      { keys: { 'analytics.lastSoldAt': -1 }, options: { sparse: true, name: 'products_last_sold' } },
    ],
  },
  {
    collection: 'categories',
    indexes: [
      { keys: { id: 1 }, options: { unique: true, name: 'categories_id_unique' } },
      { keys: { parentId: 1 }, options: { sparse: true, name: 'categories_parent' } },
      { keys: { 'settings.isActive': 1, 'display.sortOrder': 1 }, options: { name: 'categories_active_sort' } },
    ],
  },
  {
    collection: 'orders',
    indexes: [
      { keys: { id: 1 }, options: { unique: true, name: 'orders_id_unique' } },
      { keys: { orderNumber: 1 }, options: { unique: true, name: 'orders_number_unique' } },
      { keys: { locationId: 1, createdAt: -1 }, options: { name: 'orders_location_date' } },
      { keys: { status: 1 }, options: { name: 'orders_status' } },
      { keys: { 'customer.id': 1 }, options: { sparse: true, name: 'orders_customer' } },
      { keys: { cashierId: 1 }, options: { name: 'orders_cashier' } },
      { keys: { createdAt: -1 }, options: { name: 'orders_created' } },
      { keys: { 'payment.status': 1 }, options: { name: 'orders_payment_status' } },
      { keys: { orderType: 1, status: 1 }, options: { name: 'orders_type_status' } },
    ],
  },
  {
    collection: 'customers',
    indexes: [
      { keys: { id: 1 }, options: { unique: true, name: 'customers_id_unique' } },
      { keys: { 'personalInfo.email': 1 }, options: { unique: true, sparse: true, name: 'customers_email_unique' } },
      { keys: { 'personalInfo.phone': 1 }, options: { sparse: true, name: 'customers_phone' } },
      { keys: { status: 1 }, options: { name: 'customers_status' } },
      { keys: { 'loyalty.tier': 1 }, options: { name: 'customers_loyalty_tier' } },
      { keys: { lastVisit: -1 }, options: { name: 'customers_last_visit' } },
      { keys: { 'personalInfo.firstName': 'text', 'personalInfo.lastName': 'text', 'personalInfo.email': 'text' }, options: { name: 'customers_text_search' } },
    ],
  },
  {
    collection: 'inventory',
    indexes: [
      { keys: { productId: 1, locationId: 1 }, options: { unique: true, name: 'inventory_product_location_unique' } },
      { keys: { locationId: 1 }, options: { name: 'inventory_location' } },
      { keys: { quantity: 1, reorderLevel: 1 }, options: { name: 'inventory_low_stock' } },
    ],
  },
  {
    collection: 'stock_movements',
    indexes: [
      { keys: { productId: 1, createdAt: -1 }, options: { name: 'movements_product_date' } },
      { keys: { locationId: 1, createdAt: -1 }, options: { name: 'movements_location_date' } },
      { keys: { type: 1 }, options: { name: 'movements_type' } },
      { keys: { 'reference.type': 1, 'reference.id': 1 }, options: { name: 'movements_reference' } },
      { keys: { createdAt: -1 }, options: { name: 'movements_created' } },
    ],
  },
  {
    collection: 'purchase_orders',
    indexes: [
      { keys: { id: 1 }, options: { unique: true, name: 'po_id_unique' } },
      { keys: { orderNumber: 1 }, options: { unique: true, name: 'po_number_unique' } },
      { keys: { supplierId: 1 }, options: { name: 'po_supplier' } },
      { keys: { status: 1 }, options: { name: 'po_status' } },
      { keys: { expectedDate: 1 }, options: { name: 'po_expected_date' } },
    ],
  },
  {
    collection: 'suppliers',
    indexes: [
      { keys: { id: 1 }, options: { unique: true, name: 'suppliers_id_unique' } },
      { keys: { isActive: 1 }, options: { name: 'suppliers_active' } },
      { keys: { name: 'text' }, options: { name: 'suppliers_text_search' } },
    ],
  },
  {
    collection: 'receipts',
    indexes: [
      { keys: { orderId: 1 }, options: { name: 'receipts_order' } },
      { keys: { createdAt: -1 }, options: { name: 'receipts_created' } },
    ],
  },
  {
    collection: 'analytics_daily',
    indexes: [
      { keys: { locationId: 1, dateString: 1 }, options: { unique: true, name: 'daily_location_date_unique' } },
      { keys: { dateString: 1 }, options: { name: 'daily_date' } },
      { keys: { date: -1 }, options: { name: 'daily_date_desc' } },
    ],
  },
  {
    collection: 'analytics_weekly',
    indexes: [
      { keys: { locationId: 1, year: 1, weekNumber: 1 }, options: { unique: true, name: 'weekly_location_week_unique' } },
      { keys: { year: 1, weekNumber: 1 }, options: { name: 'weekly_year_week' } },
    ],
  },
  {
    collection: 'analytics_monthly',
    indexes: [
      { keys: { locationId: 1, year: 1, month: 1 }, options: { unique: true, name: 'monthly_location_month_unique' } },
      { keys: { year: 1, month: 1 }, options: { name: 'monthly_year_month' } },
    ],
  },
  {
    collection: 'analytics_events',
    indexes: [
      { keys: { eventType: 1, createdAt: -1 }, options: { name: 'events_type_date' } },
      { keys: { createdAt: -1 }, options: { name: 'events_created' } },
      { keys: { createdAt: 1 }, options: { expireAfterSeconds: 90 * 24 * 60 * 60, name: 'events_ttl' } }, // 90 day TTL
    ],
  },
  {
    collection: 'audit_logs',
    indexes: [
      { keys: { 'user.id': 1, timestamp: -1 }, options: { name: 'audit_user_date' } },
      { keys: { 'event.type': 1, timestamp: -1 }, options: { name: 'audit_event_date' } },
      { keys: { 'event.resource': 1, 'event.resourceId': 1 }, options: { name: 'audit_resource' } },
      { keys: { timestamp: -1 }, options: { name: 'audit_timestamp' } },
      { keys: { timestamp: 1 }, options: { expireAfterSeconds: 365 * 24 * 60 * 60, name: 'audit_ttl' } }, // 1 year TTL
    ],
  },
  {
    collection: 'uploaded_files',
    indexes: [
      { keys: { id: 1 }, options: { unique: true, name: 'files_id_unique' } },
      { keys: { entityType: 1, entityId: 1 }, options: { name: 'files_entity' } },
      { keys: { createdAt: -1 }, options: { name: 'files_created' } },
    ],
  },
];

/**
 * Create indexes for a database
 */
export async function createIndexes(db: Db, indexDefinitions: IndexDefinition[]): Promise<void> {
  for (const definition of indexDefinitions) {
    const collection = db.collection(definition.collection);

    for (const index of definition.indexes) {
      try {
        await collection.createIndex(index.keys, {
          ...index.options,
          background: true,
        });

        logger.debug('Index created', {
          collection: definition.collection,
          index: index.options?.name || JSON.stringify(index.keys),
        });
      } catch (error) {
        // Index might already exist, log and continue
        if ((error as any).code === 85 || (error as any).code === 86) {
          logger.debug('Index already exists', {
            collection: definition.collection,
            index: index.options?.name || JSON.stringify(index.keys),
          });
        } else {
          logger.error('Failed to create index', {
            collection: definition.collection,
            index: index.options?.name || JSON.stringify(index.keys),
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }
  }
}

/**
 * Create all platform indexes
 */
export async function createPlatformIndexes(db: Db): Promise<void> {
  logger.info('Creating platform database indexes...');
  await createIndexes(db, PLATFORM_INDEXES);
  logger.info('Platform database indexes created');
}

/**
 * Create all tenant indexes
 */
export async function createTenantIndexes(db: Db): Promise<void> {
  logger.info('Creating tenant database indexes...');
  await createIndexes(db, TENANT_INDEXES);
  logger.info('Tenant database indexes created');
}

/**
 * List all indexes in a database
 */
export async function listIndexes(db: Db): Promise<Record<string, any[]>> {
  const collections = await db.listCollections().toArray();
  const result: Record<string, any[]> = {};

  for (const col of collections) {
    try {
      const indexes = await db.collection(col.name).indexes();
      result[col.name] = indexes;
    } catch (error) {
      logger.warn('Failed to list indexes for collection', {
        collection: col.name,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return result;
}

/**
 * Drop all indexes except _id
 */
export async function dropAllIndexes(db: Db): Promise<void> {
  const collections = await db.listCollections().toArray();

  for (const col of collections) {
    try {
      await db.collection(col.name).dropIndexes();
      logger.debug('Dropped indexes for collection', { collection: col.name });
    } catch (error) {
      logger.warn('Failed to drop indexes for collection', {
        collection: col.name,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
