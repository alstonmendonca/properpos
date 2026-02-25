'use client';

import { useEffect, useCallback, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface UseUnsavedChangesOptions {
  // Message shown in the browser's native confirmation dialog
  message?: string;
  // Whether to track changes
  enabled?: boolean;
  // Callback when user tries to leave with unsaved changes
  onBlock?: () => void;
}

/**
 * Hook to warn users about unsaved changes before leaving a page
 *
 * Usage:
 * ```tsx
 * const { setHasChanges, hasChanges, reset } = useUnsavedChanges({
 *   message: 'You have unsaved changes. Are you sure you want to leave?'
 * });
 *
 * // Set when form changes
 * const handleChange = (e) => {
 *   setFormData(...)
 *   setHasChanges(true);
 * };
 *
 * // Reset after save
 * const handleSave = async () => {
 *   await saveData();
 *   reset();
 * };
 * ```
 */
export function useUnsavedChanges(options: UseUnsavedChangesOptions = {}) {
  const {
    message = 'You have unsaved changes. Are you sure you want to leave?',
    enabled = true,
    onBlock,
  } = options;

  const [hasChanges, setHasChanges] = useState(false);
  const router = useRouter();
  const isBlocking = useRef(false);

  // Handle browser back/forward and tab close
  useEffect(() => {
    if (!enabled || !hasChanges) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = message;
      return message;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [enabled, hasChanges, message]);

  // Handle Next.js route changes
  useEffect(() => {
    if (!enabled || !hasChanges) return;

    // Intercept link clicks
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a');

      if (anchor && anchor.href && !anchor.href.startsWith('javascript:')) {
        const url = new URL(anchor.href, window.location.origin);

        // Only block if navigating away from current page
        if (url.pathname !== window.location.pathname) {
          if (!window.confirm(message)) {
            e.preventDefault();
            e.stopPropagation();
            onBlock?.();
          }
        }
      }
    };

    document.addEventListener('click', handleClick, true);

    return () => {
      document.removeEventListener('click', handleClick, true);
    };
  }, [enabled, hasChanges, message, onBlock]);

  // Reset the changes flag
  const reset = useCallback(() => {
    setHasChanges(false);
  }, []);

  // Mark as having changes
  const markChanged = useCallback(() => {
    setHasChanges(true);
  }, []);

  // Confirm navigation (returns true if user confirms or no changes)
  const confirmNavigation = useCallback((): boolean => {
    if (!hasChanges) return true;
    return window.confirm(message);
  }, [hasChanges, message]);

  // Safe navigation that checks for unsaved changes
  const safeNavigate = useCallback((path: string) => {
    if (confirmNavigation()) {
      reset();
      router.push(path);
    }
  }, [confirmNavigation, reset, router]);

  return {
    hasChanges,
    setHasChanges,
    reset,
    markChanged,
    confirmNavigation,
    safeNavigate,
  };
}

/**
 * Hook to track form changes automatically
 * Compares current form data with initial data
 */
export function useFormChanges<T extends Record<string, any>>(
  currentData: T,
  initialData: T,
  options: UseUnsavedChangesOptions = {}
) {
  const hasChanges = JSON.stringify(currentData) !== JSON.stringify(initialData);

  const unsavedChanges = useUnsavedChanges({
    ...options,
    enabled: options.enabled !== false,
  });

  // Update hasChanges whenever form data changes
  useEffect(() => {
    unsavedChanges.setHasChanges(hasChanges);
  }, [hasChanges, unsavedChanges]);

  return {
    ...unsavedChanges,
    hasChanges,
    isDirty: hasChanges,
  };
}

/**
 * Hook for auto-saving form data with debounce
 */
export function useAutoSave<T>(
  data: T,
  onSave: (data: T) => Promise<void>,
  options: {
    debounceMs?: number;
    enabled?: boolean;
    onError?: (error: Error) => void;
  } = {}
) {
  const {
    debounceMs = 2000,
    enabled = true,
    onError,
  } = options;

  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const previousDataRef = useRef<string>();

  useEffect(() => {
    if (!enabled) return;

    const currentDataStr = JSON.stringify(data);

    // Skip if data hasn't changed
    if (currentDataStr === previousDataRef.current) return;

    // Clear previous timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout for auto-save
    timeoutRef.current = setTimeout(async () => {
      setIsSaving(true);
      setError(null);

      try {
        await onSave(data);
        previousDataRef.current = currentDataStr;
        setLastSaved(new Date());
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Auto-save failed');
        setError(error);
        onError?.(error);
      } finally {
        setIsSaving(false);
      }
    }, debounceMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [data, onSave, debounceMs, enabled, onError]);

  return {
    isSaving,
    lastSaved,
    error,
  };
}

export default useUnsavedChanges;
