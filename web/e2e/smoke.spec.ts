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

  // After successful registration the form remounts in login mode with the
  // email pre-filled. Wait for the login-mode field (rather than racing on
  // ``#login-password`` which only exists once the mode flip has flushed).
  await expect(page.locator('#login-email')).toHaveValue(email, { timeout: 15_000 });
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();

  // Create a portfolio from the header dropdown
  await page.getByRole('button', { name: /Portfolios/i }).first().click();
  await page.getByRole('menuitem', { name: 'New Portfolio' }).click();
  await page.locator('#create-portfolio-name').fill('E2E Smoke');
  await page.getByRole('button', { name: 'Create Portfolio' }).click();

  // Empty portfolios auto-redirect to the Transactions tab; the URL must
  // reflect that rather than just an in-memory tab state.
  await expect(page).toHaveURL(/\/portfolios\/\d+\/transactions$/);

  // Import the CSV.
  await page.getByRole('button', { name: 'Transaction table actions menu' }).click();
  await page.getByRole('menuitem', { name: 'Import CSV' }).click();
  await page.locator('#csv-file').setInputFiles(CSV_FIXTURE);
  await page.getByRole('button', { name: 'Preview' }).click();
  await page.getByRole('button', { name: 'Confirm import' }).click();
  // The dialog stays open until the import API call resolves. Wait for it
  // to close so the Summary tab click isn't racing the modal overlay.
  await page.getByRole('dialog', { name: 'Upload Transactions CSV' }).waitFor({ state: 'hidden' });

  // Switch to Summary and verify the URL changes + chart + AAPL legend render
  await page.getByRole('tab', { name: /Summary/i }).click();
  await expect(page).toHaveURL(/\/portfolios\/\d+$/);
  await expect(page.getByLabel('Allocation')).toBeVisible();
  await expect(page.locator('main')).toContainText('AAPL');

  // URL persistence: refresh the page and confirm we stay on Summary.
  await page.reload();
  await expect(page).toHaveURL(/\/portfolios\/\d+$/);
  await expect(page.getByLabel('Allocation')).toBeVisible();

  // Confirm the Transactions URL is reachable directly (deep-link routing
  // works) and that it lists the imported AAPL row.
  const summaryUrl = page.url();
  await page.goto(`${summaryUrl}/transactions`);
  await expect(page).toHaveURL(/\/portfolios\/\d+\/transactions$/);
  await expect(page.locator('main')).toContainText('AAPL');

  // Back to Summary for the rest of the assertions.
  await page.goto(summaryUrl);
  await expect(page).toHaveURL(/\/portfolios\/\d+$/);

  // Default currency is EUR. Toggle to USD via the avatar menu and assert the symbol changes.
  await expect(page.locator('main')).toContainText('€');
  await page.getByRole('button', { name: /user menu/i }).click();
  await page.getByRole('menuitem', { name: 'Currency' }).hover();
  await page.getByRole('menuitem', { name: 'USD' }).click();
  await expect(page.locator('main')).toContainText('$');
});
