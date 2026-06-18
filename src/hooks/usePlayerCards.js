import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Fetches red card data from player_match_stats for all finished fixtures in a tournament.
 * Returns a Map<playerId, intelPatch> for players who received a red card (suspended next match).
 * Yellow cards are intentional fouls but do not prevent playing — they are excluded.
 */
export function usePlayerCards(tournamentId) {
  const [cardMap, setCardMap] = useState(new Map());

  useEffect(() => {
    if (!tournamentId) return;

    async function fetchCards() {
      const { data: fixtures } = await supabase
        .from('fixtures')
        .select('id')
        .eq('tournament_id', String(tournamentId))
        .eq('status', 'finished');

      if (!fixtures?.length) return;

      const fixtureIds = fixtures.map(f => f.id);

      const { data: stats } = await supabase
        .from('player_match_stats')
        .select('player_id, red_cards')
        .in('fixture_id', fixtureIds)
        .neq('red_cards', '0');

      if (!stats?.length) return;

      const map = new Map();
      for (const row of stats) {
        if ((parseInt(row.red_cards, 10) || 0) > 0) {
          map.set(row.player_id, { status: 'suspended', confidence: 100, reason: 'Red card', risk: 3 });
        }
      }
      setCardMap(map);
    }

    fetchCards();
  }, [tournamentId]);

  return cardMap;
}
