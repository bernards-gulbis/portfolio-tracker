import { test, expect } from '@playwright/test';
import { createPortfolio, createTransaction } from './fixtures/api';

test.use({ storageState: 'e2e/.auth/user.json' });

test.beforeEach(async ({ request, page }) => {
  const portfolio = await createPortfolio(request, 'Filter Tests');

  // Seed 5 transactions: 2 Deposits, 2 Buys (AAPL on different dates), 1 Fee.
  await createTransaction(request, portfolio.id, {
    date: '2025-01-10T00:00:00', type: 'Deposit', total_amount: 500,
  });
  await createTransaction(request, portfolio.id, {
    date: '2025-01-15T00:00:00', type: 'Deposit', total_amount: 1000,
  });
  await createTransaction(request, portfolio.id, {
    date: '2025-01-20T00:00:00', type: 'Buy', ticker: 'AAPL',
    quantity: 5, price_per_share: 150, total_amount: -750,
  });
  await createTransaction(request, portfolio.id, {
    date: '2025-02-01T00:00:00', type: 'Buy', ticker: 'AAPL',
    quantity: 3, price_per_share: 160, total_amount: -480,
  });
  await createTransaction(request, portfolio.id, {
    date: '2025-01-25T00:00:00', type: 'Fee', total_amount: -10,
  });

  await page.goto(`/portfolios/${portfolio.id}/transactions`);
  await expect(page.locator('[data-testid="transaction-row"]')).toHaveCount(5);
});

test('filter by type — Deposit only → 2 rows shown', async ({ page }) => {
  await page.getByRole('button', { name: 'All types' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Deposit' }).click();
  // Close the dropdown.
  await page.keyboard.press('Escape');

  await expect(page.locator('[data-testid="transaction-row"]')).toHaveCount(2);
  await expect(page.locator('[data-testid="transaction-row"]').first()).toContainText('Deposit');
});

test('filter by ticker — AAPL → 2 Buy rows shown', async ({ page }) => {
  await page.locator('[name="ticker-search"]').fill('AAPL');

  await expect(page.locator('[data-testid="transaction-row"]')).toHaveCount(2);
  await expect(page.locator('[data-testid="transaction-row"]').first()).toContainText('Buy');
});

test('filter by date range → rows within range shown', async ({ page }) => {
  // Range 2025-01-20 to 2025-01-25 captures the first Buy and the Fee (2 rows).
  await page.locator('#tx-date-from').fill('2025-01-20');
  await page.locator('#tx-date-to').fill('2025-01-25');

  await expect(page.locator('[data-testid="transaction-row"]')).toHaveCount(2);
});

test('clear ticker filter → all 5 rows restored', async ({ page }) => {
  await page.locator('[name="ticker-search"]').fill('AAPL');
  await expect(page.locator('[data-testid="transaction-row"]')).toHaveCount(2);

  await page.locator('[name="ticker-search"]').fill('');
  await expect(page.locator('[data-testid="transaction-row"]')).toHaveCount(5);
});
