import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { calculateProjection, formatProjectionDisplay } from '../lib/projections';
import { useAuth } from '../hooks/useAuth';
import { EventTimeline } from '../components/EventTimeline';
import { VARReviewBanner } from '../components/VARReviewBanner';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export default function LiveScreen() {
  const { user } = useAuth();
  const [loading,        setLoading]        = useState(true);
  const [liveFixtures,   setLiveFixtures]   = useState([]);
  const [events,         setEvents]         = useState([]);
  const [liveScoreSum,   setLiveScoreSum]   = useState(0);
  const [mySquadPlayers, setMySquadPlayers] = useState([]);
  const [, setLeagueNames] = useState({}); // playerId → leagueName — set for event enrichment, not read directly
  const [multiLeague,    setMultiLeague]    = useState(false);

  const [projection,    setProjection]    = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const prevProjectionRef = useRef(null);

  const matchMinute = useMemo(() => {
    if (liveFixtures.length > 0 && liveFixtures[0].minute) {
      return parseInt(liveFixtures[0].minute, 10) || 64;
    }
    return 64;
  }, [liveFixtures]);

  useEffect(() => {
    fetchLiveData();
    const interval = setInterval(recalcProjection, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loading) recalcProjection();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveScoreSum, matchMinute, loading]);

  const recalcProjection = () => {
    if (mySquadPlayers.length === 0) return;
    const proj = calculateProjection(liveScoreSum, mySquadPlayers, matchMinute, prevProjectionRef.current);
    prevProjectionRef.current = proj.projected;
    setProjection(proj);
    setLastRefreshed(new Date());
  };

  const fetchLiveData = async () => {
    try {
      setLoading(true);
      const userId = user?.id;

      // ── 1. Active fixtures (live only — exclude finished so events stay relevant) ──
      const { data: fixData = [] } = await supabase
        .from('fixtures')
        .select('*')
        .eq('status', 'live')
        .order('kickoff_at', { ascending: true });

      const activeFixtureIds = (fixData || []).map(f => f.id);

      // Score map for ticker
      const scoreMap = {};
      if (activeFixtureIds.length) {
        const { data: goalEvents = [] } = await supabase
          .from('match_events')
          .select('fixture_id, team, type')
          .in('fixture_id', activeFixtureIds)
          .in('type', ['goal', 'own_goal']);

        for (const f of fixData) scoreMap[f.id] = { homeGoals: 0, awayGoals: 0 };
        for (const ev of goalEvents || []) {
          const fix = fixData.find(f => f.id === ev.fixture_id);
          if (!fix) continue;
          const isHome = ev.team === fix.home_team;
          const isOwn  = ev.type === 'own_goal';
          if (isHome !== isOwn) scoreMap[ev.fixture_id].homeGoals++;
          else scoreMap[ev.fixture_id].awayGoals++;
        }
      }
      setLiveFixtures((fixData || []).map(f => ({ ...f, ...scoreMap[f.id] })));

      // ── 2. All leagues the user is in ──────────────────────────────────────────
      if (!userId) { setLoading(false); return; }

      const { data: memberships = [] } = await supabase
        .from('league_members')
        .select('league_id, total_points, rank, leagues(name)')
        .eq('user_id', userId);

      if (!memberships?.length) { setLoading(false); return; }

      const isMultiLeague = memberships.length > 1;
      setMultiLeague(isMultiLeague);

      // ── 3. Squad players for each league (collect all) ─────────────────────────
      const allPlayerIds   = new Set();
      const playerLeagueMap = {}; // playerId → leagueName
      let   firstSquadRows = [];

      for (const membership of memberships) {
        const leagueName = membership.leagues?.name ?? 'League';
        const { data: squadRow } = await supabase
          .from('squads')
          .select('players, captain_id, is_triple_captain')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const ids = squadRow?.players || [];
        ids.forEach(id => {
          allPlayerIds.add(id);
          if (isMultiLeague) playerLeagueMap[id] = leagueName;
        });

        if (memberships.indexOf(membership) === 0) {
          firstSquadRows = [{ squadRow, membership }];
        }
      }

      setLeagueNames(playerLeagueMap);

      // ── 4. Fetch player details + stats for all my players ────────────────────
      const allIdsArr = [...allPlayerIds];
      if (!allIdsArr.length) { setLoading(false); return; }

      const [{ data: squadPlayers = [] }, { data: statsData = [] }] = await Promise.all([
        supabase.from('players').select('id, position, name, club').in('id', allIdsArr),
        activeFixtureIds.length
          ? supabase.from('player_match_stats')
              .select('player_id, fantasy_points, fixture_id')
              .in('player_id', allIdsArr)
          : Promise.resolve({ data: [] }),
      ]);

      // Build points per player from live fixture stats
      const liveFixtureSet = new Set(activeFixtureIds);
      const pointsPerPlayer = {};
      for (const s of statsData || []) {
        if (liveFixtureSet.has(s.fixture_id)) {
          pointsPerPlayer[s.player_id] = (pointsPerPlayer[s.player_id] || 0) + Number(s.fantasy_points);
        }
      }

      // Enrich squad (captain multiplier from first league squad)
      const { squadRow: primarySquad } = firstSquadRows[0] ?? {};
      const captainId = primarySquad?.captain_id;
      const isTriple  = primarySquad?.is_triple_captain;
      const enrichedSquad = (squadPlayers || []).map(p => {
        let pts = pointsPerPlayer[p.id] || 0;
        if (p.id === captainId) pts *= isTriple ? 3 : 2;
        return { ...p, points: pts };
      });
      setMySquadPlayers(enrichedSquad);

      const totalLive = enrichedSquad.slice(0, 11).reduce((sum, p) => sum + p.points, 0);
      setLiveScoreSum(Math.round(totalLive * 10) / 10);

      // ── 5. Match events — only my players, only live fixtures ─────────────────
      if (activeFixtureIds.length) {
        const { data: eventData = [] } = await supabase
          .from('match_events')
          .select('fixture_id, player_id, type, minute, team')
          .in('fixture_id', activeFixtureIds)
          .order('minute', { ascending: false })
          .limit(50);

        // Filter to my players only
        const myEvents = (eventData || []).filter(e => allPlayerIds.has(e.player_id));

        // Resolve player names
        const eventPlayerIds = [...new Set(myEvents.map(e => e.player_id).filter(Boolean))];
        const { data: eventPlayers = [] } = eventPlayerIds.length
          ? await supabase.from('players').select('id, name').in('id', eventPlayerIds)
          : { data: [] };
        const nameMap = Object.fromEntries((eventPlayers || []).map(p => [p.id, p.name]));

        setEvents(myEvents.map(e => ({
          ...e,
          playerName: nameMap[e.player_id] || 'Unknown',
          leagueName: isMultiLeague ? playerLeagueMap[e.player_id] : null,
        })));
      } else {
        setEvents([]);
      }

    } catch (err) {
      console.error('Live fetch error', err);
    } finally {
      setLoading(false);
    }
  };

  const projDisplay = projection ? formatProjectionDisplay(projection) : null;
  const timeAgo = lastRefreshed
    ? `${Math.floor((Date.now() - lastRefreshed.getTime()) / 1000)}s ago`
    : '—';

  return (
    <div className="min-h-screen bg-bg flex flex-col">

      {/* ── Header with live score top-right ────────────────────── */}
      <div
        className="sticky top-0 z-40 px-5 py-3 flex items-center justify-between"
        style={{
          background: 'rgba(13,17,23,0.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <div>
          <div className="fz-label" style={{ color: 'var(--mute)' }}>Match Day</div>
          <h1
            className="text-[22px] font-black uppercase leading-tight tracking-tight flex items-center gap-2"
            style={{ fontFamily: 'Archivo Black, sans-serif' }}
          >
            LIVE CENTER
            <span className="w-2 h-2 rounded-full bg-positive animate-live-pulse" />
          </h1>
        </div>

        {/* Live score badge — top right */}
        {!loading && (
          <div className="text-right">
            <div className="text-[9px] font-black uppercase tracking-widest mb-0.5" style={{ color: 'var(--mute)' }}>
              Live Pts
            </div>
            <div className="flex items-baseline gap-1.5 justify-end">
              <span
                className="text-[28px] font-black tabular-nums leading-none"
                style={{ fontFamily: 'Archivo Black, sans-serif', color: 'var(--paper)' }}
              >
                {liveScoreSum}
              </span>
              {projection && (
                <>
                  <span className="text-[14px] font-bold" style={{ color: 'var(--mute)' }}>→</span>
                  <span
                    className="text-[18px] font-black tabular-nums leading-none"
                    style={{ color: projDisplay?.color ?? 'var(--mute)', fontFamily: 'Archivo Black, sans-serif' }}
                  >
                    {projection.projected}
                  </span>
                </>
              )}
            </div>
            {projection && (
              <div className="text-[9px] mt-0.5" style={{ color: 'var(--mute)' }}>
                {projection.isStable ? `Stable · ${timeAgo}` : `${projDisplay?.label}`}
              </div>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="p-10 text-center text-xs font-semibold uppercase tracking-widest animate-pulse" style={{ color: 'var(--mute)' }}>
          Connecting to Live Feed...
        </div>
      ) : (
        <>
          {/* ── VAR banner ──────────────────────────────────────── */}
          <VARReviewBanner
            event={events[0]}
            isVisible={events[0]?.type === 'var'}
          />

          {/* ── Match ticker ─────────────────────────────────────── */}
          {liveFixtures.length > 0 && (
            <div className="py-3 border-b overflow-x-auto snap-x flex px-4 gap-3" style={{ borderColor: 'rgba(255,255,255,0.05)', background: 'var(--ink-2)' }}>
              {liveFixtures.map(f => {
                const pct    = Math.min(100, ((parseInt(f.minute) || 0) / 90) * 100);
                const hasVAR = events[0]?.type === 'var';
                return (
                  <div
                    key={f.id}
                    className="snap-center min-w-[200px] shrink-0 rounded-sm p-3 flex flex-col items-center relative overflow-hidden"
                    style={{
                      background: hasVAR ? 'rgba(255,179,0,0.08)' : 'rgba(34,197,94,0.06)',
                      border: hasVAR ? '1px solid rgba(255,179,0,0.4)' : '1px solid rgba(34,197,94,0.25)',
                    }}
                  >
                    <div className="absolute top-0 w-full h-[2px]" style={{ background: hasVAR ? '#FFB300' : 'var(--positive)' }} />
                    <div className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: hasVAR ? '#FFB300' : 'var(--positive)', fontFamily: 'Archivo Black, sans-serif' }}>
                      {hasVAR ? 'REVIEW' : `LIVE · ${f.minute}'`}
                    </div>
                    <div className="flex justify-between w-full font-bold text-sm mb-2">
                      <span className="truncate max-w-[40%]">{f.home_team.substring(0, 3).toUpperCase()}</span>
                      <span className="tabular-nums" style={{ color: 'var(--mute)' }}>{f.homeGoals ?? 0}–{f.awayGoals ?? 0}</span>
                      <span className="truncate max-w-[40%] text-right">{f.away_team.substring(0, 3).toUpperCase()}</span>
                    </div>
                    <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                      <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${pct}%`, background: 'var(--positive)', opacity: 0.6 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── No live matches ──────────────────────────────────── */}
          {liveFixtures.length === 0 && (
            <div className="px-5 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              <div className="text-[11px] font-semibold" style={{ color: 'var(--mute)' }}>No live matches right now</div>
            </div>
          )}

          {/* ── My squad (compact) ───────────────────────────────── */}
          {mySquadPlayers.length > 0 && (
            <div className="border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              <div className="px-5 pt-3 pb-1 flex items-center gap-2">
                <div className="w-[3px] h-4 rounded-full" style={{ background: 'var(--cyan)' }} />
                <span className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: 'var(--mute)', fontFamily: 'Archivo Black, sans-serif' }}>
                  My Squad
                </span>
              </div>
              <div className="grid grid-cols-2 gap-px" style={{ background: 'rgba(255,255,255,0.04)' }}>
                {mySquadPlayers.slice(0, 11).map((p, i) => {
                  const surname = p.name?.split(' ').slice(-1)[0]?.toUpperCase() ?? '?';
                  const posColor = p.position === 'GK' ? 'var(--pos-gk)' : p.position === 'DEF' ? 'var(--pos-def)' : p.position === 'MID' ? 'var(--pos-mid)' : 'var(--pos-fwd)';
                  return (
                    <div
                      key={p.id ?? i}
                      className="flex items-center gap-2 px-4 py-2"
                      style={{ background: 'var(--ink-2)' }}
                    >
                      <span className="text-[9px] font-black w-6 shrink-0" style={{ color: posColor, fontFamily: 'Archivo Black, sans-serif' }}>
                        {p.position}
                      </span>
                      <span className="text-[12px] font-bold flex-1 truncate" style={{ color: 'var(--paper)' }}>{surname}</span>
                      <span
                        className="text-[12px] font-black tabular-nums shrink-0"
                        style={{ color: p.points > 0 ? 'var(--positive)' : 'var(--mute)', fontFamily: 'Archivo Black, sans-serif' }}
                      >
                        {p.points > 0 ? `+${p.points}` : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Match events — my players only ───────────────────── */}
          <div className="px-5 pt-3 pb-1 flex items-center gap-2">
            <div className="w-[3px] h-4 rounded-full" style={{ background: 'var(--gold)' }} />
            <span className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: 'var(--mute)', fontFamily: 'Archivo Black, sans-serif' }}>
              Match Events
            </span>
            {multiLeague && (
              <span className="text-[9px] ml-1" style={{ color: 'var(--mute)' }}>· all leagues</span>
            )}
          </div>
          <EventTimeline events={events} loading={loading} />
        </>
      )}
    </div>
  );
}
