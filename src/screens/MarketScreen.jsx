import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { normalizeIntelligence } from '../lib/intelligence';
import { normalisePlayers } from '../lib/players';
import { useAuth } from '../hooks/useAuth';
import { useOnboarding } from '../hooks/useOnboarding';
import { useTransfer } from '../hooks/useTransfer';
import { useLeagueConfig } from '../hooks/useLeagueConfig';
import LeagueSelector from '../components/LeagueSelector';
import OnboardingTour from '../components/OnboardingTour';
import ConfirmModal from '../components/ConfirmModal';

const COUNTRY_LIMIT = 3;

const POS_CONFIG = {
  GK:  { label: 'GK',  color: 'var(--gold)', bg: 'rgba(240,180,0,0.14)'  },
  DEF: { label: 'DEF', color: 'var(--cyan)', bg: 'rgba(0,196,232,0.14)'  },
  MID: { label: 'MID', color: 'var(--pos-gk)', bg: 'rgba(157,95,245,0.14)' },
  FWD: { label: 'FWD', color: 'var(--danger)', bg: 'rgba(240,58,58,0.14)'  },
};

const FLAG_MAP = {
  FRA: '🇫🇷', BRA: '🇧🇷', ENG: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', ESP: '🇪🇸', BEL: '🇧🇪', POR: '🇵🇹',
  MAR: '🇲🇦', URU: '🇺🇾', ITA: '🇮🇹', NOR: '🇳🇴', GER: '🇩🇪', ARG: '🇦🇷',
  EGY: '🇪🇬', NED: '🇳🇱', CRO: '🇭🇷',
};

const POS_FILTER_ORDER = ['ALL', 'GK', 'DEF', 'MID', 'FWD'];

const MARKET_TOUR_STEPS = [
  {
    target: 'market-filters',
    title:  'Filter by Position',
    body:   'Tap GK, DEF, MID, or FWD to narrow the list. You need exactly 1 GK, 4 DEF, 4 MID, and 2 FWD in your starting XI.',
  },
  {
    target: 'market-budget',
    title:  'Your Budget',
    body:   'Every player you buy deducts from your $100M budget. Sell players back to free up funds — but the window closes before each matchday.',
  },
  {
    target: 'market-player-list',
    title:  'Buy & Sell',
    body:   'Tap a player to expand their card, then hit Buy or Sell. Prices update each matchday based on ownership and performance.',
  },
];

export default function MarketScreen() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const leagueId = searchParams.get('leagueId');
  const { showMarketTour, completeMarketTour } = useOnboarding();
  const [players,       setPlayers]       = useState([]);
  const [mySquad,       setMySquad]       = useState(null);
  const [leagues,       setLeagues]       = useState(null);   // null = not yet loaded
  const [activeLeague,  setActiveLeague]  = useState(leagueId);
  const [todayJokerId,  setTodayJokerId]  = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [filterPos,     setFilterPos]     = useState('ALL');
  const [budget,        setBudget]        = useState(0);      // loaded from league config
  const [saving,        setSaving]        = useState(false);
  const [isLocked,      setIsLocked]      = useState(false);
  const [confirm,       setConfirm]       = useState(null);

  // Competition-agnostic config from the selected league row
  const cfg = useLeagueConfig(activeLeague);
  const POS_LIMITS = cfg.positionLimits;
  const squadSize  = cfg.squadSize;

  // League-scoped transfer state
  const { buy, sell, isTaken, takenBy, isOwnedBy } = useTransfer(activeLeague);

  // On mount: resolve league context
  useEffect(() => {
    const init = async () => {
      if (leagueId) { setActiveLeague(leagueId); return; }
      // No leagueId in URL — fetch user's leagues
      const { data } = await supabase
        .from('league_members')
        .select('league_id, leagues(id, name)')
        .eq('user_id', user?.id);
      const list = (data ?? []).map(r => ({ id: r.league_id, name: r.leagues?.name ?? r.league_id }));
      if (list.length === 1) { setActiveLeague(list[0].id); setLeagues([]); }
      else { setLeagues(list); }
    };
    if (user?.id) init();
  }, [user?.id, leagueId]);

  useEffect(() => { fetchMarketParams(); }, [activeLeague]);

  const fetchMarketParams = async () => {
    setLoading(true);

    // ── 1. Players — isolated, always loads ──────────────────────────────────
    try {
      const [{ data: pData }, { data: intelData }] = await Promise.all([
        supabase.from('players').select('*').order('price', { ascending: false }),
        supabase.from('player_status').select('*'),
      ]);
      const rawPlayers = (pData && pData.length > 0) ? pData : [];
      const playersWithIntel = normalisePlayers(rawPlayers).map(p => ({
        ...p,
        intel: normalizeIntelligence(intelData?.find(i => i.player_id === p.id)) ?? p.intel,
      }));
      setPlayers(playersWithIntel);
    } catch (err) {
      console.error('MarketScreen: players fetch failed', err);
    }

    // ── 2. Transfer window lock ───────────────────────────────────────────────
    try {
      const [{ data: nowRow }, { data: deadlineRow }] = await Promise.all([
        supabase.rpc('get_server_time').single().then(r => r, () => ({ data: null })),
        supabase.from('matchday_deadlines').select('deadline_at').eq('matchday_id', 'md1').maybeSingle().then(r => r, () => ({ data: null })),
      ]);
      const serverNow = nowRow ? new Date(nowRow) : new Date();
      const deadline  = deadlineRow?.deadline_at ? new Date(deadlineRow.deadline_at) : null;
      setIsLocked(deadline ? serverNow >= deadline : false);
    } catch (err) {
      console.error('MarketScreen: deadline fetch failed', err);
    }

    // ── 3. Squad & joker ─────────────────────────────────────────────────────
    try {
      const userId = user?.id;
      if (userId) {
        const squadQuery = supabase.from('squads').select('*').eq('user_id', userId);
        if (activeLeague) squadQuery.eq('league_id', activeLeague);
        const [{ data: sData }, { data: jData }] = await Promise.all([
          squadQuery.maybeSingle(),
          supabase.from('daily_jokers').select('player_id')
            .eq('user_id', userId)
            .eq('match_date', new Date().toISOString().split('T')[0])
            .maybeSingle(),
        ]);
        setTodayJokerId(jData?.player_id || null);
        if (sData) {
          setMySquad(sData);
          setBudget(Number(sData.budget_remaining ?? cfg.budgetTotal));
        } else {
          setMySquad({ id: null, players: [] });
          setBudget(cfg.budgetTotal);
        }
      } else {
        setMySquad({ id: null, players: [] });
      }
    } catch (err) {
      console.error('MarketScreen: squad fetch failed', err);
      setMySquad({ id: null, players: [] });
    }

    setLoading(false);
  };

  const stats = useMemo(() => {
    const posCounts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    const countryCounts = {};
    if (!mySquad || !players.length) return { posCounts, countryCounts };
    mySquad.players.forEach(pid => {
      const p = players.find(pl => pl.id === pid);
      if (!p) return;
      if (posCounts[p.position] !== undefined) posCounts[p.position]++;
      if (pid !== todayJokerId) countryCounts[p.club] = (countryCounts[p.club] || 0) + 1;
    });
    return { posCounts, countryCounts };
  }, [mySquad, players, todayJokerId]);

  const handleBuy = async (player) => {
    if (saving) return;
    if (isLocked) { alert('Transfers are locked until after the match.'); return; }
    if (!activeLeague) { alert('Select a league first.'); return; }
    if ((mySquad?.players?.length ?? 0) >= squadSize) { alert('Squad is full — sell a player first.'); return; }
    if (stats.posCounts[player.position] >= POS_LIMITS[player.position]) { alert(`Max ${player.position}s reached.`); return; }
    if (budget < player.price) { alert('Not enough budget.'); return; }
    try {
      setSaving(true);
      const result = await buy(player);
      if (!result.ok) { alert(result.error); return; }
      setMySquad(prev => ({ ...prev, players: result.players, budget_remaining: result.budget_remaining }));
      setBudget(result.budget_remaining);
    } finally { setSaving(false); }
  };

  const handleSell = (player) => {
    if (saving)   return;
    if (isLocked) { alert('Transfers are locked until after the match.'); return; }

    const isCaptain = mySquad?.captain_id === player.id;
    const isJoker   = todayJokerId === player.id;
    const warnings  = [];
    if (isCaptain) warnings.push('This player is your captain — selling them removes the armband.');
    if (isJoker)   warnings.push('This player is your Daily Joker — selling voids today\'s boost.');

    setConfirm({
      title:        `Sell ${player.name}?`,
      body:         `You will receive $${player.price}M back into your budget.`,
      warning:      warnings.length ? warnings.join(' ') : null,
      confirmLabel: 'Sell',
      danger:       true,
      onConfirm: async () => {
        try {
          setSaving(true);
          const result = await sell(player);
          if (!result.ok) { alert(result.error); return; }
          setMySquad(prev => ({ ...prev, players: result.players, budget_remaining: result.budget_remaining }));
          setBudget(result.budget_remaining);
        } finally { setSaving(false); }
      },
    });
  };

  const filteredPlayers = players.filter(p => filterPos === 'ALL' || p.position === filterPos);
  const squadCount  = mySquad?.players?.length || 0;
  const emptySlots  = Math.max(0, squadSize - squadCount);

  // League picker — shown when user has multiple leagues and none is selected
  if (leagues && leagues.length > 1 && !activeLeague) {
    return (
      <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-6 gap-4">
        <div className="text-[13px] font-black uppercase tracking-widest mb-2" style={{ color: 'var(--mute)', fontFamily: 'Archivo Black, sans-serif' }}>
          Select a League
        </div>
        {leagues.map(l => (
          <button
            key={l.id}
            onClick={() => setActiveLeague(l.id)}
            className="w-full max-w-sm px-5 py-4 rounded-lg text-left transition-all active:opacity-70"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--paper)' }}
          >
            <div className="text-[14px] font-semibold">{l.name}</div>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Confirmation dialog (FB-021 + FB-023) */}
      {confirm && (
        <ConfirmModal
          {...confirm}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* First-visit spotlight tour */}
      {showMarketTour && !loading && (
        <OnboardingTour
          steps={MARKET_TOUR_STEPS}
          onComplete={completeMarketTour}
          onSkip={completeMarketTour}
        />
      )}

      {/* ── Transfer Window Lock Banner ─────────────────────── */}
      {isLocked && (
        <div
          className="flex items-center gap-3 px-5 py-3"
          style={{ background: 'rgba(240,58,58,0.10)', borderBottom: '1px solid rgba(240,58,58,0.25)' }}
        >
          <span className="text-base">🔒</span>
          <div>
            <div
              className="text-[11px] font-black uppercase tracking-widest"
              style={{ color: 'var(--danger)', fontFamily: 'Archivo Black, sans-serif' }}
            >
              Transfer Window Closed
            </div>
            <div className="text-[10px]" style={{ color: 'var(--mute)' }}>
              Transfers are locked until the matchday results are published.
            </div>
          </div>
        </div>
      )}

      {/* ── Sticky Header ───────────────────────────────────── */}
      <div
        className="sticky top-0 z-40"
        style={{
          background: 'rgba(13,17,23,0.97)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        {/* Title + stats row */}
        <div className="px-5 pt-3.5 pb-2.5 flex items-center justify-between">
          <div>
            <div
              className="fz-label"
              style={{ color: isLocked ? 'var(--danger)' : 'var(--mute)' }}
            >
              {isLocked ? '🔒 Window Closed' : 'Transfer Window'}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <div
                className="text-[24px] font-black uppercase leading-tight tracking-tight"
                style={{ fontFamily: 'Archivo Black, sans-serif', color: 'var(--paper)' }}
              >
                Player Market
              </div>
              <LeagueSelector value={activeLeague} onChange={setActiveLeague} />
            </div>
          </div>

          <div className="flex items-center gap-5">
            {/* Squad count */}
            <div className="text-right">
              <div className="fz-label" style={{ color: 'var(--mute)' }}>Squad</div>
              <div
                className="text-[20px] font-black tabular-nums leading-tight"
                style={{ fontFamily: 'Archivo Black, sans-serif', color: squadCount >= squadSize ? 'var(--positive)' : 'var(--paper)' }}
              >
                {squadCount}
                <span className="text-[12px] font-normal" style={{ color: 'var(--mute)' }}>/{squadSize}</span>
              </div>
            </div>

            {/* Budget + empty slots */}
            <div className="text-right" data-tour="market-budget">
              <div className="fz-label" style={{ color: 'var(--mute)' }}>Budget</div>
              <div
                className="text-[20px] font-black tabular-nums leading-tight"
                style={{ fontFamily: 'Archivo Black, sans-serif', color: (budget ?? 0) < 5 ? 'var(--danger)' : 'var(--cyan)' }}
              >
                ${(budget ?? 0).toFixed(1)}
                <span className="text-[12px] font-normal" style={{ color: 'var(--mute)' }}>M</span>
              </div>
              {emptySlots > 0 && (
                <div className="text-[10px] font-black mt-0.5" style={{ color: 'var(--gold)', fontFamily: 'Archivo Black, sans-serif' }}>
                  {emptySlots} empty slot{emptySlots !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Position quota row */}
        <div className="flex gap-1.5 px-5 pb-2.5">
          {(['GK', 'DEF', 'MID', 'FWD']).map(pos => {
            const cfg   = POS_CONFIG[pos];
            const count = stats.posCounts[pos];
            const max   = POS_LIMITS[pos];
            const full  = count >= max;
            const pct   = (count / max) * 100;
            return (
              <div
                key={pos}
                className="flex-1 rounded-sm overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.04)' }}
                title={`${pos}: ${count}/${max}`}
              >
                {/* Fill bar */}
                <div
                  className="h-[3px] transition-all duration-300"
                  style={{
                    width: `${pct}%`,
                    background: full ? cfg.color : `${cfg.color}60`,
                  }}
                />
                <div
                  className="px-1.5 py-1 flex items-center justify-between"
                >
                  <span
                    className="text-[8px] font-black uppercase"
                    style={{ color: full ? cfg.color : 'var(--mute)', fontFamily: 'Archivo Black, sans-serif', letterSpacing: '0.08em' }}
                  >
                    {pos}
                  </span>
                  <span
                    className="text-[8px] font-bold tabular-nums"
                    style={{ color: full ? cfg.color : 'var(--mute)', fontFamily: 'Archivo Black, sans-serif' }}
                  >
                    {count}/{max}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Wildcard indicator */}
          {mySquad?.is_wildcard && (
            <div
              className="px-2 py-1 rounded-sm flex items-center gap-1 shrink-0"
              style={{ background: 'rgba(24,201,107,0.12)', border: '1px solid rgba(24,201,107,0.25)' }}
            >
              <span className="text-[8px]">∞</span>
              <span
                className="text-[8px] font-black uppercase"
                style={{ color: 'var(--positive)', fontFamily: 'Archivo Black, sans-serif', letterSpacing: '0.08em' }}
              >
                WC
              </span>
            </div>
          )}
        </div>

        {/* Position filter tabs */}
        <div
          className="flex"
          data-tour="market-filters"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          {POS_FILTER_ORDER.map(pos => {
            const isActive = filterPos === pos;
            const cfg = pos !== 'ALL' ? POS_CONFIG[pos] : null;
            const activeColor = cfg?.color ?? 'var(--paper)';
            return (
              <button
                key={pos}
                onClick={() => setFilterPos(pos)}
                className="flex-1 min-w-0 py-2.5 transition-all duration-150 relative"
                style={{
                  fontFamily: 'Archivo Black, sans-serif',
                  fontSize: '11px',
                  fontWeight: 800,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: isActive ? activeColor : 'var(--mute)',
                  background: isActive ? `${activeColor}0F` : 'transparent',
                }}
              >
                {pos}
                {isActive && (
                  <div
                    className="absolute bottom-0 left-0 right-0 h-[2px]"
                    style={{ background: activeColor }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Player List ──────────────────────────────────────── */}
      {loading ? (
        <div className="divide-y divide-border">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex items-center gap-3 px-5 py-4">
              <div className="w-11 h-11 rounded-full animate-shimmer shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-32 rounded animate-shimmer" />
                <div className="h-2.5 w-20 rounded animate-shimmer" />
              </div>
              <div className="w-16 h-8 rounded animate-shimmer" />
            </div>
          ))}
        </div>
      ) : (
        <div data-tour="market-player-list">
          {filteredPlayers.map((p) => {
            const inMySquad    = mySquad?.players?.includes(p.id);
            const isOwned      = inMySquad || isOwnedBy(p.id);
            const takenByOther = !isOwned && isTaken(p.id);
            const ownerName    = takenBy(p.id);
            const limitReached = stats.posCounts[p.position] >= POS_LIMITS[p.position];
            const canAfford    = budget >= p.price;
            const hasLeague    = !!activeLeague;
            const canBuy       = hasLeague && !isOwned && !takenByOther && !limitReached && canAfford && (mySquad?.players?.length ?? 0) < squadSize;
            const posCfg       = POS_CONFIG[p.position] || POS_CONFIG.MID;
            const flag         = FLAG_MAP[p.club] ?? '🌍';
            const isJoker      = p.id === todayJokerId;
            const intel        = p.intel;

            return (
              <div
                key={p.id}
                className="flex items-center px-5 py-3 gap-4 transition-all duration-150"
                style={{
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  background:   isOwned ? 'rgba(0,196,232,0.04)' : takenByOther ? 'rgba(240,58,58,0.02)' : 'transparent',
                  borderLeft:   isOwned ? '2px solid rgba(0,196,232,0.4)' : takenByOther ? '2px solid rgba(240,58,58,0.25)' : '2px solid transparent',
                  opacity:      takenByOther ? 0.65 : 1,
                }}
              >
                {/* Avatar */}
                <div className="relative shrink-0">
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center font-black text-[11px] uppercase"
                    style={{
                      background: posCfg.bg,
                      border: `1.5px solid ${posCfg.color}50`,
                      color: posCfg.color,
                      fontFamily: 'Archivo Black, sans-serif',
                    }}
                  >
                    {p.club?.substring(0, 3)}
                  </div>
                  <div
                    className="absolute -bottom-0.5 -right-0.5 w-[18px] h-[18px] rounded-full flex items-center justify-center shadow-sm text-[10px]"
                    style={{ background: '#1C2333', border: '1.5px solid #080A0E' }}
                  >
                    {flag}
                  </div>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className="text-[13.5px] font-semibold truncate"
                      style={{ color: 'var(--paper)', fontFamily: 'Archivo, sans-serif' }}
                    >
                      {p.name}
                    </span>
                    {isOwned && (
                      <span
                        className="shrink-0 text-[8px] font-black px-1.5 py-0.5 rounded-sm"
                        style={{ background: 'rgba(0,196,232,0.15)', color: 'var(--cyan)', fontFamily: 'Archivo Black, sans-serif' }}
                      >
                        OWNED
                      </span>
                    )}
                    {takenByOther && (
                      <span
                        className="shrink-0 text-[8px] font-black px-1.5 py-0.5 rounded-sm"
                        style={{ background: 'rgba(240,58,58,0.15)', color: 'var(--danger)', fontFamily: 'Archivo Black, sans-serif' }}
                      >
                        {ownerName ? `TAKEN — ${ownerName}` : 'TAKEN'}
                      </span>
                    )}
                    {isJoker && (
                      <span
                        className="shrink-0 text-[8px] font-black px-1.5 py-0.5 rounded-sm"
                        style={{ background: 'rgba(157,95,245,0.15)', color: 'var(--pos-gk)', fontFamily: 'Archivo Black, sans-serif' }}
                      >
                        JOKER
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      className="text-[9px] font-black px-1.5 py-[2px] rounded-sm"
                      style={{ color: posCfg.color, background: posCfg.bg, fontFamily: 'Archivo Black, sans-serif', letterSpacing: '0.06em' }}
                    >
                      {p.position}
                    </span>
                    <span className="text-[10px] font-medium" style={{ color: 'var(--mute)' }}>{p.club}</span>
                    {intel?.status && intel.status !== 'fit' && (
                      <span
                        className="text-[8px] font-black px-1 py-0.5 rounded-sm uppercase"
                        style={{ color: 'var(--danger)', background: 'rgba(240,58,58,0.12)', fontFamily: 'Archivo Black, sans-serif' }}
                      >
                        {intel.status}
                      </span>
                    )}
                  </div>
                </div>

                {/* Price + action */}
                <div className="shrink-0 flex items-center gap-3">
                  <div className="text-right">
                    <div
                      className="text-[16px] font-black tabular-nums leading-tight"
                      style={{ fontFamily: 'Archivo Black, sans-serif', color: canAfford || isOwned ? 'var(--paper)' : 'var(--danger)' }}
                    >
                      ${p.price}
                      <span className="text-[10px] font-normal" style={{ color: 'var(--mute)' }}>M</span>
                    </div>
                  </div>

                  {isLocked ? (
                    <div
                      className="min-w-[60px] py-2 px-3 rounded-sm text-center"
                      style={{
                        background: 'rgba(240,58,58,0.07)',
                        border: '1px solid rgba(240,58,58,0.18)',
                        color: 'var(--danger)',
                        fontFamily: 'Archivo Black, sans-serif',
                        fontSize: '9px',
                        fontWeight: 800,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        opacity: 0.7,
                      }}
                    >
                      🔒
                    </div>
                  ) : isOwned ? (
                    <button
                      onClick={() => handleSell(p)}
                      disabled={saving}
                      className="min-w-[60px] py-2 px-3 rounded-sm transition-all active:scale-95 disabled:opacity-40"
                      style={{
                        background: 'rgba(240,58,58,0.12)',
                        color: 'var(--danger)',
                        border: '1px solid rgba(240,58,58,0.25)',
                        fontFamily: 'Archivo Black, sans-serif',
                        fontSize: '10px',
                        fontWeight: 800,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                      }}
                    >
                      Sell
                    </button>
                  ) : (
                    <button
                      onClick={() => handleBuy(p)}
                      disabled={saving || !canBuy}
                      title={
                        !hasLeague     ? 'Select a league first'
                        : !canAfford   ? 'Insufficient budget'
                        : limitReached ? `${p.position} slots full`
                        : 'Add to squad'
                      }
                      className="min-w-[60px] py-2 px-3 rounded-sm transition-all active:scale-95"
                      style={{
                        background: canBuy ? 'var(--positive)' : 'rgba(255,255,255,0.04)',
                        color: canBuy ? '#000' : 'var(--mute)',
                        border: canBuy ? 'none' : '1px solid rgba(255,255,255,0.07)',
                        fontFamily: 'Archivo Black, sans-serif',
                        fontSize: '10px',
                        fontWeight: 800,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        cursor: canBuy ? 'pointer' : 'not-allowed',
                        opacity: saving ? 0.5 : 1,
                      }}
                    >
                      Buy
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {filteredPlayers.length === 0 && !loading && (
            <div className="p-12 text-center">
              <div className="text-3xl mb-3 opacity-20">🔍</div>
              <p className="text-sm font-medium" style={{ color: 'var(--mute)' }}>
                No players found for this position.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Bottom rule reminder */}
      <div
        className="px-5 py-3 text-center"
        style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
      >
        <span
          className="text-[9px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--mute)', fontFamily: 'Archivo, sans-serif' }}
        >
          Max {COUNTRY_LIMIT} per club (Joker exempt) · Max {squadSize} players · ${cfg.budgetTotal}M budget
        </span>
      </div>
    </div>
  );
}
