import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';

/**
 * @param {string}   leagueId   - Active league UUID
 * @param {object}   squadData  - Squad object (from SquadScreen or MarketScreen)
 * @param {function} fetchSquad - Callback to refresh squad after successful fill
 * @param {object}   takenMap   - { [playerId]: { userId, managerName } } from useTransfer
 * @param {function} buy        - buy(player) from useTransfer — passed in to avoid duplicate hook instance
 * @param {object}   cfg        - League config from useLeagueConfig — passed in to avoid TDZ (same module imported at depth-1 by callers)
 */
export function useAutoFill(leagueId, squadData, fetchSquad, takenMap = {}, buy, cfg = {}) {
  const [autoFilling, setAutoFilling] = useState(false);
  const [autoFillMsg, setAutoFillMsg] = useState(null);
  const clearMsgTimerRef = useRef(null);
  const fillingRef       = useRef(false); // C3: sync reentrancy guard — state updates are async

  useEffect(() => () => { if (clearMsgTimerRef.current) clearTimeout(clearMsgTimerRef.current); }, []);

  const POS_LIMITS = cfg.positionLimits;

  const handleAutoFill = useCallback(async () => {
    if (fillingRef.current) return; // C3: synchronous check before any await
    fillingRef.current = true;
    setAutoFilling(true);
    setAutoFillMsg(null);

    try {
      if (!leagueId) {
        setAutoFillMsg('No league selected — open your squad from the League screen');
        return;
      }

      // ── Always fetch the freshest squad state from DB ────────────────────
      // Avoids the stale-closure bug where a second auto-fill click uses
      // squadData captured before the previous fetchSquad() propagated.
      let freshPlayerIds = null;
      let freshBudget    = null;
      let freshUser      = null;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        freshUser = user;
        if (user?.id) {
          const { data: freshSquad } = await supabase
            .from('squads')
            .select('players, budget_remaining')
            .eq('league_id', leagueId)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (freshSquad) {
            freshPlayerIds = freshSquad.players;
            freshBudget    = Number(freshSquad.budget_remaining);
          }
        }
      } catch { /* network hiccup — fall through to squadData */ }

      // B1: When freshPlayerIds is available it already contains ALL players
      // (starters + bench combined). squadData.bench is a subset of those same IDs —
      // subtracting it again would make slotsNeeded incorrectly negative, causing
      // a false "Squad is already full" on the SquadScreen path.
      const useFreshData = freshPlayerIds !== null;
      const rawPlayers   = freshPlayerIds ?? squadData?.players ?? [];
      const benchPlayers = useFreshData ? [] : (squadData?.bench ?? []);
      const squadSize    = cfg.squadSize ?? 15;
      const slotsNeeded  = squadSize - rawPlayers.length - benchPlayers.length;

      if (slotsNeeded <= 0) {
        setAutoFillMsg('Squad is already full');
        return;
      }

      // ── Resolve player objects from IDs if needed ────────────────────────
      let playerObjects = rawPlayers;
      if (rawPlayers.length > 0 && typeof rawPlayers[0] === 'string') {
        const { data: fetched } = await supabase
          .from('players')
          .select('id, position, club') // club needed for C1 preflight
          .in('id', rawPlayers);
        playerObjects = fetched || [];
      }

      // ── Build my own player IDs (never re-buy) ───────────────────────────
      const myIds = new Set([
        ...playerObjects.map(p => p.id ?? p),
        ...benchPlayers.map(p => p.id ?? p),
      ]);

      // B2: Only exclude taken-by-others in noduplicate (draft) leagues.
      // Classic leagues allow multiple managers to own the same player, so
      // filtering by takenMap would silently shrink a valid candidate pool.
      const currentUserId = freshUser?.id;
      const isDraftLeague = (cfg.format ?? '') === 'noduplicate';
      const othersIds = isDraftLeague
        ? new Set(
            Object.entries(takenMap || {})
              .filter(([, v]) => v?.userId !== undefined && v?.userId !== currentUserId)
              .map(([id]) => id)
          )
        : new Set();

      // ── Fetch this league's tournament_id ────────────────────────────────
      let tournamentId = null;
      const { data: leagueRow } = await supabase
        .from('leagues')
        .select('tournament_id')
        .eq('id', leagueId)
        .maybeSingle();
      tournamentId = leagueRow?.tournament_id ?? null;

      // ── Count current positions ──────────────────────────────────────────
      // benchPlayers is [] when useFreshData=true (all players already in playerObjects).
      const have = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
      for (const p of [...playerObjects, ...benchPlayers]) {
        if (typeof p !== 'object' || !p) continue;
        const rawPos = p.position?.toUpperCase() ?? '';
        const pos = rawPos === 'FW' ? 'FWD' : rawPos;
        if (pos && have[pos] !== undefined) have[pos]++;
      }

      // C1: Per-club counts for preflight filtering. Uses the backend default (3).
      // Cup leagues relax dynamically; being conservative here just means a cup-relaxed
      // candidate gets skipped client-side and will succeed if re-tried manually.
      const FILL_CLUB_LIMIT = 3;
      const clubCounts = {};
      for (const p of playerObjects) {
        if (typeof p === 'object' && p?.club) clubCounts[p.club] = (clubCounts[p.club] ?? 0) + 1;
      }

      const minPer = cfg.minFormation ?? { GK: 1, DEF: 3, MID: 2, FWD: 1 };
      const maxPer = POS_LIMITS      ?? { GK: 2, DEF: 5, MID: 5, FWD: 3 };

      // ── Compute slots needed per position ────────────────────────────────
      const need = {};
      for (const pos of ['GK', 'DEF', 'MID', 'FWD']) {
        need[pos] = Math.max(0, (minPer[pos] ?? 0) - have[pos]);
      }

      // Trim if minimums exceed available slots
      let minTotal = Object.values(need).reduce((s, n) => s + n, 0);
      if (minTotal > slotsNeeded) {
        let excess = minTotal - slotsNeeded;
        for (const pos of ['FWD', 'MID', 'DEF', 'GK']) {
          if (excess <= 0) break;
          const trim = Math.min(excess, need[pos]);
          need[pos] -= trim;
          excess    -= trim;
        }
      }

      // Distribute remaining slots to positions that still have capacity
      let extra = slotsNeeded - Object.values(need).reduce((s, n) => s + n, 0);
      for (const pos of ['DEF', 'MID', 'FWD', 'GK']) {
        if (extra <= 0) break;
        const capacity = Math.max(0, (maxPer[pos] ?? 5) - have[pos] - need[pos]);
        const give     = Math.min(extra, capacity);
        need[pos] += give;
        extra     -= give;
      }

      // ── Budget ───────────────────────────────────────────────────────────
      let budgetLeft =
        freshBudget                 ??
        squadData?.budget?.current  ??
        squadData?.budget_remaining ??
        cfg.budgetTotal             ??
        100;

      let added            = 0;
      let skippedTaken     = 0;
      let lastBuyError     = null;
      let anyPoolFound     = false;
      let criticalError    = null;

      // ── Fill each position ───────────────────────────────────────────────
      const POS_ORDER = ['GK', 'DEF', 'MID', 'FWD'];

      for (const pos of POS_ORDER) {
        if (!need[pos] || criticalError) continue;

        const dbPos = pos === 'FWD' ? ['FWD', 'FW'] : [pos];

        let query = supabase
          .from('players')
          .select('id, name, position, club, price')
          .eq('is_active', true)
          .in('position', dbPos)
          .lte('price', budgetLeft)
          .order('price', { ascending: true })
          .limit(500);

        if (tournamentId) query = query.eq('tournament_id', tournamentId);

        const { data: pool } = await query;

        // B5: No fallback to all-tournaments. Out-of-tournament players would be
        // rejected with WRONG_TOURNAMENT, burning the consecutive-failure budget
        // and producing a confusing abort before any valid candidate is reached.
        if (!pool?.length) continue;

        // C1: Pre-filter by club cap so club-capped candidates never hit the backend.
        const candidates = pool.filter(p =>
          !myIds.has(p.id) &&
          !othersIds.has(p.id) &&
          (clubCounts[p.club] ?? 0) < FILL_CLUB_LIMIT
        );
        skippedTaken += pool.length - candidates.length;
        if (candidates.length > 0) anyPoolFound = true;

        let bought              = 0;
        let consecutiveFailures = 0;
        const MAX_CONSECUTIVE   = 5;

        for (let i = 0; i < candidates.length && bought < need[pos]; i++) {
          const result = await buy(candidates[i]);

          if (result.ok) {
            bought++;
            consecutiveFailures = 0;
            added++;
            have[pos]++;
            budgetLeft = result.budget_remaining ?? (budgetLeft - (candidates[i].price || 0));
            myIds.add(candidates[i].id);
            // C1: keep club counts live so subsequent candidates respect the cap
            if (candidates[i].club) clubCounts[candidates[i].club] = (clubCounts[candidates[i].club] ?? 0) + 1;
          } else {
            // B3: check structured error codes before falling back to substring matching
            const errCode = result.code  ?? '';
            const errMsg  = result.error ?? '';

            // Silent skips — not a consecutive failure
            if (errMsg.includes('already own') || errCode === 'ALREADY_OWNED') {
              myIds.add(candidates[i].id);
              continue;
            }
            if (errCode === 'WRONG_TOURNAMENT') continue;
            if (errCode === 'CLUB_LIMIT')       continue; // shouldn't reach here after preflight

            consecutiveFailures++;
            lastBuyError = errMsg;

            // Fatal — abort everything
            if (
              errCode === 'WINDOW_CLOSED'         ||
              errCode === 'WINDOW_LOCKED'          ||
              errCode === 'TRANSFER_LOCKED'        ||
              errCode === 'TRANSFER_LIMIT_REACHED' ||
              errMsg.includes('Unauthorised')      ||
              errMsg.includes('unauthorized')      ||
              errMsg.includes('Transfer window closed') ||
              errMsg.includes('Transfers locked')       ||
              errMsg.includes('Transfer cost locked')   ||
              errMsg.includes('Transfer limit reached') ||
              errMsg.includes('Missing required fields')
            ) {
              criticalError = errMsg;
              break;
            }

            if (errCode === 'SQUAD_FULL' || errMsg.includes('Squad is full')) break;

            // B3+B4: position cap hit — update have, redistribute unmet slots both forward
            // and backward so a capped earlier position can still absorb overflow.
            if (errCode === 'POSITION_LIMIT' || (errMsg.includes('Maximum') && errMsg.includes('players reached'))) {
              have[pos] = maxPer[pos] ?? 99;
              const unmet = need[pos] - bought;
              if (unmet > 0) {
                const posIdx  = POS_ORDER.indexOf(pos);
                let remaining = unmet;
                // Forward pass
                for (let j = posIdx + 1; j < POS_ORDER.length && remaining > 0; j++) {
                  const altPos  = POS_ORDER[j];
                  const altCap  = Math.max(0, (maxPer[altPos] ?? 5) - have[altPos] - need[altPos]);
                  const altGive = Math.min(remaining, altCap);
                  need[altPos] += altGive;
                  remaining    -= altGive;
                }
                // B4: backward pass (e.g. GK still has capacity when DEF overflows)
                for (let j = posIdx - 1; j >= 0 && remaining > 0; j--) {
                  const altPos  = POS_ORDER[j];
                  const altCap  = Math.max(0, (maxPer[altPos] ?? 5) - have[altPos] - need[altPos]);
                  const altGive = Math.min(remaining, altCap);
                  need[altPos] += altGive;
                  remaining    -= altGive;
                }
              }
              break;
            }

            if (errCode === 'INSUFFICIENT_BUDGET' || errMsg.includes('Insufficient budget') || errMsg.includes('budget')) {
              budgetLeft = 0;
              break;
            }

            if (consecutiveFailures >= MAX_CONSECUTIVE) break;
          }
        }
      }

      // ── Result message ───────────────────────────────────────────────────
      if (criticalError) {
        if (criticalError.includes('Unauthorised') || criticalError.includes('unauthorized')) {
          setAutoFillMsg('Session expired — please refresh the page and try again');
        } else if (criticalError.includes('window') || criticalError.includes('locked') || criticalError.includes('WINDOW') || criticalError.includes('LOCKED')) {
          setAutoFillMsg(criticalError);
        } else {
          setAutoFillMsg('Auto-fill blocked — ' + criticalError);
        }
      } else if (added > 0) {
        const skippedNote = skippedTaken > 0 ? ` · skipped ${skippedTaken} taken` : '';
        setAutoFillMsg(`Added ${added} player${added !== 1 ? 's' : ''} · €${Number(budgetLeft).toFixed(1)}M left${skippedNote}`);
        if (fetchSquad) await fetchSquad();
      } else if (!anyPoolFound) {
        if (Number(budgetLeft) < 4.5) {
          setAutoFillMsg('Budget too low — sell a player to free up funds');
        } else {
          setAutoFillMsg('No players available for these positions within your budget');
        }
      } else {
        setAutoFillMsg(
          lastBuyError?.includes('taken')
            ? 'All candidates in this range are taken — try refreshing'
            : (lastBuyError || 'Could not complete auto-fill — refresh and try again')
        );
      }

    } catch (err) {
      console.error('[useAutoFill]', err);
      setAutoFillMsg('Auto-fill failed — try again');
    } finally {
      fillingRef.current = false; // C3: release sync lock before state update
      setAutoFilling(false);
      if (clearMsgTimerRef.current) clearTimeout(clearMsgTimerRef.current);
      clearMsgTimerRef.current = setTimeout(() => setAutoFillMsg(null), 7000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, squadData, buy, fetchSquad, takenMap, cfg]);

  return { handleAutoFill, autoFilling, autoFillMsg };
}
