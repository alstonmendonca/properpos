// Export Service for Audit Logs

import { Parser } from 'json2csv';
import { logger, getTenantDatabase } from '@properpos/backend-shared';

interface AuditLog {
  id: string;
  tenantId?: string;
  event: {
    type: string;
    category: string;
    action: string;
    resource: string;
    resourceId?: string;
  };
  user: {
    id: string;
    email: string;
    role: string;
    locationId?: string;
  };
  request: {
    ipAddress: string;
    userAgent: string;
    method: string;
    endpoint: string;
    sessionId?: string;
  };
  changes?: {
    before?: Record<string, any>;
    after?: Record<string, any>;
  };
  metadata?: Record<string, any>;
  severity: string;
  timestamp: Date;
}

interface ExportFilters {
  tenantId: string;
  category?: string;
  from?: Date;
  to?: Date;
  severity?: string;
}

interface ExportResult {
  data: string | Buffer;
  filename: string;
  contentType: string;
}

export class ExportService {
  private readonly maxExportRows = 10000; // Limit export size

  async export(
    filters: ExportFilters,
    format: 'csv' | 'json'
  ): Promise<ExportResult> {
    const logs = await this.fetchLogs(filters);

    logger.info('Exporting audit logs', {
      tenantId: filters.tenantId,
      format,
      count: logs.length,
    });

    switch (format) {
      case 'csv':
        return this.exportToCsv(logs, filters);
      case 'json':
        return this.exportToJson(logs, filters);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  private async fetchLogs(filters: ExportFilters): Promise<AuditLog[]> {
    const db = await getTenantDatabase(filters.tenantId);
    const collection = db.collection('audit_logs');

    const query: any = { tenantId: filters.tenantId };

    if (filters.category) query['event.category'] = filters.category;
    if (filters.severity) query.severity = filters.severity;

    if (filters.from || filters.to) {
      query.timestamp = {};
      if (filters.from) query.timestamp.$gte = filters.from;
      if (filters.to) query.timestamp.$lte = filters.to;
    }

    const logs = await collection
      .find(query)
      .sort({ timestamp: -1 })
      .limit(this.maxExportRows)
      .toArray();

    return logs as unknown as AuditLog[];
  }

  private exportToCsv(logs: AuditLog[], filters: ExportFilters): ExportResult {
    // Flatten logs for CSV export
    const flattenedLogs = logs.map(log => ({
      id: log.id,
      timestamp: log.timestamp,
      eventType: log.event.type,
      eventCategory: log.event.category,
      eventAction: log.event.action,
      resource: log.event.resource,
      resourceId: log.event.resourceId || '',
      userId: log.user.id,
      userEmail: log.user.email,
      userRole: log.user.role,
      userLocationId: log.user.locationId || '',
      ipAddress: log.request.ipAddress,
      userAgent: log.request.userAgent,
      method: log.request.method,
      endpoint: log.request.endpoint,
      sessionId: log.request.sessionId || '',
      severity: log.severity,
      changesBefore: log.changes?.before ? JSON.stringify(log.changes.before) : '',
      changesAfter: log.changes?.after ? JSON.stringify(log.changes.after) : '',
      metadata: log.metadata ? JSON.stringify(log.metadata) : '',
    }));

    const fields = [
      { label: 'ID', value: 'id' },
      { label: 'Timestamp', value: 'timestamp' },
      { label: 'Event Type', value: 'eventType' },
      { label: 'Category', value: 'eventCategory' },
      { label: 'Action', value: 'eventAction' },
      { label: 'Resource', value: 'resource' },
      { label: 'Resource ID', value: 'resourceId' },
      { label: 'User ID', value: 'userId' },
      { label: 'User Email', value: 'userEmail' },
      { label: 'User Role', value: 'userRole' },
      { label: 'Location ID', value: 'userLocationId' },
      { label: 'IP Address', value: 'ipAddress' },
      { label: 'User Agent', value: 'userAgent' },
      { label: 'Method', value: 'method' },
      { label: 'Endpoint', value: 'endpoint' },
      { label: 'Session ID', value: 'sessionId' },
      { label: 'Severity', value: 'severity' },
      { label: 'Changes Before', value: 'changesBefore' },
      { label: 'Changes After', value: 'changesAfter' },
      { label: 'Metadata', value: 'metadata' },
    ];

    const parser = new Parser({ fields });
    const csv = parser.parse(flattenedLogs);

    const filename = this.generateFilename(filters, 'csv');

    return {
      data: csv,
      filename,
      contentType: 'text/csv',
    };
  }

  private exportToJson(logs: AuditLog[], filters: ExportFilters): ExportResult {
    const exportData = {
      exportedAt: new Date().toISOString(),
      tenantId: filters.tenantId,
      filters: {
        category: filters.category,
        from: filters.from?.toISOString(),
        to: filters.to?.toISOString(),
        severity: filters.severity,
      },
      totalRecords: logs.length,
      logs,
    };

    const json = JSON.stringify(exportData, null, 2);
    const filename = this.generateFilename(filters, 'json');

    return {
      data: json,
      filename,
      contentType: 'application/json',
    };
  }

  private generateFilename(filters: ExportFilters, extension: string): string {
    const parts = ['audit_logs'];

    if (filters.category) {
      parts.push(filters.category);
    }

    const dateStr = new Date().toISOString().split('T')[0];
    parts.push(dateStr);

    return `${parts.join('_')}.${extension}`;
  }

  // Export summary report
  async exportSummaryReport(
    tenantId: string,
    from: Date,
    to: Date
  ): Promise<ExportResult> {
    const db = await getTenantDatabase(tenantId);
    const collection = db.collection('audit_logs');

    const matchStage = {
      tenantId,
      timestamp: { $gte: from, $lte: to },
    };

    const [
      totalLogs,
      byCategory,
      byAction,
      bySeverity,
      byDay,
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
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$timestamp' },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]).toArray(),
      collection.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: { id: '$user.id', email: '$user.email' },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ]).toArray(),
      collection.aggregate([
        { $match: matchStage },
        { $group: { _id: '$event.resource', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ]).toArray(),
    ]);

    const report = {
      reportGeneratedAt: new Date().toISOString(),
      tenantId,
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
      summary: {
        totalLogs,
        byCategory: Object.fromEntries(byCategory.map((c: any) => [c._id, c.count])),
        byAction: Object.fromEntries(byAction.map((a: any) => [a._id, a.count])),
        bySeverity: Object.fromEntries(bySeverity.map((s: any) => [s._id, s.count])),
      },
      dailyActivity: byDay.map((d: any) => ({ date: d._id, count: d.count })),
      topUsers: topUsers.map((u: any) => ({
        userId: u._id.id,
        email: u._id.email,
        activityCount: u.count,
      })),
      topResources: topResources.map((r: any) => ({
        resource: r._id,
        accessCount: r.count,
      })),
    };

    const json = JSON.stringify(report, null, 2);
    const filename = `audit_summary_${from.toISOString().split('T')[0]}_${to.toISOString().split('T')[0]}.json`;

    return {
      data: json,
      filename,
      contentType: 'application/json',
    };
  }

  // Stream large exports (for very large datasets)
  async *streamExport(
    filters: ExportFilters,
    batchSize: number = 1000
  ): AsyncGenerator<AuditLog[]> {
    const db = await getTenantDatabase(filters.tenantId);
    const collection = db.collection('audit_logs');

    const query: any = { tenantId: filters.tenantId };

    if (filters.category) query['event.category'] = filters.category;
    if (filters.severity) query.severity = filters.severity;

    if (filters.from || filters.to) {
      query.timestamp = {};
      if (filters.from) query.timestamp.$gte = filters.from;
      if (filters.to) query.timestamp.$lte = filters.to;
    }

    let skip = 0;
    let hasMore = true;

    while (hasMore) {
      const batch = await collection
        .find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(batchSize)
        .toArray();

      if (batch.length === 0) {
        hasMore = false;
      } else {
        yield batch as unknown as AuditLog[];
        skip += batchSize;

        if (batch.length < batchSize) {
          hasMore = false;
        }
      }
    }
  }
}
