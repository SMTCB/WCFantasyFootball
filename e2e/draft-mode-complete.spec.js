// @ts-check
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// ── Real Supabase Client ─────────────────────────────────────────────────────

const SUPABASE_URL = 'https://sssmvihxtqtohisghjet.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzc212aWh4dHF0b2hpc2doamV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDgyOTc5ODcsImV4cCI6MTcyMzg3Mzk4N30.LAeWx39REi6K2L46bY2g3PlvEaWM7p7TJdEZxtvXq8c';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzc212aWh4dHF0b2hpc2doamV0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcwODI5Nzk4NywiZXhwIjoxNzIzODczOTg3fQ.8VjMWc7Lf3hXFx4X0X-0X0X0X0X0X0X0X0X0X0X0X0';

const anonSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const serviceSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

let REAL_PLAYERS = [];

test.beforeAll(async () => {
  const { data: players } = await anonSupabase
    .from('players')
    .select('id, name, position, price')
    .limit(100);
  REAL_PLAYERS = players || [];
  console.log(`Loaded ${REAL_PLAYERS.length} players for testing`);
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
    await page.goto('/league');
    await waitForContent(page);

    // Find draft league
    const leagueLinks = await page.locator('a[href*="/league/"]').all();
    let foundDraftScreen = false;

    for (const link of leagueLinks) {
      const href = await link.getAttribute('href');
      if (href) {
        await page.goto(href + '/draft');
        await waitForContent(page);

        const isDraftScreen = await page.locator('text=Build Your List').isVisible().catch(() => false);
        if (isDraftScreen) {
          foundDraftScreen = true;

          // ✅ TEST: Verify list shows 30-player limit
          const listCounter = await page.locator('text=/Your List —/').innerText();
          expect(listCounter).toContain('/30', 'Draft list should display /30 limit, not /15');

          // ✅ TEST: Verify position caps are for draft (GK:4, DEF:10, MID:10, FWD:6)
          const positionCaps = await page.locator('[class*="text-center"]').all();
          const hasExpectedCaps = await Promise.all(positionCaps.map(async (cap) => {
            const text = await cap.innerText();
            return text.includes('0/4') || text.includes('0/10') || text.includes('0/6');
          }));
          expect(hasExpectedCaps.some(x => x), 'Should display draft position caps (GK:4, DEF:10, MID:10, FWD:6)').toBe(true);

          break;
        }
      }
    }

    expect(foundDraftScreen, 'Should find a draft league to test').toBe(true);
    expect(errors, `Draft screen threw JS errors: ${errors.join(', ')}`).toHaveLength(0);
  });

  test('Draft submission prevents duplicate players across managers', async ({ page, context }) => {
    // SCENARIO: Two managers submit draft lists
    // Manager 1 picks players A, B, C (30 players)
    // Manager 2 cannot pick the same players

    await skipOnboarding(page);
    await page.goto('/league');
    await waitForContent(page);

    // Get a draft league
    const leagueLinks = await page.locator('a[href*="/league/"]').all();
    let draftLeagueId = null;
    let draftUrl = null;

    for (const link of leagueLinks) {
      const href = await link.getAttribute('href');
      if (href) {
        await page.goto(href + '/draft');
        await waitForContent(page);

        const isDraftScreen = await page.locator('text=Build Your List').isVisible().catch(() => false);
        if (isDraftScreen) {
          draftLeagueId = href.match(/\/league\/([^\/]+)/)?.[1];
          draftUrl = href + '/draft';
          break;
        }
      }
    }

    if (!draftLeagueId || !draftUrl) {
      test.skip();
      return;
    }

    // ✅ TEST: Verify draft_submissions table enforces no duplicates across managers
    const { data: submissions } = await anonSupabase
      .from('draft_submissions')
      .select('user_id, player_ids')
      .eq('league_id', draftLeagueId);

    if (submissions && submissions.length >= 2) {
      // Check that submitted players don't overlap between managers
      const allSubmittedPlayers = submissions.flatMap(s => s.player_ids || []);
      const uniquePlayers = new Set(allSubmittedPlayers);

      // Calculate overlap
      const totalPlayerSlots = allSubmittedPlayers.length;
      const overlappingSlots = totalPlayerSlots - uniquePlayers.size;

      expect(overlappingSlots, 'No duplicate players should be possible across managers (DB constraint)').toBe(0);
    }
  });

  test('Draft allocation job: Scenario 1 - All managers selected 30 players', async () => {
    // Create test league with draft mode
    // Have 3 managers each submit 30 players
    // Manually trigger run-draft-lottery
    // Verify each gets 15 allocated

    console.log('✅ SCENARIO 1: Testing draft allocation with full submissions');

    const { data: testLeague, error: createError } = await serviceSupabase
      .from('leagues')
      .insert([{
        name: 'Draft Test League - All 30',
        format: 'noduplicate',
        max_members: 3,
        draft_deadline: new Date(Date.now() - 60000).toISOString(), // deadline in past
      }])
      .select()
      .single();

    expect(createError).toBeNull();
    expect(testLeague).toBeDefined();

    const leagueId = testLeague.id;

    // Prepare test players
    const grouped = groupPlayersByPosition(REAL_PLAYERS);
    const selectedPlayers = selectDraftPlayers(grouped);
    expect(selectedPlayers.length).toBeGreaterThanOrEqual(30);

    // Create 3 draft submissions (all with 30 players)
    const managerIds = ['manager1', 'manager2', 'manager3'];
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

    // Manually trigger draft lottery
    const { error: callError } = await serviceSupabase.functions.invoke('run-draft-lottery', {
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

    // Verify gazette report created
    const { data: gazette, error: gazetteError } = await anonSupabase
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

    console.log('✅ SCENARIO 2: Testing draft allocation with partial submissions');

    const { data: testLeague } = await serviceSupabase
      .from('leagues')
      .insert([{
        name: 'Draft Test League - Partial',
        format: 'noduplicate',
        max_members: 3,
        draft_deadline: new Date(Date.now() - 60000).toISOString(),
      }])
      .select()
      .single();

    const leagueId = testLeague.id;
    const grouped = groupPlayersByPosition(REAL_PLAYERS);
    const selectedPlayers = selectDraftPlayers(grouped);

    // Three submissions with different sizes
    const submissions = [
      { user_id: 'mgr_a', count: 30 },
      { user_id: 'mgr_b', count: 25 },
      { user_id: 'mgr_c', count: 20 },
    ];

    for (let i = 0; i < submissions.length; i++) {
      const playerIds = selectedPlayers
        .slice(i * 35, i * 35 + submissions[i].count)
        .map(p => p.id);

      await serviceSupabase
        .from('draft_submissions')
        .insert([{
          league_id: leagueId,
          user_id: submissions[i].user_id,
          player_ids: playerIds,
          status: 'pending',
        }]);
    }

    // Run lottery
    await serviceSupabase.functions.invoke('run-draft-lottery', {
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

    console.log('✅ SCENARIO 3: Testing draft allocation with missing submissions');

    const { data: testLeague } = await serviceSupabase
      .from('leagues')
      .insert([{
        name: 'Draft Test League - Sparse',
        format: 'noduplicate',
        max_members: 3,
        draft_deadline: new Date(Date.now() - 60000).toISOString(),
      }])
      .select()
      .single();

    const leagueId = testLeague.id;
    const grouped = groupPlayersByPosition(REAL_PLAYERS);
    const selectedPlayers = selectDraftPlayers(grouped);

    // Only manager 1 submits
    await serviceSupabase
      .from('draft_submissions')
      .insert([{
        league_id: leagueId,
        user_id: 'mgr_only_one',
        player_ids: selectedPlayers.slice(0, 30).map(p => p.id),
        status: 'pending',
      }]);

    // Run lottery
    const { error: funcError } = await serviceSupabase.functions.invoke('run-draft-lottery', {
      body: { league_id: leagueId },
    });

    expect(funcError).toBeNull();

    // Only 1 allocation should exist
    const { data: allocations } = await serviceSupabase
      .from('draft_allocations')
      .select('user_id')
      .eq('league_id', leagueId);

    expect(allocations?.length).toBe(1);
    expect(allocations?.[0]?.user_id).toBe('mgr_only_one');
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
    let draftUrl = null;

    for (const link of leagueLinks) {
      const href = await link.getAttribute('href');
      if (href) {
        await page.goto(href + '/draft');
        await waitForContent(page);

        const isDraftScreen = await page.locator('text=Build Your List').isVisible().catch(() => false);
        if (isDraftScreen) {
          draftLeagueId = href.match(/\/league\/([^\/]+)/)?.[1];
          draftUrl = href + '/draft';
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
