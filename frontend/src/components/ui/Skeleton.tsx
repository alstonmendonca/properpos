'use client';

import React from 'react';

interface SkeletonProps {
  className?: string;
  // Preset variants
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
  // Width (can be number for px or string like '100%')
  width?: number | string;
  // Height (can be number for px or string)
  height?: number | string;
  // Animation type
  animation?: 'pulse' | 'wave' | 'none';
}

/**
 * Base Skeleton component for loading states
 */
export function Skeleton({
  className = '',
  variant = 'text',
  width,
  height,
  animation = 'pulse',
}: SkeletonProps) {
  const baseStyles = 'bg-muted';

  const variantStyles = {
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-none',
    rounded: 'rounded-lg',
  };

  const animationStyles = {
    pulse: 'animate-pulse',
    wave: 'animate-shimmer bg-gradient-to-r from-muted via-muted/60 to-muted bg-[length:200%_100%]',
    none: '',
  };

  const style: React.CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height || (variant === 'text' ? '1em' : undefined),
  };

  return (
    <div
      className={`${baseStyles} ${variantStyles[variant]} ${animationStyles[animation]} ${className}`}
      style={style}
    />
  );
}

/**
 * Skeleton for text lines
 */
export function SkeletonText({
  lines = 3,
  className = '',
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          variant="text"
          width={i === lines - 1 ? '60%' : '100%'}
          height={16}
        />
      ))}
    </div>
  );
}

/**
 * Skeleton for avatar/profile images
 */
export function SkeletonAvatar({
  size = 40,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Skeleton
      variant="circular"
      width={size}
      height={size}
      className={className}
    />
  );
}

/**
 * Skeleton for cards
 */
export function SkeletonCard({
  className = '',
  hasImage = true,
  lines = 3,
}: {
  className?: string;
  hasImage?: boolean;
  lines?: number;
}) {
  return (
    <div className={`bg-card rounded-xl border border-border overflow-hidden ${className}`}>
      {hasImage && (
        <Skeleton variant="rectangular" width="100%" height={160} />
      )}
      <div className="p-4 space-y-3">
        <Skeleton variant="text" width="70%" height={20} />
        <SkeletonText lines={lines} />
      </div>
    </div>
  );
}

/**
 * Skeleton for table rows
 */
export function SkeletonTableRow({
  columns = 5,
  className = '',
}: {
  columns?: number;
  className?: string;
}) {
  return (
    <tr className={className}>
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton variant="text" width={i === 0 ? '80%' : '60%'} height={16} />
        </td>
      ))}
    </tr>
  );
}

/**
 * Skeleton for tables
 */
export function SkeletonTable({
  rows = 5,
  columns = 5,
  className = '',
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div className={`bg-card rounded-xl border border-border overflow-hidden ${className}`}>
      <table className="w-full">
        <thead className="bg-muted/50">
          <tr>
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i} className="px-4 py-3 text-left">
                <Skeleton variant="text" width="60%" height={14} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {Array.from({ length: rows }).map((_, i) => (
            <SkeletonTableRow key={i} columns={columns} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Skeleton for stat cards (dashboard)
 */
export function SkeletonStatCard({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-card rounded-xl border border-border p-6 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <Skeleton variant="text" width={100} height={14} />
        <Skeleton variant="circular" width={40} height={40} />
      </div>
      <Skeleton variant="text" width={120} height={32} className="mb-2" />
      <Skeleton variant="text" width={80} height={14} />
    </div>
  );
}

/**
 * Skeleton for the Analytics page
 */
export function SkeletonAnalytics() {
  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-xl border border-border p-6">
          <Skeleton variant="text" width={150} height={20} className="mb-4" />
          <Skeleton variant="rounded" width="100%" height={300} />
        </div>
        <div className="bg-card rounded-xl border border-border p-6">
          <Skeleton variant="text" width={150} height={20} className="mb-4" />
          <Skeleton variant="rounded" width="100%" height={300} />
        </div>
      </div>

      {/* Table */}
      <SkeletonTable rows={5} columns={6} />
    </div>
  );
}

/**
 * Skeleton for the Orders page
 */
export function SkeletonOrders() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Skeleton variant="text" width={150} height={28} />
        <Skeleton variant="rounded" width={120} height={40} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <Skeleton variant="rounded" width={200} height={40} />
        <Skeleton variant="rounded" width={150} height={40} />
        <Skeleton variant="rounded" width={150} height={40} />
      </div>

      {/* Table */}
      <SkeletonTable rows={8} columns={7} />
    </div>
  );
}

/**
 * Skeleton for the Products page
 */
export function SkeletonProducts() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Skeleton variant="text" width={150} height={28} />
        <Skeleton variant="rounded" width={140} height={40} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <Skeleton variant="rounded" width={250} height={40} />
        <Skeleton variant="rounded" width={150} height={40} />
      </div>

      {/* Product grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} hasImage lines={2} />
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton for the Customers page
 */
export function SkeletonCustomers() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Skeleton variant="text" width={150} height={28} />
        <Skeleton variant="rounded" width={140} height={40} />
      </div>

      {/* Search and filters */}
      <div className="flex items-center gap-4">
        <Skeleton variant="rounded" width={300} height={40} />
        <Skeleton variant="rounded" width={150} height={40} />
      </div>

      {/* Customer list */}
      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="bg-card rounded-xl border border-border p-4 flex items-center gap-4"
          >
            <SkeletonAvatar size={48} />
            <div className="flex-1 space-y-2">
              <Skeleton variant="text" width={150} height={18} />
              <Skeleton variant="text" width={200} height={14} />
            </div>
            <Skeleton variant="text" width={80} height={16} />
            <Skeleton variant="rounded" width={100} height={32} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton for the Inventory page
 */
export function SkeletonInventory() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Skeleton variant="text" width={150} height={28} />
        <div className="flex gap-2">
          <Skeleton variant="rounded" width={120} height={40} />
          <Skeleton variant="rounded" width={120} height={40} />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>

      {/* Table */}
      <SkeletonTable rows={10} columns={6} />
    </div>
  );
}

/**
 * Skeleton for form fields
 */
export function SkeletonForm({ fields = 5 }: { fields?: number }) {
  return (
    <div className="space-y-6">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton variant="text" width={100} height={14} />
          <Skeleton variant="rounded" width="100%" height={40} />
        </div>
      ))}
      <div className="flex justify-end gap-3 pt-4">
        <Skeleton variant="rounded" width={80} height={40} />
        <Skeleton variant="rounded" width={100} height={40} />
      </div>
    </div>
  );
}

export default Skeleton;
