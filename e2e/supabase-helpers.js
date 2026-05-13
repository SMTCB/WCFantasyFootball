// Supabase Real Data Helpers
// Connects to production database for E2E tests using actual API data

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://sssmvihxtqtohisghjet.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzc212aWh4dHF0b2hpc2doamV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDgyOTc5ODcsImV4cCI6MTcyMzg3Mzk4N30.LAeWx39REi6K2L46bY2g3PlvEaWM7p7TJdEZxtvXq8c';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Fetch real completed fixtures with match data
 * Returns fixtures that have finished (status='finished') with real Premier League data
 */
export async function fetchRealFixtures(limit = 5) {
  const { data, error } = await supabase
    .from('fixtures')
    .select('*')
    .eq('status', 'finished')
    .order('kickoff_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching fixtures:', error);
    return [];
  }
  return data || [];
}

/**
 * Fetch match events for a specific fixture
 * Real events from Forza API: goals, assists, yellow cards, substitutions
 */
export async function fetchMatchEvents(fixtureId, limit = 100) {
  const { data, error } = await supabase
    .from('match_events')
    .select('*')
    .eq('fixture_id', fixtureId)
    .limit(limit);

  if (error) {
    console.error('Error fetching match events:', error);
    return [];
  }
  return data || [];
}

/**
 * Fetch real players from Supabase (654 available from Forza API)
 * Includes position, club, price, and other stats
 */
export async function fetchRealPlayers(limit = 20) {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .order('price', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching players:', error);
    return [];
  }
  return data || [];
}

/**
 * Fetch player match statistics for a fixture
 * Real scoring data: minutes played, goals, assists, tackles, etc.
 */
export async function fetchPlayerMatchStats(fixtureId) {
  const { data, error } = await supabase
    .from('player_match_stats')
    .select('*')
    .eq('fixture_id', fixtureId);

  if (error) {
    console.error('Error fetching player match stats:', error);
    return [];
  }
  return data || [];
}

/**
 * Fetch available leagues (real user-created leagues)
 */
export async function fetchRealLeagues(limit = 1) {
  const { data, error } = await supabase
    .from('leagues')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching leagues:', error);
    return [];
  }
  return data || [];
}

/**
 * Load all real test data upfront (called in test.beforeAll)
 */
export async function loadRealTestData() {
  const fixtures = await fetchRealFixtures(3);
  const leagues = await fetchRealLeagues(1);

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

/**
 * Format player name for display (handles various formats)
 */
export function formatPlayerName(player) {
  if (!player) return 'Unknown';
  return player.name || player.player_name || 'Unknown';
}

/**
 * Format team abbreviation (e.g., 'Manchester City' -> 'MCI')
 */
export function formatTeamAbbr(team) {
  if (!team) return '';
  const abbr = team.substring(0, 3).toUpperCase();
  return abbr;
}
