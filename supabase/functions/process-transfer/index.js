import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { logError } from '../_shared/log.ts';

const FN = 'process-transfer';
const POS_LIMITS = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
const SQUAD_MAX  = 15;

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin') ?? '';
  const allowedOrigin = (
    origin === 'https://wc-fantasy-football.vercel.app' ||
    origin.startsWith('http://localhost')
  ) ? origin : 'https://wc-fantasy-football.vercel.app';
  const corsHeaders = {
    'Access-Control-Allow-Origin':  allowedOrigin,
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

    const { action, player_id, league_id } = await req.json();

    if (!action || !player_id || !league_id) {
      return json({ ok: false, error: 'Missing required fields' }, 400, corsHeaders);
    }

    // Verify caller is a member of the league (SEC-3); fetch tournament_id in same query (DATA-4).
    const { data: membership } = await supabase
      .from('league_members')
      .select('user_id, leagues(tournament_id)')
      .eq('league_id', league_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership) {
      return json({ ok: false, error: 'You are not a member of this league' }, 403, corsHeaders);
    }

    const tournamentId = membership?.leagues?.tournament_id ?? null;

    // Read price from DB — never trust the client-supplied value (SEC-3).
    const { data: playerData, error: playerErr } = await supabase
      .from('players')
      .select('price, position')
      .eq('id', player_id)
      .maybeSingle();

    if (playerErr || !playerData) {
      return json({ ok: false, error: 'Player not found' }, 400, corsHeaders);
    }

    const price = Number(playerData.price ?? 0);

    // ── Transfer window enforcement ───────────────────────────────────────────
    // 1. Reject if past the active matchday deadline.
    //    DATA-4: scope to this league's tournament so cross-tournament deadlines don't bleed through.
    // Use nearest upcoming deadline (ascending + gte now) so multi-round tournaments
    // (e.g. WC with r1–r7) don't resolve to the furthest future round and mismatch
    // existing squad rows that are pinned to the current open round.
    let deadlineQuery = supabase
      .from('matchday_deadlines')
      .select('deadline_at, matchday_id')
      .gte('deadline_at', new Date().toISOString())
      .order('deadline_at', { ascending: true })
      .limit(1);
    if (tournamentId) deadlineQuery = deadlineQuery.eq('tournament_id', tournamentId);
    const { data: deadline } = await deadlineQuery.maybeSingle();

    const activeMatchdayId = deadline?.matchday_id ?? null;

    if (!deadline) {
      return json({
        ok:    false,
        code:  'WINDOW_CLOSED',
        error: `Transfer window closed — no upcoming matchday deadline found`,
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
    // DATA-5: filter by active matchday_id so a user with multiple squad rows
    //         (one per gameweek) always lands on the correct active row.
    let squadQuery = supabase
      .from('squads')
      .select('id, players, budget_remaining')
      .eq('user_id', user.id)
      .eq('league_id', league_id);
    if (activeMatchdayId) squadQuery = squadQuery.eq('matchday_id', activeMatchdayId);
    let { data: squad } = await squadQuery.maybeSingle();

    if (!squad) {
      // First transfer in this league — create the squad row for the active matchday.
      const { data: newSquad, error: createErr } = await supabase
        .from('squads')
        .insert({ user_id: user.id, league_id, players: [], budget_remaining: 100, matchday_id: activeMatchdayId })
        .select('id, players, budget_remaining')
        .single();
      if (createErr) {
        await logError(FN, 'critical', 'Squad create failed', { user_id: user.id, league_id, matchday_id: activeMatchdayId, error: createErr.message });
        return json({ ok: false, error: 'Failed to create squad' }, 500, corsHeaders);
      }
      squad = newSquad;
    }

    const currentPlayers = squad.players ?? [];
    const budget         = Number(squad.budget_remaining ?? 100);

    // ── SELL ─────────────────────────────────────────────────────────────────
    if (action === 'sell') {
      if (!currentPlayers.includes(player_id)) {
        return json({ ok: false, error: 'Player not in your squad' }, 400, corsHeaders);
      }

      // TDD-01: atomic RPC acquires SELECT FOR UPDATE lock on squad row,
      // re-validates ownership inside the lock, then applies the mutation.
      const { data: xferResult, error: updateErr } = await supabase
        .rpc('execute_transfer_atomic', {
          p_squad_id:  squad.id,
          p_action:    'sell',
          p_player_id: player_id,
          p_price:     price,
        });

      if (updateErr || !xferResult?.ok) {
        const msg = xferResult?.error ?? updateErr?.message ?? 'Transfer failed';
        await logError(FN, 'error', 'Sell atomic failed', { user_id: user.id, league_id, player_id, error: msg });
        return json({ ok: false, error: msg }, 500, corsHeaders);
      }

      // Cancel any active auction listings the seller had for this player.
      // Without this, the listing stays open and the winner could receive a
      // player the seller no longer owns (BUG-E2E-06).
      await supabase
        .from('auction_listings')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('league_id', league_id)
        .eq('player_id', player_id)
        .eq('seller_id', squad.id)
        .eq('status', 'open');

      return json({ ok: true, players: xferResult.players, budget_remaining: xferResult.budget_remaining }, 200, corsHeaders);
    }

    // ── BUY ──────────────────────────────────────────────────────────────────
    if (action === 'buy') {
      // 1. Already owned by this manager?
      if (currentPlayers.includes(player_id)) {
        return json({ ok: false, error: 'You already own this player' }, 400, corsHeaders);
      }

      // 2. No-repeat / relaxation check: count other squads holding this player,
      //    then compare against current repeats_allowed tier (L6.1).
      const { data: takenRows, count: takenCount } = await supabase
        .from('squads')
        .select('user_id', { count: 'exact' })
        .eq('league_id', league_id)
        .contains('players', [player_id])
        .neq('user_id', user.id);

      const { data: relaxState } = await supabase
        .from('relaxation_state')
        .select('current_repeats_allowed')
        .eq('league_id', league_id)
        .maybeSingle();

      const repeatsAllowed = relaxState?.current_repeats_allowed ?? 0;

      if ((takenCount ?? 0) > repeatsAllowed) {
        const firstOwner = takenRows?.[0];
        const { data: ownerProfile } = firstOwner
          ? await supabase.from('users').select('username').eq('id', firstOwner.user_id).maybeSingle()
          : { data: null };

        return json({
          ok:      false,
          code:    'PLAYER_TAKEN',
          error:   repeatsAllowed > 0
            ? `Player already in ${takenCount} squad(s) — max ${repeatsAllowed} repeat(s) allowed currently`
            : `This player is already owned by ${ownerProfile?.username ?? 'another manager'} in this league`,
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

      // 5. Position limit (use playerData already fetched above).
      const position  = playerData.position;
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

      // TDD-01: atomic RPC acquires SELECT FOR UPDATE lock on squad row,
      // re-validates budget and ownership inside the lock, then applies the mutation.
      const { data: xferResult, error: updateErr } = await supabase
        .rpc('execute_transfer_atomic', {
          p_squad_id:  squad.id,
          p_action:    'buy',
          p_player_id: player_id,
          p_price:     price,
        });

      if (updateErr || !xferResult?.ok) {
        const msg   = xferResult?.error ?? updateErr?.message ?? 'Transfer failed';
        const code  = xferResult?.code  ?? 'TRANSFER_FAILED';
        const status = code === 'INSUFFICIENT_BUDGET' ? 400 : code === 'ALREADY_OWNED' ? 409 : 500;
        if (status === 500) {
          await logError(FN, 'error', 'Buy atomic failed', { user_id: user.id, league_id, player_id, error: msg });
        }
        return json({ ok: false, code, error: msg }, status, corsHeaders);
      }

      return json({ ok: true, players: xferResult.players, budget_remaining: xferResult.budget_remaining }, 200, corsHeaders);
    }

    return json({ ok: false, error: 'Unknown action' }, 400, corsHeaders);

  } catch (err) {
    await logError(FN, 'critical', err.message, { stack: err.stack });
    return json({ ok: false, error: 'Internal server error' }, 500, corsHeaders);
  }
});

function json(body, status, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}
