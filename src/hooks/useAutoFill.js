import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useLeagueConfig } from './useLeagueConfig';

/**
 * Auto-fill hook.
 *
 * Fills empty squad slots with the cheapest available players in the correct
 * positions. Correctly handles:
 *   - Draft/noduplicate leagues: pre-filters players already taken by ANY
 *     manager (via takenMap) before calling the transfer API, avoiding wasted
 *     attempts and false "all taken" errors.
 *   - Competition scoping: fetches the league's tournament_id and restricts
 *     the player pool to that competition only.
 *   - Pool size: fetches 500 players per position (ordered cheapest-first,
 *     within budget) so there are enough candidates after filtering.
 *   - Bail-on-fatal-error: stops immediately on auth/window/squad-full errors
 *     instead of hammering the API with 500+ doomed requests.
 *
 * @param {string}   leagueId   - Active league UUID
 * @param {object}   squadData  - Squad object (from SquadScreen or MarketScreen)
 * @param {function} fetchSquad - Callback to refresh squad after successful fill
 * @param {object}   takenMap   - { [playerId]: { userId, managerName } } from useTransfer
 * @param {function} buy        - buy(player) from useTransfer — passed in to avoid duplicate hook instance
 */
export function useAutoFill(leagueId, squadData, fetchSquad, takenMap = {}, buy) {
  const [autoFilling, setAutoFilling] = useState(false);
  const [autoFillMsg, setAutoFillMsg] = useState(null);

  const cfg        = useLeagueConfig(leagueId);
  const POS_LIMITS = cfg.positionLimits;

  const handleAutoFill = useCallback(async () => {
    if (autoFilling) return;
    setAutoFilling(true);
    setAutoFillMsg(null);

    try {
      // Guard: league required for transfers
      if (!leagueId) {
        setAutoFillMsg('No league selected — open your squad from the League screen');
        return;
      }

      const rawPlayers  = squadData?.players || [];
      const squadSize   = cfg.squadSize ?? 15;
      const slotsNeeded = squadSize - rawPlayers.length;

      if (slotsNeeded <= 0) {
        setAutoFillMsg('Squad is already full');
        return;
      }

      // ── Resolve player objects from IDs if needed ────────────────────────
      let playerObjects = rawPlayers;
      if (rawPlayers.length > 0 && typeof rawPlayers[0] === 'string') {
        const { data: fetched } = await supabase
          .from('players')
          .select('id, position')
          .in('id', rawPlayers);
        playerObjects = fetched || [];
      }

      const benchPlayers = squadData?.bench || [];

      // ── Build my own player IDs (never re-buy) ───────────────────────────
      const myIds = new Set([
        ...playerObjects.map(p => p.id ?? p),
        ...benchPlayers.map(p => p.id ?? p),
      ]);

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

      // ── Count current positions ──────────────────────────────────────────
      const have = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
      for (const p of playerObjects) {
        const pos = p.position?.toUpperCase().replace('FW', 'FWD');
        if (have[pos] !== undefined) have[pos]++;
      }

      const minPer = cfg.minFormation ?? { GK: 1, DEF: 3, MID: 2, FWD: 1 };
      const maxPer = POS_LIMITS      ?? { GK: 2, DEF: 5, MID: 5, FWD: 3 };

      // Fill minimums first
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
        squadData?.budget?.current  ??
        squadData?.budget_remaining ??
        cfg.budgetTotal             ??
        100;

      let added           = 0;
      let skippedTaken    = 0;
      let lastBuyError    = null;
      let anyPoolFound    = false;
      let criticalError   = null; // auth/window errors that abort all positions

      // ── Fill each position ───────────────────────────────────────────────
      for (const pos of ['GK', 'DEF', 'MID', 'FWD']) {
        if (!need[pos] || criticalError) continue;

        const dbPos = pos === 'FWD' ? ['FWD', 'FW'] : [pos];

        let query = supabase
          .from('players')
          .select('id, name, position, club, price')
          .in('position', dbPos)
          .lte('price', budgetLeft)
          .order('price', { ascending: true })
          .limit(500);

        if (tournamentId) {
          query = query.eq('tournament_id', tournamentId);
        }

        let { data: pool } = await query;

        // Fallback: retry without tournament filter if no results
        if (!pool?.length && tournamentId) {
          const { data: fallbackPool } = await supabase
            .from('players')
            .select('id, name, position, club, price')
            .in('position', dbPos)
            .lte('price', budgetLeft)
            .order('price', { ascending: true })
            .limit(500);
          pool = fallbackPool;
        }

        if (!pool?.length) continue;

        // Pre-filter: remove my own players AND players taken by other managers
        const candidates = pool.filter(p => !myIds.has(p.id) && !othersIds.has(p.id));
        skippedTaken += pool.length - candidates.length;

        if (candidates.length > 0) anyPoolFound = true;

        // Try each candidate until need[pos] slots are filled.
        // Bail immediately on errors that won't resolve with a different player.
        let bought             = 0;
        let consecutiveFailures = 0;
        const MAX_CONSECUTIVE  = 5;

        for (let i = 0; i < candidates.length && bought < need[pos]; i++) {
          const result = await buy(candidates[i]);

          if (result.ok) {
            bought++;
            consecutiveFailures = 0;
            added++;
            budgetLeft = result.budget_remaining ?? (budgetLeft - (candidates[i].price || 0));
            myIds.add(candidates[i].id);
          } else {
            const errMsg = result.error ?? '';
            const errCode = result.code ?? '';

            // "Already own this player" → add to myIds and continue (stale local state)
            if (errMsg.includes('already own')) {
              myIds.add(candidates[i].id);
              continue;
            }

            consecutiveFailures++;
            lastBuyError = errMsg;

            // Fatal errors: abort everything — retrying other players won't help
            if (
              errMsg.includes('Unauthorised') ||
              errMsg.includes('unauthorized') ||
              errCode === 'WINDOW_CLOSED' ||
              errCode === 'WINDOW_LOCKED' ||
              errCode === 'TRANSFER_LOCKED' ||
              errMsg.includes('Transfer window closed') ||
              errMsg.includes('Transfers locked') ||
              errMsg.includes('Transfer cost locked') ||
              errMsg.includes('Missing required fields')
            ) {
              criticalError = errMsg;
              break;
            }

            // Squad-level errors: abort this position (other positions also affected)
            if (errMsg.includes('Squad is full')) {
              lastBuyError = errMsg;
              break;
            }

            // Budget exhausted: no point trying more (players are cheapest-first)
            if (errMsg.includes('Insufficient budget') || errMsg.includes('budget')) {
              budgetLeft = 0;
              break;
            }

            // Generic safety net: bail after too many consecutive failures
            if (consecutiveFailures >= MAX_CONSECUTIVE) {
              break;
            }
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
      setTimeout(() => setAutoFillMsg(null), 7000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, squadData, buy, fetchSquad, takenMap, cfg]);

  return { handleAutoFill, autoFilling, autoFillMsg };
}
