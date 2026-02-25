// API Client for ProperPOS SaaS Frontend

import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  AxiosError,
  InternalAxiosRequestConfig,
} from 'axios';

// Request/Response Logger for debugging and monitoring
const apiLogger = {
  enabled: process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_API_LOGGING === 'true',

  request(config: AxiosRequestConfig, correlationId: string): void {
    if (!this.enabled) return;
    console.log(`[API Request] ${correlationId}`, {
      method: config.method?.toUpperCase(),
      url: config.url,
      params: config.params,
      // Don't log sensitive data in body
      hasBody: !!config.data,
      timestamp: new Date().toISOString(),
    });
  },

  response(response: AxiosResponse, correlationId: string, duration: number): void {
    if (!this.enabled) return;
    console.log(`[API Response] ${correlationId}`, {
      status: response.status,
      statusText: response.statusText,
      duration: `${duration}ms`,
      success: response.data?.success,
      timestamp: new Date().toISOString(),
    });
  },

  error(error: AxiosError, correlationId: string, duration: number, attempt?: number): void {
    if (!this.enabled) return;
    console.error(`[API Error] ${correlationId}`, {
      status: error.response?.status,
      code: (error.response?.data as any)?.error?.code || error.code,
      message: error.message,
      duration: `${duration}ms`,
      attempt,
      timestamp: new Date().toISOString(),
    });
  },

  retry(correlationId: string, attempt: number, delay: number, reason: string): void {
    if (!this.enabled) return;
    console.log(`[API Retry] ${correlationId}`, {
      attempt,
      delay: `${delay}ms`,
      reason,
      timestamp: new Date().toISOString(),
    });
  },
};

// Endpoint-specific timeout configurations (in milliseconds)
const ENDPOINT_TIMEOUTS: Record<string, number> = {
  // Analytics endpoints can be slow
  '/analytics': 60000,
  '/reports': 60000,
  // File uploads
  '/upload': 120000,
  // Bulk operations
  '/bulk': 90000,
  // Default for most endpoints
  default: 30000,
};

// Get timeout for a specific endpoint
const getEndpointTimeout = (url: string): number => {
  for (const [pattern, timeout] of Object.entries(ENDPOINT_TIMEOUTS)) {
    if (pattern !== 'default' && url.includes(pattern)) {
      return timeout;
    }
  }
  return ENDPOINT_TIMEOUTS.default ?? 30000;
};

import {
  ApiResponse,
  ErrorCodes,
  LoginRequest,
  LoginResponse,
  CreateOrganizationRequest,
  CreateProductRequest,
  CreateOrderRequest,
  CreateCustomerRequest,
  ProductQuery,
  OrderQuery,
  CustomerQuery,
  AnalyticsQuery,
  Organization,
  Location,
  Product,
  Order,
  Customer,
  Category,
  User,
  RegisterRequest,
  InventoryTransaction,
  DailySalesSummary,
  PaymentMethods,
} from '@properpos/shared';

// Analytics Response Types
export interface SalesSummary {
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  totalCustomers: number;
  newCustomers: number;
  repeatCustomers: number;
}

export interface SalesTrend {
  date: string;
  revenue: number;
  orders: number;
  customers: number;
}

export interface TopProduct {
  productId: string;
  name: string;
  quantity: number;
  revenue: number;
}

export interface PaymentMethodBreakdown {
  method: PaymentMethods;
  count: number;
  amount: number;
  percentage: number;
}

export interface SalesAnalyticsResponse {
  summary: SalesSummary;
  trends: SalesTrend[];
  topProducts: TopProduct[];
  paymentMethods: PaymentMethodBreakdown[];
}

export interface DashboardData {
  todaySales: number;
  todayOrders: number;
  todayCustomers: number;
  pendingOrders: number;
  lowStockItems: number;
  recentOrders: Order[];
  salesTrend: SalesTrend[];
  topProducts: TopProduct[];
}

export interface SalesOverviewData {
  currentPeriod: {
    revenue: number;
    orders: number;
    averageOrderValue: number;
    customers: number;
  };
  previousPeriod?: {
    revenue: number;
    orders: number;
    averageOrderValue: number;
    customers: number;
  };
  growth?: {
    revenue: number;
    orders: number;
    averageOrderValue: number;
    customers: number;
  };
}

export interface SalesTrendsData {
  data: Array<{
    date: string;
    revenue: number;
    orders: number;
    customers: number;
  }>;
  granularity: 'hour' | 'day' | 'week' | 'month';
}

export interface CategorySalesData {
  categoryId: string;
  categoryName: string;
  revenue: number;
  quantity: number;
  percentage: number;
}

export interface SalesPerformanceData {
  currentPeriod: SalesSummary;
  previousPeriod?: SalesSummary;
  percentageChange: {
    revenue: number;
    orders: number;
    averageOrderValue: number;
  };
}

export interface CustomerAnalysisData {
  totalCustomers: number;
  newCustomers: number;
  returningCustomers: number;
  averageOrdersPerCustomer: number;
  averageCustomerSpend: number;
  topCustomers: Array<{
    customerId: string;
    name: string;
    totalSpent: number;
    orderCount: number;
  }>;
}

export interface RealTimeSalesData {
  todayRevenue: number;
  todayOrders: number;
  currentHourRevenue: number;
  currentHourOrders: number;
  lastOrderTime?: string;
  activeTerminals: number;
}

// Inventory Response Types
export interface InventoryItem {
  productId: string;
  productName: string;
  sku: string;
  locationId: string;
  locationName: string;
  currentStock: number;
  reservedStock: number;
  availableStock: number;
  reorderPoint: number;
  reorderQuantity: number;
  lastUpdated: string;
  isLowStock: boolean;
}

export interface InventoryListResponse {
  items: InventoryItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  locationId: string;
  locationName: string;
  type: 'in' | 'out' | 'adjustment' | 'transfer';
  quantity: number;
  previousStock: number;
  newStock: number;
  reason: string;
  reference?: string;
  performedBy: string;
  performedByName: string;
  createdAt: string;
}

export interface StockMovementsResponse {
  movements: StockMovement[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// File Upload Response
export interface FileUploadResponse {
  url: string;
  filename: string;
  size: number;
  mimeType: string;
  path: string;
}

// Health Check Response
export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version?: string;
  services?: Record<string, { status: string; latency?: number }>;
}

// User Profile Update
export interface UpdateProfileRequest {
  firstName?: string;
  lastName?: string;
  phone?: string;
  timezone?: string;
  avatar?: string;
  preferences?: {
    theme?: 'light' | 'dark' | 'system';
    language?: string;
    notifications?: {
      email?: boolean;
      push?: boolean;
      sms?: boolean;
    };
  };
}

// Types
export interface ApiClientConfig {
  baseURL: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

export interface RequestOptions extends AxiosRequestConfig {
  skipAuth?: boolean;
  skipTenantHeader?: boolean;
  retries?: number;
  retryDelay?: number;
  retryOn?: number[]; // HTTP status codes to retry on
  abortController?: AbortController; // Caller-provided AbortController for manual cancellation
  cancelPrevious?: boolean; // Auto-cancel previous identical request (defaults to true for GET)
}

// Extended internal request config with custom properties for interceptors
interface InternalRequestConfig extends InternalAxiosRequestConfig {
  skipAuth?: boolean;
  skipTenantHeader?: boolean;
  retries?: number;
  retryDelay?: number;
  retryOn?: number[];
  _retry?: boolean;
  _retryCount?: number;
  _noRetry?: boolean;
}

// Retry configuration
const DEFAULT_RETRY_CONFIG = {
  retries: 3,
  retryDelay: 1000, // Base delay in ms
  retryOn: [408, 429, 500, 502, 503, 504], // Status codes to retry
  maxRetryDelay: 30000, // Max delay in ms
};

// Utility for exponential backoff
function calculateBackoff(attempt: number, baseDelay: number, maxDelay: number): number {
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  // Add jitter (±25%)
  const jitter = delay * 0.25 * (Math.random() * 2 - 1);
  return Math.round(delay + jitter);
}

// Check if error is retryable
function isRetryableError(error: AxiosError, retryOn: number[]): boolean {
  // Aborted requests should never be retried
  if (isAbortError(error)) {
    return false;
  }

  // Network errors (no response)
  if (!error.response) {
    return true;
  }

  // Check if status code is in retry list
  const status = error.response.status;
  return retryOn.includes(status);
}

// Sleep utility
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export interface ApiErrorDetails {
  errors?: Array<{ path: string; message: string; code?: string }>;
  [key: string]: unknown;
}

export class ApiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: ApiErrorDetails | undefined;

  constructor(
    message: string,
    code: string = ErrorCodes.INTERNAL_ERROR,
    status: number = 500,
    details?: ApiErrorDetails
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  static fromAxiosError(error: AxiosError): ApiError {
    const response = error.response;
    const data = response?.data as { error?: { message?: string; code?: string; details?: ApiErrorDetails } };

    return new ApiError(
      data?.error?.message || error.message || 'Network error',
      data?.error?.code || ErrorCodes.EXTERNAL_SERVICE_ERROR,
      response?.status || 500,
      data?.error?.details
    );
  }
}

// Token management
// Now supports both cookie-based (HttpOnly) and localStorage-based authentication
// Cookie-based is the primary method (more secure), localStorage is for backwards compatibility
class TokenManager {
  private static readonly ACCESS_TOKEN_KEY = 'properpos_access_token';
  private static readonly REFRESH_TOKEN_KEY = 'properpos_refresh_token';
  private static readonly TOKEN_EXPIRY_KEY = 'properpos_token_expiry';
  private static readonly CSRF_TOKEN_KEY = 'properpos_csrf_token';

  // Check if using cookie-based auth (CSRF token is set when using cookies)
  static isUsingCookieAuth(): boolean {
    if (typeof window === 'undefined') return false;
    return !!localStorage.getItem(this.CSRF_TOKEN_KEY);
  }

  static getAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    // When using cookie auth, we don't need to include the token in header
    // but we still track it for expiry checking
    return localStorage.getItem(this.ACCESS_TOKEN_KEY);
  }

  static setAccessToken(token: string, expiresIn: number): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(this.ACCESS_TOKEN_KEY, token);
    const expiryTime = Date.now() + (expiresIn * 1000);
    localStorage.setItem(this.TOKEN_EXPIRY_KEY, expiryTime.toString());
  }

  static getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(this.REFRESH_TOKEN_KEY);
  }

  static setRefreshToken(token: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(this.REFRESH_TOKEN_KEY, token);
  }

  static getCsrfToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(this.CSRF_TOKEN_KEY);
  }

  static setCsrfToken(token: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(this.CSRF_TOKEN_KEY, token);
  }

  static isTokenExpired(): boolean {
    if (typeof window === 'undefined') return true;
    const expiryTime = localStorage.getItem(this.TOKEN_EXPIRY_KEY);
    if (!expiryTime) return true;
    return Date.now() >= parseInt(expiryTime) - (5 * 60 * 1000); // 5 minutes buffer
  }

  static clearTokens(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(this.ACCESS_TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_TOKEN_KEY);
    localStorage.removeItem(this.TOKEN_EXPIRY_KEY);
    localStorage.removeItem(this.CSRF_TOKEN_KEY);
  }
}

// Check if an error was caused by an AbortController signal
function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof AxiosError && error.code === 'ERR_CANCELED') return true;
  return false;
}

// Main API Client class
export class ApiClient {
  private instance: AxiosInstance;
  private tenantId: string | null = null;
  private isRefreshing = false;
  private failedQueue: Array<{
    resolve: (token: string) => void;
    reject: (error: Error | ApiError) => void;
  }> = [];
  private activeRequests: Map<string, AbortController> = new Map();

  constructor(config: ApiClientConfig) {
    this.instance = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true, // Required for HttpOnly cookies
    });

    this.setupInterceptors();
  }

  // Set tenant ID for multi-tenant requests
  public setTenantId(tenantId: string): void {
    this.tenantId = tenantId;
  }

  public getTenantId(): string | null {
    return this.tenantId;
  }

  // Clear tenant ID
  public clearTenantId(): void {
    this.tenantId = null;
  }

  // Cancel all in-flight requests (useful for logout or route changes)
  public cancelAll(reason: string = 'All requests cancelled'): void {
    this.activeRequests.forEach((controller) => {
      controller.abort(reason);
    });
    this.activeRequests.clear();
  }

  // Generate a deduplication key from method + URL + sorted params
  private generateDedupeKey(method: string, url: string, params?: Record<string, unknown>): string {
    const sortedParams = params ? JSON.stringify(params, Object.keys(params).sort()) : '';
    return `${method.toUpperCase()}:${url}:${sortedParams}`;
  }

  private setupInterceptors(): void {
    // Request interceptor
    this.instance.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        const extendedConfig = config as InternalRequestConfig;

        // Add authorization header (for backwards compatibility with header-based auth)
        // When using cookie-based auth, the HttpOnly cookie is sent automatically
        const token = TokenManager.getAccessToken();
        if (token && !extendedConfig.skipAuth && !TokenManager.isUsingCookieAuth()) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // Add CSRF token for state-changing requests when using cookie-based auth
        const csrfToken = TokenManager.getCsrfToken();
        if (csrfToken && config.method && ['post', 'put', 'patch', 'delete'].includes(config.method.toLowerCase())) {
          config.headers['X-CSRF-Token'] = csrfToken;
        }

        // Add tenant header
        if (this.tenantId && !extendedConfig.skipTenantHeader) {
          config.headers['X-Tenant-ID'] = this.tenantId;
        }

        // Add request timestamp
        config.headers['X-Request-Time'] = new Date().toISOString();

        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    this.instance.interceptors.response.use(
      (response: AxiosResponse) => response,
      async (error: AxiosError) => {
        // If the request was aborted, skip all retry/refresh logic
        if (isAbortError(error)) {
          throw new ApiError('Request was cancelled', 'REQUEST_CANCELLED', 0);
        }

        const originalRequest = error.config as InternalRequestConfig | undefined;

        // If no request config, just throw the error
        if (!originalRequest) {
          throw ApiError.fromAxiosError(error);
        }

        // Handle token expiration (401)
        if (
          error.response?.status === 401 &&
          !originalRequest._retry &&
          !originalRequest.skipAuth
        ) {
          if (this.isRefreshing) {
            // If already refreshing, queue the request
            return new Promise((resolve, reject) => {
              this.failedQueue.push({ resolve, reject });
            }).then((token) => {
              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${token}`;
              }
              return this.instance(originalRequest);
            });
          }

          originalRequest._retry = true;
          this.isRefreshing = true;

          try {
            const newToken = await this.refreshToken();
            this.processQueue(null, newToken);
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
            }
            return this.instance(originalRequest);
          } catch (refreshError) {
            this.processQueue(refreshError as Error, null);
            this.forceLogout();
            throw ApiError.fromAxiosError(error);
          } finally {
            this.isRefreshing = false;
          }
        }

        // Handle retryable errors (network errors, 5xx, 429, etc.)
        const retryConfig = {
          retries: originalRequest.retries ?? DEFAULT_RETRY_CONFIG.retries,
          retryDelay: originalRequest.retryDelay ?? DEFAULT_RETRY_CONFIG.retryDelay,
          retryOn: originalRequest.retryOn ?? DEFAULT_RETRY_CONFIG.retryOn,
        };

        // Initialize retry count
        originalRequest._retryCount = originalRequest._retryCount || 0;

        // Check if we should retry
        if (
          isRetryableError(error, retryConfig.retryOn) &&
          originalRequest._retryCount < retryConfig.retries &&
          !originalRequest._noRetry
        ) {
          originalRequest._retryCount++;

          // Calculate delay with exponential backoff
          const delay = calculateBackoff(
            originalRequest._retryCount,
            retryConfig.retryDelay,
            DEFAULT_RETRY_CONFIG.maxRetryDelay
          );

          // Handle 429 Rate Limit with Retry-After header
          if (error.response?.status === 429) {
            const retryAfter = error.response.headers['retry-after'];
            if (retryAfter) {
              const retryAfterMs = parseInt(retryAfter as string) * 1000;
              if (!isNaN(retryAfterMs)) {
                await sleep(Math.min(retryAfterMs, DEFAULT_RETRY_CONFIG.maxRetryDelay));
              } else {
                await sleep(delay);
              }
            } else {
              await sleep(delay);
            }
          } else {
            await sleep(delay);
          }

          // Log retry attempt in development
          if (process.env.NODE_ENV === 'development') {
            console.log(
              `Retrying request (attempt ${originalRequest._retryCount}/${retryConfig.retries}):`,
              originalRequest.url
            );
          }

          return this.instance(originalRequest);
        }

        throw ApiError.fromAxiosError(error);
      }
    );
  }

  private processQueue(error: Error | ApiError | null, token: string | null): void {
    this.failedQueue.forEach(({ resolve, reject }) => {
      if (error) {
        reject(error);
      } else {
        resolve(token!);
      }
    });

    this.failedQueue = [];
  }

  private async refreshToken(): Promise<string> {
    // For cookie-based auth, the refresh token is sent automatically via HttpOnly cookie
    // For backwards compatibility, we also send it in the body if available
    const refreshToken = TokenManager.getRefreshToken();

    try {
      const response = await this.instance.post<ApiResponse<{
        accessToken: string;
        refreshToken: string;
        csrfToken?: string;
        expiresIn: number;
      }>>(
        '/auth/refresh',
        refreshToken ? { refreshToken } : {},
        { skipAuth: true } as RequestOptions
      );

      const data = response.data.data!;

      // Update tokens (access token and rotated refresh token)
      TokenManager.setAccessToken(data.accessToken, data.expiresIn);
      TokenManager.setRefreshToken(data.refreshToken);

      // Update CSRF token if provided (for cookie-based auth)
      if (data.csrfToken) {
        TokenManager.setCsrfToken(data.csrfToken);
      }

      return data.accessToken;
    } catch (error) {
      TokenManager.clearTokens();
      throw error;
    }
  }

  private forceLogout(): void {
    this.cancelAll('Session expired');
    TokenManager.clearTokens();
    this.tenantId = null;

    // Redirect to login page
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  }

  // Generate correlation ID for request tracking
  private generateCorrelationId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Calculate retry delay with exponential backoff and jitter
  private calculateRetryDelay(
    attempt: number,
    error: AxiosError,
    baseDelay: number = 1000
  ): number {
    // Check for Retry-After header (commonly used with 429 and 503)
    const retryAfter = error.response?.headers?.['retry-after'];
    if (retryAfter) {
      // Retry-After can be a number of seconds or an HTTP date
      const seconds = parseInt(retryAfter, 10);
      if (!isNaN(seconds)) {
        return seconds * 1000;
      }
      // Try parsing as HTTP date
      const date = new Date(retryAfter);
      if (!isNaN(date.getTime())) {
        return Math.max(0, date.getTime() - Date.now());
      }
    }

    // Exponential backoff with jitter
    const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.3 * exponentialDelay; // Add up to 30% jitter
    return Math.min(exponentialDelay + jitter, 30000); // Max 30 seconds
  }

  // Check if error is retryable
  private isRetryableError(status: number): boolean {
    return (
      status === 408 || // Request Timeout
      status === 429 || // Too Many Requests
      status === 500 || // Internal Server Error
      status === 502 || // Bad Gateway
      status === 503 || // Service Unavailable
      status === 504    // Gateway Timeout
    );
  }

  // Get retry reason for logging
  private getRetryReason(status: number): string {
    switch (status) {
      case 408: return 'Request Timeout';
      case 429: return 'Rate Limited';
      case 500: return 'Internal Server Error';
      case 502: return 'Bad Gateway';
      case 503: return 'Service Unavailable';
      case 504: return 'Gateway Timeout';
      default: return 'Network Error';
    }
  }

  // Generic request method with improved retry logic
  private async request<T>(
    config: AxiosRequestConfig & RequestOptions
  ): Promise<ApiResponse<T>> {
    const maxRetries = config.retries || 3;
    const correlationId = this.generateCorrelationId();
    const startTime = Date.now();
    let lastError: ApiError;

    // --- AbortController / deduplication setup ---
    const method = (config.method || 'GET').toUpperCase();
    const isGet = method === 'GET';

    // Determine whether to auto-cancel a previous identical request.
    // Defaults to true for GET, false for everything else.
    const cancelPrevious = config.cancelPrevious ?? isGet;

    // Build the abort controller for this request. If the caller supplied one,
    // we use its signal. Otherwise we create our own so we can cancel via the
    // deduplication map or cancelAll().
    const callerController = config.abortController;
    const internalController = new AbortController();

    // If the caller provided their own controller we still need to be able to
    // abort internally (dedup / cancelAll). Chain the caller's signal so that
    // either source can abort the request.
    if (callerController) {
      // If the caller already aborted before we started, propagate immediately.
      if (callerController.signal.aborted) {
        internalController.abort(callerController.signal.reason);
      } else {
        callerController.signal.addEventListener(
          'abort',
          () => internalController.abort(callerController.signal.reason),
          { once: true }
        );
      }
    }

    // Attach the signal to the axios config so the actual HTTP request is
    // cancellable.
    config.signal = internalController.signal;

    // Deduplication: only for GET requests when cancelPrevious is enabled
    let dedupeKey: string | undefined;
    if (cancelPrevious && isGet && config.url) {
      dedupeKey = this.generateDedupeKey(method, config.url, config.params);

      // Abort the previous identical in-flight request, if any
      const existing = this.activeRequests.get(dedupeKey);
      if (existing) {
        existing.abort('Superseded by newer identical request');
      }

      // Register the new controller
      this.activeRequests.set(dedupeKey, internalController);
    }

    // Apply endpoint-specific timeout if not explicitly set
    if (!config.timeout && config.url) {
      config.timeout = getEndpointTimeout(config.url);
    }

    // Add correlation ID to headers
    config.headers = {
      ...config.headers,
      'X-Correlation-ID': correlationId,
    };

    // Log the request
    apiLogger.request(config, correlationId);

    // Cleanup helper: removes this request from the active map when done
    const cleanup = () => {
      if (dedupeKey) {
        // Only remove if this controller is still the registered one (it may
        // have already been replaced by a newer request).
        if (this.activeRequests.get(dedupeKey) === internalController) {
          this.activeRequests.delete(dedupeKey);
        }
      }
    };

    try {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const response = await this.instance.request<ApiResponse<T>>(config);

          // Log successful response
          apiLogger.response(response, correlationId, Date.now() - startTime);

          return response.data;
        } catch (error) {
          // If the request was aborted, do NOT retry -- surface immediately.
          if (isAbortError(error)) {
            throw new ApiError(
              'Request was cancelled',
              'REQUEST_CANCELLED',
              0
            );
          }

          const axiosError = error as AxiosError;
          lastError = error instanceof ApiError ? error : ApiError.fromAxiosError(axiosError);
          const duration = Date.now() - startTime;

          // Log the error
          apiLogger.error(axiosError, correlationId, duration, attempt);

          // Check if we should retry
          const status = lastError.status;

          // Don't retry for client errors (4xx) except specific retryable ones
          if (status >= 400 && status < 500 && !this.isRetryableError(status)) {
            throw lastError;
          }

          // Don't retry on the last attempt
          if (attempt === maxRetries) {
            // For 503/504, provide more specific error message
            if (status === 503) {
              lastError = new ApiError(
                'Service temporarily unavailable. Please try again in a moment.',
                'SERVICE_UNAVAILABLE',
                503,
                lastError.details
              );
            } else if (status === 504) {
              lastError = new ApiError(
                'Request timed out. Please try again.',
                'GATEWAY_TIMEOUT',
                504,
                lastError.details
              );
            }
            throw lastError;
          }

          // Before sleeping for retry, check if we've been aborted in the
          // meantime (e.g. cancelAll or dedup replaced us).
          if (internalController.signal.aborted) {
            throw new ApiError(
              'Request was cancelled',
              'REQUEST_CANCELLED',
              0
            );
          }

          // Calculate delay with exponential backoff
          const delay = this.calculateRetryDelay(attempt, axiosError);
          const reason = this.getRetryReason(status);

          // Log retry attempt
          apiLogger.retry(correlationId, attempt, delay, reason);

          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      throw lastError!;
    } finally {
      cleanup();
    }
  }

  // HTTP Methods
  public async get<T>(url: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>({ method: 'GET', url, ...options });
  }

  public async post<T, D = unknown>(
    url: string,
    data?: D,
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    return this.request<T>({ method: 'POST', url, data, ...options });
  }

  public async put<T, D = unknown>(
    url: string,
    data?: D,
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    return this.request<T>({ method: 'PUT', url, data, ...options });
  }

  public async patch<T, D = unknown>(
    url: string,
    data?: D,
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    return this.request<T>({ method: 'PATCH', url, data, ...options });
  }

  public async delete<T>(url: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>({ method: 'DELETE', url, ...options });
  }

  // Authentication methods
  public async login(credentials: LoginRequest): Promise<LoginResponse> {
    const response = await this.post<LoginResponse>('/auth/login', credentials, {
      skipAuth: true,
      skipTenantHeader: true,
    });

    const loginData = response.data!;

    // Store tokens (for expiry tracking and backwards compatibility)
    TokenManager.setAccessToken(
      loginData.tokens.accessToken,
      loginData.tokens.expiresIn
    );
    TokenManager.setRefreshToken(loginData.tokens.refreshToken);

    // Store CSRF token for cookie-based auth
    // The presence of CSRF token indicates we're using cookie-based auth
    const tokens = loginData.tokens as unknown as { csrfToken?: string };
    if (tokens.csrfToken) {
      TokenManager.setCsrfToken(tokens.csrfToken);
    }

    // Set tenant ID if available
    if (loginData.tenant) {
      this.setTenantId(loginData.tenant.id);
    }

    return loginData;
  }

  public async logout(): Promise<void> {
    // Cancel all in-flight requests before logging out
    this.cancelAll('User logged out');
    try {
      await this.post('/auth/logout');
    } catch (error) {
      // Ignore errors during logout
    } finally {
      TokenManager.clearTokens();
      this.clearTenantId();
    }
  }

  public async register(data: RegisterRequest): Promise<void> {
    await this.post<void, RegisterRequest>('/auth/register', data, {
      skipAuth: true,
      skipTenantHeader: true,
    });
  }

  // Organization methods
  public async createOrganization(data: CreateOrganizationRequest): Promise<Organization> {
    const response = await this.post<Organization, CreateOrganizationRequest>('/organizations', data);
    return response.data!;
  }

  public async getOrganization(id: string): Promise<Organization> {
    const response = await this.get<Organization>(`/organizations/${id}`);
    return response.data!;
  }

  public async updateOrganization(id: string, data: Partial<Organization>): Promise<Organization> {
    const response = await this.put<Organization, Partial<Organization>>(`/organizations/${id}`, data);
    return response.data!;
  }

  // Location methods
  public async getLocations(): Promise<Location[]> {
    const response = await this.get<Location[]>('/locations');
    return response.data || [];
  }

  public async createLocation(data: Partial<Location>): Promise<Location> {
    const response = await this.post<Location, Partial<Location>>('/locations', data);
    return response.data!;
  }

  // Product methods
  public async getProducts(query?: ProductQuery): Promise<Product[]> {
    const response = await this.get<Product[]>('/products', { params: query });
    return response.data || [];
  }

  public async getProduct(id: string): Promise<Product> {
    const response = await this.get<Product>(`/products/${id}`);
    return response.data!;
  }

  public async createProduct(data: CreateProductRequest): Promise<Product> {
    const response = await this.post<Product, CreateProductRequest>('/products', data);
    return response.data!;
  }

  public async updateProduct(id: string, data: Partial<Product>): Promise<Product> {
    const response = await this.put<Product, Partial<Product>>(`/products/${id}`, data);
    return response.data!;
  }

  public async deleteProduct(id: string): Promise<void> {
    await this.delete(`/products/${id}`);
  }

  // Category methods
  public async getCategories(): Promise<Category[]> {
    const response = await this.get<Category[]>('/categories');
    return response.data || [];
  }

  public async createCategory(data: Partial<Category>): Promise<Category> {
    const response = await this.post<Category, Partial<Category>>('/categories', data);
    return response.data!;
  }

  // Order methods
  public async getOrders(query?: OrderQuery): Promise<Order[]> {
    const response = await this.get<Order[]>('/orders', { params: query });
    return response.data || [];
  }

  public async getOrder(id: string): Promise<Order> {
    const response = await this.get<Order>(`/orders/${id}`);
    return response.data!;
  }

  public async createOrder(data: CreateOrderRequest): Promise<Order> {
    const response = await this.post<Order, CreateOrderRequest>('/orders', data);
    return response.data!;
  }

  public async updateOrder(id: string, data: Partial<Order>): Promise<Order> {
    const response = await this.put<Order, Partial<Order>>(`/orders/${id}`, data);
    return response.data!;
  }

  public async cancelOrder(id: string, reason?: string): Promise<void> {
    await this.patch<void, { reason?: string | undefined }>(`/orders/${id}/cancel`, { reason });
  }

  // Customer methods
  public async getCustomers(query?: CustomerQuery): Promise<Customer[]> {
    const response = await this.get<Customer[]>('/customers', { params: query });
    return response.data || [];
  }

  public async getCustomer(id: string): Promise<Customer> {
    const response = await this.get<Customer>(`/customers/${id}`);
    return response.data!;
  }

  public async createCustomer(data: CreateCustomerRequest): Promise<Customer> {
    const response = await this.post<Customer, CreateCustomerRequest>('/customers', data);
    return response.data!;
  }

  public async updateCustomer(id: string, data: Partial<Customer>): Promise<Customer> {
    const response = await this.put<Customer, Partial<Customer>>(`/customers/${id}`, data);
    return response.data!;
  }

  // Analytics methods
  public async getSalesAnalytics(query: AnalyticsQuery): Promise<SalesAnalyticsResponse> {
    const response = await this.get<SalesAnalyticsResponse>('/analytics/sales', { params: query });
    return response.data!;
  }

  public async getDashboardData(locationId?: string): Promise<DashboardData> {
    const response = await this.get<DashboardData>('/analytics/dashboard', {
      params: locationId ? { locationId } : undefined,
    });
    return response.data!;
  }

  public async getRecentOrders(limit: number = 5): Promise<Order[]> {
    const response = await this.get<Order[]>('/orders', {
      params: { limit, sortBy: 'createdAt', sortOrder: 'desc' },
    });
    return response.data || [];
  }

  public async getTopProducts(
    period: 'day' | 'week' | 'month' = 'day',
    limit: number = 5
  ): Promise<TopProduct[]> {
    const response = await this.get<TopProduct[]>('/analytics/top-products', {
      params: { period, limit },
    });
    return response.data || [];
  }

  public async getSalesOverview(query: {
    period?: string;
    locationId?: string;
    compareWith?: string;
    startDate?: string;
    endDate?: string;
  } = {}): Promise<SalesOverviewData> {
    const response = await this.get<SalesOverviewData>('/analytics/sales/overview', { params: query });
    return response.data!;
  }

  public async getSalesTrends(query: {
    period?: string;
    granularity?: 'hour' | 'day' | 'week' | 'month';
    locationId?: string;
    startDate?: string;
    endDate?: string;
  } = {}): Promise<SalesTrendsData> {
    const response = await this.get<SalesTrendsData>('/analytics/sales/trends', { params: query });
    return response.data!;
  }

  public async getSalesByCategory(query: {
    period?: string;
    locationId?: string;
    startDate?: string;
    endDate?: string;
  } = {}): Promise<CategorySalesData[]> {
    const response = await this.get<CategorySalesData[]>('/analytics/sales/by-category', { params: query });
    return response.data || [];
  }

  public async getSalesPerformance(query: {
    period?: string;
    compareWith?: string;
    locationId?: string;
    startDate?: string;
    endDate?: string;
  } = {}): Promise<SalesPerformanceData> {
    const response = await this.get<SalesPerformanceData>('/analytics/sales/performance', { params: query });
    return response.data!;
  }

  public async getCustomerAnalysis(query: {
    period?: string;
    locationId?: string;
    startDate?: string;
    endDate?: string;
  } = {}): Promise<CustomerAnalysisData> {
    const response = await this.get<CustomerAnalysisData>('/analytics/customers/analysis', { params: query });
    return response.data!;
  }

  public async getRealTimeSales(locationId?: string): Promise<RealTimeSalesData> {
    const response = await this.get<RealTimeSalesData>('/analytics/sales/realtime', {
      params: locationId ? { locationId } : undefined,
    });
    return response.data!;
  }

  // Inventory methods
  public async getInventory(query?: {
    locationId?: string;
    lowStock?: boolean;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<InventoryListResponse> {
    const response = await this.get<InventoryListResponse>('/inventory', { params: query });
    return response.data!;
  }

  public async getInventoryItem(productId: string, locationId: string): Promise<InventoryItem> {
    const response = await this.get<InventoryItem>(`/inventory/${productId}`, {
      params: { locationId },
    });
    return response.data!;
  }

  public async getLowStockItems(locationId?: string): Promise<InventoryItem[]> {
    const response = await this.get<InventoryItem[]>('/inventory/low-stock', {
      params: locationId ? { locationId } : undefined,
    });
    return response.data || [];
  }

  public async updateInventory(
    productId: string,
    locationId: string,
    data: { quantity: number; reason: string }
  ): Promise<InventoryItem> {
    const response = await this.post<InventoryItem>(`/inventory/${productId}/adjust`, {
      locationId,
      ...data,
    });
    return response.data!;
  }

  public async getStockMovements(query?: {
    productId?: string;
    locationId?: string;
    type?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }): Promise<StockMovementsResponse> {
    const response = await this.get<StockMovementsResponse>('/inventory/movements', { params: query });
    return response.data!;
  }

  // User methods
  public async getCurrentUser(): Promise<User> {
    const response = await this.get<User>('/users/me');
    return response.data!;
  }

  public async updateProfile(data: UpdateProfileRequest): Promise<User> {
    const response = await this.put<User, UpdateProfileRequest>('/users/me', data);
    return response.data!;
  }

  // File upload
  public async uploadFile(file: File, path?: string): Promise<FileUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    if (path) formData.append('path', path);

    const response = await this.post<FileUploadResponse>('/files/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data!;
  }

  // Health check
  public async healthCheck(): Promise<HealthCheckResponse> {
    const response = await this.get<HealthCheckResponse>('/health', {
      skipAuth: true,
      skipTenantHeader: true,
      timeout: 5000,
    });
    return response.data!;
  }
}

// Create and export default instance
const apiConfig: ApiClientConfig = {
  baseURL: process.env.NEXT_PUBLIC_API_URL || '/api/v1',
  timeout: 30000,
  retries: 3,
};

export const apiClient = new ApiClient(apiConfig);

// Export token manager for use in other parts of the application
export { TokenManager };

// Utility function to handle API errors in components
export function handleApiError(error: unknown): {
  message: string;
  code: string;
  status?: number;
} {
  if (error instanceof ApiError) {
    return {
      message: error.message,
      code: error.code,
      status: error.status,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      code: ErrorCodes.INTERNAL_ERROR,
    };
  }

  return {
    message: 'An unexpected error occurred',
    code: ErrorCodes.INTERNAL_ERROR,
  };
}