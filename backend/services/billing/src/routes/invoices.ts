import { Router, Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import {
  logger,
  authenticate,
  extractTenant,
  requireRole,
  createResponse,
  createErrorResponse,
  UserRoles,
  getPlatformDatabase,
} from '@properpos/backend-shared';

export const invoiceRoutes = Router();

invoiceRoutes.get('/',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.user!.tenantId || req.tenant?.id;

    if (!tenantId) {
      res.status(400).json(createErrorResponse('Tenant ID is required', 'TENANT_ID_REQUIRED'));
      return;
    }

    const {
      page = '1',
      limit = '10',
      status,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    try {
      const db = getPlatformDatabase();
      const invoicesCollection = db.collection('invoices');

      const query: any = { tenantId };

      if (status) {
        query.status = status;
      }

      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate as string);
        if (endDate) query.createdAt.$lte = new Date(endDate as string);
      }

      const pageNum = parseInt(page as string, 10);
      const limitNum = Math.min(parseInt(limit as string, 10), 100);
      const sort: any = { [sortBy as string]: sortOrder === 'asc' ? 1 : -1 };

      const [invoices, totalCount] = await Promise.all([
        invoicesCollection
          .find(query)
          .sort(sort)
          .skip((pageNum - 1) * limitNum)
          .limit(limitNum)
          .toArray(),
        invoicesCollection.countDocuments(query),
      ]);

      const processedInvoices = invoices.map((invoice: any) => ({
        id: invoice._id || invoice.id,
        tenantId: invoice.tenantId,
        subscriptionId: invoice.subscriptionId,
        invoiceNumber: invoice.invoiceNumber || invoice.number,
        amount: invoice.amount,
        subtotal: invoice.subtotal || invoice.amount,
        tax: invoice.tax || 0,
        discount: invoice.discount || 0,
        total: invoice.total || invoice.amount,
        currency: invoice.currency || 'USD',
        status: invoice.status,
        dueDate: invoice.dueDate,
        paidAt: invoice.paidAt,
        lineItems: invoice.lineItems || [],
        stripeInvoiceId: invoice.stripeInvoiceId,
        stripePaymentIntentId: invoice.stripePaymentIntentId,
        createdAt: invoice.createdAt,
        updatedAt: invoice.updatedAt,
      }));

      logger.info('Invoices retrieved', {
        tenantId,
        invoiceCount: processedInvoices.length,
        totalCount,
        filters: { status, startDate, endDate },
      });

      res.json(createResponse({
        invoices: processedInvoices,
        pagination: {
          page: pageNum,
          limit: limitNum,
          totalCount,
          totalPages: Math.ceil(totalCount / limitNum),
        },
      }, 'Invoices retrieved successfully'));
    } catch (error) {
      logger.error('Get invoices error', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
);

invoiceRoutes.get('/:invoiceId',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.user!.tenantId || req.tenant?.id;
    const { invoiceId } = req.params;

    if (!tenantId) {
      res.status(400).json(createErrorResponse('Tenant ID is required', 'TENANT_ID_REQUIRED'));
      return;
    }

    try {
      const db = getPlatformDatabase();
      const invoicesCollection = db.collection('invoices');

      let invoice = null;

      if (ObjectId.isValid(invoiceId)) {
        invoice = await invoicesCollection.findOne({
          _id: new ObjectId(invoiceId),
          tenantId,
        });
      }

      if (!invoice) {
        invoice = await invoicesCollection.findOne({
          $or: [{ id: invoiceId }, { invoiceNumber: invoiceId }],
          tenantId,
        });
      }

      if (!invoice) {
        res.status(404).json(createErrorResponse('Invoice not found', 'INVOICE_NOT_FOUND'));
        return;
      }

      const processedInvoice = {
        id: invoice._id || invoice.id,
        tenantId: invoice.tenantId,
        subscriptionId: invoice.subscriptionId,
        invoiceNumber: invoice.invoiceNumber || invoice.number,
        amount: invoice.amount,
        subtotal: invoice.subtotal || invoice.amount,
        tax: invoice.tax || 0,
        discount: invoice.discount || 0,
        total: invoice.total || invoice.amount,
        currency: invoice.currency || 'USD',
        status: invoice.status,
        dueDate: invoice.dueDate,
        paidAt: invoice.paidAt,
        lineItems: invoice.lineItems || [],
        stripeInvoiceId: invoice.stripeInvoiceId,
        stripePaymentIntentId: invoice.stripePaymentIntentId,
        createdAt: invoice.createdAt,
        updatedAt: invoice.updatedAt,
      };

      logger.info('Invoice retrieved', {
        tenantId,
        invoiceId: processedInvoice.id,
      });

      res.json(createResponse(processedInvoice, 'Invoice retrieved successfully'));
    } catch (error) {
      logger.error('Get invoice error', {
        tenantId,
        invoiceId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
);

invoiceRoutes.get('/:invoiceId/download',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.user!.tenantId || req.tenant?.id;
    const { invoiceId } = req.params;

    if (!tenantId) {
      res.status(400).json(createErrorResponse('Tenant ID is required', 'TENANT_ID_REQUIRED'));
      return;
    }

    try {
      const db = getPlatformDatabase();
      const invoicesCollection = db.collection('invoices');

      let invoice = null;

      if (ObjectId.isValid(invoiceId)) {
        invoice = await invoicesCollection.findOne({
          _id: new ObjectId(invoiceId),
          tenantId,
        });
      }

      if (!invoice) {
        invoice = await invoicesCollection.findOne({
          $or: [{ id: invoiceId }, { invoiceNumber: invoiceId }],
          tenantId,
        });
      }

      if (!invoice) {
        res.status(404).json(createErrorResponse('Invoice not found', 'INVOICE_NOT_FOUND'));
        return;
      }

      const downloadData = {
        invoiceId: invoice._id || invoice.id,
        invoiceNumber: invoice.invoiceNumber || invoice.number,
        downloadUrl: invoice.pdfUrl || null,
        stripeInvoiceId: invoice.stripeInvoiceId || null,
        generatedAt: new Date().toISOString(),
      };

      if (invoice.stripeInvoiceId) {
        try {
          const Stripe = require('stripe');
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
            apiVersion: '2023-10-16' as const,
          });
          const stripeInvoice = await stripe.invoices.retrieve(invoice.stripeInvoiceId);
          if (stripeInvoice.invoice_pdf) {
            downloadData.downloadUrl = stripeInvoice.invoice_pdf;
          }
        } catch (stripeError) {
          logger.warn('Failed to retrieve Stripe invoice PDF', {
            invoiceId: invoice.stripeInvoiceId,
            error: stripeError instanceof Error ? stripeError.message : 'Unknown error',
          });
        }
      }

      logger.info('Invoice download link generated', {
        tenantId,
        invoiceId: downloadData.invoiceId,
        hasDownloadUrl: !!downloadData.downloadUrl,
      });

      res.json(createResponse(downloadData, 'Invoice download link generated successfully'));
    } catch (error) {
      logger.error('Get invoice download error', {
        tenantId,
        invoiceId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
);
