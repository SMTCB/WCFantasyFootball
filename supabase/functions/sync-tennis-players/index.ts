import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireServiceRole } from '../_shared/auth.ts';

// ─────────────────────────────────────────────────────────────────────────────
// sync-tennis-players — Admin-triggered only (never cron)
//
// API budget: 50 req/day on free plan. This function uses exactly 1 API call
// per invocation. Admin must only trigger this once per tournament.
//
// Request body: { tournament_id: string }
//
// Flow:
//   1. Load tennis_tournaments row → check external_id is set
//   2. Call GET /tennis/v2/atp/fixtures/tournament/{external_id} (1 API call)
//   3. Extract unique players from draw fixture list
//   4. Infer tier from seed (or draw position if unseeded)
//   5. Call admin_seed_tournament_players RPC to upsert results
//
// Tier mapping (consistent across all tournament types):
//   T1 = seeds 1–4    (top contenders — user picks exactly 1)
//   T2 = seeds 5–16   (strong picks — user picks 2)
//   T3 = seeds 17–32  (outsiders — user picks 2)
//   T4 = unseeded     (Dark Horses — user picks 2)
//
// API endpoint: https://tennis-api-atp-wta-itf.p.rapidapi.com/tennis/v2/
// ─────────────────────────────────────────────────────────────────────────────

const RAPIDAPI_HOST = 'tennis-api-atp-wta-itf.p.rapidapi.com';
const RAPIDAPI_BASE = `https://${RAPIDAPI_HOST}/tennis/v2`;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function inferTier(seed: number | null): number {
  if (!seed || seed <= 0) return 4;       // unseeded → Dark Horse
  if (seed <= 4)  return 1;
  if (seed <= 16) return 2;
  if (seed <= 32) return 3;
  return 4;                               // 33+ → treat as Dark Horse
}

function extractNationality(playerData: Record<string, unknown>): string | null {
  // API may return country as iocCode, country_code, or nationality
  return (
    (playerData.iocCode as string) ||
    (playerData.country_code as string) ||
    (playerData.nationality as string) ||
    null
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authErr = await requireServiceRole(req);
  if (authErr) return authErr;

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const rapidApiKey = Deno.env.get('RAPIDAPI_TENNIS_KEY');
    if (!rapidApiKey) {
      return new Response(
        JSON.stringify({ error: 'RAPIDAPI_TENNIS_KEY secret not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const body = await req.json();
    const { tournament_id } = body;

    if (!tournament_id) {
      return new Response(
        JSON.stringify({ error: 'tournament_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── 1. Load tournament row ────────────────────────────────────────────────
    const { data: tournament, error: tErr } = await supabase
      .from('tennis_tournaments')
      .select('id, name, external_id, draw_size, status')
      .eq('id', tournament_id)
      .single();

    if (tErr || !tournament) {
      return new Response(
        JSON.stringify({ error: 'Tournament not found', detail: tErr?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!tournament.external_id) {
      return new Response(
        JSON.stringify({
          error: 'EXTERNAL_ID_NOT_SET',
          detail: 'Set external_id via admin_open_tournament before syncing players',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (tournament.status === 'completed') {
      return new Response(
        JSON.stringify({ error: 'TOURNAMENT_COMPLETED', detail: 'Cannot sync a completed tournament' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── 2. Call RapidAPI — 1 request (our entire budget for this trigger) ─────
    const apiUrl = `${RAPIDAPI_BASE}/atp/fixtures/tournament/${tournament.external_id}`;
    console.log(`[sync-tennis-players] Fetching: ${apiUrl}`);

    const apiResp = await fetch(apiUrl, {
      headers: {
        'X-RapidAPI-Key': rapidApiKey,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
      },
    });

    if (!apiResp.ok) {
      const errText = await apiResp.text();
      console.error('[sync-tennis-players] API error:', apiResp.status, errText);
      return new Response(
        JSON.stringify({ error: 'API_ERROR', status: apiResp.status, detail: errText }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const apiData = await apiResp.json();

    // ── 3. Extract unique players from fixture list ───────────────────────────
    // API returns fixtures (matches) in a draw. We collect all unique players.
    // Expected shape: { data: [ { homeTeam: { id, name, country, seed }, awayTeam: {...} }, ... ] }
    // or: { fixtures: [ { player_home: {...}, player_away: {...} }, ... ] }
    // We handle both common shapes defensively.

    const fixtures: Record<string, unknown>[] = (
      (apiData.data as Record<string, unknown>[]) ||
      (apiData.fixtures as Record<string, unknown>[]) ||
      (apiData.results as Record<string, unknown>[]) ||
      []
    );

    if (fixtures.length === 0) {
      console.warn('[sync-tennis-players] No fixtures found in API response. Raw keys:', Object.keys(apiData));
      return new Response(
        JSON.stringify({
          warning: 'NO_FIXTURES_IN_RESPONSE',
          raw_keys: Object.keys(apiData),
          tournament: tournament.name,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Collect players, deduplicating by external_player_id
    const playerMap = new Map<number, {
      player_name: string;
      nationality: string | null;
      seed: number | null;
      tier: number;
      external_player_id: number;
    }>();

    for (const fixture of fixtures) {
      // Try both homeTeam/awayTeam and player_home/player_away naming conventions
      const sides = [
        (fixture.homeTeam as Record<string, unknown>) || (fixture.player_home as Record<string, unknown>),
        (fixture.awayTeam as Record<string, unknown>) || (fixture.player_away as Record<string, unknown>),
      ].filter(Boolean);

      for (const side of sides) {
        if (!side) continue;
        const pid = (side.id as number) || (side.player_id as number);
        if (!pid || playerMap.has(pid)) continue;

        const seed = (side.seed as number) || null;
        playerMap.set(pid, {
          player_name: (side.name as string) || (side.player_name as string) || `Player ${pid}`,
          nationality: extractNationality(side),
          seed,
          tier: inferTier(seed),
          external_player_id: pid,
        });
      }
    }

    if (playerMap.size === 0) {
      console.warn('[sync-tennis-players] Could not extract players from fixtures. First fixture:', JSON.stringify(fixtures[0]));
      return new Response(
        JSON.stringify({
          warning: 'NO_PLAYERS_EXTRACTED',
          fixture_count: fixtures.length,
          first_fixture_keys: fixtures[0] ? Object.keys(fixtures[0]) : [],
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const players = Array.from(playerMap.values());

    // ── 4. Upsert via admin_seed_tournament_players RPC ───────────────────────
    const { data: rpcResult, error: rpcErr } = await supabase
      .rpc('admin_seed_tournament_players', {
        p_tournament_id: tournament_id,
        p_players: players,
      });

    if (rpcErr) {
      console.error('[sync-tennis-players] RPC error:', rpcErr);
      return new Response(
        JSON.stringify({ error: 'RPC_ERROR', detail: rpcErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`[sync-tennis-players] Done. Tournament: ${tournament.name}, players synced: ${players.length}`);

    return new Response(
      JSON.stringify({
        ok: true,
        tournament: tournament.name,
        external_id: tournament.external_id,
        fixtures_scanned: fixtures.length,
        players_synced: players.length,
        tier_breakdown: {
          T1: players.filter(p => p.tier === 1).length,
          T2: players.filter(p => p.tier === 2).length,
          T3: players.filter(p => p.tier === 3).length,
          T4: players.filter(p => p.tier === 4).length,
        },
        rpc_result: rpcResult,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[sync-tennis-players] Unhandled error:', err);
    return new Response(
      JSON.stringify({ error: 'INTERNAL_ERROR', detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
