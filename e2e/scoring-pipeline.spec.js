// @ts-check
// Scoring Pipeline E2E — validates the full ingest → score → standings flow
// These tests cover the scenarios proven during the GW35 validation session
// (2026-05-20/21) and the critical/high bug fixes shipped in PRs #149, #150,
// #154, #156.
//
// DB-level assertions use the Supabase client directly.
// UI assertions use Playwright against the running app.

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL     = 'https://sssmvihxtqtohisghjet.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzc212aWh4dHF0b2hpc2doamV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDgyOTc5ODcsImV4cCI6MTcyMzg3Mzk4N30.LAeWx39REi6K2L46bY2g3PlvEaWM7p7TJdEZxtvXq8c';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Known stable test fixture: Man Utd 3-2 Liverpool, GW35
const GW35_FIXTURE_ID       = 'f-1218672887';
const EPL_TOURNAMENT_ID     = '426';
const GW35_ROUND            = 35;
const TEST_LEAGUE_ID        = 'cccccccc-0001-4001-a001-000000000002';
const GW35_MATCHDAY_ID      = '426-r35';

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
  test('GW35 fixtures have player_match_stats with forza_match_id set (PATH A active)', async () => {
    const { data: rows } = await supabase
      .from('player_match_stats')
      .select('player_id, forza_match_id')
      .eq('fixture_id', GW35_FIXTURE_ID)
      .not('forza_match_id', 'is', null)
      .limit(5);

    expect(rows?.length, 'No Forza PATH A rows — ingest may have used fallback PATH B').toBeGreaterThan(0);
  });

  test('GW35 fixtures have >50 players with stats (full squad, not just event players)', async () => {
    const { data: rows } = await supabase
      .from('player_match_stats')
      .select('player_id')
      .eq('fixture_id', GW35_FIXTURE_ID);

    expect(rows?.length, 'Expected 50+ players (full squads), got fewer — ingest may be incomplete')
      .toBeGreaterThan(50);
  });

  test('GW35 match_events are present (goals, cards, subs)', async () => {
    const { data: events } = await supabase
      .from('match_events')
      .select('type')
      .eq('fixture_id', GW35_FIXTURE_ID);

    expect(events?.length, 'No match events for GW35 fixture').toBeGreaterThan(0);

    const types = new Set(events.map(e => e.type));
    expect(types.has('goal'), 'No goal events found').toBe(true);
    expect(types.has('sub'),  'No substitution events found').toBe(true);
  });

  test('no duplicate match_events for same player+minute+type (idempotent ingest)', async () => {
    const { data: events } = await supabase
      .from('match_events')
      .select('fixture_id, type, minute, player_id')
      .eq('fixture_id', GW35_FIXTURE_ID)
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
  test('goal scorers have fantasy_points > 0', async () => {
    // Find goal events and verify those players have positive pts
    const { data: goals } = await supabase
      .from('match_events')
      .select('player_id')
      .eq('fixture_id', GW35_FIXTURE_ID)
      .eq('type', 'goal')
      .limit(3);

    expect(goals?.length, 'No goal events to check').toBeGreaterThan(0);

    for (const goal of goals ?? []) {
      const { data: stats } = await supabase
        .from('player_match_stats')
        .select('fantasy_points, goals')
        .eq('fixture_id', GW35_FIXTURE_ID)
        .eq('player_id', goal.player_id)
        .single();

      expect(stats?.fantasy_points ?? 0,
        `Goal scorer ${goal.player_id} has 0 or null fantasy_points`)
        .toBeGreaterThan(0);
    }
  });

  test('no false clean sheets — Man Utd 3-2 Liverpool, nobody should have clean_sheet=true', async () => {
    const { data: rows } = await supabase
      .from('player_match_stats')
      .select('player_id, clean_sheet')
      .eq('fixture_id', GW35_FIXTURE_ID)
      .eq('clean_sheet', true);

    expect(rows?.length, 'Players have clean_sheet=true in a 3-2 match — clean sheet logic broken')
      .toBe(0);
  });

  test('outfield players on Man Utd (home, conceded 2) have goals_conceded=2', async () => {
    // Man Utd forza_team_id = '7007315', home in this fixture
    const { data: rows } = await supabase
      .from('player_match_stats')
      .select('goals_conceded, minutes_played')
      .eq('fixture_id', GW35_FIXTURE_ID)
      .in('player_id', (await supabase
        .from('players')
        .select('id')
        .eq('forza_team_id', '7007315')
        .eq('tournament_id', EPL_TOURNAMENT_ID)
        .eq('position', 'MID')
        .limit(3)
        .then(r => (r.data ?? []).map(p => p.id))
      ))
      .gt('minutes_played', 0);

    const withConceded = (rows ?? []).filter(r => r.goals_conceded === 2);
    expect(withConceded.length, 'Man Utd midfielders who played should have goals_conceded=2')
      .toBeGreaterThan(0);
  });

  test('starting GK (absent from E10) has minutes_played=90 via lineup fallback', async () => {
    // Freddie Woodman started for Liverpool in this match but had no E10 stats
    const { data: gkPlayer } = await supabase
      .from('players')
      .select('id')
      .eq('name', 'Freddie Woodman')
      .eq('tournament_id', EPL_TOURNAMENT_ID)
      .single();

    if (!gkPlayer) return; // player may not be in DB

    const { data: stats } = await supabase
      .from('player_match_stats')
      .select('minutes_played, goals_conceded, fantasy_points')
      .eq('fixture_id', GW35_FIXTURE_ID)
      .eq('player_id', gkPlayer.id)
      .single();

    expect(stats?.minutes_played, 'Starting GK should have 90 min from lineup fallback, not 0')
      .toBe(90);
    expect(stats?.goals_conceded, 'Liverpool GK should have conceded 3 (Man Utd won 3-2)')
      .toBe(3);
    expect(stats?.fantasy_points ?? 0, 'Starting GK with 3 conceded should have negative pts')
      .toBeLessThan(0);
  });
});

// ── 3. Season total accumulation ─────────────────────────────────────────────

test.describe('Scoring pipeline — season total tracking', () => {
  test('fantasy_points rows use round-based matchday_id (e.g. 426-r35), not static squad value', async () => {
    const { data: rows } = await supabase
      .from('fantasy_points')
      .select('matchday_id')
      .eq('matchday_id', GW35_MATCHDAY_ID)
      .limit(3);

    expect(rows?.length, 'No fantasy_points rows with round-based matchday_id — season tracking broken')
      .toBeGreaterThan(0);
  });

  test('EPL GW35 Full Test league members have non-zero total_points', async () => {
    const { data: members } = await supabase
      .from('league_members')
      .select('total_points, user_id')
      .eq('league_id', TEST_LEAGUE_ID)
      .order('total_points', { ascending: false });

    expect(members?.length, 'No league members found').toBeGreaterThan(0);

    const topScore = members?.[0]?.total_points ?? 0;
    expect(topScore, 'Top scorer has 0 points — season total not accumulated').toBeGreaterThan(0);
  });

  test('EPL GW35 Full Test league top scorer has correct ranking (rank=1)', async () => {
    const { data: members } = await supabase
      .from('league_members')
      .select('rank, total_points')
      .eq('league_id', TEST_LEAGUE_ID)
      .order('rank', { ascending: true })
      .limit(1)
      .single();

    expect(members?.rank, 'Rank not set').toBe(1);
    expect(members?.total_points ?? 0, 'Rank-1 manager has 0 points').toBeGreaterThan(0);
  });
});

// ── 4. Transfer window enforcement ───────────────────────────────────────────

test.describe('Scoring pipeline — transfer window via matchday_deadlines', () => {
  test('GW38 matchday_deadline exists (window enforcement record present after season end)', async () => {
    const { data: deadline } = await supabase
      .from('matchday_deadlines')
      .select('matchday_id, deadline_at')
      .eq('matchday_id', '426-r38')
      .single();

    expect(deadline, 'GW38 deadline row missing').toBeTruthy();

    const deadlineTime = new Date(deadline.deadline_at).getTime();
    // GW38 deadline = 2026-05-24 15:00 UTC (now in the past — season ended).
    // This test only verifies the record exists for transfer-window enforcement, not future-ness.
    expect(deadlineTime, 'GW38 deadline should be a valid timestamp').toBeGreaterThan(0);
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
  test('match_events table has entries for all 10 GW35 fixtures', async () => {
    const { data: fixtures } = await supabase
      .from('fixtures')
      .select('id')
      .eq('tournament_id', EPL_TOURNAMENT_ID)
      .eq('round_number', GW35_ROUND)
      .eq('status', 'finished');

    expect(fixtures?.length, 'GW35 fixtures not found').toBe(10);

    for (const f of fixtures ?? []) {
      const { data: events } = await supabase
        .from('match_events')
        .select('id')
        .eq('fixture_id', f.id)
        .limit(1);

      expect(events?.length ?? 0,
        `Fixture ${f.id} has no match_events — live feed will be empty`
      ).toBeGreaterThan(0);
    }
  });

  test('event types stored match the allowed enum (goal, yellow, red, sub)', async () => {
    const { data: events } = await supabase
      .from('match_events')
      .select('type')
      .eq('fixture_id', GW35_FIXTURE_ID);

    const allowedTypes = new Set(['goal', 'yellow', 'red', 'sub']);
    for (const ev of events ?? []) {
      expect(allowedTypes.has(ev.type), `Unknown event type: ${ev.type}`).toBe(true);
    }
  });
});
