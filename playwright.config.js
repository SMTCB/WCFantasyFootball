/* global process */
import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  // All specs except platform.spec.js use createClient against live production
  // Supabase (draft allocation, scoring, bets, autofill). These are integration /
  // data-validation tests that depend on production DB state — not suitable for
  // automated CI where that state is not guaranteed and failing tests retry 2×,
  // consuming the entire time budget.
  //
  // Run them manually against a known-good DB state:
  //   npx playwright test e2e/scoring-pipeline.spec.js
  //   npx playwright test e2e/draft-allocation-e2e.spec.js   (etc.)
  //
  // platform.spec.js is the only true UI/E2E spec — it runs against the demo
  // app with VITE_AUTH_ENABLED=false and makes no direct DB calls.
  testIgnore: isCI
    ? [
        '**/scoring-pipeline.spec.js',
        '**/draft-allocation-e2e.spec.js',
        '**/draft-and-scoring.spec.js',
        '**/draft-mode-complete.spec.js',
        '**/features.spec.js',
        '**/multi-league-and-bets.spec.js',
        '**/scoring.spec.js',
        '**/autofill-draft-classic.spec.js',
      ]
    : [],
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
        channel: 'chrome',
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
        channel: 'chrome',
        viewport: { width: 375, height: 812 },
      },
    },
  ],

  // Start local dev server automatically (skipped when PLAYWRIGHT_BASE_URL is set).
  // Uses port 5174 (separate from the dev server on 5173) with auth disabled so
  // E2E tests run against demo mode — no Supabase auth session required.
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    // In CI, dist/ is pre-built by the build job and downloaded as an artifact.
    // SKIP_BUILD=true is set by ci.yml so we just preview the existing dist.
    // Locally (or in non-CI envs) we always build first to ensure dist/ is fresh.
    command: process.env.SKIP_BUILD
      ? 'npm run preview -- --port 5174'
      : 'npm run build && npm run preview -- --port 5174',
    url: 'http://localhost:5174',
    reuseExistingServer: !isCI,   // Always start fresh on CI
    timeout: isCI ? 120000 : 60000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      ...process.env,
      VITE_AUTH_ENABLED: 'false',   // Demo mode: bypass auth for all E2E tests
    },
  },
});
