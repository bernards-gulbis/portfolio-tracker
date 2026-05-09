import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPortfolio } from './fixtures/api';

test.use({ storageState: 'e2e/.auth/user.json' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_FIXTURE = path.join(__dirname, 'fixtures', 'transactions.csv');

test('CSV import — 2-step preview then confirm → transactions appear in table', async ({ request, page }) => {
  const portfolio = await createPortfolio(request, 'Import Test');
  await page.goto(`/portfolios/${portfolio.id}/transactions`);

  await page.getByRole('button', { name: 'Transaction table actions menu' }).click();
  await page.getByRole('menuitem', { name: 'Import CSV' }).click();

  await page.locator('#csv-file').setInputFiles(CSV_FIXTURE);
  await page.getByRole('button', { name: 'Preview' }).click();
  await page.getByRole('button', { name: 'Confirm import' }).click();

  // Dialog stays open until the import API call resolves.
  await page.getByRole('dialog', { name: 'Upload Transactions CSV' }).waitFor({ state: 'hidden' });

  await expect(page.locator('[data-testid="transaction-row"]')).toHaveCount(2);
});
