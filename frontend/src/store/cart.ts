// Shopping Cart Store for POS

import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';

// Cart expiry time in milliseconds (4 hours)
const CART_EXPIRY_MS = 4 * 60 * 60 * 1000;

// Currency precision utilities to avoid floating-point errors
const currency = {
  // Convert dollars to cents (integer)
  toCents: (dollars: number): number => Math.round(dollars * 100),
  // Convert cents back to dollars with proper rounding
  toDollars: (cents: number): number => Math.round(cents) / 100,
  // Add two dollar amounts precisely
  add: (a: number, b: number): number => currency.toDollars(currency.toCents(a) + currency.toCents(b)),
  // Subtract two dollar amounts precisely
  subtract: (a: number, b: number): number => currency.toDollars(currency.toCents(a) - currency.toCents(b)),
  // Multiply a dollar amount by a factor
  multiply: (amount: number, factor: number): number => currency.toDollars(Math.round(currency.toCents(amount) * factor)),
  // Calculate percentage of an amount
  percentage: (amount: number, percent: number): number => currency.toDollars(Math.round(currency.toCents(amount) * percent / 100)),
};

// Custom storage with expiry handling
const cartStorage: StateStorage = {
  getItem: (name: string) => {
    const stored = localStorage.getItem(name);
    if (!stored) return null;

    try {
      const { state, timestamp } = JSON.parse(stored);
      // Check if cart has expired
      if (timestamp && Date.now() - timestamp > CART_EXPIRY_MS) {
        localStorage.removeItem(name);
        return null;
      }
      return JSON.stringify({ state });
    } catch {
      return stored;
    }
  },
  setItem: (name: string, value: string) => {
    try {
      const parsed = JSON.parse(value);
      // Add timestamp when saving
      const withTimestamp = {
        ...parsed,
        timestamp: Date.now(),
      };
      localStorage.setItem(name, JSON.stringify(withTimestamp));
    } catch {
      localStorage.setItem(name, value);
    }
  },
  removeItem: (name: string) => localStorage.removeItem(name),
};

interface CartItem {
  id: string;
  productId: string;
  name: string;
  sku: string;
  price: number;
  quantity: number;
  modifiers?: Array<{
    id: string;
    name: string;
    price: number;
  }> | undefined;
  notes?: string | undefined;
  discountType?: 'percentage' | 'fixed' | undefined;
  discountValue?: number | undefined;
}

interface CartCustomer {
  id: string;
  name: string;
  email?: string | undefined;
  phone?: string | undefined;
  loyaltyPoints?: number | undefined;
}

interface CartState {
  items: CartItem[];
  customer: CartCustomer | null;
  orderType: 'dine_in' | 'takeaway' | 'delivery' | 'online';
  tableNumber?: string | undefined;
  deliveryAddress?: string | undefined;
  notes: string;
  discountType?: 'percentage' | 'fixed' | undefined;
  discountValue?: number | undefined;
  taxRate: number;

  // Computed values
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  itemCount: number;

  // Actions
  addItem: (item: Omit<CartItem, 'id'>) => void;
  removeItem: (itemId: string) => void;
  updateItemQuantity: (itemId: string, quantity: number) => void;
  updateItemNotes: (itemId: string, notes: string) => void;
  updateItemDiscount: (itemId: string, type: 'percentage' | 'fixed', value: number) => void;
  clearItemDiscount: (itemId: string) => void;
  setCustomer: (customer: CartCustomer | null) => void;
  setOrderType: (type: 'dine_in' | 'takeaway' | 'delivery' | 'online') => void;
  setTableNumber: (tableNumber: string) => void;
  setDeliveryAddress: (address: string) => void;
  setNotes: (notes: string) => void;
  setCartDiscount: (type: 'percentage' | 'fixed', value: number) => void;
  clearCartDiscount: () => void;
  setTaxRate: (rate: number) => void;
  clearCart: () => void;
  recalculate: () => void;
}

const calculateTotals = (state: Omit<CartState, 'subtotal' | 'discount' | 'tax' | 'total' | 'itemCount'>) => {
  // Calculate subtotal using precise currency math
  let subtotalCents = 0;
  let itemCount = 0;

  for (const item of state.items) {
    let itemPriceCents = currency.toCents(item.price);

    // Add modifiers (in cents)
    if (item.modifiers) {
      for (const mod of item.modifiers) {
        itemPriceCents += currency.toCents(mod.price);
      }
    }

    // Apply item discount
    if (item.discountType && item.discountValue) {
      if (item.discountType === 'percentage') {
        const discountCents = Math.round(itemPriceCents * item.discountValue / 100);
        itemPriceCents = itemPriceCents - discountCents;
      } else {
        itemPriceCents = Math.max(0, itemPriceCents - currency.toCents(item.discountValue));
      }
    }

    subtotalCents += itemPriceCents * item.quantity;
    itemCount += item.quantity;
  }

  // Apply cart discount (in cents)
  let discountCents = 0;
  if (state.discountType && state.discountValue) {
    if (state.discountType === 'percentage') {
      discountCents = Math.round(subtotalCents * state.discountValue / 100);
    } else {
      discountCents = Math.min(subtotalCents, currency.toCents(state.discountValue));
    }
  }

  const afterDiscountCents = subtotalCents - discountCents;

  // Calculate tax (in cents)
  const taxCents = Math.round(afterDiscountCents * state.taxRate / 100);

  // Calculate total (in cents)
  const totalCents = afterDiscountCents + taxCents;

  return {
    subtotal: currency.toDollars(subtotalCents),
    discount: currency.toDollars(discountCents),
    tax: currency.toDollars(taxCents),
    total: currency.toDollars(totalCents),
    itemCount,
  };
};

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      customer: null,
      orderType: 'dine_in',
      tableNumber: undefined,
      deliveryAddress: undefined,
      notes: '',
      discountType: undefined,
      discountValue: undefined,
      taxRate: 0,
      subtotal: 0,
      discount: 0,
      tax: 0,
      total: 0,
      itemCount: 0,

      addItem: (item) => {
        const id = `cart-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        set((state) => {
          // Check if same product with same modifiers exists
          // Use a more robust comparison than JSON.stringify
          const existingIndex = state.items.findIndex((i) => {
            if (i.productId !== item.productId) return false;
            if (i.notes) return false; // Items with notes are always unique

            // Compare modifiers by sorting and comparing ids and prices
            const existingMods = (i.modifiers || [])
              .map((m) => `${m.id}:${m.price}`)
              .sort()
              .join(',');
            const newMods = (item.modifiers || [])
              .map((m) => `${m.id}:${m.price}`)
              .sort()
              .join(',');

            return existingMods === newMods;
          });

          let newItems: CartItem[];

          if (existingIndex >= 0 && !item.notes) {
            // Increment quantity of existing item
            newItems = [...state.items];
            const existing = newItems[existingIndex]!;
            newItems[existingIndex] = {
              ...existing,
              quantity: existing.quantity + item.quantity,
            };
          } else {
            // Add new item
            newItems = [...state.items, { ...item, id }];
          }

          const newState = { ...state, items: newItems };
          return { ...newState, ...calculateTotals(newState) };
        });
      },

      removeItem: (itemId) => {
        set((state) => {
          const newState = {
            ...state,
            items: state.items.filter((i) => i.id !== itemId),
          };
          return { ...newState, ...calculateTotals(newState) };
        });
      },

      updateItemQuantity: (itemId, quantity) => {
        set((state) => {
          if (quantity <= 0) {
            const newState = {
              ...state,
              items: state.items.filter((i) => i.id !== itemId),
            };
            return { ...newState, ...calculateTotals(newState) };
          }

          const newState = {
            ...state,
            items: state.items.map((i) =>
              i.id === itemId ? { ...i, quantity } : i
            ),
          };
          return { ...newState, ...calculateTotals(newState) };
        });
      },

      updateItemNotes: (itemId, notes) => {
        set((state) => ({
          ...state,
          items: state.items.map((i) =>
            i.id === itemId ? { ...i, notes } : i
          ),
        }));
      },

      updateItemDiscount: (itemId, type, value) => {
        set((state) => {
          const newState = {
            ...state,
            items: state.items.map((i) =>
              i.id === itemId
                ? { ...i, discountType: type, discountValue: value }
                : i
            ),
          };
          return { ...newState, ...calculateTotals(newState) };
        });
      },

      clearItemDiscount: (itemId) => {
        set((state) => {
          const newState = {
            ...state,
            items: state.items.map((i) =>
              i.id === itemId
                ? { ...i, discountType: undefined, discountValue: undefined }
                : i
            ),
          };
          return { ...newState, ...calculateTotals(newState) };
        });
      },

      setCustomer: (customer) => set({ customer }),

      setOrderType: (orderType) => set({ orderType }),

      setTableNumber: (tableNumber) => set({ tableNumber }),

      setDeliveryAddress: (deliveryAddress) => set({ deliveryAddress }),

      setNotes: (notes) => set({ notes }),

      setCartDiscount: (type, value) => {
        set((state) => {
          const newState = {
            ...state,
            discountType: type,
            discountValue: value,
          };
          return { ...newState, ...calculateTotals(newState) };
        });
      },

      clearCartDiscount: () => {
        set((state) => {
          const newState = {
            ...state,
            discountType: undefined,
            discountValue: undefined,
          };
          return { ...newState, ...calculateTotals(newState) };
        });
      },

      setTaxRate: (taxRate) => {
        set((state) => {
          const newState = { ...state, taxRate };
          return { ...newState, ...calculateTotals(newState) };
        });
      },

      clearCart: () => set({
        items: [],
        customer: null,
        orderType: 'dine_in',
        tableNumber: undefined,
        deliveryAddress: undefined,
        notes: '',
        discountType: undefined,
        discountValue: undefined,
        subtotal: 0,
        discount: 0,
        tax: 0,
        total: 0,
        itemCount: 0,
      }),

      recalculate: () => {
        set((state) => ({ ...state, ...calculateTotals(state) }));
      },
    }),
    {
      name: 'properpos-cart',
      storage: createJSONStorage(() => cartStorage), // Use localStorage with expiry (4 hours)
      partialize: (state) => ({
        items: state.items,
        customer: state.customer,
        orderType: state.orderType,
        tableNumber: state.tableNumber,
        deliveryAddress: state.deliveryAddress,
        notes: state.notes,
        discountType: state.discountType,
        discountValue: state.discountValue,
        taxRate: state.taxRate,
      }),
    }
  )
);
