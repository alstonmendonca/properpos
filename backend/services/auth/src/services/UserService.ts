// User service implementation

import { v4 as uuidv4 } from 'uuid';

import {
  logger,
  ApiError,
  getPlatformDatabase,
  cache,
  UserRoles,
} from '@properpos/backend-shared';

interface User {
  id: string;
  email: string;
  profile: {
    firstName: string;
    lastName: string;
    phone?: string;
    avatar?: string;
    timezone: string;
    language: string;
  };
  globalRole: UserRoles;
  tenantMemberships: Array<{
    tenantId: string;
    role: UserRoles;
    permissions: string[];
    locationAccess: string[];
    status: 'active' | 'suspended' | 'pending';
    joinedAt: Date;
  }>;
  auth: {
    passwordHash: string;
    isEmailVerified: boolean;
    emailVerificationToken?: string;
    emailVerificationExpires?: Date;
    mfaEnabled: boolean;
    mfaSecret?: string;
    passwordResetToken?: string;
    passwordResetExpires?: Date;
    loginAttempts: number;
    lockUntil?: Date;
    lastLoginAt?: Date;
  };
  isActive: boolean;
  lastActiveAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class UserService {
  private collection = 'users';
  private maxLoginAttempts = 5;
  private lockTimeMs = 30 * 60 * 1000; // 30 minutes

  /**
   * Find user by email address
   */
  async findByEmail(email: string): Promise<User | null> {
    try {
      const user = await getPlatformDatabase().collection(this.collection).findOne({
        email: email.toLowerCase()
      });

      return user as User | null;

    } catch (error) {
      logger.error('Failed to find user by email', {
        email,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return null;
    }
  }

  /**
   * Find user by ID
   */
  async findById(userId: string): Promise<User | null> {
    try {
      // Try cache first
      const cacheKey = `user:${userId}`;
      const cached = await cache.get<User>(cacheKey);

      if (cached) {
        return cached;
      }

      // Get from database
      const user = await getPlatformDatabase().collection(this.collection).findOne({ id: userId });

      if (user) {
        // Cache for 5 minutes
        await cache.set(cacheKey, user, 5 * 60);
      }

      return user as User | null;

    } catch (error) {
      logger.error('Failed to find user by ID', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return null;
    }
  }

  /**
   * Find user by email verification token
   */
  async findByVerificationToken(token: string): Promise<User | null> {
    try {
      const user = await getPlatformDatabase().collection(this.collection).findOne({
        'auth.emailVerificationToken': token,
      });

      return user as User | null;

    } catch (error) {
      logger.error('Failed to find user by verification token', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return null;
    }
  }

  /**
   * Find user by password reset token
   */
  async findByResetToken(token: string): Promise<User | null> {
    try {
      const user = await getPlatformDatabase().collection(this.collection).findOne({
        'auth.passwordResetToken': token,
      });

      return user as User | null;

    } catch (error) {
      logger.error('Failed to find user by reset token', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return null;
    }
  }

  /**
   * Create new user
   */
  async create(userData: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
    try {
      const user: User = {
        ...userData,
        id: uuidv4(),
        email: userData.email.toLowerCase(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await getPlatformDatabase().collection(this.collection).insertOne(user);

      // Clear cache
      await this.clearUserCache(user.id);

      logger.audit('User created', {
        userId: user.id,
        email: user.email,
        globalRole: user.globalRole,
      });

      return user;

    } catch (error) {
      logger.error('Failed to create user', {
        email: userData.email,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if ((error as any).code === 11000) {
        throw new ApiError('Email address is already registered', 'EMAIL_EXISTS', 409);
      }

      throw new ApiError('Failed to create user account', 'USER_CREATION_FAILED', 500);
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(
    userId: string,
    profileData: Partial<User['profile']>
  ): Promise<void> {
    try {
      const updateData: any = {
        updatedAt: new Date(),
      };

      // Build update object
      Object.entries(profileData).forEach(([key, value]) => {
        updateData[`profile.${key}`] = value;
      });

      const result = await getPlatformDatabase().collection(this.collection).updateOne(
        { id: userId },
        { $set: updateData }
      );

      if (result.matchedCount === 0) {
        throw new ApiError('User not found', 'USER_NOT_FOUND', 404);
      }

      // Clear cache
      await this.clearUserCache(userId);

      logger.audit('User profile updated', { userId, updatedFields: Object.keys(profileData) });

    } catch (error) {
      logger.error('Failed to update user profile', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError('Failed to update profile', 'PROFILE_UPDATE_FAILED', 500);
    }
  }

  /**
   * Update user password
   */
  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    try {
      const result = await getPlatformDatabase().collection(this.collection).updateOne(
        { id: userId },
        {
          $set: {
            'auth.passwordHash': passwordHash,
            updatedAt: new Date(),
          },
        }
      );

      if (result.matchedCount === 0) {
        throw new ApiError('User not found', 'USER_NOT_FOUND', 404);
      }

      // Clear cache
      await this.clearUserCache(userId);

      logger.audit('User password updated', { userId });

    } catch (error) {
      logger.error('Failed to update password', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError('Failed to update password', 'PASSWORD_UPDATE_FAILED', 500);
    }
  }

  /**
   * Increment login attempts and lock account if necessary
   */
  async incrementLoginAttempts(userId: string): Promise<void> {
    try {
      const user = await this.findById(userId);
      if (!user) {
        return;
      }

      const attempts = user.auth.loginAttempts + 1;
      const updateData: any = {
        'auth.loginAttempts': attempts,
        updatedAt: new Date(),
      };

      // Lock account if max attempts reached
      if (attempts >= this.maxLoginAttempts) {
        updateData['auth.lockUntil'] = new Date(Date.now() + this.lockTimeMs);

        logger.security('Account locked due to failed login attempts', {
          userId,
          attempts,
          lockUntil: updateData['auth.lockUntil'],
        });
      }

      await getPlatformDatabase().collection(this.collection).updateOne(
        { id: userId },
        { $set: updateData }
      );

      // Clear cache
      await this.clearUserCache(userId);

    } catch (error) {
      logger.error('Failed to increment login attempts', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Reset login attempts
   */
  async resetLoginAttempts(userId: string): Promise<void> {
    try {
      await getPlatformDatabase().collection(this.collection).updateOne(
        { id: userId },
        {
          $unset: {
            'auth.loginAttempts': '',
            'auth.lockUntil': '',
          },
          $set: {
            updatedAt: new Date(),
          },
        }
      );

      // Clear cache
      await this.clearUserCache(userId);

    } catch (error) {
      logger.error('Failed to reset login attempts', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Update last login time
   */
  async updateLastLogin(userId: string): Promise<void> {
    try {
      await getPlatformDatabase().collection(this.collection).updateOne(
        { id: userId },
        {
          $set: {
            'auth.lastLoginAt': new Date(),
            lastActiveAt: new Date(),
            updatedAt: new Date(),
          },
        }
      );

      // Clear cache
      await this.clearUserCache(userId);

    } catch (error) {
      logger.error('Failed to update last login', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Verify email address
   */
  async verifyEmail(userId: string): Promise<void> {
    try {
      await getPlatformDatabase().collection(this.collection).updateOne(
        { id: userId },
        {
          $set: {
            'auth.isEmailVerified': true,
            updatedAt: new Date(),
          },
          $unset: {
            'auth.emailVerificationToken': '',
            'auth.emailVerificationExpires': '',
          },
        }
      );

      // Clear cache
      await this.clearUserCache(userId);

      logger.audit('Email verified', { userId });

    } catch (error) {
      logger.error('Failed to verify email', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to verify email', 'EMAIL_VERIFICATION_FAILED', 500);
    }
  }

  /**
   * Save password reset token
   */
  async savePasswordResetToken(
    userId: string,
    token: string,
    expires: Date
  ): Promise<void> {
    try {
      await getPlatformDatabase().collection(this.collection).updateOne(
        { id: userId },
        {
          $set: {
            'auth.passwordResetToken': token,
            'auth.passwordResetExpires': expires,
            updatedAt: new Date(),
          },
        }
      );

      // Clear cache
      await this.clearUserCache(userId);

    } catch (error) {
      logger.error('Failed to save password reset token', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Clear password reset token
   */
  async clearPasswordResetToken(userId: string): Promise<void> {
    try {
      await getPlatformDatabase().collection(this.collection).updateOne(
        { id: userId },
        {
          $unset: {
            'auth.passwordResetToken': '',
            'auth.passwordResetExpires': '',
          },
          $set: {
            updatedAt: new Date(),
          },
        }
      );

      // Clear cache
      await this.clearUserCache(userId);

    } catch (error) {
      logger.error('Failed to clear password reset token', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Save MFA secret (temporarily until verified)
   */
  async saveMfaSecret(userId: string, secret: string): Promise<void> {
    try {
      await getPlatformDatabase().collection(this.collection).updateOne(
        { id: userId },
        {
          $set: {
            'auth.mfaSecret': secret,
            updatedAt: new Date(),
          },
        }
      );

      // Clear cache
      await this.clearUserCache(userId);

    } catch (error) {
      logger.error('Failed to save MFA secret', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to setup MFA', 'MFA_SETUP_FAILED', 500);
    }
  }

  /**
   * Enable MFA
   */
  async enableMfa(userId: string): Promise<void> {
    try {
      await getPlatformDatabase().collection(this.collection).updateOne(
        { id: userId },
        {
          $set: {
            'auth.mfaEnabled': true,
            updatedAt: new Date(),
          },
        }
      );

      // Clear cache
      await this.clearUserCache(userId);

      logger.audit('MFA enabled', { userId });

    } catch (error) {
      logger.error('Failed to enable MFA', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to enable MFA', 'MFA_ENABLE_FAILED', 500);
    }
  }

  /**
   * Disable MFA
   */
  async disableMfa(userId: string): Promise<void> {
    try {
      await getPlatformDatabase().collection(this.collection).updateOne(
        { id: userId },
        {
          $set: {
            'auth.mfaEnabled': false,
            updatedAt: new Date(),
          },
          $unset: {
            'auth.mfaSecret': '',
          },
        }
      );

      // Clear cache
      await this.clearUserCache(userId);

      logger.audit('MFA disabled', { userId });

    } catch (error) {
      logger.error('Failed to disable MFA', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to disable MFA', 'MFA_DISABLE_FAILED', 500);
    }
  }

  /**
   * Add tenant membership
   */
  async addTenantMembership(
    userId: string,
    membership: {
      tenantId: string;
      role: UserRoles;
      permissions: string[];
      locationAccess: string[];
    }
  ): Promise<void> {
    try {
      await getPlatformDatabase().collection(this.collection).updateOne(
        { id: userId },
        {
          $push: {
            tenantMemberships: {
              ...membership,
              status: 'pending',
              joinedAt: new Date(),
            },
          },
          $set: {
            updatedAt: new Date(),
          },
        }
      );

      // Clear cache
      await this.clearUserCache(userId);

      logger.audit('Tenant membership added', {
        userId,
        tenantId: membership.tenantId,
        role: membership.role,
      });

    } catch (error) {
      logger.error('Failed to add tenant membership', {
        userId,
        tenantId: membership.tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to add tenant membership', 'MEMBERSHIP_ADD_FAILED', 500);
    }
  }

  /**
   * Update tenant membership status
   */
  async updateTenantMembershipStatus(
    userId: string,
    tenantId: string,
    status: 'active' | 'suspended' | 'pending'
  ): Promise<void> {
    try {
      await getPlatformDatabase().collection(this.collection).updateOne(
        {
          id: userId,
          'tenantMemberships.tenantId': tenantId,
        },
        {
          $set: {
            'tenantMemberships.$.status': status,
            updatedAt: new Date(),
          },
        }
      );

      // Clear cache
      await this.clearUserCache(userId);

      logger.audit('Tenant membership status updated', {
        userId,
        tenantId,
        status,
      });

    } catch (error) {
      logger.error('Failed to update tenant membership status', {
        userId,
        tenantId,
        status,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to update membership status', 'MEMBERSHIP_UPDATE_FAILED', 500);
    }
  }

  /**
   * Deactivate user account
   */
  async deactivateUser(userId: string): Promise<void> {
    try {
      await getPlatformDatabase().collection(this.collection).updateOne(
        { id: userId },
        {
          $set: {
            isActive: false,
            updatedAt: new Date(),
          },
        }
      );

      // Clear cache
      await this.clearUserCache(userId);

      logger.audit('User deactivated', { userId });

    } catch (error) {
      logger.error('Failed to deactivate user', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to deactivate user', 'USER_DEACTIVATION_FAILED', 500);
    }
  }

  /**
   * Clear user cache
   */
  private async clearUserCache(userId: string): Promise<void> {
    try {
      await cache.del(`user:${userId}`);
    } catch (error) {
      logger.warn('Failed to clear user cache', { userId, error });
    }
  }

  /**
   * Get user statistics
   */
  async getUserStats(): Promise<{
    total: number;
    active: number;
    verified: number;
    mfaEnabled: number;
  }> {
    try {
      const [totalResult, activeResult, verifiedResult, mfaResult] = await Promise.all([
        getPlatformDatabase().collection(this.collection).countDocuments({}),
        getPlatformDatabase().collection(this.collection).countDocuments({ isActive: true }),
        getPlatformDatabase().collection(this.collection).countDocuments({ 'auth.isEmailVerified': true }),
        getPlatformDatabase().collection(this.collection).countDocuments({ 'auth.mfaEnabled': true }),
      ]);

      return {
        total: totalResult,
        active: activeResult,
        verified: verifiedResult,
        mfaEnabled: mfaResult,
      };

    } catch (error) {
      logger.error('Failed to get user statistics', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        total: 0,
        active: 0,
        verified: 0,
        mfaEnabled: 0,
      };
    }
  }
}