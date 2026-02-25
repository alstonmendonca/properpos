'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CreditCard,
  Check,
  Download,
  Calendar,
  AlertTriangle,
  Zap,
  Users,
  Package,
  Building2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useUIStore } from '@/store';

interface Subscription {
  plan: 'starter' | 'professional' | 'enterprise';
  status: 'active' | 'past_due' | 'cancelled';
  currentPeriodEnd: string;
  price: number;
  interval: 'monthly' | 'yearly';
}

interface Invoice {
  id: string;
  date: string;
  amount: number;
  status: 'paid' | 'pending' | 'failed';
  description: string;
}

interface PaymentMethod {
  id: string;
  type: 'card';
  brand: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  isDefault: boolean;
}

const plans = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'Perfect for small businesses',
    monthlyPrice: 29,
    yearlyPrice: 290,
    features: [
      '1 Location',
      '2 Users',
      '1,000 Products',
      'Basic Reports',
      'Email Support',
    ],
  },
  {
    id: 'professional',
    name: 'Professional',
    description: 'For growing businesses',
    monthlyPrice: 79,
    yearlyPrice: 790,
    popular: true,
    features: [
      '5 Locations',
      '10 Users',
      'Unlimited Products',
      'Advanced Reports',
      'Priority Support',
      'Inventory Management',
      'Customer Loyalty',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'For large organizations',
    monthlyPrice: 199,
    yearlyPrice: 1990,
    features: [
      'Unlimited Locations',
      'Unlimited Users',
      'Unlimited Products',
      'Custom Reports',
      'Dedicated Support',
      'API Access',
      'Custom Integrations',
      'SLA Guarantee',
    ],
  },
];

export default function BillingSettingsPage() {
  const addToast = useUIStore(s => s.addToast);
  const [isLoading, setIsLoading] = useState(true);
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('monthly');

  const [subscription, setSubscription] = useState<Subscription>({
    plan: 'professional',
    status: 'active',
    currentPeriodEnd: new Date(Date.now() + 86400000 * 30).toISOString(),
    price: 79,
    interval: 'monthly',
  });

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  useEffect(() => {
    setTimeout(() => {
      setInvoices([
        { id: 'INV-001', date: new Date(Date.now() - 86400000 * 30).toISOString(), amount: 79, status: 'paid', description: 'Professional Plan - Monthly' },
        { id: 'INV-002', date: new Date(Date.now() - 86400000 * 60).toISOString(), amount: 79, status: 'paid', description: 'Professional Plan - Monthly' },
        { id: 'INV-003', date: new Date(Date.now() - 86400000 * 90).toISOString(), amount: 79, status: 'paid', description: 'Professional Plan - Monthly' },
      ]);

      setPaymentMethods([
        { id: 'pm_1', type: 'card', brand: 'Visa', last4: '4242', expiryMonth: 12, expiryYear: 2025, isDefault: true },
      ]);

      setIsLoading(false);
    }, 500);
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const currentPlan = plans.find(p => p.id === subscription.plan);

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-muted rounded w-1/4" />
        <div className="h-48 bg-muted rounded-lg" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-64 bg-muted rounded-lg" />
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
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Billing</h1>
          <p className="text-muted-foreground mt-1">
            Manage your subscription and payment methods
          </p>
        </div>
      </div>

      {/* Current Plan */}
      <Card>
        <CardHeader>
          <CardTitle>Current Plan</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                <Zap className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-foreground">
                  {currentPlan?.name} Plan
                </h3>
                <p className="text-muted-foreground">
                  ${subscription.price}/{subscription.interval === 'monthly' ? 'month' : 'year'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Next billing date</p>
                <p className="font-medium text-foreground">
                  {formatDate(subscription.currentPeriodEnd)}
                </p>
              </div>
              <span className={cn(
                'px-3 py-1 rounded-full text-sm font-medium',
                subscription.status === 'active'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : subscription.status === 'past_due'
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  : 'bg-destructive/10 text-destructive'
              )}>
                {subscription.status === 'active' ? 'Active' : subscription.status === 'past_due' ? 'Past Due' : 'Cancelled'}
              </span>
            </div>
          </div>

          {/* Usage Stats */}
          <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-border">
            <div>
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Building2 className="w-4 h-4" />
                <span className="text-sm">Locations</span>
              </div>
              <p className="text-lg font-bold text-foreground">2 / 5</p>
            </div>
            <div>
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Users className="w-4 h-4" />
                <span className="text-sm">Users</span>
              </div>
              <p className="text-lg font-bold text-foreground">4 / 10</p>
            </div>
            <div>
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Package className="w-4 h-4" />
                <span className="text-sm">Products</span>
              </div>
              <p className="text-lg font-bold text-foreground">156 / Unlimited</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Plans */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Available Plans</h2>
          <div className="flex items-center gap-2 bg-muted p-1 rounded-lg">
            <button
              onClick={() => setBillingInterval('monthly')}
              className={cn(
                'px-3 py-1 rounded text-sm font-medium transition-colors cursor-pointer',
                billingInterval === 'monthly'
                  ? 'bg-background text-foreground shadow'
                  : 'text-muted-foreground'
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingInterval('yearly')}
              className={cn(
                'px-3 py-1 rounded text-sm font-medium transition-colors cursor-pointer',
                billingInterval === 'yearly'
                  ? 'bg-background text-foreground shadow'
                  : 'text-muted-foreground'
              )}
            >
              Yearly <span className="text-green-600 text-xs">Save 17%</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map(plan => {
            const price = billingInterval === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice;
            const isCurrentPlan = plan.id === subscription.plan;

            return (
              <Card
                key={plan.id}
                className={cn(
                  'relative',
                  plan.popular && 'border-primary',
                  isCurrentPlan && 'ring-2 ring-primary'
                )}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-primary text-white text-xs px-3 py-1 rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}
                <CardContent className="p-6">
                  <h3 className="text-lg font-bold text-foreground">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{plan.description}</p>

                  <div className="mb-6">
                    <span className="text-3xl font-bold text-foreground">${price}</span>
                    <span className="text-muted-foreground">
                      /{billingInterval === 'monthly' ? 'month' : 'year'}
                    </span>
                  </div>

                  <ul className="space-y-3 mb-6">
                    {plan.features.map(feature => (
                      <li key={feature} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Check className="w-4 h-4 text-green-500" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <Button
                    variant={isCurrentPlan ? 'outline' : plan.popular ? 'default' : 'outline'}
                    className="w-full cursor-pointer"
                    disabled={isCurrentPlan}
                  >
                    {isCurrentPlan ? 'Current Plan' : 'Upgrade'}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Payment Methods */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Payment Methods</CardTitle>
          <Button variant="outline" size="sm">
            <CreditCard className="w-4 h-4 mr-2" />
            Add Card
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {paymentMethods.map(method => (
              <div
                key={method.id}
                className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-8 bg-background rounded flex items-center justify-center border border-border">
                    <CreditCard className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">
                      {method.brand} •••• {method.last4}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Expires {method.expiryMonth}/{method.expiryYear}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {method.isDefault && (
                    <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded">
                      Default
                    </span>
                  )}
                  <Button variant="ghost" size="sm">
                    Edit
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Billing History */}
      <Card>
        <CardHeader>
          <CardTitle>Billing History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="p-4 text-left text-sm font-medium text-muted-foreground">Invoice</th>
                  <th className="p-4 text-left text-sm font-medium text-muted-foreground">Date</th>
                  <th className="p-4 text-left text-sm font-medium text-muted-foreground">Amount</th>
                  <th className="p-4 text-left text-sm font-medium text-muted-foreground">Status</th>
                  <th className="p-4 text-left text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(invoice => (
                  <tr
                    key={invoice.id}
                    className="border-b border-border"
                  >
                    <td className="p-4">
                      <p className="font-medium text-foreground">{invoice.id}</p>
                      <p className="text-sm text-muted-foreground">{invoice.description}</p>
                    </td>
                    <td className="p-4 text-muted-foreground">
                      {formatDate(invoice.date)}
                    </td>
                    <td className="p-4 font-medium text-foreground">
                      ${invoice.amount.toFixed(2)}
                    </td>
                    <td className="p-4">
                      <span className={cn(
                        'text-xs px-2 py-1 rounded-full',
                        invoice.status === 'paid'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : invoice.status === 'pending'
                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          : 'bg-destructive/10 text-destructive'
                      )}>
                        {invoice.status}
                      </span>
                    </td>
                    <td className="p-4">
                      <Button variant="ghost" size="sm">
                        <Download className="w-4 h-4 mr-2" />
                        Download
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Cancel Subscription */}
      <Card className="border-destructive/20">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-destructive/10 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-foreground">Cancel Subscription</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Once you cancel, you'll lose access to all premium features at the end of your billing period.
              </p>
            </div>
            <Button variant="outline" className="text-destructive hover:text-destructive hover:bg-destructive/10 cursor-pointer">
              Cancel Plan
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
