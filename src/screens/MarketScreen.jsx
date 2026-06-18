import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { normalizeIntelligence } from '../lib/intelligence';
import { normalisePlayers, buildFixtureInfo, formatFixtureStatus } from '../lib/players';
import { useAuth } from '../hooks/useAuth';
import { useOnboarding } from '../hooks/useOnboarding';
import { useTransfer } from '../hooks/useTransfer';
import { useLeagueConfig } from '../hooks/useLeagueConfig';
import { useAutoFill } from '../hooks/useAutoFill';
import { useToast } from '../hooks/useToast';
import LeagueSelector    from '../components/LeagueSelector';
import ScoringInfoModal  from '../components/ScoringInfoModal';
import OnboardingTour  from '../components/OnboardingTour';
import ConfirmModal    from '../components/ConfirmModal';
import PositionChip    from '../components/PositionChip';
import StatusDot       from '../components/StatusDot';
import { POS_CONFIG, POS_FILTER_ORDER } from '../lib/formations';
import { usePlayerStats } from '../hooks/usePlayerStats';
import { usePlayerScoreDetail } from '../hooks/usePlayerScoreDetail';
import { useTransferWindow } from '../hooks/useTransferWindow';
import FormStrip from '../components/FormStrip';
import PlayerStatsPanel from '../components/PlayerStatsPanel';
import TransferWindowBanner from '../components/TransferWindowBanner';
import PlayerStatsDashboard from '../components/player/PlayerStatsDashboard';
import { useLeagueOwnership } from '../hooks/useLeagueOwnership';
import SelectLeaguePicker from '../components/league/SelectLeaguePicker';
import { deriveLeagueType } from '../components/league/LeagueBadgeHelpers';

// club cap is fetched dynamically per-round; default 3 until loaded


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
    body:   'Every player you buy deducts from your €100M budget. Sell players back to free up funds — but the window closes before each matchday.',
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
  const { showMarketTour, completeMarketTour } = useOnboarding();
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
  const [priceMin,      setPriceMin]      = useState(0);
  const [priceMax,      setPriceMax]      = useState(15);
  const [budget,          setBudget]          = useState(0);      // loaded from league config
  const [saving,          setSaving]          = useState(false);
  // Transfer quota
  const [transfersPerRound, setTransfersPerRound] = useState(3);  // free transfers allowed per round
  const [transferPenalty,   setTransferPenalty]   = useState(4);  // pts cost per extra buy (or array)
  const [activeMatchdayId,  setActiveMatchdayId]  = useState(null); // e.g. '623-r3'
  const [preCompetition,    setPreCompetition]    = useState(false); // true until first live/finished fixture
  const [freeTransfers,     setFreeTransfers]     = useState(false); // classic league: unlimited transfers while window open
  const [clubCap,           setClubCap]           = useState(3);    // dynamic per-round, from club_cap_rules
  const [activeRoundFixtures, setActiveRoundFixtures] = useState([]);
  const [confirm,       setConfirm]       = useState(null);
  const [basket,        setBasket]        = useState([]);  // pending [{type:'buy'|'sell', player}]
  const [confirming,    setConfirming]    = useState(false);
  const marketListRef   = useRef(null);

  // Competition-agnostic config from the selected league row
  const cfg = useLeagueConfig(activeLeague);
  const POS_LIMITS = cfg.positionLimits;
  const squadSize  = cfg.squadSize;

  // Live transfer window status — drives the top banner and lock state.
  // 'upcoming'  = closed (deadline passed, live-fixture lock, or scoring window)
  // 'open'      = transfers allowed
  // 'no_window' = no windows configured for this league → treat as open
  // 'loading'   = first fetch in flight → optimistic unlock (backend validates anyway)
  const transferWindow = useTransferWindow(activeLeague);
  // A squad that has never reached full size (initial_build_complete=false) is exempt
  // from the matchday window lock — mirrors the same exemption in process-transfer —
  // so a manager left short by a draft lottery can keep using the Market to finish
  // building their squad even while the window shows 'upcoming'.
  const isLocked = transferWindow.status === 'upcoming'
    && mySquad !== null
    && mySquad?.id !== null
    && mySquad?.initial_build_complete !== false;

  // Basket-simulated squad state — applies pending buys/sells on top of the actual squad.
  // Used for all validation (canBuy, position/club caps) and display (budget, squad count,
  // position bars) so the UI immediately reflects the full effect of pending changes.
  const effectiveSquadIds = useMemo(() => {
    const ids = new Set(mySquad?.players ?? []);
    for (const item of basket) {
      if (item.type === 'sell') ids.delete(item.player.id);
      if (item.type === 'buy')  ids.add(item.player.id);
    }
    return [...ids];
  }, [basket, mySquad]);

  const effectiveBudget = useMemo(() => {
    return basket.reduce((b, item) => (
      item.type === 'sell' ? b + item.player.price : b - item.player.price
    ), budget);
  }, [basket, budget]);

  // Draft leagues (incl. draft+H2H, format='noduplicate') have unlimited transfers —
  // mirrors the league_mode === 'draft' bypass in process-transfer's execute_transfer_atomic call.
  const isDraftLeague = leagueFormat === 'noduplicate';

  const penaltyPointsCost = useMemo(() => {
    if (!activeMatchdayId || basket.length === 0) return 0;
    // No penalty when window is unlimited, squad is still building, competition hasn't started,
    // or this is a draft league (unlimited transfers, no penalty mechanism applies)
    if (transferWindow?.windowType === 'unlimited') return 0;
    if (mySquad?.initial_build_complete === false)  return 0;
    if (preCompetition)                             return 0;
    if (isDraftLeague)                              return 0;
    if (freeTransfers)                              return 0;
    const freeUsed    = (mySquad?.round_transfers  ?? {})[activeMatchdayId] ?? 0;
    const penaltyUsed = (mySquad?.penalty_transfers ?? {})[activeMatchdayId] ?? 0;
    const basketBuys  = basket.filter(b => b.type === 'buy').length;
    const projFreeUsed = freeUsed + basketBuys;
    const basketPenBuys = Math.max(0, projFreeUsed - Math.max(freeUsed, transfersPerRound));
    const costs = Array.isArray(transferPenalty) ? transferPenalty : [transferPenalty ?? 4];
    return [...Array(basketPenBuys)].reduce((sum, _, i) =>
      sum + (costs[Math.min(penaltyUsed + i, costs.length - 1)] ?? costs[costs.length - 1]), 0);
  }, [basket, mySquad, activeMatchdayId, transfersPerRound, transferPenalty, transferWindow, preCompetition, isDraftLeague, freeTransfers]);

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
  const { expandedPlayerId, playerDetails, togglePanel } = usePlayerScoreDetail();

  // League ownership % per player — used in full stats dashboard
  const { ownershipMap } = useLeagueOwnership(activeLeague);

  // Full stats dashboard modal — set to a player object to open
  const [statsDashboardPlayer, setStatsDashboardPlayer] = useState(null);

  // Fetch squad for auto-fill
  // Keep a ref to the current players array so fetchSquad can access it
  // without a stale closure (fetchSquad is captured by useAutoFill's useCallback).
  const playersRef = useRef(players);
  useEffect(() => { playersRef.current = players; }, [players]);

  const fetchSquad = async () => {
    try {
      const userId = user?.id;
      if (userId) {
        const { data: sData } = await supabase
          .from('squads')
          .select('*')
          .eq('user_id', userId)
          .eq('league_id', activeLeague)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (sData) {
          setMySquad(sData);
          setBudget(Number(sData.budget_remaining ?? cfg.budgetTotal));

          // Backfill any squad players missing from the cached market list.
          // Auto-fill queries the DB fresh, so it can buy players that were
          // synced into the DB after this page loaded. Without this, those
          // players are not found in `players` and position bars show 0.
          const squadIds = sData.players ?? [];
          if (squadIds.length > 0) {
            const knownIds = new Set(playersRef.current.map(p => p.id));
            const missingIds = squadIds.filter(id => !knownIds.has(id));
            if (missingIds.length > 0) {
              const { data: missing } = await supabase
                .from('players').select('*').in('id', missingIds);
              if (missing?.length) {
                setPlayers(prev => {
                  const existingIds = new Set(prev.map(p => p.id));
                  const toAdd = normalisePlayers(missing).filter(p => !existingIds.has(p.id));
                  return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
                });
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('MarketScreen: squad refresh failed', err);
    }
  };

  // addToBasket: used by auto-fill to stage picks without committing transfers.
  // The user reviews the basket and hits Confirm when satisfied.
  const addToBasket = useCallback((player) => {
    setBasket(prev => {
      if (prev.some(b => b.player.id === player.id)) return prev; // already queued
      return [...prev, { type: 'buy', player }];
    });
  }, []);

  // Auto-fill hook — adds suggestions to basket (no DB writes until basket confirmed)
  const { handleAutoFill, autoFilling, autoFillMsg } = useAutoFill(activeLeague, mySquad, fetchSquad, takenMap, addToBasket, cfg, basket);

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
        .select('league_id, rank, total_points, leagues(id, name, tournament_id, format, h2h_enabled, league_mode)')
        .eq('user_id', user?.id);
      const rows = data ?? [];
      if (rows.length === 1) {
        const r = rows[0];
        setActiveLeague(r.league_id);
        if (r.leagues?.tournament_id) setTournamentId(r.leagues.tournament_id);
        if (r.leagues?.format) setLeagueFormat(r.leagues.format);
        setLeagues([]);
      } else {
        let memberCounts = {};
        if (rows.length > 0) {
          const { data: memberRows } = await supabase
            .from('league_members')
            .select('league_id')
            .in('league_id', rows.map(r => r.league_id));
          memberCounts = (memberRows ?? []).reduce((acc, m) => {
            acc[m.league_id] = (acc[m.league_id] || 0) + 1;
            return acc;
          }, {});
        }
        const list = rows.map(r => {
          const { type, format } = deriveLeagueType(r.leagues ?? {});
          return {
            id: r.league_id,
            name: r.leagues?.name ?? r.league_id,
            tournament_id: r.leagues?.tournament_id,
            rawFormat: r.leagues?.format,
            rank: r.rank,
            totalPoints: r.total_points,
            members: memberCounts[r.league_id],
            type, format,
          };
        });
        setLeagues(list);
      }
    };
    if (user?.id) init();
  }, [user?.id, leagueId]);

  const fetchMarketParams = async () => {
    setLoading(true);

    // â"€â"€ 1. Players — filtered by competition when known â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
    try {
      // Supabase PostgREST max_rows is set to 10,000 on this project (Dashboard →
      // Settings → API). WC 2026 has ~1,251 active players; .limit(5000) is a
      // conservative ceiling well within that cap.
      let playersQuery = supabase.from('players').select('*')
        .eq('is_active', true)
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

    // ── 2. Transfer window lock + active matchday_id ─────────────────────────
    try {
      let deadlineQuery = supabase
        .from('matchday_deadlines')
        .select('deadline_at, matchday_id')
        .gt('deadline_at', new Date().toISOString())
        .order('deadline_at', { ascending: true });

      if (tournamentId) {
        deadlineQuery = deadlineQuery.eq('tournament_id', tournamentId);
      }

      // Only need matchday_id here — lock state is derived from transferWindow.status
      const { data: deadlineRow } = await deadlineQuery.limit(1).maybeSingle();
      const resolvedMatchdayId = deadlineRow?.matchday_id;
      if (resolvedMatchdayId) {
        setActiveMatchdayId(resolvedMatchdayId);
        // Fetch fixtures for the active matchday to display fixture-timing indicator
        const { data: fixturesData } = await supabase
          .from('fixtures')
          .select('home_team, away_team, status, kickoff_at, home_score, away_score')
          .eq('matchday_id', resolvedMatchdayId);
        setActiveRoundFixtures(fixturesData ?? []);
      }
    } catch (err) {
      console.error('MarketScreen: deadline fetch failed', err);
    }

    // ── 2c. Pre-competition check: no live/finished fixtures yet → unlimited ───
    if (tournamentId) {
      try {
        const { count } = await supabase
          .from('fixtures')
          .select('id', { count: 'exact', head: true })
          .eq('tournament_id', tournamentId)
          .in('status', ['live', 'finished']);
        setPreCompetition((count ?? 0) === 0);
      } catch {
        setPreCompetition(false);
      }
    }

    // ── 2b. Transfer config (transfers_per_round, transfer_penalty) ───────────
    if (activeLeague) {
      try {
        const { data: cfgRows } = await supabase
          .from('league_config')
          .select('config_key, config_value')
          .eq('league_id', activeLeague)
          .in('config_key', ['transfers_per_round', 'transfer_penalty', 'free_transfers']);
        for (const row of cfgRows ?? []) {
          if (row.config_key === 'transfers_per_round') setTransfersPerRound(Number(row.config_value) || 3);
          if (row.config_key === 'transfer_penalty')    setTransferPenalty(row.config_value ?? 4);
          if (row.config_key === 'free_transfers')      setFreeTransfers(row.config_value === true);
        }
      } catch (err) {
        console.error('MarketScreen: transfer config fetch failed', err);
      }
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
          // Safety net: even with max_rows=10,000 (Dashboard → Settings → API),
          // backfill any squad player IDs not in the loaded list so position bars
          // and owned badges stay correct if the cap is ever hit or changed.
          const squadIds = sData.players ?? [];
          if (squadIds.length > 0) {
            setPlayers(prev => {
              const knownIds = new Set(prev.map(p => p.id));
              const missingIds = squadIds.filter(id => !knownIds.has(id));
              if (!missingIds.length) return prev;
              supabase.from('players').select('*').in('id', missingIds).then(({ data: missing }) => {
                if (missing?.length) {
                  setPlayers(current => {
                    const existingIds = new Set(current.map(p => p.id));
                    const toAdd = normalisePlayers(missing).filter(p => !existingIds.has(p.id));
                    return toAdd.length ? [...current, ...toAdd] : current;
                  });
                }
              });
              return prev;
            });
          }
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

  // Fetch per-round club cap whenever league + matchday are resolved
  useEffect(() => {
    if (!activeLeague || !activeMatchdayId) return;
    supabase
      .rpc('get_club_cap', { p_league_id: activeLeague, p_matchday_id: activeMatchdayId })
      .then(({ data }) => { if (data !== null && data !== undefined) setClubCap(data); });
  }, [activeLeague, activeMatchdayId]);

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
    // Use basket-simulated squad so position bars and cap checks reflect pending changes
    effectiveSquadIds.forEach(pid => {
      const p = players.find(pl => pl.id === pid);
      if (!p) return;
      if (posCounts[p.position] !== undefined) posCounts[p.position]++;
      if (pid !== todayJokerId) countryCounts[p.club] = (countryCounts[p.club] || 0) + 1;
    });
    return { posCounts, countryCounts };
  }, [effectiveSquadIds, players, todayJokerId]);



  const handleBuy = (player) => {
    if (confirming) return;
    if (isLocked) { showToast('Transfers are locked until after the match.', 'warning'); return; }
    if (!activeLeague) { showToast('Select a league first.', 'warning'); return; }

    // Already in basket
    if (basket.some(b => b.player.id === player.id)) {
      showToast(`${player.name} is already in your transfer basket.`, 'warning'); return;
    }

    // Validate against basket-simulated squad state
    if (effectiveSquadIds.length >= squadSize) { showToast('Squad is full — sell a player first.', 'warning'); return; }
    if (stats.posCounts[player.position] >= POS_LIMITS[player.position]) { showToast(`Max ${player.position}s reached.`, 'warning'); return; }
    if ((stats.countryCounts[player.club] ?? 0) >= clubCap) { showToast(`Max ${clubCap} players per club — ${player.club} is full.`, 'warning'); return; }
    if (effectiveBudget < player.price) { showToast('Not enough budget.', 'error'); return; }

    setBasket(prev => [...prev, { type: 'buy', player }]);
  };

  const handleSell = (player) => {
    if (confirming) return;
    if (isLocked) { showToast('Transfers are locked until after the match.', 'warning'); return; }

    // Already in basket
    if (basket.some(b => b.player.id === player.id)) {
      showToast(`${player.name} is already in your transfer basket.`, 'warning'); return;
    }

    const addToBasket = () => setBasket(prev => [...prev, { type: 'sell', player }]);

    const isCaptain = mySquad?.captain_id === player.id;
    const isJoker   = todayJokerId === player.id;
    const warnings  = [];
    if (isCaptain) warnings.push('This player is your captain — selling them removes the armband.');
    if (isJoker)   warnings.push('This player is your Matchday Joker — selling voids today\'s boost.');

    if (warnings.length) {
      setConfirm({
        title:        `Add ${player.name} to basket?`,
        body:         `€${player.price}M will be credited when transfers are confirmed.`,
        warning:      warnings.join(' '),
        confirmLabel: 'Add to basket',
        danger:       true,
        onConfirm:    addToBasket,
      });
    } else {
      addToBasket();
    }
  };

  // Processes all pending basket items: sells first (free up budget), then buys.
  const handleConfirmBasket = async () => {
    if (basket.length === 0 || confirming) return;
    setConfirming(true);
    setSaving(true);

    const sells = basket.filter(b => b.type === 'sell');
    const buys  = basket.filter(b => b.type === 'buy');
    const errors = [];
    const succeeded = new Set();

    for (const item of [...sells, ...buys]) {
      const fn = item.type === 'sell' ? sell : buy;
      const result = await fn(item.player);
      if (!result.ok) {
        errors.push(`${item.type === 'sell' ? 'SELL' : 'BUY'} ${item.player.name}: ${result.error}`);
      } else {
        succeeded.add(item.player.id);
        setMySquad(prev => ({ ...prev, players: result.players, budget_remaining: result.budget_remaining }));
        setBudget(result.budget_remaining);
      }
    }

    // Remove succeeded items from basket; keep failed ones so user can retry or discard
    setBasket(prev => prev.filter(b => !succeeded.has(b.player.id)));

    if (errors.length === 0) {
      showToast(`${basket.length} transfer${basket.length !== 1 ? 's' : ''} confirmed ✓`, 'success', 3000);
    } else if (succeeded.size > 0) {
      showToast(`${succeeded.size} succeeded, ${errors.length} failed: ${errors[0]}`, 'warning', 6000);
    } else {
      showToast(`Transfer failed: ${errors[0]}`, 'error', 6000);
    }

    await fetchSquad(); // re-sync round_transfers + penalty_transfers counters
    setConfirming(false);
    setSaving(false);
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
      const price         = p.price ?? 0;
      const matchesPrice  = price >= priceMin && price <= priceMax;
      return matchesPos && matchesSearch && matchesTeam && matchesPrice;
    });
    // Own players always float to the top; within each group sort by price descending
    const owned = mySquad?.players ?? [];
    return filtered.sort((a, b) => {
      const aOwned = owned.includes(a.id) ? 1 : 0;
      const bOwned = owned.includes(b.id) ? 1 : 0;
      if (aOwned !== bOwned) return bOwned - aOwned;
      return b.price - a.price;
    });
  }, [players, filterPos, searchQuery, selectedTeams, priceMin, priceMax, mySquad]);
  const squadCount  = effectiveSquadIds.length;
  const emptySlots  = Math.max(0, squadSize - squadCount);
  const [showScoringModal, setShowScoringModal] = useState(false);

  // League picker — shown when user has multiple leagues and none is selected
  if (leagues && leagues.length > 1 && !activeLeague) {
    return (
      <SelectLeaguePicker
        leagues={leagues}
        eyebrow="TRANSFER MARKET"
        onSelect={l => {
          setActiveLeague(l.id);
          if (l.rawFormat) setLeagueFormat(l.rawFormat);
          if (l.tournament_id) setTournamentId(l.tournament_id);
          else resolveLeagueTournament(l.id);
        }}
      />
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

      {/* â"€â"€ Transfer Window Status Banner â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      <TransferWindowBanner {...transferWindow} />

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
                onClick={() => setShowScoringModal(true)}
                title="Scoring & game rules"
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
              <LeagueSelector value={activeLeague} onChange={(lid) => {
                setActiveLeague(lid);
                const found = leagues?.find(l => l.id === lid);
                if (found?.format) setLeagueFormat(found.format);
                if (found?.tournament_id) setTournamentId(found.tournament_id);
                else resolveLeagueTournament(lid);
              }} />
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

            {/* Transfer quota
                Primary number: free transfers remaining (always, even when 0).
                Sub-label: total point deduction of pending penalty buys when > 0.
                Both projected live from basket so the user sees the effect before confirming.
                Hidden when window is locked — transfers impossible and stale round counts
                (e.g. all 3 used last round) would show a misleading "0 free" in red. */}
            {activeMatchdayId && !isLocked && (() => {
              // Unlimited when: draft league (always), initial build not yet complete,
              // free-window active, or competition not started.
              const isUnlimited = isDraftLeague
                || mySquad?.initial_build_complete === false
                || transferWindow?.windowType === 'unlimited'
                || preCompetition
                || freeTransfers;
              const freeUsed      = (mySquad?.round_transfers  ?? {})[activeMatchdayId] ?? 0;
              const penaltyUsed   = (mySquad?.penalty_transfers ?? {})[activeMatchdayId] ?? 0;
              const basketBuys    = basket.filter(b => b.type === 'buy').length;
              const isEst         = basketBuys > 0;
              const projFreeUsed  = freeUsed + basketBuys;
              const projFreeLeft  = Math.max(0, transfersPerRound - projFreeUsed);
              const basketPenBuys = isUnlimited ? 0 : Math.max(0, projFreeUsed - Math.max(freeUsed, transfersPerRound));
              const costs         = Array.isArray(transferPenalty) ? transferPenalty : [transferPenalty ?? 4];
              const totalPenCost  = [...Array(basketPenBuys)].reduce((sum, _, i) =>
                sum + (costs[Math.min(penaltyUsed + i, costs.length - 1)] ?? costs[costs.length - 1]), 0);
              const freeColor     = isUnlimited ? 'var(--positive)' : projFreeLeft === 0 ? 'var(--danger)' : projFreeLeft <= 1 ? 'var(--gold)' : 'var(--paper)';
              return (
                <div className="text-right">
                  <div className="fz-label" style={{ color: 'var(--mute)', fontSize: 10 }}>
                    Transfers{!isUnlimited && isEst ? ' (est.)' : ''}
                  </div>
                  <div
                    className="text-[16px] lg:text-[20px] font-black tabular-nums leading-tight"
                    style={{ fontFamily: 'Archivo Black, sans-serif', color: freeColor }}
                    title={isUnlimited ? 'Unlimited transfers — build your squad freely' : `${projFreeLeft} free transfer${projFreeLeft !== 1 ? 's' : ''} remaining this round`}
                  >
                    {isUnlimited ? '∞' : projFreeLeft}
                    <span className="text-[10px] lg:text-[12px] font-normal" style={{ color: 'var(--mute)' }}>
                      {isUnlimited ? ' free' : ' free'}
                    </span>
                  </div>
                  {totalPenCost > 0 && (
                    <div className="text-[9px] font-black mt-0.5" style={{ color: 'var(--gold)', fontFamily: 'Archivo Black, sans-serif' }}>
                      -{totalPenCost}pt cost
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Budget + empty slots */}
            <div className="text-right" data-tour="market-budget">
              <div className="fz-label" style={{ color: 'var(--mute)', fontSize: 10 }}>
                Budget{basket.length > 0 ? ' (est.)' : ''}
              </div>
              <div
                className="text-[16px] lg:text-[20px] font-black tabular-nums leading-tight"
                style={{ fontFamily: 'Archivo Black, sans-serif', color: effectiveBudget < 5 ? 'var(--danger)' : 'var(--cyan)' }}
              >
                €{effectiveBudget.toFixed(1)}
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

        {/* Price range filter */}
        <div className="px-5 pb-2 flex items-center gap-3" style={{ borderTop: 'none' }}>
          <span style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 9, letterSpacing: '.1em', color: 'var(--mute)', textTransform: 'uppercase', flexShrink: 0 }}>
            Price
          </span>
          <div className="flex items-center gap-2 flex-1">
            <div className="flex items-center gap-1.5 flex-1">
              <span style={{ fontSize: 10, color: 'var(--mute)', fontFamily: 'Archivo, sans-serif' }}>€</span>
              <input
                type="number"
                min={0} max={priceMax} step={0.5}
                value={priceMin}
                onChange={e => setPriceMin(Math.min(Number(e.target.value), priceMax))}
                style={{
                  width: 44, padding: '4px 6px', textAlign: 'center',
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 3, color: 'var(--paper)', fontFamily: 'Archivo, sans-serif', fontSize: 11,
                  outline: 'none',
                }}
              />
            </div>
            <span style={{ color: 'var(--mute)', fontSize: 10 }}>–</span>
            <div className="flex items-center gap-1.5 flex-1">
              <span style={{ fontSize: 10, color: 'var(--mute)', fontFamily: 'Archivo, sans-serif' }}>€</span>
              <input
                type="number"
                min={priceMin} max={20} step={0.5}
                value={priceMax}
                onChange={e => setPriceMax(Math.max(Number(e.target.value), priceMin))}
                style={{
                  width: 44, padding: '4px 6px', textAlign: 'center',
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 3, color: 'var(--paper)', fontFamily: 'Archivo, sans-serif', fontSize: 11,
                  outline: 'none',
                }}
              />
            </div>
          </div>
          {(priceMin > 0 || priceMax < 15) && (
            <button
              onClick={() => { setPriceMin(0); setPriceMax(15); }}
              style={{
                background: 'none', border: 'none', color: 'var(--mute)', cursor: 'pointer',
                fontFamily: 'Archivo Black, sans-serif', fontSize: 8, letterSpacing: '.1em',
                textTransform: 'uppercase', flexShrink: 0,
              }}
            >
              Reset
            </button>
          )}
        </div>

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
            // Basket pending state
            const pendingSell  = basket.some(b => b.type === 'sell' && b.player.id === p.id);
            const pendingBuy   = basket.some(b => b.type === 'buy'  && b.player.id === p.id);
            // In Draft mode each player belongs to one manager — block if taken.
            // In Classic mode any player can be in multiple squads simultaneously.
            const takenByOther = isDraftLeague && !isOwned && isTaken(p.id);
            const ownerName    = takenBy(p.id);
            const limitReached = stats.posCounts[p.position] >= POS_LIMITS[p.position];
            // U26: club cap guard — uses basket-simulated counts via stats
            const clubFull     = !isOwned && (stats.countryCounts[p.club] ?? 0) >= clubCap;
            const canAfford    = effectiveBudget >= p.price;
            const hasLeague    = !!activeLeague;
            const canBuy       = hasLeague && !isOwned && !pendingBuy && !takenByOther && !limitReached && !clubFull && canAfford && effectiveSquadIds.length < squadSize;
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
                      {isOwned && p.id === mySquad?.captain_id && (
                        <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--gold)', color: '#0A0A0A', fontFamily: 'Archivo Black, sans-serif', fontSize: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 900 }}>C</div>
                      )}
                      <span style={{ fontSize: 8, color: 'var(--mute)', lineHeight: 1, flexShrink: 0 }}>
                        {isExpanded ? '▲' : '▼'}
                      </span>
                      {isOwned && (
                        <span className="fk-mono shrink-0" style={{ fontSize: 9, fontWeight: 800, color: 'var(--cyan)', border: '1px solid var(--cyan)', padding: '2px 6px' }}>
                          {isDraftLeague ? 'OWNED · YOU' : 'OWNED'}
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
                    {/* Fixture timing — active matchday only */}
                    {(() => {
                      const fs = formatFixtureStatus(buildFixtureInfo(p, activeRoundFixtures));
                      return fs ? (
                        <div className="fk-mono mt-0.5" style={{ fontSize: 9, color: fs.color, letterSpacing: '0.14em' }}>
                          {fs.label}
                        </div>
                      ) : null;
                    })()}
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
                      €{p.price}
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
                  ) : pendingSell ? (
                    // Player queued for sale — tap to remove from basket
                    <button
                      onClick={() => setBasket(prev => prev.filter(b => b.player.id !== p.id))}
                      className="fk-mono transition-all active:scale-95"
                      style={{
                        minWidth: 56, padding: '6px 10px',
                        border: '1px solid var(--gold)',
                        color: 'var(--gold)',
                        background: 'rgba(240,180,0,0.08)',
                        fontSize: 10, fontWeight: 800, letterSpacing: '0.1em',
                      }}
                      title="Remove from basket"
                    >
                      SELLING
                    </button>
                  ) : pendingBuy ? (
                    // Player queued for purchase — tap to remove from basket
                    <button
                      onClick={() => setBasket(prev => prev.filter(b => b.player.id !== p.id))}
                      className="fk-mono transition-all active:scale-95"
                      style={{
                        minWidth: 56, padding: '6px 10px',
                        border: '1px solid var(--gold)',
                        color: 'var(--gold)',
                        background: 'rgba(240,180,0,0.08)',
                        fontSize: 10, fontWeight: 800, letterSpacing: '0.1em',
                      }}
                      title="Remove from basket"
                    >
                      BUYING
                    </button>
                  ) : isOwned ? (
                    <button
                      onClick={() => handleSell(p)}
                      disabled={confirming}
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
                      disabled={confirming || !canBuy}
                      title={
                        !hasLeague     ? 'Select a league first'
                        : !canAfford   ? 'Insufficient budget'
                        : limitReached ? `${p.position} slots full`
                        : 'Add to basket'
                      }
                      className="fk-mono transition-all active:scale-95"
                      style={{
                        minWidth: 56, padding: '6px 10px',
                        border: `1px solid ${canBuy ? 'var(--cyan)' : 'var(--rule)'}`,
                        color: canBuy ? 'var(--cyan)' : 'var(--mute)',
                        background: 'transparent',
                        fontSize: 10, fontWeight: 800, letterSpacing: '0.14em',
                        cursor: canBuy ? 'pointer' : 'not-allowed',
                        opacity: confirming ? 0.5 : 1,
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
                  onViewStats={() => setStatsDashboardPlayer(p)}
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
          Max {clubCap} per club (Joker exempt) · Max {squadSize} players · €{cfg.budgetTotal}M budget
        </span>
      </div>
      {showScoringModal && <ScoringInfoModal onClose={() => setShowScoringModal(false)} />}

      {/* Full player stats dashboard */}
      {statsDashboardPlayer && (
        <PlayerStatsDashboard
          player={statsDashboardPlayer}
          ownershipPct={ownershipMap[statsDashboardPlayer.id]}
          onClose={() => setStatsDashboardPlayer(null)}
        />
      )}

      {/* ── Transfer Basket ─────────────────────────────────────────────────── */}
      {/* Uses createPortal so position:fixed renders relative to the viewport,  */}
      {/* not the AppLayout scroll container (which creates a stacking context). */}
      {basket.length > 0 && createPortal((() => {
        const sells        = basket.filter(b => b.type === 'sell');
        const buys         = basket.filter(b => b.type === 'buy');
        const numTransfers = Math.max(sells.length, buys.length);
        const netChange    = basket.reduce((n, b) => b.type === 'sell' ? n + b.player.price : n - b.player.price, 0);
        const netLabel     = netChange > 0 ? `+€${netChange.toFixed(1)}M` : netChange < 0 ? `-€${Math.abs(netChange).toFixed(1)}M` : null;
        const netColor     = netChange >= 0 ? 'var(--positive)' : 'var(--danger)';
        return (
          <div
            style={{
              position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9000,
              background: 'rgba(13,17,23,0.98)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              borderTop: '2px solid var(--gold)',
              paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
            }}
          >
            <div style={{ maxWidth: 640, margin: '0 auto', padding: '10px 16px 0' }}>
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 10, letterSpacing: '.12em', color: 'var(--gold)', textTransform: 'uppercase' }}>
                  Transfer Basket · {numTransfers} transfer{numTransfers !== 1 ? 's' : ''}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {netLabel && (
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: netColor, fontWeight: 700 }}>
                      {netLabel}
                    </span>
                  )}
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--mute)' }}>
                    €{effectiveBudget.toFixed(1)}M left
                  </span>
                  {penaltyPointsCost > 0 && (
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--danger)', fontWeight: 700 }}>
                      −{penaltyPointsCost}pts
                    </span>
                  )}
                </div>
              </div>

              {/* Paired transfer rows: sell ↔ buy on the same line */}
              <div style={{ marginBottom: 10, maxHeight: 140, overflowY: 'auto' }}>
                {[...Array(numTransfers)].map((_, i) => {
                  const sell = sells[i] ?? null;
                  const buy  = buys[i]  ?? null;
                  return (
                    <div
                      key={i}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '5px 0',
                        borderBottom: i < numTransfers - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                      }}
                    >
                      {/* OUT side */}
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                        {sell ? (
                          <>
                            <span style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 8, letterSpacing: '.1em', color: 'var(--danger)', border: '1px solid var(--danger)', padding: '1px 4px', flexShrink: 0 }}>OUT</span>
                            <span style={{ fontSize: 12, color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sell.player.name}</span>
                            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', flexShrink: 0 }}>€{sell.player.price}M</span>
                            <button
                              onClick={() => setBasket(prev => prev.filter(b => b.player.id !== sell.player.id))}
                              disabled={confirming}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mute)', fontSize: 13, padding: '0 2px', lineHeight: 1, flexShrink: 0, opacity: confirming ? 0.3 : 1 }}
                              title="Remove from basket"
                            >×</button>
                          </>
                        ) : (
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.15)' }}>—</span>
                        )}
                      </div>
                      {/* Divider */}
                      <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12, flexShrink: 0 }}>⇄</span>
                      {/* IN side */}
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                        {buy ? (
                          <>
                            <span style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 8, letterSpacing: '.1em', color: 'var(--cyan)', border: '1px solid var(--cyan)', padding: '1px 4px', flexShrink: 0 }}>IN</span>
                            <span style={{ fontSize: 12, color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{buy.player.name}</span>
                            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', flexShrink: 0 }}>€{buy.player.price}M</span>
                            <button
                              onClick={() => setBasket(prev => prev.filter(b => b.player.id !== buy.player.id))}
                              disabled={confirming}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mute)', fontSize: 13, padding: '0 2px', lineHeight: 1, flexShrink: 0, opacity: confirming ? 0.3 : 1 }}
                              title="Remove from basket"
                            >×</button>
                          </>
                        ) : (
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.15)' }}>—</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setBasket([])}
                  disabled={confirming}
                  style={{
                    flex: 1, padding: '10px 8px',
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: 'var(--mute)',
                    fontFamily: 'Archivo Black, sans-serif',
                    fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase',
                    cursor: confirming ? 'not-allowed' : 'pointer',
                    opacity: confirming ? 0.4 : 1,
                  }}
                >
                  Discard all
                </button>
                <button
                  onClick={handleConfirmBasket}
                  disabled={confirming}
                  style={{
                    flex: 3, padding: '10px 8px',
                    background: confirming ? 'rgba(240,180,0,0.4)' : 'var(--gold)',
                    border: 'none',
                    color: 'var(--ink)',
                    fontFamily: 'Archivo Black, sans-serif',
                    fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase',
                    cursor: confirming ? 'wait' : 'pointer',
                    fontWeight: 900,
                  }}
                >
                  {confirming ? 'Processing…' : `Confirm ${numTransfers} Transfer${numTransfers !== 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          </div>
        );
      })(), document.body)}
    </div>
  );
}
