// Customer management service

import Decimal from 'decimal.js';
import {
  logger,
  getTenantDatabase,
  Order,
} from '@properpos/backend-shared';
import { POSCustomer as Customer, LoyaltyTransaction, CustomerStats } from '../types';

export class CustomerService {
  constructor() {
    // No initialization needed - using getTenantDatabase directly
  }

  /**
   * Get customers with pagination and filtering
   */
  async getCustomers(tenantId: string, filters: {
    page?: number;
    limit?: number;
    search?: string;
    isActive?: boolean;
    orderBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<{
    customers: Customer[];
    totalCount: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('customers');

      const {
        page = 1,
        limit = 20,
        search,
        isActive,
        orderBy = 'name',
        sortOrder = 'asc'
      } = filters;

      // Build query
      const query: any = {};

      if (isActive !== undefined) {
        query.isActive = isActive;
      }

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
          { customerNumber: { $regex: search, $options: 'i' } },
        ];
      }

      // Build sort
      const sort: any = {};
      sort[orderBy] = sortOrder === 'desc' ? -1 : 1;

      const [customers, totalCount] = await Promise.all([
        collection
          .find(query)
          .sort(sort)
          .skip((page - 1) * limit)
          .limit(limit)
          .toArray(),
        collection.countDocuments(query),
      ]);

      return {
        customers,
        totalCount,
        page,
        totalPages: Math.ceil(totalCount / limit),
      };

    } catch (error) {
      logger.error('Get customers error', {
        tenantId,
        filters,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get customer by ID
   */
  async getCustomerById(tenantId: string, customerId: string): Promise<Customer | null> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('customers');

      const customer = await collection.findOne({ id: customerId });
      return customer;

    } catch (error) {
      logger.error('Get customer by ID error', {
        tenantId,
        customerId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Create new customer
   */
  async createCustomer(
    tenantId: string,
    data: Omit<Customer, 'id' | 'customerNumber' | 'createdAt' | 'updatedAt'>
  ): Promise<Customer> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('customers');

      // Check for duplicate email if provided
      if (data.email) {
        const existingCustomer = await collection.findOne({
          email: { $regex: new RegExp(`^${data.email}$`, 'i') },
        });

        if (existingCustomer) {
          throw new Error('Customer with this email already exists');
        }
      }

      // Check for duplicate phone if provided
      if (data.phone) {
        const existingCustomer = await collection.findOne({ phone: data.phone });
        if (existingCustomer) {
          throw new Error('Customer with this phone number already exists');
        }
      }

      // Generate customer number
      const customerNumber = await this.generateCustomerNumber(tenantId);

      const customer: Customer = {
        id: require('uuid').v4(),
        customerNumber,
        ...data,
        isActive: true,
        totalSpent: 0,
        totalOrders: 0,
        averageOrderValue: 0,
        lastOrderDate: null,
        loyaltyPoints: 0,
        loyaltyTier: 'bronze',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await collection.insertOne(customer);

      logger.info('Customer created', {
        tenantId,
        customerId: customer.id,
        customerNumber: customer.customerNumber,
        name: customer.name,
        email: customer.email,
      });

      return customer;

    } catch (error) {
      logger.error('Create customer error', {
        tenantId,
        data,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Update customer
   */
  async updateCustomer(
    tenantId: string,
    customerId: string,
    updates: Partial<Omit<Customer, 'id' | 'customerNumber' | 'createdAt' | 'updatedAt'>>
  ): Promise<void> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('customers');

      // Check for duplicate email if being updated
      if (updates.email) {
        const existingCustomer = await collection.findOne({
          email: { $regex: new RegExp(`^${updates.email}$`, 'i') },
          id: { $ne: customerId },
        });

        if (existingCustomer) {
          throw new Error('Customer with this email already exists');
        }
      }

      // Check for duplicate phone if being updated
      if (updates.phone) {
        const existingCustomer = await collection.findOne({
          phone: updates.phone,
          id: { $ne: customerId },
        });

        if (existingCustomer) {
          throw new Error('Customer with this phone number already exists');
        }
      }

      const updateData = {
        ...updates,
        updatedAt: new Date(),
      };

      const result = await collection.updateOne(
        { id: customerId },
        { $set: updateData }
      );

      if (result.matchedCount === 0) {
        throw new Error('Customer not found');
      }

      logger.info('Customer updated', {
        tenantId,
        customerId,
        updates: Object.keys(updates),
      });

    } catch (error) {
      logger.error('Update customer error', {
        tenantId,
        customerId,
        updates,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Deactivate customer
   */
  async deactivateCustomer(
    tenantId: string,
    customerId: string,
    data: { reason?: string; deactivatedBy: string }
  ): Promise<void> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('customers');

      const result = await collection.updateOne(
        { id: customerId },
        {
          $set: {
            isActive: false,
            deactivatedBy: data.deactivatedBy,
            deactivatedAt: new Date(),
            deactivationReason: data.reason,
            updatedAt: new Date(),
          },
        }
      );

      if (result.matchedCount === 0) {
        throw new Error('Customer not found');
      }

      logger.info('Customer deactivated', {
        tenantId,
        customerId,
        reason: data.reason,
        deactivatedBy: data.deactivatedBy,
      });

    } catch (error) {
      logger.error('Deactivate customer error', {
        tenantId,
        customerId,
        data,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Reactivate customer
   */
  async reactivateCustomer(tenantId: string, customerId: string, reactivatedBy: string): Promise<void> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('customers');

      const result = await collection.updateOne(
        { id: customerId },
        {
          $set: {
            isActive: true,
            reactivatedBy,
            reactivatedAt: new Date(),
            updatedAt: new Date(),
          },
          $unset: {
            deactivatedBy: '',
            deactivatedAt: '',
            deactivationReason: '',
          },
        }
      );

      if (result.matchedCount === 0) {
        throw new Error('Customer not found');
      }

      logger.info('Customer reactivated', {
        tenantId,
        customerId,
        reactivatedBy,
      });

    } catch (error) {
      logger.error('Reactivate customer error', {
        tenantId,
        customerId,
        reactivatedBy,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get customer order history
   */
  async getCustomerOrders(
    tenantId: string,
    customerId: string,
    options: {
      page?: number;
      limit?: number;
      status?: string;
    } = {}
  ): Promise<{
    orders: Order[];
    totalCount: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('orders');

      const { page = 1, limit = 10, status } = options;

      const query: any = { customerId };
      if (status) {
        query.status = status;
      }

      const [orders, totalCount] = await Promise.all([
        collection
          .find(query)
          .sort({ createdAt: -1 })
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
      logger.error('Get customer orders error', {
        tenantId,
        customerId,
        options,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get customer statistics
   */
  async getCustomerStats(
    tenantId: string,
    customerId: string,
    options: { period?: string } = {}
  ): Promise<CustomerStats> {
    try {
      const db = await getTenantDatabase(tenantId);
      const ordersCollection = db.collection('orders');

      const { period = 'all' } = options;

      // Build date filter based on period
      const dateFilter: any = { customerId };
      if (period !== 'all') {
        const now = new Date();
        let startDate: Date;

        switch (period) {
          case 'today':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
          case 'week':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case 'month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
          case 'year':
            startDate = new Date(now.getFullYear(), 0, 1);
            break;
          default:
            startDate = new Date(0);
        }

        dateFilter.createdAt = { $gte: startDate };
      }

      const pipeline = [
        { $match: dateFilter },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalSpent: { $sum: '$total' },
            averageOrderValue: { $avg: '$total' },
            lastOrderDate: { $max: '$createdAt' },
            orderStatuses: {
              $push: '$status'
            },
          }
        },
      ];

      const [stats] = await ordersCollection.aggregate(pipeline).toArray();

      if (!stats) {
        return {
          totalOrders: 0,
          totalSpent: 0,
          averageOrderValue: 0,
          lastOrderDate: null,
          completedOrders: 0,
          cancelledOrders: 0,
          refundedOrders: 0,
        };
      }

      // Count order statuses
      const statusCounts = (stats.orderStatuses as string[]).reduce((acc, status) => {
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return {
        totalOrders: stats.totalOrders,
        totalSpent: parseFloat(new Decimal(stats.totalSpent || 0).toFixed(2)),
        averageOrderValue: parseFloat(new Decimal(stats.averageOrderValue || 0).toFixed(2)),
        lastOrderDate: stats.lastOrderDate,
        completedOrders: statusCounts.completed || 0,
        cancelledOrders: statusCounts.cancelled || 0,
        refundedOrders: statusCounts.refunded || 0,
      };

    } catch (error) {
      logger.error('Get customer stats error', {
        tenantId,
        customerId,
        options,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get customer loyalty information
   */
  async getCustomerLoyalty(tenantId: string, customerId: string): Promise<{
    points: number;
    tier: string;
    tierProgress: number;
    nextTier?: string;
    pointsToNextTier?: number;
    transactions: LoyaltyTransaction[];
  }> {
    try {
      const db = await getTenantDatabase(tenantId);
      const customersCollection = db.collection('customers');
      const loyaltyCollection = db.collection('loyalty_transactions');

      const [customer, transactions] = await Promise.all([
        customersCollection.findOne({ id: customerId }),
        loyaltyCollection
          .find({ customerId })
          .sort({ createdAt: -1 })
          .limit(10)
          .toArray(),
      ]);

      if (!customer) {
        throw new Error('Customer not found');
      }

      const tiers = {
        bronze: { min: 0, max: 499 },
        silver: { min: 500, max: 1499 },
        gold: { min: 1500, max: 4999 },
        platinum: { min: 5000, max: Infinity },
      };

      const currentTier = customer.loyaltyTier || 'bronze';
      const currentPoints = customer.loyaltyPoints || 0;

      // Calculate tier progress
      let tierProgress = 0;
      let nextTier: string | undefined;
      let pointsToNextTier: number | undefined;

      const tierNames = Object.keys(tiers);
      const currentTierIndex = tierNames.indexOf(currentTier);

      if (currentTierIndex < tierNames.length - 1) {
        nextTier = tierNames[currentTierIndex + 1];
        const nextTierMin = tiers[nextTier as keyof typeof tiers].min;
        pointsToNextTier = nextTierMin - currentPoints;

        const currentTierMin = tiers[currentTier as keyof typeof tiers].min;
        const currentTierMax = tiers[currentTier as keyof typeof tiers].max;

        if (currentTierMax !== Infinity) {
          tierProgress = ((currentPoints - currentTierMin) / (currentTierMax - currentTierMin + 1)) * 100;
        } else {
          tierProgress = 100;
        }
      } else {
        tierProgress = 100;
      }

      return {
        points: currentPoints,
        tier: currentTier,
        tierProgress: Math.round(tierProgress),
        nextTier,
        pointsToNextTier: pointsToNextTier && pointsToNextTier > 0 ? pointsToNextTier : undefined,
        transactions,
      };

    } catch (error) {
      logger.error('Get customer loyalty error', {
        tenantId,
        customerId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Update loyalty points
   */
  async updateLoyaltyPoints(
    tenantId: string,
    customerId: string,
    data: {
      points: number;
      action: 'add' | 'redeem';
      reason: string;
      orderId?: string;
      processedBy: string;
    }
  ): Promise<{
    newBalance: number;
    previousBalance: number;
    tier: string;
    tierChanged: boolean;
  }> {
    try {
      const db = await getTenantDatabase(tenantId);
      const customersCollection = db.collection('customers');
      const loyaltyCollection = db.collection('loyalty_transactions');

      const customer = await customersCollection.findOne({ id: customerId });
      if (!customer) {
        throw new Error('Customer not found');
      }

      const previousBalance = customer.loyaltyPoints || 0;
      const pointsChange = data.action === 'add' ? data.points : -data.points;
      const newBalance = Math.max(0, previousBalance + pointsChange);

      // Validate redemption
      if (data.action === 'redeem' && previousBalance < data.points) {
        throw new Error('Insufficient loyalty points');
      }

      // Calculate new tier
      const previousTier = customer.loyaltyTier || 'bronze';
      const newTier = this.calculateLoyaltyTier(newBalance);
      const tierChanged = previousTier !== newTier;

      // Update customer
      await customersCollection.updateOne(
        { id: customerId },
        {
          $set: {
            loyaltyPoints: newBalance,
            loyaltyTier: newTier,
            updatedAt: new Date(),
          },
        }
      );

      // Record transaction
      const transaction: LoyaltyTransaction = {
        id: require('uuid').v4(),
        customerId,
        points: pointsChange,
        action: data.action,
        reason: data.reason,
        orderId: data.orderId,
        previousBalance,
        newBalance,
        processedBy: data.processedBy,
        createdAt: new Date(),
      };

      await loyaltyCollection.insertOne(transaction);

      logger.info('Loyalty points updated', {
        tenantId,
        customerId,
        action: data.action,
        points: data.points,
        previousBalance,
        newBalance,
        previousTier,
        newTier,
        tierChanged,
      });

      return {
        newBalance,
        previousBalance,
        tier: newTier,
        tierChanged,
      };

    } catch (error) {
      logger.error('Update loyalty points error', {
        tenantId,
        customerId,
        data,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Search customers optimized for POS
   */
  async searchCustomers(
    tenantId: string,
    options: {
      query: string;
      limit?: number;
      activeOnly?: boolean;
    }
  ): Promise<Customer[]> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('customers');

      const { query, limit = 10, activeOnly = true } = options;

      const searchQuery: any = {
        $or: [
          { name: { $regex: query, $options: 'i' } },
          { email: { $regex: query, $options: 'i' } },
          { phone: { $regex: query, $options: 'i' } },
          { customerNumber: { $regex: query, $options: 'i' } },
        ],
      };

      if (activeOnly) {
        searchQuery.isActive = true;
      }

      const customers = await collection
        .find(searchQuery)
        .sort({ name: 1 })
        .limit(limit)
        .toArray();

      return customers;

    } catch (error) {
      logger.error('Search customers error', {
        tenantId,
        options,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Update customer statistics after order
   */
  async updateCustomerStats(tenantId: string, customerId: string, orderTotal: number): Promise<void> {
    try {
      const db = await getTenantDatabase(tenantId);
      const customersCollection = db.collection('customers');
      const ordersCollection = db.collection('orders');

      const customer = await customersCollection.findOne({ id: customerId });
      if (!customer) {
        return; // Customer might have been deleted
      }

      // Get updated order statistics
      const pipeline = [
        { $match: { customerId, status: { $in: ['completed', 'paid'] } } },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalSpent: { $sum: '$total' },
            lastOrderDate: { $max: '$createdAt' },
          }
        },
      ];

      const [stats] = await ordersCollection.aggregate(pipeline).toArray();

      if (stats) {
        const averageOrderValue = new Decimal(stats.totalSpent).div(stats.totalOrders).toNumber();

        await customersCollection.updateOne(
          { id: customerId },
          {
            $set: {
              totalOrders: stats.totalOrders,
              totalSpent: parseFloat(new Decimal(stats.totalSpent).toFixed(2)),
              averageOrderValue: parseFloat(new Decimal(averageOrderValue).toFixed(2)),
              lastOrderDate: stats.lastOrderDate,
              updatedAt: new Date(),
            },
          }
        );
      }

      logger.info('Customer stats updated', {
        tenantId,
        customerId,
        orderTotal,
      });

    } catch (error) {
      logger.error('Update customer stats error', {
        tenantId,
        customerId,
        orderTotal,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Don't throw error as this is background update
    }
  }

  /**
   * Generate unique customer number
   */
  private async generateCustomerNumber(tenantId: string): Promise<string> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('customers');

      const count = await collection.countDocuments({});
      const customerNumber = `CUST${String(count + 1).padStart(6, '0')}`;

      // Ensure uniqueness
      const existing = await collection.findOne({ customerNumber });
      if (existing) {
        // Fallback to timestamp-based number
        return `CUST${Date.now().toString().slice(-6)}`;
      }

      return customerNumber;

    } catch (error) {
      logger.error('Generate customer number error', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Fallback to timestamp-based number
      return `CUST${Date.now().toString().slice(-6)}`;
    }
  }

  /**
   * Bulk update customers
   */
  async bulkUpdateCustomers(
    tenantId: string,
    customerIds: string[],
    updates: Record<string, any>,
    data: { updatedBy: string }
  ): Promise<{ matchedCount: number; modifiedCount: number }> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('customers');

      const updateData: any = {
        ...updates,
        updatedAt: new Date(),
      };

      // Remove undefined values
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key];
        }
      });

      const result = await collection.updateMany(
        { id: { $in: customerIds } },
        { $set: updateData }
      );

      logger.audit('Customers bulk updated', {
        tenantId,
        customerIds,
        updatedCount: result.modifiedCount,
        updatedBy: data.updatedBy,
      });

      return {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      };

    } catch (error) {
      logger.error('Failed to bulk update customers', {
        tenantId,
        customerIds,
        updates,
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
    data: {
      reason?: string;
      deactivatedBy: string;
    }
  ): Promise<{ matchedCount: number; modifiedCount: number }> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('customers');

      const result = await collection.updateMany(
        { id: { $in: customerIds } },
        {
          $set: {
            isActive: false,
            deactivatedAt: new Date(),
            deactivatedBy: data.deactivatedBy,
            deactivationReason: data.reason,
            updatedAt: new Date(),
          },
        }
      );

      logger.audit('Customers bulk deactivated', {
        tenantId,
        customerIds,
        deactivatedCount: result.modifiedCount,
        reason: data.reason,
        deactivatedBy: data.deactivatedBy,
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
   * Bulk export customers as CSV
   */
  async bulkExportCustomers(
    tenantId: string,
    customerIds?: string[]
  ): Promise<string> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('customers');

      const query: any = {};
      if (customerIds && customerIds.length > 0) {
        query.id = { $in: customerIds };
      }

      const customers = await collection.find(query).toArray();

      // Build CSV
      const headers = ['ID', 'Name', 'Email', 'Phone', 'Status', 'Total Orders', 'Total Spent', 'Loyalty Points', 'Created At'];
      const rows = customers.map((customer: any) => {
        const name = customer.name && customer.name.includes(',') ? `"${customer.name}"` : (customer.name || '');
        const email = customer.email && customer.email.includes(',') ? `"${customer.email}"` : (customer.email || '');
        return [
          customer.id || '',
          name,
          email,
          customer.phone || '',
          customer.isActive ? 'Active' : 'Inactive',
          customer.totalOrders != null ? customer.totalOrders : 0,
          customer.totalSpent != null ? customer.totalSpent : 0,
          customer.loyaltyPoints != null ? customer.loyaltyPoints : 0,
          customer.createdAt ? new Date(customer.createdAt).toISOString() : '',
        ].join(',');
      });

      const csv = [headers.join(','), ...rows].join('\n');

      logger.audit('Customers bulk exported', {
        tenantId,
        customerCount: customers.length,
        filtered: !!(customerIds && customerIds.length > 0),
      });

      return csv;

    } catch (error) {
      logger.error('Failed to bulk export customers', {
        tenantId,
        customerIds,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Calculate loyalty tier based on points
   */
  private calculateLoyaltyTier(points: number): string {
    if (points >= 5000) return 'platinum';
    if (points >= 1500) return 'gold';
    if (points >= 500) return 'silver';
    return 'bronze';
  }
}