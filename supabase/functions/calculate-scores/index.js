// Edge Function: calculate-scores
// Calculates fantasy points for all squads from match_events for a given fixture.
// Called manually or via cron during live matches.
//
// POST body: { fixture_id: string }
// Returns:   { ok: true, updated_squads: number, player_stats: number }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
);

// ─── Scoring constants ────────────────────────────────────────────────────────

const POINTS = {
  GK:  { goal: 5, assist: 0, clean_sheet: 4, conceded_per_goal: -1, penalty_saved: 5 },
  DEF: { goal: 4, assist: 1, clean_sheet: 4, conceded_per_goal: 0,  penalty_saved: 0 },
  MID: { goal: 5, assist: 1, clean_sheet: 1, conceded_per_goal: 0,  penalty_saved: 0 },
  FWD: { goal: 3, assist: 1, clean_sheet: 0, conceded_per_goal: 0,  penalty_saved: 0 },
};

const UNIVERSAL = {
  minute_per_90:  1,
  own_goal:      -2,
  yellow_card:   -1,
  red_card:      -3,
  penalty_missed:-1,
};

// ─── BPS ranking (simplified) ─────────────────────────────────────────────────

function calcBPS(stats) {
  return (
    stats.goals        * 30 +
    stats.assists      * 10 +
    stats.minutes      / 5  +
    stats.tackles_won  * 1.5 +
    stats.interceptions * 1
  );
}

function assignBonus(playerStatsList) {
  const ranked = [...playerStatsList].sort((a, b) => b.bps - a.bps);
  const bonusMap = { 0: 3, 1: 2, 2: 1 };
  ranked.forEach((p, i) => {
    p.bonus = bonusMap[i] ?? 0;
  });
}

// ─── Core scoring function ────────────────────────────────────────────────────

function scorePlayer(stats, position) {
  const pos = (position || 'MID').toUpperCase();
  const rules = POINTS[pos] || POINTS.MID;

  let pts = 0;

  // Minutes
  pts += (stats.minutes / 90) * UNIVERSAL.minute_per_90;

  // Goals
  pts += stats.goals * rules.goal;

  // Assists
  pts += stats.assists * rules.assist;

  // Clean sheet (only if played ≥ 60 min)
  if (stats.clean_sheet && stats.minutes >= 60) {
    pts += rules.clean_sheet;
  }

  // Goals conceded (GK only)
  if (pos === 'GK' && !stats.clean_sheet) {
    pts += Math.floor(stats.goals_conceded || 0) * rules.conceded_per_goal;
  }

  // Penalty saved (GK)
  pts += (stats.penalty_saved || 0) * rules.penalty_saved;

  // Universal deductions
  pts += stats.own_goals    * UNIVERSAL.own_goal;
  pts += stats.yellow_cards * UNIVERSAL.yellow_card;
  pts += stats.red_cards    * UNIVERSAL.red_card;
  pts += (stats.penalty_missed || 0) * UNIVERSAL.penalty_missed;

  // Bonus
  pts += stats.bonus || 0;

  return Math.round(pts * 100) / 100;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST required' }), { status: 405 });
  }

  let fixture_id;
  try {
    ({ fixture_id } = await req.json());
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  if (!fixture_id) {
    return new Response(JSON.stringify({ error: 'fixture_id required' }), { status: 400 });
  }

  try {
    // 1. Load fixture to get home/away teams and current status
    const { data: fixture, error: fixErr } = await supabase
      .from('fixtures')
      .select('id, home_team, away_team, status, minute')
      .eq('id', fixture_id)
      .single();

    if (fixErr || !fixture) {
      return new Response(JSON.stringify({ error: 'Fixture not found' }), { status: 404 });
    }

    // 2. Load all match_events for this fixture
    const { data: events } = await supabase
      .from('match_events')
      .select('player_id, type, minute, team')
      .eq('fixture_id', fixture_id);

    if (!events || events.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: 'No events yet', updated_squads: 0, player_stats: 0 }), { status: 200 });
    }

    // 3. Aggregate raw events → per-player stats
    const statsMap = {};
    const goalsPerTeam = {};

    for (const ev of events) {
      if (!ev.player_id) continue;
      if (!statsMap[ev.player_id]) {
        statsMap[ev.player_id] = {
          player_id: ev.player_id,
          minutes: 90,       // default; sub tracking requires more event data
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
        case 'goal':    s.goals++;         goalsPerTeam[ev.team] = (goalsPerTeam[ev.team] || 0) + 1; break;
        case 'assist':  s.assists++;       break;
        case 'own_goal': s.own_goals++;    goalsPerTeam[ev.team] = (goalsPerTeam[ev.team] || 0) + 1; break;
        case 'yellow':  s.yellow_cards++;  break;
        case 'red':     s.red_cards++;     break;
        case 'penalty_saved':  s.penalty_saved++;  break;
        case 'penalty_missed': s.penalty_missed++; break;
        case 'sub_off':        s.minutes = parseInt(ev.minute) || s.minutes; break;
      }
    }

    // Determine clean sheets from goals conceded per team
    const teamGoals = goalsPerTeam;

    // 4. Load player positions from DB
    const playerIds = Object.keys(statsMap);
    const { data: playerRows } = await supabase
      .from('players')
      .select('id, position, club')
      .in('id', playerIds);

    const positionMap = {};
    const clubMap = {};
    for (const p of playerRows || []) {
      positionMap[p.id] = p.position;
      clubMap[p.id] = p.club;
    }

    // Assign clean sheets: player's club conceded 0 goals from opposing team events
    for (const [pid, stats] of Object.entries(statsMap)) {
      const club = clubMap[pid];
      const goalsAgainst = teamGoals[club] || 0;
      stats.goals_conceded = goalsAgainst;
      stats.clean_sheet = goalsAgainst === 0;
    }

    // 5. BPS ranking → bonus points
    const statsList = Object.values(statsMap);
    statsList.forEach(s => { s.bps = calcBPS(s); });
    assignBonus(statsList);

    // 6. Calculate fantasy points per player
    const playerStatUpserts = statsList.map(s => {
      const pos = positionMap[s.player_id] || 'MID';
      const pts = scorePlayer(s, pos);
      const breakdown = {
        minutes: Math.round((s.minutes / 90) * 100) / 100,
        goals: s.goals * (POINTS[pos.toUpperCase()]?.goal || 3),
        assists: s.assists * 1,
        clean_sheet: (s.clean_sheet && s.minutes >= 60) ? (POINTS[pos.toUpperCase()]?.clean_sheet || 0) : 0,
        own_goals: s.own_goals * UNIVERSAL.own_goal,
        yellow_cards: s.yellow_cards * UNIVERSAL.yellow_card,
        red_cards: s.red_cards * UNIVERSAL.red_card,
        bonus: s.bonus,
      };

      return {
        fixture_id,
        player_id: s.player_id,
        minutes_played: s.minutes,
        goals: s.goals,
        assists: s.assists,
        own_goals: s.own_goals,
        yellow_cards: s.yellow_cards,
        red_cards: s.red_cards,
        penalty_saved: s.penalty_saved,
        penalty_missed: s.penalty_missed,
        clean_sheet: s.clean_sheet,
        bps_score: s.bps,
        bonus_points: s.bonus,
        fantasy_points: pts,
        breakdown,
        updated_at: new Date().toISOString(),
      };
    });

    await supabase
      .from('player_match_stats')
      .upsert(playerStatUpserts, { onConflict: 'fixture_id,player_id' });

    // 7. Build player_id → fantasy_points lookup
    const pointsLookup = {};
    for (const u of playerStatUpserts) {
      pointsLookup[u.player_id] = u.fantasy_points;
    }

    // 8. Load all squads and calculate squad-level totals
    const { data: squads } = await supabase
      .from('squads')
      .select('id, user_id, league_id, matchday_id, players, captain_id, is_triple_captain, is_wildcard');

    if (!squads || squads.length === 0) {
      return new Response(JSON.stringify({ ok: true, updated_squads: 0, player_stats: playerStatUpserts.length }), { status: 200 });
    }

    const fantasyPointsUpserts = [];

    for (const squad of squads) {
      const pitchPlayers = (squad.players || []).slice(0, 11);
      let total = 0;

      for (const pid of pitchPlayers) {
        let pts = pointsLookup[pid] || 0;

        // Captain multiplier
        if (pid === squad.captain_id) {
          pts = pts * (squad.is_triple_captain ? 3 : 2);
        }

        // Wildcard: +10% to all (rounded)
        if (squad.is_wildcard) {
          pts = Math.round(pts * 1.1 * 100) / 100;
        }

        total += pts;
      }

      fantasyPointsUpserts.push({
        squad_id: squad.id,
        matchday_id: squad.matchday_id || 'current',
        total: Math.round(total * 100) / 100,
        breakdown: { fixture_id, player_count: pitchPlayers.length },
      });
    }

    await supabase
      .from('fantasy_points')
      .upsert(fantasyPointsUpserts, { onConflict: 'squad_id,matchday_id' });

    // 9. Update league_members total_points from sum of fantasy_points
    for (const squad of squads) {
      const { data: totalRow } = await supabase
        .from('fantasy_points')
        .select('total')
        .eq('squad_id', squad.id);

      const grandTotal = (totalRow || []).reduce((sum, r) => sum + (r.total || 0), 0);

      await supabase
        .from('league_members')
        .update({ total_points: Math.round(grandTotal * 100) / 100 })
        .eq('user_id', squad.user_id)
        .eq('league_id', squad.league_id);
    }

    // 10. Broadcast via Realtime so LiveScreen updates without polling
    await supabase.channel('scores').send({
      type: 'broadcast',
      event: 'points_updated',
      payload: { fixture_id, updated_at: new Date().toISOString() },
    });

    return new Response(
      JSON.stringify({ ok: true, updated_squads: squads.length, player_stats: playerStatUpserts.length }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('calculate-scores error:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
