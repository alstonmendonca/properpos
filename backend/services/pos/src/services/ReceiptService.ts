// Receipt generation and management service

import * as QRCode from 'qrcode';
import PDFDocument from 'pdfkit';
import {
  logger,
  getTenantDatabase,
  Order,
} from '@properpos/backend-shared';

import {
  Receipt,
  ReceiptTemplate,
  ReceiptSettings,
  ReceiptHistory,
} from '../types';

// Stub email and SMS services for now
class EmailService {
  async send(options: any): Promise<{ success: boolean; messageId?: string }> {
    logger.info('Email service not implemented', { options });
    return { success: true, messageId: 'stub' };
  }
  async sendEmail(options: any): Promise<{ success: boolean; messageId?: string }> {
    return this.send(options);
  }
}

class SMSService {
  async send(options: any): Promise<{ success: boolean; messageId?: string }> {
    logger.info('SMS service not implemented', { options });
    return { success: true, messageId: 'stub' };
  }
  async sendSMS(options: any): Promise<{ success: boolean; messageId?: string }> {
    return this.send(options);
  }
}

export class ReceiptService {
  private emailService: EmailService;
  private smsService: SMSService;

  constructor() {
    this.emailService = new EmailService();
    this.smsService = new SMSService();
  }

  /**
   * Get receipt for order
   */
  async getReceipt(
    tenantId: string,
    orderId: string,
    options: {
      format?: string;
      includeQRCode?: boolean;
    } = {}
  ): Promise<Receipt | null> {
    try {
      const db = await getTenantDatabase(tenantId);
      const receiptsCollection = db.collection('receipts');

      const receipt = await receiptsCollection.findOne({ orderId });

      if (!receipt) {
        return null;
      }

      // Generate different format if requested
      if (options.format && options.format !== 'json') {
        const order = await this.getOrderForReceipt(tenantId, orderId);
        if (!order) {
          throw new Error('Order not found for receipt');
        }

        const formattedData = await this.formatReceiptData(
          tenantId,
          order,
          options.format,
          options.includeQRCode
        );

        return {
          ...receipt,
          data: formattedData,
        };
      }

      return receipt;

    } catch (error) {
      logger.error('Get receipt error', {
        tenantId,
        orderId,
        options,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Generate new receipt for order
   */
  async generateReceipt(
    tenantId: string,
    orderId: string,
    options: {
      format?: string;
      template?: string;
      includeQRCode?: boolean;
      generatedBy: string;
    }
  ): Promise<Receipt> {
    try {
      const db = await getTenantDatabase(tenantId);
      const receiptsCollection = db.collection('receipts');
      const historyCollection = db.collection('receipt_history');

      const order = await this.getOrderForReceipt(tenantId, orderId);
      if (!order) {
        throw new Error('Order not found');
      }

      const { format = 'json', template = 'default', includeQRCode = true } = options;

      // Generate receipt data based on format
      const receiptData = await this.formatReceiptData(
        tenantId,
        order,
        format,
        includeQRCode,
        template
      );

      const receipt: Receipt = {
        id: require('uuid').v4(),
        orderId,
        orderNumber: order.orderNumber,
        format,
        template,
        data: receiptData,
        generatedBy: options.generatedBy,
        generatedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Save or update receipt
      await receiptsCollection.replaceOne(
        { orderId },
        receipt,
        { upsert: true }
      );

      // Record in history
      const historyEntry: ReceiptHistory = {
        id: require('uuid').v4(),
        orderId,
        action: 'generated',
        format,
        template,
        generatedBy: options.generatedBy,
        createdAt: new Date(),
      };

      await historyCollection.insertOne(historyEntry);

      logger.info('Receipt generated', {
        tenantId,
        orderId,
        receiptId: receipt.id,
        format,
        template,
      });

      return receipt;

    } catch (error) {
      logger.error('Generate receipt error', {
        tenantId,
        orderId,
        options,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Reprint existing receipt
   */
  async reprintReceipt(
    tenantId: string,
    orderId: string,
    options: {
      format?: string;
      reason?: string;
      reprintedBy: string;
    }
  ): Promise<Receipt> {
    try {
      const db = await getTenantDatabase(tenantId);
      const receiptsCollection = db.collection('receipts');
      const historyCollection = db.collection('receipt_history');

      let receipt = await receiptsCollection.findOne({ orderId });

      if (!receipt) {
        // Generate new receipt if none exists
        receipt = await this.generateReceipt(tenantId, orderId, {
          generatedBy: options.reprintedBy,
        });
      }

      const { format = receipt.format, reason } = options;

      // Generate in requested format if different
      if (format !== receipt.format) {
        const order = await this.getOrderForReceipt(tenantId, orderId);
        if (!order) {
          throw new Error('Order not found for receipt');
        }

        const formattedData = await this.formatReceiptData(
          tenantId,
          order,
          format,
          true,
          receipt.template
        );

        receipt.data = formattedData;
      }

      // Record reprint in history
      const historyEntry: ReceiptHistory = {
        id: require('uuid').v4(),
        orderId,
        action: 'reprinted',
        format,
        template: receipt.template,
        reason,
        generatedBy: options.reprintedBy,
        createdAt: new Date(),
      };

      await historyCollection.insertOne(historyEntry);

      logger.info('Receipt reprinted', {
        tenantId,
        orderId,
        format,
        reason,
        reprintedBy: options.reprintedBy,
      });

      return receipt;

    } catch (error) {
      logger.error('Reprint receipt error', {
        tenantId,
        orderId,
        options,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Email receipt to customer
   */
  async emailReceipt(
    tenantId: string,
    orderId: string,
    options: {
      email: string;
      customerName?: string;
      format?: string;
      sentBy: string;
    }
  ): Promise<{ success: boolean; messageId?: string }> {
    try {
      const db = await getTenantDatabase(tenantId);
      const historyCollection = db.collection('receipt_history');

      const { email, customerName, format = 'pdf' } = options;

      // Get or generate receipt
      let receipt = await this.getReceipt(tenantId, orderId, { format });

      if (!receipt) {
        receipt = await this.generateReceipt(tenantId, orderId, {
          format,
          generatedBy: options.sentBy,
        });
      }

      // Get tenant settings for email customization
      const settings = await this.getReceiptSettings(tenantId);

      const subject = `Receipt for Order #${receipt.orderNumber}`;
      const htmlContent = this.generateEmailTemplate(receipt, customerName, settings);

      let attachment;
      if (format === 'pdf') {
        attachment = {
          filename: `receipt-${receipt.orderNumber}.pdf`,
          content: receipt.data,
          contentType: 'application/pdf',
        };
      }

      const result = await this.emailService.sendEmail({
        to: email,
        subject,
        html: htmlContent,
        attachments: attachment ? [attachment] : undefined,
      });

      // Record in history
      const historyEntry: ReceiptHistory = {
        id: require('uuid').v4(),
        orderId,
        action: 'emailed',
        format,
        template: receipt.template,
        email,
        generatedBy: options.sentBy,
        createdAt: new Date(),
      };

      await historyCollection.insertOne(historyEntry);

      logger.info('Receipt emailed', {
        tenantId,
        orderId,
        email,
        format,
        success: result.success,
      });

      return result;

    } catch (error) {
      logger.error('Email receipt error', {
        tenantId,
        orderId,
        options,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Send receipt via SMS
   */
  async smsReceipt(
    tenantId: string,
    orderId: string,
    options: {
      phone: string;
      customerName?: string;
      sentBy: string;
    }
  ): Promise<{ success: boolean; messageId?: string }> {
    try {
      const db = await getTenantDatabase(tenantId);
      const historyCollection = db.collection('receipt_history');

      const { phone, customerName } = options;

      // Get or generate receipt
      let receipt = await this.getReceipt(tenantId, orderId);

      if (!receipt) {
        receipt = await this.generateReceipt(tenantId, orderId, {
          generatedBy: options.sentBy,
        });
      }

      // Generate receipt URL for SMS
      const receiptUrl = await this.generateReceiptUrl(tenantId, orderId);

      const message = this.generateSMSMessage(receipt, customerName, receiptUrl);

      const result = await this.smsService.sendSMS({
        to: phone,
        message,
      });

      // Record in history
      const historyEntry: ReceiptHistory = {
        id: require('uuid').v4(),
        orderId,
        action: 'sms_sent',
        format: 'link',
        template: receipt.template,
        phone,
        generatedBy: options.sentBy,
        createdAt: new Date(),
      };

      await historyCollection.insertOne(historyEntry);

      logger.info('Receipt sent via SMS', {
        tenantId,
        orderId,
        phone,
        success: result.success,
      });

      return result;

    } catch (error) {
      logger.error('SMS receipt error', {
        tenantId,
        orderId,
        options,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get receipt generation history
   */
  async getReceiptHistory(tenantId: string, orderId: string): Promise<ReceiptHistory[]> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('receipt_history');

      const history = await collection
        .find({ orderId })
        .sort({ createdAt: -1 })
        .toArray();

      return history;

    } catch (error) {
      logger.error('Get receipt history error', {
        tenantId,
        orderId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get available receipt templates
   */
  async getReceiptTemplates(tenantId: string): Promise<ReceiptTemplate[]> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('receipt_templates');

      const templates = await collection
        .find({ isActive: true })
        .sort({ name: 1 })
        .toArray();

      // Include default templates if none exist
      if (templates.length === 0) {
        return this.getDefaultTemplates();
      }

      return templates;

    } catch (error) {
      logger.error('Get receipt templates error', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Create custom receipt template
   */
  async createReceiptTemplate(
    tenantId: string,
    data: Omit<ReceiptTemplate, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<ReceiptTemplate> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('receipt_templates');

      // Check for duplicate name
      const existingTemplate = await collection.findOne({
        name: { $regex: new RegExp(`^${data.name}$`, 'i') },
      });

      if (existingTemplate) {
        throw new Error('Template name already exists');
      }

      const template = {
        id: require('uuid').v4(),
        ...data,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as ReceiptTemplate;

      await collection.insertOne(template);

      logger.info('Receipt template created', {
        tenantId,
        templateId: template.id,
        name: template.name,
      });

      return template;

    } catch (error) {
      logger.error('Create receipt template error', {
        tenantId,
        data,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Update receipt template
   */
  async updateReceiptTemplate(
    tenantId: string,
    templateId: string,
    updates: Partial<Omit<ReceiptTemplate, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<void> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('receipt_templates');

      // Check for duplicate name if being updated
      if (updates.name) {
        const existingTemplate = await collection.findOne({
          name: { $regex: new RegExp(`^${updates.name}$`, 'i') },
          id: { $ne: templateId },
        });

        if (existingTemplate) {
          throw new Error('Template name already exists');
        }
      }

      const updateData = {
        ...updates,
        updatedAt: new Date(),
      };

      const result = await collection.updateOne(
        { id: templateId },
        { $set: updateData }
      );

      if (result.matchedCount === 0) {
        throw new Error('Template not found');
      }

      logger.info('Receipt template updated', {
        tenantId,
        templateId,
        updates: Object.keys(updates),
      });

    } catch (error) {
      logger.error('Update receipt template error', {
        tenantId,
        templateId,
        updates,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get receipt settings
   */
  async getReceiptSettings(tenantId: string): Promise<ReceiptSettings> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('receipt_settings');

      const settings = await collection.findOne({});

      if (!settings) {
        return this.getDefaultReceiptSettings();
      }

      return settings;

    } catch (error) {
      logger.error('Get receipt settings error', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Update receipt settings
   */
  async updateReceiptSettings(
    tenantId: string,
    updates: Partial<Omit<ReceiptSettings, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<void> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('receipt_settings');

      const updateData = {
        ...updates,
        updatedAt: new Date(),
      };

      await collection.replaceOne(
        {},
        { id: require('uuid').v4(), ...updateData, createdAt: new Date() },
        { upsert: true }
      );

      logger.info('Receipt settings updated', {
        tenantId,
        updates: Object.keys(updates),
      });

    } catch (error) {
      logger.error('Update receipt settings error', {
        tenantId,
        updates,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get order data for receipt generation
   */
  private async getOrderForReceipt(tenantId: string, orderId: string): Promise<Order | null> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('orders');

      const order = await collection.findOne({ id: orderId });
      return order;

    } catch (error) {
      logger.error('Get order for receipt error', {
        tenantId,
        orderId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Format receipt data based on format type
   */
  private async formatReceiptData(
    tenantId: string,
    order: Order,
    format: string,
    includeQRCode: boolean = true,
    template: string = 'default'
  ): Promise<any> {
    try {
      const settings = await this.getReceiptSettings(tenantId);

      // Base receipt data
      const receiptData: Record<string, any> = {
        order,
        settings,
        generatedAt: new Date(),
      };

      // Add QR code if requested
      if (includeQRCode) {
        const qrData = JSON.stringify({
          orderId: (order as any).id,
          orderNumber: (order as any).orderNumber,
          total: (order as any).total || (order as any).grandTotal || 0,
          date: (order as any).createdAt,
        });

        const qrCode = await QRCode.toDataURL(qrData);
        receiptData.qrCode = qrCode;
      }

      switch (format.toLowerCase()) {
        case 'json':
          return receiptData;

        case 'html':
          return this.generateHTMLReceipt(receiptData, template);

        case 'pdf':
          return await this.generatePDFReceipt(receiptData, template);

        case 'thermal':
          return this.generateThermalReceipt(receiptData, template);

        default:
          return receiptData;
      }

    } catch (error) {
      logger.error('Format receipt data error', {
        tenantId,
        orderId: order.id,
        format,
        template,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Generate HTML receipt
   */
  private generateHTMLReceipt(data: any, template: string): string {
    const { order, settings, qrCode } = data;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Receipt - ${order.orderNumber}</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 400px; margin: 0 auto; }
          .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 10px; }
          .order-info { margin-bottom: 20px; }
          .items { border-bottom: 1px solid #ddd; padding-bottom: 10px; margin-bottom: 10px; }
          .item { display: flex; justify-content: space-between; margin-bottom: 5px; }
          .totals { font-weight: bold; }
          .footer { text-align: center; margin-top: 20px; }
          .qr-code { text-align: center; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>${settings.businessName || 'Business Name'}</h2>
          <p>${settings.address || 'Business Address'}</p>
          <p>Phone: ${settings.phone || 'N/A'}</p>
        </div>

        <div class="order-info">
          <p><strong>Order #:</strong> ${order.orderNumber}</p>
          <p><strong>Date:</strong> ${new Date(order.createdAt).toLocaleString()}</p>
          <p><strong>Cashier:</strong> ${order.cashierName || 'N/A'}</p>
          ${order.customer ? `<p><strong>Customer:</strong> ${order.customer.name}</p>` : ''}
        </div>

        <div class="items">
          ${order.items.map((item: any) => `
            <div class="item">
              <span>${item.name} x${item.quantity}</span>
              <span>$${item.total.toFixed(2)}</span>
            </div>
          `).join('')}
        </div>

        <div class="totals">
          <div class="item">
            <span>Subtotal:</span>
            <span>$${order.subtotal.toFixed(2)}</span>
          </div>
          <div class="item">
            <span>Tax:</span>
            <span>$${order.tax.toFixed(2)}</span>
          </div>
          <div class="item">
            <span>Total:</span>
            <span>$${order.total.toFixed(2)}</span>
          </div>
        </div>

        ${qrCode ? `
          <div class="qr-code">
            <img src="${qrCode}" alt="Order QR Code" style="max-width: 150px;">
          </div>
        ` : ''}

        <div class="footer">
          <p>Thank you for your business!</p>
          <p>${settings.footerMessage || 'Please visit again soon.'}</p>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate PDF receipt using PDFKit for thermal receipt printers (80mm width)
   */
  private async generatePDFReceipt(data: any, _template: string): Promise<Buffer> {
    const { order, settings, qrCode } = data;

    const pageWidth = 226; // 80mm thermal receipt width in points
    const margin = 10;
    const contentWidth = pageWidth - margin * 2;

    return new Promise<Buffer>((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: [pageWidth, 800],
          margins: { top: 10, bottom: 10, left: margin, right: margin },
          bufferPages: true,
        });

        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', (err: Error) => reject(err));

        // Helper: draw a dashed separator line
        const drawSeparator = () => {
          const y = doc.y;
          doc
            .strokeColor('#000000')
            .lineWidth(0.5)
            .moveTo(margin, y)
            .lineTo(pageWidth - margin, y)
            .dash(2, { space: 2 })
            .stroke()
            .undash();
          doc.y = y + 6;
        };

        // Helper: draw a text row with left and right aligned text
        const drawRow = (left: string, right: string, fontSize: number, bold: boolean = false) => {
          const font = bold ? 'Helvetica-Bold' : 'Helvetica';
          doc.font(font).fontSize(fontSize);
          const rightWidth = doc.widthOfString(right);
          const leftMaxWidth = contentWidth - rightWidth - 4;
          const y = doc.y;
          doc.text(left, margin, y, { width: leftMaxWidth, lineBreak: false });
          doc.text(right, margin, y, { width: contentWidth, align: 'right' });
          doc.y = y + fontSize + 3;
        };

        // --- 1. Business Header ---
        const businessName = settings.businessName || 'Business Name';
        doc
          .font('Helvetica-Bold')
          .fontSize(14)
          .text(businessName, margin, doc.y, { width: contentWidth, align: 'center' });
        doc.moveDown(0.2);

        const address = settings.address || '';
        if (address) {
          doc.font('Helvetica').fontSize(8).text(address, margin, doc.y, { width: contentWidth, align: 'center' });
        }

        const phone = settings.phone || '';
        if (phone) {
          doc.font('Helvetica').fontSize(8).text(`Phone: ${phone}`, margin, doc.y, { width: contentWidth, align: 'center' });
        }

        const email = settings.email || '';
        if (email) {
          doc.font('Helvetica').fontSize(8).text(email, margin, doc.y, { width: contentWidth, align: 'center' });
        }

        doc.moveDown(0.3);

        // --- 2. Separator ---
        drawSeparator();

        // --- 3. Order Info ---
        const orderNumber = order.orderNumber || order.id || 'N/A';
        doc.font('Helvetica').fontSize(9);
        doc.text(`Order #: ${orderNumber}`, margin, doc.y, { width: contentWidth });

        const orderDate = order.createdAt ? new Date(order.createdAt).toLocaleString() : 'N/A';
        doc.text(`Date: ${orderDate}`, margin, doc.y, { width: contentWidth });

        const cashier = order.cashierName || order.cashier || 'N/A';
        doc.text(`Cashier: ${cashier}`, margin, doc.y, { width: contentWidth });

        const orderType = order.orderType || order.type || '';
        if (orderType) {
          doc.text(`Type: ${orderType}`, margin, doc.y, { width: contentWidth });
        }

        const table = order.tableName || order.table || '';
        if (table) {
          doc.text(`Table: ${table}`, margin, doc.y, { width: contentWidth });
        }

        const customerName = order.customer?.name || order.customerName || '';
        if (customerName) {
          doc.text(`Customer: ${customerName}`, margin, doc.y, { width: contentWidth });
        }

        doc.moveDown(0.3);

        // --- 4. Separator ---
        drawSeparator();

        // --- 5. Column Headers ---
        doc.font('Helvetica-Bold').fontSize(8);
        const headerY = doc.y;
        doc.text('Item', margin, headerY, { width: contentWidth * 0.55, lineBreak: false });
        doc.text('Qty', margin + contentWidth * 0.55, headerY, { width: contentWidth * 0.15, align: 'center', lineBreak: false });
        doc.text('Amount', margin + contentWidth * 0.7, headerY, { width: contentWidth * 0.3, align: 'right' });
        doc.y = headerY + 11;
        doc.moveDown(0.1);

        // --- 6. Line Items ---
        const items = order.items || [];
        items.forEach((item: any) => {
          const itemName = item.productName || item.name || 'Item';
          const qty = item.quantity || 1;
          const itemTotal = (item.totalPrice || item.total || 0);

          doc.font('Helvetica').fontSize(8);
          const itemY = doc.y;
          doc.text(itemName, margin, itemY, { width: contentWidth * 0.55, lineBreak: false });
          doc.text(String(qty), margin + contentWidth * 0.55, itemY, { width: contentWidth * 0.15, align: 'center', lineBreak: false });
          doc.text(`$${Number(itemTotal).toFixed(2)}`, margin + contentWidth * 0.7, itemY, { width: contentWidth * 0.3, align: 'right' });
          doc.y = itemY + 10;

          // Modifiers
          const modifiers = item.modifiers || item.modifications || [];
          if (modifiers.length > 0) {
            modifiers.forEach((mod: any) => {
              const modName = mod.name || mod.label || 'Modifier';
              const modPrice = mod.price || mod.amount || 0;
              const modText = modPrice > 0 ? `  + ${modName} ($${Number(modPrice).toFixed(2)})` : `  + ${modName}`;
              doc.font('Helvetica').fontSize(7).text(modText, margin, doc.y, { width: contentWidth });
            });
          }
        });

        doc.moveDown(0.3);

        // --- 7. Separator ---
        drawSeparator();

        // --- 8. Totals ---
        const subtotal = order.subtotal || 0;
        drawRow('Subtotal:', `$${Number(subtotal).toFixed(2)}`, 9);

        const discount = order.discount || order.discountAmount || 0;
        if (discount > 0) {
          drawRow('Discount:', `-$${Number(discount).toFixed(2)}`, 9);
        }

        const tax = order.tax || order.taxAmount || 0;
        const taxRate = order.taxRate || '';
        const taxLabel = taxRate ? `Tax (${taxRate}%):` : 'Tax:';
        drawRow(taxLabel, `$${Number(tax).toFixed(2)}`, 9);

        const total = order.total || order.grandTotal || 0;
        doc.moveDown(0.1);
        drawRow('TOTAL:', `$${Number(total).toFixed(2)}`, 11, true);

        doc.moveDown(0.3);

        // --- 9. Payment Info ---
        const payments = order.payments || [];
        if (payments.length > 0) {
          drawSeparator();
          doc.font('Helvetica-Bold').fontSize(9).text('Payment', margin, doc.y, { width: contentWidth });
          doc.moveDown(0.1);
          payments.forEach((payment: any) => {
            const method = payment.method || payment.paymentMethod || 'N/A';
            const amount = payment.amount || 0;
            const status = payment.status || '';
            drawRow(method, `$${Number(amount).toFixed(2)}`, 8);
            if (status) {
              doc.font('Helvetica').fontSize(7).text(`  Status: ${status}`, margin, doc.y, { width: contentWidth });
            }
          });
        } else {
          // Fallback: single payment info from order level
          const paymentMethod = order.paymentMethod || order.paymentType || '';
          const paymentStatus = order.paymentStatus || order.status || '';
          if (paymentMethod) {
            drawSeparator();
            doc.font('Helvetica-Bold').fontSize(9).text('Payment', margin, doc.y, { width: contentWidth });
            doc.moveDown(0.1);
            drawRow(paymentMethod, `$${Number(total).toFixed(2)}`, 8);
            if (paymentStatus) {
              doc.font('Helvetica').fontSize(7).text(`  Status: ${paymentStatus}`, margin, doc.y, { width: contentWidth });
            }
          }
        }

        doc.moveDown(0.3);

        // --- 10. QR Code ---
        if (qrCode) {
          try {
            const qrSize = 80;
            const qrX = (pageWidth - qrSize) / 2;
            doc.image(qrCode, qrX, doc.y, { width: qrSize, height: qrSize });
            doc.y += qrSize + 5;
          } catch (qrError) {
            logger.warn('Failed to embed QR code in PDF receipt', {
              error: qrError instanceof Error ? qrError.message : 'Unknown error',
            });
          }
        }

        doc.moveDown(0.3);

        // --- 11. Footer ---
        doc
          .font('Helvetica')
          .fontSize(8)
          .text('Thank you for your business!', margin, doc.y, { width: contentWidth, align: 'center' });

        const footerMessage = settings.footerMessage || '';
        if (footerMessage) {
          doc.text(footerMessage, margin, doc.y, { width: contentWidth, align: 'center' });
        }

        // Finalize PDF
        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Generate thermal printer receipt format
   */
  private generateThermalReceipt(data: any, template: string): string {
    const { order, settings } = data;

    let receipt = '';
    receipt += `${settings.businessName || 'BUSINESS NAME'}\n`;
    receipt += `${settings.address || 'Business Address'}\n`;
    receipt += `Phone: ${settings.phone || 'N/A'}\n`;
    receipt += '--------------------------------\n';
    receipt += `Order #: ${order.orderNumber}\n`;
    receipt += `Date: ${new Date(order.createdAt).toLocaleString()}\n`;
    receipt += `Cashier: ${order.cashierName || 'N/A'}\n`;

    if (order.customer) {
      receipt += `Customer: ${order.customer.name}\n`;
    }

    receipt += '--------------------------------\n';

    order.items.forEach((item: any) => {
      receipt += `${item.name}\n`;
      receipt += `  ${item.quantity} x $${item.price.toFixed(2)} = $${item.total.toFixed(2)}\n`;
    });

    receipt += '--------------------------------\n';
    receipt += `Subtotal:          $${order.subtotal.toFixed(2)}\n`;
    receipt += `Tax:               $${order.tax.toFixed(2)}\n`;
    receipt += `TOTAL:             $${order.total.toFixed(2)}\n`;
    receipt += '--------------------------------\n';
    receipt += 'Thank you for your business!\n';
    receipt += settings.footerMessage || 'Please visit again soon.\n';

    return receipt;
  }

  /**
   * Generate email template for receipt
   */
  private generateEmailTemplate(receipt: Receipt, customerName?: string, settings?: ReceiptSettings): string {
    return `
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; }
          .container { max-width: 600px; margin: 0 auto; }
          .header { text-align: center; color: #333; }
          .content { margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>${settings?.businessName || 'Receipt'}</h2>
          </div>
          <div class="content">
            <p>Dear ${customerName || 'Valued Customer'},</p>
            <p>Thank you for your purchase! Please find your receipt attached to this email.</p>
            <p><strong>Order Number:</strong> ${receipt.orderNumber}</p>
            <p>If you have any questions about your order, please don't hesitate to contact us.</p>
            <p>Thank you for choosing ${settings?.businessName || 'us'}!</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate SMS message for receipt
   */
  private generateSMSMessage(receipt: Receipt, customerName?: string, receiptUrl?: string): string {
    let message = `Hi ${customerName || 'there'}! `;
    message += `Your receipt for order #${receipt.orderNumber} is ready.`;

    if (receiptUrl) {
      message += ` View it here: ${receiptUrl}`;
    }

    message += ' Thank you for your business!';

    return message;
  }

  /**
   * Generate receipt URL for viewing
   */
  private async generateReceiptUrl(tenantId: string, orderId: string): Promise<string> {
    // In a real implementation, this would generate a secure, time-limited URL
    // For now, return a placeholder URL
    return `${process.env.FRONTEND_URL}/receipts/${orderId}?tenant=${tenantId}`;
  }

  /**
   * Get default receipt templates
   */
  private getDefaultTemplates(): ReceiptTemplate[] {
    return [
      {
        id: 'default',
        name: 'Default',
        description: 'Standard receipt template',
        content: '<!-- Default template -->',
        isActive: true,
        createdBy: 'system',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'minimal',
        name: 'Minimal',
        description: 'Clean, minimal receipt design',
        content: '<!-- Minimal template -->',
        isActive: true,
        createdBy: 'system',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
  }

  /**
   * Get default receipt settings
   */
  private getDefaultReceiptSettings(): ReceiptSettings {
    return {
      id: 'default',
      businessName: 'Your Business',
      address: '123 Business St, City, State 12345',
      phone: '(555) 123-4567',
      email: 'info@yourbusiness.com',
      website: 'www.yourbusiness.com',
      footerMessage: 'Thank you for your business!',
      showQRCode: true,
      showItemDetails: true,
      showTaxDetails: true,
      defaultTemplate: 'default',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}