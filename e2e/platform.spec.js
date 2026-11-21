// @ts-check
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { mockMyTeam, MOCK_LEAGUE_ID } from './fixtures/myTeamMock.js';

const ROUTES = ['/', '/squad', '/league', '/live', '/market', '/recap', '/bracket'];

// ── Real Supabase Client ─────────────────────────────────────────────────────
// Reuses the VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY that CI already exports
// for the Vite build (ci.yml's `e2e` job) — no separate SUPABASE_URL/
// SUPABASE_ANON_KEY secret to keep in sync. This spec only does a read-only
// SELECT (see beforeAll below); no hardcoded fallback (B-12 follow-up — a
// hardcoded prod fallback here meant every CI run silently read real prod
// data with no way to point it elsewhere).

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    '\n\n🛑 platform.spec.js requires SUPABASE_URL/SUPABASE_ANON_KEY or ' +
    'VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY to be set (used for a read-only ' +
    'players SELECT in beforeAll). Copy values from .env.local, e.g.:\n' +
    '  VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... npx playwright test e2e/platform.spec.js\n'
  );
}

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
    localStorage.setItem('forzakit_tour_league_done', 'true');
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

    // Use data-testid to find the desktop top bar specifically
    const sidebar = page.locator('[data-testid="desktop-nav"]');
    await expect(sidebar).toBeVisible();

    // The clubhouse switcher pill is hidden on /home, so assert the always-present spine links
    await expect(sidebar.getByText(/^home$/i).first()).toBeVisible();
    await expect(sidebar.locator('a[href="/settings"]')).toBeVisible();
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
    await page.goto('/live');
    await waitForContent(page);

    const topBar = page.locator('[data-testid="desktop-nav"]');
    await topBar.getByText(/^trophies$/i).click();
    await expect(page).toHaveURL('/trophy');
    await waitForContent(page);

    await topBar.getByText(/^bets$/i).click();
    await expect(page).toHaveURL('/bets');
  });

  test('mobile bottom nav navigation works', async ({ page }) => {
    await skipOnboarding(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await waitForContent(page);

    // Bottom nav is clubhouse-level (Home/Bets/You) — sport screens
    // (Live/Squad/Market/etc.) live in CompetitionScreenNav at the top instead.
    const bottomNav = page.locator('[data-testid="mobile-nav"]');
    await bottomNav.getByText(/^bets$/i).click();
    await expect(page).toHaveURL('/bets');
    await waitForContent(page);

    await bottomNav.getByText(/^home$/i).click();
    await expect(page).toHaveURL('/home');
  });
});

// ── 3. Clubhouse Screen (/ now redirects to /clubhouse) ───────────────────────
test.describe('ClubhouseScreen', () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page);
    await page.goto('/');
    await waitForContent(page);
  });

  test('shows Clubhouse heading', async ({ page }) => {
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.toUpperCase()).toMatch(/CLUBHOUSE/);
  });

  test('shows initial content', async ({ page }) => {
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.trim().length).toBeGreaterThan(20);
  });

  test('shows create or join prompt', async ({ page }) => {
    const bodyText = await page.locator('body').innerText();
    // ClubhouseLobby (no circles) shows CREATE/JOIN; active circle shows HOME tab
    expect(bodyText.toUpperCase()).toMatch(/CLUBHOUSE|CREATE|JOIN|HOME|SETTINGS/);
  });

  test('shows settings or community navigation', async ({ page }) => {
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.toUpperCase()).toMatch(/SETTINGS|CLUBHOUSE|TROPHY|COMMUNITY/);
  });

  test('shows key navigation text', async ({ page }) => {
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.toUpperCase()).toMatch(/CLUBHOUSE|SETTINGS|TROPHY/);
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

// ── 4. My team tab (the old Squad page, S30 / MD-11) ─────────────────────────
// /squad now redirects into the league's My team tab. The demo user has no
// league in the live database, so these tests answer Supabase from a fixed
// test league and squad (e2e/fixtures/myTeamMock.js).
async function openMyTeam(page, opts) {
  const calls = await mockMyTeam(page, opts);
  await page.goto(`/league/${MOCK_LEAGUE_ID}?tab=team`);
  await waitForContent(page);
  return calls;
}

test.describe('My team tab', () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page);
  });

  test('/squad redirects instead of 404ing', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.goto('/squad');
    await waitForContent(page);
    await expect(page).not.toHaveURL(/\/squad/);
    expect(errors, `redirect threw: ${errors.join(', ')}`).toHaveLength(0);
  });

  test('/squad?leagueId= lands on that league My team tab', async ({ page }) => {
    await mockMyTeam(page);
    await page.goto(`/squad?leagueId=${MOCK_LEAGUE_ID}`);
    await waitForContent(page);
    await expect(page).toHaveURL(new RegExp(`/league/${MOCK_LEAGUE_ID}\\?tab=team`));
  });

  test('league opens on My team with the pitch, budget and chips', async ({ page }) => {
    test.setTimeout(45000);
    await openMyTeam(page);
    await expect(page.getByText(/^my team$/i).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText('€3.5M').filter({ visible: true }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="mobile-pitch-field"]:visible, [data-testid="pitch-view"]:visible').first()).toBeVisible();
  });

  test('mobile — needs-attention line, chips row, no CHIPS tab, no horizontal overflow', async ({ page }) => {
    test.setTimeout(45000);
    await page.setViewportSize({ width: 375, height: 812 });
    await openMyTeam(page);
    await expect(page.getByTestId('needs-attention')).toContainText(/2 need attention/i, { timeout: 15000 });
    await expect(page.getByTestId('mobile-pitch-field')).toBeVisible();
    // The old 4-tab strip had a CHIPS tab; chips now sit in a row under the bench.
    await expect(page.getByRole('button', { name: /^chips$/i })).toHaveCount(0);
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(377);
  });

  test('mobile — make a player captain from the tab', async ({ page }) => {
    test.setTimeout(45000);
    await page.setViewportSize({ width: 375, height: 812 });
    const calls = await openMyTeam(page);
    await page.getByTestId('mobile-pitch-token-p15').click();
    await page.getByRole('button', { name: /make captain/i }).click();
    // Palmer already scored as captain this round, so the switch asks to confirm.
    const confirm = page.getByRole('button', { name: /^confirm/i });
    if (await confirm.isVisible({ timeout: 2000 }).catch(() => false)) await confirm.click();
    await expect.poll(() => calls.find(c => c.name === 'set_captain')?.args?.p_player_id).toBe('p15');
  });

  test('desktop — My team renders without crash', async ({ page }) => {
    test.setTimeout(45000);
    await page.setViewportSize({ width: 1440, height: 900 });
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await openMyTeam(page);
    await expect(page.getByTestId('pitch-view')).toBeVisible({ timeout: 15000 });
    expect(errors, `My team threw: ${errors.join(', ')}`).toHaveLength(0);
  });
});

// S31 (MD-12): Replace, pending changes and Confirm transfers on My team.
const transfersSent = calls => calls.filter(c => c.name === 'process-transfer').map(c => `${c.args.action}:${c.args.player_id}`);

test.describe('My team — Replace and Confirm transfers', () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page);
    await page.setViewportSize({ width: 375, height: 812 });
  });

  test('replace one player, then confirm', async ({ page }) => {
    test.setTimeout(45000);
    const calls = await openMyTeam(page);
    await page.getByTestId('mobile-pitch-token-p15').click();
    await page.getByTestId('player-sheet-replace').click();
    await expect(page.getByText('Replace Wissa')).toBeVisible();
    // €3.5M in the bank + €6.0M for Wissa: the €12.0M striker is not offered.
    await expect(page.getByText('Expensive', { exact: true })).toHaveCount(0);
    await page.getByTestId('picker-pick-m1').click();

    // Pending: Watkins stands in Wissa's place, marked IN, and nothing is sent yet.
    await expect(page.getByTestId('mobile-pitch-field').getByTestId('pending-in-m1')).toBeVisible();
    await expect(page.getByTestId('mobile-pitch-token-p15')).toHaveCount(0);
    await expect(page.getByTestId('transfer-review-count')).toHaveText('1');
    await expect(page.getByTestId('transfer-review-money')).toContainText('€0.5M left');
    expect(transfersSent(calls)).toEqual([]);

    await page.getByTestId('transfer-review-confirm').click();
    await expect.poll(() => transfersSent(calls)).toEqual(['sell:p15', 'buy:m1']);
    await expect(page.getByTestId('transfer-review-bar')).toHaveCount(0);
  });

  test('replace three players, then confirm sells before buys', async ({ page }) => {
    test.setTimeout(60000);
    const calls = await openMyTeam(page);
    const replace = async (tap, pick) => {
      await tap.click();
      await page.getByTestId('player-sheet-replace').click();
      await page.getByTestId(`picker-pick-${pick}`).click();
      await expect(page.getByTestId(`picker-pick-${pick}`)).toHaveCount(0);
    };
    await replace(page.getByTestId('mobile-pitch-token-p15'), 'm2');
    await replace(page.locator('button', { hasText: /mykolenko/i }).first(), 'm6');
    await replace(page.locator('button', { hasText: /andreas/i }).first(), 'm5');

    await expect(page.getByTestId('transfer-review-count')).toHaveText('3');
    await expect(page.getByTestId('transfer-review-money')).toContainText('€2.5M left');
    expect(transfersSent(calls)).toEqual([]);

    await page.getByTestId('transfer-review-confirm').click();
    await expect.poll(() => transfersSent(calls)).toEqual(['sell:p15', 'sell:p7', 'sell:p12', 'buy:m2', 'buy:m6', 'buy:m5']);
    await expect(page.getByTestId('transfer-review-bar')).toHaveCount(0);
  });

  test('a full club is blocked in the replacements list', async ({ page }) => {
    test.setTimeout(45000);
    await openMyTeam(page);
    // Five Arsenal players already: Odegaard shows CLUB LIMIT and cannot be picked.
    await page.getByTestId('mobile-pitch-token-p10').click();
    await page.getByTestId('player-sheet-replace').click();
    await expect(page.getByText('Odegaard')).toBeVisible();
    await expect(page.getByText('CLUB LIMIT')).toBeVisible();
    await expect(page.getByTestId('picker-pick-m4')).toHaveCount(0);
    await expect(page.getByTestId('picker-pick-m5')).toBeVisible();
  });

  test('a failed transfer stops and leaves the rest pending', async ({ page }) => {
    test.setTimeout(45000);
    const calls = await openMyTeam(page, { failTransfer: b => b.action === 'buy' });
    await page.getByTestId('mobile-pitch-token-p15').click();
    await page.getByTestId('player-sheet-replace').click();
    await page.getByTestId('picker-pick-m1').click();
    await page.getByTestId('transfer-review-confirm').click();
    await expect(page.getByText(/stopped at buying watkins/i)).toBeVisible();
    expect(transfersSent(calls)).toEqual(['sell:p15', 'buy:m1']);
    await expect(page.getByTestId('transfer-review-count')).toHaveText('1');
  });

  test('a closed transfer window hides Replace', async ({ page }) => {
    test.setTimeout(45000);
    await openMyTeam(page, { window: 'upcoming' });
    await page.getByTestId('mobile-pitch-token-p15').click();
    await expect(page.getByRole('button', { name: /make captain/i })).toBeVisible();
    await expect(page.getByTestId('player-sheet-replace')).toHaveCount(0);
  });

  test('the Joker has its own button in the chips row', async ({ page }) => {
    test.setTimeout(45000);
    await openMyTeam(page, { joker: 'available' });
    await page.getByTestId('chips-row-joker').click();
    await expect(page.getByRole('dialog', { name: /choose your joker/i })).toBeVisible();
  });
});

// S32 (MD-13): desktop side column, and draft leagues hide Replace.
test.describe('My team — desktop side column and draft leagues', () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page);
  });

  test('desktop — side column holds Needs attention, Chips and the round matches', async ({ page }) => {
    test.setTimeout(45000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openMyTeam(page);
    const side = page.getByTestId('my-team-side');
    await expect(side).toBeVisible({ timeout: 15000 });
    await expect(side.getByTestId('needs-attention-card')).toContainText('Saka');
    await expect(side.getByTestId('chips-card')).toBeVisible();
    await expect(side.getByTestId('side-matches')).toBeVisible();
    await expect(page.getByTestId('pitch-view')).toBeVisible();
    // The old page chrome is gone: no Squad header tabs, no CHIPS tab.
    await expect(page.getByRole('button', { name: /^chips$/i })).toHaveCount(0);
  });

  test('desktop — Replace from Needs attention opens the replacements list', async ({ page }) => {
    test.setTimeout(45000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openMyTeam(page);
    await page.getByTestId('attention-replace-p8').click();
    await expect(page.getByText('Replace Saka')).toBeVisible();
  });

  test('desktop — Player status opens in the side column', async ({ page }) => {
    test.setTimeout(45000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openMyTeam(page);
    await page.getByTestId('my-team-side').getByRole('button', { name: /player status/i }).click();
    await expect(page.getByTestId('side-status')).toBeVisible();
    await page.getByTestId('my-team-side').getByRole('button', { name: /back/i }).click();
    await expect(page.getByTestId('needs-attention-card')).toBeVisible();
  });

  test('draft league in its wishlist window hides Replace', async ({ page }) => {
    test.setTimeout(45000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openMyTeam(page, { draft: true });
    await expect(page).toHaveURL(new RegExp(`/league/${MOCK_LEAGUE_ID}\\?tab=team`));
    await expect(page.getByTestId('needs-attention-card')).toContainText('Saka', { timeout: 15000 });
    await expect(page.getByTestId('attention-replace-p8')).toHaveCount(0);
    await page.getByTestId('token-p8').first().click();
    await expect(page.getByRole('button', { name: /make captain/i })).toBeVisible();
    await expect(page.getByTestId('player-sheet-replace')).toHaveCount(0);
  });

  test('non-draft league shows Replace on desktop', async ({ page }) => {
    test.setTimeout(45000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openMyTeam(page);
    await expect(page.getByTestId('attention-replace-p8')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('token-p8').first().click();
    await expect(page.getByTestId('player-sheet-replace')).toBeVisible();
  });
});

// ── Fixture player data injected via route mock (avoids DB dependency) ────────

// ── 5. Market (a sheet on the My team tab since S31 / MD-12) ──────────────────
// /market redirects to the league's My team tab with the market sheet open.
async function openMarketSheet(page) {
  await mockMyTeam(page);
  await page.goto(`/market?leagueId=${MOCK_LEAGUE_ID}`);
  await waitForContent(page);
  const panel = page.getByTestId('market-panel');
  await expect(panel).toBeVisible({ timeout: 15000 });
  return panel;
}

test.describe('Market sheet', () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page);
  });

  test('/market?leagueId= opens My team with the market sheet', async ({ page }) => {
    const panel = await openMarketSheet(page);
    await expect(page).toHaveURL(new RegExp(`/league/${MOCK_LEAGUE_ID}\\?tab=team`));
    await expect(panel.getByText(/player market/i).first()).toBeVisible();
  });

  test('/market without a league goes to the Clubhouse list', async ({ page }) => {
    await page.goto('/market');
    await waitForContent(page);
    await expect(page).toHaveURL(/\/clubhouse/);
  });

  test('renders the player list, filters and budget', async ({ page }) => {
    const panel = await openMarketSheet(page);
    await expect(panel.locator('[data-tour="market-filters"]')).toBeVisible({ timeout: 15000 });
    await expect(panel.locator('[data-tour="market-budget"]').first()).toBeVisible();
    await expect(panel.locator('[data-tour="market-player-list"]')).toContainText(/watkins/i);
  });

  test('position filter tabs are clickable', async ({ page }) => {
    const panel = await openMarketSheet(page);
    const filters = panel.locator('[data-tour="market-filters"]');
    await filters.waitFor({ state: 'visible', timeout: 15000 });
    await filters.locator('button', { hasText: 'FWD' }).first().click();
    await expect(panel.locator('[data-tour="market-player-list"]')).toContainText(/watkins/i);
    await expect(panel.locator('[data-tour="market-player-list"]')).not.toContainText(/wharton/i);
    await filters.locator('button', { hasText: 'ALL' }).first().click();
    await expect(panel.locator('[data-tour="market-player-list"]')).toContainText(/wharton/i);
  });

  test('Done closes the sheet back to the pitch', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openMarketSheet(page);
    await page.getByTestId('market-panel-done').click();
    await expect(page.getByTestId('market-panel')).toHaveCount(0);
    await expect(page.getByTestId('mobile-pitch-field')).toBeVisible();
  });

  test('the league Market tab opens the sheet', async ({ page }) => {
    test.setTimeout(45000);
    await openMyTeam(page);
    await page.getByText(/^market$/i).filter({ visible: true }).first().click();
    await expect(page.getByTestId('market-panel')).toBeVisible({ timeout: 15000 });
  });

  test('mobile — no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openMarketSheet(page);
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
    await expect(main.getByText(/league/i).filter({ visible: true }).first()).toBeVisible();
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
  test('desktop — top bar offset applied (content not behind top bar)', async ({ page }) => {
    await skipOnboarding(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForContent(page);

    // Main content wrapper sits below the 56px top bar
    const mainContent = page.locator('[data-testid="main-content"]');
    const box = await mainContent.boundingBox();
    expect(box?.y ?? 0).toBeGreaterThanOrEqual(50);
  });

  test('mobile — bottom nav does not obscure content', async ({ page }) => {
    await skipOnboarding(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/clubhouse');
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
    // NotFoundScreen shows a "← Back to Home" button — no auto-redirect
    await page.getByRole('button', { name: /back to home/i }).click();
    // / redirects to /home
    await expect(page).toHaveURL(/\/(home)?$/);
  });
});
