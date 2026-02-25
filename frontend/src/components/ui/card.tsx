'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const cardVariants = cva(
  'rounded-lg border bg-card text-card-foreground shadow-sm',
  {
    variants: {
      variant: {
        default: '',
        outline: 'border-2',
        ghost: 'border-transparent shadow-none',
        elevated: 'shadow-md',
        interactive: 'transition-all duration-200 hover:shadow-md cursor-pointer',
      },
      size: {
        default: 'p-6',
        sm: 'p-4',
        lg: 'p-8',
        xl: 'p-10',
        none: 'p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  asChild?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? 'div' : 'div';

    return (
      <Comp
        ref={ref}
        className={cn(cardVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col space-y-1.5 p-6', className)}
    {...props}
  />
));
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement> & {
    as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  }
>(({ className, as: Comp = 'h3', ...props }, ref) => (
  <Comp
    ref={ref}
    className={cn(
      'text-2xl font-semibold leading-none tracking-tight',
      className
    )}
    {...props}
  />
));
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
));
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex items-center p-6 pt-0', className)}
    {...props}
  />
));
CardFooter.displayName = 'CardFooter';

// Specialized card components

// Stats Card
export interface StatsCardProps extends Omit<CardProps, 'children'> {
  title: string;
  value: string | number;
  description?: string;
  icon?: React.ReactNode;
  /** Trend object with value and direction */
  trend?: {
    value: number;
    label?: string;
    direction: 'up' | 'down' | 'neutral';
  } | 'up' | 'down' | 'neutral';
  /** Change percentage value (used with string trend) */
  change?: number;
  loading?: boolean;
}

const StatsCard = React.forwardRef<HTMLDivElement, StatsCardProps>(
  ({ title, value, description, icon, trend, change, loading, className, ...props }, ref) => {
    // Normalize trend to always be an object
    const normalizedTrend = React.useMemo(() => {
      if (!trend && change === undefined) return null;

      // If trend is already an object, use it directly
      if (trend && typeof trend === 'object') {
        return trend;
      }

      // If trend is a string direction and change is provided, build the object
      if (typeof trend === 'string' && change !== undefined) {
        return {
          value: Math.abs(change),
          direction: trend,
          label: 'vs last period',
        };
      }

      // If only change is provided, determine direction from its sign
      if (change !== undefined) {
        return {
          value: Math.abs(change),
          direction: change >= 0 ? 'up' : 'down' as const,
          label: 'vs last period',
        };
      }

      return null;
    }, [trend, change]);

    return (
      <Card ref={ref} className={cn('relative', className)} {...props}>
        <CardContent className="p-6">
          {loading ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                <div className="h-6 w-6 bg-muted rounded animate-pulse" />
              </div>
              <div className="h-8 w-32 bg-muted rounded animate-pulse" />
              <div className="h-3 w-20 bg-muted rounded animate-pulse" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">{title}</p>
                {icon && <div className="text-muted-foreground">{icon}</div>}
              </div>

              <div className="mt-2">
                <p className="text-3xl font-bold">{value}</p>
                <div className="flex items-center space-x-2 mt-1">
                  {description && (
                    <p className="text-xs text-muted-foreground">{description}</p>
                  )}
                  {normalizedTrend && (
                    <div className={cn(
                      'flex items-center text-xs font-medium',
                      {
                        'text-emerald-600 dark:text-emerald-400': normalizedTrend.direction === 'up',
                        'text-destructive': normalizedTrend.direction === 'down',
                        'text-muted-foreground': normalizedTrend.direction === 'neutral',
                      }
                    )}>
                      {normalizedTrend.direction === 'up' && (
                        <svg className="mr-1 h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                      {normalizedTrend.direction === 'down' && (
                        <svg className="mr-1 h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                      {normalizedTrend.value > 0 && normalizedTrend.direction !== 'down' && '+'}
                      {normalizedTrend.value.toFixed(1)}%
                      {normalizedTrend.label && ` ${normalizedTrend.label}`}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    );
  }
);
StatsCard.displayName = 'StatsCard';

// Product Card for POS
export interface ProductCardProps extends Omit<CardProps, 'children' | 'onClick'> {
  product: {
    id: string;
    name: string;
    price: number;
    image?: string;
    category?: string;
    isVegetarian?: boolean;
    isAvailable?: boolean;
  };
  currency?: string;
  onAddToCart?: (productId: string) => void;
  loading?: boolean;
  selected?: boolean;
}

const ProductCard = React.forwardRef<HTMLDivElement, ProductCardProps>(
  ({
    product,
    currency = 'USD',
    onAddToCart,
    loading,
    selected,
    className,
    ...props
  }, ref) => {
    const formatPrice = (price: number) => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
      }).format(price);
    };

    return (
      <Card
        ref={ref}
        variant={selected ? 'outline' : 'default'}
        className={cn(
          'cursor-pointer transition-all duration-200 hover:shadow-md',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          {
            'opacity-50': !product.isAvailable,
            'ring-2 ring-primary': selected,
          },
          className
        )}
        onClick={() => product.isAvailable && onAddToCart?.(product.id)}
        tabIndex={0}
        role="button"
        aria-label={`Add ${product.name} to cart`}
        {...props}
      >
        <CardContent className="p-4 space-y-3">
          {/* Product Image */}
          {product.image ? (
            <div className="aspect-square w-full rounded-md overflow-hidden bg-muted">
              <img
                src={product.image}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="aspect-square w-full rounded-md bg-muted flex items-center justify-center">
              <svg
                className="h-8 w-8 text-muted-foreground"
                fill="none"
                strokeWidth={1.5}
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.641-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"
                />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
              </svg>
            </div>
          )}

          {/* Product Info */}
          <div className="space-y-2">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-medium text-sm leading-tight line-clamp-2">
                  {product.name}
                </h3>
                {product.category && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {product.category}
                  </p>
                )}
              </div>
              {product.isVegetarian && (
                <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700 ml-2">
                  🥬
                </span>
              )}
            </div>

            <div className="flex items-center justify-between">
              <span className="font-semibold text-lg">
                {formatPrice(product.price)}
              </span>
              {!product.isAvailable && (
                <span className="text-xs text-muted-foreground">
                  Out of Stock
                </span>
              )}
            </div>
          </div>

          {/* Loading Overlay */}
          {loading && (
            <div className="absolute inset-0 bg-background/50 flex items-center justify-center rounded-lg">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
);
ProductCard.displayName = 'ProductCard';

// Order Card
export interface OrderCardProps extends Omit<CardProps, 'children'> {
  order: {
    id: string;
    orderNumber: string;
    total: number;
    status: string;
    items: Array<{ name: string; quantity: number }>;
    customer?: { name: string };
    createdAt: string;
  };
  currency?: string;
  onViewDetails?: (orderId: string) => void;
  onUpdateStatus?: (orderId: string, status: string) => void;
}

const OrderCard = React.forwardRef<HTMLDivElement, OrderCardProps>(
  ({
    order,
    currency = 'USD',
    onViewDetails,
    onUpdateStatus,
    className,
    ...props
  }, ref) => {
    const formatPrice = (price: number) => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
      }).format(price);
    };

    const getStatusColor = (status: string) => {
      const statusMap = {
        pending: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
        confirmed: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
        preparing: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
        ready: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        completed: 'bg-muted text-muted-foreground',
        cancelled: 'bg-destructive/10 text-destructive',
      };
      return statusMap[status as keyof typeof statusMap] || 'bg-muted text-muted-foreground';
    };

    return (
      <Card
        ref={ref}
        variant="interactive"
        className={cn('relative', className)}
        {...props}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="font-semibold">#{order.orderNumber}</h3>
              {order.customer && (
                <p className="text-sm text-muted-foreground">{order.customer.name}</p>
              )}
            </div>
            <span className={cn(
              'inline-flex items-center rounded-full px-2 py-1 text-xs font-medium',
              getStatusColor(order.status)
            )}>
              {order.status}
            </span>
          </div>

          <div className="space-y-1 mb-3">
            {order.items.slice(0, 2).map((item, index) => (
              <p key={index} className="text-sm text-muted-foreground">
                {item.quantity}x {item.name}
              </p>
            ))}
            {order.items.length > 2 && (
              <p className="text-sm text-muted-foreground">
                +{order.items.length - 2} more items
              </p>
            )}
          </div>

          <div className="flex items-center justify-between">
            <span className="font-semibold">{formatPrice(order.total)}</span>
            <button
              onClick={() => onViewDetails?.(order.id)}
              className="text-primary hover:text-primary/80 text-sm font-medium"
            >
              View Details
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }
);
OrderCard.displayName = 'OrderCard';

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
  StatsCard,
  ProductCard,
  OrderCard,
  cardVariants
};