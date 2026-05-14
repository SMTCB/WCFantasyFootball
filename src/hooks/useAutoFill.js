import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useTransfer } from './useTransfer';
import { useLeagueConfig } from './useLeagueConfig';

export function useAutoFill(leagueId, squadData, fetchSquad) {
  const [autoFilling, setAutoFilling] = useState(false);
  const [autoFillMsg, setAutoFillMsg] = useState(null);

  const cfg = useLeagueConfig(leagueId);
  const POS_LIMITS = cfg.positionLimits;
  const { buy, takenMap } = useTransfer(leagueId);

  const handleAutoFill = useCallback(async () => {
    if (autoFilling) return;
    setAutoFilling(true);
    setAutoFillMsg(null);
    try {
      const starters = squadData?.players || [];
      const slotsNeeded = 11 - starters.length;
      if (slotsNeeded <= 0) {
        setAutoFillMsg('Squad is already full');
        return;
      }

      const myIds = new Set([
        ...starters.map(p => p.id),
        ...(squadData.bench || []).map(p => p.id),
      ]);
      const allTakenIds = new Set(Object.keys(takenMap));

      // Count current starters by position
      const have = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
      for (const p of starters) {
        const pos = p.position?.toUpperCase().replace('FW', 'FWD');
        if (have[pos] !== undefined) have[pos]++;
      }

      const minPer = cfg.minFormation ?? { GK: 1, DEF: 3, MID: 2, FWD: 1 };
      const maxPer = POS_LIMITS      ?? { GK: 2, DEF: 5, MID: 5, FWD: 3 };

      // Slots needed per position: fill minimums first
      const need = {};
      for (const pos of ['GK', 'DEF', 'MID', 'FWD']) {
        need[pos] = Math.max(0, (minPer[pos] ?? 0) - have[pos]);
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

      let budgetLeft = squadData.budget.current;
      let added = 0;

      for (const pos of ['GK', 'DEF', 'MID', 'FWD']) {
        if (!need[pos]) continue;
        const dbPos = pos === 'FWD' ? ['FWD', 'FW'] : [pos];
        const { data: pool } = await supabase
          .from('players')
          .select('id, name, position, club, price')
          .in('position', dbPos)
          .lte('price', budgetLeft)
          .order('price', { ascending: true })
          .limit(50);

        const candidates = (pool || []).filter(
          p => !myIds.has(p.id) && !allTakenIds.has(p.id)
        );
        for (let i = 0; i < need[pos] && i < candidates.length; i++) {
          const result = await buy(candidates[i]);
          if (result.ok) {
            added++;
            budgetLeft = result.budget_remaining ?? budgetLeft - candidates[i].price;
            myIds.add(candidates[i].id);
            allTakenIds.add(candidates[i].id);
          }
        }
      }

      if (added > 0) {
        setAutoFillMsg(
          `Added ${added} player${added !== 1 ? 's' : ''} · £${budgetLeft.toFixed(1)}M left`
        );
        if (fetchSquad) await fetchSquad();
      } else {
        setAutoFillMsg('No affordable players available');
      }
    } catch {
      setAutoFillMsg('Auto-fill failed — try again');
    } finally {
      setAutoFilling(false);
      setTimeout(() => setAutoFillMsg(null), 5000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, squadData, buy, takenMap, fetchSquad]);

  return { handleAutoFill, autoFilling, autoFillMsg };
}
