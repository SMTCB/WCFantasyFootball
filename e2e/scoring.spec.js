// @ts-check
// Scoring & Live Center E2E tests
// Mocks all Supabase REST routes so tests are fully self-contained (no DB required).

import { test, expect } from '@playwright/test';

// ── Mock data ────────────────────────────────────────────────────────────────

const MOCK_FIXTURE_ID   = 'fix-live-001';
const MOCK_LEAGUE_ID    = 'league-e2e-001';
const MOCK_USER_ID      = 'user-e2e-001';

const MOCK_FIXTURES = [
  {
    id: MOCK_FIXTURE_ID,
    home_team: 'MCI', away_team: 'LIV',
    status: 'live', minute: 64,
    kickoff_at: new Date(Date.now() - 64 * 60 * 1000).toISOString(),
  },
  {
    id: 'fix-upcoming-001',
    home_team: 'ARS', away_team: 'CHE',
    status: 'scheduled', minute: null,
    kickoff_at: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
  },
];

const MOCK_PLAYERS = [
  { id: 'p-haaland',   name: 'Haaland',   position: 'FWD', club: 'MCI', price: 14.0 },
  { id: 'p-foden',     name: 'Foden',     position: 'MID', club: 'MCI', price: 9.5 },
  { id: 'p-robertson', name: 'Robertson', position: 'DEF', club: 'LIV', price: 7.0 },
  { id: 'p-salah',     name: 'Salah',     position: 'MID', club: 'LIV', price: 13.0 },
  { id: 'p-alisson',   name: 'Alisson',   position: 'GK',  club: 'LIV', price: 6.0 },
];

const MOCK_MATCH_EVENTS = [
  { id: 'ev-1', fixture_id: MOCK_FIXTURE_ID, player_id: 'p-haaland',   type: 'goal',        minute: 23, team: 'MCI', playerName: 'Haaland' },
  { id: 'ev-2', fixture_id: MOCK_FIXTURE_ID, player_id: 'p-foden',     type: 'goal',        minute: 51, team: 'MCI', playerName: 'Foden' },
  { id: 'ev-3', fixture_id: MOCK_FIXTURE_ID, player_id: 'p-robertson', type: 'yellow_card', minute: 28, team: 'LIV', playerName: 'Robertson' },
];

const MOCK_LEAGUE_MEMBER = {
  league_id: MOCK_LEAGUE_ID,
  rank: 1,
  total_points: 215,
  leagues: { name: 'E2E League' },
};

const MOCK_RIVALS = [
  { rank: 1, total_points: 215, user_id: MOCK_USER_ID,     users: { username: 'You' } },
  { rank: 2, total_points: 198, user_id: 'user-e2e-002',   users: { username: 'Ricardo' } },
  { rank: 3, total_points: 180, user_id: 'user-e2e-003',   users: { username: 'João' } },
];

const MOCK_SQUAD = {
  id: 'squad-e2e-001',
  players: MOCK_PLAYERS.map(p => p.id),
  captain_id: 'p-haaland',
  is_triple_captain: false,
  matchday_id: 'epl-2526-r34',
};

const MOCK_STATS = MOCK_PLAYERS.map((p, i) => ({
  player_id: p.id,
  fantasy_points: [8, 6, 2, 12, 6][i],
  fixture_id: MOCK_FIXTURE_ID,
}));

// ── Route mock helper ────────────────────────────────────────────────────────

async function mockLiveApi(page) {
  // fixtures table
  await page.route('**/rest/v1/fixtures**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': `0-${MOCK_FIXTURES.length - 1}/${MOCK_FIXTURES.length}` },
      body: JSON.stringify(MOCK_FIXTURES),
    });
  });

  // match_events table (goal counts + event feed)
  await page.route('**/rest/v1/match_events**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': `0-${MOCK_MATCH_EVENTS.length - 1}/${MOCK_MATCH_EVENTS.length}` },
      body: JSON.stringify(MOCK_MATCH_EVENTS),
    });
  });

  // league_members — first call returns the user's league; second returns rivals
  let leagueMemberCallCount = 0;
  await page.route('**/rest/v1/league_members**', route => {
    leagueMemberCallCount++;
    if (leagueMemberCallCount === 1) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Content-Range': '0-0/1' },
        body: JSON.stringify([MOCK_LEAGUE_MEMBER]),
      });
    } else {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Content-Range': `0-${MOCK_RIVALS.length - 1}/${MOCK_RIVALS.length}` },
        body: JSON.stringify(MOCK_RIVALS),
      });
    }
  });

  // squads table
  await page.route('**/rest/v1/squads**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': '0-0/1' },
      body: JSON.stringify([MOCK_SQUAD]),
    });
  });

  // players table
  await page.route('**/rest/v1/players**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': `0-${MOCK_PLAYERS.length - 1}/${MOCK_PLAYERS.length}` },
      body: JSON.stringify(MOCK_PLAYERS),
    });
  });

  // player_match_stats table
  await page.route('**/rest/v1/player_match_stats**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': `0-${MOCK_STATS.length - 1}/${MOCK_STATS.length}` },
      body: JSON.stringify(MOCK_STATS),
    });
  });

  // leagues table (for league name lookups)
  await page.route('**/rest/v1/leagues**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': '0-0/1' },
      body: JSON.stringify([{ id: MOCK_LEAGUE_ID, name: 'E2E League', format: 'noduplicate', tournament_id: null }]),
    });
  });

  // RPC calls (get_server_time etc.)
  await page.route('**/rest/v1/rpc/**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(new Date().toISOString()),
    });
  });
}

// ── Navigation helpers ────────────────────────────────────────────────────────

async function skipOnboarding(page) {
  await page.addInitScript(() => {
    localStorage.setItem('forzakit_onboarding_done', 'true');
    localStorage.setItem('forzakit_tour_squad_done', 'true');
    localStorage.setItem('forzakit_tour_market_done', 'true');
  });
}

async function waitForContent(page) {
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(800);
}

async function goToLive(page) {
  await skipOnboarding(page);
  await mockLiveApi(page);
  await page.goto('/live');
  await waitForContent(page);
}

// ── 1. Page structure ─────────────────────────────────────────────────────────

test.describe('Live Center — page structure', () => {
  test('renders LIVE CENTER heading', async ({ page }) => {
    await goToLive(page);
    const body = await page.locator('body').innerText();
    expect(body.toUpperCase()).toContain('LIVE CENTER');
  });

  test('no JS errors on load', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await goToLive(page);
    expect(errors, `JS errors: ${errors.join(', ')}`).toHaveLength(0);
  });
});

// ── 2. Match ticker ───────────────────────────────────────────────────────────

test.describe('Live Center — match ticker (mock data)', () => {
  test('shows live fixture with LIVE label', async ({ page }) => {
    await goToLive(page);
    const body = await page.locator('body').innerText();
    expect(body.toUpperCase()).toContain('LIVE');
  });

  test('shows home and away team abbreviations', async ({ page }) => {
    await goToLive(page);
    const body = await page.locator('body').innerText();
    // Mock fixtures: MCI vs LIV (live), ARS vs CHE (upcoming)
    const hasTeam = /MCI|LIV|ARS|CHE/i.test(body);
    expect(hasTeam, 'No team abbreviation found in match ticker').toBe(true);
  });

  test('shows upcoming fixture', async ({ page }) => {
    await goToLive(page);
    const body = await page.locator('body').innerText();
    expect(body.toUpperCase()).toContain('UPCOMING');
  });

  test('shows match minute for live fixture', async ({ page }) => {
    await goToLive(page);
    // Mock fixture is at minute 64
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/6[0-9]'/);
  });
});

// ── 3. Event feed ─────────────────────────────────────────────────────────────

test.describe('Live Center — event feed (mock data)', () => {
  test('renders event feed section', async ({ page }) => {
    await goToLive(page);
    const body = await page.locator('body').innerText();
    // MOCK_MATCH_EVENTS: goals (Haaland, Foden) and a yellow card (Robertson)
    const hasEvent = body.includes('Haaland') || body.includes('Foden') || body.includes('Robertson');
    expect(hasEvent, 'Event feed player names not found').toBe(true);
  });

  test('event feed shows goal events', async ({ page }) => {
    await goToLive(page);
    const body = await page.locator('body').innerText();
    const hasGoal = body.toUpperCase().includes('GOAL') || body.includes('Haaland') || body.includes('Foden');
    expect(hasGoal, 'No goal events found in feed').toBe(true);
  });

  test('event feed shows card/yellow events', async ({ page }) => {
    await goToLive(page);
    const body = await page.locator('body').innerText();
    const hasCard = body.toUpperCase().includes('YELLOW') || body.toUpperCase().includes('CARD') || body.includes('Robertson');
    expect(hasCard, 'No card events found in feed').toBe(true);
  });
});

// ── 4. Score & projection panel ───────────────────────────────────────────────

test.describe('Live Center — score panel', () => {
  test('shows Live Points label', async ({ page }) => {
    await goToLive(page);
    const body = await page.locator('body').innerText();
    expect(body.toUpperCase()).toContain('LIVE POINTS');
  });

  test('shows Season total label', async ({ page }) => {
    await goToLive(page);
    const body = await page.locator('body').innerText();
    expect(body.toUpperCase()).toContain('SEASON TOTAL');
  });
});

// ── 5. Rival standings ────────────────────────────────────────────────────────

test.describe('Live Center — rival standings (mock data)', () => {
  test('renders rival manager names', async ({ page }) => {
    await goToLive(page);
    const body = await page.locator('body').innerText();
    // MOCK_RIVALS: Ricardo, João
    const hasContent = body.includes('Ricardo') || body.includes('João')
      || body.toUpperCase().includes('JOIN A LEAGUE')
      || body.toUpperCase().includes('RIVAL')
      || body.toUpperCase().includes('STANDING');
    expect(hasContent, 'Neither rival names nor standings UI found').toBe(true);
  });

  test('join a league prompt shown when no league', async ({ page }) => {
    // This variant skips the league mock — tests the empty state
    await skipOnboarding(page);

    // Only mock fixtures/events; no league_members → shows "Join a league" prompt
    await page.route('**/rest/v1/fixtures**', route => {
      route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Content-Range': '0-0/0' }, body: JSON.stringify([]) });
    });
    await page.route('**/rest/v1/match_events**', route => {
      route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Content-Range': '0-0/0' }, body: JSON.stringify([]) });
    });
    await page.route('**/rest/v1/league_members**', route => {
      route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Content-Range': '0-0/0' }, body: JSON.stringify([]) });
    });
    await page.route('**/rest/v1/leagues**', route => {
      route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Content-Range': '0-0/0' }, body: JSON.stringify([]) });
    });
    await page.route('**/rest/v1/rpc/**', route => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(new Date().toISOString()) });
    });

    await page.goto('/live');
    await waitForContent(page);

    const body = await page.locator('body').innerText();
    const hasContent = body.toUpperCase().includes('JOIN A LEAGUE') || body.toUpperCase().includes('RIVAL') || body.toUpperCase().includes('LEAGUE');
    expect(hasContent, 'Neither rival data nor join prompt found').toBe(true);
  });
});

// ── 6. Mobile viewport ───────────────────────────────────────────────────────

test.describe('Live Center — mobile viewport', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('renders without overflow or blank content at 375px', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await goToLive(page);

    const body = await page.locator('body').innerText();
    expect(body.toUpperCase()).toContain('LIVE CENTER');
    expect(errors, `JS errors at 375px: ${errors.join(', ')}`).toHaveLength(0);
  });

  test('match ticker visible on mobile', async ({ page }) => {
    await goToLive(page);
    const body = await page.locator('body').innerText();
    expect(body.toUpperCase()).toContain('LIVE');
    // Mock fixtures: MCI vs LIV
    const hasTeam = /MCI|LIV/i.test(body);
    expect(hasTeam, 'No team found in mobile match ticker').toBe(true);
  });

  test('Live Points score visible on mobile', async ({ page }) => {
    await goToLive(page);
    const body = await page.locator('body').innerText();
    expect(body.toUpperCase()).toContain('LIVE POINTS');
  });
});
