'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Upload,
  Plus,
  X,
  Package,
  DollarSign,
  Tag,
  Layers,
  Info,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useUIStore } from '@/store';
import {
  priceValidation,
  skuValidation,
  quantityValidation,
  requiredValidation,
  formatPrice,
  FormErrors,
} from '@/lib/validation';

interface ProductForm {
  name: string;
  sku: string;
  description: string;
  category: string;
  price: string;
  cost: string;
  taxRate: string;
  stock: string;
  minStock: string;
  barcode: string;
  unit: string;
  status: 'active' | 'inactive';
  trackInventory: boolean;
  allowNegativeStock: boolean;
  variants: { name: string; options: string[] }[];
  modifiers: { name: string; price: string; required: boolean }[];
}

// Errors type for product form
type ProductFormErrors = FormErrors<ProductForm> & { variants?: string };

export default function NewProductPage() {
  const router = useRouter();
  const addToast = useUIStore(s => s.addToast);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'basic' | 'pricing' | 'inventory' | 'variants'>('basic');
  const [errors, setErrors] = useState<ProductFormErrors>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());

  const [form, setForm] = useState<ProductForm>({
    name: '',
    sku: '',
    description: '',
    category: '',
    price: '',
    cost: '',
    taxRate: '0',
    stock: '0',
    minStock: '10',
    barcode: '',
    unit: 'piece',
    status: 'active',
    trackInventory: true,
    allowNegativeStock: false,
    variants: [],
    modifiers: [],
  });

  const categories = ['Food', 'Beverages', 'Desserts', 'Sides', 'Merchandise'];

  // Field validation
  const validateField = useCallback((name: string, value: string): string | undefined => {
    switch (name) {
      case 'name': {
        const result = requiredValidation('Product name').validate(value);
        return result.error;
      }
      case 'sku': {
        if (!value) return undefined; // SKU is optional (auto-generated if blank)
        const result = skuValidation.validate(value);
        return result.error;
      }
      case 'price': {
        const result = priceValidation.validate(value);
        return result.error;
      }
      case 'cost': {
        if (!value) return undefined; // Cost is optional
        const result = priceValidation.validate(value);
        return result.error;
      }
      case 'taxRate': {
        if (!value) return undefined;
        const num = parseFloat(value);
        if (isNaN(num) || num < 0 || num > 100) {
          return 'Tax rate must be between 0 and 100';
        }
        return undefined;
      }
      case 'stock':
      case 'minStock': {
        if (!value) return undefined;
        const result = quantityValidation.validate(value);
        return result.error;
      }
      case 'category': {
        const result = requiredValidation('Category').validate(value);
        return result.error;
      }
      default:
        return undefined;
    }
  }, []);

  // Check for duplicate variant names
  const checkDuplicateVariants = useCallback((): string | undefined => {
    const names = form.variants.map(v => v.name.toLowerCase().trim()).filter(n => n);
    const uniqueNames = new Set(names);
    if (names.length !== uniqueNames.size) {
      return 'Duplicate variant names are not allowed';
    }
    return undefined;
  }, [form.variants]);

  // Validate entire form
  const validateForm = useCallback((): boolean => {
    const newErrors: ProductFormErrors = {};

    // Basic info validation
    const nameError = validateField('name', form.name);
    if (nameError) newErrors.name = nameError;

    const skuError = validateField('sku', form.sku);
    if (skuError) newErrors.sku = skuError;

    const categoryError = validateField('category', form.category);
    if (categoryError) newErrors.category = categoryError;

    // Pricing validation
    const priceError = validateField('price', form.price);
    if (priceError) newErrors.price = priceError;

    const costError = validateField('cost', form.cost);
    if (costError) newErrors.cost = costError;

    const taxError = validateField('taxRate', form.taxRate);
    if (taxError) newErrors.taxRate = taxError;

    // Inventory validation
    if (form.trackInventory) {
      const stockError = validateField('stock', form.stock);
      if (stockError) newErrors.stock = stockError;

      const minStockError = validateField('minStock', form.minStock);
      if (minStockError) newErrors.minStock = minStockError;
    }

    // Variants validation
    const variantError = checkDuplicateVariants();
    if (variantError) newErrors.variants = variantError;

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form, validateField, checkDuplicateVariants]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;

    let processedValue = value;

    // Format price fields
    if (['price', 'cost'].includes(name)) {
      processedValue = formatPrice(value);
    }

    if (type === 'checkbox') {
      setForm(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else {
      setForm(prev => ({ ...prev, [name]: processedValue }));
    }

    // Validate on change if field has been touched
    if (touched.has(name)) {
      const error = validateField(name, processedValue);
      setErrors(prev => ({ ...prev, [name]: error }));
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setTouched(prev => new Set(prev).add(name));

    const error = validateField(name, value);
    setErrors(prev => ({ ...prev, [name]: error }));
  };

  // Helper to render field error
  const renderFieldError = (fieldName: string) => {
    const error = errors[fieldName as keyof ProductFormErrors];
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
    const hasError = errors[fieldName as keyof ProductFormErrors];
    return `${baseClass} ${hasError ? 'border-red-500 focus:ring-red-500/50' : ''}`;
  };

  const addVariant = () => {
    setForm(prev => ({
      ...prev,
      variants: [...prev.variants, { name: '', options: [''] }],
    }));
  };

  const removeVariant = (index: number) => {
    setForm(prev => ({
      ...prev,
      variants: prev.variants.filter((_, i) => i !== index),
    }));
  };

  const updateVariant = (index: number, field: 'name' | 'options', value: string | string[]) => {
    setForm(prev => ({
      ...prev,
      variants: prev.variants.map((v, i) =>
        i === index ? { ...v, [field]: value } : v
      ),
    }));
  };

  const addModifier = () => {
    setForm(prev => ({
      ...prev,
      modifiers: [...prev.modifiers, { name: '', price: '0', required: false }],
    }));
  };

  const removeModifier = (index: number) => {
    setForm(prev => ({
      ...prev,
      modifiers: prev.modifiers.filter((_, i) => i !== index),
    }));
  };

  const updateModifier = (index: number, field: string, value: string | boolean) => {
    setForm(prev => ({
      ...prev,
      modifiers: prev.modifiers.map((m, i) =>
        i === index ? { ...m, [field]: value } : m
      ),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    // Validate form before submission
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
        title: 'Product created',
        message: `${form.name} has been added to your catalog`,
      });

      router.push('/products');
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Failed to create product',
        message: 'Please try again',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const tabs = [
    { id: 'basic', label: 'Basic Info', icon: Package },
    { id: 'pricing', label: 'Pricing', icon: DollarSign },
    { id: 'inventory', label: 'Inventory', icon: Layers },
    { id: 'variants', label: 'Variants & Modifiers', icon: Tag },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/products" className="cursor-pointer">
            <Button variant="ghost" size="sm" className="cursor-pointer">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">New Product</h1>
            <p className="text-muted-foreground mt-1">
              Add a new product to your catalog
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar - Tabs */}
          <div className="lg:col-span-1">
            <Card>
              <CardContent className="p-2">
                <nav className="space-y-1">
                  {tabs.map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                        activeTab === tab.id
                          ? 'bg-primary text-white'
                          : 'text-foreground hover:bg-accent'
                      }`}
                    >
                      <tab.icon className="w-4 h-4" />
                      <span className="font-medium">{tab.label}</span>
                    </button>
                  ))}
                </nav>
              </CardContent>
            </Card>

            {/* Product Image */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-base">Product Image</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer">
                  <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground mb-2">
                    Drag & drop or click to upload
                  </p>
                  <Button type="button" variant="outline" size="sm" className="cursor-pointer">
                    Choose File
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3 space-y-6">
            {/* Basic Info Tab */}
            {activeTab === 'basic' && (
              <Card>
                <CardHeader>
                  <CardTitle>Basic Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Product Name *
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={form.name}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      required
                      className={getInputClass('name', 'w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background')}
                      placeholder="Enter product name"
                    />
                    {renderFieldError('name')}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        SKU
                      </label>
                      <input
                        type="text"
                        name="sku"
                        value={form.sku}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        className={getInputClass('sku', 'w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background')}
                        placeholder="Auto-generated if blank"
                      />
                      {renderFieldError('sku')}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        Barcode
                      </label>
                      <input
                        type="text"
                        name="barcode"
                        value={form.barcode}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background"
                        placeholder="Enter barcode"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Category *
                    </label>
                    <select
                      name="category"
                      value={form.category}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      required
                      className={getInputClass('category', 'w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background')}
                    >
                      <option value="">Select a category</option>
                      {categories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    {renderFieldError('category')}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Description
                    </label>
                    <textarea
                      name="description"
                      value={form.description}
                      onChange={handleChange}
                      rows={4}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background"
                      placeholder="Enter product description"
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
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Pricing Tab */}
            {activeTab === 'pricing' && (
              <Card>
                <CardHeader>
                  <CardTitle>Pricing</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        Selling Price *
                      </label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                          type="text"
                          name="price"
                          value={form.price}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          required
                          className={getInputClass('price', 'w-full pl-9 pr-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background')}
                          placeholder="0.00"
                        />
                      </div>
                      {renderFieldError('price')}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        Cost Price
                      </label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                          type="text"
                          name="cost"
                          value={form.cost}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          className={getInputClass('cost', 'w-full pl-9 pr-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background')}
                          placeholder="0.00"
                        />
                      </div>
                      {renderFieldError('cost')}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Tax Rate (%)
                    </label>
                    <input
                      type="number"
                      name="taxRate"
                      value={form.taxRate}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      min="0"
                      max="100"
                      step="0.01"
                      className={getInputClass('taxRate', 'w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background')}
                    />
                    {renderFieldError('taxRate')}
                  </div>

                  {form.price && form.cost && (
                    <div className="p-4 bg-emerald-500/10 rounded-lg">
                      <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                        <Info className="w-4 h-4" />
                        <span className="font-medium">Profit Margin</span>
                      </div>
                      <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                        ${(parseFloat(form.price) - parseFloat(form.cost)).toFixed(2)} ({((parseFloat(form.price) - parseFloat(form.cost)) / parseFloat(form.price) * 100).toFixed(1)}%)
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Inventory Tab */}
            {activeTab === 'inventory' && (
              <Card>
                <CardHeader>
                  <CardTitle>Inventory Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="trackInventory"
                      name="trackInventory"
                      checked={form.trackInventory}
                      onChange={handleChange}
                      className="rounded border-input cursor-pointer"
                    />
                    <label htmlFor="trackInventory" className="text-sm font-medium text-foreground cursor-pointer">
                      Track inventory for this product
                    </label>
                  </div>

                  {form.trackInventory && (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-foreground mb-1">
                            Current Stock
                          </label>
                          <input
                            type="number"
                            name="stock"
                            value={form.stock}
                            onChange={handleChange}
                            min="0"
                            className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-foreground mb-1">
                            Low Stock Alert
                          </label>
                          <input
                            type="number"
                            name="minStock"
                            value={form.minStock}
                            onChange={handleChange}
                            min="0"
                            className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1">
                          Unit of Measure
                        </label>
                        <select
                          name="unit"
                          value={form.unit}
                          onChange={handleChange}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background"
                        >
                          <option value="piece">Piece</option>
                          <option value="kg">Kilogram (kg)</option>
                          <option value="g">Gram (g)</option>
                          <option value="lb">Pound (lb)</option>
                          <option value="oz">Ounce (oz)</option>
                          <option value="l">Liter (l)</option>
                          <option value="ml">Milliliter (ml)</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id="allowNegativeStock"
                          name="allowNegativeStock"
                          checked={form.allowNegativeStock}
                          onChange={handleChange}
                          className="rounded border-input cursor-pointer"
                        />
                        <label htmlFor="allowNegativeStock" className="text-sm font-medium text-foreground cursor-pointer">
                          Allow sales when out of stock
                        </label>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Variants Tab */}
            {activeTab === 'variants' && (
              <>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Variants</CardTitle>
                    <Button type="button" variant="outline" size="sm" onClick={addVariant} className="cursor-pointer">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Variant
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {form.variants.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        No variants added. Click "Add Variant" to create size, color, or other options.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {form.variants.map((variant, index) => (
                          <div key={index} className="p-4 border border-border rounded-lg">
                            <div className="flex items-center justify-between mb-3">
                              <input
                                type="text"
                                value={variant.name}
                                onChange={(e) => updateVariant(index, 'name', e.target.value)}
                                placeholder="Variant name (e.g., Size)"
                                className="px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background"
                              />
                              <button
                                type="button"
                                onClick={() => removeVariant(index)}
                                className="p-2 text-red-500 hover:bg-destructive/10 rounded cursor-pointer"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {variant.options.map((opt, optIndex) => (
                                <div key={optIndex} className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    value={opt}
                                    onChange={(e) => {
                                      const newOptions = [...variant.options];
                                      newOptions[optIndex] = e.target.value;
                                      updateVariant(index, 'options', newOptions);
                                    }}
                                    placeholder="Option"
                                    className="w-24 px-2 py-1 text-sm border border-border rounded bg-background text-foreground"
                                  />
                                  {variant.options.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newOptions = variant.options.filter((_, i) => i !== optIndex);
                                        updateVariant(index, 'options', newOptions);
                                      }}
                                      className="text-muted-foreground hover:text-red-500 cursor-pointer"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={() => updateVariant(index, 'options', [...variant.options, ''])}
                                className="px-2 py-1 text-sm text-primary hover:bg-primary/10 rounded cursor-pointer"
                              >
                                + Add
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Modifiers</CardTitle>
                    <Button type="button" variant="outline" size="sm" onClick={addModifier} className="cursor-pointer">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Modifier
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {form.modifiers.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        No modifiers added. Click "Add Modifier" to create add-ons like extra cheese, toppings, etc.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {form.modifiers.map((mod, index) => (
                          <div key={index} className="flex items-center gap-3 p-3 border border-border rounded-lg">
                            <input
                              type="text"
                              value={mod.name}
                              onChange={(e) => updateModifier(index, 'name', e.target.value)}
                              placeholder="Modifier name"
                              className="flex-1 px-3 py-2 border border-border rounded-lg bg-background text-foreground"
                            />
                            <div className="relative w-28">
                              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                              <input
                                type="number"
                                value={mod.price}
                                onChange={(e) => updateModifier(index, 'price', e.target.value)}
                                placeholder="0.00"
                                min="0"
                                step="0.01"
                                className="w-full pl-7 pr-3 py-2 border border-border rounded-lg bg-background text-foreground"
                              />
                            </div>
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={mod.required}
                                onChange={(e) => updateModifier(index, 'required', e.target.checked)}
                                className="rounded border-input cursor-pointer"
                              />
                              Required
                            </label>
                            <button
                              type="button"
                              onClick={() => removeModifier(index)}
                              className="p-2 text-red-500 hover:bg-destructive/10 rounded cursor-pointer"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3">
              <Link href="/products" className="cursor-pointer">
                <Button type="button" variant="outline" className="cursor-pointer">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={isSubmitting} className="cursor-pointer">
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Product'
                )}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
