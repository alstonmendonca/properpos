# Missing Features Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement PDF receipt generation, full CRUD bulk operations, and enhanced inventory forecasting with frontend visualization.

**Architecture:** Three independent features added to existing microservices. PDF receipts use PDFKit in the POS service. Bulk operations add endpoints to POS service (products/orders/customers) with shared frontend components. Inventory forecasting replaces basic moving average with WMA + exponential smoothing in the inventory service, with recharts visualization on the frontend.

**Tech Stack:** PDFKit (PDF), Express.js + MongoDB (backend), React + recharts (frontend), TypeScript throughout.

---

## Feature 1: PDF Receipt Generation

### Task 1: Install PDFKit and implement PDF generation

**Files:**
- Modify: `backend/services/pos/package.json` — add pdfkit dependency
- Modify: `backend/services/pos/src/services/ReceiptService.ts:807-813` — replace placeholder

**Step 1: Install pdfkit**

Run: `cd /Users/alstondanielmendonca/Desktop/properpos-saas/backend/services/pos && npm install pdfkit @types/pdfkit`

**Step 2: Replace the placeholder `generatePDFReceipt` method**

In `backend/services/pos/src/services/ReceiptService.ts`, add the import at the top (after the QRCode import on line 3):

```typescript
import PDFDocument from 'pdfkit';
```

Then replace the method at lines 807-813 with:

```typescript
  /**
   * Generate PDF receipt using PDFKit
   */
  private async generatePDFReceipt(data: any, template: string): Promise<Buffer> {
    const { order, settings, qrCode } = data;

    return new Promise((resolve, reject) => {
      try {
        // 80mm thermal receipt width = ~226 points
        const pageWidth = 226;
        const margin = 12;
        const contentWidth = pageWidth - margin * 2;

        const doc = new PDFDocument({
          size: [pageWidth, 800],
          margins: { top: margin, bottom: margin, left: margin, right: margin },
          bufferPages: true,
        });

        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        let y = margin;

        // --- Header: Business Info ---
        doc.fontSize(14).font('Helvetica-Bold');
        doc.text(settings.businessName || 'Business Name', margin, y, {
          width: contentWidth,
          align: 'center',
        });
        y += 20;

        doc.fontSize(8).font('Helvetica');
        if (settings.address) {
          doc.text(settings.address, margin, y, { width: contentWidth, align: 'center' });
          y += 12;
        }
        if (settings.phone) {
          doc.text(`Phone: ${settings.phone}`, margin, y, { width: contentWidth, align: 'center' });
          y += 12;
        }
        if (settings.email) {
          doc.text(settings.email, margin, y, { width: contentWidth, align: 'center' });
          y += 12;
        }

        // --- Separator ---
        y += 4;
        doc.moveTo(margin, y).lineTo(pageWidth - margin, y).lineWidth(0.5).stroke();
        y += 8;

        // --- Order Info ---
        doc.fontSize(9).font('Helvetica-Bold');
        doc.text(`Order #${order.orderNumber}`, margin, y);
        y += 14;

        doc.fontSize(8).font('Helvetica');
        doc.text(`Date: ${new Date(order.createdAt).toLocaleString()}`, margin, y);
        y += 12;
        doc.text(`Cashier: ${order.cashierName || 'N/A'}`, margin, y);
        y += 12;
        if (order.orderType) {
          doc.text(`Type: ${order.orderType}`, margin, y);
          y += 12;
        }
        if (order.tableNumber) {
          doc.text(`Table: ${order.tableNumber}`, margin, y);
          y += 12;
        }
        if (order.customerInfo?.name) {
          doc.text(`Customer: ${order.customerInfo.name}`, margin, y);
          y += 12;
        }

        // --- Separator ---
        y += 4;
        doc.moveTo(margin, y).lineTo(pageWidth - margin, y).lineWidth(0.5).stroke();
        y += 8;

        // --- Column Headers ---
        doc.fontSize(8).font('Helvetica-Bold');
        doc.text('Item', margin, y, { width: contentWidth * 0.5 });
        doc.text('Qty', margin + contentWidth * 0.5, y, { width: contentWidth * 0.2, align: 'center' });
        doc.text('Amount', margin + contentWidth * 0.7, y, { width: contentWidth * 0.3, align: 'right' });
        y += 12;

        doc.moveTo(margin, y).lineTo(pageWidth - margin, y).lineWidth(0.3).dash(2, { space: 2 }).stroke();
        doc.undash();
        y += 6;

        // --- Line Items ---
        doc.font('Helvetica').fontSize(8);
        const items = order.items || [];
        for (const item of items) {
          const itemName = item.productName || item.name || 'Item';
          const qty = item.quantity || 0;
          const total = (item.totalPrice || item.total || 0);

          doc.text(itemName, margin, y, { width: contentWidth * 0.5 });
          doc.text(String(qty), margin + contentWidth * 0.5, y, { width: contentWidth * 0.2, align: 'center' });
          doc.text(`$${total.toFixed(2)}`, margin + contentWidth * 0.7, y, { width: contentWidth * 0.3, align: 'right' });
          y += 14;

          // Item modifiers
          if (item.modifiers && item.modifiers.length > 0) {
            for (const mod of item.modifiers) {
              doc.fontSize(7).text(`  + ${mod.name}`, margin, y, { width: contentWidth * 0.7 });
              if (mod.price > 0) {
                doc.text(`$${mod.price.toFixed(2)}`, margin + contentWidth * 0.7, y, { width: contentWidth * 0.3, align: 'right' });
              }
              y += 10;
            }
            doc.fontSize(8);
          }
        }

        // --- Separator ---
        y += 4;
        doc.moveTo(margin, y).lineTo(pageWidth - margin, y).lineWidth(0.5).stroke();
        y += 8;

        // --- Totals ---
        const subtotal = order.subtotal || 0;
        const tax = order.tax || 0;
        const total = order.total || 0;

        doc.font('Helvetica').fontSize(8);
        doc.text('Subtotal:', margin, y, { width: contentWidth * 0.6 });
        doc.text(`$${subtotal.toFixed(2)}`, margin + contentWidth * 0.6, y, { width: contentWidth * 0.4, align: 'right' });
        y += 14;

        if (order.discounts && order.discounts.length > 0) {
          for (const discount of order.discounts) {
            doc.text(`Discount (${discount.name}):`, margin, y, { width: contentWidth * 0.6 });
            doc.text(`-$${discount.totalDiscount.toFixed(2)}`, margin + contentWidth * 0.6, y, { width: contentWidth * 0.4, align: 'right' });
            y += 14;
          }
        }

        doc.text(`Tax${order.taxRate ? ` (${order.taxRate}%)` : ''}:`, margin, y, { width: contentWidth * 0.6 });
        doc.text(`$${tax.toFixed(2)}`, margin + contentWidth * 0.6, y, { width: contentWidth * 0.4, align: 'right' });
        y += 14;

        doc.moveTo(margin, y).lineTo(pageWidth - margin, y).lineWidth(0.3).dash(2, { space: 2 }).stroke();
        doc.undash();
        y += 6;

        doc.font('Helvetica-Bold').fontSize(11);
        doc.text('TOTAL:', margin, y, { width: contentWidth * 0.5 });
        doc.text(`$${total.toFixed(2)}`, margin + contentWidth * 0.5, y, { width: contentWidth * 0.5, align: 'right' });
        y += 18;

        // --- Payment Info ---
        if (order.payments && order.payments.length > 0) {
          doc.moveTo(margin, y).lineTo(pageWidth - margin, y).lineWidth(0.5).stroke();
          y += 8;

          doc.font('Helvetica').fontSize(8);
          for (const payment of order.payments) {
            const method = payment.method.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
            doc.text(`${method}:`, margin, y, { width: contentWidth * 0.6 });
            doc.text(`$${payment.amount.toFixed(2)}`, margin + contentWidth * 0.6, y, { width: contentWidth * 0.4, align: 'right' });
            y += 12;
          }
          doc.text(`Status: ${order.paymentStatus}`, margin, y);
          y += 14;
        }

        // --- QR Code ---
        if (qrCode) {
          y += 4;
          doc.moveTo(margin, y).lineTo(pageWidth - margin, y).lineWidth(0.5).stroke();
          y += 10;

          const qrSize = 80;
          const qrX = (pageWidth - qrSize) / 2;
          doc.image(qrCode, qrX, y, { width: qrSize, height: qrSize });
          y += qrSize + 10;
        }

        // --- Footer ---
        doc.font('Helvetica').fontSize(8);
        doc.text('Thank you for your business!', margin, y, { width: contentWidth, align: 'center' });
        y += 12;
        if (settings.footerMessage) {
          doc.text(settings.footerMessage, margin, y, { width: contentWidth, align: 'center' });
          y += 12;
        }

        // Trim the page to actual content height
        const pages = doc.bufferedPageRange();
        if (pages.count > 0) {
          doc.switchToPage(0);
        }

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }
```

**Step 3: Verify the build compiles**

Run: `cd /Users/alstondanielmendonca/Desktop/properpos-saas && npm run build:pos`
Expected: Successful compilation with no errors.

**Step 4: Commit**

```bash
git add backend/services/pos/package.json backend/services/pos/package-lock.json backend/services/pos/src/services/ReceiptService.ts
git commit -m "feat(pos): implement PDF receipt generation with PDFKit

Replace placeholder generatePDFReceipt with full PDFKit implementation
supporting 80mm thermal receipt format with business header, line items,
totals, payment info, QR code, and customizable footer."
```

---

## Feature 2: Bulk Operations

### Task 2: Add bulk delete and export methods to ProductService

**Files:**
- Modify: `backend/services/pos/src/services/ProductService.ts` — add methods after bulkUpdateProducts (line ~679)

**Step 1: Add bulkDeleteProducts and bulkExportProducts methods**

After the closing brace of `bulkUpdateProducts` (around line 679), add:

```typescript
  /**
   * Bulk delete (deactivate) products
   */
  async bulkDeleteProducts(
    tenantId: string,
    productIds: string[],
    options: { reason: string; deletedBy: string }
  ): Promise<{ matchedCount: number; modifiedCount: number }> {
    try {
      const db = await getTenantDatabase(tenantId);

      const result = await db.collection('products').updateMany(
        { id: { $in: productIds } },
        {
          $set: {
            isActive: false,
            deactivatedAt: new Date(),
            deactivatedBy: options.deletedBy,
            deactivationReason: options.reason,
            updatedAt: new Date(),
          },
        }
      );

      await Promise.all(
        productIds.map(productId => this.clearProductCache(tenantId, productId))
      );

      logger.audit('Products bulk deleted', {
        tenantId,
        productIds,
        deletedCount: result.modifiedCount,
        reason: options.reason,
        deletedBy: options.deletedBy,
      });

      return {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      };
    } catch (error) {
      logger.error('Failed to bulk delete products', {
        tenantId,
        productIds,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new ApiError('Failed to bulk delete products', 'BULK_DELETE_FAILED', 500);
    }
  }

  /**
   * Bulk export products to CSV format
   */
  async bulkExportProducts(
    tenantId: string,
    productIds: string[]
  ): Promise<string> {
    try {
      const db = await getTenantDatabase(tenantId);

      const query: any = productIds.length > 0
        ? { id: { $in: productIds } }
        : {};

      const products = await db.collection('products')
        .find(query)
        .sort({ name: 1 })
        .toArray();

      const headers = ['ID', 'Name', 'SKU', 'Category', 'Price', 'Cost', 'Status', 'Created At'];
      const rows = products.map((p: any) => [
        p.id,
        `"${(p.name || '').replace(/"/g, '""')}"`,
        p.sku || '',
        p.categoryName || p.category || '',
        p.price || 0,
        p.cost || 0,
        p.isActive ? 'active' : 'inactive',
        p.createdAt ? new Date(p.createdAt).toISOString() : '',
      ].join(','));

      return [headers.join(','), ...rows].join('\n');
    } catch (error) {
      logger.error('Failed to bulk export products', {
        tenantId,
        productIds,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new ApiError('Failed to export products', 'BULK_EXPORT_FAILED', 500);
    }
  }
```

**Step 2: Verify build**

Run: `npm run build:pos`

**Step 3: Commit**

```bash
git add backend/services/pos/src/services/ProductService.ts
git commit -m "feat(pos): add bulk delete and export methods to ProductService"
```

---

### Task 3: Add bulk product routes

**Files:**
- Modify: `backend/services/pos/src/routes/products.ts` — add routes after existing bulk-update route

**Step 1: Add bulk-delete and bulk-export routes**

After the existing `bulk-update` route (around line 480), add:

```typescript
/**
 * @swagger
 * /api/v1/products/bulk-delete:
 *   post:
 *     tags: [Products]
 *     summary: Bulk deactivate products
 */
productRoutes.post('/bulk-delete',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  requirePermissions([Permissions.PRODUCT_UPDATE]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { productIds, reason = 'Bulk deactivation' } = req.body;

    if (!Array.isArray(productIds) || productIds.length === 0) {
      res.status(400).json(createErrorResponse('Product IDs array is required', 'INVALID_PRODUCT_IDS'));
      return;
    }

    if (productIds.length > 100) {
      res.status(400).json(createErrorResponse('Maximum 100 products per request', 'TOO_MANY_ITEMS'));
      return;
    }

    try {
      const result = await productService.bulkDeleteProducts(tenantId, productIds, {
        reason,
        deletedBy: user.id,
      });

      logger.audit('Products bulk deleted', {
        tenantId,
        productIds,
        deletedCount: result.modifiedCount,
        reason,
        deletedBy: user.id,
        ip: req.ip,
      });

      res.json(createResponse(result, 'Products deactivated successfully'));
    } catch (error) {
      logger.error('Bulk delete products error', {
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
 * /api/v1/products/bulk-export:
 *   post:
 *     tags: [Products]
 *     summary: Export selected products to CSV
 */
productRoutes.post('/bulk-export',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const { productIds = [] } = req.body;

    try {
      const csv = await productService.bulkExportProducts(tenantId, productIds);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="products-export.csv"');
      res.send(csv);
    } catch (error) {
      logger.error('Bulk export products error', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
);
```

**Step 2: Verify build**

Run: `npm run build:pos`

**Step 3: Commit**

```bash
git add backend/services/pos/src/routes/products.ts
git commit -m "feat(pos): add bulk delete and export routes for products"
```

---

### Task 4: Add bulk methods to OrderService

**Files:**
- Modify: `backend/services/pos/src/services/OrderService.ts` — add methods at end of class

**Step 1: Add bulkUpdateStatus, bulkCancel, and bulkExport methods**

Add before the class closing brace:

```typescript
  /**
   * Bulk update order status
   */
  async bulkUpdateStatus(
    tenantId: string,
    orderIds: string[],
    newStatus: string,
    options: { updatedBy: string }
  ): Promise<{ matchedCount: number; modifiedCount: number; errors: Array<{ orderId: string; error: string }> }> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('orders');
      const errors: Array<{ orderId: string; error: string }> = [];
      let modifiedCount = 0;

      for (const orderId of orderIds) {
        const order = await collection.findOne({ id: orderId });
        if (!order) {
          errors.push({ orderId, error: 'Order not found' });
          continue;
        }

        const validTransitions = VALID_TRANSITIONS[order.status] || [];
        if (!validTransitions.includes(newStatus)) {
          errors.push({ orderId, error: `Cannot transition from ${order.status} to ${newStatus}` });
          continue;
        }

        await collection.updateOne(
          { id: orderId },
          {
            $set: {
              status: newStatus,
              updatedAt: new Date(),
              updatedBy: options.updatedBy,
            },
          }
        );
        modifiedCount++;
      }

      logger.audit('Orders bulk status updated', {
        tenantId,
        orderIds,
        newStatus,
        modifiedCount,
        errorCount: errors.length,
        updatedBy: options.updatedBy,
      });

      return { matchedCount: orderIds.length, modifiedCount, errors };
    } catch (error) {
      logger.error('Failed to bulk update order status', {
        tenantId,
        orderIds,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Bulk cancel orders
   */
  async bulkCancel(
    tenantId: string,
    orderIds: string[],
    options: { reason: string; cancelledBy: string }
  ): Promise<{ matchedCount: number; modifiedCount: number; errors: Array<{ orderId: string; error: string }> }> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('orders');
      const errors: Array<{ orderId: string; error: string }> = [];
      let modifiedCount = 0;

      for (const orderId of orderIds) {
        const order = await collection.findOne({ id: orderId });
        if (!order) {
          errors.push({ orderId, error: 'Order not found' });
          continue;
        }

        if (order.status === 'completed' || order.status === 'cancelled') {
          errors.push({ orderId, error: `Cannot cancel order in ${order.status} status` });
          continue;
        }

        await collection.updateOne(
          { id: orderId },
          {
            $set: {
              status: 'cancelled',
              cancelledAt: new Date(),
              cancelledBy: options.cancelledBy,
              cancellationReason: options.reason,
              updatedAt: new Date(),
            },
          }
        );
        modifiedCount++;
      }

      logger.audit('Orders bulk cancelled', {
        tenantId,
        orderIds,
        reason: options.reason,
        modifiedCount,
        errorCount: errors.length,
        cancelledBy: options.cancelledBy,
      });

      return { matchedCount: orderIds.length, modifiedCount, errors };
    } catch (error) {
      logger.error('Failed to bulk cancel orders', {
        tenantId,
        orderIds,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Bulk export orders to CSV
   */
  async bulkExportOrders(
    tenantId: string,
    orderIds: string[]
  ): Promise<string> {
    try {
      const db = await getTenantDatabase(tenantId);

      const query: any = orderIds.length > 0
        ? { id: { $in: orderIds } }
        : {};

      const orders = await db.collection('orders')
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();

      const headers = ['Order Number', 'Date', 'Customer', 'Type', 'Status', 'Payment Status', 'Subtotal', 'Tax', 'Total', 'Cashier'];
      const rows = orders.map((o: any) => [
        o.orderNumber,
        o.createdAt ? new Date(o.createdAt).toISOString() : '',
        `"${(o.customerInfo?.name || '').replace(/"/g, '""')}"`,
        o.orderType || '',
        o.status,
        o.paymentStatus,
        o.subtotal || 0,
        o.tax || 0,
        o.total || 0,
        `"${(o.cashierName || '').replace(/"/g, '""')}"`,
      ].join(','));

      return [headers.join(','), ...rows].join('\n');
    } catch (error) {
      logger.error('Failed to bulk export orders', {
        tenantId,
        orderIds,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
```

**Step 2: Verify build**

Run: `npm run build:pos`

**Step 3: Commit**

```bash
git add backend/services/pos/src/services/OrderService.ts
git commit -m "feat(pos): add bulk status update, cancel, and export to OrderService"
```

---

### Task 5: Add bulk order routes

**Files:**
- Modify: `backend/services/pos/src/routes/orders.ts` — add routes at end before module export

**Step 1: Add bulk-status, bulk-cancel, and bulk-export routes**

Add before the end of the file:

```typescript
/**
 * @swagger
 * /api/v1/orders/bulk-status:
 *   post:
 *     tags: [Orders]
 *     summary: Bulk update order status
 */
orderRoutes.post('/bulk-status',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  requirePermissions([Permissions.ORDER_UPDATE]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { orderIds, status } = req.body;

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      res.status(400).json(createErrorResponse('Order IDs array is required', 'INVALID_ORDER_IDS'));
      return;
    }

    if (orderIds.length > 100) {
      res.status(400).json(createErrorResponse('Maximum 100 orders per request', 'TOO_MANY_ITEMS'));
      return;
    }

    if (!status) {
      res.status(400).json(createErrorResponse('Status is required', 'STATUS_REQUIRED'));
      return;
    }

    try {
      const result = await orderService.bulkUpdateStatus(tenantId, orderIds, status, {
        updatedBy: user.id,
      });

      logger.audit('Orders bulk status updated', {
        tenantId,
        orderIds,
        status,
        modifiedCount: result.modifiedCount,
        updatedBy: user.id,
        ip: req.ip,
      });

      res.json(createResponse(result, 'Order statuses updated successfully'));
    } catch (error) {
      logger.error('Bulk update order status error', {
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
 * /api/v1/orders/bulk-cancel:
 *   post:
 *     tags: [Orders]
 *     summary: Bulk cancel orders
 */
orderRoutes.post('/bulk-cancel',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  requirePermissions([Permissions.ORDER_UPDATE]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { orderIds, reason = 'Bulk cancellation' } = req.body;

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      res.status(400).json(createErrorResponse('Order IDs array is required', 'INVALID_ORDER_IDS'));
      return;
    }

    if (orderIds.length > 100) {
      res.status(400).json(createErrorResponse('Maximum 100 orders per request', 'TOO_MANY_ITEMS'));
      return;
    }

    try {
      const result = await orderService.bulkCancel(tenantId, orderIds, {
        reason,
        cancelledBy: user.id,
      });

      logger.audit('Orders bulk cancelled', {
        tenantId,
        orderIds,
        reason,
        modifiedCount: result.modifiedCount,
        cancelledBy: user.id,
        ip: req.ip,
      });

      res.json(createResponse(result, 'Orders cancelled successfully'));
    } catch (error) {
      logger.error('Bulk cancel orders error', {
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
 * /api/v1/orders/bulk-export:
 *   post:
 *     tags: [Orders]
 *     summary: Export selected orders to CSV
 */
orderRoutes.post('/bulk-export',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const { orderIds = [] } = req.body;

    try {
      const csv = await orderService.bulkExportOrders(tenantId, orderIds);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="orders-export.csv"');
      res.send(csv);
    } catch (error) {
      logger.error('Bulk export orders error', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
);
```

**Step 2: Verify build**

Run: `npm run build:pos`

**Step 3: Commit**

```bash
git add backend/services/pos/src/routes/orders.ts
git commit -m "feat(pos): add bulk status, cancel, and export routes for orders"
```

---

### Task 6: Add bulk methods to CustomerService

**Files:**
- Modify: `backend/services/pos/src/services/CustomerService.ts` — add methods at end of class

**Step 1: Add bulkUpdate, bulkDeactivate, and bulkExport methods**

Add before the class closing brace:

```typescript
  /**
   * Bulk update customers
   */
  async bulkUpdateCustomers(
    tenantId: string,
    customerIds: string[],
    updates: Record<string, any>,
    options: { updatedBy: string }
  ): Promise<{ matchedCount: number; modifiedCount: number }> {
    try {
      const db = await getTenantDatabase(tenantId);

      const updateData: any = {
        ...updates,
        updatedAt: new Date(),
        updatedBy: options.updatedBy,
      };

      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key];
        }
      });

      const result = await db.collection('customers').updateMany(
        { id: { $in: customerIds } },
        { $set: updateData }
      );

      logger.audit('Customers bulk updated', {
        tenantId,
        customerIds,
        updatedCount: result.modifiedCount,
        updatedBy: options.updatedBy,
      });

      return {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      };
    } catch (error) {
      logger.error('Failed to bulk update customers', {
        tenantId,
        customerIds,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Bulk deactivate customers
   */
  async bulkDeactivateCustomers(
    tenantId: string,
    customerIds: string[],
    options: { reason: string; deactivatedBy: string }
  ): Promise<{ matchedCount: number; modifiedCount: number }> {
    try {
      const db = await getTenantDatabase(tenantId);

      const result = await db.collection('customers').updateMany(
        { id: { $in: customerIds } },
        {
          $set: {
            isActive: false,
            deactivatedAt: new Date(),
            deactivatedBy: options.deactivatedBy,
            deactivationReason: options.reason,
            updatedAt: new Date(),
          },
        }
      );

      logger.audit('Customers bulk deactivated', {
        tenantId,
        customerIds,
        deactivatedCount: result.modifiedCount,
        reason: options.reason,
        deactivatedBy: options.deactivatedBy,
      });

      return {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      };
    } catch (error) {
      logger.error('Failed to bulk deactivate customers', {
        tenantId,
        customerIds,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Bulk export customers to CSV
   */
  async bulkExportCustomers(
    tenantId: string,
    customerIds: string[]
  ): Promise<string> {
    try {
      const db = await getTenantDatabase(tenantId);

      const query: any = customerIds.length > 0
        ? { id: { $in: customerIds } }
        : {};

      const customers = await db.collection('customers')
        .find(query)
        .sort({ name: 1 })
        .toArray();

      const headers = ['ID', 'Name', 'Email', 'Phone', 'Status', 'Total Orders', 'Total Spent', 'Loyalty Points', 'Created At'];
      const rows = customers.map((c: any) => [
        c.id,
        `"${(c.name || '').replace(/"/g, '""')}"`,
        c.email || '',
        c.phone || '',
        c.isActive ? 'active' : 'inactive',
        c.totalOrders || 0,
        c.totalSpent || 0,
        c.loyaltyPoints || 0,
        c.createdAt ? new Date(c.createdAt).toISOString() : '',
      ].join(','));

      return [headers.join(','), ...rows].join('\n');
    } catch (error) {
      logger.error('Failed to bulk export customers', {
        tenantId,
        customerIds,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
```

**Step 2: Verify build**

Run: `npm run build:pos`

**Step 3: Commit**

```bash
git add backend/services/pos/src/services/CustomerService.ts
git commit -m "feat(pos): add bulk update, deactivate, and export to CustomerService"
```

---

### Task 7: Add bulk customer routes

**Files:**
- Modify: `backend/services/pos/src/routes/customers.ts` — add routes at end

**Step 1: Add bulk-update, bulk-deactivate, and bulk-export routes**

Follow the same pattern as product and order bulk routes. Add before the end of file:

```typescript
/**
 * @swagger
 * /api/v1/customers/bulk-update:
 *   post:
 *     tags: [Customers]
 *     summary: Bulk update customers
 */
customerRoutes.post('/bulk-update',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  requirePermissions([Permissions.CUSTOMER_UPDATE]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { customerIds, updates } = req.body;

    if (!Array.isArray(customerIds) || customerIds.length === 0) {
      res.status(400).json(createErrorResponse('Customer IDs array is required', 'INVALID_CUSTOMER_IDS'));
      return;
    }

    if (customerIds.length > 100) {
      res.status(400).json(createErrorResponse('Maximum 100 customers per request', 'TOO_MANY_ITEMS'));
      return;
    }

    try {
      const result = await customerService.bulkUpdateCustomers(tenantId, customerIds, updates, {
        updatedBy: user.id,
      });

      logger.audit('Customers bulk updated', {
        tenantId,
        customerIds,
        modifiedCount: result.modifiedCount,
        updatedBy: user.id,
        ip: req.ip,
      });

      res.json(createResponse(result, 'Customers updated successfully'));
    } catch (error) {
      logger.error('Bulk update customers error', {
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
 * /api/v1/customers/bulk-deactivate:
 *   post:
 *     tags: [Customers]
 *     summary: Bulk deactivate customers
 */
customerRoutes.post('/bulk-deactivate',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  requirePermissions([Permissions.CUSTOMER_UPDATE]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const user = (req as any).user;
    const { customerIds, reason = 'Bulk deactivation' } = req.body;

    if (!Array.isArray(customerIds) || customerIds.length === 0) {
      res.status(400).json(createErrorResponse('Customer IDs array is required', 'INVALID_CUSTOMER_IDS'));
      return;
    }

    if (customerIds.length > 100) {
      res.status(400).json(createErrorResponse('Maximum 100 customers per request', 'TOO_MANY_ITEMS'));
      return;
    }

    try {
      const result = await customerService.bulkDeactivateCustomers(tenantId, customerIds, {
        reason,
        deactivatedBy: user.id,
      });

      logger.audit('Customers bulk deactivated', {
        tenantId,
        customerIds,
        deactivatedCount: result.modifiedCount,
        reason,
        deactivatedBy: user.id,
        ip: req.ip,
      });

      res.json(createResponse(result, 'Customers deactivated successfully'));
    } catch (error) {
      logger.error('Bulk deactivate customers error', {
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
 * /api/v1/customers/bulk-export:
 *   post:
 *     tags: [Customers]
 *     summary: Export selected customers to CSV
 */
customerRoutes.post('/bulk-export',
  authenticate,
  extractTenant,
  requireRole([UserRoles.TENANT_OWNER, UserRoles.ADMIN, UserRoles.MANAGER]),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const { customerIds = [] } = req.body;

    try {
      const csv = await customerService.bulkExportCustomers(tenantId, customerIds);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="customers-export.csv"');
      res.send(csv);
    } catch (error) {
      logger.error('Bulk export customers error', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
);
```

**Step 2: Verify build**

Run: `npm run build:pos`

**Step 3: Commit**

```bash
git add backend/services/pos/src/routes/customers.ts
git commit -m "feat(pos): add bulk update, deactivate, and export routes for customers"
```

---

### Task 8: Create BulkActionBar frontend component

**Files:**
- Create: `frontend/src/components/ui/BulkActionBar.tsx`

**Step 1: Create the shared BulkActionBar component**

```tsx
'use client';

import React from 'react';
import { X, Edit, Trash2, Download, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface BulkAction {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary';
  disabled?: boolean;
}

interface BulkActionBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  actions: BulkAction[];
  className?: string;
}

export function BulkActionBar({
  selectedCount,
  onClearSelection,
  actions,
  className,
}: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      className={cn(
        'flex items-center gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg',
        className
      )}
    >
      <span className="text-sm font-medium text-foreground mr-2">
        {selectedCount} selected
      </span>

      {actions.map((action, i) => (
        <Button
          key={i}
          variant={action.variant || 'outline'}
          size="sm"
          onClick={action.onClick}
          disabled={action.disabled}
          className="cursor-pointer"
        >
          {action.icon}
          <span className="ml-1.5">{action.label}</span>
        </Button>
      ))}

      <Button
        variant="ghost"
        size="sm"
        onClick={onClearSelection}
        className="ml-auto cursor-pointer"
      >
        <X className="w-4 h-4 mr-1" />
        Clear
      </Button>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/ui/BulkActionBar.tsx
git commit -m "feat(frontend): create shared BulkActionBar component"
```

---

### Task 9: Create BulkEditModal frontend component

**Files:**
- Create: `frontend/src/components/ui/BulkEditModal.tsx`

**Step 1: Create the shared BulkEditModal component**

```tsx
'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';

interface BulkEditField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select';
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
}

interface BulkEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (updates: Record<string, any>) => void;
  fields: BulkEditField[];
  selectedCount: number;
  entityName: string;
  isLoading?: boolean;
}

export function BulkEditModal({
  isOpen,
  onClose,
  onSubmit,
  fields,
  selectedCount,
  entityName,
  isLoading = false,
}: BulkEditModalProps) {
  const [updates, setUpdates] = useState<Record<string, any>>({});
  const [enabledFields, setEnabledFields] = useState<Record<string, boolean>>({});

  if (!isOpen) return null;

  const handleToggleField = (key: string) => {
    setEnabledFields(prev => {
      const next = { ...prev, [key]: !prev[key] };
      if (!next[key]) {
        const nextUpdates = { ...updates };
        delete nextUpdates[key];
        setUpdates(nextUpdates);
      }
      return next;
    });
  };

  const handleFieldChange = (key: string, value: any) => {
    setUpdates(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = () => {
    const activeUpdates: Record<string, any> = {};
    for (const key of Object.keys(enabledFields)) {
      if (enabledFields[key] && updates[key] !== undefined) {
        activeUpdates[key] = updates[key];
      }
    }
    onSubmit(activeUpdates);
  };

  const activeFieldCount = Object.values(enabledFields).filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-background rounded-lg shadow-lg border w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold text-foreground mb-1">
          Bulk Edit {entityName}
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Editing {selectedCount} {entityName.toLowerCase()}. Toggle fields to include in update.
        </p>

        <div className="space-y-3 max-h-80 overflow-y-auto">
          {fields.map(field => (
            <div key={field.key} className="flex items-start gap-3 p-2 rounded border">
              <input
                type="checkbox"
                checked={!!enabledFields[field.key]}
                onChange={() => handleToggleField(field.key)}
                className="mt-1.5 cursor-pointer"
              />
              <div className="flex-1">
                <label className="text-sm font-medium text-foreground">{field.label}</label>
                {enabledFields[field.key] && (
                  <div className="mt-1">
                    {field.type === 'select' ? (
                      <select
                        value={updates[field.key] || ''}
                        onChange={e => handleFieldChange(field.key, e.target.value)}
                        className="w-full px-3 py-1.5 border rounded text-sm bg-background"
                      >
                        <option value="">Select...</option>
                        {field.options?.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={field.type}
                        value={updates[field.key] || ''}
                        onChange={e => handleFieldChange(field.key, field.type === 'number' ? Number(e.target.value) : e.target.value)}
                        placeholder={field.placeholder}
                        className="w-full px-3 py-1.5 border rounded text-sm bg-background"
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={isLoading} className="cursor-pointer">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={activeFieldCount === 0 || isLoading}
            loading={isLoading}
            className="cursor-pointer"
          >
            Update {selectedCount} {entityName}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/ui/BulkEditModal.tsx
git commit -m "feat(frontend): create shared BulkEditModal component"
```

---

### Task 10: Wire up bulk actions on Products, Orders, and Customers pages

**Files:**
- Modify: `frontend/src/app/(dashboard)/products/page.tsx` — replace non-functional bulk buttons with BulkActionBar + handlers
- Modify: `frontend/src/app/(dashboard)/orders/page.tsx` — add selection state + BulkActionBar
- Modify: `frontend/src/app/(dashboard)/customers/page.tsx` — add selection state + BulkActionBar

**Step 1: Products page** — import BulkActionBar, BulkEditModal, wire handlers

Replace the existing hardcoded bulk action div (around lines 254-273) with:
- Import `BulkActionBar` and `BulkEditModal`
- Add state: `const [showBulkEdit, setShowBulkEdit] = useState(false);` and `const [bulkLoading, setBulkLoading] = useState(false);`
- Add handler functions for bulk edit, delete, export that call `apiClient.post('/products/bulk-update', ...)` etc.
- Replace the existing `{selectedProducts.length > 0 && (...)}` JSX with `<BulkActionBar>` using the handler functions
- Add `<BulkEditModal>` for product fields (category, price, status)

**Step 2: Orders page** — add selection

- Add `useState<string[]>` for selectedOrders
- Add `toggleSelectAll` and `toggleSelectOrder` functions (same pattern as products page)
- Add checkbox column to order table rows
- Add `<BulkActionBar>` with status update, cancel, and export actions
- Add handlers calling `apiClient.post('/orders/bulk-status', ...)` etc.

**Step 3: Customers page** — add selection

- Add `useState<string[]>` for selectedCustomers
- Add `toggleSelectAll` and `toggleSelectCustomer` functions
- Add checkbox column to customer table rows
- Add `<BulkActionBar>` with edit, deactivate, and export actions
- Add `<BulkEditModal>` for customer fields (tags, notes)
- Add handlers calling `apiClient.post('/customers/bulk-update', ...)` etc.

**Step 4: Verify frontend build**

Run: `cd /Users/alstondanielmendonca/Desktop/properpos-saas/frontend && npx next build`

**Step 5: Commit**

```bash
git add frontend/src/app/\(dashboard\)/products/page.tsx frontend/src/app/\(dashboard\)/orders/page.tsx frontend/src/app/\(dashboard\)/customers/page.tsx
git commit -m "feat(frontend): wire up bulk operations on products, orders, and customers pages"
```

---

## Feature 3: Enhanced Inventory Forecasting

### Task 11: Create ForecastingEngine service

**Files:**
- Create: `backend/services/inventory/src/services/ForecastingEngine.ts`

**Step 1: Create the forecasting engine**

```typescript
import { v4 as uuidv4 } from 'uuid';

export interface DailySalesPoint {
  date: string;
  quantity: number;
  revenue: number;
}

export interface ForecastResult {
  predictedDemand: number;
  recommendedOrder: number;
  confidence: number;
  confidenceInterval70: { lower: number; upper: number };
  confidenceInterval90: { lower: number; upper: number };
  trend: 'increasing' | 'decreasing' | 'stable';
  trendStrength: number;
  seasonality: boolean;
  seasonalPattern?: number[];
  daysUntilStockout: number | null;
  method: string;
}

export interface ReorderSuggestion {
  productId: string;
  productName: string;
  locationId: string;
  currentStock: number;
  predictedDemand: number;
  daysUntilStockout: number | null;
  suggestedOrderQuantity: number;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  estimatedOrderDate: Date;
  confidence: number;
}

export class ForecastingEngine {
  /**
   * Weighted Moving Average: recent data weighted higher
   */
  weightedMovingAverage(
    dailySales: DailySalesPoint[],
    forecastPeriod: number
  ): ForecastResult {
    if (dailySales.length === 0) {
      return this.emptyForecast('weighted_moving_average', forecastPeriod);
    }

    const quantities = dailySales.map(d => d.quantity);
    const n = quantities.length;

    // Assign linearly increasing weights: oldest=1, newest=n
    let weightedSum = 0;
    let weightTotal = 0;
    for (let i = 0; i < n; i++) {
      const weight = i + 1;
      weightedSum += quantities[i] * weight;
      weightTotal += weight;
    }

    const avgDaily = weightedSum / weightTotal;
    const predictedDemand = avgDaily * forecastPeriod;

    const trend = this.detectTrend(quantities);
    const trendMultiplier = trend.direction === 'increasing' ? (1 + trend.strength * 0.3) :
                            trend.direction === 'decreasing' ? (1 - trend.strength * 0.3) : 1;
    const adjustedDemand = predictedDemand * trendMultiplier;

    const stdDev = this.standardDeviation(quantities);
    const ci70 = this.confidenceInterval(adjustedDemand, stdDev, forecastPeriod, 1.04);
    const ci90 = this.confidenceInterval(adjustedDemand, stdDev, forecastPeriod, 1.645);

    const seasonality = this.detectSeasonality(dailySales);
    const confidence = this.calculateConfidence(n, stdDev, avgDaily);

    return {
      predictedDemand: Math.round(adjustedDemand),
      recommendedOrder: Math.ceil(adjustedDemand * 1.15),
      confidence,
      confidenceInterval70: ci70,
      confidenceInterval90: ci90,
      trend: trend.direction,
      trendStrength: trend.strength,
      seasonality: seasonality.detected,
      seasonalPattern: seasonality.pattern,
      daysUntilStockout: null,
      method: 'weighted_moving_average',
    };
  }

  /**
   * Exponential Smoothing (Holt's method for trend)
   */
  exponentialSmoothing(
    dailySales: DailySalesPoint[],
    forecastPeriod: number,
    alpha: number = 0.3,
    beta: number = 0.1
  ): ForecastResult {
    if (dailySales.length < 2) {
      return this.emptyForecast('exponential_smoothing', forecastPeriod);
    }

    const quantities = dailySales.map(d => d.quantity);
    const n = quantities.length;

    // Initialize
    let level = quantities[0];
    let trendComponent = quantities[1] - quantities[0];

    // Apply Holt's double exponential smoothing
    for (let i = 1; i < n; i++) {
      const prevLevel = level;
      level = alpha * quantities[i] + (1 - alpha) * (prevLevel + trendComponent);
      trendComponent = beta * (level - prevLevel) + (1 - beta) * trendComponent;
    }

    // Forecast: sum of (level + k*trend) for k=1..forecastPeriod
    let predictedDemand = 0;
    for (let k = 1; k <= forecastPeriod; k++) {
      predictedDemand += Math.max(0, level + k * trendComponent);
    }

    const trend = this.detectTrend(quantities);
    const stdDev = this.standardDeviation(quantities);
    const ci70 = this.confidenceInterval(predictedDemand, stdDev, forecastPeriod, 1.04);
    const ci90 = this.confidenceInterval(predictedDemand, stdDev, forecastPeriod, 1.645);
    const seasonality = this.detectSeasonality(dailySales);
    const confidence = this.calculateConfidence(n, stdDev, level);

    return {
      predictedDemand: Math.round(predictedDemand),
      recommendedOrder: Math.ceil(predictedDemand * 1.15),
      confidence,
      confidenceInterval70: ci70,
      confidenceInterval90: ci90,
      trend: trend.direction,
      trendStrength: trend.strength,
      seasonality: seasonality.detected,
      seasonalPattern: seasonality.pattern,
      daysUntilStockout: null,
      method: 'exponential_smoothing',
    };
  }

  /**
   * Ensemble: weighted average of WMA and exponential smoothing
   */
  ensemble(
    dailySales: DailySalesPoint[],
    forecastPeriod: number
  ): ForecastResult {
    const wma = this.weightedMovingAverage(dailySales, forecastPeriod);
    const exp = this.exponentialSmoothing(dailySales, forecastPeriod);

    // Weight by confidence
    const totalConfidence = wma.confidence + exp.confidence;
    const wmaWeight = totalConfidence > 0 ? wma.confidence / totalConfidence : 0.5;
    const expWeight = 1 - wmaWeight;

    const predictedDemand = Math.round(wma.predictedDemand * wmaWeight + exp.predictedDemand * expWeight);
    const recommendedOrder = Math.ceil(predictedDemand * 1.15);
    const confidence = Math.max(wma.confidence, exp.confidence);

    return {
      predictedDemand,
      recommendedOrder,
      confidence,
      confidenceInterval70: {
        lower: Math.round(wma.confidenceInterval70.lower * wmaWeight + exp.confidenceInterval70.lower * expWeight),
        upper: Math.round(wma.confidenceInterval70.upper * wmaWeight + exp.confidenceInterval70.upper * expWeight),
      },
      confidenceInterval90: {
        lower: Math.round(wma.confidenceInterval90.lower * wmaWeight + exp.confidenceInterval90.lower * expWeight),
        upper: Math.round(wma.confidenceInterval90.upper * wmaWeight + exp.confidenceInterval90.upper * expWeight),
      },
      trend: wma.trend,
      trendStrength: wma.trendStrength,
      seasonality: wma.seasonality || exp.seasonality,
      seasonalPattern: wma.seasonalPattern,
      daysUntilStockout: null,
      method: 'ensemble',
    };
  }

  /**
   * Calculate days until stockout
   */
  calculateDaysUntilStockout(currentStock: number, avgDailyDemand: number): number | null {
    if (avgDailyDemand <= 0) return null;
    if (currentStock <= 0) return 0;
    return Math.floor(currentStock / avgDailyDemand);
  }

  /**
   * Generate reorder suggestion for a product
   */
  generateReorderSuggestion(
    productId: string,
    productName: string,
    locationId: string,
    currentStock: number,
    forecast: ForecastResult,
    leadTimeDays: number = 7
  ): ReorderSuggestion {
    const dailyDemand = forecast.predictedDemand / 30;
    const daysUntilStockout = this.calculateDaysUntilStockout(currentStock, dailyDemand);
    const safetyStock = Math.ceil(dailyDemand * leadTimeDays * 0.5);
    const suggestedOrderQuantity = Math.max(0, forecast.recommendedOrder - currentStock + safetyStock);

    let urgency: 'critical' | 'high' | 'medium' | 'low' = 'low';
    if (daysUntilStockout !== null) {
      if (daysUntilStockout <= 0) urgency = 'critical';
      else if (daysUntilStockout <= leadTimeDays) urgency = 'high';
      else if (daysUntilStockout <= leadTimeDays * 2) urgency = 'medium';
    }

    const orderByDate = new Date();
    if (daysUntilStockout !== null) {
      orderByDate.setDate(orderByDate.getDate() + Math.max(0, (daysUntilStockout || 0) - leadTimeDays));
    }

    return {
      productId,
      productName,
      locationId,
      currentStock,
      predictedDemand: forecast.predictedDemand,
      daysUntilStockout,
      suggestedOrderQuantity,
      urgency,
      estimatedOrderDate: orderByDate,
      confidence: forecast.confidence,
    };
  }

  // --- Private helpers ---

  private detectTrend(values: number[]): { direction: 'increasing' | 'decreasing' | 'stable'; strength: number } {
    if (values.length < 4) return { direction: 'stable', strength: 0 };

    const halfLen = Math.floor(values.length / 2);
    const firstHalf = values.slice(0, halfLen);
    const secondHalf = values.slice(-halfLen);

    const avgFirst = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;

    if (avgFirst === 0 && avgSecond === 0) return { direction: 'stable', strength: 0 };

    const change = avgFirst > 0 ? (avgSecond - avgFirst) / avgFirst : 0;
    const strength = Math.min(1, Math.abs(change));

    if (change > 0.1) return { direction: 'increasing', strength };
    if (change < -0.1) return { direction: 'decreasing', strength };
    return { direction: 'stable', strength };
  }

  private standardDeviation(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return Math.sqrt(squaredDiffs.reduce((s, v) => s + v, 0) / (values.length - 1));
  }

  private confidenceInterval(
    prediction: number,
    stdDev: number,
    period: number,
    zScore: number
  ): { lower: number; upper: number } {
    const margin = zScore * stdDev * Math.sqrt(period);
    return {
      lower: Math.max(0, Math.round(prediction - margin)),
      upper: Math.round(prediction + margin),
    };
  }

  private detectSeasonality(dailySales: DailySalesPoint[]): { detected: boolean; pattern?: number[] } {
    if (dailySales.length < 14) return { detected: false };

    // Check for day-of-week patterns
    const dayBuckets: number[][] = [[], [], [], [], [], [], []];
    for (const sale of dailySales) {
      const dayOfWeek = new Date(sale.date).getDay();
      dayBuckets[dayOfWeek].push(sale.quantity);
    }

    const dayAverages = dayBuckets.map(bucket =>
      bucket.length > 0 ? bucket.reduce((s, v) => s + v, 0) / bucket.length : 0
    );

    const overallAvg = dayAverages.reduce((s, v) => s + v, 0) / 7;
    if (overallAvg === 0) return { detected: false };

    // If any day deviates by more than 30%, consider seasonal
    const maxDeviation = Math.max(...dayAverages.map(avg => Math.abs(avg - overallAvg) / overallAvg));
    const detected = maxDeviation > 0.3;

    return {
      detected,
      pattern: detected ? dayAverages.map(a => Math.round(a * 10) / 10) : undefined,
    };
  }

  private calculateConfidence(dataPoints: number, stdDev: number, mean: number): number {
    let confidence = 0.5;

    // More data = higher confidence (up to +0.25)
    confidence += Math.min(0.25, dataPoints / 120);

    // Lower coefficient of variation = higher confidence (up to +0.25)
    if (mean > 0) {
      const cv = stdDev / mean;
      confidence += Math.max(0, 0.25 - cv * 0.1);
    }

    return Math.min(0.95, Math.max(0.1, Math.round(confidence * 100) / 100));
  }

  private emptyForecast(method: string, forecastPeriod: number): ForecastResult {
    return {
      predictedDemand: 0,
      recommendedOrder: 0,
      confidence: 0,
      confidenceInterval70: { lower: 0, upper: 0 },
      confidenceInterval90: { lower: 0, upper: 0 },
      trend: 'stable',
      trendStrength: 0,
      seasonality: false,
      daysUntilStockout: null,
      method,
    };
  }
}
```

**Step 2: Verify build**

Run: `npm run build:inventory`

**Step 3: Commit**

```bash
git add backend/services/inventory/src/services/ForecastingEngine.ts
git commit -m "feat(inventory): create ForecastingEngine with WMA, exponential smoothing, and ensemble methods"
```

---

### Task 12: Update StockService to use ForecastingEngine

**Files:**
- Modify: `backend/services/inventory/src/services/StockService.ts:1107-1151` — replace calculateForecast method
- Modify: `backend/services/inventory/src/services/StockService.ts:866-882` — update forecast result mapping

**Step 1: Import ForecastingEngine**

Add import at the top of StockService.ts:

```typescript
import { ForecastingEngine, DailySalesPoint } from './ForecastingEngine';
```

Add to the class constructor or as a property:

```typescript
private forecastingEngine = new ForecastingEngine();
```

**Step 2: Replace the `calculateForecast` method (lines 1110-1151)**

Replace with:

```typescript
  private calculateForecast(salesData: any, forecastPeriod: number, method: string) {
    const dailySales: DailySalesPoint[] = (salesData.dailySales || []).map((d: any) => ({
      date: d.date,
      quantity: d.quantity || 0,
      revenue: d.revenue || 0,
    }));

    switch (method) {
      case 'exponential_smoothing':
        return this.forecastingEngine.exponentialSmoothing(dailySales, forecastPeriod);
      case 'ensemble':
        return this.forecastingEngine.ensemble(dailySales, forecastPeriod);
      case 'weighted_moving_average':
      default:
        return this.forecastingEngine.weightedMovingAverage(dailySales, forecastPeriod);
    }
  }
```

**Step 3: Update the forecast result mapping (lines ~866-882)**

Update the map in `generateStockForecast` to include the new fields:

```typescript
      const forecasts: StockForecast[] = salesData.map((data: any) => {
        const forecast = this.calculateForecast(data, forecastPeriod, method);
        return {
          id: uuidv4(),
          productId: data._id,
          locationId: locationId || 'all',
          forecastPeriod,
          method: forecast.method,
          predictedDemand: forecast.predictedDemand,
          recommendedOrder: forecast.recommendedOrder,
          confidence: forecast.confidence,
          confidenceInterval70: forecast.confidenceInterval70,
          confidenceInterval90: forecast.confidenceInterval90,
          historicalAverage: data.avgDailyQuantity,
          trend: forecast.trend,
          trendStrength: forecast.trendStrength,
          seasonality: forecast.seasonality,
          seasonalPattern: forecast.seasonalPattern,
          daysUntilStockout: forecast.daysUntilStockout,
          generatedAt: new Date(),
          validUntil: new Date(Date.now() + forecastPeriod * 24 * 60 * 60 * 1000),
        };
      });
```

**Step 4: Verify build**

Run: `npm run build:inventory`

**Step 5: Commit**

```bash
git add backend/services/inventory/src/services/StockService.ts
git commit -m "feat(inventory): integrate ForecastingEngine into StockService"
```

---

### Task 13: Add new forecast routes

**Files:**
- Modify: `backend/services/inventory/src/routes/stock.ts` — add bulk forecast, reorder suggestions, stockout risk routes

**Step 1: Add new routes at end of stock.ts**

```typescript
/**
 * @swagger
 * /api/v1/stock/forecast/bulk:
 *   get:
 *     tags: [Stock]
 *     summary: Get forecast for all products at a location
 */
stockRoutes.get('/forecast/bulk',
  authenticate,
  extractTenant,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const { locationId, forecastPeriod = 30, method = 'ensemble' } = req.query;

    try {
      const forecasts = await stockService.generateStockForecast(tenantId, {
        locationId: locationId as string,
        forecastPeriod: Number(forecastPeriod),
        method: method as string,
      });

      res.json(createResponse(forecasts, 'Bulk forecasts generated successfully'));
    } catch (error) {
      logger.error('Bulk forecast error', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/stock/forecast/reorder-suggestions:
 *   get:
 *     tags: [Stock]
 *     summary: Get products that need reordering
 */
stockRoutes.get('/forecast/reorder-suggestions',
  authenticate,
  extractTenant,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const { locationId, leadTimeDays = 7 } = req.query;

    try {
      const forecasts = await stockService.generateStockForecast(tenantId, {
        locationId: locationId as string,
        forecastPeriod: 30,
        method: 'ensemble',
      });

      // Get current stock levels
      const db = await require('@properpos/backend-shared').getTenantDatabase(tenantId);
      const stockCollection = db.collection('stock');
      const productsCollection = db.collection('products');

      const { ForecastingEngine } = require('../services/ForecastingEngine');
      const engine = new ForecastingEngine();

      const suggestions = [];
      for (const forecast of forecasts) {
        const stock = await stockCollection.findOne({
          productId: forecast.productId,
          ...(locationId && { locationId }),
        });

        const product = await productsCollection.findOne({ id: forecast.productId });

        if (stock && product) {
          const suggestion = engine.generateReorderSuggestion(
            forecast.productId,
            product.name || 'Unknown',
            locationId as string || 'all',
            stock.currentQuantity || 0,
            forecast,
            Number(leadTimeDays)
          );

          if (suggestion.suggestedOrderQuantity > 0) {
            suggestions.push(suggestion);
          }
        }
      }

      // Sort by urgency
      const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      suggestions.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

      res.json(createResponse(suggestions, 'Reorder suggestions generated successfully'));
    } catch (error) {
      logger.error('Reorder suggestions error', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
);

/**
 * @swagger
 * /api/v1/stock/forecast/stockout-risk:
 *   get:
 *     tags: [Stock]
 *     summary: Get products at risk of stockout
 */
stockRoutes.get('/forecast/stockout-risk',
  authenticate,
  extractTenant,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = (req as any).tenant.id;
    const { locationId, withinDays = 14 } = req.query;

    try {
      const forecasts = await stockService.generateStockForecast(tenantId, {
        locationId: locationId as string,
        forecastPeriod: Number(withinDays),
        method: 'ensemble',
      });

      const db = await require('@properpos/backend-shared').getTenantDatabase(tenantId);
      const stockCollection = db.collection('stock');
      const productsCollection = db.collection('products');

      const { ForecastingEngine } = require('../services/ForecastingEngine');
      const engine = new ForecastingEngine();

      const atRisk = [];
      for (const forecast of forecasts) {
        const stock = await stockCollection.findOne({
          productId: forecast.productId,
          ...(locationId && { locationId }),
        });

        const product = await productsCollection.findOne({ id: forecast.productId });

        if (stock && product) {
          const avgDailyDemand = forecast.predictedDemand / Number(withinDays);
          const daysUntilStockout = engine.calculateDaysUntilStockout(
            stock.currentQuantity || 0,
            avgDailyDemand
          );

          if (daysUntilStockout !== null && daysUntilStockout <= Number(withinDays)) {
            atRisk.push({
              productId: forecast.productId,
              productName: product.name || 'Unknown',
              locationId: locationId || 'all',
              currentStock: stock.currentQuantity || 0,
              avgDailyDemand: Math.round(avgDailyDemand * 10) / 10,
              daysUntilStockout,
              confidence: forecast.confidence,
              trend: forecast.trend,
            });
          }
        }
      }

      // Sort by days until stockout (most urgent first)
      atRisk.sort((a, b) => (a.daysUntilStockout || 0) - (b.daysUntilStockout || 0));

      res.json(createResponse(atRisk, 'Stockout risk assessment generated'));
    } catch (error) {
      logger.error('Stockout risk error', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
);
```

**Step 2: Verify build**

Run: `npm run build:inventory`

**Step 3: Commit**

```bash
git add backend/services/inventory/src/routes/stock.ts
git commit -m "feat(inventory): add bulk forecast, reorder suggestions, and stockout risk routes"
```

---

### Task 14: Install recharts and create ForecastChart component

**Files:**
- Modify: `frontend/package.json` — add recharts
- Create: `frontend/src/components/inventory/ForecastChart.tsx`

**Step 1: Install recharts**

Run: `cd /Users/alstondanielmendonca/Desktop/properpos-saas/frontend && npm install recharts`

**Step 2: Create ForecastChart component**

```tsx
'use client';

import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Area,
  AreaChart,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ForecastData {
  productId: string;
  predictedDemand: number;
  recommendedOrder: number;
  confidence: number;
  confidenceInterval70: { lower: number; upper: number };
  confidenceInterval90: { lower: number; upper: number };
  trend: string;
  trendStrength: number;
  seasonality: boolean;
  seasonalPattern?: number[];
  historicalAverage: number;
  method: string;
}

interface ForecastChartProps {
  forecasts: ForecastData[];
  title?: string;
}

export function ForecastChart({ forecasts, title = 'Demand Forecast' }: ForecastChartProps) {
  if (!forecasts || forecasts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No forecast data available. Need at least 7 days of sales data.</p>
        </CardContent>
      </Card>
    );
  }

  const chartData = forecasts.map((f, i) => ({
    name: `Product ${i + 1}`,
    productId: f.productId,
    predicted: f.predictedDemand,
    recommended: f.recommendedOrder,
    historical: Math.round(f.historicalAverage * 30),
    ci90Lower: f.confidenceInterval90.lower,
    ci90Upper: f.confidenceInterval90.upper,
    ci70Lower: f.confidenceInterval70.lower,
    ci70Upper: f.confidenceInterval70.upper,
    confidence: Math.round(f.confidence * 100),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="name" className="text-xs" />
            <YAxis className="text-xs" />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px',
              }}
            />
            <Legend />
            <Area
              type="monotone"
              dataKey="ci90Upper"
              stroke="none"
              fill="hsl(var(--primary))"
              fillOpacity={0.05}
              name="90% CI Upper"
            />
            <Area
              type="monotone"
              dataKey="ci90Lower"
              stroke="none"
              fill="hsl(var(--primary))"
              fillOpacity={0.05}
              name="90% CI Lower"
            />
            <Area
              type="monotone"
              dataKey="ci70Upper"
              stroke="none"
              fill="hsl(var(--primary))"
              fillOpacity={0.1}
              name="70% CI Upper"
            />
            <Area
              type="monotone"
              dataKey="ci70Lower"
              stroke="none"
              fill="hsl(var(--primary))"
              fillOpacity={0.1}
              name="70% CI Lower"
            />
            <Line type="monotone" dataKey="historical" stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" name="Historical (30d)" />
            <Line type="monotone" dataKey="predicted" stroke="hsl(var(--primary))" strokeWidth={2} name="Predicted Demand" />
            <Line type="monotone" dataKey="recommended" stroke="hsl(var(--chart-2, #22c55e))" strokeWidth={2} name="Recommended Order" />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
```

**Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/components/inventory/ForecastChart.tsx
git commit -m "feat(frontend): add recharts and ForecastChart component"
```

---

### Task 15: Create ReorderSuggestions and StockoutRisk components

**Files:**
- Create: `frontend/src/components/inventory/ReorderSuggestions.tsx`
- Create: `frontend/src/components/inventory/StockoutRisk.tsx`

**Step 1: Create ReorderSuggestions component**

```tsx
'use client';

import React from 'react';
import { AlertTriangle, Clock, Package, ShoppingCart } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ReorderSuggestion {
  productId: string;
  productName: string;
  locationId: string;
  currentStock: number;
  predictedDemand: number;
  daysUntilStockout: number | null;
  suggestedOrderQuantity: number;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  estimatedOrderDate: string;
  confidence: number;
}

interface ReorderSuggestionsProps {
  suggestions: ReorderSuggestion[];
  onCreatePurchaseOrder?: (productIds: string[]) => void;
}

const urgencyColors = {
  critical: 'bg-red-500/10 text-red-600 border-red-200 dark:text-red-400 dark:border-red-800',
  high: 'bg-orange-500/10 text-orange-600 border-orange-200 dark:text-orange-400 dark:border-orange-800',
  medium: 'bg-yellow-500/10 text-yellow-600 border-yellow-200 dark:text-yellow-400 dark:border-yellow-800',
  low: 'bg-green-500/10 text-green-600 border-green-200 dark:text-green-400 dark:border-green-800',
};

const urgencyLabels = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export function ReorderSuggestions({ suggestions, onCreatePurchaseOrder }: ReorderSuggestionsProps) {
  if (!suggestions || suggestions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShoppingCart className="w-4 h-4" />
            Reorder Suggestions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">All products are well-stocked. No reorders needed.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <ShoppingCart className="w-4 h-4" />
          Reorder Suggestions ({suggestions.length})
        </CardTitle>
        {onCreatePurchaseOrder && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onCreatePurchaseOrder(suggestions.map(s => s.productId))}
            className="cursor-pointer"
          >
            Create PO for All
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {suggestions.map((s) => (
            <div
              key={s.productId}
              className={cn(
                'flex items-center justify-between p-3 rounded-lg border',
                urgencyColors[s.urgency]
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-current/10">
                    {urgencyLabels[s.urgency]}
                  </span>
                  <span className="font-medium text-sm truncate">{s.productName}</span>
                </div>
                <div className="flex items-center gap-4 mt-1 text-xs opacity-80">
                  <span className="flex items-center gap-1">
                    <Package className="w-3 h-3" />
                    Stock: {s.currentStock}
                  </span>
                  {s.daysUntilStockout !== null && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {s.daysUntilStockout === 0 ? 'Out of stock' : `${s.daysUntilStockout}d until stockout`}
                    </span>
                  )}
                  <span>Confidence: {Math.round(s.confidence * 100)}%</span>
                </div>
              </div>
              <div className="text-right ml-4">
                <div className="font-semibold text-sm">Order: {s.suggestedOrderQuantity}</div>
                <div className="text-xs opacity-80">
                  By {new Date(s.estimatedOrderDate).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

**Step 2: Create StockoutRisk component**

```tsx
'use client';

import React from 'react';
import { AlertCircle, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface StockoutRiskItem {
  productId: string;
  productName: string;
  locationId: string;
  currentStock: number;
  avgDailyDemand: number;
  daysUntilStockout: number;
  confidence: number;
  trend: string;
}

interface StockoutRiskProps {
  items: StockoutRiskItem[];
}

export function StockoutRisk({ items }: StockoutRiskProps) {
  const criticalCount = items.filter(i => i.daysUntilStockout <= 3).length;
  const warningCount = items.filter(i => i.daysUntilStockout > 3 && i.daysUntilStockout <= 7).length;

  const trendIcon = (trend: string) => {
    if (trend === 'increasing') return <TrendingUp className="w-3 h-3 text-red-500" />;
    if (trend === 'decreasing') return <TrendingDown className="w-3 h-3 text-green-500" />;
    return <Minus className="w-3 h-3 text-muted-foreground" />;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-destructive" />
          Stockout Risk
          {items.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground ml-auto">
              {criticalCount > 0 && <span className="text-red-500 font-medium mr-2">{criticalCount} critical</span>}
              {warningCount > 0 && <span className="text-orange-500 font-medium">{warningCount} warning</span>}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No products at risk of stockout in the next 14 days.</p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.productId}
                className={cn(
                  'flex items-center justify-between p-2.5 rounded-lg border text-sm',
                  item.daysUntilStockout <= 0 && 'bg-red-500/10 border-red-200 dark:border-red-800',
                  item.daysUntilStockout > 0 && item.daysUntilStockout <= 3 && 'bg-red-500/5 border-red-100 dark:border-red-900',
                  item.daysUntilStockout > 3 && item.daysUntilStockout <= 7 && 'bg-orange-500/5 border-orange-100 dark:border-orange-900',
                  item.daysUntilStockout > 7 && 'bg-yellow-500/5 border-yellow-100 dark:border-yellow-900'
                )}
              >
                <div>
                  <span className="font-medium">{item.productName}</span>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span>Stock: {item.currentStock}</span>
                    <span>Demand: {item.avgDailyDemand}/day</span>
                    <span className="flex items-center gap-1">
                      {trendIcon(item.trend)} {item.trend}
                    </span>
                  </div>
                </div>
                <div className={cn(
                  'font-semibold text-right',
                  item.daysUntilStockout <= 0 && 'text-red-600',
                  item.daysUntilStockout > 0 && item.daysUntilStockout <= 3 && 'text-red-500',
                  item.daysUntilStockout > 3 && item.daysUntilStockout <= 7 && 'text-orange-500',
                  item.daysUntilStockout > 7 && 'text-yellow-600',
                )}>
                  {item.daysUntilStockout <= 0 ? 'OUT' : `${item.daysUntilStockout}d`}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

**Step 3: Commit**

```bash
git add frontend/src/components/inventory/ReorderSuggestions.tsx frontend/src/components/inventory/StockoutRisk.tsx
git commit -m "feat(frontend): create ReorderSuggestions and StockoutRisk components"
```

---

### Task 16: Add forecasting section to inventory page

**Files:**
- Modify: `frontend/src/app/(dashboard)/inventory/page.tsx` — add forecasting tab with chart and suggestions

**Step 1: Add forecasting imports and state**

At the top of the inventory page, add:

```typescript
import { ForecastChart } from '@/components/inventory/ForecastChart';
import { ReorderSuggestions } from '@/components/inventory/ReorderSuggestions';
import { StockoutRisk } from '@/components/inventory/StockoutRisk';
```

Add state variables:

```typescript
const [activeTab, setActiveTab] = useState<'stock' | 'forecast'>('stock');
const [forecasts, setForecasts] = useState<any[]>([]);
const [reorderSuggestions, setReorderSuggestions] = useState<any[]>([]);
const [stockoutRisk, setStockoutRisk] = useState<any[]>([]);
const [forecastLoading, setForecastLoading] = useState(false);
```

**Step 2: Add forecast data fetching function**

```typescript
const loadForecasts = useCallback(async () => {
  setForecastLoading(true);
  try {
    const [forecastRes, reorderRes, riskRes] = await Promise.all([
      apiClient.get('/stock/forecast/bulk?method=ensemble&forecastPeriod=30'),
      apiClient.get('/stock/forecast/reorder-suggestions?leadTimeDays=7'),
      apiClient.get('/stock/forecast/stockout-risk?withinDays=14'),
    ]);
    setForecasts(forecastRes.data?.data || []);
    setReorderSuggestions(reorderRes.data?.data || []);
    setStockoutRisk(riskRes.data?.data || []);
  } catch (error) {
    toast.error('Failed to load forecast data');
  } finally {
    setForecastLoading(false);
  }
}, []);
```

**Step 3: Add tab UI and forecast section to the JSX**

After the page header, add tab buttons:

```tsx
<div className="flex gap-2 border-b">
  <button
    onClick={() => setActiveTab('stock')}
    className={cn(
      'px-4 py-2 text-sm font-medium border-b-2 -mb-px cursor-pointer',
      activeTab === 'stock' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
    )}
  >
    Stock Levels
  </button>
  <button
    onClick={() => { setActiveTab('forecast'); loadForecasts(); }}
    className={cn(
      'px-4 py-2 text-sm font-medium border-b-2 -mb-px cursor-pointer',
      activeTab === 'forecast' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
    )}
  >
    Forecasting
  </button>
</div>
```

Then conditionally render forecast content when `activeTab === 'forecast'`:

```tsx
{activeTab === 'forecast' && (
  <div className="space-y-6">
    {forecastLoading ? (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    ) : (
      <>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <StockoutRisk items={stockoutRisk} />
          <ReorderSuggestions suggestions={reorderSuggestions} />
        </div>
        <ForecastChart forecasts={forecasts} title="30-Day Demand Forecast (All Products)" />
      </>
    )}
  </div>
)}
```

**Step 4: Verify frontend build**

Run: `cd /Users/alstondanielmendonca/Desktop/properpos-saas/frontend && npx next build`

**Step 5: Commit**

```bash
git add frontend/src/app/\(dashboard\)/inventory/page.tsx
git commit -m "feat(frontend): add forecasting tab with chart, reorder suggestions, and stockout risk to inventory page"
```

---

## Summary

| Task | Feature | Description |
|------|---------|-------------|
| 1 | PDF Receipts | Install PDFKit + implement generatePDFReceipt |
| 2 | Bulk Ops | ProductService: bulk delete + export methods |
| 3 | Bulk Ops | Product routes: bulk-delete, bulk-export |
| 4 | Bulk Ops | OrderService: bulk status, cancel, export methods |
| 5 | Bulk Ops | Order routes: bulk-status, bulk-cancel, bulk-export |
| 6 | Bulk Ops | CustomerService: bulk update, deactivate, export methods |
| 7 | Bulk Ops | Customer routes: bulk-update, bulk-deactivate, bulk-export |
| 8 | Bulk Ops | Frontend: BulkActionBar component |
| 9 | Bulk Ops | Frontend: BulkEditModal component |
| 10 | Bulk Ops | Frontend: Wire up all three pages |
| 11 | Forecasting | ForecastingEngine: WMA + exponential smoothing + ensemble |
| 12 | Forecasting | StockService: integrate ForecastingEngine |
| 13 | Forecasting | New forecast routes: bulk, reorder, stockout-risk |
| 14 | Forecasting | Frontend: recharts + ForecastChart |
| 15 | Forecasting | Frontend: ReorderSuggestions + StockoutRisk |
| 16 | Forecasting | Frontend: Forecasting tab on inventory page |
