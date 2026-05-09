import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPortfolio, importCSV } from './fixtures/api';

test.use({ storageState: 'e2e/.auth/user.json' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_FIXTURE = path.join(__dirname, 'fixtures', 'transactions.csv');

test('portfolio dashboard — allocation chart and holdings visible after import', async ({ request, page }) => {
  const portfolio = await createPortfolio(request, 'Status Test');
  await importCSV(request, portfolio.id, CSV_FIXTURE);

  await page.goto(`/portfolios/${portfolio.id}`);

  await expect(page.getByLabel('Allocation')).toBeVisible();
  await expect(page.locator('main')).toContainText('AAPL');
});

test('EUR/USD currency toggle — changes symbol and persists on page refresh', async ({ request, page }) => {
  const portfolio = await createPortfolio(request, 'Currency Test');
  await importCSV(request, portfolio.id, CSV_FIXTURE);

  await page.goto(`/portfolios/${portfolio.id}`);

  // Default currency is EUR.
  await expect(page.locator('main')).toContainText('€');

  // Toggle to USD via the user avatar menu.
  await page.getByRole('button', { name: 'User menu' }).click();
  await page.getByRole('menuitem', { name: 'Currency' }).hover();
  await page.getByRole('menuitem', { name: 'USD' }).click();

  await expect(page.locator('main')).toContainText('$');

  // Preference persists across page refresh (stored in localStorage).
  await page.reload();
  await expect(page.locator('main')).toContainText('$');
});
