'use client';

import React, { useCallback, useState } from 'react';
import { AlertTriangle, Trash2, X, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from './button';

// Dialog variants for different use cases
type DialogVariant = 'danger' | 'warning' | 'info' | 'success';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: DialogVariant;
  isLoading?: boolean;
}

const variantConfig: Record<DialogVariant, {
  icon: React.ElementType;
  iconColor: string;
  bgColor: string;
  buttonColor: string;
}> = {
  danger: {
    icon: Trash2,
    iconColor: 'text-red-600',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    buttonColor: 'bg-red-600 hover:bg-red-700 text-white',
  },
  warning: {
    icon: AlertTriangle,
    iconColor: 'text-yellow-600',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
    buttonColor: 'bg-yellow-600 hover:bg-yellow-700 text-white',
  },
  info: {
    icon: AlertCircle,
    iconColor: 'text-blue-600',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    buttonColor: 'bg-blue-600 hover:bg-blue-700 text-white',
  },
  success: {
    icon: CheckCircle,
    iconColor: 'text-green-600',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    buttonColor: 'bg-green-600 hover:bg-green-700 text-white',
  },
};

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  isLoading = false,
}: ConfirmDialogProps) {
  const [internalLoading, setInternalLoading] = useState(false);
  const config = variantConfig[variant];
  const Icon = config.icon;

  const handleConfirm = useCallback(async () => {
    setInternalLoading(true);
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      // Let the parent handle the error
      console.error('Confirm action failed:', error);
    } finally {
      setInternalLoading(false);
    }
  }, [onConfirm, onClose]);

  const loading = isLoading || internalLoading;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={loading ? undefined : onClose}
      />

      {/* Dialog */}
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Close button */}
        <button
          onClick={onClose}
          disabled={loading}
          className="absolute top-4 right-4 p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Content */}
        <div className="p-6">
          <div className="flex items-start gap-4">
            {/* Icon */}
            <div className={`flex-shrink-0 p-3 rounded-full ${config.bgColor}`}>
              <Icon className={`w-6 h-6 ${config.iconColor}`} />
            </div>

            {/* Text */}
            <div className="flex-1 pt-1">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {title}
              </h3>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                {message}
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={loading}
          >
            {cancelText}
          </Button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className={`px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 ${config.buttonColor}`}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Processing...
              </span>
            ) : (
              confirmText
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Hook for easy dialog management
export function useConfirmDialog() {
  const [dialogState, setDialogState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant: DialogVariant;
    confirmText: string;
    cancelText: string;
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    variant: 'danger',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    onConfirm: () => {},
  });

  const confirm = useCallback((options: {
    title: string;
    message: string;
    variant?: DialogVariant;
    confirmText?: string;
    cancelText?: string;
  }): Promise<boolean> => {
    return new Promise((resolve) => {
      setDialogState({
        isOpen: true,
        title: options.title,
        message: options.message,
        variant: options.variant || 'danger',
        confirmText: options.confirmText || 'Confirm',
        cancelText: options.cancelText || 'Cancel',
        onConfirm: () => {
          resolve(true);
        },
      });

      // Handle cancel via close
      const handleClose = () => {
        setDialogState(prev => ({ ...prev, isOpen: false }));
        resolve(false);
      };

      // Store the close handler for the dialog
      (window as any).__confirmDialogClose = handleClose;
    });
  }, []);

  const close = useCallback(() => {
    setDialogState(prev => ({ ...prev, isOpen: false }));
    if ((window as any).__confirmDialogClose) {
      (window as any).__confirmDialogClose();
      delete (window as any).__confirmDialogClose;
    }
  }, []);

  const DialogComponent = useCallback(() => (
    <ConfirmDialog
      isOpen={dialogState.isOpen}
      onClose={close}
      onConfirm={dialogState.onConfirm}
      title={dialogState.title}
      message={dialogState.message}
      variant={dialogState.variant}
      confirmText={dialogState.confirmText}
      cancelText={dialogState.cancelText}
    />
  ), [dialogState, close]);

  return { confirm, DialogComponent };
}

// Preset confirmation dialogs
export const confirmDelete = (itemName: string) => ({
  title: `Delete ${itemName}?`,
  message: `Are you sure you want to delete this ${itemName.toLowerCase()}? This action cannot be undone.`,
  variant: 'danger' as const,
  confirmText: 'Delete',
});

export const confirmCancel = (actionName: string) => ({
  title: `Cancel ${actionName}?`,
  message: `Are you sure you want to cancel this ${actionName.toLowerCase()}? Any unsaved changes will be lost.`,
  variant: 'warning' as const,
  confirmText: 'Yes, Cancel',
});

export const confirmDeactivate = (itemName: string) => ({
  title: `Deactivate ${itemName}?`,
  message: `This will deactivate the ${itemName.toLowerCase()}. You can reactivate it later.`,
  variant: 'warning' as const,
  confirmText: 'Deactivate',
});

export const confirmDowngrade = () => ({
  title: 'Downgrade Subscription?',
  message: 'Downgrading your subscription will limit your access to certain features. Your current data will be preserved.',
  variant: 'warning' as const,
  confirmText: 'Downgrade',
});

export default ConfirmDialog;
