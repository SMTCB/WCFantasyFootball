// Edge Function: ingest-match-events
// The core live data pipeline. For a given match, fetches data from 4 Forza
// endpoints in parallel, merges the results, and writes:
//   • player_match_stats  — rich per-player stats for the scoring engine
//   • match_events        — event-level feed for the Live screen activity log
//
// After writing, calls calculate-scores to update fantasy points.
//
// POST body: { forza_match_id: string }
// Returns:   { ok: true, players_ingested: N, events_written: N }
//
// Call this function:
//   • Every ~60s while match status = 'live'   (polling loop, set up separately)
//   • Once after match status = 'after'        (final settlement pass)
//
// Data sources used:
//   E4  /v1/matches/:id                        → scores (for clean sheet derivation)
//   E5  /v1/matches/:id/lineups                → positions + own_goals (EventDigest)
//   E9  /v2/matches/:id/periods                → event feed + red cards + penalty events
//   E10 /v2/matches/:id/player_statistics      → authoritative stats (goals, assists,
//                                                 minutes, cards, tackles, saves, xG/xA…)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
);

const FORZA_BASE      = 'https://api.forzafootball.com';
const FORZA_TOKEN     = Deno.env.get('FORZA_ACCESS_TOKEN');
const SELF_BASE_URL   = Deno.env.get('SUPABASE_URL');
const SELF_ANON_KEY   = Deno.env.get('SUPABASE_ANON_KEY');

async function logError(severity, message, context = {}) {
  try {
    await supabase.from('edge_function_errors').insert({
      function: 'ingest-match-events', severity, message, context,
    });
  } catch { /* silent */ }
}

async function forza(path, retries = 3) {
  const url = `${FORZA_BASE}${path}?access_token=${FORZA_TOKEN}`;
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (res.status === 204) return null;
      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        lastErr = new Error(`Forza ${path} → HTTP ${res.status}`);
        if (attempt < retries) await new Promise(r => setTimeout(r, attempt * 1_000));
        continue;
      }
      if (!res.ok) throw new Error(`Forza ${path} → HTTP ${res.status}`);
      return res.json();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await new Promise(r => setTimeout(r, attempt * 1_000));
    }
  }
  throw lastErr;
}

function respond(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const POSITION_MAP = {
  goalkeeper: 'GK',
  defender:   'DEF',
  midfielder: 'MID',
  attacker:   'FWD',
};

// ── Build a flat player stats map from E10 player_statistics ─────────────────
// E10 shape: { player_statistics: { goals: [{player_id, team_id, value, rank}…], … } }
// Returns: { [forza_player_id]: { goals, assists, minutes_played, … } }
function flattenPlayerStats(raw) {
  const map = {};
  if (!raw?.player_statistics) return map;

  for (const [stat, entries] of Object.entries(raw.player_statistics)) {
    for (const entry of entries) {
      const pid = String(entry.player_id);
      if (!map[pid]) map[pid] = { forza_player_id: pid, forza_team_id: String(entry.team_id) };
      map[pid][stat] = entry.value;
    }
  }
  return map;
}

// ── Extract event-feed rows from E9 periods ───────────────────────────────────
// Returns: {
//   redCards:                Set<forza_player_id>,
//   penaltyMissed:           Set<forza_player_id>,
//   penaltyMissedByTeamSide: { 'home'|'away': count },   ← used to credit opposing GK
//   penaltyScoredMap:        { [forza_player_id]: count },
//   activityEvents:          []
// }
// Note: penalty_saved per GK is derived in the main statsUpserts loop, not here,
// because we need to know each player's team side to find "their" opposing GK.
function processPeriodsData(periodsData, homeTeamForzaId) {
  const result = {
    redCards:                new Set(),
    penaltyMissed:           new Set(),
    penaltyMissedByTeamSide: {},   // 'home'|'away' → number of missed penalties by that team
    penaltyScoredMap:        {},   // forza_player_id → penalties scored count
    activityEvents:          [],
  };

  if (!periodsData?.periods) return result;

  for (const period of periodsData.periods) {
    for (const ev of period.events ?? []) {
      const isHome      = ev.team_side === 'home';
      const playerForzaId = ev.player?.id ? String(ev.player.id) : null;

      if (ev.type === 'card' && ev.detail === 'red' && playerForzaId) {
        result.redCards.add(playerForzaId);
        result.activityEvents.push({
          type: 'red', player_forza_id: playerForzaId,
          team_side: ev.team_side, minute: String(ev.match_minute ?? '?'),
        });
      }

      if (ev.type === 'missed_goal' && ev.detail === 'penalty') {
        if (playerForzaId) result.penaltyMissed.add(playerForzaId);
        // Track which team missed so the opposing GK can receive penalty_saved credit
        if (ev.team_side) {
          result.penaltyMissedByTeamSide[ev.team_side] =
            (result.penaltyMissedByTeamSide[ev.team_side] ?? 0) + 1;
        }
        result.activityEvents.push({
          type: 'penalty_missed', player_forza_id: playerForzaId,
          team_side: ev.team_side, minute: String(ev.match_minute ?? '?'),
        });
      }

      if (ev.type === 'goal') {
        const isPenalty = ev.detail === 'penalty';

        // Track penalty scored per player (for FWD +1 bonus in scoring)
        if (isPenalty && playerForzaId) {
          result.penaltyScoredMap[playerForzaId] = (result.penaltyScoredMap[playerForzaId] ?? 0) + 1;
        }

        // Own goals are detected via E5 EventDigest own_goal_count — skip here
        result.activityEvents.push({
          type: 'goal',
          player_forza_id: playerForzaId,
          assisting_forza_id: ev.assisting_player?.id ? String(ev.assisting_player.id) : null,
          is_penalty: isPenalty,
          team_side: ev.team_side,
          minute: String(ev.match_minute ?? '?'),
          score: ev.score,
        });
      }

      if (ev.type === 'card' && ev.detail === 'yellow') {
        result.activityEvents.push({
          type: 'yellow', player_forza_id: playerForzaId,
          team_side: ev.team_side, minute: String(ev.match_minute ?? '?'),
        });
      }

      if (ev.type === 'substitution') {
        result.activityEvents.push({
          type: 'sub',
          player_forza_id: ev.player_out?.id ? String(ev.player_out.id) : null,
          player_in_forza_id: ev.player_in?.id ? String(ev.player_in.id) : null,
          team_side: ev.team_side,
          minute: String(ev.match_minute ?? '?'),
        });
      }
    }
  }

  return result;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return respond(405, { error: 'POST required' });

  let forza_match_id;
  try { ({ forza_match_id } = await req.json()); }
  catch { return respond(400, { error: 'Invalid JSON body' }); }
  if (!forza_match_id) return respond(400, { error: 'forza_match_id required' });

  const fmid = String(forza_match_id);

  try {
    // ── 1. Look up our internal fixture record ─────────────────────────────────
    const { data: fixture } = await supabase
      .from('fixtures')
      .select('id, tournament_id, home_team_forza_id, away_team_forza_id, round_number')
      .eq('forza_match_id', fmid)
      .single();

    if (!fixture) {
      return respond(404, {
        error: `No fixture found for forza_match_id=${fmid}. Run sync-fixtures first.`
      });
    }

    // ── 2. Fetch 4 Forza endpoints in parallel ────────────────────────────────
    const [matchData, lineupsData, periodsData, statsData] = await Promise.all([
      forza(`/v1/matches/${fmid}`),
      forza(`/v1/matches/${fmid}/lineups`),
      forza(`/v2/matches/${fmid}/periods`),
      forza(`/v2/matches/${fmid}/player_statistics`),
    ]);

    if (!matchData) return respond(200, { ok: true, message: 'Match data not available yet', players_ingested: 0, events_written: 0 });

    // ── 3. Update fixture status and score ────────────────────────────────────
    // Forza API uses 'matchData.score.current', not 'matchData.scores.current'
    await supabase.from('fixtures').update({
      status:        matchData.status === 'live' ? 'live' : matchData.status === 'after' ? 'finished' : 'scheduled',
      status_detail: matchData.status_detail ?? null,
      home_score:    matchData.score?.current?.[0] ?? null,
      away_score:    matchData.score?.current?.[1] ?? null,
      scores:        matchData.score?.current
                       ? { home: matchData.score.current[0], away: matchData.score.current[1] }
                       : null,
    }).eq('id', fixture.id);

    // ── 4. Build player ID lookup: forza_player_id → { internalId, position } ─
    const homeId = fixture.home_team_forza_id;
    const awayId = fixture.away_team_forza_id;

    // Filter by tournament_id so the same forza_player_id in two different
    // tournaments (e.g. Saka as Arsenal/EPL AND Saka as England/WC) resolves
    // to the correct tournament-scoped internal player row.
    const { data: players } = await supabase
      .from('players')
      .select('id, forza_player_id, position')
      .in('forza_team_id', [homeId, awayId].filter(Boolean))
      .eq('tournament_id', fixture.tournament_id);

    const playerLookup = {};   // forza_player_id → { id, position }
    for (const p of players ?? []) {
      if (p.forza_player_id) {
        playerLookup[p.forza_player_id] = { id: p.id, position: p.position };
      }
    }

    // ── 5. Supplement positions from lineups (E5) if not yet in our DB ────────
    // Also extract own_goal_count from EventDigest (only source for own goals)
    const ownGoalMap = {};  // forza_player_id → count
    if (lineupsData?.lineups) {
      for (const side of ['home', 'away']) {
        const lineup = lineupsData.lineups[side];
        if (!lineup) continue;
        for (const p of [...(lineup.pitch_players ?? []), ...(lineup.bench_players ?? [])]) {
          if (!p.player_id) continue;
          const fpid = String(p.player_id);

          // Fill in position if missing from our lookup
          if (!playerLookup[fpid] && p.position) {
            playerLookup[fpid] = { id: null, position: POSITION_MAP[p.position] ?? 'MID' };
          } else if (playerLookup[fpid] && !playerLookup[fpid].position && p.position) {
            playerLookup[fpid].position = POSITION_MAP[p.position] ?? 'MID';
          }

          // Own goals from EventDigest
          if (p.event_digest?.own_goal_count) {
            ownGoalMap[fpid] = p.event_digest.own_goal_count;
          }
        }
      }
    }

    // ── 6. Flatten E10 stats ──────────────────────────────────────────────────
    const statsMap = flattenPlayerStats(statsData);

    // ── 7. Process periods for red cards, penalty events, activity feed ────────
    const periodsResult = processPeriodsData(periodsData, homeId);

    // ── 8. Derive clean sheets ────────────────────────────────────────────────
    // clean sheet = player's team conceded 0 goals AND player played ≥ 60 min
    const homeScore = matchData.score?.current?.[0] ?? 0;
    const awayScore = matchData.score?.current?.[1] ?? 0;
    // Home team conceded = away score; away team conceded = home score
    const concededByTeam = {
      [homeId]: awayScore,
      [awayId]: homeScore,
    };

    // ── 9. Build player_match_stats upsert rows ───────────────────────────────
    const statsUpserts = [];

    // Union of all player IDs seen in E10 (primary) + E5 lineups
    const allForzaPlayerIds = new Set([
      ...Object.keys(statsMap),
      ...Object.keys(playerLookup),
    ]);

    for (const fpid of allForzaPlayerIds) {
      const internal = playerLookup[fpid];
      if (!internal?.id) continue;    // player not in our DB — skip

      const s        = statsMap[fpid] ?? {};
      const teamId   = s.forza_team_id ?? null;
      const conceded = teamId ? (concededByTeam[teamId] ?? 0) : 0;
      const mins     = s.minutes_played ?? 0;

      // Penalty save: GKs only. If the opposing team missed a penalty, this GK saved it.
      // (Approximation: can't distinguish save from post/bar, but saves are the vast majority.)
      const teamSide    = teamId === homeId ? 'home' : teamId === awayId ? 'away' : null;
      const oppTeamSide = teamSide === 'home' ? 'away' : teamSide === 'away' ? 'home' : null;
      const penaltySaved = (internal.position === 'GK' && oppTeamSide)
        ? (periodsResult.penaltyMissedByTeamSide[oppTeamSide] ?? 0)
        : 0;

      statsUpserts.push({
        fixture_id:     fixture.id,
        player_id:      internal.id,
        forza_match_id: fmid,

        // From E10 — direct fields
        minutes_played:  mins,
        goals:           s.goals             ?? 0,
        assists:         s.assists           ?? 0,
        yellow_cards:    s.yellow_cards      ?? 0,
        saves:           s.saves             ?? 0,
        shots_on_target: s.shots_on_target   ?? 0,
        tackles_won:     s.won_tackles       ?? 0,
        interceptions:   s.interceptions     ?? 0,
        xg:              s.expected_goals    ?? 0,
        xa:              s.expected_assists  ?? 0,

        // From E9 — derived
        red_cards:       periodsResult.redCards.has(fpid)      ? 1 : 0,
        penalty_missed:  periodsResult.penaltyMissed.has(fpid) ? 1 : 0,
        penalty_saved:   penaltySaved,
        penalty_scored:  periodsResult.penaltyScoredMap[fpid]  ?? 0,

        // From E5 EventDigest — only source for own goals
        own_goals:       ownGoalMap[fpid] ?? 0,

        // Derived from match scores
        goals_conceded:  conceded,
        clean_sheet:     conceded === 0 && mins >= 60,

        // BPS and bonus — calculated by calculate-scores after this upsert
        bps_score:       0,
        bonus_points:    0,
        fantasy_points:  0,
        updated_at:      new Date().toISOString(),
      });
    }

    if (statsUpserts.length) {
      const { error: statsErr } = await supabase
        .from('player_match_stats')
        .upsert(statsUpserts, { onConflict: 'fixture_id,player_id' });

      if (statsErr) console.error('player_match_stats upsert error:', JSON.stringify(statsErr));
    }

    // ── 10. Write activity feed events to match_events ────────────────────────
    // This powers the Live screen event log. Events with a player_id use upsert
    // (ON CONFLICT DO NOTHING) backed by the unique index on
    // (fixture_id, type, minute, player_id) added in migration 46 — making
    // concurrent runs idempotent. Sub events with null player_id fall back to
    // plain insert (rare, low scoring impact).
    let eventsWritten = 0;

    if (periodsResult.activityEvents.length > 0) {
      const eventRows = [];
      for (const ev of periodsResult.activityEvents) {
        const mainPid = ev.player_forza_id ? playerLookup[ev.player_forza_id]?.id : null;
        if (!mainPid && ev.type !== 'sub') continue;

        const typeMap = {
          goal:           'goal',
          yellow:         'yellow',
          red:            'red',
          sub:            'sub',
          penalty_missed: 'goal',   // stored as goal with negative outcome in outcome JSONB
        };

        const outcome = {};
        if (ev.type === 'goal') {
          outcome.is_penalty    = ev.is_penalty ?? false;
          outcome.assist_player = ev.assisting_forza_id
            ? playerLookup[ev.assisting_forza_id]?.id ?? null
            : null;
          outcome.score         = ev.score ?? null;
        }
        if (ev.type === 'sub') {
          outcome.player_in = ev.player_in_forza_id
            ? playerLookup[ev.player_in_forza_id]?.id ?? null
            : null;
        }

        eventRows.push({
          fixture_id: fixture.id,
          type:       typeMap[ev.type] ?? 'goal',
          player_id:  mainPid,
          minute:     ev.minute,
          team:       ev.team_side === 'home'
                        ? (matchData.home_team?.name ?? 'Home')
                        : (matchData.away_team?.name ?? 'Away'),
          outcome:    Object.keys(outcome).length ? outcome : null,
        });
      }

      if (eventRows.length) {
        // Upsert events that have a player_id — idempotent via migration 46 unique index
        const withPlayer    = eventRows.filter(r => r.player_id != null);
        const withoutPlayer = eventRows.filter(r => r.player_id == null);

        if (withPlayer.length) {
          const { error: evErr } = await supabase
            .from('match_events')
            .upsert(withPlayer, {
              onConflict:       'fixture_id,type,minute,player_id',
              ignoreDuplicates: true,
            });
          if (evErr) console.error('match_events upsert error:', JSON.stringify(evErr));
          else eventsWritten += withPlayer.length;
        }

        // Sub events with no player_id: insert only (not idempotent, but low impact)
        if (withoutPlayer.length) {
          const { error: evErr } = await supabase
            .from('match_events')
            .insert(withoutPlayer);
          if (evErr) console.error('match_events insert (no-player) error:', JSON.stringify(evErr));
          else eventsWritten += withoutPlayer.length;
        }
      }
    }

    // ── 11. Invoke calculate-scores (awaited, with retry) ─────────────────────
    // Awaiting ensures failures are visible in logs and the caller gets a 207
    // if scoring couldn't run. Three attempts with exponential backoff.
    let scoringErr = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(`${SELF_BASE_URL}/functions/v1/calculate-scores`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SELF_ANON_KEY}` },
          body:    JSON.stringify({ fixture_id: fixture.id }),
          signal:  AbortSignal.timeout(30_000),
        });
        if (res.ok) { scoringErr = null; break; }
        scoringErr = `HTTP ${res.status}`;
      } catch (e) {
        scoringErr = e.message;
      }
      if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 2_000));
    }
    if (scoringErr) {
      console.error(`calculate-scores failed after 3 attempts (fixture ${fixture.id}): ${scoringErr}`);
      await logError('critical', 'calculate-scores invoke failed after 3 retries', { fixture_id: fixture.id, error: scoringErr });
    }

    return respond(200, {
      ok:               true,
      players_ingested: statsUpserts.length,
      events_written:   eventsWritten,
      fixture_id:       fixture.id,
      forza_match_id:   fmid,
    });

  } catch (err) {
    console.error('ingest-match-events error:', err.message);
    return respond(500, { error: err.message });
  }
});
