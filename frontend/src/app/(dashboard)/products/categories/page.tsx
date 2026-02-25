'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Search,
  Plus,
  Edit,
  Trash2,
  Folder,
  FolderOpen,
  Package,
  GripVertical,
  ChevronRight,
  ChevronDown,
  MoreVertical,
  Eye,
  EyeOff,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useUIStore } from '@/store';

interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  parentId?: string;
  image?: string;
  productCount: number;
  displayOrder: number;
  isActive: boolean;
  children?: Category[];
  createdAt: string;
}

export default function CategoriesPage() {
  const addToast = useUIStore(s => s.addToast);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  useEffect(() => {
    setTimeout(() => {
      setCategories([
        {
          id: '1',
          name: 'Food',
          slug: 'food',
          description: 'Main food items',
          productCount: 45,
          displayOrder: 1,
          isActive: true,
          createdAt: new Date(Date.now() - 86400000 * 365).toISOString(),
          children: [
            { id: '1-1', name: 'Burgers', slug: 'burgers', parentId: '1', productCount: 12, displayOrder: 1, isActive: true, createdAt: new Date().toISOString() },
            { id: '1-2', name: 'Pizzas', slug: 'pizzas', parentId: '1', productCount: 8, displayOrder: 2, isActive: true, createdAt: new Date().toISOString() },
            { id: '1-3', name: 'Salads', slug: 'salads', parentId: '1', productCount: 6, displayOrder: 3, isActive: true, createdAt: new Date().toISOString() },
            { id: '1-4', name: 'Sandwiches', slug: 'sandwiches', parentId: '1', productCount: 10, displayOrder: 4, isActive: true, createdAt: new Date().toISOString() },
            { id: '1-5', name: 'Pasta', slug: 'pasta', parentId: '1', productCount: 5, displayOrder: 5, isActive: false, createdAt: new Date().toISOString() },
          ],
        },
        {
          id: '2',
          name: 'Beverages',
          slug: 'beverages',
          description: 'Drinks and refreshments',
          productCount: 32,
          displayOrder: 2,
          isActive: true,
          createdAt: new Date(Date.now() - 86400000 * 300).toISOString(),
          children: [
            { id: '2-1', name: 'Soft Drinks', slug: 'soft-drinks', parentId: '2', productCount: 15, displayOrder: 1, isActive: true, createdAt: new Date().toISOString() },
            { id: '2-2', name: 'Coffee & Tea', slug: 'coffee-tea', parentId: '2', productCount: 10, displayOrder: 2, isActive: true, createdAt: new Date().toISOString() },
            { id: '2-3', name: 'Juices', slug: 'juices', parentId: '2', productCount: 7, displayOrder: 3, isActive: true, createdAt: new Date().toISOString() },
          ],
        },
        {
          id: '3',
          name: 'Desserts',
          slug: 'desserts',
          description: 'Sweet treats',
          productCount: 18,
          displayOrder: 3,
          isActive: true,
          createdAt: new Date(Date.now() - 86400000 * 200).toISOString(),
          children: [
            { id: '3-1', name: 'Cakes', slug: 'cakes', parentId: '3', productCount: 8, displayOrder: 1, isActive: true, createdAt: new Date().toISOString() },
            { id: '3-2', name: 'Ice Cream', slug: 'ice-cream', parentId: '3', productCount: 6, displayOrder: 2, isActive: true, createdAt: new Date().toISOString() },
            { id: '3-3', name: 'Pastries', slug: 'pastries', parentId: '3', productCount: 4, displayOrder: 3, isActive: true, createdAt: new Date().toISOString() },
          ],
        },
        {
          id: '4',
          name: 'Sides',
          slug: 'sides',
          description: 'Side dishes and add-ons',
          productCount: 24,
          displayOrder: 4,
          isActive: true,
          createdAt: new Date(Date.now() - 86400000 * 150).toISOString(),
        },
        {
          id: '5',
          name: 'Merchandise',
          slug: 'merchandise',
          description: 'Branded items and merchandise',
          productCount: 8,
          displayOrder: 5,
          isActive: false,
          createdAt: new Date(Date.now() - 86400000 * 60).toISOString(),
        },
      ]);
      setExpandedIds(['1', '2', '3']);
      setIsLoading(false);
    }, 500);
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleActive = (category: Category) => {
    // In real app, this would call API
    addToast({
      type: 'success',
      title: category.isActive ? 'Category hidden' : 'Category visible',
      message: `${category.name} is now ${category.isActive ? 'hidden' : 'visible'} in POS`,
    });
  };

  const filteredCategories = categories.filter(cat => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const matchesParent = cat.name.toLowerCase().includes(query);
    const matchesChild = cat.children?.some(c => c.name.toLowerCase().includes(query));
    return matchesParent || matchesChild;
  });

  const totalProducts = categories.reduce((sum, cat) => sum + cat.productCount, 0);
  const activeCategories = categories.filter(c => c.isActive).length;

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-muted rounded w-1/4" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-16 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/products">
          <Button variant="ghost" size="sm" className="cursor-pointer">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">Categories</h1>
          <p className="text-muted-foreground mt-1">
            Organize your product catalog
          </p>
        </div>
        <Button onClick={() => { setEditingCategory(null); setShowModal(true); }} className="cursor-pointer">
          <Plus className="w-4 h-4 mr-2" />
          Add Category
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
                <Folder className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Categories</p>
                <p className="text-xl font-bold text-foreground">{categories.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 dark:bg-green-900/20 rounded-lg flex items-center justify-center">
                <Eye className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="text-xl font-bold text-foreground">{activeCategories}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/20 rounded-lg flex items-center justify-center">
                <Package className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Products</p>
                <p className="text-xl font-bold text-foreground">{totalProducts}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search categories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-border rounded-lg bg-background text-foreground"
            />
          </div>
        </CardContent>
      </Card>

      {/* Categories Tree */}
      <Card>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {filteredCategories.map(category => (
              <div key={category.id}>
                {/* Parent Category */}
                <div className={cn(
                  'flex items-center gap-3 p-4 hover:bg-muted/50',
                  !category.isActive && 'opacity-60'
                )}>
                  <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />

                  {category.children && category.children.length > 0 ? (
                    <button onClick={() => toggleExpand(category.id)} className="p-1 hover:bg-accent rounded cursor-pointer">
                      {expandedIds.includes(category.id) ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      )}
                    </button>
                  ) : (
                    <div className="w-6" />
                  )}

                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    {expandedIds.includes(category.id) ? (
                      <FolderOpen className="w-5 h-5 text-primary" />
                    ) : (
                      <Folder className="w-5 h-5 text-primary" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-foreground">{category.name}</h3>
                      {!category.isActive && (
                        <span className="text-xs px-2 py-0.5 bg-muted text-muted-foreground rounded">Hidden</span>
                      )}
                    </div>
                    {category.description && (
                      <p className="text-sm text-muted-foreground truncate">{category.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="font-medium text-foreground">{category.productCount}</p>
                      <p className="text-xs text-muted-foreground">products</p>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => toggleActive(category)}
                        className="p-2 hover:bg-accent rounded cursor-pointer"
                        title={category.isActive ? 'Hide category' : 'Show category'}
                      >
                        {category.isActive ? (
                          <Eye className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <EyeOff className="w-4 h-4 text-muted-foreground" />
                        )}
                      </button>
                      <button
                        onClick={() => { setEditingCategory(category); setShowModal(true); }}
                        className="p-2 hover:bg-accent rounded cursor-pointer"
                      >
                        <Edit className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button className="p-2 hover:bg-accent rounded cursor-pointer">
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Child Categories */}
                {category.children && expandedIds.includes(category.id) && (
                  <div className="bg-muted/50">
                    {category.children.map(child => (
                      <div
                        key={child.id}
                        className={cn(
                          'flex items-center gap-3 p-4 pl-16 hover:bg-muted/50 border-t border-border',
                          !child.isActive && 'opacity-60'
                        )}
                      >
                        <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />

                        <div className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center">
                          <Folder className="w-4 h-4 text-muted-foreground" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium text-foreground">{child.name}</h4>
                            {!child.isActive && (
                              <span className="text-xs px-2 py-0.5 bg-muted text-muted-foreground rounded">Hidden</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <p className="font-medium text-foreground">{child.productCount}</p>
                            <p className="text-xs text-muted-foreground">products</p>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => toggleActive(child)}
                              className="p-2 hover:bg-accent rounded cursor-pointer"
                            >
                              {child.isActive ? (
                                <Eye className="w-4 h-4 text-muted-foreground" />
                              ) : (
                                <EyeOff className="w-4 h-4 text-muted-foreground" />
                              )}
                            </button>
                            <button
                              onClick={() => { setEditingCategory(child); setShowModal(true); }}
                              className="p-2 hover:bg-accent rounded cursor-pointer"
                            >
                              <Edit className="w-4 h-4 text-muted-foreground" />
                            </button>
                            <button className="p-2 hover:bg-accent rounded cursor-pointer">
                              <Trash2 className="w-4 h-4 text-red-400" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Category Modal */}
      {showModal && (
        <CategoryModal
          category={editingCategory}
          parentCategories={categories.filter(c => !c.parentId)}
          onClose={() => { setShowModal(false); setEditingCategory(null); }}
          onSave={(cat) => {
            if (editingCategory) {
              addToast({ type: 'success', title: 'Category updated' });
            } else {
              addToast({ type: 'success', title: 'Category created' });
            }
            setShowModal(false);
            setEditingCategory(null);
          }}
        />
      )}

      {filteredCategories.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <Folder className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No categories found</h3>
            <Button onClick={() => setShowModal(true)} className="cursor-pointer">
              <Plus className="w-4 h-4 mr-2" />
              Add Category
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CategoryModal({
  category,
  parentCategories,
  onClose,
  onSave,
}: {
  category: Category | null;
  parentCategories: Category[];
  onClose: () => void;
  onSave: (cat: Category) => void;
}) {
  const [form, setForm] = useState({
    name: category?.name || '',
    slug: category?.slug || '',
    description: category?.description || '',
    parentId: category?.parentId || '',
    isActive: category?.isActive ?? true,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      setForm(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else {
      setForm(prev => ({ ...prev, [name]: value }));
    }

    // Auto-generate slug from name
    if (name === 'name') {
      setForm(prev => ({
        ...prev,
        slug: value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      }));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <Card className="w-full max-w-md" onClick={e => e.stopPropagation()}>
        <CardHeader>
          <CardTitle>{category ? 'Edit Category' : 'Add Category'}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => { e.preventDefault(); onSave(form as unknown as Category); }} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Category Name *</label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border rounded-lg bg-background border-border"
                placeholder="e.g., Burgers"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Slug</label>
              <input
                type="text"
                name="slug"
                value={form.slug}
                onChange={handleChange}
                className="w-full px-3 py-2 border rounded-lg bg-background border-border"
                placeholder="auto-generated"
              />
              <p className="text-xs text-muted-foreground mt-1">Used in URLs and API</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Parent Category</label>
              <select
                name="parentId"
                value={form.parentId}
                onChange={handleChange}
                className="w-full px-3 py-2 border rounded-lg bg-background border-border cursor-pointer"
              >
                <option value="">None (Top Level)</option>
                {parentCategories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                rows={3}
                className="w-full px-3 py-2 border rounded-lg bg-background border-border"
                placeholder="Optional description"
              />
            </div>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="isActive"
                checked={form.isActive}
                onChange={handleChange}
                className="rounded border-input cursor-pointer"
              />
              <span className="text-sm">Show in POS</span>
            </label>

            <div className="flex gap-2 pt-4">
              <Button type="button" variant="outline" className="flex-1 cursor-pointer" onClick={onClose}>Cancel</Button>
              <Button type="submit" className="flex-1 cursor-pointer">{category ? 'Save Changes' : 'Create Category'}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
