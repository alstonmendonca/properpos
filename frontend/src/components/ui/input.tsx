'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const inputVariants = cva(
  'flex w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'border-input',
        destructive: 'border-destructive focus-visible:ring-destructive',
        success: 'border-pos-success focus-visible:ring-pos-success',
        warning: 'border-pos-warning focus-visible:ring-pos-warning',
      },
      size: {
        default: 'h-10',
        sm: 'h-9 px-2 text-xs',
        lg: 'h-11 px-4',
        xl: 'h-12 px-4 text-base',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  leftElement?: React.ReactNode;
  rightElement?: React.ReactNode;
  error?: string | boolean;
  success?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      variant,
      size,
      type = 'text',
      leftIcon,
      rightIcon,
      leftElement,
      rightElement,
      error,
      success,
      disabled,
      ...props
    },
    ref
  ) => {
    const hasLeftContent = leftIcon || leftElement;
    const hasRightContent = rightIcon || rightElement;

    // Determine variant based on props
    let computedVariant = variant;
    if (error && !variant) computedVariant = 'destructive';
    if (success && !variant) computedVariant = 'success';

    if (!hasLeftContent && !hasRightContent) {
      // Simple input without icons or elements
      return (
        <input
          type={type}
          className={cn(inputVariants({ variant: computedVariant, size, className }))}
          ref={ref}
          disabled={disabled}
          {...props}
        />
      );
    }

    // Input with icons or elements
    return (
      <div className="relative">
        {/* Left content */}
        {hasLeftContent && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
            {leftIcon && (
              <div className="text-muted-foreground">
                {leftIcon}
              </div>
            )}
            {leftElement}
          </div>
        )}

        {/* Input field */}
        <input
          type={type}
          className={cn(
            inputVariants({ variant: computedVariant, size }),
            {
              'pl-10': leftIcon,
              'pr-10': rightIcon,
              'pl-12': leftElement,
              'pr-12': rightElement,
            },
            className
          )}
          ref={ref}
          disabled={disabled}
          {...props}
        />

        {/* Right content */}
        {hasRightContent && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10">
            {rightIcon && (
              <div className="text-muted-foreground">
                {rightIcon}
              </div>
            )}
            {rightElement}
          </div>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

// Specialized input components
export interface NumberInputProps extends Omit<InputProps, 'type' | 'onChange'> {
  value?: number | string;
  onChange?: (value: number | undefined, event: React.ChangeEvent<HTMLInputElement>) => void;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  allowNegative?: boolean;
}

const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  (
    {
      value,
      onChange,
      min,
      max,
      step = 1,
      precision = 2,
      allowNegative = true,
      ...props
    },
    ref
  ) => {
    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const inputValue = event.target.value;

      // Allow empty value
      if (inputValue === '') {
        onChange?.(undefined, event);
        return;
      }

      // Parse the number
      const numValue = parseFloat(inputValue);

      // Validate the number
      if (isNaN(numValue)) return;
      if (!allowNegative && numValue < 0) return;
      if (min !== undefined && numValue < min) return;
      if (max !== undefined && numValue > max) return;

      onChange?.(numValue, event);
    };

    return (
      <Input
        {...props}
        ref={ref}
        type="number"
        value={value}
        onChange={handleChange}
        step={step}
        min={min}
        max={max}
      />
    );
  }
);

NumberInput.displayName = 'NumberInput';

// Currency input component
export interface CurrencyInputProps extends Omit<NumberInputProps, 'leftElement'> {
  currency?: string;
  currencySymbol?: string;
}

const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  (
    {
      currency = 'USD',
      currencySymbol,
      ...props
    },
    ref
  ) => {
    // Get currency symbol if not provided
    const symbol = currencySymbol || new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).formatToParts(1).find(part => part.type === 'currency')?.value || '$';

    return (
      <NumberInput
        {...props}
        ref={ref}
        leftElement={
          <span className="text-sm text-muted-foreground font-medium min-w-fit">
            {symbol}
          </span>
        }
        allowNegative={false}
        min={0}
        step={0.01}
        precision={2}
      />
    );
  }
);

CurrencyInput.displayName = 'CurrencyInput';

// Search input component
export interface SearchInputProps extends Omit<InputProps, 'type' | 'leftIcon'> {
  onClear?: () => void;
  showClearButton?: boolean;
}

const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      onClear,
      showClearButton = true,
      value,
      ...props
    },
    ref
  ) => {
    const hasValue = value && value.toString().length > 0;

    return (
      <Input
        {...props}
        ref={ref}
        type="search"
        value={value}
        leftIcon={
          <svg
            className="h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
        }
        rightElement={
          showClearButton && hasValue && onClear ? (
            <button
              type="button"
              onClick={onClear}
              className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-sm hover:bg-muted"
            >
              <svg
                className="h-3 w-3"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ) : undefined
        }
      />
    );
  }
);

SearchInput.displayName = 'SearchInput';

export { Input, NumberInput, CurrencyInput, SearchInput, inputVariants };