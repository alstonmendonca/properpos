// Error handling utilities and custom error classes

import { ErrorCodes } from '@properpos/shared';

/**
 * Custom API Error class
 */
export class ApiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: any;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    code: string = ErrorCodes.INTERNAL_ERROR,
    status: number = 500,
    details?: any,
    isOperational: boolean = true
  ) {
    super(message);

    this.name = this.constructor.name;
    this.code = code;
    this.status = status;
    this.details = details;
    this.isOperational = isOperational;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Create error from validation results
   */
  static validationError(message: string, details?: any): ApiError {
    return new ApiError(message, ErrorCodes.VALIDATION_ERROR, 400, details);
  }

  /**
   * Create unauthorized error
   */
  static unauthorized(message: string = 'Unauthorized'): ApiError {
    return new ApiError(message, ErrorCodes.UNAUTHORIZED, 401);
  }

  /**
   * Create forbidden error
   */
  static forbidden(message: string = 'Forbidden'): ApiError {
    return new ApiError(message, ErrorCodes.FORBIDDEN, 403);
  }

  /**
   * Create not found error
   */
  static notFound(message: string = 'Resource not found'): ApiError {
    return new ApiError(message, ErrorCodes.NOT_FOUND, 404);
  }

  /**
   * Create conflict error
   */
  static conflict(message: string, details?: any): ApiError {
    return new ApiError(message, ErrorCodes.CONFLICT, 409, details);
  }

  /**
   * Create rate limit error
   */
  static rateLimitExceeded(message: string = 'Rate limit exceeded'): ApiError {
    return new ApiError(message, ErrorCodes.RATE_LIMIT_EXCEEDED, 429);
  }

  /**
   * Create internal server error
   */
  static internalError(message: string = 'Internal server error', details?: any): ApiError {
    return new ApiError(message, ErrorCodes.INTERNAL_ERROR, 500, details, false);
  }

  /**
   * Create service unavailable error
   */
  static serviceUnavailable(message: string = 'Service temporarily unavailable'): ApiError {
    return new ApiError(message, ErrorCodes.SERVICE_UNAVAILABLE, 503);
  }

  /**
   * Create tenant-specific errors
   */
  static tenantNotFound(tenantId?: string): ApiError {
    const message = tenantId
      ? `Tenant with ID '${tenantId}' not found`
      : 'Tenant not found';
    return new ApiError(message, ErrorCodes.TENANT_NOT_FOUND, 404);
  }

  static subscriptionExpired(message: string = 'Subscription has expired'): ApiError {
    return new ApiError(message, ErrorCodes.SUBSCRIPTION_EXPIRED, 402);
  }

  static featureNotAvailable(feature: string): ApiError {
    return new ApiError(
      `Feature '${feature}' is not available in your subscription plan`,
      ErrorCodes.FEATURE_NOT_AVAILABLE,
      403
    );
  }

  static quotaExceeded(resource: string, limit: number): ApiError {
    return new ApiError(
      `Quota exceeded for ${resource}. Limit: ${limit}`,
      ErrorCodes.QUOTA_EXCEEDED,
      402
    );
  }

  /**
   * Convert to JSON for API responses
   */
  toJSON() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
        timestamp: new Date().toISOString(),
      },
    };
  }
}

/**
 * Database-specific error class
 */
export class DatabaseError extends ApiError {
  constructor(message: string, details?: any) {
    super(message, ErrorCodes.DATABASE_ERROR, 500, details, false);
  }

  static connectionFailed(message: string = 'Database connection failed'): DatabaseError {
    return new DatabaseError(message);
  }

  static queryFailed(query: string, error: any): DatabaseError {
    return new DatabaseError('Database query failed', { query, error: error.message });
  }

  static duplicateKey(field: string, value: any): DatabaseError {
    return new DatabaseError(`Duplicate value for ${field}: ${value}`, { field, value });
  }

  static documentNotFound(collection: string, query: any): DatabaseError {
    return new DatabaseError(`Document not found in ${collection}`, { collection, query });
  }
}

/**
 * External service error class
 */
export class ExternalServiceError extends ApiError {
  public readonly serviceName: string;

  constructor(serviceName: string, message: string, details?: any) {
    super(
      `External service error (${serviceName}): ${message}`,
      ErrorCodes.EXTERNAL_SERVICE_ERROR,
      502,
      details,
      false
    );
    this.serviceName = serviceName;
  }

  static paymentFailed(provider: string, message: string, details?: any): ExternalServiceError {
    return new ExternalServiceError(provider, `Payment failed: ${message}`, details);
  }

  static emailFailed(message: string, details?: any): ExternalServiceError {
    return new ExternalServiceError('Email Service', message, details);
  }

  static smsFailed(message: string, details?: any): ExternalServiceError {
    return new ExternalServiceError('SMS Service', message, details);
  }
}

/**
 * Business logic error class
 */
export class BusinessLogicError extends ApiError {
  constructor(message: string, details?: any) {
    super(message, 'BUSINESS_LOGIC_ERROR', 422, details);
  }

  static insufficientStock(productId: string, requested: number, available: number): BusinessLogicError {
    return new BusinessLogicError(
      `Insufficient stock for product ${productId}`,
      { productId, requested, available }
    );
  }

  static invalidOrderState(orderId: string, currentState: string, requiredState: string): BusinessLogicError {
    return new BusinessLogicError(
      `Invalid order state transition for order ${orderId}`,
      { orderId, currentState, requiredState }
    );
  }

  static businessHourViolation(message: string = 'Operation not allowed outside business hours'): BusinessLogicError {
    return new BusinessLogicError(message);
  }

  static duplicateOrderNumber(orderNumber: string): BusinessLogicError {
    return new BusinessLogicError(`Order number ${orderNumber} already exists`);
  }
}

/**
 * File upload error class
 */
export class FileUploadError extends ApiError {
  constructor(message: string, details?: any) {
    super(message, 'FILE_UPLOAD_ERROR', 400, details);
  }

  static fileTooLarge(maxSize: number): FileUploadError {
    return new FileUploadError(`File size exceeds ${maxSize} bytes limit`);
  }

  static invalidFileType(allowedTypes: string[]): FileUploadError {
    return new FileUploadError(`Invalid file type. Allowed types: ${allowedTypes.join(', ')}`);
  }

  static uploadFailed(message: string, details?: any): FileUploadError {
    return new FileUploadError(`File upload failed: ${message}`, details);
  }
}

/**
 * Convert various error types to ApiError
 */
export const normalizeError = (error: any): ApiError => {
  // If it's already an ApiError, return as is
  if (error instanceof ApiError) {
    return error;
  }

  // Handle MongoDB/Mongoose errors
  if (error.name === 'MongoError' || error.name === 'MongoServerError') {
    if (error.code === 11000) {
      // Duplicate key error
      const field = Object.keys(error.keyPattern || {})[0] || 'field';
      const value = error.keyValue ? error.keyValue[field] : 'unknown';
      return DatabaseError.duplicateKey(field, value);
    }
    return new DatabaseError(error.message, { code: error.code });
  }

  if (error.name === 'ValidationError') {
    const details = Object.values(error.errors || {}).map((err: any) => ({
      path: err.path,
      message: err.message,
    }));
    return ApiError.validationError('Validation failed', details);
  }

  if (error.name === 'CastError') {
    return ApiError.validationError(`Invalid ${error.path}: ${error.value}`, { path: error.path, value: error.value });
  }

  // Handle JWT errors
  if (error.name === 'JsonWebTokenError') {
    return ApiError.unauthorized('Invalid token');
  }

  if (error.name === 'TokenExpiredError') {
    return ApiError.unauthorized('Token expired');
  }

  // Handle Axios errors (external API calls)
  if (error.isAxiosError) {
    const message = error.response?.data?.message || error.message;
    const status = error.response?.status || 502;
    return new ExternalServiceError('External API', message, {
      url: error.config?.url,
      method: error.config?.method,
      status,
    });
  }

  // Handle Multer errors (file upload)
  if (error.code === 'LIMIT_FILE_SIZE') {
    return FileUploadError.fileTooLarge(error.limit);
  }

  if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    return new FileUploadError('Unexpected file field');
  }

  // Handle Stripe errors
  if (error.type) {
    switch (error.type) {
      case 'StripeCardError':
        return new ExternalServiceError('Stripe', `Card error: ${error.message}`, {
          code: error.code,
          decline_code: error.decline_code,
        });
      case 'StripeRateLimitError':
        return ApiError.rateLimitExceeded('Payment service rate limit exceeded');
      case 'StripeInvalidRequestError':
        return ApiError.validationError(`Payment error: ${error.message}`, { stripeError: error.code });
      case 'StripeAPIError':
        return new ExternalServiceError('Stripe', 'Payment service error');
      case 'StripeConnectionError':
        return new ExternalServiceError('Stripe', 'Payment service connection error');
      case 'StripeAuthenticationError':
        return new ExternalServiceError('Stripe', 'Payment service authentication error');
    }
  }

  // Handle Redis errors
  if (error.name === 'RedisError' || error.name === 'ReplyError') {
    return new ApiError('Cache service error', 'CACHE_ERROR', 503, { message: error.message });
  }

  // Default to internal server error
  return ApiError.internalError(error.message || 'An unexpected error occurred', {
    name: error.name,
    stack: error.stack,
  });
};

/**
 * Check if error is operational (expected) or programming error
 */
export const isOperationalError = (error: any): boolean => {
  if (error instanceof ApiError) {
    return error.isOperational;
  }

  // Some errors are always operational
  const operationalErrors = [
    'ValidationError',
    'CastError',
    'MongoError',
    'MongoServerError',
    'JsonWebTokenError',
    'TokenExpiredError',
  ];

  return operationalErrors.includes(error.name);
};

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Get error severity based on error type and status
 */
export const getErrorSeverity = (error: ApiError | Error): ErrorSeverity => {
  if (error instanceof ApiError) {
    // Client errors (4xx) are usually less severe
    if (error.status >= 400 && error.status < 500) {
      if (error.status === 401 || error.status === 403) {
        return ErrorSeverity.MEDIUM; // Security-related
      }
      return ErrorSeverity.LOW;
    }

    // Server errors (5xx) are more severe
    if (error.status >= 500) {
      if (error.code === ErrorCodes.DATABASE_ERROR) {
        return ErrorSeverity.CRITICAL;
      }
      return ErrorSeverity.HIGH;
    }

    return ErrorSeverity.MEDIUM;
  }

  // Programming errors are critical
  return ErrorSeverity.CRITICAL;
};

/**
 * User-friendly error messages with helpful hints
 */
export interface FriendlyErrorInfo {
  title: string;
  message: string;
  hint?: string;
  canRetry: boolean;
  showSupport: boolean;
}

/**
 * Map of error codes to user-friendly messages and hints
 */
const friendlyErrorMessages: Record<string, FriendlyErrorInfo> = {
  // Authentication errors
  [ErrorCodes.UNAUTHORIZED]: {
    title: 'Session Expired',
    message: 'Your session has expired or is invalid.',
    hint: 'Please log in again to continue.',
    canRetry: false,
    showSupport: false,
  },
  [ErrorCodes.INVALID_TOKEN]: {
    title: 'Invalid Session',
    message: 'Your session is invalid or has been revoked.',
    hint: 'Please log in again. If this persists, try clearing your browser cookies.',
    canRetry: false,
    showSupport: false,
  },
  [ErrorCodes.TOKEN_EXPIRED]: {
    title: 'Session Expired',
    message: 'Your session has expired.',
    hint: 'Please log in again to continue your work.',
    canRetry: false,
    showSupport: false,
  },
  [ErrorCodes.INVALID_CREDENTIALS]: {
    title: 'Login Failed',
    message: 'The email or password you entered is incorrect.',
    hint: 'Check your credentials and try again. Forgot your password?',
    canRetry: true,
    showSupport: false,
  },
  [ErrorCodes.ACCOUNT_LOCKED]: {
    title: 'Account Locked',
    message: 'Your account has been temporarily locked due to too many failed login attempts.',
    hint: 'Please wait 30 minutes and try again, or contact support to unlock your account.',
    canRetry: false,
    showSupport: true,
  },

  // Authorization errors
  [ErrorCodes.FORBIDDEN]: {
    title: 'Access Denied',
    message: 'You don\'t have permission to perform this action.',
    hint: 'Contact your administrator if you need access to this feature.',
    canRetry: false,
    showSupport: false,
  },
  [ErrorCodes.INSUFFICIENT_PERMISSIONS]: {
    title: 'Permission Required',
    message: 'You don\'t have the required permissions for this operation.',
    hint: 'Ask your manager or administrator to grant you the necessary permissions.',
    canRetry: false,
    showSupport: false,
  },

  // Resource errors
  [ErrorCodes.NOT_FOUND]: {
    title: 'Not Found',
    message: 'The requested item could not be found.',
    hint: 'It may have been deleted or moved. Try refreshing the page.',
    canRetry: true,
    showSupport: false,
  },
  [ErrorCodes.CONFLICT]: {
    title: 'Conflict Detected',
    message: 'This action conflicts with existing data.',
    hint: 'The item may have been modified by someone else. Refresh and try again.',
    canRetry: true,
    showSupport: false,
  },

  // Validation errors
  [ErrorCodes.VALIDATION_ERROR]: {
    title: 'Invalid Data',
    message: 'Please check your input and try again.',
    hint: 'Review the highlighted fields and correct any errors.',
    canRetry: true,
    showSupport: false,
  },

  // Rate limiting
  [ErrorCodes.RATE_LIMIT_EXCEEDED]: {
    title: 'Too Many Requests',
    message: 'You\'ve made too many requests. Please slow down.',
    hint: 'Wait a few minutes before trying again.',
    canRetry: true,
    showSupport: false,
  },

  // Tenant/subscription errors
  [ErrorCodes.TENANT_NOT_FOUND]: {
    title: 'Business Not Found',
    message: 'Unable to find your business account.',
    hint: 'Contact support if you believe this is an error.',
    canRetry: false,
    showSupport: true,
  },
  [ErrorCodes.SUBSCRIPTION_EXPIRED]: {
    title: 'Subscription Expired',
    message: 'Your subscription has expired.',
    hint: 'Update your payment method to continue using all features.',
    canRetry: false,
    showSupport: false,
  },
  [ErrorCodes.FEATURE_NOT_AVAILABLE]: {
    title: 'Feature Unavailable',
    message: 'This feature is not included in your current plan.',
    hint: 'Upgrade your subscription to access this feature.',
    canRetry: false,
    showSupport: false,
  },
  [ErrorCodes.QUOTA_EXCEEDED]: {
    title: 'Limit Reached',
    message: 'You\'ve reached the limit for your current plan.',
    hint: 'Upgrade your subscription or remove some items to continue.',
    canRetry: false,
    showSupport: false,
  },

  // Database errors
  [ErrorCodes.DATABASE_ERROR]: {
    title: 'Database Error',
    message: 'We encountered a problem saving your data.',
    hint: 'Please try again. If the problem persists, contact support.',
    canRetry: true,
    showSupport: true,
  },

  // External service errors
  [ErrorCodes.EXTERNAL_SERVICE_ERROR]: {
    title: 'Service Unavailable',
    message: 'A required service is temporarily unavailable.',
    hint: 'Please try again in a few minutes.',
    canRetry: true,
    showSupport: false,
  },
  [ErrorCodes.SERVICE_UNAVAILABLE]: {
    title: 'Service Unavailable',
    message: 'The service is temporarily unavailable.',
    hint: 'We\'re working on it. Please try again shortly.',
    canRetry: true,
    showSupport: false,
  },

  // Payment errors
  PAYMENT_FAILED: {
    title: 'Payment Failed',
    message: 'Your payment could not be processed.',
    hint: 'Check your card details and try again. If the issue persists, contact your bank.',
    canRetry: true,
    showSupport: false,
  },
  CARD_DECLINED: {
    title: 'Card Declined',
    message: 'Your card was declined.',
    hint: 'Try a different payment method or contact your bank.',
    canRetry: true,
    showSupport: false,
  },

  // Business logic errors
  BUSINESS_LOGIC_ERROR: {
    title: 'Action Not Allowed',
    message: 'This action cannot be completed.',
    hint: 'Review the requirements and try again.',
    canRetry: true,
    showSupport: false,
  },
  INSUFFICIENT_STOCK: {
    title: 'Insufficient Stock',
    message: 'There is not enough stock to complete this order.',
    hint: 'Reduce the quantity or check stock levels.',
    canRetry: true,
    showSupport: false,
  },
  INVALID_ORDER_STATE: {
    title: 'Invalid Order Status',
    message: 'This action is not allowed for the current order status.',
    hint: 'The order may have been updated by someone else. Refresh and try again.',
    canRetry: true,
    showSupport: false,
  },

  // File upload errors
  FILE_UPLOAD_ERROR: {
    title: 'Upload Failed',
    message: 'The file could not be uploaded.',
    hint: 'Check the file size and format, then try again.',
    canRetry: true,
    showSupport: false,
  },

  // Network errors
  NETWORK_ERROR: {
    title: 'Connection Lost',
    message: 'Unable to connect to the server.',
    hint: 'Check your internet connection and try again.',
    canRetry: true,
    showSupport: false,
  },
  TIMEOUT_ERROR: {
    title: 'Request Timeout',
    message: 'The request took too long to complete.',
    hint: 'The server might be busy. Please try again.',
    canRetry: true,
    showSupport: false,
  },

  // Default
  [ErrorCodes.INTERNAL_ERROR]: {
    title: 'Something Went Wrong',
    message: 'An unexpected error occurred.',
    hint: 'Please try again. If the problem persists, contact support.',
    canRetry: true,
    showSupport: true,
  },
};

/**
 * Get user-friendly error information
 */
export function getFriendlyError(error: ApiError | Error | string): FriendlyErrorInfo {
  // Get error code
  let errorCode: string;
  let details: any;

  if (typeof error === 'string') {
    errorCode = error;
  } else if (error instanceof ApiError) {
    errorCode = error.code;
    details = error.details;
  } else {
    errorCode = ErrorCodes.INTERNAL_ERROR;
  }

  // Get friendly message or default
  const friendlyError = friendlyErrorMessages[errorCode] || friendlyErrorMessages[ErrorCodes.INTERNAL_ERROR];

  // Enhance message with specific details if available
  if (details && typeof friendlyError.message === 'string') {
    return {
      ...friendlyError,
      message: enhanceMessageWithDetails(friendlyError.message, details, errorCode),
    };
  }

  return friendlyError;
}

/**
 * Enhance error message with specific details
 */
function enhanceMessageWithDetails(message: string, details: any, errorCode: string): string {
  // Add specific field information for validation errors
  if (errorCode === ErrorCodes.VALIDATION_ERROR && Array.isArray(details)) {
    const fields = details.map((d: any) => d.path).filter(Boolean).join(', ');
    if (fields) {
      return `${message} Check: ${fields}`;
    }
  }

  // Add quota information
  if (errorCode === ErrorCodes.QUOTA_EXCEEDED && details?.resource) {
    return `You've reached the ${details.resource} limit (${details.limit}) for your current plan.`;
  }

  // Add stock information
  if (errorCode === 'INSUFFICIENT_STOCK' && details?.available !== undefined) {
    return `Only ${details.available} items available in stock.`;
  }

  return message;
}

/**
 * Create error response with friendly message for API responses
 */
export function createFriendlyErrorResponse(error: ApiError) {
  const friendly = getFriendlyError(error);

  return {
    success: false,
    error: {
      code: error.code,
      message: error.message,
      details: error.details,
      friendly: {
        title: friendly.title,
        message: friendly.message,
        hint: friendly.hint,
        canRetry: friendly.canRetry,
        showSupport: friendly.showSupport,
      },
      timestamp: new Date().toISOString(),
    },
  };
}