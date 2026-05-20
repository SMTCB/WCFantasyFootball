import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const POS_LIMITS = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
const SQUAD_MAX  = 15;

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ ok: false, error: 'Unauthorised' }, 401, corsHeaders);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    );

    // Resolve caller user_id from JWT
    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authErr || !user) return json({ ok: false, error: 'Unauthorised' }, 401, corsHeaders);

    const { action, player_id, player_price, league_id } = await req.json();

    if (!action || !player_id || !league_id) {
      return json({ ok: false, error: 'Missing required fields' }, 400, corsHeaders);
    }

    const price = Number(player_price ?? 0);

    // ── Transfer window enforcement ───────────────────────────────────────────
    // 1. Reject if past the active matchday deadline
    const { data: deadline } = await supabase
      .from('matchday_deadlines')
      .select('deadline_at, matchday_id')
      .order('deadline_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (deadline && new Date() > new Date(deadline.deadline_at)) {
      return json({
        ok:    false,
        code:  'WINDOW_CLOSED',
        error: `Transfer window closed — matchday ${deadline.matchday_id ?? ''} deadline has passed`,
      }, 403, corsHeaders);
    }

    // 2. Reject if any fixture is currently live (kickoff within last 3 hours — guards against stale 'live' status)
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const { data: liveFixture } = await supabase
      .from('fixtures')
      .select('id, home_team, away_team, kickoff_at')
      .eq('status', 'live')
      .gte('kickoff_at', threeHoursAgo)
      .limit(1)
      .maybeSingle();

    if (liveFixture) {
      return json({
        ok:    false,
        code:  'WINDOW_LOCKED',
        error: `Transfers locked while ${liveFixture.home_team} vs ${liveFixture.away_team} is in progress`,
      }, 403, corsHeaders);
    }

    // 3. (#105) Reject if the player's team fixture is currently in progress (cost-lock at kickoff)
    // Only check for BUY actions (selling is always allowed)
    // Only consider fixtures within the last 3 hours to guard against stale 'live' status
    if (action === 'buy') {
      const { data: playerRow } = await supabase
        .from('players')
        .select('forza_team_id')
        .eq('id', player_id)
        .maybeSingle();

      if (playerRow?.forza_team_id) {
        const { data: playerFixture } = await supabase
          .from('fixtures')
          .select('id, home_team, away_team, kickoff_at, status')
          .or(`home_team_forza_id.eq.${playerRow.forza_team_id},away_team_forza_id.eq.${playerRow.forza_team_id}`)
          .eq('status', 'live')
          .gte('kickoff_at', threeHoursAgo)
          .limit(1)
          .maybeSingle();

        if (playerFixture) {
          return json({
            ok:    false,
            code:  'TRANSFER_LOCKED',
            error: `Transfer cost locked — ${playerFixture.home_team} vs ${playerFixture.away_team} has started (cost locked at kickoff)`,
          }, 403, corsHeaders);
        }
      }
    }

    // ── Fetch or create the manager's squad for this league ──────────────────
    let { data: squad } = await supabase
      .from('squads')
      .select('id, players, budget_remaining')
      .eq('user_id', user.id)
      .eq('league_id', league_id)
      .maybeSingle();

    if (!squad) {
      // First transfer in this league — create the squad row
      const { data: newSquad, error: createErr } = await supabase
        .from('squads')
        .insert({ user_id: user.id, league_id, players: [], budget_remaining: 100, matchday_id: 'current' })
        .select('id, players, budget_remaining')
        .single();
      if (createErr) return json({ ok: false, error: 'Failed to create squad' }, 500, corsHeaders);
      squad = newSquad;
    }

    const currentPlayers = squad.players ?? [];
    const budget         = Number(squad.budget_remaining ?? 100);

    // ── SELL ─────────────────────────────────────────────────────────────────
    if (action === 'sell') {
      if (!currentPlayers.includes(player_id)) {
        return json({ ok: false, error: 'Player not in your squad' }, 400, corsHeaders);
      }

      const newPlayers = currentPlayers.filter(id => id !== player_id);
      const newBudget  = Math.round((budget + price) * 10) / 10;

      const { error: updateErr } = await supabase
        .from('squads')
        .update({ players: newPlayers, budget_remaining: newBudget })
        .eq('id', squad.id);

      if (updateErr) return json({ ok: false, error: 'Transfer failed' }, 500, corsHeaders);

      return json({ ok: true, players: newPlayers, budget_remaining: newBudget }, 200, corsHeaders);
    }

    // ── BUY ──────────────────────────────────────────────────────────────────
    if (action === 'buy') {
      // 1. Already owned by this manager?
      if (currentPlayers.includes(player_id)) {
        return json({ ok: false, error: 'You already own this player' }, 400, corsHeaders);
      }

      // 2. No-repeat: check if any other squad in this league has this player
      const { data: takenRow } = await supabase
        .from('squads')
        .select('user_id')
        .eq('league_id', league_id)
        .contains('players', [player_id])
        .neq('user_id', user.id)
        .maybeSingle();

      if (takenRow) {
        // Get the manager's username for the UI
        const { data: ownerProfile } = await supabase
          .from('users')
          .select('username')
          .eq('id', takenRow.user_id)
          .maybeSingle();

        return json({
          ok:      false,
          code:    'PLAYER_TAKEN',
          error:   `This player is already owned by ${ownerProfile?.username ?? 'another manager'} in this league`,
          takenBy: ownerProfile?.username ?? 'another manager',
        }, 409, corsHeaders);
      }

      // 3. Squad size
      if (currentPlayers.length >= SQUAD_MAX) {
        return json({ ok: false, error: 'Squad is full — sell a player first' }, 400, corsHeaders);
      }

      // 4. Budget
      if (budget < price) {
        return json({ ok: false, error: 'Insufficient budget' }, 400, corsHeaders);
      }

      // 5. Position limit
      const { data: playerRow } = await supabase
        .from('players')
        .select('position')
        .eq('id', player_id)
        .maybeSingle();

      const position  = playerRow?.position;
      const posLimit  = POS_LIMITS[position] ?? 99;

      if (position && posLimit < 99) {
        // Count how many of this position the manager already has
        const { data: squadPlayers } = await supabase
          .from('players')
          .select('position')
          .in('id', currentPlayers);

        const posCount = (squadPlayers ?? []).filter(p => p.position === position).length;
        if (posCount >= posLimit) {
          return json({ ok: false, error: `Maximum ${position} players reached (${posLimit})` }, 400, corsHeaders);
        }
      }

      const newPlayers = [...currentPlayers, player_id];
      const newBudget  = Math.round((budget - price) * 10) / 10;

      const { error: updateErr } = await supabase
        .from('squads')
        .update({ players: newPlayers, budget_remaining: newBudget })
        .eq('id', squad.id);

      if (updateErr) return json({ ok: false, error: 'Transfer failed' }, 500, corsHeaders);

      return json({ ok: true, players: newPlayers, budget_remaining: newBudget }, 200, corsHeaders);
    }

    return json({ ok: false, error: 'Unknown action' }, 400, corsHeaders);

  } catch (err) {
    console.error('process-transfer error:', err);
    return json({ ok: false, error: 'Internal server error' }, 500, {
      'Access-Control-Allow-Origin': '*',
    });
  }
});

function json(body, status, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}
