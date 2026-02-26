'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  DollarSign,
  ShoppingCart,
  Users,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  ArrowUpRight,
  Package,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';

interface DashboardStats {
  todaySales: number;
  todayOrders: number;
  todayCustomers: number;
  lowStockItems: number;
  salesChange: number;
  ordersChange: number;
  customersChange: number;
}

interface RecentOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  total: number;
  status: string;
  createdAt: string;
}

interface TopProduct {
  id: string;
  name: string;
  soldQuantity: number;
  revenue: number;
}

const statusStyles: Record<string, string> = {
  completed: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  preparing: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  ready: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  pending: 'bg-muted text-muted-foreground',
  cancelled: 'bg-destructive/10 text-destructive',
};

export default function DashboardPage() {
  const user = useAuthStore(s => s.user);
  const tenant = useAuthStore(s => s.tenant);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [dashboardData, recentOrdersData, topProductsData] = await Promise.allSettled([
          apiClient.getDashboardData(),
          apiClient.getRecentOrders(5),
          apiClient.getTopProducts('day', 5),
        ]);

        if (dashboardData.status === 'fulfilled' && dashboardData.value) {
          const data = dashboardData.value as any;
          setStats({
            todaySales: data.todaySales || 0,
            todayOrders: data.todayOrders || 0,
            todayCustomers: data.todayCustomers || 0,
            lowStockItems: data.lowStockItems || 0,
            salesChange: data.salesChange || 0,
            ordersChange: data.ordersChange || 0,
            customersChange: data.customersChange || 0,
          });
        } else {
          setStats({
            todaySales: 0, todayOrders: 0, todayCustomers: 0,
            lowStockItems: 0, salesChange: 0, ordersChange: 0, customersChange: 0,
          });
        }

        if (recentOrdersData.status === 'fulfilled' && Array.isArray(recentOrdersData.value)) {
          setRecentOrders(recentOrdersData.value.map((order: any) => ({
            id: order.id || order._id,
            orderNumber: order.orderNumber,
            customerName: order.customer?.name || 'Walk-in Customer',
            total: order.total || 0,
            status: order.status || 'pending',
            createdAt: order.createdAt,
          })));
        } else {
          setRecentOrders([]);
        }

        if (topProductsData.status === 'fulfilled' && Array.isArray(topProductsData.value)) {
          setTopProducts(topProductsData.value.map((product: any) => ({
            id: product.id || product._id || product.productId,
            name: product.name || product.productName,
            soldQuantity: product.soldQuantity || product.quantity || 0,
            revenue: product.revenue || product.totalRevenue || 0,
          })));
        } else {
          setTopProducts([]);
        }
      } catch (error) {
        setStats({
          todaySales: 0, todayOrders: 0, todayCustomers: 0,
          lowStockItems: 0, salesChange: 0, ordersChange: 0, customersChange: 0,
        });
        setRecentOrders([]);
        setTopProducts([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-muted rounded-lg w-1/3" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-[140px] bg-muted rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-[400px] bg-muted rounded-xl" />
          <div className="h-[400px] bg-muted rounded-xl" />
        </div>
      </div>
    );
  }

  const statCards = [
    {
      title: "Today's Sales",
      value: `$${(stats?.todaySales ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      change: stats?.salesChange ?? 0,
      icon: DollarSign,
      gradient: 'stat-gradient-green',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      iconBg: 'bg-emerald-500/10',
    },
    {
      title: 'Total Orders',
      value: (stats?.todayOrders ?? 0).toString(),
      change: stats?.ordersChange ?? 0,
      icon: ShoppingCart,
      gradient: 'stat-gradient-blue',
      iconColor: 'text-primary',
      iconBg: 'bg-primary/10',
    },
    {
      title: 'Customers',
      value: (stats?.todayCustomers ?? 0).toString(),
      change: stats?.customersChange ?? 0,
      icon: Users,
      gradient: 'stat-gradient-purple',
      iconColor: 'text-violet-600 dark:text-violet-400',
      iconBg: 'bg-violet-500/10',
    },
    {
      title: 'Low Stock',
      value: (stats?.lowStockItems ?? 0).toString(),
      icon: AlertTriangle,
      gradient: 'stat-gradient-amber',
      iconColor: 'text-amber-600 dark:text-amber-400',
      iconBg: 'bg-amber-500/10',
      alert: (stats?.lowStockItems ?? 0) > 0,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            {greeting()}, {user?.firstName}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Here's what's happening at {tenant?.name} today.
          </p>
        </div>
        <Link href="/pos">
          <Button size="lg" className="shadow-sm cursor-pointer">
            <Zap className="w-4 h-4 mr-2" />
            Open POS
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card
            key={stat.title}
            className={cn(
              'relative overflow-hidden border transition-shadow hover:shadow-md',
              stat.gradient,
              stat.alert && 'border-amber-300 dark:border-amber-700'
            )}
            size="none"
          >
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                  <p className="text-2xl font-semibold text-foreground tracking-tight">{stat.value}</p>
                  {stat.change !== undefined && (
                    <div className={cn(
                      'flex items-center gap-1 text-xs font-medium',
                      stat.change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
                    )}>
                      {stat.change >= 0 ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                      <span>{stat.change >= 0 ? '+' : ''}{stat.change.toFixed(1)}%</span>
                      <span className="text-muted-foreground font-normal">vs yesterday</span>
                    </div>
                  )}
                </div>
                <div className={cn('p-2.5 rounded-xl', stat.iconBg)}>
                  <stat.icon className={cn('w-5 h-5', stat.iconColor)} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Orders */}
        <Card className="lg:col-span-2" size="none">
          <CardHeader className="flex flex-row items-center justify-between p-5 pb-0">
            <CardTitle className="text-base font-semibold">Recent Orders</CardTitle>
            <Link href="/orders">
              <Button variant="ghost" size="sm" className="text-xs cursor-pointer">
                View all <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-5">
            {recentOrders.length === 0 ? (
              <div className="py-12 text-center">
                <ShoppingCart className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No recent orders</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentOrders.map((order) => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                        <ShoppingCart className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {order.orderNumber}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{order.customerName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className={cn(
                        'text-[11px] font-medium px-2 py-1 rounded-md capitalize',
                        statusStyles[order.status] || statusStyles.pending
                      )}>
                        {order.status}
                      </span>
                      <p className="text-sm font-semibold text-foreground w-20 text-right">
                        ${order.total.toFixed(2)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Selling Products */}
        <Card size="none">
          <CardHeader className="flex flex-row items-center justify-between p-5 pb-0">
            <CardTitle className="text-base font-semibold">Top Products</CardTitle>
            <Link href="/products">
              <Button variant="ghost" size="sm" className="text-xs cursor-pointer">
                View all <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-5">
            {topProducts.length === 0 ? (
              <div className="py-12 text-center">
                <Package className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No product data yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {topProducts.map((product, index) => (
                  <div key={product.id} className="flex items-center gap-3">
                    <div className={cn(
                      'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0',
                      index === 0 ? 'bg-primary/10 text-primary' :
                      index === 1 ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400' :
                      'bg-muted text-muted-foreground'
                    )}>
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {product.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {product.soldQuantity} sold
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-foreground">
                      ${product.revenue.toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card size="none">
        <CardHeader className="p-5 pb-0">
          <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { href: '/pos', icon: ShoppingCart, label: 'New Order', color: 'text-primary', bg: 'bg-primary/10' },
              { href: '/products/new', icon: Package, label: 'Add Product', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' },
              { href: '/customers/new', icon: Users, label: 'Add Customer', color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-500/10' },
              { href: '/analytics', icon: TrendingUp, label: 'View Reports', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10' },
            ].map((action) => (
              <Link key={action.href} href={action.href}>
                <button className="w-full group p-4 rounded-xl border border-border bg-card hover:bg-accent hover:shadow-sm transition-all duration-200 flex flex-col items-center gap-3 cursor-pointer">
                  <div className={cn('p-3 rounded-xl transition-colors', action.bg)}>
                    <action.icon className={cn('w-5 h-5', action.color)} />
                  </div>
                  <span className="text-sm font-medium text-foreground">{action.label}</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
