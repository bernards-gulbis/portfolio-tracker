import { test, expect } from '@playwright/test';
import { API } from './fixtures/api';

// Profile and tax tests use the shared test user.
test.use({ storageState: 'e2e/.auth/user.json' });

test('update display name → persists on page refresh', async ({ page }) => {
  await page.goto('/settings');
  // Profile section is active by default.
  await page.locator('#settings-name').fill('Updated Name');
  await page.getByRole('button', { name: 'Save changes' }).click();
  // Wait for the save to complete before reloading.
  await expect(page.getByText('Profile updated')).toBeVisible({ timeout: 5_000 });

  await page.reload();
  await expect(page.locator('#settings-name')).toHaveValue('Updated Name', { timeout: 5_000 });
});

test('update tax rate → persists on page refresh', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Tax' }).click();
  await page.locator('#settings-tax-rate').fill('30');
  await page.getByRole('button', { name: 'Save tax rate' }).click();
  // Wait for the save to complete before reloading.
  await expect(page.getByText('Tax rate updated')).toBeVisible({ timeout: 5_000 });

  await page.reload();
  await page.getByRole('button', { name: 'Tax' }).click();
  await expect(page.locator('#settings-tax-rate')).toHaveValue('30', { timeout: 5_000 });
});

// Password change creates its own user to avoid mutating the shared test user.
test.describe('password change', () => {
  test.use({ storageState: undefined });

  test('change password → can log in with new password', async ({ page, request }) => {
    const email = `pwchange+${Date.now()}@example.com`;
    const oldPw = 'Password123!';
    const newPw = 'NewPassword456!';

    await request.post(`${API}/auth/register`, {
      data: { email, password: oldPw, name: 'PW Test' },
    });

    // Log in via UI.
    await page.goto('/');
    await page.locator('#login-email').fill(email);
    await page.locator('#login-password').fill(oldPw);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByRole('button', { name: 'User menu' })).toBeVisible({ timeout: 10_000 });

    // Change password in Settings.
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Password' }).click();
    await page.locator('#settings-new-password').fill(newPw);
    await page.locator('#settings-confirm-password').fill(newPw);
    await page.getByRole('button', { name: 'Change password' }).click();

    // Sign out.
    await page.getByRole('button', { name: 'User menu' }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();

    // Log in with the new password.
    await page.locator('#login-email').fill(email);
    await page.locator('#login-password').fill(newPw);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByRole('button', { name: 'User menu' })).toBeVisible({ timeout: 10_000 });
  });
});
