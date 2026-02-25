// Utility functions for ProperPOS Frontend

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combines class names using clsx and merges Tailwind CSS classes
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats currency with proper locale support
 */
export function formatCurrency(
  amount: number,
  currency: string = 'USD',
  locale: string = 'en-US'
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch (error) {
    // Fallback for unsupported currencies
    return `${currency.toUpperCase()} ${amount.toFixed(2)}`;
  }
}

/**
 * Formats numbers with thousands separators
 */
export function formatNumber(
  value: number,
  locale: string = 'en-US',
  options?: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/**
 * Formats dates with timezone support
 */
export function formatDate(
  date: Date | string,
  options?: {
    format?: 'short' | 'long' | 'time' | 'datetime' | 'date-only';
    timezone?: string;
    locale?: string;
  }
): string {
  const { format = 'short', timezone = 'UTC', locale = 'en-US' } = options || {};
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  const formatOptions: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
  };

  switch (format) {
    case 'short':
      formatOptions.year = 'numeric';
      formatOptions.month = 'short';
      formatOptions.day = 'numeric';
      break;
    case 'long':
      formatOptions.year = 'numeric';
      formatOptions.month = 'long';
      formatOptions.day = 'numeric';
      formatOptions.weekday = 'long';
      break;
    case 'time':
      formatOptions.hour = '2-digit';
      formatOptions.minute = '2-digit';
      formatOptions.second = '2-digit';
      break;
    case 'datetime':
      formatOptions.year = 'numeric';
      formatOptions.month = 'short';
      formatOptions.day = 'numeric';
      formatOptions.hour = '2-digit';
      formatOptions.minute = '2-digit';
      break;
    case 'date-only':
      formatOptions.year = 'numeric';
      formatOptions.month = '2-digit';
      formatOptions.day = '2-digit';
      break;
  }

  return new Intl.DateTimeFormat(locale, formatOptions).format(dateObj);
}

/**
 * Formats relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(
  date: Date | string,
  locale: string = 'en-US'
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (diffDays > 0) return rtf.format(-diffDays, 'day');
  if (diffHours > 0) return rtf.format(-diffHours, 'hour');
  if (diffMinutes > 0) return rtf.format(-diffMinutes, 'minute');
  return rtf.format(-diffSeconds, 'second');
}

/**
 * Formats phone numbers
 */
export function formatPhoneNumber(phone: string, country: string = 'US'): string {
  // Remove all non-numeric characters
  const cleaned = phone.replace(/\D/g, '');

  if (country === 'US' && cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }

  if (country === 'US' && cleaned.length === 11 && cleaned[0] === '1') {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }

  // For other countries or formats, return with basic formatting
  if (cleaned.length >= 10) {
    return `+${cleaned}`;
  }

  return phone; // Return original if can't format
}

/**
 * Formats file sizes
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

/**
 * Generates a slug from text
 */
export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Truncates text with ellipsis
 */
export function truncate(text: string, length: number): string {
  if (text.length <= length) return text;
  return text.slice(0, length) + '...';
}

/**
 * Capitalizes the first letter of each word
 */
export function capitalizeWords(text: string): string {
  return text.replace(/\b\w/g, (match) => match.toUpperCase());
}

/**
 * Validates email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validates phone number format
 */
export function isValidPhone(phone: string): boolean {
  const phoneRegex = /^[+]?[1-9][\d\s\-()]{8,}$/;
  return phoneRegex.test(phone);
}

/**
 * Debounces a function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Throttles a function
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Deep clones an object
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;

  if (obj instanceof Date) return new Date(obj.getTime()) as unknown as T;
  if (obj instanceof Array) return obj.map(item => deepClone(item)) as unknown as T;
  if (obj instanceof Set) return new Set(Array.from(obj as Set<any>).map(item => deepClone(item))) as unknown as T;
  if (obj instanceof Map) {
    return new Map(Array.from(obj as Map<any, any>).map(([key, value]) => [deepClone(key), deepClone(value)])) as unknown as T;
  }

  if (typeof obj === 'object') {
    const clonedObj = {} as T;
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = deepClone(obj[key]);
      }
    }
    return clonedObj;
  }

  return obj;
}

/**
 * Picks specific properties from an object
 */
export function pick<T extends Record<string, any>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  keys.forEach(key => {
    if (key in obj) {
      result[key] = obj[key];
    }
  });
  return result;
}

/**
 * Omits specific properties from an object
 */
export function omit<T extends Record<string, any>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj } as any;
  keys.forEach(key => {
    delete result[key];
  });
  return result;
}

/**
 * Groups array items by a key
 */
export function groupBy<T>(
  array: T[],
  keyFn: (item: T) => string | number
): Record<string, T[]> {
  return array.reduce((groups, item) => {
    const key = String(keyFn(item));
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(item);
    return groups;
  }, {} as Record<string, T[]>);
}

/**
 * Creates a range of numbers
 */
export function range(start: number, end: number, step: number = 1): number[] {
  const result: number[] = [];
  for (let i = start; i < end; i += step) {
    result.push(i);
  }
  return result;
}

/**
 * Generates a random string
 */
export function randomString(length: number = 10): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Calculates percentage change
 */
export function calculatePercentageChange(oldValue: number, newValue: number): number {
  if (oldValue === 0) return newValue === 0 ? 0 : 100;
  return ((newValue - oldValue) / oldValue) * 100;
}

/**
 * Calculates tax amount
 */
export function calculateTax(
  amount: number,
  rate: number,
  inclusive: boolean = false
): number {
  if (inclusive) {
    return amount - (amount / (1 + rate / 100));
  }
  return amount * (rate / 100);
}

/**
 * Calculates discount amount
 */
export function calculateDiscount(
  amount: number,
  discountType: 'percentage' | 'fixed',
  discountValue: number
): number {
  if (discountType === 'percentage') {
    return amount * (discountValue / 100);
  }
  return discountValue;
}

/**
 * Rounds to specific decimal places
 */
export function roundTo(num: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}

/**
 * Clamps a number between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Checks if value is empty (null, undefined, empty string, empty array, empty object)
 */
export function isEmpty(value: any): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * Downloads a file from blob data
 */
export function downloadFile(
  data: Blob | string,
  filename: string,
  mimeType?: string
): void {
  const blob = data instanceof Blob ? data : new Blob([data], mimeType ? { type: mimeType } : undefined);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

/**
 * Copies text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textArea);
      return success;
    }
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    return false;
  }
}

/**
 * Formats duration in milliseconds to human readable string
 */
export function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Retries an async operation
 */
export async function retry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
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

/**
 * Creates a promise that resolves after specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parses user agent for device information
 */
export function parseUserAgent(userAgent: string = navigator.userAgent) {
  const mobile = /Mobile|Android|iPhone|iPad/i.test(userAgent);
  const tablet = /iPad|Android(?!.*Mobile)/i.test(userAgent);
  const bot = /bot|crawler|spider/i.test(userAgent);

  let browser = 'Unknown';
  if (userAgent.includes('Chrome')) browser = 'Chrome';
  else if (userAgent.includes('Firefox')) browser = 'Firefox';
  else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) browser = 'Safari';
  else if (userAgent.includes('Edge')) browser = 'Edge';

  let os = 'Unknown';
  if (userAgent.includes('Windows')) os = 'Windows';
  else if (userAgent.includes('Mac')) os = 'macOS';
  else if (userAgent.includes('Linux')) os = 'Linux';
  else if (userAgent.includes('Android')) os = 'Android';
  else if (userAgent.includes('iOS')) os = 'iOS';

  return { mobile, tablet, bot, browser, os };
}

/**
 * Gets device pixel ratio
 */
export function getDevicePixelRatio(): number {
  return window.devicePixelRatio || 1;
}

/**
 * Checks if device is touch capable
 */
export function isTouchDevice(): boolean {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

/**
 * Gets viewport dimensions
 */
export function getViewportSize() {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

/**
 * Smoothly scrolls to an element
 */
export function scrollToElement(
  element: HTMLElement | string,
  options?: ScrollIntoViewOptions
): void {
  const target = typeof element === 'string'
    ? document.querySelector(element) as HTMLElement
    : element;

  if (target) {
    target.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
      inline: 'nearest',
      ...options,
    });
  }
}