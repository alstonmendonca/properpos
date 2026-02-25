'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface BulkEditField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select';
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
}

interface BulkEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (updates: Record<string, any>) => void;
  fields: BulkEditField[];
  selectedCount: number;
  entityName: string;
  isLoading?: boolean;
}

export function BulkEditModal({
  isOpen,
  onClose,
  onSubmit,
  fields,
  selectedCount,
  entityName,
  isLoading = false,
}: BulkEditModalProps) {
  const [enabledFields, setEnabledFields] = useState<Record<string, boolean>>({});
  const [values, setValues] = useState<Record<string, any>>({});

  if (!isOpen) return null;

  const toggleField = (key: string) => {
    setEnabledFields((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const updateValue = (key: string, value: any) => {
    setValues((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSubmit = () => {
    const updates: Record<string, any> = {};
    for (const field of fields) {
      if (enabledFields[field.key]) {
        updates[field.key] = values[field.key] ?? '';
      }
    }
    onSubmit(updates);
  };

  const hasEnabledFields = Object.values(enabledFields).some(Boolean);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-background border border-border rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Bulk Edit {entityName}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Editing {selectedCount} {entityName.toLowerCase()}. Toggle fields to include in update.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-accent rounded cursor-pointer"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Fields */}
        <div className="p-6 space-y-4">
          {fields.map((field) => (
            <div key={field.key} className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!enabledFields[field.key]}
                  onChange={() => toggleField(field.key)}
                  className="rounded border-input cursor-pointer"
                />
                <span className="text-sm font-medium text-foreground">
                  {field.label}
                </span>
              </label>

              {enabledFields[field.key] && (
                <div className="ml-7">
                  {field.type === 'select' ? (
                    <select
                      value={values[field.key] ?? ''}
                      onChange={(e) => updateValue(field.key, e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background cursor-pointer text-sm"
                    >
                      <option value="">
                        {field.placeholder || `Select ${field.label}`}
                      </option>
                      {field.options?.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={field.type}
                      value={values[field.key] ?? ''}
                      onChange={(e) =>
                        updateValue(
                          field.key,
                          field.type === 'number'
                            ? e.target.value === '' ? '' : Number(e.target.value)
                            : e.target.value
                        )
                      }
                      placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background text-sm"
                    />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-6 border-t border-border">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
            className="cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!hasEnabledFields || isLoading}
            loading={isLoading}
            className="cursor-pointer"
          >
            Update {selectedCount} {entityName}
          </Button>
        </div>
      </div>
    </div>
  );
}
