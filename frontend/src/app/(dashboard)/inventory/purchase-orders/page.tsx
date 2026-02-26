'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Search,
  Plus,
  Eye,
  Edit,
  Trash2,
  FileText,
  Truck,
  CheckCircle,
  Clock,
  XCircle,
  Download,
  Send,
  Package,
  DollarSign,
  Calendar,
  Building2,
  Printer,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useUIStore } from '@/store';
import { apiClient } from '@/lib/api-client';

interface PurchaseOrderItem {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitCost: number;
  total: number;
}

interface PurchaseOrder {
  id: string;
  orderNumber: string;
  supplierId: string;
  supplierName: string;
  status: 'draft' | 'pending' | 'approved' | 'ordered' | 'partially_received' | 'received' | 'cancelled';
  items: PurchaseOrderItem[];
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  expectedDate?: string;
  receivedDate?: string;
  notes?: string;
  createdAt: string;
  createdBy: string;
}

interface PurchaseOrderStats {
  total: number;
  pending: number;
  inTransit: number;
  totalValue: number;
}

export default function PurchaseOrdersPage() {
  const addToast = useUIStore(s => s.addToast);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [stats, setStats] = useState<PurchaseOrderStats>({ total: 0, pending: 0, inTransit: 0, totalValue: 0 });
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      setIsLoading(true);
      const params: Record<string, any> = {};
      if (selectedStatus !== 'all') {
        params.status = selectedStatus;
      }
      if (searchQuery) {
        params.search = searchQuery;
      }
      const response = await apiClient.get<any>('/inventory/purchase-orders', { params });
      const data = response.data;
      if (Array.isArray(data)) {
        setOrders(data);
      } else if (data && Array.isArray(data.purchaseOrders)) {
        setOrders(data.purchaseOrders);
      } else if (data && Array.isArray(data.items)) {
        setOrders(data.items);
      } else {
        setOrders([]);
      }
    } catch (error: any) {
      addToast({ type: 'error', title: 'Failed to load purchase orders', message: error?.message || 'An error occurred while fetching purchase orders' });
      setOrders([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedStatus, searchQuery, addToast]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await apiClient.get<any>('/inventory/purchase-orders/stats');
      if (response.data) {
        setStats({
          total: response.data.total ?? 0,
          pending: response.data.pending ?? 0,
          inTransit: response.data.inTransit ?? 0,
          totalValue: response.data.totalValue ?? 0,
        });
      }
    } catch (error: any) {
      // Stats are non-critical; compute from loaded orders as fallback
      const fallbackStats = {
        total: orders.length,
        pending: orders.filter(o => ['draft', 'pending', 'approved'].includes(o.status)).length,
        inTransit: orders.filter(o => o.status === 'ordered' || o.status === 'partially_received').length,
        totalValue: orders.filter(o => o.status !== 'cancelled').reduce((sum, o) => sum + o.total, 0),
      };
      setStats(fallbackStats);
    }
  }, [orders]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleUpdateStatus = async (orderId: string, newStatus: string) => {
    try {
      setActionLoading(orderId);
      await apiClient.put<any>(`/inventory/purchase-orders/${orderId}/status`, { status: newStatus });
      addToast({ type: 'success', title: 'Status updated', message: `Purchase order status changed to ${newStatus}` });
      await fetchOrders();
      await fetchStats();
      // Update selectedOrder if it was the one modified
      if (selectedOrder && selectedOrder.id === orderId) {
        try {
          const detailResponse = await apiClient.get<any>(`/inventory/purchase-orders/${orderId}`);
          if (detailResponse.data) {
            setSelectedOrder(detailResponse.data);
          }
        } catch {
          setSelectedOrder(null);
        }
      }
    } catch (error: any) {
      addToast({ type: 'error', title: 'Failed to update status', message: error?.message || 'Could not update purchase order status' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReceiveOrder = async (orderId: string) => {
    try {
      setActionLoading(orderId);
      await apiClient.post<any>(`/inventory/purchase-orders/${orderId}/receive`, {});
      addToast({ type: 'success', title: 'Order received', message: 'Purchase order has been marked as received' });
      await fetchOrders();
      await fetchStats();
      if (selectedOrder && selectedOrder.id === orderId) {
        try {
          const detailResponse = await apiClient.get<any>(`/inventory/purchase-orders/${orderId}`);
          if (detailResponse.data) {
            setSelectedOrder(detailResponse.data);
          }
        } catch {
          setSelectedOrder(null);
        }
      }
    } catch (error: any) {
      addToast({ type: 'error', title: 'Failed to receive order', message: error?.message || 'Could not mark purchase order as received' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    try {
      setActionLoading(orderId);
      await apiClient.post<any>(`/inventory/purchase-orders/${orderId}/cancel`, {});
      addToast({ type: 'success', title: 'Order cancelled', message: 'Purchase order has been cancelled' });
      await fetchOrders();
      await fetchStats();
      if (selectedOrder && selectedOrder.id === orderId) {
        try {
          const detailResponse = await apiClient.get<any>(`/inventory/purchase-orders/${orderId}`);
          if (detailResponse.data) {
            setSelectedOrder(detailResponse.data);
          }
        } catch {
          setSelectedOrder(null);
        }
      }
    } catch (error: any) {
      addToast({ type: 'error', title: 'Failed to cancel order', message: error?.message || 'Could not cancel purchase order' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendToSupplier = async (orderId: string) => {
    // Sending to supplier transitions draft -> pending (or ordered depending on workflow)
    await handleUpdateStatus(orderId, 'pending');
  };

  const handleViewOrder = async (orderId: string) => {
    try {
      const response = await apiClient.get<any>(`/inventory/purchase-orders/${orderId}`);
      if (response.data) {
        setSelectedOrder(response.data);
      }
    } catch (error: any) {
      addToast({ type: 'error', title: 'Failed to load order details', message: error?.message || 'Could not load purchase order details' });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'draft': return <FileText className="w-4 h-4" />;
      case 'pending': return <Send className="w-4 h-4" />;
      case 'approved': return <CheckCircle className="w-4 h-4" />;
      case 'ordered': return <Truck className="w-4 h-4" />;
      case 'partially_received': return <Package className="w-4 h-4" />;
      case 'received': return <Package className="w-4 h-4" />;
      case 'cancelled': return <XCircle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-muted text-muted-foreground';
      case 'pending': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
      case 'approved': return 'bg-purple-500/10 text-purple-600 dark:text-purple-400';
      case 'ordered': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
      case 'partially_received': return 'bg-orange-500/10 text-orange-600 dark:text-orange-400';
      case 'received': return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
      case 'cancelled': return 'bg-destructive/10 text-destructive';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const filteredOrders = orders.filter(order => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!order.orderNumber.toLowerCase().includes(query) &&
          !order.supplierName.toLowerCase().includes(query)) {
        return false;
      }
    }
    if (selectedStatus !== 'all' && order.status !== selectedStatus) {
      return false;
    }
    return true;
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatStatus = (status: string) => {
    return status.replace(/_/g, ' ');
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-muted rounded w-1/4" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/inventory">
          <Button variant="ghost" size="sm" className="cursor-pointer">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">Purchase Orders</h1>
          <p className="text-muted-foreground mt-1">
            Manage inventory procurement
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} className="cursor-pointer">
          <Plus className="w-4 h-4 mr-2" />
          Create Order
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Orders</p>
                <p className="text-xl font-bold text-foreground">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-100 dark:bg-yellow-900/20 rounded-lg flex items-center justify-center">
                <Clock className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-xl font-bold text-foreground">{stats.pending}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/20 rounded-lg flex items-center justify-center">
                <Truck className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">In Transit</p>
                <p className="text-xl font-bold text-foreground">{stats.inTransit}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 dark:bg-green-900/20 rounded-lg flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Value</p>
                <p className="text-xl font-bold text-foreground">{formatCurrency(stats.totalValue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by order number or supplier..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-border rounded-lg bg-background text-foreground"
              />
            </div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-3 py-2 border border-border rounded-lg bg-background text-foreground cursor-pointer"
            >
              <option value="all">All Status</option>
              <option value="draft">Draft</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="ordered">Ordered</option>
              <option value="partially_received">Partially Received</option>
              <option value="received">Received</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="p-4 text-left text-sm font-medium text-muted-foreground">Order #</th>
                  <th className="p-4 text-left text-sm font-medium text-muted-foreground">Supplier</th>
                  <th className="p-4 text-left text-sm font-medium text-muted-foreground">Items</th>
                  <th className="p-4 text-left text-sm font-medium text-muted-foreground">Total</th>
                  <th className="p-4 text-left text-sm font-medium text-muted-foreground">Status</th>
                  <th className="p-4 text-left text-sm font-medium text-muted-foreground">Expected</th>
                  <th className="p-4 text-left text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map(order => (
                  <tr
                    key={order.id}
                    className="border-b border-border hover:bg-muted/50 cursor-pointer"
                    onClick={() => handleViewOrder(order.id)}
                  >
                    <td className="p-4 font-medium text-foreground">{order.orderNumber}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        <span className="text-muted-foreground">{order.supplierName}</span>
                      </div>
                    </td>
                    <td className="p-4 text-muted-foreground">{order.items?.length ?? 0} items</td>
                    <td className="p-4 font-medium text-foreground">{formatCurrency(order.total)}</td>
                    <td className="p-4">
                      <span className={cn('inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full capitalize', getStatusColor(order.status))}>
                        {getStatusIcon(order.status)}
                        {formatStatus(order.status)}
                      </span>
                    </td>
                    <td className="p-4 text-muted-foreground">{formatDate(order.expectedDate)}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <button
                          className="p-1 hover:bg-accent rounded cursor-pointer"
                          onClick={() => handleViewOrder(order.id)}
                        >
                          <Eye className="w-4 h-4 text-muted-foreground" />
                        </button>
                        <button className="p-1 hover:bg-accent rounded cursor-pointer"><Printer className="w-4 h-4 text-muted-foreground" /></button>
                        {order.status === 'draft' && (
                          <button className="p-1 hover:bg-accent rounded cursor-pointer"><Edit className="w-4 h-4 text-muted-foreground" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedOrder(null)}>
          <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>{selectedOrder.orderNumber}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">Created {formatDate(selectedOrder.createdAt)} by {selectedOrder.createdBy}</p>
              </div>
              <span className={cn('inline-flex items-center gap-1 px-3 py-1 rounded-full capitalize', getStatusColor(selectedOrder.status))}>
                {getStatusIcon(selectedOrder.status)}
                {formatStatus(selectedOrder.status)}
              </span>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Supplier</p>
                  <p className="font-medium">{selectedOrder.supplierName}</p>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Expected Delivery</p>
                  <p className="font-medium">{formatDate(selectedOrder.expectedDate)}</p>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-3">Order Items</h4>
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-muted">
                      <tr>
                        <th className="p-3 text-left text-sm font-medium text-muted-foreground">Product</th>
                        <th className="p-3 text-left text-sm font-medium text-muted-foreground">SKU</th>
                        <th className="p-3 text-right text-sm font-medium text-muted-foreground">Qty</th>
                        <th className="p-3 text-right text-sm font-medium text-muted-foreground">Unit Cost</th>
                        <th className="p-3 text-right text-sm font-medium text-muted-foreground">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedOrder.items || []).map((item, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="p-3 font-medium">{item.productName}</td>
                          <td className="p-3 text-muted-foreground">{item.sku}</td>
                          <td className="p-3 text-right">{item.quantity}</td>
                          <td className="p-3 text-right">{formatCurrency(item.unitCost)}</td>
                          <td className="p-3 text-right font-medium">{formatCurrency(item.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end">
                <div className="w-64 space-y-2">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(selectedOrder.subtotal)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{formatCurrency(selectedOrder.tax)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Shipping</span><span>{formatCurrency(selectedOrder.shipping)}</span></div>
                  <div className="flex justify-between font-bold text-lg pt-2 border-t"><span>Total</span><span>{formatCurrency(selectedOrder.total)}</span></div>
                </div>
              </div>

              <div className="flex gap-2 pt-4 border-t">
                <Button variant="outline" className="flex-1 cursor-pointer" onClick={() => setSelectedOrder(null)}>Close</Button>
                {selectedOrder.status === 'draft' && (
                  <Button
                    className="flex-1 cursor-pointer"
                    disabled={actionLoading === selectedOrder.id}
                    onClick={() => handleSendToSupplier(selectedOrder.id)}
                  >
                    <Send className="w-4 h-4 mr-2" />
                    {actionLoading === selectedOrder.id ? 'Sending...' : 'Send to Supplier'}
                  </Button>
                )}
                {(selectedOrder.status === 'ordered' || selectedOrder.status === 'partially_received') && (
                  <Button
                    className="flex-1 cursor-pointer"
                    disabled={actionLoading === selectedOrder.id}
                    onClick={() => handleReceiveOrder(selectedOrder.id)}
                  >
                    <Package className="w-4 h-4 mr-2" />
                    {actionLoading === selectedOrder.id ? 'Processing...' : 'Mark as Received'}
                  </Button>
                )}
                {selectedOrder.status !== 'received' && selectedOrder.status !== 'cancelled' && (
                  <Button
                    variant="destructive"
                    className="cursor-pointer"
                    disabled={actionLoading === selectedOrder.id}
                    onClick={() => handleCancelOrder(selectedOrder.id)}
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    {actionLoading === selectedOrder.id ? 'Cancelling...' : 'Cancel'}
                  </Button>
                )}
                <Button variant="outline" className="cursor-pointer"><Printer className="w-4 h-4 mr-2" />Print</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {filteredOrders.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No purchase orders found</h3>
            <Button onClick={() => setShowCreateModal(true)} className="cursor-pointer"><Plus className="w-4 h-4 mr-2" />Create Order</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
