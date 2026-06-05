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

  useEffect(() => () => { if (clearMsgTimerRef.current) clearTimeout(clearMsgTimerRef.current); }, []);

  const POS_LIMITS = cfg.positionLimits;

  const handleAutoFill = useCallback(async () => {
    if (autoFilling) return;
    setAutoFilling(true);
    setAutoFillMsg(null);

    try {
      if (!leagueId) {
        setAutoFillMsg('No league selected — open your squad from the League screen');
        return;
      }

      // ── Always fetch the freshest squad state from DB ────────────────────
      // Avoids the stale-closure bug where a second auto-fill click uses
      // squadData captured before the previous fetchSquad() propagated through
      // React state (causing wrong have counts and position misallocation).
      let freshPlayerIds = null;
      let freshBudget    = null;
      try {
        const { data: { user } } = await supabase.auth.getUser();
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

      const rawPlayers   = freshPlayerIds ?? squadData?.players ?? [];
      const squadSize    = cfg.squadSize ?? 15;
      const slotsNeeded  = squadSize - rawPlayers.length;

      if (slotsNeeded <= 0) {
        setAutoFillMsg('Squad is already full');
        return;
      }

      // ── Resolve player objects from IDs if needed ────────────────────────
      // Always fetch fresh player data to ensure position info is present
      let playerObjects = [];
      if (rawPlayers.length > 0 && typeof rawPlayers[0] === 'string') {
        const { data: fetched, error: fetchErr } = await supabase
          .from('players')
          .select('id, position')
          .in('id', rawPlayers);
        if (fetchErr) {
          setAutoFillMsg('Auto-fill failed — could not load player data');
          return;
        }
        playerObjects = fetched || [];

        // Validation: ensure all players were fetched
        if (playerObjects.length < rawPlayers.length) {
          console.warn(`[useAutoFill] Only ${playerObjects.length}/${rawPlayers.length} players fetched`);
        }
      } else {
        // If rawPlayers is already objects, use directly
        playerObjects = rawPlayers;
      }

      // ── Build my own player IDs (never re-buy) ───────────────────────────
      const myIds = new Set(playerObjects.map(p => p.id ?? p));

      // ── Build taken-by-others set from takenMap ──────────────────────────
      const othersIds = new Set(
        Object.entries(takenMap || {})
          .filter(([, v]) => v?.userId !== undefined)
          .map(([id]) => id)
      );

      // ── Fetch this league's tournament_id ────────────────────────────────
      let tournamentId = null;
      const { data: leagueRow } = await supabase
        .from('leagues')
        .select('tournament_id')
        .eq('id', leagueId)
        .maybeSingle();
      tournamentId = leagueRow?.tournament_id ?? null;

      // ── Count current positions ────────────────────────────────────────
      // Parse and normalize position strings from fetched player data
      console.log('[useAutoFill] Starting position count for', playerObjects.length, 'players');
      const have = { GK: 0, DEF: 0, MID: 0, FWD: 0 };

      // Log all player positions for diagnosis
      const positionDump = playerObjects.map(p => ({
        id: p.id?.substring(0, 8),
        pos: p.position,
        posUpper: String(p.position ?? 'NULL').toUpperCase()
      }));
      console.log('[useAutoFill] Player positions:', positionDump);

      for (const p of playerObjects) {
        if (typeof p !== 'object' || !p) continue;
        if (!p.position) {
          console.error(`[useAutoFill] MISSING POSITION: Player ${p.id}`, p);
          continue;
        }

        // Normalize position: handle 'FW' → 'FWD', lowercase → uppercase
        let pos = String(p.position).toUpperCase();
        if (pos === 'FW') pos = 'FWD';

        // Validate position is recognized
        if (have[pos] !== undefined) {
          have[pos]++;
        } else {
          console.error(`[useAutoFill] UNRECOGNIZED POSITION "${p.position}" for player ${p.id}`);
        }
      }

      // Debug: log position counts for diagnostics
      const totalCounted = Object.values(have).reduce((a, b) => a + b, 0);
      console.error('[useAutoFill] Position counts:', have, '| Total counted:', totalCounted, '| Expected:', playerObjects.length);
      if (totalCounted !== playerObjects.length) {
        console.error(`[useAutoFill] ⚠️ MISMATCH: counted ${totalCounted}, have ${playerObjects.length} objects`);
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
      console.error('[useAutoFill] Before distribution - need:', need, '| extra slots:', extra, '| have:', have);
      for (const pos of ['DEF', 'MID', 'FWD', 'GK']) {
        if (extra <= 0) break;
        const capacity = Math.max(0, (maxPer[pos] ?? 5) - have[pos] - need[pos]);
        const give     = Math.min(extra, capacity);
        if (give > 0) {
          console.error(`[useAutoFill] ${pos}: have=${have[pos]}, max=${maxPer[pos]}, capacity=${capacity}, giving=${give}`);
        }
        need[pos] += give;
        extra     -= give;
      }
      console.error('[useAutoFill] After distribution - need:', need, '| remaining extra:', extra);

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
          .in('position', dbPos)
          .lte('price', budgetLeft)
          .order('price', { ascending: true })
          .limit(500);

        if (tournamentId) query = query.eq('tournament_id', tournamentId);

        let { data: pool } = await query;

        // Fallback: retry without tournament filter if no results
        if (!pool?.length && tournamentId) {
          const { data: fallback } = await supabase
            .from('players')
            .select('id, name, position, club, price')
            .in('position', dbPos)
            .lte('price', budgetLeft)
            .order('price', { ascending: true })
            .limit(500);
          pool = fallback;
        }

        if (!pool?.length) continue;

        const candidates = pool.filter(p => !myIds.has(p.id) && !othersIds.has(p.id));
        skippedTaken += pool.length - candidates.length;
        if (candidates.length > 0) anyPoolFound = true;

        let bought             = 0;
        let consecutiveFailures = 0;
        const MAX_CONSECUTIVE  = 5;

        for (let i = 0; i < candidates.length && bought < need[pos]; i++) {
          const result = await buy(candidates[i]);

          if (result.ok) {
            bought++;
            consecutiveFailures = 0;
            added++;
            have[pos]++;  // keep position count accurate for redistribution
            budgetLeft = result.budget_remaining ?? (budgetLeft - (candidates[i].price || 0));
            myIds.add(candidates[i].id);
          } else {
            const errMsg  = result.error ?? '';
            const errCode = result.code  ?? '';

            if (errMsg.includes('already own')) {
              myIds.add(candidates[i].id);
              continue;
            }

            consecutiveFailures++;
            lastBuyError = errMsg;

            // Fatal — abort everything
            if (
              errMsg.includes('Unauthorised') ||
              errMsg.includes('unauthorized') ||
              errCode === 'WINDOW_CLOSED'     ||
              errCode === 'WINDOW_LOCKED'     ||
              errCode === 'TRANSFER_LOCKED'   ||
              errCode === 'TRANSFER_LIMIT_REACHED' ||
              errMsg.includes('Transfer window closed') ||
              errMsg.includes('Transfers locked')     ||
              errMsg.includes('Transfer cost locked') ||
              errMsg.includes('Transfer limit reached') ||
              errMsg.includes('Missing required fields')
            ) {
              criticalError = errMsg;
              break;
            }

            if (errMsg.includes('Squad is full')) break;

            // Position limit hit — backend confirmed this pos is full.
            // Update have so the cap is respected, then redistribute the
            // unmet slots to later positions that still have capacity.
            if (errMsg.includes('Maximum') && errMsg.includes('players reached')) {
              have[pos] = maxPer[pos] ?? 99;
              const unmet = need[pos] - bought;
              if (unmet > 0) {
                const posIdx = POS_ORDER.indexOf(pos);
                let remaining = unmet;
                for (let j = posIdx + 1; j < POS_ORDER.length && remaining > 0; j++) {
                  const altPos     = POS_ORDER[j];
                  const altCap     = Math.max(0, (maxPer[altPos] ?? 5) - have[altPos] - need[altPos]);
                  const altGive    = Math.min(remaining, altCap);
                  need[altPos]    += altGive;
                  remaining       -= altGive;
                }
              }
              break;
            }

            if (errMsg.includes('Insufficient budget') || errMsg.includes('budget')) {
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
        setAutoFillMsg(`Added ${added} player${added !== 1 ? 's' : ''} · £${Number(budgetLeft).toFixed(1)}M left${skippedNote}`);
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
      setAutoFilling(false);
      if (clearMsgTimerRef.current) clearTimeout(clearMsgTimerRef.current);
      clearMsgTimerRef.current = setTimeout(() => setAutoFillMsg(null), 7000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, squadData, buy, fetchSquad, takenMap, cfg]);

  return { handleAutoFill, autoFilling, autoFillMsg };
}
