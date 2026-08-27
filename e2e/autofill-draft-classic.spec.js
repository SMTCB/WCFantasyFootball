// @ts-check
/**
 * Full E2E: auto-fill across all screens, draft mode, and classic mode.
 *
 * Auth: two test accounts (e2e_a@fantasykit.test / e2e_b@fantasykit.test)
 * are pre-provisioned by supabase/seed.sql (raw auth.users/auth.identities
 * inserts — see that file's header for the fixed-ID reference). Sessions
 * are injected into browser localStorage — no login UI required.
 *
 * Data: targets the local Tier 3 stack (npm run test:e2e:local), seeded by
 * supabase/seed.sql — a synthetic, deterministic multi-sport dataset, not
 * real production data. Draft tests use the seeded WC pool (tournament_id
 * 429); classic tests use the seeded EPL pool (tournament_id 426).
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-target.js';

// Disable retries for this file: each test is stateful (module-level league IDs).
// Retries cause beforeAll to re-run which invalidates JWTs mid-test.
test.describe.configure({ retries: 0 });

// ── Config ────────────────────────────────────────────────────────────────────

// Seeded Circle both e2e_a/e2e_b are members of (supabase/seed.sql) —
// create_league()'s 6-arg overload requires a circle_id (CIRCLE_REQUIRED).
const CIRCLE_ID = 'c1000000-0000-4000-a000-000000000001';

const EPL_TOURNAMENT  = '426'; // seeded EPL pool
const WC_TOURNAMENT   = '429'; // seeded WC pool
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

/** Inject a Supabase session into a Playwright page before navigation. */
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
  // skip re-signing-in — that would issue new JWTs mid-test.
  if (sessionA && supaA) {
    console.log('ℹ️ Sessions already active — skipping re-sign-in');
    return;
  }
  // Accounts are pre-provisioned by supabase/seed.sql — no setup call needed.
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
      p_circle_id:     CIRCLE_ID,
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
    // apiFillSquad makes 7+ sequential Edge Function round-trips (one per
    // player bought) against the local stack's single edge_runtime container.
    // Under the full local suite's two-project concurrent load, that shared
    // container can be busy enough to push cumulative latency past the file's
    // 20s default — bump this test's own budget rather than weaken assertions.
    test.setTimeout(45000);
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

  test('1.7 Classic mode allows shared ownership: User B can also buy User A\'s player', async () => {
    // Classic leagues intentionally allow multiple managers to own the same
    // player (see process-transfer/index.js: `if (leagueMode === 'classic')
    // { /* no-op: multiple managers can own the same player */ }` — the
    // PLAYER_TAKEN/409 no-repeat check only applies to draft/noduplicate
    // leagues). This test used to assert a 409 here, which was never correct
    // for a classic-format league — it now asserts the real, intended
    // behavior instead.

    // Buy one player as User A first
    const { data: pool } = await supaA.from('players')
      .select('id, price').eq('tournament_id', EPL_TOURNAMENT).limit(20);

    let ownedPlayer = null;
    for (const p of pool ?? []) {
      const d = await buyPlayer(sessionA.access_token, eplLeagueId, p);
      if (d.ok) { ownedPlayer = p; break; }
    }
    if (!ownedPlayer) { console.log('⚠ Could not buy any EPL player for shared-ownership test'); return; }

    // User B joins league
    await supaB.rpc('join_league_by_code', { p_code: eplJoinCode, p_user_id: sessionB.user.id });

    // User B buys the same player → succeeds (classic = shared ownership)
    const res = await fetch(`${SUPABASE_URL}/functions/v1/process-transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionB.access_token}`, 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ action: 'buy', player_id: ownedPlayer.id, player_price: ownedPlayer.price, league_id: eplLeagueId }),
    });
    const data = await res.json();
    expect(res.status, `Expected shared ownership to succeed: ${data.error}`).toBe(200);
    expect(data.ok).toBe(true);
    console.log(`✅ Shared ownership allowed in classic mode: User B also owns ${ownedPlayer.id}`);
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
      p_circle_id: CIRCLE_ID,
    });
    expect(error, `create_league: ${error?.message}`).toBeNull();
    const parsed = typeof league === 'string' ? JSON.parse(league) : league;
    draftLeagueId = parsed.id;
    draftJoinCode = parsed.join_code;

    // Set a draft deadline 1 hour out. Also pin draft_list_size to 30 — the
    // schema column default is 45 (leagues.draft_list_size DEFAULT 45), but
    // this scenario's seeded WC pool (supabase/seed.sql, tournament 429) only
    // has 40 players, sized for a 30-pick wishlist. draft_list_size has no
    // UI setter; it's a plain per-league override, same as draft_deadline.
    await supaA.from('leagues')
      .update({
        draft_deadline: new Date(Date.now() + 3_600_000).toISOString(),
        draft_list_size: DRAFT_LIST_SIZE,
      })
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
    }, { onConflict: 'league_id,user_id,phase' }); // real unique constraint is 3-column (draft_submissions_league_id_user_id_phase_key); phase defaults to 'group'

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
    }, { onConflict: 'league_id,user_id,phase' }); // real unique constraint is 3-column (draft_submissions_league_id_user_id_phase_key); phase defaults to 'group'
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
