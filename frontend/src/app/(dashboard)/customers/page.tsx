'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Search,
  Plus,
  Eye,
  Edit,
  Trash2,
  MoreVertical,
  Users,
  Mail,
  Phone,
  MapPin,
  Calendar,
  ShoppingBag,
  DollarSign,
  Star,
  Download,
  Upload,
  UserX,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Pagination } from '@/components/ui/Pagination';
import { SkeletonCustomers } from '@/components/ui/Skeleton';
import { BulkActionBar } from '@/components/ui/BulkActionBar';
import { BulkEditModal } from '@/components/ui/BulkEditModal';
import { apiClient } from '@/lib/api-client';
import { toast } from '@/store/ui';

interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  address?: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
  };
  totalOrders: number;
  totalSpent: number;
  loyaltyPoints: number;
  lastOrderDate?: string;
  status: 'active' | 'inactive';
  createdAt: string;
  tags: string[];
}

interface CustomersListResponse {
  customers: Customer[];
  totalCount: number;
  page: number;
  totalPages: number;
}

const SORT_MAP: Record<string, { orderBy: string; sortOrder: 'asc' | 'desc' }> = {
  name: { orderBy: 'name', sortOrder: 'asc' },
  spent: { orderBy: 'totalSpent', sortOrder: 'desc' },
  orders: { orderBy: 'totalOrders', sortOrder: 'desc' },
  recent: { orderBy: 'lastOrderDate', sortOrder: 'desc' },
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('name');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchCustomers = useCallback(async () => {
    setIsLoading(true);
    try {
      const sort = SORT_MAP[sortBy] ?? { orderBy: 'name', sortOrder: 'asc' as const };
      const params: Record<string, any> = {
        page,
        limit: pageSize,
        orderBy: sort.orderBy,
        sortOrder: sort.sortOrder,
      };

      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      if (selectedStatus !== 'all') {
        params.isActive = selectedStatus === 'active' ? 'true' : 'false';
      }

      const response = await apiClient.get<CustomersListResponse>('/customers', { params });
      const data = response.data;

      if (data) {
        setCustomers(data.customers || []);
        setTotalCount(data.totalCount || 0);
        setTotalPages(data.totalPages || 1);
      } else {
        setCustomers([]);
        setTotalCount(0);
        setTotalPages(1);
      }
    } catch (error) {
      toast.error('Failed to load customers', 'Could not retrieve customer data. Please try again.');
      setCustomers([]);
      setTotalCount(0);
      setTotalPages(1);
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, searchQuery, selectedStatus, sortBy]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, selectedStatus, sortBy, pageSize]);

  const handleSearchChange = (value: string) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setSearchQuery(value);
    }, 300);
  };

  const toggleSelectAll = () => {
    if (selectedCustomers.length === customers.length) {
      setSelectedCustomers([]);
    } else {
      setSelectedCustomers(customers.map(c => c.id));
    }
  };

  const toggleSelectCustomer = (id: string) => {
    setSelectedCustomers(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const handleDeactivateCustomer = async (customerId: string) => {
    const confirmed = window.confirm('Are you sure you want to deactivate this customer?');
    if (!confirmed) return;

    try {
      await apiClient.post(`/customers/${customerId}/deactivate`, {});
      toast.success('Customer deactivated', 'The customer has been deactivated.');
      fetchCustomers();
    } catch (error) {
      toast.error('Deactivation failed', 'Could not deactivate the customer. Please try again.');
    }
  };

  const handleBulkUpdate = async (updates: Record<string, any>) => {
    setBulkLoading(true);
    try {
      await apiClient.post('/customers/bulk-update', {
        customerIds: selectedCustomers,
        updates,
      });
      toast.success('Customers updated', `Successfully updated ${selectedCustomers.length} customers.`);
      setSelectedCustomers([]);
      setShowBulkEdit(false);
      fetchCustomers();
    } catch (error) {
      toast.error('Bulk update failed', 'Could not update the selected customers. Please try again.');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkDeactivate = async () => {
    const confirmed = window.confirm(
      `Are you sure you want to deactivate ${selectedCustomers.length} customer(s)?`
    );
    if (!confirmed) return;

    setBulkLoading(true);
    try {
      await apiClient.post('/customers/bulk-deactivate', {
        customerIds: selectedCustomers,
      });
      toast.success('Customers deactivated', `Successfully deactivated ${selectedCustomers.length} customers.`);
      setSelectedCustomers([]);
      fetchCustomers();
    } catch (error) {
      toast.error('Deactivation failed', 'Could not deactivate the selected customers. Please try again.');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkExport = async () => {
    setBulkLoading(true);
    try {
      const response = await apiClient.post<string>('/customers/bulk-export', {
        customerIds: selectedCustomers,
      });
      const csvData = response.data || '';
      const blob = new Blob([csvData], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `customers-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Export complete', `Exported ${selectedCustomers.length} customers.`);
      setSelectedCustomers([]);
    } catch (error) {
      toast.error('Export failed', 'Could not export the selected customers. Please try again.');
    } finally {
      setBulkLoading(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const stats = {
    total: totalCount,
    active: customers.filter(c => c.status === 'active').length,
    totalRevenue: customers.reduce((sum, c) => sum + c.totalSpent, 0),
    avgSpend: customers.length > 0 ? customers.reduce((sum, c) => sum + c.totalSpent, 0) / customers.length : 0,
  };

  if (isLoading && customers.length === 0) {
    return <SkeletonCustomers />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Customers</h1>
          <p className="text-muted-foreground mt-1">
            Manage your customer database
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
          <Link href="/customers/new" className="cursor-pointer">
            <Button className="cursor-pointer">
              <Plus className="w-4 h-4 mr-2" />
              Add Customer
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Customers</p>
                <p className="text-xl font-bold text-foreground">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="text-xl font-bold text-foreground">{stats.active}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-500/10 rounded-lg flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <p className="text-xl font-bold text-foreground">${stats.totalRevenue.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-500/10 rounded-lg flex items-center justify-center">
                <ShoppingBag className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg. Spend</p>
                <p className="text-xl font-bold text-foreground">${stats.avgSpend.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by name, email, or phone..."
                defaultValue={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background cursor-pointer"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background cursor-pointer"
              >
                <option value="name">Sort by Name</option>
                <option value="spent">Sort by Spent</option>
                <option value="orders">Sort by Orders</option>
                <option value="recent">Sort by Recent</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      <BulkActionBar
        selectedCount={selectedCustomers.length}
        onClearSelection={() => setSelectedCustomers([])}
        actions={[
          {
            label: 'Edit',
            icon: <Edit className="w-4 h-4" />,
            onClick: () => setShowBulkEdit(true),
            disabled: bulkLoading,
          },
          {
            label: 'Deactivate',
            icon: <UserX className="w-4 h-4" />,
            onClick: handleBulkDeactivate,
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

      {/* Customers List */}
      <Card>
        <CardContent className="p-0">
          {customers.length === 0 && !isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-1">No customers yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {searchQuery || selectedStatus !== 'all'
                  ? 'Try adjusting your filters to find what you are looking for.'
                  : 'Get started by adding your first customer.'}
              </p>
              <Link href="/customers/new" className="cursor-pointer">
                <Button className="cursor-pointer">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Customer
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
                        checked={selectedCustomers.length === customers.length && customers.length > 0}
                        onChange={toggleSelectAll}
                        className="rounded border-input cursor-pointer"
                      />
                    </th>
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground">Customer</th>
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground">Contact</th>
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground">Orders</th>
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground">Total Spent</th>
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground">Points</th>
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground">Last Order</th>
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground">Status</th>
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map(customer => (
                    <tr
                      key={customer.id}
                      className="border-b border-border hover:bg-muted/50 cursor-pointer"
                      onClick={() => setSelectedCustomer(customer)}
                    >
                      <td className="p-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedCustomers.includes(customer.id)}
                          onChange={() => toggleSelectCustomer(customer.id)}
                          className="rounded border-input cursor-pointer"
                        />
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                            <span className="text-primary font-medium">
                              {customer.firstName[0]}{customer.lastName[0]}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-foreground">
                              {customer.firstName} {customer.lastName}
                            </p>
                            {customer.tags.length > 0 && (
                              <div className="flex items-center gap-1 mt-1">
                                {customer.tags.map(tag => (
                                  <span key={tag} className="text-xs px-1.5 py-0.5 bg-primary/10 text-primary rounded">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="text-sm">
                          <p className="text-muted-foreground">{customer.email}</p>
                          {customer.phone && (
                            <p className="text-muted-foreground">{customer.phone}</p>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="font-medium text-foreground">{customer.totalOrders}</span>
                      </td>
                      <td className="p-4">
                        <span className="font-medium text-foreground">${customer.totalSpent.toFixed(2)}</span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1">
                          <Star className="w-4 h-4 text-yellow-500" />
                          <span className="font-medium text-foreground">{customer.loyaltyPoints}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="text-muted-foreground">{formatDate(customer.lastOrderDate)}</span>
                      </td>
                      <td className="p-4">
                        <span className={cn(
                          'text-xs px-2 py-1 rounded-full',
                          customer.status === 'active'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'bg-muted text-muted-foreground'
                        )}>
                          {customer.status}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <button className="p-1 hover:bg-accent rounded cursor-pointer">
                            <Eye className="w-4 h-4 text-muted-foreground" />
                          </button>
                          <Link href={`/customers/${customer.id}/edit`} className="cursor-pointer">
                            <button className="p-1 hover:bg-accent rounded cursor-pointer">
                              <Edit className="w-4 h-4 text-muted-foreground" />
                            </button>
                          </Link>
                          <button
                            className="p-1 hover:bg-accent rounded cursor-pointer"
                            onClick={() => handleDeactivateCustomer(customer.id)}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </button>
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
      {customers.length > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          totalItems={totalCount}
          itemName="customers"
        />
      )}

      {/* Customer Detail Modal */}
      {selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedCustomer(null)}>
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                  <span className="text-primary text-xl font-medium">
                    {selectedCustomer.firstName[0]}{selectedCustomer.lastName[0]}
                  </span>
                </div>
                <div>
                  <CardTitle>{selectedCustomer.firstName} {selectedCustomer.lastName}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Customer since {formatDate(selectedCustomer.createdAt)}
                  </p>
                  {selectedCustomer.tags.length > 0 && (
                    <div className="flex items-center gap-1 mt-2">
                      {selectedCustomer.tags.map(tag => (
                        <span key={tag} className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Contact Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium">{selectedCustomer.email}</p>
                  </div>
                </div>
                {selectedCustomer.phone && (
                  <div className="flex items-center gap-3">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Phone</p>
                      <p className="font-medium">{selectedCustomer.phone}</p>
                    </div>
                  </div>
                )}
                {selectedCustomer.address && (
                  <div className="flex items-center gap-3 col-span-2">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Address</p>
                      <p className="font-medium">
                        {selectedCustomer.address.street}, {selectedCustomer.address.city}, {selectedCustomer.address.state} {selectedCustomer.address.zipCode}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-muted/50 rounded-lg text-center">
                  <ShoppingBag className="w-6 h-6 text-blue-600 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-foreground">{selectedCustomer.totalOrders}</p>
                  <p className="text-sm text-muted-foreground">Total Orders</p>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg text-center">
                  <DollarSign className="w-6 h-6 text-green-600 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-foreground">${selectedCustomer.totalSpent.toFixed(2)}</p>
                  <p className="text-sm text-muted-foreground">Total Spent</p>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg text-center">
                  <Star className="w-6 h-6 text-yellow-500 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-foreground">{selectedCustomer.loyaltyPoints}</p>
                  <p className="text-sm text-muted-foreground">Loyalty Points</p>
                </div>
              </div>

              {/* Last Order */}
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Last Order</p>
                    <p className="font-medium">{formatDate(selectedCustomer.lastOrderDate)}</p>
                  </div>
                </div>
                <Link href={`/orders?customer=${selectedCustomer.id}`} className="cursor-pointer">
                  <Button variant="outline" size="sm" className="cursor-pointer">
                    View Orders
                  </Button>
                </Link>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-4">
                <Link href={`/customers/${selectedCustomer.id}/edit`} className="flex-1 cursor-pointer">
                  <Button variant="outline" className="w-full cursor-pointer">
                    <Edit className="w-4 h-4 mr-2" />
                    Edit Customer
                  </Button>
                </Link>
                <Link href={`/pos?customer=${selectedCustomer.id}`} className="flex-1 cursor-pointer">
                  <Button className="w-full cursor-pointer">
                    <ShoppingBag className="w-4 h-4 mr-2" />
                    New Order
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Bulk Edit Modal */}
      <BulkEditModal
        isOpen={showBulkEdit}
        onClose={() => setShowBulkEdit(false)}
        onSubmit={handleBulkUpdate}
        selectedCount={selectedCustomers.length}
        entityName="Customers"
        isLoading={bulkLoading}
        fields={[
          {
            key: 'tags',
            label: 'Tags',
            type: 'text',
            placeholder: 'Enter tags (comma-separated)',
          },
          {
            key: 'notes',
            label: 'Notes',
            type: 'text',
            placeholder: 'Enter notes',
          },
        ]}
      />
    </div>
  );
}
