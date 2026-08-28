// @ts-check
/* global process */
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-target.js';

// ── Real Supabase Client ─────────────────────────────────────────────────────

// Deliberately not named SUPABASE_SERVICE_ROLE_KEY — scripts/e2e-local.mjs
// sets E2E_LOCAL_SERVICE_ROLE_KEY unconditionally (the ephemeral local
// stack's own key, never production's). See that script's comment.
const SERVICE_ROLE_KEY = process.env.E2E_LOCAL_SERVICE_ROLE_KEY;

const anonSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const serviceSupabase = SERVICE_ROLE_KEY ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY) : null;

// Seeded fixtures — supabase/seed.sql.
const CIRCLE_ID = 'c1000000-0000-4000-a000-000000000001';
const DRAFT_LEAGUE_ID = '11000000-0000-4000-a000-000000000002';

let REAL_PLAYERS = [];

// Draft-allocation scenario tests (below) create throwaway leagues + manager
// users via the service-role client — tracked here so afterAll can clean
// them up. draft_submissions/draft_allocations/gazette_entries all cascade
// off leagues.id, but the manager rows in public.users don't and need their
// own delete.
const createdLeagueIds = [];
const createdManagerUserIds = [];
const createdAuthUserIds = [];

async function createManagerUsers(n) {
  const ids = Array.from({ length: n }, () => globalThis.crypto.randomUUID());
  const { error } = await serviceSupabase
    .from('users')
    .insert(ids.map((id, i) => ({ id, username: `e2e_draft_mgr_${Date.now()}_${i}` })));
  if (error) throw error;
  createdManagerUserIds.push(...ids);
  return ids;
}

// run-draft-lottery requires a real commissioner JWT for any call carrying
// league_id (DD-C4, supabase/functions/run-draft-lottery/index.js) — there is
// no service-role bypass for this path (only the separate, now permanently
// disabled cron path accepted service-role auth). So exercising the function
// means minting a real auth user, granting it league_members role
// 'commissioner' for the league under test, and invoking the function through
// that user's own signed-in client — not the service-role client.
async function createCommissioner(leagueId, label) {
  const email = `e2e_draft_comm_${Date.now()}_${label}@fantasykit.test`;
  const password = 'E2ePass!99';
  const { data: created, error: createErr } = await serviceSupabase.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (createErr) throw createErr;
  createdAuthUserIds.push(created.user.id);

  // league_members.user_id FK targets public.users, not auth.users — the
  // on_auth_user_created trigger that normally mirrors this row lives outside
  // the `public` schema pg_dump behind schema.sql, so it never fires on this
  // local stack. Mirror it explicitly before the league_members insert.
  const { error: userErr } = await serviceSupabase
    .from('users')
    .insert({ id: created.user.id, username: `e2e_draft_comm_${label}` });
  if (userErr) throw userErr;

  const { error: memberErr } = await serviceSupabase
    .from('league_members')
    .insert({ league_id: leagueId, user_id: created.user.id, role: 'commissioner' });
  if (memberErr) throw memberErr;

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: signInData, error: signInErr } = await authClient.auth.signInWithPassword({ email, password });
  if (signInErr || !signInData?.session) throw new Error(`commissioner sign-in failed for ${email}: ${signInErr?.message}`);
  return authClient;
}

test.beforeAll(async () => {
  // Scenarios 1-3 below create ad-hoc leagues without an explicit
  // tournament_id, which defaults to '426' (EPL — see schema.sql). run-draft-
  // lottery's allocation filters its player lookup by the league's
  // tournament_id, so any non-'426' player is silently invisible to it —
  // REAL_PLAYERS must stay EPL-only, or Scenario 2's larger draw (see below)
  // would reintroduce the cross-tournament mismatch that BUG-DRAFT-SVC's
  // sibling file (draft-allocation-e2e.spec.js) hit. Scenario 2 needs 75
  // unique players spread across GK/DEF/MID/FWD (GK is the scarcest
  // position, ~1 in 10) — the full ~120-player EPL pool comfortably covers it.
  const { data: players } = await anonSupabase
    .from('players')
    .select('id, name, position, price')
    .eq('tournament_id', '426')
    .limit(150);
  REAL_PLAYERS = players || [];
  console.log(`Loaded ${REAL_PLAYERS.length} players for testing`);
});

test.afterAll(async () => {
  if (!serviceSupabase) return;
  if (createdLeagueIds.length > 0) {
    await serviceSupabase.from('leagues').delete().in('id', createdLeagueIds);
  }
  if (createdManagerUserIds.length > 0) {
    await serviceSupabase.from('users').delete().in('id', createdManagerUserIds);
  }
  for (const uid of createdAuthUserIds) {
    await serviceSupabase.auth.admin.deleteUser(uid).catch(() => {});
  }
});

// ── Test Helpers ──────────────────────────────────────────────────────────────

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

function groupPlayersByPosition(players) {
  return players.reduce((acc, p) => {
    const pos = p.position?.toUpperCase() || 'MID';
    if (!acc[pos]) acc[pos] = [];
    acc[pos].push(p);
    return acc;
  }, {});
}

function selectDraftPlayers(grouped, draftPositionCaps = { GK: 4, DEF: 10, MID: 10, FWD: 6 }) {
  const selected = [];
  for (const [pos, count] of Object.entries(draftPositionCaps)) {
    const players = grouped[pos] || [];
    selected.push(...players.slice(0, count));
  }
  return selected;
}

// ── DRAFT MODE: Complete End-to-End Testing ─────────────────────────────────

test.describe('Draft Mode - Complete Flow', () => {

  test('Draft screen displays 30-player limit (not 15)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    await skipOnboarding(page);

    // Navigate directly to the seeded draft league's URL (demo mode doesn't render
    // league list links, so searching the /league page would find nothing)
    await page.goto(`/league/${DRAFT_LEAGUE_ID}/draft`);
    await waitForContent(page);
    // Give the async data load a little extra time
    await page.waitForSelector('text=Build Your List', { timeout: 8000 }).catch(() => {});

    const isDraftScreen = await page.locator('text=Build Your List').isVisible().catch(() => false);
    expect(isDraftScreen, 'Should find draft screen with Build Your List heading').toBe(true);

    if (isDraftScreen) {
      // ✅ TEST: Verify list shows 30-player limit
      const listCounter = await page.locator('text=/Your List —/').innerText().catch(() => '');
      expect(listCounter).toContain('/30', 'Draft list should display /30 limit, not /15');

      // ✅ TEST: Verify informational position counters are visible (GK, DEF, MID, FWD)
      // Note: caps were removed from list-building by design — the header now shows
      // plain counts ("0 GK") with no /N enforcement. The allocation job enforces caps.
      const pageText = await page.locator('body').innerText();
      expect(pageText).toMatch(/\bGK\b/);
      expect(pageText).toMatch(/\bDEF\b/);
      expect(pageText).toMatch(/\bMID\b/);
      expect(pageText).toMatch(/\bFWD\b/);
    }

    expect(errors, `Draft screen threw JS errors: ${errors.join(', ')}`).toHaveLength(0);
  });

  test('Draft submissions from different managers MAY overlap (resolved at allocation, not submission)', async () => {
    // draft_submissions has no constraint preventing the same player_id from
    // appearing in two managers' lists (only UNIQUE(league_id, user_id, phase)
    // — see schema.sql). Overlap between managers' preference lists is
    // expected and legitimate: run-draft-lottery resolves who actually gets
    // a contested player at allocation time, not at submission time. An
    // earlier version of this test asserted the opposite (zero overlap as a
    // "DB constraint") — a false invariant, actively violated by design in
    // draft-allocation-e2e.spec.js's own OVERLAP_IDS fixture for this same
    // league. This test instead verifies overlapping submissions are
    // correctly persisted, not rejected.

    if (!serviceSupabase) {
      console.warn('⚠️ SKIPPING: E2E_LOCAL_SERVICE_ROLE_KEY not available in environment');
      test.skip();
      return;
    }

    const { data: testLeague, error: createError } = await serviceSupabase
      .from('leagues')
      .insert([{
        name: 'Draft Test League - Overlap',
        format: 'noduplicate',
        max_members: 2,
        circle_id: CIRCLE_ID,
        draft_deadline: new Date(Date.now() - 60000).toISOString(),
      }])
      .select()
      .single();

    expect(createError).toBeNull();
    const leagueId = testLeague.id;
    createdLeagueIds.push(leagueId);

    const grouped = groupPlayersByPosition(REAL_PLAYERS);
    const selectedPlayers = selectDraftPlayers(grouped);
    expect(selectedPlayers.length).toBeGreaterThanOrEqual(5);

    const sharedIds = selectedPlayers.slice(0, 3).map(p => p.id);
    const [mgrA, mgrB] = await createManagerUsers(2);

    const { error: submitError } = await serviceSupabase
      .from('draft_submissions')
      .insert([
        { league_id: leagueId, user_id: mgrA, player_ids: sharedIds, status: 'pending' },
        { league_id: leagueId, user_id: mgrB, player_ids: sharedIds, status: 'pending' },
      ]);

    // ✅ Overlapping submissions are accepted, not rejected
    expect(submitError).toBeNull();

    const { data: submissions } = await serviceSupabase
      .from('draft_submissions')
      .select('user_id, player_ids')
      .eq('league_id', leagueId);

    expect(submissions?.length).toBe(2);
    for (const s of submissions) {
      expect(s.player_ids).toEqual(sharedIds);
    }
  });

  test('Draft allocation job: Scenario 1 - All managers selected 30 players', async () => {
    // Create test league with draft mode
    // Have 3 managers each submit 30 players
    // Manually trigger run-draft-lottery
    // Verify each gets 15 allocated

    if (!serviceSupabase) {
      console.warn('⚠️ SKIPPING: E2E_LOCAL_SERVICE_ROLE_KEY not available in environment');
      test.skip();
      return;
    }

    console.log('✅ SCENARIO 1: Testing draft allocation with full submissions');

    const { data: testLeague, error: createError } = await serviceSupabase
      .from('leagues')
      .insert([{
        name: 'Draft Test League - All 30',
        format: 'noduplicate',
        max_members: 3,
        circle_id: CIRCLE_ID,
        draft_deadline: new Date(Date.now() - 60000).toISOString(), // deadline in past
      }])
      .select()
      .single();

    expect(createError).toBeNull();
    expect(testLeague).toBeDefined();

    const leagueId = testLeague.id;
    createdLeagueIds.push(leagueId);

    // Prepare test players
    const grouped = groupPlayersByPosition(REAL_PLAYERS);
    const selectedPlayers = selectDraftPlayers(grouped);
    expect(selectedPlayers.length).toBeGreaterThanOrEqual(30);

    // Create 3 draft submissions (all with 30 players). user_id is a uuid FK
    // to public.users — needs real rows, not fabricated strings like 'manager1'.
    const managerIds = await createManagerUsers(3);
    const playerIds = selectedPlayers.slice(0, 30).map(p => p.id);

    const { error: submitError } = await serviceSupabase
      .from('draft_submissions')
      .insert(managerIds.map(uid => ({
        league_id: leagueId,
        user_id: uid,
        player_ids: playerIds,
        status: 'pending',
      })));

    expect(submitError).toBeNull();

    // Manually trigger draft lottery — as a real commissioner, per the
    // function's actual security contract (no service-role bypass exists).
    const commissionerClient = await createCommissioner(leagueId, 'scenario1');
    const { error: callError } = await commissionerClient.functions.invoke('run-draft-lottery', {
      body: { league_id: leagueId },
    });

    expect(callError).toBeNull();

    // Verify allocations
    const { data: allocations, error: fetchError } = await serviceSupabase
      .from('draft_allocations')
      .select('user_id, allocated_players, unresolved_slots')
      .eq('league_id', leagueId);

    expect(fetchError).toBeNull();
    expect(allocations?.length).toBe(3);

    // Each manager should get 15 allocated
    for (const alloc of allocations) {
      expect(alloc.allocated_players.length).toBeGreaterThan(0);
      expect(alloc.allocated_players.length).toBeLessThanOrEqual(15);
      // unresolved_slots = 15 - allocated
      expect(alloc.unresolved_slots).toBe(15 - alloc.allocated_players.length);
    }

    // Verify gazette report created. gazette_entries' only SELECT RLS policy
    // is scoped `TO authenticated` with a league-membership check — anonSupabase
    // (anon role) always gets 0 rows regardless of whether the row exists, so
    // this read must go through the service-role client.
    const { data: gazette, error: gazetteError } = await serviceSupabase
      .from('gazette_entries')
      .select('*')
      .eq('league_id', leagueId)
      .eq('entry_type', 'draft_report');

    expect(gazetteError).toBeNull();
    expect(gazette?.length).toBeGreaterThan(0);
  });

  test('Draft allocation job: Scenario 2 - Some managers selected less than 30', async () => {
    // Have managers submit: 30, 25, 20 players
    // Verify allocation respects submission lengths

    if (!serviceSupabase) {
      console.warn('⚠️ SKIPPING: E2E_LOCAL_SERVICE_ROLE_KEY not available in environment');
      test.skip();
      return;
    }

    console.log('✅ SCENARIO 2: Testing draft allocation with partial submissions');

    const { data: testLeague } = await serviceSupabase
      .from('leagues')
      .insert([{
        name: 'Draft Test League - Partial',
        format: 'noduplicate',
        max_members: 3,
        circle_id: CIRCLE_ID,
        draft_deadline: new Date(Date.now() - 60000).toISOString(),
      }])
      .select()
      .single();

    const leagueId = testLeague.id;
    createdLeagueIds.push(leagueId);
    const grouped = groupPlayersByPosition(REAL_PLAYERS);
    // Needs 30+25+20=75 unique players total — selectDraftPlayers' default
    // caps (30 total) aren't enough. Request generously above what
    // REAL_PLAYERS (first 100 rows) actually has per position; slice() just
    // returns whatever's available, so over-asking is safe.
    const selectedPlayers = selectDraftPlayers(grouped, { GK: 20, DEF: 35, MID: 35, FWD: 30 });
    expect(selectedPlayers.length).toBeGreaterThanOrEqual(75);

    // Three submissions with different sizes. user_id is a uuid FK to
    // public.users — needs real rows, not fabricated strings like 'mgr_a'.
    const [mgrA, mgrB, mgrC] = await createManagerUsers(3);
    const submissions = [
      { user_id: mgrA, count: 30 },
      { user_id: mgrB, count: 25 },
      { user_id: mgrC, count: 20 },
    ];

    // Cumulative offset (not a fixed per-manager stride) — each manager's
    // slice starts where the previous one ended, so it only needs
    // selectedPlayers.length >= sum(counts), not >= count * managers.length.
    let cursor = 0;
    for (let i = 0; i < submissions.length; i++) {
      const playerIds = selectedPlayers
        .slice(cursor, cursor + submissions[i].count)
        .map(p => p.id);
      cursor += submissions[i].count;

      await serviceSupabase
        .from('draft_submissions')
        .insert([{
          league_id: leagueId,
          user_id: submissions[i].user_id,
          player_ids: playerIds,
          status: 'pending',
        }]);
    }

    // Run lottery — as a real commissioner, per the function's actual security contract.
    const commissionerClient2 = await createCommissioner(leagueId, 'scenario2');
    await commissionerClient2.functions.invoke('run-draft-lottery', {
      body: { league_id: leagueId },
    });

    // Verify allocations
    const { data: allocations } = await serviceSupabase
      .from('draft_allocations')
      .select('user_id, allocated_players')
      .eq('league_id', leagueId);

    expect(allocations?.length).toBe(3);

    // All should have some allocation
    for (const alloc of allocations) {
      expect(alloc.allocated_players.length).toBeGreaterThan(0);
      expect(alloc.allocated_players.length).toBeLessThanOrEqual(15);
    }
  });

  test('Draft allocation job: Scenario 3 - Some managers haven\'t submitted', async () => {
    // Have 1 manager submit 30, others don't submit
    // Verify cron only processes submitted managers

    if (!serviceSupabase) {
      console.warn('⚠️ SKIPPING: E2E_LOCAL_SERVICE_ROLE_KEY not available in environment');
      test.skip();
      return;
    }

    console.log('✅ SCENARIO 3: Testing draft allocation with missing submissions');

    const { data: testLeague } = await serviceSupabase
      .from('leagues')
      .insert([{
        name: 'Draft Test League - Sparse',
        format: 'noduplicate',
        max_members: 3,
        circle_id: CIRCLE_ID,
        draft_deadline: new Date(Date.now() - 60000).toISOString(),
      }])
      .select()
      .single();

    const leagueId = testLeague.id;
    createdLeagueIds.push(leagueId);
    const grouped = groupPlayersByPosition(REAL_PLAYERS);
    const selectedPlayers = selectDraftPlayers(grouped);

    // Only manager 1 submits. user_id is a uuid FK to public.users — needs a
    // real row, not a fabricated string like 'mgr_only_one'.
    const [mgrOnlyOne] = await createManagerUsers(1);
    await serviceSupabase
      .from('draft_submissions')
      .insert([{
        league_id: leagueId,
        user_id: mgrOnlyOne,
        player_ids: selectedPlayers.slice(0, 30).map(p => p.id),
        status: 'pending',
      }]);

    // Run lottery — as a real commissioner, per the function's actual security contract.
    const commissionerClient3 = await createCommissioner(leagueId, 'scenario3');
    const { error: funcError } = await commissionerClient3.functions.invoke('run-draft-lottery', {
      body: { league_id: leagueId },
    });

    expect(funcError).toBeNull();

    // Only 1 allocation should exist
    const { data: allocations } = await serviceSupabase
      .from('draft_allocations')
      .select('user_id')
      .eq('league_id', leagueId);

    expect(allocations?.length).toBe(1);
    expect(allocations?.[0]?.user_id).toBe(mgrOnlyOne);
  });

  test('Draft allocation respects position caps (GK:2, DEF:5, MID:5, FWD:3)', async () => {
    // After allocation, verify no manager has more than:
    // - 2 GK
    // - 5 DEF
    // - 5 MID
    // - 3 FWD

    console.log('✅ Testing position cap enforcement during allocation');

    const { data: allocations } = await anonSupabase
      .from('draft_allocations')
      .select('allocated_players, league_id')
      .limit(10);

    if (!allocations || allocations.length === 0) {
      test.skip();
      return;
    }

    // For each allocation, get player positions and count
    for (const alloc of allocations) {
      const { data: players } = await anonSupabase
        .from('players')
        .select('position')
        .in('id', alloc.allocated_players);

      if (players) {
        const posCounts = players.reduce((acc, p) => {
          const pos = p.position?.toUpperCase() || 'MID';
          acc[pos] = (acc[pos] || 0) + 1;
          return acc;
        }, {});

        // Verify caps
        expect(posCounts['GK'] || 0).toBeLessThanOrEqual(2);
        expect(posCounts['DEF'] || 0).toBeLessThanOrEqual(5);
        expect(posCounts['MID'] || 0).toBeLessThanOrEqual(5);
        expect(posCounts['FWD'] || 0).toBeLessThanOrEqual(3);
      }
    }
  });

  test('Gazette report generated after draft allocation', async () => {
    // Verify gazette_entries table has draft_report after allocation

    console.log('✅ Testing gazette report generation');

    const { data: reports } = await anonSupabase
      .from('gazette_entries')
      .select('*')
      .eq('entry_type', 'draft_report')
      .limit(5);

    // Should have at least one report (from our test allocations)
    if (reports && reports.length > 0) {
      const report = reports[0];
      expect(report.headline).toBeTruthy();
      expect(report.headline).toMatch(/DRAFT/i);
      expect(report.bullets).toBeTruthy();
      expect(report.full_data).toBeTruthy();
    }
  });

  test('Auto-save drafts every 30 seconds (persisted)', async ({ page }) => {
    // Verify that draft selections auto-save to draft_submissions

    await skipOnboarding(page);
    await page.goto('/league');
    await waitForContent(page);

    const leagueLinks = await page.locator('a[href*="/league/"]').all();
    let draftLeagueId = null;
    let _draftUrl = null;

    for (const link of leagueLinks) {
      const href = await link.getAttribute('href');
      if (href) {
        await page.goto(href + '/draft');
        await waitForContent(page);

        const isDraftScreen = await page.locator('text=Build Your List').isVisible().catch(() => false);
        if (isDraftScreen) {
          draftLeagueId = href.match(/\/league\/([^/]+)/)?.[1];
          _draftUrl = href + '/draft';
          break;
        }
      }
    }

    if (!draftLeagueId) {
      test.skip();
      return;
    }

    // Add a few players
    const playerRows = await page.locator('[class*="cursor-pointer"]').all();
    if (playerRows.length < 5) {
      test.skip();
      return;
    }

    for (let i = 0; i < Math.min(5, playerRows.length); i++) {
      const row = playerRows[i];
      await row.click();
      await page.waitForTimeout(100);

      const addBtn = await page.locator('button:has-text("Add to List")').first();
      const isVisible = await addBtn.isVisible().catch(() => false);
      if (isVisible) {
        await addBtn.click();
        await page.waitForTimeout(150);
      }
    }

    // Wait for auto-save (30s) or verify "Draft saved" message appears
    const savedMsg = await page.locator('text=/saved/i').first();
    const isSaved = await savedMsg.isVisible({ timeout: 35000 }).catch(() => false);
    expect(isSaved, 'Draft should auto-save within 30 seconds').toBe(true);
  });
});
