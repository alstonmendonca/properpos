// MongoDB connection and utilities

import mongoose from 'mongoose';
import { logger, logDatabase } from '../utils/logger';
import { DatabaseError } from '../utils/errors';

// Connection configuration interface
interface MongoDBConfig {
  uri: string;
  options?: mongoose.ConnectOptions;
  dbName?: string;
}

// Multi-tenant database manager
class TenantDatabaseManager {
  private connections: Map<string, mongoose.Connection> = new Map();
  private platformConnection: mongoose.Connection | null = null;

  /**
   * Initialize platform database connection
   */
  async initializePlatformDB(config: MongoDBConfig): Promise<void> {
    try {
      logger.info('Connecting to platform database...');

      const defaultOptions: mongoose.ConnectOptions = {
        maxPoolSize: parseInt(process.env.MONGODB_PLATFORM_POOL_SIZE || '50'), // Increased for production workloads
        minPoolSize: 5, // Keep minimum connections ready
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        bufferCommands: false,
        heartbeatFrequencyMS: 10000, // Check connection health every 10s
        retryWrites: true,
        retryReads: true,
      };

      this.platformConnection = mongoose.createConnection(
        config.uri,
        { ...defaultOptions, ...config.options }
      );

      // Wait for connection to be ready
      await this.platformConnection.asPromise();

      this.platformConnection.on('connected', () => {
        logger.info('Platform database connected successfully');
      });

      this.platformConnection.on('error', (error) => {
        logger.error('Platform database connection error:', error);
      });

      this.platformConnection.on('disconnected', () => {
        logger.warn('Platform database disconnected');
      });

    } catch (error) {
      logger.error('Failed to connect to platform database:', error);
      throw DatabaseError.connectionFailed('Platform database connection failed');
    }
  }

  /**
   * Get platform database connection
   */
  getPlatformDB(): mongoose.Connection {
    if (!this.platformConnection) {
      throw DatabaseError.connectionFailed('Platform database not initialized');
    }
    return this.platformConnection;
  }

  /**
   * Get or create tenant-specific database connection
   */
  async getTenantDB(tenantId: string): Promise<mongoose.Connection> {
    const cacheKey = `tenant_${tenantId}`;

    // Return existing connection if available
    if (this.connections.has(cacheKey)) {
      const connection = this.connections.get(cacheKey)!;
      if (connection.readyState === 1) { // Connected
        return connection;
      }
    }

    try {
      logger.info(`Creating tenant database connection for tenant: ${tenantId}`);

      const baseUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/properpos_platform?authSource=admin';
      const tenantDbName = `properpos_tenant_${tenantId}`;

      // Properly construct tenant URI by replacing the database name
      const url = new URL(baseUri);
      url.pathname = '/' + tenantDbName;
      const tenantUri = url.toString();

      const defaultOptions: mongoose.ConnectOptions = {
        maxPoolSize: parseInt(process.env.MONGODB_TENANT_POOL_SIZE || '15'), // Balanced for multi-tenant workloads
        minPoolSize: 2, // Keep minimum connections ready per tenant
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        bufferCommands: false,
        heartbeatFrequencyMS: 10000,
        retryWrites: true,
        retryReads: true,
      };

      const connection = mongoose.createConnection(tenantUri, defaultOptions);

      // Wait for connection to be ready
      await connection.asPromise();

      // Set up event listeners
      connection.on('connected', () => {
        logger.info(`Tenant database connected for tenant: ${tenantId}`);
      });

      connection.on('error', (error) => {
        logger.error(`Tenant database error for tenant ${tenantId}:`, error);
        this.connections.delete(cacheKey);
      });

      connection.on('disconnected', () => {
        logger.warn(`Tenant database disconnected for tenant: ${tenantId}`);
        this.connections.delete(cacheKey);
      });

      // Cache the connection
      this.connections.set(cacheKey, connection);

      logDatabase('tenant_connection_created', tenantDbName, { tenantId });

      return connection;
    } catch (error) {
      logger.error(`Failed to connect to tenant database for ${tenantId}:`, error);
      throw DatabaseError.connectionFailed(`Tenant database connection failed for ${tenantId}`);
    }
  }

  /**
   * Get tenant database (alias for getTenantDB)
   */
  async getDatabase(tenantId: string): Promise<mongoose.Connection> {
    return this.getTenantDB(tenantId);
  }

  /**
   * Close tenant database connection
   */
  async closeTenantDB(tenantId: string): Promise<void> {
    const cacheKey = `tenant_${tenantId}`;
    const connection = this.connections.get(cacheKey);

    if (connection) {
      try {
        await connection.close();
        this.connections.delete(cacheKey);
        logger.info(`Tenant database connection closed for tenant: ${tenantId}`);
      } catch (error) {
        logger.error(`Error closing tenant database for ${tenantId}:`, error);
      }
    }
  }

  /**
   * Close all connections
   */
  async closeAllConnections(): Promise<void> {
    logger.info('Closing all database connections...');

    // Close platform connection
    if (this.platformConnection) {
      try {
        await this.platformConnection.close();
        this.platformConnection = null;
        logger.info('Platform database connection closed');
      } catch (error) {
        logger.error('Error closing platform database:', error);
      }
    }

    // Close all tenant connections
    const closePromises = Array.from(this.connections.entries()).map(async ([key, connection]) => {
      try {
        await connection.close();
        logger.info(`Tenant database connection closed: ${key}`);
      } catch (error) {
        logger.error(`Error closing tenant database ${key}:`, error);
      }
    });

    await Promise.all(closePromises);
    this.connections.clear();

    logger.info('All database connections closed');
  }

  /**
   * Get connection health status
   */
  getHealthStatus() {
    const platformStatus = this.platformConnection?.readyState === 1 ? 'connected' : 'disconnected';
    const tenantConnections = Array.from(this.connections.entries()).map(([key, connection]) => ({
      tenant: key,
      status: connection.readyState === 1 ? 'connected' : 'disconnected',
    }));

    return {
      platform: platformStatus,
      tenants: tenantConnections,
      totalTenantConnections: this.connections.size,
    };
  }

  /**
   * Clean up idle tenant connections
   */
  async cleanupIdleConnections(maxIdleTime: number = 30 * 60 * 1000): Promise<void> {
    const now = Date.now();
    const connectionsToClose: string[] = [];

    for (const [key, connection] of this.connections.entries()) {
      // Check if connection has been idle (this is simplified - you might want to track last activity)
      if (connection.readyState !== 1) {
        connectionsToClose.push(key);
      }
    }

    for (const key of connectionsToClose) {
      const tenantId = key.replace('tenant_', '');
      await this.closeTenantDB(tenantId);
      logger.info(`Cleaned up idle connection for tenant: ${tenantId}`);
    }
  }
}

// Global tenant database manager instance
export const tenantDB = new TenantDatabaseManager();

// Base model schema with common fields
export const baseSchemaFields = {
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  createdBy: {
    type: String,
    sparse: true,
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true,
  },
};

// Soft delete schema fields
export const softDeleteFields = {
  ...baseSchemaFields,
  isDeleted: {
    type: Boolean,
    default: false,
    index: true,
  },
  deletedAt: {
    type: Date,
    sparse: true,
  },
  deletedBy: {
    type: String,
    sparse: true,
  },
  deletionReason: {
    type: String,
    sparse: true,
  },
};

// Schema plugin for automatic timestamp updates
export const timestampPlugin = function(schema: mongoose.Schema) {
  schema.pre('save', function() {
    if (this.isModified() && !this.isNew) {
      this.updatedAt = new Date();
    }
  });

  schema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function() {
    this.set({ updatedAt: new Date() });
  });
};

// Schema plugin for soft delete functionality
export const softDeletePlugin = function(schema: mongoose.Schema) {
  // Add soft delete query helpers
  (schema.query as any).active = function() {
    return this.where({ isDeleted: { $ne: true } });
  };

  (schema.query as any).deleted = function() {
    return this.where({ isDeleted: true });
  };

  // Add instance methods
  schema.methods.softDelete = function(reason?: string, deletedBy?: string) {
    this.isDeleted = true;
    this.deletedAt = new Date();
    if (reason) this.deletionReason = reason;
    if (deletedBy) this.deletedBy = deletedBy;
    return this.save();
  };

  schema.methods.restore = function() {
    this.isDeleted = false;
    this.deletedAt = undefined;
    this.deletionReason = undefined;
    this.deletedBy = undefined;
    return this.save();
  };

  // Modify default queries to exclude deleted documents
  schema.pre(['find', 'findOne', 'findOneAndUpdate', 'count', 'distinct'], function() {
    if (!this.getQuery().isDeleted) {
      this.where({ isDeleted: { $ne: true } });
    }
  });
};

// Audit logging plugin
export const auditPlugin = function(schema: mongoose.Schema) {
  schema.post('save', function(doc: any) {
    const action = doc.isNew ? 'create' : 'update';
    const modelName = (this.constructor as any).modelName || 'Unknown';
    logDatabase(action, modelName, {
      documentId: doc._id,
      tenantId: doc.tenantId,
    });
  });

  schema.post('deleteOne', function(doc: any) {
    const modelName = (this.constructor as any).modelName || 'Unknown';
    logDatabase('delete', modelName, {
      documentId: doc?._id,
      tenantId: doc?.tenantId,
    });
  });
};

// Tenant isolation plugin
export const tenantPlugin = function(schema: mongoose.Schema) {
  // Add tenantId field to schema
  schema.add({
    tenantId: {
      type: String,
      required: true,
      index: true,
    },
  });

  // Automatically add tenantId to queries
  schema.pre(['find', 'findOne', 'findOneAndUpdate', 'updateOne', 'updateMany', 'count', 'distinct'], function() {
    const tenantId = this.getOptions().tenantId;
    if (tenantId && !this.getQuery().tenantId) {
      this.where({ tenantId });
    }
  });
};

// Initialize database connections
export const initializeDatabase = async (): Promise<void> => {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/properpos_platform';

  await tenantDB.initializePlatformDB({
    uri: mongoUri,
    // Options are set in initializePlatformDB with environment-based pool sizes
  });

  // Set up cleanup for idle connections
  setInterval(async () => {
    await tenantDB.cleanupIdleConnections();
  }, 5 * 60 * 1000); // Every 5 minutes

  logger.info('Database initialization complete', {
    platformPoolSize: process.env.MONGODB_PLATFORM_POOL_SIZE || '50',
    tenantPoolSize: process.env.MONGODB_TENANT_POOL_SIZE || '15',
  });
};

// Health check function
export const checkDatabaseHealth = async (): Promise<{
  status: 'healthy' | 'unhealthy';
  details: any;
}> => {
  try {
    const platformDB = tenantDB.getPlatformDB();

    // Check platform database
    await platformDB.db.admin().ping();

    const healthStatus = tenantDB.getHealthStatus();

    return {
      status: 'healthy',
      details: {
        ...healthStatus,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      details: {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
    };
  }
};

// Graceful shutdown
export const gracefulShutdown = async (): Promise<void> => {
  logger.info('Shutting down database connections...');
  await tenantDB.closeAllConnections();
  logger.info('Database connections closed');
};

// Export commonly used functions
export { mongoose };

// Export platform DB accessor (returns the mongoose Connection directly)
export const getPlatformDB = () => tenantDB.getPlatformDB();
export const platformDB = tenantDB.getPlatformDB.bind(tenantDB);

export default tenantDB;