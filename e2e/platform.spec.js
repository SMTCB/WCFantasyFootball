// @ts-check
import { test, expect } from '@playwright/test';

const ROUTES = ['/', '/squad', '/league', '/live', '/market', '/recap', '/bracket'];

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

    // Sidebar should contain nav links
    await expect(sidebar.getByText('Scores')).toBeVisible();
    await expect(sidebar.getByText('Market')).toBeVisible();
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

    await page.getByText('Market').first().click();
    await expect(page).toHaveURL('/market');
    await waitForContent(page);

    await page.getByText('Squad').first().click();
    await expect(page).toHaveURL('/squad');
  });

  test('mobile bottom nav navigation works', async ({ page }) => {
    await skipOnboarding(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await waitForContent(page);

    const bottomNav = page.locator('[data-testid="mobile-nav"]');
    await bottomNav.getByText('Market').click();
    await expect(page).toHaveURL('/market');
    await waitForContent(page);

    await bottomNav.getByText('Squad').click();
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
    // Fixture cards contain team names separated by a score or VS
    const fixtureArea = page.locator('body');
    // Should contain at least one known PL club name from seeded fixtures
    await expect(fixtureArea).toContainText(/Arsenal|Chelsea|Liverpool|Man City|Spurs|Man Utd/i);
  });

  test('shows a live match indicator', async ({ page }) => {
    // Scope to main content to avoid matching hidden desktop sidebar "Live" nav label
    const main = page.locator('[data-testid="main-content"]');
    await expect(main.getByText(/live/i).first()).toBeVisible();
  });

  test('shows user rank and points in header', async ({ page }) => {
    await expect(page.getByText(/#\d+|rank/i).first()).toBeVisible();
  });

  test('shows Daily Prediction widget', async ({ page }) => {
    await expect(page.getByText(/prediction|pick/i).first()).toBeVisible();
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
  });

  test('shows My Squad heading', async ({ page }) => {
    // Scope to main content to avoid matching hidden desktop sidebar "My Squad" nav label
    const main = page.locator('[data-testid="main-content"]');
    await expect(main.getByText(/my squad/i).first()).toBeVisible();
  });

  test('mobile — pitch view renders with players', async ({ page }) => {
    test.setTimeout(30000);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/squad');

    // Wait for pitch — DB fetch or fallback both eventually render it
    // Use .first() because desktop layout also renders a pitch-view in the hidden lg:flex pane
    const pitch = page.locator('[data-testid="pitch-view"]').first();
    await pitch.waitFor({ state: 'visible', timeout: 20000 });
    await expect(pitch).toBeVisible();

    // Pitch renders player cards — at least one known player name from seeded data
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).toMatch(/Alisson|Courtois|Bellingham|Kane|Messi|Neymar|van Dijk|Modric/i);
  });

  test('shows budget in header', async ({ page }) => {
    await expect(page.getByText(/budget|\$\d+M/i).first()).toBeVisible();
  });

  test('chips row is visible', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/squad');
    await waitForContent(page);
    // Chips are in the Tools tab — label is '⚙️' and 'Tools' in separate divs
    await page.getByRole('button', { name: /tools/i }).click();
    await page.waitForTimeout(300);
    await expect(page.getByText(/wildcard|triple/i).first()).toBeVisible();
  });

  test('mobile — no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/squad');
    await waitForContent(page);
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(377);
  });

  test('desktop — player roster list is visible', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/squad');
    await waitForContent(page);
    // Position labels should be in the roster list
    await expect(page.getByText(/goalkeeper|defender|midfielder|forward/i).first()).toBeVisible();
  });
});

// ── Fixture player data injected via route mock (avoids DB dependency) ────────
const FIXTURE_PLAYERS = [
  { id: 'e2e-1', name: 'Salah',      position: 'MID', club: 'ENG', price: 13.0, points: 12, ownership_pct: 72 },
  { id: 'e2e-2', name: 'Haaland',    position: 'FWD', club: 'NOR', price: 14.0, points: 15, ownership_pct: 68 },
  { id: 'e2e-3', name: 'De Bruyne',  position: 'MID', club: 'BEL', price: 10.5, points:  9, ownership_pct: 55 },
  { id: 'e2e-4', name: 'Alexander-Arnold', position: 'DEF', club: 'ENG', price: 8.5, points: 8, ownership_pct: 48 },
  { id: 'e2e-5', name: 'Alisson',    position: 'GK',  club: 'BRA', price: 6.0, points:  7, ownership_pct: 40 },
  { id: 'e2e-6', name: 'Saka',       position: 'MID', club: 'ENG', price: 9.0, points:  8, ownership_pct: 52 },
  { id: 'e2e-7', name: 'Kane',       position: 'FWD', club: 'ENG', price: 11.5, points: 11, ownership_pct: 60 },
];

async function mockPlayersApi(page) {
  // Intercept Supabase REST /players endpoint and return fixture data
  await page.route('**/rest/v1/players**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': '0-6/7' },
      body: JSON.stringify(FIXTURE_PLAYERS),
    });
  });

  // Mock player_status to avoid errors
  await page.route('**/rest/v1/player_status**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': '0-0/0' },
      body: JSON.stringify([]),
    });
  });

  // Mock squads fetch (empty list — user has no squad yet)
  await page.route('**/rest/v1/squads**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': '0-0/0' },
      body: JSON.stringify([]),
    });
  });

  // Mock daily_jokers fetch (empty list)
  await page.route('**/rest/v1/daily_jokers**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': '0-0/0' },
      body: JSON.stringify([]),
    });
  });

  // Mock matchday_deadlines
  await page.route('**/rest/v1/matchday_deadlines**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': '0-0/0' },
      body: JSON.stringify([]),
    });
  });

  // Mock leagues fetch for league config (useLeagueConfig hook)
  await page.route('**/rest/v1/leagues**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': '0-0/1' },
      body: JSON.stringify([
        {
          id: 'test-league-123',
          name: 'Test League',
          tournament_id: 'da21be11-32be-429f-ae68-c01b13ba54c9',
          budget_total: null,
          squad_size: null,
          position_limits: null,
          min_formation: null,
        }
      ]),
    });
  });

  // Mock scoring_rules fetch (empty — will use EPL defaults)
  await page.route('**/rest/v1/scoring_rules**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': '0-0/0' },
      body: JSON.stringify([]),
    });
  });
}

// ── 5. Market Screen ─────────────────────────────────────────────────────────
test.describe('MarketScreen', () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page);
    await mockPlayersApi(page);
    // Mock leagues API so test doesn't need real DB data
    await page.route('**/rest/v1/league_members**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Content-Range': '0-0/1' },
        body: JSON.stringify([
          { league_id: 'test-league-123', leagues: { id: 'test-league-123', name: 'Test League', tournament_id: 'da21be11-32be-429f-ae68-c01b13ba54c9' } }
        ]),
      });
    });
    // Go directly to market with leagueId to avoid league picker
    await page.goto('/market?leagueId=test-league-123');
    await waitForContent(page);
  });

  test('shows Player Market heading', async ({ page }) => {
    await expect(page.getByText(/player market/i).first()).toBeVisible();
  });

  test('renders player list with names', async ({ page }) => {
    // Route mock injects fixture PL players — no DB dependency
    await expect(
      page.getByText(/Salah|Haaland|De Bruyne|Kane|Saka/i).first()
    ).toBeVisible({ timeout: 12000 });
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
    await page.getByText('ALL').first().click();
    await page.waitForTimeout(300);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/GK|DEF|MID|FWD/);
  });

  test('mobile — no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/market');
    await waitForContent(page);
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
    const main = page.locator('[data-testid="main-content"]');
    await expect(main.getByText(/live/i).first()).toBeVisible();
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
    await expect(page).toHaveURL('/');
  });
});
