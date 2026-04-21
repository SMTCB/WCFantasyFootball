import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
  calculateProjection,
  formatProjectionDisplay,
} from '../lib/projections';
import { normalisePlayers } from '../lib/players';
import { useAuth } from '../hooks/useAuth';

import SectionHeader from '../components/SectionHeader';

// ─── Mock data for Demo Mode ───────────────────────────────────────────────
const MOCK_LIVE_FIXTURES = [
  { id: 'mock-1', home_team: 'Brazil', away_team: 'Korea', status: 'live', minute: '64' },
  { id: 'mock-2', home_team: 'France', away_team: 'England', status: 'scheduled', kickoff_at: new Date().toISOString() },
];

const MOCK_EVENTS = [
  { type: 'var',   minute: '63', team: 'BRA', players: { name: 'Vinícius Júnior' } },
  { type: 'goal',  minute: '55', team: 'KOR', players: { name: 'Son Heung-min' } },
  { type: 'goal',  minute: '12', team: 'BRA', players: { name: 'Richarlison' } },
  { type: 'yellow', minute: '28', team: 'BRA', players: { name: 'Casemiro' } },
];

const MOCK_RIVALS = [
  { rank: 1, user_id: 'r1', username: 'Ricardo', total_points: 218, livePoints: 12, projectedAdd: 8, users: { username: 'Ricardo' } },
  { rank: 2, user_id: 'me', username: 'You',     total_points: 205, livePoints: null, projectedAdd: null, users: { username: 'You' } },
  { rank: 3, user_id: 'r2', username: 'João',    total_points: 190, livePoints: 6,  projectedAdd: 5, users: { username: 'João' } },
  { rank: 4, user_id: 'r3', username: 'Ana',     total_points: 178, livePoints: 9,  projectedAdd: 4, users: { username: 'Ana' } },
];

const MOCK_SQUAD_PLAYERS = normalisePlayers([
  { id: 'p1', name: 'Alisson', club: 'BRA', position: 'GK' },
  { id: 'p2', name: 'Thiago Silva', club: 'BRA', position: 'DEF' },
  { id: 'p3', name: 'Casemiro', club: 'BRA', position: 'MID' },
  { id: 'p4', name: 'Neymar', club: 'BRA', position: 'FWD' },
]);

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

      // 1. Fetch Fixtures
      let { data: fixData } = await supabase
        .from('fixtures')
        .select('*')
        .in('status', ['live', 'scheduled'])
        .order('kickoff_at', { ascending: true });
      
      // Fallback to mock fixtures if DB empty
      if (!fixData || fixData.length === 0) {
        fixData = MOCK_LIVE_FIXTURES;
      }

      const live = [], scheduled = [];
      (fixData || []).forEach(f => f.status === 'live' ? live.push(f) : scheduled.push(f));
      setLiveFixtures(live);
      setScheduledFixtures(scheduled);

      // 2. Primary League
      let { data: membersData } = await supabase
        .from('league_members')
        .select('league_id, rank, total_points, leagues(name)')
        .eq('user_id', userId)
        .order('rank', { ascending: true })
        .limit(1);

      if (!membersData || membersData.length === 0) {
        // Mock fallback for league context
        setPrimaryLeague({ total_points: 205, leagues: { name: 'World Cup Official (Demo)' } });
        setRivals(MOCK_RIVALS);
        setMySquadPlayers(MOCK_SQUAD_PLAYERS);
        setEvents(MOCK_EVENTS);
        
        const fakeScore = MOCK_EVENTS.reduce((acc, curr) =>
          curr.type === 'goal' ? acc + 5 : curr.type === 'yellow' ? acc - 1 : acc, 0);
        setLiveScoreSum(Math.max(0, fakeScore));
      } else {
        const myLeague = membersData[0];
        setPrimaryLeague(myLeague);

        // Fetch league rivals
        const { data: rivalData } = await supabase
          .from('league_members')
          .select('rank, total_points, user_id, users(username)')
          .eq('league_id', myLeague.league_id)
          .order('rank', { ascending: true });

        setRivals(rivalData?.length > 0 ? rivalData : MOCK_RIVALS);

        // 3. Fetch My Squad (for Projections)
        const { data: squadData } = await supabase
          .from('squads')
          .select('players')
          .eq('user_id', userId)
          .maybeSingle();

        if (squadData?.players?.length > 0) {
          const { data: squadPlayers } = await supabase
            .from('players')
            .select('id, position, name, club')
            .in('id', squadData.players);
          
          setMySquadPlayers(squadPlayers || MOCK_SQUAD_PLAYERS);
        } else {
          setMySquadPlayers(MOCK_SQUAD_PLAYERS);
        }

        // 4. Match Events
        const { data: eventData } = await supabase
          .from('match_events')
          .select('type, minute, team, players(name)')
          .order('created_at', { ascending: false })
          .limit(20);

        const latestEvents = eventData?.length > 0 ? eventData : MOCK_EVENTS;
        setEvents(latestEvents);

        // 5. Live score from events
        const realOrFakeEvents = eventData?.length > 0 ? eventData : MOCK_EVENTS;
        const fakeScore = realOrFakeEvents.reduce((acc, curr) =>
          curr.type === 'goal' ? acc + 5 : curr.type === 'yellow' ? acc - 1 : acc, 0);
        setLiveScoreSum(Math.max(0, fakeScore));
      }

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
            {/* ── VAR CHECK BANNER ───────────────────────────── */}
            {events[0]?.type === 'var' && (
              <div className="bg-[#1a1100] border-l-4 border-[#FFB300] py-3 px-4 flex items-center gap-3">
                 <div className="text-2xl animate-pulse">📺</div>
                 <div>
                    <div className="text-[10px] font-black text-[#FFB300] uppercase tracking-[0.15em] mb-0.5">VAR Review in Progress</div>
                    <div className="text-[12px] font-bold text-white">Goal Check: {events[0].players?.name}</div>
                    <div className="text-[9px] text-[#9E9E9E] mt-0.5">Projections locked until review completes.</div>
                 </div>
              </div>
            )}
            
            {/* ── Match Ticker ─────────────────────────────── */}
            <div className="py-4 bg-[#111] border-b border-white/5 overflow-x-auto snap-x flex px-4 gap-3">
              {liveFixtures.length === 0 && scheduledFixtures.length === 0 && (
                <div className="text-xs text-text-secondary w-full text-center py-2 uppercase tracking-widest font-semibold">
                  No matches today. <a href="/admin" className="text-white underline">Trigger Simulation</a>
                </div>
              )}

              {liveFixtures.map(f => {
                const pct = Math.min(100, ((parseInt(f.minute) || 0) / 90) * 100);
                return (
                  <div key={f.id} className="snap-center min-w-[200px] shrink-0 bg-[#0a1a0a] border border-positive/30 rounded-sm p-3 flex flex-col items-center relative overflow-hidden">
                    <div className="absolute top-0 w-full h-[2px] bg-positive animate-pulse" />
                    <div className="text-[10px] font-black text-positive uppercase tracking-widest mb-2">LIVE • {f.minute}'</div>
                    <div className="flex justify-between w-full font-bold text-sm mb-3">
                      <span className="truncate max-w-[40%]">{f.home_team.substring(0, 3).toUpperCase()}</span>
                      <span className="tabular-nums text-white/60">0 – 0</span>
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

              {scheduledFixtures.map(f => (
                <div key={f.id} className="snap-center min-w-[160px] shrink-0 bg-[#0d0d0d] border border-white/5 rounded-sm p-3 flex flex-col items-center">
                  <div className="text-[10px] font-semibold text-text-secondary uppercase tracking-widest mb-2">UPCOMING</div>
                  <div className="flex justify-between w-full font-bold text-xs text-text-secondary">
                    <span className="truncate max-w-[40%]">{f.home_team.substring(0, 3).toUpperCase()}</span>
                    <span className="mx-2">vs</span>
                    <span className="truncate max-w-[40%] text-right">{f.away_team.substring(0, 3).toUpperCase()}</span>
                  </div>
                </div>
              ))}
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
                  {(rivals.length > 0 ? rivals : MOCK_RIVALS).map((r, i) => {
                    const isMe = r.user_id === currentUser?.id || r.username === 'You';
                    const livePts = isMe ? liveScoreSum : (MOCK_RIVALS[i % MOCK_RIVALS.length]?.livePoints ?? 0);
                    const projAdd = isMe
                      ? (projection ? projection.projected - liveScoreSum : 0)
                      : (MOCK_RIVALS[i % MOCK_RIVALS.length]?.projectedAdd ?? 0);
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

                {/* ── ACTIVITY LOG ─────────────────────────────── */}
                <SectionHeader title="ACTIVITY LOG" />
                <div className="bg-[#0d0d0d]">
                  {events.map((e, i) => {
                    const isVar = e.type === 'var';
                    return (
                      <div
                        key={i}
                        className={`flex px-4 py-3.5 border-b gap-3 items-center ${isVar ? 'border-[#FFB300]/30 bg-[#FFB300]/5' : 'border-white/5'}`}
                        style={{ animationDelay: `${i * 40}ms` }}
                      >
                        <div className="w-8 flex justify-center shrink-0 text-xl">
                          {e.type === 'goal'   && '⚽'}
                          {e.type === 'yellow' && '🟨'}
                          {e.type === 'red'    && '🟥'}
                          {e.type === 'sub'    && '↕️'}
                          {isVar               && '📺'}
                        </div>
                        <div className="flex-1 min-w-0">
                          {isVar ? (
                            <>
                              <div className="text-[13px] font-bold truncate leading-tight text-[#FFB300] animate-pulse">UNDER REVIEW</div>
                              <div className="text-[11px] text-[#9E9E9E] truncate">Goal Check — {e.players?.name} ({e.team})</div>
                            </>
                          ) : (
                            <>
                              <div className="text-[13px] font-bold truncate leading-tight">{e.players?.name}</div>
                              <div className="text-[11px] text-text-tertiary truncate">{e.team}</div>
                            </>
                          )}
                        </div>
                        <div className="shrink-0 text-right flex flex-col items-end gap-0.5">
                          {isVar ? (
                            <div className="text-[13px] font-black tabular-nums text-[#FFB300]">...</div>
                          ) : (
                            <div className={`text-[13px] font-black tabular-nums ${e.type === 'goal' ? 'text-positive' : e.type === 'red' ? 'text-negative' : 'text-yellow-400'}`}>
                              {e.type === 'goal' ? '+6' : e.type === 'yellow' ? '−1' : e.type === 'red' ? '−3' : ''}
                            </div>
                          )}
                          <div className="text-[10px] font-black text-white/30 uppercase tracking-widest">{e.minute}'</div>
                        </div>
                      </div>
                    );
                  })}
                  {events.length === 0 && (
                    <div className="p-8 text-center text-xs text-text-tertiary font-bold uppercase tracking-widest">
                      Awaiting Kickoff...
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}

    </div>
  );
}
