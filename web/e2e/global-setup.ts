import { chromium, type FullConfig } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.join(__dirname, '.auth', 'user.json');
const API_BASE = 'http://127.0.0.1:8000';

export const E2E_EMAIL = 'testuser@e2e-tests.com';
export const E2E_PASSWORD = 'Password123!';
export const E2E_NAME = 'E2E User';

/**
 * Vite's dev server defers dependency pre-bundling until the first browser
 * request. The very first page load therefore triggers a hard reload once the
 * optimizer finishes — which can race in-flight test interactions and drop
 * client-side state (e.g. login form mode flips). Visiting the app once here,
 * with ``networkidle`` so the optimizer's follow-up reload completes, ensures
 * the actual tests start against an already-warm server.
 *
 * Warmup and auth login share the same browser context so that Vite only
 * pre-bundles dependencies once. Opening a second context re-triggers the
 * optimizer and can exceed the login timeout.
 *
 * Also registers a shared test user and saves the session cookie to
 * .auth/user.json so authenticated tests can skip the UI login flow entirely.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL ?? 'http://localhost:3000';
  const browser = await chromium.launch();
  try {
    // Use a single context for warmup + login so Vite optimises only once.
    const authContext = await browser.newContext();
    try {
      const page = await authContext.newPage();

      // Two networkidle visits to settle the Vite dependency optimizer.
      await page.goto(baseURL, { waitUntil: 'networkidle', timeout: 60_000 });
      await page.goto(baseURL, { waitUntil: 'networkidle', timeout: 60_000 });

      // Register shared test user (ignored if already exists — DB is wiped before each run).
      await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: E2E_EMAIL, password: E2E_PASSWORD, name: E2E_NAME }),
      });

      // The second goto lands on the login form — log in via UI so the browser
      // sets the auth cookie natively (correct domain, SameSite handling, etc.).
      await page.locator('#login-email').fill(E2E_EMAIL);
      await page.locator('#login-password').fill(E2E_PASSWORD);
      await page.getByRole('button', { name: 'Sign In' }).click();
      await page.getByRole('button', { name: 'User menu' }).waitFor({ timeout: 30_000 });

      fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
      await authContext.storageState({ path: AUTH_FILE });
    } finally {
      await authContext.close();
    }
  } finally {
    await browser.close();
  }
}
