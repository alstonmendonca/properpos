'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  showDetails?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });

    // Log error to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    // Call optional error handler
    this.props.onError?.(error, errorInfo);

    // TODO: Send to error tracking service (e.g., Sentry)
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleGoHome = (): void => {
    window.location.href = '/dashboard';
  };

  handleReload = (): void => {
    window.location.reload();
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="min-h-[400px] flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center">
            <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-6">
              <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>

            <h2 className="text-xl font-semibold text-foreground mb-2">
              Something went wrong
            </h2>

            <p className="text-muted-foreground mb-6">
              We encountered an unexpected error. Please try again or contact support if the problem persists.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={this.handleRetry} variant="default">
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again
              </Button>

              <Button onClick={this.handleGoHome} variant="outline">
                <Home className="w-4 h-4 mr-2" />
                Go to Dashboard
              </Button>
            </div>

            {/* Show error details in development */}
            {(this.props.showDetails || process.env.NODE_ENV === 'development') && this.state.error && (
              <details className="mt-6 text-left">
                <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground flex items-center gap-2">
                  <Bug className="w-4 h-4" />
                  Error Details
                </summary>
                <div className="mt-2 p-4 bg-muted rounded-lg overflow-auto">
                  <p className="text-sm font-mono text-red-600 dark:text-red-400 mb-2">
                    {this.state.error.message}
                  </p>
                  {this.state.errorInfo && (
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  )}
                </div>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Higher-order component for wrapping pages
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  fallback?: ReactNode
) {
  return function WithErrorBoundary(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };
}

// Page-level error boundary with more detailed UI
export function PageErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={
        <div className="min-h-screen flex items-center justify-center p-6 bg-background">
          <div className="max-w-lg w-full text-center">
            <div className="mx-auto w-20 h-20 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-8">
              <AlertTriangle className="w-10 h-10 text-red-600 dark:text-red-400" />
            </div>

            <h1 className="text-2xl font-bold text-foreground mb-4">
              Page Error
            </h1>

            <p className="text-muted-foreground mb-8">
              This page encountered an error and could not be displayed.
              Our team has been notified and is working to fix it.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button onClick={() => window.location.reload()} size="lg">
                <RefreshCw className="w-5 h-5 mr-2" />
                Reload Page
              </Button>

              <Button onClick={() => window.location.href = '/dashboard'} variant="outline" size="lg">
                <Home className="w-5 h-5 mr-2" />
                Go to Dashboard
              </Button>
            </div>

            <p className="mt-8 text-sm text-muted-foreground">
              Error ID: {Date.now().toString(36)}
            </p>
          </div>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}

// Async error boundary for handling async errors in components
export function AsyncErrorBoundary({
  children,
  onRetry,
}: {
  children: ReactNode;
  onRetry?: () => void;
}) {
  return (
    <ErrorBoundary
      fallback={
        <div className="p-6 text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">
            Failed to load content
          </h3>
          <p className="text-muted-foreground mb-4">
            There was a problem loading this content.
          </p>
          {onRetry && (
            <Button onClick={onRetry} variant="outline" size="sm">
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          )}
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}

export default ErrorBoundary;
