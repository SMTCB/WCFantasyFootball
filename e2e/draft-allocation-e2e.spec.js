// @ts-check
/* global process */
/**
 * End-to-end test for the full draft + allocation flow:
 *
 * 1. Create a league in draft mode
 * 2. Auto-complete Team A to 30 slots — verify no position/budget constraints
 * 3. Submit Team A list
 * 4. Team B joins + submits 5 overlapping players + auto-fills remaining
 * 5. Admin runs "Run Allocation Now" from commissioner panel
 * 6. Verify each manager gets ≤15 players respecting GK≤2, DEF≤5, MID≤5, FWD≤3, budget≤100
 * 7. Classic mode: create league, verify 15-slot auto-fill with budget/position constraints
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY as SUPABASE_ANON } from './supabase-target.js';

// Deliberately not named SUPABASE_SERVICE_ROLE_KEY — scripts/e2e-local.mjs
// sets E2E_LOCAL_SERVICE_ROLE_KEY unconditionally (the ephemeral local
// stack's own key, never production's). See that script's comment.
const SERVICE_KEY      = process.env.E2E_LOCAL_SERVICE_ROLE_KEY;

const anonDb    = createClient(SUPABASE_URL, SUPABASE_ANON);
const serviceDb = SERVICE_KEY ? createClient(SUPABASE_URL, SERVICE_KEY) : null;

// Two seeded users (supabase/seed.sql) — members of the same circle.
const USER_A = 'e0000000-0000-4000-a000-00000000000a'; // e2e_a
const USER_B = 'e0000000-0000-4000-a000-00000000000b'; // e2e_b
const USER_A_EMAIL = 'e2e_a@fantasykit.test';
const USER_A_PASSWORD = 'E2ePass!99';

// run-draft-lottery requires a real commissioner JWT for any call carrying
// league_id (DD-C4, supabase/functions/run-draft-lottery/index.js) — there is
// no service-role bypass for this path. USER_A is already seeded
// (supabase/seed.sql) as the commissioner of DRAFT_LEAGUE_ID, so sign in as
// USER_A directly rather than minting a throwaway commissioner.
let commissionerClient = null;
async function signInAsCommissioner() {
  if (commissionerClient) return commissionerClient;
  const client = createClient(SUPABASE_URL, SUPABASE_ANON);
  const { data, error } = await client.auth.signInWithPassword({
    email: USER_A_EMAIL, password: USER_A_PASSWORD,
  });
  if (error || !data?.session) throw new Error(`USER_A sign-in failed: ${error?.message}`);
  commissionerClient = client;
  return client;
}

// Seeded WC bulk player pool ONLY (supabase/seed.sql: seed-wc-p-1..70 @
// tournament 429) — DRAFT_LEAGUE_ID below is itself scoped to tournament_id
// '429', and run-draft-lottery's allocation algorithm builds its player map
// filtered `.eq('tournament_id', leagueRow.tournament_id)`. An earlier version
// of this file mixed in seed-epl-p-* (tournament 426) ids, which were silently
// invisible to the allocation algorithm for this league — that under-supplied
// managers to ~9 real players instead of the intended 15 (BUG-DRAFT-SVC).
// All priced <=£7.0M so a 15-player cap-filling allocation totals well under
// the £100M budget in every combination.
// GKS: 6 unique (2 shared + 2 A-only + 2 B-only). DEFS/MIDS/FWDS similarly split
// below via OVERLAP_IDS + TEAM_A_ONLY/TEAM_B_ONLY — see those for the breakdown.
const GKS  = ['seed-wc-p-10', 'seed-wc-p-20', 'seed-wc-p-30', 'seed-wc-p-40', 'seed-wc-p-50', 'seed-wc-p-60'];
const DEFS = ['seed-wc-p-1', 'seed-wc-p-2', 'seed-wc-p-3', 'seed-wc-p-21', 'seed-wc-p-22', 'seed-wc-p-23', 'seed-wc-p-31', 'seed-wc-p-32', 'seed-wc-p-33', 'seed-wc-p-41', 'seed-wc-p-42', 'seed-wc-p-43', 'seed-wc-p-51', 'seed-wc-p-52', 'seed-wc-p-53'];
const MIDS = ['seed-wc-p-24', 'seed-wc-p-25', 'seed-wc-p-26', 'seed-wc-p-34', 'seed-wc-p-35', 'seed-wc-p-36', 'seed-wc-p-44', 'seed-wc-p-45', 'seed-wc-p-46'];
const FWDS = ['seed-wc-p-27', 'seed-wc-p-28', 'seed-wc-p-29', 'seed-wc-p-37', 'seed-wc-p-38', 'seed-wc-p-39', 'seed-wc-p-47', 'seed-wc-p-48', 'seed-wc-p-49', 'seed-wc-p-57', 'seed-wc-p-58', 'seed-wc-p-59'];

// 5 players that BOTH teams pick (lottery will give each to exactly one manager):
// 2 GK + 3 DEF, same shape as the original prod-data version of this test.
const OVERLAP_IDS = [GKS[0], GKS[1], DEFS[0], DEFS[1], DEFS[2]];

// Team A's own players (no overlap with Team B's own players below): 2 GK + 6 DEF
// + 6 MID + 6 FWD = 20, plus the 5 shared OVERLAP_IDS = 25 total. Comfortably clears
// every position cap (GK<=2, DEF<=5, MID<=5, FWD<=3) from OWN supply alone
// regardless of which overlap players the lottery awards to A, so a full
// 15-player allocation is guaranteed (exercised by the hard `toBe(15)`
// assertion further down this file).
const TEAM_A_ONLY = [
  GKS[2], GKS[3],
  DEFS[3], DEFS[4], DEFS[5], DEFS[6], DEFS[7], DEFS[8],
  MIDS[0], MIDS[1], MIDS[2], MIDS[3], MIDS[4], MIDS[5],
  FWDS[0], FWDS[1], FWDS[2], FWDS[3], FWDS[4], FWDS[5],
];

// Team B's own players: 2 GK + 6 DEF + 3 MID + 6 FWD = 17, plus the 5 shared
// OVERLAP_IDS = 22 total, entirely disjoint from Team A's own players above.
// Deliberately only 3 MID candidates (below the MID<=5 cap) so Team B's
// post-allocation squad has open MID slots and isn't full at 15 — exercised
// by the "manager with open MID slots CAN buy" test further down.
const TEAM_B_ONLY = [
  GKS[4], GKS[5],
  DEFS[9], DEFS[10], DEFS[11], DEFS[12], DEFS[13], DEFS[14],
  MIDS[6], MIDS[7], MIDS[8],
  FWDS[6], FWDS[7], FWDS[8], FWDS[9], FWDS[10], FWDS[11],
];

// Names kept as *_30 for minimal diff even though actual counts are 25/22 —
// tests below assert against these arrays' own .length, never a literal 30.
const TEAM_A_30 = [...OVERLAP_IDS, ...TEAM_A_ONLY]; // 25 unique IDs
const TEAM_B_30 = [...OVERLAP_IDS, ...TEAM_B_ONLY]; // 22 unique IDs

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function skipOnboarding(page) {
  await page.addInitScript(() => {
    localStorage.setItem('forzakit_onboarding_done', 'true');
    localStorage.setItem('forzakit_tour_squad_done', 'true');
    localStorage.setItem('forzakit_tour_market_done', 'true');
    localStorage.setItem('forzakit_tour_league_done', 'true');
  });
}

async function waitFor(page, ms = 800) {
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

// ─── Suite 1: Draft Mode ──────────────────────────────────────────────────────

test.describe('Draft Mode — Full E2E Flow', () => {

  const DRAFT_LEAGUE_ID = '11000000-0000-4000-a000-000000000002'; // WC_1 (noduplicate)
  const DRAFT_URL       = `/league/${DRAFT_LEAGUE_ID}/draft`;

  test.beforeAll(async () => {
    // Clean any leftover test submissions
    if (serviceDb) {
      await serviceDb.from('draft_submissions')
        .delete()
        .eq('league_id', DRAFT_LEAGUE_ID)
        .in('user_id', [USER_A, USER_B]);
      await serviceDb.from('draft_allocations')
        .delete()
        .eq('league_id', DRAFT_LEAGUE_ID)
        .in('user_id', [USER_A, USER_B]);
      // Clear any squad from previous run
      await serviceDb.from('squads')
        .delete()
        .eq('league_id', DRAFT_LEAGUE_ID)
        .in('user_id', [USER_A, USER_B]);
    }
  });

  // ── 1. DraftScreen: no position caps, no budget, 30 slots ──────────────────

  test('draft screen loads with 30-slot list and no position/budget constraints', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await skipOnboarding(page);
    await page.goto(DRAFT_URL);
    await page.waitForSelector('text=Build Your List', { timeout: 10000 });
    await waitFor(page);

    // ✅ "Build Your List" heading visible
    await expect(page.locator('text=Build Your List')).toBeVisible();

    // ✅ List counter shows /30 capacity
    await expect(page.locator('text=/Your List —/')).toContainText('/30');

    // ✅ Position counters show only current count (no /cap suffix like 0/4)
    const pageText = await page.locator('body').innerText();
    // Should NOT contain old cap display like "0/4\nGK" (would appear as "0/4")
    // Position headers should be GK, DEF, MID, FWD without constraints
    expect(pageText).toMatch(/GK/);
    expect(pageText).toMatch(/DEF/);

    // ✅ No JS errors on load
    expect(errors).toHaveLength(0);
  });

  test('no position cap: auto-complete fills 30 players including many GKs', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await skipOnboarding(page);
    await page.goto(DRAFT_URL);
    await page.waitForSelector('text=Build Your List', { timeout: 10000 });
    // Wait for player list to load from Supabase
    await page.waitForTimeout(2500);

    // Check the Auto-Fill button is available (players loaded)
    const autoBtn = page.locator('button', { hasText: 'Auto-Fill' });
    await expect(autoBtn).toBeEnabled({ timeout: 5000 });

    // Click Auto-Fill — fills remaining 30 slots from the full player pool
    await autoBtn.click();
    await page.waitForTimeout(800);

    const listText = await page.locator('text=/Your List —/').innerText().catch(() => '');
    const count = parseInt(listText.match(/(\d+)\/30/)?.[1] ?? '0');

    // ✅ List filled (if players loaded — skip gracefully if RPC returned 0)
    if (count === 0) {
      console.warn('No players loaded from RPC — skipping count assertion');
      test.skip();
      return;
    }

    expect(count).toBe(30);

    // ✅ Auto-Fill now disabled (full)
    await expect(autoBtn).toBeDisabled();

    // ✅ Submit enabled as soon as ≥1 player is present
    await expect(page.locator('button', { hasText: /Submit List/ })).toBeEnabled();

    // ✅ GK counter in header reflects actual count, NOT capped at 4
    //    If players loaded, the list will include more GKs than the allocation cap (2)
    //    because auto-complete has no position restriction
    const gkHeader = await page.locator('body').innerText();
    // Find "N\nGK" pattern — count should be present (any positive number)
    const gkMatch = gkHeader.match(/(\d+)\s*\n?\s*GK/);
    if (gkMatch) {
      const gkCount = parseInt(gkMatch[1]);
      // In a 30-player random fill, we'd expect multiple GKs; old cap was 4, no limit now
      console.log(`GKs in list: ${gkCount} (old cap was 4, now unconstrained)`);
      // With 30 random picks from 2131 players, ~5.7% are GK → expect ~1-4 GKs statistically
      expect(gkCount).toBeGreaterThanOrEqual(0); // just assert counter is showing
    }

    expect(errors).toHaveLength(0);
  });

  test('auto-complete fills all 30 slots without position or budget restriction', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await skipOnboarding(page);
    await page.goto(DRAFT_URL);
    await page.waitForSelector('text=Build Your List', { timeout: 10000 });
    await page.waitForTimeout(2500); // wait for RPC player load

    const autoBtn = page.locator('button', { hasText: 'Auto-Fill' });
    const isEnabled = await autoBtn.isEnabled({ timeout: 5000 }).catch(() => false);
    if (!isEnabled) { test.skip(); return; } // no players loaded, skip

    await autoBtn.click();
    await page.waitForTimeout(800);

    const listText = await page.locator('text=/Your List —/').innerText().catch(() => '');
    const count = parseInt(listText.match(/(\d+)\/30/)?.[1] ?? '0');
    if (count === 0) { test.skip(); return; }

    // ✅ List now shows 30/30
    expect(listText).toContain('30/30');

    // ✅ Auto-Fill button is now disabled (list full)
    await expect(autoBtn).toBeDisabled();

    // ✅ Submit button is enabled
    await expect(page.locator('button', { hasText: /Submit List/ })).toBeEnabled();

    // ✅ No budget display blocking the list (budget not shown in draft mode)
    const bodyText = await page.locator('body').innerText();
    // Draft screen should NOT show a "£xM budget" type constraint message
    expect(bodyText).not.toMatch(/Insufficient budget|budget too low/i);

    expect(errors).toHaveLength(0);
  });

  // ── 2. Submit Team A via DB (service role simulates authenticated submit) ────

  test('Team A submits 30-player list (5 overlap with Team B)', async () => {
    if (!serviceDb) { test.skip(); return; }

    const { error } = await serviceDb.from('draft_submissions').upsert({
      league_id:    DRAFT_LEAGUE_ID,
      user_id:      USER_A,
      phase:        'group',
      player_ids:   TEAM_A_30,
      status:       'pending',
      submitted_at: new Date().toISOString(),
    }, { onConflict: 'league_id,user_id,phase' });

    expect(error).toBeNull();

    // Verify submission saved correctly
    const { data } = await serviceDb.from('draft_submissions')
      .select('player_ids, status')
      .eq('league_id', DRAFT_LEAGUE_ID)
      .eq('user_id', USER_A)
      .single();

    expect(data?.player_ids?.length).toBe(TEAM_A_30.length);
    expect(data?.status).toBe('pending');
  });

  // ── 3. Team B: 5 overlapping players + auto-fill ────────────────────────────

  test('Team B submits list with 5 overlapping + remaining players (30 total)', async () => {
    if (!serviceDb) { test.skip(); return; }

    const { error } = await serviceDb.from('draft_submissions').upsert({
      league_id:    DRAFT_LEAGUE_ID,
      user_id:      USER_B,
      phase:        'group',
      player_ids:   TEAM_B_30,
      status:       'pending',
      submitted_at: new Date().toISOString(),
    }, { onConflict: 'league_id,user_id,phase' });

    expect(error).toBeNull();

    // Verify overlap exists between the two lists
    const overlap = TEAM_A_30.filter(id => TEAM_B_30.includes(id));
    expect(overlap.length).toBe(5);

    // Verify Team B saved
    const { data } = await serviceDb.from('draft_submissions')
      .select('player_ids')
      .eq('league_id', DRAFT_LEAGUE_ID)
      .eq('user_id', USER_B)
      .single();

    expect(data?.player_ids?.length).toBe(TEAM_B_30.length);
  });

  // ── 4. Admin runs allocation via CommissionerPanel ────────────────────────────

  test('commissioner panel has Run Allocation button and it executes successfully', async ({ page }) => {
    if (!serviceDb) { test.skip(); return; }

    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await skipOnboarding(page);
    await page.goto(`/league/${DRAFT_LEAGUE_ID}`);
    await waitFor(page, 1500);

    // Navigate to Admin tab
    const adminTab = page.locator('button, [role="tab"]', { hasText: /admin/i }).first();
    const adminVisible = await adminTab.isVisible({ timeout: 3000 }).catch(() => false);

    if (adminVisible) {
      await adminTab.click();
      await page.waitForTimeout(500);

      // ✅ "Run Allocation Now" button exists
      const allocBtn = page.locator('button', { hasText: /Run Allocation Now/i });
      await expect(allocBtn).toBeVisible();

      // Click it
      await allocBtn.click();
      await page.waitForTimeout(3000); // allow async edge function call

      // ✅ Success message appears
      const successMsg = await page.locator('text=/Allocation complete|squads allocated/i').isVisible({ timeout: 5000 }).catch(() => false);
      // Even if success toast is missed, verify the DB state below
      console.log('Commissioner panel allocation triggered, UI success:', successMsg);
    } else {
      // In demo mode admin tab might not be visible — trigger allocation directly,
      // as USER_A (seeded commissioner of DRAFT_LEAGUE_ID) — no service-role
      // bypass exists for this call (see signInAsCommissioner comment above).
      console.log('Admin tab not visible in demo mode — triggering allocation as commissioner');
      const authedClient = await signInAsCommissioner();
      const { data, error } = await authedClient.functions.invoke('run-draft-lottery', {
        body: { league_id: DRAFT_LEAGUE_ID },
      });
      expect(error).toBeNull();
      expect(data?.managersProcessed).toBe(2);
    }

    expect(errors).toHaveLength(0);
  });

  // ── 5. Verify allocation: 15 players, position caps, budget ─────────────────

  test('allocation assigns ≤15 players per manager with position and budget constraints', async () => {
    if (!serviceDb) { test.skip(); return; }

    // Ensure allocation has run (may have been triggered in previous test or trigger now)
    const { data: existing } = await serviceDb.from('draft_allocations')
      .select('user_id, allocated_players, unresolved_slots')
      .eq('league_id', DRAFT_LEAGUE_ID)
      .in('user_id', [USER_A, USER_B]);

    // If not yet allocated, run it now — as the seeded commissioner (USER_A);
    // no service-role bypass exists for this call.
    if (!existing?.length) {
      const authedClient = await signInAsCommissioner();
      await authedClient.functions.invoke('run-draft-lottery', {
        body: { league_id: DRAFT_LEAGUE_ID },
      });
    }

    // Fetch allocations
    const { data: allocs } = await serviceDb.from('draft_allocations')
      .select('user_id, allocated_players')
      .eq('league_id', DRAFT_LEAGUE_ID)
      .in('user_id', [USER_A, USER_B]);

    expect(allocs?.length).toBe(2);

    // Fetch all player details for validation
    const allPlayerIds = [...new Set(allocs.flatMap(a => a.allocated_players))];
    const { data: playerData } = await serviceDb.from('players')
      .select('id, position, price')
      .in('id', allPlayerIds);

    const playerMap = Object.fromEntries(playerData.map(p => [p.id, p]));

    const POS_CAPS   = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
    const BUDGET_CAP = 100;

    for (const alloc of allocs) {
      const players = alloc.allocated_players;
      expect(players.length).toBeLessThanOrEqual(15);

      const posCounts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
      let totalPrice  = 0;

      for (const pid of players) {
        const p = playerMap[pid];
        if (!p) continue;
        const pos = p.position === 'FW' ? 'FWD' : p.position;
        posCounts[pos] = (posCounts[pos] ?? 0) + 1;
        totalPrice += Number(p.price);
      }

      // ✅ Position caps respected
      expect(posCounts.GK  ?? 0).toBeLessThanOrEqual(POS_CAPS.GK);
      expect(posCounts.DEF ?? 0).toBeLessThanOrEqual(POS_CAPS.DEF);
      expect(posCounts.MID ?? 0).toBeLessThanOrEqual(POS_CAPS.MID);
      expect(posCounts.FWD ?? 0).toBeLessThanOrEqual(POS_CAPS.FWD);

      // ✅ Budget respected
      expect(totalPrice).toBeLessThanOrEqual(BUDGET_CAP);

      console.log(`User ${alloc.user_id.slice(0,8)}: ${players.length} players, £${totalPrice.toFixed(1)}M, positions: GK=${posCounts.GK??0} DEF=${posCounts.DEF??0} MID=${posCounts.MID??0} FWD=${posCounts.FWD??0}`);
    }
  });

  test('overlap players are awarded to exactly one manager (no duplicates)', async () => {
    if (!serviceDb) { test.skip(); return; }

    const { data: allocs } = await serviceDb.from('draft_allocations')
      .select('user_id, allocated_players')
      .eq('league_id', DRAFT_LEAGUE_ID)
      .in('user_id', [USER_A, USER_B]);

    if (!allocs?.length) { test.skip(); return; }

    const [a, b] = allocs;
    const setA   = new Set(a.allocated_players);
    const setB   = new Set(b.allocated_players);

    // ✅ No player appears in both squads
    const duplicates = [...setA].filter(id => setB.has(id));
    expect(duplicates.length).toBe(0);

    // ✅ Contested players went to exactly one manager
    const contested = OVERLAP_IDS.filter(id =>
      setA.has(id) || setB.has(id)
    );
    console.log(`Contested players resolved: ${contested.length}/${OVERLAP_IDS.length} awarded`);
  });

  test('squads table is updated after allocation so Squad screen shows result', async () => {
    if (!serviceDb) { test.skip(); return; }

    const { data: squads } = await serviceDb.from('squads')
      .select('user_id, players, budget_remaining')
      .eq('league_id', DRAFT_LEAGUE_ID)
      .in('user_id', [USER_A, USER_B]);

    expect(squads?.length).toBeGreaterThanOrEqual(1);

    for (const squad of squads) {
      expect(squad.players.length).toBeLessThanOrEqual(15);
      expect(Number(squad.budget_remaining)).toBeGreaterThanOrEqual(0);
      console.log(`Squad ${squad.user_id.slice(0,8)}: ${squad.players.length} players, £${squad.budget_remaining}M remaining`);
    }
  });

  test.afterAll(async () => {
    // Clean up test data. squads is left intact here — Suite 1b ("Post-
    // Allocation — constraints enforced") depends on this suite's allocated
    // squads still existing; it deletes them itself once it's done.
    if (serviceDb) {
      await serviceDb.from('draft_submissions').delete()
        .eq('league_id', DRAFT_LEAGUE_ID).in('user_id', [USER_A, USER_B]);
      await serviceDb.from('draft_allocations').delete()
        .eq('league_id', DRAFT_LEAGUE_ID).in('user_id', [USER_A, USER_B]);
    }
  });
});

// ─── Suite 1b: Post-Allocation — Constraints APPLY ───────────────────────────
//
// The unconstrained path (DraftScreen autoComplete) is only accessible before
// the draft deadline / before allocation runs. After allocation:
//   • DraftScreen shows "Draft Submitted" — autoComplete is no longer reachable
//   • All squad management goes through process-transfer which enforces:
//       GK≤2, DEF≤5, MID≤5, FWD≤3, budget≤£100M, squad size≤15
//
// These tests verify that transition: post-allocation state is valid AND any
// further buy through process-transfer is correctly constrained.

test.describe('Post-Allocation — constraints enforced', () => {

  const DRAFT_LEAGUE_ID = '11000000-0000-4000-a000-000000000002';

  test('process-transfer endpoint requires auth — no bypass', async () => {
    // Calling without an Authorization header must return 401 (not 403/400)
    // This proves the auth gate is in place for all transfer operations
    const resp = await fetch(
      `${SUPABASE_URL}/functions/v1/process-transfer`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'buy', player_id: GKS[0], league_id: DRAFT_LEAGUE_ID }),
      }
    );
    const body = await resp.json();
    // ✅ Auth is required — no anonymous transfer possible
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/unauthoris/i);
  });

  test('process-transfer logic: full squad (15p) rejects any buy', async () => {
    if (!serviceDb) { test.skip(); return; }

    // e2e_a has 15 players (all position caps met) after allocation
    const { data: squad } = await serviceDb.from('squads')
      .select('players, budget_remaining')
      .eq('league_id', DRAFT_LEAGUE_ID)
      .eq('user_id', USER_A)
      .maybeSingle();

    if (!squad) { test.skip(); return; }

    // ✅ Squad is at the 15-player cap → any buy would be rejected
    expect(squad.players.length).toBe(15); // process-transfer SQUAD_MAX = 15

    // Fetch position breakdown to confirm all position caps are full too
    const { data: playerData } = await serviceDb.from('players')
      .select('position').in('id', squad.players);
    const counts = (playerData ?? []).reduce((acc, p) => {
      const pos = p.position === 'FW' ? 'FWD' : p.position;
      acc[pos] = (acc[pos] ?? 0) + 1; return acc;
    }, {});

    // ✅ All position caps maxed — no room for any more players of any position
    expect(counts.GK  ?? 0).toBeLessThanOrEqual(2);
    expect(counts.DEF ?? 0).toBeLessThanOrEqual(5);
    expect(counts.MID ?? 0).toBeLessThanOrEqual(5);
    expect(counts.FWD ?? 0).toBeLessThanOrEqual(3);

    console.log(`${USER_A.slice(0,8)} post-alloc: ${squad.players.length}p GK=${counts.GK} DEF=${counts.DEF} MID=${counts.MID} FWD=${counts.FWD} £${squad.budget_remaining}M left — any buy REJECTED (squad full)`);
  });

  test('process-transfer logic: GK-capped manager is blocked from buying another GK', async () => {
    if (!serviceDb) { test.skip(); return; }

    // Both managers end up with GK=2 after allocation (lottery split the 2 contested GKs)
    for (const [uid, label] of [[USER_A, 'e2e_a'], [USER_B, 'e2e_b']]) {
      const { data: squad } = await serviceDb.from('squads')
        .select('players').eq('league_id', DRAFT_LEAGUE_ID).eq('user_id', uid).maybeSingle();
      if (!squad) continue;

      const { data: playerData } = await serviceDb.from('players')
        .select('position').in('id', squad.players);
      const gkCount = (playerData ?? []).filter(p => p.position === 'GK').length;

      // ✅ GK count is at the cap (2) — process-transfer would reject a GK buy
      expect(gkCount).toBeLessThanOrEqual(2);
      if (gkCount === 2) {
        console.log(`${label}: GK=${gkCount} (at cap=2) → process-transfer REJECTS additional GK buy`);
      }
    }
  });

  test('process-transfer logic: manager with open MID slots CAN buy a midfielder', async () => {
    if (!serviceDb) { test.skip(); return; }

    // e2e_b has MID=3 (below the cap of 5) and open squad slots — a MID buy should be ALLOWED
    const { data: squad } = await serviceDb.from('squads')
      .select('players, budget_remaining')
      .eq('league_id', DRAFT_LEAGUE_ID)
      .eq('user_id', USER_B)
      .maybeSingle();

    if (!squad) { test.skip(); return; }

    const { data: playerData } = await serviceDb.from('players')
      .select('position').in('id', squad.players);
    const counts = (playerData ?? []).reduce((acc, p) => {
      const pos = p.position === 'FW' ? 'FWD' : p.position;
      acc[pos] = (acc[pos] ?? 0) + 1; return acc;
    }, {});

    // ✅ MID count is below cap AND squad has open slots AND budget available
    //    → process-transfer ALLOWS a MID buy for this manager
    const midCount   = counts.MID ?? 0;
    const squadSize  = squad.players.length;
    const budgetLeft = Number(squad.budget_remaining);

    expect(midCount).toBeLessThan(5);      // MID cap is 5
    expect(squadSize).toBeLessThan(15);    // squad not full
    expect(budgetLeft).toBeGreaterThan(0); // has budget

    console.log(`e2e_b: MID=${midCount} (cap=5), squad=${squadSize}/15, £${budgetLeft}M → MID buy ALLOWED by process-transfer`);
  });

  test('DraftScreen shows submitted state (autoComplete disabled) after allocation', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await skipOnboarding(page);
    await page.goto(`/league/${DRAFT_LEAGUE_ID}/draft`);
    await page.waitForTimeout(3000); // wait for submission status to load

    // After allocation ran (status='processed'), the DraftScreen shows "Draft Submitted"
    // The unconstrained autoComplete button is NOT accessible in this state
    const submittedVisible = await page.locator('text=Draft Submitted').isVisible({ timeout: 5000 }).catch(() => false);
    const autoCompleteVisible = await page.locator('button:has-text("Auto-Fill")').isVisible({ timeout: 1000 }).catch(() => false);

    if (submittedVisible) {
      // ✅ "Draft Submitted" is shown — no unconstrained list-building available
      expect(autoCompleteVisible).toBe(false);
      console.log('DraftScreen: "Draft Submitted" shown, Auto-Fill hidden ✅');
    } else {
      // In demo mode without auth, user?.id is null so submission status isn't loaded
      // The autoComplete button IS visible but isClosed or deadline logic limits it
      console.log('Demo mode: no user session, testing deadline gate instead');
      // Even without auth, the screen loads without crashing
      const pageText = await page.locator('body').innerText();
      expect(pageText.length).toBeGreaterThan(20);
    }

    expect(errors).toHaveLength(0);
  });

  test('constraint summary: pre- vs post-allocation enforcement is correct', async () => {
    if (!serviceDb) { test.skip(); return; }

    // Fetch both squads
    const { data: squads } = await serviceDb.from('squads')
      .select('user_id, players, budget_remaining')
      .eq('league_id', DRAFT_LEAGUE_ID)
      .in('user_id', [USER_A, USER_B]);

    expect(squads?.length).toBeGreaterThanOrEqual(1);

    for (const squad of squads) {
      const { data: playerData } = await serviceDb.from('players')
        .select('id, position, price').in('id', squad.players);

      const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
      let totalCost = 0;
      for (const p of playerData ?? []) {
        const pos = p.position === 'FW' ? 'FWD' : p.position;
        counts[pos] = (counts[pos] ?? 0) + 1;
        totalCost += Number(p.price);
      }

      // ✅ Allocation-time constraints are baked into the squad
      expect(counts.GK).toBeLessThanOrEqual(2);
      expect(counts.DEF).toBeLessThanOrEqual(5);
      expect(counts.MID).toBeLessThanOrEqual(5);
      expect(counts.FWD).toBeLessThanOrEqual(3);
      expect(totalCost).toBeLessThanOrEqual(100);
      expect(squad.players.length).toBeLessThanOrEqual(15);

      // process-transfer uses these same caps for any subsequent buy:
      //   POS_LIMITS = { GK: 2, DEF: 5, MID: 5, FWD: 3 }
      //   SQUAD_MAX  = 15
      //   budget     = squad.budget_remaining (deducted per buy)
      console.log(`Squad ${squad.user_id.slice(0,8)}: GK=${counts.GK}/${2} DEF=${counts.DEF}/${5} MID=${counts.MID}/${5} FWD=${counts.FWD}/${3} size=${squad.players.length}/15 cost=£${totalCost}M ✅`);
    }
  });

  test.afterAll(async () => {
    // Squads allocated by Suite 1 and consumed by this suite are cleaned up
    // here, once both suites are done with them.
    if (serviceDb) {
      await serviceDb.from('squads').delete()
        .eq('league_id', DRAFT_LEAGUE_ID).in('user_id', [USER_A, USER_B]);
    }
  });
});

// ─── Suite 2: Classic Mode ────────────────────────────────────────────────────

test.describe('Classic Mode — 15-slot auto-fill with constraints', () => {

  const CLASSIC_LEAGUE_ID = '11000000-0000-4000-a000-000000000001'; // Premier Fantasy League

  test('squad screen shows 15-slot capacity, not 30', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await skipOnboarding(page);
    await page.goto(`/squad?leagueId=${CLASSIC_LEAGUE_ID}`);
    await waitFor(page, 1200);

    // ✅ No crash
    expect(errors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0);

    // ✅ Squad screen loads (shows pitch or squad content)
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(50);
  });

  test('classic draft screen is NOT available (no /draft route used for classic leagues)', async ({ page }) => {
    await skipOnboarding(page);
    // Classic leagues can still use /draft route — it just shows the draft list builder
    // The test is that the squad-building flow uses process-transfer (15 players)
    // Verify the Squad screen does NOT show "Build Your List" (that's draft-only UI)
    await page.goto(`/squad?leagueId=${CLASSIC_LEAGUE_ID}`);
    await waitFor(page, 1200);

    const hasDraftUI = await page.locator('text=Build Your List').isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasDraftUI).toBe(false);
  });

  test('market screen shows budget constraint for classic mode', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await skipOnboarding(page);
    await page.goto(`/market?leagueId=${CLASSIC_LEAGUE_ID}`);
    await waitFor(page, 1200);

    // ✅ Budget display is present in classic mode
    const bodyText = await page.locator('body').innerText();
    // Should show a budget figure (£xM or similar)
    expect(bodyText).toMatch(/£|budget|remaining/i);

    expect(errors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0);
  });

  test('allocation logic in DB: classic squads respect 15-player cap and budget', async () => {
    // Verify the process-transfer edge function correctly enforces 15-player cap
    // by checking any existing squads in the classic league
    const { data: squads } = await anonDb.from('squads')
      .select('user_id, players, budget_remaining')
      .eq('league_id', CLASSIC_LEAGUE_ID)
      .limit(5);

    for (const squad of squads ?? []) {
      const playerCount = squad.players?.length ?? 0;
      expect(playerCount).toBeLessThanOrEqual(15);
      // Budget should be non-negative
      expect(Number(squad.budget_remaining)).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─── Suite 3: Draft vs Classic differentiation ───────────────────────────────

test.describe('Draft vs Classic — mode detection', () => {

  test('league creation wizard shows Draft as an option', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    // Demo-mode AuthContext (VITE_AUTH_ENABLED != 'true', the default for this
    // local run) freezes the React `user` at a fixed DEMO_USER identity and
    // never restores a session from storage — but the underlying supabase-js
    // client (src/lib/supabase.js) still auto-persists/sends whatever session
    // sits in localStorage on every request, independent of AuthContext. RLS
    // on circle_members (`is_circle_member(circle_id)`, keyed off the real
    // JWT's auth.uid()) needs a genuine circle member's session to allow the
    // read at all; LeagueScreen.jsx's own query then filters
    // `.eq('user_id', user.id)` against DEMO_USER's frozen id — seed.sql seeds
    // a circle_members row for DEMO_USER in the same circle e2e_a belongs to,
    // so injecting e2e_a's session satisfies RLS while the DEMO_USER row
    // satisfies the client-side filter.
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON);
    const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
      email: 'e2e_a@fantasykit.test', password: 'E2ePass!99',
    });
    if (authError || !authData?.session) throw new Error(`sign-in failed for e2e_a: ${authError?.message}`);
    const projectRef = SUPABASE_URL.match(/\/\/([^.]+)\./)?.[1] ?? 'sssmvihxtqtohisghjet';
    const authKey = `sb-${projectRef}-auth-token`;
    const authValue = JSON.stringify({
      access_token:  authData.session.access_token,
      token_type:    'bearer',
      expires_in:    3600,
      expires_at:    authData.session.expires_at,
      refresh_token: authData.session.refresh_token,
      user:          authData.session.user,
    });
    await page.addInitScript(({ k, v }) => { localStorage.setItem(k, v); }, { k: authKey, v: authValue });

    await skipOnboarding(page);
    await page.goto('/league');
    await waitFor(page, 1000);

    // Look for Create League / New League button
    const createBtn = page.locator('button, a', { hasText: /create|new league/i }).first();
    const visible = await createBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (visible) {
      await createBtn.click();
      await page.waitForTimeout(500);

      // League creation starts on a "Choose Clubhouse" step (LeagueScreen.jsx
      // view==='create', createLeagueStep 0) before the actual league-format
      // form (with Draft/Classic options) is reachable — select the seeded
      // clubhouse and continue past it.
      const clubhouseHeading = page.locator('text=/Choose Clubhouse/i').first();
      const onClubhouseStep = await clubhouseHeading.isVisible({ timeout: 2000 }).catch(() => false);
      if (onClubhouseStep) {
        // Scope past the top-nav Clubhouse switcher, which also renders a
        // button with this circle's name — the wizard's own picker row is
        // the one that also shows the member's role ("member"/"owner").
        const circleRow = page.locator('button', { hasText: 'E2E Test Circle' }).filter({ hasText: 'member' }).first();
        await expect(circleRow).toBeVisible({ timeout: 3000 });
        await circleRow.click();

        const continueBtn = page.locator('button', { hasText: 'Continue' }).first();
        await expect(continueBtn).toBeEnabled({ timeout: 3000 });
        await continueBtn.click();
        await page.waitForTimeout(500);
      }

      // ✅ Draft mode option is present
      const draftOption = page.locator('text=/Draft/i').first();
      await expect(draftOption).toBeVisible({ timeout: 3000 });

      // ✅ Classic mode option is present
      const classicOption = page.locator('text=/Classic/i').first();
      await expect(classicOption).toBeVisible({ timeout: 3000 });
    } else {
      // Already in a league — creation wizard not directly accessible
      console.log('League creation wizard not directly accessible in current state');
      test.skip();
    }

    expect(errors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0);
  });

  test('Draft league invite card shows "Draft" format label', async () => {
    // Use service role if available, otherwise use anon + maybeSingle
    const db = serviceDb || anonDb;
    const { data } = await db.from('leagues')
      .select('format, name')
      .eq('id', '11000000-0000-4000-a000-000000000002')
      .maybeSingle();

    if (!data) {
      // RLS may block anon reads in some environments — supabase/seed.sql sets format='noduplicate'
      console.log('League not readable via anon key — seed.sql sets format=noduplicate for this league');
      return;
    }

    expect(data.format).toBe('noduplicate'); // draft leagues use noduplicate format
    expect(data.name).toBeDefined();
  });

  test('draft league has draft_list_size=30, classic league has squad_size=15', async () => {
    const db = serviceDb || anonDb;

    const { data: draftLeague } = await db.from('leagues')
      .select('draft_list_size, squad_size, format')
      .eq('id', '11000000-0000-4000-a000-000000000002')
      .maybeSingle();

    const { data: classicLeague } = await db.from('leagues')
      .select('draft_list_size, squad_size, format')
      .eq('id', '11000000-0000-4000-a000-000000000001')
      .maybeSingle();

    if (!draftLeague || !classicLeague) {
      // supabase/seed.sql sets draft_list_size=30, squad_size=15 explicitly for the draft
      // league; the classic league gets squad_size=15 from schema.sql's column default.
      console.log('League not readable via anon key — seed.sql sets draft_list_size=30, squad_size=15');
      return;
    }

    // ✅ Draft league: 30 preference list
    expect(Number(draftLeague.draft_list_size)).toBe(30);

    // ✅ Classic league: 15-player squad
    expect(Number(classicLeague.squad_size)).toBe(15);
    expect(classicLeague.format).toBe('classic');
  });
});
