// Local types for POS service
// These are simplified versions of the shared types for POS-specific use
// Using very flexible types to accommodate various data shapes from MongoDB

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyObject = Record<string, any>;

export interface POSCustomer extends AnyObject {
  id: string;
}

export interface LoyaltyTransaction extends AnyObject {
  id: string;
  customerId: string;
  points: number;
  action: 'add' | 'redeem';
  processedBy: string;
  createdAt: Date;
}

export interface CustomerStats extends AnyObject {
  totalOrders: number;
  totalSpent: number;
  averageOrderValue: number;
}

export interface Receipt extends AnyObject {
  id: string;
  orderId: string;
  data: any;
}

export interface ReceiptTemplate extends AnyObject {
  id: string;
  name: string;
}

export interface ReceiptSettings extends AnyObject {
  tenantId?: string;
}

export interface ReceiptHistory extends AnyObject {
  id: string;
  orderId: string;
  action: string;
}

export interface Payment {
  id: string;
  orderId: string;
  tenantId: string;
  locationId: string;
  method: 'cash' | 'card' | 'mobile' | 'other';
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  reference?: string;
  stripePaymentIntentId?: string;
  processedBy: string;
  processedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Refund {
  id: string;
  paymentId: string;
  orderId: string;
  tenantId: string;
  amount: number;
  reason: string;
  status: 'pending' | 'completed' | 'failed';
  stripeRefundId?: string;
  processedBy: string;
  processedAt: Date;
  createdAt: Date;
}
