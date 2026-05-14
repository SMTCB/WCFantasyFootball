/* global process */
import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: isCI ? 2 : 1,           // More retries on CI to absorb flakiness
  timeout: isCI ? 30000 : 20000,   // Longer timeout on CI (slower VMs)
  reporter: isCI
    ? [['github'], ['html', { open: 'never', outputFolder: 'e2e-report' }]]
    : [['list'],   ['html', { open: 'never', outputFolder: 'e2e-report' }]],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5174',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: isCI ? 'retain-on-failure' : 'off',
  },

  projects: [
    {
      name: 'desktop-chrome',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 375, height: 812 },
      },
    },
  ],

  // Start local dev server automatically (skipped when PLAYWRIGHT_BASE_URL is set).
  // Uses port 5174 (separate from the dev server on 5173) with auth disabled so
  // E2E tests run against demo mode — no Supabase auth session required.
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: 'npm run dev -- --port 5174',
    url: 'http://localhost:5174',
    reuseExistingServer: !isCI,   // Always start fresh on CI
    timeout: isCI ? 60000 : 30000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      ...process.env,
      VITE_AUTH_ENABLED: 'false',   // Demo mode: bypass auth for all E2E tests
    },
  },
});
