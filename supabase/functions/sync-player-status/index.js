// Edge Function: sync-player-status
// Fetches injury and suspension status for all players in a tournament
// and upserts into player_status. Run once before each matchday.
//
// POST body: { forza_id: string }
// Returns:   { ok: true, updated: N, cleared: N }
//
// Two-pass approach:
//  Pass 1 — upsert all currently unavailable players with their status
//  Pass 2 — players previously marked as doubt/out but now absent from
//            Forza's unavailable list are reset to 'fit'

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { logError } from '../_shared/log.ts';

const FN      = 'sync-player-status';
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

// Map Forza absence/suspension data to our player_status fields
function mapReason(forza_reason, type) {
  if (!forza_reason) return null;
  // Capitalise and humanise the snake_case reason string
  return forza_reason.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function mapStatus(absence) {
  if (!absence) return 'doubt';
  // Suspensions are always definite
  if (absence._type === 'suspension') return 'out';
  // Injuries/sickness: use expected_return as confidence signal
  const returnType = absence.expected_return?.type;
  if (!returnType || returnType === 'unknown')   return 'doubt';
  if (returnType === 'after_season')             return 'out';
  if (returnType === 'estimated_date')           return 'out';
  if (returnType === 'day_to_day')               return 'doubt';
  if (returnType === 'back_in_training')         return 'returning';
  return 'doubt';
}

function mapConfidence(absence) {
  const s = mapStatus(absence);
  if (s === 'out')       return 0;
  if (s === 'returning') return 75;
  return 50;   // doubt
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return respond(405, { error: 'POST required' });

  let forza_id;
  try { ({ forza_id } = await req.json()); }
  catch { return respond(400, { error: 'Invalid JSON body' }); }
  if (!forza_id) return respond(400, { error: 'forza_id required' });

  // ── 1. Check tournament + plug ─────────────────────────────────────────────
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('forza_id, sync_enabled')
    .eq('forza_id', forza_id)
    .single();

  if (!tournament) return respond(404, { error: `Tournament ${forza_id} not found` });
  if (!tournament.sync_enabled) {
    return respond(403, { error: `sync_enabled = false for tournament ${forza_id}` });
  }

  try {
    // ── 2. Get all teams in the tournament ────────────────────────────────────
    const { data: teams } = await supabase
      .from('teams')
      .select('forza_team_id, name')
      .eq('tournament_id', forza_id);

    if (!teams?.length) return respond(200, { ok: true, updated: 0, cleared: 0, note: 'No teams found — run sync-players first' });

    // ── 3. Fetch unavailability for all teams (batched) ───────────────────────
    const unavailablePlayerForzaIds = new Set();
    const statusRows = [];
    const BATCH = 5;

    for (let i = 0; i < teams.length; i += BATCH) {
      const batch = teams.slice(i, i + BATCH);

      await Promise.all(batch.map(async (team) => {
        try {
          const data = await forza(`/v2/teams/${team.forza_team_id}/unavailable_players`);

          // Suspensions
          for (const s of [...(data.suspensions || [])]) {
            const forzaPlayerId = String(s.player?.id);
            if (!forzaPlayerId) continue;
            unavailablePlayerForzaIds.add(forzaPlayerId);

            // Look up internal player ID
            const { data: player } = await supabase
              .from('players')
              .select('id')
              .eq('forza_player_id', forzaPlayerId)
              .single();

            if (!player) continue;

            const matchesLeft = s.total_matches_left ?? null;
            const reason = matchesLeft
              ? `Suspended — ${matchesLeft} match${matchesLeft > 1 ? 'es' : ''} remaining`
              : mapReason(s.reason, 'suspension') ?? 'Suspended';

            statusRows.push({
              player_id:   player.id,
              status:      'out',
              confidence:  0,
              reason,
              return_date: s.suspended_until ?? null,
              updated_at:  new Date().toISOString(),
            });
          }

          // Absences (injuries, sickness, other)
          for (const a of [...(data.absences || [])]) {
            const forzaPlayerId = String(a.player?.id);
            if (!forzaPlayerId) continue;
            unavailablePlayerForzaIds.add(forzaPlayerId);

            const { data: player } = await supabase
              .from('players')
              .select('id')
              .eq('forza_player_id', forzaPlayerId)
              .single();

            if (!player) continue;

            const absenceWithType = { ...a, _type: 'absence' };
            const returnOn = a.expected_return?.returns_on ?? null;
            const reason = a.display_reason
              ?? mapReason(a.reason, a.type)
              ?? (a.type === 'injury' ? 'Injury' : 'Unavailable');

            statusRows.push({
              player_id:   player.id,
              status:      mapStatus(absenceWithType),
              confidence:  mapConfidence(absenceWithType),
              reason,
              return_date: returnOn,
              updated_at:  new Date().toISOString(),
            });
          }

        } catch (e) {
          console.error(`sync-player-status: team ${team.name} failed:`, e.message);
        }
      }));
    }

    // ── 4. Pass 1: upsert all currently unavailable players ───────────────────
    let updated = 0;
    if (statusRows.length) {
      const { error: upErr } = await supabase
        .from('player_status')
        .upsert(statusRows, { onConflict: 'player_id' });

      if (upErr) console.error('player_status upsert error:', JSON.stringify(upErr));
      else updated = statusRows.length;
    }

    // ── 5. Pass 2: reset players who have recovered (no longer in unavailable) ─
    // Find all players in this tournament who are currently non-fit in our DB
    // but did NOT appear in today's Forza unavailability feed → mark as fit.
    const { data: allUnavailableInDb } = await supabase
      .from('player_status')
      .select('player_id, players!inner(forza_player_id, tournament_id)')
      .neq('status', 'fit')
      .eq('players.tournament_id', forza_id);

    const toReset = (allUnavailableInDb || [])
      .filter(row => {
        const forzaId = row.players?.forza_player_id;
        return forzaId && !unavailablePlayerForzaIds.has(forzaId);
      })
      .map(row => row.player_id);

    let cleared = 0;
    if (toReset.length) {
      const { error: resetErr } = await supabase
        .from('player_status')
        .update({ status: 'fit', confidence: 100, reason: null, return_date: null, updated_at: new Date().toISOString() })
        .in('player_id', toReset);

      if (resetErr) console.error('player_status reset error:', JSON.stringify(resetErr));
      else cleared = toReset.length;
    }

    return respond(200, { ok: true, updated, cleared });

  } catch (err) {
    await logError(FN, 'error', err.message, { stack: err.stack });
    return respond(500, { error: err.message });
  }
});
