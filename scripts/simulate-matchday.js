#!/usr/bin/env node
/* global process */
// simulate-matchday.js
// Seeds a fixture as live, inserts match events, calls calculate-scores,
// then reads back player_match_stats and fantasy_points.
//
// Usage:
//   SUPABASE_URL=https://xxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//   CALCULATE_SCORES_URL=https://xxx.supabase.co/functions/v1/calculate-scores \
//   node scripts/simulate-matchday.js

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL            = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CALCULATE_SCORES_URL    = process.env.CALCULATE_SCORES_URL
  || `${SUPABASE_URL}/functions/v1/calculate-scores`;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌  Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── Simulation config ──────────────────────────────────────────────────────────

const FIXTURE_ID  = 'sim-fixture-001';
const HOME_TEAM   = 'Liverpool';
const AWAY_TEAM   = 'Arsenal';
const MATCHDAY_ID = 'sim-md-01';

// Player IDs must match rows in the players table (or be seeded below)
const PLAYERS = [
  { id: 'sim-p1', name: 'Alisson',      club: HOME_TEAM, position: 'GK'  },
  { id: 'sim-p2', name: 'van Dijk',     club: HOME_TEAM, position: 'DEF' },
  { id: 'sim-p3', name: 'Mo Salah',     club: HOME_TEAM, position: 'FWD' },
  { id: 'sim-p4', name: 'Trent AA',     club: HOME_TEAM, position: 'DEF' },
  { id: 'sim-p5', name: 'Saka',         club: AWAY_TEAM, position: 'MID' },
  { id: 'sim-p6', name: 'Ødegaard',     club: AWAY_TEAM, position: 'MID' },
];

// Events to simulate
const EVENTS = [
  { player_id: 'sim-p3', type: 'goal',   minute: '22', team: HOME_TEAM },
  { player_id: 'sim-p3', type: 'goal',   minute: '45', team: HOME_TEAM },
  { player_id: 'sim-p4', type: 'assist', minute: '45', team: HOME_TEAM },
  { player_id: 'sim-p5', type: 'goal',   minute: '60', team: AWAY_TEAM },
  { player_id: 'sim-p6', type: 'assist', minute: '60', team: AWAY_TEAM },
  { player_id: 'sim-p3', type: 'yellow', minute: '75', team: HOME_TEAM },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg) { console.log(msg); }
function ok(label, val) { console.log(`  ✅  ${label}:`, val); }
function warn(label, val) { console.log(`  ⚠️   ${label}:`, val); }
function err(label, val) { console.error(`  ❌  ${label}:`, val); }

async function must(label, promise) {
  const { data, error } = await promise;
  if (error) { err(label, error.message); process.exit(1); }
  ok(label, 'ok');
  return data;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log('\n🚀  Forza Fantasy League — Matchday Simulation\n');

  // 1. Seed players (upsert so re-runs are idempotent)
  log('1. Seeding players…');
  await must('upsert players', supabase.from('players')
    .upsert(PLAYERS.map(p => ({ id: p.id, name: p.name, club: p.club, position: p.position, price: 7.0 })),
      { onConflict: 'id' }));

  // 2. Seed fixture as live
  log('2. Creating live fixture…');
  await must('upsert fixture', supabase.from('fixtures')
    .upsert([{
      id: FIXTURE_ID,
      home_team: HOME_TEAM,
      away_team: AWAY_TEAM,
      status: 'live',
      minute: '75',
      kickoff_at: new Date(Date.now() - 75 * 60 * 1000).toISOString(),
    }], { onConflict: 'id' }));

  // 3. Clear old events for this fixture then insert fresh ones
  log('3. Seeding match events…');
  await supabase.from('match_events').delete().eq('fixture_id', FIXTURE_ID);
  await must('insert events', supabase.from('match_events')
    .insert(EVENTS.map(e => ({ ...e, fixture_id: FIXTURE_ID }))));

  // 4. Call calculate-scores Edge Function
  log('4. Calling calculate-scores Edge Function…');
  const res = await fetch(CALCULATE_SCORES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ fixture_id: FIXTURE_ID }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    err('calculate-scores HTTP error', `${res.status} — ${JSON.stringify(payload)}`);
    process.exit(1);
  }
  ok('calculate-scores', JSON.stringify(payload));

  // 5. Read back player_match_stats
  log('\n5. Player match stats:');
  const { data: stats } = await supabase
    .from('player_match_stats')
    .select('player_id, goals, assists, yellow_cards, fantasy_points')
    .eq('fixture_id', FIXTURE_ID);

  if (!stats || stats.length === 0) {
    warn('player_match_stats', 'no rows — check Edge Function logs');
  } else {
    for (const s of stats) {
      const player = PLAYERS.find(p => p.id === s.player_id);
      console.log(`    ${(player?.name ?? s.player_id).padEnd(14)} | G:${s.goals} A:${s.assists} Y:${s.yellow_cards} | ${s.fantasy_points} pts`);
    }
  }

  // 6. Read back fantasy_points totals
  log('\n6. Squad fantasy_points totals:');
  const { data: fpts } = await supabase
    .from('fantasy_points')
    .select('squad_id, matchday_id, total')
    .eq('matchday_id', MATCHDAY_ID);

  if (!fpts || fpts.length === 0) {
    warn('fantasy_points', 'no rows (no squads with sim players or matchday_id mismatch)');
  } else {
    for (const fp of fpts) {
      console.log(`    squad ${fp.squad_id} | matchday ${fp.matchday_id} | ${fp.total} pts`);
    }
  }

  log('\n✅  Simulation complete.\n');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
