/**
 * Tests for the shopping cart Zustand store.
 *
 * Covers: initial state, addItem, addItem (duplicate merging),
 * removeItem, updateItemQuantity, clearCart, and currency precision.
 */

import { act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock localStorage for zustand persist middleware
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] ?? null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
import { useCartStore } from '@/store/cart';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetStore() {
  act(() => {
    useCartStore.getState().clearCart();
  });
  // Also reset taxRate since clearCart doesn't reset it
  (useCartStore as any).setState({ taxRate: 0 });
}

/** Factory to create a minimal cart item payload (Omit<CartItem, 'id'>). */
function makeItem(overrides: Record<string, any> = {}) {
  return {
    productId: 'prod-1',
    name: 'Widget',
    sku: 'WDG-001',
    price: 10.0,
    quantity: 1,
    ...overrides,
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useCartStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.clear();
    resetStore();
  });

  // -- Initial state -------------------------------------------------------

  describe('initial state', () => {
    it('should have empty items', () => {
      expect(useCartStore.getState().items).toEqual([]);
    });

    it('should have null customer', () => {
      expect(useCartStore.getState().customer).toBeNull();
    });

    it('should have zero subtotal', () => {
      expect(useCartStore.getState().subtotal).toBe(0);
    });

    it('should have zero discount', () => {
      expect(useCartStore.getState().discount).toBe(0);
    });

    it('should have zero tax', () => {
      expect(useCartStore.getState().tax).toBe(0);
    });

    it('should have zero total', () => {
      expect(useCartStore.getState().total).toBe(0);
    });

    it('should have zero itemCount', () => {
      expect(useCartStore.getState().itemCount).toBe(0);
    });
  });

  // -- addItem() -----------------------------------------------------------

  describe('addItem()', () => {
    it('should add a single item and recalculate totals', () => {
      act(() => {
        useCartStore.getState().addItem(makeItem({ price: 25.0, quantity: 2 }));
      });

      const state = useCartStore.getState();
      expect(state.items).toHaveLength(1);
      expect(state.items[0]!.productId).toBe('prod-1');
      expect(state.items[0]!.quantity).toBe(2);
      expect(state.subtotal).toBe(50.0);
      expect(state.itemCount).toBe(2);
      expect(state.total).toBe(50.0); // no tax, no discount
    });

    it('should generate a unique id for each added item', () => {
      act(() => {
        useCartStore.getState().addItem(makeItem({ productId: 'a' }));
        useCartStore.getState().addItem(makeItem({ productId: 'b' }));
      });

      const [item1, item2] = useCartStore.getState().items;
      expect(item1!.id).toBeDefined();
      expect(item2!.id).toBeDefined();
      expect(item1!.id).not.toBe(item2!.id);
    });

    it('should increment quantity when same product (same modifiers) is added again', () => {
      const item = makeItem({ productId: 'prod-dup', quantity: 1 });

      act(() => {
        useCartStore.getState().addItem(item);
        useCartStore.getState().addItem(item);
      });

      const state = useCartStore.getState();
      expect(state.items).toHaveLength(1);
      expect(state.items[0]!.quantity).toBe(2);
    });

    it('should NOT merge items that have different modifiers', () => {
      const base = { productId: 'prod-mod', name: 'Mod Widget', sku: 'MW-001', price: 10, quantity: 1 };

      act(() => {
        useCartStore.getState().addItem(
          makeItem({
            ...base,
            modifiers: [{ id: 'mod-a', name: 'Extra cheese', price: 1.5 }],
          }),
        );
        useCartStore.getState().addItem(
          makeItem({
            ...base,
            modifiers: [{ id: 'mod-b', name: 'Extra bacon', price: 2.0 }],
          }),
        );
      });

      expect(useCartStore.getState().items).toHaveLength(2);
    });

    it('should NOT merge items when either has notes', () => {
      const base = { productId: 'prod-notes', name: 'Note Widget', sku: 'NW-001', price: 10, quantity: 1 };

      act(() => {
        useCartStore.getState().addItem(makeItem(base));
        useCartStore.getState().addItem(makeItem({ ...base, notes: 'special request' }));
      });

      // The first has no notes, the second does. They should not merge because
      // the existing item has no notes but the addItem logic checks the
      // *existing* item's notes field. So the second one should be added fresh.
      // Actually looking at the implementation, existing item with notes -> always unique.
      // But here the existing item has no notes. The new item has notes -> it's treated
      // as a new item because `!item.notes` is false for the second add.
      expect(useCartStore.getState().items).toHaveLength(2);
    });
  });

  // -- removeItem() --------------------------------------------------------

  describe('removeItem()', () => {
    it('should remove an item by id and recalculate totals', () => {
      act(() => {
        useCartStore.getState().addItem(makeItem({ productId: 'a', price: 10, quantity: 1 }));
        useCartStore.getState().addItem(makeItem({ productId: 'b', price: 20, quantity: 1 }));
      });

      const itemToRemove = useCartStore.getState().items.find((i) => i.productId === 'b')!;

      act(() => {
        useCartStore.getState().removeItem(itemToRemove.id);
      });

      const state = useCartStore.getState();
      expect(state.items).toHaveLength(1);
      expect(state.items[0]!.productId).toBe('a');
      expect(state.subtotal).toBe(10);
      expect(state.itemCount).toBe(1);
    });

    it('should set totals to zero when the last item is removed', () => {
      act(() => {
        useCartStore.getState().addItem(makeItem());
      });

      const id = useCartStore.getState().items[0]!.id;

      act(() => {
        useCartStore.getState().removeItem(id);
      });

      const state = useCartStore.getState();
      expect(state.items).toHaveLength(0);
      expect(state.subtotal).toBe(0);
      expect(state.total).toBe(0);
      expect(state.itemCount).toBe(0);
    });
  });

  // -- updateItemQuantity() ------------------------------------------------

  describe('updateItemQuantity()', () => {
    it('should update quantity and recalculate totals', () => {
      act(() => {
        useCartStore.getState().addItem(makeItem({ price: 10, quantity: 1 }));
      });

      const id = useCartStore.getState().items[0]!.id;

      act(() => {
        useCartStore.getState().updateItemQuantity(id, 5);
      });

      const state = useCartStore.getState();
      expect(state.items[0]!.quantity).toBe(5);
      expect(state.subtotal).toBe(50);
      expect(state.itemCount).toBe(5);
    });

    it('should remove the item when quantity is set to 0', () => {
      act(() => {
        useCartStore.getState().addItem(makeItem());
      });

      const id = useCartStore.getState().items[0]!.id;

      act(() => {
        useCartStore.getState().updateItemQuantity(id, 0);
      });

      expect(useCartStore.getState().items).toHaveLength(0);
      expect(useCartStore.getState().subtotal).toBe(0);
    });

    it('should remove the item when quantity is set to a negative number', () => {
      act(() => {
        useCartStore.getState().addItem(makeItem());
      });

      const id = useCartStore.getState().items[0]!.id;

      act(() => {
        useCartStore.getState().updateItemQuantity(id, -1);
      });

      expect(useCartStore.getState().items).toHaveLength(0);
    });
  });

  // -- clearCart() ----------------------------------------------------------

  describe('clearCart()', () => {
    it('should reset items, customer, and all totals', () => {
      // Populate the cart first
      act(() => {
        useCartStore.getState().addItem(makeItem({ price: 15, quantity: 3 }));
        useCartStore.getState().setCustomer({
          id: 'cust-1',
          name: 'Jane Doe',
        } as any);
      });

      expect(useCartStore.getState().items).toHaveLength(1);

      act(() => {
        useCartStore.getState().clearCart();
      });

      const state = useCartStore.getState();
      expect(state.items).toEqual([]);
      expect(state.customer).toBeNull();
      expect(state.subtotal).toBe(0);
      expect(state.discount).toBe(0);
      expect(state.tax).toBe(0);
      expect(state.total).toBe(0);
      expect(state.itemCount).toBe(0);
      expect(state.notes).toBe('');
    });
  });

  // -- Currency precision --------------------------------------------------

  describe('currency precision', () => {
    it('should not produce floating-point errors for common prices', () => {
      // Classic floating-point trap: 19.99 + 3.50 = 23.49 (not 23.490000...01)
      act(() => {
        useCartStore.getState().addItem(makeItem({ productId: 'a', price: 19.99, quantity: 1 }));
        useCartStore.getState().addItem(makeItem({ productId: 'b', price: 3.5, quantity: 1 }));
      });

      expect(useCartStore.getState().subtotal).toBe(23.49);
    });

    it('should handle precise multiplication for quantities', () => {
      // 0.1 * 3 should be 0.30, not 0.30000000000000004
      act(() => {
        useCartStore.getState().addItem(makeItem({ price: 0.1, quantity: 3 }));
      });

      expect(useCartStore.getState().subtotal).toBe(0.3);
    });

    it('should correctly calculate total with tax rate', () => {
      act(() => {
        (useCartStore as any).setState({ taxRate: 10 });
        useCartStore.getState().addItem(makeItem({ price: 19.99, quantity: 1 }));
      });

      const state = useCartStore.getState();
      // 19.99 * 10% = 2.00 (rounded in cents: Math.round(1999 * 10 / 100) = 200 cents = 2.00)
      expect(state.subtotal).toBe(19.99);
      expect(state.tax).toBe(2.0);
      expect(state.total).toBe(21.99);
    });

    it('should correctly compute subtotal for multiple items with various prices', () => {
      act(() => {
        useCartStore.getState().addItem(makeItem({ productId: 'a', price: 9.99, quantity: 2 }));
        useCartStore.getState().addItem(makeItem({ productId: 'b', price: 4.95, quantity: 3 }));
      });

      // 9.99 * 2 = 19.98 ; 4.95 * 3 = 14.85 ; total = 34.83
      expect(useCartStore.getState().subtotal).toBe(34.83);
    });

    it('should include modifier prices in subtotal calculation', () => {
      act(() => {
        useCartStore.getState().addItem(
          makeItem({
            productId: 'mod-item',
            price: 10.0,
            quantity: 1,
            modifiers: [
              { id: 'm1', name: 'Extra cheese', price: 1.5 },
              { id: 'm2', name: 'Bacon', price: 2.25 },
            ],
          }),
        );
      });

      // 10.00 + 1.50 + 2.25 = 13.75
      expect(useCartStore.getState().subtotal).toBe(13.75);
    });
  });
});
