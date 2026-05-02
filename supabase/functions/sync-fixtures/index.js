// Edge Function: sync-fixtures
// Fetches all matches for a tournament from Forza and upserts them into
// the fixtures table. Also derives and upserts matchday deadlines
// (MIN kickoff_at per round).
//
// POST body: { forza_id: string }   — Forza tournament ID, e.g. '426'
// Returns:   { ok: true, fixtures_upserted: N, deadlines_upserted: N }
//
// DOES NOT run unless tournaments.sync_enabled = true for this forza_id.
// To activate: UPDATE tournaments SET sync_enabled = true WHERE forza_id = '426';

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
);

const FORZA_BASE  = 'https://api.forzafootball.com';
const FORZA_TOKEN = Deno.env.get('FORZA_ACCESS_TOKEN');

async function forza(path) {
  const res = await fetch(`${FORZA_BASE}${path}?access_token=${FORZA_TOKEN}`);
  if (!res.ok) throw new Error(`Forza ${path} → HTTP ${res.status}`);
  return res.json();
}

function respond(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Map Forza match status to our enum
function mapStatus(forzaStatus) {
  if (forzaStatus === 'live')  return 'live';
  if (forzaStatus === 'after') return 'finished';
  return 'scheduled';
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return respond(405, { error: 'POST required' });

  let forza_id;
  try { ({ forza_id } = await req.json()); }
  catch { return respond(400, { error: 'Invalid JSON body' }); }
  if (!forza_id) return respond(400, { error: 'forza_id required' });

  // ── 1. Load tournament and check the plug ──────────────────────────────────
  const { data: tournament, error: tErr } = await supabase
    .from('tournaments')
    .select('forza_id, name, slug, sync_enabled, environment')
    .eq('forza_id', forza_id)
    .single();

  if (tErr || !tournament) return respond(404, { error: `Tournament ${forza_id} not found` });
  if (!tournament.sync_enabled) {
    return respond(403, {
      error: `sync_enabled = false for tournament ${forza_id}. ` +
             `Run: UPDATE tournaments SET sync_enabled = true WHERE forza_id = '${forza_id}';`
    });
  }

  try {
    // ── 2. Fetch all matches from Forza ───────────────────────────────────────
    const { matches } = await forza(`/v1/tournaments/${forza_id}/matches`);
    if (!matches?.length) return respond(200, { ok: true, fixtures_upserted: 0, deadlines_upserted: 0 });

    // ── 3. Build fixture upsert rows ──────────────────────────────────────────
    // Our fixtures.id must be a stable TEXT key — use forza_match_id as the
    // primary key for Forza-sourced fixtures (prefix 'f-' to avoid collisions
    // with existing mock data like 'md1-f1').
    const fixtureRows = matches.map(m => ({
      id:                   `f-${m.id}`,                    // stable internal ID
      forza_match_id:       String(m.id),
      tournament_id:        forza_id,
      round_number:         m.round ?? null,
      home_team:            m.home_team?.name ?? 'TBD',
      away_team:            m.away_team?.name ?? 'TBD',
      home_team_forza_id:   m.home_team?.id ? String(m.home_team.id) : null,
      away_team_forza_id:   m.away_team?.id ? String(m.away_team.id) : null,
      kickoff_at:           m.kickoff_at,
      competition:          `${tournament.name} · Round ${m.round ?? '?'}`,
      status:               mapStatus(m.status),
      status_detail:        m.status_detail ?? null,
      scores: m.scores?.current
        ? { home: m.scores.current[0], away: m.scores.current[1] }
        : null,
    }));

    const { error: fixErr } = await supabase
      .from('fixtures')
      .upsert(fixtureRows, { onConflict: 'id' });

    if (fixErr) throw new Error(`fixtures upsert: ${JSON.stringify(fixErr)}`);

    // ── 4. Derive matchday deadlines: MIN(kickoff_at) per round ───────────────
    // Group all matches by round number, take the earliest kickoff.
    const deadlineMap = {};
    for (const m of matches) {
      const round = m.round;
      if (!round) continue;
      if (!deadlineMap[round] || m.kickoff_at < deadlineMap[round]) {
        deadlineMap[round] = m.kickoff_at;
      }
    }

    const deadlineRows = Object.entries(deadlineMap).map(([round, kickoff]) => ({
      matchday_id:   `${forza_id}-r${round}`,   // e.g. '426-r35'
      label:         `Round ${round}`,
      deadline_at:   kickoff,                    // squad lock = first kickoff of the round
      tournament_id: forza_id,
    }));

    const { error: dlErr } = await supabase
      .from('matchday_deadlines')
      .upsert(deadlineRows, { onConflict: 'matchday_id' });

    if (dlErr) console.error('matchday_deadlines upsert error:', JSON.stringify(dlErr));

    return respond(200, {
      ok: true,
      fixtures_upserted:  fixtureRows.length,
      deadlines_upserted: deadlineRows.length,
      tournament:         tournament.name,
      environment:        tournament.environment,
    });

  } catch (err) {
    console.error('sync-fixtures error:', err.message);
    return respond(500, { error: err.message });
  }
});
