import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(__dirname, '..', 'api');

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  reporter: [['list'], ['html', { open: 'never' }]],
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3000',
    locale: 'en-US',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'python -m uvicorn main:app --host 127.0.0.1 --port 8000',
      cwd: apiDir,
      env: {
        DATABASE_URL: 'sqlite:///./e2e_test.db',
        CORS_ORIGINS: 'http://localhost:3000',
        DISABLE_RATE_LIMIT: 'true',
      },
      url: 'http://127.0.0.1:8000/health',
      // Always spawn a fresh API: reusing a dev backend would silently use
      // the developer's DATABASE_URL, polluting their dev DB with test data.
      // Port collisions surface as a clear "address already in use" error.
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 60_000,
    },
    {
      command: 'npm run dev',
      cwd: __dirname,
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 60_000,
    },
  ],
});
