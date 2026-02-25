// Form Validation Utilities for ProperPOS

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export interface FieldValidation {
  validate: (value: string) => ValidationResult;
  formatHint?: string;
}

// Email validation
export const emailValidation: FieldValidation = {
  validate: (value: string): ValidationResult => {
    if (!value) {
      return { isValid: false, error: 'Email is required' };
    }

    // RFC 5322 compliant email regex (simplified)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      return { isValid: false, error: 'Please enter a valid email address' };
    }

    // Check for common typos
    const commonDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'];
    const domain = value.split('@')[1]?.toLowerCase();
    if (domain) {
      const typos: Record<string, string> = {
        'gmial.com': 'gmail.com',
        'gmal.com': 'gmail.com',
        'gamil.com': 'gmail.com',
        'yaho.com': 'yahoo.com',
        'yahooo.com': 'yahoo.com',
        'hotmal.com': 'hotmail.com',
        'outloo.com': 'outlook.com',
      };
      if (typos[domain]) {
        return {
          isValid: false,
          error: `Did you mean ${value.split('@')[0]}@${typos[domain]}?`,
        };
      }
    }

    return { isValid: true };
  },
  formatHint: 'example@domain.com',
};

// Phone number validation (supports international formats)
export const phoneValidation: FieldValidation = {
  validate: (value: string): ValidationResult => {
    if (!value) {
      return { isValid: true }; // Phone is optional
    }

    // Remove common formatting characters for validation
    const cleaned = value.replace(/[\s\-\(\)\.]/g, '');

    // Check if it's a valid phone number format
    // Supports: +1234567890, 1234567890, +12345678901234 (up to 15 digits for international)
    const phoneRegex = /^\+?[1-9]\d{6,14}$/;
    if (!phoneRegex.test(cleaned)) {
      return {
        isValid: false,
        error: 'Please enter a valid phone number (e.g., +1 555 123-4567)',
      };
    }

    return { isValid: true };
  },
  formatHint: '+1 (555) 123-4567',
};

// ZIP/Postal code validation (US and Canada)
export const zipCodeValidation: FieldValidation = {
  validate: (value: string): ValidationResult => {
    if (!value) {
      return { isValid: true }; // ZIP is optional
    }

    // US ZIP code (5 digits or 5+4)
    const usZipRegex = /^\d{5}(-\d{4})?$/;
    // Canadian postal code
    const caPostalRegex = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;

    if (!usZipRegex.test(value) && !caPostalRegex.test(value)) {
      return {
        isValid: false,
        error: 'Please enter a valid ZIP/postal code',
      };
    }

    return { isValid: true };
  },
  formatHint: '12345 or A1B 2C3',
};

// Name validation
export const nameValidation: FieldValidation = {
  validate: (value: string): ValidationResult => {
    if (!value || !value.trim()) {
      return { isValid: false, error: 'Name is required' };
    }

    if (value.length < 2) {
      return { isValid: false, error: 'Name must be at least 2 characters' };
    }

    if (value.length > 50) {
      return { isValid: false, error: 'Name must be less than 50 characters' };
    }

    // Check for numbers (names shouldn't have numbers)
    if (/\d/.test(value)) {
      return { isValid: false, error: 'Name should not contain numbers' };
    }

    return { isValid: true };
  },
};

// Price validation (positive number with up to 2 decimal places)
export const priceValidation: FieldValidation = {
  validate: (value: string): ValidationResult => {
    if (!value) {
      return { isValid: false, error: 'Price is required' };
    }

    const num = parseFloat(value);
    if (isNaN(num)) {
      return { isValid: false, error: 'Please enter a valid number' };
    }

    if (num < 0) {
      return { isValid: false, error: 'Price cannot be negative' };
    }

    // Check decimal places
    const parts = value.split('.');
    if (parts[1] && parts[1].length > 2) {
      return { isValid: false, error: 'Price can have at most 2 decimal places' };
    }

    return { isValid: true };
  },
  formatHint: '0.00',
};

// SKU validation
export const skuValidation: FieldValidation = {
  validate: (value: string): ValidationResult => {
    if (!value || !value.trim()) {
      return { isValid: false, error: 'SKU is required' };
    }

    // SKU should be alphanumeric with optional hyphens/underscores
    const skuRegex = /^[A-Za-z0-9\-_]+$/;
    if (!skuRegex.test(value)) {
      return {
        isValid: false,
        error: 'SKU can only contain letters, numbers, hyphens, and underscores',
      };
    }

    if (value.length < 2) {
      return { isValid: false, error: 'SKU must be at least 2 characters' };
    }

    if (value.length > 50) {
      return { isValid: false, error: 'SKU must be less than 50 characters' };
    }

    return { isValid: true };
  },
  formatHint: 'ABC-123',
};

// Quantity validation (positive integer)
export const quantityValidation: FieldValidation = {
  validate: (value: string): ValidationResult => {
    if (!value) {
      return { isValid: false, error: 'Quantity is required' };
    }

    const num = parseInt(value, 10);
    if (isNaN(num)) {
      return { isValid: false, error: 'Please enter a valid number' };
    }

    if (num < 0) {
      return { isValid: false, error: 'Quantity cannot be negative' };
    }

    if (!Number.isInteger(parseFloat(value))) {
      return { isValid: false, error: 'Quantity must be a whole number' };
    }

    return { isValid: true };
  },
};

// URL validation
export const urlValidation: FieldValidation = {
  validate: (value: string): ValidationResult => {
    if (!value) {
      return { isValid: true }; // URL is usually optional
    }

    try {
      new URL(value);
      return { isValid: true };
    } catch {
      return {
        isValid: false,
        error: 'Please enter a valid URL (e.g., https://example.com)',
      };
    }
  },
  formatHint: 'https://example.com',
};

// Generic required field validation
export const requiredValidation = (fieldName: string): FieldValidation => ({
  validate: (value: string): ValidationResult => {
    if (!value || !value.trim()) {
      return { isValid: false, error: `${fieldName} is required` };
    }
    return { isValid: true };
  },
});

// Create a form errors state type
export type FormErrors<T> = Partial<Record<keyof T, string>>;

// Validate multiple fields at once
export function validateFields<T extends Record<string, string>>(
  values: T,
  validations: Partial<Record<keyof T, FieldValidation>>
): { isValid: boolean; errors: FormErrors<T> } {
  const errors: FormErrors<T> = {};
  let isValid = true;

  for (const [field, validation] of Object.entries(validations)) {
    if (validation) {
      const result = validation.validate(values[field] || '');
      if (!result.isValid) {
        errors[field as keyof T] = result.error;
        isValid = false;
      }
    }
  }

  return { isValid, errors };
}

// Format phone number as user types
export function formatPhoneNumber(value: string): string {
  // Remove all non-digits except leading +
  const hasPlus = value.startsWith('+');
  const digits = value.replace(/\D/g, '');

  // Format based on length
  if (digits.length === 0) {
    return hasPlus ? '+' : '';
  }

  if (hasPlus || digits.length > 10) {
    // International format
    if (digits.length <= 3) {
      return `+${digits}`;
    } else if (digits.length <= 6) {
      return `+${digits.slice(0, digits.length - 3)} ${digits.slice(-3)}`;
    } else {
      return `+${digits.slice(0, digits.length - 7)} ${digits.slice(-7, -4)} ${digits.slice(-4)}`;
    }
  } else {
    // US format
    if (digits.length <= 3) {
      return digits;
    } else if (digits.length <= 6) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    } else {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
    }
  }
}

// Format price as user types
export function formatPrice(value: string): string {
  // Remove non-numeric characters except decimal point
  const cleaned = value.replace(/[^\d.]/g, '');

  // Ensure only one decimal point
  const parts = cleaned.split('.');
  if (parts.length > 2) {
    return parts[0] + '.' + parts.slice(1).join('');
  }

  // Limit decimal places to 2
  if (parts[1] && parts[1].length > 2) {
    return parts[0] + '.' + parts[1].slice(0, 2);
  }

  return cleaned;
}
