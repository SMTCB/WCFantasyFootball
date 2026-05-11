import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Fills empty squad slots with cheapest available players.
 *
 * autoFill(targetCaps, countFrom, onComplete)
 *   targetCaps  — { GK:n, DEF:n, MID:n, FWD:n } — how many of each position the final squad needs
 *   countFrom   — the player array to count against targetCaps (starters only | all squad)
 *   onComplete  — callback to refresh squad state after fill (e.g. fetchSquad)
 *
 * Existing players in the squad are never re-bought (ownedIds covers starters + bench).
 * Budget is tracked across sequential buy() calls using the returned budget_remaining.
 */
export function useAutoFill({ leagueId, squadData, takenMap, buy }) {
  const [isFilling,   setIsFilling]   = useState(false);
  const [fillMessage, setFillMessage] = useState(null); // { text, error }

  const showMessage = (text, error = false) => {
    setFillMessage({ text, error });
    setTimeout(() => setFillMessage(null), 4000);
  };

  const autoFill = useCallback(async (targetCaps, countFrom, onComplete) => {
    if (!leagueId || !squadData || isFilling) return;

    const totalTarget = Object.values(targetCaps).reduce((a, b) => a + b, 0);
    const currentAll  = countFrom ?? [];

    if (currentAll.length >= totalTarget) {
      showMessage('Squad is already full.');
      return;
    }

    setIsFilling(true);

    try {
      const { data: allPlayers, error } = await supabase
        .from('players')
        .select('id, name, position, price, club')
        .order('price', { ascending: true });

      if (error) throw error;

      // Never re-buy anything already in the squad (starters or bench)
      const ownedIds = new Set([
        ...(squadData.players ?? []).map(p => p.id),
        ...(squadData.bench   ?? []).map(p => p.id),
      ]);

      // Count existing players per position against the target
      const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
      currentAll.forEach(p => { if (counts[p.position] !== undefined) counts[p.position]++; });

      const needed = {};
      let totalNeeded = 0;
      for (const [pos, target] of Object.entries(targetCaps)) {
        needed[pos] = Math.max(0, target - counts[pos]);
        totalNeeded += needed[pos];
      }

      if (totalNeeded === 0) {
        showMessage('No empty slots to fill.');
        return;
      }

      const available = allPlayers.filter(p => !ownedIds.has(p.id) && !takenMap[p.id]);

      let budget     = squadData.budget?.current ?? 0;
      let addedCount = 0;
      const usedIds  = new Set();

      for (const pos of ['GK', 'DEF', 'MID', 'FWD']) {
        let slots = needed[pos] ?? 0;
        const eligible = available.filter(p => p.position === pos && !usedIds.has(p.id));

        for (const player of eligible) {
          if (slots === 0) break;
          if (player.price > budget) continue;

          const result = await buy(player);
          if (!result.ok) continue;

          budget = result.budget_remaining ?? (budget - player.price);
          addedCount++;
          slots--;
          usedIds.add(player.id);
        }
      }

      if (addedCount === 0) {
        showMessage(
          budget <= 0 ? 'Not enough budget to add any players.' : 'No eligible players available.',
          true,
        );
      } else {
        showMessage(`Added ${addedCount} player${addedCount > 1 ? 's' : ''} · £${Number(budget).toFixed(1)}M remaining`);
        onComplete?.();
      }
    } catch (err) {
      console.error('useAutoFill:', err);
      showMessage('Auto-fill failed. Please try again.', true);
    } finally {
      setIsFilling(false);
    }
  }, [leagueId, squadData, takenMap, buy, isFilling]);

  return { autoFill, isFilling, fillMessage };
}
