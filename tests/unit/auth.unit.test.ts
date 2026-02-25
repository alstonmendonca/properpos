// Auth Service Unit Tests
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

describe('Auth Service - Unit Tests', () => {
  const JWT_SECRET = 'test-jwt-secret';

  describe('Password Hashing', () => {
    it('should hash password correctly', async () => {
      const password = 'SecurePassword123!';
      const hashedPassword = await bcrypt.hash(password, 12);

      expect(hashedPassword).not.toBe(password);
      expect(hashedPassword).toMatch(/^\$2[ayb]\$.{56}$/);
    });

    it('should verify password correctly', async () => {
      const password = 'SecurePassword123!';
      const hashedPassword = await bcrypt.hash(password, 12);

      const isValid = await bcrypt.compare(password, hashedPassword);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'SecurePassword123!';
      const wrongPassword = 'WrongPassword123!';
      const hashedPassword = await bcrypt.hash(password, 12);

      const isValid = await bcrypt.compare(wrongPassword, hashedPassword);
      expect(isValid).toBe(false);
    });
  });

  describe('JWT Token Generation', () => {
    it('should generate valid JWT token', () => {
      const payload = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'admin',
      };

      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });

      expect(token).toBeDefined();
      expect(token.split('.')).toHaveLength(3);
    });

    it('should decode JWT token correctly', () => {
      const payload = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'admin',
      };

      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
      const decoded = jwt.verify(token, JWT_SECRET) as any;

      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.email).toBe(payload.email);
      expect(decoded.role).toBe(payload.role);
    });

    it('should reject expired token', () => {
      const payload = { userId: 'user-123' };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '-1s' });

      expect(() => jwt.verify(token, JWT_SECRET)).toThrow(jwt.TokenExpiredError);
    });

    it('should reject invalid token', () => {
      const invalidToken = 'invalid.token.here';

      expect(() => jwt.verify(invalidToken, JWT_SECRET)).toThrow(jwt.JsonWebTokenError);
    });
  });

  describe('Password Validation', () => {
    const validatePassword = (password: string): { valid: boolean; errors: string[] } => {
      const errors: string[] = [];

      if (password.length < 8) {
        errors.push('Password must be at least 8 characters long');
      }
      if (!/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
      }
      if (!/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
      }
      if (!/[0-9]/.test(password)) {
        errors.push('Password must contain at least one number');
      }
      if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
        errors.push('Password must contain at least one special character');
      }

      return { valid: errors.length === 0, errors };
    };

    it('should accept valid password', () => {
      const result = validatePassword('SecurePass123!');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject short password', () => {
      const result = validatePassword('Ab1!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must be at least 8 characters long');
    });

    it('should reject password without uppercase', () => {
      const result = validatePassword('securepass123!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
    });

    it('should reject password without lowercase', () => {
      const result = validatePassword('SECUREPASS123!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one lowercase letter');
    });

    it('should reject password without number', () => {
      const result = validatePassword('SecurePass!!!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one number');
    });

    it('should reject password without special character', () => {
      const result = validatePassword('SecurePass123');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one special character');
    });
  });

  describe('Email Validation', () => {
    const validateEmail = (email: string): boolean => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email);
    };

    it('should accept valid email', () => {
      expect(validateEmail('user@example.com')).toBe(true);
      expect(validateEmail('user.name@example.co.uk')).toBe(true);
      expect(validateEmail('user+tag@example.com')).toBe(true);
    });

    it('should reject invalid email', () => {
      expect(validateEmail('invalid-email')).toBe(false);
      expect(validateEmail('@example.com')).toBe(false);
      expect(validateEmail('user@')).toBe(false);
      expect(validateEmail('user@example')).toBe(false);
    });
  });
});
