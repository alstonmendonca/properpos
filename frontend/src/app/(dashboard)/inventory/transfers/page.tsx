'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Search,
  Plus,
  ArrowRight,
  ArrowLeftRight,
  Package,
  MapPin,
  Clock,
  CheckCircle,
  XCircle,
  Truck,
  Eye,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useUIStore } from '@/store';
import { apiClient } from '@/lib/api-client';

interface TransferItem {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
}

interface StockTransfer {
  id: string;
  transferNumber: string;
  fromLocation: { id: string; name: string };
  toLocation: { id: string; name: string };
  status: 'pending' | 'in_transit' | 'completed' | 'cancelled';
  items: TransferItem[];
  totalItems: number;
  notes?: string;
  createdAt: string;
  createdBy: string;
  completedAt?: string;
}

export default function StockTransfersPage() {
  const addToast = useUIStore(s => s.addToast);
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedTransfer, setSelectedTransfer] = useState<StockTransfer | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchTransfers = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await apiClient.get<any>('/inventory/transfers');
      const data = response.data;
      if (Array.isArray(data)) {
        setTransfers(data);
      } else if (data && Array.isArray(data.transfers)) {
        setTransfers(data.transfers);
      } else {
        setTransfers([]);
      }
    } catch (error: any) {
      addToast({
        type: 'error',
        title: 'Failed to load transfers',
        message: error?.message || 'Could not fetch stock transfers. Please try again.',
      });
      setTransfers([]);
    } finally {
      setIsLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchTransfers();
  }, [fetchTransfers]);

  const handleApproveTransfer = async (transferId: string, action: 'start' | 'receive') => {
    try {
      setIsSubmitting(true);
      await apiClient.put<any>(`/inventory/transfers/${transferId}/approve`);
      addToast({
        type: 'success',
        title: action === 'start' ? 'Transfer started' : 'Transfer received',
        message: action === 'start'
          ? 'The transfer has been approved and is now in transit.'
          : 'The transfer has been marked as received and completed.',
      });
      setSelectedTransfer(null);
      await fetchTransfers();
    } catch (error: any) {
      addToast({
        type: 'error',
        title: action === 'start' ? 'Failed to start transfer' : 'Failed to mark as received',
        message: error?.message || 'An error occurred. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateTransfer = async (transferData: {
    fromLocationId: string;
    toLocationId: string;
    items: { productId: string; quantity: number }[];
    notes?: string;
  }) => {
    try {
      setIsSubmitting(true);
      await apiClient.post<any>('/inventory/transfers', transferData);
      addToast({
        type: 'success',
        title: 'Transfer created',
        message: 'The stock transfer has been created successfully.',
      });
      setShowCreateModal(false);
      await fetchTransfers();
    } catch (error: any) {
      addToast({
        type: 'error',
        title: 'Failed to create transfer',
        message: error?.message || 'Could not create the stock transfer. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock className="w-4 h-4" />;
      case 'in_transit': return <Truck className="w-4 h-4" />;
      case 'completed': return <CheckCircle className="w-4 h-4" />;
      case 'cancelled': return <XCircle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
      case 'in_transit': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
      case 'completed': return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
      case 'cancelled': return 'bg-destructive/10 text-destructive';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const filteredTransfers = transfers.filter(transfer => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!transfer.transferNumber.toLowerCase().includes(query) &&
          !transfer.fromLocation.name.toLowerCase().includes(query) &&
          !transfer.toLocation.name.toLowerCase().includes(query)) {
        return false;
      }
    }
    if (selectedStatus !== 'all' && transfer.status !== selectedStatus) {
      return false;
    }
    return true;
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const stats = {
    total: transfers.length,
    pending: transfers.filter(t => t.status === 'pending').length,
    inTransit: transfers.filter(t => t.status === 'in_transit').length,
    completed: transfers.filter(t => t.status === 'completed').length,
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
          <h1 className="text-2xl font-bold text-foreground">Stock Transfers</h1>
          <p className="text-muted-foreground mt-1">
            Transfer inventory between locations
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} className="cursor-pointer">
          <Plus className="w-4 h-4 mr-2" />
          New Transfer
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
                <ArrowLeftRight className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Transfers</p>
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
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Completed</p>
                <p className="text-xl font-bold text-foreground">{stats.completed}</p>
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
                placeholder="Search transfers..."
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
              <option value="pending">Pending</option>
              <option value="in_transit">In Transit</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Transfers List */}
      <div className="space-y-4">
        {filteredTransfers.map(transfer => (
          <Card key={transfer.id} className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedTransfer(transfer)}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div>
                    <p className="font-semibold text-foreground">{transfer.transferNumber}</p>
                    <p className="text-sm text-muted-foreground">{formatDate(transfer.createdAt)}</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{transfer.fromLocation.name}</span>
                    </div>
                    <ArrowRight className="w-5 h-5 text-primary" />
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{transfer.toLocation.name}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Items</p>
                    <p className="font-semibold">{transfer.totalItems}</p>
                  </div>
                  <span className={cn('inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full capitalize', getStatusColor(transfer.status))}>
                    {getStatusIcon(transfer.status)}
                    {transfer.status.replace('_', ' ')}
                  </span>
                </div>
              </div>

              {transfer.notes && (
                <p className="mt-3 text-sm text-muted-foreground border-t border-border pt-3">
                  {transfer.notes}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Transfer Detail Modal */}
      {selectedTransfer && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedTransfer(null)}>
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>{selectedTransfer.transferNumber}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">Created by {selectedTransfer.createdBy}</p>
              </div>
              <span className={cn('inline-flex items-center gap-1 px-3 py-1 rounded-full capitalize', getStatusColor(selectedTransfer.status))}>
                {getStatusIcon(selectedTransfer.status)}
                {selectedTransfer.status.replace('_', ' ')}
              </span>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-center gap-4 p-4 bg-muted/50 rounded-lg">
                <div className="text-center">
                  <MapPin className="w-6 h-6 text-primary mx-auto mb-1" />
                  <p className="font-medium">{selectedTransfer.fromLocation.name}</p>
                  <p className="text-sm text-muted-foreground">From</p>
                </div>
                <ArrowRight className="w-8 h-8 text-primary" />
                <div className="text-center">
                  <MapPin className="w-6 h-6 text-primary mx-auto mb-1" />
                  <p className="font-medium">{selectedTransfer.toLocation.name}</p>
                  <p className="text-sm text-muted-foreground">To</p>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-3">Transfer Items</h4>
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-muted">
                      <tr>
                        <th className="p-3 text-left text-sm font-medium text-muted-foreground">Product</th>
                        <th className="p-3 text-left text-sm font-medium text-muted-foreground">SKU</th>
                        <th className="p-3 text-right text-sm font-medium text-muted-foreground">Quantity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTransfer.items.map((item, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="p-3 font-medium">{item.productName}</td>
                          <td className="p-3 text-muted-foreground">{item.sku}</td>
                          <td className="p-3 text-right font-medium">{item.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {selectedTransfer.notes && (
                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                  <p className="text-sm text-yellow-800 dark:text-yellow-400">{selectedTransfer.notes}</p>
                </div>
              )}

              <div className="flex gap-2 pt-4 border-t">
                <Button variant="outline" className="flex-1 cursor-pointer" onClick={() => setSelectedTransfer(null)}>Close</Button>
                {selectedTransfer.status === 'pending' && (
                  <Button
                    className="flex-1 cursor-pointer"
                    disabled={isSubmitting}
                    onClick={() => handleApproveTransfer(selectedTransfer.id, 'start')}
                  >
                    {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Truck className="w-4 h-4 mr-2" />}
                    Start Transfer
                  </Button>
                )}
                {selectedTransfer.status === 'in_transit' && (
                  <Button
                    className="flex-1 cursor-pointer"
                    disabled={isSubmitting}
                    onClick={() => handleApproveTransfer(selectedTransfer.id, 'receive')}
                  >
                    {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                    Mark Received
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Create Transfer Modal */}
      {showCreateModal && (
        <CreateTransferModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateTransfer}
          isSubmitting={isSubmitting}
        />
      )}

      {filteredTransfers.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <ArrowLeftRight className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No transfers found</h3>
            <Button onClick={() => setShowCreateModal(true)} className="cursor-pointer"><Plus className="w-4 h-4 mr-2" />New Transfer</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CreateTransferModal({
  onClose,
  onSubmit,
  isSubmitting,
}: {
  onClose: () => void;
  onSubmit: (data: {
    fromLocationId: string;
    toLocationId: string;
    items: { productId: string; quantity: number }[];
    notes?: string;
  }) => void;
  isSubmitting: boolean;
}) {
  const addToast = useUIStore(s => s.addToast);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string; sku: string }[]>([]);
  const [fromLocationId, setFromLocationId] = useState('');
  const [toLocationId, setToLocationId] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<{ productId: string; quantity: number }[]>([
    { productId: '', quantity: 1 },
  ]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoadingData(true);
        const [locationsRes, productsRes] = await Promise.all([
          apiClient.get<any>('/locations'),
          apiClient.get<any>('/products'),
        ]);
        const locData = locationsRes.data;
        setLocations(Array.isArray(locData) ? locData : locData?.locations || []);
        const prodData = productsRes.data;
        setProducts(Array.isArray(prodData) ? prodData : prodData?.products || []);
      } catch (error: any) {
        addToast({
          type: 'error',
          title: 'Failed to load data',
          message: error?.message || 'Could not load locations and products.',
        });
      } finally {
        setIsLoadingData(false);
      }
    };
    loadData();
  }, [addToast]);

  const addItem = () => {
    setItems([...items, { productId: '', quantity: 1 }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: 'productId' | 'quantity', value: string | number) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      return {
        productId: field === 'productId' ? (value as string) : item.productId,
        quantity: field === 'quantity' ? (value as number) : item.quantity,
      };
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromLocationId || !toLocationId) {
      addToast({ type: 'error', title: 'Validation error', message: 'Please select both source and destination locations.' });
      return;
    }
    if (fromLocationId === toLocationId) {
      addToast({ type: 'error', title: 'Validation error', message: 'Source and destination locations must be different.' });
      return;
    }
    const validItems = items.filter(item => item.productId && item.quantity > 0);
    if (validItems.length === 0) {
      addToast({ type: 'error', title: 'Validation error', message: 'Please add at least one item with a valid quantity.' });
      return;
    }
    onSubmit({
      fromLocationId,
      toLocationId,
      items: validItems as { productId: string; quantity: number }[],
      ...(notes ? { notes } : {}),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <CardHeader>
          <CardTitle>Create Stock Transfer</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingData ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">From Location</label>
                <select
                  value={fromLocationId}
                  onChange={e => setFromLocationId(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground cursor-pointer"
                  required
                >
                  <option value="">Select source location</option>
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">To Location</label>
                <select
                  value={toLocationId}
                  onChange={e => setToLocationId(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground cursor-pointer"
                  required
                >
                  <option value="">Select destination location</option>
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Items</label>
                <div className="space-y-2">
                  {items.map((item, index) => (
                    <div key={index} className="flex gap-2 items-center">
                      <select
                        value={item.productId}
                        onChange={e => updateItem(index, 'productId', e.target.value)}
                        className="flex-1 px-3 py-2 border border-border rounded-lg bg-background text-foreground cursor-pointer text-sm"
                        required
                      >
                        <option value="">Select product</option>
                        {products.map(prod => (
                          <option key={prod.id} value={prod.id}>{prod.name} ({prod.sku})</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={e => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                        className="w-20 px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm"
                        placeholder="Qty"
                        required
                      />
                      {items.length > 1 && (
                        <Button type="button" variant="ghost" size="sm" className="cursor-pointer" onClick={() => removeItem(index)}>
                          <XCircle className="w-4 h-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm" className="mt-2 cursor-pointer" onClick={addItem}>
                  <Plus className="w-3 h-3 mr-1" /> Add Item
                </Button>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm"
                  rows={2}
                  placeholder="Any additional notes..."
                />
              </div>

              <div className="flex gap-2 pt-4 border-t">
                <Button type="button" variant="outline" className="flex-1 cursor-pointer" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1 cursor-pointer" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                  Create Transfer
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
