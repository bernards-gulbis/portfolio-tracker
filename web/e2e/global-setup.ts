import { chromium, type FullConfig } from '@playwright/test';

/**
 * Vite's dev server defers dependency pre-bundling until the first browser
 * request. The very first page load therefore triggers a hard reload once the
 * optimizer finishes — which can race in-flight test interactions and drop
 * client-side state (e.g. login form mode flips). Visiting the app once here,
 * with ``networkidle`` so the optimizer's follow-up reload completes, ensures
 * the actual tests start against an already-warm server.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL ?? 'http://localhost:3000';
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(baseURL, { waitUntil: 'networkidle', timeout: 60_000 });
    // A second visit guarantees any optimizer-triggered reload has settled.
    await page.goto(baseURL, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.close();
  } finally {
    await browser.close();
  }
}
