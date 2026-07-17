import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// Returns full-season fantasy points per player for a given tournament.
// statsMap: { [playerId]: [pts|null, ...] } — most recent GW first, one
// entry per finished matchday played this season (NOT capped to 5).
// Consumers that only want recent form (e.g. FormStrip) slice(0, 5) off
// the front themselves; consumers that need a season total (e.g. the
// Market points filter) reduce() the full array.
// null = player had no stats that GW (didn't play / not in DB).
export function usePlayerStats(tournamentId) {
  const [statsMap, setStatsMap] = useState({});

  useEffect(() => {
    if (!tournamentId) return;

    let cancelled = false;

    const load = async () => {
      try {
        // Step 1: every finished matchday for this tournament
        const { data: fixtures } = await supabase
          .from('fixtures')
          .select('id, matchday_id')
          .eq('tournament_id', tournamentId)
          .eq('status', 'finished')
          .order('kickoff_at', { ascending: false })
          .limit(2000);

        if (cancelled || !fixtures?.length) return;

        // Deduplicate matchday_ids, preserve most-recent-first order
        const seenMDs = new Set();
        const allMDs = [];
        const fixtureToMD = {};
        for (const f of fixtures) {
          fixtureToMD[f.id] = f.matchday_id;
          if (!seenMDs.has(f.matchday_id)) {
            seenMDs.add(f.matchday_id);
            allMDs.push(f.matchday_id);
          }
        }

        const relevantFixtureIds = fixtures.map(f => f.id);

        if (!relevantFixtureIds.length) return;

        // Step 2: all stats for those fixtures
        const { data: stats } = await supabase
          .from('player_match_stats')
          .select('player_id, fantasy_points, fixture_id')
          .in('fixture_id', relevantFixtureIds)
          .limit(20000);

        if (cancelled || !stats?.length) return;

        // Group: { playerId: { matchdayId: totalPts } }
        const byPlayer = {};
        for (const s of stats) {
          const md = fixtureToMD[s.fixture_id];
          if (!md) continue;
          if (!byPlayer[s.player_id]) byPlayer[s.player_id] = {};
          byPlayer[s.player_id][md] = (byPlayer[s.player_id][md] || 0) + Number(s.fantasy_points);
        }

        // Convert to ordered arrays (most-recent GW first, one entry per
        // finished matchday this season)
        const result = {};
        for (const [pid, mdPts] of Object.entries(byPlayer)) {
          result[pid] = allMDs.map(md => mdPts[md] ?? null);
        }

        setStatsMap(result);
      } catch (err) {
        console.error('usePlayerStats: failed to load form data', err);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [tournamentId]);

  return { statsMap };
}
