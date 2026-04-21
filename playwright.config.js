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
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',
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

  // Start local dev server automatically (skipped when PLAYWRIGHT_BASE_URL is set)
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !isCI,   // Always start fresh on CI
    timeout: isCI ? 60000 : 30000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
