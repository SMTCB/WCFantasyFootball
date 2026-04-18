import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import SectionHeader from '../components/SectionHeader';
import PredictionModal from '../components/PredictionModal';

const CURRENT_MATCHDAY = 5;
const LOCK_TIME_LABEL  = '18:00 today';

const STATUS_CONFIG = {
  live:      { label: 'LIVE',      color: '#22C55E', bg: 'rgba(34,197,94,0.1)'   },
  scheduled: { label: 'UPCOMING',  color: '#8B95A1', bg: 'rgba(139,149,161,0.08)' },
  finished:  { label: 'FT',        color: '#4A5568', bg: 'rgba(74,85,104,0.1)'   },
};

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
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id || '00000000-0000-0000-0000-000000000000';
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
    setFixtures(data || []);
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
    } catch (err) { console.error('Prediction fetch error', err); }
  };

  const fetchLatestRecap = async (userId) => {
    try {
      const { data } = await supabase.from('matchday_recaps').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (data) setRecap(data);
    } catch {}
  };

  const handlePredictionSaved = (player) => {
    setPrediction(player);
    setShowPicker(false);
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-bg">

      {/* ── Page Header ─────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-surface border-b border-border px-5 py-3 flex items-center justify-between">
        <div>
          <div className="fz-label text-text-tertiary">World Cup 2026</div>
          <div className="fz-display text-[22px] text-white leading-tight">MATCH CENTRE</div>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right">
            <div className="fz-label text-text-tertiary">Your Rank</div>
            <div className="fz-num text-[20px] text-white leading-tight">
              #{userStats.rank}
            </div>
          </div>
          <div className="text-right">
            <div className="fz-label text-text-tertiary">Points</div>
            <div className="fz-num text-[20px] text-cyan leading-tight">
              {userStats.points}
            </div>
          </div>
        </div>
      </div>

      {/* ── Two-column desktop layout ───────────────────────── */}
      <div className="flex flex-col lg:flex-row">

        {/* ══ LEFT — Fixtures ════════════════════════════════ */}
        <div className="flex-1 min-w-0">
          <SectionHeader title={`Matchday ${CURRENT_MATCHDAY} · Fixtures`} />

          {loading ? (
            <div className="p-8 text-center fz-label text-text-tertiary animate-scan">
              Syncing matches…
            </div>
          ) : fixtures.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-4xl mb-4 opacity-20">🏟️</div>
              <p className="text-sm text-text-secondary font-medium">No matches scheduled.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {fixtures.map(match => {
                const cfg = STATUS_CONFIG[match.status] || STATUS_CONFIG.scheduled;
                const kickoff = match.kickoff_at
                  ? new Date(match.kickoff_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                  : '—';
                return (
                  <div
                    key={match.id}
                    className="flex items-center px-5 py-4 hover:bg-surface-2 transition-colors group"
                  >
                    {/* Status badge */}
                    <div
                      className="w-[60px] shrink-0 text-center"
                    >
                      <span
                        className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-sm"
                        style={{ color: cfg.color, background: cfg.bg, fontFamily: 'Barlow Condensed, sans-serif' }}
                      >
                        {match.status === 'live' ? `${match.minute || '?'}'` : match.status === 'finished' ? 'FT' : kickoff}
                      </span>
                    </div>

                    {/* Teams */}
                    <div className="flex-1 flex items-center justify-center gap-4 min-w-0">
                      <div className="text-right flex-1 min-w-0">
                        <div className="text-[13px] font-bold text-white truncate">{match.home_team}</div>
                        <div className="text-[9px] text-text-tertiary font-semibold uppercase">{match.home_team.substring(0, 3)}</div>
                      </div>

                      <div className="shrink-0 text-center">
                        {match.status !== 'scheduled' ? (
                          <div className="fz-num text-[20px] text-white px-2">0 – 0</div>
                        ) : (
                          <div className="text-[12px] text-text-tertiary font-bold px-2">vs</div>
                        )}
                        {match.status === 'live' && (
                          <div className="w-1.5 h-1.5 rounded-full bg-positive mx-auto mt-0.5 animate-live-pulse" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-bold text-white truncate">{match.away_team}</div>
                        <div className="text-[9px] text-text-tertiary font-semibold uppercase">{match.away_team.substring(0, 3)}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ══ RIGHT — Widgets (desktop sidebar) ══════════════ */}
        <div className="lg:w-[320px] lg:border-l border-border shrink-0">

          {/* Recap teaser */}
          {recap && (
            <div>
              <SectionHeader title="Latest Recap" accent="gold" />
              <Link to="/recap" className="block mx-4 mb-4 group">
                <div className="fz-card p-4 flex items-center justify-between hover:border-cyan/30 transition-colors rounded-sm">
                  <div>
                    <div className="fz-label text-cyan mb-1">✨ Matchday {recap.matchday_id}</div>
                    <div className="fz-display text-[16px] text-white leading-tight">
                      {recap.final_rank === 1 ? '1st' : recap.final_rank === 2 ? '2nd' : recap.final_rank === 3 ? '3rd' : `${recap.final_rank}th`}
                      <span className="text-text-secondary text-[13px] font-normal ml-2">·</span>
                      <span className="text-cyan ml-2">{recap.final_points} pts</span>
                    </div>
                    <div className="text-[11px] text-text-tertiary mt-1">View & share →</div>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-cyan/10 border border-cyan/20 flex items-center justify-center text-xl group-hover:scale-110 transition-transform shrink-0">
                    📊
                  </div>
                </div>
              </Link>
            </div>
          )}

          {/* Daily Prediction */}
          <div>
            <SectionHeader title={`Top Scorer · MD${CURRENT_MATCHDAY}`} />
            <div className="mx-4 mb-4 fz-card rounded-sm overflow-hidden" style={{ borderColor: 'rgba(0,180,216,0.2)' }}>
              <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-border">
                <div className="flex items-center gap-2">
                  <span className="text-base">🎯</span>
                  <div className="fz-label text-cyan">Daily Prediction</div>
                </div>
                <div className="text-[9px] text-text-tertiary font-bold">+5 pts if correct</div>
              </div>

              <div className="px-4 py-3">
                {prediction ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-surface-2 border border-border flex items-center justify-center text-[11px] font-black text-text-tertiary uppercase">
                        {prediction.name?.substring(0, 2)}
                      </div>
                      <div>
                        {prediction.correct === null  && <div className="fz-label text-cyan mb-0.5">Your pick</div>}
                        {prediction.correct === true  && <div className="fz-label text-positive mb-0.5">✅ Correct! +{prediction.pts}pts</div>}
                        {prediction.correct === false && <div className="fz-label text-negative mb-0.5">❌ Wrong pick</div>}
                        <div className="text-[14px] font-bold text-white">{prediction.name}</div>
                      </div>
                    </div>
                    {prediction.correct === null && (
                      <button
                        onClick={() => setShowPicker(true)}
                        className="text-[10px] font-black uppercase tracking-widest text-cyan border border-cyan/30 rounded-sm px-2.5 py-1.5 hover:bg-cyan/10 transition-colors"
                      >
                        Change
                      </button>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="text-[12px] text-text-secondary mb-3 leading-relaxed">
                      Who scores the most goals in Matchday {CURRENT_MATCHDAY}?
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] text-text-tertiary font-semibold">⏰ Deadline: {LOCK_TIME_LABEL}</div>
                      <button
                        onClick={() => setShowPicker(true)}
                        className="text-[11px] font-black uppercase tracking-widest bg-cyan text-black rounded-sm px-4 py-2 active:scale-95 transition-transform"
                        style={{ fontFamily: 'Barlow Condensed, sans-serif' }}
                      >
                        Make Pick
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bracket Challenge teaser */}
          <div>
            <SectionHeader title="Mini Game" accent="gold" />
            <Link to="/bracket" className="block mx-4 mb-4 focus:outline-none group">
              <div className="fz-card p-4 flex items-center gap-4 hover:border-gold/30 transition-colors rounded-sm" style={{ borderColor: 'rgba(224,168,0,0.2)', background: 'rgba(224,168,0,0.04)' }}>
                <div className="w-10 h-10 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center text-xl group-hover:scale-110 transition-transform shrink-0">
                  🏆
                </div>
                <div className="flex-1">
                  <div className="fz-label text-gold mb-0.5">Bracket Challenge</div>
                  <div className="fz-display text-[15px] text-white">Predict the Knockouts</div>
                  <div className="text-[11px] text-text-tertiary mt-0.5">Earn bonus points →</div>
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
