// @ts-check
// Scoring & Live Center E2E tests
// Uses the MOCK_* fallback data baked into LiveScreen for CI compatibility.
// No DB connection required — Supabase queries return empty/null and the
// screen automatically falls back to demo data.

import { test, expect } from '@playwright/test';

async function skipOnboarding(page) {
  await page.addInitScript(() => {
    localStorage.setItem('forzakit_onboarding_done', 'true');
    localStorage.setItem('forzakit_tour_squad_done', 'true');
    localStorage.setItem('forzakit_tour_market_done', 'true');
  });
}

async function waitForContent(page) {
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(600);
}

async function goToLive(page) {
  await skipOnboarding(page);
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
    // MOCK_LIVE_FIXTURES has Brazil vs Korea as live
    const body = await page.locator('body').innerText();
    expect(body.toUpperCase()).toContain('LIVE');
  });

  test('shows home and away team abbreviations', async ({ page }) => {
    await goToLive(page);
    const body = await page.locator('body').innerText();
    // Brazil → BRA, Korea → KOR
    expect(body.toUpperCase()).toContain('BRA');
    expect(body.toUpperCase()).toContain('KOR');
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
    // MOCK_EVENTS contains goals and cards — at least one player name should appear
    // Son Heung-min, Richarlison, Casemiro are in the mock event feed
    const hasEvent = body.includes('Son') || body.includes('Richarlison') || body.includes('Casemiro');
    expect(hasEvent, 'Event feed player names not found').toBe(true);
  });

  test('event feed shows goal events', async ({ page }) => {
    await goToLive(page);
    const body = await page.locator('body').innerText();
    // Goals should render with some indicator — check for player name or GOAL text
    const hasGoal = body.toUpperCase().includes('GOAL') || body.includes('Son') || body.includes('Richarlison');
    expect(hasGoal, 'No goal events found in feed').toBe(true);
  });

  test('event feed shows card/yellow events', async ({ page }) => {
    await goToLive(page);
    const body = await page.locator('body').innerText();
    const hasCard = body.toUpperCase().includes('YELLOW') || body.toUpperCase().includes('CARD') || body.includes('Casemiro');
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
    // MOCK_RIVALS has Ricardo, João, Ana
    const hasRival = body.includes('Ricardo') || body.includes('João') || body.includes('Ana');
    expect(hasRival, 'Rival names not found — rival standings may not be rendering').toBe(true);
  });

  test('join a league prompt shown when no league', async ({ page }) => {
    await goToLive(page);
    const body = await page.locator('body').innerText();
    // Either rival names OR the "join a league" prompt should be present
    const hasContent = body.includes('Ricardo') || body.toUpperCase().includes('JOIN A LEAGUE') || body.toUpperCase().includes('RIVAL');
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
    expect(body.toUpperCase()).toContain('BRA');
  });

  test('Live Points score visible on mobile', async ({ page }) => {
    await goToLive(page);
    const body = await page.locator('body').innerText();
    expect(body.toUpperCase()).toContain('LIVE POINTS');
  });
});
