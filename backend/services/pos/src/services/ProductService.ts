// Product service implementation

import { v4 as uuidv4 } from 'uuid';

import {
  logger,
  ApiError,
  getTenantDatabase,
  cache,
} from '@properpos/backend-shared';

interface Product {
  id: string;
  name: string;
  description?: string;
  sku: string;
  barcode?: string;
  price: number;
  costPrice?: number;
  categoryId?: string;
  categoryName?: string;
  tags: string[];
  images: string[];
  variants?: Array<{
    id: string;
    name: string;
    options: Array<{
      id: string;
      name: string;
      price: number;
    }>;
  }>;
  modifiers?: Array<{
    id: string;
    name: string;
    type: 'required' | 'optional';
    options: Array<{
      id: string;
      name: string;
      price: number;
    }>;
  }>;
  nutritionInfo?: {
    calories?: number;
    allergens: string[];
    ingredients: string[];
  };
  isActive: boolean;
  isAvailable: boolean;
  preparationTime?: number; // in minutes
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  deactivatedAt?: Date;
  deactivatedBy?: string;
  deactivationReason?: string;
}

interface ProductInventory {
  productId: string;
  locationId: string;
  quantity: number;
  lowStockThreshold: number;
  isLowStock: boolean;
  lastRestocked?: Date;
  notes?: string;
  updatedBy?: string;
  updatedAt: Date;
}

interface ProductStats {
  total: number;
  active: number;
  inactive: number;
  lowStock: number;
  outOfStock: number;
  topSelling: Array<{
    productId: string;
    productName: string;
    quantitySold: number;
    revenue: number;
  }>;
  averagePrice: number;
  totalValue: number;
}

export class ProductService {
  /**
   * Get products with filtering and pagination
   */
  async getProducts(
    tenantId: string,
    options: {
      page: number;
      limit: number;
      search?: string;
      categoryId?: string;
      isActive?: boolean;
      minPrice?: number;
      maxPrice?: number;
      inStock?: boolean;
      sortBy: string;
      sortOrder: 'asc' | 'desc';
    }
  ): Promise<{
    data: Product[];
    meta: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasMore: boolean;
    };
  }> {
    try {
      const {
        page,
        limit,
        search,
        categoryId,
        isActive,
        minPrice,
        maxPrice,
        inStock,
        sortBy,
        sortOrder
      } = options;
      const skip = (page - 1) * limit;

      // Get tenant database
      const db = await getTenantDatabase(tenantId);

      // Build query
      const query: any = {};

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { sku: { $regex: search, $options: 'i' } },
          { barcode: { $regex: search, $options: 'i' } },
          { tags: { $in: [new RegExp(search, 'i')] } },
        ];
      }

      if (categoryId) query.categoryId = categoryId;
      if (isActive !== undefined) query.isActive = isActive;

      if (minPrice !== undefined || maxPrice !== undefined) {
        query.price = {};
        if (minPrice !== undefined) query.price.$gte = minPrice;
        if (maxPrice !== undefined) query.price.$lte = maxPrice;
      }

      // Build sort object
      const sort: any = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      // Get total count
      const totalCount = await db.collection('products').countDocuments(query);

      // Get products
      const products = await db.collection('products')
        .find(query)
        .skip(skip)
        .limit(limit)
        .sort(sort)
        .toArray();

      // If filtering by stock, need to join with inventory
      if (inStock !== undefined) {
        // This would require a more complex aggregation pipeline
        // For now, we'll filter after fetching
      }

      const totalPages = Math.ceil(totalCount / limit);

      return {
        data: products as Product[],
        meta: {
          page,
          limit,
          total: totalCount,
          totalPages,
          hasMore: page < totalPages,
        },
      };

    } catch (error) {
      logger.error('Failed to get products', {
        tenantId,
        options,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to retrieve products', 'PRODUCTS_FETCH_FAILED', 500);
    }
  }

  /**
   * Get product by ID
   */
  async getProductById(tenantId: string, productId: string): Promise<Product | null> {
    try {
      const db = await getTenantDatabase(tenantId);

      // Try cache first
      const cacheKey = `product:${tenantId}:${productId}`;
      const cached = await cache.get(cacheKey);

      if (cached && typeof cached === 'string') {
        return JSON.parse(cached) as Product;
      }

      const product = await db.collection('products').findOne({ id: productId });

      if (product) {
        // Cache for 5 minutes
        await cache.set(cacheKey, JSON.stringify(product), 5 * 60);
      }

      return product as Product | null;

    } catch (error) {
      logger.error('Failed to get product by ID', {
        tenantId,
        productId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to retrieve product', 'PRODUCT_FETCH_FAILED', 500);
    }
  }

  /**
   * Create new product
   */
  async createProduct(
    tenantId: string,
    data: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Product> {
    try {
      const db = await getTenantDatabase(tenantId);

      // Validate SKU uniqueness
      const existingProduct = await db.collection('products').findOne({ sku: data.sku });
      if (existingProduct) {
        throw new ApiError('SKU already exists', 'SKU_DUPLICATE', 409);
      }

      // Get category name if category ID is provided
      let categoryName: string | undefined;
      if (data.categoryId) {
        const category = await db.collection('categories').findOne({ id: data.categoryId });
        categoryName = category?.name;
      }

      const product: Product = {
        ...data,
        id: uuidv4(),
        categoryName,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.collection('products').insertOne(product);

      // Initialize inventory for all locations
      const locations = await db.collection('locations')
        .find({ isActive: true }, { projection: { id: 1 } })
        .toArray();

      if (locations.length > 0) {
        const inventoryRecords = locations.map((location: any) => ({
          id: uuidv4(),
          productId: product.id,
          locationId: location.id,
          quantity: 0,
          lowStockThreshold: 10,
          isLowStock: true,
          updatedAt: new Date(),
        }));

        await db.collection('inventory').insertMany(inventoryRecords);
      }

      // Clear cache
      await this.clearProductCache(tenantId, product.id);

      logger.audit('Product created', {
        tenantId,
        productId: product.id,
        name: product.name,
        sku: product.sku,
        price: product.price,
        createdBy: data.createdBy,
      });

      return product;

    } catch (error) {
      logger.error('Failed to create product', {
        tenantId,
        data,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError('Failed to create product', 'PRODUCT_CREATION_FAILED', 500);
    }
  }

  /**
   * Update product
   */
  async updateProduct(
    tenantId: string,
    productId: string,
    updates: Partial<Omit<Product, 'id' | 'createdAt' | 'createdBy'>> & {
      updatedBy: string;
    }
  ): Promise<void> {
    try {
      const db = await getTenantDatabase(tenantId);

      // If updating category, get category name
      if (updates.categoryId) {
        const category = await db.collection('categories').findOne({ id: updates.categoryId });
        updates.categoryName = category?.name;
      }

      const updateData: any = {
        ...updates,
        updatedAt: new Date(),
      };

      // Remove undefined values
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key];
        }
      });

      const result = await db.collection('products').updateOne(
        { id: productId },
        { $set: updateData }
      );

      if (result.matchedCount === 0) {
        throw new ApiError('Product not found', 'PRODUCT_NOT_FOUND', 404);
      }

      // Clear cache
      await this.clearProductCache(tenantId, productId);

      logger.audit('Product updated', {
        tenantId,
        productId,
        updatedBy: updates.updatedBy,
        updatedFields: Object.keys(updates).filter(key => key !== 'updatedBy'),
      });

    } catch (error) {
      logger.error('Failed to update product', {
        tenantId,
        productId,
        updates,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError('Failed to update product', 'PRODUCT_UPDATE_FAILED', 500);
    }
  }

  /**
   * Deactivate product
   */
  async deactivateProduct(
    tenantId: string,
    productId: string,
    data: {
      reason?: string;
      deactivatedBy: string;
    }
  ): Promise<void> {
    try {
      const db = await getTenantDatabase(tenantId);

      const result = await db.collection('products').updateOne(
        { id: productId },
        {
          $set: {
            isActive: false,
            isAvailable: false,
            deactivatedAt: new Date(),
            deactivatedBy: data.deactivatedBy,
            deactivationReason: data.reason,
            updatedAt: new Date(),
          },
        }
      );

      if (result.matchedCount === 0) {
        throw new ApiError('Product not found', 'PRODUCT_NOT_FOUND', 404);
      }

      // Clear cache
      await this.clearProductCache(tenantId, productId);

      logger.audit('Product deactivated', {
        tenantId,
        productId,
        reason: data.reason,
        deactivatedBy: data.deactivatedBy,
      });

    } catch (error) {
      logger.error('Failed to deactivate product', {
        tenantId,
        productId,
        data,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError('Failed to deactivate product', 'PRODUCT_DEACTIVATION_FAILED', 500);
    }
  }

  /**
   * Reactivate product
   */
  async reactivateProduct(tenantId: string, productId: string, reactivatedBy: string): Promise<void> {
    try {
      const db = await getTenantDatabase(tenantId);

      const result = await db.collection('products').updateOne(
        { id: productId },
        {
          $set: {
            isActive: true,
            isAvailable: true,
            updatedAt: new Date(),
          },
          $unset: {
            deactivatedAt: '',
            deactivatedBy: '',
            deactivationReason: '',
          },
        }
      );

      if (result.matchedCount === 0) {
        throw new ApiError('Product not found', 'PRODUCT_NOT_FOUND', 404);
      }

      // Clear cache
      await this.clearProductCache(tenantId, productId);

      logger.audit('Product reactivated', {
        tenantId,
        productId,
        reactivatedBy,
      });

    } catch (error) {
      logger.error('Failed to reactivate product', {
        tenantId,
        productId,
        reactivatedBy,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof ApiError) {
        throw error;
      }

      throw new ApiError('Failed to reactivate product', 'PRODUCT_REACTIVATION_FAILED', 500);
    }
  }

  /**
   * Get product inventory across all locations
   */
  async getProductInventory(tenantId: string, productId: string): Promise<ProductInventory[]> {
    try {
      const db = await getTenantDatabase(tenantId);

      const inventory = await db.collection('inventory')
        .aggregate([
          { $match: { productId } },
          {
            $lookup: {
              from: 'locations',
              localField: 'locationId',
              foreignField: 'id',
              as: 'location'
            }
          },
          {
            $project: {
              productId: 1,
              locationId: 1,
              locationName: { $arrayElemAt: ['$location.name', 0] },
              quantity: 1,
              lowStockThreshold: 1,
              isLowStock: { $lt: ['$quantity', '$lowStockThreshold'] },
              lastRestocked: 1,
              notes: 1,
              updatedAt: 1,
            }
          }
        ])
        .toArray();

      return inventory as ProductInventory[];

    } catch (error) {
      logger.error('Failed to get product inventory', {
        tenantId,
        productId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to retrieve product inventory', 'INVENTORY_FETCH_FAILED', 500);
    }
  }

  /**
   * Update product inventory for a location
   */
  async updateProductInventory(
    tenantId: string,
    productId: string,
    locationId: string,
    data: {
      quantity?: number;
      lowStockThreshold?: number;
      notes?: string;
      updatedBy: string;
    }
  ): Promise<void> {
    try {
      const db = await getTenantDatabase(tenantId);

      const updateData: any = {
        updatedAt: new Date(),
      };

      if (data.quantity !== undefined) updateData.quantity = data.quantity;
      if (data.lowStockThreshold !== undefined) updateData.lowStockThreshold = data.lowStockThreshold;
      if (data.notes !== undefined) updateData.notes = data.notes;

      // Update isLowStock based on new values
      const inventory = await db.collection('inventory').findOne({
        productId,
        locationId
      });

      if (inventory) {
        const currentQuantity = data.quantity !== undefined ? data.quantity : inventory.quantity;
        const currentThreshold = data.lowStockThreshold !== undefined ? data.lowStockThreshold : inventory.lowStockThreshold;
        updateData.isLowStock = currentQuantity < currentThreshold;

        if (data.quantity !== undefined && data.quantity > inventory.quantity) {
          updateData.lastRestocked = new Date();
        }
      }

      const result = await db.collection('inventory').updateOne(
        { productId, locationId },
        { $set: updateData },
        { upsert: true }
      );

      if (result.matchedCount === 0 && result.upsertedCount === 0) {
        // Create inventory record if it doesn't exist
        await db.collection('inventory').insertOne({
          id: uuidv4(),
          productId,
          locationId,
          quantity: data.quantity || 0,
          lowStockThreshold: data.lowStockThreshold || 10,
          isLowStock: (data.quantity || 0) < (data.lowStockThreshold || 10),
          notes: data.notes,
          updatedAt: new Date(),
        });
      }

      logger.audit('Product inventory updated', {
        tenantId,
        productId,
        locationId,
        quantity: data.quantity,
        lowStockThreshold: data.lowStockThreshold,
        updatedBy: data.updatedBy,
      });

    } catch (error) {
      logger.error('Failed to update product inventory', {
        tenantId,
        productId,
        locationId,
        data,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to update product inventory', 'INVENTORY_UPDATE_FAILED', 500);
    }
  }

  /**
   * Bulk update products
   */
  async bulkUpdateProducts(
    tenantId: string,
    productIds: string[],
    updates: Partial<Omit<Product, 'id' | 'createdAt' | 'createdBy'>> & {
      updatedBy: string;
    }
  ): Promise<{ matchedCount: number; modifiedCount: number }> {
    try {
      const db = await getTenantDatabase(tenantId);

      const updateData: any = {
        ...updates,
        updatedAt: new Date(),
      };

      // Remove undefined values
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key];
        }
      });

      const result = await db.collection('products').updateMany(
        { id: { $in: productIds } },
        { $set: updateData }
      );

      // Clear cache for all updated products
      await Promise.all(
        productIds.map(productId => this.clearProductCache(tenantId, productId))
      );

      logger.audit('Products bulk updated', {
        tenantId,
        productIds,
        updatedCount: result.modifiedCount,
        updatedBy: updates.updatedBy,
      });

      return {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      };

    } catch (error) {
      logger.error('Failed to bulk update products', {
        tenantId,
        productIds,
        updates,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to bulk update products', 'BULK_UPDATE_FAILED', 500);
    }
  }

  /**
   * Bulk delete (soft-delete) products
   */
  async bulkDeleteProducts(
    tenantId: string,
    productIds: string[],
    data: {
      reason?: string;
      deletedBy: string;
    }
  ): Promise<{ matchedCount: number; modifiedCount: number }> {
    try {
      const db = await getTenantDatabase(tenantId);

      const result = await db.collection('products').updateMany(
        { id: { $in: productIds } },
        {
          $set: {
            isActive: false,
            deactivatedAt: new Date(),
            deactivatedBy: data.deletedBy,
            deactivationReason: data.reason,
            updatedAt: new Date(),
          },
        }
      );

      // Clear cache for all deleted products
      await Promise.all(
        productIds.map(productId => this.clearProductCache(tenantId, productId))
      );

      logger.audit('Products bulk deleted', {
        tenantId,
        productIds,
        deletedCount: result.modifiedCount,
        reason: data.reason,
        deletedBy: data.deletedBy,
      });

      return {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      };

    } catch (error) {
      logger.error('Failed to bulk delete products', {
        tenantId,
        productIds,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to bulk delete products', 'BULK_DELETE_FAILED', 500);
    }
  }

  /**
   * Bulk export products as CSV
   */
  async bulkExportProducts(
    tenantId: string,
    productIds?: string[]
  ): Promise<string> {
    try {
      const db = await getTenantDatabase(tenantId);

      const query: any = {};
      if (productIds && productIds.length > 0) {
        query.id = { $in: productIds };
      }

      const products = await db.collection('products').find(query).toArray();

      // Build CSV
      const headers = ['ID', 'Name', 'SKU', 'Category', 'Price', 'Cost', 'Status', 'Created At'];
      const rows = products.map((product: any) => {
        const name = product.name && product.name.includes(',') ? `"${product.name}"` : (product.name || '');
        const category = product.categoryName && product.categoryName.includes(',') ? `"${product.categoryName}"` : (product.categoryName || '');
        return [
          product.id || '',
          name,
          product.sku || '',
          category,
          product.price != null ? product.price : '',
          product.costPrice != null ? product.costPrice : '',
          product.isActive ? 'Active' : 'Inactive',
          product.createdAt ? new Date(product.createdAt).toISOString() : '',
        ].join(',');
      });

      const csv = [headers.join(','), ...rows].join('\n');

      logger.audit('Products bulk exported', {
        tenantId,
        productCount: products.length,
        filtered: !!(productIds && productIds.length > 0),
      });

      return csv;

    } catch (error) {
      logger.error('Failed to bulk export products', {
        tenantId,
        productIds,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to bulk export products', 'BULK_EXPORT_FAILED', 500);
    }
  }

  /**
   * Get products with low stock
   */
  async getLowStockProducts(
    tenantId: string,
    options: {
      locationId?: string;
      limit: number;
    }
  ): Promise<Array<{
    product: Product;
    inventory: ProductInventory;
  }>> {
    try {
      const db = await getTenantDatabase(tenantId);

      const matchStage: any = { isLowStock: true };
      if (options.locationId) {
        matchStage.locationId = options.locationId;
      }

      const pipeline = [
        { $match: matchStage },
        {
          $lookup: {
            from: 'products',
            localField: 'productId',
            foreignField: 'id',
            as: 'product'
          }
        },
        { $unwind: '$product' },
        { $match: { 'product.isActive': true } },
        { $limit: options.limit },
        {
          $project: {
            inventory: {
              productId: '$productId',
              locationId: '$locationId',
              quantity: '$quantity',
              lowStockThreshold: '$lowStockThreshold',
              isLowStock: '$isLowStock',
              updatedAt: '$updatedAt',
            },
            product: '$product'
          }
        }
      ];

      const results = await db.collection('inventory').aggregate(pipeline).toArray();

      return results as Array<{
        product: Product;
        inventory: ProductInventory;
      }>;

    } catch (error) {
      logger.error('Failed to get low stock products', {
        tenantId,
        options,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to retrieve low stock products', 'LOW_STOCK_FETCH_FAILED', 500);
    }
  }

  /**
   * Get product statistics
   */
  async getProductStats(
    tenantId: string,
    options: {
      locationId?: string;
      period: string;
    }
  ): Promise<ProductStats> {
    try {
      const db = await getTenantDatabase(tenantId);

      // Calculate date range based on period
      const now = new Date();
      let startDate: Date;

      switch (options.period) {
        case 'today':
          startDate = new Date(now);
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'week':
          startDate = new Date(now);
          startDate.setDate(now.getDate() - 7);
          break;
        case 'month':
          startDate = new Date(now);
          startDate.setMonth(now.getMonth() - 1);
          break;
        default:
          startDate = new Date(now);
          startDate.setHours(0, 0, 0, 0);
      }

      // Get basic product counts
      const [
        totalProducts,
        activeProducts,
        lowStockCount,
        outOfStockCount,
        avgPrice,
        topSellingData
      ] = await Promise.all([
        db.collection('products').countDocuments({}),
        db.collection('products').countDocuments({ isActive: true }),
        db.collection('inventory').countDocuments({
          isLowStock: true,
          ...(options.locationId && { locationId: options.locationId })
        }),
        db.collection('inventory').countDocuments({
          quantity: 0,
          ...(options.locationId && { locationId: options.locationId })
        }),
        this.getAveragePrice(db),
        this.getTopSellingProducts(db, startDate, options.locationId, 10)
      ]);

      // Calculate total inventory value
      const totalValue = await this.getTotalInventoryValue(db, options.locationId);

      return {
        total: totalProducts,
        active: activeProducts,
        inactive: totalProducts - activeProducts,
        lowStock: lowStockCount,
        outOfStock: outOfStockCount,
        topSelling: topSellingData,
        averagePrice: avgPrice,
        totalValue,
      };

    } catch (error) {
      logger.error('Failed to get product statistics', {
        tenantId,
        options,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to retrieve product statistics', 'PRODUCT_STATS_FAILED', 500);
    }
  }

  /**
   * Search products (optimized for POS)
   */
  async searchProducts(
    tenantId: string,
    options: {
      query: string;
      limit: number;
      activeOnly?: boolean;
    }
  ): Promise<Array<{
    id: string;
    name: string;
    sku: string;
    price: number;
    categoryName?: string;
    isAvailable: boolean;
  }>> {
    try {
      const db = await getTenantDatabase(tenantId);

      const query: any = {
        $or: [
          { name: { $regex: options.query, $options: 'i' } },
          { sku: { $regex: options.query, $options: 'i' } },
          { barcode: options.query }, // Exact match for barcode
        ],
      };

      if (options.activeOnly) {
        query.isActive = true;
      }

      const products = await db.collection('products')
        .find(query)
        .project({
          id: 1,
          name: 1,
          sku: 1,
          price: 1,
          categoryName: 1,
          isAvailable: 1,
        })
        .limit(options.limit)
        .sort({ name: 1 })
        .toArray();

      return products as Array<{
        id: string;
        name: string;
        sku: string;
        price: number;
        categoryName?: string;
        isAvailable: boolean;
      }>;

    } catch (error) {
      logger.error('Failed to search products', {
        tenantId,
        options,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw new ApiError('Failed to search products', 'PRODUCT_SEARCH_FAILED', 500);
    }
  }

  /**
   * Get average product price
   */
  private async getAveragePrice(db: any): Promise<number> {
    const pipeline = [
      { $match: { isActive: true } },
      {
        $group: {
          _id: null,
          averagePrice: { $avg: '$price' }
        }
      }
    ];

    const results = await db.collection('products').aggregate(pipeline).toArray();
    return results.length > 0 ? Math.round(results[0].averagePrice * 100) / 100 : 0;
  }

  /**
   * Get top selling products
   */
  private async getTopSellingProducts(
    db: any,
    startDate: Date,
    locationId?: string,
    limit: number = 10
  ): Promise<Array<{
    productId: string;
    productName: string;
    quantitySold: number;
    revenue: number;
  }>> {
    const matchStage: any = {
      createdAt: { $gte: startDate },
      status: { $in: ['completed', 'paid'] }
    };

    if (locationId) {
      matchStage.locationId = locationId;
    }

    const pipeline = [
      { $match: matchStage },
      { $unwind: '$items' },
      {
        $group: {
          _id: {
            productId: '$items.productId',
            productName: '$items.productName'
          },
          quantitySold: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.totalPrice' }
        }
      },
      {
        $project: {
          productId: '$_id.productId',
          productName: '$_id.productName',
          quantitySold: 1,
          revenue: 1,
          _id: 0
        }
      },
      { $sort: { quantitySold: -1 } },
      { $limit: limit }
    ];

    return await db.collection('orders').aggregate(pipeline).toArray();
  }

  /**
   * Get total inventory value
   */
  private async getTotalInventoryValue(db: any, locationId?: string): Promise<number> {
    const matchStage: any = {};
    if (locationId) {
      matchStage.locationId = locationId;
    }

    const pipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: 'products',
          localField: 'productId',
          foreignField: 'id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $project: {
          value: {
            $multiply: [
              '$quantity',
              { $ifNull: ['$product.costPrice', '$product.price'] }
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          totalValue: { $sum: '$value' }
        }
      }
    ];

    const results = await db.collection('inventory').aggregate(pipeline).toArray();
    return results.length > 0 ? Math.round(results[0].totalValue * 100) / 100 : 0;
  }

  /**
   * Clear product cache
   */
  private async clearProductCache(tenantId: string, productId: string): Promise<void> {
    try {
      await cache.del(`product:${tenantId}:${productId}`);
    } catch (error) {
      logger.warn('Failed to clear product cache', { tenantId, productId, error });
    }
  }
}