// Category management service

import {
  logger,
  getTenantDatabase,
  Category,
  Product
} from '@properpos/backend-shared';

export class CategoryService {
  constructor() {
    // No initialization needed - using getTenantDatabase directly
  }

  /**
   * Get all categories for a tenant with hierarchical structure
   */
  async getCategories(tenantId: string, options: {
    includeInactive?: boolean;
  } = {}): Promise<Category[]> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('categories');

      const filter: any = {};
      if (!options.includeInactive) {
        filter.isActive = true;
      }

      const categories = await collection
        .find(filter)
        .sort({ name: 1 })
        .toArray();

      // Build hierarchical structure
      return this.buildCategoryTree(categories);

    } catch (error) {
      logger.error('Get categories error', {
        tenantId,
        options,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get category by ID
   */
  async getCategoryById(tenantId: string, categoryId: string): Promise<Category | null> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('categories');

      const category = await collection.findOne({ id: categoryId });
      return category;

    } catch (error) {
      logger.error('Get category by ID error', {
        tenantId,
        categoryId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Create new category
   */
  async createCategory(
    tenantId: string,
    data: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Category> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('categories');

      // Validate parent category exists if provided
      if (data.parentId) {
        const parentCategory = await collection.findOne({ id: data.parentId });
        if (!parentCategory) {
          throw new Error('Parent category not found');
        }

        // Check for circular references
        if (await this.wouldCreateCircularReference(tenantId, data.parentId, data.name)) {
          throw new Error('Circular reference detected in category hierarchy');
        }
      }

      // Check for duplicate names at the same level
      const existingCategory = await collection.findOne({
        name: { $regex: new RegExp(`^${data.name}$`, 'i') },
        parentId: data.parentId || null,
      });

      if (existingCategory) {
        throw new Error('Category name already exists at this level');
      }

      const category = {
        id: require('uuid').v4(),
        ...data,
        isActive: true,
        productCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Category;

      await collection.insertOne(category);

      logger.info('Category created', {
        tenantId,
        categoryId: category.id,
        name: category.name,
        parentId: category.parentId,
      });

      return category;

    } catch (error) {
      logger.error('Create category error', {
        tenantId,
        data,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Update category
   */
  async updateCategory(
    tenantId: string,
    categoryId: string,
    updates: Partial<Omit<Category, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<void> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('categories');

      // Validate parent category if being updated
      if (updates.parentId) {
        const parentCategory = await collection.findOne({ id: updates.parentId });
        if (!parentCategory) {
          throw new Error('Parent category not found');
        }

        // Prevent setting parent to self or creating circular references
        if (updates.parentId === categoryId) {
          throw new Error('Category cannot be its own parent');
        }

        const category = await collection.findOne({ id: categoryId });
        if (category && await this.wouldCreateCircularReference(tenantId, updates.parentId, category.name)) {
          throw new Error('Circular reference detected in category hierarchy');
        }
      }

      // Check for duplicate names if name is being updated
      if (updates.name) {
        const currentCategory = await collection.findOne({ id: categoryId });
        if (currentCategory) {
          const existingCategory = await collection.findOne({
            name: { $regex: new RegExp(`^${updates.name}$`, 'i') },
            parentId: updates.parentId !== undefined ? updates.parentId : currentCategory.parentId,
            id: { $ne: categoryId },
          });

          if (existingCategory) {
            throw new Error('Category name already exists at this level');
          }
        }
      }

      const updateData = {
        ...updates,
        updatedAt: new Date(),
      };

      const result = await collection.updateOne(
        { id: categoryId },
        { $set: updateData }
      );

      if (result.matchedCount === 0) {
        throw new Error('Category not found');
      }

      logger.info('Category updated', {
        tenantId,
        categoryId,
        updates: Object.keys(updates),
      });

    } catch (error) {
      logger.error('Update category error', {
        tenantId,
        categoryId,
        updates,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Deactivate category
   */
  async deactivateCategory(tenantId: string, categoryId: string, deactivatedBy: string): Promise<void> {
    try {
      const db = await getTenantDatabase(tenantId);
      const categoriesCollection = db.collection('categories');

      const result = await categoriesCollection.updateOne(
        { id: categoryId },
        {
          $set: {
            isActive: false,
            deactivatedBy,
            deactivatedAt: new Date(),
            updatedAt: new Date(),
          },
        }
      );

      if (result.matchedCount === 0) {
        throw new Error('Category not found');
      }

      // Also deactivate all subcategories
      await this.deactivateSubcategories(tenantId, categoryId, deactivatedBy);

      logger.info('Category deactivated', {
        tenantId,
        categoryId,
        deactivatedBy,
      });

    } catch (error) {
      logger.error('Deactivate category error', {
        tenantId,
        categoryId,
        deactivatedBy,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Reactivate category
   */
  async reactivateCategory(tenantId: string, categoryId: string, reactivatedBy: string): Promise<void> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('categories');

      // Check if parent category is active if this category has a parent
      const category = await collection.findOne({ id: categoryId });
      if (category?.parentId) {
        const parentCategory = await collection.findOne({ id: category.parentId });
        if (!parentCategory?.isActive) {
          throw new Error('Cannot reactivate category with inactive parent');
        }
      }

      const result = await collection.updateOne(
        { id: categoryId },
        {
          $set: {
            isActive: true,
            reactivatedBy,
            reactivatedAt: new Date(),
            updatedAt: new Date(),
          },
          $unset: {
            deactivatedBy: '',
            deactivatedAt: '',
          },
        }
      );

      if (result.matchedCount === 0) {
        throw new Error('Category not found');
      }

      logger.info('Category reactivated', {
        tenantId,
        categoryId,
        reactivatedBy,
      });

    } catch (error) {
      logger.error('Reactivate category error', {
        tenantId,
        categoryId,
        reactivatedBy,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Check if category has active products
   */
  async hasActiveProducts(tenantId: string, categoryId: string): Promise<boolean> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('products');

      const count = await collection.countDocuments({
        categoryId,
        isActive: true,
      });

      return count > 0;

    } catch (error) {
      logger.error('Check active products error', {
        tenantId,
        categoryId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get products in category
   */
  async getCategoryProducts(
    tenantId: string,
    categoryId: string,
    options: {
      page?: number;
      limit?: number;
      activeOnly?: boolean;
    } = {}
  ): Promise<{
    products: Product[];
    totalCount: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('products');

      const { page = 1, limit = 20, activeOnly = true } = options;

      const filter: any = { categoryId };
      if (activeOnly) {
        filter.isActive = true;
      }

      const [products, totalCount] = await Promise.all([
        collection
          .find(filter)
          .sort({ name: 1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .toArray(),
        collection.countDocuments(filter),
      ]);

      return {
        products,
        totalCount,
        page,
        totalPages: Math.ceil(totalCount / limit),
      };

    } catch (error) {
      logger.error('Get category products error', {
        tenantId,
        categoryId,
        options,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Update product count for categories
   */
  async updateProductCounts(tenantId: string): Promise<void> {
    try {
      const db = await getTenantDatabase(tenantId);
      const categoriesCollection = db.collection('categories');
      const productsCollection = db.collection('products');

      // Get all categories
      const categories = await categoriesCollection.find({}).toArray();

      // Update product count for each category
      for (const category of categories) {
        const productCount = await productsCollection.countDocuments({
          categoryId: category.id,
          isActive: true,
        });

        await categoriesCollection.updateOne(
          { id: category.id },
          { $set: { productCount, updatedAt: new Date() } }
        );
      }

      logger.info('Product counts updated', {
        tenantId,
        categoriesUpdated: categories.length,
      });

    } catch (error) {
      logger.error('Update product counts error', {
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Build hierarchical category tree
   */
  private buildCategoryTree(categories: Category[]): Category[] {
    const categoryMap = new Map<string, Category & { children?: Category[] }>();
    const rootCategories: Category[] = [];

    // First pass: create map and add children array
    categories.forEach(category => {
      categoryMap.set(category.id, { ...category, children: [] });
    });

    // Second pass: build tree structure
    categories.forEach(category => {
      const categoryWithChildren = categoryMap.get(category.id)!;

      if (category.parentId && categoryMap.has(category.parentId)) {
        const parent = categoryMap.get(category.parentId)!;
        parent.children!.push(categoryWithChildren);
      } else {
        rootCategories.push(categoryWithChildren);
      }
    });

    return rootCategories;
  }

  /**
   * Check if setting a parent would create a circular reference
   */
  private async wouldCreateCircularReference(
    tenantId: string,
    parentId: string,
    categoryName: string
  ): Promise<boolean> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('categories');

      // Traverse up the parent chain to check for circular reference
      let currentParentId = parentId;
      const visited = new Set<string>();

      while (currentParentId) {
        if (visited.has(currentParentId)) {
          return true; // Circular reference detected
        }

        visited.add(currentParentId);

        const parentCategory = await collection.findOne({ id: currentParentId });
        if (!parentCategory) {
          break;
        }

        // Check if we're trying to set a category as its own descendant
        if (parentCategory.name === categoryName) {
          return true;
        }

        currentParentId = parentCategory.parentId || '';
      }

      return false;

    } catch (error) {
      logger.error('Check circular reference error', {
        tenantId,
        parentId,
        categoryName,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return true; // Err on the side of caution
    }
  }

  /**
   * Recursively deactivate all subcategories
   */
  private async deactivateSubcategories(
    tenantId: string,
    parentId: string,
    deactivatedBy: string
  ): Promise<void> {
    try {
      const db = await getTenantDatabase(tenantId);
      const collection = db.collection('categories');

      // Find all direct children
      const subcategories = await collection.find({ parentId }).toArray();

      for (const subcategory of subcategories) {
        // Deactivate the subcategory
        await collection.updateOne(
          { id: subcategory.id },
          {
            $set: {
              isActive: false,
              deactivatedBy,
              deactivatedAt: new Date(),
              updatedAt: new Date(),
            },
          }
        );

        // Recursively deactivate its children
        await this.deactivateSubcategories(tenantId, subcategory.id, deactivatedBy);
      }

    } catch (error) {
      logger.error('Deactivate subcategories error', {
        tenantId,
        parentId,
        deactivatedBy,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
}