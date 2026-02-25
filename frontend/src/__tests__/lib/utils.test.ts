/**
 * Tests for utility functions in src/lib/utils.ts.
 *
 * Covers: formatCurrency, formatDate, calculateTax, calculateDiscount,
 * roundTo, and isEmpty.
 */

import {
  formatCurrency,
  formatDate,
  calculateTax,
  calculateDiscount,
  roundTo,
  isEmpty,
} from '@/lib/utils';

// ---------------------------------------------------------------------------
// formatCurrency
// ---------------------------------------------------------------------------

describe('formatCurrency()', () => {
  it('should format USD amounts with $ symbol', () => {
    const result = formatCurrency(1234.56, 'USD', 'en-US');
    expect(result).toBe('$1,234.56');
  });

  it('should default to USD and en-US locale', () => {
    const result = formatCurrency(99.9);
    expect(result).toBe('$99.90');
  });

  it('should format zero correctly', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('should format negative amounts', () => {
    const result = formatCurrency(-50, 'USD', 'en-US');
    expect(result).toMatch(/50\.00/); // may contain minus sign or parentheses
    expect(result).toContain('50.00');
  });

  it('should format EUR amounts', () => {
    const result = formatCurrency(1234.56, 'EUR', 'en-US');
    // In en-US locale, EUR is typically shown as a symbol prefix
    expect(result).toContain('1,234.56');
  });

  it('should format GBP amounts', () => {
    const result = formatCurrency(42.0, 'GBP', 'en-US');
    expect(result).toContain('42.00');
  });

  it('should handle case-insensitive currency codes', () => {
    // The implementation calls currency.toUpperCase()
    const result = formatCurrency(10, 'usd', 'en-US');
    expect(result).toBe('$10.00');
  });

  it('should always show two decimal places', () => {
    expect(formatCurrency(5)).toBe('$5.00');
    expect(formatCurrency(5.1)).toBe('$5.10');
    expect(formatCurrency(5.999)).toBe('$6.00'); // rounds
  });
});

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------

describe('formatDate()', () => {
  // Use a fixed date so tests are deterministic regardless of timezone.
  const testDate = new Date('2024-06-15T14:30:00Z');

  it('should format with "short" format by default', () => {
    const result = formatDate(testDate);
    // short: month=short, day=numeric, year=numeric, timezone=UTC
    // e.g. "Jun 15, 2024"
    expect(result).toContain('Jun');
    expect(result).toContain('15');
    expect(result).toContain('2024');
  });

  it('should accept a date string as input', () => {
    const result = formatDate('2024-06-15T14:30:00Z');
    expect(result).toContain('Jun');
    expect(result).toContain('15');
  });

  it('should format with "long" format', () => {
    const result = formatDate(testDate, { format: 'long', timezone: 'UTC' });
    // long: weekday=long, month=long, day=numeric, year=numeric
    // e.g. "Saturday, June 15, 2024"
    expect(result).toContain('Saturday');
    expect(result).toContain('June');
    expect(result).toContain('15');
    expect(result).toContain('2024');
  });

  it('should format with "time" format', () => {
    const result = formatDate(testDate, { format: 'time', timezone: 'UTC' });
    // time: hour=2-digit, minute=2-digit, second=2-digit
    expect(result).toContain('30');
    expect(result).toContain('00');
  });

  it('should format with "datetime" format', () => {
    const result = formatDate(testDate, { format: 'datetime', timezone: 'UTC' });
    // datetime: month=short, day=numeric, year=numeric, hour=2-digit, minute=2-digit
    expect(result).toContain('Jun');
    expect(result).toContain('15');
    expect(result).toContain('2024');
    expect(result).toContain('30');
  });

  it('should format with "date-only" format', () => {
    const result = formatDate(testDate, { format: 'date-only', timezone: 'UTC' });
    // date-only: year=numeric, month=2-digit, day=2-digit
    // e.g. "06/15/2024"
    expect(result).toContain('06');
    expect(result).toContain('15');
    expect(result).toContain('2024');
  });

  it('should respect the timezone option', () => {
    // 14:30 UTC = 10:30 in America/New_York (EDT)
    const utcResult = formatDate(testDate, { format: 'time', timezone: 'UTC' });
    const nyResult = formatDate(testDate, { format: 'time', timezone: 'America/New_York' });
    // They should produce different times
    expect(utcResult).not.toBe(nyResult);
  });
});

// ---------------------------------------------------------------------------
// calculateTax
// ---------------------------------------------------------------------------

describe('calculateTax()', () => {
  it('should calculate exclusive tax (default)', () => {
    // 100 * 10% = 10
    expect(calculateTax(100, 10)).toBe(10);
  });

  it('should calculate exclusive tax with a different rate', () => {
    // 200 * 7.5% = 15
    expect(calculateTax(200, 7.5)).toBe(15);
  });

  it('should return 0 tax when rate is 0', () => {
    expect(calculateTax(100, 0)).toBe(0);
  });

  it('should calculate inclusive tax', () => {
    // Inclusive: amount - (amount / (1 + rate/100))
    // 110 - (110 / 1.10) = 110 - 100 = 10
    expect(calculateTax(110, 10, true)).toBeCloseTo(10, 2);
  });

  it('should calculate inclusive tax with non-trivial rate', () => {
    // 107.5 - (107.5 / 1.075) = 107.5 - 100 = 7.5
    expect(calculateTax(107.5, 7.5, true)).toBeCloseTo(7.5, 2);
  });

  it('should handle zero amount', () => {
    expect(calculateTax(0, 10)).toBe(0);
    expect(calculateTax(0, 10, true)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calculateDiscount
// ---------------------------------------------------------------------------

describe('calculateDiscount()', () => {
  it('should calculate percentage discount', () => {
    // 200 * 15% = 30
    expect(calculateDiscount(200, 'percentage', 15)).toBe(30);
  });

  it('should calculate 100% discount', () => {
    expect(calculateDiscount(50, 'percentage', 100)).toBe(50);
  });

  it('should calculate 0% discount', () => {
    expect(calculateDiscount(50, 'percentage', 0)).toBe(0);
  });

  it('should return the fixed discount value directly', () => {
    expect(calculateDiscount(200, 'fixed', 25)).toBe(25);
  });

  it('should return fixed discount even if it exceeds amount', () => {
    // The implementation just returns discountValue for fixed type
    expect(calculateDiscount(10, 'fixed', 50)).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// roundTo
// ---------------------------------------------------------------------------

describe('roundTo()', () => {
  it('should round to 2 decimal places', () => {
    expect(roundTo(1.005, 2)).toBe(1.0); // Due to floating point: Math.round(1.005 * 100) / 100
    expect(roundTo(1.235, 2)).toBe(1.24);
    expect(roundTo(1.234, 2)).toBe(1.23);
  });

  it('should round to 0 decimal places', () => {
    expect(roundTo(1.5, 0)).toBe(2);
    expect(roundTo(1.4, 0)).toBe(1);
  });

  it('should round to 3 decimal places', () => {
    expect(roundTo(1.2345, 3)).toBe(1.235);
    expect(roundTo(1.2344, 3)).toBe(1.234);
  });

  it('should handle negative numbers', () => {
    expect(roundTo(-1.235, 2)).toBe(-1.23);
  });

  it('should return integer when decimals is 0', () => {
    expect(roundTo(99.9, 0)).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// isEmpty
// ---------------------------------------------------------------------------

describe('isEmpty()', () => {
  it('should return true for null', () => {
    expect(isEmpty(null)).toBe(true);
  });

  it('should return true for undefined', () => {
    expect(isEmpty(undefined)).toBe(true);
  });

  it('should return true for empty string', () => {
    expect(isEmpty('')).toBe(true);
  });

  it('should return true for whitespace-only string', () => {
    expect(isEmpty('   ')).toBe(true);
  });

  it('should return true for empty array', () => {
    expect(isEmpty([])).toBe(true);
  });

  it('should return true for empty object', () => {
    expect(isEmpty({})).toBe(true);
  });

  it('should return false for non-empty string', () => {
    expect(isEmpty('hello')).toBe(false);
  });

  it('should return false for non-empty array', () => {
    expect(isEmpty([1, 2, 3])).toBe(false);
  });

  it('should return false for non-empty object', () => {
    expect(isEmpty({ key: 'value' })).toBe(false);
  });

  it('should return false for number 0', () => {
    expect(isEmpty(0)).toBe(false);
  });

  it('should return false for boolean false', () => {
    expect(isEmpty(false)).toBe(false);
  });

  it('should return false for a non-zero number', () => {
    expect(isEmpty(42)).toBe(false);
  });
});
