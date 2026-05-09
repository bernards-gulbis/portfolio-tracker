import { test, expect } from '@playwright/test';
import { createPortfolio } from './fixtures/api';

test.use({ storageState: 'e2e/.auth/user.json' });

test('rename portfolio → updated name reflected in actions button', async ({ request, page }) => {
  const portfolio = await createPortfolio(request, 'Original Name');
  await page.goto(`/portfolios/${portfolio.id}`);

  // Open portfolio actions menu (aria-label includes the portfolio name).
  await page.getByRole('button', { name: 'Actions for Original Name' }).click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  await page.getByRole('dialog', { name: 'Rename Portfolio' }).waitFor();

  await page.locator('#edit-portfolio-name').fill('Renamed Portfolio');
  await page.getByRole('button', { name: 'Update Portfolio' }).click();
  await page.getByRole('dialog', { name: 'Rename Portfolio' }).waitFor({ state: 'hidden' });

  await expect(page.getByRole('button', { name: 'Actions for Renamed Portfolio' })).toBeVisible();
});

test('copy portfolio → new portfolio created and navigated to', async ({ request, page }) => {
  const portfolio = await createPortfolio(request, 'Source Portfolio');
  await page.goto(`/portfolios/${portfolio.id}`);

  await page.getByRole('button', { name: 'Actions for Source Portfolio' }).click();
  await page.getByRole('menuitem', { name: 'Copy' }).click();
  await page.getByRole('dialog', { name: 'Copy Portfolio' }).waitFor();

  await page.locator('#copy-portfolio-name').fill('Copied Portfolio');
  await page.getByRole('button', { name: 'Copy Portfolio' }).click();
  await page.getByRole('dialog', { name: 'Copy Portfolio' }).waitFor({ state: 'hidden' });

  // After copy the app navigates to the new portfolio's page.
  await expect(page).toHaveURL(/\/portfolios\/\d+/, { timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Actions for Copied Portfolio' })).toBeVisible();
});

test('delete portfolio → removed and redirected away', async ({ request, page }) => {
  const portfolio = await createPortfolio(request, 'To Delete');
  await page.goto(`/portfolios/${portfolio.id}`);

  await page.getByRole('button', { name: 'Actions for To Delete' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('alertdialog').waitFor();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();

  // App navigates away from the deleted portfolio.
  await expect(page).not.toHaveURL(new RegExp(`/portfolios/${portfolio.id}`), { timeout: 10_000 });
});
