import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

/* ── Team accent colours (rough national palette) ──────────────── */
const TEAM_COLORS = {
  Arsenal:      { primary: '#EF0107', secondary: '#9C824A' },
  Chelsea:      { primary: '#034694', secondary: '#DBA111' },
  'Man City':   { primary: '#6CABDD', secondary: '#1C2C5B' },
  Liverpool:    { primary: '#C8102E', secondary: '#F6EB61' },
  Spurs:        { primary: '#132257', secondary: '#FFFFFF' },
  'Man Utd':    { primary: '#DA291C', secondary: '#FBE122' },
  'Aston Villa':{ primary: '#670E36', secondary: '#95BFE5' },
  Newcastle:    { primary: '#241F20', secondary: '#41B6E6' },
  Brighton:     { primary: '#0057B8', secondary: '#FFCD00' },
  'West Ham':   { primary: '#7A263A', secondary: '#1BB1E7' },
  Everton:      { primary: '#003399', secondary: '#FFFFFF' },
  Wolves:       { primary: '#FDB913', secondary: '#231F20' },
  default:      { primary: '#1C2333', secondary: 'var(--mute)' },
};

const getTeamColor = (name) => TEAM_COLORS[name] || TEAM_COLORS.default;

export default function HomeScreen() {
  const { user } = useAuth();
  const [fixtures,        setFixtures]        = useState([]);
  const [recap,           setRecap]           = useState(null);
  const [loading,         setLoading]         = useState(true);
  const [currentMatchday, setCurrentMatchday] = useState(null);
  const [competitionName, setCompetitionName] = useState('');

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const userId = user?.id;
      await Promise.all([
        fetchCompetitionContext(userId),
        fetchFixtures(),
        fetchLatestRecap(userId),
      ]);

    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchInitialData(); }, [user]);

  useEffect(() => {
    const channel = supabase
      .channel('home-fixtures')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fixtures' }, () => {
        fetchFixtures();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Derive competition name + current matchday from user's league → tournament → fixtures
  const fetchCompetitionContext = async (userId) => {
    try {
      if (!userId) return;
      // Get user's first league
      const { data: membership } = await supabase
        .from('league_members')
        .select('leagues(tournament_id)')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();

      const tournamentId = membership?.leagues?.tournament_id;
      if (!tournamentId) return;

      // Load tournament name
      const { data: tournament } = await supabase
        .from('tournaments')
        .select('name')
        .eq('forza_id', tournamentId)
        .maybeSingle();

      if (tournament?.name) setCompetitionName(tournament.name);

      // Derive current matchday from the latest round in fixtures
      const { data: latestFixture } = await supabase
        .from('fixtures')
        .select('round')
        .eq('tournament_id', tournamentId)
        .order('round', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestFixture?.round != null) setCurrentMatchday(latestFixture.round);
    } catch (err) { console.error('[competition context]', err); }
  };

  const fetchFixtures = async () => {
    const { data } = await supabase.from('fixtures').select('*').order('kickoff_at', { ascending: true });
    if (!data || data.length === 0) {
      // Generic placeholder fixtures — no club names hardcoded
      setFixtures([
        { id: 'f1', home_team: 'Home Team',  away_team: 'Away Team', status: 'scheduled', kickoff_at: new Date(Date.now() + 1000*60*60*2).toISOString(), competition: 'Matchday 1' },
        { id: 'f2', home_team: 'Home Team',  away_team: 'Away Team', status: 'scheduled', kickoff_at: new Date(Date.now() + 1000*60*60*4).toISOString(), competition: 'Matchday 1' },
      ]);
      return;
    }
    setFixtures(data);
  };

  const fetchLatestRecap = async (userId) => {
    try {
      const { data } = await supabase.from('matchday_recaps').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (data) setRecap(data);
    } catch (err) { console.error('[recap]', err); }
  };

  const liveCount = fixtures.filter(f => f.status === 'live').length;

  /* ── Match Card ───────────────────────────────────────────── */
  const MatchCard = ({ match }) => {
    const cfg     = match.status;
    const homeCol = getTeamColor(match.home_team);
    const awayCol = getTeamColor(match.away_team);
    const isLive  = cfg === 'live';
    const isDone  = cfg === 'finished';
    const kickoff = match.kickoff_at
      ? new Date(match.kickoff_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      : '—';

    return (
      <div
        className="relative overflow-hidden transition-all duration-200 active:scale-[0.99]"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Subtle team colour gradient backdrop */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(90deg,
              ${homeCol.primary}14 0%,
              transparent 35%,
              transparent 65%,
              ${awayCol.primary}14 100%
            )`,
          }}
        />

        <div className="relative flex items-center px-4 py-3.5 gap-3">

          {/* Status indicator */}
          <div className="shrink-0 w-14 flex flex-col items-center gap-1">
            {isLive ? (
              <>
                <div
                  className="flex items-center gap-1 px-2 py-0.5 rounded-sm"
                  style={{ background: 'rgba(240,58,58,0.15)' }}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-negative animate-live-pulse shrink-0" />
                  <span
                    className="text-[9px] font-black tracking-wider"
                    style={{ color: 'var(--danger)', fontFamily: 'Archivo Black, sans-serif' }}
                  >
                    LIVE
                  </span>
                </div>
                <span
                  className="text-[11px] font-black tabular-nums"
                  style={{ color: 'var(--danger)', fontFamily: 'Archivo Black, sans-serif' }}
                >
                  {match.minute}'
                </span>
              </>
            ) : isDone ? (
              <span
                className="text-[9px] font-black tracking-widest px-1.5 py-0.5 rounded-sm"
                style={{ color: 'var(--mute)', background: 'rgba(61,75,92,0.15)', fontFamily: 'Archivo Black, sans-serif' }}
              >
                FT
              </span>
            ) : (
              <span
                className="text-[11px] font-bold tabular-nums"
                style={{ color: 'var(--mute)', fontFamily: 'Archivo, sans-serif' }}
              >
                {kickoff}
              </span>
            )}
          </div>

          {/* Home team */}
          <div className="flex-1 min-w-0 text-right">
            <div
              className="text-[14px] font-bold truncate leading-tight"
              style={{ color: isDone || isLive ? 'var(--paper)' : 'var(--mute)', fontFamily: 'Archivo, sans-serif' }}
            >
              {match.home_team}
            </div>
            <div
              className="text-[9px] font-semibold uppercase tracking-widest mt-0.5"
              style={{ color: 'var(--mute)' }}
            >
              {match.home_team.substring(0, 3).toUpperCase()}
            </div>
          </div>

          {/* Score / VS */}
          <div className="shrink-0 flex flex-col items-center min-w-[56px]">
            {isDone || isLive ? (
              <div
                className="text-[22px] font-black tabular-nums leading-none px-1"
                style={{
                  fontFamily: 'Archivo Black, sans-serif',
                  color: isLive ? 'var(--paper)' : 'var(--mute)',
                  letterSpacing: '0.05em',
                }}
              >
                {match.home_score ?? match.scores?.home ?? (isLive ? 0 : '?')}
                <span style={{ color: 'var(--mute)', margin: '0 3px' }}>–</span>
                {match.away_score ?? match.scores?.away ?? (isLive ? 0 : '?')}
              </div>
            ) : (
              <div
                className="text-[13px] font-bold"
                style={{ color: 'var(--mute)', fontFamily: 'Archivo Black, sans-serif', letterSpacing: '0.1em' }}
              >
                VS
              </div>
            )}
          </div>

          {/* Away team */}
          <div className="flex-1 min-w-0 text-left">
            <div
              className="text-[14px] font-bold truncate leading-tight"
              style={{ color: isDone || isLive ? 'var(--paper)' : 'var(--mute)', fontFamily: 'Archivo, sans-serif' }}
            >
              {match.away_team}
            </div>
            <div
              className="text-[9px] font-semibold uppercase tracking-widest mt-0.5"
              style={{ color: 'var(--mute)' }}
            >
              {match.away_team.substring(0, 3).toUpperCase()}
            </div>
          </div>

          {/* Right accent line for live matches */}
          {isLive && (
            <div
              className="absolute right-0 top-2 bottom-2 w-[2.5px] rounded-l-full"
              style={{ background: 'var(--danger)' }}
            />
          )}
        </div>
      </div>
    );
  };

  /* ── Main render ──────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-bg">

      {/* ── Page Header ──────────────────────────────────────── */}
      <div
        className="sticky top-0 z-30 px-5 py-3 flex items-center justify-between"
        style={{
          background: 'rgba(13,17,23,0.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <div>
          <div className="fz-label" style={{ color: 'var(--mute)' }}>{competitionName || 'Fantasy League'}</div>
          <div
            className="text-[24px] font-black uppercase leading-tight tracking-tight"
            style={{ fontFamily: 'Archivo Black, sans-serif', color: 'var(--paper)' }}
          >
            Match Centre
          </div>
        </div>

      </div>

      {/* ── Two-column desktop layout ─────────────────────────── */}
      <div className="flex flex-col lg:flex-row">

        {/* ══ LEFT — Fixtures ══════════════════════════════════ */}
        <div className="flex-1 min-w-0">

          {/* Section label */}
          <div
            className="px-5 pt-4 pb-2 flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <div className="w-[3px] h-4 rounded-full" style={{ background: 'var(--cyan)' }} />
              <span
                className="text-[11px] font-bold uppercase tracking-[0.18em]"
                style={{ color: 'var(--mute)', fontFamily: 'Archivo Black, sans-serif' }}
              >
                {currentMatchday != null ? `Matchday ${currentMatchday} · Fixtures` : 'Fixtures'}
              </span>
            </div>
            {liveCount > 0 && (
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(240,58,58,0.12)' }}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-negative animate-live-pulse" />
                <span
                  className="text-[9px] font-black tracking-widest"
                  style={{ color: 'var(--danger)', fontFamily: 'Archivo Black, sans-serif' }}
                >
                  {liveCount} LIVE
                </span>
              </div>
            )}
          </div>

          {loading ? (
            <div className="divide-y divide-border">
              {[1, 2, 3].map(i => (
                <div key={i} className="px-4 py-4 flex items-center gap-3">
                  <div className="w-14 h-8 rounded animate-shimmer" />
                  <div className="flex-1 h-5 rounded animate-shimmer" />
                  <div className="w-12 h-6 rounded animate-shimmer" />
                  <div className="flex-1 h-5 rounded animate-shimmer" />
                </div>
              ))}
            </div>
          ) : fixtures.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-4xl mb-4 opacity-20">🏟️</div>
              <p className="text-sm font-medium" style={{ color: 'var(--mute)' }}>No matches scheduled.</p>
            </div>
          ) : (
            <div>
              {fixtures.map(match => <MatchCard key={match.id} match={match} />)}
            </div>
          )}
        </div>

        {/* ══ RIGHT — Widgets ══════════════════════════════════ */}
        <div
          className="lg:w-[300px] shrink-0"
          style={{ borderLeft: '1px solid rgba(255,255,255,0.06)' }}
        >

          {/* Recap Teaser */}
          {recap && (
            <div className="px-4 pb-2 pt-2">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-[3px] h-4 rounded-full" style={{ background: 'var(--gold)' }} />
                <span
                  className="text-[11px] font-bold uppercase tracking-[0.18em]"
                  style={{ color: 'var(--mute)', fontFamily: 'Archivo Black, sans-serif' }}
                >
                  Latest Recap
                </span>
              </div>
              <Link to="/recap">
                <div
                  className="rounded-md p-4 flex items-center gap-4 transition-all active:scale-[0.98]"
                  style={{ background: 'var(--ink-2)', border: '1px solid rgba(240,180,0,0.2)' }}
                >
                  <div
                    className="fk-mono flex items-center justify-center shrink-0"
                    style={{ width: 48, height: 48, border: '1px solid var(--rule)', color: 'var(--gold)', fontSize: 9 }}
                  >
                    RCP
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="fz-label mb-0.5" style={{ color: 'var(--gold)' }}>
                      Matchday {recap.matchday_id}
                    </div>
                    <div
                      className="text-[16px] font-black leading-tight"
                      style={{ fontFamily: 'Archivo Black, sans-serif', color: 'var(--paper)' }}
                    >
                      {recap.final_rank === 1 ? '1st' : recap.final_rank === 2 ? '2nd' : recap.final_rank === 3 ? '3rd' : `${recap.final_rank}th`}
                      <span className="font-normal mx-2" style={{ color: 'var(--mute)' }}>·</span>
                      <span style={{ color: 'var(--cyan)' }}>{recap.final_points} pts</span>
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--mute)' }}>View & share →</div>
                  </div>
                </div>
              </Link>
            </div>
          )}

        </div>
      </div>

    </div>
  );
}
