'use client';

import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useUIStore } from '@/store';

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

  const locations = [
    { id: '1', name: 'Main Street Location' },
    { id: '2', name: 'Downtown Branch' },
    { id: '3', name: 'Airport Kiosk' },
  ];

  useEffect(() => {
    setTimeout(() => {
      setTransfers([
        {
          id: '1',
          transferNumber: 'TRF-2024-001',
          fromLocation: { id: '1', name: 'Main Street Location' },
          toLocation: { id: '2', name: 'Downtown Branch' },
          status: 'completed',
          items: [
            { productId: '1', productName: 'Classic Burger Patties', sku: 'MEAT-001', quantity: 50 },
            { productId: '2', productName: 'Burger Buns', sku: 'BRD-001', quantity: 100 },
          ],
          totalItems: 150,
          createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
          createdBy: 'John Doe',
          completedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        },
        {
          id: '2',
          transferNumber: 'TRF-2024-002',
          fromLocation: { id: '1', name: 'Main Street Location' },
          toLocation: { id: '3', name: 'Airport Kiosk' },
          status: 'in_transit',
          items: [
            { productId: '3', productName: 'Coca-Cola', sku: 'BEV-001', quantity: 48 },
            { productId: '4', productName: 'Sprite', sku: 'BEV-002', quantity: 24 },
          ],
          totalItems: 72,
          notes: 'Urgent restock for weekend rush',
          createdAt: new Date(Date.now() - 86400000).toISOString(),
          createdBy: 'Jane Smith',
        },
        {
          id: '3',
          transferNumber: 'TRF-2024-003',
          fromLocation: { id: '2', name: 'Downtown Branch' },
          toLocation: { id: '1', name: 'Main Street Location' },
          status: 'pending',
          items: [
            { productId: '5', productName: 'French Fries (Frozen)', sku: 'FRZ-001', quantity: 30 },
          ],
          totalItems: 30,
          createdAt: new Date().toISOString(),
          createdBy: 'John Doe',
        },
        {
          id: '4',
          transferNumber: 'TRF-2024-004',
          fromLocation: { id: '3', name: 'Airport Kiosk' },
          toLocation: { id: '2', name: 'Downtown Branch' },
          status: 'cancelled',
          items: [
            { productId: '6', productName: 'Paper Cups', sku: 'PKG-001', quantity: 500 },
          ],
          totalItems: 500,
          notes: 'Cancelled - items no longer needed',
          createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
          createdBy: 'Jane Smith',
        },
      ]);
      setIsLoading(false);
    }, 500);
  }, []);

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
                {selectedTransfer.status === 'pending' && <Button className="flex-1 cursor-pointer"><Truck className="w-4 h-4 mr-2" />Start Transfer</Button>}
                {selectedTransfer.status === 'in_transit' && <Button className="flex-1 cursor-pointer"><CheckCircle className="w-4 h-4 mr-2" />Mark Received</Button>}
              </div>
            </CardContent>
          </Card>
        </div>
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
