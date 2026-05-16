// @ts-check
// Shared Supabase data helpers for E2E tests.
// Re-exports the existing `supabase-helpers.js` API plus a few additional
// queries (managers, leagues with member counts, bet instances) needed by the
// new test files. The supabase client is shared so we don't open extra
// connections per test file.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://sssmvihxtqtohisghjet.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzc212aWh4dHF0b2hpc2doamV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDgyOTc5ODcsImV4cCI6MTcyMzg3Mzk4N30.LAeWx39REi6K2L46bY2g3PlvEaWM7p7TJdEZxtvXq8c';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ─── Fixtures & match data ─────────────────────────────────────────────── */

export async function fetchRealFixtures(limit = 5) {
  const { data } = await supabase
    .from('fixtures')
    .select('*')
    .eq('status', 'finished')
    .order('kickoff_at', { ascending: false })
    .limit(limit);
  return data || [];
}

export async function fetchUpcomingFixtures(limit = 5) {
  const { data } = await supabase
    .from('fixtures')
    .select('*')
    .in('status', ['scheduled', 'in_progress'])
    .order('kickoff_at', { ascending: true })
    .limit(limit);
  return data || [];
}

export async function fetchMatchEvents(fixtureId, limit = 100) {
  const { data } = await supabase
    .from('match_events')
    .select('*')
    .eq('fixture_id', fixtureId)
    .limit(limit);
  return data || [];
}

export async function fetchPlayerMatchStats(fixtureId) {
  const { data } = await supabase
    .from('player_match_stats')
    .select('*')
    .eq('fixture_id', fixtureId);
  return data || [];
}

/* ─── Players & squads ──────────────────────────────────────────────────── */

export async function fetchRealPlayers(limit = 20) {
  const { data } = await supabase
    .from('players')
    .select('*')
    .order('price', { ascending: false })
    .limit(limit);
  return data || [];
}

export async function fetchPlayersByPosition(position, limit = 10) {
  const { data } = await supabase
    .from('players')
    .select('*')
    .eq('position', position)
    .order('price', { ascending: false })
    .limit(limit);
  return data || [];
}

/* ─── Leagues ───────────────────────────────────────────────────────────── */

export async function fetchRealLeagues(limit = 5) {
  const { data } = await supabase
    .from('leagues')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

export async function fetchLeagueMembers(leagueId) {
  const { data } = await supabase
    .from('league_members')
    .select('*')
    .eq('league_id', leagueId);
  return data || [];
}

/* ─── Bets ──────────────────────────────────────────────────────────────── */

export async function fetchBetInstances(leagueId, limit = 10) {
  const query = supabase
    .from('bet_instances')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (leagueId) query.eq('league_id', leagueId);
  const { data } = await query;
  return data || [];
}

/* ─── Aggregator ─────────────────────────────────────────────────────────── */

export async function loadRealTestData() {
  const fixtures = await fetchRealFixtures(3);
  const leagues  = await fetchRealLeagues(2);

  let selectedFixture = null;
  let matchEvents = [];
  let playerStats = [];

  if (fixtures.length > 0) {
    selectedFixture = fixtures[0];
    matchEvents = await fetchMatchEvents(selectedFixture.id);
    playerStats = await fetchPlayerMatchStats(selectedFixture.id);
  }

  const players = await fetchRealPlayers(30);

  return {
    fixtures,
    selectedFixture,
    matchEvents,
    playerStats,
    players,
    leagues,
    league: leagues[0] || null,
  };
}

/* ─── Formatters ─────────────────────────────────────────────────────────── */

export function formatPlayerName(player) {
  if (!player) return 'Unknown';
  return player.name || player.player_name || 'Unknown';
}

export function formatTeamAbbr(team) {
  if (!team) return '';
  return team.substring(0, 3).toUpperCase();
}
