// Search Service for Audit Logs

import { logger, getTenantDB } from '@properpos/backend-shared';

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

interface SearchFilters {
  tenantId: string;
  category?: string;
  from?: Date;
  to?: Date;
}

export class SearchService {
  async search(
    query: string,
    filters: SearchFilters,
    page: number = 1,
    limit: number = 20
  ): Promise<{ logs: AuditLog[]; total: number }> {
    const db = await getTenantDB(filters.tenantId);
    const collection = db.collection('audit_logs');

    // Build search query
    const searchQuery = this.buildSearchQuery(query, filters);
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      collection
        .find(searchQuery)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      collection.countDocuments(searchQuery),
    ]);

    return {
      logs: logs as unknown as AuditLog[],
      total,
    };
  }

  private buildSearchQuery(query: string, filters: SearchFilters): any {
    const searchTerms = query.toLowerCase().split(' ').filter(term => term.length > 0);

    const baseQuery: any = {
      tenantId: filters.tenantId,
    };

    // Add category filter
    if (filters.category) {
      baseQuery['event.category'] = filters.category;
    }

    // Add date range filter
    if (filters.from || filters.to) {
      baseQuery.timestamp = {};
      if (filters.from) baseQuery.timestamp.$gte = filters.from;
      if (filters.to) baseQuery.timestamp.$lte = filters.to;
    }

    // Build text search conditions
    const searchConditions: any[] = [];

    for (const term of searchTerms) {
      const termConditions = [
        { 'event.type': { $regex: term, $options: 'i' } },
        { 'event.resource': { $regex: term, $options: 'i' } },
        { 'event.resourceId': { $regex: term, $options: 'i' } },
        { 'user.email': { $regex: term, $options: 'i' } },
        { 'user.id': { $regex: term, $options: 'i' } },
        { 'request.ipAddress': { $regex: term, $options: 'i' } },
        { 'request.endpoint': { $regex: term, $options: 'i' } },
      ];

      searchConditions.push({ $or: termConditions });
    }

    if (searchConditions.length > 0) {
      baseQuery.$and = searchConditions;
    }

    return baseQuery;
  }

  async searchByField(
    tenantId: string,
    field: string,
    value: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{ logs: AuditLog[]; total: number }> {
    const db = await getTenantDB(tenantId);
    const collection = db.collection('audit_logs');

    const query: any = {
      tenantId,
      [field]: { $regex: value, $options: 'i' },
    };

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      collection
        .find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      collection.countDocuments(query),
    ]);

    return {
      logs: logs as unknown as AuditLog[],
      total,
    };
  }

  async searchByIpAddress(
    tenantId: string,
    ipAddress: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{ logs: AuditLog[]; total: number }> {
    return this.searchByField(tenantId, 'request.ipAddress', ipAddress, page, limit);
  }

  async searchByEmail(
    tenantId: string,
    email: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{ logs: AuditLog[]; total: number }> {
    return this.searchByField(tenantId, 'user.email', email, page, limit);
  }

  async searchByEventType(
    tenantId: string,
    eventType: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{ logs: AuditLog[]; total: number }> {
    return this.searchByField(tenantId, 'event.type', eventType, page, limit);
  }

  // Get suggestions for autocomplete
  async getSuggestions(
    tenantId: string,
    field: string,
    prefix: string,
    limit: number = 10
  ): Promise<string[]> {
    const db = await getTenantDB(tenantId);
    const collection = db.collection('audit_logs');

    const suggestions = await collection.distinct(field, {
      tenantId,
      [field]: { $regex: `^${prefix}`, $options: 'i' },
    });

    return suggestions.slice(0, limit) as string[];
  }

  // Get unique values for a field (for filter dropdowns)
  async getDistinctValues(
    tenantId: string,
    field: string
  ): Promise<string[]> {
    const db = await getTenantDB(tenantId);
    const collection = db.collection('audit_logs');

    const values = await collection.distinct(field, { tenantId });
    return values as string[];
  }

  // Advanced search with multiple conditions
  async advancedSearch(
    tenantId: string,
    conditions: Array<{
      field: string;
      operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'gt' | 'lt' | 'gte' | 'lte';
      value: any;
    }>,
    page: number = 1,
    limit: number = 20
  ): Promise<{ logs: AuditLog[]; total: number }> {
    const db = await getTenantDB(tenantId);
    const collection = db.collection('audit_logs');

    const query: any = { tenantId };

    for (const condition of conditions) {
      switch (condition.operator) {
        case 'equals':
          query[condition.field] = condition.value;
          break;
        case 'contains':
          query[condition.field] = { $regex: condition.value, $options: 'i' };
          break;
        case 'startsWith':
          query[condition.field] = { $regex: `^${condition.value}`, $options: 'i' };
          break;
        case 'endsWith':
          query[condition.field] = { $regex: `${condition.value}$`, $options: 'i' };
          break;
        case 'gt':
          query[condition.field] = { $gt: condition.value };
          break;
        case 'lt':
          query[condition.field] = { $lt: condition.value };
          break;
        case 'gte':
          query[condition.field] = { $gte: condition.value };
          break;
        case 'lte':
          query[condition.field] = { $lte: condition.value };
          break;
      }
    }

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      collection
        .find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      collection.countDocuments(query),
    ]);

    return {
      logs: logs as unknown as AuditLog[],
      total,
    };
  }
}
