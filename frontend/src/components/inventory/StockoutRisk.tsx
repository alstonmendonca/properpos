'use client';

import React from 'react';
import {
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface StockoutRiskItem {
  productId: string;
  productName: string;
  currentStock: number;
  avgDailyDemand: number;
  daysUntilStockout: number;
  confidence: number;
  trend: string;
}

interface StockoutRiskProps {
  items: StockoutRiskItem[];
}

function getRiskStyle(daysUntilStockout: number): { bg: string; badge: string } {
  if (daysUntilStockout <= 0) {
    return {
      bg: 'bg-red-100 dark:bg-red-950/50 border-l-4 border-l-red-700',
      badge: 'bg-red-700 text-white',
    };
  }
  if (daysUntilStockout <= 3) {
    return {
      bg: 'bg-red-50 dark:bg-red-950/30 border-l-4 border-l-red-500',
      badge: 'bg-red-500 text-white',
    };
  }
  if (daysUntilStockout <= 7) {
    return {
      bg: 'bg-orange-50 dark:bg-orange-950/30 border-l-4 border-l-orange-500',
      badge: 'bg-orange-500 text-white',
    };
  }
  return {
    bg: 'bg-yellow-50 dark:bg-yellow-950/30 border-l-4 border-l-yellow-400',
    badge: 'bg-yellow-500 text-white',
  };
}

function TrendIcon({ trend }: { trend: string }) {
  if (trend === 'increasing' || trend === 'up') {
    return <TrendingUp className="w-4 h-4 text-red-500" />;
  }
  if (trend === 'decreasing' || trend === 'down') {
    return <TrendingDown className="w-4 h-4 text-green-500" />;
  }
  return <Minus className="w-4 h-4 text-muted-foreground" />;
}

export default function StockoutRisk({ items }: StockoutRiskProps) {
  if (!items || items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <AlertCircle className="w-5 h-5" />
            Stockout Risk
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <ShieldCheck className="h-12 w-12 text-emerald-500/50 mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-1">No products at risk</h3>
            <p className="text-sm text-muted-foreground">
              All products have sufficient stock levels for the forecast period.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const criticalCount = items.filter((i) => i.daysUntilStockout <= 3).length;
  const warningCount = items.filter((i) => i.daysUntilStockout > 3 && i.daysUntilStockout <= 7).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <AlertCircle className="w-5 h-5" />
            Stockout Risk
          </CardTitle>
          <div className="flex items-center gap-2">
            {criticalCount > 0 && (
              <span className="inline-flex items-center rounded-full bg-red-100 dark:bg-red-900/50 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:text-red-300">
                {criticalCount} critical
              </span>
            )}
            {warningCount > 0 && (
              <span className="inline-flex items-center rounded-full bg-orange-100 dark:bg-orange-900/50 px-2.5 py-0.5 text-xs font-medium text-orange-700 dark:text-orange-300">
                {warningCount} warning
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
          {items.map((item) => {
            const style = getRiskStyle(item.daysUntilStockout);

            return (
              <div
                key={item.productId}
                className={cn('p-4', style.bg)}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-foreground truncate mb-1">
                      {item.productName}
                    </h4>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>
                        Stock: <span className="font-medium text-foreground">{item.currentStock}</span>
                      </span>
                      <span>
                        Avg Daily: <span className="font-medium text-foreground">{item.avgDailyDemand.toFixed(1)}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        Trend: <TrendIcon trend={item.trend} />
                        <span className="capitalize text-foreground">{item.trend}</span>
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-3 py-1 text-sm font-bold',
                        style.badge
                      )}
                    >
                      {item.daysUntilStockout <= 0
                        ? 'OUT'
                        : `${item.daysUntilStockout}d`}
                    </span>
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
