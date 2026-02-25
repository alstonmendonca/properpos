// Purchase order management service

import Decimal from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';
import {
  logger,
  getTenantDatabase,
} from '@properpos/backend-shared';

import { StockService } from './StockService';

// Local interface definitions for inventory-specific types
interface PurchaseOrderItem {
  productId: string;
  productName?: string;
  sku?: string;
  quantity: number;
  unitCost: number;
  totalCost?: number;
  receivedQuantity?: number;
  notes?: string;
}

interface PurchaseOrder {
  id: string;
  orderNumber: string;
  tenantId?: string;
  supplierId: string;
  supplier?: {
    id: string;
    name: string;
    contactEmail?: string;
    contactPhone?: string;
  };
  locationId: string;
  status: string;
  items: PurchaseOrderItem[];
  subtotal?: number;
  discountAmount?: number;
  discounts?: any[];
  taxRate?: number;
  taxAmount?: number;
  totalAmount: number;
  receivedAmount?: number;
  expectedDelivery?: Date;
  notes?: string;
  createdBy?: string;
  updatedBy?: string;
  approvedBy?: string;
  approvedAt?: Date;
  orderedAt?: Date;
  cancelledBy?: string;
  cancelledAt?: Date;
  cancellationReason?: string;
  lastReceivedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface PurchaseOrderReceipt {
  id: string;
  purchaseOrderId: string;
  orderNumber: string;
  supplierId: string;
  locationId: string;
  items: Array<{
    productId: string;
    receivedQuantity: number;
    unitCost: number;
    notes?: string;
  }>;
  deliveryDate: Date;
  invoiceNumber?: string;
  totalReceived: number;
  totalValue: number;
  notes?: string;
  receivedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface Supplier {
  id: string;
  name: string;
  contactEmail?: string;
  contactPhone?: string;
  defaultTaxRate?: number;
  isActive?: boolean;
}

interface Stock {
  id?: string;
  productId: string;
  locationId: string;
  currentQuantity: number;
  reorderPoint?: number;
  reorderQuantity?: number;
}

interface Product {
  id: string;
  name: string;
  sku?: string;
  price?: number;
  cost?: number;
  primarySupplierId?: string;
}

export class PurchaseOrderService {
  private stockService: StockService;

  constructor() {
    this.stockService = new StockService();
  }

  /**
   * Get purchase orders with filtering and pagination
   */
  async getPurchaseOrders(tenantId: string, filters: {
    page?: number;
    limit?: number;
    status?: string;
    supplierId?: string;
    locationId?: string;
    startDate?: Date;
    endDate?: Date;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<{
    orders: PurchaseOrder[];
    totalCount: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('purchase_orders');

      const {
        page = 1,
        limit = 20,
        status,
        supplierId,
        locationId,
        startDate,
        endDate,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = filters;

      // Build query
      const query: any = {};

      if (status) query.status = status;
      if (supplierId) query.supplierId = supplierId;
      if (locationId) query.locationId = locationId;

      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = startDate;
        if (endDate) query.createdAt.$lte = endDate;
      }

      if (search) {
        query.$or = [
          { orderNumber: { $regex: search, $options: 'i' } },
          { 'supplier.name': { $regex: search, $options: 'i' } },
          { notes: { $regex: search, $options: 'i' } }
        ];
      }

      // Build sort
      const sort: any = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      const [orders, totalCount] = await Promise.all([
        collection
          .find(query)
          .sort(sort)
          .skip((page - 1) * limit)
          .limit(limit)
          .toArray(),
        collection.countDocuments(query),
      ]);

      return {
        orders,
        totalCount,
        page,
        totalPages: Math.ceil(totalCount / limit),
      };

    } catch (error) {
      logger.error('Get purchase orders error', {
        tenantId,
        filters,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get purchase order by ID
   */
  async getPurchaseOrderById(tenantId: string, orderId: string): Promise<PurchaseOrder | null> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('purchase_orders');

      const order = await collection.findOne({ id: orderId });
      return order;

    } catch (error) {
      logger.error('Get purchase order by ID error', {
        tenantId,
        orderId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Create new purchase order
   */
  async createPurchaseOrder(
    tenantId: string,
    data: Omit<PurchaseOrder, 'id' | 'orderNumber' | 'createdAt' | 'updatedAt'>
  ): Promise<PurchaseOrder> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('purchase_orders');
      const suppliersCollection = db.collection('suppliers');

      // Validate supplier exists
      const supplier = await suppliersCollection.findOne({ id: data.supplierId });
      if (!supplier) {
        throw new Error('Supplier not found');
      }

      // Generate order number
      const orderNumber = await this.generateOrderNumber(tenantId);

      // Calculate totals
      const totals = this.calculateOrderTotals(data.items, data.discounts || [], data.taxRate || 0);

      const order: PurchaseOrder = {
        id: uuidv4(),
        orderNumber,
        ...data,
        supplier: {
          id: supplier.id,
          name: supplier.name,
          contactEmail: supplier.contactEmail,
          contactPhone: supplier.contactPhone,
        },
        subtotal: totals.subtotal,
        discountAmount: totals.discountAmount,
        taxAmount: totals.taxAmount,
        totalAmount: totals.totalAmount,
        status: 'draft',
        receivedAmount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await collection.insertOne(order as any);

      logger.info('Purchase order created', {
        tenantId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        supplierId: order.supplierId,
        totalAmount: order.totalAmount,
      });

      return order;

    } catch (error) {
      logger.error('Create purchase order error', {
        tenantId,
        data,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Update purchase order
   */
  async updatePurchaseOrder(
    tenantId: string,
    orderId: string,
    updates: Partial<Omit<PurchaseOrder, 'id' | 'orderNumber' | 'createdAt' | 'updatedAt'>>
  ): Promise<void> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('purchase_orders');

      // Recalculate totals if items were updated
      let updateData: any = { ...updates };
      if (updates.items) {
        const currentOrder = await collection.findOne({ id: orderId });
        if (currentOrder) {
          const totals = this.calculateOrderTotals(
            updates.items,
            updates.discounts || currentOrder.discounts || [],
            updates.taxRate || currentOrder.taxRate || 0
          );

          updateData = {
            ...updateData,
            subtotal: totals.subtotal,
            discountAmount: totals.discountAmount,
            taxAmount: totals.taxAmount,
            totalAmount: totals.totalAmount,
          };
        }
      }

      updateData.updatedAt = new Date();

      const result = await collection.updateOne(
        { id: orderId },
        { $set: updateData }
      );

      if (result.matchedCount === 0) {
        throw new Error('Purchase order not found');
      }

      logger.info('Purchase order updated', {
        tenantId,
        orderId,
        updates: Object.keys(updates),
      });

    } catch (error) {
      logger.error('Update purchase order error', {
        tenantId,
        orderId,
        updates,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Update purchase order status
   */
  async updatePurchaseOrderStatus(
    tenantId: string,
    orderId: string,
    data: {
      status: string;
      notes?: string;
      updatedBy: string;
    }
  ): Promise<void> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('purchase_orders');

      const updateData: any = {
        status: data.status,
        updatedBy: data.updatedBy,
        updatedAt: new Date(),
      };

      // Add status-specific fields
      switch (data.status) {
        case 'approved':
          updateData.approvedBy = data.updatedBy;
          updateData.approvedAt = new Date();
          break;
        case 'ordered':
          updateData.orderedAt = new Date();
          break;
        case 'cancelled':
          updateData.cancelledBy = data.updatedBy;
          updateData.cancelledAt = new Date();
          updateData.cancellationReason = data.notes;
          break;
      }

      if (data.notes) {
        updateData.notes = data.notes;
      }

      const result = await collection.updateOne(
        { id: orderId },
        { $set: updateData }
      );

      if (result.matchedCount === 0) {
        throw new Error('Purchase order not found');
      }

      logger.info('Purchase order status updated', {
        tenantId,
        orderId,
        status: data.status,
        updatedBy: data.updatedBy,
      });

    } catch (error) {
      logger.error('Update purchase order status error', {
        tenantId,
        orderId,
        data,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Receive purchase order (full or partial)
   */
  async receivePurchaseOrder(
    tenantId: string,
    orderId: string,
    receiptData: {
      items: Array<{
        productId: string;
        receivedQuantity: number;
        unitCost: number;
        notes?: string;
      }>;
      deliveryDate: Date;
      invoiceNumber?: string;
      notes?: string;
      receivedBy: string;
    }
  ): Promise<PurchaseOrderReceipt> {
    try {
      const db = await getTenantDatabase(tenantId);
      const ordersCollection = db.collection('purchase_orders');
      const receiptsCollection = db.collection('purchase_order_receipts');

      const order = await ordersCollection.findOne({ id: orderId });
      if (!order) {
        throw new Error('Purchase order not found');
      }

      // Validate received quantities
      for (const receivedItem of receiptData.items) {
        const orderItem = order.items.find((item: any) => item.productId === receivedItem.productId);
        if (!orderItem) {
          throw new Error(`Product ${receivedItem.productId} not found in purchase order`);
        }

        // Check if receiving more than ordered
        const totalReceived = await this.getTotalReceivedForItem(tenantId, orderId, receivedItem.productId);
        const newTotal = new Decimal(totalReceived).plus(receivedItem.receivedQuantity);

        if (newTotal.gt(orderItem.quantity)) {
          throw new Error(`Cannot receive more than ordered quantity for product ${receivedItem.productId}`);
        }
      }

      // Create receipt
      const receipt: PurchaseOrderReceipt = {
        id: uuidv4(),
        purchaseOrderId: orderId,
        orderNumber: order.orderNumber,
        supplierId: order.supplierId,
        locationId: order.locationId,
        items: receiptData.items,
        deliveryDate: receiptData.deliveryDate,
        invoiceNumber: receiptData.invoiceNumber,
        totalReceived: receiptData.items.reduce((sum, item) => sum + item.receivedQuantity, 0),
        totalValue: receiptData.items.reduce((sum, item) =>
          new Decimal(sum).plus(new Decimal(item.receivedQuantity).mul(item.unitCost)).toNumber(), 0
        ),
        notes: receiptData.notes,
        receivedBy: receiptData.receivedBy,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await receiptsCollection.insertOne(receipt as any);

      // Update stock levels
      for (const item of receiptData.items) {
        await this.stockService.recordStockMovement(tenantId, {
          productId: item.productId,
          locationId: order.locationId,
          movementType: 'purchase',
          quantity: item.receivedQuantity,
          unitCost: item.unitCost,
          reason: 'Purchase order receipt',
          referenceId: order.orderNumber,
          notes: item.notes,
          createdBy: receiptData.receivedBy,
        });
      }

      // Update purchase order status
      const totalOrderReceived = await this.getTotalReceivedForOrder(tenantId, orderId);
      const totalOrderQuantity = order.items.reduce((sum: number, item: any) => sum + item.quantity, 0);

      let newStatus = order.status;
      if (totalOrderReceived >= totalOrderQuantity) {
        newStatus = 'received';
      } else if (totalOrderReceived > 0) {
        newStatus = 'partially_received';
      }

      await ordersCollection.updateOne(
        { id: orderId },
        {
          $set: {
            status: newStatus,
            receivedAmount: totalOrderReceived,
            lastReceivedAt: new Date(),
            updatedAt: new Date(),
          },
        }
      );

      logger.info('Purchase order received', {
        tenantId,
        orderId,
        receiptId: receipt.id,
        totalReceived: receipt.totalReceived,
        newStatus,
      });

      return receipt;

    } catch (error) {
      logger.error('Receive purchase order error', {
        tenantId,
        orderId,
        receiptData,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Cancel purchase order
   */
  async cancelPurchaseOrder(
    tenantId: string,
    orderId: string,
    data: {
      reason: string;
      cancelledBy: string;
    }
  ): Promise<void> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('purchase_orders');

      const result = await collection.updateOne(
        { id: orderId },
        {
          $set: {
            status: 'cancelled',
            cancellationReason: data.reason,
            cancelledBy: data.cancelledBy,
            cancelledAt: new Date(),
            updatedAt: new Date(),
          },
        }
      );

      if (result.matchedCount === 0) {
        throw new Error('Purchase order not found');
      }

      logger.info('Purchase order cancelled', {
        tenantId,
        orderId,
        reason: data.reason,
        cancelledBy: data.cancelledBy,
      });

    } catch (error) {
      logger.error('Cancel purchase order error', {
        tenantId,
        orderId,
        data,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get purchase order receipts
   */
  async getPurchaseOrderReceipts(tenantId: string, orderId: string): Promise<PurchaseOrderReceipt[]> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('purchase_order_receipts');

      const receipts = await collection
        .find({ purchaseOrderId: orderId })
        .sort({ createdAt: -1 })
        .toArray();

      return receipts;

    } catch (error) {
      logger.error('Get purchase order receipts error', {
        tenantId,
        orderId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Generate purchase orders from reorder points
   */
  async generateFromReorderPoints(
    tenantId: string,
    options: {
      locationId?: string;
      supplierId?: string;
      autoApprove?: boolean;
      createdBy: string;
    }
  ): Promise<PurchaseOrder[]> {
    try {
      const db = await getTenantDatabase(tenantId);
      const stockCollection = db.collection('stock');
      const productsCollection = db.collection('products');
      const suppliersCollection = db.collection('suppliers');

      // Find products that need reordering
      const reorderQuery: any = {
        $expr: {
          $lte: ['$currentQuantity', '$reorderPoint']
        }
      };

      if (options.locationId) {
        reorderQuery.locationId = options.locationId;
      }

      const lowStockItems = await stockCollection
        .find(reorderQuery)
        .toArray();

      if (lowStockItems.length === 0) {
        return [];
      }

      // Group by supplier
      const supplierGroups: Record<string, Stock[]> = {};

      for (const stock of lowStockItems) {
        const product = await productsCollection.findOne({ id: stock.productId });
        if (!product || !product.primarySupplierId) continue;

        const supplierId = product.primarySupplierId;
        if (options.supplierId && supplierId !== options.supplierId) continue;

        if (!supplierGroups[supplierId]) {
          supplierGroups[supplierId] = [];
        }
        supplierGroups[supplierId].push(stock);
      }

      const orders: PurchaseOrder[] = [];

      // Create purchase orders for each supplier
      for (const [supplierId, stockItems] of Object.entries(supplierGroups)) {
        const supplier = await suppliersCollection.findOne({ id: supplierId });
        if (!supplier) continue;

        const orderItems: PurchaseOrderItem[] = [];

        for (const stock of stockItems) {
          const product = await productsCollection.findOne({ id: stock.productId });
          if (!product) continue;

          const quantity = stock.reorderQuantity || 100;
          const unitCost = product.cost || (product.price || 0) * 0.6;
          orderItems.push({
            productId: product.id,
            productName: product.name,
            sku: product.sku,
            quantity,
            unitCost,
            totalCost: quantity * unitCost,
            notes: `Auto-generated from reorder point (${stock.reorderPoint})`,
          });
        }

        if (orderItems.length === 0) continue;

        const order = await this.createPurchaseOrder(tenantId, {
          supplierId,
          locationId: options.locationId || stockItems[0].locationId,
          items: orderItems,
          notes: 'Auto-generated from reorder points',
          expectedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
          taxRate: supplier.defaultTaxRate || 0,
          discounts: [],
          createdBy: options.createdBy,
          status: 'draft',
          totalAmount: 0,
        });

        if (options.autoApprove) {
          await this.updatePurchaseOrderStatus(tenantId, order.id, {
            status: 'approved',
            notes: 'Auto-approved',
            updatedBy: options.createdBy,
          });
        }

        orders.push(order);
      }

      logger.info('Purchase orders generated from reorder points', {
        tenantId,
        ordersGenerated: orders.length,
        locationId: options.locationId,
        supplierId: options.supplierId,
      });

      return orders;

    } catch (error) {
      logger.error('Generate from reorder points error', {
        tenantId,
        options,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get purchase order statistics
   */
  async getPurchaseOrderStats(
    tenantId: string,
    filters: {
      locationId?: string;
      supplierId?: string;
      period?: string;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<{
    totalOrders: number;
    totalValue: number;
    averageOrderValue: number;
    ordersByStatus: Record<string, number>;
    topSuppliers: Array<{ supplierId: string; supplierName: string; orderCount: number; totalValue: number }>;
    monthlyTrend: Array<{ month: string; orderCount: number; totalValue: number }>;
  }> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('purchase_orders');

      const { locationId, supplierId, period = 'month', startDate, endDate } = filters;

      // Build date range
      let dateFilter: Date = new Date();
      if (startDate && endDate) {
        dateFilter = startDate;
      } else {
        switch (period) {
          case 'week':
            dateFilter.setDate(dateFilter.getDate() - 7);
            break;
          case 'month':
            dateFilter.setMonth(dateFilter.getMonth() - 1);
            break;
          case 'quarter':
            dateFilter.setMonth(dateFilter.getMonth() - 3);
            break;
          case 'year':
            dateFilter.setFullYear(dateFilter.getFullYear() - 1);
            break;
        }
      }

      const matchStage: any = {
        createdAt: { $gte: dateFilter }
      };

      if (endDate) {
        matchStage.createdAt.$lte = endDate;
      }

      if (locationId) matchStage.locationId = locationId;
      if (supplierId) matchStage.supplierId = supplierId;

      // Main statistics
      const statsPipeline = [
        { $match: matchStage },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalValue: { $sum: '$totalAmount' },
            statusCounts: {
              $push: '$status'
            },
            suppliers: {
              $push: {
                id: '$supplierId',
                name: '$supplier.name',
                value: '$totalAmount'
              }
            }
          }
        }
      ];

      const [stats] = await collection.aggregate(statsPipeline).toArray();

      if (!stats) {
        return {
          totalOrders: 0,
          totalValue: 0,
          averageOrderValue: 0,
          ordersByStatus: {},
          topSuppliers: [],
          monthlyTrend: [],
        };
      }

      // Process status counts
      const ordersByStatus = (stats.statusCounts as string[]).reduce((acc, status) => {
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Process top suppliers
      const supplierMap = new Map();
      (stats.suppliers as any[]).forEach(supplier => {
        if (supplierMap.has(supplier.id)) {
          const existing = supplierMap.get(supplier.id);
          existing.orderCount += 1;
          existing.totalValue += supplier.value;
        } else {
          supplierMap.set(supplier.id, {
            supplierId: supplier.id,
            supplierName: supplier.name,
            orderCount: 1,
            totalValue: supplier.value,
          });
        }
      });

      const topSuppliers = Array.from(supplierMap.values())
        .sort((a, b) => b.totalValue - a.totalValue)
        .slice(0, 10);

      // Monthly trend (placeholder - would need more complex aggregation)
      const monthlyTrend: Array<{ month: string; orderCount: number; totalValue: number }> = [];

      return {
        totalOrders: stats.totalOrders,
        totalValue: parseFloat(new Decimal(stats.totalValue).toFixed(2)),
        averageOrderValue: stats.totalOrders > 0
          ? parseFloat(new Decimal(stats.totalValue).div(stats.totalOrders).toFixed(2))
          : 0,
        ordersByStatus,
        topSuppliers,
        monthlyTrend,
      };

    } catch (error) {
      logger.error('Get purchase order stats error', {
        tenantId,
        filters,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Calculate order totals
   */
  private calculateOrderTotals(
    items: PurchaseOrderItem[],
    discounts: any[] = [],
    taxRate: number = 0
  ): {
    subtotal: number;
    discountAmount: number;
    taxAmount: number;
    totalAmount: number;
  } {
    let subtotal = new Decimal(0);

    // Calculate subtotal
    items.forEach(item => {
      const itemTotal = new Decimal(item.quantity).mul(item.unitCost);
      subtotal = subtotal.plus(itemTotal);
    });

    // Calculate discounts
    let discountAmount = new Decimal(0);
    discounts.forEach(discount => {
      if (discount.type === 'percentage') {
        discountAmount = discountAmount.plus(subtotal.mul(discount.value).div(100));
      } else if (discount.type === 'fixed') {
        discountAmount = discountAmount.plus(discount.value);
      }
    });

    // Calculate tax
    const taxableAmount = subtotal.minus(discountAmount);
    const taxAmount = taxableAmount.mul(taxRate).div(100);

    // Calculate total
    const totalAmount = taxableAmount.plus(taxAmount);

    return {
      subtotal: parseFloat(subtotal.toFixed(2)),
      discountAmount: parseFloat(discountAmount.toFixed(2)),
      taxAmount: parseFloat(taxAmount.toFixed(2)),
      totalAmount: parseFloat(totalAmount.toFixed(2)),
    };
  }

  /**
   * Generate unique order number
   */
  private async generateOrderNumber(tenantId: string): Promise<string> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('purchase_orders');

      const count = await collection.countDocuments({});
      const orderNumber = `PO${String(count + 1).padStart(6, '0')}`;

      // Ensure uniqueness
      const existing = await collection.findOne({ orderNumber });
      if (existing) {
        // Fallback to timestamp-based number
        return `PO${Date.now().toString().slice(-6)}`;
      }

      return orderNumber;

    } catch (error) {
      logger.error('Generate order number error', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Fallback to timestamp-based number
      return `PO${Date.now().toString().slice(-6)}`;
    }
  }

  /**
   * Get total received quantity for a specific item
   */
  private async getTotalReceivedForItem(
    tenantId: string,
    orderId: string,
    productId: string
  ): Promise<number> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('purchase_order_receipts');

      const pipeline = [
        { $match: { purchaseOrderId: orderId } },
        { $unwind: '$items' },
        { $match: { 'items.productId': productId } },
        {
          $group: {
            _id: null,
            totalReceived: { $sum: '$items.receivedQuantity' }
          }
        }
      ];

      const [result] = await collection.aggregate(pipeline).toArray();
      return result?.totalReceived || 0;

    } catch (error) {
      logger.error('Get total received for item error', {
        tenantId,
        orderId,
        productId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return 0;
    }
  }

  /**
   * Get total received quantity for entire order
   */
  private async getTotalReceivedForOrder(tenantId: string, orderId: string): Promise<number> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('purchase_order_receipts');

      const pipeline = [
        { $match: { purchaseOrderId: orderId } },
        {
          $group: {
            _id: null,
            totalReceived: { $sum: '$totalReceived' }
          }
        }
      ];

      const [result] = await collection.aggregate(pipeline).toArray();
      return result?.totalReceived || 0;

    } catch (error) {
      logger.error('Get total received for order error', {
        tenantId,
        orderId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return 0;
    }
  }
}