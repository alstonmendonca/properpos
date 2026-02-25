// Receipt management routes

import { Router, Request, Response } from 'express';

import {
  logger,
  authenticate,
  extractTenant,
  requireRole,
  requirePermissions,
  createResponse,
  createErrorResponse,
  UserRoles,
  Permissions,
} from '@properpos/backend-shared';

import { ReceiptService } from '../services/ReceiptService';

export const receiptRoutes = Router();

// Initialize services
const receiptService = new ReceiptService();

/**
 * @swagger
 * /api/v1/receipts/{orderId}:
 *   get:
 *     tags: [Receipts]
 *     summary: Get receipt for order
 *     security:
 *       - BearerAuth: []
 *       - TenantHeader: []
 */
receiptRoutes.get('/:orderId',
  authenticate,
  extractTenant,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { orderId } = req.params;
    const { format = 'json' } = req.query;

    try {
      const receipt = await receiptService.getReceipt(tenantId, orderId, {
        format: format as string,
        includeQRCode: true,
      });

      if (!receipt) {
        res.status(404).json(createErrorResponse('Receipt not found', 'RECEIPT_NOT_FOUND'));
        return;
      }

      // Set appropriate content type based on format
      if (format === 'pdf') {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="receipt-${orderId}.pdf"`);
        res.send(receipt.data);
        return;
      } else if (format === 'html') {
        res.setHeader('Content-Type', 'text/html');
        res.send(receipt.data);
        return;
      }

      res.json(createResponse(receipt, 'Receipt retrieved successfully'));

    } catch (error) {
      logger.error('Get receipt error', {
        tenantId,
        orderId,
        format,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/receipts/{orderId}/generate:
 *   post:
 *     tags: [Receipts]
 *     summary: Generate new receipt for order
 */
receiptRoutes.post('/:orderId/generate',
  authenticate,
  extractTenant,
  requirePermissions([Permissions.ORDER_UPDATE]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { orderId } = req.params;
    const { format = 'json', template = 'default', includeQRCode = true } = req.body;

    try {
      const receipt = await receiptService.generateReceipt(tenantId, orderId, {
        format,
        template,
        includeQRCode,
        generatedBy: user.id,
      });

      logger.audit('Receipt generated', {
        tenantId,
        orderId,
        format,
        template,
        generatedBy: user.id,
        ip: req.ip,
      });

      // Set appropriate content type based on format
      if (format === 'pdf') {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="receipt-${orderId}.pdf"`);
        res.send(receipt.data);
        return;
      } else if (format === 'html') {
        res.setHeader('Content-Type', 'text/html');
        res.send(receipt.data);
        return;
      }

      res.status(201).json(createResponse(receipt, 'Receipt generated successfully'));

    } catch (error) {
      logger.error('Generate receipt error', {
        tenantId,
        orderId,
        format,
        template,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/receipts/{orderId}/reprint:
 *   post:
 *     tags: [Receipts]
 *     summary: Reprint existing receipt
 */
receiptRoutes.post('/:orderId/reprint',
  authenticate,
  extractTenant,
  requirePermissions([Permissions.ORDER_UPDATE]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { orderId } = req.params;
    const { format = 'json', reason } = req.body;

    try {
      const receipt = await receiptService.reprintReceipt(tenantId, orderId, {
        format,
        reason,
        reprintedBy: user.id,
      });

      logger.audit('Receipt reprinted', {
        tenantId,
        orderId,
        format,
        reason,
        reprintedBy: user.id,
        ip: req.ip,
      });

      // Set appropriate content type based on format
      if (format === 'pdf') {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="receipt-${orderId}-reprint.pdf"`);
        res.send(receipt.data);
        return;
      } else if (format === 'html') {
        res.setHeader('Content-Type', 'text/html');
        res.send(receipt.data);
        return;
      }

      res.json(createResponse(receipt, 'Receipt reprinted successfully'));

    } catch (error) {
      logger.error('Reprint receipt error', {
        tenantId,
        orderId,
        reason,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/receipts/{orderId}/email:
 *   post:
 *     tags: [Receipts]
 *     summary: Email receipt to customer
 */
receiptRoutes.post('/:orderId/email',
  authenticate,
  extractTenant,
  requirePermissions([Permissions.ORDER_UPDATE]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { orderId } = req.params;
    const { email, customerName, format = 'pdf' } = req.body;

    if (!email) {
      res.status(400).json(createErrorResponse('Email address is required', 'EMAIL_REQUIRED'));
      return;
    }

    try {
      const result = await receiptService.emailReceipt(tenantId, orderId, {
        email,
        customerName,
        format,
        sentBy: user.id,
      });

      logger.audit('Receipt emailed', {
        tenantId,
        orderId,
        email,
        customerName,
        format,
        sentBy: user.id,
        ip: req.ip,
      });

      res.json(createResponse(result, 'Receipt emailed successfully'));

    } catch (error) {
      logger.error('Email receipt error', {
        tenantId,
        orderId,
        email,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/receipts/{orderId}/sms:
 *   post:
 *     tags: [Receipts]
 *     summary: Send receipt via SMS
 */
receiptRoutes.post('/:orderId/sms',
  authenticate,
  extractTenant,
  requirePermissions([Permissions.ORDER_UPDATE]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { orderId } = req.params;
    const { phone, customerName } = req.body;

    if (!phone) {
      res.status(400).json(createErrorResponse('Phone number is required', 'PHONE_REQUIRED'));
      return;
    }

    try {
      const result = await receiptService.smsReceipt(tenantId, orderId, {
        phone,
        customerName,
        sentBy: user.id,
      });

      logger.audit('Receipt sent via SMS', {
        tenantId,
        orderId,
        phone,
        customerName,
        sentBy: user.id,
        ip: req.ip,
      });

      res.json(createResponse(result, 'Receipt sent via SMS successfully'));

    } catch (error) {
      logger.error('SMS receipt error', {
        tenantId,
        orderId,
        phone,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/receipts/{orderId}/history:
 *   get:
 *     tags: [Receipts]
 *     summary: Get receipt generation history
 */
receiptRoutes.get('/:orderId/history',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { orderId } = req.params;

    try {
      const history = await receiptService.getReceiptHistory(tenantId, orderId);

      res.json(createResponse(history, 'Receipt history retrieved successfully'));

    } catch (error) {
      logger.error('Get receipt history error', {
        tenantId,
        orderId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/receipts/templates:
 *   get:
 *     tags: [Receipts]
 *     summary: Get available receipt templates
 */
receiptRoutes.get('/templates',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;

    try {
      const templates = await receiptService.getReceiptTemplates(tenantId);

      res.json(createResponse(templates, 'Receipt templates retrieved successfully'));

    } catch (error) {
      logger.error('Get receipt templates error', {
        tenantId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/receipts/templates:
 *   post:
 *     tags: [Receipts]
 *     summary: Create custom receipt template
 */
receiptRoutes.post('/templates',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  requirePermissions([Permissions.SYSTEM_SETTINGS]),
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const templateData = req.body;

    try {
      const template = await receiptService.createReceiptTemplate(tenantId, {
        ...templateData,
        createdBy: user.id,
      });

      logger.audit('Receipt template created', {
        tenantId,
        templateId: template.id,
        name: template.name,
        createdBy: user.id,
        ip: req.ip,
      });

      res.status(201).json(createResponse(template, 'Receipt template created successfully'));

    } catch (error) {
      logger.error('Create receipt template error', {
        tenantId,
        userId: user.id,
        templateData,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/receipts/templates/{templateId}:
 *   put:
 *     tags: [Receipts]
 *     summary: Update receipt template
 */
receiptRoutes.put('/templates/:templateId',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  requirePermissions([Permissions.SYSTEM_SETTINGS]),
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { templateId } = req.params;
    const updates = req.body;

    try {
      await receiptService.updateReceiptTemplate(tenantId, templateId, {
        ...updates,
        updatedBy: user.id,
      });

      logger.audit('Receipt template updated', {
        tenantId,
        templateId,
        updatedBy: user.id,
        updatedFields: Object.keys(updates),
        ip: req.ip,
      });

      res.json(createResponse({}, 'Receipt template updated successfully'));

    } catch (error) {
      logger.error('Update receipt template error', {
        tenantId,
        templateId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/receipts/settings:
 *   get:
 *     tags: [Receipts]
 *     summary: Get receipt settings
 */
receiptRoutes.get('/settings',
  authenticate,
  extractTenant,
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;

    try {
      const settings = await receiptService.getReceiptSettings(tenantId);

      res.json(createResponse(settings, 'Receipt settings retrieved successfully'));

    } catch (error) {
      logger.error('Get receipt settings error', {
        tenantId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/receipts/settings:
 *   put:
 *     tags: [Receipts]
 *     summary: Update receipt settings
 */
receiptRoutes.put('/settings',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  requirePermissions([Permissions.SYSTEM_SETTINGS]),
  async (req: Request, res: Response) => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const settings = req.body;

    try {
      await receiptService.updateReceiptSettings(tenantId, {
        ...settings,
        updatedBy: user.id,
      });

      logger.audit('Receipt settings updated', {
        tenantId,
        updatedBy: user.id,
        updatedFields: Object.keys(settings),
        ip: req.ip,
      });

      res.json(createResponse({}, 'Receipt settings updated successfully'));

    } catch (error) {
      logger.error('Update receipt settings error', {
        tenantId,
        userId: user.id,
        settings,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);