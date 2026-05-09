import { test, expect } from '@playwright/test';
import { createPortfolio } from './fixtures/api';

test.use({ storageState: 'e2e/.auth/user.json' });

test.beforeEach(async ({ request, page }) => {
  const portfolio = await createPortfolio(request, 'Transaction Tests');
  await page.goto(`/portfolios/${portfolio.id}/transactions`);
});

test('transaction CRUD — add Deposit, edit, delete', async ({ page }) => {
  // ── ADD ──────────────────────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Add Transaction' }).click();
  await page.getByRole('dialog', { name: 'Add Transaction' }).waitFor();

  await page.locator('#tx-date').fill('2025-01-15');
  await page.locator('#tx-type').click();
  await page.getByRole('option', { name: 'Deposit' }).click();
  await page.locator('#tx-total').fill('1000');

  await page.getByRole('button', { name: 'Save Transaction' }).click();
  await page.getByRole('dialog', { name: 'Add Transaction' }).waitFor({ state: 'hidden' });

  await expect(page.locator('[data-testid="transaction-row"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="transaction-row"]')).toContainText('Deposit');

  // ── EDIT ─────────────────────────────────────────────────────────────────
  await page.locator('[data-testid="transaction-row"]')
    .getByRole('button', { name: /^Actions/i })
    .click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  await page.getByRole('dialog', { name: 'Edit Transaction' }).waitFor();

  await page.locator('#tx-total').fill('1500');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await page.getByRole('dialog', { name: 'Edit Transaction' }).waitFor({ state: 'hidden' });

  await expect(page.locator('[data-testid="transaction-row"]')).toHaveCount(1);

  // ── DELETE ────────────────────────────────────────────────────────────────
  await page.locator('[data-testid="transaction-row"]')
    .getByRole('button', { name: /^Actions/i })
    .click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();

  await page.getByRole('alertdialog').waitFor();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();

  await expect(page.locator('[data-testid="transaction-row"]')).toHaveCount(0);
});

test('Buy transaction — form shows ticker, quantity, price-per-share fields', async ({ page }) => {
  await page.getByRole('button', { name: 'Add Transaction' }).click();
  await page.getByRole('dialog', { name: 'Add Transaction' }).waitFor();

  // shadcn Select: click trigger, then pick from the portal.
  await page.locator('#tx-type').click();
  await page.getByRole('option', { name: 'Buy' }).click();

  // Buy-specific fields must be visible.
  await expect(page.locator('#tx-ticker')).toBeVisible();
  await expect(page.locator('#tx-quantity')).toBeVisible();
  await expect(page.locator('#tx-price')).toBeVisible();

  // Fill and save a complete Buy so we confirm the form submits cleanly.
  await page.locator('#tx-date').fill('2025-01-16');
  await page.locator('#tx-ticker').fill('AAPL');
  await page.locator('#tx-quantity').fill('5');
  await page.locator('#tx-price').fill('150');
  await page.locator('#tx-total').fill('750');

  await page.getByRole('button', { name: 'Save Transaction' }).click();
  await page.getByRole('dialog', { name: 'Add Transaction' }).waitFor({ state: 'hidden' });

  await expect(page.locator('[data-testid="transaction-row"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="transaction-row"]')).toContainText('Buy');
});

test('Dividend transaction — appears in table', async ({ page }) => {
  await page.getByRole('button', { name: 'Add Transaction' }).click();
  await page.getByRole('dialog', { name: 'Add Transaction' }).waitFor();

  await page.locator('#tx-date').fill('2025-02-01');
  await page.locator('#tx-type').click();
  await page.getByRole('option', { name: 'Dividend' }).click();

  // Dividend uses TickerCombobox: click the trigger, type the ticker, press Enter.
  await page.locator('#tx-ticker').click();
  await page.keyboard.type('AAPL');
  await page.keyboard.press('Enter');

  await page.locator('#tx-total').fill('25');

  await page.getByRole('button', { name: 'Save Transaction' }).click();
  await page.getByRole('dialog', { name: 'Add Transaction' }).waitFor({ state: 'hidden' });

  await expect(page.locator('[data-testid="transaction-row"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="transaction-row"]')).toContainText('Dividend');
});
