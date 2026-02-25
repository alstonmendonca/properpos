'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  MapPin,
  Tag,
  Plus,
  X,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useUIStore } from '@/store';
import {
  emailValidation,
  phoneValidation,
  zipCodeValidation,
  nameValidation,
  formatPhoneNumber,
  FormErrors,
} from '@/lib/validation';

interface CustomerForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  notes: string;
  tags: string[];
  status: 'active' | 'inactive';
  loyaltyEnabled: boolean;
}

// Define form errors type
interface CustomerFormErrors extends FormErrors<CustomerForm> {
  'address.zipCode'?: string;
}

export default function NewCustomerPage() {
  const router = useRouter();
  const addToast = useUIStore(s => s.addToast);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [errors, setErrors] = useState<CustomerFormErrors>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());

  const [form, setForm] = useState<CustomerForm>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: {
      street: '',
      city: '',
      state: '',
      zipCode: '',
      country: 'United States',
    },
    notes: '',
    tags: [],
    status: 'active',
    loyaltyEnabled: true,
  });

  // Validate a single field
  const validateField = useCallback((name: string, value: string): string | undefined => {
    switch (name) {
      case 'firstName':
      case 'lastName': {
        const result = nameValidation.validate(value);
        return result.error;
      }
      case 'email': {
        const result = emailValidation.validate(value);
        return result.error;
      }
      case 'phone': {
        const result = phoneValidation.validate(value);
        return result.error;
      }
      case 'address.zipCode': {
        const result = zipCodeValidation.validate(value);
        return result.error;
      }
      default:
        return undefined;
    }
  }, []);

  // Validate all fields
  const validateForm = useCallback((): boolean => {
    const newErrors: CustomerFormErrors = {};

    // Validate required fields
    const firstNameError = validateField('firstName', form.firstName);
    if (firstNameError) newErrors.firstName = firstNameError;

    const lastNameError = validateField('lastName', form.lastName);
    if (lastNameError) newErrors.lastName = lastNameError;

    const emailError = validateField('email', form.email);
    if (emailError) newErrors.email = emailError;

    const phoneError = validateField('phone', form.phone);
    if (phoneError) newErrors.phone = phoneError;

    const zipError = validateField('address.zipCode', form.address.zipCode);
    if (zipError) newErrors['address.zipCode'] = zipError;

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form, validateField]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;

    let processedValue = value;

    // Format phone number as user types
    if (name === 'phone') {
      processedValue = formatPhoneNumber(value);
    }

    if (name.startsWith('address.')) {
      const addressField = name.split('.')[1] as string;
      setForm(prev => ({
        ...prev,
        address: { ...prev.address, [addressField]: processedValue },
      }));
    } else if (type === 'checkbox') {
      setForm(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else {
      setForm(prev => ({ ...prev, [name]: processedValue }));
    }

    // Validate on change if field has been touched
    if (touched.has(name)) {
      const error = validateField(name, processedValue);
      setErrors(prev => ({
        ...prev,
        [name]: error,
      }));
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setTouched(prev => new Set(prev).add(name));

    const error = validateField(name, value);
    setErrors(prev => ({
      ...prev,
      [name]: error,
    }));
  };

  const addTag = () => {
    if (newTag.trim() && !form.tags.includes(newTag.trim())) {
      setForm(prev => ({ ...prev, tags: [...prev.tags, newTag.trim()] }));
      setNewTag('');
    }
  };

  const removeTag = (tag: string) => {
    setForm(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    // Validate all fields before submission
    if (!validateForm()) {
      addToast({
        type: 'error',
        title: 'Validation Error',
        message: 'Please fix the errors in the form before submitting',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // API call would go here
      await new Promise(resolve => setTimeout(resolve, 1000));

      addToast({
        type: 'success',
        title: 'Customer created',
        message: `${form.firstName} ${form.lastName} has been added`,
      });

      setForm({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        address: {
          street: '',
          city: '',
          state: '',
          zipCode: '',
          country: 'United States',
        },
        notes: '',
        tags: [],
        status: 'active',
        loyaltyEnabled: true,
      });
      setErrors({});
      setTouched(new Set());
      setNewTag('');

      router.push('/customers');
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Failed to create customer',
        message: 'Please try again',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper to render field error
  const renderFieldError = (fieldName: string) => {
    const error = errors[fieldName as keyof CustomerFormErrors];
    if (!error) return null;

    return (
      <div className="flex items-center gap-1 mt-1 text-sm text-red-500">
        <AlertCircle className="w-4 h-4" />
        <span>{error}</span>
      </div>
    );
  };

  // Helper to get input class based on error state
  const getInputClass = (fieldName: string, baseClass: string) => {
    const hasError = errors[fieldName as keyof CustomerFormErrors];
    return `${baseClass} ${hasError ? 'border-red-500 focus:ring-red-500/50' : ''}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/customers" className="cursor-pointer">
          <Button variant="ghost" size="sm" className="cursor-pointer">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">New Customer</h1>
          <p className="text-muted-foreground mt-1">
            Add a new customer to your database
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Basic Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Basic Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      First Name *
                    </label>
                    <input
                      type="text"
                      name="firstName"
                      value={form.firstName}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      required
                      className={getInputClass('firstName', 'w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background')}
                      placeholder="John"
                    />
                    {renderFieldError('firstName')}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Last Name *
                    </label>
                    <input
                      type="text"
                      name="lastName"
                      value={form.lastName}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      required
                      className={getInputClass('lastName', 'w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background')}
                      placeholder="Doe"
                    />
                    {renderFieldError('lastName')}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Email *
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="email"
                      name="email"
                      value={form.email}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      required
                      className={getInputClass('email', 'w-full pl-10 pr-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background')}
                      placeholder="john.doe@example.com"
                    />
                  </div>
                  {renderFieldError('email')}
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Phone
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="tel"
                      name="phone"
                      value={form.phone}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      className={getInputClass('phone', 'w-full pl-10 pr-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background')}
                      placeholder="+1 (555) 123-4567"
                    />
                  </div>
                  {renderFieldError('phone')}
                </div>
              </CardContent>
            </Card>

            {/* Address */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  Address
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Street Address
                  </label>
                  <input
                    type="text"
                    name="address.street"
                    value={form.address.street}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background"
                    placeholder="123 Main Street"
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
                      value={form.address.city}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background"
                      placeholder="New York"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      State
                    </label>
                    <input
                      type="text"
                      name="address.state"
                      value={form.address.state}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background"
                      placeholder="NY"
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
                      value={form.address.zipCode}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      className={getInputClass('address.zipCode', 'w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background')}
                      placeholder="10001"
                    />
                    {renderFieldError('address.zipCode')}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Country
                    </label>
                    <select
                      name="address.country"
                      value={form.address.country}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background cursor-pointer"
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

            {/* Notes */}
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={handleChange}
                  rows={4}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background"
                  placeholder="Add any notes about this customer..."
                />
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Status */}
            <Card>
              <CardHeader>
                <CardTitle>Status</CardTitle>
              </CardHeader>
              <CardContent>
                <select
                  name="status"
                  value={form.status}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background cursor-pointer"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </CardContent>
            </Card>

            {/* Loyalty */}
            <Card>
              <CardHeader>
                <CardTitle>Loyalty Program</CardTitle>
              </CardHeader>
              <CardContent>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    name="loyaltyEnabled"
                    checked={form.loyaltyEnabled}
                    onChange={handleChange}
                    className="rounded border-input cursor-pointer"
                  />
                  <span className="text-sm text-foreground">
                    Enable loyalty points for this customer
                  </span>
                </label>
              </CardContent>
            </Card>

            {/* Tags */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Tag className="w-5 h-5" />
                  Tags
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                    className="flex-1 px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background"
                    placeholder="Add a tag"
                  />
                  <Button type="button" size="sm" onClick={addTag} className="cursor-pointer">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>

                {form.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {form.tags.map(tag => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-sm rounded"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="hover:text-primary/70 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="text-xs text-muted-foreground">
                  Suggested: VIP, Regular, Corporate, Wholesale
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <Button type="submit" disabled={isSubmitting} className="w-full cursor-pointer">
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Customer'
                )}
              </Button>
              <Link href="/customers" className="cursor-pointer">
                <Button type="button" variant="outline" className="w-full cursor-pointer">
                  Cancel
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
