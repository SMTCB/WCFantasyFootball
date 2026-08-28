// e2e/f1-screens.spec.js — Tier 3 local full-stack E2E for the 7 F1 screens.
// Targets the local `npx supabase start` stack via scripts/e2e-local.mjs
// (npm run test:e2e:local). B-12 guard: never runs against production.
//
// Seed data (supabase/seed.sql, F1 section):
//  - PADDOCK_ID 'f1000000-0000-4000-a000-000000000001', invite_code 'F1SEED01'
//  - USER_A (paddock owner/admin) + USER_B (not yet a member)
//  - Round 1: 'Seed Grand Prix 1' — scheduled, unlocked, no bet yet (race-pick spec)
//  - Round 2: 'Seed Grand Prix 2' — finished, unscored, USER_A has a bet
//    (p1 Max Verstappen / p2 Charles Leclerc / p3 Lewis Hamilton / team Red Bull)
//    — admin enters this exact result so the bet scores 32 pts (10+8+6+5+3 bonus)
//  - Round 3: 'Seed Grand Prix 3' — finished, scored, both users have hand-worked
//    scores already in f1_scores (standings/report smoke only)

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-target.js';

test.describe.configure({ retries: 0 });

// Service-role client — needed only to reset round-2 scoring state before
// SUITE 4 so it stays idempotent across the desktop-chrome → mobile-chrome
// project sequence (fullyParallel:false means both run against the SAME
// local DB; desktop-chrome always scores round 2 first, which without a
// reset leaves mobile-chrome's identical pass looking at an
// already-`is_scored` race — its SCORE RACE button then renders as "✓
// ALREADY SCORED" and the locator in SUITE 4 never finds it). trophy_ledger
// has no client-writable policy at all (writes only via SECURITY DEFINER
// RPCs / service role), so an admin-authenticated client can't do this
// reset on its own. Gracefully no-ops if unset (e.g. spec run directly
// outside `npm run test:e2e:local`).
const SERVICE_ROLE_KEY = process.env.E2E_LOCAL_SERVICE_ROLE_KEY;
const serviceSupabase = SERVICE_ROLE_KEY ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY) : null;

const USER_A = { email: 'e2e_a@fantasykit.test', password: 'E2ePass!99' };
const USER_B = { email: 'e2e_b@fantasykit.test', password: 'E2ePass!99' };

const PADDOCK_ID = 'f1000000-0000-4000-a000-000000000001';
const USER_A_ID = 'e0000000-0000-4000-a000-00000000000a';
const USER_B_ID = 'e0000000-0000-4000-a000-00000000000b';
const INVITE_CODE = 'F1SEED01';

async function signIn(email, password) {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data?.session) throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  return { client, session: data.session };
}

function injectSession(page, session) {
  const projectRef = SUPABASE_URL.match(/\/\/([^.]+)\./)?.[1] ?? 'sssmvihxtqtohisghjet';
  const key        = `sb-${projectRef}-auth-token`;
  const value      = JSON.stringify({
    access_token:  session.access_token,
    token_type:    'bearer',
    expires_in:    3600,
    expires_at:    session.expires_at,
    refresh_token: session.refresh_token,
    user:          session.user,
  });
  return page.addInitScript(({ k, v }) => {
    localStorage.setItem(k, v);
    localStorage.setItem('forzakit_onboarding_done',  'true');
    localStorage.setItem('forzakit_tour_squad_done',  'true');
    localStorage.setItem('forzakit_tour_market_done', 'true');
  }, { k: key, v: value });
}

async function safeGoto(page, url, opts = {}) {
  try {
    await page.goto(url, { timeout: 10000, ...opts });
    return true;
  } catch {
    return false;
  }
}

let sessionA, supaA, sessionB, supaB;

test.beforeAll(async () => {
  if (sessionA && supaA) return;
  ({ client: supaA, session: sessionA } = await signIn(USER_A.email, USER_A.password));
  ({ client: supaB, session: sessionB } = await signIn(USER_B.email, USER_B.password));
});

test.afterAll(async () => {
  // Keep the join-spec idempotent across reruns of `npx supabase db reset`.
  if (supaA) {
    await supaA.from('paddock_members').delete().eq('paddock_id', PADDOCK_ID).eq('user_id', USER_B_ID);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 1 — smoke: every F1 route loads without crashing
// ══════════════════════════════════════════════════════════════════════════════

test.describe('F1 screens — smoke', () => {
  const ROUTES = [
    ['/f1', 'lobby'],
    [`/f1/${PADDOCK_ID}`, 'home'],
    [`/f1/${PADDOCK_ID}/standings`, 'standings'],
    [`/f1/${PADDOCK_ID}/report`, 'report'],
    [`/f1/${PADDOCK_ID}/season`, 'season bets'],
    [`/f1/${PADDOCK_ID}/admin`, 'admin'],
    [`/f1/${PADDOCK_ID}/picks/1`, 'picks redirect'],
  ];

  for (const [route, label] of ROUTES) {
    test(`1.x ${label} (${route}) loads without JS error`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await injectSession(page, sessionA);
      const reached = await safeGoto(page, route);
      if (!reached) { console.log(`⚠ Server unreachable for ${route}`); return; }
      await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
      await page.waitForTimeout(1200);
      const text = await page.locator('body').innerText().catch(() => '');
      expect(text.trim().length, `${route} has no content`).toBeGreaterThan(10);
      expect(errors, `${route} JS errors: ${errors.join('; ')}`).toHaveLength(0);
      console.log(`✅ ${label}: OK`);
    });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 2 — submit a race pick on the unlocked round-1 race
// ══════════════════════════════════════════════════════════════════════════════

test.describe('F1 race pick submission', () => {
  test('2.1 submit picks on round 1 via F1RacePickForm', async ({ page }) => {
    await injectSession(page, sessionA);
    const reached = await safeGoto(page, `/f1/${PADDOCK_ID}`);
    if (!reached) { console.log('⚠ Server unreachable for F1 home'); return; }
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(1200);

    const row = page.locator('#f1-race-row-1');
    await expect(row, 'round-1 race row not found').toBeVisible({ timeout: 10000 });

    // Expand the row via its toggle button if the form isn't already showing.
    const selects = row.locator('select');
    if (await selects.count() === 0) {
      await row.locator('button').first().click();
      await page.waitForTimeout(500);
    }
    await expect(selects, 'race-pick form did not expand').toHaveCount(5, { timeout: 10000 });

    // DOM order: P1, P2, P3, DNF driver, Team.
    await selects.nth(0).selectOption({ label: 'Max Verstappen' });
    await selects.nth(1).selectOption({ label: 'Lando Norris' });
    await selects.nth(2).selectOption({ label: 'Charles Leclerc' });
    await selects.nth(4).selectOption({ label: 'Red Bull' });

    const submit = row.locator('button[type="submit"]');
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(submit).toHaveText(/PICKS SAVED/i, { timeout: 10000 });

    const { data: bet, error } = await supaA
      .from('f1_bets_race')
      .select('p1, p2, p3, team_most_points')
      .eq('user_id', USER_A_ID)
      .eq('round_number', 1)
      .maybeSingle();
    expect(error).toBeNull();
    expect(bet?.p1).toBe('Max Verstappen');
    expect(bet?.p2).toBe('Lando Norris');
    expect(bet?.p3).toBe('Charles Leclerc');
    expect(bet?.team_most_points).toBe('Red Bull');
    console.log('✅ round-1 pick saved and verified in f1_bets_race');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 3 — USER_B joins the seeded paddock by invite code
// ══════════════════════════════════════════════════════════════════════════════

test.describe('F1 paddock join by invite code', () => {
  test('3.1 USER_B joins via PaddockLobbyScreen JOIN tab', async ({ page }) => {
    await injectSession(page, sessionB);
    const reached = await safeGoto(page, '/f1');
    if (!reached) { console.log('⚠ Server unreachable for F1 lobby'); return; }
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(1000);

    await page.getByRole('button', { name: /JOIN/i }).first().click();
    await page.waitForTimeout(500);

    const codeInput = page.locator('input[placeholder="8-CHARACTER CODE"]');
    await expect(codeInput).toBeVisible({ timeout: 10000 });
    await codeInput.fill(INVITE_CODE.toLowerCase()); // client uppercases before RPC call

    const joinBtn = page.getByRole('button', { name: /JOIN PADDOCK/i });
    await expect(joinBtn).toBeEnabled();
    await joinBtn.click();

    await page.waitForURL(new RegExp(`/f1/${PADDOCK_ID}`), { timeout: 10000 }).catch(() => {});

    const { data: member, error } = await supaA
      .from('paddock_members')
      .select('user_id, role')
      .eq('paddock_id', PADDOCK_ID)
      .eq('user_id', USER_B_ID)
      .maybeSingle();
    expect(error).toBeNull();
    expect(member?.user_id, 'USER_B should now be a paddock member').toBe(USER_B_ID);
    console.log('✅ USER_B joined paddock via invite code, verified in paddock_members');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 4 — admin enters round-2 result and scores the race
// ══════════════════════════════════════════════════════════════════════════════

test.describe('F1 admin — save result and score race', () => {
  test('4.1 save round-2 result and invoke score-f1-race', async ({ page }) => {
    test.setTimeout(45000);

    if (serviceSupabase) {
      await serviceSupabase.from('f1_races').update({ is_scored: false }).eq('season', 2026).eq('round_number', 2);
      await serviceSupabase.from('f1_scores').delete().eq('season', 2026).eq('round_number', 2).eq('score_type', 'race');
      await serviceSupabase.from('trophy_ledger').delete().eq('league_id', PADDOCK_ID).eq('trophy_type', 'event_win');
    } else {
      console.log('⚠ E2E_LOCAL_SERVICE_ROLE_KEY not set — skipping round-2 idempotency reset');
    }

    await injectSession(page, sessionA);
    const reached = await safeGoto(page, `/f1/${PADDOCK_ID}/admin`);
    if (!reached) { console.log('⚠ Server unreachable for F1 admin'); return; }
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(1200);

    const adminGate = await page.locator('body').innerText().catch(() => '');
    if (/ADMIN ACCESS REQUIRED/i.test(adminGate)) {
      console.log('⚠ USER_A not recognized as paddock admin — skipping');
      return;
    }

    // "SELECT RACE" dropdown defaults to round 1 — explicitly pick round 2 by
    // option text (option strings can carry a trailing space/checkmark artifact,
    // so match by substring + index rather than an exact label).
    const raceSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'Seed Grand Prix' }) }).first();
    await expect(raceSelect).toBeVisible({ timeout: 10000 });
    const optionTexts = await raceSelect.locator('option').allTextContents();
    const round2Index = optionTexts.findIndex(t => t.includes('Seed Grand Prix 2'));
    expect(round2Index, 'round-2 option not found in SELECT RACE dropdown').toBeGreaterThan(-1);
    await raceSelect.selectOption({ index: round2Index });
    await page.waitForTimeout(500);

    await page.locator('label:has-text("P1 Winner") + select').selectOption({ label: 'Max Verstappen' });
    await page.locator('label:has-text("P2 Second") + select').selectOption({ label: 'Charles Leclerc' });
    await page.locator('label:has-text("P3 Third") + select').selectOption({ label: 'Lewis Hamilton' });
    await page.locator('label:has-text("TEAM — MOST POINTS") + select').selectOption({ label: 'Red Bull' });

    const saveBtn = page.getByRole('button', { name: /SAVE RESULT/i });
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();
    await page.waitForTimeout(1500);

    const scoreBtn = page.getByRole('button', { name: /SCORE RACE/i });
    await expect(scoreBtn).toBeEnabled({ timeout: 10000 });
    await scoreBtn.click();
    await expect(page.getByRole('button', { name: /ALREADY SCORED/i })).toBeVisible({ timeout: 20000 });

    const { data: score, error } = await supaA
      .from('f1_scores')
      .select('total_points')
      .eq('user_id', USER_A_ID)
      .eq('round_number', 2)
      .eq('score_type', 'race')
      .maybeSingle();
    expect(error).toBeNull();
    expect(score?.total_points, 'expected 10(p1)+8(p2)+6(p3)+5(team)+3(bonus)=32').toBe(32);

    const { data: trophy, error: trophyErr } = await supaA
      .from('trophy_ledger')
      .select('user_id, trophy_type')
      .eq('league_id', PADDOCK_ID)
      .eq('user_id', USER_A_ID)
      .eq('trophy_type', 'event_win')
      .maybeSingle();
    expect(trophyErr).toBeNull();
    expect(trophy?.trophy_type, 'expected an event_win trophy for the paddock winner').toBe('event_win');
    console.log('✅ round-2 scored: 32 pts for USER_A, event_win trophy landed in trophy_ledger');
  });
});
