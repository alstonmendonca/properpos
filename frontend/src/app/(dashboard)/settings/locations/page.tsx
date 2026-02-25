'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Search,
  Plus,
  Edit,
  Trash2,
  MapPin,
  Phone,
  Clock,
  Settings,
  Users,
  MoreVertical,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useUIStore } from '@/store';

interface Location {
  id: string;
  name: string;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  phone: string;
  email: string;
  businessHours: {
    [key: string]: { open: string; close: string; closed: boolean };
  };
  status: 'active' | 'inactive';
  manager?: string;
  staffCount: number;
  createdAt: string;
}

export default function LocationsSettingsPage() {
  const addToast = useUIStore(s => s.addToast);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    // Mock data fetch
    setTimeout(() => {
      setLocations([
        {
          id: '1',
          name: 'Main Street Location',
          address: { street: '123 Main Street', city: 'New York', state: 'NY', zipCode: '10001', country: 'United States' },
          phone: '+1 (555) 123-4567',
          email: 'main@restaurant.com',
          businessHours: {
            monday: { open: '09:00', close: '22:00', closed: false },
            tuesday: { open: '09:00', close: '22:00', closed: false },
            wednesday: { open: '09:00', close: '22:00', closed: false },
            thursday: { open: '09:00', close: '22:00', closed: false },
            friday: { open: '09:00', close: '23:00', closed: false },
            saturday: { open: '10:00', close: '23:00', closed: false },
            sunday: { open: '10:00', close: '21:00', closed: false },
          },
          status: 'active',
          manager: 'John Doe',
          staffCount: 12,
          createdAt: new Date(Date.now() - 86400000 * 365).toISOString(),
        },
        {
          id: '2',
          name: 'Downtown Branch',
          address: { street: '456 Oak Avenue', city: 'New York', state: 'NY', zipCode: '10002', country: 'United States' },
          phone: '+1 (555) 234-5678',
          email: 'downtown@restaurant.com',
          businessHours: {
            monday: { open: '10:00', close: '21:00', closed: false },
            tuesday: { open: '10:00', close: '21:00', closed: false },
            wednesday: { open: '10:00', close: '21:00', closed: false },
            thursday: { open: '10:00', close: '21:00', closed: false },
            friday: { open: '10:00', close: '22:00', closed: false },
            saturday: { open: '11:00', close: '22:00', closed: false },
            sunday: { open: '00:00', close: '00:00', closed: true },
          },
          status: 'active',
          manager: 'Jane Smith',
          staffCount: 8,
          createdAt: new Date(Date.now() - 86400000 * 180).toISOString(),
        },
        {
          id: '3',
          name: 'Airport Kiosk',
          address: { street: 'Terminal 3, Gate B12', city: 'New York', state: 'NY', zipCode: '11430', country: 'United States' },
          phone: '+1 (555) 345-6789',
          email: 'airport@restaurant.com',
          businessHours: {
            monday: { open: '05:00', close: '23:00', closed: false },
            tuesday: { open: '05:00', close: '23:00', closed: false },
            wednesday: { open: '05:00', close: '23:00', closed: false },
            thursday: { open: '05:00', close: '23:00', closed: false },
            friday: { open: '05:00', close: '23:00', closed: false },
            saturday: { open: '05:00', close: '23:00', closed: false },
            sunday: { open: '05:00', close: '23:00', closed: false },
          },
          status: 'inactive',
          manager: 'Bob Wilson',
          staffCount: 4,
          createdAt: new Date(Date.now() - 86400000 * 30).toISOString(),
        },
      ]);
      setIsLoading(false);
    }, 500);
  }, []);

  const filteredLocations = locations.filter(location => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!location.name.toLowerCase().includes(query) &&
          !location.address.city.toLowerCase().includes(query)) {
        return false;
      }
    }
    return true;
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getTodayHours = (hours: Location['businessHours']) => {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
    const today = days[new Date().getDay()] as string;
    const todayHours = hours[today as keyof typeof hours];
    if (!todayHours || todayHours.closed) return 'Closed';
    return `${todayHours.open} - ${todayHours.close}`;
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-muted rounded w-1/4" />
        <div className="h-12 bg-muted rounded" />
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/settings">
          <Button variant="ghost" size="sm" className="cursor-pointer">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">Locations</h1>
          <p className="text-muted-foreground mt-1">
            Manage your business locations
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} className="cursor-pointer">
          <Plus className="w-4 h-4 mr-2" />
          Add Location
        </Button>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search locations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background"
            />
          </div>
        </CardContent>
      </Card>

      {/* Locations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredLocations.map(location => (
          <Card key={location.id} className={cn(
            'relative overflow-hidden',
            location.status === 'inactive' && 'opacity-75'
          )}>
            <CardContent className="p-6">
              {/* Status Badge */}
              <div className="absolute top-4 right-4">
                <span className={cn(
                  'inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full',
                  location.status === 'active'
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'bg-muted text-muted-foreground'
                )}>
                  {location.status === 'active' ? (
                    <CheckCircle className="w-3 h-3" />
                  ) : (
                    <XCircle className="w-3 h-3" />
                  )}
                  {location.status}
                </span>
              </div>

              {/* Location Info */}
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-foreground">
                  {location.name}
                </h3>
                <div className="flex items-start gap-2 mt-2 text-sm text-muted-foreground">
                  <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>
                    {location.address.street}, {location.address.city}, {location.address.state} {location.address.zipCode}
                  </span>
                </div>
              </div>

              {/* Quick Info */}
              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">{location.phone}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Today: {getTodayHours(location.businessHours)}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">{location.staffCount} staff members</span>
                </div>
              </div>

              {/* Manager */}
              {location.manager && (
                <div className="p-3 bg-muted/50 rounded-lg mb-4">
                  <p className="text-xs text-muted-foreground">Manager</p>
                  <p className="font-medium text-foreground">{location.manager}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 cursor-pointer"
                  onClick={() => setEditingLocation(location)}
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </Button>
                <Button variant="outline" size="sm" className="cursor-pointer">
                  <Settings className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 cursor-pointer">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {filteredLocations.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <MapPin className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              No locations found
            </h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery ? 'Try adjusting your search' : 'Add your first business location'}
            </p>
            <Button onClick={() => setShowCreateModal(true)} className="cursor-pointer">
              <Plus className="w-4 h-4 mr-2" />
              Add Location
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Create/Edit Modal */}
      {(showCreateModal || editingLocation) && (
        <LocationModal
          location={editingLocation}
          onClose={() => {
            setShowCreateModal(false);
            setEditingLocation(null);
          }}
          onSave={(location) => {
            if (editingLocation) {
              setLocations(prev => prev.map(l => l.id === location.id ? location : l));
              addToast({ type: 'success', title: 'Location updated', message: `${location.name} has been updated` });
            } else {
              setLocations(prev => [...prev, { ...location, id: Date.now().toString() }]);
              addToast({ type: 'success', title: 'Location created', message: `${location.name} has been added` });
            }
            setShowCreateModal(false);
            setEditingLocation(null);
          }}
        />
      )}
    </div>
  );
}

interface LocationModalProps {
  location: Location | null;
  onClose: () => void;
  onSave: (location: Location) => void;
}

function LocationModal({ location, onClose, onSave }: LocationModalProps) {
  const [form, setForm] = useState<Partial<Location>>(
    location || {
      name: '',
      address: { street: '', city: '', state: '', zipCode: '', country: 'United States' },
      phone: '',
      email: '',
      businessHours: {
        monday: { open: '09:00', close: '21:00', closed: false },
        tuesday: { open: '09:00', close: '21:00', closed: false },
        wednesday: { open: '09:00', close: '21:00', closed: false },
        thursday: { open: '09:00', close: '21:00', closed: false },
        friday: { open: '09:00', close: '22:00', closed: false },
        saturday: { open: '10:00', close: '22:00', closed: false },
        sunday: { open: '10:00', close: '20:00', closed: false },
      },
      status: 'active',
      manager: '',
      staffCount: 0,
      createdAt: new Date().toISOString(),
    }
  );
  const [activeTab, setActiveTab] = useState<'basic' | 'hours'>('basic');
  const [saving, setSaving] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name.startsWith('address.')) {
      const field = name.split('.')[1] as string;
      setForm(prev => ({
        ...prev,
        address: { ...prev.address!, [field]: value },
      }));
    } else {
      setForm(prev => ({ ...prev, [name]: value }));
    }
  };

  const updateHours = (day: string, field: 'open' | 'close' | 'closed', value: string | boolean) => {
    setForm(prev => {
      const hours = prev.businessHours || {};
      return {
        ...prev,
        businessHours: {
          ...hours,
          [day]: { ...(hours[day] || { open: '09:00', close: '17:00', closed: false }), [field]: value },
        },
      } as Partial<Location>;
    });
  };

  const initialForm: Partial<Location> = {
    name: '',
    address: { street: '', city: '', state: '', zipCode: '', country: 'United States' },
    phone: '',
    email: '',
    businessHours: {
      monday: { open: '09:00', close: '21:00', closed: false },
      tuesday: { open: '09:00', close: '21:00', closed: false },
      wednesday: { open: '09:00', close: '21:00', closed: false },
      thursday: { open: '09:00', close: '21:00', closed: false },
      friday: { open: '09:00', close: '22:00', closed: false },
      saturday: { open: '10:00', close: '22:00', closed: false },
      sunday: { open: '10:00', close: '20:00', closed: false },
    },
    status: 'active',
    manager: '',
    staffCount: 0,
    createdAt: new Date().toISOString(),
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(form as Location);
      setForm(initialForm);
      setActiveTab('basic');
    } finally {
      setSaving(false);
    }
  };

  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <CardHeader>
          <CardTitle>{location ? 'Edit Location' : 'Add New Location'}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Tabs */}
            <div className="flex items-center gap-4 border-b border-border">
              <button
                type="button"
                onClick={() => setActiveTab('basic')}
                className={cn(
                  'pb-3 px-1 text-sm font-medium border-b-2 transition-colors cursor-pointer',
                  activeTab === 'basic'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                Basic Info
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('hours')}
                className={cn(
                  'pb-3 px-1 text-sm font-medium border-b-2 transition-colors cursor-pointer',
                  activeTab === 'hours'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                Business Hours
              </button>
            </div>

            {activeTab === 'basic' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Location Name *
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground"
                    placeholder="Main Street Location"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Street Address *
                  </label>
                  <input
                    type="text"
                    name="address.street"
                    value={form.address?.street}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground"
                    placeholder="123 Main Street"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      City *
                    </label>
                    <input
                      type="text"
                      name="address.city"
                      value={form.address?.city}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      State
                    </label>
                    <input
                      type="text"
                      name="address.state"
                      value={form.address?.state}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      ZIP Code
                    </label>
                    <input
                      type="text"
                      name="address.zipCode"
                      value={form.address?.zipCode}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Phone
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      value={form.phone}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground"
                      placeholder="+1 (555) 123-4567"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={form.email}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Status
                    </label>
                    <select
                      name="status"
                      value={form.status}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground cursor-pointer"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Manager
                  </label>
                  <input
                    type="text"
                    name="manager"
                    value={form.manager}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground"
                    placeholder="Location manager name"
                  />
                </div>
              </div>
            )}

            {activeTab === 'hours' && (
              <div className="space-y-3">
                {days.map(day => (
                  <div key={day} className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
                    <div className="w-28">
                      <span className="font-medium text-foreground capitalize">{day}</span>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!form.businessHours?.[day]?.closed}
                        onChange={(e) => updateHours(day, 'closed', !e.target.checked)}
                        className="rounded border-input cursor-pointer"
                      />
                      <span className="text-sm text-muted-foreground">Open</span>
                    </label>
                    {!form.businessHours?.[day]?.closed && (
                      <>
                        <input
                          type="time"
                          value={form.businessHours?.[day]?.open}
                          onChange={(e) => updateHours(day, 'open', e.target.value)}
                          className="px-2 py-1 border border-border rounded bg-background text-foreground text-sm"
                        />
                        <span className="text-muted-foreground">to</span>
                        <input
                          type="time"
                          value={form.businessHours?.[day]?.close}
                          onChange={(e) => updateHours(day, 'close', e.target.value)}
                          className="px-2 py-1 border border-border rounded bg-background text-foreground text-sm"
                        />
                      </>
                    )}
                    {form.businessHours?.[day]?.closed && (
                      <span className="text-muted-foreground text-sm">Closed</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 pt-4 border-t border-border">
              <Button type="button" variant="outline" className="flex-1 cursor-pointer" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1 cursor-pointer" disabled={saving}>
                {saving ? 'Saving...' : (location ? 'Save Changes' : 'Create Location')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
