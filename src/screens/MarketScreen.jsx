import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
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
import { usePlayerStats } from '../hooks/usePlayerStats';
import FormStrip from '../components/FormStrip';
import PlayerStatsPanel from '../components/PlayerStatsPanel';

const COUNTRY_LIMIT = 3;

const FLAG_MAP = {
  FRA: '🇫🇷', BRA: '🇧🇷', ENG: 'ðŸ´ó §ó ¢ó ¥ó ®ó §ó ¿', ESP: '🇪🇸', BEL: '🇧🇪', POR: '🇵🇹',
  MAR: '🇲🇦', URU: '🇺🇾', ITA: '🇮🇹', NOR: '🇳🇴', GER: '🇩🇪', ARG: '🇦🇷',
  EGY: '🇪🇬', NED: '🇳🇱', CRO: '🇭🇷',
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
    body:   'Every player you buy deducts from your £100M budget. Sell players back to free up funds — but the window closes before each matchday.',
  },
  {
    target: 'market-player-list',
    title:  'Buy & Sell',
    body:   'Tap a player to expand their card, then hit Buy or Sell. Prices update each matchday based on ownership and performance.',
  },
];

export default function MarketScreen() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { show: showToast } = useToast();
  const [searchParams] = useSearchParams();
  const leagueId = searchParams.get('leagueId') || searchParams.get('league');
  const { showMarketTour, completeMarketTour, replayMarketTour } = useOnboarding();
  const [players,       setPlayers]       = useState([]);
  const [mySquad,       setMySquad]       = useState(null);
  const [leagues,       setLeagues]       = useState(null);   // null = not yet loaded
  const [activeLeague,  setActiveLeague]  = useState(leagueId);
  const [tournamentId,  setTournamentId]  = useState(null);
  const [leagueFormat,  setLeagueFormat]  = useState('classic'); // 'classic' | 'noduplicate'
  const [todayJokerId,  setTodayJokerId]  = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [filterPos,     setFilterPos]     = useState(() => localStorage.getItem('market_filterPos') || 'ALL');
  const [searchQuery,   setSearchQuery]   = useState(() => localStorage.getItem('market_searchQuery') || '');
  const [selectedTeams, setSelectedTeams] = useState(new Set());
  const [showTeamPicker, setShowTeamPicker] = useState(false);
  const [teamSearch,    setTeamSearch]    = useState('');
  const [budget,        setBudget]        = useState(0);      // loaded from league config
  const [saving,        setSaving]        = useState(false);
  const [isLocked,      setIsLocked]      = useState(false);
  const [confirm,       setConfirm]       = useState(null);
  const marketListRef   = useRef(null);

  // Competition-agnostic config from the selected league row
  const cfg = useLeagueConfig(activeLeague);
  const POS_LIMITS = cfg.positionLimits;
  const squadSize  = cfg.squadSize;

  // Draft gate: noduplicate leagues with no processed allocation go to draft screen or recovery
  useEffect(() => {
    if (cfg.loading || !user?.id || !activeLeague) return;
    if (cfg.format !== 'noduplicate') return;
    let cancelled = false;
    (async () => {
      const { count } = await supabase
        .from('draft_allocations')
        .select('id', { count: 'exact', head: true })
        .eq('league_id', activeLeague)
        .not('allocated_players', 'is', null);
      if (cancelled) return;
      // Draft ran → allow market access. Draft not run → go submit picks.
      if (!count || count === 0) navigate(`/league/${activeLeague}/draft`);
    })();
    return () => { cancelled = true; };
  }, [cfg.loading, cfg.format, user?.id, activeLeague]);

  // League-scoped transfer state
  const { buy, sell, isTaken, takenBy, isOwnedBy, takenMapError, takenMap } = useTransfer(activeLeague);

  // Form history — last 5 GW points per player for this tournament
  const { statsMap } = usePlayerStats(tournamentId);

  // Expandable stats panel state
  const [expandedPlayerId, setExpandedPlayerId] = useState(null);
  const [playerDetails,    setPlayerDetails]    = useState({});
  const loadedRef = useRef(new Set());

  const togglePanel = useCallback(async (playerId) => {
    setExpandedPlayerId(prev => prev === playerId ? null : playerId);
    if (loadedRef.current.has(playerId)) return;
    loadedRef.current.add(playerId);

    try {
      const { data: stats } = await supabase
        .from('player_match_stats')
        .select('fantasy_points, fixture_id, goals, assists, clean_sheet, minutes_played')
        .eq('player_id', playerId)
        .limit(200);

      if (!stats?.length) {
        setPlayerDetails(prev => ({ ...prev, [playerId]: { rounds: [], season: { apps: 0, goals: 0, assists: 0, pts: 0, avgPts: '0.0' } } }));
        return;
      }

      const fixtureIds = [...new Set(stats.map(s => s.fixture_id))];
      const { data: fixtures } = await supabase
        .from('fixtures')
        .select('id, matchday_id, home_team, away_team, kickoff_at')
        .in('id', fixtureIds)
        .eq('status', 'finished')
        .order('kickoff_at', { ascending: false });

      const fixtureMap = {};
      (fixtures ?? []).forEach(f => { fixtureMap[f.id] = f; });

      // Aggregate per matchday (single fixture per player per round in practice)
      const byMD = {};
      for (const s of stats) {
        const f = fixtureMap[s.fixture_id];
        if (!f) continue;
        const md = f.matchday_id;
        if (!byMD[md]) {
          const home = (f.home_team ?? '?').substring(0, 3).toUpperCase();
          const away = (f.away_team ?? '?').substring(0, 3).toUpperCase();
          byMD[md] = { kickoff: f.kickoff_at, fixture: `${home} vs ${away}`, goals: 0, assists: 0, cs: false, mins: 0, pts: 0 };
        }
        byMD[md].goals   += s.goals          ?? 0;
        byMD[md].assists += s.assists         ?? 0;
        byMD[md].cs       = byMD[md].cs || !!(s.clean_sheet);
        byMD[md].mins    += s.minutes_played  ?? 0;
        byMD[md].pts     += Number(s.fantasy_points ?? 0);
      }

      const sorted = Object.entries(byMD)
        .sort((a, b) => b[1].kickoff.localeCompare(a[1].kickoff));

      const rounds = sorted.slice(0, 5).map(([md, r]) => ({
        gw:      md.includes('-r') ? `R${md.split('-r')[1]}` : md,
        fixture: r.fixture,
        goals:   r.goals,
        assists: r.assists,
        cs:      r.cs,
        mins:    r.mins,
        pts:     r.pts,
      }));

      const allRounds  = sorted.map(([, r]) => r);
      const totalPts   = allRounds.reduce((s, r) => s + r.pts, 0);
      const totalGoals = allRounds.reduce((s, r) => s + r.goals, 0);
      const totalAst   = allRounds.reduce((s, r) => s + r.assists, 0);
      const apps       = allRounds.filter(r => r.mins > 0).length;

      setPlayerDetails(prev => ({
        ...prev,
        [playerId]: {
          rounds,
          season: { apps, goals: totalGoals, assists: totalAst, pts: Math.round(totalPts), avgPts: apps > 0 ? (totalPts / apps).toFixed(1) : '0.0' },
        },
      }));
    } catch (err) {
      console.error('PlayerStatsPanel load failed', err);
      setPlayerDetails(prev => ({ ...prev, [playerId]: { rounds: [], season: null } }));
    }
  }, []);

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

  // Auto-fill hook — reusable across screens
  const { handleAutoFill, autoFilling, autoFillMsg } = useAutoFill(activeLeague, mySquad, fetchSquad, takenMap, buy, cfg);

  // Mirror auto-fill messages to the toast system so they're always visible
  const prevAutoFillMsg = useRef(null);
  useEffect(() => {
    if (autoFillMsg && autoFillMsg !== prevAutoFillMsg.current) {
      const isSuccess = autoFillMsg.startsWith('Added');
      showToast(autoFillMsg, isSuccess ? 'success' : 'warning', 6000);
    }
    prevAutoFillMsg.current = autoFillMsg;
  }, [autoFillMsg, showToast]);

  const resolveLeagueTournament = async (lid) => {
    const { data } = await supabase
      .from('leagues')
      .select('tournament_id, format')
      .eq('id', lid)
      .maybeSingle();
    if (data?.tournament_id) setTournamentId(data.tournament_id);
    if (data?.format) setLeagueFormat(data.format);
  };

  // On mount: resolve league context
  useEffect(() => {
    const init = async () => {
      if (leagueId) {
        setActiveLeague(leagueId);
        resolveLeagueTournament(leagueId);
        return;
      }
      // No leagueId in URL — fetch user's leagues
      const { data } = await supabase
        .from('league_members')
        .select('league_id, leagues(id, name, tournament_id, format)')
        .eq('user_id', user?.id);
      const list = (data ?? []).map(r => ({ id: r.league_id, name: r.leagues?.name ?? r.league_id, tournament_id: r.leagues?.tournament_id, format: r.leagues?.format }));
      if (list.length === 1) {
        setActiveLeague(list[0].id);
        if (list[0].tournament_id) setTournamentId(list[0].tournament_id);
        if (list[0].format) setLeagueFormat(list[0].format);
        setLeagues([]);
      } else {
        setLeagues(list);
      }
    };
    if (user?.id) init();
  }, [user?.id, leagueId]);

  const fetchMarketParams = async () => {
    setLoading(true);

    // â"€â"€ 1. Players — filtered by competition when known â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
    try {
      // Supabase JS default row cap is 1,000. WC has 1,680+ players — without an
      // explicit limit the cheapest ~680 are silently cut off, so cheap owned
      // players don't appear and the position tiles show wrong counts.
      let playersQuery = supabase.from('players').select('*')
        .order('price', { ascending: false })
        .limit(5000);
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

    // ── 2. Transfer window lock — use canonical matchday_id from tournament ──
    try {
      let deadlineQuery = supabase
        .from('matchday_deadlines')
        .select('deadline_at')
        .gt('deadline_at', new Date().toISOString())
        .order('deadline_at', { ascending: true });

      if (tournamentId) {
        deadlineQuery = deadlineQuery.eq('tournament_id', tournamentId);
      }

      const { data: deadlineRow } = await deadlineQuery.limit(1).maybeSingle();
      const deadline = deadlineRow?.deadline_at ? new Date(deadlineRow.deadline_at) : null;
      setIsLocked(deadline ? new Date() >= deadline : false);
    } catch (err) {
      console.error('MarketScreen: deadline fetch failed', err);
    }

    // â"€â"€ 3. Squad & joker â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
    try {
      const userId = user?.id;
      if (userId) {
        let squadQuery = supabase.from('squads').select('*').eq('user_id', userId);
        if (activeLeague) squadQuery = squadQuery.eq('league_id', activeLeague);
        const [{ data: sData }, { data: jData }] = await Promise.all([
          squadQuery.order('created_at', { ascending: false }).limit(1).maybeSingle(),
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

  useEffect(() => {
    // Only fetch once both activeLeague and tournamentId are known.
    // - !activeLeague: initial mount before the init effect has resolved the league.
    // - activeLeague && !tournamentId: league resolved but tournament lookup still in flight.
    // Both states would produce an unfiltered 5000-player fetch; skip and wait.
    if (!activeLeague || !tournamentId) return;
    fetchMarketParams();
  }, [activeLeague, tournamentId]);

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
    if ((mySquad?.players?.length ?? 0) >= squadSize) { showToast('Squad is full — sell a player first.', 'warning'); return; }
    if (stats.posCounts[player.position] >= POS_LIMITS[player.position]) { showToast(`Max ${player.position}s reached.`, 'warning'); return; }
    // U26: club cap preflight check
    if ((stats.countryCounts[player.club] ?? 0) >= COUNTRY_LIMIT) { showToast(`Max ${COUNTRY_LIMIT} players per club — ${player.club} is full.`, 'warning'); return; }
    if (budget < player.price) { showToast('Not enough budget.', 'error'); return; }
    try {
      setSaving(true);
      const result = await buy(player);
      if (!result.ok) {
        // No retry for limit/constraint errors — retrying always re-fails
        const isRetryable = result.error !== 'TRANSFER_LIMIT_REACHED'
          && !result.error?.includes('limit')
          && !result.error?.includes('full');
        showToast(result.error, 'error', 5000, isRetryable ? () => handleBuy(player) : undefined);
        return;
      }
      setMySquad(prev => ({ ...prev, players: result.players, budget_remaining: result.budget_remaining }));
      setBudget(result.budget_remaining);
      fetchSquad();
    } finally { setSaving(false); }
  };

  const handleSell = (player) => {
    if (saving)   return;
    if (isLocked) { showToast('Transfers are locked until after the match.', 'warning'); return; }

    const isCaptain = mySquad?.captain_id === player.id;
    const isJoker   = todayJokerId === player.id;
    const warnings  = [];
    if (isCaptain) warnings.push('This player is your captain — selling them removes the armband.');
    if (isJoker)   warnings.push('This player is your Daily Joker — selling voids today\'s boost.');

    setConfirm({
      title:        `Sell ${player.name}?`,
      body:         `You will receive £${player.price}M back into your budget.`,
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

  const availableTeams = useMemo(() => {
    const teams = new Set(players.map(p => p.club).filter(Boolean));
    return [...teams].sort((a, b) => a.localeCompare(b));
  }, [players]);

  const filteredPlayers = useMemo(() => {
    const filtered = players.filter(p => {
      const matchesPos    = filterPos === 'ALL' || p.position === filterPos;
      const matchesSearch = !searchQuery || p.name?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesTeam   = selectedTeams.size === 0 || selectedTeams.has(p.club);
      return matchesPos && matchesSearch && matchesTeam;
    });
    // Own players always float to the top; within each group sort by price descending
    const owned = mySquad?.players ?? [];
    return filtered.sort((a, b) => {
      const aOwned = owned.includes(a.id) ? 1 : 0;
      const bOwned = owned.includes(b.id) ? 1 : 0;
      if (aOwned !== bOwned) return bOwned - aOwned;
      return b.price - a.price;
    });
  }, [players, filterPos, searchQuery, selectedTeams, mySquad]);
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
      {/* Team picker backdrop — closes dropdown on outside tap */}
      {showTeamPicker && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 55 }}
          onClick={() => { setShowTeamPicker(false); setTeamSearch(''); }}
        />
      )}
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

      {/* â"€â"€ Squad data load error â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      {takenMapError && (
        <div
          className="flex items-center gap-3 px-5 py-3"
          style={{ background: 'rgba(240,58,58,0.10)', borderBottom: '1px solid rgba(240,58,58,0.25)' }}
        >
          <span style={{ color: 'var(--danger)', fontSize: 13 }}>⚠  {takenMapError}</span>
        </div>
      )}

      {/* â"€â"€ Transfer Window Lock Banner â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
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

      {/* â"€â"€ Sticky Header â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      <div
        className="sticky top-0"
        style={{
          background: 'rgba(13,17,23,0.97)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          position: 'relative',
          zIndex: 60,
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
                £{(budget ?? 0).toFixed(1)}
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
              onClick={isLocked ? () => showToast('Transfer window is closed — the commissioner must open it first.', 'warning') : handleAutoFill}
              disabled={autoFilling}
              title={isLocked ? 'Transfer window closed' : emptySlots === 0 ? 'Squad is full' : `Fill ${emptySlots} empty slot${emptySlots > 1 ? 's' : ''}`}
              style={{
                padding: '6px 10px',
                background: isLocked ? 'rgba(239,68,68,0.06)' : 'rgba(0,196,232,0.08)',
                border: isLocked ? '1px solid rgba(239,68,68,0.25)' : '1px solid rgba(0,196,232,0.25)',
                color: autoFilling ? 'var(--mute)' : isLocked ? 'var(--danger)' : 'var(--cyan)',
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
              {autoFilling ? 'FILLING…' : isLocked ? '🔒 WINDOW CLOSED' : '⚡ FILL'}
            </button>
          </div>
        </div>

        {/* Auto-fill feedback message */}
        {autoFillMsg && (
          <div style={{ padding: '0 20px 8px', color: 'var(--mute)', fontFamily: 'JetBrains Mono, monospace', fontSize: 10 }}>
            {autoFillMsg}
          </div>
        )}

        {/* Position quota row — red=empty, yellow=partial, green=full */}
        <div className="flex gap-1.5 px-5 pb-2.5">
          {(['GK', 'DEF', 'MID', 'FWD']).map(pos => {
            const count  = stats.posCounts[pos];
            const max    = POS_LIMITS[pos];
            const pct    = (count / max) * 100;
            const status = count === 0 ? 'empty' : count >= max ? 'full' : 'partial';
            const statusColor = status === 'empty' ? 'var(--danger)' : status === 'full' ? 'var(--positive)' : 'var(--gold)';
            const statusBg    = status === 'empty' ? 'rgba(240,58,58,0.10)' : status === 'full' ? 'rgba(24,201,107,0.10)' : 'rgba(240,180,0,0.08)';
            return (
              <div
                key={pos}
                className="flex-1 rounded-sm overflow-hidden"
                style={{ background: statusBg, border: `1px solid ${statusColor}30` }}
                title={`${pos}: ${count}/${max}`}
              >
                {/* Fill bar */}
                <div
                  className="h-[3px] transition-all duration-300"
                  style={{ width: `${pct}%`, background: statusColor }}
                />
                <div className="px-1.5 py-1 flex items-center justify-between">
                  <span className="text-[9px] font-black uppercase" style={{ color: statusColor, fontFamily: 'Archivo Black, sans-serif', letterSpacing: '0.08em' }}>
                    {pos}
                  </span>
                  <span className="text-[9px] font-black tabular-nums" style={{ color: statusColor, fontFamily: 'Archivo Black, sans-serif' }}>
                    {count}/{max}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Search + Team filter row */}
        <div className="px-5 py-2.5 border-t flex gap-2 items-center" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <input
            type="text"
            placeholder="Search player name…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 outline-none text-[13px]"
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
          {/* Team filter toggle button */}
          <button
            onClick={() => setShowTeamPicker(v => !v)}
            style={{
              padding: '8px 12px', flexShrink: 0,
              background: selectedTeams.size > 0 ? 'rgba(0,180,216,0.12)' : 'rgba(255,255,255,0.04)',
              border: selectedTeams.size > 0 ? '1px solid rgba(0,180,216,0.4)' : '1px solid rgba(255,255,255,0.1)',
              borderRadius: '4px',
              color: selectedTeams.size > 0 ? 'var(--cyan)' : 'var(--mute)',
              fontFamily: 'Archivo Black, sans-serif',
              fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {selectedTeams.size > 0 ? `${selectedTeams.size} Club${selectedTeams.size > 1 ? 's' : ''}` : 'Club ▾'}
          </button>
        </div>

        {/* Team picker dropdown */}
        {showTeamPicker && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 60,
            background: 'var(--ink)', border: '1px solid rgba(255,255,255,0.12)',
            borderTop: 'none', maxHeight: 320, display: 'flex', flexDirection: 'column',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          }}>
            {/* Team search */}
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--rule)', flexShrink: 0 }}>
              <input
                type="text"
                placeholder="Search club…"
                value={teamSearch}
                onChange={e => setTeamSearch(e.target.value)}
                autoFocus
                style={{
                  width: '100%', padding: '6px 10px', outline: 'none',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 3, color: 'var(--paper)', fontFamily: 'Archivo, sans-serif', fontSize: 12,
                  caretColor: 'var(--cyan)',
                }}
              />
            </div>
            {/* Team list */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {availableTeams
                .filter(t => !teamSearch || t.toLowerCase().includes(teamSearch.toLowerCase()))
                .map(team => {
                  const checked = selectedTeams.has(team);
                  return (
                    <button
                      key={team}
                      onClick={() => setSelectedTeams(prev => {
                        const next = new Set(prev);
                        if (next.has(team)) next.delete(team); else next.add(team);
                        return next;
                      })}
                      style={{
                        width: '100%', textAlign: 'left', padding: '9px 14px',
                        display: 'flex', alignItems: 'center', gap: 10,
                        background: checked ? 'rgba(0,180,216,0.08)' : 'transparent',
                        border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{
                        width: 14, height: 14, border: checked ? 'none' : '1px solid rgba(255,255,255,0.25)',
                        background: checked ? 'var(--cyan)' : 'transparent',
                        borderRadius: 2, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {checked && <span style={{ color: 'var(--ink)', fontSize: 10, fontWeight: 900 }}>✓</span>}
                      </div>
                      <span style={{ fontFamily: 'Archivo, sans-serif', fontSize: 12, color: checked ? 'var(--cyan)' : 'var(--paper)' }}>
                        {team}
                      </span>
                    </button>
                  );
                })}
            </div>
            {/* Footer: Clear + Apply */}
            <div style={{ padding: '10px 14px', borderTop: '1px solid var(--rule)', display: 'flex', gap: 8, flexShrink: 0 }}>
              <button
                onClick={() => { setSelectedTeams(new Set()); setShowTeamPicker(false); setTeamSearch(''); }}
                style={{
                  flex: 1, padding: '7px', background: 'transparent',
                  border: '1px solid var(--rule)', color: 'var(--mute)',
                  fontFamily: 'Archivo Black, sans-serif', fontSize: 9, letterSpacing: '.1em',
                  textTransform: 'uppercase', cursor: 'pointer', borderRadius: 3,
                }}
              >
                Clear
              </button>
              <button
                onClick={() => { setShowTeamPicker(false); setTeamSearch(''); }}
                style={{
                  flex: 2, padding: '7px', background: 'var(--cyan)', border: 'none',
                  color: 'var(--ink)', fontFamily: 'Archivo Black, sans-serif', fontSize: 9,
                  letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer', borderRadius: 3,
                }}
              >
                {selectedTeams.size > 0 ? `Show ${selectedTeams.size} Club${selectedTeams.size > 1 ? 's' : ''}` : 'Apply'}
              </button>
            </div>
          </div>
        )}

        {/* Position filter tabs — dot shows red/yellow/green fill status */}
        <div
          className="flex"
          data-tour="market-filters"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          {POS_FILTER_ORDER.map(pos => {
            const isActive = filterPos === pos;
            const posColor = pos !== 'ALL' ? (POS_CONFIG[pos]?.color ?? 'var(--paper)') : 'var(--paper)';
            const activeColor = isActive ? posColor : 'var(--mute)';
            // Status dot for position tabs (not for ALL)
            const count  = pos !== 'ALL' ? stats.posCounts[pos] : null;
            const max    = pos !== 'ALL' ? POS_LIMITS[pos] : null;
            const dotColor = pos === 'ALL' ? null
              : count === 0 ? 'var(--danger)'
              : count >= max ? 'var(--positive)'
              : 'var(--gold)';
            return (
              <button
                key={pos}
                onClick={() => setFilterPos(pos)}
                className="flex-1 min-w-0 py-2.5 transition-all duration-150 relative flex flex-col items-center gap-1"
                style={{
                  fontFamily: 'Archivo Black, sans-serif',
                  fontSize: '11px',
                  fontWeight: 800,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: activeColor,
                  background: isActive ? `${posColor}0F` : 'transparent',
                }}
              >
                {pos}
                {dotColor && (
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                )}
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: posColor }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* â"€â"€ Player List â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
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
            // In Draft mode each player belongs to one manager — block if taken.
            // In Classic mode any player can be in multiple squads simultaneously.
            const isDraftLeague = leagueFormat === 'noduplicate';
            const takenByOther = isDraftLeague && !isOwned && isTaken(p.id);
            const ownerName    = takenBy(p.id);
            const limitReached = stats.posCounts[p.position] >= POS_LIMITS[p.position];
            // U26: club cap guard
            const clubFull     = !isOwned && (stats.countryCounts[p.club] ?? 0) >= COUNTRY_LIMIT;
            const canAfford    = budget >= p.price;
            const hasLeague    = !!activeLeague;
            const canBuy       = hasLeague && !isOwned && !takenByOther && !limitReached && !clubFull && canAfford && (mySquad?.players?.length ?? 0) < squadSize;
            const isJoker      = p.id === todayJokerId;
            const intel        = p.intel;

            const isExpanded = expandedPlayerId === p.id;

            return (
              <div key={p.id}>
              <div
                className="flex items-center px-4 py-2.5 gap-3 transition-all duration-150"
                style={{
                  borderBottom: isExpanded ? 'none' : '1px solid var(--rule)',
                  background:   isOwned ? 'rgba(0,180,216,0.05)' : takenByOther ? 'rgba(239,68,68,0.02)' : 'transparent',
                  borderLeft:   isOwned ? '2px solid var(--cyan)' : takenByOther ? '2px solid rgba(239,68,68,0.3)' : '2px solid transparent',
                  opacity:      takenByOther ? 0.65 : 1,
                }}
              >
                {/* Position chip — replaces circle avatar */}
                <PositionChip pos={p.position} />

                {/* Status dot + name block */}
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  {intel && <StatusDot status={intel.status ?? 'fit'} />}
                  <div className="min-w-0">
                    {/* Name — tap to expand stats panel */}
                    <div
                      className="flex items-center flex-wrap gap-1.5 cursor-pointer"
                      onClick={() => togglePanel(p.id)}
                    >
                      <span
                        className="fk-display truncate"
                        style={{ fontSize: 13, color: isExpanded ? 'var(--cyan)' : 'var(--paper)', letterSpacing: '-0.01em' }}
                      >
                        {p.name.toUpperCase()}
                      </span>
                      <span style={{ fontSize: 8, color: 'var(--mute)', lineHeight: 1, flexShrink: 0 }}>
                        {isExpanded ? '▲' : '▼'}
                      </span>
                      {isOwned && (
                        <span className="fk-mono shrink-0" style={{ fontSize: 9, fontWeight: 800, color: 'var(--cyan)', border: '1px solid var(--cyan)', padding: '2px 6px' }}>
                          OWNED
                        </span>
                      )}
                      {takenByOther && (
                        <span className="fk-mono shrink-0" style={{ fontSize: 9, fontWeight: 800, color: 'var(--danger)', border: '1px solid var(--danger)', padding: '2px 6px' }}>
                          {ownerName ? `TAKEN · ${ownerName}` : 'TAKEN'}
                        </span>
                      )}
                      {isJoker && (
                        <span className="fk-mono shrink-0" style={{ fontSize: 9, fontWeight: 800, color: 'var(--pos-gk)', border: '1px solid var(--pos-gk)', padding: '2px 6px' }}>
                          JOKER
                        </span>
                      )}
                    </div>
                    {/* Metadata */}
                    <div className="fk-mono mt-0.5" style={{ fontSize: 9, color: 'var(--mute)', letterSpacing: '0.14em' }}>
                      {p.club}{p.country ? ` · ${p.country}` : ''}
                    </div>
                    {/* Form strip — last 5 GW pts */}
                    <FormStrip rounds={statsMap[p.id]} />
                  </div>
                </div>

                {/* Price + action */}
                <div className="shrink-0 flex items-center gap-3">
                  <div className="text-right">
                    <div
                      className="fk-display tabular-nums"
                      style={{ fontSize: 16, color: canAfford || isOwned ? 'var(--paper)' : 'var(--danger)', letterSpacing: '-0.02em' }}
                    >
                      £{p.price}
                      <span className="fk-mono" style={{ fontSize: 9, color: 'var(--mute)', fontWeight: 400 }}>M</span>
                    </div>
                  </div>

                  {isLocked ? (
                    <div
                      className="fk-mono"
                      style={{
                        minWidth: 56, padding: '6px 10px', textAlign: 'center',
                        border: '1px solid var(--rule)', color: 'var(--mute)',
                        fontSize: 10, fontWeight: 800, opacity: 0.6,
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
                        minWidth: 56, padding: '6px 10px',
                        border: '1px solid var(--danger)',
                        color: 'var(--danger)',
                        background: 'transparent',
                        fontSize: 10, fontWeight: 800, letterSpacing: '0.14em',
                      }}
                    >
                      SELL
                    </button>
                  ) : clubFull ? (
                    <div
                      className="fk-mono"
                      style={{
                        minWidth: 56, padding: '6px 10px', textAlign: 'center',
                        border: '1px solid rgba(240,58,58,0.4)', color: 'var(--danger)',
                        fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', opacity: 0.85,
                      }}
                    >
                      CLUB FULL
                    </div>
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
                        minWidth: 56, padding: '6px 10px',
                        border: `1px solid ${canBuy ? 'var(--cyan)' : 'var(--rule)'}`,
                        color: canBuy ? 'var(--cyan)' : 'var(--mute)',
                        background: 'transparent',
                        fontSize: 10, fontWeight: 800, letterSpacing: '0.14em',
                        cursor: canBuy ? 'pointer' : 'not-allowed',
                        opacity: saving ? 0.5 : 1,
                      }}
                    >
                      BUY
                    </button>
                  )}
                </div>
              </div>
              {isExpanded && (
                <PlayerStatsPanel
                  detail={playerDetails[p.id]}
                  position={p.position}
                  isOwned={isOwned}
                  canBuy={canBuy}
                  saving={saving}
                  isLocked={isLocked}
                  onAction={(action) => action === 'buy' ? handleBuy(p) : handleSell(p)}
                />
              )}
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
          Max {COUNTRY_LIMIT} per club (Joker exempt) · Max {squadSize} players · £{cfg.budgetTotal}M budget
        </span>
      </div>
    </div>
  );
}
