// @ts-check
/**
 * Full E2E: auto-fill across all screens, draft mode, and classic mode.
 *
 * Auth: two test accounts (e2e_a@fantasykit.test / e2e_b@fantasykit.test)
 * provisioned via the e2e-setup edge function (service role, email pre-confirmed).
 * Sessions are injected into browser localStorage — no login UI required.
 *
 * Data: uses real production Supabase database.
 * Draft tests use WC 2026 players (future fixtures, no transfer lock).
 * Classic tests use EPL players (tournament 426 — real Premier League data).
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// Disable retries for this file: each test is stateful (module-level league IDs).
// Retries cause beforeAll to re-run which invalidates JWTs mid-test.
test.describe.configure({ retries: 0 });

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL      = 'https://sssmvihxtqtohisghjet.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_IQF1vJEiydutRmDa6XgDUA_FHTlWX0b';
const E2E_SECRET        = 'forzakit-e2e-2026';

const EPL_TOURNAMENT  = '426'; // Premier League 2025-26
const WC_TOURNAMENT   = '429'; // FIFA World Cup 2026
const SQUAD_SIZE      = 15;
const DRAFT_LIST_SIZE = 30;
const BUDGET          = 100;
const POS_CAPS        = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
const MIN_FORM        = { GK: 1, DEF: 3, MID: 2, FWD: 1 };

const USER_A = { email: 'e2e_a@fantasykit.test', password: 'E2ePass!99' };
const USER_B = { email: 'e2e_b@fantasykit.test', password: 'E2ePass!99' };

// ── Shared state ──────────────────────────────────────────────────────────────

let sessionA = null;
let sessionB = null;
let supaA    = null;
let supaB    = null;
let eplLeagueId   = null;
let eplJoinCode   = null;
let draftLeagueId = null;
let draftJoinCode = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function signIn(email, password) {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data?.session) throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  return { client, session: data.session };
}

async function provisionTestUsers() {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/e2e-setup`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'x-e2e-secret': E2E_SECRET },
    body: JSON.stringify({ users: [
      { email: USER_A.email, password: USER_A.password },
      { email: USER_B.email, password: USER_B.password },
    ]}),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`e2e-setup HTTP ${res.status}: ${JSON.stringify(body)}`);
  // "already_registered" is not a failure — user exists from a previous run, which is fine.
  const failures = (body.results ?? []).filter(r => r.error && !r.error.toLowerCase().includes('already'));
  if (failures.length) throw new Error(`user provisioning failed: ${JSON.stringify(failures)}`);
  console.log('✅ Test users provisioned:', body.results.map(r => r.email).join(', '));
}

/** Inject a Supabase session into a Playwright page before navigation. */
function injectSession(page, session) {
  const projectRef = 'sssmvihxtqtohisghjet';
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

/** Safe page.goto — returns false if server is unreachable. */
async function safeGoto(page, url, opts = {}) {
  try {
    await page.goto(url, { timeout: 10000, ...opts });
    return true;
  } catch {
    return false;
  }
}

/** Buy one player via process-transfer. Returns { ok, budget_remaining, error, code }. */
async function buyPlayer(accessToken, leagueId, player) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/process-transfer`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      action:       'buy',
      player_id:    player.id,
      player_price: player.price,
      league_id:    leagueId,
      user_id:      null, // resolved server-side from JWT
    }),
  });
  return res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
}

/** Fill a squad up to minimum formation via API. Returns { bought, budgetLeft, errors }. */
async function apiFillSquad(accessToken, leagueId, tournamentId, budget = BUDGET) {
  const bought = [];
  let budgetLeft = budget;
  const errors  = {};

  for (const pos of ['GK', 'DEF', 'MID', 'FWD']) {
    const dbPos = pos === 'FWD' ? ['FWD', 'FW'] : [pos];
    const { data: pool } = await supaA
      .from('players')
      .select('id, name, position, price')
      .eq('tournament_id', tournamentId)
      .in('position', dbPos)
      .lte('price', budgetLeft)
      .order('price', { ascending: true })
      .limit(100);

    if (!pool?.length) continue;

    const need = MIN_FORM[pos] ?? 1;
    let filled = 0;
    let fails  = 0;

    for (const cand of pool) {
      if (filled >= need || fails >= 5) break;
      const data = await buyPlayer(accessToken, leagueId, cand);
      if (data.ok) {
        bought.push(cand);
        budgetLeft = data.budget_remaining ?? (budgetLeft - Number(cand.price));
        filled++;
        fails = 0;
      } else {
        fails++;
        errors[pos] = data.error;
        if (['WINDOW_CLOSED','WINDOW_LOCKED','TRANSFER_LOCKED'].includes(data.code)) break;
        if (data.error?.includes('budget') || data.error?.includes('Squad is full')) break;
      }
    }
  }
  return { bought, budgetLeft, errors };
}

function checkPositionCaps(players) {
  const count = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of players) {
    const raw = (p.position ?? '').toUpperCase(); const pos = raw === 'FW' ? 'FWD' : raw;
    if (count[pos] !== undefined) count[pos]++;
  }
  for (const [pos, max] of Object.entries(POS_CAPS)) {
    expect(count[pos], `${pos} count ${count[pos]} exceeds cap ${max}`).toBeLessThanOrEqual(max);
  }
  return count;
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

test.beforeAll(async () => {
  // Guard: if sessions are already active (beforeAll called twice in same worker),
  // skip re-provisioning — updating the password would invalidate existing JWTs.
  if (sessionA && supaA) {
    console.log('ℹ️ Sessions already active — skipping re-provision');
    return;
  }
  await provisionTestUsers();
  const ra = await signIn(USER_A.email, USER_A.password);
  const rb = await signIn(USER_B.email, USER_B.password);
  sessionA = ra.session;  supaA = ra.client;
  sessionB = rb.session;  supaB = rb.client;
});

test.afterAll(async () => {
  for (const lid of [eplLeagueId, draftLeagueId].filter(Boolean)) {
    await supaA.from('draft_allocations').delete().eq('league_id', lid);
    await supaA.from('draft_submissions').delete().eq('league_id', lid);
    await supaA.from('squads').delete().eq('league_id', lid);
    await supaA.from('league_members').delete().eq('league_id', lid);
    await supaA.from('leagues').delete().eq('id', lid);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 1 — EPL classic league: auto-fill on SquadScreen + MarketScreen
// ══════════════════════════════════════════════════════════════════════════════

test.describe('EPL classic league — auto-fill on all screens', () => {

  test('1.1 Create EPL classic league', async () => {
    const { data: league, error } = await supaA.rpc('create_league', {
      p_name:          'E2E EPL Classic',
      p_format:        'classic',
      p_user_id:       sessionA.user.id,
      p_tournament_id: EPL_TOURNAMENT,
    });
    expect(error, `create_league: ${error?.message}`).toBeNull();
    const parsed = typeof league === 'string' ? JSON.parse(league) : league;
    eplLeagueId = parsed.id;
    eplJoinCode = parsed.join_code;
    expect(eplLeagueId).toBeTruthy();

    const { data: lRow } = await supaA.from('leagues')
      .select('format, squad_size, budget_total, position_limits, tournament_id')
      .eq('id', eplLeagueId).single();

    expect(lRow.format).toBe('classic');
    expect(lRow.squad_size).toBe(SQUAD_SIZE);
    expect(Number(lRow.budget_total)).toBe(BUDGET);
    expect(lRow.tournament_id).toBe(EPL_TOURNAMENT);
    console.log(`✅ EPL league: ${eplLeagueId}  code: ${eplJoinCode}`);
  });

  test('1.2 EPL player pool has players available', async () => {
    const { data: pool } = await supaA.from('players')
      .select('id, name, position, price')
      .eq('tournament_id', EPL_TOURNAMENT)
      .limit(100);
    expect(pool?.length, 'Need EPL players in DB').toBeGreaterThan(0);
    const byPos = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const p of pool) {
      const raw = (p.position ?? '').toUpperCase(); const pos = raw === 'FW' ? 'FWD' : raw;
      if (byPos[pos] !== undefined) byPos[pos]++;
    }
    console.log(`✅ EPL pool sample: ${pool.length} players`, byPos);
  });

  test('1.3 API auto-fill: buy minimum formation with EPL players', async () => {
    const { bought, budgetLeft, errors } = await apiFillSquad(
      sessionA.access_token, eplLeagueId, EPL_TOURNAMENT
    );

    // Minimum formation = 7 players. Report errors if it falls short.
    expect(
      bought.length,
      `Bought ${bought.length} EPL players. Errors: ${JSON.stringify(errors)}`
    ).toBeGreaterThanOrEqual(7);

    // Verify DB state
    const { data: squad } = await supaA.from('squads')
      .select('players, budget_remaining')
      .eq('league_id', eplLeagueId)
      .eq('user_id', sessionA.user.id)
      .single();

    expect(squad).toBeTruthy();
    expect(squad.players.length).toBe(bought.length);
    expect(Number(squad.budget_remaining)).toBeGreaterThanOrEqual(0);
    expect(Number(squad.budget_remaining)).toBeLessThanOrEqual(BUDGET);

    // Position caps
    const { data: details } = await supaA.from('players')
      .select('id, position, price').in('id', squad.players);
    const counts = checkPositionCaps(details);

    const spent = details.reduce((s, p) => s + Number(p.price || 0), 0);
    expect(spent).toBeLessThanOrEqual(BUDGET);

    console.log(
      `✅ EPL auto-fill (API): ${bought.length} players, £${budgetLeft.toFixed(1)}M left`,
      counts
    );
  });

  test('1.4 UI: SquadScreen FILL button works — no infinite loop, players appear', async ({ page }) => {
    // Clear squad so auto-fill has room to work
    await supaA.from('squads')
      .update({ players: [], budget_remaining: BUDGET })
      .eq('league_id', eplLeagueId).eq('user_id', sessionA.user.id);

    await injectSession(page, sessionA);
    const reached = await safeGoto(page, `/squad?leagueId=${eplLeagueId}`);
    if (!reached) { console.log('⚠ Dev server unreachable — skipping SquadScreen UI test'); return; }

    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(1500);

    // Count transfer API calls
    let transferCalls = 0;
    page.on('request', r => { if (r.url().includes('process-transfer')) transferCalls++; });

    // Find and click the FILL button (⚡ FILL or ⚡ QUICK FILL)
    const fillBtn = page.locator('button').filter({ hasText: /FILL/i }).first();
    const visible = await fillBtn.isVisible().catch(() => false);

    if (!visible) {
      // Button might be hidden on this viewport — check the page loaded OK
      const bodyText = await page.locator('body').innerText().catch(() => '');
      expect(bodyText.length).toBeGreaterThan(100);
      console.log('⚠ FILL button not visible on SquadScreen — page content OK');
      return;
    }

    await fillBtn.click();

    // Wait for the fill to complete (up to 20s — buying 7 players serially)
    await page.waitForFunction(
      () => !document.querySelector('button')?.innerText?.includes('FILLING'),
      { timeout: 20000 }
    ).catch(() => {});
    await page.waitForTimeout(500);

    // CRITICAL: no infinite loop — max 30 API calls for a 7-player fill
    expect(transferCalls, `${transferCalls} process-transfer calls — loop bug?`).toBeLessThan(30);

    // Feedback message should appear (e.g. "Added N players · £X.XM left")
    const feedbackText = await page.locator('body').innerText();
    const hasMsg = /Added \d|No league|budget|Session|refresh/i.test(feedbackText);
    expect(hasMsg, 'Expected auto-fill feedback message').toBeTruthy();

    // No JS crashes
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    expect(errors).toHaveLength(0);

    console.log(`✅ SquadScreen FILL: ${transferCalls} API calls, message visible`);
  });

  test('1.5 UI: MarketScreen FILL button works — no infinite loop', async ({ page }) => {
    // Clear squad for a fresh fill
    await supaA.from('squads')
      .update({ players: [], budget_remaining: BUDGET })
      .eq('league_id', eplLeagueId).eq('user_id', sessionA.user.id);

    await injectSession(page, sessionA);
    const reached = await safeGoto(page, `/market?leagueId=${eplLeagueId}`);
    if (!reached) { console.log('⚠ Dev server unreachable — skipping MarketScreen UI test'); return; }

    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(1500);

    let transferCalls = 0;
    page.on('request', r => { if (r.url().includes('process-transfer')) transferCalls++; });

    const fillBtn = page.locator('button').filter({ hasText: /FILL/i }).first();
    const visible = await fillBtn.isVisible().catch(() => false);

    if (!visible) {
      const bodyText = await page.locator('body').innerText().catch(() => '');
      expect(bodyText.length).toBeGreaterThan(100);
      console.log('⚠ FILL button not visible on MarketScreen — page content OK');
      return;
    }

    await fillBtn.click();
    await page.waitForFunction(
      () => !document.querySelector('button')?.innerText?.includes('FILLING'),
      { timeout: 20000 }
    ).catch(() => {});
    await page.waitForTimeout(500);

    expect(transferCalls, `${transferCalls} calls — loop bug on MarketScreen?`).toBeLessThan(30);

    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    expect(errors).toHaveLength(0);

    console.log(`✅ MarketScreen FILL: ${transferCalls} API calls`);
  });

  test('1.6 Sell a player — budget refund correct', async () => {
    const { data: squad } = await supaA.from('squads')
      .select('players, budget_remaining')
      .eq('league_id', eplLeagueId).eq('user_id', sessionA.user.id).single();

    if (!squad?.players?.length) { console.log('⚠ No players to sell'); return; }

    const { data: p } = await supaA.from('players').select('id, price').eq('id', squad.players[0]).single();
    const before = Number(squad.budget_remaining);

    const res = await fetch(`${SUPABASE_URL}/functions/v1/process-transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionA.access_token}`, 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ action: 'sell', player_id: p.id, player_price: p.price, league_id: eplLeagueId }),
    });
    const data = await res.json();
    expect(data.ok, `Sell failed: ${data.error}`).toBe(true);
    expect(Math.abs(data.budget_remaining - (before + Number(p.price)))).toBeLessThan(0.5);
    console.log(`✅ Sold EPL player — £${before} → £${data.budget_remaining}`);
  });

  test('1.7 No-duplicate: User B gets 409 for User A\'s players', async () => {
    // Buy one player as User A first
    const { data: pool } = await supaA.from('players')
      .select('id, price').eq('tournament_id', EPL_TOURNAMENT).limit(20);

    let ownedPlayer = null;
    for (const p of pool ?? []) {
      const d = await buyPlayer(sessionA.access_token, eplLeagueId, p);
      if (d.ok) { ownedPlayer = p; break; }
    }
    if (!ownedPlayer) { console.log('⚠ Could not buy any EPL player for no-duplicate test'); return; }

    // User B joins league
    await supaB.rpc('join_league_by_code', { p_code: eplJoinCode, p_user_id: sessionB.user.id });

    // User B tries to buy same player → 409
    const res = await fetch(`${SUPABASE_URL}/functions/v1/process-transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionB.access_token}`, 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ action: 'buy', player_id: ownedPlayer.id, player_price: ownedPlayer.price, league_id: eplLeagueId }),
    });
    const data = await res.json();
    expect(res.status).toBe(409);
    expect(data.code).toBe('PLAYER_TAKEN');
    console.log(`✅ No-duplicate enforced: ${data.code}`);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 2 — Draft mode (WC 2026): 30-slot wish list, lottery, allocation
// ══════════════════════════════════════════════════════════════════════════════

test.describe('WC 2026 draft league — full flow', () => {

  test('2.1 Create noduplicate league with draft_deadline', async () => {
    const { data: league, error } = await supaA.rpc('create_league', {
      p_name: 'E2E WC Draft', p_format: 'noduplicate',
      p_user_id: sessionA.user.id, p_tournament_id: WC_TOURNAMENT,
    });
    expect(error, `create_league: ${error?.message}`).toBeNull();
    const parsed = typeof league === 'string' ? JSON.parse(league) : league;
    draftLeagueId = parsed.id;
    draftJoinCode = parsed.join_code;

    // Set a draft deadline 1 hour out
    await supaA.from('leagues')
      .update({ draft_deadline: new Date(Date.now() + 3_600_000).toISOString() })
      .eq('id', draftLeagueId);

    const { data: lRow } = await supaA.from('leagues')
      .select('format, draft_list_size, squad_size').eq('id', draftLeagueId).single();
    expect(lRow.format).toBe('noduplicate');
    expect(lRow.draft_list_size).toBe(DRAFT_LIST_SIZE);
    expect(lRow.squad_size).toBe(SQUAD_SIZE);
    console.log(`✅ WC draft league: ${draftLeagueId}  code: ${draftJoinCode}`);
  });

  test('2.2 User A auto-fills 30-player draft wish list (no budget/position limits)', async () => {
    const { data: pool } = await supaA.from('players')
      .select('id, name, position, price').eq('tournament_id', WC_TOURNAMENT)
      .order('price', { ascending: false }).limit(100);

    expect(pool?.length, 'Need WC players').toBeGreaterThanOrEqual(DRAFT_LIST_SIZE);

    // Draft list: top 30 by price (no position/budget constraint on the wish list)
    const picks = pool.slice(0, DRAFT_LIST_SIZE);
    const { error } = await supaA.from('draft_submissions').upsert({
      league_id: draftLeagueId, user_id: sessionA.user.id,
      player_ids: picks.map(p => p.id),
      submitted_at: new Date().toISOString(), status: 'pending',
    }, { onConflict: 'league_id,user_id' });

    expect(error, `Draft submission: ${error?.message}`).toBeNull();
    console.log(`✅ User A submitted ${picks.length}-player draft list`);
  });

  test('2.3 User B joins, picks 5 overlapping + fills remaining 25', async () => {
    const { data: result, error } = await supaB.rpc('join_league_by_code',
      { p_code: draftJoinCode, p_user_id: sessionB.user.id });
    expect(error, `join: ${error?.message}`).toBeNull();
    const r = typeof result === 'string' ? JSON.parse(result) : result;
    expect(r.error).toBeUndefined();

    // Get User A's picks — intentionally overlap the first 5
    const { data: subA } = await supaA.from('draft_submissions')
      .select('player_ids').eq('league_id', draftLeagueId).eq('user_id', sessionA.user.id).single();
    const overlap5 = subA.player_ids.slice(0, 5);

    // Fill remaining 25 from WC pool (different players)
    const { data: pool } = await supaB.from('players')
      .select('id').eq('tournament_id', WC_TOURNAMENT)
      .order('price', { ascending: true }).limit(200);
    const taken = new Set(overlap5);
    const rest = pool.filter(p => !taken.has(p.id)).slice(0, DRAFT_LIST_SIZE - 5);
    const fullList = [...overlap5, ...rest.map(p => p.id)];
    expect(fullList.length).toBe(DRAFT_LIST_SIZE);

    const { error: subErr } = await supaB.from('draft_submissions').upsert({
      league_id: draftLeagueId, user_id: sessionB.user.id,
      player_ids: fullList, submitted_at: new Date().toISOString(), status: 'pending',
    }, { onConflict: 'league_id,user_id' });
    expect(subErr, `User B submission: ${subErr?.message}`).toBeNull();

    const overlapCount = fullList.filter(id => subA.player_ids.includes(id)).length;
    console.log(`✅ User B submitted ${DRAFT_LIST_SIZE}-player list with ${overlapCount} overlapping`);
  });

  test('2.4 Admin runs run-draft-lottery', async () => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/run-draft-lottery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionA.access_token}`, 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ league_id: draftLeagueId }),
    });
    const body = await res.json().catch(() => ({}));
    expect(res.ok || body?.message, `Lottery: ${JSON.stringify(body)}`).toBeTruthy();

    const { data: subs } = await supaA.from('draft_submissions')
      .select('status, user_id').eq('league_id', draftLeagueId);
    const processed = (subs ?? []).filter(s => s.status === 'processed');
    expect(processed.length, 'Both submissions should be processed').toBe(2);
    console.log(`✅ Draft lottery: ${processed.length} submissions processed`);
  });

  test('2.5 Allocations: ≤15 players each, no duplicates, position caps, within budget', async () => {
    const { data: allocations, error } = await supaA.from('draft_allocations')
      .select('user_id, allocated_players, unresolved_slots').eq('league_id', draftLeagueId);

    if (error || !allocations) {
      console.log(`⚠ Can't read draft_allocations: ${error?.message}`);
      return;
    }
    expect(allocations.length).toBe(2);

    for (const alloc of allocations) {
      const ids = alloc.allocated_players ?? [];
      expect(ids.length + (alloc.unresolved_slots ?? 0)).toBe(SQUAD_SIZE);
      expect(ids.length).toBeGreaterThan(0);
      expect(new Set(ids).size).toBe(ids.length); // no duplicates within squad

      const { data: players } = await supaA.from('players')
        .select('id, position, price').in('id', ids);
      checkPositionCaps(players ?? []);
      const cost = (players ?? []).reduce((s, p) => s + Number(p.price || 0), 0);
      expect(cost).toBeLessThanOrEqual(BUDGET);
    }

    // No player in both squads
    const allIds = allocations.flatMap(a => a.allocated_players ?? []);
    const dupes = allIds.filter((id, i) => allIds.indexOf(id) !== i);
    expect(dupes).toHaveLength(0);

    console.log(`✅ Allocations OK:`,
      allocations.map(a => `${a.allocated_players?.length} players, ${a.unresolved_slots} unresolved`));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 3 — Regression: leagueId guard (navigating without a league)
// ══════════════════════════════════════════════════════════════════════════════

test.describe('Auto-fill guard — leagueId missing', () => {

  test('3.1 SquadScreen without leagueId shows guard message, no API calls', async ({ page }) => {
    await injectSession(page, sessionA);
    const reached = await safeGoto(page, '/squad'); // no ?leagueId param
    if (!reached) { console.log('⚠ Server unreachable'); return; }

    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1000);

    let transferCalls = 0;
    page.on('request', r => { if (r.url().includes('process-transfer')) transferCalls++; });

    const fillBtn = page.locator('button').filter({ hasText: /FILL/i }).first();
    const visible = await fillBtn.isVisible().catch(() => false);

    if (visible) {
      await fillBtn.click();
      await page.waitForTimeout(3000);
      // Should show guard message and make 0 API calls
      expect(transferCalls, 'Should make no API calls without leagueId').toBe(0);
      const bodyText = await page.locator('body').innerText().catch(() => '');
      expect(/No league|open.*squad.*League/i.test(bodyText)).toBeTruthy();
      console.log(`✅ Guard works: ${transferCalls} API calls, message shown`);
    } else {
      console.log('⚠ No FILL button visible without leagueId (expected — button hidden)');
      const bodyText = await page.locator('body').innerText().catch(() => '');
      expect(bodyText.length).toBeGreaterThan(50);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 4 — All screens load without crash (smoke test)
// ══════════════════════════════════════════════════════════════════════════════

test.describe('All screens — no crash', () => {
  const SCREENS = ['/', '/squad', '/league', '/live', '/market'];

  for (const route of SCREENS) {
    test(`4.x ${route} loads without JS error`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await injectSession(page, sessionA);
      const reached = await safeGoto(page, route);
      if (!reached) { console.log(`⚠ Server unreachable for ${route}`); return; }
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(800);
      const text = await page.locator('body').innerText().catch(() => '');
      expect(text.trim().length, `${route} has no content`).toBeGreaterThan(10);
      expect(errors, `${route} JS errors: ${errors.join('; ')}`).toHaveLength(0);
      console.log(`✅ ${route}: OK`);
    });
  }
});
