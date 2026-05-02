// Edge Function: sync-players
// Fetches every team in a tournament from Forza, then fetches each team's
// full squad and upserts the results into the teams and players tables.
//
// POST body: { forza_id: string }
// Returns:   { ok: true, teams_upserted: N, players_upserted: N }
//
// DOES NOT run unless tournaments.sync_enabled = true.
// Run sync-fixtures first so tournament row exists.
// Run this function again before each matchday to catch transfers/call-ups.

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

// Forza position → our internal position code
const POSITION_MAP = {
  goalkeeper: 'GK',
  defender:   'DEF',
  midfielder: 'MID',
  attacker:   'FWD',
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return respond(405, { error: 'POST required' });

  let forza_id;
  try { ({ forza_id } = await req.json()); }
  catch { return respond(400, { error: 'Invalid JSON body' }); }
  if (!forza_id) return respond(400, { error: 'forza_id required' });

  // ── 1. Check tournament + plug ─────────────────────────────────────────────
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('forza_id, name, sync_enabled')
    .eq('forza_id', forza_id)
    .single();

  if (!tournament) return respond(404, { error: `Tournament ${forza_id} not found` });
  if (!tournament.sync_enabled) {
    return respond(403, { error: `sync_enabled = false for tournament ${forza_id}` });
  }

  try {
    // ── 2. Fetch all teams in tournament ────────────────────────────────────
    const { teams: forzaTeams } = await forza(`/v1/tournaments/${forza_id}/teams`);
    if (!forzaTeams?.length) return respond(200, { ok: true, teams_upserted: 0, players_upserted: 0 });

    // ── 3. Upsert teams ──────────────────────────────────────────────────────
    const teamRows = forzaTeams.map(t => ({
      forza_team_id: String(t.id),
      tournament_id: forza_id,
      name:          t.name,
      abbreviation:  t.abbreviation ?? null,
      region:        t.region?.name ?? null,
    }));

    const { error: teamErr } = await supabase
      .from('teams')
      .upsert(teamRows, { onConflict: 'forza_team_id' });

    if (teamErr) throw new Error(`teams upsert: ${JSON.stringify(teamErr)}`);

    // ── 4. Fetch each team's squad and upsert players ────────────────────────
    // Concurrency: batch teams in groups of 5 to avoid overwhelming Forza.
    const BATCH = 5;
    let totalPlayers = 0;
    const errors = [];

    for (let i = 0; i < forzaTeams.length; i += BATCH) {
      const batch = forzaTeams.slice(i, i + BATCH);

      await Promise.all(batch.map(async (team) => {
        try {
          const { players: squad } = await forza(`/v1/teams/${team.id}/squad`);
          if (!squad?.length) return;

          const playerRows = squad.map(p => {
            // Forza player name: prefer nickname, else first+last
            const name = p.nickname
              ? p.nickname
              : [p.first_name, p.last_name].filter(Boolean).join(' ');

            return {
              // Internal ID: tournament-scoped so the same player (same forza_player_id)
              // can exist in multiple tournaments (EPL as Arsenal + WC as England).
              // Format: 'fp-{forza_player_id}-{tournament_id}'
              id:               `fp-${p.id}-${forza_id}`,
              name,
              position:         POSITION_MAP[p.position] ?? 'MID',
              nationality:      p.region?.name ?? null,   // Forza uses region for nationality
              club:             team.name,
              forza_player_id:  String(p.id),
              forza_team_id:    String(team.id),
              tournament_id:    forza_id,
              birthdate:        p.birthdate ?? null,
              height:           p.height ?? null,
              // price: not available from Forza — left as null, seed separately
              price:            null,
            };
          });

          const { error: pErr } = await supabase
            .from('players')
            .upsert(playerRows, { onConflict: 'forza_player_id,tournament_id' });

          if (pErr) {
            console.error(`players upsert for team ${team.name}:`, JSON.stringify(pErr));
            errors.push(`${team.name}: ${pErr.message}`);
          } else {
            totalPlayers += playerRows.length;
          }
        } catch (e) {
          console.error(`Failed to fetch squad for team ${team.id} (${team.name}):`, e.message);
          errors.push(`${team.name}: ${e.message}`);
        }
      }));
    }

    return respond(200, {
      ok: true,
      teams_upserted:   teamRows.length,
      players_upserted: totalPlayers,
      errors:           errors.length ? errors : undefined,
      note: 'player.price is null — seed valuations separately via 17_player_valuations.sql',
    });

  } catch (err) {
    console.error('sync-players error:', err.message);
    return respond(500, { error: err.message });
  }
});
