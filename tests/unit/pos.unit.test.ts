// POS Service Unit Tests

describe('POS Service - Unit Tests', () => {
  describe('Order Calculations', () => {
    interface OrderItem {
      productId: string;
      name: string;
      quantity: number;
      unitPrice: number;
      discount?: number;
      taxRate?: number;
    }

    interface OrderTotals {
      subtotal: number;
      discount: number;
      tax: number;
      total: number;
    }

    const calculateOrderTotals = (items: OrderItem[], orderDiscount: number = 0): OrderTotals => {
      let subtotal = 0;
      let itemDiscount = 0;
      let tax = 0;

      for (const item of items) {
        const itemTotal = item.quantity * item.unitPrice;
        subtotal += itemTotal;

        if (item.discount) {
          itemDiscount += itemTotal * (item.discount / 100);
        }

        const taxableAmount = itemTotal - (item.discount ? itemTotal * (item.discount / 100) : 0);
        if (item.taxRate) {
          tax += taxableAmount * (item.taxRate / 100);
        }
      }

      const discountAmount = itemDiscount + (subtotal - itemDiscount) * (orderDiscount / 100);
      const total = subtotal - discountAmount + tax;

      return {
        subtotal: Math.round(subtotal * 100) / 100,
        discount: Math.round(discountAmount * 100) / 100,
        tax: Math.round(tax * 100) / 100,
        total: Math.round(total * 100) / 100,
      };
    };

    it('should calculate simple order correctly', () => {
      const items: OrderItem[] = [
        { productId: '1', name: 'Item 1', quantity: 2, unitPrice: 10.00 },
        { productId: '2', name: 'Item 2', quantity: 1, unitPrice: 25.00 },
      ];

      const totals = calculateOrderTotals(items);

      expect(totals.subtotal).toBe(45.00);
      expect(totals.discount).toBe(0);
      expect(totals.tax).toBe(0);
      expect(totals.total).toBe(45.00);
    });

    it('should apply item discount correctly', () => {
      const items: OrderItem[] = [
        { productId: '1', name: 'Item 1', quantity: 1, unitPrice: 100.00, discount: 10 },
      ];

      const totals = calculateOrderTotals(items);

      expect(totals.subtotal).toBe(100.00);
      expect(totals.discount).toBe(10.00);
      expect(totals.total).toBe(90.00);
    });

    it('should apply order-level discount correctly', () => {
      const items: OrderItem[] = [
        { productId: '1', name: 'Item 1', quantity: 2, unitPrice: 50.00 },
      ];

      const totals = calculateOrderTotals(items, 20);

      expect(totals.subtotal).toBe(100.00);
      expect(totals.discount).toBe(20.00);
      expect(totals.total).toBe(80.00);
    });

    it('should calculate tax correctly', () => {
      const items: OrderItem[] = [
        { productId: '1', name: 'Item 1', quantity: 1, unitPrice: 100.00, taxRate: 10 },
      ];

      const totals = calculateOrderTotals(items);

      expect(totals.subtotal).toBe(100.00);
      expect(totals.tax).toBe(10.00);
      expect(totals.total).toBe(110.00);
    });

    it('should handle complex order with discounts and tax', () => {
      const items: OrderItem[] = [
        { productId: '1', name: 'Item 1', quantity: 2, unitPrice: 50.00, discount: 10, taxRate: 8 },
        { productId: '2', name: 'Item 2', quantity: 3, unitPrice: 30.00, taxRate: 8 },
      ];

      const totals = calculateOrderTotals(items, 5);

      expect(totals.subtotal).toBe(190.00);
      // Item 1: 100 - 10 = 90, tax on 90 = 7.20
      // Item 2: 90, tax on 90 = 7.20
      // Total tax = 14.40
      expect(totals.tax).toBe(14.40);
    });

    it('should round to 2 decimal places', () => {
      const items: OrderItem[] = [
        { productId: '1', name: 'Item 1', quantity: 3, unitPrice: 9.99, taxRate: 8.875 },
      ];

      const totals = calculateOrderTotals(items);

      expect(totals.subtotal).toBe(29.97);
      expect(totals.tax).toBe(2.66);
      expect(totals.total).toBe(32.63);
    });
  });

  describe('Order Status Management', () => {
    type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled';

    const validTransitions: Record<OrderStatus, OrderStatus[]> = {
      pending: ['confirmed', 'cancelled'],
      confirmed: ['preparing', 'cancelled'],
      preparing: ['ready', 'cancelled'],
      ready: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    };

    const canTransition = (from: OrderStatus, to: OrderStatus): boolean => {
      return validTransitions[from].includes(to);
    };

    it('should allow valid transitions', () => {
      expect(canTransition('pending', 'confirmed')).toBe(true);
      expect(canTransition('confirmed', 'preparing')).toBe(true);
      expect(canTransition('preparing', 'ready')).toBe(true);
      expect(canTransition('ready', 'completed')).toBe(true);
    });

    it('should allow cancellation from most states', () => {
      expect(canTransition('pending', 'cancelled')).toBe(true);
      expect(canTransition('confirmed', 'cancelled')).toBe(true);
      expect(canTransition('preparing', 'cancelled')).toBe(true);
      expect(canTransition('ready', 'cancelled')).toBe(true);
    });

    it('should not allow invalid transitions', () => {
      expect(canTransition('pending', 'completed')).toBe(false);
      expect(canTransition('completed', 'pending')).toBe(false);
      expect(canTransition('cancelled', 'pending')).toBe(false);
    });

    it('should not allow transitions from terminal states', () => {
      expect(canTransition('completed', 'cancelled')).toBe(false);
      expect(canTransition('cancelled', 'confirmed')).toBe(false);
    });
  });

  describe('Payment Processing', () => {
    interface Payment {
      method: 'cash' | 'card' | 'mobile';
      amount: number;
    }

    const processPayments = (orderTotal: number, payments: Payment[]): {
      success: boolean;
      totalPaid: number;
      change: number;
      remaining: number;
    } => {
      const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
      const remaining = Math.max(0, orderTotal - totalPaid);
      const change = Math.max(0, totalPaid - orderTotal);

      return {
        success: remaining === 0,
        totalPaid: Math.round(totalPaid * 100) / 100,
        change: Math.round(change * 100) / 100,
        remaining: Math.round(remaining * 100) / 100,
      };
    };

    it('should process exact payment', () => {
      const result = processPayments(50.00, [{ method: 'cash', amount: 50.00 }]);

      expect(result.success).toBe(true);
      expect(result.totalPaid).toBe(50.00);
      expect(result.change).toBe(0);
      expect(result.remaining).toBe(0);
    });

    it('should calculate change for overpayment', () => {
      const result = processPayments(47.50, [{ method: 'cash', amount: 50.00 }]);

      expect(result.success).toBe(true);
      expect(result.totalPaid).toBe(50.00);
      expect(result.change).toBe(2.50);
      expect(result.remaining).toBe(0);
    });

    it('should handle partial payment', () => {
      const result = processPayments(100.00, [{ method: 'cash', amount: 60.00 }]);

      expect(result.success).toBe(false);
      expect(result.totalPaid).toBe(60.00);
      expect(result.change).toBe(0);
      expect(result.remaining).toBe(40.00);
    });

    it('should handle split payments', () => {
      const result = processPayments(100.00, [
        { method: 'cash', amount: 50.00 },
        { method: 'card', amount: 50.00 },
      ]);

      expect(result.success).toBe(true);
      expect(result.totalPaid).toBe(100.00);
      expect(result.change).toBe(0);
    });
  });

  describe('Inventory Updates', () => {
    interface StockUpdate {
      productId: string;
      quantity: number;
      type: 'sale' | 'return' | 'adjustment' | 'restock';
    }

    const calculateNewStock = (currentStock: number, update: StockUpdate): number => {
      switch (update.type) {
        case 'sale':
          return Math.max(0, currentStock - update.quantity);
        case 'return':
        case 'restock':
          return currentStock + update.quantity;
        case 'adjustment':
          return Math.max(0, currentStock + update.quantity); // Can be negative for adjustment
        default:
          return currentStock;
      }
    };

    it('should decrease stock for sales', () => {
      const newStock = calculateNewStock(100, { productId: '1', quantity: 5, type: 'sale' });
      expect(newStock).toBe(95);
    });

    it('should increase stock for returns', () => {
      const newStock = calculateNewStock(100, { productId: '1', quantity: 5, type: 'return' });
      expect(newStock).toBe(105);
    });

    it('should increase stock for restocks', () => {
      const newStock = calculateNewStock(100, { productId: '1', quantity: 50, type: 'restock' });
      expect(newStock).toBe(150);
    });

    it('should handle negative adjustments', () => {
      const newStock = calculateNewStock(100, { productId: '1', quantity: -30, type: 'adjustment' });
      expect(newStock).toBe(70);
    });

    it('should not allow negative stock', () => {
      const newStock = calculateNewStock(10, { productId: '1', quantity: 20, type: 'sale' });
      expect(newStock).toBe(0);
    });
  });
});
