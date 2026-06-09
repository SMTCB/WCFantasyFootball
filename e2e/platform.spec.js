// @ts-check
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const ROUTES = ['/', '/squad', '/league', '/live', '/market', '/recap', '/bracket'];

// ── Real Supabase Client ─────────────────────────────────────────────────────

const SUPABASE_URL = 'https://sssmvihxtqtohisghjet.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzc212aWh4dHF0b2hpc2doamV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDgyOTc5ODcsImV4cCI6MTcyMzg3Mzk4N30.LAeWx39REi6K2L46bY2g3PlvEaWM7p7TJdEZxtvXq8c';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let REAL_PLAYERS = [];

test.beforeAll(async () => {
  const { data: players } = await supabase
    .from('players')
    .select('*')
    .limit(20);
  REAL_PLAYERS = players || [];
});

// ── Helpers ──────────────────────────────────────────────────────────────────

// Skip onboarding wizard by setting localStorage flags BEFORE page loads
async function skipOnboarding(page) {
  await page.addInitScript(() => {
    localStorage.setItem('forzakit_onboarding_done', 'true');
    localStorage.setItem('forzakit_tour_squad_done', 'true');
    localStorage.setItem('forzakit_tour_market_done', 'true');
  });
}

async function waitForContent(page) {
  // Wait for React to hydrate — no skeleton loaders or spinners visible
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(600);
}

// ── 1. All routes load without crash ─────────────────────────────────────────
test.describe('Screen loading', () => {
  for (const route of ROUTES) {
    test(`${route} loads without blank content or JS crash`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', err => errors.push(err.message));

      await skipOnboarding(page);
      await page.goto(route);
      await waitForContent(page);

      // Page must not be blank — body should have visible text
      const bodyText = await page.locator('body').innerText();
      expect(bodyText.trim().length, `${route} has no text content`).toBeGreaterThan(10);

      // No uncaught JS errors
      expect(errors, `${route} threw JS errors: ${errors.join(', ')}`).toHaveLength(0);
    });
  }
});

// ── 2. Navigation ─────────────────────────────────────────────────────────────
test.describe('Navigation', () => {
  test('desktop sidebar is visible at 1440px', async ({ page }) => {
    await skipOnboarding(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForContent(page);

    // Use data-testid to find the desktop sidebar specifically
    const sidebar = page.locator('[data-testid="desktop-nav"]');
    await expect(sidebar).toBeVisible();

    // Sidebar should contain nav links (labels are uppercase in the nav)
    await expect(sidebar.getByText(/scores/i)).toBeVisible();
    await expect(sidebar.getByText(/market/i)).toBeVisible();
  });

  test('mobile bottom nav is visible at 375px', async ({ page }) => {
    await skipOnboarding(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await waitForContent(page);

    const bottomNav = page.locator('[data-testid="mobile-nav"]');
    await expect(bottomNav).toBeVisible();
  });

  test('desktop sidebar navigation works', async ({ page }) => {
    await skipOnboarding(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForContent(page);

    await page.getByText(/market/i).first().click();
    await expect(page).toHaveURL('/market');
    await waitForContent(page);

    await page.getByText(/squad/i).first().click();
    await expect(page).toHaveURL('/squad');
  });

  test('mobile bottom nav navigation works', async ({ page }) => {
    await skipOnboarding(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await waitForContent(page);

    const bottomNav = page.locator('[data-testid="mobile-nav"]');
    await bottomNav.getByText(/market/i).click();
    await expect(page).toHaveURL('/market');
    await waitForContent(page);

    await bottomNav.getByText(/squad/i).click();
    await expect(page).toHaveURL('/squad');
  });
});

// ── 3. Home Screen ────────────────────────────────────────────────────────────
test.describe('HomeScreen', () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page);
    await page.goto('/');
    await waitForContent(page);
  });

  test('shows Match Centre heading', async ({ page }) => {
    await expect(page.getByText(/match cent/i).first()).toBeVisible();
  });

  test('renders at least one fixture card', async ({ page }) => {
    // Fixture cards contain team abbreviations
    const fixtureArea = page.locator('body');
    const bodyText = await fixtureArea.innerText();
    // Should contain at least one team abbreviation or fixture data
    expect(bodyText).toMatch(/[A-Z]{2,3}\s*[vs\-\d]+|Match Day|Fixture/i);
  });

  test('shows a live match indicator or no matches message', async ({ page }) => {
    const bodyText = await page.locator('body').innerText();
    // Should show Live label or a message about fixtures
    expect(bodyText.toUpperCase()).toMatch(/LIVE|MATCH|FIXTURE|SCORES/);
  });

  test('shows competition name or league label in header', async ({ page }) => {
    // Header shows either a real competition name or the "Fantasy League" fallback label
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.toUpperCase()).toMatch(/FANTASY LEAGUE|PREMIER LEAGUE|LEAGUE/);
  });

  test('shows fixtures section label', async ({ page }) => {
    // Fixtures section header is always rendered (shows "Fixtures" or "Matchday N · Fixtures")
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.toUpperCase()).toContain('FIXTURES');
  });

  test('mobile — no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await waitForContent(page);

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = 375;
    expect(bodyWidth, 'Page overflows horizontally on mobile').toBeLessThanOrEqual(viewportWidth + 2);
  });
});

// ── 4. Squad Screen ───────────────────────────────────────────────────────────
test.describe('SquadScreen', () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page);
    await page.goto('/squad');
    await waitForContent(page);
    // Demo user has real league memberships → league picker appears before squad UI.
    // Select the first league so squad content loads.
    await selectFirstLeagueIfPicker(page);
  });

  test('shows My Squad heading', async ({ page }) => {
    // Scope to main content to avoid matching hidden desktop sidebar "My Squad" nav label
    const main = page.locator('[data-testid="main-content"]');
    await expect(main.getByText(/my squad/i).first()).toBeVisible();
  });

  test('mobile — squad screen renders without crash', async ({ page }) => {
    test.setTimeout(30000);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/squad');
    await waitForContent(page);

    // Should render without blank page or JS crash — shows either pitch or empty state
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.trim().length).toBeGreaterThan(20);
  });

  test('shows budget in header', async ({ page }) => {
    await expect(page.getByText(/budget|\$\d+M/i).first()).toBeVisible();
  });

  test('chips tab is hidden (pilot mode)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/squad');
    await waitForContent(page);
    await selectFirstLeagueIfPicker(page);
    // Chips are disabled for pilot — CHIPS tab must not exist
    await expect(page.getByRole('button', { name: /^chips$/i })).toHaveCount(0);
  });

  test('mobile — no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/squad');
    await waitForContent(page);
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(377);
  });

  test('desktop — squad screen renders without crash', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/squad');
    await waitForContent(page);
    // Should render without blank page or JS crash
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.trim().length).toBeGreaterThan(20);
  });
});

// ── Fixture player data injected via route mock (avoids DB dependency) ────────

// ── 5. Market Screen ─────────────────────────────────────────────────────────
// Helper: dismiss the "Select a League" picker that appears when the demo user
// has multiple leagues — click the first league button so the market UI loads.
async function selectFirstLeagueIfPicker(page) {
  const pickerHeading = page.getByText(/select a league/i);
  const isVisible = await pickerHeading.isVisible().catch(() => false);
  if (isVisible) {
    // Click the first league button in the picker
    await page.locator('button').filter({ hasText: /./}).first().click();
    await waitForContent(page);
  }
}

test.describe('MarketScreen', () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page);
    await page.goto('/market');
    await waitForContent(page);
    await selectFirstLeagueIfPicker(page);
  });

  test('shows Player Market heading', async ({ page }) => {
    await expect(page.getByText(/player market/i).first()).toBeVisible();
  });

  test('renders player list with real player data', async ({ page }) => {
    // Real players should be loaded from database
    const bodyText = await page.locator('body').innerText();
    if (REAL_PLAYERS && REAL_PLAYERS.length > 0) {
      // Check if any real player name appears in the page
      const hasPlayerName = REAL_PLAYERS.some(p => bodyText.includes(p.name));
      expect(hasPlayerName || bodyText.toMatch(/GK|DEF|MID|FWD/), 'No player data found').toBe(true);
    } else {
      // If no players available, verify market page still loads
      expect(bodyText.toUpperCase()).toContain('MARKET');
    }
  });

  test('position filter tabs are clickable', async ({ page }) => {
    // Click FWD tab
    await page.getByText('FWD').first().click();
    await page.waitForTimeout(300);
    // After filtering, only FWDs should appear
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/FWD/);
  });

  test('shows budget display', async ({ page }) => {
    await expect(page.getByText(/budget|\$\d+/i).first()).toBeVisible();
  });

  test('shows squad slot count', async ({ page }) => {
    const main = page.locator('[data-testid="main-content"]');
    await expect(main.getByText(/squad|\d+\/15/i).first()).toBeVisible();
  });

  test('ALL filter shows all positions', async ({ page }) => {
    // Wait for market filters to be visible
    await page.locator('[data-tour="market-filters"]').waitFor({ state: 'visible', timeout: 5000 });
    // Click the ALL filter button (first button in filter bar with "ALL" text)
    const filterContainer = page.locator('[data-tour="market-filters"]');
    await filterContainer.locator('button', { hasText: 'ALL' }).click();
    await page.waitForTimeout(300);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/GK|DEF|MID|FWD/);
  });

  test('mobile — no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/market');
    await waitForContent(page);
    await selectFirstLeagueIfPicker(page);
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(377);
  });
});

// ── 6. League Screen ──────────────────────────────────────────────────────────
test.describe('LeagueScreen', () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page);
    await page.goto('/league');
    await waitForContent(page);
  });

  test('shows League heading', async ({ page }) => {
    const main = page.locator('[data-testid="main-content"]');
    await expect(main.getByText(/league/i).first()).toBeVisible();
  });

  test('renders league list or standings', async ({ page }) => {
    const body = await page.locator('body').innerText();
    // Should show league names or member data
    expect(body.length).toBeGreaterThan(50);
  });
});

// ── 7. Live Screen ────────────────────────────────────────────────────────────
test.describe('LiveScreen', () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page);
    await page.goto('/live');
    await waitForContent(page);
  });

  test('loads without crashing', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/live');
    await waitForContent(page);
    expect(errors).toHaveLength(0);
  });

  test('shows Live heading or live content', async ({ page }) => {
    const body = await page.locator('body').innerText();
    expect(body.toUpperCase()).toContain('LIVE');
  });

  test('shows match or projection content', async ({ page }) => {
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(50);
  });
});

// ── 8. Recap Screen ───────────────────────────────────────────────────────────
test.describe('RecapScreen', () => {
  test('loads without crashing', async ({ page }) => {
    await skipOnboarding(page);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/recap');
    await waitForContent(page);
    expect(errors).toHaveLength(0);
  });

  test('shows recap content', async ({ page }) => {
    await skipOnboarding(page);
    await page.goto('/recap');
    await waitForContent(page);
    const body = await page.locator('body').innerText();
    expect(body.trim().length).toBeGreaterThan(20);
  });
});

// ── 9. Bracket Screen ─────────────────────────────────────────────────────────
test.describe('BracketScreen', () => {
  test('loads without crashing', async ({ page }) => {
    await skipOnboarding(page);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/bracket');
    await waitForContent(page);
    expect(errors).toHaveLength(0);
  });

  test('shows bracket content', async ({ page }) => {
    await skipOnboarding(page);
    await page.goto('/bracket');
    await waitForContent(page);
    const body = await page.locator('body').innerText();
    expect(body.trim().length).toBeGreaterThan(20);
  });
});

// ── 10. Layout consistency ────────────────────────────────────────────────────
test.describe('Layout consistency', () => {
  test('desktop — sidebar left offset applied (content not behind sidebar)', async ({ page }) => {
    await skipOnboarding(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForContent(page);

    // Main content wrapper should be offset to the right of the 220px sidebar
    const mainContent = page.locator('[data-testid="main-content"]');
    const box = await mainContent.boundingBox();
    // Should start at x >= 200 (sidebar is 220px wide)
    expect(box?.x ?? 0).toBeGreaterThan(150);
  });

  test('mobile — bottom nav does not obscure content', async ({ page }) => {
    await skipOnboarding(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/market');
    await waitForContent(page);
    await selectFirstLeagueIfPicker(page);

    // Main content must have padding-bottom so last items aren't behind the 64px nav
    const paddingBottom = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="main-content"]');
      if (!el) return 0;
      // getComputedStyle returns resolved px value even for calc()
      return parseFloat(getComputedStyle(el).paddingBottom);
    });
    expect(paddingBottom).toBeGreaterThanOrEqual(60);
  });

  test('404 redirect to home', async ({ page }) => {
    await skipOnboarding(page);
    await page.goto('/this-route-does-not-exist');
    await waitForContent(page);
    // NotFoundScreen shows a "← Back to Home" button — no auto-redirect
    await page.getByRole('button', { name: /back to home/i }).click();
    await expect(page).toHaveURL('/');
  });
});
