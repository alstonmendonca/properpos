'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Search,
  Plus,
  AlertTriangle,
  AlertCircle,
  Package,
  Boxes,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Download,
  Filter,
  TrendingUp,
  TrendingDown,
  Warehouse,
  History,
  Settings,
  ChevronRight,
  BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Pagination } from '@/components/ui/Pagination';
import { SkeletonInventory } from '@/components/ui/Skeleton';
import { useUIStore } from '@/store';
import { apiClient } from '@/lib/api-client';
import toast from 'react-hot-toast';
import ForecastChart from '@/components/inventory/ForecastChart';
import ReorderSuggestions from '@/components/inventory/ReorderSuggestions';
import StockoutRisk from '@/components/inventory/StockoutRisk';

interface InventoryItem {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  category: string;
  currentStock: number;
  minStock: number;
  maxStock: number;
  cost: number;
  lastUpdated: string;
  location: string;
  unit: string;
}

interface StockMovement {
  id: string;
  productName: string;
  type: 'in' | 'out' | 'adjustment';
  quantity: number;
  reason: string;
  user: string;
  createdAt: string;
}

export default function InventoryPage() {
  const addToast = useUIStore(s => s.addToast);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'stock' | 'movements' | 'adjustments' | 'forecast'>('stock');
  const [adjustmentModal, setAdjustmentModal] = useState<{ item: InventoryItem | null; type: 'add' | 'remove' | 'set' }>({ item: null, type: 'add' });
  const [adjustmentQuantity, setAdjustmentQuantity] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Forecast state
  const [forecasts, setForecasts] = useState<any[]>([]);
  const [reorderSuggestions, setReorderSuggestions] = useState<any[]>([]);
  const [stockoutRisk, setStockoutRisk] = useState<any[]>([]);
  const [forecastLoading, setForecastLoading] = useState(false);
  const forecastLoadedRef = useRef(false);

  const fetchInventoryData = useCallback(async () => {
    try {
      // Fetch inventory and movements in parallel
      const [inventoryResult, movementsResult] = await Promise.allSettled([
        apiClient.getInventory({ limit: 100 }),
        apiClient.getStockMovements({ limit: 20 }),
      ]);

      // Process inventory data
      if (inventoryResult.status === 'fulfilled' && inventoryResult.value) {
        const data = inventoryResult.value as any;
        const items = Array.isArray(data) ? data : (data.items || data.data || []);

        setInventory(
          items.map((item: any) => ({
            id: item.id || item._id,
            productId: item.productId || item.id,
            productName: item.productName || item.product?.name || item.name || 'Unknown',
            sku: item.sku || item.product?.sku || 'N/A',
            category: item.category || item.product?.categoryName || 'Uncategorized',
            currentStock: item.quantity || item.currentStock || 0,
            minStock: item.reorderLevel || item.minStock || 10,
            maxStock: item.maxStock || 100,
            cost: item.unitCost || item.cost || item.product?.costPrice || 0,
            lastUpdated: item.updatedAt || item.lastUpdated || new Date().toISOString(),
            location: item.locationName || item.location?.name || 'Default',
            unit: item.unit || 'units',
          }))
        );
      }

      // Process movements data
      if (movementsResult.status === 'fulfilled' && movementsResult.value) {
        const data = movementsResult.value as any;
        const movementItems = Array.isArray(data) ? data : (data.items || data.data || []);

        setMovements(
          movementItems.map((item: any) => ({
            id: item.id || item._id,
            productName: item.productName || item.product?.name || 'Unknown',
            type: item.type === 'stock_in' ? 'in' : item.type === 'stock_out' ? 'out' : item.type || 'adjustment',
            quantity: Math.abs(item.quantity || 0),
            reason: item.reason || item.reference || 'Manual adjustment',
            user: item.createdBy || item.userName || 'System',
            createdAt: item.createdAt || new Date().toISOString(),
          }))
        );
      }

      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load inventory data';
      setError(errorMessage);
      toast.error('Failed to load inventory data');
      console.error('Inventory fetch error:', err);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await fetchInventoryData();
      setIsLoading(false);
    };
    loadData();
  }, [fetchInventoryData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchInventoryData();
    setIsRefreshing(false);
    toast.success('Inventory refreshed');
  };

  const loadForecasts = useCallback(async () => {
    if (forecastLoading) return;
    setForecastLoading(true);
    try {
      const [forecastRes, reorderRes, riskRes] = await Promise.all([
        apiClient.get('/stock/forecast/bulk?method=ensemble&forecastPeriod=30'),
        apiClient.get('/stock/forecast/reorder-suggestions?leadTimeDays=7'),
        apiClient.get('/stock/forecast/stockout-risk?withinDays=14'),
      ]);

      setForecasts((forecastRes as any)?.data || []);
      setReorderSuggestions((reorderRes as any)?.data || []);
      setStockoutRisk((riskRes as any)?.data || []);
      forecastLoadedRef.current = true;
    } catch (err) {
      console.error('Failed to load forecast data:', err);
      toast.error('Failed to load forecast data');
    } finally {
      setForecastLoading(false);
    }
  }, [forecastLoading]);

  const handleForecastTabClick = useCallback(() => {
    setActiveTab('forecast');
    if (!forecastLoadedRef.current) {
      loadForecasts();
    }
  }, [loadForecasts]);

  const categories = Array.from(new Set(inventory.map(i => i.category)));

  const filteredInventory = inventory.filter(item => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!item.productName.toLowerCase().includes(query) && !item.sku.toLowerCase().includes(query)) {
        return false;
      }
    }
    if (selectedCategory !== 'all' && item.category !== selectedCategory) {
      return false;
    }
    if (selectedStatus === 'low' && item.currentStock >= item.minStock) {
      return false;
    }
    if (selectedStatus === 'out' && item.currentStock > 0) {
      return false;
    }
    if (selectedStatus === 'overstocked' && item.currentStock <= item.maxStock) {
      return false;
    }
    return true;
  });

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredInventory.length / pageSize));
  const paginatedInventory = filteredInventory.slice((page - 1) * pageSize, page * pageSize);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, selectedCategory, selectedStatus, pageSize]);

  const getStockStatus = (item: InventoryItem) => {
    if (item.currentStock === 0) return { label: 'Out of Stock', color: 'bg-destructive/10 text-destructive' };
    if (item.currentStock < item.minStock) return { label: 'Low Stock', color: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400' };
    if (item.currentStock > item.maxStock) return { label: 'Overstocked', color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400' };
    return { label: 'In Stock', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' };
  };

  const getStockPercentage = (item: InventoryItem) => {
    return Math.min(100, (item.currentStock / item.maxStock) * 100);
  };

  const handleAdjustment = async () => {
    if (!adjustmentModal.item || !adjustmentQuantity) return;

    try {
      const item = adjustmentModal.item;
      let newStock = item.currentStock;
      const qty = parseInt(adjustmentQuantity);

      if (adjustmentModal.type === 'add') {
        newStock += qty;
      } else if (adjustmentModal.type === 'remove') {
        newStock = Math.max(0, newStock - qty);
      } else {
        newStock = qty;
      }

      // Call the API to update inventory
      await apiClient.updateInventory(item.productId, item.location, {
        quantity: newStock,
        reason: adjustmentReason || `${adjustmentModal.type === 'add' ? 'Added' : adjustmentModal.type === 'remove' ? 'Removed' : 'Set to'} ${qty} units`,
      });

      // Update local state
      setInventory(prev => prev.map(i =>
        i.id === item.id ? { ...i, currentStock: newStock, lastUpdated: new Date().toISOString() } : i
      ));

      toast.success(`${item.productName} stock updated to ${newStock}`);

      setAdjustmentModal({ item: null, type: 'add' });
      setAdjustmentQuantity('');
      setAdjustmentReason('');

      // Refresh movements to show the new adjustment
      fetchInventoryData();
    } catch (error) {
      toast.error('Failed to adjust stock. Please try again.');
      console.error('Stock adjustment error:', error);
    }
  };

  // Stats
  const stats = {
    totalItems: inventory.length,
    totalValue: inventory.reduce((sum, i) => sum + (i.currentStock * i.cost), 0),
    lowStock: inventory.filter(i => i.currentStock < i.minStock && i.currentStock > 0).length,
    outOfStock: inventory.filter(i => i.currentStock === 0).length,
  };

  if (isLoading) {
    return <SkeletonInventory />;
  }

  if (error && inventory.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Failed to load inventory
        </h2>
        <p className="text-muted-foreground mb-4">{error}</p>
        <Button onClick={handleRefresh} disabled={isRefreshing} className="cursor-pointer">
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
          <h1 className="text-2xl font-bold text-foreground">Inventory</h1>
          <p className="text-muted-foreground mt-1">
            Manage stock levels and track movements
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing} className="cursor-pointer">
            <RefreshCw className={cn('w-4 h-4 mr-2', isRefreshing && 'animate-spin')} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" className="cursor-pointer">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Link href="/inventory/purchase-orders" className="cursor-pointer">
            <Button variant="outline" className="cursor-pointer">
              <Package className="w-4 h-4 mr-2" />
              Purchase Orders
            </Button>
          </Link>
          <Link href="/inventory/suppliers" className="cursor-pointer">
            <Button className="cursor-pointer">
              <Warehouse className="w-4 h-4 mr-2" />
              Suppliers
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
                <Package className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Items</p>
                <p className="text-xl font-bold text-foreground">{stats.totalItems}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 dark:bg-green-900/20 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Value</p>
                <p className="text-xl font-bold text-foreground">${stats.totalValue.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={stats.lowStock > 0 ? 'border-yellow-200 dark:border-yellow-800' : ''}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-100 dark:bg-yellow-900/20 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Low Stock</p>
                <p className="text-xl font-bold text-yellow-600">{stats.lowStock}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={stats.outOfStock > 0 ? 'border-destructive/20' : ''}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-destructive/10 rounded-lg flex items-center justify-center">
                <TrendingDown className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Out of Stock</p>
                <p className="text-xl font-bold text-destructive">{stats.outOfStock}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-4 border-b border-border">
        <button
          onClick={() => setActiveTab('stock')}
          className={cn(
            'pb-3 px-1 text-sm font-medium border-b-2 transition-colors cursor-pointer',
            activeTab === 'stock'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          Stock Levels
        </button>
        <button
          onClick={() => setActiveTab('movements')}
          className={cn(
            'pb-3 px-1 text-sm font-medium border-b-2 transition-colors cursor-pointer',
            activeTab === 'movements'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          Recent Movements
        </button>
        <button
          onClick={handleForecastTabClick}
          className={cn(
            'pb-3 px-1 text-sm font-medium border-b-2 transition-colors cursor-pointer flex items-center gap-1.5',
            activeTab === 'forecast'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <BarChart3 className="w-4 h-4" />
          Forecasting
        </button>
      </div>

      {/* Stock Levels Tab */}
      {activeTab === 'stock' && (
        <>
          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col lg:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search by product name or SKU..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background cursor-pointer"
                  >
                    <option value="all">All Categories</option>
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>

                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background cursor-pointer"
                  >
                    <option value="all">All Status</option>
                    <option value="low">Low Stock</option>
                    <option value="out">Out of Stock</option>
                    <option value="overstocked">Overstocked</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Inventory Table */}
          <Card>
            <CardContent className="p-0">
              {filteredInventory.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Boxes className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-1">No inventory data</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {searchQuery || selectedCategory !== 'all' || selectedStatus !== 'all'
                      ? 'Try adjusting your filters to find what you are looking for.'
                      : 'Inventory items will appear here once products are added to the system.'}
                  </p>
                  <Link href="/products/new" className="cursor-pointer">
                    <Button className="cursor-pointer">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Product
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="p-4 text-left text-sm font-medium text-muted-foreground">Product</th>
                        <th className="p-4 text-left text-sm font-medium text-muted-foreground">SKU</th>
                        <th className="p-4 text-left text-sm font-medium text-muted-foreground">Category</th>
                        <th className="p-4 text-left text-sm font-medium text-muted-foreground">Stock Level</th>
                        <th className="p-4 text-left text-sm font-medium text-muted-foreground">Status</th>
                        <th className="p-4 text-left text-sm font-medium text-muted-foreground">Value</th>
                        <th className="p-4 text-left text-sm font-medium text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedInventory.map(item => {
                        const status = getStockStatus(item);
                        return (
                          <tr
                            key={item.id}
                            className="border-b border-border hover:bg-accent cursor-pointer"
                          >
                            <td className="p-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                                  <Package className="w-5 h-5 text-muted-foreground" />
                                </div>
                                <div>
                                  <p className="font-medium text-foreground">{item.productName}</p>
                                  <p className="text-xs text-muted-foreground">{item.location}</p>
                                </div>
                              </div>
                            </td>
                            <td className="p-4 text-muted-foreground">{item.sku}</td>
                            <td className="p-4 text-muted-foreground">{item.category}</td>
                            <td className="p-4">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-foreground">
                                    {item.currentStock}
                                  </span>
                                  <span className="text-muted-foreground text-sm">/ {item.maxStock} {item.unit}</span>
                                </div>
                                <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className={cn(
                                      'h-full transition-all',
                                      item.currentStock === 0 ? 'bg-red-500' :
                                      item.currentStock < item.minStock ? 'bg-yellow-500' :
                                      item.currentStock > item.maxStock ? 'bg-purple-500' : 'bg-green-500'
                                    )}
                                    style={{ width: `${getStockPercentage(item)}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="p-4">
                              <span className={cn('text-xs px-2 py-1 rounded-full', status.color)}>
                                {status.label}
                              </span>
                            </td>
                            <td className="p-4 font-medium text-foreground">
                              ${(item.currentStock * item.cost).toFixed(2)}
                            </td>
                            <td className="p-4">
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => setAdjustmentModal({ item, type: 'add' })}
                                  className="p-2 hover:bg-green-100 dark:hover:bg-green-900/20 rounded text-green-600 cursor-pointer"
                                  title="Add Stock"
                                >
                                  <ArrowUp className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setAdjustmentModal({ item, type: 'remove' })}
                                  className="p-2 hover:bg-red-100 dark:hover:bg-red-900/20 rounded text-red-600 cursor-pointer"
                                  title="Remove Stock"
                                >
                                  <ArrowDown className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setAdjustmentModal({ item, type: 'set' })}
                                  className="p-2 hover:bg-accent rounded text-muted-foreground cursor-pointer"
                                  title="Set Stock"
                                >
                                  <RefreshCw className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pagination */}
          {filteredInventory.length > 0 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
              totalItems={filteredInventory.length}
              itemName="items"
            />
          )}
        </>
      )}

      {/* Movements Tab */}
      {activeTab === 'movements' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              Recent Stock Movements
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {movements.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <History className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-1">No recent movements</h3>
                <p className="text-sm text-muted-foreground">Stock movements will appear here when inventory changes are made.</p>
              </div>
            ) : (
            <div className="divide-y divide-border">
              {movements.map(movement => (
                <div key={movement.id} className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      'w-10 h-10 rounded-lg flex items-center justify-center',
                      movement.type === 'in'
                        ? 'bg-green-100 dark:bg-green-900/20'
                        : movement.type === 'out'
                        ? 'bg-red-100 dark:bg-red-900/20'
                        : 'bg-yellow-100 dark:bg-yellow-900/20'
                    )}>
                      {movement.type === 'in' ? (
                        <ArrowUp className="w-5 h-5 text-green-600" />
                      ) : movement.type === 'out' ? (
                        <ArrowDown className="w-5 h-5 text-red-600" />
                      ) : (
                        <RefreshCw className="w-5 h-5 text-yellow-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{movement.productName}</p>
                      <p className="text-sm text-muted-foreground">{movement.reason}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={cn(
                      'font-medium',
                      movement.type === 'in' ? 'text-green-600' : movement.type === 'out' ? 'text-red-600' : 'text-yellow-600'
                    )}>
                      {movement.type === 'in' ? '+' : movement.type === 'out' ? '-' : ''}{Math.abs(movement.quantity)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(movement.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Forecasting Tab */}
      {activeTab === 'forecast' && (
        <>
          {forecastLoading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <RefreshCw className="w-8 h-8 text-primary animate-spin mb-4" />
              <p className="text-muted-foreground">Loading forecast data...</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <StockoutRisk items={stockoutRisk} />
                <ReorderSuggestions suggestions={reorderSuggestions} />
              </div>
              <ForecastChart forecasts={forecasts} />
            </div>
          )}
        </>
      )}

      {/* Adjustment Modal */}
      {adjustmentModal.item && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setAdjustmentModal({ item: null, type: 'add' })}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle>
                {adjustmentModal.type === 'add' ? 'Add Stock' : adjustmentModal.type === 'remove' ? 'Remove Stock' : 'Set Stock Level'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Product</p>
                <p className="font-medium text-foreground">{adjustmentModal.item.productName}</p>
                <p className="text-sm text-muted-foreground">Current: {adjustmentModal.item.currentStock} {adjustmentModal.item.unit}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  {adjustmentModal.type === 'set' ? 'New Stock Level' : 'Quantity'}
                </label>
                <input
                  type="number"
                  value={adjustmentQuantity}
                  onChange={(e) => setAdjustmentQuantity(e.target.value)}
                  min="0"
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background"
                  placeholder="Enter quantity"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Reason
                </label>
                <input
                  type="text"
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background"
                  placeholder="e.g., Manual count, Damaged items"
                />
              </div>

              {adjustmentQuantity && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">New stock level:</p>
                  <p className="text-xl font-bold text-foreground">
                    {adjustmentModal.type === 'add'
                      ? adjustmentModal.item.currentStock + parseInt(adjustmentQuantity || '0')
                      : adjustmentModal.type === 'remove'
                      ? Math.max(0, adjustmentModal.item.currentStock - parseInt(adjustmentQuantity || '0'))
                      : parseInt(adjustmentQuantity || '0')
                    } {adjustmentModal.item.unit}
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2 pt-4">
                <Button
                  variant="outline"
                  className="flex-1 cursor-pointer"
                  onClick={() => setAdjustmentModal({ item: null, type: 'add' })}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 cursor-pointer"
                  onClick={handleAdjustment}
                  disabled={!adjustmentQuantity}
                >
                  Confirm
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
