// Audit log routes

import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import {
  logger,
  createResponse,
  createPaginatedResponse,
  createErrorResponse,
  authenticate,
  extractTenant,
  authorize,
} from '@properpos/backend-shared';
import { AuditLogService } from '../services/AuditLogService';
import { SearchService } from '../services/SearchService';
import { ExportService } from '../services/ExportService';

export const auditRoutes = Router();
const auditLogService = new AuditLogService();
const searchService = new SearchService();
const exportService = new ExportService();

// Validation middleware
const validate = (req: Request, res: Response, next: Function): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json(createErrorResponse(
      'Validation failed',
      'VALIDATION_ERROR',
      errors.array()
    ));
    return;
  }
  next();
};

// Create audit log entry (internal API)
auditRoutes.post('/',
  authenticate,
  extractTenant,
  [
    body('event.type').isString().notEmpty().withMessage('Event type is required'),
    body('event.category').isIn(['authentication', 'order', 'inventory', 'user_management', 'system', 'billing', 'settings']),
    body('event.action').isIn(['create', 'read', 'update', 'delete']),
    body('event.resource').isString().notEmpty(),
    body('event.resourceId').optional().isString(),
    body('user.id').isString().notEmpty(),
    body('user.email').isEmail(),
    body('user.role').isString().notEmpty(),
    body('request.ipAddress').optional().isString(),
    body('request.userAgent').optional().isString(),
    body('request.method').optional().isString(),
    body('request.endpoint').optional().isString(),
    body('changes').optional().isObject(),
    body('metadata').optional().isObject(),
    body('severity').optional().isIn(['low', 'medium', 'high', 'critical']),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;

      const auditLog = await auditLogService.create({
        tenantId,
        ...req.body,
        request: {
          ...req.body.request,
          ipAddress: req.body.request?.ipAddress || req.ip,
          userAgent: req.body.request?.userAgent || req.get('User-Agent'),
          sessionId: req.headers['x-session-id'] as string,
        },
      });

      res.status(201).json(createResponse(auditLog, 'Audit log created'));
    } catch (error) {
      logger.error('Error creating audit log', { error });
      throw error;
    }
  }
);

// List audit logs
auditRoutes.get('/',
  authenticate,
  extractTenant,
  authorize(['owner', 'admin']),
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('category').optional().isIn(['authentication', 'order', 'inventory', 'user_management', 'system', 'billing', 'settings']),
    query('action').optional().isIn(['create', 'read', 'update', 'delete']),
    query('severity').optional().isIn(['low', 'medium', 'high', 'critical']),
    query('userId').optional().isString(),
    query('resource').optional().isString(),
    query('resourceId').optional().isString(),
    query('from').optional().isISO8601(),
    query('to').optional().isISO8601(),
    query('sortBy').optional().isIn(['timestamp', 'severity', 'category']),
    query('sortOrder').optional().isIn(['asc', 'desc']),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const filters: any = { tenantId };

      if (req.query.category) filters.category = req.query.category;
      if (req.query.action) filters.action = req.query.action;
      if (req.query.severity) filters.severity = req.query.severity;
      if (req.query.userId) filters.userId = req.query.userId;
      if (req.query.resource) filters.resource = req.query.resource;
      if (req.query.resourceId) filters.resourceId = req.query.resourceId;
      if (req.query.from) filters.from = new Date(req.query.from as string);
      if (req.query.to) filters.to = new Date(req.query.to as string);

      const sortBy = req.query.sortBy as string || 'timestamp';
      const sortOrder = req.query.sortOrder as string || 'desc';

      const { logs, total } = await auditLogService.list(
        filters,
        page,
        limit,
        sortBy,
        sortOrder
      );

      res.json(createPaginatedResponse(
        logs,
        page,
        limit,
        total,
        'Audit logs retrieved successfully'
      ));
    } catch (error) {
      logger.error('Error listing audit logs', { error });
      throw error;
    }
  }
);

// Search audit logs
auditRoutes.get('/search',
  authenticate,
  extractTenant,
  authorize(['owner', 'admin']),
  [
    query('q').isString().notEmpty().withMessage('Search query is required'),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('category').optional().isIn(['authentication', 'order', 'inventory', 'user_management', 'system', 'billing', 'settings']),
    query('from').optional().isISO8601(),
    query('to').optional().isISO8601(),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const searchQuery = req.query.q as string;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const filters: any = { tenantId };
      if (req.query.category) filters.category = req.query.category;
      if (req.query.from) filters.from = new Date(req.query.from as string);
      if (req.query.to) filters.to = new Date(req.query.to as string);

      const { logs, total } = await searchService.search(
        searchQuery,
        filters,
        page,
        limit
      );

      res.json(createPaginatedResponse(
        logs,
        page,
        limit,
        total,
        'Audit logs search completed'
      ));
    } catch (error) {
      logger.error('Error searching audit logs', { error });
      throw error;
    }
  }
);

// Get audit log by ID
auditRoutes.get('/:id',
  authenticate,
  extractTenant,
  authorize(['owner', 'admin']),
  [
    param('id').isString().notEmpty(),
  ],
  validate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;

      const auditLog = await auditLogService.getById(req.params.id, tenantId);

      if (!auditLog) {
        res.status(404).json(createErrorResponse(
          'Audit log not found',
          'NOT_FOUND'
        ));
        return;
      }

      res.json(createResponse(auditLog, 'Audit log retrieved'));
    } catch (error) {
      logger.error('Error getting audit log', { error });
      throw error;
    }
  }
);

// Get audit logs for a specific resource
auditRoutes.get('/resource/:resource/:resourceId',
  authenticate,
  extractTenant,
  authorize(['owner', 'admin', 'manager']),
  [
    param('resource').isString().notEmpty(),
    param('resourceId').isString().notEmpty(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const { logs, total } = await auditLogService.getByResource(
        tenantId,
        req.params.resource,
        req.params.resourceId,
        page,
        limit
      );

      res.json(createPaginatedResponse(
        logs,
        page,
        limit,
        total,
        'Resource audit logs retrieved'
      ));
    } catch (error) {
      logger.error('Error getting resource audit logs', { error });
      throw error;
    }
  }
);

// Get audit logs for a specific user
auditRoutes.get('/user/:userId',
  authenticate,
  extractTenant,
  authorize(['owner', 'admin']),
  [
    param('userId').isString().notEmpty(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('from').optional().isISO8601(),
    query('to').optional().isISO8601(),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const filters: any = { tenantId, userId: req.params.userId };
      if (req.query.from) filters.from = new Date(req.query.from as string);
      if (req.query.to) filters.to = new Date(req.query.to as string);

      const { logs, total } = await auditLogService.getByUser(
        filters,
        page,
        limit
      );

      res.json(createPaginatedResponse(
        logs,
        page,
        limit,
        total,
        'User audit logs retrieved'
      ));
    } catch (error) {
      logger.error('Error getting user audit logs', { error });
      throw error;
    }
  }
);

// Export audit logs
auditRoutes.get('/export',
  authenticate,
  extractTenant,
  authorize(['owner', 'admin']),
  [
    query('format').isIn(['csv', 'json']).withMessage('Format must be csv or json'),
    query('category').optional().isIn(['authentication', 'order', 'inventory', 'user_management', 'system', 'billing', 'settings']),
    query('from').optional().isISO8601(),
    query('to').optional().isISO8601(),
    query('severity').optional().isIn(['low', 'medium', 'high', 'critical']),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const format = req.query.format as 'csv' | 'json';

      const filters: any = { tenantId };
      if (req.query.category) filters.category = req.query.category;
      if (req.query.from) filters.from = new Date(req.query.from as string);
      if (req.query.to) filters.to = new Date(req.query.to as string);
      if (req.query.severity) filters.severity = req.query.severity;

      const { data, filename, contentType } = await exportService.export(
        filters,
        format
      );

      // Log the export action
      await auditLogService.create({
        tenantId,
        event: {
          type: 'system.data_export',
          category: 'system',
          action: 'read',
          resource: 'audit_logs',
        },
        user: {
          id: (req as any).user.id,
          email: (req as any).user.email,
          role: (req as any).user.role,
        },
        request: {
          ipAddress: req.ip,
          userAgent: req.get('User-Agent') || '',
          method: 'GET',
          endpoint: '/api/v1/audit/export',
        },
        metadata: {
          format,
          filters,
        },
        severity: 'medium',
      });

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(data);
    } catch (error) {
      logger.error('Error exporting audit logs', { error });
      throw error;
    }
  }
);

// Get audit statistics
auditRoutes.get('/stats',
  authenticate,
  extractTenant,
  authorize(['owner', 'admin']),
  [
    query('from').optional().isISO8601(),
    query('to').optional().isISO8601(),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;

      const filters: any = { tenantId };
      if (req.query.from) filters.from = new Date(req.query.from as string);
      if (req.query.to) filters.to = new Date(req.query.to as string);

      const stats = await auditLogService.getStats(filters);

      res.json(createResponse(stats, 'Audit statistics retrieved'));
    } catch (error) {
      logger.error('Error getting audit stats', { error });
      throw error;
    }
  }
);

// Get recent activity
auditRoutes.get('/activity/recent',
  authenticate,
  extractTenant,
  authorize(['owner', 'admin', 'manager']),
  [
    query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
    query('category').optional().isIn(['authentication', 'order', 'inventory', 'user_management', 'system', 'billing', 'settings']),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const limit = parseInt(req.query.limit as string) || 10;
      const category = req.query.category as string;

      const activity = await auditLogService.getRecentActivity(
        tenantId,
        limit,
        category
      );

      res.json(createResponse(activity, 'Recent activity retrieved'));
    } catch (error) {
      logger.error('Error getting recent activity', { error });
      throw error;
    }
  }
);

// Get security events (critical and high severity)
auditRoutes.get('/security',
  authenticate,
  extractTenant,
  authorize(['owner', 'admin']),
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('from').optional().isISO8601(),
    query('to').optional().isISO8601(),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.headers['x-tenant-id'] as string;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const filters: any = { tenantId };
      if (req.query.from) filters.from = new Date(req.query.from as string);
      if (req.query.to) filters.to = new Date(req.query.to as string);

      const { logs, total } = await auditLogService.getSecurityEvents(
        filters,
        page,
        limit
      );

      res.json(createPaginatedResponse(
        logs,
        page,
        limit,
        total,
        'Security events retrieved'
      ));
    } catch (error) {
      logger.error('Error getting security events', { error });
      throw error;
    }
  }
);
