import { test, expect } from '@playwright/test';

const API = 'http://127.0.0.1:8000';

// Logout requires an authenticated session — use the shared storageState.
test.describe('auth — logout', () => {
  test.use({ storageState: 'e2e/.auth/user.json' });

  test('logout → sign-in button appears', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'User menu' }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  });
});

// Registration and login tests manage their own users; no storageState needed.
test.describe('auth — registration and login', () => {
  test('register with valid credentials → redirected into app', async ({ page }) => {
    const email = `reg+${Date.now()}@example.com`;

    await page.goto('/');
    await page.getByRole('button', { name: 'Sign up' }).click();
    await page.locator('#register-name').fill('New User');
    await page.locator('#register-email').fill(email);
    await page.locator('#register-password').fill('Password123!');
    await page.getByRole('button', { name: 'Create Account' }).click();

    // After registration the form remounts in login mode with email pre-filled.
    await expect(page.locator('#login-email')).toHaveValue(email, { timeout: 15_000 });
    await page.locator('#login-password').fill('Password123!');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page.getByRole('button', { name: 'User menu' })).toBeVisible({ timeout: 10_000 });
  });

  test('login with valid credentials → redirected into app', async ({ page, request }) => {
    const email = `login+${Date.now()}@example.com`;
    await request.post(`${API}/auth/register`, {
      data: { email, password: 'Password123!', name: 'Login Test' },
    });

    await page.goto('/');
    await page.locator('#login-email').fill(email);
    await page.locator('#login-password').fill('Password123!');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page.getByRole('button', { name: 'User menu' })).toBeVisible({ timeout: 10_000 });
  });

  test('register with duplicate email → error shown', async ({ page, request }) => {
    const email = `dup+${Date.now()}@example.com`;
    await request.post(`${API}/auth/register`, {
      data: { email, password: 'Password123!', name: 'First' },
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Sign up' }).click();
    await page.locator('#register-name').fill('Second');
    await page.locator('#register-email').fill(email);
    await page.locator('#register-password').fill('Password123!');
    await page.getByRole('button', { name: 'Create Account' }).click();

    await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 10_000 });
  });
});
