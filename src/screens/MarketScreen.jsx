import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { normalizeIntelligence } from '../lib/intelligence';
import { normalisePlayers } from '../lib/players';
import { useAuth } from '../hooks/useAuth';
import { useOnboarding } from '../hooks/useOnboarding';
import { useTransfer } from '../hooks/useTransfer';
import { useLeagueConfig } from '../hooks/useLeagueConfig';
import { useAutoFill } from '../hooks/useAutoFill';
import { useToast } from '../hooks/useToast';
import LeagueSelector  from '../components/LeagueSelector';
import OnboardingTour  from '../components/OnboardingTour';
import ConfirmModal    from '../components/ConfirmModal';
import PositionChip    from '../components/PositionChip';
import StatusDot       from '../components/StatusDot';
import { POS_CONFIG, POS_FILTER_ORDER } from '../lib/formations';

const COUNTRY_LIMIT = 3;

const FLAG_MAP = {
  FRA: 'ðŸ‡«ðŸ‡·', BRA: 'ðŸ‡§ðŸ‡·', ENG: 'ðŸ´ó §ó ¢ó ¥ó ®ó §ó ¿', ESP: 'ðŸ‡ªðŸ‡¸', BEL: 'ðŸ‡§ðŸ‡ª', POR: 'ðŸ‡µðŸ‡¹',
  MAR: 'ðŸ‡²ðŸ‡¦', URU: 'ðŸ‡ºðŸ‡¾', ITA: 'ðŸ‡®ðŸ‡¹', NOR: 'ðŸ‡³ðŸ‡´', GER: 'ðŸ‡©ðŸ‡ª', ARG: 'ðŸ‡¦ðŸ‡·',
  EGY: 'ðŸ‡ªðŸ‡¬', NED: 'ðŸ‡³ðŸ‡±', CRO: 'ðŸ‡­ðŸ‡·',
};

const MARKET_TOUR_STEPS = [
  {
    target: 'market-filters',
    title:  'Filter by Position',
    body:   'Tap GK, DEF, MID, or FWD to narrow the list. You need exactly 1 GK, 4 DEF, 4 MID, and 2 FWD in your starting XI.',
  },
  {
    target: 'market-budget',
    title:  'Your Budget',
    body:   'Every player you buy deducts from your Â£100M budget. Sell players back to free up funds â€” but the window closes before each matchday.',
  },
  {
    target: 'market-player-list',
    title:  'Buy & Sell',
    body:   'Tap a player to expand their card, then hit Buy or Sell. Prices update each matchday based on ownership and performance.',
  },
];

export default function MarketScreen() {
  const { user } = useAuth();
  const { show: showToast } = useToast();
  const [searchParams] = useSearchParams();
  const leagueId = searchParams.get('leagueId');
  const { showMarketTour, completeMarketTour, replayMarketTour } = useOnboarding();
  const [players,       setPlayers]       = useState([]);
  const [mySquad,       setMySquad]       = useState(null);
  const [leagues,       setLeagues]       = useState(null);   // null = not yet loaded
  const [activeLeague,  setActiveLeague]  = useState(leagueId);
  const [tournamentId,  setTournamentId]  = useState(null);
  const [todayJokerId,  setTodayJokerId]  = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [filterPos,     setFilterPos]     = useState(() => localStorage.getItem('market_filterPos') || 'ALL');
  const [searchQuery,   setSearchQuery]   = useState(() => localStorage.getItem('market_searchQuery') || '');
  const [budget,        setBudget]        = useState(0);      // loaded from league config
  const [saving,        setSaving]        = useState(false);
  const [isLocked,      setIsLocked]      = useState(false);
  const [confirm,       setConfirm]       = useState(null);
  const marketListRef   = useRef(null);

  // Competition-agnostic config from the selected league row
  const cfg = useLeagueConfig(activeLeague);
  const POS_LIMITS = cfg.positionLimits;
  const squadSize  = cfg.squadSize;

  // League-scoped transfer state
  const { buy, sell, isTaken, takenBy, isOwnedBy, takenMapError, takenMap } = useTransfer(activeLeague);

  // Fetch squad for auto-fill
  const fetchSquad = async () => {
    try {
      const userId = user?.id;
      if (userId) {
        const { data: sData } = await supabase
          .from('squads')
          .select('*')
          .eq('user_id', userId)
          .eq('league_id', activeLeague)
          .maybeSingle();
        if (sData) {
          setMySquad(sData);
          setBudget(Number(sData.budget_remaining ?? cfg.budgetTotal));
        }
      }
    } catch (err) {
      console.error('MarketScreen: squad refresh failed', err);
    }
  };

  // Auto-fill hook â€” reusable across screens
  const { handleAutoFill, autoFilling, autoFillMsg } = useAutoFill(activeLeague, mySquad, fetchSquad, takenMap, buy);

  const resolveLeagueTournament = async (lid) => {
    const { data } = await supabase
      .from('leagues')
      .select('tournament_id')
      .eq('id', lid)
      .maybeSingle();
    if (data?.tournament_id) setTournamentId(data.tournament_id);
  };

  // On mount: resolve league context
  useEffect(() => {
    const init = async () => {
      if (leagueId) {
        setActiveLeague(leagueId);
        resolveLeagueTournament(leagueId);
        return;
      }
      // No leagueId in URL â€” fetch user's leagues
      const { data } = await supabase
        .from('league_members')
        .select('league_id, leagues(id, name, tournament_id)')
        .eq('user_id', user?.id);
      const list = (data ?? []).map(r => ({ id: r.league_id, name: r.leagues?.name ?? r.league_id, tournament_id: r.leagues?.tournament_id }));
      if (list.length === 1) {
        setActiveLeague(list[0].id);
        if (list[0].tournament_id) setTournamentId(list[0].tournament_id);
        setLeagues([]);
      } else {
        setLeagues(list);
      }
    };
    if (user?.id) init();
  }, [user?.id, leagueId]);

  const fetchMarketParams = async () => {
    setLoading(true);

    // â”€â”€ 1. Players â€” filtered by competition when known â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    try {
      let playersQuery = supabase.from('players').select('*').order('price', { ascending: false });
      if (tournamentId) playersQuery = playersQuery.eq('tournament_id', tournamentId);
      const [{ data: pData }, { data: intelData }] = await Promise.all([
        playersQuery,
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

    // â”€â”€ 2. Transfer window lock â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ 3. Squad & joker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    try {
      const userId = user?.id;
      if (userId) {
        const squadQuery = supabase.from('squads').select('*').eq('user_id', userId);
        if (activeLeague) squadQuery.eq('league_id', activeLeague);
        const [{ data: sData }, { data: jData }] = await Promise.all([
          squadQuery.maybeSingle(),
          supabase.from('daily_jokers').select('player_id')
            .eq('user_id', userId)
            .eq('joker_date', new Date().toISOString().split('T')[0])
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
      setBudget(cfg.budgetTotal);
    }

    setLoading(false);
  };

  useEffect(() => { fetchMarketParams(); }, [activeLeague, tournamentId]);

  // Persist filter position to localStorage
  useEffect(() => {
    localStorage.setItem('market_filterPos', filterPos);
  }, [filterPos]);

  // Persist search query to localStorage
  useEffect(() => {
    localStorage.setItem('market_searchQuery', searchQuery);
  }, [searchQuery]);

  // Save scroll position on navigate away
  useEffect(() => {
    const saveScrollPosition = () => {
      if (marketListRef.current) {
        localStorage.setItem('market_scrollPos', marketListRef.current.scrollTop);
      }
    };
    window.addEventListener('pagehide', saveScrollPosition);
    return () => window.removeEventListener('pagehide', saveScrollPosition);
  }, []);

  // Restore scroll position on mount
  useEffect(() => {
    const savedScrollPos = localStorage.getItem('market_scrollPos');
    if (savedScrollPos && marketListRef.current) {
      marketListRef.current.scrollTop = parseInt(savedScrollPos, 10);
    }
  }, [activeLeague]);

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
    if (isLocked) { showToast('Transfers are locked until after the match.', 'warning'); return; }
    if (!activeLeague) { showToast('Select a league first.', 'warning'); return; }
    if ((mySquad?.players?.length ?? 0) >= squadSize) { showToast('Squad is full â€” sell a player first.', 'warning'); return; }
    if (stats.posCounts[player.position] >= POS_LIMITS[player.position]) { showToast(`Max ${player.position}s reached.`, 'warning'); return; }
    if (budget < player.price) { showToast('Not enough budget.', 'error'); return; }
    try {
      setSaving(true);
      const result = await buy(player);
      if (!result.ok) {
        showToast(result.error, 'error', 5000, () => handleBuy(player));
        return;
      }
      setMySquad(prev => ({ ...prev, players: result.players, budget_remaining: result.budget_remaining }));
      setBudget(result.budget_remaining);
    } finally { setSaving(false); }
  };

  const handleSell = (player) => {
    if (saving)   return;
    if (isLocked) { showToast('Transfers are locked until after the match.', 'warning'); return; }

    const isCaptain = mySquad?.captain_id === player.id;
    const isJoker   = todayJokerId === player.id;
    const warnings  = [];
    if (isCaptain) warnings.push('This player is your captain â€” selling them removes the armband.');
    if (isJoker)   warnings.push('This player is your Daily Joker â€” selling voids today\'s boost.');

    setConfirm({
      title:        `Sell ${player.name}?`,
      body:         `You will receive Â£${player.price}M back into your budget.`,
      warning:      warnings.length ? warnings.join(' ') : null,
      confirmLabel: 'Sell',
      danger:       true,
      onConfirm: async () => {
        try {
          setSaving(true);
          const result = await sell(player);
          if (!result.ok) {
            showToast(result.error, 'error', 5000, () => handleSell(player));
            return;
          }
          setMySquad(prev => ({ ...prev, players: result.players, budget_remaining: result.budget_remaining }));
          setBudget(result.budget_remaining);
        } finally { setSaving(false); }
      },
    });
  };

  const filteredPlayers = players.filter(p => {
    const matchesPos = filterPos === 'ALL' || p.position === filterPos;
    const matchesSearch = !searchQuery || p.name?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesPos && matchesSearch;
  });
  const squadCount  = mySquad?.players?.length || 0;
  const emptySlots  = Math.max(0, squadSize - squadCount);

  // League picker â€” shown when user has multiple leagues and none is selected
  if (leagues && leagues.length > 1 && !activeLeague) {
    return (
      <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-6 gap-4">
        <div className="text-[13px] font-black uppercase tracking-widest mb-2" style={{ color: 'var(--mute)', fontFamily: 'Archivo Black, sans-serif' }}>
          Select a League
        </div>
        {leagues.map(l => (
          <button
            key={l.id}
            onClick={() => { setActiveLeague(l.id); if (l.tournament_id) setTournamentId(l.tournament_id); else resolveLeagueTournament(l.id); }}
            className="w-full max-w-sm px-5 py-4 rounded-sm text-left transition-all active:opacity-70"
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

      {/* â”€â”€ Squad data load error â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {takenMapError && (
        <div
          className="flex items-center gap-3 px-5 py-3"
          style={{ background: 'rgba(240,58,58,0.10)', borderBottom: '1px solid rgba(240,58,58,0.25)' }}
        >
          <span style={{ color: 'var(--danger)', fontSize: 13 }}>âš  {takenMapError}</span>
        </div>
      )}

      {/* â”€â”€ Transfer Window Lock Banner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {isLocked && (
        <div
          className="flex items-center gap-3 px-5 py-3"
          style={{ background: 'rgba(240,58,58,0.10)', borderBottom: '1px solid rgba(240,58,58,0.25)' }}
        >
          <span className="fk-mono" style={{ fontSize: 9, color: 'var(--danger)' }}>LCK</span>
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

      {/* â”€â”€ Sticky Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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
        <div className="px-5 pt-3.5 pb-2.5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <div
              className="fz-label"
              style={{ color: isLocked ? 'var(--danger)' : 'var(--mute)' }}
            >
              {isLocked ? 'WINDOW CLOSED' : 'Transfer Window'}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <div
                className="text-[18px] lg:text-[24px] font-black uppercase leading-tight tracking-tight"
                style={{ fontFamily: 'Archivo Black, sans-serif', color: 'var(--paper)' }}
              >
                Player Market
              </div>
              <button
                onClick={replayMarketTour}
                title="Replay market tour"
                style={{
                  width: 20, height: 20, borderRadius: '50%',
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'rgba(255,255,255,0.05)',
                  color: 'rgba(255,255,255,0.4)',
                  fontSize: 10, fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}
              >?</button>
              <LeagueSelector value={activeLeague} onChange={setActiveLeague} />
            </div>
          </div>

          <div className="flex items-center gap-3 lg:gap-5 flex-wrap lg:flex-nowrap">
            {/* Squad count */}
            <div className="text-right">
              <div className="fz-label" style={{ color: 'var(--mute)', fontSize: 10 }}>Squad</div>
              <div
                className="text-[16px] lg:text-[20px] font-black tabular-nums leading-tight"
                style={{ fontFamily: 'Archivo Black, sans-serif', color: squadCount >= squadSize ? 'var(--positive)' : 'var(--paper)' }}
              >
                {squadCount}
                <span className="text-[10px] lg:text-[12px] font-normal" style={{ color: 'var(--mute)' }}>/{squadSize}</span>
              </div>
            </div>

            {/* Budget + empty slots */}
            <div className="text-right" data-tour="market-budget">
              <div className="fz-label" style={{ color: 'var(--mute)', fontSize: 10 }}>Budget</div>
              <div
                className="text-[16px] lg:text-[20px] font-black tabular-nums leading-tight"
                style={{ fontFamily: 'Archivo Black, sans-serif', color: (budget ?? 0) < 5 ? 'var(--danger)' : 'var(--cyan)' }}
              >
                Â£{(budget ?? 0).toFixed(1)}
                <span className="text-[10px] lg:text-[12px] font-normal" style={{ color: 'var(--mute)' }}>M</span>
              </div>
              {emptySlots > 0 && (
                <div className="text-[9px] font-black mt-0.5" style={{ color: 'var(--gold)', fontFamily: 'Archivo Black, sans-serif' }}>
                  {emptySlots} empty
                </div>
              )}
            </div>

            {/* Auto-fill button */}
            <button
              onClick={handleAutoFill}
              disabled={autoFilling}
              style={{
                padding: '6px 10px',
                background: 'rgba(0,196,232,0.08)',
                border: '1px solid rgba(0,196,232,0.25)',
                color: autoFilling ? 'var(--mute)' : 'var(--cyan)',
                fontFamily: 'Archivo Black, sans-serif',
                fontSize: 8,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                borderRadius: 2,
                cursor: autoFilling ? 'wait' : 'pointer',
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              {autoFilling ? 'FILLING' : 'âš¡ FILL'}
            </button>
          </div>
        </div>

        {/* Auto-fill feedback message */}
        {autoFillMsg && (
          <div style={{ padding: '0 20px 8px', color: 'var(--mute)', fontFamily: 'JetBrains Mono, monospace', fontSize: 10 }}>
            {autoFillMsg}
          </div>
        )}

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
              <span className="text-[8px]">âˆž</span>
              <span
                className="text-[8px] font-black uppercase"
                style={{ color: 'var(--positive)', fontFamily: 'Archivo Black, sans-serif', letterSpacing: '0.08em' }}
              >
                WC
              </span>
            </div>
          )}
        </div>

        {/* Search input */}
        <div className="px-5 py-2.5 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <input
            type="text"
            placeholder="Search player nameâ€¦"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full outline-none text-[13px]"
            style={{
              padding: '8px 12px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '4px',
              color: 'var(--paper)',
              fontFamily: 'Archivo, sans-serif',
              caretColor: 'var(--cyan)',
            }}
          />
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

      {/* â”€â”€ Player List â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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
        <div ref={marketListRef} data-tour="market-player-list" className="pb-24 lg:pb-6" style={{ scrollBehavior: 'auto' }}>
          {filteredPlayers.map((p) => {
            const inMySquad    = mySquad?.players?.includes(p.id);
            const isOwned      = inMySquad || isOwnedBy(p.id);
            const takenByOther = !isOwned && isTaken(p.id);
            const ownerName    = takenBy(p.id);
            const limitReached = stats.posCounts[p.position] >= POS_LIMITS[p.position];
            const canAfford    = budget >= p.price;
            const hasLeague    = !!activeLeague;
            const canBuy       = hasLeague && !isOwned && !takenByOther && !limitReached && canAfford && (mySquad?.players?.length ?? 0) < squadSize;
            const isJoker      = p.id === todayJokerId;
            const intel        = p.intel;

            return (
              <div
                key={p.id}
                className="flex items-center px-4 py-2.5 gap-3 transition-all duration-150"
                style={{
                  borderBottom: '1px solid var(--rule)',
                  background:   isOwned ? 'rgba(0,180,216,0.05)' : takenByOther ? 'rgba(239,68,68,0.02)' : 'transparent',
                  borderLeft:   isOwned ? '2px solid var(--cyan)' : takenByOther ? '2px solid rgba(239,68,68,0.3)' : '2px solid transparent',
                  opacity:      takenByOther ? 0.65 : 1,
                }}
              >
                {/* Position chip â€” replaces circle avatar */}
                <PositionChip pos={p.position} />

                {/* Status dot + name block */}
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  {intel && <StatusDot status={intel.status ?? 'fit'} />}
                  <div className="min-w-0">
                    {/* Name */}
                    <div className="flex items-center flex-wrap gap-1.5">
                      <span
                        className="fk-display truncate"
                        style={{ fontSize: 13, color: 'var(--paper)', letterSpacing: '-0.01em' }}
                      >
                        {p.name.toUpperCase()}
                      </span>
                      {isOwned && (
                        <span className="fk-mono shrink-0" style={{ fontSize: 8, color: 'var(--cyan)', border: '1px solid var(--cyan)', padding: '1px 5px' }}>
                          OWNED
                        </span>
                      )}
                      {takenByOther && (
                        <span className="fk-mono shrink-0" style={{ fontSize: 8, color: 'var(--danger)', border: '1px solid var(--danger)', padding: '1px 5px' }}>
                          {ownerName ? `TAKEN Â· ${ownerName}` : 'TAKEN'}
                        </span>
                      )}
                      {isJoker && (
                        <span className="fk-mono shrink-0" style={{ fontSize: 8, color: 'var(--pos-gk)', border: '1px solid var(--pos-gk)', padding: '1px 5px' }}>
                          JOKER
                        </span>
                      )}
                    </div>
                    {/* Metadata */}
                    <div className="fk-mono mt-0.5" style={{ fontSize: 9, color: 'var(--mute)', letterSpacing: '0.14em' }}>
                      {p.club}{p.country ? ` Â· ${p.country}` : ''}
                    </div>
                  </div>
                </div>

                {/* Price + action */}
                <div className="shrink-0 flex items-center gap-3">
                  <div className="text-right">
                    <div
                      className="fk-display tabular-nums"
                      style={{ fontSize: 16, color: canAfford || isOwned ? 'var(--paper)' : 'var(--danger)', letterSpacing: '-0.02em' }}
                    >
                      Â£{p.price}
                      <span className="fk-mono" style={{ fontSize: 9, color: 'var(--mute)', fontWeight: 400 }}>M</span>
                    </div>
                  </div>

                  {isLocked ? (
                    <div
                      className="fk-mono"
                      style={{
                        minWidth: 52, padding: '6px 10px', textAlign: 'center',
                        border: '1px solid var(--rule)', color: 'var(--mute)',
                        fontSize: 9, opacity: 0.6,
                      }}
                    >
                      LOCKED
                    </div>
                  ) : isOwned ? (
                    <button
                      onClick={() => handleSell(p)}
                      disabled={saving}
                      className="fk-mono transition-all active:scale-95 disabled:opacity-40"
                      style={{
                        minWidth: 52, padding: '6px 10px',
                        border: '1px solid var(--danger)',
                        color: 'var(--danger)',
                        background: 'transparent',
                        fontSize: 9, letterSpacing: '0.18em',
                      }}
                    >
                      SELL
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
                      className="fk-mono transition-all active:scale-95"
                      style={{
                        minWidth: 52, padding: '6px 10px',
                        border: `1px solid ${canBuy ? 'var(--cyan)' : 'var(--rule)'}`,
                        color: canBuy ? 'var(--cyan)' : 'var(--mute)',
                        background: 'transparent',
                        fontSize: 9, letterSpacing: '0.18em',
                        cursor: canBuy ? 'pointer' : 'not-allowed',
                        opacity: saving ? 0.5 : 1,
                      }}
                    >
                      BUY
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {filteredPlayers.length === 0 && !loading && (
            <div className="p-12 text-center">
              <div className="fk-mono mb-3" style={{ fontSize: 9, color: 'var(--mute)' }}>NO RESULTS</div>
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
          Max {COUNTRY_LIMIT} per club (Joker exempt) Â· Max {squadSize} players Â· Â£{cfg.budgetTotal}M budget
        </span>
      </div>
    </div>
  );
}
