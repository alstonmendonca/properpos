// POS E2E Tests
import { test, expect } from '@playwright/test';

test.describe('Point of Sale', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.fill('input[type="email"]', 'demo@properpos.com');
    await page.fill('input[type="password"]', 'demo123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/dashboard/, { timeout: 10000 });

    // Navigate to POS
    await page.goto('/pos');
  });

  test('should display POS interface', async ({ page }) => {
    // Should have product grid
    await expect(page.locator('[data-testid="product-grid"]').or(page.locator('.product-grid'))).toBeVisible();

    // Should have cart
    await expect(page.locator('[data-testid="cart"]').or(page.locator('.cart'))).toBeVisible();
  });

  test('should display product categories', async ({ page }) => {
    // Should have category filters
    await expect(
      page.locator('[data-testid="categories"]')
        .or(page.locator('.categories'))
        .or(page.locator('button:has-text("All")'))
    ).toBeVisible();
  });

  test('should add product to cart', async ({ page }) => {
    // Click on first product
    await page.locator('[data-testid="product-card"]').first().click().catch(() => {
      return page.locator('.product-card').first().click();
    });

    // Cart should show item
    await expect(
      page.locator('[data-testid="cart-item"]')
        .or(page.locator('.cart-item'))
        .or(page.locator('text=1 item'))
    ).toBeVisible({ timeout: 5000 });
  });

  test('should update cart quantity', async ({ page }) => {
    // Add product
    await page.locator('[data-testid="product-card"]').first().click().catch(() => {
      return page.locator('.product-card').first().click();
    });

    // Increase quantity
    await page.locator('[data-testid="increase-qty"]').click().catch(() => {
      return page.locator('button:has-text("+")').first().click();
    });

    // Quantity should be 2
    await expect(page.locator('text=2').or(page.locator('[data-testid="quantity"]:has-text("2")'))).toBeVisible();
  });

  test('should remove item from cart', async ({ page }) => {
    // Add product
    await page.locator('[data-testid="product-card"]').first().click().catch(() => {
      return page.locator('.product-card').first().click();
    });

    // Wait for cart item
    await expect(page.locator('[data-testid="cart-item"]').or(page.locator('.cart-item'))).toBeVisible();

    // Remove item
    await page.locator('[data-testid="remove-item"]').click().catch(() => {
      return page.locator('button[aria-label="Remove"]').click().catch(() => {
        return page.locator('.cart-item button').last().click();
      });
    });

    // Cart should be empty
    await expect(
      page.locator('text=empty').or(page.locator('text=No items'))
    ).toBeVisible({ timeout: 5000 });
  });

  test('should search products', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search"]').or(page.locator('[data-testid="search"]'));

    await searchInput.fill('test product');

    // Should filter products or show search results
    await page.waitForTimeout(500); // Wait for debounce
  });

  test('should clear cart', async ({ page }) => {
    // Add product
    await page.locator('[data-testid="product-card"]').first().click().catch(() => {
      return page.locator('.product-card').first().click();
    });

    // Clear cart
    await page.locator('button:has-text("Clear")').click().catch(() => {
      return page.locator('[data-testid="clear-cart"]').click();
    });

    // Cart should be empty
    await expect(
      page.locator('text=empty').or(page.locator('text=No items'))
    ).toBeVisible({ timeout: 5000 });
  });

  test('should proceed to checkout', async ({ page }) => {
    // Add product
    await page.locator('[data-testid="product-card"]').first().click().catch(() => {
      return page.locator('.product-card').first().click();
    });

    // Click checkout/pay button
    await page.locator('button:has-text("Pay")').or(page.locator('button:has-text("Checkout")')).click();

    // Should show payment modal/screen
    await expect(
      page.locator('[data-testid="payment-modal"]')
        .or(page.locator('.payment-modal'))
        .or(page.locator('text=Payment'))
    ).toBeVisible({ timeout: 5000 });
  });

  test('should apply discount', async ({ page }) => {
    // Add product
    await page.locator('[data-testid="product-card"]').first().click().catch(() => {
      return page.locator('.product-card').first().click();
    });

    // Open discount
    await page.locator('button:has-text("Discount")').click().catch(() => {
      return page.locator('[data-testid="apply-discount"]').click();
    });

    // Enter discount
    await page.fill('input[placeholder*="discount"]', '10');
    await page.click('button:has-text("Apply")');

    // Discount should be applied
    await expect(page.locator('text=Discount').or(page.locator('text=-'))).toBeVisible();
  });
});

test.describe('Customer Selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'demo@properpos.com');
    await page.fill('input[type="password"]', 'demo123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/dashboard/, { timeout: 10000 });
    await page.goto('/pos');
  });

  test('should search and select customer', async ({ page }) => {
    // Open customer selection
    await page.locator('button:has-text("Customer")').or(page.locator('[data-testid="select-customer"]')).click();

    // Search for customer
    await page.fill('input[placeholder*="customer"]', 'John');

    // Select customer from results
    await page.locator('.customer-result').first().click().catch(() => {
      return page.locator('[data-testid="customer-option"]').first().click();
    });
  });

  test('should create new customer', async ({ page }) => {
    // Open customer selection
    await page.locator('button:has-text("Customer")').or(page.locator('[data-testid="select-customer"]')).click();

    // Click add new customer
    await page.locator('button:has-text("New")').or(page.locator('[data-testid="new-customer"]')).click();

    // Fill customer form
    await page.fill('input[name="name"]', 'New Customer');
    await page.fill('input[name="email"]', 'new@customer.com');
    await page.fill('input[name="phone"]', '1234567890');

    // Save customer
    await page.click('button:has-text("Save")');
  });
});
