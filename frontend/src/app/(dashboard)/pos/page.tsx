'use client';

import React, { useState, useEffect } from 'react';
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  Banknote,
  Smartphone,
  X,
  Tag,
  ChevronRight,
  Loader2,
  RefreshCw,
  Package,
  Receipt,
} from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { useCartStore, toast } from '@/store';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/Skeleton';
import { apiClient } from '@/lib/api-client';

interface Category {
  id: string;
  name: string;
  slug?: string;
  icon?: string;
  productCount?: number;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  image?: string;
  category: string;
  categoryId?: string;
  inStock: boolean;
  stockQuantity: number;
}

export default function POSPage() {
  const {
    items, subtotal, discount, tax, total, itemCount,
    addItem, removeItem, updateItemQuantity, clearCart,
    setCartDiscount, clearCartDiscount,
    orderType, setOrderType, tableNumber, setTableNumber,
  } = useCartStore(
    useShallow(s => ({
      items: s.items, subtotal: s.subtotal, discount: s.discount, tax: s.tax, total: s.total, itemCount: s.itemCount,
      addItem: s.addItem, removeItem: s.removeItem, updateItemQuantity: s.updateItemQuantity, clearCart: s.clearCart,
      setCartDiscount: s.setCartDiscount, clearCartDiscount: s.clearCartDiscount,
      orderType: s.orderType, setOrderType: s.setOrderType, tableNumber: s.tableNumber, setTableNumber: s.setTableNumber,
    }))
  );

  const [categories, setCategories] = useState<Category[]>([{ id: 'all', name: 'All Items' }]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [showCartDrawer, setShowCartDrawer] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [categoriesData, productsData] = await Promise.allSettled([
          apiClient.getCategories(),
          apiClient.getProducts({ page: 1, limit: 100, sortBy: 'name', sortOrder: 'asc', isActive: true }),
        ]);

        if (categoriesData.status === 'fulfilled' && Array.isArray(categoriesData.value)) {
          const fetchedCategories = categoriesData.value.map((cat: any) => ({
            id: cat.id || cat._id || cat.slug,
            name: cat.name,
            slug: cat.slug,
            productCount: cat.productCount || 0,
          }));
          setCategories([{ id: 'all', name: 'All Items' }, ...fetchedCategories]);
        }

        if (productsData.status === 'fulfilled' && Array.isArray(productsData.value)) {
          setProducts(productsData.value.map((product: any) => ({
            id: product.id || product._id,
            name: product.name,
            sku: product.sku || '',
            price: product.price || product.basePrice || 0,
            image: product.image || product.images?.[0],
            category: product.category?.slug || product.categoryId || product.category || '',
            categoryId: product.categoryId || product.category?.id,
            inStock: product.inStock !== false && (product.stockQuantity || 0) > 0,
            stockQuantity: product.stockQuantity || product.inventory?.quantity || 0,
          })));
        }
      } catch (error) {
        console.error('Failed to fetch POS data:', error);
        toast.error('Failed to load', 'Could not load products. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const refreshProducts = async () => {
    setIsLoading(true);
    try {
      const productsData = await apiClient.getProducts({ page: 1, limit: 100, sortBy: 'name', sortOrder: 'asc', isActive: true });
      if (Array.isArray(productsData)) {
        setProducts(productsData.map((product: any) => ({
          id: product.id || product._id,
          name: product.name,
          sku: product.sku || '',
          price: product.price || product.basePrice || 0,
          image: product.image || product.images?.[0],
          category: product.category?.slug || product.categoryId || product.category || '',
          categoryId: product.categoryId || product.category?.id,
          inStock: product.inStock !== false && (product.stockQuantity || 0) > 0,
          stockQuantity: product.stockQuantity || product.inventory?.quantity || 0,
        })));
      }
    } catch (error) {
      console.error('Failed to refresh products:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredProducts = products.filter((product) => {
    const matchesCategory = selectedCategory === 'all' ||
      product.category === selectedCategory ||
      product.categoryId === selectedCategory;
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleAddToCart = (product: Product) => {
    if (!product.inStock) {
      toast.error('Out of Stock', 'This item is currently unavailable');
      return;
    }
    addItem({
      productId: product.id,
      name: product.name,
      sku: product.sku,
      price: product.price,
      quantity: 1,
    });
    toast.success('Added to Cart', `${product.name} added`);
  };

  const handleCheckout = () => {
    if (items.length === 0) {
      toast.error('Cart Empty', 'Please add items to cart first');
      return;
    }
    setShowPaymentModal(true);
  };

  const handlePayment = (method: string) => {
    toast.success('Payment Successful', `Order completed via ${method}`);
    clearCart();
    setShowPaymentModal(false);
    setShowCartDrawer(false);
  };

  const CartPanel = () => (
    <>
      {/* Order Type */}
      <div className="p-4 border-b border-border">
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          {(['dine_in', 'takeaway', 'delivery'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setOrderType(type)}
              className={cn(
                'flex-1 py-2 rounded-md text-xs font-medium transition-all duration-200 cursor-pointer',
                orderType === type
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {type === 'dine_in' && 'Dine In'}
              {type === 'takeaway' && 'Takeaway'}
              {type === 'delivery' && 'Delivery'}
            </button>
          ))}
        </div>
        {orderType === 'dine_in' && (
          <Input
            className="mt-3"
            placeholder="Table Number"
            value={tableNumber || ''}
            onChange={(e) => setTableNumber(e.target.value)}
          />
        )}
      </div>

      {/* Cart Items */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-hide">
        {items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <ShoppingCart className="w-7 h-7 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">Cart is empty</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Tap products to add them</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {item.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    ${item.price.toFixed(2)} each
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => updateItemQuantity(item.id, item.quantity - 1)}
                    className="w-7 h-7 rounded-lg bg-background border border-border flex items-center justify-center hover:bg-accent transition-colors cursor-pointer"
                    aria-label={`Decrease quantity of ${item.name}`}
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-7 text-center text-sm font-semibold">{item.quantity}</span>
                  <button
                    onClick={() => updateItemQuantity(item.id, item.quantity + 1)}
                    className="w-7 h-7 rounded-lg bg-background border border-border flex items-center justify-center hover:bg-accent transition-colors cursor-pointer"
                    aria-label={`Increase quantity of ${item.name}`}
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                <p className="text-sm font-semibold text-foreground w-16 text-right">
                  ${(item.price * item.quantity).toFixed(2)}
                </p>
                <button
                  onClick={() => removeItem(item.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer p-1"
                  aria-label={`Remove ${item.name} from cart`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cart Summary */}
      <div className="p-4 border-t border-border space-y-3" aria-live="polite">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal ({itemCount} items)</span>
            <span className="font-medium">${subtotal.toFixed(2)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-400">
              <span>Discount</span>
              <span>-${discount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Tax</span>
            <span className="font-medium">${tax.toFixed(2)}</span>
          </div>
        </div>

        <div className="flex justify-between items-center pt-3 border-t border-border">
          <span className="text-base font-semibold">Total</span>
          <span className="text-xl font-bold text-primary">${total.toFixed(2)}</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDiscountModal(true)}
            disabled={items.length === 0}
            className="cursor-pointer"
          >
            <Tag className="w-3.5 h-3.5 mr-1.5" />
            Discount
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={clearCart}
            disabled={items.length === 0}
            className="cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            Clear
          </Button>
        </div>

        <Button
          className="w-full shadow-sm cursor-pointer"
          size="lg"
          onClick={handleCheckout}
          disabled={items.length === 0}
        >
          <Receipt className="w-4 h-4 mr-2" />
          Charge ${total.toFixed(2)}
        </Button>
      </div>
    </>
  );

  return (
    <div className="h-[calc(100vh-7rem)] flex gap-4">
      {/* Left Panel - Products */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Search and Categories */}
        <div className="mb-4 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products..."
                className="w-full h-10 pl-9 pr-3 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              className="xl:hidden relative cursor-pointer"
              onClick={() => setShowCartDrawer(true)}
              aria-label="Open cart"
            >
              <ShoppingCart className="w-4 h-4" />
              {itemCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                  {itemCount}
                </span>
              )}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={refreshProducts}
              disabled={isLoading}
              className="cursor-pointer"
              aria-label="Refresh products"
            >
              <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
            </Button>
          </div>

          {/* Categories */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={cn(
                  'px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-200 cursor-pointer',
                  selectedCategory === category.id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>

        {/* Products Grid */}
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="p-3 rounded-xl border border-border bg-card">
                  <div className="aspect-square mb-2.5">
                    <Skeleton variant="rounded" width="100%" height="100%" />
                  </div>
                  <Skeleton variant="text" width="80%" height={16} className="mb-1.5" />
                  <Skeleton variant="text" width="40%" height={16} />
                </div>
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64">
              <Package className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-sm font-medium text-foreground mb-1">No products available</h3>
              <p className="text-xs text-muted-foreground/70 mt-1">
                {searchQuery || selectedCategory !== 'all'
                  ? 'Try a different category or search term.'
                  : 'Add products to your catalog to start selling.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5" role="list">
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  role="listitem"
                  onClick={() => handleAddToCart(product)}
                  className={cn(
                    'group p-3 rounded-xl border text-left transition-all duration-200 cursor-pointer',
                    product.inStock
                      ? 'bg-card border-border hover:border-primary/50 hover:shadow-md active:scale-[0.98]'
                      : 'bg-muted/50 border-border opacity-50 cursor-not-allowed'
                  )}
                  disabled={!product.inStock}
                >
                  <div className="aspect-square bg-muted rounded-lg mb-2.5 flex items-center justify-center overflow-hidden relative">
                    {product.image ? (
                      <Image src={product.image} alt={product.name} fill className="object-cover" sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" />
                    ) : (
                      <Package className="w-8 h-8 text-muted-foreground/30" />
                    )}
                  </div>
                  <p className="text-sm font-medium text-foreground line-clamp-2 leading-tight">
                    {product.name}
                  </p>
                  <div className="flex items-center justify-between mt-1.5">
                    <p className="text-sm font-bold text-primary">
                      ${product.price.toFixed(2)}
                    </p>
                    {product.inStock && (
                      <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Plus className="w-3.5 h-3.5 text-primary" />
                      </div>
                    )}
                  </div>
                  {!product.inStock && (
                    <span className="text-[10px] font-medium text-destructive mt-1 block">Out of stock</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mobile/Tablet Cart Overlay */}
      {showCartDrawer && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 xl:hidden"
          onClick={() => setShowCartDrawer(false)}
        />
      )}

      {/* Right Panel - Cart */}
      <div
        className={cn(
          'flex flex-col bg-card border border-border',
          'hidden xl:flex xl:w-80 2xl:w-96 xl:rounded-xl',
          showCartDrawer && 'fixed inset-y-0 right-0 z-50 flex w-full max-w-sm rounded-l-2xl xl:relative xl:inset-auto xl:z-auto xl:rounded-xl'
        )}
        aria-label="Shopping cart"
      >
        {/* Cart Header - mobile only */}
        <div className="flex items-center justify-between p-4 border-b border-border xl:hidden">
          <h2 className="text-base font-semibold">Your Cart</h2>
          <button
            onClick={() => setShowCartDrawer(false)}
            className="p-2 hover:bg-accent rounded-lg transition-colors cursor-pointer"
            aria-label="Close cart"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <CartPanel />
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl w-full max-w-md border border-border shadow-xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-lg font-semibold">Payment</h2>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="p-1.5 hover:bg-accent rounded-lg transition-colors cursor-pointer"
                aria-label="Close payment modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5">
              <div className="text-center mb-6">
                <p className="text-sm text-muted-foreground">Total Amount</p>
                <p className="text-4xl font-bold text-foreground mt-1">${total.toFixed(2)}</p>
              </div>

              <div className="space-y-2">
                {[
                  { method: 'Cash', icon: Banknote, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10', desc: 'Pay with cash' },
                  { method: 'Card', icon: CreditCard, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10', desc: 'Credit or Debit card' },
                  { method: 'Digital', icon: Smartphone, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-500/10', desc: 'Apple Pay, Google Pay' },
                ].map(({ method, icon: Icon, color, bg, desc }) => (
                  <button
                    key={method}
                    className="w-full flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:bg-accent transition-all duration-200 cursor-pointer group"
                    onClick={() => handlePayment(method)}
                  >
                    <div className={cn('p-2.5 rounded-xl', bg)}>
                      <Icon className={cn('w-5 h-5', color)} />
                    </div>
                    <div className="text-left flex-1">
                      <p className="text-sm font-medium text-foreground">{method}</p>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Discount Modal */}
      {showDiscountModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl w-full max-w-sm border border-border shadow-xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-lg font-semibold">Apply Discount</h2>
              <button
                onClick={() => setShowDiscountModal(false)}
                className="p-1.5 hover:bg-accent rounded-lg transition-colors cursor-pointer"
                aria-label="Close discount modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: '10% Off', type: 'percentage' as const, value: 10 },
                  { label: '20% Off', type: 'percentage' as const, value: 20 },
                  { label: '$5 Off', type: 'fixed' as const, value: 5 },
                  { label: '$10 Off', type: 'fixed' as const, value: 10 },
                ].map((d) => (
                  <button
                    key={d.label}
                    className="p-3 rounded-xl border border-border bg-card hover:bg-accent hover:border-primary/50 transition-all text-sm font-medium cursor-pointer"
                    onClick={() => {
                      setCartDiscount(d.type, d.value);
                      setShowDiscountModal(false);
                      toast.success('Discount Applied', `${d.label} discount applied`);
                    }}
                  >
                    {d.label}
                  </button>
                ))}
              </div>

              {discount > 0 && (
                <Button
                  variant="destructive"
                  className="w-full cursor-pointer"
                  onClick={() => {
                    clearCartDiscount();
                    setShowDiscountModal(false);
                    toast.info('Discount Removed', 'Discount has been removed');
                  }}
                >
                  Remove Discount
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
