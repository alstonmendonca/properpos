'use client';

import React from 'react';
import { AlertCircle, RefreshCw, XCircle, WifiOff, Clock, Lock, CreditCard, HelpCircle, Mail } from 'lucide-react';
import { Button } from './button';

export interface FriendlyError {
  title: string;
  message: string;
  hint?: string;
  canRetry: boolean;
  showSupport: boolean;
}

interface ErrorDisplayProps {
  error: FriendlyError | null;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
  variant?: 'inline' | 'card' | 'toast' | 'full-page';
}

// Error code to icon mapping
const getErrorIcon = (title: string) => {
  const titleLower = title.toLowerCase();

  if (titleLower.includes('connection') || titleLower.includes('network')) {
    return WifiOff;
  }
  if (titleLower.includes('timeout')) {
    return Clock;
  }
  if (titleLower.includes('session') || titleLower.includes('permission') || titleLower.includes('access')) {
    return Lock;
  }
  if (titleLower.includes('payment') || titleLower.includes('card') || titleLower.includes('subscription')) {
    return CreditCard;
  }

  return AlertCircle;
};

/**
 * Inline error display - minimal, shows below form fields or in small spaces
 */
function InlineError({ error, onRetry, onDismiss }: ErrorDisplayProps) {
  if (!error) return null;

  return (
    <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-medium">{error.message}</p>
        {error.hint && (
          <p className="text-red-600 dark:text-red-500 text-xs mt-1">{error.hint}</p>
        )}
      </div>
      {error.canRetry && onRetry && (
        <button
          onClick={onRetry}
          className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
          title="Retry"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      )}
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
        >
          <XCircle className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

/**
 * Card error display - for sections or standalone error messages
 */
function CardError({ error, onRetry, onDismiss, className = '' }: ErrorDisplayProps) {
  if (!error) return null;

  const Icon = getErrorIcon(error.title);

  return (
    <div className={`bg-card rounded-xl border border-red-200 dark:border-red-800 shadow-sm overflow-hidden ${className}`}>
      <div className="p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 p-3 bg-red-100 dark:bg-red-900/30 rounded-full">
            <Icon className="w-6 h-6 text-red-600 dark:text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-foreground">
              {error.title}
            </h3>
            <p className="mt-2 text-muted-foreground">
              {error.message}
            </p>
            {error.hint && (
              <p className="mt-3 text-sm text-muted-foreground flex items-start gap-2">
                <HelpCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {error.hint}
              </p>
            )}
          </div>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-muted-foreground hover:text-foreground"
            >
              <XCircle className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center justify-end gap-3 px-6 py-4 bg-muted/50 border-t border-border">
        {error.showSupport && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open('mailto:support@properpos.com', '_blank')}
          >
            <Mail className="w-4 h-4 mr-2" />
            Contact Support
          </Button>
        )}
        {error.canRetry && onRetry && (
          <Button
            variant="default"
            size="sm"
            onClick={onRetry}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Toast error display - for temporary notifications
 */
function ToastError({ error, onRetry, onDismiss }: ErrorDisplayProps) {
  if (!error) return null;

  const Icon = getErrorIcon(error.title);

  return (
    <div className="bg-card rounded-lg shadow-lg border border-red-200 dark:border-red-800 p-4 max-w-md">
      <div className="flex items-start gap-3">
        <Icon className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-foreground">
            {error.title}
          </h4>
          <p className="text-sm text-muted-foreground mt-1">
            {error.message}
          </p>
          <div className="flex items-center gap-3 mt-3">
            {error.canRetry && onRetry && (
              <button
                onClick={onRetry}
                className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                Retry
              </button>
            )}
            {error.showSupport && (
              <button
                onClick={() => window.open('mailto:support@properpos.com', '_blank')}
                className="text-sm text-muted-foreground hover:underline"
              >
                Get Help
              </button>
            )}
          </div>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-muted-foreground hover:text-foreground"
          >
            <XCircle className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Full page error display - for critical errors or empty states
 */
function FullPageError({ error, onRetry }: ErrorDisplayProps) {
  if (!error) return null;

  const Icon = getErrorIcon(error.title);

  return (
    <div className="min-h-[400px] flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full mb-6">
          <Icon className="w-8 h-8 text-red-600 dark:text-red-400" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">
          {error.title}
        </h2>
        <p className="text-muted-foreground mb-4">
          {error.message}
        </p>
        {error.hint && (
          <p className="text-sm text-muted-foreground mb-6 flex items-center justify-center gap-2">
            <HelpCircle className="w-4 h-4" />
            {error.hint}
          </p>
        )}
        <div className="flex items-center justify-center gap-3">
          {error.canRetry && onRetry && (
            <Button onClick={onRetry}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          )}
          {error.showSupport && (
            <Button
              variant="outline"
              onClick={() => window.open('mailto:support@properpos.com', '_blank')}
            >
              <Mail className="w-4 h-4 mr-2" />
              Contact Support
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Main ErrorDisplay component with variant support
 */
export function ErrorDisplay({ variant = 'card', ...props }: ErrorDisplayProps) {
  switch (variant) {
    case 'inline':
      return <InlineError {...props} />;
    case 'toast':
      return <ToastError {...props} />;
    case 'full-page':
      return <FullPageError {...props} />;
    case 'card':
    default:
      return <CardError {...props} />;
  }
}

/**
 * Hook for managing error state with friendly messages
 */
export function useErrorDisplay() {
  const [error, setError] = React.useState<FriendlyError | null>(null);

  const showError = React.useCallback((friendlyError: FriendlyError) => {
    setError(friendlyError);
  }, []);

  const clearError = React.useCallback(() => {
    setError(null);
  }, []);

  const showApiError = React.useCallback((apiError: any) => {
    // Extract friendly error from API response if available
    if (apiError?.response?.data?.error?.friendly) {
      setError(apiError.response.data.error.friendly);
    } else {
      // Fallback to generic error
      setError({
        title: 'Something Went Wrong',
        message: apiError?.message || 'An unexpected error occurred.',
        hint: 'Please try again. If the problem persists, contact support.',
        canRetry: true,
        showSupport: true,
      });
    }
  }, []);

  return {
    error,
    showError,
    clearError,
    showApiError,
  };
}

/**
 * Common error presets for quick use
 */
export const errorPresets = {
  networkError: {
    title: 'Connection Lost',
    message: 'Unable to connect to the server.',
    hint: 'Check your internet connection and try again.',
    canRetry: true,
    showSupport: false,
  } as FriendlyError,

  timeout: {
    title: 'Request Timeout',
    message: 'The request took too long to complete.',
    hint: 'The server might be busy. Please try again.',
    canRetry: true,
    showSupport: false,
  } as FriendlyError,

  unauthorized: {
    title: 'Session Expired',
    message: 'Your session has expired.',
    hint: 'Please log in again to continue.',
    canRetry: false,
    showSupport: false,
  } as FriendlyError,

  forbidden: {
    title: 'Access Denied',
    message: 'You don\'t have permission to perform this action.',
    hint: 'Contact your administrator if you need access.',
    canRetry: false,
    showSupport: false,
  } as FriendlyError,

  notFound: {
    title: 'Not Found',
    message: 'The requested item could not be found.',
    hint: 'It may have been deleted or moved.',
    canRetry: true,
    showSupport: false,
  } as FriendlyError,

  serverError: {
    title: 'Server Error',
    message: 'Something went wrong on our end.',
    hint: 'Please try again. If the problem persists, contact support.',
    canRetry: true,
    showSupport: true,
  } as FriendlyError,
};

export default ErrorDisplay;
