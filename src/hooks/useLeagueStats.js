import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useLeagueStats(leagueId) {
  const [topScorers,     setTopScorers]     = useState([]);
  const [teamMetrics,    setTeamMetrics]     = useState(null);
  const [matchdayPoints, setMatchdayPoints]  = useState([]);
  const [positionPoints, setPositionPoints]  = useState([]);
  const [captainHitData, setCaptainHitData]  = useState([]);
  const [loading,        setLoading]         = useState(false);
  const [error,          setError]           = useState(null);

  const fetchStats = useCallback(async () => {
    if (!leagueId) return;
    setLoading(true);
    setError(null);

    try {
      // ── 1. Top scorers ────────────────────────────────────────────────────
      const { data: scorers, error: scorersErr } = await supabase
        .from('league_members')
        .select('user_id, rank, total_points, users(username)')
        .eq('league_id', leagueId)
        .order('total_points', { ascending: false })
        .limit(10);
      if (scorersErr) throw scorersErr;

      setTopScorers(
        (scorers ?? []).map(s => ({
          user_id:      s.user_id,
          rank:         s.rank,
          total_points: s.total_points,
          username:     s.users?.username || 'Unknown',
        }))
      );

      // ── 2. Team metrics ───────────────────────────────────────────────────
      const { data: metrics, error: metricsErr } = await supabase
        .rpc('get_league_stats', { p_league_id: leagueId });

      if (metricsErr) {
        const { data: members, error: membersErr } = await supabase
          .from('league_members')
          .select('total_points')
          .eq('league_id', leagueId);
        if (membersErr) throw membersErr;
        const memberCount = members?.length ?? 0;
        setTeamMetrics({
          member_count: memberCount,
          avg_points: memberCount > 0
            ? Math.round(members.reduce((s, m) => s + (m.total_points ?? 0), 0) / memberCount)
            : 0,
        });
      } else {
        setTeamMetrics(metrics);
      }

      // ── 3. Squads (one per user, latest) ─────────────────────────────────
      const { data: leagueSquads } = await supabase
        .from('squads')
        .select('id, user_id, starting_xi, players, users(username)')
        .eq('league_id', leagueId)
        .order('created_at', { ascending: false });

      const seenUsers    = new Set();
      const uniqueSquads = [];
      for (const s of (leagueSquads || [])) {
        if (!seenUsers.has(s.user_id)) {
          seenUsers.add(s.user_id);
          uniqueSquads.push({ ...s, username: s.users?.username || 'Unknown' });
        }
      }
      const squadIds      = uniqueSquads.map(s => s.id);
      const squadIdToMeta = Object.fromEntries(
        uniqueSquads.map(s => [s.id, { user_id: s.user_id, username: s.username }])
      );

      if (squadIds.length === 0) {
        setMatchdayPoints([]);
        setPositionPoints([]);
        setCaptainHitData([]);
        return;
      }

      // ── 4. Per-matchday fantasy_points (progression + captaincy source) ──
      //    Include points_breakdown so captain snapshot rows can be extracted.
      const { data: gwPts } = await supabase
        .from('fantasy_points')
        .select('squad_id, matchday_id, total, points_breakdown')
        .in('squad_id', squadIds);

      // Progression chart
      setMatchdayPoints(
        (gwPts || [])
          .map(fp => ({
            squad_id:    fp.squad_id,
            matchday_id: fp.matchday_id,
            total:       fp.total,
            user_id:     squadIdToMeta[fp.squad_id]?.user_id,
            username:    squadIdToMeta[fp.squad_id]?.username,
          }))
          .filter(fp => fp.user_id)
      );

      // ── 5. Position breakdown ─────────────────────────────────────────────
      const allCurrentXiIds = [
        ...new Set(
          uniqueSquads.flatMap(s =>
            s.starting_xi?.length ? s.starting_xi : (s.players || []).slice(0, 11)
          )
        ),
      ];
      const allForzaIds = [
        ...new Set(allCurrentXiIds.map(id => id.split('-')[1]).filter(Boolean)),
      ];

      if (allForzaIds.length > 0) {
        const [{ data: playerPositions }, { data: currentXiStats }] = await Promise.all([
          supabase
            .from('players')
            .select('forza_player_id, position')
            .in('forza_player_id', allForzaIds),
          supabase
            .from('player_match_stats')
            .select('player_id, fantasy_points')
            .in('player_id', allCurrentXiIds),
        ]);

        const posMap = Object.fromEntries(
          (playerPositions || []).map(p => [p.forza_player_id, p.position])
        );
        const statsByPlayer = {};
        for (const s of (currentXiStats || [])) {
          statsByPlayer[s.player_id] =
            (statsByPlayer[s.player_id] || 0) + Math.round(Number(s.fantasy_points) || 0);
        }

        setPositionPoints(
          uniqueSquads.map(squad => {
            const xi = squad.starting_xi?.length
              ? squad.starting_xi
              : (squad.players || []).slice(0, 11);
            const pos = {};
            for (const fpId of xi) {
              const forzaId  = fpId.split('-')[1];
              const position = posMap[forzaId];
              if (position) pos[position] = (pos[position] || 0) + (statsByPlayer[fpId] || 0);
            }
            return { user_id: squad.user_id, username: squad.username, ...pos };
          })
        );
      } else {
        setPositionPoints([]);
      }

      // ── 6. Captaincy hit rate ─────────────────────────────────────────────
      //    calculate-scores v27+ writes effective_captain_id + effective_xi
      //    into points_breakdown when roundComplete = true.
      const captainRows = (gwPts || []).filter(
        fp => fp.points_breakdown?.effective_captain_id
      );

      if (captainRows.length > 0) {
        const captainMatchdayIds = [...new Set(captainRows.map(r => r.matchday_id))];

        // Get fixture IDs for those matchdays
        const { data: mdFixtures } = await supabase
          .from('fixtures')
          .select('id, matchday_id')
          .in('matchday_id', captainMatchdayIds);

        const fixturesByMD = {};
        for (const f of (mdFixtures || [])) {
          if (!fixturesByMD[f.matchday_id]) fixturesByMD[f.matchday_id] = [];
          fixturesByMD[f.matchday_id].push(f.id);
        }

        // All XI player IDs and fixture IDs needed for this fetch
        const allXiPids = [
          ...new Set(captainRows.flatMap(r => r.points_breakdown?.effective_xi || [])),
        ];
        const allCaptainFixtureIds = [
          ...new Set(Object.values(fixturesByMD).flat()),
        ];

        let statsLookup = {};
        if (allXiPids.length > 0 && allCaptainFixtureIds.length > 0) {
          const { data: captainStats } = await supabase
            .from('player_match_stats')
            .select('player_id, fixture_id, fantasy_points')
            .in('player_id', allXiPids)
            .in('fixture_id', allCaptainFixtureIds);

          for (const s of (captainStats || [])) {
            const key = `${s.player_id}|${s.fixture_id}`;
            statsLookup[key] = (statsLookup[key] || 0) + Math.round(Number(s.fantasy_points) || 0);
          }
        }

        // Compute hit/miss per manager per completed round
        const captainMap = {};
        for (const row of captainRows) {
          const meta = squadIdToMeta[row.squad_id];
          if (!meta) continue;

          const uid       = meta.user_id;
          const xi        = row.points_breakdown?.effective_xi || [];
          const captainId = row.points_breakdown?.effective_captain_id;
          const fixtures  = fixturesByMD[row.matchday_id] || [];

          if (!captainId || !xi.length || !fixtures.length) continue;

          if (!captainMap[uid]) {
            captainMap[uid] = { user_id: uid, username: meta.username, hits: 0, total: 0, rounds: [] };
          }

          // Per-player points for this matchday = sum across its fixtures
          const playerPts = {};
          for (const pid of xi) {
            playerPts[pid] = fixtures.reduce(
              (sum, fid) => sum + (statsLookup[`${pid}|${fid}`] || 0), 0
            );
          }

          const captainPts  = playerPts[captainId] || 0;
          const maxOtherPts = Math.max(
            ...xi.filter(p => p !== captainId).map(p => playerPts[p] || 0),
            0
          );
          const isHit = captainPts > maxOtherPts;

          captainMap[uid].total++;
          if (isHit) captainMap[uid].hits++;
          captainMap[uid].rounds.push({
            matchday_id:    row.matchday_id,
            captain_id:     captainId,
            captain_pts:    captainPts,
            max_other_pts:  maxOtherPts,
            hit:            isHit,
          });
        }

        setCaptainHitData(
          Object.values(captainMap).sort((a, b) => {
            const aRate = a.hits / (a.total || 1);
            const bRate = b.hits / (b.total || 1);
            return bRate - aRate || b.total - a.total;
          })
        );
      } else {
        setCaptainHitData([]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [leagueId]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  useEffect(() => {
    if (!leagueId) return;
    const sub = supabase
      .channel(`league_stats:league_id=eq.${leagueId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'league_members', filter: `league_id=eq.${leagueId}` },
        () => { fetchStats(); }
      )
      .subscribe();
    return () => { sub.unsubscribe(); };
  }, [leagueId, fetchStats]);

  return { topScorers, teamMetrics, matchdayPoints, positionPoints, captainHitData, loading, error, refetch: fetchStats };
}
