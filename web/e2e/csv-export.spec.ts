import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPortfolio, importCSV } from './fixtures/api';

test.use({ storageState: 'e2e/.auth/user.json' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_FIXTURE = path.join(__dirname, 'fixtures', 'transactions.csv');

test('export CSV → file downloaded and contains transaction data', async ({ request, page }) => {
  const portfolio = await createPortfolio(request, 'Export Test');
  await importCSV(request, portfolio.id, CSV_FIXTURE);
  await page.goto(`/portfolios/${portfolio.id}/transactions`);

  // Open the table actions menu, then set up the download listener before clicking Export.
  await page.getByRole('button', { name: 'Transaction table actions menu' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Export CSV' }).click();
  const download = await downloadPromise;

  const filePath = await download.path();
  const content = fs.readFileSync(filePath!, 'utf-8');
  expect(content).toContain('AAPL');
  expect(content).toContain('Deposit');
});
