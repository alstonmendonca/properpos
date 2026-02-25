// Order service implementation

import { v4 as uuidv4 } from 'uuid';
import Decimal from 'decimal.js';

import {
  logger,
  ApiError,
  getPlatformDatabase,
  getTenantDatabase,
  getTenantDB,
  cache,
  UserRoles,
} from '@properpos/backend-shared';

import type { ClientSession } from 'mongodb';

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['completed', 'cancelled'],
  completed: [],    // terminal state
  cancelled: [],    // terminal state
};

interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  productSku?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  modifiers?: Array<{
    id: string;
    name: string;
    price: number;
  }>;
  notes?: string;
}

interface Order {
  id: string;
  orderNumber: string;
  locationId: string;
  customerId?: string;
  customerInfo?: {
    name?: string;
    phone?: string;
    email?: string;
  };
  orderType: 'dine-in' | 'takeout' | 'delivery' | 'online' | 'drive-thru';
  tableNumber?: string;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  taxRate: number;
  discounts: Array<{
    id: string;
    name: string;
    type: 'percentage' | 'fixed';
    amount: number;
    totalDiscount: number;
  }>;
  total: number;
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  paymentStatus: 'pending' | 'partial' | 'paid' | 'refunded' | 'failed';
  payments: Array<{
    id: string;
    method: 'cash' | 'card' | 'digital_wallet' | 'gift_card' | 'store_credit';
    amount: number;
    status: 'pending' | 'completed' | 'failed' | 'refunded';
    transactionId?: string;
    processedAt?: Date;
    processedBy?: string;
  }>;
  refunds: Array<{
    id: string;
    amount: number;
    reason: string;
    items?: string[];
    processedAt: Date;
    processedBy: string;
  }>;
  notes?: string;
  specialInstructions?: string;
  estimatedReadyTime?: Date;
  cashierId: string;
  cashierName: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  cancellationReason?: string;
}

/**
 * Get the start of a day in a specific IANA timezone.
 * Uses Intl.DateTimeFormat to determine the local date in the target timezone,
 * then computes the UTC instant that corresponds to midnight in that timezone.
 */
function getStartOfDayInTimezone(date: Date, timezone: string): Date {
  // Resolve year/month/day as seen in the target timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) =>
    parseInt(parts.find(p => p.type === type)?.value || '0', 10);

  const year = get('year');
  const month = get('month');
  const day = get('day');

  // Construct a UTC timestamp for midnight on that calendar date in UTC
  const utcMidnight = Date.UTC(year, month - 1, day, 0, 0, 0, 0);

  // Determine the timezone offset at that moment by formatting the UTC midnight
  // instant back into the target timezone and reading the resulting local time.
  const probe = new Date(utcMidnight);
  const probeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const probeParts = probeFormatter.formatToParts(probe);
  let probeHour = parseInt(
    probeParts.find(p => p.type === 'hour')?.value || '0', 10
  );
  const probeMinute = parseInt(
    probeParts.find(p => p.type === 'minute')?.value || '0', 10
  );
  // Intl may return hour 24 for midnight in some locales
  if (probeHour === 24) probeHour = 0;

  // offsetMinutes is how far ahead the timezone is from UTC.
  // When it is 00:00 UTC, local time is probeHour:probeMinute,
  // so offset = probeHour * 60 + probeMinute.
  // Timezones behind UTC (e.g. America/New_York) wrap past midnight,
  // producing a large hour value (e.g. 19 for UTC-5).
  let offsetMinutes = probeHour * 60 + probeMinute;
  if (offsetMinutes > 720) {
    offsetMinutes = offsetMinutes - 1440;
  }

  // Midnight local = midnight UTC - offset
  return new Date(utcMidnight - offsetMinutes * 60 * 1000);
}

/**
 * Get the start of the current week (Sunday) in a specific timezone.
 */
function getStartOfWeekInTimezone(date: Date, timezone: string): Date {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) =>
    parseInt(parts.find(p => p.type === type)?.value || '0', 10);

  const year = get('year');
  const month = get('month');
  const day = get('day');

  // Determine day-of-week for the local date
  const localDate = new Date(year, month - 1, day);
  const dayOfWeek = localDate.getDay(); // 0 = Sunday

  // Walk back to Sunday and get midnight in that timezone
  const sunday = new Date(year, month - 1, day - dayOfWeek);
  return getStartOfDayInTimezone(sunday, timezone);
}

/**
 * Get the start of the current month in a specific timezone.
 */
function getStartOfMonthInTimezone(date: Date, timezone: string): Date {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) =>
    parseInt(parts.find(p => p.type === type)?.value || '0', 10);

  const year = get('year');
  const month = get('month');

  const firstOfMonth = new Date(year, month - 1, 1);
  return getStartOfDayInTimezone(firstOfMonth, timezone);
}

interface OrderStats {
  today: {
    orders: number;
    revenue: number;
    averageOrderValue: number;
  };
  thisWeek: {
    orders: number;
    revenue: number;
    averageOrderValue: number;
  };
  thisMonth: {
    orders: number;
    revenue: number;
    averageOrderValue: number;
  };
  byStatus: Record<string, number>;
  byOrderType: Record<string, number>;
  topProducts: Array<{
    productId: string;
    productName: string;
    quantity: number;
    revenue: number;
  }>;
}

export class OrderService {
  /**
   * Get orders with filtering and pagination
   */
  async getOrders(
    tenantId: string,
    options: {
      page: number;
      limit: number;
      locationId?: string;
      status?: string;
      startDate?: Date;
      endDate?: Date;
      customerId?: string;
      orderNumber?: string;
      minTotal?: number;
      maxTotal?: number;
    }
  ): Promise<{
    data: Order[];
    meta: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasMore: boolean;
    };
  }> {
    try {
      const {
        page,
        limit,
        locationId,
        status,
        startDate,
        endDate,
        customerId,
        orderNumber,
        minTotal,
        maxTotal
      } = options;
      const skip = (page - 1) * limit;

      // Get tenant database
      const db = await getTenantDatabase(tenantId);

      // Build query
      const query: any = {};

      if (locationId) query.locationId = locationId;
      if (status) query.status = status;
      if (customerId) query.customerId = customerId;
      if (orderNumber) query.orderNumber = { $regex: orderNumber, $options: 'i' };

      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = startDate;
        if (endDate) query.createdAt.$lte = endDate;
      }

      if (minTotal !== undefined || maxTotal !== undefined) {
        query.total = {};
        if (minTotal !== undefined) query.total.$gte = minTotal;
        if (maxTotal !== undefined) query.total.$lte = maxTotal;
      }

      // Get total count
      const totalCount = await db.collection('orders').countDocuments(query);

      // Get orders
      const orders = await db.collection('orders')
        .find(query)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .toArray();

      const totalPages = Math.ceil(totalCount / limit);

      return {
        data: orders as unknown as Order[],
        meta: {
          page,
          limit,
          total: totalCount,
          totalPages,
          hasMore: page < totalPages,
        },
      };

    } catch (error) {
      logger.error('Failed to get orders', {
        tenantId,
        options,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to retrieve orders', 'ORDERS_FETCH_FAILED', 500);
    }
  }

  /**
   * Get order by ID
   */
  async getOrderById(tenantId: string, orderId: string): Promise<Order | null> {
    try {
      const db = await getTenantDatabase(tenantId);

      const order = await db.collection('orders').findOne({ id: orderId });

      return order as Order | null;

    } catch (error) {
      logger.error('Failed to get order by ID', {
        tenantId,
        orderId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to retrieve order', 'ORDER_FETCH_FAILED', 500);
    }
  }

  /**
   * Create new order
   */
  async createOrder(
    tenantId: string,
    data: Omit<Order, 'id' | 'orderNumber' | 'createdAt' | 'updatedAt' | 'paymentStatus' | 'payments' | 'refunds'>
  ): Promise<Order> {
    // Get the mongoose connection to access the MongoClient for sessions
    const connection = await getTenantDB(tenantId);
    const client = connection.getClient();
    const session = client.startSession();

    try {
      let order!: Order;

      await session.withTransaction(async () => {
        const db = connection.db;
        if (!db) {
          throw new ApiError('Tenant database not connected', 'DB_NOT_CONNECTED', 500);
        }

        // Generate order number
        const orderNumber = await this.generateOrderNumber(db);

        // Calculate totals
        const totals = this.calculateOrderTotals(data.items, data.discounts || [], data.taxRate || 0);

        // Get cashier name
        const cashier = await this.getCashierInfo(data.cashierId);

        order = {
          ...data,
          id: uuidv4(),
          orderNumber,
          subtotal: totals.subtotal,
          tax: totals.tax,
          total: totals.total,
          paymentStatus: 'pending',
          payments: [],
          refunds: [],
          cashierName: cashier.name,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await db.collection('orders').insertOne(order, { session });

        // Update product quantities (for inventory tracking) within the same transaction
        await this.updateProductQuantities(db, order.items, 'decrement', session);
      });

      logger.audit('Order created', {
        tenantId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        locationId: order.locationId,
        total: order.total,
        itemCount: order.items.length,
        createdBy: data.createdBy,
      });

      return order;

    } catch (error) {
      logger.error('Failed to create order', {
        tenantId,
        data,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError('Failed to create order', 'ORDER_CREATION_FAILED', 500);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Update order status
   */
  async updateOrderStatus(
    tenantId: string,
    orderId: string,
    data: {
      status: Order['status'];
      note?: string;
      updatedBy: string;
    }
  ): Promise<void> {
    try {
      const db = await getTenantDatabase(tenantId);

      // Fetch the current order to get its current status
      const currentOrder = await db.collection('orders').findOne({ id: orderId });
      if (!currentOrder) {
        throw new ApiError('Order not found', 'ORDER_NOT_FOUND', 404);
      }

      const previousStatus = currentOrder.status as string;

      // Validate state transition
      const allowedTransitions = VALID_TRANSITIONS[previousStatus];
      if (!allowedTransitions) {
        throw new ApiError(
          `Unknown current order status: ${previousStatus}`,
          'INVALID_ORDER_STATUS',
          400
        );
      }

      if (!allowedTransitions.includes(data.status)) {
        throw new ApiError(
          `Invalid status transition from '${previousStatus}' to '${data.status}'. Allowed transitions: ${allowedTransitions.length > 0 ? allowedTransitions.join(', ') : 'none (terminal state)'}`,
          'INVALID_STATUS_TRANSITION',
          400
        );
      }

      const updateData: any = {
        status: data.status,
        updatedAt: new Date(),
      };

      if (data.note) {
        updateData.statusNote = data.note;
      }

      if (data.status === 'completed') {
        updateData.completedAt = new Date();
      }

      const result = await db.collection('orders').updateOne(
        { id: orderId },
        { $set: updateData }
      );

      if (result.matchedCount === 0) {
        throw new ApiError('Order not found', 'ORDER_NOT_FOUND', 404);
      }

      // Add status history with previousStatus tracked
      await db.collection('order_history').insertOne({
        id: uuidv4(),
        orderId,
        action: 'status_updated',
        previousStatus,
        newStatus: data.status,
        note: data.note,
        updatedBy: data.updatedBy,
        timestamp: new Date(),
      });

      logger.audit('Order status updated', {
        tenantId,
        orderId,
        previousStatus,
        newStatus: data.status,
        updatedBy: data.updatedBy,
      });

    } catch (error) {
      logger.error('Failed to update order status', {
        tenantId,
        orderId,
        data,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError('Failed to update order status', 'ORDER_STATUS_UPDATE_FAILED', 500);
    }
  }

  /**
   * Update order items
   */
  async updateOrderItems(
    tenantId: string,
    orderId: string,
    data: {
      items: OrderItem[];
      updatedBy: string;
    }
  ): Promise<Order> {
    try {
      const db = await getTenantDatabase(tenantId);

      // Get current order
      const currentOrder = await this.getOrderById(tenantId, orderId);
      if (!currentOrder) {
        throw new ApiError('Order not found', 'ORDER_NOT_FOUND', 404);
      }

      // Calculate new totals
      const totals = this.calculateOrderTotals(
        data.items,
        currentOrder.discounts || [],
        currentOrder.taxRate || 0
      );

      const updateData = {
        items: data.items,
        subtotal: totals.subtotal,
        tax: totals.tax,
        total: totals.total,
        updatedAt: new Date(),
      };

      const result = await db.collection('orders').updateOne(
        { id: orderId },
        { $set: updateData }
      );

      if (result.matchedCount === 0) {
        throw new ApiError('Order not found', 'ORDER_NOT_FOUND', 404);
      }

      // Update inventory: restore old quantities and deduct new ones
      await this.updateProductQuantities(db, currentOrder.items, 'increment');
      await this.updateProductQuantities(db, data.items, 'decrement');

      // Get updated order
      const updatedOrder = await this.getOrderById(tenantId, orderId);

      logger.audit('Order items updated', {
        tenantId,
        orderId,
        itemCount: data.items.length,
        newTotal: totals.total,
        updatedBy: data.updatedBy,
      });

      return updatedOrder!;

    } catch (error) {
      logger.error('Failed to update order items', {
        tenantId,
        orderId,
        data,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError('Failed to update order items', 'ORDER_ITEMS_UPDATE_FAILED', 500);
    }
  }

  /**
   * Cancel order
   */
  async cancelOrder(
    tenantId: string,
    orderId: string,
    data: {
      reason: string;
      cancelledBy: string;
    }
  ): Promise<void> {
    try {
      const db = await getTenantDatabase(tenantId);

      // Get current order
      const order = await this.getOrderById(tenantId, orderId);
      if (!order) {
        throw new ApiError('Order not found', 'ORDER_NOT_FOUND', 404);
      }

      // Check if order can be cancelled
      if (order.status === 'completed') {
        throw new ApiError('Cannot cancel completed order', 'ORDER_ALREADY_COMPLETED', 400);
      }

      if (order.status === 'cancelled') {
        throw new ApiError('Order is already cancelled', 'ORDER_ALREADY_CANCELLED', 400);
      }

      const result = await db.collection('orders').updateOne(
        { id: orderId },
        {
          $set: {
            status: 'cancelled',
            cancelledAt: new Date(),
            cancellationReason: data.reason,
            updatedAt: new Date(),
          },
        }
      );

      if (result.matchedCount === 0) {
        throw new ApiError('Order not found', 'ORDER_NOT_FOUND', 404);
      }

      // Restore inventory quantities
      await this.updateProductQuantities(db, order.items, 'increment');

      logger.audit('Order cancelled', {
        tenantId,
        orderId,
        reason: data.reason,
        cancelledBy: data.cancelledBy,
        orderTotal: order.total,
      });

    } catch (error) {
      logger.error('Failed to cancel order', {
        tenantId,
        orderId,
        data,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError('Failed to cancel order', 'ORDER_CANCELLATION_FAILED', 500);
    }
  }

  /**
   * Get order statistics
   */
  async getOrderStats(
    tenantId: string,
    options: {
      locationId?: string;
      period: string;
      userId: string;
    }
  ): Promise<OrderStats> {
    try {
      const db = await getTenantDatabase(tenantId);

      // Look up the organization's timezone from the platform database
      const platformDb = await getPlatformDatabase();
      const org = await platformDb.collection('organizations').findOne(
        { tenantId },
        { projection: { 'settings.timezone': 1 } }
      );
      const timezone = org?.settings?.timezone || 'UTC';

      // Calculate date ranges using the tenant's timezone
      const now = new Date();
      const today = getStartOfDayInTimezone(now, timezone);
      const thisWeek = getStartOfWeekInTimezone(now, timezone);
      const thisMonth = getStartOfMonthInTimezone(now, timezone);

      // Build base query
      const baseQuery: any = {};
      if (options.locationId) {
        baseQuery.locationId = options.locationId;
      }

      // Get statistics in parallel
      const [
        todayStats,
        weekStats,
        monthStats,
        statusStats,
        orderTypeStats,
        topProducts,
      ] = await Promise.all([
        this.getStatsForPeriod(db, { ...baseQuery, createdAt: { $gte: today } }),
        this.getStatsForPeriod(db, { ...baseQuery, createdAt: { $gte: thisWeek } }),
        this.getStatsForPeriod(db, { ...baseQuery, createdAt: { $gte: thisMonth } }),
        this.getStatusStats(db, baseQuery),
        this.getOrderTypeStats(db, baseQuery),
        this.getTopProducts(db, baseQuery, 10),
      ]);

      return {
        today: todayStats,
        thisWeek: weekStats,
        thisMonth: monthStats,
        byStatus: statusStats,
        byOrderType: orderTypeStats,
        topProducts,
      };

    } catch (error) {
      logger.error('Failed to get order statistics', {
        tenantId,
        options,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to retrieve order statistics', 'ORDER_STATS_FAILED', 500);
    }
  }

  /**
   * Validate location access for user
   */
  async validateLocationAccess(
    tenantId: string,
    locationId: string,
    userId: string
  ): Promise<{ allowed: boolean; message?: string }> {
    try {
      // Get user's tenant membership
      const platformDb = await getPlatformDatabase();
      const user = await platformDb.collection('users').findOne(
        { id: userId },
        { projection: { tenantMemberships: 1, globalRole: 1 } }
      );

      if (!user) {
        return { allowed: false, message: 'User not found' };
      }

      // Super admins have access to all locations
      if (user.globalRole === UserRoles.SUPER_ADMIN) {
        return { allowed: true };
      }

      // Find tenant membership
      const membership = user.tenantMemberships?.find((m: any) =>
        m.tenantId === tenantId && m.status === 'active'
      );

      if (!membership) {
        return { allowed: false, message: 'No active membership for tenant' };
      }

      // Tenant owners and admins have access to all locations
      if (membership.role === UserRoles.TENANT_OWNER || membership.role === UserRoles.ADMIN) {
        return { allowed: true };
      }

      // Check specific location access
      const locationAccess = membership.locationAccess || [];
      const hasAccess = locationAccess.includes('*') || locationAccess.includes(locationId);

      return {
        allowed: hasAccess,
        message: hasAccess ? undefined : 'Access denied to this location',
      };

    } catch (error) {
      logger.error('Failed to validate location access', {
        tenantId,
        locationId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return { allowed: false, message: 'Failed to validate access' };
    }
  }

  /**
   * Generate unique order number
   */
  private async generateOrderNumber(db: any): Promise<string> {
    const today = new Date();
    const datePrefix = today.getFullYear().toString().slice(-2) +
      (today.getMonth() + 1).toString().padStart(2, '0') +
      today.getDate().toString().padStart(2, '0');

    // Get today's order count
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const todayOrderCount = await db.collection('orders').countDocuments({
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    });

    const orderSequence = (todayOrderCount + 1).toString().padStart(4, '0');

    return `${datePrefix}-${orderSequence}`;
  }

  /**
   * Calculate order totals
   */
  private calculateOrderTotals(
    items: OrderItem[],
    discounts: Order['discounts'],
    taxRate: number
  ): { subtotal: number; tax: number; total: number } {
    // Calculate subtotal from items
    let subtotal = new Decimal(0);

    items.forEach(item => {
      let itemTotal = new Decimal(item.unitPrice).mul(item.quantity);

      // Add modifier prices
      if (item.modifiers) {
        item.modifiers.forEach(modifier => {
          itemTotal = itemTotal.add(new Decimal(modifier.price).mul(item.quantity));
        });
      }

      subtotal = subtotal.add(itemTotal);
    });

    // Apply discounts
    let discountedSubtotal = subtotal;
    discounts.forEach(discount => {
      if (discount.type === 'percentage') {
        const discountAmount = subtotal.mul(discount.amount).div(100);
        discountedSubtotal = discountedSubtotal.sub(discountAmount).toDecimalPlaces(2);
      } else {
        discountedSubtotal = discountedSubtotal.sub(discount.amount).toDecimalPlaces(2);
      }
    });

    // Clamp discounted subtotal to zero minimum
    discountedSubtotal = Decimal.max(discountedSubtotal, 0);

    // Guard against negative tax rate
    const safeTaxRate = Decimal.max(new Decimal(taxRate), 0);

    // Calculate tax
    const tax = discountedSubtotal.mul(safeTaxRate).div(100);

    // Calculate total
    const total = discountedSubtotal.add(tax);

    return {
      subtotal: subtotal.toDecimalPlaces(2).toNumber(),
      tax: tax.toDecimalPlaces(2).toNumber(),
      total: total.toDecimalPlaces(2).toNumber(),
    };
  }

  /**
   * Get cashier information
   */
  private async getCashierInfo(cashierId: string): Promise<{ name: string }> {
    try {
      const platformDb = await getPlatformDatabase();
      const user = await platformDb.collection('users').findOne(
        { id: cashierId },
        { projection: { profile: 1 } }
      );

      if (!user) {
        return { name: 'Unknown Cashier' };
      }

      return {
        name: `${user.profile.firstName} ${user.profile.lastName}`.trim() || user.email,
      };

    } catch (error) {
      logger.warn('Failed to get cashier info', { cashierId, error });
      return { name: 'Unknown Cashier' };
    }
  }

  /**
   * Update product quantities for inventory tracking.
   * When a session is provided, all updates run within that transaction.
   * When no session is provided, a new transaction is created to ensure atomicity.
   * For decrement operations, stock is validated before updating.
   */
  private async updateProductQuantities(
    db: any,
    items: OrderItem[],
    operation: 'increment' | 'decrement',
    session?: ClientSession
  ): Promise<void> {
    const executeWithSession = async (txnSession: ClientSession) => {
      for (const item of items) {
        if (operation === 'decrement') {
          // Verify sufficient stock before decrementing
          const inventoryDoc = await db.collection('inventory').findOne(
            { productId: item.productId },
            { session: txnSession }
          );

          if (!inventoryDoc) {
            throw new ApiError(
              `Inventory record not found for product: ${item.productId}`,
              'INVENTORY_NOT_FOUND',
              400
            );
          }

          if (inventoryDoc.quantity < item.quantity) {
            throw new ApiError(
              `Insufficient stock for product '${item.productName}' (${item.productId}). Available: ${inventoryDoc.quantity}, requested: ${item.quantity}`,
              'INSUFFICIENT_STOCK',
              400
            );
          }
        }

        const quantityChange = operation === 'increment' ? item.quantity : -item.quantity;

        await db.collection('inventory').updateOne(
          { productId: item.productId },
          {
            $inc: { quantity: quantityChange },
            $set: { updatedAt: new Date() }
          },
          { session: txnSession }
        );
      }
    };

    try {
      if (session) {
        // Use the provided session (already in a transaction)
        await executeWithSession(session);
      } else {
        // Create a new transaction for standalone calls
        const client = db.client;
        const standaloneSession = client.startSession();
        try {
          await standaloneSession.withTransaction(async () => {
            await executeWithSession(standaloneSession);
          });
        } finally {
          await standaloneSession.endSession();
        }
      }
    } catch (error) {
      logger.error('Failed to update product quantities', {
        items: items.map(i => ({ productId: i.productId, quantity: i.quantity })),
        operation,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Re-throw ApiError (stock validation failures) so callers can handle them
      if (error instanceof ApiError) {
        throw error;
      }
      // For unexpected errors, don't break the caller
    }
  }

  /**
   * Get statistics for a specific period
   */
  private async getStatsForPeriod(
    db: any,
    query: any
  ): Promise<{ orders: number; revenue: number; averageOrderValue: number }> {
    const pipeline = [
      { $match: query },
      {
        $group: {
          _id: null,
          orders: { $sum: 1 },
          revenue: { $sum: '$total' }
        }
      }
    ];

    const results = await db.collection('orders').aggregate(pipeline).toArray();

    if (results.length === 0) {
      return { orders: 0, revenue: 0, averageOrderValue: 0 };
    }

    const stats = results[0];
    const averageOrderValue = stats.orders > 0 ? stats.revenue / stats.orders : 0;

    return {
      orders: stats.orders,
      revenue: stats.revenue,
      averageOrderValue: Math.round(averageOrderValue * 100) / 100,
    };
  }

  /**
   * Get order statistics by status
   */
  private async getStatusStats(db: any, baseQuery: any): Promise<Record<string, number>> {
    const pipeline = [
      { $match: baseQuery },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ];

    const results = await db.collection('orders').aggregate(pipeline).toArray();

    const stats: Record<string, number> = {};
    results.forEach((result: any) => {
      stats[result._id] = result.count;
    });

    return stats;
  }

  /**
   * Get order statistics by type
   */
  private async getOrderTypeStats(db: any, baseQuery: any): Promise<Record<string, number>> {
    const pipeline = [
      { $match: baseQuery },
      {
        $group: {
          _id: '$orderType',
          count: { $sum: 1 }
        }
      }
    ];

    const results = await db.collection('orders').aggregate(pipeline).toArray();

    const stats: Record<string, number> = {};
    results.forEach((result: any) => {
      stats[result._id] = result.count;
    });

    return stats;
  }

  /**
   * Get top products
   */
  private async getTopProducts(
    db: any,
    baseQuery: any,
    limit: number
  ): Promise<Array<{
    productId: string;
    productName: string;
    quantity: number;
    revenue: number;
  }>> {
    const pipeline = [
      { $match: baseQuery },
      { $unwind: '$items' },
      {
        $group: {
          _id: {
            productId: '$items.productId',
            productName: '$items.productName'
          },
          quantity: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.totalPrice' }
        }
      },
      {
        $project: {
          productId: '$_id.productId',
          productName: '$_id.productName',
          quantity: 1,
          revenue: 1,
          _id: 0
        }
      },
      { $sort: { quantity: -1 } },
      { $limit: limit }
    ];

    return await db.collection('orders').aggregate(pipeline).toArray();
  }

  /**
   * Bulk update order status
   */
  async bulkUpdateStatus(
    tenantId: string,
    orderIds: string[],
    newStatus: string,
    data: { updatedBy: string }
  ): Promise<{ matchedCount: number; modifiedCount: number; errors: Array<{ orderId: string; error: string }> }> {
    try {
      const db = await getTenantDatabase(tenantId);

      let matchedCount = 0;
      let modifiedCount = 0;
      const errors: Array<{ orderId: string; error: string }> = [];

      for (const orderId of orderIds) {
        const order = await db.collection('orders').findOne({ id: orderId });

        if (!order) {
          errors.push({ orderId, error: 'Order not found' });
          continue;
        }

        matchedCount++;

        const currentStatus = order.status as string;
        const allowedTransitions = VALID_TRANSITIONS[currentStatus];

        if (!allowedTransitions || !allowedTransitions.includes(newStatus)) {
          errors.push({
            orderId,
            error: `Invalid transition from '${currentStatus}' to '${newStatus}'`,
          });
          continue;
        }

        const updateData: any = {
          status: newStatus,
          updatedAt: new Date(),
        };

        if (newStatus === 'completed') {
          updateData.completedAt = new Date();
        }

        await db.collection('orders').updateOne(
          { id: orderId },
          { $set: updateData }
        );

        modifiedCount++;
      }

      logger.audit('Orders bulk status updated', {
        tenantId,
        orderIds,
        newStatus,
        modifiedCount,
        errorCount: errors.length,
        updatedBy: data.updatedBy,
      });

      return { matchedCount, modifiedCount, errors };

    } catch (error) {
      logger.error('Failed to bulk update order status', {
        tenantId,
        orderIds,
        newStatus,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to bulk update order status', 'BULK_STATUS_UPDATE_FAILED', 500);
    }
  }

  /**
   * Bulk cancel orders
   */
  async bulkCancel(
    tenantId: string,
    orderIds: string[],
    data: {
      reason?: string;
      cancelledBy: string;
    }
  ): Promise<{ matchedCount: number; modifiedCount: number; errors: Array<{ orderId: string; error: string }> }> {
    try {
      const db = await getTenantDatabase(tenantId);

      let matchedCount = 0;
      let modifiedCount = 0;
      const errors: Array<{ orderId: string; error: string }> = [];

      for (const orderId of orderIds) {
        const order = await db.collection('orders').findOne({ id: orderId });

        if (!order) {
          errors.push({ orderId, error: 'Order not found' });
          continue;
        }

        matchedCount++;

        if (order.status === 'completed') {
          errors.push({ orderId, error: 'Cannot cancel completed order' });
          continue;
        }

        if (order.status === 'cancelled') {
          errors.push({ orderId, error: 'Order is already cancelled' });
          continue;
        }

        await db.collection('orders').updateOne(
          { id: orderId },
          {
            $set: {
              status: 'cancelled',
              cancelledAt: new Date(),
              cancellationReason: data.reason,
              updatedAt: new Date(),
            },
          }
        );

        modifiedCount++;
      }

      logger.audit('Orders bulk cancelled', {
        tenantId,
        orderIds,
        reason: data.reason,
        modifiedCount,
        errorCount: errors.length,
        cancelledBy: data.cancelledBy,
      });

      return { matchedCount, modifiedCount, errors };

    } catch (error) {
      logger.error('Failed to bulk cancel orders', {
        tenantId,
        orderIds,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to bulk cancel orders', 'BULK_CANCEL_FAILED', 500);
    }
  }

  /**
   * Bulk export orders as CSV
   */
  async bulkExportOrders(
    tenantId: string,
    orderIds?: string[]
  ): Promise<string> {
    try {
      const db = await getTenantDatabase(tenantId);

      const query: any = {};
      if (orderIds && orderIds.length > 0) {
        query.id = { $in: orderIds };
      }

      const orders = await db.collection('orders').find(query).sort({ createdAt: -1 }).toArray();

      // Build CSV
      const headers = ['Order Number', 'Date', 'Customer', 'Type', 'Status', 'Payment Status', 'Subtotal', 'Tax', 'Total', 'Cashier'];
      const rows = orders.map((order: any) => {
        const customerName = order.customerInfo?.name || '';
        const customer = customerName.includes(',') ? `"${customerName}"` : customerName;
        const cashierName = order.cashierName || '';
        const cashier = cashierName.includes(',') ? `"${cashierName}"` : cashierName;
        return [
          order.orderNumber || '',
          order.createdAt ? new Date(order.createdAt).toISOString() : '',
          customer,
          order.orderType || '',
          order.status || '',
          order.paymentStatus || '',
          order.subtotal != null ? order.subtotal : '',
          order.tax != null ? order.tax : '',
          order.total != null ? order.total : '',
          cashier,
        ].join(',');
      });

      const csv = [headers.join(','), ...rows].join('\n');

      logger.audit('Orders bulk exported', {
        tenantId,
        orderCount: orders.length,
        filtered: !!(orderIds && orderIds.length > 0),
      });

      return csv;

    } catch (error) {
      logger.error('Failed to bulk export orders', {
        tenantId,
        orderIds,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to bulk export orders', 'BULK_EXPORT_FAILED', 500);
    }
  }
}
