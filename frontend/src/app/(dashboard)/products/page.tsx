'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Plus,
  Search,
  Filter,
  MoreVertical,
  Edit,
  Trash2,
  Eye,
  Package,
  Grid,
  List,
  ChevronDown,
  ArrowUpDown,
  Download,
  Upload,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Pagination } from '@/components/ui/Pagination';
import { SkeletonProducts } from '@/components/ui/Skeleton';
import { BulkActionBar } from '@/components/ui/BulkActionBar';
import { BulkEditModal } from '@/components/ui/BulkEditModal';
import { apiClient } from '@/lib/api-client';
import { toast } from '@/store/ui';
import type { Product, Category } from '@properpos/shared';

interface ProductsResponse {
  data: Product[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('name');
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchCategories = useCallback(async () => {
    try {
      const data = await apiClient.getCategories();
      setCategories(data);
    } catch (error) {
    }
  }, []);

  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const sortOrder = sortBy === 'price' || sortBy === 'newest' ? 'desc' : 'asc';
      const apiSortBy = sortBy === 'newest' ? 'createdAt' : sortBy;

      const params: Record<string, any> = {
        page,
        limit: pageSize,
        sortBy: apiSortBy,
        sortOrder,
      };

      if (searchQuery) {
        params.search = searchQuery;
      }

      if (selectedCategory !== 'all') {
        params.categoryId = selectedCategory;
      }

      if (selectedStatus !== 'all') {
        if (selectedStatus === 'active') {
          params.isActive = 'true';
        } else if (selectedStatus === 'inactive') {
          params.isActive = 'false';
        } else if (selectedStatus === 'out_of_stock') {
          params.inStock = 'false';
          params.isActive = 'true';
        }
      }

      const response = await apiClient.get<ProductsResponse>('/products', { params });
      const result = response.data;

      if (result) {
        setProducts(result.data || []);
        setTotalItems(result.meta?.total || 0);
        setTotalPages(result.meta?.totalPages || 1);
      } else {
        setProducts([]);
        setTotalItems(0);
        setTotalPages(1);
      }
    } catch (error) {
      toast.error('Failed to load products', 'Could not retrieve products from the server.');
      setProducts([]);
      setTotalItems(0);
      setTotalPages(1);
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, searchQuery, selectedCategory, selectedStatus, sortBy]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, selectedCategory, selectedStatus, sortBy, pageSize]);

  const handleSearchChange = (value: string) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setSearchQuery(value);
    }, 300);
  };

  const getProductStatus = (product: Product): 'active' | 'inactive' | 'out_of_stock' => {
    if (!product.availability?.isActive) return 'inactive';
    const totalStock = product.inventory?.stockLevels?.reduce(
      (sum, level) => sum + (level.currentStock - level.reservedStock), 0
    ) ?? 0;
    if (product.inventory?.trackInventory && totalStock <= 0) return 'out_of_stock';
    return 'active';
  };

  const getProductStock = (product: Product): number => {
    return product.inventory?.stockLevels?.reduce(
      (sum, level) => sum + level.currentStock, 0
    ) ?? 0;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
      case 'inactive':
        return 'bg-muted text-muted-foreground';
      case 'out_of_stock':
        return 'bg-destructive/10 text-destructive';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const toggleSelectAll = () => {
    if (selectedProducts.length === products.length) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(products.map(p => p.id));
    }
  };

  const toggleSelectProduct = (id: string) => {
    setSelectedProducts(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const handleDeleteProduct = async (productId: string) => {
    const confirmed = window.confirm('Are you sure you want to delete this product? This action cannot be undone.');
    if (!confirmed) return;

    try {
      await apiClient.deleteProduct(productId);
      toast.success('Product deleted', 'The product has been successfully deleted.');
      fetchProducts();
    } catch (error) {
      toast.error('Delete failed', 'Could not delete the product. Please try again.');
    }
  };

  const handleBulkEdit = async (updates: Record<string, any>) => {
    setBulkLoading(true);
    try {
      await apiClient.post('/products/bulk-update', {
        productIds: selectedProducts,
        updates,
      });
      toast.success('Products updated', `Successfully updated ${selectedProducts.length} products.`);
      setSelectedProducts([]);
      setShowBulkEdit(false);
      fetchProducts();
    } catch (error) {
      toast.error('Bulk edit failed', 'Could not update the selected products. Please try again.');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedProducts.length} product(s)? This action cannot be undone.`
    );
    if (!confirmed) return;

    setBulkLoading(true);
    try {
      await apiClient.post('/products/bulk-delete', {
        productIds: selectedProducts,
        reason: 'Bulk deletion',
      });
      toast.success('Products deleted', `Successfully deleted ${selectedProducts.length} products.`);
      setSelectedProducts([]);
      fetchProducts();
    } catch (error) {
      toast.error('Bulk delete failed', 'Could not delete the selected products. Please try again.');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkExport = async () => {
    setBulkLoading(true);
    try {
      const response = await apiClient.post<string>('/products/bulk-export', {
        productIds: selectedProducts,
      });
      const csvData = response.data || '';
      const blob = new Blob([csvData], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `products-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Export complete', `Exported ${selectedProducts.length} products.`);
      setSelectedProducts([]);
    } catch (error) {
      toast.error('Export failed', 'Could not export the selected products. Please try again.');
    } finally {
      setBulkLoading(false);
    }
  };

  if (isLoading && products.length === 0) {
    return <SkeletonProducts />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Products</h1>
          <p className="text-muted-foreground mt-1">
            Manage your product catalog
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="cursor-pointer">
            <Upload className="w-4 h-4 mr-2" />
            Import
          </Button>
          <Button variant="outline" size="sm" className="cursor-pointer">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Link href="/products/new" className="cursor-pointer">
            <Button className="cursor-pointer">
              <Plus className="w-4 h-4 mr-2" />
              Add Product
            </Button>
          </Link>
        </div>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search products by name or SKU..."
                defaultValue={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background"
              />
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background cursor-pointer"
              >
                <option value="all">All Categories</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>

              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background cursor-pointer"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="out_of_stock">Out of Stock</option>
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background cursor-pointer"
              >
                <option value="name">Sort by Name</option>
                <option value="price">Sort by Price</option>
                <option value="stock">Sort by Stock</option>
                <option value="newest">Sort by Newest</option>
              </select>

              <div className="flex items-center border border-border rounded-lg overflow-hidden">
                <button
                  onClick={() => setViewMode('list')}
                  className={cn(
                    'p-2 transition-colors cursor-pointer',
                    viewMode === 'list'
                      ? 'bg-primary text-white'
                      : 'bg-background text-muted-foreground hover:bg-accent'
                  )}
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={cn(
                    'p-2 transition-colors cursor-pointer',
                    viewMode === 'grid'
                      ? 'bg-primary text-white'
                      : 'bg-background text-muted-foreground hover:bg-accent'
                  )}
                >
                  <Grid className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Bulk Actions */}
          <BulkActionBar
            selectedCount={selectedProducts.length}
            onClearSelection={() => setSelectedProducts([])}
            actions={[
              {
                label: 'Edit',
                icon: <Edit className="w-4 h-4" />,
                onClick: () => setShowBulkEdit(true),
                disabled: bulkLoading,
              },
              {
                label: 'Delete',
                icon: <Trash2 className="w-4 h-4" />,
                onClick: handleBulkDelete,
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
            className="mt-4"
          />
        </CardContent>
      </Card>

      {/* Products List/Grid */}
      {products.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Package className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-1">No products yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {searchQuery || selectedCategory !== 'all' || selectedStatus !== 'all'
                ? 'Try adjusting your filters to find what you are looking for.'
                : 'Get started by adding your first product to the catalog.'}
            </p>
            <Link href="/products/new" className="cursor-pointer">
              <Button className="cursor-pointer">
                <Plus className="w-4 h-4 mr-2" />
                Add Product
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : viewMode === 'list' ? (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="p-4 text-left">
                      <input
                        type="checkbox"
                        checked={selectedProducts.length === products.length && products.length > 0}
                        onChange={toggleSelectAll}
                        className="rounded border-input cursor-pointer"
                      />
                    </th>
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground">Product</th>
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground">SKU</th>
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground">Category</th>
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground">Price</th>
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground">Cost</th>
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground">Stock</th>
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground">Status</th>
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(product => {
                    const status = getProductStatus(product);
                    const stock = getProductStock(product);
                    return (
                      <tr
                        key={product.id}
                        className="border-b border-border hover:bg-muted/50 cursor-pointer"
                      >
                        <td className="p-4">
                          <input
                            type="checkbox"
                            checked={selectedProducts.includes(product.id)}
                            onChange={() => toggleSelectProduct(product.id)}
                            className="rounded border-input cursor-pointer"
                          />
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center overflow-hidden">
                              {product.media?.images?.[0]?.url ? (
                                <img
                                  src={product.media.images[0].url}
                                  alt={product.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <Package className="w-5 h-5 text-muted-foreground" />
                              )}
                            </div>
                            <span className="font-medium text-foreground">{product.name}</span>
                          </div>
                        </td>
                        <td className="p-4 text-muted-foreground">{product.sku || '-'}</td>
                        <td className="p-4 text-muted-foreground">{product.category?.name || '-'}</td>
                        <td className="p-4 font-medium text-foreground">${product.pricing.basePrice.toFixed(2)}</td>
                        <td className="p-4 text-muted-foreground">
                          {product.pricing.costPrice != null ? `$${product.pricing.costPrice.toFixed(2)}` : '-'}
                        </td>
                        <td className="p-4">
                          <span className={cn(
                            'font-medium',
                            stock <= 10 ? 'text-red-600' : stock <= 50 ? 'text-yellow-600' : 'text-foreground'
                          )}>
                            {product.inventory?.trackInventory ? stock : 'N/A'}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className={cn('text-xs px-2 py-1 rounded-full', getStatusBadge(status))}>
                            {status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <Link href={`/products/${product.id}`} className="cursor-pointer">
                              <button className="p-1 hover:bg-accent rounded cursor-pointer">
                                <Eye className="w-4 h-4 text-muted-foreground" />
                              </button>
                            </Link>
                            <Link href={`/products/${product.id}/edit`} className="cursor-pointer">
                              <button className="p-1 hover:bg-accent rounded cursor-pointer">
                                <Edit className="w-4 h-4 text-muted-foreground" />
                              </button>
                            </Link>
                            <button
                              onClick={() => handleDeleteProduct(product.id)}
                              className="p-1 hover:bg-accent rounded cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4 text-red-400" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {products.map(product => {
            const status = getProductStatus(product);
            return (
              <Card key={product.id} className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer">
                <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                  {product.media?.images?.[0]?.url ? (
                    <img
                      src={product.media.images[0].url}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Package className="w-12 h-12 text-muted-foreground" />
                  )}
                </div>
                <CardContent className="p-4">
                  <h3 className="font-medium text-foreground truncate">{product.name}</h3>
                  <p className="text-sm text-muted-foreground">{product.sku || '-'}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="font-bold text-foreground">${product.pricing.basePrice.toFixed(2)}</span>
                    <span className={cn('text-xs px-2 py-1 rounded-full', getStatusBadge(status))}>
                      {status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Link href={`/products/${product.id}/edit`} className="flex-1 cursor-pointer">
                      <Button variant="outline" size="sm" className="w-full cursor-pointer">
                        <Edit className="w-3 h-3 mr-1" />
                        Edit
                      </Button>
                    </Link>
                    <button
                      onClick={() => handleDeleteProduct(product.id)}
                      className="p-2 hover:bg-accent rounded border border-border cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalItems > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          totalItems={totalItems}
          itemName="products"
        />
      )}

      {/* Bulk Edit Modal */}
      <BulkEditModal
        isOpen={showBulkEdit}
        onClose={() => setShowBulkEdit(false)}
        onSubmit={handleBulkEdit}
        selectedCount={selectedProducts.length}
        entityName="Products"
        isLoading={bulkLoading}
        fields={[
          {
            key: 'category',
            label: 'Category',
            type: 'select',
            options: categories.map((cat) => ({ value: cat.id, label: cat.name })),
            placeholder: 'Select category',
          },
          {
            key: 'price',
            label: 'Price',
            type: 'number',
            placeholder: 'Enter new price',
          },
        ]}
      />
    </div>
  );
}
