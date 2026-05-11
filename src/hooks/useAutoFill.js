import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// Default target formation for auto-fill: 1-4-4-2
const TARGET = { GK: 1, DEF: 4, MID: 4, FWD: 2 };

/**
 * Fills empty starter slots with cheapest available players.
 * Calls the existing `buy` transfer function sequentially per slot.
 */
export function useAutoFill({ leagueId, squadData, takenMap, buy }) {
  const [isFilling,   setIsFilling]   = useState(false);
  const [fillMessage, setFillMessage] = useState(null); // { text, error }

  const showMessage = (text, error = false) => {
    setFillMessage({ text, error });
    setTimeout(() => setFillMessage(null), 4000);
  };

  const autoFill = useCallback(async (onComplete) => {
    if (!leagueId || !squadData || isFilling) return;

    const starters = squadData.players ?? [];
    if (starters.length >= 11) {
      showMessage('Squad already has 11 starters.');
      return;
    }

    setIsFilling(true);

    try {
      // Load all players cheapest-first
      const { data: allPlayers, error } = await supabase
        .from('players')
        .select('id, name, position, price, club')
        .order('price', { ascending: true });

      if (error) throw error;

      // IDs already in the squad (starters + bench)
      const ownedIds = new Set([
        ...(squadData.players ?? []).map(p => p.id),
        ...(squadData.bench   ?? []).map(p => p.id),
      ]);

      // Count current starters per position
      const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
      starters.forEach(p => { if (counts[p.position] !== undefined) counts[p.position]++; });

      // Slots needed per position
      const needed = {};
      for (const [pos, target] of Object.entries(TARGET)) {
        needed[pos] = Math.max(0, target - counts[pos]);
      }

      // Available: not owned, not taken by another manager
      const available = allPlayers.filter(p => !ownedIds.has(p.id) && !takenMap[p.id]);

      let budget      = squadData.budget?.current ?? 0;
      let addedCount  = 0;
      const usedIds   = new Set();

      for (const pos of ['GK', 'DEF', 'MID', 'FWD']) {
        let slots = needed[pos];
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
