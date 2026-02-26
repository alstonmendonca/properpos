'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Search,
  Plug,
  Check,
  X,
  ExternalLink,
  Settings,
  RefreshCw,
  CreditCard,
  Mail,
  MessageSquare,
  Truck,
  BarChart3,
  ShoppingCart,
  Webhook,
  Key,
  AlertTriangle,
  CheckCircle,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useUIStore } from '@/store';
import { apiClient } from '@/lib/api-client';

interface Integration {
  id: string;
  name: string;
  description: string;
  category: 'payment' | 'communication' | 'delivery' | 'analytics' | 'ecommerce' | 'accounting';
  icon: React.ElementType;
  status: 'connected' | 'disconnected' | 'error';
  isAvailable: boolean;
  isPremium: boolean;
  lastSync?: string;
  config?: Record<string, string>;
}

const integrationsList: Integration[] = [
  // Payment Integrations
  { id: 'stripe', name: 'Stripe', description: 'Accept card payments online and in-person', category: 'payment', icon: CreditCard, status: 'disconnected', isAvailable: true, isPremium: false },
  { id: 'square', name: 'Square', description: 'Payment processing and POS hardware', category: 'payment', icon: CreditCard, status: 'disconnected', isAvailable: true, isPremium: false },
  { id: 'paypal', name: 'PayPal', description: 'Accept PayPal and card payments', category: 'payment', icon: CreditCard, status: 'disconnected', isAvailable: true, isPremium: false },

  // Communication
  { id: 'twilio', name: 'Twilio', description: 'SMS notifications and alerts', category: 'communication', icon: MessageSquare, status: 'disconnected', isAvailable: true, isPremium: false },
  { id: 'sendgrid', name: 'SendGrid', description: 'Transactional email delivery', category: 'communication', icon: Mail, status: 'disconnected', isAvailable: true, isPremium: false },
  { id: 'mailchimp', name: 'Mailchimp', description: 'Email marketing campaigns', category: 'communication', icon: Mail, status: 'disconnected', isAvailable: true, isPremium: true },

  // Delivery
  { id: 'doordash', name: 'DoorDash', description: 'DoorDash Drive delivery integration', category: 'delivery', icon: Truck, status: 'disconnected', isAvailable: true, isPremium: true },
  { id: 'ubereats', name: 'Uber Eats', description: 'Uber Eats marketplace integration', category: 'delivery', icon: Truck, status: 'disconnected', isAvailable: true, isPremium: true },
  { id: 'grubhub', name: 'Grubhub', description: 'Grubhub marketplace integration', category: 'delivery', icon: Truck, status: 'disconnected', isAvailable: false, isPremium: true },

  // Analytics
  { id: 'google-analytics', name: 'Google Analytics', description: 'Website and app analytics', category: 'analytics', icon: BarChart3, status: 'disconnected', isAvailable: true, isPremium: false },
  { id: 'mixpanel', name: 'Mixpanel', description: 'Product analytics and user tracking', category: 'analytics', icon: BarChart3, status: 'disconnected', isAvailable: true, isPremium: true },

  // E-commerce
  { id: 'shopify', name: 'Shopify', description: 'Sync products and orders with Shopify', category: 'ecommerce', icon: ShoppingCart, status: 'disconnected', isAvailable: true, isPremium: true },
  { id: 'woocommerce', name: 'WooCommerce', description: 'WordPress e-commerce integration', category: 'ecommerce', icon: ShoppingCart, status: 'disconnected', isAvailable: true, isPremium: true },

  // Accounting
  { id: 'quickbooks', name: 'QuickBooks', description: 'Sync sales and expenses', category: 'accounting', icon: BarChart3, status: 'disconnected', isAvailable: true, isPremium: true },
  { id: 'xero', name: 'Xero', description: 'Cloud accounting integration', category: 'accounting', icon: BarChart3, status: 'disconnected', isAvailable: true, isPremium: true },
];

const categories = [
  { id: 'all', name: 'All Integrations' },
  { id: 'payment', name: 'Payments' },
  { id: 'communication', name: 'Communication' },
  { id: 'delivery', name: 'Delivery' },
  { id: 'analytics', name: 'Analytics' },
  { id: 'ecommerce', name: 'E-commerce' },
  { id: 'accounting', name: 'Accounting' },
];

export default function IntegrationsPage() {
  const addToast = useUIStore(s => s.addToast);
  const [integrations, setIntegrations] = useState<Integration[]>(integrationsList);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [configModal, setConfigModal] = useState<Integration | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [configApiKey, setConfigApiKey] = useState('');
  const [configWebhookSecret, setConfigWebhookSecret] = useState('');

  useEffect(() => {
    const loadIntegrations = async () => {
      try {
        const response = await apiClient.get<any>('/tenants/current/settings');
        const settings = response.data?.data || response.data || {};
        const savedIntegrations = settings.integrations || {};

        // Merge saved integration statuses with static list
        setIntegrations(prev => prev.map(i => {
          const saved = savedIntegrations[i.id];
          if (saved) {
            return { ...i, status: saved.status || i.status, lastSync: saved.lastSync || i.lastSync };
          }
          return i;
        }));
      } catch {
        // Use defaults from static list if settings fail to load
      } finally {
        setIsLoading(false);
      }
    };
    loadIntegrations();
  }, []);

  const filteredIntegrations = integrations.filter(integration => {
    if (searchQuery && !integration.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (selectedCategory !== 'all' && integration.category !== selectedCategory) {
      return false;
    }
    return true;
  });

  const connectedCount = integrations.filter(i => i.status === 'connected').length;
  const errorCount = integrations.filter(i => i.status === 'error').length;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'connected':
        return (
          <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CheckCircle className="w-3 h-3" />
            Connected
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="w-3 h-3" />
            Error
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
            <Clock className="w-3 h-3" />
            Not Connected
          </span>
        );
    }
  };

  const handleConnect = (integration: Integration) => {
    if (integration.isPremium) {
      addToast({
        type: 'warning',
        title: 'Premium Feature',
        message: 'Upgrade to Professional or Enterprise to use this integration',
      });
      return;
    }
    setConfigApiKey('');
    setConfigWebhookSecret('');
    setConfigModal(integration);
  };

  const handleDisconnect = async (integration: Integration) => {
    if (!window.confirm('Are you sure you want to disconnect this integration?')) return;
    try {
      await apiClient.put('/tenants/current/settings', {
        integrations: {
          [integration.id]: {
            status: 'disconnected',
            apiKey: null,
            webhookSecret: null,
          },
        },
      });
      setIntegrations(prev => prev.map(i => {
        if (i.id !== integration.id) return i;
        const { lastSync, ...rest } = i;
        return { ...rest, status: 'disconnected' as const };
      }));
      addToast({
        type: 'success',
        title: 'Disconnected',
        message: `${integration.name} has been disconnected`,
      });
    } catch {
      addToast({
        type: 'error',
        title: 'Disconnect failed',
        message: 'Please try again',
      });
    }
  };

  const formatLastSync = (dateString?: string) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);

    if (minutes < 60) return `${minutes} minutes ago`;
    if (hours < 24) return `${hours} hours ago`;
    return date.toLocaleDateString();
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-muted rounded w-1/4" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-48 bg-muted rounded-lg" />
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
          <h1 className="text-2xl font-bold text-foreground">Integrations</h1>
          <p className="text-muted-foreground mt-1">
            Connect third-party services to extend functionality
          </p>
        </div>
        <Link href="/settings/integrations/webhooks">
          <Button variant="outline" className="cursor-pointer">
            <Webhook className="w-4 h-4 mr-2" />
            Webhooks
          </Button>
        </Link>
        <Link href="/settings/integrations/api-keys">
          <Button variant="outline" className="cursor-pointer">
            <Key className="w-4 h-4 mr-2" />
            API Keys
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
                <Plug className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Available</p>
                <p className="text-xl font-bold text-foreground">{integrations.length}</p>
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
                <p className="text-sm text-muted-foreground">Connected</p>
                <p className="text-xl font-bold text-foreground">{connectedCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={errorCount > 0 ? 'border-destructive/20' : ''}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-destructive/10 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Errors</p>
                <p className="text-xl font-bold text-red-600">{errorCount}</p>
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
                placeholder="Search integrations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-border rounded-lg bg-background text-foreground"
              />
            </div>
            <div className="flex items-center gap-2 overflow-x-auto">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors cursor-pointer',
                    selectedCategory === cat.id
                      ? 'bg-primary text-white'
                      : 'bg-muted text-muted-foreground hover:bg-accent'
                  )}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Integrations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredIntegrations.map(integration => {
          const Icon = integration.icon;
          return (
            <Card key={integration.id} className={cn(
              'relative overflow-hidden',
              !integration.isAvailable && 'opacity-60'
            )}>
              {integration.isPremium && (
                <div className="absolute top-3 right-3">
                  <span className="text-xs px-2 py-0.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full">
                    Premium
                  </span>
                </div>
              )}
              <CardContent className="p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                    <Icon className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground">{integration.name}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-2">{integration.description}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between mb-4">
                  {getStatusBadge(integration.status)}
                  {integration.lastSync && (
                    <span className="text-xs text-muted-foreground">
                      Synced {formatLastSync(integration.lastSync)}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {integration.status === 'connected' ? (
                    <>
                      <Button variant="outline" size="sm" className="flex-1 cursor-pointer" onClick={() => { setConfigApiKey(''); setConfigWebhookSecret(''); setConfigModal(integration); }}>
                        <Settings className="w-4 h-4 mr-2" />
                        Configure
                      </Button>
                      <Button variant="outline" size="sm" className="cursor-pointer" onClick={() => handleDisconnect(integration)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </>
                  ) : integration.status === 'error' ? (
                    <>
                      <Button variant="outline" size="sm" className="flex-1 text-red-600 cursor-pointer" onClick={() => handleConnect(integration)}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Reconnect
                      </Button>
                      <Button variant="outline" size="sm" className="cursor-pointer" onClick={() => { setConfigApiKey(''); setConfigWebhookSecret(''); setConfigModal(integration); }}>
                        <Settings className="w-4 h-4" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      className="flex-1 cursor-pointer"
                      onClick={() => handleConnect(integration)}
                      disabled={!integration.isAvailable}
                    >
                      <Plug className="w-4 h-4 mr-2" />
                      {integration.isAvailable ? 'Connect' : 'Coming Soon'}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Config Modal */}
      {configModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { if (!connecting) setConfigModal(null); }}>
          <Card className="w-full max-w-md" onClick={e => e.stopPropagation()}>
            <CardHeader>
              <CardTitle>Configure {configModal.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">API Key</label>
                <input
                  type="password"
                  className="w-full px-3 py-2 border rounded-lg bg-background border-border"
                  placeholder="Enter your API key"
                  value={configApiKey}
                  onChange={(e) => setConfigApiKey(e.target.value)}
                />
              </div>
              {configModal.id === 'stripe' && (
                <div>
                  <label className="block text-sm font-medium mb-1">Webhook Secret</label>
                  <input
                    type="password"
                    className="w-full px-3 py-2 border rounded-lg bg-background border-border"
                    placeholder="whsec_..."
                    value={configWebhookSecret}
                    onChange={(e) => setConfigWebhookSecret(e.target.value)}
                  />
                </div>
              )}
              <div className="flex gap-2 pt-4">
                <Button variant="outline" className="flex-1 cursor-pointer" onClick={() => setConfigModal(null)} disabled={connecting}>Cancel</Button>
                <Button className="flex-1 cursor-pointer" disabled={!configApiKey.trim() || connecting} onClick={async () => {
                  setConnecting(true);
                  try {
                    await apiClient.put('/tenants/current/settings', {
                      integrations: {
                        [configModal.id]: {
                          apiKey: configApiKey,
                          ...(configWebhookSecret ? { webhookSecret: configWebhookSecret } : {}),
                          status: 'connected',
                          lastSync: new Date().toISOString(),
                        },
                      },
                    });
                    setIntegrations(prev => prev.map(i =>
                      i.id === configModal.id ? { ...i, status: 'connected' as const, lastSync: new Date().toISOString() } : i
                    ));
                    addToast({ type: 'success', title: 'Connected', message: `${configModal.name} has been connected` });
                    setConfigModal(null);
                  } catch (error) {
                    addToast({ type: 'error', title: 'Connection failed', message: 'Please check your credentials and try again' });
                  } finally {
                    setConnecting(false);
                  }
                }}>
                  {connecting ? 'Connecting...' : 'Save & Connect'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {filteredIntegrations.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <Plug className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No integrations found</h3>
            <p className="text-muted-foreground">Try adjusting your search or filters</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
