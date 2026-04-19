import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import PredictionModal from '../components/PredictionModal';

const CURRENT_MATCHDAY = 5;
const LOCK_TIME_LABEL  = '18:00 today';

/* ── Team accent colours (rough national palette) ──────────────── */
const TEAM_COLORS = {
  Brazil:   { primary: '#009C3B', secondary: '#FFDF00' },
  France:   { primary: '#002395', secondary: '#ED2939' },
  England:  { primary: '#CF081F', secondary: '#FFFFFF' },
  Portugal: { primary: '#006600', secondary: '#FF0000' },
  Morocco:  { primary: '#C1272D', secondary: '#006233' },
  Spain:    { primary: '#AA151B', secondary: '#F1BF00' },
  Germany:  { primary: '#000000', secondary: '#DD0000' },
  Argentina:{ primary: '#74ACDF', secondary: '#FFFFFF' },
  Korea:    { primary: '#C60C30', secondary: '#003478' },
  Italy:    { primary: '#009246', secondary: '#003DA5' },
  default:  { primary: '#1C2333', secondary: '#3D4B5C' },
};

const getTeamColor = (name) => TEAM_COLORS[name] || TEAM_COLORS.default;

export default function HomeScreen() {
  const [fixtures,   setFixtures]   = useState([]);
  const [userStats,  setUserStats]  = useState({ rank: '-', points: 0 });
  const [prediction, setPrediction] = useState(null);
  const [recap,      setRecap]      = useState(null);
  const [showPicker, setShowPicker] = useState(false);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => { fetchInitialData(); }, []);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const userId = '00000000-0000-0000-0000-000000000000';
      await Promise.all([
        fetchFixtures(),
        fetchUserStats(userId),
        fetchTodayPrediction(userId),
        fetchLatestRecap(userId),
      ]);
    } finally {
      setLoading(false);
    }
  };

  const fetchFixtures = async () => {
    const { data } = await supabase.from('fixtures').select('*').order('kickoff_at', { ascending: true });
    if (!data || data.length === 0) {
      setFixtures([
        { id: 'f1', home_team: 'Brazil', away_team: 'Korea',    status: 'live',      minute: '64', kickoff_at: new Date().toISOString(), home_score: 2, away_score: 1 },
        { id: 'f2', home_team: 'France', away_team: 'England',  status: 'scheduled', kickoff_at: new Date(Date.now() + 1000*60*60*2).toISOString() },
        { id: 'f3', home_team: 'Portugal', away_team: 'Morocco',status: 'scheduled', kickoff_at: new Date(Date.now() + 1000*60*60*4).toISOString() },
        { id: 'f4', home_team: 'Spain', away_team: 'Germany',   status: 'finished',  kickoff_at: new Date(Date.now() - 1000*60*60*3).toISOString(), home_score: 1, away_score: 2 },
      ]);
      return;
    }
    setFixtures(data);
  };

  const fetchUserStats = async (userId) => {
    const { data } = await supabase.from('league_members').select('rank, total_points').eq('user_id', userId).limit(1).single();
    if (data) setUserStats({ rank: data.rank, points: data.total_points });
  };

  const fetchTodayPrediction = async (userId) => {
    try {
      const { data } = await supabase
        .from('top_scorer_predictions')
        .select('predicted_player_id, is_correct, points_awarded, players(name, club)')
        .eq('user_id', userId).eq('matchday_id', String(CURRENT_MATCHDAY)).maybeSingle();
      if (data) setPrediction({ id: data.predicted_player_id, name: data.players?.name, club: data.players?.club, correct: data.is_correct, pts: data.points_awarded });
    } catch {}
  };

  const fetchLatestRecap = async (userId) => {
    try {
      const { data } = await supabase.from('matchday_recaps').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (data) setRecap(data);
    } catch {}
  };

  const handlePredictionSaved = (player) => { setPrediction(player); setShowPicker(false); };

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
                    style={{ color: '#F03A3A', fontFamily: 'Barlow Condensed, sans-serif' }}
                  >
                    LIVE
                  </span>
                </div>
                <span
                  className="text-[11px] font-black tabular-nums"
                  style={{ color: '#F03A3A', fontFamily: 'Barlow Condensed, sans-serif' }}
                >
                  {match.minute}'
                </span>
              </>
            ) : isDone ? (
              <span
                className="text-[9px] font-black tracking-widest px-1.5 py-0.5 rounded-sm"
                style={{ color: '#3D4B5C', background: 'rgba(61,75,92,0.15)', fontFamily: 'Barlow Condensed, sans-serif' }}
              >
                FT
              </span>
            ) : (
              <span
                className="text-[11px] font-bold tabular-nums"
                style={{ color: '#7D8A96', fontFamily: 'DM Sans, sans-serif' }}
              >
                {kickoff}
              </span>
            )}
          </div>

          {/* Home team */}
          <div className="flex-1 min-w-0 text-right">
            <div
              className="text-[14px] font-bold truncate leading-tight"
              style={{ color: isDone || isLive ? '#F0F2F5' : '#7D8A96', fontFamily: 'DM Sans, sans-serif' }}
            >
              {match.home_team}
            </div>
            <div
              className="text-[9px] font-semibold uppercase tracking-widest mt-0.5"
              style={{ color: '#3D4B5C' }}
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
                  fontFamily: 'Barlow Condensed, sans-serif',
                  color: isLive ? '#F0F2F5' : '#7D8A96',
                  letterSpacing: '0.05em',
                }}
              >
                {match.home_score ?? 0}
                <span style={{ color: '#3D4B5C', margin: '0 3px' }}>–</span>
                {match.away_score ?? 0}
              </div>
            ) : (
              <div
                className="text-[13px] font-bold"
                style={{ color: '#3D4B5C', fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '0.1em' }}
              >
                VS
              </div>
            )}
          </div>

          {/* Away team */}
          <div className="flex-1 min-w-0 text-left">
            <div
              className="text-[14px] font-bold truncate leading-tight"
              style={{ color: isDone || isLive ? '#F0F2F5' : '#7D8A96', fontFamily: 'DM Sans, sans-serif' }}
            >
              {match.away_team}
            </div>
            <div
              className="text-[9px] font-semibold uppercase tracking-widest mt-0.5"
              style={{ color: '#3D4B5C' }}
            >
              {match.away_team.substring(0, 3).toUpperCase()}
            </div>
          </div>

          {/* Right accent line for live matches */}
          {isLive && (
            <div
              className="absolute right-0 top-2 bottom-2 w-[2.5px] rounded-l-full"
              style={{ background: '#F03A3A' }}
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
          <div className="fz-label" style={{ color: '#3D4B5C' }}>World Cup 2026</div>
          <div
            className="text-[24px] font-black uppercase leading-tight tracking-tight"
            style={{ fontFamily: 'Barlow Condensed, sans-serif', color: '#F0F2F5' }}
          >
            Match Centre
          </div>
        </div>

        <div className="flex items-center gap-5">
          <div className="text-right">
            <div className="fz-label" style={{ color: '#3D4B5C' }}>Rank</div>
            <div
              className="text-[20px] font-black tabular-nums leading-tight"
              style={{ fontFamily: 'Barlow Condensed, sans-serif', color: '#F0F2F5' }}
            >
              #{userStats.rank}
            </div>
          </div>
          <div className="text-right">
            <div className="fz-label" style={{ color: '#3D4B5C' }}>Points</div>
            <div
              className="text-[20px] font-black tabular-nums leading-tight"
              style={{ fontFamily: 'Barlow Condensed, sans-serif', color: '#00C4E8' }}
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
              <div className="w-[3px] h-4 rounded-full" style={{ background: '#00C4E8' }} />
              <span
                className="text-[11px] font-bold uppercase tracking-[0.18em]"
                style={{ color: '#7D8A96', fontFamily: 'Barlow Condensed, sans-serif' }}
              >
                Matchday {CURRENT_MATCHDAY} · Fixtures
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
                  style={{ color: '#F03A3A', fontFamily: 'Barlow Condensed, sans-serif' }}
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
              <p className="text-sm font-medium" style={{ color: '#7D8A96' }}>No matches scheduled.</p>
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
              <div className="w-[3px] h-4 rounded-full" style={{ background: '#00C4E8' }} />
              <span
                className="text-[11px] font-bold uppercase tracking-[0.18em]"
                style={{ color: '#7D8A96', fontFamily: 'Barlow Condensed, sans-serif' }}
              >
                Top Scorer · MD{CURRENT_MATCHDAY}
              </span>
            </div>

            <div
              className="rounded-md overflow-hidden"
              style={{ background: '#0D1117', border: '1px solid rgba(0,196,232,0.18)' }}
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
                    style={{ color: '#00C4E8', fontFamily: 'Barlow Condensed, sans-serif' }}
                  >
                    Daily Prediction
                  </span>
                </div>
                <div
                  className="text-[9px] font-bold px-2 py-0.5 rounded-sm"
                  style={{ color: '#18C96B', background: 'rgba(24,201,107,0.1)', fontFamily: 'Barlow Condensed, sans-serif' }}
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
                        style={{ background: '#1C2333', border: '1px solid rgba(255,255,255,0.08)', color: '#7D8A96' }}
                      >
                        {prediction.name?.substring(0, 2)}
                      </div>
                      <div>
                        {prediction.correct === null  && <div className="fz-label mb-0.5" style={{ color: '#00C4E8' }}>Your pick</div>}
                        {prediction.correct === true  && <div className="fz-label mb-0.5" style={{ color: '#18C96B' }}>✓ +{prediction.pts}pts</div>}
                        {prediction.correct === false && <div className="fz-label mb-0.5" style={{ color: '#F03A3A' }}>✗ Wrong pick</div>}
                        <div className="text-[14px] font-semibold" style={{ color: '#F0F2F5' }}>{prediction.name}</div>
                      </div>
                    </div>
                    {prediction.correct === null && (
                      <button
                        onClick={() => setShowPicker(true)}
                        className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-sm transition-all active:scale-95"
                        style={{
                          color: '#00C4E8',
                          border: '1px solid rgba(0,196,232,0.3)',
                          fontFamily: 'Barlow Condensed, sans-serif',
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
                      style={{ color: '#7D8A96' }}
                    >
                      Who scores the most goals in Matchday {CURRENT_MATCHDAY}?
                    </div>
                    <div className="flex items-center justify-between">
                      <div
                        className="text-[10px] font-semibold"
                        style={{ color: '#3D4B5C' }}
                      >
                        ⏰ Deadline: {LOCK_TIME_LABEL}
                      </div>
                      <button
                        onClick={() => setShowPicker(true)}
                        className="text-[12px] font-black uppercase tracking-widest px-4 py-2 rounded-sm transition-all active:scale-95"
                        style={{
                          background: '#00C4E8',
                          color: '#000',
                          fontFamily: 'Barlow Condensed, sans-serif',
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
                <div className="w-[3px] h-4 rounded-full" style={{ background: '#F0B400' }} />
                <span
                  className="text-[11px] font-bold uppercase tracking-[0.18em]"
                  style={{ color: '#7D8A96', fontFamily: 'Barlow Condensed, sans-serif' }}
                >
                  Latest Recap
                </span>
              </div>
              <Link to="/recap">
                <div
                  className="rounded-md p-4 flex items-center gap-4 transition-all active:scale-[0.98]"
                  style={{ background: '#0D1117', border: '1px solid rgba(240,180,0,0.2)' }}
                >
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-xl shrink-0"
                    style={{ background: 'rgba(240,180,0,0.1)', border: '1px solid rgba(240,180,0,0.2)' }}
                  >
                    📊
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="fz-label mb-0.5" style={{ color: '#F0B400' }}>
                      Matchday {recap.matchday_id}
                    </div>
                    <div
                      className="text-[16px] font-black leading-tight"
                      style={{ fontFamily: 'Barlow Condensed, sans-serif', color: '#F0F2F5' }}
                    >
                      {recap.final_rank === 1 ? '1st' : recap.final_rank === 2 ? '2nd' : recap.final_rank === 3 ? '3rd' : `${recap.final_rank}th`}
                      <span className="font-normal mx-2" style={{ color: '#3D4B5C' }}>·</span>
                      <span style={{ color: '#00C4E8' }}>{recap.final_points} pts</span>
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ color: '#3D4B5C' }}>View & share →</div>
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
                  <div className="fz-label mb-0.5" style={{ color: '#F0B400' }}>Bracket Challenge</div>
                  <div
                    className="text-[15px] font-black"
                    style={{ fontFamily: 'Barlow Condensed, sans-serif', color: '#F0F2F5' }}
                  >
                    Predict the Knockouts
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: '#3D4B5C' }}>Earn bonus points →</div>
                </div>
              </div>
            </Link>
          </div>

        </div>
      </div>

      {/* Prediction modal */}
      {showPicker && (
        <PredictionModal
          matchday={CURRENT_MATCHDAY}
          deadlineLabel={LOCK_TIME_LABEL}
          onClose={() => setShowPicker(false)}
          onSave={handlePredictionSaved}
        />
      )}
    </div>
  );
}
