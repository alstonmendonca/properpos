// Database Service - Wrapper for tenant database operations

import mongoose from 'mongoose';
import tenantDB from './mongodb';
import { logger } from '../utils/logger';

/**
 * DatabaseService provides a unified interface for database operations
 * across different tenant databases
 */
export class DatabaseService {
  private currentTenantId: string | null = null;
  private connection: mongoose.Connection | null = null;

  /**
   * Set the current tenant for database operations
   */
  async setTenant(tenantId: string): Promise<void> {
    this.currentTenantId = tenantId;
    this.connection = await tenantDB.getTenantDB(tenantId);
  }

  /**
   * Get the current connection
   */
  getConnection(): mongoose.Connection {
    if (!this.connection) {
      // Return platform DB if no tenant is set
      return tenantDB.getPlatformDB();
    }
    return this.connection;
  }

  /**
   * Get a model for the current tenant
   */
  getModel<T>(name: string, schema: mongoose.Schema): mongoose.Model<T> {
    const conn = this.getConnection();
    if (conn.models[name]) {
      return conn.models[name] as mongoose.Model<T>;
    }
    return conn.model<T>(name, schema);
  }

  /**
   * Get the platform database connection
   */
  getPlatformDB(): mongoose.Connection {
    return tenantDB.getPlatformDB();
  }

  /**
   * Get tenant database connection
   */
  async getTenantDB(tenantId: string): Promise<mongoose.Connection> {
    return tenantDB.getTenantDB(tenantId);
  }

  /**
   * Execute a transaction
   */
  async withTransaction<T>(
    callback: (session: mongoose.ClientSession) => Promise<T>
  ): Promise<T> {
    const conn = this.getConnection();
    const session = await conn.startSession();

    try {
      session.startTransaction();
      const result = await callback(session);
      await session.commitTransaction();
      return result;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }
}

// Placeholder types for inventory entities
export interface Stock {
  id: string;
  tenantId: string;
  productId: string;
  locationId: string;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  reorderLevel: number;
  reorderQuantity: number;
  lastUpdated: Date;
}

export interface StockMovement {
  id: string;
  tenantId: string;
  productId: string;
  locationId: string;
  type: 'in' | 'out' | 'transfer' | 'adjustment';
  quantity: number;
  reason?: string;
  reference?: string;
  createdAt: Date;
  createdBy: string;
}

export interface StockAlert {
  id: string;
  tenantId: string;
  productId: string;
  locationId: string;
  type: 'low_stock' | 'out_of_stock' | 'overstock';
  threshold: number;
  currentLevel: number;
  status: 'active' | 'resolved';
  createdAt: Date;
}

export interface StockForecast {
  productId: string;
  locationId: string;
  forecastDate: Date;
  predictedDemand: number;
  confidence: number;
}

export interface InventoryValuation {
  tenantId: string;
  locationId?: string;
  totalValue: number;
  totalItems: number;
  valuationMethod: 'fifo' | 'lifo' | 'average';
  asOfDate: Date;
}

// Note: Product type is exported from @properpos/shared

export interface Supplier {
  id: string;
  tenantId: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  isActive: boolean;
}

export interface PurchaseOrder {
  id: string;
  tenantId: string;
  supplierId: string;
  locationId: string;
  status: 'draft' | 'pending' | 'approved' | 'received' | 'cancelled';
  items: PurchaseOrderItem[];
  totalAmount: number;
  createdAt: Date;
  expectedDelivery?: Date;
}

export interface PurchaseOrderItem {
  productId: string;
  quantity: number;
  unitCost: number;
  receivedQuantity?: number;
}

// Default export
export default DatabaseService;
