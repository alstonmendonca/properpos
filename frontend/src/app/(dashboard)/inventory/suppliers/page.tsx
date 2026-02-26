'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Search,
  Plus,
  Edit,
  Trash2,
  Building2,
  Phone,
  Mail,
  MapPin,
  Package,
  DollarSign,
  Clock,
  MoreVertical,
  FileText,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useUIStore } from '@/store';
import { apiClient } from '@/lib/api-client';

interface Supplier {
  id: string;
  name: string;
  code: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  paymentTerms: string;
  leadTime: number; // days
  minOrderValue: number;
  status: 'active' | 'inactive';
  totalOrders: number;
  totalSpent: number;
  lastOrderDate?: string;
  notes?: string;
  createdAt: string;
}

export default function SuppliersPage() {
  const addToast = useUIStore(s => s.addToast);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchSuppliers = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await apiClient.get<any>('/inventory/suppliers');
      const data = response.data;
      if (Array.isArray(data)) {
        setSuppliers(data);
      } else if (data && Array.isArray(data.suppliers)) {
        setSuppliers(data.suppliers);
      } else if (data && Array.isArray(data.items)) {
        setSuppliers(data.items);
      } else {
        setSuppliers([]);
      }
    } catch (error: any) {
      addToast({ type: 'error', title: 'Failed to load suppliers', message: error?.message || 'Please try again later.' });
      setSuppliers([]);
    } finally {
      setIsLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  const handleDelete = async (supplierId: string) => {
    if (!confirm('Are you sure you want to delete this supplier?')) return;
    try {
      setDeletingId(supplierId);
      await apiClient.delete(`/inventory/suppliers/${supplierId}`);
      setSuppliers(prev => prev.filter(s => s.id !== supplierId));
      addToast({ type: 'success', title: 'Supplier deleted', message: 'The supplier has been removed.' });
    } catch (error: any) {
      addToast({ type: 'error', title: 'Failed to delete supplier', message: error?.message || 'Please try again.' });
    } finally {
      setDeletingId(null);
    }
  };

  const handleSave = async (supplierData: Supplier) => {
    try {
      if (editingSupplier) {
        const response = await apiClient.put<any>(`/inventory/suppliers/${editingSupplier.id}`, supplierData);
        const updated = response.data || supplierData;
        setSuppliers(prev => prev.map(s => s.id === editingSupplier.id ? { ...s, ...updated } : s));
        addToast({ type: 'success', title: 'Supplier updated', message: `${supplierData.name} has been updated.` });
      } else {
        const response = await apiClient.post<any>('/inventory/suppliers', supplierData);
        const created = response.data || { ...supplierData, id: Date.now().toString() };
        setSuppliers(prev => [...prev, created]);
        addToast({ type: 'success', title: 'Supplier created', message: `${supplierData.name} has been added.` });
      }
      setShowModal(false);
      setEditingSupplier(null);
    } catch (error: any) {
      addToast({
        type: 'error',
        title: editingSupplier ? 'Failed to update supplier' : 'Failed to create supplier',
        message: error?.message || 'Please try again.',
      });
    }
  };

  const filteredSuppliers = suppliers.filter(supplier => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!supplier.name.toLowerCase().includes(query) &&
          !supplier.code.toLowerCase().includes(query) &&
          !supplier.contactPerson.toLowerCase().includes(query)) {
        return false;
      }
    }
    if (selectedStatus !== 'all' && supplier.status !== selectedStatus) {
      return false;
    }
    return true;
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const stats = {
    total: suppliers.length,
    active: suppliers.filter(s => s.status === 'active').length,
    totalSpent: suppliers.reduce((sum, s) => sum + (s.totalSpent || 0), 0),
    totalOrders: suppliers.reduce((sum, s) => sum + (s.totalOrders || 0), 0),
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
          <h1 className="text-2xl font-bold text-foreground">Suppliers</h1>
          <p className="text-muted-foreground mt-1">
            Manage your supplier relationships
          </p>
        </div>
        <Button onClick={() => { setEditingSupplier(null); setShowModal(true); }} className="cursor-pointer">
          <Plus className="w-4 h-4 mr-2" />
          Add Supplier
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
                <Building2 className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Suppliers</p>
                <p className="text-xl font-bold text-foreground">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 dark:bg-green-900/20 rounded-lg flex items-center justify-center">
                <Building2 className="w-5 h-5 text-green-600" />
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
              <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/20 rounded-lg flex items-center justify-center">
                <Package className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Orders</p>
                <p className="text-xl font-bold text-foreground">{stats.totalOrders}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/20 rounded-lg flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Spent</p>
                <p className="text-xl font-bold text-foreground">{formatCurrency(stats.totalSpent)}</p>
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
                placeholder="Search suppliers..."
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
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Suppliers List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredSuppliers.map(supplier => (
          <Card key={supplier.id} className="overflow-hidden">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{supplier.name}</h3>
                    <p className="text-sm text-muted-foreground">{supplier.code}</p>
                  </div>
                </div>
                <span className={cn(
                  'text-xs px-2 py-1 rounded-full',
                  supplier.status === 'active'
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'bg-muted text-muted-foreground'
                )}>
                  {supplier.status}
                </span>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">{supplier.email}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">{supplier.phone}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Lead time: {supplier.leadTime} days</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 p-3 bg-muted/50 rounded-lg mb-4">
                <div className="text-center">
                  <p className="text-lg font-bold text-foreground">{supplier.totalOrders || 0}</p>
                  <p className="text-xs text-muted-foreground">Orders</p>
                </div>
                <div className="text-center border-x border-border">
                  <p className="text-lg font-bold text-foreground">{formatCurrency(supplier.totalSpent || 0)}</p>
                  <p className="text-xs text-muted-foreground">Total Spent</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-foreground">{supplier.paymentTerms}</p>
                  <p className="text-xs text-muted-foreground">Terms</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="flex-1 cursor-pointer" onClick={() => { setEditingSupplier(supplier); setShowModal(true); }}>
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </Button>
                <Link href={`/inventory/purchase-orders?supplier=${supplier.id}`}>
                  <Button variant="outline" size="sm" className="cursor-pointer">
                    <FileText className="w-4 h-4 mr-2" />
                    Orders
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 cursor-pointer"
                  disabled={deletingId === supplier.id}
                  onClick={() => handleDelete(supplier.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {filteredSuppliers.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No suppliers found</h3>
            <p className="text-muted-foreground mb-4">Add your first supplier to start managing your supply chain</p>
            <Button onClick={() => setShowModal(true)} className="cursor-pointer">
              <Plus className="w-4 h-4 mr-2" />
              Add Supplier
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Supplier Modal */}
      {showModal && (
        <SupplierModal
          supplier={editingSupplier}
          onClose={() => { setShowModal(false); setEditingSupplier(null); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function SupplierModal({ supplier, onClose, onSave }: { supplier: Supplier | null; onClose: () => void; onSave: (s: Supplier) => Promise<void> }) {
  const [form, setForm] = useState<Partial<Supplier>>(supplier || {
    name: '', code: '', contactPerson: '', email: '', phone: '',
    address: { street: '', city: '', state: '', zipCode: '', country: 'United States' },
    paymentTerms: 'Net 30', leadTime: 3, minOrderValue: 0, status: 'active',
    totalOrders: 0, totalSpent: 0, createdAt: new Date().toISOString(),
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name.startsWith('address.')) {
      const field = name.split('.')[1] as string;
      setForm(prev => ({ ...prev, address: { ...prev.address!, [field]: value } }));
    } else {
      setForm(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSave(form as Supplier);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <CardHeader>
          <CardTitle>{supplier ? 'Edit Supplier' : 'Add Supplier'}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Supplier Name *</label>
                <input type="text" name="name" value={form.name} onChange={handleChange} required className="w-full px-3 py-2 border rounded-lg bg-background border-border" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Supplier Code</label>
                <input type="text" name="code" value={form.code} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg bg-background border-border" placeholder="Auto-generated" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Contact Person</label>
                <input type="text" name="contactPerson" value={form.contactPerson} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg bg-background border-border" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email *</label>
                <input type="email" name="email" value={form.email} onChange={handleChange} required className="w-full px-3 py-2 border rounded-lg bg-background border-border" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Phone</label>
              <input type="tel" name="phone" value={form.phone} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg bg-background border-border" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Street Address</label>
              <input type="text" name="address.street" value={form.address?.street} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg bg-background border-border" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">City</label>
                <input type="text" name="address.city" value={form.address?.city} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg bg-background border-border" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">State</label>
                <input type="text" name="address.state" value={form.address?.state} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg bg-background border-border" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">ZIP Code</label>
                <input type="text" name="address.zipCode" value={form.address?.zipCode} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg bg-background border-border" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Payment Terms</label>
                <select name="paymentTerms" value={form.paymentTerms} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg bg-background border-border cursor-pointer">
                  <option value="Net 7">Net 7</option>
                  <option value="Net 15">Net 15</option>
                  <option value="Net 30">Net 30</option>
                  <option value="Net 45">Net 45</option>
                  <option value="Net 60">Net 60</option>
                  <option value="COD">COD</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Lead Time (days)</label>
                <input type="number" name="leadTime" value={form.leadTime} onChange={handleChange} min="0" className="w-full px-3 py-2 border rounded-lg bg-background border-border" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Min Order Value</label>
                <input type="number" name="minOrderValue" value={form.minOrderValue} onChange={handleChange} min="0" className="w-full px-3 py-2 border rounded-lg bg-background border-border" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select name="status" value={form.status} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg bg-background border-border cursor-pointer">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="flex gap-2 pt-4">
              <Button type="button" variant="outline" className="flex-1 cursor-pointer" onClick={onClose} disabled={isSaving}>Cancel</Button>
              <Button type="submit" className="flex-1 cursor-pointer" disabled={isSaving}>
                {isSaving ? 'Saving...' : (supplier ? 'Save Changes' : 'Create Supplier')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
