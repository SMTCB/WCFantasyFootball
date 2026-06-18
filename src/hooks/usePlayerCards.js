import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Fetches card data from player_match_stats for all finished fixtures in a tournament.
 * Returns a Map<playerId, intelPatch> where intelPatch overrides the default 'fit' intel:
 *   red_cards  > 0 → { status: 'suspended', confidence: 100, reason: 'Red card', risk: 3 }
 *   yellow_cards > 0 → { status: 'doubtful', confidence: 80, reason: 'Yellow card', risk: 1 }
 * Red card takes precedence over yellow.
 */
export function usePlayerCards(tournamentId) {
  const [cardMap, setCardMap] = useState(new Map());

  useEffect(() => {
    if (!tournamentId) return;

    async function fetchCards() {
      // Get finished fixture IDs for this tournament
      const { data: fixtures } = await supabase
        .from('fixtures')
        .select('id')
        .eq('tournament_id', String(tournamentId))
        .eq('status', 'finished');

      if (!fixtures?.length) return;

      const fixtureIds = fixtures.map(f => f.id);

      const { data: stats } = await supabase
        .from('player_match_stats')
        .select('player_id, red_cards, yellow_cards')
        .in('fixture_id', fixtureIds)
        .or('red_cards.neq.0,yellow_cards.neq.0');

      if (!stats?.length) return;

      // Aggregate cards per player across all finished fixtures
      const totals = new Map();
      for (const row of stats) {
        const reds    = parseInt(row.red_cards,    10) || 0;
        const yellows = parseInt(row.yellow_cards, 10) || 0;
        if (reds === 0 && yellows === 0) continue;
        const existing = totals.get(row.player_id) ?? { reds: 0, yellows: 0 };
        totals.set(row.player_id, {
          reds:    existing.reds    + reds,
          yellows: existing.yellows + yellows,
        });
      }

      const map = new Map();
      for (const [playerId, { reds, yellows }] of totals) {
        if (reds > 0) {
          map.set(playerId, { status: 'suspended', confidence: 100, reason: 'Red card', risk: 3 });
        } else if (yellows > 0) {
          map.set(playerId, { status: 'doubtful', confidence: 80, reason: 'Yellow card', risk: 1 });
        }
      }
      setCardMap(map);
    }

    fetchCards();
  }, [tournamentId]);

  return cardMap;
}
