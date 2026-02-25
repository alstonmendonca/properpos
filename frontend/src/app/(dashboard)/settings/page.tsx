'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Settings,
  Building2,
  Users,
  CreditCard,
  Bell,
  Palette,
  Globe,
  Shield,
  Plug,
  Receipt,
  ChevronRight,
  Save,
  Upload,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore, useUIStore } from '@/store';

interface OrganizationSettings {
  name: string;
  email: string;
  phone: string;
  website: string;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  logo?: string;
  timezone: string;
  currency: string;
  taxId: string;
}

export default function SettingsPage() {
  const tenant = useAuthStore(s => s.tenant);
  const addToast = useUIStore(s => s.addToast);
  const [activeSection, setActiveSection] = useState('general');
  const [isLoading, setIsLoading] = useState(false);

  const [settings, setSettings] = useState<OrganizationSettings>({
    name: tenant?.name || '',
    email: 'contact@restaurant.com',
    phone: '+1 (555) 123-4567',
    website: 'www.restaurant.com',
    address: {
      street: '123 Main Street',
      city: 'New York',
      state: 'NY',
      zipCode: '10001',
      country: 'United States',
    },
    timezone: 'America/New_York',
    currency: 'USD',
    taxId: '',
  });

  const sections = [
    { id: 'general', label: 'General', icon: Building2, description: 'Basic organization information' },
    { id: 'users', label: 'Users & Roles', icon: Users, description: 'Manage team members', href: '/settings/users' },
    { id: 'billing', label: 'Billing', icon: CreditCard, description: 'Subscription and payments', href: '/settings/billing' },
    { id: 'notifications', label: 'Notifications', icon: Bell, description: 'Alert preferences', href: '/settings/notifications' },
    { id: 'appearance', label: 'Appearance', icon: Palette, description: 'Theme and branding' },
    { id: 'localization', label: 'Localization', icon: Globe, description: 'Language and regional settings' },
    { id: 'security', label: 'Security', icon: Shield, description: 'Authentication and access', href: '/settings/security' },
    { id: 'integrations', label: 'Integrations', icon: Plug, description: 'Connected services', href: '/settings/integrations' },
    { id: 'receipts', label: 'Receipts', icon: Receipt, description: 'Receipt templates and printing' },
  ];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;

    if (name.startsWith('address.')) {
      const addressField = name.split('.')[1] as string;
      setSettings(prev => ({
        ...prev,
        address: { ...prev.address, [addressField]: value },
      }));
    } else {
      setSettings(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      // API call would go here
      await new Promise(resolve => setTimeout(resolve, 1000));

      addToast({
        type: 'success',
        title: 'Settings saved',
        message: 'Your changes have been saved successfully',
      });
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Failed to save settings',
        message: 'Please try again',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your organization settings and preferences
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <Card className="lg:col-span-1 h-fit">
          <CardContent className="p-2">
            <nav className="space-y-1">
              {sections.map(section => {
                const Icon = section.icon;
                if (section.href) {
                  return (
                    <Link
                      key={section.id}
                      href={section.href}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors text-foreground hover:bg-accent cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="w-4 h-4" />
                        <span className="font-medium">{section.label}</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </Link>
                  );
                }
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors cursor-pointer',
                      activeSection === section.id
                        ? 'bg-primary text-white'
                        : 'text-foreground hover:bg-accent'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="font-medium">{section.label}</span>
                  </button>
                );
              })}
            </nav>
          </CardContent>
        </Card>

        {/* Main Content */}
        <div className="lg:col-span-3 space-y-6">
          {/* General Settings */}
          {activeSection === 'general' && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Organization Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Logo Upload */}
                  <div className="flex items-center gap-6">
                    <div className="w-24 h-24 bg-muted rounded-lg flex items-center justify-center">
                      <Building2 className="w-10 h-10 text-muted-foreground" />
                    </div>
                    <div>
                      <Button variant="outline" size="sm">
                        <Upload className="w-4 h-4 mr-2" />
                        Upload Logo
                      </Button>
                      <p className="text-xs text-muted-foreground mt-1">
                        Recommended: 200x200px, PNG or JPG
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-foreground mb-1">
                        Organization Name
                      </label>
                      <input
                        type="text"
                        name="name"
                        value={settings.name}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        name="email"
                        value={settings.email}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        Phone
                      </label>
                      <input
                        type="tel"
                        name="phone"
                        value={settings.phone}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        Website
                      </label>
                      <input
                        type="url"
                        name="website"
                        value={settings.website}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        Tax ID / VAT Number
                      </label>
                      <input
                        type="text"
                        name="taxId"
                        value={settings.taxId}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Address</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Street Address
                    </label>
                    <input
                      type="text"
                      name="address.street"
                      value={settings.address.street}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        City
                      </label>
                      <input
                        type="text"
                        name="address.city"
                        value={settings.address.city}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        State / Province
                      </label>
                      <input
                        type="text"
                        name="address.state"
                        value={settings.address.state}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        ZIP / Postal Code
                      </label>
                      <input
                        type="text"
                        name="address.zipCode"
                        value={settings.address.zipCode}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        Country
                      </label>
                      <select
                        name="address.country"
                        value={settings.address.country}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background cursor-pointer"
                      >
                        <option value="United States">United States</option>
                        <option value="Canada">Canada</option>
                        <option value="United Kingdom">United Kingdom</option>
                        <option value="Australia">Australia</option>
                      </select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={isLoading}>
                  <Save className="w-4 h-4 mr-2" />
                  {isLoading ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </>
          )}

          {/* Appearance Settings */}
          {activeSection === 'appearance' && (
            <Card>
              <CardHeader>
                <CardTitle>Appearance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-3">
                    Theme
                  </label>
                  <div className="grid grid-cols-3 gap-4">
                    {['light', 'dark', 'system'].map(theme => (
                      <button
                        key={theme}
                        className={cn(
                          'p-4 border rounded-lg text-center transition-colors',
                          'border-border hover:border-primary cursor-pointer'
                        )}
                      >
                        <div className={cn(
                          'w-12 h-12 mx-auto rounded-lg mb-2',
                          theme === 'light' ? 'bg-white border border-gray-200' :
                          theme === 'dark' ? 'bg-gray-900' :
                          'bg-gradient-to-br from-white to-gray-900'
                        )} />
                        <span className="text-sm font-medium capitalize">{theme}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-3">
                    Primary Color
                  </label>
                  <div className="flex items-center gap-3">
                    {['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6'].map(color => (
                      <button
                        key={color}
                        className="w-8 h-8 rounded-full border-2 border-white shadow-md cursor-pointer"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <Button onClick={handleSave} disabled={isLoading}>
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Localization Settings */}
          {activeSection === 'localization' && (
            <Card>
              <CardHeader>
                <CardTitle>Localization</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Timezone
                  </label>
                  <select
                    name="timezone"
                    value={settings.timezone}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background cursor-pointer"
                  >
                    <option value="America/New_York">Eastern Time (ET)</option>
                    <option value="America/Chicago">Central Time (CT)</option>
                    <option value="America/Denver">Mountain Time (MT)</option>
                    <option value="America/Los_Angeles">Pacific Time (PT)</option>
                    <option value="Europe/London">London (GMT)</option>
                    <option value="Europe/Paris">Paris (CET)</option>
                    <option value="Asia/Tokyo">Tokyo (JST)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Currency
                  </label>
                  <select
                    name="currency"
                    value={settings.currency}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background cursor-pointer"
                  >
                    <option value="USD">US Dollar (USD)</option>
                    <option value="EUR">Euro (EUR)</option>
                    <option value="GBP">British Pound (GBP)</option>
                    <option value="CAD">Canadian Dollar (CAD)</option>
                    <option value="AUD">Australian Dollar (AUD)</option>
                    <option value="JPY">Japanese Yen (JPY)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Language
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background cursor-pointer"
                  >
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                    <option value="ja">Japanese</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Date Format
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background cursor-pointer"
                  >
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  </select>
                </div>

                <div className="flex justify-end pt-4">
                  <Button onClick={handleSave} disabled={isLoading}>
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Receipts Settings */}
          {activeSection === 'receipts' && (
            <Card>
              <CardHeader>
                <CardTitle>Receipt Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Receipt Header Text
                  </label>
                  <textarea
                    rows={3}
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background"
                    placeholder="Text that appears at the top of receipts"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Receipt Footer Text
                  </label>
                  <textarea
                    rows={3}
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background"
                    placeholder="Thank you message, return policy, etc."
                    defaultValue="Thank you for your purchase!"
                  />
                </div>

                <div className="space-y-3">
                  <label className="block text-sm font-medium text-foreground">
                    Receipt Options
                  </label>
                  <label className="flex items-center gap-3">
                    <input type="checkbox" defaultChecked className="rounded border-input cursor-pointer" />
                    <span className="text-sm text-foreground">Show logo on receipt</span>
                  </label>
                  <label className="flex items-center gap-3">
                    <input type="checkbox" defaultChecked className="rounded border-input cursor-pointer" />
                    <span className="text-sm text-foreground">Show tax breakdown</span>
                  </label>
                  <label className="flex items-center gap-3">
                    <input type="checkbox" defaultChecked className="rounded border-input cursor-pointer" />
                    <span className="text-sm text-foreground">Print automatically after payment</span>
                  </label>
                  <label className="flex items-center gap-3">
                    <input type="checkbox" className="rounded border-input cursor-pointer" />
                    <span className="text-sm text-foreground">Email receipt by default</span>
                  </label>
                </div>

                <div className="flex justify-end pt-4">
                  <Button onClick={handleSave} disabled={isLoading}>
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
