'use client';

import React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface BulkAction {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  disabled?: boolean;
}

interface BulkActionBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  actions: BulkAction[];
  className?: string;
}

export function BulkActionBar({
  selectedCount,
  onClearSelection,
  actions,
  className,
}: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      className={cn(
        'bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-center gap-2 flex-wrap',
        className
      )}
    >
      <span className="text-sm font-medium text-foreground">
        {selectedCount} selected
      </span>

      {actions.map((action) => (
        <Button
          key={action.label}
          variant={action.variant || 'outline'}
          size="sm"
          onClick={action.onClick}
          disabled={action.disabled}
          className="cursor-pointer"
        >
          <span className="mr-2">{action.icon}</span>
          {action.label}
        </Button>
      ))}

      <Button
        variant="ghost"
        size="sm"
        onClick={onClearSelection}
        className="ml-auto cursor-pointer"
      >
        <X className="w-4 h-4 mr-1" />
        Clear
      </Button>
    </div>
  );
}
