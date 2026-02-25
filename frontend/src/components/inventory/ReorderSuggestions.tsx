'use client';

import React from 'react';
import { ShoppingCart, Calendar, Package, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ReorderSuggestion {
  productId: string;
  productName: string;
  locationId: string;
  currentStock: number;
  predictedDemand: number;
  daysUntilStockout: number;
  suggestedOrderQuantity: number;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  estimatedOrderDate: string;
  confidence: number;
}

interface ReorderSuggestionsProps {
  suggestions: ReorderSuggestion[];
  onCreatePurchaseOrder?: (productIds: string[]) => void;
}

const urgencyStyles = {
  critical: {
    bg: 'bg-red-50 dark:bg-red-950/30 border-l-4 border-l-red-500',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
    text: 'text-red-700 dark:text-red-300',
  },
  high: {
    bg: 'bg-orange-50 dark:bg-orange-950/30 border-l-4 border-l-orange-500',
    badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300',
    text: 'text-orange-700 dark:text-orange-300',
  },
  medium: {
    bg: 'bg-yellow-50 dark:bg-yellow-950/30 border-l-4 border-l-yellow-500',
    badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300',
    text: 'text-yellow-700 dark:text-yellow-300',
  },
  low: {
    bg: 'bg-green-50 dark:bg-green-950/30 border-l-4 border-l-green-500',
    badge: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
    text: 'text-green-700 dark:text-green-300',
  },
} as const;

export default function ReorderSuggestions({ suggestions, onCreatePurchaseOrder }: ReorderSuggestionsProps) {
  if (!suggestions || suggestions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShoppingCart className="w-5 h-5" />
            Reorder Suggestions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Package className="h-12 w-12 text-emerald-500/50 mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-1">All products are well-stocked</h3>
            <p className="text-sm text-muted-foreground">
              No reorder suggestions at this time. Inventory levels are healthy.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const handleCreatePOForAll = () => {
    if (onCreatePurchaseOrder) {
      onCreatePurchaseOrder(suggestions.map((s) => s.productId));
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShoppingCart className="w-5 h-5" />
            Reorder Suggestions ({suggestions.length})
          </CardTitle>
          {onCreatePurchaseOrder && (
            <Button
              size="sm"
              onClick={handleCreatePOForAll}
              className="cursor-pointer"
            >
              <ShoppingCart className="w-4 h-4 mr-2" />
              Create PO for All
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
          {suggestions.map((suggestion) => {
            const style = urgencyStyles[suggestion.urgency];

            return (
              <div
                key={`${suggestion.productId}-${suggestion.locationId}`}
                className={cn('p-4', style.bg)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium uppercase',
                          style.badge
                        )}
                      >
                        {suggestion.urgency}
                      </span>
                      <h4 className="font-medium text-foreground truncate">
                        {suggestion.productName}
                      </h4>
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-sm">
                      <div className="text-muted-foreground">
                        Current Stock: <span className="font-medium text-foreground">{suggestion.currentStock}</span>
                      </div>
                      <div className="text-muted-foreground">
                        Days to Stockout:{' '}
                        <span className={cn('font-medium', style.text)}>
                          {suggestion.daysUntilStockout <= 0 ? 'Now' : `${suggestion.daysUntilStockout}d`}
                        </span>
                      </div>
                      <div className="text-muted-foreground">
                        Confidence: <span className="font-medium text-foreground">{Math.round(suggestion.confidence * 100)}%</span>
                      </div>
                      <div className="text-muted-foreground">
                        Predicted Demand: <span className="font-medium text-foreground">{Math.round(suggestion.predictedDemand)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-sm text-muted-foreground mb-1">Order Qty</div>
                    <div className="text-xl font-bold text-foreground">
                      {suggestion.suggestedOrderQuantity}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(suggestion.estimatedOrderDate).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
