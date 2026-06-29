// Edge Function: calculate-scores  (v31 — settled-round guard: once effective_xi is frozen, refuse to rescore; v30 — freeze live_xi snapshot when squad.matchday_id advances; v29 bug: roundComplete gate on squadAdvanced meant every live pass overwrote the snapshot with post-transfer XI)
// Calculates fantasy points for all squads for a given fixture.
// Called by ingest-match-events (Forza live path) or directly (mock/manual path).
//
// POST body: { fixture_id: string }
// Returns:   { ok: true, updated_squads: number, player_stats: number, source: string }
//
// ─── Two execution paths ────────────────────────────────────────────────────────
//
// PATH A — Forza data (preferred):
//   ingest-match-events has already populated player_match_stats with rich stats
//   from the Forza API (forza_match_id is not null on those rows).
//   This function reads those rows directly, skips event aggregation, and only
//   handles BPS ranking + scoring + squad rollup.
//
// PATH B — Manual / mock data (fallback):
//   No Forza stats exist for this fixture. Aggregate from match_events table
//   (the original behaviour, unchanged).
//
// ─── Scoring source of truth ────────────────────────────────────────────────────
//   Scoring rules are loaded from the scoring_rules table (keyed by tournament_id
//   + position). Hard-coded defaults below are used only if no DB rows exist,
//   ensuring scoring is always competition-agnostic without code changes.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { logError as _logError } from '../_shared/log.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
);

const logError = (severity, message, context = {}) => _logError('calculate-scores', severity, message, context);

// ─── Hard-coded fallback scoring (used only if scoring_rules table is empty) ───
// These match the EPL 2025/26 season rules exactly.

const FALLBACK_POINTS = {
  GK:  { goal: 5, assist: 3, clean_sheet: 4, conceded_per_goal: 0, penalty_saved: 5, save: 0.5,  tackle: 0,   interception: 0,    penalty_scored: 0, key_pass: 0,    shot_on_target: 0,    big_chance_created: 0 },
  DEF: { goal: 5, assist: 2, clean_sheet: 4, conceded_per_goal: 0, penalty_saved: 0, save: 0,    tackle: 0.5, interception: 0.25, penalty_scored: 0, key_pass: 0,    shot_on_target: 0,    big_chance_created: 0 },
  MID: { goal: 4, assist: 2, clean_sheet: 0, conceded_per_goal: 0, penalty_saved: 0, save: 0,    tackle: 0,   interception: 0,    penalty_scored: 0, key_pass: 0.25, shot_on_target: 0.5,  big_chance_created: 0 },
  FWD: { goal: 4, assist: 2, clean_sheet: 0, conceded_per_goal: 0, penalty_saved: 0, save: 0,    tackle: 0,   interception: 0,    penalty_scored: 0, key_pass: 0,    shot_on_target: 0.25, big_chance_created: 1.0 },
};

const FALLBACK_UNIVERSAL = {
  minute_per_90:    1,
  own_goal:         -2,
  yellow_card:      -1,
  red_card:         -3,
  penalty_missed:   -1,
  // Penalty shootout — scored differently from regular in-match penalties
  shootout_scored:  1,
  shootout_missed:  -1,
  shootout_saved:   0.5,   // GK only (applied per save, not per miss — ingest sets correct count)
};

// ─── Load scoring rules from DB ────────────────────────────────────────────────

async function loadScoringRules(tournament_id) {
  const { data: rows, error } = await supabase
    .from('scoring_rules')
    .select('position, rules')
    .eq('tournament_id', tournament_id);

  if (error || !rows?.length) {
    console.warn(`[calculate-scores] No scoring_rules found for tournament ${tournament_id} — using fallback constants`);
    return { POINTS: FALLBACK_POINTS, UNIVERSAL: FALLBACK_UNIVERSAL };
  }

  const POINTS    = { ...FALLBACK_POINTS };
  let   UNIVERSAL = { ...FALLBACK_UNIVERSAL };

  for (const row of rows) {
    if (row.position === 'UNIVERSAL') {
      UNIVERSAL = { ...FALLBACK_UNIVERSAL, ...row.rules };
    } else if (['GK', 'DEF', 'MID', 'FWD'].includes(row.position)) {
      POINTS[row.position] = { ...FALLBACK_POINTS[row.position], ...row.rules };
    }
  }

  return { POINTS, UNIVERSAL };
}

// ─── BPS ranking ───────────────────────────────────────────────────────────────

function calcBPS(stats) {
  // Pass completion: only calculate if we have both accurate and total passes
  const totalPasses = stats.total_passes ?? 0;
  const accuratePasses = stats.accurate_passes ?? 0;
  const passCompletion = totalPasses > 0
    ? (accuratePasses / totalPasses) * 100
    : 0;

  return (
    (stats.goals            ?? 0) * 30   +
    (stats.assists          ?? 0) * 10   +
    (stats.minutes_played   ?? stats.minutes ?? 0) / 5 +
    (stats.tackles_won      ?? 0) * 1.5  +
    (stats.interceptions    ?? 0) * 1    +
    (stats.shots_on_target  ?? 0) * 3    +
    passCompletion * 0.1
  );
}

function assignBonus(playerStatsList) {
  const ranked = [...playerStatsList].sort((a, b) => b.bps - a.bps);
  const bonusMap = { 0: 3, 1: 2, 2: 1 };
  ranked.forEach((p, i) => { p.bonus = bonusMap[i] ?? 0; });
}

// ─── Core scoring function ─────────────────────────────────────────────────────

function scorePlayer(stats, position, POINTS, UNIVERSAL) {
  const pos   = (position || 'MID').toUpperCase();
  const rules = POINTS[pos] || POINTS.MID;
  const mins  = stats.minutes_played ?? stats.minutes ?? 0;
  let pts = 0;

  pts += (mins / 60) * UNIVERSAL.minute_per_90;
  pts += (stats.goals   ?? 0) * rules.goal;
  pts += (stats.assists ?? 0) * rules.assist;

  // GK and DEF clean sheet require 45+ min; MID keeps the 60-min gate
  const csMinThreshold = (pos === 'DEF' || pos === 'GK') ? 45 : 60;
  if (stats.clean_sheet && mins >= csMinThreshold && rules.clean_sheet > 0) {
    pts += rules.clean_sheet;
  }

  // Goals conceded beyond the first incur a penalty for GK/DEF
  const concededBeyondFirst = Math.max(0, (stats.goals_conceded ?? 0) - 1);
  pts += concededBeyondFirst * (rules.conceded_2plus_penalty ?? 0);

  pts += (stats.penalty_saved  ?? 0) * (rules.penalty_saved  ?? 0);
  pts += (stats.own_goals      ?? 0) * UNIVERSAL.own_goal;
  pts += (stats.yellow_cards   ?? 0) * UNIVERSAL.yellow_card;
  pts += (stats.red_cards      ?? 0) * UNIVERSAL.red_card;
  pts += (stats.penalty_missed ?? 0) * UNIVERSAL.penalty_missed;

  pts += (stats.tackles_won        ?? 0) * (rules.tackle            ?? 0);
  pts += (stats.interceptions      ?? 0) * (rules.interception       ?? 0);
  pts += (stats.penalty_scored     ?? 0) * (rules.penalty_scored     ?? 0);
  pts += (stats.saves              ?? 0) * (rules.save               ?? 0);
  pts += (stats.key_passes         ?? 0) * (rules.key_pass           ?? 0);
  pts += (stats.shots_on_target    ?? 0) * (rules.shot_on_target     ?? 0);
  pts += (stats.big_chances_created ?? 0) * (rules.big_chance_created ?? 0);

  // Penalty shootout — separate from regular penalty scoring
  pts += (stats.shootout_scored ?? 0) * (UNIVERSAL.shootout_scored ?? 0);
  pts += (stats.shootout_missed ?? 0) * (UNIVERSAL.shootout_missed ?? 0);
  pts += (stats.shootout_saved  ?? 0) * (UNIVERSAL.shootout_saved  ?? 0);

  return Math.round(pts * 100) / 100;
}

function buildBreakdown(stats, pos, POINTS, UNIVERSAL) {
  const p     = (pos || 'MID').toUpperCase();
  const rules = POINTS[p] || POINTS.MID;
  const mins  = stats.minutes_played ?? stats.minutes ?? 0;
  return {
    minutes:           Math.round((mins / 60) * UNIVERSAL.minute_per_90 * 100) / 100,
    goals:             (stats.goals              ?? 0) * rules.goal,
    assists:           (stats.assists            ?? 0) * rules.assist,
    clean_sheet:       (stats.clean_sheet && mins >= ((p === 'DEF' || p === 'GK') ? 45 : 60) && rules.clean_sheet > 0) ? rules.clean_sheet : 0,
    goals_conceded:    Math.max(0, (stats.goals_conceded ?? 0) - 1) * (rules.conceded_2plus_penalty ?? 0),
    own_goals:         (stats.own_goals          ?? 0) * UNIVERSAL.own_goal,
    yellow_cards:      (stats.yellow_cards       ?? 0) * UNIVERSAL.yellow_card,
    red_cards:         (stats.red_cards          ?? 0) * UNIVERSAL.red_card,
    penalty_saved:     (stats.penalty_saved      ?? 0) * (rules.penalty_saved      ?? 0),
    penalty_scored:    (stats.penalty_scored     ?? 0) * (rules.penalty_scored     ?? 0),
    penalty_missed:    (stats.penalty_missed     ?? 0) * UNIVERSAL.penalty_missed,
    tackles:           (stats.tackles_won        ?? 0) * (rules.tackle             ?? 0),
    interceptions:     (stats.interceptions      ?? 0) * (rules.interception       ?? 0),
    saves:             (stats.saves              ?? 0) * (rules.save               ?? 0),
    key_passes:        (stats.key_passes         ?? 0) * (rules.key_pass           ?? 0),
    shots_on_target:   (stats.shots_on_target    ?? 0) * (rules.shot_on_target     ?? 0),
    big_chances:       (stats.big_chances_created ?? 0) * (rules.big_chance_created ?? 0),
    // Penalty shootout
    ...(((stats.shootout_scored ?? 0) || (stats.shootout_missed ?? 0) || (stats.shootout_saved ?? 0)) ? {
      shootout_scored: (stats.shootout_scored ?? 0) * (UNIVERSAL.shootout_scored ?? 0),
      shootout_missed: (stats.shootout_missed ?? 0) * (UNIVERSAL.shootout_missed ?? 0),
      shootout_saved:  (stats.shootout_saved  ?? 0) * (UNIVERSAL.shootout_saved  ?? 0),
    } : {}),
  };
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function respond(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST')    return respond(405, { error: 'POST required' });

  // ── H6: Authorization guard ────────────────────────────────────────────────
  // verify_jwt=false means Supabase doesn't enforce JWT automatically.
  // Guard: service-role key (cron path) OR a valid user JWT (admin manual button).
  // Blocks anon-key-only callers who could otherwise trigger global score recalcs.
  //
  // Two acceptance paths:
  //  A) Exact match against SUPABASE_SERVICE_ROLE_KEY env var (new sb_secret_... format)
  //  B) JWT payload has role=service_role (old eyJ... format still used by crons)
  //  C) Valid authenticated user JWT
  const authHeader = req.headers.get('Authorization') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  let isServiceRole = authHeader === `Bearer ${serviceRoleKey}`;

  // Path B: old-format service-role JWT — decode payload and check role claim.
  // Supabase JWTs are signed; we check the claim only (not the signature) because
  // the JWT secret is not auto-injected. Acceptable: the guard prevents casual abuse,
  // not cryptographic forgery — actual DB writes are scoped by the function's own client.
  if (!isServiceRole) {
    try {
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        isServiceRole = payload.role === 'service_role';
      }
    } catch { /* malformed JWT — not service role */ }
  }

  if (!isServiceRole) {
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!user) return respond(401, { error: 'Unauthorized' });
  }

  let fixture_id;
  try { ({ fixture_id } = await req.json()); }
  catch { return respond(400, { error: 'Invalid JSON body' }); }
  if (!fixture_id) return respond(400, { error: 'fixture_id required' });

  try {
    // ── Load fixture (including tournament_id for scoring rules lookup) ────────
    const { data: fixture, error: fixErr } = await supabase
      .from('fixtures')
      .select('id, home_team, away_team, status, tournament_id')
      .eq('id', fixture_id)
      .single();

    if (fixErr || !fixture) return respond(404, { error: 'Fixture not found' });

    // ── Load scoring rules for this tournament ─────────────────────────────────
    const { POINTS, UNIVERSAL } = await loadScoringRules(fixture.tournament_id ?? '');

    // ── Detect which path to use ───────────────────────────────────────────────
    const { data: forzaRows } = await supabase
      .from('player_match_stats')
      .select('id')
      .eq('fixture_id', fixture_id)
      .not('forza_match_id', 'is', null)
      .limit(1);

    const useForzaPath = forzaRows && forzaRows.length > 0;

    // ══════════════════════════════════════════════════════════════════════════
    // PATH A — Forza stats already in player_match_stats
    // ══════════════════════════════════════════════════════════════════════════
    if (useForzaPath) {
      const { data: rows } = await supabase
        .from('player_match_stats')
        .select('*')
        .eq('fixture_id', fixture_id)
        .not('forza_match_id', 'is', null);

      if (!rows?.length) {
        return respond(200, { ok: true, message: 'No Forza stats yet', updated_squads: 0, player_stats: 0, source: 'forza' });
      }

      // Fetch player positions separately
      const playerIds = rows.map(r => r.player_id);
      const { data: playerRows } = await supabase
        .from('players')
        .select('id, position')
        .in('id', playerIds);

      const positionMap = {};
      for (const p of playerRows ?? []) positionMap[p.id] = p.position;

      // V2: BPS bonus removed — every point comes directly from a stat
      const withBps = rows.map(r => ({
        ...r,
        position: positionMap[r.player_id] ?? 'MID',
        bps:      0,
        bonus:    0,
      }));

      // Score each player and write back bps_score, bonus_points, fantasy_points
      const statUpserts = withBps.map(r => {
        const pts = scorePlayer({ ...r, bonus: r.bonus }, r.position, POINTS, UNIVERSAL);
        return {
          id:             r.id,
          fixture_id:     r.fixture_id,
          player_id:      r.player_id,
          bps_score:      r.bps,
          bonus_points:   r.bonus,
          fantasy_points: pts,
          breakdown:      buildBreakdown({ ...r, bonus: r.bonus }, r.position, POINTS, UNIVERSAL),
          updated_at:     new Date().toISOString(),
        };
      });

      const { error: statErr } = await supabase
        .from('player_match_stats')
        .upsert(statUpserts, { onConflict: 'fixture_id,player_id' });

      if (statErr) {
        console.error('player_match_stats scoring upsert:', JSON.stringify(statErr));
        await logError('error', 'player_match_stats upsert failed', { fixture_id, error: statErr });
      }

      // Build points lookup for squad rollup
      const pointsLookup = {};
      for (const r of withBps) {
        pointsLookup[r.player_id] = scorePlayer({ ...r, bonus: r.bonus }, r.position, POINTS, UNIVERSAL);
      }

      const updatedSquads = await rollupSquads(fixture_id, pointsLookup, fixture.tournament_id ?? '');
      await broadcastUpdate(fixture_id);

      return respond(200, {
        ok: true, source: 'forza',
        player_stats: statUpserts.length,
        updated_squads: updatedSquads,
      });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PATH B — Manual / mock data: aggregate from match_events
    // ══════════════════════════════════════════════════════════════════════════
    const { data: events } = await supabase
      .from('match_events')
      .select('player_id, type, minute, team')
      .eq('fixture_id', fixture_id);

    if (!events?.length) {
      return respond(200, { ok: true, message: 'No events yet', updated_squads: 0, player_stats: 0, source: 'manual' });
    }

    const statsMap    = {};
    const goalsPerTeam = {};

    for (const ev of events) {
      if (!ev.player_id) continue;
      if (!statsMap[ev.player_id]) {
        statsMap[ev.player_id] = {
          player_id: ev.player_id,
          minutes_played: 0,   // DD-L8: don't assume 90 min from event presence alone
          goals: 0, assists: 0, own_goals: 0,
          yellow_cards: 0, red_cards: 0,
          penalty_saved: 0, penalty_missed: 0,
          tackles_won: 0, interceptions: 0,
          clean_sheet: false, goals_conceded: 0,
          bps: 0, bonus: 0,
        };
      }
      const s = statsMap[ev.player_id];

      switch (ev.type) {
        case 'goal':           s.goals++;         goalsPerTeam[ev.team] = (goalsPerTeam[ev.team] || 0) + 1; break;
        case 'assist':         s.assists++;        break;
        case 'own_goal':       s.own_goals++;      goalsPerTeam[ev.team] = (goalsPerTeam[ev.team] || 0) + 1; break;
        case 'yellow':         s.yellow_cards++;   break;
        case 'red':            s.red_cards++;      break;
        case 'penalty_saved':  s.penalty_saved++;  break;
        case 'penalty_missed': s.penalty_missed++; break;
        case 'sub_off':
        case 'sub':            s.minutes_played = parseInt(ev.minute) || s.minutes_played; break;
      }
    }

    const playerIds = Object.keys(statsMap);
    const { data: playerRowsB } = await supabase
      .from('players')
      .select('id, position, club')
      .in('id', playerIds);

    const positionMap = {};
    const clubMap     = {};
    for (const p of playerRowsB ?? []) {
      positionMap[p.id] = p.position;
      clubMap[p.id]     = p.club;
    }

    // Determine clubs in match
    const clubsInMatch = [...new Set(Object.values(clubMap))];

    for (const [pid, stats] of Object.entries(statsMap)) {
      const club         = clubMap[pid];
      // Goals conceded = goals scored by all OTHER clubs in the match
      const goalsAgainst = clubsInMatch
        .filter(c => c !== club)
        .reduce((sum, c) => sum + (goalsPerTeam[c] || 0), 0);
      stats.goals_conceded = goalsAgainst;
      stats.clean_sheet    = (goalsAgainst === 0); // minutes gate applied per-position in scorePlayer (GK/DEF≥45, others≥60)
    }

    const statsList = Object.values(statsMap);
    statsList.forEach(s => { s.bps = 0; s.bonus = 0; });

    const playerStatUpserts = statsList.map(s => {
      const pos = positionMap[s.player_id] || 'MID';
      const pts = scorePlayer(s, pos, POINTS, UNIVERSAL);
      return {
        fixture_id,
        player_id:      s.player_id,
        minutes_played: s.minutes_played,
        goals:          s.goals,
        assists:        s.assists,
        own_goals:      s.own_goals,
        yellow_cards:   s.yellow_cards,
        red_cards:      s.red_cards,
        penalty_saved:  s.penalty_saved,
        penalty_missed: s.penalty_missed,
        clean_sheet:    s.clean_sheet,
        goals_conceded: s.goals_conceded,
        bps_score:      s.bps,
        bonus_points:   s.bonus,
        fantasy_points: pts,
        breakdown:      buildBreakdown(s, pos, POINTS, UNIVERSAL),
        updated_at:     new Date().toISOString(),
      };
    });

    await supabase
      .from('player_match_stats')
      .upsert(playerStatUpserts, { onConflict: 'fixture_id,player_id' });

    const pointsLookup = {};
    for (const u of playerStatUpserts) pointsLookup[u.player_id] = u.fantasy_points;

    const updatedSquads = await rollupSquads(fixture_id, pointsLookup, fixture.tournament_id ?? '');
    await broadcastUpdate(fixture_id);

    return respond(200, {
      ok: true, source: 'manual',
      player_stats: playerStatUpserts.length,
      updated_squads: updatedSquads,
    });

  } catch (err) {
    console.error('calculate-scores error:', err.message);
    return respond(500, { error: err.message });
  }
});

// ─── Shared helpers ────────────────────────────────────────────────────────────

// Auto-sub helpers (#17). Formation: exactly 1 GK, at least 1 DEF/MID/FWD (11 total).
function isValidFormation(ids, posLookup) {
  const c = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const id of ids) { const p = posLookup[id]; if (c[p] !== undefined) c[p]++; }
  return c.GK === 1 && c.DEF >= 1 && c.MID >= 1
      && c.FWD >= 1 && (c.GK + c.DEF + c.MID + c.FWD) === ids.length;
}

// Replace DNP starters (0 minutes) with the highest-priority bench player who played,
// keeping the formation valid. Bench priority = order in the squad's players array.
function applyAutoSubs(pitch, bench, minutesLookup, posLookup) {
  const played = (id) => (minutesLookup[id] ?? 0) > 0;
  const xi = [...pitch];
  const usedBench = new Set();
  for (let i = 0; i < xi.length; i++) {
    if (played(xi[i])) continue;                 // starter played — keep
    for (const b of bench) {                     // find a played bench replacement
      if (usedBench.has(b) || !played(b)) continue;
      const candidate = [...xi]; candidate[i] = b;
      if (isValidFormation(candidate, posLookup)) { xi[i] = b; usedBench.add(b); break; }
    }
  }
  return xi;
}

async function rollupSquads(fixture_id, pointsLookup, tournament_id) {
  const fullRoundLookup = { ...pointsLookup };

  // Load fixture round — hard-fail if missing so we never write matchday_id='current' (L3.4 / DATA-6)
  const { data: fix } = await supabase
    .from('fixtures').select('round_number').eq('id', fixture_id).single();

  if (!fix?.round_number || !tournament_id) {
    await logError('warning', 'rollup skipped — fixture has no round_number (friendly/unassigned match, not a scoring error)', { fixture_id, tournament_id });
    return 0;
  }

  const roundMatchdayId = `${tournament_id}-r${fix.round_number}`;

  // Merge already-stored fantasy_points from other fixtures in the same round
  const { data: roundFixtures } = await supabase
    .from('fixtures')
    .select('id')
    .eq('round_number', fix.round_number)
    .eq('tournament_id', tournament_id)
    .neq('id', fixture_id);

  const roundFixtureIds = (roundFixtures ?? []).map(f => f.id);

  if (roundFixtureIds.length > 0) {
    const { data: otherStats } = await supabase
      .from('player_match_stats')
      .select('player_id, fantasy_points')
      .in('fixture_id', roundFixtureIds)
      .not('fantasy_points', 'is', null);

    for (const r of otherStats ?? []) {
      if (!(r.player_id in fullRoundLookup)) {
        fullRoundLookup[r.player_id] = r.fantasy_points ?? 0;
      }
    }
  }

  // minutes_played lookup removed — auto-substitution is disabled.
  // Bench players (indices 11-14) never contribute to the squad total.
  // DNP starters simply score 0 for the matchday.

  const { data: allSquadRows } = await supabase
    .from('squads')
    .select('id, user_id, league_id, matchday_id, players, starting_xi, captain_id, created_at, penalty_transfers, budget_remaining, round_transfers, initial_build_complete, leagues!inner(tournament_id)')
    .eq('leagues.tournament_id', tournament_id)
    .order('created_at', { ascending: false });

  if (!allSquadRows?.length) return 0;

  // C3: score exactly one squad row per (league_id, user_id). The schema permits
  // multiple rows (one per gameweek); scoring every row would multi-count a manager
  // because aggregate_league_member_points sums fantasy_points across all their rows.
  // Prefer the row whose matchday_id matches the round being scored; otherwise the
  // most-recently-created row (the carried-forward single-row model).
  const squadByManager = new Map();
  for (const s of allSquadRows) {
    const key = `${s.league_id}:${s.user_id}`;
    const existing = squadByManager.get(key);
    if (!existing) { squadByManager.set(key, s); continue; }
    if (s.matchday_id === roundMatchdayId && existing.matchday_id !== roundMatchdayId) {
      squadByManager.set(key, s); // exact-round row beats a stale carried-forward row
    }
  }
  const squads = [...squadByManager.values()];

  // C1: chips are scoped to the round they were activated for — never re-applied.
  //   Triple Captain: applies only in the matchday recorded in chips_used.
  //   Joker: the per-round joker lives in daily_jokers, keyed by matchday_id.
  // The persistent squads.is_triple_captain / joker_player_id / is_wildcard columns are
  // NOT trusted for scoring: they are never reset and would otherwise re-fire every round.
  // (C2: the retired wildcard chip's +10% multiplier is intentionally not applied at all.)
  const leagueIds = [...new Set(squads.map(s => s.league_id))];
  const tcThisRound = new Set();
  const jokerThisRound = {};
  if (leagueIds.length) {
    const { data: tcRows } = await supabase
      .from('chips_used')
      .select('user_id, league_id')
      .in('league_id', leagueIds)
      .eq('chip_type', 'triple_captain')
      .eq('matchday_id', roundMatchdayId);
    for (const r of tcRows ?? []) tcThisRound.add(`${r.league_id}:${r.user_id}`);

    const { data: jokerRows } = await supabase
      .from('daily_jokers')
      .select('user_id, league_id, player_id')
      .in('league_id', leagueIds)
      .eq('matchday_id', roundMatchdayId);
    for (const r of jokerRows ?? []) jokerThisRound[`${r.league_id}:${r.user_id}`] = r.player_id;
  }

  // Penalty transfers: load transfer_penalty config per league.
  // Config format: number (flat cost per extra buy) or array (escalating).
  // e.g. 4 → 4 pts each; [1,2,4] → 1st extra=1pt, 2nd=2pt, 3rd+=4pt.
  const penaltyConfigByLeague = {};
  if (leagueIds.length) {
    const { data: penaltyCfgRows } = await supabase
      .from('league_config')
      .select('league_id, config_value')
      .in('league_id', leagueIds)
      .eq('config_key', 'transfer_penalty');
    for (const r of penaltyCfgRows ?? []) {
      penaltyConfigByLeague[r.league_id] = r.config_value; // raw JSONB value (number or array)
    }
  }

  // L3.6: load existing breakdown data so we can accumulate across fixtures in the round
  const squadIds = squads.map(s => s.id);
  const { data: existingFP } = await supabase
    .from('fantasy_points')
    .select('squad_id, points_breakdown')
    .in('squad_id', squadIds)
    .eq('matchday_id', roundMatchdayId);

  const existingBDMap = Object.fromEntries(
    (existingFP ?? []).map(fp => [fp.squad_id, fp.points_breakdown ?? {}])
  );

  // v30: load squad_matchday_snapshots for this round.
  // These are written at fixture kickoff (before any transfer window re-opens) and are
  // immutable (ON CONFLICT DO NOTHING). They are the most reliable source for baseXI
  // and take priority over the live_xi in points_breakdown.
  // Key: `${league_id}:${user_id}` — matches the mgrKey used per squad below.
  const snapshotMap = {};
  {
    const { data: snapRows } = await supabase
      .from('squad_matchday_snapshots')
      .select('league_id, user_id, starting_xi, players, captain_id')
      .eq('matchday_id', roundMatchdayId);
    for (const r of snapRows ?? []) {
      snapshotMap[`${r.league_id}:${r.user_id}`] = r;
    }
  }

  // ── Auto-subs (#17) data ─────────────────────────────────────────────────────
  // Auto-substitution replaces a starter who did NOT play with the highest-priority
  // bench player who did, provided the formation stays valid. To avoid subbing out a
  // starter who simply hasn't kicked off yet, subs are applied ONLY once EVERY fixture
  // in the round is finished (FPL-style end-of-gameweek auto-subs). During live scoring
  // the XI is scored as-is (DNP starters transiently score 0; corrected at round end).
  const allRoundFixtureIds = [fixture_id, ...roundFixtureIds];
  const { data: roundFixStatus } = await supabase
    .from('fixtures').select('id, status').in('id', allRoundFixtureIds);
  const roundComplete = (roundFixStatus?.length ?? 0) > 0
    && roundFixStatus.every(f => f.status === 'finished');

  // v31 INTEGRITY GUARD — "written in stone" rule.
  // Once the roundComplete pass has run and written effective_xi into points_breakdown,
  // that matchday's results are frozen. Any subsequent call for a fixture in the same
  // round is a no-op: we log a warning and return without touching fantasy_points.
  // This prevents manual re-triggers, stuck crons, or late-finisher passes from
  // overwriting settled historical data.
  if (roundComplete) {
    const { data: settledRows } = await supabase
      .from('fantasy_points')
      .select('squad_id')
      .eq('matchday_id', roundMatchdayId)
      .not('points_breakdown->effective_xi', 'is', null)
      .limit(1);

    if (settledRows?.length) {
      await logError('warning', 'Rescore of settled round blocked — matchday is frozen', {
        fixture_id, roundMatchdayId,
      });
      return 0;
    }
  }

  // minutes played per player this round (max across the round's fixtures)
  const minutesLookup = {};
  if (roundComplete) {
    const { data: minRows } = await supabase
      .from('player_match_stats')
      .select('player_id, minutes_played')
      .in('fixture_id', allRoundFixtureIds);
    for (const r of minRows ?? []) {
      minutesLookup[r.player_id] = Math.max(minutesLookup[r.player_id] ?? 0, r.minutes_played ?? 0);
    }
  }

  // positions for every squad player (formation validation for auto-subs)
  const posLookup = {};
  if (roundComplete) {
    const allSquadPlayerIds = [...new Set(squads.flatMap(s => s.players || []))];
    if (allSquadPlayerIds.length) {
      const { data: posRows } = await supabase
        .from('players').select('id, position').in('id', allSquadPlayerIds);
      for (const p of posRows ?? []) posLookup[p.id] = (p.position || 'MID').toUpperCase();
    }
  }

  // Build fantasy_points upserts — one row per squad per matchday (L1.3 / L1.4 / L1.5)
  const fantasyPointsUpserts = [];
  for (const squad of squads) {
    const mgrKey = `${squad.league_id}:${squad.user_id}`;
    const isTripleCaptain = tcThisRound.has(mgrKey);   // C1: per-round, from chips_used
    const jokerPid = jokerThisRound[mgrKey] ?? null;    // C1: per-round, from daily_jokers
    // Phase B: use starting_xi when set; fallback to players[0..10] for legacy squads.
    // IMPORTANT: if the squad has already advanced to a later round (matchday_id !== roundMatchdayId)
    // the squad row reflects post-transfer state — use the frozen snapshot instead to avoid
    // crediting players acquired AFTER the round's transfer window re-opened.
    const currentXI = (squad.starting_xi?.length > 0)
      ? squad.starting_xi
      : (squad.players || []).slice(0, 11);
    const existingBD = existingBDMap[squad.id] ?? {};
    // v30 FIX: drop the `roundComplete &&` gate that was here in v29.
    // v29 bug: live passes (not roundComplete) always saw squadAdvanced=false, so they kept
    // writing live_xi=currentXI even after the manager transferred. By the time the roundComplete
    // pass fired, existingBD.live_xi already held the post-transfer (wrong) XI.
    // Fix: squadAdvanced is now true on ANY pass once matchday_id advances.
    const squadAdvanced = squad.matchday_id !== roundMatchdayId;

    // baseXI priority (highest → lowest):
    //   1. squad_matchday_snapshots: immutable kickoff snapshot (immune to transfer corruption)
    //   2. existingBD.live_xi: frozen by v30 fix once squad advances (fallback for pre-182 rounds)
    //   3. currentXI: squad.starting_xi / players[0..10] — only used when squad hasn't advanced
    const snapshot = snapshotMap[mgrKey];
    let baseXI;
    if (squadAdvanced && snapshot?.starting_xi?.length) {
      baseXI = snapshot.starting_xi;   // most reliable: immutable kickoff snapshot
    } else if (squadAdvanced && existingBD.live_xi?.length) {
      baseXI = existingBD.live_xi;     // v30 frozen snapshot in breakdown (pre-182 rounds)
    } else {
      baseXI = currentXI;              // squad still in this round — current XI is correct
    }

    // #17: at round completion, auto-sub DNP starters (0 min) for the highest-priority
    // bench player who played, keeping the formation valid. Bench priority = players-array
    // order. Before the round completes, score the XI as-is.
    // bench is derived relative to baseXI so applyAutoSubs can pick from it.
    // After auto-subs, benchPlayers is re-derived relative to pitchPlayers (the
    // effective XI) — any player auto-subbed IN must not appear in both XI and bench.
    // allPlayers priority mirrors baseXI: snapshot table → live_players breakdown → current
    const allPlayers = (() => {
      if (squadAdvanced && snapshot?.players?.length) return snapshot.players;
      if (squadAdvanced && existingBD.live_players?.length) return existingBD.live_players;
      return squad.players || [];
    })();
    const bench = allPlayers.filter(pid => !baseXI.includes(pid));
    let pitchPlayers = baseXI;
    if (roundComplete) {
      pitchPlayers = applyAutoSubs(baseXI, bench, minutesLookup, posLookup);
    }
    // Players not in the effective XI — this is what we store as historical bench.
    const benchPlayers = allPlayers.filter(pid => !pitchPlayers.includes(pid));
    let total = 0;

    // L3.5: if the captain isn't in the (effective) XI, move the bonus to the highest
    // POSITIVE-scoring starter. #6: never reassign onto a negative score (that would
    // amplify a loss); if no starter scored positive, no captain bonus applies this round.
    let effectiveCaptainId = squad.captain_id;
    if (squad.captain_id && !pitchPlayers.includes(squad.captain_id)) {
      let bestPid = null, bestRaw = 0;   // strictly > 0 required to reassign
      for (const pid of pitchPlayers) {
        const raw = fullRoundLookup[pid] ?? 0;
        if (raw > bestRaw) { bestRaw = raw; bestPid = pid; }
      }
      effectiveCaptainId = bestPid;      // null when no positive scorer → no captain bonus
      logError('warning', 'Captain not in XI; bonus moved to highest positive starter (if any)', {
        fixture_id, squad_id: squad.id, captain_id: squad.captain_id, effective_captain_id: bestPid,
      }); // fire-and-forget
      // TDD-07: notify manager so they know the reallocation happened
      supabase.from('league_notifications').insert({
        league_id:           squad.league_id,
        user_id:             squad.user_id,
        notification_type:   'captain_moved',
        title:               'Captain bonus reallocated',
        description:         'Your captain was not in the starting XI — the bonus was moved to your highest-scoring player this round.',
        related_entity_type: 'fixture',
        related_entity_id:   fixture_id,
      }).then(); // fire-and-forget
    }

    // Score the (auto-subbed) starting XI. Bench players not subbed in never score.
    // B-05: each player's raw points are rounded to a whole number BEFORE the captain
    // multiplier is applied and the result is summed — this matches the UI display
    // formula (Math.round(rawPts) * mult) used by SquadScreen/RecapView/LiveScreen.
    // Previously raw (unrounded) points were multiplied and summed, then rounded ONCE
    // at the end — "round of sum" vs "sum of rounds" diverge and caused the squad
    // total to disagree with the visible per-player breakdown by several points.
    for (const pid of pitchPlayers) {
      let rawPts = fullRoundLookup[pid] ?? 0;   // ?? preserves legitimate negative scores (L1.3)
      if (Number.isNaN(rawPts)) {
        rawPts = 0;
        logError('error', 'NaN in points lookup', { fixture_id, player_id: pid }); // fire-and-forget
      }
      // Only captain / Triple Captain multipliers apply inside the XI.
      // The Matchday Joker no longer applies a multiplier — it is always an external
      // player (DB trigger enforces this) scored separately below.
      const captainMult = pid === effectiveCaptainId ? (isTripleCaptain ? 3 : 2) : 1;
      total += Math.round(rawPts) * captainMult;
    }

    // Matchday Joker — external player bonus (real points, no multiplier):
    // The joker is a player outside the manager's squad who scores their real
    // fantasy points as a bonus added on top of the XI total. A DB trigger
    // (migration 143) ensures the joker is always external, so there is no
    // double-counting risk with pitchPlayers. Guard with the includes check
    // anyway for safety (legacy rows pre-migration 143).
    if (jokerPid && !pitchPlayers.includes(jokerPid)) {
      const jokerRawPts = fullRoundLookup[jokerPid] ?? 0;
      total += Math.round(jokerRawPts);   // ×1 — real points, no multiplier
    }

    // C2: the retired wildcard +10% multiplier is no longer applied.
    // total is already an integer (sum of rounded per-player contributions) — the
    // Math.round here is a no-op safeguard, kept so downstream arithmetic (penalty
    // deduction, etc.) can never be left with a stray float from a future change.
    total = Math.round(total);

    // Penalty transfers: deduct points for buys over the free-transfer limit.
    // Only applied on the FINAL scoring pass (when roundComplete=true) so the
    // deduction appears once in the settled total, not re-applied every live update.
    // penaltyDeduction is kept outside the block so it can be stored in points_breakdown.
    let penaltyDeduction = 0;
    if (roundComplete) {
      const penaltyCount = (squad.penalty_transfers ?? {})[roundMatchdayId] ?? 0;
      if (penaltyCount > 0) {
        const cfg = penaltyConfigByLeague[squad.league_id];
        if (cfg != null) {
          // Normalise: a plain number becomes a one-element array for uniform handling.
          const costs = Array.isArray(cfg) ? cfg : [cfg];
          for (let i = 0; i < penaltyCount; i++) {
            // Use last element of costs array for all extra transfers beyond the array length.
            penaltyDeduction += costs[Math.min(i, costs.length - 1)];
          }
          total -= penaltyDeduction;
          // total can go negative (e.g. many penalty transfers in a blank week) — that's intentional.
        }
      }
    }

    // L3.6: accumulate per-fixture contributions in points_breakdown.
    // transfer_penalty_deduction is stored when > 0 so the UI can show
    // "X pts from play − Y pts transfer penalty = Z pts total" without re-computing.
    // Stored to 2dp (NOT rounded to an integer) — rounding each fixture's contribution
    // independently caused the sum of fixtures[] to drift from the rounded `total`
    // (e.g. 1.5 + 2.5 each round to 2 + 3 = 5, while round(1.5+2.5) = 4). Any future
    // consumer summing fixtures[] should round the SUM, not each entry.
    const thisFixturePts = Math.round(
      pitchPlayers.reduce((sum, pid) => sum + (pointsLookup[pid] ?? 0), 0) * 100
    ) / 100;
    const breakdown = {
      ...existingBD,
      fixtures: {
        ...(existingBD.fixtures ?? {}),
        [fixture_id]: thisFixturePts,
      },
      player_count: pitchPlayers.length,
    };
    // v30 FIX: freeze the live_xi snapshot once squad.matchday_id advances.
    // While the squad is still in this matchday we write the snapshot as normal.
    // Once the manager makes a next-round transfer (matchday_id advances), we stop
    // updating live_xi so the pre-transfer XI is preserved for scoring.
    if (!squadAdvanced) {
      breakdown.live_xi      = currentXI;
      breakdown.live_players = squad.players || [];
    } else if (!existingBD.live_xi?.length) {
      // Fallback: squad advanced before any live pass ran (e.g. pre-competition transfers
      // that already moved matchday_id before MD1 kickoff). No valid snapshot exists.
      console.warn(`[calculate-scores] squad ${squad.id} has no live_xi snapshot for round ${roundMatchdayId} (squad is at ${squad.matchday_id}) — scoring with current XI as approximation`);
      breakdown.live_xi      = currentXI;
      breakdown.live_players = squad.players || [];
    }
    if (penaltyDeduction > 0) breakdown.transfer_penalty_deduction = penaltyDeduction;

    // Once the round is fully settled, snapshot the effective XI/captain that actually
    // scored — RecapView reads this for completed matchdays instead of the manager's
    // live squads.starting_xi/captain_id (which may have already moved on to the next
    // matchday). auto_subs/captain_reassigned record WHY the effective XI/captain
    // differ from the manager's own selection (for the explanatory tags in the UI).
    if (roundComplete) {
      breakdown.base_xi = baseXI;
      breakdown.base_captain_id = squad.captain_id;
      breakdown.effective_xi = pitchPlayers;
      breakdown.bench_players = benchPlayers;
      breakdown.effective_captain_id = effectiveCaptainId;
      breakdown.is_triple_captain = isTripleCaptain;
      if (jokerPid) breakdown.joker_player_id = jokerPid;
      else delete breakdown.joker_player_id;

      const autoSubs = [];
      for (let i = 0; i < baseXI.length; i++) {
        if (pitchPlayers[i] !== baseXI[i]) autoSubs.push({ out: baseXI[i], in: pitchPlayers[i] });
      }
      if (autoSubs.length) breakdown.auto_subs = autoSubs;
      else delete breakdown.auto_subs;

      if (effectiveCaptainId !== squad.captain_id) breakdown.captain_reassigned = true;
      else delete breakdown.captain_reassigned;
    }

    fantasyPointsUpserts.push({
      squad_id:         squad.id,
      matchday_id:      roundMatchdayId,
      total,
      points_breakdown: breakdown,
    });
  }

  const { error: fpErr } = await supabase
    .from('fantasy_points')
    .upsert(fantasyPointsUpserts, { onConflict: 'squad_id,matchday_id' });

  if (fpErr) {
    console.error('fantasy_points upsert error:', JSON.stringify(fpErr));
    await logError('critical', 'fantasy_points upsert failed — scores not saved', { fixture_id, error: fpErr });
    return 0; // IMP-04: don't report success if points weren't saved
  }

  // Update league_members totals via aggregate_league_member_points RPC
  const processedUsers = new Set();
  for (const squad of squads) {
    const key = `${squad.league_id}:${squad.user_id}`;
    if (processedUsers.has(key)) continue;
    processedUsers.add(key);

    const { error: aggErr } = await supabase
      .rpc('aggregate_league_member_points', {
        p_league_id: squad.league_id,
        p_user_id:   squad.user_id,
      });

    if (aggErr) {
      console.error(`aggregate_league_member_points failed for ${squad.user_id} in ${squad.league_id}:`, JSON.stringify(aggErr));
      await logError('error', 'aggregate_league_member_points failed', { league_id: squad.league_id, user_id: squad.user_id, error: aggErr });
    }
  }

  // Write one gazette entry per league showing GW scores — only when all fixtures
  // in the round are finished, so live/partial scores never appear in the feed.
  if (roundComplete) {
    writeGazetteEntries(fixture_id, roundMatchdayId, fantasyPointsUpserts, squads).catch(e =>
      console.warn('[calculate-scores] gazette write failed (non-critical):', e.message)
    );
  }

  // Disaster-recovery backup: snapshot squad state, points, and leaderboard at
  // roundComplete so we can restore XI/bench/totals without manual DB queries.
  if (roundComplete) {
    writeRoundBackup(roundMatchdayId, squads, fantasyPointsUpserts).catch(e =>
      console.warn('[calculate-scores] round backup failed (non-critical):', e.message)
    );
  }

  // H2H resolution — only runs when every fixture in the round is finished
  if (roundComplete) {
    resolveH2HMatchday(roundMatchdayId, squads, fantasyPointsUpserts).catch(e =>
      console.warn('[calculate-scores] H2H resolution failed (non-critical):', e.message)
    );
  }

  return squads.length;
}

// ── Round backup ──────────────────────────────────────────────────────────────
// Writes a single row to round_backups the first time roundComplete fires for a
// given matchday. Contains everything needed to restore XI, bench, points, and
// leaderboard for all managers across all leagues in case of a scoring disaster.
// Non-fatal — a failure here must never block the scoring pipeline.
async function writeRoundBackup(roundMatchdayId, squads, fantasyPointsUpserts) {
  // Idempotent: skip if a backup already exists for this round
  const { data: existing } = await supabase
    .from('round_backups')
    .select('id')
    .eq('matchday_id', roundMatchdayId)
    .maybeSingle();
  if (existing?.id) return;

  // Fetch usernames so the backup is human-readable without extra joins
  const userIds = [...new Set(squads.map(s => s.user_id))];
  const { data: users } = await supabase
    .from('users').select('id, username').in('id', userIds);
  const usernameMap = Object.fromEntries((users ?? []).map(u => [u.id, u.username ?? 'unknown']));

  // Squad snapshot: XI, bench (players − starting_xi), budget, transfer counters
  const squadsSnapshot = squads.map(s => ({
    squad_id:              s.id,
    user_id:               s.user_id,
    username:              usernameMap[s.user_id] ?? 'unknown',
    league_id:             s.league_id,
    matchday_id:           s.matchday_id,
    players:               s.players              ?? [],
    starting_xi:           s.starting_xi          ?? [],
    captain_id:            s.captain_id           ?? null,
    budget_remaining:      s.budget_remaining      ?? null,
    round_transfers:       s.round_transfers       ?? {},
    penalty_transfers:     s.penalty_transfers     ?? {},
    initial_build_complete: s.initial_build_complete ?? false,
  }));

  // Fantasy points snapshot: the totals + full breakdown just written to DB
  const fpSnapshot = fantasyPointsUpserts.map(fp => ({
    squad_id:         fp.squad_id,
    matchday_id:      fp.matchday_id,
    total:            fp.total,
    points_breakdown: fp.points_breakdown ?? null,
  }));

  // League members snapshot: leaderboard totals and ranks at roundComplete
  const leagueIds = [...new Set(squads.map(s => s.league_id))];
  const { data: lmRows } = await supabase
    .from('league_members')
    .select('league_id, user_id, total_points, rank')
    .in('league_id', leagueIds);

  await supabase.from('round_backups').insert({
    matchday_id:             roundMatchdayId,
    squads_snapshot:         squadsSnapshot,
    fantasy_points_snapshot: fpSnapshot,
    league_members_snapshot: lmRows ?? [],
  });

  console.log(`[calculate-scores] round backup written for ${roundMatchdayId} — ${squadsSnapshot.length} squads`);
}

async function writeGazetteEntries(fixture_id, roundMatchdayId, fantasyPointsUpserts, squads) {
  // Fetch fixture details for the headline
  const { data: fix } = await supabase
    .from('fixtures')
    .select('home_team, away_team, home_score, away_score')
    .eq('id', fixture_id)
    .single();

  // Fetch usernames for all users involved
  const userIds = [...new Set(squads.map(s => s.user_id))];
  const { data: users } = await supabase
    .from('users')
    .select('id, username')
    .in('id', userIds);
  const usernameMap = Object.fromEntries((users || []).map(u => [u.id, u.username || 'Unknown']));

  // Build squad_id → GW total map
  const gwMap = Object.fromEntries(fantasyPointsUpserts.map(fp => [fp.squad_id, fp.total ?? 0]));

  const roundNum = String(roundMatchdayId).replace(/^.*-r/, '');
  const medals = ['🥇', '🥈', '🥉'];

  // Group squads by league and write one entry per league
  const leagueMap = {};
  for (const s of squads) {
    if (!leagueMap[s.league_id]) leagueMap[s.league_id] = [];
    leagueMap[s.league_id].push(s);
  }

  for (const [leagueId, leagueSquads] of Object.entries(leagueMap)) {
    const ranked = leagueSquads
      .map(s => ({ username: usernameMap[s.user_id], pts: gwMap[s.id] ?? 0 }))
      .sort((a, b) => b.pts - a.pts);

    const fixtureLabel = fix
      ? `${fix.home_team} ${fix.home_score ?? '?'}–${fix.away_score ?? '?'} ${fix.away_team}`
      : `Round ${roundNum}`;

    const topName = ranked[0]?.username ?? '—';
    const topPts  = ranked[0]?.pts ?? 0;

    const headline = `GW ${roundNum} — Matchday complete — ${topName} leads with ${topPts} pts`;
    const bullets  = ranked.map((r, i) =>
      `${medals[i] ?? `${i + 1}.`} ${r.username}  ${r.pts} pts this GW`
    );

    // Delete any existing score entry for this matchday+league, then reinsert
    // (safe to re-run: latest fixture in round always wins)
    await supabase.from('gazette_entries')
      .delete()
      .eq('league_id', leagueId)
      .eq('entry_type', 'activity')
      .filter('full_data->>matchday_id', 'eq', roundMatchdayId);

    await supabase.from('gazette_entries').insert({
      league_id:    leagueId,
      entry_type:   'activity',
      headline,
      bullets,
      full_data:    { matchday_id: roundMatchdayId, fixture_id, scores: ranked },
      published_at: new Date().toISOString(),
    });
  }
}

// ─── H2H resolution ────────────────────────────────────────────────────────────
// Called after rollupSquads when roundComplete=true.
// For each H2H-enabled league: looks up unresolved pairings for the matchday,
// fetches each manager's fantasy_points.total, computes 5/2/0 (or configured values),
// writes back to h2h_schedule, and appends a gazette entry.

async function resolveH2HMatchday(roundMatchdayId, squads, fantasyPointsUpserts) {
  // Group squads by league
  const leagueMap = {};
  for (const s of squads) {
    if (!leagueMap[s.league_id]) leagueMap[s.league_id] = [];
    leagueMap[s.league_id].push(s);
  }

  for (const [leagueId, leagueSquads] of Object.entries(leagueMap)) {
    // Check h2h_enabled for this league
    const { data: league } = await supabase
      .from('leagues')
      .select('h2h_enabled')
      .eq('id', leagueId)
      .single();

    if (!league?.h2h_enabled) continue;

    // Load H2H scoring config (defaults: 5/2/0)
    const { data: cfgRows } = await supabase
      .from('league_config')
      .select('config_key, config_value')
      .eq('league_id', leagueId)
      .in('config_key', ['h2h_win_pts', 'h2h_draw_pts', 'h2h_loss_pts']);

    const cfg = Object.fromEntries((cfgRows || []).map(r => [r.config_key, Number(r.config_value)]));
    const winPts  = cfg.h2h_win_pts  ?? 5;
    const drawPts = cfg.h2h_draw_pts ?? 2;
    const lossPts = cfg.h2h_loss_pts ?? 0;

    // Find unresolved pairings for this matchday
    const { data: pairings } = await supabase
      .from('h2h_schedule')
      .select('id, home_user_id, away_user_id, is_bye, bye_user_id')
      .eq('league_id', leagueId)
      .eq('matchday_id', roundMatchdayId)
      .is('resolved_at', null);

    if (!pairings?.length) continue;

    // Build user_id → fantasy points map from the upserts array (already computed this run)
    const squadUserMap = Object.fromEntries(leagueSquads.map(s => [s.id, s.user_id]));
    const scoreMap = {};
    for (const fp of fantasyPointsUpserts) {
      const uid = squadUserMap[fp.squad_id];
      if (uid) scoreMap[uid] = fp.total ?? 0;
    }

    const now = new Date().toISOString();
    const gazetteLines = [];

    for (const p of pairings) {
      if (p.is_bye) {
        await supabase.from('h2h_schedule').update({
          home_h2h_pts: winPts,
          away_h2h_pts: null,
          home_score:   null,
          away_score:   null,
          resolved_at:  now,
        }).eq('id', p.id);
        gazetteLines.push({ type: 'bye', userId: p.bye_user_id, pts: winPts });
      } else {
        const homeScore = scoreMap[p.home_user_id] ?? 0;
        const awayScore = scoreMap[p.away_user_id] ?? 0;
        let homeH2h, awayH2h;
        if (homeScore > awayScore)      { homeH2h = winPts;  awayH2h = lossPts; }
        else if (homeScore < awayScore) { homeH2h = lossPts; awayH2h = winPts;  }
        else                            { homeH2h = drawPts; awayH2h = drawPts; }

        await supabase.from('h2h_schedule').update({
          home_score:   homeScore,
          away_score:   awayScore,
          home_h2h_pts: homeH2h,
          away_h2h_pts: awayH2h,
          resolved_at:  now,
        }).eq('id', p.id);
        gazetteLines.push({ type: 'match', homeUid: p.home_user_id, awayUid: p.away_user_id, homeScore, awayScore, homeH2h, awayH2h });
      }
    }

    if (gazetteLines.length) {
      await writeH2HGazette(leagueId, roundMatchdayId, gazetteLines, leagueSquads, winPts);
    }
  }
}

async function writeH2HGazette(leagueId, roundMatchdayId, gazetteLines, leagueSquads, winPts) {
  const userIds = [...new Set(leagueSquads.map(s => s.user_id))];
  const { data: users } = await supabase
    .from('users').select('id, username').in('id', userIds);
  const nameOf = (uid) => users?.find(u => u.id === uid)?.username ?? '?';

  const roundNum = String(roundMatchdayId).replace(/^.*-r/, '');
  const headline = `⚔️ Matchday ${roundNum} H2H Results`;

  const bullets = gazetteLines.map(line => {
    if (line.type === 'bye') {
      return `${nameOf(line.userId)} — BYE  +${line.pts}`;
    }
    const homeWon = line.homeH2h === winPts;
    const awayWon = line.awayH2h === winPts;
    const isDraw  = line.homeH2h === line.awayH2h;
    const verb = isDraw ? 'drew with' : (homeWon ? 'beat' : 'lost to');
    const winner = homeWon ? nameOf(line.homeUid) : nameOf(line.awayUid);
    const loser  = homeWon ? nameOf(line.awayUid) : nameOf(line.homeUid);
    const wScore = homeWon ? line.homeScore : line.awayScore;
    const lScore = homeWon ? line.awayScore : line.homeScore;
    if (isDraw) {
      return `${nameOf(line.homeUid)} ${wScore} pts drew ${nameOf(line.awayUid)} ${lScore} pts  +${line.homeH2h}`;
    }
    return `${winner} ${wScore} pts beat ${loser} ${lScore} pts  +${winPts}`;
  });

  // Idempotent: delete existing H2H gazette entry for this matchday, then reinsert
  await supabase.from('gazette_entries')
    .delete()
    .eq('league_id', leagueId)
    .eq('entry_type', 'activity')
    .filter('full_data->>h2h_matchday_id', 'eq', roundMatchdayId);

  await supabase.from('gazette_entries').insert({
    league_id:    leagueId,
    entry_type:   'activity',
    headline,
    bullets,
    full_data:    { h2h_matchday_id: roundMatchdayId, results: gazetteLines },
    published_at: new Date().toISOString(),
  });
}

async function broadcastUpdate(fixture_id) {
  await supabase.channel('scores').send({
    type:    'broadcast',
    event:   'points_updated',
    payload: { fixture_id, updated_at: new Date().toISOString() },
  });
}
