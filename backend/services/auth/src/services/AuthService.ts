// Authentication service implementation

import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

import {
  logger,
  ApiError,
  cache,
  tenantDB,
  getPlatformDatabase,
  getPlatformDB,
  UserRoles,
  BusinessTypes,
  SubscriptionPlans,
} from '@properpos/backend-shared';

import { UserService } from './UserService';

interface RegistrationData {
  user: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
  };
  organization: {
    name: string;
    businessType: BusinessTypes;
  };
}

interface RegistrationResult {
  user: {
    id: string;
    email: string;
    profile: {
      firstName: string;
      lastName: string;
    };
  };
  organization: {
    id: string;
    name: string;
    tenantId: string;
  };
  emailVerificationToken: string;
}

interface TenantInfo {
  id: string;
  name: string;
  businessType: BusinessTypes;
  subscription: {
    plan: SubscriptionPlans;
    status: string;
    trialEndsAt?: Date;
  };
  settings: {
    timezone: string;
    currency: string;
    language: string;
  };
  features: string[];
}

export class AuthService {
  private userService: UserService;

  constructor() {
    this.userService = new UserService();
  }

  /**
   * Register a new user with organization
   */
  async registerUserWithOrganization(data: RegistrationData): Promise<RegistrationResult> {
    const { user, organization } = data;

    // Get the MongoClient from the platform mongoose connection for session/transaction support
    const platformConnection = getPlatformDB();
    const client = platformConnection.getClient();
    const session = client.startSession();

    try {
      logger.info('Starting user registration', { email: user.email, organizationName: organization.name });

      // 1. Generate tenant ID and database name
      const tenantId = uuidv4();
      const databaseName = `tenant_${tenantId.replace(/-/g, '_')}`;

      // 2. Hash password
      const passwordHash = await bcrypt.hash(user.password, 12);

      // 3. Generate email verification token
      const emailVerificationToken = crypto.randomBytes(32).toString('hex');
      const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // 4. Create organization in platform database
      const organizationData = {
        id: uuidv4(),
        tenantId,
        name: organization.name,
        businessType: organization.businessType,
        subscription: {
          plan: SubscriptionPlans.STARTER,
          status: 'trial',
          trialStartsAt: new Date(),
          trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          maxLocations: 1,
          maxUsers: 5,
          features: ['basic_pos', 'inventory', 'basic_reports'],
        },
        settings: {
          timezone: 'UTC',
          currency: 'USD',
          language: 'en',
          businessHours: {
            monday: { open: '09:00', close: '17:00', closed: false },
            tuesday: { open: '09:00', close: '17:00', closed: false },
            wednesday: { open: '09:00', close: '17:00', closed: false },
            thursday: { open: '09:00', close: '17:00', closed: false },
            friday: { open: '09:00', close: '17:00', closed: false },
            saturday: { open: '10:00', close: '16:00', closed: false },
            sunday: { open: '12:00', close: '16:00', closed: true },
          },
        },
        database: {
          name: databaseName,
          connectionString: `mongodb+srv://cluster/${databaseName}`,
        },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const userId = uuidv4();
      const userData = {
        id: userId,
        email: user.email,
        profile: {
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone || null,
          avatar: null,
          timezone: 'UTC',
          language: 'en',
        },
        globalRole: UserRoles.TENANT_OWNER,
        tenantMemberships: [
          {
            tenantId,
            role: UserRoles.TENANT_OWNER,
            permissions: ['*'], // All permissions for tenant owner
            locationAccess: ['*'], // Access to all locations
            status: 'active',
            joinedAt: new Date(),
          },
        ],
        auth: {
          passwordHash,
          isEmailVerified: false,
          emailVerificationToken,
          emailVerificationExpires,
          mfaEnabled: false,
          mfaSecret: null,
          passwordResetToken: null,
          passwordResetExpires: null,
          loginAttempts: 0,
          lockUntil: null,
          lastLoginAt: null,
        },
        isActive: true,
        lastActiveAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Wrap all database writes in a transaction so they atomically succeed or roll back
      await session.withTransaction(async () => {
        const platformDb = getPlatformDatabase();

        // Insert organization into platform database
        // Cast session to any - mongoose's ClientSession is structurally compatible with native mongodb's
        await platformDb.collection('organizations').insertOne(organizationData, { session: session as any });

        // Insert user into platform database
        await platformDb.collection('users').insertOne(userData, { session: session as any });

        // Create tenant database and initial data (within the same session)
        await this.initializeTenantDatabase(tenantId, organizationData, userData, session as any);
      });

      // Cache organization info (outside transaction - cache is not transactional)
      await cache.set(
        `tenant:${tenantId}`,
        organizationData,
        24 * 60 * 60 // 24 hours
      );

      logger.audit('User registration completed', {
        userId,
        email: user.email,
        organizationId: organizationData.id,
        tenantId,
        businessType: organization.businessType,
      });

      return {
        user: {
          id: userId,
          email: user.email,
          profile: {
            firstName: user.firstName,
            lastName: user.lastName,
          },
        },
        organization: {
          id: organizationData.id,
          name: organization.name,
          tenantId,
        },
        emailVerificationToken,
      };

    } catch (error) {
      logger.error('User registration failed', {
        email: user.email,
        organizationName: organization.name,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError(
        'Registration failed. Please try again later.',
        'REGISTRATION_FAILED',
        500
      );
    } finally {
      await session.endSession();
    }
  }

  /**
   * Get tenant information by tenant ID
   */
  async getTenantInfo(tenantId: string): Promise<TenantInfo | null> {
    try {
      // Try to get from cache first
      const cached = await cache.get<any>(`tenant:${tenantId}`);
      if (cached) {
        return this.formatTenantInfo(cached);
      }

      // Get from database
      const organization = await getPlatformDatabase().collection('organizations').findOne({ tenantId });

      if (!organization) {
        return null;
      }

      // Cache for future requests
      await cache.set(
        `tenant:${tenantId}`,
        organization,
        24 * 60 * 60 // 24 hours
      );

      return this.formatTenantInfo(organization);

    } catch (error) {
      logger.error('Failed to get tenant info', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return null;
    }
  }

  /**
   * Initialize tenant database with default data.
   * Accepts an optional MongoDB ClientSession to participate in a cross-collection transaction.
   */
  private async initializeTenantDatabase(
    tenantId: string,
    organizationData: any,
    ownerData: any,
    session?: import('mongodb').ClientSession
  ): Promise<void> {
    try {
      // Get tenant database connection
      const tenantConnection = await tenantDB.getDatabase(tenantId);
      const db = tenantConnection.db;
      if (!db) {
        throw new Error(`Tenant database not connected for tenant: ${tenantId}`);
      }

      const opts = session ? { session: session as any } : {};

      // Create collections with initial data

      // 1. Organization/tenant info in tenant database
      await db.collection('organization').insertOne({
        id: organizationData.id,
        name: organizationData.name,
        businessType: organizationData.businessType,
        settings: organizationData.settings,
        updatedAt: new Date(),
      }, opts);

      // 2. Create default location
      const locationId = uuidv4();
      await db.collection('locations').insertOne({
        id: locationId,
        name: 'Main Location',
        address: {
          street: '',
          city: '',
          state: '',
          postalCode: '',
          country: 'US',
        },
        contact: {
          phone: ownerData.profile.phone || '',
          email: ownerData.email,
        },
        settings: {
          timezone: organizationData.settings.timezone,
          currency: organizationData.settings.currency,
          taxRate: 0,
          receiptSettings: {
            showLogo: true,
            footerText: 'Thank you for your business!',
          },
        },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }, opts);

      // 3. Create default categories based on business type
      const defaultCategories = this.getDefaultCategories(organizationData.businessType);
      if (defaultCategories.length > 0) {
        await db.collection('categories').insertMany(defaultCategories, opts);
      }

      // 4. Create user record in tenant database
      await db.collection('users').insertOne({
        id: ownerData.id,
        email: ownerData.email,
        profile: ownerData.profile,
        role: UserRoles.TENANT_OWNER,
        locationAccess: [locationId],
        permissions: ['*'],
        isActive: true,
        lastActiveAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }, opts);

      // 5. Create indexes for performance (indexes are not transactional, run outside session)
      await Promise.all([
        db.collection('products').createIndex({ name: 'text', description: 'text' }),
        db.collection('products').createIndex({ categoryId: 1, isActive: 1 }),
        db.collection('orders').createIndex({ orderNumber: 1 }, { unique: true }),
        db.collection('orders').createIndex({ createdAt: -1 }),
        db.collection('orders').createIndex({ locationId: 1, status: 1 }),
        db.collection('inventory').createIndex({ productId: 1, locationId: 1 }, { unique: true }),
        db.collection('customers').createIndex({ email: 1 }, { sparse: true }),
        db.collection('customers').createIndex({ phone: 1 }, { sparse: true }),
      ]);

      logger.info('Tenant database initialized', { tenantId, organizationId: organizationData.id });

    } catch (error) {
      logger.error('Failed to initialize tenant database', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  /**
   * Get default categories based on business type
   */
  private getDefaultCategories(businessType: BusinessTypes): any[] {
    const baseCategory = {
      id: uuidv4(),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    switch (businessType) {
      case BusinessTypes.FOOD:
        return [
          { ...baseCategory, id: uuidv4(), name: 'Beverages', description: 'Drinks and beverages' },
          { ...baseCategory, id: uuidv4(), name: 'Main Dishes', description: 'Main course items' },
          { ...baseCategory, id: uuidv4(), name: 'Appetizers', description: 'Starters and appetizers' },
          { ...baseCategory, id: uuidv4(), name: 'Desserts', description: 'Sweet treats and desserts' },
          { ...baseCategory, id: uuidv4(), name: 'Sides', description: 'Side dishes' },
        ];

      case BusinessTypes.RETAIL:
        return [
          { ...baseCategory, id: uuidv4(), name: 'General Merchandise', description: 'General retail items' },
          { ...baseCategory, id: uuidv4(), name: 'Accessories', description: 'Accessories and add-ons' },
          { ...baseCategory, id: uuidv4(), name: 'Seasonal', description: 'Seasonal items' },
        ];

      default:
        return [
          { ...baseCategory, id: uuidv4(), name: 'General', description: 'General items' },
        ];
    }
  }

  /**
   * Format tenant info for response
   */
  private formatTenantInfo(organization: any): TenantInfo {
    return {
      id: organization.id,
      name: organization.name,
      businessType: organization.businessType,
      subscription: {
        plan: organization.subscription.plan,
        status: organization.subscription.status,
        trialEndsAt: organization.subscription.trialEndsAt,
      },
      settings: organization.settings,
      features: organization.subscription.features || [],
    };
  }

  /**
   * Validate tenant access for user
   */
  async validateTenantAccess(userId: string, tenantId: string): Promise<boolean> {
    try {
      const user = await this.userService.findById(userId);

      if (!user || !user.isActive) {
        return false;
      }

      // Check if user has access to this tenant
      const membership = user.tenantMemberships.find(
        m => m.tenantId === tenantId && m.status === 'active'
      );

      return !!membership;

    } catch (error) {
      logger.error('Failed to validate tenant access', {
        userId,
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return false;
    }
  }

  /**
   * Get user's tenant memberships
   */
  async getUserTenants(userId: string): Promise<TenantInfo[]> {
    try {
      const user = await this.userService.findById(userId);

      if (!user) {
        return [];
      }

      const activeMemberships = user.tenantMemberships.filter(m => m.status === 'active');
      const tenants: TenantInfo[] = [];

      for (const membership of activeMemberships) {
        const tenantInfo = await this.getTenantInfo(membership.tenantId);
        if (tenantInfo) {
          tenants.push(tenantInfo);
        }
      }

      return tenants;

    } catch (error) {
      logger.error('Failed to get user tenants', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return [];
    }
  }
}