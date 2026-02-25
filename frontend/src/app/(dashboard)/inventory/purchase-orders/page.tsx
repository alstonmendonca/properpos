'use client';

import React, { useState, useEffect } from 'react';
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
  status: 'draft' | 'sent' | 'confirmed' | 'shipped' | 'received' | 'cancelled';
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

export default function PurchaseOrdersPage() {
  const addToast = useUIStore(s => s.addToast);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    setTimeout(() => {
      setOrders([
        {
          id: '1',
          orderNumber: 'PO-2024-001',
          supplierId: '1',
          supplierName: 'Fresh Foods Inc.',
          status: 'received',
          items: [
            { productId: '1', productName: 'Burger Patties', sku: 'MEAT-001', quantity: 100, unitCost: 3.50, total: 350 },
            { productId: '2', productName: 'Burger Buns', sku: 'BRD-001', quantity: 200, unitCost: 0.50, total: 100 },
          ],
          subtotal: 450,
          tax: 36,
          shipping: 25,
          total: 511,
          expectedDate: new Date(Date.now() - 86400000 * 5).toISOString(),
          receivedDate: new Date(Date.now() - 86400000 * 3).toISOString(),
          createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
          createdBy: 'John Doe',
        },
        {
          id: '2',
          orderNumber: 'PO-2024-002',
          supplierId: '2',
          supplierName: 'Beverage Distributors Co.',
          status: 'shipped',
          items: [
            { productId: '3', productName: 'Coca-Cola (Case)', sku: 'BEV-001', quantity: 50, unitCost: 15, total: 750 },
            { productId: '4', productName: 'Sprite (Case)', sku: 'BEV-002', quantity: 30, unitCost: 15, total: 450 },
          ],
          subtotal: 1200,
          tax: 96,
          shipping: 50,
          total: 1346,
          expectedDate: new Date(Date.now() + 86400000 * 2).toISOString(),
          createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
          createdBy: 'Jane Smith',
        },
        {
          id: '3',
          orderNumber: 'PO-2024-003',
          supplierId: '3',
          supplierName: 'Quality Meats Ltd.',
          status: 'confirmed',
          items: [
            { productId: '5', productName: 'Chicken Breast', sku: 'MEAT-002', quantity: 50, unitCost: 8, total: 400 },
          ],
          subtotal: 400,
          tax: 32,
          shipping: 30,
          total: 462,
          expectedDate: new Date(Date.now() + 86400000 * 5).toISOString(),
          createdAt: new Date(Date.now() - 86400000 * 1).toISOString(),
          createdBy: 'John Doe',
        },
        {
          id: '4',
          orderNumber: 'PO-2024-004',
          supplierId: '1',
          supplierName: 'Fresh Foods Inc.',
          status: 'draft',
          items: [
            { productId: '6', productName: 'Lettuce', sku: 'VEG-001', quantity: 100, unitCost: 2, total: 200 },
            { productId: '7', productName: 'Tomatoes', sku: 'VEG-002', quantity: 80, unitCost: 3, total: 240 },
          ],
          subtotal: 440,
          tax: 35.20,
          shipping: 20,
          total: 495.20,
          createdAt: new Date().toISOString(),
          createdBy: 'Jane Smith',
        },
      ]);
      setIsLoading(false);
    }, 500);
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'draft': return <FileText className="w-4 h-4" />;
      case 'sent': return <Send className="w-4 h-4" />;
      case 'confirmed': return <CheckCircle className="w-4 h-4" />;
      case 'shipped': return <Truck className="w-4 h-4" />;
      case 'received': return <Package className="w-4 h-4" />;
      case 'cancelled': return <XCircle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-muted text-muted-foreground';
      case 'sent': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
      case 'confirmed': return 'bg-purple-500/10 text-purple-600 dark:text-purple-400';
      case 'shipped': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
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

  const stats = {
    total: orders.length,
    pending: orders.filter(o => ['draft', 'sent', 'confirmed'].includes(o.status)).length,
    inTransit: orders.filter(o => o.status === 'shipped').length,
    totalValue: orders.filter(o => o.status !== 'cancelled').reduce((sum, o) => sum + o.total, 0),
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
              <option value="sent">Sent</option>
              <option value="confirmed">Confirmed</option>
              <option value="shipped">Shipped</option>
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
                    onClick={() => setSelectedOrder(order)}
                  >
                    <td className="p-4 font-medium text-foreground">{order.orderNumber}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        <span className="text-muted-foreground">{order.supplierName}</span>
                      </div>
                    </td>
                    <td className="p-4 text-muted-foreground">{order.items.length} items</td>
                    <td className="p-4 font-medium text-foreground">{formatCurrency(order.total)}</td>
                    <td className="p-4">
                      <span className={cn('inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full capitalize', getStatusColor(order.status))}>
                        {getStatusIcon(order.status)}
                        {order.status}
                      </span>
                    </td>
                    <td className="p-4 text-muted-foreground">{formatDate(order.expectedDate)}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <button className="p-1 hover:bg-accent rounded cursor-pointer"><Eye className="w-4 h-4 text-muted-foreground" /></button>
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
                {selectedOrder.status}
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
                      {selectedOrder.items.map((item, i) => (
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
                {selectedOrder.status === 'draft' && <Button className="flex-1 cursor-pointer"><Send className="w-4 h-4 mr-2" />Send to Supplier</Button>}
                {selectedOrder.status === 'shipped' && <Button className="flex-1 cursor-pointer"><Package className="w-4 h-4 mr-2" />Mark as Received</Button>}
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
