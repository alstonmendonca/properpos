// Main Audit Log Service

import { v4 as uuidv4 } from 'uuid';
import { logger, getPlatformDatabase, getTenantDatabase, cache } from '@properpos/backend-shared';

interface AuditLogEvent {
  type: string;
  category: 'authentication' | 'order' | 'inventory' | 'user_management' | 'system' | 'billing' | 'settings';
  action: 'create' | 'read' | 'update' | 'delete';
  resource: string;
  resourceId?: string;
}

interface AuditLogUser {
  id: string;
  email: string;
  role: string;
  locationId?: string;
}

interface AuditLogRequest {
  ipAddress: string;
  userAgent: string;
  method: string;
  endpoint: string;
  sessionId?: string;
}

interface AuditLogChanges {
  before?: Record<string, any>;
  after?: Record<string, any>;
}

interface AuditLog {
  id: string;
  tenantId?: string;
  event: AuditLogEvent;
  user: AuditLogUser;
  request: AuditLogRequest;
  changes?: AuditLogChanges;
  metadata?: Record<string, any>;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
}

interface CreateAuditLogData {
  tenantId?: string;
  event: AuditLogEvent;
  user: AuditLogUser;
  request: Partial<AuditLogRequest>;
  changes?: AuditLogChanges;
  metadata?: Record<string, any>;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

interface AuditLogFilters {
  tenantId: string;
  category?: string;
  action?: string;
  severity?: string;
  userId?: string;
  resource?: string;
  resourceId?: string;
  from?: Date;
  to?: Date;
}

export class AuditLogService {
  // Determine severity based on event type
  private determineSeverity(event: AuditLogEvent): 'low' | 'medium' | 'high' | 'critical' {
    // Critical events
    if (
      event.type.includes('login_failed') ||
      event.type.includes('password_changed') ||
      event.type.includes('mfa') ||
      event.type.includes('subscription') ||
      event.type.includes('payment_failed') ||
      event.category === 'authentication' && event.action === 'delete'
    ) {
      return 'high';
    }

    // High severity
    if (
      event.action === 'delete' ||
      event.type.includes('refund') ||
      event.type.includes('adjustment') ||
      event.category === 'user_management'
    ) {
      return 'medium';
    }

    // Read operations are low severity
    if (event.action === 'read') {
      return 'low';
    }

    return 'medium';
  }

  async create(data: CreateAuditLogData): Promise<AuditLog> {
    const auditLog: AuditLog = {
      id: uuidv4(),
      tenantId: data.tenantId,
      event: data.event,
      user: data.user,
      request: {
        ipAddress: data.request.ipAddress || 'unknown',
        userAgent: data.request.userAgent || 'unknown',
        method: data.request.method || 'unknown',
        endpoint: data.request.endpoint || 'unknown',
        sessionId: data.request.sessionId,
      },
      changes: data.changes,
      metadata: data.metadata,
      severity: data.severity || this.determineSeverity(data.event),
      timestamp: new Date(),
    };

    // Store in tenant-specific audit database if tenantId is provided
    if (data.tenantId) {
      const db = await this.getAuditDB(data.tenantId);
      await db.collection('audit_logs').insertOne(auditLog);
    } else {
      // Platform-level audit logs
      await getPlatformDatabase().collection('audit_logs').insertOne(auditLog);
    }

    logger.audit(`${auditLog.event.type}`, {
      auditLogId: auditLog.id,
      tenantId: auditLog.tenantId,
      category: auditLog.event.category,
      action: auditLog.event.action,
      resource: auditLog.event.resource,
      resourceId: auditLog.event.resourceId,
      userId: auditLog.user.id,
      severity: auditLog.severity,
    });

    return auditLog;
  }

  private async getAuditDB(tenantId: string) {
    // Get tenant-specific audit database
    // In production, this would be a separate database per tenant
    return await getTenantDatabase(tenantId);
  }

  async list(
    filters: AuditLogFilters,
    page: number = 1,
    limit: number = 20,
    sortBy: string = 'timestamp',
    sortOrder: string = 'desc'
  ): Promise<{ logs: AuditLog[]; total: number }> {
    const db = await this.getAuditDB(filters.tenantId);
    const collection = db.collection('audit_logs');

    const query = this.buildQuery(filters);
    const skip = (page - 1) * limit;
    const sort: any = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [logs, total] = await Promise.all([
      collection.find(query).sort(sort).skip(skip).limit(limit).toArray(),
      collection.countDocuments(query),
    ]);

    return {
      logs: logs as unknown as AuditLog[],
      total,
    };
  }

  private buildQuery(filters: AuditLogFilters): any {
    const query: any = { tenantId: filters.tenantId };

    if (filters.category) query['event.category'] = filters.category;
    if (filters.action) query['event.action'] = filters.action;
    if (filters.severity) query.severity = filters.severity;
    if (filters.userId) query['user.id'] = filters.userId;
    if (filters.resource) query['event.resource'] = filters.resource;
    if (filters.resourceId) query['event.resourceId'] = filters.resourceId;

    if (filters.from || filters.to) {
      query.timestamp = {};
      if (filters.from) query.timestamp.$gte = filters.from;
      if (filters.to) query.timestamp.$lte = filters.to;
    }

    return query;
  }

  async getById(id: string, tenantId: string): Promise<AuditLog | null> {
    const db = await this.getAuditDB(tenantId);
    const collection = db.collection('audit_logs');

    const log = await collection.findOne({ id, tenantId });
    return log as unknown as AuditLog | null;
  }

  async getByResource(
    tenantId: string,
    resource: string,
    resourceId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{ logs: AuditLog[]; total: number }> {
    const db = await this.getAuditDB(tenantId);
    const collection = db.collection('audit_logs');

    const query = {
      tenantId,
      'event.resource': resource,
      'event.resourceId': resourceId,
    };

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      collection.find(query).sort({ timestamp: -1 }).skip(skip).limit(limit).toArray(),
      collection.countDocuments(query),
    ]);

    return {
      logs: logs as unknown as AuditLog[],
      total,
    };
  }

  async getByUser(
    filters: { tenantId: string; userId: string; from?: Date; to?: Date },
    page: number = 1,
    limit: number = 20
  ): Promise<{ logs: AuditLog[]; total: number }> {
    const db = await this.getAuditDB(filters.tenantId);
    const collection = db.collection('audit_logs');

    const query: any = {
      tenantId: filters.tenantId,
      'user.id': filters.userId,
    };

    if (filters.from || filters.to) {
      query.timestamp = {};
      if (filters.from) query.timestamp.$gte = filters.from;
      if (filters.to) query.timestamp.$lte = filters.to;
    }

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      collection.find(query).sort({ timestamp: -1 }).skip(skip).limit(limit).toArray(),
      collection.countDocuments(query),
    ]);

    return {
      logs: logs as unknown as AuditLog[],
      total,
    };
  }

  async getStats(filters: { tenantId: string; from?: Date; to?: Date }): Promise<any> {
    const db = await this.getAuditDB(filters.tenantId);
    const collection = db.collection('audit_logs');

    const matchStage: any = { tenantId: filters.tenantId };
    if (filters.from || filters.to) {
      matchStage.timestamp = {};
      if (filters.from) matchStage.timestamp.$gte = filters.from;
      if (filters.to) matchStage.timestamp.$lte = filters.to;
    }

    const [
      totalLogs,
      byCategory,
      byAction,
      bySeverity,
      topUsers,
      topResources,
    ] = await Promise.all([
      collection.countDocuments(matchStage),
      collection.aggregate([
        { $match: matchStage },
        { $group: { _id: '$event.category', count: { $sum: 1 } } },
      ]).toArray(),
      collection.aggregate([
        { $match: matchStage },
        { $group: { _id: '$event.action', count: { $sum: 1 } } },
      ]).toArray(),
      collection.aggregate([
        { $match: matchStage },
        { $group: { _id: '$severity', count: { $sum: 1 } } },
      ]).toArray(),
      collection.aggregate([
        { $match: matchStage },
        { $group: { _id: { id: '$user.id', email: '$user.email' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]).toArray(),
      collection.aggregate([
        { $match: matchStage },
        { $group: { _id: '$event.resource', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]).toArray(),
    ]);

    return {
      totalLogs,
      byCategory: byCategory.reduce((acc: any, item: any) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      byAction: byAction.reduce((acc: any, item: any) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      bySeverity: bySeverity.reduce((acc: any, item: any) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      topUsers: topUsers.map((item: any) => ({
        userId: item._id.id,
        email: item._id.email,
        count: item.count,
      })),
      topResources: topResources.map((item: any) => ({
        resource: item._id,
        count: item.count,
      })),
    };
  }

  async getRecentActivity(
    tenantId: string,
    limit: number = 10,
    category?: string
  ): Promise<AuditLog[]> {
    const db = await this.getAuditDB(tenantId);
    const collection = db.collection('audit_logs');

    const query: any = { tenantId };
    if (category) query['event.category'] = category;

    const logs = await collection
      .find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();

    return logs as unknown as AuditLog[];
  }

  async getSecurityEvents(
    filters: { tenantId: string; from?: Date; to?: Date },
    page: number = 1,
    limit: number = 20
  ): Promise<{ logs: AuditLog[]; total: number }> {
    const db = await this.getAuditDB(filters.tenantId);
    const collection = db.collection('audit_logs');

    const query: any = {
      tenantId: filters.tenantId,
      $or: [
        { severity: 'critical' },
        { severity: 'high' },
        { 'event.category': 'authentication' },
      ],
    };

    if (filters.from || filters.to) {
      query.timestamp = {};
      if (filters.from) query.timestamp.$gte = filters.from;
      if (filters.to) query.timestamp.$lte = filters.to;
    }

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      collection.find(query).sort({ timestamp: -1 }).skip(skip).limit(limit).toArray(),
      collection.countDocuments(query),
    ]);

    return {
      logs: logs as unknown as AuditLog[],
      total,
    };
  }

  // Cleanup old logs based on retention policy
  async deleteOldLogs(tenantId: string, retentionDays: number): Promise<number> {
    const db = await this.getAuditDB(tenantId);
    const collection = db.collection('audit_logs');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await collection.deleteMany({
      tenantId,
      timestamp: { $lt: cutoffDate },
    });

    logger.info('Old audit logs deleted', {
      tenantId,
      retentionDays,
      deletedCount: result.deletedCount,
    });

    return result.deletedCount;
  }

  // Create indexes for better query performance
  async createIndexes(tenantId: string): Promise<void> {
    const db = await this.getAuditDB(tenantId);
    const collection = db.collection('audit_logs');

    await collection.createIndexes([
      { key: { tenantId: 1, timestamp: -1 } },
      { key: { tenantId: 1, 'event.category': 1, timestamp: -1 } },
      { key: { tenantId: 1, 'user.id': 1, timestamp: -1 } },
      { key: { tenantId: 1, 'event.resource': 1, 'event.resourceId': 1 } },
      { key: { tenantId: 1, severity: 1, timestamp: -1 } },
      { key: { timestamp: 1 }, expireAfterSeconds: 0 }, // TTL index (disabled by default)
    ]);

    logger.info('Audit log indexes created', { tenantId });
  }
}
