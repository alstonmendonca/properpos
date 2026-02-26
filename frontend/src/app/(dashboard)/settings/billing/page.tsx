'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
  Loader2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useUIStore } from '@/store';
import { apiClient } from '@/lib/api-client';

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
  const [upgradingPlanId, setUpgradingPlanId] = useState<string | null>(null);
  const [cancellingSubscription, setCancellingSubscription] = useState(false);
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<string | null>(null);

  // Payment method modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [editingPaymentMethod, setEditingPaymentMethod] = useState<PaymentMethod | null>(null);
  const [savingPaymentMethod, setSavingPaymentMethod] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    cardNumber: '',
    expiryMonth: '',
    expiryYear: '',
    cvc: '',
    name: '',
  });

  const [subscription, setSubscription] = useState<Subscription>({
    plan: 'professional',
    status: 'active',
    currentPeriodEnd: new Date(Date.now() + 86400000 * 30).toISOString(),
    price: 79,
    interval: 'monthly',
  });

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  // Fetch billing data from API
  const fetchBillingData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await apiClient.get<{
        subscription?: Subscription;
        invoices?: Invoice[];
        paymentMethods?: PaymentMethod[];
      }>('/billing');
      const data = response.data;

      if (data?.subscription) {
        setSubscription(data.subscription);
        setBillingInterval(data.subscription.interval);
      }
      if (data?.invoices) {
        setInvoices(data.invoices);
      }
      if (data?.paymentMethods) {
        setPaymentMethods(data.paymentMethods);
      }
    } catch (error: any) {
      // Show empty state - no hardcoded fallback data
      setInvoices([]);
      setPaymentMethods([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBillingData();
  }, [fetchBillingData]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // --- Upgrade / Change Plan ---
  const handleUpgrade = async (planId: string) => {
    const targetPlan = plans.find(p => p.id === planId);
    if (!targetPlan) return;

    const price = billingInterval === 'monthly' ? targetPlan.monthlyPrice : targetPlan.yearlyPrice;
    const confirmed = window.confirm(
      `Are you sure you want to switch to the ${targetPlan.name} plan at $${price}/${billingInterval === 'monthly' ? 'month' : 'year'}?`
    );
    if (!confirmed) return;

    setUpgradingPlanId(planId);
    try {
      const response = await apiClient.post<{ subscription?: Subscription }>('/billing/subscribe', {
        planId,
        interval: billingInterval,
      });

      if (response.data?.subscription) {
        setSubscription(response.data.subscription);
      } else {
        // Optimistic update
        setSubscription(prev => ({
          ...prev,
          plan: planId as Subscription['plan'],
          price,
          interval: billingInterval,
        }));
      }

      addToast({
        type: 'success',
        title: 'Plan updated',
        message: `You have been switched to the ${targetPlan.name} plan.`,
      });
    } catch (error: any) {
      addToast({
        type: 'error',
        title: 'Upgrade failed',
        message: error.message || 'Could not process the plan change. Please try again.',
      });
    } finally {
      setUpgradingPlanId(null);
    }
  };

  // --- Download Invoice ---
  const handleDownloadInvoice = async (invoiceId: string) => {
    setDownloadingInvoiceId(invoiceId);
    try {
      const response = await apiClient.get<Blob | string>(`/billing/invoices/${invoiceId}/download`, {
        responseType: 'blob',
      } as any);

      // Handle the download
      const data = response.data;
      let blob: Blob;

      if (data instanceof Blob) {
        blob = data;
      } else if (typeof data === 'string') {
        blob = new Blob([data], { type: 'application/pdf' });
      } else {
        // Fallback: try to use the raw response
        blob = new Blob([JSON.stringify(data)], { type: 'application/pdf' });
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${invoiceId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      addToast({
        type: 'success',
        title: 'Invoice downloaded',
        message: `Invoice ${invoiceId} has been downloaded.`,
      });
    } catch (error: any) {
      addToast({
        type: 'error',
        title: 'Download failed',
        message: error.message || 'Could not download the invoice. Please try again.',
      });
    } finally {
      setDownloadingInvoiceId(null);
    }
  };

  // --- Cancel Subscription ---
  const handleCancelSubscription = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to cancel your subscription? You will lose access to premium features at the end of your current billing period.'
    );
    if (!confirmed) return;

    const reason = window.prompt('Could you let us know why you are cancelling? (optional)') || '';

    setCancellingSubscription(true);
    try {
      await apiClient.post('/billing/cancel', { reason });

      setSubscription(prev => ({
        ...prev,
        status: 'cancelled',
      }));

      addToast({
        type: 'success',
        title: 'Subscription cancelled',
        message: `Your subscription has been cancelled. You will retain access until ${formatDate(subscription.currentPeriodEnd)}.`,
      });
    } catch (error: any) {
      addToast({
        type: 'error',
        title: 'Cancellation failed',
        message: error.message || 'Could not cancel the subscription. Please try again or contact support.',
      });
    } finally {
      setCancellingSubscription(false);
    }
  };

  // --- Add / Edit Payment Method ---
  const openPaymentModal = (method?: PaymentMethod) => {
    if (method) {
      setEditingPaymentMethod(method);
      setPaymentForm({
        cardNumber: `**** **** **** ${method.last4}`,
        expiryMonth: method.expiryMonth.toString().padStart(2, '0'),
        expiryYear: method.expiryYear.toString(),
        cvc: '',
        name: '',
      });
    } else {
      setEditingPaymentMethod(null);
      setPaymentForm({
        cardNumber: '',
        expiryMonth: '',
        expiryYear: '',
        cvc: '',
        name: '',
      });
    }
    setShowPaymentModal(true);
  };

  const handleSavePaymentMethod = async () => {
    // Basic validation
    if (!editingPaymentMethod) {
      if (!paymentForm.cardNumber || !paymentForm.expiryMonth || !paymentForm.expiryYear || !paymentForm.cvc) {
        addToast({
          type: 'error',
          title: 'Missing information',
          message: 'Please fill in all card details.',
        });
        return;
      }
    }

    setSavingPaymentMethod(true);
    try {
      if (editingPaymentMethod) {
        // Update existing payment method
        await apiClient.put(`/billing/payment-methods/${editingPaymentMethod.id}`, {
          expiryMonth: parseInt(paymentForm.expiryMonth),
          expiryYear: parseInt(paymentForm.expiryYear),
        });
        addToast({
          type: 'success',
          title: 'Payment method updated',
          message: 'Your payment method has been updated.',
        });
      } else {
        // Add new payment method
        const response = await apiClient.post<{ paymentMethod?: PaymentMethod }>('/billing/payment-methods', {
          cardNumber: paymentForm.cardNumber.replace(/\s/g, ''),
          expiryMonth: parseInt(paymentForm.expiryMonth),
          expiryYear: parseInt(paymentForm.expiryYear),
          cvc: paymentForm.cvc,
          name: paymentForm.name,
        });

        if (response.data?.paymentMethod) {
          setPaymentMethods(prev => [...prev, response.data!.paymentMethod!]);
        }
        addToast({
          type: 'success',
          title: 'Card added',
          message: 'Your payment method has been added successfully.',
        });
      }

      setShowPaymentModal(false);
      // Refresh billing data to get updated payment methods
      fetchBillingData();
    } catch (error: any) {
      addToast({
        type: 'error',
        title: editingPaymentMethod ? 'Update failed' : 'Card not added',
        message: error.message || 'Could not save the payment method. Please try again.',
      });
    } finally {
      setSavingPaymentMethod(false);
    }
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
            const isCurrentPlan = plan.id === subscription.plan && billingInterval === subscription.interval;
            const isUpgrading = upgradingPlanId === plan.id;

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
                    disabled={isCurrentPlan || isUpgrading || !!upgradingPlanId}
                    onClick={() => handleUpgrade(plan.id)}
                  >
                    {isUpgrading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : isCurrentPlan ? (
                      'Current Plan'
                    ) : (
                      plan.id === subscription.plan ? 'Switch Interval' : 'Upgrade'
                    )}
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
          <Button
            variant="outline"
            size="sm"
            className="cursor-pointer"
            onClick={() => openPaymentModal()}
          >
            <CreditCard className="w-4 h-4 mr-2" />
            Add Card
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {paymentMethods.length === 0 ? (
              <div className="text-center py-8">
                <CreditCard className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">No payment methods on file.</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => openPaymentModal()}
                >
                  Add your first card
                </Button>
              </div>
            ) : (
              paymentMethods.map(method => (
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
                        {method.brand} &bull;&bull;&bull;&bull; {method.last4}
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openPaymentModal(method)}
                    >
                      Edit
                    </Button>
                  </div>
                </div>
              ))
            )}
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
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={downloadingInvoiceId === invoice.id}
                        onClick={() => handleDownloadInvoice(invoice.id)}
                      >
                        {downloadingInvoiceId === invoice.id ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4 mr-2" />
                        )}
                        {downloadingInvoiceId === invoice.id ? 'Downloading...' : 'Download'}
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
      {subscription.status !== 'cancelled' && (
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
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                disabled={cancellingSubscription}
                onClick={handleCancelSubscription}
              >
                {cancellingSubscription ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Cancelling...
                  </>
                ) : (
                  'Cancel Plan'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Subscription already cancelled notice */}
      {subscription.status === 'cancelled' && (
        <Card className="border-amber-500/20">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-foreground">Subscription Cancelled</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Your subscription has been cancelled. You will retain access to premium features until {formatDate(subscription.currentPeriodEnd)}.
                  You can upgrade to a new plan at any time.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment Method Modal */}
      {showPaymentModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowPaymentModal(false)}
        >
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>
                {editingPaymentMethod ? 'Edit Payment Method' : 'Add Payment Method'}
              </CardTitle>
              <button
                className="p-1 hover:bg-accent rounded"
                onClick={() => setShowPaymentModal(false)}
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </CardHeader>
            <CardContent className="space-y-4">
              {!editingPaymentMethod && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Cardholder Name
                  </label>
                  <input
                    type="text"
                    value={paymentForm.name}
                    onChange={(e) => setPaymentForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="John Doe"
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Card Number
                </label>
                <input
                  type="text"
                  value={paymentForm.cardNumber}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, cardNumber: e.target.value }))}
                  placeholder="4242 4242 4242 4242"
                  disabled={!!editingPaymentMethod}
                  maxLength={19}
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Month
                  </label>
                  <input
                    type="text"
                    value={paymentForm.expiryMonth}
                    onChange={(e) => setPaymentForm(prev => ({ ...prev, expiryMonth: e.target.value }))}
                    placeholder="MM"
                    maxLength={2}
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Year
                  </label>
                  <input
                    type="text"
                    value={paymentForm.expiryYear}
                    onChange={(e) => setPaymentForm(prev => ({ ...prev, expiryYear: e.target.value }))}
                    placeholder="YYYY"
                    maxLength={4}
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    CVC
                  </label>
                  <input
                    type="text"
                    value={paymentForm.cvc}
                    onChange={(e) => setPaymentForm(prev => ({ ...prev, cvc: e.target.value }))}
                    placeholder="123"
                    maxLength={4}
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowPaymentModal(false)}
                  disabled={savingPaymentMethod}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  disabled={savingPaymentMethod}
                  onClick={handleSavePaymentMethod}
                >
                  {savingPaymentMethod ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    editingPaymentMethod ? 'Update Card' : 'Add Card'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
