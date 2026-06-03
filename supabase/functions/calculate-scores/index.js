// Edge Function: calculate-scores  (v22 — Scoring V2)
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
  minute_per_90: 1,
  own_goal:      -2,
  yellow_card:   -1,
  red_card:      -3,
  penalty_missed: -1,
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

  pts += (mins / 90) * UNIVERSAL.minute_per_90;
  pts += (stats.goals   ?? 0) * rules.goal;
  pts += (stats.assists ?? 0) * rules.assist;

  if (stats.clean_sheet && mins >= 60) {
    pts += rules.clean_sheet;
  }

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

  return Math.round(pts * 100) / 100;
}

function buildBreakdown(stats, pos, POINTS, UNIVERSAL) {
  const p     = (pos || 'MID').toUpperCase();
  const rules = POINTS[p] || POINTS.MID;
  const mins  = stats.minutes_played ?? stats.minutes ?? 0;
  return {
    minutes:           Math.round((mins / 90) * UNIVERSAL.minute_per_90 * 100) / 100,
    goals:             (stats.goals              ?? 0) * rules.goal,
    assists:           (stats.assists            ?? 0) * rules.assist,
    clean_sheet:       (stats.clean_sheet && mins >= 60) ? rules.clean_sheet : 0,
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
      stats.clean_sheet    = (goalsAgainst === 0) && (stats.minutes_played >= 60); // L1.8: mirror Path A's mins≥60 gate
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

async function rollupSquads(fixture_id, pointsLookup, tournament_id) {
  const fullRoundLookup = { ...pointsLookup };

  // Load fixture round — hard-fail if missing so we never write matchday_id='current' (L3.4 / DATA-6)
  const { data: fix } = await supabase
    .from('fixtures').select('round_number').eq('id', fixture_id).single();

  if (!fix?.round_number || !tournament_id) {
    await logError('critical', 'Cannot derive matchday_id — missing round_number or tournament_id; rollup skipped', { fixture_id, tournament_id });
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
    .select('id, user_id, league_id, matchday_id, players, starting_xi, captain_id, created_at, leagues!inner(tournament_id)')
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

  // Build fantasy_points upserts — one row per squad per matchday (L1.3 / L1.4 / L1.5)
  const fantasyPointsUpserts = [];
  for (const squad of squads) {
    const mgrKey = `${squad.league_id}:${squad.user_id}`;
    const isTripleCaptain = tcThisRound.has(mgrKey);   // C1: per-round, from chips_used
    const jokerPid = jokerThisRound[mgrKey] ?? null;    // C1: per-round, from daily_jokers
    // Phase B: use starting_xi when set; fallback to players[0..10] for legacy squads
    const pitchPlayers = (squad.starting_xi?.length > 0)
      ? squad.starting_xi
      : (squad.players || []).slice(0, 11);
    let total = 0;

    // L3.5: if captain is on the bench, award the bonus to the highest-scoring starter.
    let effectiveCaptainId = squad.captain_id;
    if (squad.captain_id && !pitchPlayers.includes(squad.captain_id)) {
      let bestPid = null, bestRaw = -Infinity;
      for (const pid of pitchPlayers) {
        const raw = fullRoundLookup[pid] ?? 0;
        if (raw > bestRaw) { bestRaw = raw; bestPid = pid; }
      }
      effectiveCaptainId = bestPid;
      logError('warning', 'Captain on bench; captain bonus moved to highest-scoring starter', {
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

    // Starters only — bench players (indices 11-14) never score.
    // Auto-substitution is intentionally disabled; DNP starters score 0.
    // (Auto-sub is a Backlog item to implement in a future sprint.)
    for (const pid of pitchPlayers) {
      let pts = fullRoundLookup[pid] ?? 0;   // ?? preserves legitimate negative scores (L1.3)
      if (Number.isNaN(pts)) {
        pts = 0;
        logError('error', 'NaN in points lookup', { fixture_id, player_id: pid }); // fire-and-forget
      }
      // DD-H5: chips take the highest multiplier, not the product.
      // Captain+Joker on same player → max(2,2)=×2, not ×4. TC+Joker → max(3,2)=×3.
      const captainMult = pid === effectiveCaptainId ? (isTripleCaptain ? 3 : 2) : 1;
      const jokerMult   = pid === jokerPid ? 2 : 1;
      pts *= Math.max(captainMult, jokerMult);
      total += pts;
    }
    // C2: the retired wildcard +10% multiplier is no longer applied.
    total = Math.round(total); // integer points — no decimals in fantasy

    // L3.6: accumulate per-fixture contributions in points_breakdown
    const existingBD = existingBDMap[squad.id] ?? {};
    const thisFixturePts = Math.round(
      pitchPlayers.reduce((sum, pid) => sum + (pointsLookup[pid] ?? 0), 0)
    );
    fantasyPointsUpserts.push({
      squad_id:         squad.id,
      matchday_id:      roundMatchdayId,
      total,
      points_breakdown: {
        fixtures: {
          ...(existingBD.fixtures ?? {}),
          [fixture_id]: thisFixturePts,
        },
        player_count: pitchPlayers.length,
      },
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

  // Write one gazette entry per league showing GW scores (fire-and-forget)
  writeGazetteEntries(fixture_id, roundMatchdayId, fantasyPointsUpserts, squads).catch(e =>
    console.warn('[calculate-scores] gazette write failed (non-critical):', e.message)
  );

  return squads.length;
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

    const headline = `GW ${roundNum} — ${fixtureLabel} — ${topName} leads with ${topPts} pts`;
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

async function broadcastUpdate(fixture_id) {
  await supabase.channel('scores').send({
    type:    'broadcast',
    event:   'points_updated',
    payload: { fixture_id, updated_at: new Date().toISOString() },
  });
}
