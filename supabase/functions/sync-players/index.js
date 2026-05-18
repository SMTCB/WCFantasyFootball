// Edge Function: sync-players
// Fetches teams from fixtures table, then fetches each team's squad from Forza
// and upserts into teams (global) and players (per-tournament) tables.
//
// POST body: { forza_id: string }   — Forza tournament ID, e.g. '426' or '429'
// Returns:   { ok: true, teams_upserted: N, players_upserted: N }
//
// NOTE: Forza's /v1/tournaments/:id/teams endpoint is CloudFront-blocked from
// direct access, so teams are derived from fixtures table instead. Run
// sync-fixtures first to ensure fixture rows exist for the tournament.
//
// DOES NOT run unless tournaments.sync_enabled = true for this forza_id.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
);

const FORZA_BASE  = 'https://api.forzafootball.com';
const FORZA_TOKEN = Deno.env.get('FORZA_ACCESS_TOKEN');

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

// Skip placeholder fixture entries (e.g. '1E', 'W101', '3A/3B/3C/3D/3F')
function isRealTeam(name) {
  if (!name || name.length <= 2) return false;
  if (name.includes('/')) return false;
  if (name.startsWith('W') && /^\d/.test(name.slice(1))) return false;
  if (name.startsWith('RU')) return false;
  if (/^\d/.test(name)) return false;
  return true;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return respond(405, { error: 'POST required' });

  let forza_id;
  try { ({ forza_id } = await req.json()); }
  catch { return respond(400, { error: 'Invalid JSON body' }); }
  if (!forza_id) return respond(400, { error: 'forza_id required' });

  // ── 1. Check tournament exists and sync is enabled ─────────────────────────
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
    // ── 2. Extract unique real teams from fixtures ──────────────────────────
    // Forza's /v1/tournaments/:id/teams endpoint is blocked by CloudFront from
    // outside Supabase IPs, so we derive teams from fixture data instead.
    const { data: fixtures, error: fErr } = await supabase
      .from('fixtures')
      .select('home_team_forza_id, away_team_forza_id, home_team, away_team')
      .eq('tournament_id', forza_id);

    if (fErr) return respond(500, { error: `fixtures query: ${fErr.message}` });

    const teamMap = {};
    for (const f of fixtures ?? []) {
      if (f.home_team_forza_id && isRealTeam(f.home_team))
        teamMap[f.home_team_forza_id] = f.home_team;
      if (f.away_team_forza_id && isRealTeam(f.away_team))
        teamMap[f.away_team_forza_id] = f.away_team;
    }

    const teamEntries = Object.entries(teamMap);
    if (!teamEntries.length) {
      return respond(200, {
        ok: true, teams_upserted: 0, players_upserted: 0,
        note: 'No fixtures found — run sync-fixtures first',
      });
    }

    // ── 3. Upsert teams (global — one row per team across all tournaments) ──
    // Teams are shared across tournaments (e.g. Arsenal in EPL + Champions League).
    // Unique constraint is on forza_team_id only. tournament_id records which
    // tournament most recently synced this team.
    const teamRows = teamEntries.map(([teamId, teamName]) => ({
      forza_team_id: String(teamId),
      name:          teamName,
      tournament_id: forza_id,
    }));

    const { error: teamErr } = await supabase
      .from('teams')
      .upsert(teamRows, { onConflict: 'forza_team_id' });

    if (teamErr) {
      console.error('teams upsert error:', JSON.stringify(teamErr));
    }

    // ── 4. Fetch each team's squad and upsert players (per-tournament) ──────
    // Players are scoped per-tournament: same player can have different fantasy
    // contexts (e.g. Mbappe for PSG in Ligue 1, for France in WC2026).
    // ID format: 'fp-{forza_player_id}-{tournament_id}'
    const BATCH = 5;
    let totalPlayers = 0;
    const errors = [];

    for (let i = 0; i < teamEntries.length; i += BATCH) {
      const batch = teamEntries.slice(i, i + BATCH);

      await Promise.all(batch.map(async ([teamId, teamName]) => {
        try {
          const data = await forza(`/v1/teams/${teamId}/squad`);
          const squad = data?.players ?? data?.squad ?? [];
          if (!squad.length) return;

          const playerRows = squad.map(p => {
            const name = p.nickname
              ? p.nickname
              : [p.first_name, p.last_name].filter(Boolean).join(' ');
            return {
              id:              `fp-${p.id}-${forza_id}`,
              name,
              position:        POSITION_MAP[p.position] ?? 'MID',
              nationality:     p.region?.name ?? null,
              club:            teamName,
              forza_player_id: String(p.id),
              forza_team_id:   String(teamId),
              tournament_id:   forza_id,
              birthdate:       p.birthdate ?? null,
              height:          p.height ?? null,
              price:           null,
            };
          });

          const { error: pErr } = await supabase
            .from('players')
            .upsert(playerRows, { onConflict: 'forza_player_id,tournament_id' });

          if (pErr) {
            console.error(`players upsert for team ${teamName}:`, JSON.stringify(pErr));
            errors.push(`${teamName}: ${pErr.message}`);
          } else {
            totalPlayers += playerRows.length;
          }
        } catch (e) {
          console.error(`Failed to fetch squad for team ${teamId} (${teamName}):`, e.message);
          errors.push(`${teamName}: ${e.message}`);
        }
      }));
    }

    return respond(200, {
      ok:              true,
      teams_upserted:  teamEntries.length,
      players_upserted: totalPlayers,
      errors:          errors.length ? errors : undefined,
    });

  } catch (err) {
    console.error('sync-players error:', err.message);
    return respond(500, { error: err.message });
  }
});
