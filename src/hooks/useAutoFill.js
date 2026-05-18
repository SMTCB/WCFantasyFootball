import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useTransfer } from './useTransfer';
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
 *
 * @param {string}   leagueId  - Active league UUID
 * @param {object}   squadData - Squad object (from SquadScreen or MarketScreen)
 * @param {function} fetchSquad - Callback to refresh squad after successful fill
 * @param {object}   takenMap  - { [playerId]: { userId, managerName } } from useTransfer
 */
export function useAutoFill(leagueId, squadData, fetchSquad, takenMap = {}) {
  const [autoFilling, setAutoFilling] = useState(false);
  const [autoFillMsg, setAutoFillMsg] = useState(null);

  const cfg      = useLeagueConfig(leagueId);
  const POS_LIMITS = cfg.positionLimits;
  const { buy }  = useTransfer(leagueId);

  const handleAutoFill = useCallback(async () => {
    if (autoFilling) return;
    setAutoFilling(true);
    setAutoFillMsg(null);

    try {
      console.log('[useAutoFill] ===== START AUTO-FILL =====');
      console.log('[useAutoFill] leagueId:', leagueId);
      console.log('[useAutoFill] squadData:', squadData);
      console.log('[useAutoFill] cfg:', cfg);

      const rawPlayers  = squadData?.players || [];
      const squadSize   = cfg.squadSize ?? 15;
      const slotsNeeded = squadSize - rawPlayers.length;

      console.log('[useAutoFill] rawPlayers.length:', rawPlayers.length);
      console.log('[useAutoFill] squadSize:', squadSize);
      console.log('[useAutoFill] slotsNeeded:', slotsNeeded);

      if (slotsNeeded <= 0) {
        console.log('[useAutoFill] Squad is full, returning');
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
      // takenMap keys are player IDs taken by ANY manager in this league.
      // Pre-filtering these avoids wasted API calls and "all taken" false errors.
      const othersIds = new Set(
        Object.entries(takenMap || {})
          .filter(([, v]) => v?.userId !== undefined)  // valid entries only
          .map(([id]) => id)
      );

      // ── Fetch this league's tournament_id ────────────────────────────────
      // Used to restrict the player pool to the correct competition.
      let tournamentId = null;
      if (leagueId) {
        const { data: leagueRow } = await supabase
          .from('leagues')
          .select('tournament_id')
          .eq('id', leagueId)
          .maybeSingle();
        tournamentId = leagueRow?.tournament_id ?? null;
        console.log('[useAutoFill] league tournament_id:', tournamentId, 'leagueRow:', leagueRow);
      }

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

      // ── Fill each position ───────────────────────────────────────────────
      for (const pos of ['GK', 'DEF', 'MID', 'FWD']) {
        if (!need[pos]) continue;

        const dbPos = pos === 'FWD' ? ['FWD', 'FW'] : [pos];

        // Fetch a large pool: 500 per position, cheapest first, within budget.
        // The large limit ensures enough candidates survive after filtering.
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
        console.log(`[useAutoFill] ${pos} pool size (with tournament):`, pool?.length);

        // Fallback: if tournament filter returned no results, try without tournament filter
        // This handles case where tournament_id column exists but isn't populated on players
        if (!pool?.length && tournamentId) {
          console.log(`[useAutoFill] ${pos} fallback triggered (tournament filter returned 0)`);
          const fallbackQuery = supabase
            .from('players')
            .select('id, name, position, club, price')
            .in('position', dbPos)
            .lte('price', budgetLeft)
            .order('price', { ascending: true })
            .limit(500);

          const { data: fallbackPool } = await fallbackQuery;
          pool = fallbackPool;
          console.log(`[useAutoFill] ${pos} pool size (fallback):`, pool?.length);
        }

        if (!pool?.length) {
          console.log(`[useAutoFill] ${pos} skipped - no players available`);
          continue;
        }

        // Pre-filter: remove my own players AND players taken by other managers
        const candidates = pool.filter(p => !myIds.has(p.id) && !othersIds.has(p.id));
        skippedTaken += pool.length - candidates.length;
        console.log(`[useAutoFill] ${pos} candidates after filtering:`, candidates.length, 'pool:', pool.length, 'myIds:', myIds.size, 'othersIds:', othersIds.size);

        if (candidates.length > 0) anyPoolFound = true;

        // Try each candidate until need[pos] slots are filled
        let bought = 0;
        for (let i = 0; i < candidates.length && bought < need[pos]; i++) {
          const result = await buy(candidates[i]);
          if (result.ok) {
            bought++;
            added++;
            budgetLeft = result.budget_remaining ?? (budgetLeft - (candidates[i].price || 0));
            myIds.add(candidates[i].id);
          } else {
            lastBuyError = result.error;
          }
        }
      }

      // ── Result message ───────────────────────────────────────────────────
      console.log('[useAutoFill] final result - added:', added, 'anyPoolFound:', anyPoolFound, 'budgetLeft:', budgetLeft);
      if (added > 0) {
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
        // Candidates existed but all buy attempts failed
        setAutoFillMsg(
          lastBuyError?.includes('taken')
            ? 'All candidates in this range are taken — try refreshing'
            : (lastBuyError || 'Could not complete auto-fill — refresh and try again')
        );
      }

    } catch (err) {
      console.error('[useAutoFill] ERROR:', err);
      setAutoFillMsg('Auto-fill failed — try again');
    } finally {
      setAutoFilling(false);
      setTimeout(() => setAutoFillMsg(null), 7000);
    }
    console.log('[useAutoFill] ===== END AUTO-FILL =====');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, squadData, buy, fetchSquad, takenMap, cfg]);

  return { handleAutoFill, autoFilling, autoFillMsg };
}
