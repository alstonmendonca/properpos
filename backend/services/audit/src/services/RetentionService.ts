// Retention Service for Audit Log Cleanup

import { logger, getPlatformDatabase, getTenantDatabase } from '@properpos/backend-shared';

interface RetentionPolicy {
  tenantId: string;
  retentionDays: number;
  archiveEnabled: boolean;
  archiveDestination?: string;
}

interface CleanupResult {
  tenantId: string;
  deletedCount: number;
  archivedCount: number;
  error?: string;
}

export class RetentionService {
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly defaultRetentionDays: number;
  private readonly cleanupIntervalMs: number;

  constructor() {
    this.defaultRetentionDays = parseInt(process.env.AUDIT_RETENTION_DAYS || '90');
    this.cleanupIntervalMs = parseInt(process.env.AUDIT_CLEANUP_INTERVAL_MS || '86400000'); // 24 hours
  }

  start(): void {
    logger.info('Starting audit retention service', {
      defaultRetentionDays: this.defaultRetentionDays,
      cleanupIntervalMs: this.cleanupIntervalMs,
    });

    // Run initial cleanup after 1 minute
    setTimeout(() => {
      this.runCleanup();
    }, 60000);

    // Schedule regular cleanup
    this.cleanupInterval = setInterval(() => {
      this.runCleanup();
    }, this.cleanupIntervalMs);
  }

  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('Audit retention service stopped');
    }
  }

  async runCleanup(): Promise<CleanupResult[]> {
    logger.info('Starting audit log cleanup');
    const results: CleanupResult[] = [];

    try {
      // Get all tenants
      const tenants = await this.getTenants();

      for (const tenant of tenants) {
        try {
          const result = await this.cleanupTenant(tenant);
          results.push(result);
        } catch (error) {
          logger.error('Error cleaning up tenant audit logs', {
            tenantId: tenant.id,
            error,
          });
          results.push({
            tenantId: tenant.id,
            deletedCount: 0,
            archivedCount: 0,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Cleanup platform-level logs
      const platformResult = await this.cleanupPlatformLogs();
      results.push(platformResult);

      logger.info('Audit log cleanup completed', {
        tenantsProcessed: results.length,
        totalDeleted: results.reduce((sum, r) => sum + r.deletedCount, 0),
        totalArchived: results.reduce((sum, r) => sum + r.archivedCount, 0),
      });
    } catch (error) {
      logger.error('Error during audit log cleanup', { error });
    }

    return results;
  }

  private async getTenants(): Promise<Array<{ id: string; retentionDays?: number }>> {
    const organizations = await getPlatformDatabase()
      .collection('organizations')
      .find({ isActive: true })
      .project({ id: 1, 'settings.auditRetentionDays': 1 })
      .toArray();

    return organizations.map((org: any) => ({
      id: org.id,
      retentionDays: org.settings?.auditRetentionDays,
    }));
  }

  private async cleanupTenant(tenant: { id: string; retentionDays?: number }): Promise<CleanupResult> {
    const retentionDays = tenant.retentionDays || this.defaultRetentionDays;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const db = await getTenantDatabase(tenant.id);
    const collection = db.collection('audit_logs');

    // Check if archiving is enabled for this tenant
    const policy = await this.getRetentionPolicy(tenant.id);

    let archivedCount = 0;
    if (policy?.archiveEnabled) {
      archivedCount = await this.archiveLogs(tenant.id, cutoffDate);
    }

    // Delete old logs
    const result = await collection.deleteMany({
      tenantId: tenant.id,
      timestamp: { $lt: cutoffDate },
    });

    logger.debug('Tenant audit logs cleaned up', {
      tenantId: tenant.id,
      retentionDays,
      cutoffDate,
      deletedCount: result.deletedCount,
      archivedCount,
    });

    return {
      tenantId: tenant.id,
      deletedCount: result.deletedCount,
      archivedCount,
    };
  }

  private async cleanupPlatformLogs(): Promise<CleanupResult> {
    const retentionDays = this.defaultRetentionDays;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await getPlatformDatabase().collection('audit_logs').deleteMany({
      tenantId: { $exists: false },
      timestamp: { $lt: cutoffDate },
    });

    return {
      tenantId: 'platform',
      deletedCount: result.deletedCount,
      archivedCount: 0,
    };
  }

  private async getRetentionPolicy(tenantId: string): Promise<RetentionPolicy | null> {
    const org = await getPlatformDatabase().collection('organizations').findOne({
      id: tenantId,
    });

    if (!org?.settings?.auditRetention) {
      return null;
    }

    return {
      tenantId,
      retentionDays: org.settings.auditRetention.days || this.defaultRetentionDays,
      archiveEnabled: org.settings.auditRetention.archiveEnabled || false,
      archiveDestination: org.settings.auditRetention.archiveDestination,
    };
  }

  private async archiveLogs(tenantId: string, beforeDate: Date): Promise<number> {
    const db = await getTenantDatabase(tenantId);
    const collection = db.collection('audit_logs');
    const archiveCollection = db.collection('audit_logs_archive');

    // Find logs to archive
    const logsToArchive = await collection
      .find({
        tenantId,
        timestamp: { $lt: beforeDate },
      })
      .toArray();

    if (logsToArchive.length === 0) {
      return 0;
    }

    // Insert into archive collection
    await archiveCollection.insertMany(
      logsToArchive.map((log: any) => ({
        ...log,
        archivedAt: new Date(),
      }))
    );

    logger.debug('Audit logs archived', {
      tenantId,
      count: logsToArchive.length,
    });

    return logsToArchive.length;
  }

  // Manual cleanup for a specific tenant
  async cleanupTenantManual(
    tenantId: string,
    retentionDays?: number
  ): Promise<CleanupResult> {
    const days = retentionDays || this.defaultRetentionDays;

    return this.cleanupTenant({ id: tenantId, retentionDays: days });
  }

  // Update retention policy for a tenant
  async updateRetentionPolicy(
    tenantId: string,
    policy: Partial<RetentionPolicy>
  ): Promise<void> {
    await getPlatformDatabase().collection('organizations').updateOne(
      { id: tenantId },
      {
        $set: {
          'settings.auditRetention': {
            days: policy.retentionDays || this.defaultRetentionDays,
            archiveEnabled: policy.archiveEnabled || false,
            archiveDestination: policy.archiveDestination,
          },
        },
      }
    );

    logger.info('Retention policy updated', {
      tenantId,
      policy,
    });
  }

  // Get retention stats for a tenant
  async getRetentionStats(tenantId: string): Promise<{
    totalLogs: number;
    oldestLog: Date | null;
    newestLog: Date | null;
    logsToBeDeleted: number;
    policy: RetentionPolicy | null;
  }> {
    const db = await getTenantDatabase(tenantId);
    const collection = db.collection('audit_logs');

    const policy = await this.getRetentionPolicy(tenantId);
    const retentionDays = policy?.retentionDays || this.defaultRetentionDays;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const [totalLogs, oldestLog, newestLog, logsToBeDeleted] = await Promise.all([
      collection.countDocuments({ tenantId }),
      collection.findOne({ tenantId }, { sort: { timestamp: 1 }, projection: { timestamp: 1 } }),
      collection.findOne({ tenantId }, { sort: { timestamp: -1 }, projection: { timestamp: 1 } }),
      collection.countDocuments({ tenantId, timestamp: { $lt: cutoffDate } }),
    ]);

    return {
      totalLogs,
      oldestLog: oldestLog?.timestamp || null,
      newestLog: newestLog?.timestamp || null,
      logsToBeDeleted,
      policy,
    };
  }
}
