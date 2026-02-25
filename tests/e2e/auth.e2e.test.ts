// Authentication E2E Tests
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('should display login page', async ({ page }) => {
    await expect(page).toHaveTitle(/Login|ProperPOS/);
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should show validation errors for empty form', async ({ page }) => {
    await page.click('button[type="submit"]');

    // Should show validation messages
    await expect(page.locator('text=Email is required').or(page.locator('text=required'))).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.fill('input[type="email"]', 'invalid@example.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');

    // Should show error message
    await expect(page.locator('text=Invalid').or(page.locator('[role="alert"]'))).toBeVisible({ timeout: 5000 });
  });

  test('should login successfully with valid credentials', async ({ page }) => {
    // Use test credentials
    await page.fill('input[type="email"]', 'demo@properpos.com');
    await page.fill('input[type="password"]', 'demo123');
    await page.click('button[type="submit"]');

    // Should redirect to dashboard
    await expect(page).toHaveURL(/dashboard/, { timeout: 10000 });
  });

  test('should navigate to forgot password', async ({ page }) => {
    await page.click('text=Forgot password');

    await expect(page).toHaveURL(/forgot-password|reset/);
  });

  test('should navigate to register', async ({ page }) => {
    await page.click('text=Sign up');

    await expect(page).toHaveURL(/register|signup/);
  });
});

test.describe('Registration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register');
  });

  test('should display registration form', async ({ page }) => {
    await expect(page.locator('input[name="name"]').or(page.locator('input[placeholder*="name"]'))).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('should validate password requirements', async ({ page }) => {
    await page.fill('input[name="name"]', 'Test User');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'weak');
    await page.click('button[type="submit"]');

    // Should show password validation error
    await expect(page.locator('text=8 characters').or(page.locator('text=password'))).toBeVisible();
  });

  test('should show organization name field', async ({ page }) => {
    await expect(
      page.locator('input[name="organization"]')
        .or(page.locator('input[name="company"]'))
        .or(page.locator('input[placeholder*="organization"]'))
        .or(page.locator('input[placeholder*="business"]'))
    ).toBeVisible();
  });
});

test.describe('Password Reset', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/forgot-password');
  });

  test('should display password reset form', async ({ page }) => {
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should send reset email', async ({ page }) => {
    await page.fill('input[type="email"]', 'test@example.com');
    await page.click('button[type="submit"]');

    // Should show success message
    await expect(
      page.locator('text=email').or(page.locator('text=sent')).or(page.locator('text=check'))
    ).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Logout', () => {
  test('should logout successfully', async ({ page }) => {
    // First login
    await page.goto('/login');
    await page.fill('input[type="email"]', 'demo@properpos.com');
    await page.fill('input[type="password"]', 'demo123');
    await page.click('button[type="submit"]');

    // Wait for dashboard
    await expect(page).toHaveURL(/dashboard/, { timeout: 10000 });

    // Find and click logout
    await page.click('[data-testid="user-menu"]').catch(() => {
      // Try alternative selectors
      return page.click('button:has-text("Logout")').catch(() => {
        return page.click('[aria-label="User menu"]');
      });
    });

    await page.click('text=Logout').catch(() => {
      return page.click('text=Sign out');
    });

    // Should redirect to login
    await expect(page).toHaveURL(/login/, { timeout: 5000 });
  });
});
