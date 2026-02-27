// Payment service implementation

import { v4 as uuidv4 } from 'uuid';
import Decimal from 'decimal.js';
import Stripe from 'stripe';

import {
  logger,
  ApiError,
  getTenantDatabase,
  cache,
} from '@properpos/backend-shared';

interface Payment {
  id: string;
  orderId: string;
  method: 'cash' | 'card' | 'digital_wallet' | 'gift_card' | 'store_credit';
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'refunded';
  transactionId?: string;
  externalTransactionId?: string; // Stripe payment intent ID, etc.
  cardInfo?: {
    last4: string;
    brand: string;
    type: string;
  };
  failureReason?: string;
  processedAt?: Date;
  processedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface Refund {
  id: string;
  paymentId: string;
  orderId: string;
  amount: number;
  currency: string;
  reason: string;
  items?: string[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
  externalRefundId?: string; // Stripe refund ID
  failureReason?: string;
  processedAt: Date;
  processedBy: string;
  createdAt: Date;
}

interface PaymentResult {
  paymentId: string;
  status: string;
  transactionId?: string;
  amount: number;
  change?: number;
  receipt?: {
    id: string;
    url: string;
  };
}

interface RefundResult {
  refundId: string;
  status: string;
  amount: number;
  estimatedArrival?: string;
}

export class PaymentService {
  private stripe: Stripe | null = null;

  constructor() {
    // Initialize Stripe if API key is provided
    if (process.env.STRIPE_SECRET_KEY) {
      this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: '2023-10-16',
      });
    }
  }

  /**
   * Process payment for an order
   */
  async processPayment(
    tenantId: string,
    data: {
      orderId: string;
      method: Payment['method'];
      amount: number;
      currency?: string;
      cardToken?: string;
      cashReceived?: number;
      paymentIntentId?: string;
      processedBy: string;
    }
  ): Promise<PaymentResult> {
    try {
      const db = await getTenantDatabase(tenantId);

      // Get order to validate payment
      const order = await db.collection('orders').findOne({ id: data.orderId });
      if (!order) {
        throw new ApiError('Order not found', 'ORDER_NOT_FOUND', 404);
      }

      // Check if order is already paid
      if (order.paymentStatus === 'paid') {
        throw new ApiError('Order is already paid', 'ORDER_ALREADY_PAID', 400);
      }

      const currency = data.currency || 'USD';
      let paymentResult: PaymentResult;

      // Process payment based on method
      switch (data.method) {
        case 'cash':
          paymentResult = await this.processCashPayment(db, {
            orderId: data.orderId,
            amount: data.amount,
            cashReceived: data.cashReceived || data.amount,
            processedBy: data.processedBy,
            currency,
          });
          break;

        case 'card':
          if (!this.stripe) {
            throw new ApiError('Card payments not configured', 'STRIPE_NOT_CONFIGURED', 500);
          }

          paymentResult = await this.processCardPayment(db, tenantId, {
            orderId: data.orderId,
            amount: data.amount,
            currency,
            cardToken: data.cardToken,
            paymentIntentId: data.paymentIntentId,
            processedBy: data.processedBy,
          });
          break;

        case 'digital_wallet':
          paymentResult = await this.processDigitalWalletPayment(db, {
            orderId: data.orderId,
            amount: data.amount,
            currency,
            processedBy: data.processedBy,
          });
          break;

        case 'gift_card':
          paymentResult = await this.processGiftCardPayment(db, {
            orderId: data.orderId,
            amount: data.amount,
            currency,
            processedBy: data.processedBy,
          });
          break;

        case 'store_credit':
          paymentResult = await this.processStoreCreditPayment(db, {
            orderId: data.orderId,
            amount: data.amount,
            currency,
            processedBy: data.processedBy,
          });
          break;

        default:
          throw new ApiError('Unsupported payment method', 'UNSUPPORTED_PAYMENT_METHOD', 400);
      }

      // Update order payment status
      await this.updateOrderPaymentStatus(db, data.orderId);

      logger.audit('Payment processed', {
        tenantId,
        orderId: data.orderId,
        paymentId: paymentResult.paymentId,
        method: data.method,
        amount: data.amount,
        processedBy: data.processedBy,
      });

      return paymentResult;

    } catch (error) {
      logger.error('Payment processing failed', {
        tenantId,
        orderId: data.orderId,
        method: data.method,
        amount: data.amount,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError('Payment processing failed', 'PAYMENT_PROCESSING_FAILED', 500);
    }
  }

  /**
   * Process refund for a payment
   */
  async processRefund(
    tenantId: string,
    data: {
      orderId: string;
      amount: number;
      reason: string;
      items?: string[];
      processedBy: string;
    }
  ): Promise<RefundResult> {
    try {
      const db = await getTenantDatabase(tenantId);

      // Get order and payments
      const order = await db.collection('orders').findOne({ id: data.orderId });
      if (!order) {
        throw new ApiError('Order not found', 'ORDER_NOT_FOUND', 404);
      }

      // Get payments for this order
      const payments = await db.collection('payments')
        .find({
          orderId: data.orderId,
          status: 'completed'
        })
        .sort({ createdAt: -1 })
        .toArray();

      if (payments.length === 0) {
        throw new ApiError('No completed payments found for order', 'NO_PAYMENTS_FOUND', 400);
      }

      // Find payment to refund (latest completed payment)
      const payment = payments[0] as unknown as Payment;

      // Validate refund amount
      if (data.amount > payment.amount) {
        throw new ApiError('Refund amount exceeds payment amount', 'INVALID_REFUND_AMOUNT', 400);
      }

      // Create refund record
      const refund: Refund = {
        id: uuidv4(),
        paymentId: payment.id,
        orderId: data.orderId,
        amount: data.amount,
        currency: 'USD', // Would get from payment
        reason: data.reason,
        items: data.items,
        status: 'pending',
        processedAt: new Date(),
        processedBy: data.processedBy,
        createdAt: new Date(),
      };

      let refundResult: RefundResult;

      // Process refund based on original payment method
      switch (payment.method) {
        case 'cash':
          refundResult = await this.processCashRefund(db, refund);
          break;

        case 'card':
          if (!this.stripe) {
            throw new ApiError('Card refunds not configured', 'STRIPE_NOT_CONFIGURED', 500);
          }
          refundResult = await this.processCardRefund(db, refund, payment);
          break;

        case 'digital_wallet':
        case 'gift_card':
        case 'store_credit':
          refundResult = await this.processAlternativeRefund(db, refund, payment.method);
          break;

        default:
          throw new ApiError('Unsupported refund method', 'UNSUPPORTED_REFUND_METHOD', 400);
      }

      // Insert refund record
      await db.collection('refunds').insertOne(refund);

      // Update order refund status if full refund
      if (data.amount === order.total) {
        await db.collection('orders').updateOne(
          { id: data.orderId },
          {
            $set: {
              paymentStatus: 'refunded',
              updatedAt: new Date(),
            },
          }
        );
      }

      logger.audit('Refund processed', {
        tenantId,
        orderId: data.orderId,
        paymentId: payment.id,
        refundId: refund.id,
        amount: data.amount,
        reason: data.reason,
        processedBy: data.processedBy,
      });

      return refundResult;

    } catch (error) {
      logger.error('Refund processing failed', {
        tenantId,
        orderId: data.orderId,
        amount: data.amount,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError('Refund processing failed', 'REFUND_PROCESSING_FAILED', 500);
    }
  }

  /**
   * Get payment history for an order
   */
  async getOrderPayments(tenantId: string, orderId: string): Promise<{
    payments: Payment[];
    refunds: Refund[];
    summary: {
      totalPaid: number;
      totalRefunded: number;
      netAmount: number;
    };
  }> {
    try {
      const db = await getTenantDatabase(tenantId);

      const [payments, refunds] = await Promise.all([
        db.collection('payments').find({ orderId }).sort({ createdAt: -1 }).toArray(),
        db.collection('refunds').find({ orderId }).sort({ createdAt: -1 }).toArray(),
      ]);

      const typedPayments = payments as unknown as Payment[];
      const typedRefunds = refunds as unknown as Refund[];

      const totalPaid = typedPayments
        .filter((p: Payment) => p.status === 'completed')
        .reduce((sum: number, p: Payment) => sum + p.amount, 0);

      const totalRefunded = typedRefunds
        .filter((r: Refund) => r.status === 'completed')
        .reduce((sum: number, r: Refund) => sum + r.amount, 0);

      return {
        payments: typedPayments,
        refunds: typedRefunds,
        summary: {
          totalPaid,
          totalRefunded,
          netAmount: totalPaid - totalRefunded,
        },
      };

    } catch (error) {
      logger.error('Failed to get order payments', {
        tenantId,
        orderId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to retrieve payment history', 'PAYMENT_HISTORY_FAILED', 500);
    }
  }

  /**
   * Process cash payment
   */
  private async processCashPayment(
    db: any,
    data: {
      orderId: string;
      amount: number;
      cashReceived: number;
      processedBy: string;
      currency: string;
    }
  ): Promise<PaymentResult> {
    const payment: Payment = {
      id: uuidv4(),
      orderId: data.orderId,
      method: 'cash',
      amount: data.amount,
      currency: data.currency,
      status: 'completed',
      transactionId: uuidv4(),
      processedAt: new Date(),
      processedBy: data.processedBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.collection('payments').insertOne(payment);

    const change = data.cashReceived > data.amount
      ? new Decimal(data.cashReceived).sub(data.amount).toNumber()
      : 0;

    return {
      paymentId: payment.id,
      status: 'completed',
      transactionId: payment.transactionId,
      amount: data.amount,
      change,
    };
  }

  /**
   * Process card payment using Stripe
   */
  private async processCardPayment(
    db: any,
    tenantId: string,
    data: {
      orderId: string;
      amount: number;
      currency: string;
      cardToken?: string;
      paymentIntentId?: string;
      processedBy: string;
    }
  ): Promise<PaymentResult> {
    if (!this.stripe) {
      throw new ApiError('Stripe not configured', 'STRIPE_NOT_CONFIGURED', 500);
    }

    const payment: Payment = {
      id: uuidv4(),
      orderId: data.orderId,
      method: 'card',
      amount: data.amount,
      currency: data.currency,
      status: 'processing',
      processedBy: data.processedBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    try {
      let paymentIntent: Stripe.PaymentIntent;

      if (data.paymentIntentId) {
        // Confirm existing payment intent
        paymentIntent = await this.stripe.paymentIntents.confirm(data.paymentIntentId);
      } else if (data.cardToken) {
        // Create new payment intent with token
        paymentIntent = await this.stripe.paymentIntents.create({
          amount: new Decimal(data.amount).mul(100).round().toNumber(), // Convert to cents
          currency: data.currency.toLowerCase(),
          payment_method: data.cardToken,
          confirmation_method: 'manual',
          confirm: true,
          metadata: {
            orderId: data.orderId,
            tenantId,
          },
        });
      } else {
        throw new ApiError('Card token or payment intent ID required', 'INVALID_CARD_DATA', 400);
      }

      // Update payment based on result
      if (paymentIntent.status === 'succeeded') {
        payment.status = 'completed';
        payment.externalTransactionId = paymentIntent.id;
        payment.transactionId = uuidv4();
        payment.processedAt = new Date();

        // Extract card info if available - note: in newer Stripe API versions,
        // use latest_charge instead of charges
        const charge = paymentIntent.latest_charge;
        if (charge && typeof charge !== 'string') {
          const card = charge.payment_method_details?.card;
          if (card) {
            payment.cardInfo = {
              last4: card.last4 || '',
              brand: card.brand || '',
              type: card.funding || '',
            };
          }
        }
      } else if (paymentIntent.status === 'requires_action') {
        payment.status = 'pending';
        payment.externalTransactionId = paymentIntent.id;
      } else {
        payment.status = 'failed';
        payment.failureReason = `Payment intent status: ${paymentIntent.status}`;
      }

      await db.collection('payments').insertOne(payment);

      return {
        paymentId: payment.id,
        status: payment.status,
        transactionId: payment.transactionId,
        amount: data.amount,
      };

    } catch (error) {
      payment.status = 'failed';
      payment.failureReason = error instanceof Error ? error.message : 'Unknown error';

      await db.collection('payments').insertOne(payment);

      throw new ApiError(
        `Card payment failed: ${payment.failureReason}`,
        'CARD_PAYMENT_FAILED',
        400
      );
    }
  }

  /**
   * Process digital wallet payment
   */
  private async processDigitalWalletPayment(
    db: any,
    data: {
      orderId: string;
      amount: number;
      currency: string;
      processedBy: string;
    }
  ): Promise<PaymentResult> {
    // In a real implementation, this would integrate with Apple Pay, Google Pay, etc.
    const payment: Payment = {
      id: uuidv4(),
      orderId: data.orderId,
      method: 'digital_wallet',
      amount: data.amount,
      currency: data.currency,
      status: 'completed',
      transactionId: uuidv4(),
      processedAt: new Date(),
      processedBy: data.processedBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.collection('payments').insertOne(payment);

    return {
      paymentId: payment.id,
      status: 'completed',
      transactionId: payment.transactionId,
      amount: data.amount,
    };
  }

  /**
   * Process gift card payment
   */
  private async processGiftCardPayment(
    db: any,
    data: {
      orderId: string;
      amount: number;
      currency: string;
      processedBy: string;
    }
  ): Promise<PaymentResult> {
    // In a real implementation, this would validate and deduct from gift card balance
    const payment: Payment = {
      id: uuidv4(),
      orderId: data.orderId,
      method: 'gift_card',
      amount: data.amount,
      currency: data.currency,
      status: 'completed',
      transactionId: uuidv4(),
      processedAt: new Date(),
      processedBy: data.processedBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.collection('payments').insertOne(payment);

    return {
      paymentId: payment.id,
      status: 'completed',
      transactionId: payment.transactionId,
      amount: data.amount,
    };
  }

  /**
   * Process store credit payment
   */
  private async processStoreCreditPayment(
    db: any,
    data: {
      orderId: string;
      amount: number;
      currency: string;
      processedBy: string;
    }
  ): Promise<PaymentResult> {
    // In a real implementation, this would validate and deduct from customer credit
    const payment: Payment = {
      id: uuidv4(),
      orderId: data.orderId,
      method: 'store_credit',
      amount: data.amount,
      currency: data.currency,
      status: 'completed',
      transactionId: uuidv4(),
      processedAt: new Date(),
      processedBy: data.processedBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.collection('payments').insertOne(payment);

    return {
      paymentId: payment.id,
      status: 'completed',
      transactionId: payment.transactionId,
      amount: data.amount,
    };
  }

  /**
   * Process cash refund
   */
  private async processCashRefund(db: any, refund: Refund): Promise<RefundResult> {
    refund.status = 'completed';

    await db.collection('refunds').updateOne(
      { id: refund.id },
      { $set: { status: 'completed' } }
    );

    return {
      refundId: refund.id,
      status: 'completed',
      amount: refund.amount,
    };
  }

  /**
   * Process card refund using Stripe
   */
  private async processCardRefund(
    db: any,
    refund: Refund,
    originalPayment: Payment
  ): Promise<RefundResult> {
    if (!this.stripe || !originalPayment.externalTransactionId) {
      throw new ApiError('Cannot process card refund', 'CARD_REFUND_FAILED', 500);
    }

    try {
      const stripeRefund = await this.stripe.refunds.create({
        payment_intent: originalPayment.externalTransactionId,
        amount: new Decimal(refund.amount).mul(100).round().toNumber(), // Convert to cents
        reason: 'requested_by_customer',
        metadata: {
          orderId: refund.orderId,
          refundId: refund.id,
        },
      });

      refund.status = 'completed';
      refund.externalRefundId = stripeRefund.id;

      await db.collection('refunds').updateOne(
        { id: refund.id },
        {
          $set: {
            status: 'completed',
            externalRefundId: stripeRefund.id,
          },
        }
      );

      return {
        refundId: refund.id,
        status: 'completed',
        amount: refund.amount,
        estimatedArrival: '5-10 business days',
      };

    } catch (error) {
      refund.status = 'failed';
      refund.failureReason = error instanceof Error ? error.message : 'Unknown error';

      await db.collection('refunds').updateOne(
        { id: refund.id },
        {
          $set: {
            status: 'failed',
            failureReason: refund.failureReason,
          },
        }
      );

      throw new ApiError(
        `Card refund failed: ${refund.failureReason}`,
        'CARD_REFUND_FAILED',
        400
      );
    }
  }

  /**
   * Process alternative refund methods
   */
  private async processAlternativeRefund(
    db: any,
    refund: Refund,
    method: string
  ): Promise<RefundResult> {
    // For gift cards and store credit, add back to customer's balance
    refund.status = 'completed';

    await db.collection('refunds').updateOne(
      { id: refund.id },
      { $set: { status: 'completed' } }
    );

    return {
      refundId: refund.id,
      status: 'completed',
      amount: refund.amount,
      estimatedArrival: method === 'store_credit' ? 'Immediate' : '1-2 business days',
    };
  }

  /**
   * Update order payment status based on payments
   */
  private async updateOrderPaymentStatus(db: any, orderId: string): Promise<void> {
    try {
      // Get order and all payments
      const [order, payments] = await Promise.all([
        db.collection('orders').findOne({ id: orderId }),
        db.collection('payments').find({
          orderId,
          status: 'completed'
        }).toArray(),
      ]);

      if (!order) return;

      const totalPaid = payments.reduce((sum: number, p: any) => sum + p.amount, 0);
      let paymentStatus: string;

      if (totalPaid === 0) {
        paymentStatus = 'pending';
      } else if (totalPaid >= order.total) {
        paymentStatus = 'paid';
      } else {
        paymentStatus = 'partial';
      }

      await db.collection('orders').updateOne(
        { id: orderId },
        {
          $set: {
            paymentStatus,
            updatedAt: new Date(),
          },
        }
      );

    } catch (error) {
      logger.error('Failed to update order payment status', {
        orderId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}