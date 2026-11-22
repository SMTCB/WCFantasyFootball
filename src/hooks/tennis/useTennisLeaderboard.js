import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

// The RPCs return total_points / tournaments_played per manager, and one flat row
// per manager per tournament. The screens want season_total, the slam / masters /
// finals split, and each manager's scores grouped. Shape it here, once.
export function shapeTennisSeason(lbRows, sumRows) {
  const byUser = new Map();
  const tournaments = new Map();
  for (const r of sumRows) {
    if (!tournaments.has(r.tournament_id)) {
      tournaments.set(r.tournament_id, { tournament_id: r.tournament_id, tournament_name: r.tournament_name, sort_order: r.sort_order ?? 0 });
    }
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, { username: r.username, scores: new Map(), slam: 0, finals: 0 });
    const u = byUser.get(r.user_id);
    const pts = r.total_points ?? 0;
    u.scores.set(r.tournament_id, pts);
    if (r.tournament_type === 'grand_slam') u.slam += pts;
    if (r.tournament_type === 'atp_finals') u.finals += pts;
  }
  const order = [...tournaments.values()].sort((a, b) => a.sort_order - b.sort_order);

  const standings = lbRows.map(r => {
    const u = byUser.get(r.user_id);
    const total = r.season_total ?? r.total_points ?? 0;
    const slam = u?.slam ?? 0;
    const finals = u?.finals ?? 0;
    return {
      ...r,
      season_total: total,
      tournaments_scored: r.tournaments_scored ?? r.tournaments_played ?? 0,
      slam_points: slam,
      finals_points: finals,
      // Masters after the drop rule: whatever of the counted total is not slams or finals.
      masters_points: Math.max(0, total - slam - finals),
    };
  });

  const rank = new Map(standings.map((r, i) => [r.user_id, i]));
  const seasonSummary = [...byUser.entries()]
    .map(([user_id, u]) => ({
      user_id,
      username: u.username,
      tournament_scores: order.map(t => ({ ...t, total_points: u.scores.get(t.tournament_id) ?? 0 })),
    }))
    .sort((a, b) => (rank.get(a.user_id) ?? 1e9) - (rank.get(b.user_id) ?? 1e9));

  return { standings, seasonSummary };
}

export function useTennisLeaderboard(playerBoxId, seasonYear = 2026) {
  const [standings, setStandings] = useState([]);
  const [seasonSummary, setSeasonSummary] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetch = useCallback(async () => {
    if (!playerBoxId) return;
    setLoading(true);
    setError(null);
    try {
      const [lbRes, sumRes] = await Promise.all([
        supabase.rpc('get_player_box_leaderboard', {
          p_player_box_id: playerBoxId,
          p_season_year: seasonYear,
        }),
        supabase.rpc('get_tennis_season_summary', {
          p_player_box_id: playerBoxId,
          p_season_year: seasonYear,
        }),
      ]);
      if (lbRes.error) throw lbRes.error;
      if (sumRes.error) throw sumRes.error;
      const shaped = shapeTennisSeason(lbRes.data ?? [], sumRes.data ?? []);
      setStandings(shaped.standings);
      setSeasonSummary(shaped.seasonSummary);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [playerBoxId, seasonYear]);

  useEffect(() => { fetch(); }, [fetch]);

  return { standings, seasonSummary, loading, error, refresh: fetch };
}
