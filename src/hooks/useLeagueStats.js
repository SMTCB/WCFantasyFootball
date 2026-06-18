import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useLeagueStats(leagueId) {
  const [topScorers,     setTopScorers]     = useState([]);
  const [teamMetrics,    setTeamMetrics]     = useState(null);
  const [matchdayPoints, setMatchdayPoints]  = useState([]);
  const [positionPoints, setPositionPoints]  = useState([]);
  const [captainHitData, setCaptainHitData]  = useState([]);
  const [roiData,        setRoiData]         = useState({ managerRoi: [], playerRoi: [] });
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

      const ptsMap = Object.fromEntries(
        (scorers ?? []).map(s => [s.user_id, Number(s.total_points) || 0])
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
      const squadIds = uniqueSquads.map(s => s.id);

      // All squad IDs across the league (including older rows from pre-transfer periods)
      // Used for fantasy_points fetch so we don't miss scored rounds tied to older squad rows
      const allSquadIds = (leagueSquads || []).map(s => s.id);
      const allSquadIdToMeta = Object.fromEntries(
        (leagueSquads || []).map(s => [s.id, { user_id: s.user_id, username: s.users?.username || 'Unknown' }])
      );

      if (squadIds.length === 0) {
        setMatchdayPoints([]);
        setPositionPoints([]);
        setCaptainHitData([]);
        setRoiData({ managerRoi: [], playerRoi: [] });
        return;
      }

      // ── 4. Per-matchday fantasy_points (progression + captaincy source) ──
      //    Include points_breakdown so captain snapshot rows can be extracted.
      const { data: gwPts } = await supabase
        .from('fantasy_points')
        .select('squad_id, matchday_id, total, points_breakdown')
        .in('squad_id', allSquadIds);

      // Progression chart — uses allSquadIdToMeta; ProgressionChart deduplicates per user+matchday by taking max
      setMatchdayPoints(
        (gwPts || [])
          .map(fp => ({
            squad_id:    fp.squad_id,
            matchday_id: fp.matchday_id,
            total:       fp.total,
            user_id:     allSquadIdToMeta[fp.squad_id]?.user_id,
            username:    allSquadIdToMeta[fp.squad_id]?.username,
          }))
          .filter(fp => fp.user_id)
      );

      // ── 5. Position breakdown + ROI + Captain hit rate ───────────────────────
      //    Position breakdown uses effective_xi per completed matchday from
      //    points_breakdown (v27+). Points are proportionally distributed from
      //    the authoritative fantasy_points.total — fixes double-counting MD2
      //    in-progress stats that the old current-XI approach caused.

      const allCurrentXiIds = [
        ...new Set(
          uniqueSquads.flatMap(s =>
            s.starting_xi?.length ? s.starting_xi : (s.players || []).slice(0, 11)
          )
        ),
      ];

      // Rows from completed matchdays that have effective_xi in points_breakdown
      const xiRows     = (gwPts || []).filter(fp => fp.points_breakdown?.effective_xi?.length > 0);
      const captainRows = xiRows.filter(fp => fp.points_breakdown?.effective_captain_id);
      const allMdIds   = [...new Set(xiRows.map(r => r.matchday_id))];

      // Union of forza IDs: historical XI players (position breakdown) + current XI (ROI)
      const allHistXiPids   = [...new Set(xiRows.flatMap(r => r.points_breakdown.effective_xi))];
      const allHistForzaIds = [...new Set(allHistXiPids.map(id => id.split('-')[1]).filter(Boolean))];
      const allCurrForzaIds = [...new Set(allCurrentXiIds.map(id => id.split('-')[1]).filter(Boolean))];
      const unionForzaIds   = [...new Set([...allHistForzaIds, ...allCurrForzaIds])];

      if (unionForzaIds.length > 0) {
        // Round 1: player metadata + fixtures for historical matchdays (parallel)
        const [{ data: playerData }, { data: mdFixtures }] = await Promise.all([
          supabase.from('players').select('forza_player_id, position, name, price').in('forza_player_id', unionForzaIds),
          allMdIds.length > 0
            ? supabase.from('fixtures').select('id, matchday_id').in('matchday_id', allMdIds)
            : Promise.resolve({ data: [] }),
        ]);

        const posMap   = Object.fromEntries((playerData || []).map(p => [p.forza_player_id, p.position]));
        const priceMap = Object.fromEntries((playerData || []).map(p => [p.forza_player_id, Number(p.price) || 0]));
        const nameMap  = Object.fromEntries((playerData || []).map(p => [p.forza_player_id, p.name || '']));

        const fixturesByMD = {};
        for (const f of (mdFixtures || [])) {
          if (!fixturesByMD[f.matchday_id]) fixturesByMD[f.matchday_id] = [];
          fixturesByMD[f.matchday_id].push(f.id);
        }
        const allHistFixtureIds = [...new Set(Object.values(fixturesByMD).flat())];

        // Round 2: historical XI stats (fixture-scoped) + current XI stats (for ROI, all fixtures)
        const [{ data: histMatchStats }, { data: currentXiStats }] = await Promise.all([
          allHistXiPids.length > 0 && allHistFixtureIds.length > 0
            ? supabase.from('player_match_stats').select('player_id, fixture_id, fantasy_points').in('player_id', allHistXiPids).in('fixture_id', allHistFixtureIds)
            : Promise.resolve({ data: [] }),
          allCurrentXiIds.length > 0
            ? supabase.from('player_match_stats').select('player_id, fantasy_points, minutes_played').in('player_id', allCurrentXiIds)
            : Promise.resolve({ data: [] }),
        ]);

        // statsLookup: player_id|fixture_id → pts (historical matchday fixtures only)
        const statsLookup = {};
        for (const s of (histMatchStats || [])) {
          const key = `${s.player_id}|${s.fixture_id}`;
          statsLookup[key] = (statsLookup[key] || 0) + Math.round(Number(s.fantasy_points) || 0);
        }

        // ── Position breakdown ────────────────────────────────────────────────
        if (allMdIds.length > 0) {
          const posAccum = {};
          const seenPosRounds = new Set();

          for (const row of xiRows) {
            const meta = allSquadIdToMeta[row.squad_id];
            if (!meta) continue;
            const roundKey = `${meta.user_id}|${row.matchday_id}`;
            if (seenPosRounds.has(roundKey)) continue;
            seenPosRounds.add(roundKey);

            const uid              = meta.user_id;
            const xi               = row.points_breakdown.effective_xi;
            const fixtures         = fixturesByMD[row.matchday_id] || [];
            const matchdayTotal    = Math.max(0, Math.round(Number(row.total) || 0));
            const penaltyDeduction = Math.round(Number(row.points_breakdown?.transfer_penalty_deduction) || 0);

            if (!posAccum[uid]) {
              posAccum[uid] = { user_id: uid, username: meta.username, GK: 0, DEF: 0, MID: 0, FWD: 0, sum_fp_total: 0, penalty_pts: 0 };
            }
            posAccum[uid].sum_fp_total += matchdayTotal;
            posAccum[uid].penalty_pts  += penaltyDeduction;

            if (matchdayTotal <= 0 || !fixtures.length) continue;

            // Raw pts per position for this matchday's fixtures only
            const rawPos = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
            let rawTotal = 0;
            for (const pid of xi) {
              const forzaId = pid.split('-')[1];
              const pos = posMap[forzaId];
              if (!pos || !(pos in rawPos)) continue;
              const pts = fixtures.reduce((s, fid) => s + (statsLookup[`${pid}|${fid}`] || 0), 0);
              rawPos[pos] += pts;
              rawTotal    += pts;
            }

            if (rawTotal > 0) {
              // Proportional: each pos segment = (rawPos[p]/rawTotal)*matchdayTotal
              // Last segment gets remainder so GK+DEF+MID+FWD sums exactly to matchdayTotal
              const activePos = ['GK', 'DEF', 'MID', 'FWD'].filter(p => rawPos[p] > 0);
              let allocated = 0;
              for (let i = 0; i < activePos.length; i++) {
                const pos = activePos[i];
                const pts = i < activePos.length - 1
                  ? Math.floor((rawPos[pos] / rawTotal) * matchdayTotal)
                  : Math.max(0, matchdayTotal - allocated);
                posAccum[uid][pos] += pts;
                allocated += pts;
              }
            }
            // If rawTotal=0: player stats not yet written (e.g. live round); sum_fp_total
            // still accumulates so bet_pts computation remains accurate.
          }

          // Ensure every league member has an entry (bet-only managers, managers yet to score)
          for (const s of (scorers ?? [])) {
            if (!posAccum[s.user_id]) {
              posAccum[s.user_id] = {
                user_id: s.user_id, username: s.users?.username || 'Unknown',
                GK: 0, DEF: 0, MID: 0, FWD: 0, sum_fp_total: 0, penalty_pts: 0,
              };
            }
          }

          // bet_pts = official total_points − sum of completed-round fantasy_points totals
          setPositionPoints(
            Object.values(posAccum).map(entry => ({
              ...entry,
              bet_pts: Math.max(0, (ptsMap[entry.user_id] || 0) - entry.sum_fp_total),
            }))
          );
        } else {
          // No completed matchdays with effective_xi yet
          setPositionPoints(
            (scorers ?? []).map(s => ({
              user_id: s.user_id, username: s.users?.username || 'Unknown',
              GK: 0, DEF: 0, MID: 0, FWD: 0, sum_fp_total: 0, penalty_pts: 0, bet_pts: 0,
            }))
          );
        }

        // ── ROI ───────────────────────────────────────────────────────────────
        const statsByPlayer   = {};
        const minutesByPlayer = {};
        for (const s of (currentXiStats || [])) {
          statsByPlayer[s.player_id]   = (statsByPlayer[s.player_id]   || 0) + Math.round(Number(s.fantasy_points)  || 0);
          minutesByPlayer[s.player_id] = (minutesByPlayer[s.player_id] || 0) + (Number(s.minutes_played) || 0);
        }

        const managerRoi = uniqueSquads.map(squad => {
          const xi = squad.starting_xi?.length ? squad.starting_xi : (squad.players || []).slice(0, 11);
          const squadValue = xi.reduce((sum, fpId) => {
            const forzaId = fpId.split('-')[1];
            return sum + (priceMap[forzaId] || 0);
          }, 0);
          const totalPts = ptsMap[squad.user_id] || 0;
          const roi = squadValue > 0 ? totalPts / squadValue : 0;
          return { user_id: squad.user_id, username: squad.username, total_points: totalPts, squad_value: squadValue, roi };
        }).sort((a, b) => b.roi - a.roi);

        const seenFpIds = new Set();
        const playerRoi = allCurrentXiIds
          .filter(fpId => {
            if (seenFpIds.has(fpId)) return false;
            seenFpIds.add(fpId);
            return true;
          })
          .map(fpId => {
            const forzaId = fpId.split('-')[1];
            if (!forzaId) return null;
            const price   = priceMap[forzaId] || 0;
            if (price === 0) return null;
            const pts     = statsByPlayer[fpId]   || 0;
            const minutes = minutesByPlayer[fpId] || 0;
            return { player_id: fpId, name: nameMap[forzaId] || forzaId, position: posMap[forzaId] || '?', price, pts, minutes, roi: pts / price };
          })
          .filter(Boolean);

        setRoiData({ managerRoi, playerRoi });

        // ── 6. Captaincy hit rate (reuses statsLookup + fixturesByMD) ─────────
        if (captainRows.length > 0) {
          const captainMap = {};
          const seenCaptainRounds = new Set();

          for (const row of captainRows) {
            const meta = allSquadIdToMeta[row.squad_id];
            if (!meta) continue;
            const roundKey = `${meta.user_id}|${row.matchday_id}`;
            if (seenCaptainRounds.has(roundKey)) continue;
            seenCaptainRounds.add(roundKey);

            const uid       = meta.user_id;
            const xi        = row.points_breakdown?.effective_xi || [];
            const captainId = row.points_breakdown?.effective_captain_id;
            const fixtures  = fixturesByMD[row.matchday_id] || [];

            if (!captainId || !xi.length || !fixtures.length) continue;

            if (!captainMap[uid]) {
              captainMap[uid] = { user_id: uid, username: meta.username, hits: 0, total: 0, rounds: [] };
            }

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
              matchday_id:   row.matchday_id,
              captain_id:    captainId,
              captain_pts:   captainPts,
              max_other_pts: maxOtherPts,
              hit:           isHit,
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

      } else {
        setPositionPoints([]);
        setRoiData({ managerRoi: [], playerRoi: [] });
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

  return { topScorers, teamMetrics, matchdayPoints, positionPoints, captainHitData, roiData, loading, error, refetch: fetchStats };
}
