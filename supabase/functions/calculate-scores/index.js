// Edge Function: calculate-scores  (v6)
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

const supabase = createClient(
  Deno.env.get('SUPABASE_URL'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
);

// Write critical failures to edge_function_errors table (queryable via dashboard).
// Never throws — logging errors must not crash the function.
async function logError(severity, message, context = {}) {
  try {
    await supabase.from('edge_function_errors').insert({
      function: 'calculate-scores', severity, message, context,
    });
  } catch { /* silent */ }
}

// ─── Hard-coded fallback scoring (used only if scoring_rules table is empty) ───
// These match the EPL 2025/26 season rules exactly.

const FALLBACK_POINTS = {
  GK:  { goal: 5, assist: 0, clean_sheet: 4, conceded_per_goal: -1, penalty_saved: 5, tackle: 0, interception: 0, penalty_scored: 0 },
  DEF: { goal: 4, assist: 1, clean_sheet: 4, conceded_per_goal:  0, penalty_saved: 0, tackle: 0.5, interception: 0.25, penalty_scored: 0 },
  MID: { goal: 5, assist: 1, clean_sheet: 1, conceded_per_goal:  0, penalty_saved: 0, tackle: 0.5, interception: 0.25, penalty_scored: 0 },
  FWD: { goal: 3, assist: 1, clean_sheet: 0, conceded_per_goal:  0, penalty_saved: 0, tackle: 0, interception: 0, penalty_scored: 1 },
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

  // GK: conceded_per_goal (only if played ≥60 min)
  if (pos === 'GK' && mins >= 60) {
    pts += Math.floor(stats.goals_conceded ?? 0) * rules.conceded_per_goal;
  }

  pts += (stats.penalty_saved  ?? 0) * (rules.penalty_saved  ?? 0);
  pts += (stats.own_goals      ?? 0) * UNIVERSAL.own_goal;
  pts += (stats.yellow_cards   ?? 0) * UNIVERSAL.yellow_card;
  pts += (stats.red_cards      ?? 0) * UNIVERSAL.red_card;
  pts += (stats.penalty_missed ?? 0) * UNIVERSAL.penalty_missed;

  // Tackle + interception bonus (DEF/MID by default; rules.tackle/interception are 0 for others)
  pts += (stats.tackles_won   ?? 0) * (rules.tackle        ?? 0);
  pts += (stats.interceptions ?? 0) * (rules.interception  ?? 0);

  // Penalty scored bonus (FWD by default; 0 for others)
  pts += (stats.penalty_scored ?? 0) * (rules.penalty_scored ?? 0);

  pts += stats.bonus ?? 0;

  return Math.round(pts * 100) / 100;
}

function buildBreakdown(stats, pos, POINTS, UNIVERSAL) {
  const p     = (pos || 'MID').toUpperCase();
  const rules = POINTS[p] || POINTS.MID;
  const mins  = stats.minutes_played ?? stats.minutes ?? 0;
  return {
    minutes:        Math.round((mins / 90) * UNIVERSAL.minute_per_90 * 100) / 100,
    goals:          (stats.goals   ?? 0) * rules.goal,
    assists:        (stats.assists ?? 0) * rules.assist,
    clean_sheet:    (stats.clean_sheet && mins >= 60) ? rules.clean_sheet : 0,
    own_goals:      (stats.own_goals    ?? 0) * UNIVERSAL.own_goal,
    yellow_cards:   (stats.yellow_cards ?? 0) * UNIVERSAL.yellow_card,
    red_cards:      (stats.red_cards    ?? 0) * UNIVERSAL.red_card,
    penalty_saved:  (stats.penalty_saved  ?? 0) * (rules.penalty_saved  ?? 0),
    penalty_scored: (stats.penalty_scored ?? 0) * (rules.penalty_scored ?? 0),
    penalty_missed: (stats.penalty_missed ?? 0) * UNIVERSAL.penalty_missed,
    tackles:        (stats.tackles_won   ?? 0) * (rules.tackle        ?? 0),
    interceptions:  (stats.interceptions ?? 0) * (rules.interception  ?? 0),
    bonus:          stats.bonus ?? 0,
  };
}

function respond(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method !== 'POST') return respond(405, { error: 'POST required' });

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

      // BPS + bonus
      const withBps = rows.map(r => ({
        ...r,
        position: positionMap[r.player_id] ?? 'MID',
        bps:      calcBPS(r),
        bonus:    0,
      }));
      assignBonus(withBps);

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
          minutes_played: 90,
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
        case 'sub_off':        s.minutes_played = parseInt(ev.minute) || s.minutes_played; break;
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
      stats.clean_sheet    = goalsAgainst === 0;
    }

    const statsList = Object.values(statsMap);
    statsList.forEach(s => { s.bps = calcBPS(s); });
    assignBonus(statsList);

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
  // Build a full-round lookup so squad totals accumulate correctly across all
  // gameday fixtures (not just the one fixture calculate-scores was called for).
  // Strategy: start with the current fixture's freshly-computed scores, then
  // merge in already-stored fantasy_points from every other fixture in the
  // same round. A player only plays once per round so there is no double-counting.
  const fullRoundLookup = { ...pointsLookup };

  // Identify the fixture's round
  const { data: fix } = await supabase
    .from('fixtures').select('round_number').eq('id', fixture_id).single();

  if (fix?.round_number && tournament_id) {
    // Get IDs of all other fixtures in the same round
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
        // Don't overwrite current fixture's fresh scores
        if (!(r.player_id in fullRoundLookup)) {
          fullRoundLookup[r.player_id] = r.fantasy_points ?? 0;
        }
      }
    }
  }

  // (#110) Filter squads to only those in leagues matching this tournament
  const { data: squads } = await supabase
    .from('squads')
    .select('id, user_id, league_id, matchday_id, players, captain_id, is_triple_captain, is_wildcard, leagues!inner(tournament_id)')
    .eq('leagues.tournament_id', tournament_id || '');

  if (!squads?.length) return 0;

  const fantasyPointsUpserts = squads.map(squad => {
    const pitchPlayers = (squad.players || []).slice(0, 11);
    let total = 0;

    for (const pid of pitchPlayers) {
      let pts = fullRoundLookup[pid] || 0;
      if (pid === squad.captain_id)  pts *= squad.is_triple_captain ? 3 : 2;
      if (squad.is_wildcard)         pts = Math.round(pts * 1.1 * 100) / 100;
      total += pts;
    }

    return {
      squad_id:         squad.id,
      matchday_id:      squad.matchday_id || 'current',
      total:            Math.round(total * 100) / 100,
      points_breakdown: { fixture_id, player_count: pitchPlayers.length },
    };
  });

  const { error: fpErr } = await supabase
    .from('fantasy_points')
    .upsert(fantasyPointsUpserts, { onConflict: 'squad_id,matchday_id' });

  if (fpErr) {
    console.error('fantasy_points upsert error:', JSON.stringify(fpErr));
    await logError('critical', 'fantasy_points upsert failed — scores not saved', { fixture_id, error: fpErr });
  }

  // Update league_members totals (including bet rewards via aggregate_league_member_points RPC)
  const processedUsers = new Set();
  for (const squad of squads) {
    const key = `${squad.league_id}:${squad.user_id}`;
    if (processedUsers.has(key)) continue;
    processedUsers.add(key);

    const { error: aggErr } = await supabase
      .rpc('aggregate_league_member_points', {
        p_league_id: squad.league_id,
        p_user_id: squad.user_id,
      });

    if (aggErr) {
      console.error(`aggregate_league_member_points failed for ${squad.user_id} in ${squad.league_id}:`, JSON.stringify(aggErr));
      await logError('error', 'aggregate_league_member_points failed', { league_id: squad.league_id, user_id: squad.user_id, error: aggErr });
    }
  }

  return squads.length;
}

async function broadcastUpdate(fixture_id) {
  await supabase.channel('scores').send({
    type:    'broadcast',
    event:   'points_updated',
    payload: { fixture_id, updated_at: new Date().toISOString() },
  });
}
