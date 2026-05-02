// Edge Function: calculate-scores
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
//   FANTASY_POINTS_SCORING_LAYER.md is the settled spec. PIPELINE.md Appendix A
//   was a superseded draft and should be ignored. The POINTS constants below
//   match the settled spec exactly.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
);

// ─── Scoring constants ─────────────────────────────────────────────────────────
// Source of truth: FANTASY_POINTS_SCORING_LAYER.md

const POINTS = {
  GK:  { goal: 5, assist: 0, clean_sheet: 4, conceded_per_goal: -1, penalty_saved: 5 },
  DEF: { goal: 4, assist: 1, clean_sheet: 4, conceded_per_goal:  0, penalty_saved: 0, tackle: 0.5, interception: 0.25 },
  MID: { goal: 5, assist: 1, clean_sheet: 1, conceded_per_goal:  0, penalty_saved: 0, tackle: 0.5, interception: 0.25 },
  FWD: { goal: 3, assist: 1, clean_sheet: 0, conceded_per_goal:  0, penalty_saved: 0, penalty_scored: 1 },
};

const UNIVERSAL = {
  minute_per_90:   1,
  own_goal:       -2,
  yellow_card:    -1,
  red_card:       -3,
  penalty_missed: -1,
};

// ─── BPS ranking ───────────────────────────────────────────────────────────────
// When Forza data is available, shots_on_target and pass_completion are also used.

function calcBPS(stats) {
  const passCompletion = stats.total_passes > 0
    ? (stats.accurate_passes / stats.total_passes) * 100
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

function scorePlayer(stats, position) {
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

  // GK: -1 per goal conceded (only if played ≥60 min)
  if (pos === 'GK' && mins >= 60) {
    pts += Math.floor(stats.goals_conceded ?? 0) * rules.conceded_per_goal;
  }

  pts += (stats.penalty_saved  ?? 0) * rules.penalty_saved;
  pts += (stats.own_goals      ?? 0) * UNIVERSAL.own_goal;
  pts += (stats.yellow_cards   ?? 0) * UNIVERSAL.yellow_card;
  pts += (stats.red_cards      ?? 0) * UNIVERSAL.red_card;
  pts += (stats.penalty_missed ?? 0) * UNIVERSAL.penalty_missed;

  // DEF/MID: tackle (+0.5) and interception (+0.25)
  if (pos === 'DEF' || pos === 'MID') {
    pts += (stats.tackles_won   ?? 0) * rules.tackle;
    pts += (stats.interceptions ?? 0) * rules.interception;
  }

  // FWD: +1 bonus per penalty scored (on top of the goal points)
  if (pos === 'FWD') {
    pts += (stats.penalty_scored ?? 0) * rules.penalty_scored;
  }

  pts += stats.bonus ?? 0;

  return Math.round(pts * 100) / 100;
}

function buildBreakdown(stats, pos) {
  const p     = (pos || 'MID').toUpperCase();
  const rules = POINTS[p] || POINTS.MID;
  const mins  = stats.minutes_played ?? stats.minutes ?? 0;
  return {
    minutes:         Math.round((mins / 90) * 100) / 100,
    goals:           (stats.goals   ?? 0) * rules.goal,
    assists:         (stats.assists ?? 0) * rules.assist,
    clean_sheet:     (stats.clean_sheet && mins >= 60) ? rules.clean_sheet : 0,
    own_goals:       (stats.own_goals    ?? 0) * UNIVERSAL.own_goal,
    yellow_cards:    (stats.yellow_cards ?? 0) * UNIVERSAL.yellow_card,
    red_cards:       (stats.red_cards    ?? 0) * UNIVERSAL.red_card,
    penalty_saved:   (stats.penalty_saved  ?? 0) * rules.penalty_saved,
    penalty_scored:  (p === 'FWD') ? (stats.penalty_scored ?? 0) * (rules.penalty_scored ?? 0) : 0,
    penalty_missed:  (stats.penalty_missed ?? 0) * UNIVERSAL.penalty_missed,
    tackles:         (p === 'DEF' || p === 'MID') ? (stats.tackles_won   ?? 0) * (rules.tackle       ?? 0) : 0,
    interceptions:   (p === 'DEF' || p === 'MID') ? (stats.interceptions ?? 0) * (rules.interception ?? 0) : 0,
    bonus:           stats.bonus ?? 0,
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
    // ── Load fixture ──────────────────────────────────────────────────────────
    const { data: fixture, error: fixErr } = await supabase
      .from('fixtures')
      .select('id, home_team, away_team, status')
      .eq('id', fixture_id)
      .single();

    if (fixErr || !fixture) return respond(404, { error: 'Fixture not found' });

    // ── Detect which path to use ──────────────────────────────────────────────
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
        .select(`
          id, fixture_id, player_id, forza_match_id,
          minutes_played, goals, assists, own_goals,
          yellow_cards, red_cards, penalty_saved, penalty_missed, penalty_scored,
          clean_sheet, goals_conceded,
          saves, shots_on_target, tackles_won, interceptions, xg, xa,
          players ( id, position )
        `)
        .eq('fixture_id', fixture_id)
        .not('forza_match_id', 'is', null);

      if (!rows?.length) {
        return respond(200, { ok: true, message: 'No Forza stats yet', updated_squads: 0, player_stats: 0, source: 'forza' });
      }

      // BPS + bonus
      const withBps = rows.map(r => ({
        ...r,
        position:   r.players?.position ?? 'MID',
        bps:        calcBPS(r),
        bonus:      0,
      }));
      assignBonus(withBps);

      // Score each player and write back bps_score, bonus_points, fantasy_points
      const statUpserts = withBps.map(r => {
        const pts = scorePlayer({ ...r, bonus: r.bonus }, r.position);
        return {
          id:            r.id,
          fixture_id:    r.fixture_id,
          player_id:     r.player_id,
          bps_score:     r.bps,
          bonus_points:  r.bonus,
          fantasy_points: pts,
          breakdown:     buildBreakdown({ ...r, bonus: r.bonus }, r.position),
          updated_at:    new Date().toISOString(),
        };
      });

      const { error: statErr } = await supabase
        .from('player_match_stats')
        .upsert(statUpserts, { onConflict: 'fixture_id,player_id' });

      if (statErr) console.error('player_match_stats scoring upsert:', JSON.stringify(statErr));

      // Build points lookup for squad rollup
      const pointsLookup = {};
      for (const r of withBps) {
        const pts = scorePlayer({ ...r, bonus: r.bonus }, r.position);
        pointsLookup[r.player_id] = pts;
      }

      const updatedSquads = await rollupSquads(fixture_id, pointsLookup);
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

    const statsMap = {};
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
    const { data: playerRows } = await supabase
      .from('players')
      .select('id, position, club')
      .in('id', playerIds);

    const positionMap = {};
    const clubMap     = {};
    for (const p of playerRows ?? []) {
      positionMap[p.id] = p.position;
      clubMap[p.id]     = p.club;
    }

    for (const [pid, stats] of Object.entries(statsMap)) {
      const club           = clubMap[pid];
      const goalsAgainst   = goalsPerTeam[club] || 0;
      stats.goals_conceded = goalsAgainst;
      stats.clean_sheet    = goalsAgainst === 0;
    }

    const statsList = Object.values(statsMap);
    statsList.forEach(s => { s.bps = calcBPS(s); });
    assignBonus(statsList);

    const playerStatUpserts = statsList.map(s => {
      const pos = positionMap[s.player_id] || 'MID';
      const pts = scorePlayer(s, pos);
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
        breakdown:      buildBreakdown(s, pos),
        updated_at:     new Date().toISOString(),
      };
    });

    await supabase
      .from('player_match_stats')
      .upsert(playerStatUpserts, { onConflict: 'fixture_id,player_id' });

    const pointsLookup = {};
    for (const u of playerStatUpserts) pointsLookup[u.player_id] = u.fantasy_points;

    const updatedSquads = await rollupSquads(fixture_id, pointsLookup);
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

async function rollupSquads(fixture_id, pointsLookup) {
  const { data: squads } = await supabase
    .from('squads')
    .select('id, user_id, league_id, matchday_id, players, captain_id, is_triple_captain, is_wildcard');

  if (!squads?.length) return 0;

  const fantasyPointsUpserts = squads.map(squad => {
    const pitchPlayers = (squad.players || []).slice(0, 11);
    let total = 0;

    for (const pid of pitchPlayers) {
      let pts = pointsLookup[pid] || 0;
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

  if (fpErr) console.error('fantasy_points upsert error:', JSON.stringify(fpErr));

  // Update league_members totals
  for (const squad of squads) {
    const { data: totalRows } = await supabase
      .from('fantasy_points')
      .select('total')
      .eq('squad_id', squad.id);

    const grandTotal = (totalRows || []).reduce((sum, r) => sum + (r.total || 0), 0);

    await supabase
      .from('league_members')
      .update({ total_points: Math.round(grandTotal * 100) / 100 })
      .eq('user_id', squad.user_id)
      .eq('league_id', squad.league_id);
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
