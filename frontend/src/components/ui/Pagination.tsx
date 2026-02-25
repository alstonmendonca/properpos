'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  pageSize?: number | undefined;
  onPageSizeChange?: ((size: number) => void) | undefined;
  totalItems?: number | undefined;
  itemName?: string | undefined;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export function Pagination({
  page,
  totalPages,
  onPageChange,
  pageSize,
  onPageSizeChange,
  totalItems,
  itemName = 'items',
}: PaginationProps) {
  const isFirstPage = page <= 1;
  const isLastPage = page >= totalPages;

  const startItem = totalItems != null && totalItems > 0
    ? (page - 1) * (pageSize || 10) + 1
    : 0;
  const endItem = totalItems != null
    ? Math.min(page * (pageSize || 10), totalItems)
    : 0;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 py-4">
      {/* Left: showing count */}
      <div className="text-sm text-muted-foreground">
        {totalItems != null && totalItems > 0 ? (
          <span>
            Showing {startItem}-{endItem} of {totalItems} {itemName}
          </span>
        ) : (
          <span>No {itemName} to display</span>
        )}
      </div>

      {/* Right: controls */}
      <div className="flex items-center gap-3">
        {/* Page size selector */}
        {onPageSizeChange && pageSize != null && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="px-2 py-1 border border-border rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Page navigation */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={isFirstPage}
            className="cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Previous
          </Button>

          <span className="text-sm text-muted-foreground px-2">
            Page {page} of {Math.max(1, totalPages)}
          </span>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={isLastPage || totalPages === 0}
            className="cursor-pointer"
          >
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
