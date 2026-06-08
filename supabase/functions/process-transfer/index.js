import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { logError } from '../_shared/log.ts';

const FN = 'process-transfer';
const POS_LIMITS = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
const SQUAD_MAX  = 15;
const CLUB_MAX_DEFAULT = 3;  // fallback club cap; overridden per-league by get_club_cap()

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

    // Verify caller is a member of the league (SEC-3); fetch tournament_id + league_mode in same query (DATA-4).
    const { data: membership } = await supabase
      .from('league_members')
      .select('user_id, leagues(tournament_id, league_mode)')
      .eq('league_id', league_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership) {
      return json({ ok: false, error: 'You are not a member of this league' }, 403, corsHeaders);
    }

    const tournamentId = membership?.leagues?.tournament_id ?? null;
    const leagueMode  = membership?.leagues?.league_mode ?? null;

    // Read price from DB — never trust the client-supplied value (SEC-3).
    // Also fetches tournament_id for isolation check below.
    const { data: playerData, error: playerErr } = await supabase
      .from('players')
      .select('price, position, tournament_id')
      .eq('id', player_id)
      .maybeSingle();

    if (playerErr || !playerData) {
      return json({ ok: false, error: 'Player not found' }, 400, corsHeaders);
    }

    // Tournament isolation: every league is tied to exactly one competition.
    // A player from a different tournament can never enter this league's squads.
    if (
      tournamentId &&
      playerData.tournament_id &&
      playerData.tournament_id !== tournamentId
    ) {
      return json({
        ok:    false,
        code:  'WRONG_TOURNAMENT',
        error: 'This player is not part of this competition',
      }, 400, corsHeaders);
    }

    const price = Number(playerData.price ?? 0);

    // ── Free window check (commissioner override) ────────────────────────────
    // A commissioner can open an unlimited, time-bounded transfer window at any
    // point. When active it bypasses the deadline lock, live-fixture lock, and
    // the 3/round transfer limit. Normal constraints (budget, position, club cap,
    // draft ownership) still apply. The window is created via the admin panel.
    const { data: freeWindow } = await supabase
      .from('transfer_windows')
      .select('closes_at')
      .eq('league_id', league_id)
      .eq('window_type', 'unlimited')
      .lte('opens_at', new Date().toISOString())
      .gte('closes_at', new Date().toISOString())
      .limit(1)
      .maybeSingle();

    const inFreeWindow = !!freeWindow;

    // ── Transfer window enforcement ───────────────────────────────────────────
    // Skipped entirely when a free window is active.
    let activeMatchdayId = null;
    const threeHoursAgo  = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

    if (!inFreeWindow) {
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

    activeMatchdayId = deadline?.matchday_id ?? null;

    if (!deadline) {
      return json({
        ok:    false,
        code:  'WINDOW_CLOSED',
        error: `Transfer window closed — no upcoming matchday deadline found`,
      }, 403, corsHeaders);
    }

    // 2. Reject if any fixture for THIS LEAGUE'S ACTIVE MATCHDAY is currently live.
    //    Two scope guards apply:
    //      a. tournament_id: only fixtures belonging to this league's competition
    //      b. matchday_id IS NOT NULL: fixtures the sync cron pulled in but never
    //         assigned to a matchday (null matchday_id) are not part of any league
    //         calendar and must never block transfers. Without this guard, stale
    //         "ghost" fixtures (e.g. TAJ vs IND, ANG vs BOT stuck as 'live' after
    //         a UAT sync) would permanently block the window.
    let liveQuery = supabase
      .from('fixtures')
      .select('id, home_team, away_team, kickoff_at')
      .eq('status', 'live')
      .gte('kickoff_at', threeHoursAgo)
      .not('matchday_id', 'is', null);   // only calendar fixtures can lock the window
    if (tournamentId) liveQuery = liveQuery.eq('tournament_id', tournamentId);
    const { data: liveFixture } = await liveQuery.limit(1).maybeSingle();

    if (liveFixture) {
      return json({
        ok:    false,
        code:  'WINDOW_LOCKED',
        error: `Transfers locked while ${liveFixture.home_team} vs ${liveFixture.away_team} is in progress`,
      }, 403, corsHeaders);
    }

    // 3. (#105) Reject if the specific player's team fixture is currently live (cost-lock at kickoff).
    //    Same two scope guards: tournament + matchday_id IS NOT NULL.
    //    Only check for BUY actions (selling is always allowed).
    if (action === 'buy') {
      const { data: playerRow } = await supabase
        .from('players')
        .select('forza_team_id')
        .eq('id', player_id)
        .maybeSingle();

      if (playerRow?.forza_team_id) {
        let playerFixQ = supabase
          .from('fixtures')
          .select('id, home_team, away_team, kickoff_at, status')
          .or(`home_team_forza_id.eq.${playerRow.forza_team_id},away_team_forza_id.eq.${playerRow.forza_team_id}`)
          .eq('status', 'live')
          .gte('kickoff_at', threeHoursAgo)
          .not('matchday_id', 'is', null);
        if (tournamentId) playerFixQ = playerFixQ.eq('tournament_id', tournamentId);
        const { data: playerFixture } = await playerFixQ.limit(1).maybeSingle();

        if (playerFixture) {
          return json({
            ok:    false,
            code:  'TRANSFER_LOCKED',
            error: `Transfer cost locked — ${playerFixture.home_team} vs ${playerFixture.away_team} has started (cost locked at kickoff)`,
          }, 403, corsHeaders);
        }
      }
    }
    } else {
      // Free window: deadline/live-fixture checks bypassed.
      // Use the most recent past deadline as activeMatchdayId for squad lookup
      // so the correct squad row is found (same fallback logic applies below).
      if (tournamentId) {
        const { data: pastDeadline } = await supabase
          .from('matchday_deadlines')
          .select('matchday_id')
          .eq('tournament_id', tournamentId)
          .lte('deadline_at', new Date().toISOString())
          .order('deadline_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        activeMatchdayId = pastDeadline?.matchday_id ?? null;
      }
    }

    // ── Fetch or create the manager's squad for this league ──────────────────
    // DATA-5: filter by active matchday_id so a user with multiple squad rows
    //         (one per gameweek) always lands on the correct active row.
    let squadQuery = supabase
      .from('squads')
      .select('id, players, budget_remaining, matchday_id, initial_build_complete')
      .eq('user_id', user.id)
      .eq('league_id', league_id);
    if (activeMatchdayId) squadQuery = squadQuery.eq('matchday_id', activeMatchdayId);
    let { data: squad } = await squadQuery.maybeSingle();

    // DD-H4: Recovery-window fallback. If no squad found for activeMatchdayId, look for the
    // most recently created squad for this league. Handles the 6h post-deadline window where
    // activeMatchdayId = next round but the user's real squad was created for the current round.
    // Without this, a new empty squad is created for the next round and the manager loses their roster.
    if (!squad && activeMatchdayId) {
      const { data: prevSquad } = await supabase
        .from('squads')
        .select('id, players, budget_remaining, matchday_id, initial_build_complete')
        .eq('user_id', user.id)
        .eq('league_id', league_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (prevSquad) squad = prevSquad;
    }

    if (!squad) {
      // First transfer in this league — create the squad row for the active matchday.
      const { data: newSquad, error: createErr } = await supabase
        .from('squads')
        .insert({ user_id: user.id, league_id, players: [], budget_remaining: 100, matchday_id: activeMatchdayId })
        .select('id, players, budget_remaining, matchday_id')
        .single();
      if (createErr) {
        await logError(FN, 'critical', 'Squad create failed', { user_id: user.id, league_id, matchday_id: activeMatchdayId, error: createErr.message });
        return json({ ok: false, error: 'Failed to create squad' }, 500, corsHeaders);
      }
      squad = newSquad;
    }

    const currentPlayers = squad.players ?? [];
    const budget         = Number(squad.budget_remaining ?? 100);

    // C6: enforce the per-round transfer limit against the ACTIVE round (the next
    // upcoming deadline), not the squad's stored matchday_id. A squad's matchday_id
    // only advances when a transfer is processed for a newer round — so a manager who
    // made 3 transfers in r1 and none in r2/r3 still has matchday_id='r1'. Using the
    // squad's own matchday_id would incorrectly check the r1 counter (3/3 = blocked)
    // rather than the r3 counter (0/3 = allowed).
    // Fallback to squad.matchday_id only when activeMatchdayId is null (genuinely
    // pre-competition, where no upcoming deadline exists yet).
    const enforceMatchdayId = activeMatchdayId
      ?? (/-r\d+$/.test(squad.matchday_id ?? '') ? squad.matchday_id : null);

    // Pre-competition bypass: before the first match of any configured matchday
    // has kicked off, transfers are unlimited. This lets managers freely adjust
    // their draft-allocated squads without burning per-round transfer budget.
    // Once any configured matchday fixture goes live or finishes, normal limits apply.
    // Scoped to configured matchdays (matchday_deadlines) so stale historical fixtures
    // in the same tournament don't falsely signal "competition started".
    // Free window: skip all limit enforcement.
    let limitMatchdayId = inFreeWindow ? null : enforceMatchdayId;
    if (!inFreeWindow && enforceMatchdayId && tournamentId) {
      const { data: configuredDeadlines } = await supabase
        .from('matchday_deadlines')
        .select('matchday_id')
        .eq('tournament_id', tournamentId);
      const configuredMatchdays = (configuredDeadlines ?? []).map(d => d.matchday_id);
      if (configuredMatchdays.length > 0) {
        const { count: startedCount } = await supabase
          .from('fixtures')
          .select('id', { count: 'exact', head: true })
          .eq('tournament_id', tournamentId)
          .in('matchday_id', configuredMatchdays)
          .in('status', ['live', 'finished']);
        if ((startedCount ?? 0) === 0) limitMatchdayId = null;
      }
    }

    // Initial build exemption: a squad that has never reached 15 players (e.g.
    // draft allocation gave fewer due to wish-list overlaps) is not subject to
    // the per-round transfer limit until it first becomes complete.
    // The latch (initial_build_complete) is a one-way flag set inside
    // execute_transfer_atomic the moment a buy pushes the squad to 15.
    // Selling back below 15 never resets it, closing the abuse vector.
    if (limitMatchdayId && !squad.initial_build_complete && currentPlayers.length < 15) {
      limitMatchdayId = null;
    }

    // ── SELL ─────────────────────────────────────────────────────────────────
    if (action === 'sell') {
      if (!currentPlayers.includes(player_id)) {
        return json({ ok: false, error: 'Player not in your squad' }, 400, corsHeaders);
      }

      // TDD-01: atomic RPC acquires SELECT FOR UPDATE lock on squad row,
      // re-validates ownership inside the lock, then applies the mutation.
      // p_league_id + p_matchday_id enable transfer-limit enforcement (migration 106).
      const { data: xferResult, error: updateErr } = await supabase
        .rpc('execute_transfer_atomic', {
          p_squad_id:    squad.id,
          p_action:      'sell',
          p_player_id:   player_id,
          p_price:       price,
          p_league_id:   league_id,
          p_matchday_id: limitMatchdayId,
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

      // 1b. Eliminated club check: in cup leagues, cannot buy players from knocked-out clubs.
      // Only fires when the club appears in cup_active_clubs with eliminated_at set.
      // Classic / non-cup leagues have no cup_active_clubs rows so the query returns null
      // harmlessly and this check is skipped.
      {
        const { data: playerClub } = await supabase
          .from('players')
          .select('club, forza_team_id')
          .eq('id', player_id)
          .maybeSingle();

        if (playerClub?.club || playerClub?.forza_team_id) {
          const orFilter = [
            playerClub.club          ? `club_id.eq.${playerClub.club}`          : null,
            playerClub.forza_team_id ? `club_id.eq.${playerClub.forza_team_id}` : null,
          ].filter(Boolean).join(',');

          const { data: eliminatedClub } = await supabase
            .from('cup_active_clubs')
            .select('eliminated_at')
            .eq('league_id', league_id)
            .or(orFilter)
            .not('eliminated_at', 'is', null)
            .maybeSingle();

          if (eliminatedClub) {
            return json({
              ok:    false,
              code:  'CLUB_ELIMINATED',
              error: `${playerClub.club ?? 'This club'} has been knocked out — you cannot buy their players`,
            }, 400, corsHeaders);
          }
        }
      }

      // 2. No-repeat / relaxation check: count other squads holding this player,
      //    then compare against current repeats_allowed tier (L6.1).
      //    Classic leagues allow unlimited shared ownership — skip entirely.
      if (leagueMode === 'classic') {
        // no-op: multiple managers can own the same player
      } else {
      const { data: takenRows, count: takenCount } = await supabase
        .from('squads')
        .select('user_id', { count: 'exact' })
        .eq('league_id', league_id)
        .contains('players', [player_id])
        .neq('user_id', user.id);

      // DR1: relaxation is persisted in league_config by apply_relaxation_state()
      // (key 'current_repeats_allowed'). config_value is a JSON int (repeats allowed)
      // or JSON null (cap fully lifted → unlimited). The old code read a non-existent
      // `relaxation_state` table, so repeatsAllowed was always 0 and the no-repeat rule
      // never relaxed even after clubs were eliminated.
      // Semantics: no row → strict (0 repeats); int N → N; explicit null → unlimited.
      const { data: relaxCfg } = await supabase
        .from('league_config')
        .select('config_value')
        .eq('league_id', league_id)
        .eq('config_key', 'current_repeats_allowed')
        .maybeSingle();

      const repeatsUnlimited = relaxCfg != null && relaxCfg.config_value === null;
      const repeatsAllowed = (relaxCfg != null && relaxCfg.config_value !== null)
        ? Number(relaxCfg.config_value)
        : 0;

      if (!repeatsUnlimited && (takenCount ?? 0) > repeatsAllowed) {
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
      } // end else (draft/noduplicate only)

      // 3. Squad size
      if (currentPlayers.length >= SQUAD_MAX) {
        return json({ ok: false, error: 'Squad is full — sell a player first' }, 400, corsHeaders);
      }

      // 4. Budget
      if (budget < price) {
        return json({ ok: false, error: 'Insufficient budget' }, 400, corsHeaders);
      }

      // 5. Position limit (use playerData already fetched above).
      // Normalise 'FW' → 'FWD' so squads containing either raw Forza value ('FW')
      // or the normalised value ('FWD') are counted correctly against the same cap.
      const normPos  = (p) => p === 'FW' ? 'FWD' : p;
      const position = normPos(playerData.position);
      const posLimit = POS_LIMITS[position] ?? 99;

      if (position && posLimit < 99) {
        // Count how many of this position the manager already has
        const { data: squadPlayers } = await supabase
          .from('players')
          .select('position')
          .in('id', currentPlayers);

        const posCount = (squadPlayers ?? []).filter(p => normPos(p.position) === position).length;
        if (posCount >= posLimit) {
          return json({ ok: false, error: `Maximum ${position} players reached (${posLimit})` }, 400, corsHeaders);
        }
      }

      // Get dynamic club cap: relaxes as cup clubs are eliminated (get_club_cap returns
      // NULL when only 2 clubs remain — the final — meaning no cap applies).
      let clubMax = CLUB_MAX_DEFAULT;
      const { data: clubCapData } = await supabase
        .rpc('get_club_cap', { p_league_id: league_id });
      if (clubCapData !== null && clubCapData !== undefined) {
        clubMax = clubCapData;  // NULL from DB = final, no cap → use 999
      }
      if (clubMax === null) clubMax = 999;

      // TDD-01/TDD-11/96/106: atomic RPC acquires SELECT FOR UPDATE lock on squad row,
      // re-validates budget, ownership, position cap, squad size, club cap, and
      // per-round transfer limit inside the lock.
      const { data: xferResult, error: updateErr } = await supabase
        .rpc('execute_transfer_atomic', {
          p_squad_id:    squad.id,
          p_action:      'buy',
          p_player_id:   player_id,
          p_price:       price,
          p_pos_limit:   posLimit,       // TDD-11: position cap enforced inside the lock
          p_squad_max:   SQUAD_MAX,      // TDD-11: squad size enforced inside the lock
          p_club_max:    clubMax,                            // 96/105: dynamic cap — relaxes as cup clubs are eliminated
          p_league_id:   league_id,                          // 106: transfer-limit enforcement context
          p_matchday_id: limitMatchdayId,                    // 106/C6: null pre-competition, real round once started
        });

      if (updateErr || !xferResult?.ok) {
        const msg   = xferResult?.error ?? updateErr?.message ?? 'Transfer failed';
        const code  = xferResult?.code  ?? 'TRANSFER_FAILED';
        const clientError = ['INSUFFICIENT_BUDGET','ALREADY_OWNED','SQUAD_FULL','POSITION_LIMIT','CLUB_LIMIT','TRANSFER_LIMIT_REACHED'].includes(code);
        const status = clientError ? 400 : code === 'ALREADY_OWNED' ? 409 : 500;
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
