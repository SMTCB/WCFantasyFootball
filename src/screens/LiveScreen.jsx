import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
  calculateProjection,
  formatProjectionDisplay,
} from '../lib/projections';
import { useAuth } from '../hooks/useAuth';

import SectionHeader from '../components/SectionHeader';
import { EventTimeline } from '../components/EventTimeline';
import { VARReviewBanner } from '../components/VARReviewBanner';

// No mock data — screens show real DB data or empty states

// ─── Refresh interval: 5 minutes in ms ───────────────────────────────────────
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export default function LiveScreen() {
  const { user } = useAuth();
  const [loading,           setLoading]           = useState(true);
  const [liveFixtures,      setLiveFixtures]      = useState([]);
  const [scheduledFixtures, setScheduledFixtures] = useState([]);
  const [primaryLeague,     setPrimaryLeague]     = useState(null);
  const [rivals,            setRivals]            = useState([]);
  const [events,            setEvents]            = useState([]);
  const [currentUser,       setCurrentUser]       = useState(null);
  const [liveScoreSum,      setLiveScoreSum]      = useState(0);
  const [mySquadPlayers,    setMySquadPlayers]    = useState([]); // Real squad from DB

  // ── Projection state ───────────────────────────────────────────────────────
  const [projection,        setProjection]        = useState(null);   // { projected, trend, delta, isStable }
  const [lastRefreshed,     setLastRefreshed]     = useState(null);
  const prevProjectionRef = useRef(null);

  // ── Match minute (from first live fixture or mock) ─────────────────────────
  const matchMinute = useMemo(() => {
    if (liveFixtures.length > 0 && liveFixtures[0].minute) {
      return parseInt(liveFixtures[0].minute, 10) || 64;
    }
    return 64; // default for demo
  }, [liveFixtures]);

  useEffect(() => {
    fetchLiveData();
    // Refresh projection every 5 minutes
    const interval = setInterval(recalcProjection, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // Recalculate whenever live data or minute changes
  useEffect(() => {
    if (!loading) recalcProjection();
  }, [liveScoreSum, matchMinute, loading]);

  const recalcProjection = () => {
    if (mySquadPlayers.length === 0) return;
    
    const proj = calculateProjection(
      liveScoreSum,
      mySquadPlayers,
      matchMinute,
      prevProjectionRef.current
    );
    prevProjectionRef.current = proj.projected;
    setProjection(proj);
    setLastRefreshed(new Date());
  };

  const fetchLiveData = async () => {
    try {
      setLoading(true);
      const userId = user?.id;
      setCurrentUser({ id: userId });

      // 1. Fixtures — live + scheduled
      let { data: fixData } = await supabase
        .from('fixtures')
        .select('*')
        .in('status', ['live', 'scheduled', 'finished'])
        .order('kickoff_at', { ascending: true });
      if (!fixData || fixData.length === 0) fixData = [];

      const live = [], scheduled = [];
      (fixData || []).forEach(f => f.status === 'live' ? live.push(f) : scheduled.push(f));

      // 2. Goal counts per fixture (for score display in ticker)
      const activeFixtureIds = fixData.map(f => f.id);
      const { data: goalEvents } = await supabase
        .from('match_events')
        .select('fixture_id, team, type')
        .in('fixture_id', activeFixtureIds)
        .in('type', ['goal', 'own_goal']);

      // Build { fixtureId: { homeGoals, awayGoals } }
      const scoreMap = {};
      for (const f of fixData) {
        scoreMap[f.id] = { homeGoals: 0, awayGoals: 0 };
      }
      for (const ev of goalEvents || []) {
        const fix = fixData.find(f => f.id === ev.fixture_id);
        if (!fix || !scoreMap[ev.fixture_id]) continue;
        const isHome = ev.team === fix.home_team;
        const isOwn  = ev.type === 'own_goal';
        if (isHome && !isOwn || !isHome && isOwn) scoreMap[ev.fixture_id].homeGoals++;
        else scoreMap[ev.fixture_id].awayGoals++;
      }

      // Attach scores to fixtures
      const enrichedLive      = live.map(f => ({ ...f, ...scoreMap[f.id] }));
      const enrichedScheduled = scheduled.map(f => ({ ...f, ...scoreMap[f.id] }));
      setLiveFixtures(enrichedLive);
      setScheduledFixtures(enrichedScheduled);

      // 3. Primary League
      let { data: membersData } = await supabase
        .from('league_members')
        .select('league_id, rank, total_points, leagues(name)')
        .eq('user_id', userId)
        .order('rank', { ascending: true })
        .limit(1);

      if (!membersData || membersData.length === 0) {
        setPrimaryLeague(null);
        setRivals([]);
        setMySquadPlayers([]);
        setEvents([]);
        setLiveScoreSum(0);
        return;
      }

      const myLeague = membersData[0];
      setPrimaryLeague(myLeague);

      // 4. League rivals
      const { data: rivalData } = await supabase
        .from('league_members')
        .select('rank, total_points, user_id, users(username)')
        .eq('league_id', myLeague.league_id)
        .order('rank', { ascending: true });
      setRivals(rivalData || []);

      // 5. Latest squad (most-recent matchday)
      const { data: squadRow } = await supabase
        .from('squads')
        .select('id, players, captain_id, is_triple_captain, matchday_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const squadPlayerIds = squadRow?.players || [];

      // 6. Player details + match stats in parallel
      const [{ data: squadPlayers }, { data: statsData }, { data: eventData }] = await Promise.all([
        supabase.from('players').select('id, position, name, club').in('id', squadPlayerIds.length ? squadPlayerIds : ['__none__']),
        // Points from player_match_stats for this matchday's fixtures
        supabase.from('player_match_stats')
          .select('player_id, fantasy_points, fixture_id')
          .in('player_id', squadPlayerIds.length ? squadPlayerIds : ['__none__']),
        // Recent match events — player names via separate lookup below
        supabase.from('match_events')
          .select('fixture_id, player_id, type, minute, team')
          .in('fixture_id', activeFixtureIds)
          .order('minute', { ascending: false })
          .limit(30),
      ]);

      // Resolve player names for event feed
      const eventPlayerIds = [...new Set((eventData || []).map(e => e.player_id).filter(Boolean))];
      const { data: eventPlayers } = eventPlayerIds.length
        ? await supabase.from('players').select('id, name').in('id', eventPlayerIds)
        : { data: [] };
      const playerNameMap = Object.fromEntries((eventPlayers || []).map(p => [p.id, p.name]));

      const enrichedEvents = (eventData || []).map(e => ({
        ...e,
        playerName: playerNameMap[e.player_id] || 'Unknown',
      }));
      setEvents(enrichedEvents);

      // 7. Compute live score from real player_match_stats
      const matchdayFixtureIds = new Set(
        (fixData || []).filter(f => f.id.startsWith(squadRow?.matchday_id || '')).map(f => f.id)
      );
      const pointsPerPlayer = {};
      for (const s of statsData || []) {
        if (matchdayFixtureIds.has(s.fixture_id)) {
          pointsPerPlayer[s.player_id] = (pointsPerPlayer[s.player_id] || 0) + Number(s.fantasy_points);
        }
      }

      // Enrich squad players with points + captain multiplier
      const captainId = squadRow?.captain_id;
      const isTriple  = squadRow?.is_triple_captain;
      const enrichedSquad = (squadPlayers || []).map(p => {
        let pts = pointsPerPlayer[p.id] || 0;
        if (p.id === captainId) pts *= isTriple ? 3 : 2;
        return { ...p, points: pts };
      });
      setMySquadPlayers(enrichedSquad);

      const totalLive = enrichedSquad.slice(0, 11).reduce((sum, p) => sum + p.points, 0);
      setLiveScoreSum(Math.round(totalLive * 10) / 10);

    } catch (err) {
      console.error('Live fetch error', err);
    } finally {
      setLoading(false);
    }
  };

  // ── Projection display helpers ─────────────────────────────────────────────
  const projDisplay = projection ? formatProjectionDisplay(projection) : null;

  const timeAgo = lastRefreshed
    ? `${Math.floor((Date.now() - lastRefreshed.getTime()) / 1000)}s ago`
    : '—';

  return (
    <div className="min-h-screen bg-bg flex flex-col">

        {/* ── Header ──────────────────────────────────────── */}
        <div className="bg-surface border-b border-border sticky top-0 z-40 px-5 py-3">
          <div className="fz-label text-text-tertiary">Match Day</div>
          <h1 className="fz-display text-[22px] text-white flex items-center gap-3 leading-tight">
            LIVE CENTER
            <span className="w-2 h-2 rounded-full bg-positive animate-live-pulse" />
          </h1>
        </div>

        {loading ? (
          <div className="p-10 text-center text-xs font-semibold text-text-tertiary uppercase tracking-widest animate-pulse">
            Connecting to Live Feed...
          </div>
        ) : (
          <>
            {/* ── VAR REVIEW BANNER ─────────────────────────────── */}
            <VARReviewBanner
              event={events[0]}
              isVisible={events[0]?.type === 'var'}
            />
            
            {/* ── Match Ticker ─────────────────────────────── */}
            <div className="py-4 bg-[#111] border-b border-white/5 overflow-x-auto snap-x flex px-4 gap-3">
              {liveFixtures.length === 0 && scheduledFixtures.length === 0 && (
                <div className="text-xs text-text-secondary w-full text-center py-2 uppercase tracking-widest font-semibold">
                  No matches today. <a href="/admin" className="text-white underline">Trigger Simulation</a>
                </div>
              )}

              {liveFixtures.map(f => {
                const pct = Math.min(100, ((parseInt(f.minute) || 0) / 90) * 100);
                const hasVAR = events[0]?.type === 'var';
                return (
                  <div
                    key={f.id}
                    className="snap-center min-w-[200px] shrink-0 rounded-sm p-3 flex flex-col items-center relative overflow-hidden transition-colors"
                    style={{
                      background: hasVAR ? 'rgba(255,179,0,0.08)' : 'rgb(10,26,10)',
                      border: hasVAR ? '1px solid rgba(255,179,0,0.4)' : '1px solid rgba(34,197,94,0.3)',
                    }}
                  >
                    {/* Top indicator line */}
                    <div
                      className="absolute top-0 w-full h-[2px]"
                      style={{
                        background: hasVAR ? '#FFB300' : 'var(--positive)',
                        animation: hasVAR ? 'pulse 1s ease-in-out infinite' : 'pulse 2s ease-in-out infinite',
                      }}
                    />

                    {/* VAR indicator badge */}
                    {hasVAR && (
                      <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-sm bg-[#FFB300] text-[#1a1100]">
                        <span className="text-[10px]">⚠️</span>
                        <span className="text-[9px] font-black uppercase tracking-wider">VAR</span>
                      </div>
                    )}

                    <div
                      className="text-[10px] font-black uppercase tracking-widest mb-2"
                      style={{ color: hasVAR ? '#FFB300' : 'var(--positive)' }}
                    >
                      {hasVAR ? 'REVIEW' : `LIVE • ${f.minute}'`}
                    </div>
                    <div className="flex justify-between w-full font-bold text-sm mb-3">
                      <span className="truncate max-w-[40%]">{f.home_team.substring(0, 3).toUpperCase()}</span>
                      <span className="tabular-nums text-white/60">{f.homeGoals ?? 0} – {f.awayGoals ?? 0}</span>
                      <span className="truncate max-w-[40%] text-right">{f.away_team.substring(0, 3).toUpperCase()}</span>
                    </div>
                    {/* Match progress bar */}
                    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-positive/60 rounded-full transition-all duration-1000"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="text-[9px] text-text-tertiary font-semibold mt-1">{pct.toFixed(0)}% played</div>
                  </div>
                );
              })}

              {/* Scheduled fixtures are not shown in the live ticker */}
            </div>

            {!primaryLeague ? (
              <div className="p-8 text-center text-xs text-text-secondary">Join a league to view Rival Impact.</div>
            ) : (
              <>
                {/* ── MY SCORE + PROJECTION PANEL ─────────────── */}
                <div className="px-4 py-5 border-b border-white/5 bg-[#0a0a0a]">
                  <div className="text-[9px] font-black uppercase tracking-[0.2em] text-text-tertiary mb-4">
                    {primaryLeague.leagues?.name}
                  </div>

                  {/* Score row */}
                  <div className="flex items-start justify-between">
                    {/* Live score */}
                    <div>
                      <div className="text-[9px] text-text-tertiary font-black uppercase tracking-widest mb-1">Live Points</div>
                      <div className="text-5xl font-black tabular-nums leading-none text-white">
                        {liveScoreSum}
                      </div>
                      <div className="text-[11px] text-text-tertiary mt-1 font-semibold">
                        Season total: {primaryLeague.total_points}
                      </div>
                    </div>

                    {/* Projection card */}
                    {projection && (
                      <div className="text-right">
                        <div className="text-[9px] text-text-tertiary font-black uppercase tracking-widest mb-1">Projected FT</div>
                        <div className="flex items-baseline gap-1.5 justify-end">
                          <span
                            className="text-4xl font-black tabular-nums leading-none"
                            style={{ color: projDisplay?.color ?? '#fff', opacity: 0.85 }}
                          >
                            {projection.projected}
                          </span>
                          <span
                            className="text-xl font-black"
                            style={{ color: projDisplay?.color ?? '#9e9e9e' }}
                          >
                            {projDisplay?.arrow}
                          </span>
                        </div>
                        {!projection.isStable && (
                          <div
                            className="text-[10px] font-bold mt-1"
                            style={{ color: projDisplay?.color }}
                          >
                            {projDisplay?.arrow} {projDisplay?.label}
                          </div>
                        )}
                        {projection.isStable && (
                          <div className="text-[10px] font-bold mt-1 text-text-tertiary">Stable ·&nbsp;
                            <span className="opacity-60">{timeAgo}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Projection bar — visual live → projected gap */}
                  {projection && (
                    <div className="mt-5">
                      <div className="flex justify-between text-[9px] text-text-tertiary font-bold mb-1.5 uppercase tracking-wider">
                        <span>Live</span>
                        <span>Projected FT</span>
                      </div>
                      <div className="relative w-full h-2 bg-white/5 rounded-full overflow-hidden">
                        {/* Live portion — white */}
                        <div
                          className="absolute h-full bg-white rounded-full transition-all duration-700"
                          style={{ width: `${Math.min(100, (liveScoreSum / Math.max(projection.projected, 1)) * 100)}%` }}
                        />
                        {/* Projected portion — green ghost */}
                        <div
                          className="absolute h-full rounded-full transition-all duration-700"
                          style={{
                            left: `${Math.min(100, (liveScoreSum / Math.max(projection.projected, 1)) * 100)}%`,
                            right: '0',
                            backgroundColor: projDisplay?.color ?? '#22c55e',
                            opacity: 0.25,
                          }}
                        />
                      </div>
                      <div className="text-[9px] text-text-tertiary font-semibold mt-1.5 text-right">
                        +{projection.projected - liveScoreSum} pts projected remaining · {90 - matchMinute}' left
                      </div>
                    </div>
                  )}
                </div>

                {/* ── RIVAL WATCH + PROJECTIONS ─────────────────── */}
                <SectionHeader title="RIVAL WATCH" />
                <div className="bg-[#0d0d0d] border-b border-white/5">
                  {rivals.map((r, i) => {
                    const isMe = r.user_id === currentUser?.id || r.username === 'You';
                    const livePts = isMe ? liveScoreSum : (r.livePoints ?? 0);
                    const projAdd = isMe
                      ? (projection ? projection.projected - liveScoreSum : 0)
                      : (r.projectedAdd ?? 0);
                    const projTotal = (r.total_points ?? 0) + livePts + projAdd;

                    return (
                      <div
                        key={r.user_id ?? i}
                        className={`grid grid-cols-[28px_1fr_auto_auto] gap-x-3 px-4 py-3.5 items-center border-b border-white/5 ${isMe ? 'bg-white/5' : ''}`}
                      >
                        {/* Rank */}
                        <div className="text-[12px] font-black tabular-nums text-text-tertiary">{r.rank ?? i + 1}</div>

                        {/* Name */}
                        <div className="min-w-0">
                          <div className={`text-[13px] font-bold truncate ${isMe ? 'text-white' : 'text-text-secondary'}`}>
                            {isMe ? 'You' : (r.users?.username ?? r.username)}
                          </div>
                          {/* Projection sub-label */}
                          <div className="text-[10px] text-text-tertiary font-semibold">
                            {livePts > 0 ? `+${livePts} live` : 'no events'}&nbsp;·&nbsp;
                            <span className="text-[#22c55e] opacity-70">→ {projTotal} proj.</span>
                          </div>
                        </div>

                        {/* Live pts pill */}
                        <div className={`text-[11px] font-black tabular-nums px-2 py-0.5 rounded-sm ${livePts > 0 ? 'text-positive bg-positive/10' : 'text-text-tertiary'}`}>
                          {livePts > 0 ? `+${livePts}` : '—'}
                        </div>

                        {/* Season total */}
                        <div className="text-[13px] font-black tabular-nums text-right w-12">
                          {r.total_points ?? 0}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ── MY SQUAD BREAKDOWN ──────────────────────── */}
                {mySquadPlayers.length > 0 && (
                  <>
                    <SectionHeader title="MY SQUAD" />
                    <div className="bg-[#0d0d0d] border-b border-white/5">
                      {['GK', 'DEF', 'MID', 'FWD'].map(pos => {
                        const posPlayers = mySquadPlayers.filter(p => p.position === pos);
                        if (!posPlayers.length) return null;
                        const posColor = pos === 'GK' ? 'var(--pos-gk)' : pos === 'DEF' ? 'var(--pos-def)' : pos === 'MID' ? 'var(--pos-mid)' : 'var(--pos-fwd)';
                        return (
                          <div key={pos}>
                            <div style={{ padding: '8px 16px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                              <span style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 9, color: posColor, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{pos}</span>
                            </div>
                            {posPlayers.map((p, i) => {
                              const surname = p.name?.split(' ').slice(-1)[0]?.toUpperCase() ?? p.name?.toUpperCase() ?? '?';
                              const isStarter = mySquadPlayers.indexOf(p) < 11;
                              return (
                                <div
                                  key={p.id ?? i}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '9px 16px',
                                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                                    background: isStarter ? 'transparent' : 'rgba(255,255,255,0.015)',
                                    borderLeft: isStarter ? '2px solid var(--cyan)' : '2px solid transparent',
                                    opacity: isStarter ? 1 : 0.6,
                                  }}
                                >
                                  {/* Status dot */}
                                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--positive)', flexShrink: 0 }} />
                                  {/* Name + club */}
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 13, color: 'var(--paper)', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{surname}</div>
                                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8, color: 'var(--mute)', letterSpacing: '0.12em', marginTop: 1 }}>{(p.club ?? '').substring(0, 3).toUpperCase()}{!isStarter ? ' · SUB' : ''}</div>
                                  </div>
                                  {/* Points */}
                                  <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 16, color: p.points > 0 ? 'var(--positive)' : 'var(--mute)', letterSpacing: '-0.02em', flexShrink: 0, minWidth: 28, textAlign: 'right' }}>
                                    {p.points > 0 ? `+${p.points}` : '—'}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {/* ── MATCH EVENTS TIMELINE ─────────────────────────────── */}
                <SectionHeader title="MATCH EVENTS" />
                <EventTimeline events={events} loading={loading} />
              </>
            )}
          </>
        )}

    </div>
  );
}
