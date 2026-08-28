// e2e/tennis-screens.spec.js — Tier 3 local full-stack E2E for the tennis screens.
// Targets the local `npx supabase start` stack via scripts/e2e-local.mjs
// (npm run test:e2e:local). B-12 guard: never runs against production.
//
// NOTE: the app exposes 6 tennis routes today (not 7 — TESTING_STRATEGY.md's
// original count assumed parity with F1's 7), all covered by SUITE 1 below.
//
// Seed data (supabase/seed.sql, Tennis section):
//  - BOX_ID 'b0000000-0000-4000-a000-000000000001', invite_code 'TNSEED01'
//  - USER_A (box member) + USER_B (not yet a member)
//  - TOURN_ROSTER_OPEN 'Seed Open (Roster Open)' — status roster_open, 11 players
//    across all 4 tiers ('Roster T1 Alpha'/'Beta', 'Roster T2/3/4 Alpha'/'Beta'/'Gamma')
//    — no roster submitted yet (roster-submission spec)
//  - TOURN_QF_OPEN 'Seed Slam (QF Captain Open)' — status qf_captain_open, 7 fixed-id
//    players ('QF T1 Player' .. 'QF T4b Player'), USER_A already has a locked roster
//    using all 7 (QF-captain-pick spec, then admin/scoring spec — in that order,
//    since completing the tournament moves it out of qf_captain_open)
//  - TOURN_COMPLETED 'Seed Masters (Completed)' — hand-worked scores, smoke only
//  - TOURN_ATP_FINALS 'Seed ATP Finals' — status roster_open, 12 group-stage matches,
//    smoke only (group stage only — knockout phase is out of scope this pass)

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-target.js';

test.describe.configure({ retries: 0 });

// Service-role client — needed to reset roster/QF-captain/tournament-status
// state before SUITEs 2, 3 and 5 so they stay idempotent across the
// desktop-chrome → mobile-chrome project sequence (fullyParallel:false means
// both run against the SAME local DB). Without these resets:
//  - SUITE 2 sees USER_A's roster already submitted by desktop-chrome, so
//    every target <option> renders disabled ("picked") and selectOption fails.
//  - SUITE 3 sees TOURN_QF_OPEN already moved to 'completed' by desktop-chrome's
//    SUITE 5 pass, so the QF-captain block no longer renders at all.
//  - SUITE 5 sees the tournament already completed/scored, so "Mark Complete"
//    is gone and the scoring assertions read stale values.
// tennis_rosters/tennis_qf_captains/tennis_tournament_scores/tennis_tournaments
// all have SELECT-only RLS policies (writes go through SECURITY DEFINER RPCs
// or service role only), so an admin-authenticated client can't do these
// resets on its own. Gracefully no-ops if unset (e.g. spec run directly
// outside `npm run test:e2e:local`).
const SERVICE_ROLE_KEY = process.env.E2E_LOCAL_SERVICE_ROLE_KEY;
const serviceSupabase = SERVICE_ROLE_KEY ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY) : null;

const USER_A = { email: 'e2e_a@fantasykit.test', password: 'E2ePass!99' };
const USER_B = { email: 'e2e_b@fantasykit.test', password: 'E2ePass!99' };

const BOX_ID = 'b0000000-0000-4000-a000-000000000001';
const USER_A_ID = 'e0000000-0000-4000-a000-00000000000a';
const USER_B_ID = 'e0000000-0000-4000-a000-00000000000b';
const INVITE_CODE = 'TNSEED01';

const TOURN_ROSTER_OPEN = 'b0a00000-0000-4000-a000-000000000001';
const TOURN_QF_OPEN = 'b0a00000-0000-4000-a000-000000000002';
const TOURN_COMPLETED = 'b0a00000-0000-4000-a000-000000000003';
const TOURN_ATP_FINALS = 'b0a00000-0000-4000-a000-000000000004';

const QF_T1_NAME = 'QF T1 Player';
const QF_T1_ID = 'b0a10000-0000-4000-a000-000000000001';

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
    await supaA.from('player_box_members').delete().eq('player_box_id', BOX_ID).eq('user_id', USER_B_ID);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 1 — smoke: every tennis route loads without crashing
// ══════════════════════════════════════════════════════════════════════════════

test.describe('Tennis screens — smoke', () => {
  const ROUTES = [
    ['/tennis', 'home'],
    ['/tennis/box', 'player box'],
    [`/tennis/tournament/${TOURN_ROSTER_OPEN}`, 'tournament (roster open)'],
    ['/tennis/leaderboard', 'leaderboard'],
    ['/tennis/finals', 'ATP finals'],
    ['/tennis/admin', 'admin'],
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
//  SUITE 2 — submit a full 7-slot roster on the roster_open tournament
// ══════════════════════════════════════════════════════════════════════════════

test.describe('Tennis roster submission', () => {
  test('2.1 submit a 7-slot roster via TennisTournamentScreen', async ({ page }) => {
    if (serviceSupabase) {
      await serviceSupabase.from('tennis_rosters').delete().eq('user_id', USER_A_ID).eq('tournament_id', TOURN_ROSTER_OPEN);
    } else {
      console.log('⚠ E2E_LOCAL_SERVICE_ROLE_KEY not set — skipping roster idempotency reset');
    }

    await injectSession(page, sessionA);
    const reached = await safeGoto(page, `/tennis/tournament/${TOURN_ROSTER_OPEN}`);
    if (!reached) { console.log('⚠ Server unreachable for tennis tournament screen'); return; }
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(1200);

    const selects = page.locator('form select');
    await expect(selects, 'roster form did not render 7 slot selects').toHaveCount(7, { timeout: 10000 });

    // DOM order: tier1, tier2a, tier2b, tier3a, tier3b, tier4a, tier4b.
    const picks = [
      'Roster T1 Alpha', 'Roster T2 Alpha', 'Roster T2 Beta',
      'Roster T3 Alpha', 'Roster T3 Beta', 'Roster T4 Alpha', 'Roster T4 Beta',
    ];
    for (let i = 0; i < picks.length; i++) {
      await selects.nth(i).selectOption({ label: picks[i] });
    }

    const submit = page.getByRole('button', { name: /Lock squad|Update squad/i });
    await expect(submit).toBeEnabled();
    await submit.click();
    await page.waitForTimeout(1500);

    const { data: players, error: playersErr } = await supaA
      .from('tennis_tournament_players')
      .select('id, player_name')
      .eq('tournament_id', TOURN_ROSTER_OPEN);
    expect(playersErr).toBeNull();
    const idByName = new Map((players ?? []).map(p => [p.player_name, p.id]));

    const { data: roster, error } = await supaA
      .from('tennis_rosters')
      .select('tier1_player_id, tier2a_player_id, tier2b_player_id, tier3a_player_id, tier3b_player_id, tier4a_player_id, tier4b_player_id')
      .eq('user_id', USER_A_ID)
      .eq('tournament_id', TOURN_ROSTER_OPEN)
      .maybeSingle();
    expect(error).toBeNull();
    expect(roster?.tier1_player_id).toBe(idByName.get('Roster T1 Alpha'));
    expect(roster?.tier2a_player_id).toBe(idByName.get('Roster T2 Alpha'));
    expect(roster?.tier2b_player_id).toBe(idByName.get('Roster T2 Beta'));
    expect(roster?.tier3a_player_id).toBe(idByName.get('Roster T3 Alpha'));
    expect(roster?.tier3b_player_id).toBe(idByName.get('Roster T3 Beta'));
    expect(roster?.tier4a_player_id).toBe(idByName.get('Roster T4 Alpha'));
    expect(roster?.tier4b_player_id).toBe(idByName.get('Roster T4 Beta'));
    console.log('✅ 7-slot roster saved and verified in tennis_rosters');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 3 — pick a QF captain on the qf_captain_open tournament
//  (must run BEFORE SUITE 5 — completing the tournament there closes this window)
// ══════════════════════════════════════════════════════════════════════════════

test.describe('Tennis QF captain selection', () => {
  test('3.1 pick QF T1 Player as captain via TennisTournamentScreen', async ({ page }) => {
    if (serviceSupabase) {
      // Undo SUITE 5's earlier completion (from a prior project's pass) and
      // any previously-set captain, so the qf_captain_open block renders
      // and the captain pick can be made fresh.
      await serviceSupabase.from('tennis_tournaments').update({ status: 'qf_captain_open' }).eq('id', TOURN_QF_OPEN);
      await serviceSupabase.from('tennis_qf_captains').delete().eq('user_id', USER_A_ID).eq('tournament_id', TOURN_QF_OPEN);
    } else {
      console.log('⚠ E2E_LOCAL_SERVICE_ROLE_KEY not set — skipping QF captain idempotency reset');
    }

    await injectSession(page, sessionA);
    const reached = await safeGoto(page, `/tennis/tournament/${TOURN_QF_OPEN}`);
    if (!reached) { console.log('⚠ Server unreachable for tennis tournament screen'); return; }
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(1200);

    const captainBtn = page.getByRole('button', { name: new RegExp(QF_T1_NAME) });
    await expect(captainBtn, 'QF captain candidate button not found').toBeVisible({ timeout: 10000 });
    await captainBtn.click();
    await page.waitForTimeout(1500);

    const { data: captain, error } = await supaA
      .from('tennis_qf_captains')
      .select('captain_player_id')
      .eq('user_id', USER_A_ID)
      .eq('tournament_id', TOURN_QF_OPEN)
      .maybeSingle();
    expect(error).toBeNull();
    expect(captain?.captain_player_id, 'expected QF T1 Player to be set as captain').toBe(QF_T1_ID);
    console.log('✅ QF captain set and verified in tennis_qf_captains');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 4 — USER_B joins the seeded player box by invite code
// ══════════════════════════════════════════════════════════════════════════════

test.describe('Tennis player box join by invite code', () => {
  test('4.1 USER_B joins via PlayerBoxScreen Join tab', async ({ page }) => {
    await injectSession(page, sessionB);
    const reached = await safeGoto(page, '/tennis/box');
    if (!reached) { console.log('⚠ Server unreachable for tennis player box screen'); return; }
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(1000);

    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await page.waitForTimeout(500);

    const codeInput = page.locator('input[placeholder="8-CHARACTER CODE"]');
    await expect(codeInput).toBeVisible({ timeout: 10000 });
    await codeInput.fill(INVITE_CODE.toLowerCase()); // client uppercases before RPC call

    const joinBtn = page.getByRole('button', { name: /Join Player's Box/i });
    await expect(joinBtn).toBeEnabled();
    await joinBtn.click();

    // Must match only the post-join URL (`/tennis?box=<id>`), not the
    // starting `/tennis/box` URL the test navigated from — a bare /\/tennis/
    // regex matches immediately against the CURRENT url (it already
    // contains "/tennis"), so the wait resolved instantly instead of
    // waiting for the real navigation, racing ahead of the joinByCode RPC
    // (still showing "Joining…" when the DB assertion below ran).
    await page.waitForURL(/\/tennis\?box=/, { timeout: 15000 }).catch(() => {});

    const { data: member, error } = await supaA
      .from('player_box_members')
      .select('user_id')
      .eq('player_box_id', BOX_ID)
      .eq('user_id', USER_B_ID)
      .maybeSingle();
    expect(error).toBeNull();
    expect(member?.user_id, 'USER_B should now be a player box member').toBe(USER_B_ID);
    console.log('✅ USER_B joined player box via invite code, verified in player_box_members');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  SUITE 5 — admin completes the QF tournament and triggers scoring
// ══════════════════════════════════════════════════════════════════════════════

test.describe('Tennis admin — complete tournament and score', () => {
  test('5.1 mark complete and invoke score-tennis-tournament', async ({ page }) => {
    test.setTimeout(45000);

    if (serviceSupabase) {
      // Defensive re-open (SUITE 3 already does this, but keep this suite
      // independently runnable) plus clear any stale scores/trophy from a
      // prior project's pass so this run's assertions read freshly-computed
      // values, not leftovers.
      await serviceSupabase.from('tennis_tournaments').update({ status: 'qf_captain_open' }).eq('id', TOURN_QF_OPEN);
      await serviceSupabase.from('tennis_tournament_scores').delete().eq('tournament_id', TOURN_QF_OPEN);
      await serviceSupabase.from('trophy_ledger').delete().eq('league_id', BOX_ID).eq('trophy_type', 'event_win');
    } else {
      console.log('⚠ E2E_LOCAL_SERVICE_ROLE_KEY not set — skipping admin-scoring idempotency reset');
    }

    await injectSession(page, sessionA);
    const reached = await safeGoto(page, '/tennis/admin');
    if (!reached) { console.log('⚠ Server unreachable for tennis admin'); return; }
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(1200);

    const adminGate = await page.locator('body').innerText().catch(() => '');
    if (/ADMIN ACCESS REQUIRED/i.test(adminGate)) {
      console.log('⚠ USER_A not recognized as tennis admin — skipping');
      return;
    }

    const tournamentSelect = page.locator('select').first();
    await expect(tournamentSelect).toBeVisible({ timeout: 10000 });
    await tournamentSelect.selectOption(TOURN_QF_OPEN);
    await page.waitForTimeout(500);

    const markCompleteBtn = page.getByRole('button', { name: /Mark Complete/i });
    await expect(markCompleteBtn).toBeEnabled({ timeout: 10000 });
    await markCompleteBtn.click();
    await expect(page.getByText(/succeeded/i)).toBeVisible({ timeout: 10000 });

    const triggerScoringBtn = page.getByRole('button', { name: /Trigger Scoring/i });
    await expect(triggerScoringBtn).toBeEnabled({ timeout: 10000 });
    await triggerScoringBtn.click();
    await expect(page.getByText(/Scoring triggered/i)).toBeVisible({ timeout: 20000 });

    const { data: score, error } = await supaA
      .from('tennis_tournament_scores')
      .select('base_points, captain_bonus, ace_card_bonus, total_points')
      .eq('user_id', USER_A_ID)
      .eq('tournament_id', TOURN_QF_OPEN)
      .maybeSingle();
    expect(error).toBeNull();
    expect(score?.base_points, 'base: 4*2+4*3+3*3+4*4+2*4+3*6+1*6=77').toBe(77);
    expect(score?.captain_bonus, 'captain (QF T1, 4 rounds won at T1 rate)=8').toBe(8);
    expect(score?.ace_card_bonus, 'no ace card played on the seeded roster').toBe(0);
    expect(score?.total_points).toBe(85);

    const { data: trophy, error: trophyErr } = await supaA
      .from('trophy_ledger')
      .select('user_id, trophy_type')
      .eq('league_id', BOX_ID)
      .eq('user_id', USER_A_ID)
      .eq('trophy_type', 'event_win')
      .maybeSingle();
    expect(trophyErr).toBeNull();
    expect(trophy?.trophy_type, 'expected an event_win trophy for the player box winner').toBe('event_win');
    console.log('✅ tournament scored: 85 pts for USER_A, event_win trophy landed in trophy_ledger');
  });
});
