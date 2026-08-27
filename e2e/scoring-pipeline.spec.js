// @ts-check
// Scoring Pipeline E2E — validates the full ingest → score → standings flow
// against Tier 3's seeded scenario (supabase/seed.sql step 6/6b): a single
// finished fixture, Seed FC A 2-0 Seed FC B, with a fully deterministic
// 22-player player_match_stats dataset and one user_a squad/fantasy_points
// row set for season-total tracking. See seed.sql's header comment for the
// full fixed-ID reference this file reads.
//
// DB-level assertions use the Supabase client directly.
// UI assertions use Playwright against the running app.

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-target.js';

// player_match_stats has no anon-read RLS policy (unlike its sibling tables
// match_events/fixtures/players/matchday_deadlines, which all grant public
// read) — only "authenticated read player_match_stats" (using_expr: true).
// DB-level assertions below need a signed-in session, not just the anon key.
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

test.beforeAll(async () => {
  const { error } = await supabase.auth.signInWithPassword({
    email: 'e2e_a@fantasykit.test',
    password: 'E2ePass!99',
  });
  if (error) throw new Error(`scoring-pipeline.spec.js: sign-in failed: ${error.message}`);
});

// Seeded scenario fixture: Seed FC A 2-0 Seed FC B, round 1 — supabase/seed.sql step 6.
const SCENARIO_FIXTURE_ID   = 'seed-fixture-epl-r1';
const EPL_TOURNAMENT_ID     = '426';
const SCENARIO_ROUND        = 1;
const CLASSIC_LEAGUE_ID     = '11000000-0000-4000-a000-000000000001';
const SCENARIO_MATCHDAY_ID  = '426-r1';
const SCENARIO_SQUAD_ID     = 'a0000000-0000-4000-a000-000000000001';

const CLUB_A_IDS = [
  'seed-epl-a-gk-1', 'seed-epl-a-def-1', 'seed-epl-a-def-2', 'seed-epl-a-def-3', 'seed-epl-a-def-4',
  'seed-epl-a-mid-1', 'seed-epl-a-mid-2', 'seed-epl-a-mid-3', 'seed-epl-a-mid-4',
  'seed-epl-a-fwd-1', 'seed-epl-a-fwd-2',
];
const CLUB_B_IDS = [
  'seed-epl-b-gk-1', 'seed-epl-b-def-1', 'seed-epl-b-def-2', 'seed-epl-b-def-3', 'seed-epl-b-def-4',
  'seed-epl-b-mid-1', 'seed-epl-b-mid-2', 'seed-epl-b-mid-3', 'seed-epl-b-mid-4',
  'seed-epl-b-fwd-1', 'seed-epl-b-fwd-2',
];
// Club A's clean-sheet group per seed.sql step 6: GK + 4 DEF, not MID/FWD.
const CLUB_A_CLEAN_SHEET_IDS = ['seed-epl-a-gk-1', 'seed-epl-a-def-1', 'seed-epl-a-def-2', 'seed-epl-a-def-3', 'seed-epl-a-def-4'];

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

// ── 1. Ingest pipeline integrity ─────────────────────────────────────────────

test.describe('Scoring pipeline — ingest integrity', () => {
  test('scenario fixture has player_match_stats for every scenario player, 90 minutes each', async () => {
    const { data: rows } = await supabase
      .from('player_match_stats')
      .select('player_id, minutes_played')
      .eq('fixture_id', SCENARIO_FIXTURE_ID);

    expect(rows?.length, 'Expected exactly 22 scenario players (11 per club) — ingest may be incomplete')
      .toBe(22);
    expect((rows ?? []).every(r => r.minutes_played === 90),
      'Every scenario player should show 90 minutes played').toBe(true);
  });

  test('scenario fixture stats cover both clubs (11 each)', async () => {
    const { data: rows } = await supabase
      .from('player_match_stats')
      .select('player_id')
      .eq('fixture_id', SCENARIO_FIXTURE_ID)
      .in('player_id', [...CLUB_A_IDS, ...CLUB_B_IDS]);

    expect(rows?.length, 'Expected stats rows for all 22 named scenario players').toBe(22);
  });

  test('scenario match_events are present (goal + yellow card)', async () => {
    const { data: events } = await supabase
      .from('match_events')
      .select('type')
      .eq('fixture_id', SCENARIO_FIXTURE_ID);

    expect(events?.length, 'No match events for scenario fixture').toBeGreaterThan(0);

    const types = new Set(events.map(e => e.type));
    expect(types.has('goal'),   'No goal events found').toBe(true);
    expect(types.has('yellow'), 'No yellow-card event found').toBe(true);
  });

  test('no duplicate match_events for same player+minute+type (idempotent ingest)', async () => {
    const { data: events } = await supabase
      .from('match_events')
      .select('fixture_id, type, minute, player_id')
      .eq('fixture_id', SCENARIO_FIXTURE_ID)
      .not('player_id', 'is', null);

    const seen = new Set();
    let duplicates = 0;
    for (const ev of events ?? []) {
      const key = `${ev.fixture_id}:${ev.type}:${ev.minute}:${ev.player_id}`;
      if (seen.has(key)) duplicates++;
      seen.add(key);
    }
    expect(duplicates, 'Duplicate match_events detected — ingest not idempotent').toBe(0);
  });
});

// ── 2. Scoring correctness ────────────────────────────────────────────────────

test.describe('Scoring pipeline — point calculations', () => {
  test('goal scorer (seed-epl-a-fwd-1, 2 goals) has fantasy_points=14.0', async () => {
    const { data: goals } = await supabase
      .from('match_events')
      .select('player_id')
      .eq('fixture_id', SCENARIO_FIXTURE_ID)
      .eq('type', 'goal');

    expect(goals?.length, 'No goal events to check').toBe(2);
    expect(goals.every(g => g.player_id === 'seed-epl-a-fwd-1'), 'Both goals should be seed-epl-a-fwd-1').toBe(true);

    const { data: stats } = await supabase
      .from('player_match_stats')
      .select('fantasy_points, goals')
      .eq('fixture_id', SCENARIO_FIXTURE_ID)
      .eq('player_id', 'seed-epl-a-fwd-1')
      .single();

    expect(stats?.goals, 'seed-epl-a-fwd-1 should show 2 goals').toBe(2);
    expect(stats?.fantasy_points, 'seed-epl-a-fwd-1 should have fantasy_points=14.0').toBe(14.0);
  });

  test('clean sheet is awarded only to Club A\'s GK+4 DEF (5 players), not MID/FWD or Club B', async () => {
    const { data: rows } = await supabase
      .from('player_match_stats')
      .select('player_id, clean_sheet')
      .eq('fixture_id', SCENARIO_FIXTURE_ID)
      .eq('clean_sheet', true);

    const ids = (rows ?? []).map(r => r.player_id).sort();
    expect(ids, 'Clean sheet should be exactly Club A\'s GK + 4 DEF, per seed.sql step 6')
      .toEqual([...CLUB_A_CLEAN_SHEET_IDS].sort());
  });

  test('Club B (conceded 2-0) players all have goals_conceded=2', async () => {
    const { data: rows } = await supabase
      .from('player_match_stats')
      .select('player_id, goals_conceded, minutes_played')
      .eq('fixture_id', SCENARIO_FIXTURE_ID)
      .in('player_id', CLUB_B_IDS);

    expect(rows?.length, 'Expected 11 Club B stat rows').toBe(11);
    expect(rows.every(r => r.goals_conceded === 2), 'Every Club B player should show goals_conceded=2').toBe(true);
  });

  test('Club B keeper (seed-epl-b-gk-1) has 90 minutes, 2 conceded, fantasy_points=1.0', async () => {
    const { data: stats } = await supabase
      .from('player_match_stats')
      .select('minutes_played, goals_conceded, saves, fantasy_points')
      .eq('fixture_id', SCENARIO_FIXTURE_ID)
      .eq('player_id', 'seed-epl-b-gk-1')
      .single();

    expect(stats?.minutes_played, 'Club B keeper should have 90 minutes').toBe(90);
    expect(stats?.goals_conceded, 'Club B keeper should have conceded 2').toBe(2);
    expect(stats?.saves, 'Club B keeper should have 4 saves per seed.sql').toBe(4);
    expect(stats?.fantasy_points, 'Club B keeper fantasy_points should match seeded value 1.0').toBe(1.0);
  });

  test('booked player (seed-epl-b-def-1) has yellow_cards=1 and fantasy_points=0.0', async () => {
    const { data: stats } = await supabase
      .from('player_match_stats')
      .select('yellow_cards, fantasy_points')
      .eq('fixture_id', SCENARIO_FIXTURE_ID)
      .eq('player_id', 'seed-epl-b-def-1')
      .single();

    expect(stats?.yellow_cards, 'seed-epl-b-def-1 should have 1 yellow card').toBe(1);
    expect(stats?.fantasy_points, 'Booked Club B defender fantasy_points should be 0.0 per seed.sql').toBe(0.0);
  });
});

// ── 3. Season total accumulation ─────────────────────────────────────────────

test.describe('Scoring pipeline — season total tracking', () => {
  test('fantasy_points is one row per squad per matchday, using round-based matchday_id (e.g. 426-r1)', async () => {
    // fantasy_points has UNIQUE(squad_id, matchday_id) — one row per squad per
    // matchday holding the squad's summed total, not one row per player (see
    // calculate-scores/index.js's `upsert(..., { onConflict: 'squad_id,matchday_id' })`).
    const { data: rows } = await supabase
      .from('fantasy_points')
      .select('matchday_id, squad_id, total, points_breakdown')
      .eq('matchday_id', SCENARIO_MATCHDAY_ID);

    expect(rows?.length, 'No fantasy_points row with round-based matchday_id — season tracking broken')
      .toBe(1);

    const squadRow = rows[0];
    expect(squadRow.squad_id, 'fantasy_points row should belong to the seeded scenario squad').toBe(SCENARIO_SQUAD_ID);
    // 14.0 (fwd1) + 8.0 (gk1) + 2.0 * 9 (remaining Club A players) = 40.0
    expect(squadRow.total, 'squad fantasy_points.total should be the summed player total (40.0)').toBe(40.0);
    expect(squadRow.points_breakdown?.per_player?.['seed-epl-a-fwd-1'], 'per-player breakdown should mirror player_match_stats (14.0)').toBe(14.0);
  });

  test('E2E Classic League members have non-zero total_points', async () => {
    const { data: members } = await supabase
      .from('league_members')
      .select('total_points, user_id')
      .eq('league_id', CLASSIC_LEAGUE_ID)
      .order('total_points', { ascending: false });

    expect(members?.length, 'No league members found').toBeGreaterThan(0);

    const topScore = members?.[0]?.total_points ?? 0;
    expect(topScore, 'Top scorer has 0 points — season total not accumulated').toBeGreaterThan(0);
  });

  test('E2E Classic League top scorer has correct ranking (rank=1)', async () => {
    const { data: members } = await supabase
      .from('league_members')
      .select('rank, total_points')
      .eq('league_id', CLASSIC_LEAGUE_ID)
      .order('rank', { ascending: true })
      .limit(1)
      .single();

    expect(members?.rank, 'Rank not set').toBe(1);
    expect(members?.total_points ?? 0, 'Rank-1 manager has 0 points').toBeGreaterThan(0);
  });
});

// ── 4. Transfer window enforcement ───────────────────────────────────────────

test.describe('Scoring pipeline — transfer window via matchday_deadlines', () => {
  test('scenario round (426-r1) matchday_deadline exists (window enforcement record present)', async () => {
    const { data: deadline } = await supabase
      .from('matchday_deadlines')
      .select('matchday_id, deadline_at')
      .eq('matchday_id', SCENARIO_MATCHDAY_ID)
      .single();

    expect(deadline, '426-r1 deadline row missing').toBeTruthy();

    const deadlineTime = new Date(deadline.deadline_at).getTime();
    expect(deadlineTime, '426-r1 deadline should be a valid timestamp').toBeGreaterThan(0);
  });

  test('no duplicate matchday_deadline rows for any round', async () => {
    const { data: rows } = await supabase
      .from('matchday_deadlines')
      .select('deadline_at')
      .eq('tournament_id', EPL_TOURNAMENT_ID);

    const timestamps = (rows ?? []).map(r => r.deadline_at);
    const unique = new Set(timestamps);
    expect(unique.size, 'Duplicate matchday_deadlines found — cleanup may be needed')
      .toBe(timestamps.length);
  });
});

// ── 5. League screen UI ───────────────────────────────────────────────────────

test.describe('League screen — standings display', () => {
  test('League screen renders without JS errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await skipOnboarding(page);
    await page.goto('/league');
    await waitForContent(page);
    expect(errors, `JS errors on /league: ${errors.join(', ')}`).toHaveLength(0);
  });

  test('League screen shows standings or join-league prompt', async ({ page }) => {
    await skipOnboarding(page);
    await page.goto('/league');
    await waitForContent(page);
    const body = await page.locator('body').innerText();
    const upper = body.toUpperCase();
    expect(
      upper.includes('STANDING') ||
      upper.includes('PTS') ||
      upper.includes('LEAGUE') ||
      upper.includes('JOIN'),
      'League screen has no standings, points, or join prompt'
    ).toBe(true);
  });

  test('League screen is readable at 375px mobile viewport', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.setViewportSize({ width: 375, height: 812 });
    await skipOnboarding(page);
    await page.goto('/league');
    await waitForContent(page);
    const body = await page.locator('body').innerText();
    expect(body.trim().length).toBeGreaterThan(10);
    expect(errors).toHaveLength(0);
  });
});

// ── 6. Match events on Live screen ───────────────────────────────────────────

test.describe('Live screen — match event feed', () => {
  test('match_events table has entries for the scenario round\'s 1 finished fixture', async () => {
    const { data: fixtures } = await supabase
      .from('fixtures')
      .select('id')
      .eq('tournament_id', EPL_TOURNAMENT_ID)
      .eq('round_number', SCENARIO_ROUND)
      .eq('status', 'finished');

    expect(fixtures?.length, 'Scenario round fixture not found').toBe(1);
    expect(fixtures[0].id).toBe(SCENARIO_FIXTURE_ID);

    const { data: events } = await supabase
      .from('match_events')
      .select('id')
      .eq('fixture_id', fixtures[0].id)
      .limit(1);

    expect(events?.length ?? 0,
      `Fixture ${fixtures[0].id} has no match_events — live feed will be empty`
    ).toBeGreaterThan(0);
  });

  test('event types stored match the allowed enum (goal, yellow, red, sub)', async () => {
    const { data: events } = await supabase
      .from('match_events')
      .select('type')
      .eq('fixture_id', SCENARIO_FIXTURE_ID);

    const allowedTypes = new Set(['goal', 'yellow', 'red', 'sub']);
    for (const ev of events ?? []) {
      expect(allowedTypes.has(ev.type), `Unknown event type: ${ev.type}`).toBe(true);
    }
  });
});
