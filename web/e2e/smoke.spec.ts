import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_FIXTURE = path.join(__dirname, 'fixtures', 'transactions.csv');

test('login → create portfolio → import CSV → toggle EUR/USD → see chart', async ({ page }) => {
  const email = `smoke+${Date.now()}@example.com`;
  const password = 'Password123!';

  await page.goto('/');

  // Register
  await page.getByRole('button', { name: 'Sign up' }).click();
  await page.locator('#register-name').fill('E2E User');
  await page.locator('#register-email').fill(email);
  await page.locator('#register-password').fill(password);
  await page.getByRole('button', { name: 'Create Account' }).click();

  // Sign in (LoginPage pre-fills the email after a successful registration)
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();

  // Create a portfolio from the header dropdown
  await page.getByRole('button', { name: /Portfolios/i }).first().click();
  await page.getByRole('menuitem', { name: 'New Portfolio' }).click();
  await page.locator('#create-portfolio-name').fill('E2E Smoke');
  await page.getByRole('button', { name: 'Create Portfolio' }).click();

  // Empty portfolios auto-redirect to the Transactions tab. Import the CSV.
  await page.getByRole('button', { name: 'Transaction table actions menu' }).click();
  await page.getByRole('menuitem', { name: 'Import CSV' }).click();
  await page.locator('#csv-file').setInputFiles(CSV_FIXTURE);
  await page.getByRole('button', { name: 'Import' }).click();
  // The dialog stays open until the import API call resolves. Wait for it
  // to close so the Summary tab click isn't racing the modal overlay.
  await page.getByRole('dialog', { name: 'Upload Transactions CSV' }).waitFor({ state: 'hidden' });

  // Switch to Summary and verify the allocation chart + AAPL legend render
  await page.getByRole('tab', { name: /Summary/i }).click();
  await expect(page.getByLabel('Allocation')).toBeVisible();
  await expect(page.locator('main')).toContainText('AAPL');

  // Default currency is EUR. Toggle to USD via the avatar menu and assert the symbol changes.
  await expect(page.locator('main')).toContainText('€');
  await page.getByRole('button', { name: /user menu/i }).click();
  await page.getByRole('menuitem', { name: 'Currency' }).hover();
  await page.getByRole('menuitem', { name: 'USD' }).click();
  await expect(page.locator('main')).toContainText('$');
});
