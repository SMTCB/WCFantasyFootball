import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useDeadlineCountdown } from '../hooks/useDeadlineCountdown';
import PredictionModal from '../components/PredictionModal';

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
  const deadline = useDeadlineCountdown();
  const [fixtures,        setFixtures]        = useState([]);
  const [userStats,       setUserStats]       = useState({ rank: '-', points: 0 });
  const [prediction,      setPrediction]      = useState(null);
  const [recap,           setRecap]           = useState(null);
  const [showPicker,      setShowPicker]      = useState(false);
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
        fetchUserStats(userId),
        fetchLatestRecap(userId),
      ]);
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchInitialData(); }, [user]);

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

  const fetchUserStats = async (userId) => {
    const { data } = await supabase.from('league_members').select('rank, total_points').eq('user_id', userId).limit(1).single();
    if (data) setUserStats({ rank: data.rank, points: data.total_points });
  };

  const fetchTodayPrediction = async (userId, matchday) => {
    try {
      if (!matchday) return;
      const { data } = await supabase
        .from('top_scorer_predictions')
        .select('predicted_player_id, is_correct, points_awarded, players(name, club)')
        .eq('user_id', userId).eq('matchday_id', String(matchday)).maybeSingle();
      if (data) setPrediction({ id: data.predicted_player_id, name: data.players?.name, club: data.players?.club, correct: data.is_correct, pts: data.points_awarded });
    } catch (err) { console.error('[prediction]', err); }
  };

  const fetchLatestRecap = async (userId) => {
    try {
      const { data } = await supabase.from('matchday_recaps').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (data) setRecap(data);
    } catch (err) { console.error('[recap]', err); }
  };

  // Fetch prediction once matchday resolves
  useEffect(() => {
    if (user?.id && currentMatchday != null) fetchTodayPrediction(user.id, currentMatchday);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, currentMatchday]);

  // FB-020: persist prediction to DB (upsert so re-picking before kick-off updates the row)
  const handlePredictionSaved = async (player) => {
    // Optimistic update — UI responds immediately
    setPrediction({ ...player, correct: null, pts: 0 });
    setShowPicker(false);
    try {
      const userId = user?.id;
      await supabase.from('top_scorer_predictions').upsert(
        {
          user_id:             userId,
          matchday_id:         String(currentMatchday ?? 'current'),
          predicted_player_id: player.id,
          is_correct:          null,
          points_awarded:      0,
        },
        { onConflict: 'user_id,matchday_id' }   // update if already exists
      );
    } catch (err) {
      console.error('[prediction] save failed', err);
      // Don't revert — the optimistic state is fine for the session
    }
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
                {match.home_score ?? 0}
                <span style={{ color: 'var(--mute)', margin: '0 3px' }}>–</span>
                {match.away_score ?? 0}
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
          <div className="fz-label" style={{ color: 'var(--mute)' }}>{competitionName || 'Fantasy Football'}</div>
          <div
            className="text-[24px] font-black uppercase leading-tight tracking-tight"
            style={{ fontFamily: 'Archivo Black, sans-serif', color: 'var(--paper)' }}
          >
            Match Centre
          </div>
        </div>

        <div className="flex items-center gap-5">
          <div className="text-right">
            <div className="fz-label" style={{ color: 'var(--mute)' }}>Rank</div>
            <div
              className="text-[20px] font-black tabular-nums leading-tight"
              style={{ fontFamily: 'Archivo Black, sans-serif', color: 'var(--paper)' }}
            >
              #{userStats.rank}
            </div>
          </div>
          <div className="text-right">
            <div className="fz-label" style={{ color: 'var(--mute)' }}>Points</div>
            <div
              className="text-[20px] font-black tabular-nums leading-tight"
              style={{ fontFamily: 'Archivo Black, sans-serif', color: 'var(--cyan)' }}
            >
              {userStats.points}
            </div>
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

          {/* Daily Prediction Widget */}
          <div className="px-4 pt-4 pb-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-[3px] h-4 rounded-full" style={{ background: 'var(--cyan)' }} />
              <span
                className="text-[11px] font-bold uppercase tracking-[0.18em]"
                style={{ color: 'var(--mute)', fontFamily: 'Archivo Black, sans-serif' }}
              >
                Top Scorer{currentMatchday != null ? ` · MD${currentMatchday}` : ''}
              </span>
            </div>

            <div
              className="rounded-md overflow-hidden"
              style={{ background: 'var(--ink-2)', border: '1px solid rgba(0,196,232,0.18)' }}
            >
              {/* Widget header */}
              <div
                className="px-4 py-2.5 flex items-center justify-between"
                style={{ background: 'rgba(0,196,232,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[14px]">🎯</span>
                  <span
                    className="text-[10px] font-bold uppercase tracking-widest"
                    style={{ color: 'var(--cyan)', fontFamily: 'Archivo Black, sans-serif' }}
                  >
                    Daily Prediction
                  </span>
                </div>
                <div
                  className="text-[9px] font-bold px-2 py-0.5 rounded-sm"
                  style={{ color: 'var(--positive)', background: 'rgba(24,201,107,0.1)', fontFamily: 'Archivo Black, sans-serif' }}
                >
                  +5 pts
                </div>
              </div>

              <div className="px-4 py-3">
                {prediction ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-[11px] font-black uppercase shrink-0"
                        style={{ background: '#1C2333', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--mute)' }}
                      >
                        {prediction.name?.substring(0, 2)}
                      </div>
                      <div>
                        {prediction.correct === null  && <div className="fz-label mb-0.5" style={{ color: 'var(--cyan)' }}>Your pick</div>}
                        {prediction.correct === true  && <div className="fz-label mb-0.5" style={{ color: 'var(--positive)' }}>✓ +{prediction.pts}pts</div>}
                        {prediction.correct === false && <div className="fz-label mb-0.5" style={{ color: 'var(--danger)' }}>✗ Wrong pick</div>}
                        <div className="text-[14px] font-semibold" style={{ color: 'var(--paper)' }}>{prediction.name}</div>
                      </div>
                    </div>
                    {prediction.correct === null && (
                      <button
                        onClick={() => setShowPicker(true)}
                        className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-sm transition-all active:scale-95"
                        style={{
                          color: 'var(--cyan)',
                          border: '1px solid rgba(0,196,232,0.3)',
                          fontFamily: 'Archivo Black, sans-serif',
                        }}
                      >
                        Change
                      </button>
                    )}
                  </div>
                ) : (
                  <div>
                    <div
                      className="text-[12px] mb-3 leading-relaxed"
                      style={{ color: 'var(--mute)' }}
                    >
                      Who scores the most goals{currentMatchday != null ? ` in Matchday ${currentMatchday}` : ' this matchday'}?
                    </div>
                    <div className="flex items-center justify-between">
                      <div
                        className="text-[10px] font-semibold"
                        style={{ color: 'var(--mute)' }}
                      >
                        <span style={{ color: deadline.color, transition: 'color 0.5s' }}>
                          {deadline.loading ? '…' : deadline.label}
                        </span>
                      </div>
                      <button
                        onClick={() => setShowPicker(true)}
                        className="text-[12px] font-black uppercase tracking-widest px-4 py-2 rounded-sm transition-all active:scale-95"
                        style={{
                          background: 'var(--cyan)',
                          color: '#000',
                          fontFamily: 'Archivo Black, sans-serif',
                        }}
                      >
                        Make Pick
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

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
                    className="w-12 h-12 rounded-full flex items-center justify-center text-xl shrink-0"
                    style={{ background: 'rgba(240,180,0,0.1)', border: '1px solid rgba(240,180,0,0.2)' }}
                  >
                    📊
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

          {/* Bracket Challenge */}
          <div className="px-4 pb-4 pt-2">
            <Link to="/bracket">
              <div
                className="rounded-md p-4 flex items-center gap-4 transition-all active:scale-[0.98]"
                style={{ background: 'rgba(240,180,0,0.05)', border: '1px solid rgba(240,180,0,0.18)' }}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0"
                  style={{ background: 'rgba(240,180,0,0.12)', border: '1px solid rgba(240,180,0,0.2)' }}
                >
                  🏆
                </div>
                <div>
                  <div className="fz-label mb-0.5" style={{ color: 'var(--gold)' }}>Bracket Challenge</div>
                  <div
                    className="text-[15px] font-black"
                    style={{ fontFamily: 'Archivo Black, sans-serif', color: 'var(--paper)' }}
                  >
                    Predict the Knockouts
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--mute)' }}>Earn bonus points →</div>
                </div>
              </div>
            </Link>
          </div>

        </div>
      </div>

      {/* Prediction modal */}
      {showPicker && (
        <PredictionModal
          matchday={currentMatchday ?? 'current'}
          deadlineLabel={deadline.label || '…'}
          onClose={() => setShowPicker(false)}
          onSave={handlePredictionSaved}
        />
      )}
    </div>
  );
}
