'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Search,
  Filter,
  Eye,
  Printer,
  MoreVertical,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
  Download,
  Calendar,
  ChevronDown,
  ShoppingBag,
  Loader2,
  ArrowUpDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Pagination } from '@/components/ui/Pagination';
import { SkeletonOrders } from '@/components/ui/Skeleton';
import { BulkActionBar } from '@/components/ui/BulkActionBar';
import { apiClient } from '@/lib/api-client';
import { toast } from '@/store/ui';

interface Order {
  id: string;
  orderNumber: string;
  customer: {
    name: string;
    email: string;
    phone?: string;
  };
  items: {
    name: string;
    quantity: number;
    price: number;
  }[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  status: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled' | 'refunded';
  paymentMethod: 'cash' | 'card' | 'online';
  paymentStatus: 'paid' | 'pending' | 'refunded';
  createdAt: string;
  completedAt?: string;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedPayment, setSelectedPayment] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('today');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Action loading states
  const [printingOrderId, setPrintingOrderId] = useState<string | null>(null);
  const [updatingStatusOrderId, setUpdatingStatusOrderId] = useState<string | null>(null);
  const [refundingOrderId, setRefundingOrderId] = useState<string | null>(null);

  // Status update dropdown
  const [statusDropdownOrderId, setStatusDropdownOrderId] = useState<string | null>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  // Close status dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setStatusDropdownOrderId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Calculate date range for API query
  const getDateRangeParams = useCallback(() => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (dateRange) {
      case 'today':
        return { startDate: startOfDay.toISOString() };
      case 'yesterday':
        const yesterday = new Date(startOfDay);
        yesterday.setDate(yesterday.getDate() - 1);
        return {
          startDate: yesterday.toISOString(),
          endDate: startOfDay.toISOString(),
        };
      case 'week':
        const weekAgo = new Date(startOfDay);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return { startDate: weekAgo.toISOString() };
      case 'month':
        const monthAgo = new Date(startOfDay);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        return { startDate: monthAgo.toISOString() };
      default:
        return {};
    }
  }, [dateRange]);

  // Fetch orders from API
  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    try {
      const dateParams = getDateRangeParams();
      const query: any = {
        ...dateParams,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        limit: 100,
      };

      if (selectedStatus !== 'all') {
        query.status = selectedStatus;
      }
      if (selectedPayment !== 'all') {
        query.paymentMethod = selectedPayment;
      }

      const response = await apiClient.getOrders(query);

      if (Array.isArray(response)) {
        setOrders(response.map((order: any) => ({
          id: order.id || order._id,
          orderNumber: order.orderNumber,
          customer: {
            name: order.customer?.name || 'Walk-in Customer',
            email: order.customer?.email || '',
            phone: order.customer?.phone,
          },
          items: (order.items || []).map((item: any) => ({
            name: item.name || item.productName,
            quantity: item.quantity || 1,
            price: item.unitPrice || item.price || 0,
          })),
          subtotal: order.subtotal || 0,
          tax: order.tax || 0,
          discount: order.discount || 0,
          total: order.total || 0,
          status: order.status || 'pending',
          paymentMethod: order.paymentMethod || 'cash',
          paymentStatus: order.paymentStatus || 'pending',
          createdAt: order.createdAt,
          completedAt: order.completedAt,
        })));
      } else {
        setOrders([]);
      }
    } catch (error) {
      toast.error('Failed to load orders', 'Please try again later.');
      setOrders([]);
    } finally {
      setIsLoading(false);
    }
  }, [getDateRangeParams, selectedStatus, selectedPayment]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // --- Print Receipt ---
  const handlePrintReceipt = async (orderId: string) => {
    setPrintingOrderId(orderId);
    try {
      const response = await apiClient.get<{ html?: string; receiptUrl?: string }>(`/orders/${orderId}/receipt`);
      const data = response.data;

      // Open a print window with the receipt content
      const printWindow = window.open('', '_blank', 'width=400,height=600');
      if (printWindow) {
        if (data?.html) {
          printWindow.document.write(data.html);
        } else if (data?.receiptUrl) {
          printWindow.location.href = data.receiptUrl;
        } else {
          // Fallback: generate a basic receipt from order data
          const order = orders.find(o => o.id === orderId) || selectedOrder;
          if (order) {
            const receiptHtml = generateReceiptHtml(order);
            printWindow.document.write(receiptHtml);
          }
        }
        printWindow.document.close();
        printWindow.focus();
        // Give the content time to render before printing
        setTimeout(() => {
          printWindow.print();
        }, 250);
      } else {
        toast.warning('Pop-up blocked', 'Please allow pop-ups to print receipts.');
      }
      toast.success('Receipt ready', 'The print dialog should open shortly.');
    } catch (error: any) {
      // Fallback: try to print from local data
      const order = orders.find(o => o.id === orderId) || selectedOrder;
      if (order) {
        const printWindow = window.open('', '_blank', 'width=400,height=600');
        if (printWindow) {
          printWindow.document.write(generateReceiptHtml(order));
          printWindow.document.close();
          printWindow.focus();
          setTimeout(() => printWindow.print(), 250);
        }
      } else {
        toast.error('Print failed', error.message || 'Could not generate receipt.');
      }
    } finally {
      setPrintingOrderId(null);
    }
  };

  // Generate a basic receipt HTML from order data
  const generateReceiptHtml = (order: Order): string => {
    const itemsHtml = order.items.map(item =>
      `<tr>
        <td style="padding:4px 0">${item.name}</td>
        <td style="padding:4px 8px;text-align:center">${item.quantity}</td>
        <td style="padding:4px 0;text-align:right">$${(item.price * item.quantity).toFixed(2)}</td>
      </tr>`
    ).join('');

    return `<!DOCTYPE html>
<html>
<head><title>Receipt - ${order.orderNumber}</title>
<style>
  body { font-family: monospace; max-width: 300px; margin: 0 auto; padding: 20px; font-size: 12px; }
  h2 { text-align: center; margin-bottom: 4px; }
  .divider { border-top: 1px dashed #333; margin: 8px 0; }
  table { width: 100%; border-collapse: collapse; }
  .total { font-weight: bold; font-size: 14px; }
  .footer { text-align: center; margin-top: 16px; font-size: 11px; color: #666; }
</style>
</head>
<body>
  <h2>Receipt</h2>
  <p style="text-align:center">Order: ${order.orderNumber}</p>
  <p style="text-align:center">${new Date(order.createdAt).toLocaleString()}</p>
  <div class="divider"></div>
  <p><strong>Customer:</strong> ${order.customer.name}</p>
  <div class="divider"></div>
  <table>
    <thead><tr><th style="text-align:left">Item</th><th>Qty</th><th style="text-align:right">Total</th></tr></thead>
    <tbody>${itemsHtml}</tbody>
  </table>
  <div class="divider"></div>
  <table>
    <tr><td>Subtotal</td><td style="text-align:right">$${order.subtotal.toFixed(2)}</td></tr>
    <tr><td>Tax</td><td style="text-align:right">$${order.tax.toFixed(2)}</td></tr>
    ${order.discount > 0 ? `<tr><td>Discount</td><td style="text-align:right">-$${order.discount.toFixed(2)}</td></tr>` : ''}
    <tr class="total"><td>Total</td><td style="text-align:right">$${order.total.toFixed(2)}</td></tr>
  </table>
  <div class="divider"></div>
  <p>Payment: ${order.paymentMethod.toUpperCase()} - ${order.paymentStatus.toUpperCase()}</p>
  <p class="footer">Thank you for your purchase!</p>
</body>
</html>`;
  };

  // --- Update Status ---
  const handleUpdateStatus = async (orderId: string, newStatus: string) => {
    setUpdatingStatusOrderId(orderId);
    setStatusDropdownOrderId(null);
    try {
      await apiClient.put(`/orders/${orderId}/status`, { status: newStatus });
      toast.success('Status updated', `Order status changed to "${newStatus}".`);

      // Update the order in local state
      setOrders(prev => prev.map(o =>
        o.id === orderId ? { ...o, status: newStatus as Order['status'] } : o
      ));

      // Update selected order if it's the same one
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(prev => prev ? { ...prev, status: newStatus as Order['status'] } : null);
      }
    } catch (error: any) {
      toast.error('Status update failed', error.message || 'Could not update the order status. Please try again.');
    } finally {
      setUpdatingStatusOrderId(null);
    }
  };

  // --- Refund Order ---
  const handleRefundOrder = async (orderId: string) => {
    const order = orders.find(o => o.id === orderId) || selectedOrder;
    const orderLabel = order?.orderNumber || orderId;

    const confirmed = window.confirm(
      `Are you sure you want to refund order ${orderLabel} ($${order?.total.toFixed(2) || '?'})? This action cannot be undone.`
    );
    if (!confirmed) return;

    const reason = window.prompt('Enter refund reason (optional):') || 'Customer requested refund';

    setRefundingOrderId(orderId);
    try {
      await apiClient.post(`/orders/${orderId}/refund`, { reason });
      toast.success('Refund processed', `Order ${orderLabel} has been refunded.`);

      // Update local state
      setOrders(prev => prev.map(o =>
        o.id === orderId ? { ...o, status: 'refunded' as const, paymentStatus: 'refunded' as const } : o
      ));

      if (selectedOrder?.id === orderId) {
        setSelectedOrder(prev => prev ? { ...prev, status: 'refunded', paymentStatus: 'refunded' } : null);
      }
    } catch (error: any) {
      toast.error('Refund failed', error.message || 'Could not process the refund. Please try again.');
    } finally {
      setRefundingOrderId(null);
    }
  };

  // --- Export All Orders ---
  const handleExportOrders = async () => {
    try {
      const dateParams = getDateRangeParams();
      const query: any = {
        ...dateParams,
        format: 'csv',
      };
      if (selectedStatus !== 'all') query.status = selectedStatus;
      if (selectedPayment !== 'all') query.paymentMethod = selectedPayment;

      const response = await apiClient.get<string>('/orders/export', { params: query });
      const csvData = response.data || '';
      const blob = new Blob([csvData], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `orders-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Export complete', 'Orders exported successfully.');
    } catch (error: any) {
      toast.error('Export failed', error.message || 'Could not export orders. Please try again.');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock className="w-4 h-4" />;
      case 'preparing': return <RefreshCw className="w-4 h-4 animate-spin" />;
      case 'ready': return <CheckCircle className="w-4 h-4" />;
      case 'completed': return <CheckCircle className="w-4 h-4" />;
      case 'cancelled': return <XCircle className="w-4 h-4" />;
      case 'refunded': return <RefreshCw className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
      case 'preparing': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 dark:text-blue-400';
      case 'ready': return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
      case 'completed': return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
      case 'cancelled': return 'bg-destructive/10 text-destructive';
      case 'refunded': return 'bg-violet-500/10 text-violet-600 dark:text-violet-400';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getPaymentBadge = (method: string) => {
    switch (method) {
      case 'cash': return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
      case 'card': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 dark:text-blue-400';
      case 'online': return 'bg-violet-500/10 text-violet-600 dark:text-violet-400';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const toggleSelectAll = () => {
    if (selectedOrders.length === filteredOrders.length) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(filteredOrders.map(o => o.id));
    }
  };

  const toggleSelectOrder = (id: string) => {
    setSelectedOrders(prev =>
      prev.includes(id) ? prev.filter(o => o !== id) : [...prev, id]
    );
  };

  const handleBulkStatus = async () => {
    const status = window.prompt(
      'Enter new status (pending, preparing, ready, completed, cancelled, refunded):'
    );
    if (!status) return;

    const validStatuses = ['pending', 'preparing', 'ready', 'completed', 'cancelled', 'refunded'];
    if (!validStatuses.includes(status)) {
      toast.error('Invalid status', `"${status}" is not a valid order status.`);
      return;
    }

    setBulkLoading(true);
    try {
      await apiClient.post('/orders/bulk-status', {
        orderIds: selectedOrders,
        status,
      });
      toast.success('Orders updated', `Successfully updated ${selectedOrders.length} orders to "${status}".`);
      setSelectedOrders([]);
      fetchOrders();
    } catch (error) {
      toast.error('Status update failed', 'Could not update the selected orders. Please try again.');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkCancel = async () => {
    const confirmed = window.confirm(
      `Are you sure you want to cancel ${selectedOrders.length} order(s)? This action cannot be undone.`
    );
    if (!confirmed) return;

    const reason = window.prompt('Enter cancellation reason (optional):') || 'Bulk cancellation';

    setBulkLoading(true);
    try {
      await apiClient.post('/orders/bulk-cancel', {
        orderIds: selectedOrders,
        reason,
      });
      toast.success('Orders cancelled', `Successfully cancelled ${selectedOrders.length} orders.`);
      setSelectedOrders([]);
      fetchOrders();
    } catch (error) {
      toast.error('Cancellation failed', 'Could not cancel the selected orders. Please try again.');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkExport = async () => {
    setBulkLoading(true);
    try {
      const response = await apiClient.post<string>('/orders/bulk-export', {
        orderIds: selectedOrders,
      });
      const csvData = response.data || '';
      const blob = new Blob([csvData], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `orders-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Export complete', `Exported ${selectedOrders.length} orders.`);
      setSelectedOrders([]);
    } catch (error) {
      toast.error('Export failed', 'Could not export the selected orders. Please try again.');
    } finally {
      setBulkLoading(false);
    }
  };

  const filteredOrders = orders.filter(order => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!order.orderNumber.toLowerCase().includes(query) &&
          !order.customer.name.toLowerCase().includes(query) &&
          !order.customer.email.toLowerCase().includes(query)) {
        return false;
      }
    }
    if (selectedStatus !== 'all' && order.status !== selectedStatus) {
      return false;
    }
    if (selectedPayment !== 'all' && order.paymentMethod !== selectedPayment) {
      return false;
    }
    return true;
  });

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const paginatedOrders = filteredOrders.slice((page - 1) * pageSize, page * pageSize);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, selectedStatus, selectedPayment, dateRange, pageSize]);

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Stats
  const stats = {
    total: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
    preparing: orders.filter(o => o.status === 'preparing').length,
    completed: orders.filter(o => o.status === 'completed').length,
    revenue: orders.filter(o => o.paymentStatus === 'paid').reduce((sum, o) => sum + o.total, 0),
  };

  // Valid next statuses for order status transitions
  const getNextStatuses = (currentStatus: string): string[] => {
    switch (currentStatus) {
      case 'pending': return ['preparing', 'ready', 'completed', 'cancelled'];
      case 'preparing': return ['ready', 'completed', 'cancelled'];
      case 'ready': return ['completed', 'cancelled'];
      case 'completed': return [];
      case 'cancelled': return [];
      case 'refunded': return [];
      default: return [];
    }
  };

  if (isLoading) {
    return <SkeletonOrders />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Orders</h1>
          <p className="text-muted-foreground mt-1">
            Manage and track customer orders
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportOrders}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Link href="/pos">
            <Button>
              <ShoppingBag className="w-4 h-4 mr-2" />
              New Order
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <Card>
          <CardContent className="p-3 sm:p-4">
            <p className="text-xs sm:text-sm text-muted-foreground">Total Orders</p>
            <p className="text-xl sm:text-2xl font-bold text-foreground">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <p className="text-xs sm:text-sm text-muted-foreground">Pending</p>
            <p className="text-xl sm:text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <p className="text-xs sm:text-sm text-muted-foreground">Preparing</p>
            <p className="text-xl sm:text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.preparing}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <p className="text-xs sm:text-sm text-muted-foreground">Completed</p>
            <p className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.completed}</p>
          </CardContent>
        </Card>
        <Card className="col-span-2 sm:col-span-1">
          <CardContent className="p-3 sm:p-4">
            <p className="text-xs sm:text-sm text-muted-foreground">Revenue</p>
            <p className="text-xl sm:text-2xl font-bold text-foreground">${stats.revenue.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col gap-3">
            {/* Search bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search orders..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
              />
            </div>

            {/* Filter dropdowns */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="flex-1 min-w-[100px] sm:flex-none px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
              >
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="all">All Time</option>
              </select>

              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="flex-1 min-w-[100px] sm:flex-none px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="preparing">Preparing</option>
                <option value="ready">Ready</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
                <option value="refunded">Refunded</option>
              </select>

              <select
                value={selectedPayment}
                onChange={(e) => setSelectedPayment(e.target.value)}
                className="flex-1 min-w-[100px] sm:flex-none px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
              >
                <option value="all">All Payment</option>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="online">Online</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      <BulkActionBar
        selectedCount={selectedOrders.length}
        onClearSelection={() => setSelectedOrders([])}
        actions={[
          {
            label: 'Update Status',
            icon: <ArrowUpDown className="w-4 h-4" />,
            onClick: handleBulkStatus,
            disabled: bulkLoading,
          },
          {
            label: 'Cancel',
            icon: <XCircle className="w-4 h-4" />,
            onClick: handleBulkCancel,
            variant: 'destructive',
            disabled: bulkLoading,
          },
          {
            label: 'Export',
            icon: <Download className="w-4 h-4" />,
            onClick: handleBulkExport,
            disabled: bulkLoading,
          },
        ]}
      />

      {/* Orders List */}
      <Card>
        <CardContent className="p-0">
          {filteredOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ShoppingBag className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-1">No orders yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {searchQuery || selectedStatus !== 'all' || selectedPayment !== 'all'
                  ? 'Try adjusting your filters to find what you are looking for.'
                  : 'Orders will appear here when customers make purchases.'}
              </p>
              <Link href="/pos">
                <Button>
                  <ShoppingBag className="w-4 h-4 mr-2" />
                  Create New Order
                </Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="p-4 text-left">
                      <input
                        type="checkbox"
                        checked={selectedOrders.length === filteredOrders.length && filteredOrders.length > 0}
                        onChange={toggleSelectAll}
                        className="rounded border-input cursor-pointer"
                      />
                    </th>
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground">Order</th>
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground">Customer</th>
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground">Items</th>
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground">Total</th>
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground">Payment</th>
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground">Status</th>
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground">Time</th>
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedOrders.map(order => (
                    <tr
                      key={order.id}
                      className="border-b border-border hover:bg-muted/50 cursor-pointer"
                      onClick={() => setSelectedOrder(order)}
                    >
                      <td className="p-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedOrders.includes(order.id)}
                          onChange={() => toggleSelectOrder(order.id)}
                          className="rounded border-input cursor-pointer"
                        />
                      </td>
                      <td className="p-4">
                        <span className="font-medium text-foreground">{order.orderNumber}</span>
                      </td>
                      <td className="p-4">
                        <div>
                          <p className="font-medium text-foreground">{order.customer.name}</p>
                          <p className="text-sm text-muted-foreground">{order.customer.email}</p>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="text-gray-600 dark:text-muted-foreground">
                          {order.items.length} item{order.items.length > 1 ? 's' : ''}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="font-medium text-foreground">${order.total.toFixed(2)}</span>
                      </td>
                      <td className="p-4">
                        <span className={cn('text-xs px-2 py-1 rounded-full capitalize', getPaymentBadge(order.paymentMethod))}>
                          {order.paymentMethod}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={cn('inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full capitalize', getStatusColor(order.status))}>
                          {getStatusIcon(order.status)}
                          {order.status}
                        </span>
                      </td>
                      <td className="p-4">
                        <div>
                          <p className="text-foreground">{formatTime(order.createdAt)}</p>
                          <p className="text-sm text-muted-foreground">{formatDate(order.createdAt)}</p>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="p-1 hover:bg-accent rounded"
                            title="View Details"
                            onClick={() => setSelectedOrder(order)}
                          >
                            <Eye className="w-4 h-4 text-muted-foreground" />
                          </button>
                          <button
                            className="p-1 hover:bg-accent rounded"
                            title="Print Receipt"
                            disabled={printingOrderId === order.id}
                            onClick={() => handlePrintReceipt(order.id)}
                          >
                            {printingOrderId === order.id ? (
                              <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
                            ) : (
                              <Printer className="w-4 h-4 text-muted-foreground" />
                            )}
                          </button>
                          <div className="relative">
                            <button
                              className="p-1 hover:bg-accent rounded"
                              title="More Actions"
                              onClick={() => setStatusDropdownOrderId(
                                statusDropdownOrderId === order.id ? null : order.id
                              )}
                            >
                              <MoreVertical className="w-4 h-4 text-muted-foreground" />
                            </button>
                            {statusDropdownOrderId === order.id && (
                              <div
                                ref={statusDropdownRef}
                                className="absolute right-0 top-full mt-1 w-48 bg-background border border-border rounded-lg shadow-lg z-50 py-1"
                              >
                                {getNextStatuses(order.status).length > 0 && (
                                  <>
                                    <p className="px-3 py-1 text-xs text-muted-foreground font-medium">Update Status</p>
                                    {getNextStatuses(order.status).map(status => (
                                      <button
                                        key={status}
                                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent capitalize disabled:opacity-50"
                                        disabled={updatingStatusOrderId === order.id}
                                        onClick={() => handleUpdateStatus(order.id, status)}
                                      >
                                        {updatingStatusOrderId === order.id ? (
                                          <span className="flex items-center gap-2">
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                            Updating...
                                          </span>
                                        ) : (
                                          status
                                        )}
                                      </button>
                                    ))}
                                    <div className="border-t border-border my-1" />
                                  </>
                                )}
                                {order.paymentStatus === 'paid' && order.status !== 'refunded' && (
                                  <button
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent text-destructive disabled:opacity-50"
                                    disabled={refundingOrderId === order.id}
                                    onClick={() => handleRefundOrder(order.id)}
                                  >
                                    {refundingOrderId === order.id ? (
                                      <span className="flex items-center gap-2">
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                        Processing refund...
                                      </span>
                                    ) : (
                                      'Refund Order'
                                    )}
                                  </button>
                                )}
                                <button
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                                  onClick={() => {
                                    handlePrintReceipt(order.id);
                                    setStatusDropdownOrderId(null);
                                  }}
                                >
                                  Print Receipt
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {filteredOrders.length > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          totalItems={filteredOrders.length}
          itemName="orders"
        />
      )}

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedOrder(null)}>
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>{selectedOrder.orderNumber}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {formatDate(selectedOrder.createdAt)} at {formatTime(selectedOrder.createdAt)}
                </p>
              </div>
              <span className={cn('inline-flex items-center gap-1 text-sm px-3 py-1 rounded-full capitalize', getStatusColor(selectedOrder.status))}>
                {getStatusIcon(selectedOrder.status)}
                {selectedOrder.status}
              </span>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Customer Info */}
              <div>
                <h3 className="font-medium text-foreground mb-2">Customer</h3>
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="font-medium">{selectedOrder.customer.name}</p>
                  <p className="text-sm text-muted-foreground">{selectedOrder.customer.email}</p>
                  {selectedOrder.customer.phone && (
                    <p className="text-sm text-muted-foreground">{selectedOrder.customer.phone}</p>
                  )}
                </div>
              </div>

              {/* Items */}
              <div>
                <h3 className="font-medium text-foreground mb-2">Items</h3>
                <div className="space-y-2">
                  {selectedOrder.items.map((item, index) => (
                    <div key={index} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 bg-muted rounded flex items-center justify-center text-sm">
                          {item.quantity}
                        </span>
                        <span className="text-foreground">{item.name}</span>
                      </div>
                      <span className="font-medium">${(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals */}
              <div className="space-y-2 pt-4 border-t border-border">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>${selectedOrder.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax</span>
                  <span>${selectedOrder.tax.toFixed(2)}</span>
                </div>
                {selectedOrder.discount > 0 && (
                  <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-400">
                    <span>Discount</span>
                    <span>-${selectedOrder.discount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold pt-2 border-t border-border">
                  <span>Total</span>
                  <span>${selectedOrder.total.toFixed(2)}</span>
                </div>
              </div>

              {/* Payment Info */}
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Payment Method</p>
                  <p className="font-medium capitalize">{selectedOrder.paymentMethod}</p>
                </div>
                <span className={cn('text-sm px-3 py-1 rounded-full capitalize',
                  selectedOrder.paymentStatus === 'paid'
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : selectedOrder.paymentStatus === 'refunded'
                    ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                )}>
                  {selectedOrder.paymentStatus}
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={printingOrderId === selectedOrder.id}
                  onClick={() => handlePrintReceipt(selectedOrder.id)}
                >
                  {printingOrderId === selectedOrder.id ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Printer className="w-4 h-4 mr-2" />
                  )}
                  {printingOrderId === selectedOrder.id ? 'Preparing...' : 'Print Receipt'}
                </Button>
                {selectedOrder.status !== 'completed' && selectedOrder.status !== 'cancelled' && selectedOrder.status !== 'refunded' && (
                  <div className="relative flex-1">
                    <Button
                      className="w-full"
                      disabled={updatingStatusOrderId === selectedOrder.id}
                      onClick={() => setStatusDropdownOrderId(
                        statusDropdownOrderId === `modal-${selectedOrder.id}` ? null : `modal-${selectedOrder.id}`
                      )}
                    >
                      {updatingStatusOrderId === selectedOrder.id ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <ArrowUpDown className="w-4 h-4 mr-2" />
                      )}
                      {updatingStatusOrderId === selectedOrder.id ? 'Updating...' : 'Update Status'}
                    </Button>
                    {statusDropdownOrderId === `modal-${selectedOrder.id}` && (
                      <div className="absolute bottom-full left-0 mb-1 w-full bg-background border border-border rounded-lg shadow-lg z-50 py-1">
                        {getNextStatuses(selectedOrder.status).map(status => (
                          <button
                            key={status}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-accent capitalize"
                            onClick={() => handleUpdateStatus(selectedOrder.id, status)}
                          >
                            {status}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {selectedOrder.paymentStatus === 'paid' && selectedOrder.status !== 'refunded' && (
                  <Button
                    variant="outline"
                    className="text-destructive hover:text-destructive/80"
                    disabled={refundingOrderId === selectedOrder.id}
                    onClick={() => handleRefundOrder(selectedOrder.id)}
                  >
                    {refundingOrderId === selectedOrder.id ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : null}
                    {refundingOrderId === selectedOrder.id ? 'Processing...' : 'Refund'}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

    </div>
  );
}
