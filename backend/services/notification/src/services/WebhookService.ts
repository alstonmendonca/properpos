// Webhook Service - Handles external webhook notifications

import axios, { AxiosError } from 'axios';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { logger, getTenantDatabase, cache } from '@properpos/backend-shared';

interface WebhookEndpoint {
  id: string;
  tenantId: string;
  name: string;
  url: string;
  events: string[];
  secret?: string;
  headers?: Record<string, string>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  lastTriggeredAt?: Date;
  failureCount: number;
}

interface WebhookDelivery {
  id: string;
  tenantId: string;
  webhookId: string;
  event: string;
  payload: Record<string, any>;
  status: 'pending' | 'success' | 'failed';
  statusCode?: number;
  response?: string;
  error?: string;
  attempts: number;
  createdAt: Date;
  completedAt?: Date;
}

interface CreateEndpointData {
  tenantId: string;
  name: string;
  url: string;
  events: string[];
  secret?: string;
  headers?: Record<string, string>;
  isActive?: boolean;
  createdBy?: string;
}

export class WebhookService {
  private readonly maxRetries = 3;
  private readonly retryDelays = [5000, 30000, 120000]; // 5s, 30s, 2min

  async createEndpoint(data: CreateEndpointData): Promise<WebhookEndpoint> {
    const db = await getTenantDatabase(data.tenantId);
    const collection = db.collection('webhook_endpoints');

    const endpoint: WebhookEndpoint = {
      id: uuidv4(),
      tenantId: data.tenantId,
      name: data.name,
      url: data.url,
      events: data.events,
      secret: data.secret || this.generateSecret(),
      headers: data.headers,
      isActive: data.isActive !== false,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: data.createdBy,
      failureCount: 0,
    };

    await collection.insertOne(endpoint);

    logger.info('Webhook endpoint created', {
      tenantId: data.tenantId,
      webhookId: endpoint.id,
      url: endpoint.url,
      events: endpoint.events,
    });

    return endpoint;
  }

  private generateSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  async listEndpoints(
    filters: { tenantId: string; isActive?: boolean },
    page: number = 1,
    limit: number = 20
  ): Promise<{ endpoints: WebhookEndpoint[]; total: number }> {
    const db = await getTenantDatabase(filters.tenantId);
    const collection = db.collection('webhook_endpoints');

    const query: any = { tenantId: filters.tenantId };
    if (filters.isActive !== undefined) {
      query.isActive = filters.isActive;
    }

    const skip = (page - 1) * limit;

    const [endpoints, total] = await Promise.all([
      collection.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      collection.countDocuments(query),
    ]);

    return {
      endpoints: endpoints as unknown as WebhookEndpoint[],
      total,
    };
  }

  async getEndpointById(id: string, tenantId: string): Promise<WebhookEndpoint | null> {
    const db = await getTenantDatabase(tenantId);
    const collection = db.collection('webhook_endpoints');

    const endpoint = await collection.findOne({ id, tenantId });
    return endpoint as unknown as WebhookEndpoint | null;
  }

  async updateEndpoint(
    id: string,
    tenantId: string,
    data: Partial<WebhookEndpoint>
  ): Promise<WebhookEndpoint | null> {
    const db = await getTenantDatabase(tenantId);
    const collection = db.collection('webhook_endpoints');

    const updateData: any = {
      ...data,
      updatedAt: new Date(),
    };
    delete updateData.id;
    delete updateData.tenantId;
    delete updateData.createdAt;

    const result = await collection.findOneAndUpdate(
      { id, tenantId },
      { $set: updateData },
      { returnDocument: 'after' }
    );

    return result as unknown as WebhookEndpoint | null;
  }

  async deleteEndpoint(id: string, tenantId: string): Promise<boolean> {
    const db = await getTenantDatabase(tenantId);
    const collection = db.collection('webhook_endpoints');

    const result = await collection.deleteOne({ id, tenantId });
    return result.deletedCount > 0;
  }

  async testEndpoint(
    id: string,
    tenantId: string
  ): Promise<{ success: boolean; statusCode?: number; responseTime?: number; error?: string } | null> {
    const endpoint = await this.getEndpointById(id, tenantId);
    if (!endpoint) {
      return null;
    }

    const testPayload = {
      event: 'webhook.test',
      timestamp: new Date().toISOString(),
      data: {
        message: 'This is a test webhook delivery',
        webhookId: id,
      },
    };

    const startTime = Date.now();

    try {
      const response = await this.sendWebhook(endpoint, testPayload);
      return {
        success: response.statusCode >= 200 && response.statusCode < 300,
        statusCode: response.statusCode,
        responseTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime: Date.now() - startTime,
      };
    }
  }

  async triggerEvent(
    tenantId: string,
    event: string,
    payload: Record<string, any>
  ): Promise<{ endpointsNotified: number; deliveryIds: string[] }> {
    const db = await getTenantDatabase(tenantId);
    const collection = db.collection('webhook_endpoints');

    // Find all active endpoints subscribed to this event
    const endpoints = await collection
      .find({
        tenantId,
        isActive: true,
        events: { $in: [event, '*'] }, // Support wildcard
      })
      .toArray() as unknown as WebhookEndpoint[];

    if (endpoints.length === 0) {
      return { endpointsNotified: 0, deliveryIds: [] };
    }

    const deliveryIds: string[] = [];

    for (const endpoint of endpoints) {
      const deliveryId = await this.queueDelivery(
        tenantId,
        endpoint,
        event,
        payload
      );
      deliveryIds.push(deliveryId);
    }

    return { endpointsNotified: endpoints.length, deliveryIds };
  }

  private async queueDelivery(
    tenantId: string,
    endpoint: WebhookEndpoint,
    event: string,
    payload: Record<string, any>
  ): Promise<string> {
    const db = await getTenantDatabase(tenantId);
    const collection = db.collection('webhook_deliveries');

    const delivery: WebhookDelivery = {
      id: uuidv4(),
      tenantId,
      webhookId: endpoint.id,
      event,
      payload,
      status: 'pending',
      attempts: 0,
      createdAt: new Date(),
    };

    await collection.insertOne(delivery);

    // Send immediately (could be moved to a queue for better reliability)
    this.processDelivery(delivery.id, tenantId, endpoint);

    return delivery.id;
  }

  private async processDelivery(
    deliveryId: string,
    tenantId: string,
    endpoint: WebhookEndpoint
  ): Promise<void> {
    const db = await getTenantDatabase(tenantId);
    const deliveryCollection = db.collection('webhook_deliveries');
    const endpointCollection = db.collection('webhook_endpoints');

    const delivery = await deliveryCollection.findOne({ id: deliveryId, tenantId }) as unknown as WebhookDelivery;
    if (!delivery || delivery.status !== 'pending') {
      return;
    }

    const webhookPayload = {
      id: delivery.id,
      event: delivery.event,
      timestamp: new Date().toISOString(),
      data: delivery.payload,
    };

    try {
      const response = await this.sendWebhook(endpoint, webhookPayload);

      const success = response.statusCode >= 200 && response.statusCode < 300;

      await deliveryCollection.updateOne(
        { id: deliveryId },
        {
          $set: {
            status: success ? 'success' : 'failed',
            statusCode: response.statusCode,
            response: response.body?.substring(0, 1000), // Limit response size
            attempts: delivery.attempts + 1,
            completedAt: new Date(),
          },
        }
      );

      if (success) {
        // Reset failure count on success
        await endpointCollection.updateOne(
          { id: endpoint.id },
          {
            $set: {
              failureCount: 0,
              lastTriggeredAt: new Date(),
            },
          }
        );
      } else {
        await this.handleFailure(delivery, endpoint, tenantId);
      }
    } catch (error) {
      await deliveryCollection.updateOne(
        { id: deliveryId },
        {
          $set: {
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error',
            attempts: delivery.attempts + 1,
            completedAt: new Date(),
          },
        }
      );

      await this.handleFailure(delivery, endpoint, tenantId);
    }
  }

  private async handleFailure(
    delivery: WebhookDelivery,
    endpoint: WebhookEndpoint,
    tenantId: string
  ): Promise<void> {
    const db = await getTenantDatabase(tenantId);
    const endpointCollection = db.collection('webhook_endpoints');

    // Increment failure count
    await endpointCollection.updateOne(
      { id: endpoint.id },
      {
        $inc: { failureCount: 1 },
        $set: { lastTriggeredAt: new Date() },
      }
    );

    // Disable endpoint after too many failures
    if (endpoint.failureCount + 1 >= 10) {
      await endpointCollection.updateOne(
        { id: endpoint.id },
        { $set: { isActive: false } }
      );

      logger.warn('Webhook endpoint disabled due to failures', {
        tenantId,
        webhookId: endpoint.id,
        url: endpoint.url,
        failureCount: endpoint.failureCount + 1,
      });
    }

    // Retry if under max retries
    if (delivery.attempts < this.maxRetries) {
      const delay = this.retryDelays[delivery.attempts] || 120000;
      setTimeout(() => {
        this.processDelivery(delivery.id, tenantId, endpoint);
      }, delay);
    }
  }

  private async sendWebhook(
    endpoint: WebhookEndpoint,
    payload: Record<string, any>
  ): Promise<{ statusCode: number; body?: string }> {
    const payloadString = JSON.stringify(payload);

    // Generate signature
    const signature = endpoint.secret
      ? this.generateSignature(payloadString, endpoint.secret)
      : undefined;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'ProperPOS-Webhook/1.0',
      'X-Webhook-ID': endpoint.id,
      'X-Webhook-Event': payload.event,
      ...endpoint.headers,
    };

    if (signature) {
      headers['X-Webhook-Signature'] = signature;
      headers['X-Webhook-Signature-256'] = `sha256=${signature}`;
    }

    try {
      const response = await axios.post(endpoint.url, payload, {
        headers,
        timeout: 30000, // 30 second timeout
        validateStatus: () => true, // Don't throw on non-2xx
      });

      return {
        statusCode: response.status,
        body: typeof response.data === 'string'
          ? response.data
          : JSON.stringify(response.data),
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        if (axiosError.response) {
          return {
            statusCode: axiosError.response.status,
            body: JSON.stringify(axiosError.response.data),
          };
        }
      }
      throw error;
    }
  }

  private generateSignature(payload: string, secret: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  async getDeliveryHistory(
    filters: { webhookId: string; tenantId: string; status?: string },
    page: number = 1,
    limit: number = 20
  ): Promise<{ deliveries: WebhookDelivery[]; total: number }> {
    const db = await getTenantDatabase(filters.tenantId);
    const collection = db.collection('webhook_deliveries');

    const query: any = {
      webhookId: filters.webhookId,
      tenantId: filters.tenantId,
    };
    if (filters.status) {
      query.status = filters.status;
    }

    const skip = (page - 1) * limit;

    const [deliveries, total] = await Promise.all([
      collection.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      collection.countDocuments(query),
    ]);

    return {
      deliveries: deliveries as unknown as WebhookDelivery[],
      total,
    };
  }

  async retryDelivery(
    deliveryId: string,
    tenantId: string
  ): Promise<WebhookDelivery | null> {
    const db = await getTenantDatabase(tenantId);
    const deliveryCollection = db.collection('webhook_deliveries');
    const endpointCollection = db.collection('webhook_endpoints');

    const delivery = await deliveryCollection.findOne({
      id: deliveryId,
      tenantId,
    }) as unknown as WebhookDelivery;

    if (!delivery) {
      return null;
    }

    const endpoint = await endpointCollection.findOne({
      id: delivery.webhookId,
      tenantId,
    }) as unknown as WebhookEndpoint;

    if (!endpoint) {
      return null;
    }

    // Reset delivery status
    await deliveryCollection.updateOne(
      { id: deliveryId },
      {
        $set: {
          status: 'pending',
          attempts: 0,
          error: null,
          statusCode: null,
          response: null,
          completedAt: null,
        },
      }
    );

    // Process delivery
    this.processDelivery(deliveryId, tenantId, endpoint);

    return { ...delivery, status: 'pending', attempts: 0 };
  }

  // Verify webhook signature (for use by receiving endpoints)
  verifySignature(payload: string, signature: string, secret: string): boolean {
    const expectedSignature = this.generateSignature(payload, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }
}
