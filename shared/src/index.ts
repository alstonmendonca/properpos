// Main entry point for ProperPOS shared library

// Re-export all types
export * from './types/common';
export * from './types/entities';
export * from './types/api';

// Re-export utilities
export * from './utils/validation';

// Re-export constants
export * from './constants';

// Export validation schemas separately for convenience
export { ValidationSchemas } from './types/api';

// Version information
export const SHARED_LIB_VERSION = '1.0.0';

// Helper functions that might be useful across the application
export const utils = {
  // Format currency with proper locale and currency code
  formatCurrency: (amount: number, currency: string = 'USD', locale: string = 'en-US'): string => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  },

  // Format date with timezone support
  formatDate: (date: Date | string, timezone: string = 'UTC', format: string = 'short'): string => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;

    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
    };

    switch (format) {
      case 'short':
        options.year = 'numeric';
        options.month = 'short';
        options.day = 'numeric';
        break;
      case 'long':
        options.year = 'numeric';
        options.month = 'long';
        options.day = 'numeric';
        options.weekday = 'long';
        break;
      case 'time':
        options.hour = '2-digit';
        options.minute = '2-digit';
        options.second = '2-digit';
        break;
      case 'datetime':
        options.year = 'numeric';
        options.month = 'short';
        options.day = 'numeric';
        options.hour = '2-digit';
        options.minute = '2-digit';
        break;
    }

    return new Intl.DateTimeFormat('en-US', options).format(dateObj);
  },

  // Generate unique order numbers
  generateOrderNumber: (prefix: string = 'ORD'): string => {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}-${timestamp}-${random}`;
  },

  // Generate unique KOT numbers
  generateKotNumber: (prefix: string = 'KOT'): string => {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}-${timestamp}-${random}`;
  },

  // Calculate tax amount
  calculateTax: (amount: number, rate: number, inclusive: boolean = false): number => {
    if (inclusive) {
      return amount - (amount / (1 + rate / 100));
    }
    return amount * (rate / 100);
  },

  // Calculate discount amount
  calculateDiscount: (amount: number, discountType: 'percentage' | 'fixed', discountValue: number): number => {
    if (discountType === 'percentage') {
      return amount * (discountValue / 100);
    }
    return discountValue;
  },

  // Validate email format
  isValidEmail: (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  // Validate phone number format (basic)
  isValidPhone: (phone: string): boolean => {
    const phoneRegex = /^[+]?[1-9][\d\s\-()]+$/;
    return phoneRegex.test(phone);
  },

  // Generate slug from string
  generateSlug: (text: string): string => {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '') // Remove special characters
      .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
      .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
  },

  // Deep clone object (simple implementation)
  deepClone: <T>(obj: T): T => {
    return JSON.parse(JSON.stringify(obj));
  },

  // Debounce function
  debounce: <T extends (...args: any[]) => any>(func: T, wait: number): T => {
    let timeout: ReturnType<typeof setTimeout>;
    return ((...args: any[]) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    }) as T;
  },

  // Throttle function
  throttle: <T extends (...args: any[]) => any>(func: T, limit: number): T => {
    let inThrottle: boolean;
    return ((...args: any[]) => {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    }) as T;
  },

  // Calculate distance between two coordinates (Haversine formula)
  calculateDistance: (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  },

  // Generate secure random string
  generateSecureId: (length: number = 32): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },

  // Convert bytes to human readable format
  formatBytes: (bytes: number, decimals: number = 2): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
  },

  // Validate business hours
  validateBusinessHours: (hours: Record<string, { isOpen: boolean; openTime?: string; closeTime?: string }>): boolean => {
    const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    for (const [day, schedule] of Object.entries(hours)) {
      if (!validDays.includes(day.toLowerCase())) {
        return false;
      }

      if (schedule.isOpen) {
        if (!schedule.openTime || !schedule.closeTime) {
          return false;
        }

        // Validate time format (HH:MM)
        const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(schedule.openTime) || !timeRegex.test(schedule.closeTime)) {
          return false;
        }

        // Check if open time is before close time
        const [openHour, openMin] = schedule.openTime.split(':').map(Number) as [number, number];
        const [closeHour, closeMin] = schedule.closeTime.split(':').map(Number) as [number, number];

        if (openHour > closeHour || (openHour === closeHour && openMin >= closeMin)) {
          return false;
        }
      }
    }

    return true;
  },

  // Parse user agent for basic device info
  parseUserAgent: (userAgent: string) => {
    const mobile = /Mobile|Android|iPhone|iPad/.test(userAgent);
    const bot = /bot|crawler|spider/i.test(userAgent);

    let browser = 'Unknown';
    if (userAgent.includes('Chrome')) browser = 'Chrome';
    else if (userAgent.includes('Firefox')) browser = 'Firefox';
    else if (userAgent.includes('Safari')) browser = 'Safari';
    else if (userAgent.includes('Edge')) browser = 'Edge';

    let os = 'Unknown';
    if (userAgent.includes('Windows')) os = 'Windows';
    else if (userAgent.includes('Mac')) os = 'macOS';
    else if (userAgent.includes('Linux')) os = 'Linux';
    else if (userAgent.includes('Android')) os = 'Android';
    else if (userAgent.includes('iOS')) os = 'iOS';

    return { mobile, bot, browser, os };
  },

  // Retry utility for async operations
  retry: async <T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000
  ): Promise<T> => {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt === maxRetries) {
          throw lastError;
        }

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      }
    }

    throw lastError!;
  }
};

// Constants that might be used frequently
export const CONSTANTS = {
  // Date formats
  DATE_FORMATS: {
    ISO: 'YYYY-MM-DDTHH:mm:ss.sssZ',
    DATE_ONLY: 'YYYY-MM-DD',
    TIME_ONLY: 'HH:mm:ss',
    DISPLAY_DATE: 'MMM DD, YYYY',
    DISPLAY_DATETIME: 'MMM DD, YYYY HH:mm'
  },

  // Common regex patterns
  REGEX: {
    EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    PHONE: /^[+]?[1-9][\d\s\-()]+$/,
    URL: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/,
    HEX_COLOR: /^#[0-9A-F]{6}$/i,
    TIME_24H: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/,
    SLUG: /^[a-z0-9-]+$/
  },

  // HTTP status codes
  HTTP_STATUS: {
    OK: 200,
    CREATED: 201,
    NO_CONTENT: 204,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    UNPROCESSABLE_ENTITY: 422,
    TOO_MANY_REQUESTS: 429,
    INTERNAL_SERVER_ERROR: 500,
    SERVICE_UNAVAILABLE: 503
  },

  // Environment types
  ENVIRONMENTS: {
    DEVELOPMENT: 'development',
    STAGING: 'staging',
    PRODUCTION: 'production'
  }
} as const;