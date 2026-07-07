import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)));
const e2eReportsDir = join(repoRoot, 'tests/e2e/fixtures/reports');
const e2ePort = process.env.E2E_PORT || '3100';
const e2eBaseUrl = process.env.E2E_BASE_URL || `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: e2eBaseUrl,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: process.env.E2E_SKIP_SERVER
    ? undefined
    : {
      command: 'node tests/e2e/fixtures/seed-today-report.mjs && npm run client:build && npm start',
      url: e2eBaseUrl,
      reuseExistingServer: process.env.E2E_REUSE_SERVER === 'true',
      timeout: 180_000,
      env: {
        AUTH_REQUIRED: 'false',
        NODE_ENV: 'test',
        NEWSAPI_API_KEY: 'e2e-smoke-key',
        TZ_ARTICLES: 'Asia/Jerusalem',
        REPORTS_DIR: e2eReportsDir,
        PORT: e2ePort,
      },
    },
});
