'use client';

import React, { useState, useEffect } from 'react';
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

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
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

  useEffect(() => {
    // Mock data fetch
    setTimeout(() => {
      setCustomers([
        {
          id: '1',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          phone: '+1 (555) 123-4567',
          address: { street: '123 Main St', city: 'New York', state: 'NY', zipCode: '10001' },
          totalOrders: 24,
          totalSpent: 1250.50,
          loyaltyPoints: 2500,
          lastOrderDate: new Date(Date.now() - 86400000).toISOString(),
          status: 'active',
          createdAt: new Date(Date.now() - 86400000 * 90).toISOString(),
          tags: ['VIP', 'Regular'],
        },
        {
          id: '2',
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane.smith@example.com',
          phone: '+1 (555) 234-5678',
          totalOrders: 15,
          totalSpent: 890.25,
          loyaltyPoints: 1780,
          lastOrderDate: new Date(Date.now() - 86400000 * 3).toISOString(),
          status: 'active',
          createdAt: new Date(Date.now() - 86400000 * 60).toISOString(),
          tags: ['Regular'],
        },
        {
          id: '3',
          firstName: 'Bob',
          lastName: 'Wilson',
          email: 'bob.wilson@example.com',
          phone: '+1 (555) 345-6789',
          address: { street: '456 Oak Ave', city: 'Los Angeles', state: 'CA', zipCode: '90001' },
          totalOrders: 8,
          totalSpent: 420.00,
          loyaltyPoints: 840,
          lastOrderDate: new Date(Date.now() - 86400000 * 7).toISOString(),
          status: 'active',
          createdAt: new Date(Date.now() - 86400000 * 45).toISOString(),
          tags: [],
        },
        {
          id: '4',
          firstName: 'Alice',
          lastName: 'Brown',
          email: 'alice.brown@example.com',
          totalOrders: 3,
          totalSpent: 156.75,
          loyaltyPoints: 310,
          lastOrderDate: new Date(Date.now() - 86400000 * 30).toISOString(),
          status: 'inactive',
          createdAt: new Date(Date.now() - 86400000 * 120).toISOString(),
          tags: [],
        },
        {
          id: '5',
          firstName: 'Charlie',
          lastName: 'Davis',
          email: 'charlie.davis@example.com',
          phone: '+1 (555) 456-7890',
          totalOrders: 45,
          totalSpent: 3200.00,
          loyaltyPoints: 6400,
          lastOrderDate: new Date(Date.now() - 86400000).toISOString(),
          status: 'active',
          createdAt: new Date(Date.now() - 86400000 * 180).toISOString(),
          tags: ['VIP', 'Top Spender'],
        },
      ]);
      setIsLoading(false);
    }, 500);
  }, []);

  const toggleSelectAll = () => {
    if (selectedCustomers.length === filteredCustomers.length) {
      setSelectedCustomers([]);
    } else {
      setSelectedCustomers(filteredCustomers.map(c => c.id));
    }
  };

  const toggleSelectCustomer = (id: string) => {
    setSelectedCustomers(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const refreshCustomers = () => {
    // Re-trigger the mock data fetch (in production, this would re-fetch from API)
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
    }, 300);
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
      refreshCustomers();
    } catch (error) {
      console.error('Bulk update failed:', error);
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
      refreshCustomers();
    } catch (error) {
      console.error('Bulk deactivate failed:', error);
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
      console.error('Bulk export failed:', error);
      toast.error('Export failed', 'Could not export the selected customers. Please try again.');
    } finally {
      setBulkLoading(false);
    }
  };

  const filteredCustomers = customers
    .filter(customer => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const fullName = `${customer.firstName} ${customer.lastName}`.toLowerCase();
        if (!fullName.includes(query) &&
            !customer.email.toLowerCase().includes(query) &&
            !customer.phone?.includes(query)) {
          return false;
        }
      }
      if (selectedStatus !== 'all' && customer.status !== selectedStatus) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'name': return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
        case 'spent': return b.totalSpent - a.totalSpent;
        case 'orders': return b.totalOrders - a.totalOrders;
        case 'recent': return new Date(b.lastOrderDate || 0).getTime() - new Date(a.lastOrderDate || 0).getTime();
        default: return 0;
      }
    });

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / pageSize));
  const paginatedCustomers = filteredCustomers.slice((page - 1) * pageSize, page * pageSize);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, selectedStatus, sortBy, pageSize]);

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Stats
  const stats = {
    total: customers.length,
    active: customers.filter(c => c.status === 'active').length,
    totalRevenue: customers.reduce((sum, c) => sum + c.totalSpent, 0),
    avgSpend: customers.length > 0 ? customers.reduce((sum, c) => sum + c.totalSpent, 0) / customers.length : 0,
  };

  if (isLoading) {
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
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
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
          {filteredCustomers.length === 0 ? (
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
                        checked={selectedCustomers.length === filteredCustomers.length && filteredCustomers.length > 0}
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
                  {paginatedCustomers.map(customer => (
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
                          <button className="p-1 hover:bg-accent rounded cursor-pointer">
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
      {filteredCustomers.length > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          totalItems={filteredCustomers.length}
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
