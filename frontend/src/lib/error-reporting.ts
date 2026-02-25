// Error reporting abstraction
// Provides a unified interface for error reporting.
// When @sentry/nextjs is installed, errors are forwarded to Sentry.
// Otherwise, errors are logged to console.
//
// To enable Sentry: npm install @sentry/nextjs
// Then update this file to import Sentry directly.

type ErrorContext = Record<string, unknown>;

// Sentry integration point - replace with direct import after installing @sentry/nextjs:
//   import * as Sentry from '@sentry/nextjs';
//   Then use Sentry.captureException() directly in reportError()
const getSentry = (): { captureException: (error: unknown, context?: unknown) => void } | null => {
  try {
    // Check if Sentry is available on the global scope (set by sentry.client.config.ts)
    const win = typeof window !== 'undefined' ? window as any : null;
    if (win?.__SENTRY__) {
      return win.__SENTRY__.hub?.getClient() ? { captureException: win.__SENTRY__.hub.captureException.bind(win.__SENTRY__.hub) } : null;
    }
    return null;
  } catch {
    return null;
  }
};

export function reportError(error: Error, extra?: ErrorContext): void {
  // Always log to console
  console.error('[ProperPOS Error]', error.message, extra);

  // Try to report to Sentry if available
  const sentry = getSentry();
  if (sentry) {
    sentry.captureException(error, extra ? { extra } : undefined);
  }
}

export function reportMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
  if (level === 'error') {
    console.error('[ProperPOS]', message);
  } else if (level === 'warning') {
    console.warn('[ProperPOS]', message);
  } else {
    console.info('[ProperPOS]', message);
  }
}
