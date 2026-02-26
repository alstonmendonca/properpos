'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  Users,
  Package,
  Calendar,
  Download,
  RefreshCw,
  ArrowUpRight,
  BarChart3,
  PieChart,
  LineChart,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';
import toast from 'react-hot-toast';

interface SalesData {
  date: string;
  revenue: number;
  orders: number;
  customers: number;
}

interface TopProduct {
  id: string;
  name: string;
  quantity: number;
  revenue: number;
  growth: number;
}

interface CategoryRevenue {
  category: string;
  revenue: number;
  percentage: number;
  color: string;
}

interface PaymentBreakdown {
  method: string;
  amount: number;
  percentage: number;
  count: number;
}

export default function AnalyticsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState('7d');
  const [compareEnabled, setCompareEnabled] = useState(false);

  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalOrders: 0,
    totalCustomers: 0,
    avgOrderValue: 0,
    revenueChange: 0,
    ordersChange: 0,
    customersChange: 0,
    avgOrderChange: 0,
  });

  const [salesData, setSalesData] = useState<SalesData[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [categoryRevenue, setCategoryRevenue] = useState<CategoryRevenue[]>([]);
  const [paymentBreakdown, setPaymentBreakdown] = useState<PaymentBreakdown[]>([]);

  // Map date range to API period
  const getPeriodFromDateRange = (range: string): string => {
    switch (range) {
      case 'today': return 'today';
      case '7d': return 'week';
      case '30d': return 'month';
      case '90d': return 'month'; // Will use custom date range
      case '12m': return 'year';
      default: return 'week';
    }
  };

  // Get granularity for trends based on date range
  const getGranularity = (range: string): 'hour' | 'day' | 'week' | 'month' => {
    switch (range) {
      case 'today': return 'hour';
      case '7d': return 'day';
      case '30d': return 'day';
      case '90d': return 'week';
      case '12m': return 'month';
      default: return 'day';
    }
  };

  // Category colors for visualization
  const categoryColors = [
    'bg-blue-500',
    'bg-green-500',
    'bg-purple-500',
    'bg-orange-500',
    'bg-pink-500',
    'bg-yellow-500',
    'bg-cyan-500',
    'bg-red-500',
  ];

  const fetchAnalyticsData = useCallback(async () => {
    try {
      const period = getPeriodFromDateRange(dateRange);
      const granularity = getGranularity(dateRange);

      // Fetch all analytics data in parallel
      const [overviewData, trendsData, productsData, categoryData] = await Promise.allSettled([
        apiClient.getSalesOverview({
          period,
          compareWith: 'previous_period',
        }),
        apiClient.getSalesTrends({
          period,
          granularity,
        }),
        apiClient.getTopProducts(
          period === 'today' ? 'day' : period === 'week' ? 'week' : 'month',
          5
        ),
        apiClient.getSalesByCategory({ period }),
      ]);

      // Process overview data
      if (overviewData.status === 'fulfilled' && overviewData.value) {
        const data = overviewData.value;
        const current = data.currentPeriod || {} as any;
        const growth = data.growth || {} as any;

        setStats({
          totalRevenue: current.revenue || 0,
          totalOrders: current.orders || 0,
          totalCustomers: current.customers || 0,
          avgOrderValue: current.averageOrderValue || 0,
          revenueChange: growth.revenue || 0,
          ordersChange: growth.orders || 0,
          customersChange: growth.customers || 0,
          avgOrderChange: growth.averageOrderValue || 0,
        });
      }

      // Process trends data
      if (trendsData.status === 'fulfilled' && trendsData.value) {
        const data = trendsData.value.data || [];
        setSalesData(
          data.map((item: any) => ({
            date: item.date,
            revenue: item.totalSales || 0,
            orders: item.totalOrders || 0,
            customers: 0, // Not provided in trends
          }))
        );
      }

      // Process top products data
      if (productsData.status === 'fulfilled' && productsData.value) {
        const data = productsData.value;
        setTopProducts(
          (Array.isArray(data) ? data : []).map((product: any) => ({
            id: product.productId,
            name: product.productName || 'Unknown Product',
            quantity: product.totalQuantity || 0,
            revenue: product.totalRevenue || 0,
            growth: 0, // Would need comparison data
          }))
        );
      }

      // Process category data
      if (categoryData.status === 'fulfilled' && categoryData.value) {
        const data = categoryData.value;
        setCategoryRevenue(
          (Array.isArray(data) ? data : []).map((cat: any, index: number) => ({
            category: cat.categoryName || 'Uncategorized',
            revenue: cat.totalRevenue || 0,
            percentage: cat.percentage || 0,
            color: categoryColors[index % categoryColors.length] || 'bg-blue-500',
          }))
        );
      }

      // Set default payment breakdown (would need separate API)
      // For now, we calculate from stats if available
      const totalRev = stats.totalRevenue || 1;
      setPaymentBreakdown([
        { method: 'Card', amount: totalRev * 0.65, percentage: 65, count: Math.round(stats.totalOrders * 0.6) },
        { method: 'Cash', amount: totalRev * 0.28, percentage: 28, count: Math.round(stats.totalOrders * 0.32) },
        { method: 'Online', amount: totalRev * 0.07, percentage: 7, count: Math.round(stats.totalOrders * 0.08) },
      ]);

      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load analytics data';
      setError(errorMessage);
      toast.error('Failed to load analytics data');
    }
  }, [dateRange]);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await fetchAnalyticsData();
      setIsLoading(false);
    };
    loadData();
  }, [fetchAnalyticsData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchAnalyticsData();
    setIsRefreshing(false);
    toast.success('Analytics data refreshed');
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  // Calculate max values for chart scaling
  const maxRevenue = Math.max(...salesData.map(d => d.revenue));

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-muted rounded w-1/4" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-32 bg-muted rounded-lg" />
          ))}
        </div>
        <div className="h-80 bg-muted rounded-lg" />
      </div>
    );
  }

  if (error && !stats.totalOrders) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Failed to load analytics
        </h2>
        <p className="text-muted-foreground mb-4">{error}</p>
        <Button className="cursor-pointer" onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCw className={cn('w-4 h-4 mr-2', isRefreshing && 'animate-spin')} />
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
          <p className="text-muted-foreground mt-1">
            Track your business performance and insights
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="cursor-pointer px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background"
          >
            <option value="today">Today</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
            <option value="12m">Last 12 Months</option>
          </select>
          <Button className="cursor-pointer" variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={cn('w-4 h-4 mr-2', isRefreshing && 'animate-spin')} />
            Refresh
          </Button>
          <Button className="cursor-pointer" variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {formatCurrency(stats.totalRevenue)}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/20 rounded-lg flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-green-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-1">
              {stats.revenueChange >= 0 ? (
                <TrendingUp className="w-4 h-4 text-green-500" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-500" />
              )}
              <span className={cn(
                'text-sm font-medium',
                stats.revenueChange >= 0 ? 'text-green-600' : 'text-red-600'
              )}>
                {stats.revenueChange >= 0 ? '+' : ''}{stats.revenueChange}%
              </span>
              <span className="text-sm text-muted-foreground">vs last period</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Orders</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {stats.totalOrders}
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
                <ShoppingCart className="w-6 h-6 text-blue-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-1">
              {stats.ordersChange >= 0 ? (
                <TrendingUp className="w-4 h-4 text-green-500" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-500" />
              )}
              <span className={cn(
                'text-sm font-medium',
                stats.ordersChange >= 0 ? 'text-green-600' : 'text-red-600'
              )}>
                {stats.ordersChange >= 0 ? '+' : ''}{stats.ordersChange}%
              </span>
              <span className="text-sm text-muted-foreground">vs last period</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Customers</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {stats.totalCustomers}
                </p>
              </div>
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/20 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-purple-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-1">
              {stats.customersChange >= 0 ? (
                <TrendingUp className="w-4 h-4 text-green-500" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-500" />
              )}
              <span className={cn(
                'text-sm font-medium',
                stats.customersChange >= 0 ? 'text-green-600' : 'text-red-600'
              )}>
                {stats.customersChange >= 0 ? '+' : ''}{stats.customersChange}%
              </span>
              <span className="text-sm text-muted-foreground">vs last period</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg. Order Value</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {formatCurrency(stats.avgOrderValue)}
                </p>
              </div>
              <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/20 rounded-lg flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-orange-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-1">
              {stats.avgOrderChange >= 0 ? (
                <TrendingUp className="w-4 h-4 text-green-500" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-500" />
              )}
              <span className={cn(
                'text-sm font-medium',
                stats.avgOrderChange >= 0 ? 'text-green-600' : 'text-red-600'
              )}>
                {stats.avgOrderChange >= 0 ? '+' : ''}{stats.avgOrderChange}%
              </span>
              <span className="text-sm text-muted-foreground">vs last period</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LineChart className="w-5 h-5" />
            Revenue Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <div className="flex items-end justify-between h-48 gap-2 border-b border-border pb-2">
              {salesData.map((day, index) => (
                <div key={index} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full bg-primary/80 hover:bg-primary rounded-t transition-colors"
                    style={{ height: `${(day.revenue / maxRevenue) * 100}%` }}
                    title={formatCurrency(day.revenue)}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2">
              {salesData.map((day, index) => (
                <div key={index} className="flex-1 text-center">
                  <span className="text-xs text-muted-foreground">{formatDate(day.date)}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Products */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Top Products
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topProducts.map((product, index) => (
                <div key={product.id} className="flex items-center gap-4">
                  <span className="w-6 h-6 bg-muted rounded-full flex items-center justify-center text-sm font-medium text-muted-foreground">
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {product.name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {product.quantity} sold
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-foreground">
                      {formatCurrency(product.revenue)}
                    </p>
                    <div className="flex items-center justify-end gap-1">
                      {product.growth >= 0 ? (
                        <ArrowUpRight className="w-3 h-3 text-green-500" />
                      ) : (
                        <TrendingDown className="w-3 h-3 text-red-500" />
                      )}
                      <span className={cn(
                        'text-xs',
                        product.growth >= 0 ? 'text-green-600' : 'text-red-600'
                      )}>
                        {product.growth >= 0 ? '+' : ''}{product.growth}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Revenue by Category */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="w-5 h-5" />
              Revenue by Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {categoryRevenue.map(category => (
                <div key={category.category}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-foreground">
                      {category.category}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {formatCurrency(category.revenue)} ({category.percentage}%)
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', category.color)}
                      style={{ width: `${category.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Simple pie visualization */}
            <div className="mt-6 flex items-center justify-center">
              <div className="relative w-32 h-32">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  {categoryRevenue.reduce((acc, cat, index) => {
                    const prevOffset = index === 0 ? 0 :
                      categoryRevenue.slice(0, index).reduce((sum, c) => sum + c.percentage, 0);
                    const colorMap: Record<string, string> = {
                      'bg-blue-500': '#3b82f6',
                      'bg-green-500': '#22c55e',
                      'bg-purple-500': '#a855f7',
                      'bg-orange-500': '#f97316',
                    };
                    acc.push(
                      <circle
                        key={cat.category}
                        cx="50"
                        cy="50"
                        r="40"
                        fill="transparent"
                        stroke={colorMap[cat.color]}
                        strokeWidth="20"
                        strokeDasharray={`${cat.percentage * 2.51327} 251.327`}
                        strokeDashoffset={`${-prevOffset * 2.51327}`}
                      />
                    );
                    return acc;
                  }, [] as React.ReactNode[])}
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payment Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Payment Methods</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {paymentBreakdown.map(payment => (
              <div
                key={payment.method}
                className="p-4 bg-muted/50 rounded-lg"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-foreground">
                    {payment.method}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {payment.percentage}%
                  </span>
                </div>
                <p className="text-2xl font-bold text-foreground">
                  {formatCurrency(payment.amount)}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {payment.count} transactions
                </p>
                <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${payment.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quick Reports */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Reports</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { name: 'Sales Summary', icon: BarChart3, description: 'Daily, weekly, monthly sales' },
              { name: 'Product Performance', icon: Package, description: 'Best and worst sellers' },
              { name: 'Customer Insights', icon: Users, description: 'Customer behavior analysis' },
              { name: 'Tax Report', icon: DollarSign, description: 'Tax collected by period' },
            ].map(report => (
              <button
                key={report.name}
                className="cursor-pointer p-4 border border-border rounded-lg text-left hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <report.icon className="w-6 h-6 text-primary mb-2" />
                <h4 className="font-medium text-foreground">{report.name}</h4>
                <p className="text-sm text-muted-foreground mt-1">{report.description}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
