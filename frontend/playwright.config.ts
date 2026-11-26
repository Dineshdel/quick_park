import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests of the main flows. Run against a running app (frontend + backend + Postgres + Redis):
 *   pnpm --filter @qp/frontend test:browser
 * Point at another environment with BASE_URL=https://staging.example.com.
 */
export default defineConfig({
  testDir: './browser-tests',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3001',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
});
