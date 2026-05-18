import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useTransfer } from './useTransfer';
import { useLeagueConfig } from './useLeagueConfig';

export function useAutoFill(leagueId, squadData, fetchSquad) {
  const [autoFilling, setAutoFilling] = useState(false);
  const [autoFillMsg, setAutoFillMsg] = useState(null);

  const cfg = useLeagueConfig(leagueId);
  const POS_LIMITS = cfg.positionLimits;
  const { buy } = useTransfer(leagueId);

  const handleAutoFill = useCallback(async () => {
    if (autoFilling) return;
    setAutoFilling(true);
    setAutoFillMsg(null);
    try {
      const rawPlayers = squadData?.players || [];
      const squadSize  = cfg.squadSize ?? 15;
      const slotsNeeded = squadSize - rawPlayers.length;
      if (slotsNeeded <= 0) {
        setAutoFillMsg('Squad is already full');
        return;
      }

      // Normalise player entries: DB rows give UUID strings, SquadScreen gives objects.
      let playerObjects = rawPlayers;
      if (rawPlayers.length > 0 && typeof rawPlayers[0] === 'string') {
        const { data: fetched } = await supabase
          .from('players')
          .select('id, position')
          .in('id', rawPlayers);
        playerObjects = fetched || [];
      }

      const benchPlayers = squadData?.bench || [];

      // Build set of my own player IDs to avoid double-buying
      const myIds = new Set([
        ...playerObjects.map(p => p.id ?? p),
        ...benchPlayers.map(p => p.id ?? p),
      ]);

      // Count current squad players by position
      const have = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
      for (const p of playerObjects) {
        const pos = p.position?.toUpperCase().replace('FW', 'FWD');
        if (have[pos] !== undefined) have[pos]++;
      }

      const minPer = cfg.minFormation ?? { GK: 1, DEF: 3, MID: 2, FWD: 1 };
      const maxPer = POS_LIMITS      ?? { GK: 2, DEF: 5, MID: 5, FWD: 3 };

      // Slots needed per position: fill minimums first, capped to slotsNeeded total
      const need = {};
      for (const pos of ['GK', 'DEF', 'MID', 'FWD']) {
        need[pos] = Math.max(0, (minPer[pos] ?? 0) - have[pos]);
      }

      let minTotal = Object.values(need).reduce((s, n) => s + n, 0);
      if (minTotal > slotsNeeded) {
        let excess = minTotal - slotsNeeded;
        for (const pos of ['FWD', 'MID', 'DEF', 'GK']) {
          if (excess <= 0) break;
          const trim = Math.min(excess, need[pos]);
          need[pos] -= trim;
          excess -= trim;
        }
      }

      // Distribute remaining slots to positions that still have capacity
      let extra = slotsNeeded - Object.values(need).reduce((s, n) => s + n, 0);
      for (const pos of ['DEF', 'MID', 'FWD', 'GK']) {
        if (extra <= 0) break;
        const capacity = Math.max(0, (maxPer[pos] ?? 5) - have[pos] - need[pos]);
        const give = Math.min(extra, capacity);
        need[pos] += give;
        extra -= give;
      }

      let budgetLeft = squadData?.budget?.current
        ?? squadData?.budget_remaining
        ?? cfg.budgetTotal
        ?? 100;
      let added = 0;
      let hasCandidates = false;
      let lastTransferError = null;

      for (const pos of ['GK', 'DEF', 'MID', 'FWD']) {
        if (!need[pos]) continue;
        const dbPos = pos === 'FWD' ? ['FWD', 'FW'] : [pos];
        const { data: pool } = await supabase
          .from('players')
          .select('id, name, position, club, price')
          .in('position', dbPos)
          .lte('price', budgetLeft)
          .order('price', { ascending: true })
          .limit(200); // Fetch more so taken players don't exhaust the pool

        // Exclude only MY own players — league-uniqueness is enforced by the transfer API
        const candidates = (pool || []).filter(p => !myIds.has(p.id));
        if (candidates.length > 0) hasCandidates = true;

        // Try each candidate until need[pos] are successfully purchased
        let bought = 0;
        for (let i = 0; i < candidates.length && bought < need[pos]; i++) {
          const result = await buy(candidates[i]);
          if (result.ok) {
            bought++;
            added++;
            budgetLeft = result.budget_remaining ?? budgetLeft - candidates[i].price;
            myIds.add(candidates[i].id);
          } else {
            lastTransferError = result.error;
          }
        }
      }

      if (added > 0) {
        setAutoFillMsg(
          `Added ${added} player${added !== 1 ? 's' : ''} · £${budgetLeft.toFixed(1)}M left`
        );
        if (fetchSquad) await fetchSquad();
      } else if (!hasCandidates) {
        if (budgetLeft < 5) {
          setAutoFillMsg('Insufficient budget — sell players to free up funds');
        } else {
          setAutoFillMsg('No players found in these positions within your budget');
        }
      } else {
        // Candidates existed but all buys failed — likely all taken by other managers
        setAutoFillMsg(lastTransferError || 'Could not sign players — they may already be taken. Refresh and try again.');
      }
    } catch {
      setAutoFillMsg('Auto-fill failed — try again');
    } finally {
      setAutoFilling(false);
      setTimeout(() => setAutoFillMsg(null), 6000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, squadData, buy, fetchSquad]);

  return { handleAutoFill, autoFilling, autoFillMsg };
}
