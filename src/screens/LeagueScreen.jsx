import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { LoadingRows } from '../components/Skeleton';
import { createPortal } from 'react-dom';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useClubhouseContext } from '../context/ClubhouseContext';
import { useNotifications } from '../hooks/useNotifications';
import { useToast } from '../hooks/useToast';
import { useAuctions } from '../hooks/useAuctions';
import { useLeagueStats } from '../hooks/useLeagueStats';
import SectionHeader from '../components/SectionHeader';
import LeagueInviteCard from '../components/LeagueInviteCard';
import H2HSheet from '../components/H2HSheet';
import ClubCrest from '../components/ClubCrest';
import TransferWindowBanner from '../components/TransferWindowBanner';
import StatusBar from '../components/ui/StatusBar';

import NotificationBell from '../components/NotificationBell';
import { useTransferWindow } from '../hooks/useTransferWindow';
import { useCommissioner }   from '../hooks/useCommissioner';
import { useTradeProposals } from '../hooks/useTradeProposals';
import { useOnboarding } from '../hooks/useOnboarding';
import { useBettingLeaderboard } from '../hooks/useBettingLeaderboard';
import OnboardingTour from '../components/OnboardingTour';
import {
  HubTopbar, HubTabs, HubSubSwitch, ROUTE_TABS,
  HubLeagueHeader, HubTabPills,
  MgrTag, TrendPill, FormDots, Spark, HubSectionLabel,
} from '../components/league/HubShared';
import { MONO, DISPLAY, mgrHue } from '../components/league/HubConstants';
import { TypeChip, RankBadge, ArchivedBadge } from '../components/league/LeagueBadges';
import { useShowArchived } from '../hooks/useShowArchived';
import usePullToRefresh from '../hooks/usePullToRefresh';
import PullToRefreshIndicator from '../components/motion/PullToRefreshIndicator';
import NumberFlow from '../components/motion/NumberFlow';
import { deriveLeagueType, TYPE_COLOR } from '../components/league/LeagueBadgeHelpers';
import BetsTabHub             from '../components/league/BetsTabHub';
import LeagueDetailView       from '../components/league/LeagueDetailView';
import BettingLeaderboardView from '../components/league/BettingLeaderboardView';
import TradingView            from '../components/league/TradingView';
import StatsView              from '../components/league/StatsView';
import CommissionerPanel      from '../components/league/CommissionerPanel';
import RecapView             from '../components/league/RecapView';
import MarketReportView      from '../components/league/MarketReportView';
import H2HView               from '../components/league/H2HView';

function timeAgoLabel(iso) {
  const seconds = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const LEAGUE_TOUR_STEPS = [
  {
    target: 'league-standings',
    title:  'League Standings',
    body:   'See every manager\'s rank and total points. Tap a name to view their squad, propose a trade, or check your head-to-head record.',
  },
  {
    target: 'league-tabs',
    title:  'League Tabs',
    body:   'Switch between Standings, Recap, Bets, Trading, and Stats. Commissioners also see an Admin tab.',
  },
];

const BETS_TOUR_STEPS = [
  {
    target: 'bets-header',
    title:  'Bets & Predictions',
    body:   'The Commissioner posts weekly challenges here — predict outcomes to earn bonus points. Picks lock at the deadline.',
  },
  {
    target: 'bets-list',
    title:  'Open Bets',
    body:   'Each card shows the question, the options, and how many points you\'ll win. Tap an option to submit your pick.',
  },
];

// Draft-only steps are tagged so they can be filtered out for Classic leagues.
const COMMISSIONER_TOUR_STEPS = [
  {
    target: 'comm-season-stepper',
    title:  'Season Lifecycle',
    body:   "This bar tracks your league's progress. Transfers open first, then (in Draft leagues) the draft and allocation, and finally the live season. Each stage has its own controls below.",
  },
  {
    target: 'comm-transfer-window',
    title:  'Transfer Window',
    body:   'Open the window between gameweeks so managers can buy and sell players on the market. Set an opening and closing time — the system enforces the deadline automatically. Close it at least 1 hour before the first match kicks off.',
  },
  {
    target:    'comm-draft-deadline',
    title:     'Draft & Allocation',
    body:      'Managers submit their ranked player wishlist before this deadline. Once it passes, the lottery runs automatically and resolves conflicts. Click "Run Allocation" to trigger it manually if needed.',
    draftOnly: true,
  },
  {
    target: 'comm-score-recalc',
    title:  'Score Recalculation',
    body:   'If a match result was corrected after the final whistle, re-run the scoring engine here. Enter the fixture ID and hit Recalculate — squad scores update immediately.',
  },
  {
    target: 'comm-bets',
    title:  'Create Bets',
    body:   'Post prediction challenges for your managers before each gameweek. Pick a template (Top Scorer, Match Result, or Clean Sheet), configure the options and reward points, then publish. Bets lock when the relevant match kicks off.',
  },
  {
    target: 'comm-resolve',
    title:  'Resolve Bets',
    body:   "After a match finishes, bet results that can't be auto-resolved will appear here. Select the correct answer to distribute reward points to winning managers. Match Result bets resolve automatically — only custom bets need manual resolution.",
  },
  {
    target: 'comm-bets',
    title:  'Weekly Gameweek Flow',
    body:   'Each gameweek: (1) Open transfer window → managers trade. (2) Close window 1h before kickoff. (3) Matches play — scores calculate automatically. (4) Create bets for next GW. (5) Resolve any pending bets. Repeat each round.',
  },
];

// Resolves the id that will actually authenticate the request (supabase-js
// reads whatever real session is in storage independent of demo-mode auth
// state), not useAuth()'s possibly-frozen DEMO_USER — otherwise a league's
// own-squad lookup can silently query the wrong user_id and never find the
// caller's squad. Same divergence, same fix, as F1RacePickForm.jsx's
// resolveUserId()/TennisAdminScreen.jsx's established pattern.
async function resolveUserId(fallbackId) {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.id ?? fallbackId;
  } catch {
    return fallbackId;
  }
}

export default function LeagueScreen() {
  const { user } = useAuth();
  const { show: showToast } = useToast();
  const navigate = useNavigate();
  const { leagueId } = useParams();
  const { activeCircleId } = useClubhouseContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    showLeagueTour, completeLeagueTour, replayLeagueTour,
    showCommissionerTour, completeCommissionerTour, replayCommissionerTour,
    showBetsTour, completeBetsTour,
  } = useOnboarding();

  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); 
  const [activeLeague, setActiveLeague] = useState(null);
  const [_activeEmojiPickerId, _setActiveEmojiPickerId] = useState(null);
  const [showTradeBuilder, setShowTradeBuilder] = useState(false);
  
  const [managerTeamView, setManagerTeamView] = useState(null); // { id, name }
  const [tradeMyPlayer, setTradeMyPlayer] = useState(null);
  const [tradeTheirPlayer, setTradeTheirPlayer] = useState(null);
  const [tradeCash, setTradeCash] = useState(0);
  const [tradePoints, setTradePoints] = useState(0);
  
  const [tradeTarget,    setTradeTarget]    = useState(null);
  const [tradeError,     setTradeError]     = useState(null);
  const [isSendingProposal, setIsSendingProposal] = useState(false);
  const [myListings,     setMyListings]     = useState(new Set()); // player_ids I've listed
  const [_leagueListings, setLeagueListings] = useState([]);        // all listings in league
  const [h2hTarget, setH2hTarget] = useState(null);
  const [mySquadId, setMySquadId] = useState(null);
  const [mySquadBudget, setMySquadBudget] = useState(null);
  const [mySquadPlayerCount, setMySquadPlayerCount] = useState(null);

  // Real squad data for trade builder
  const [mySquadPlayers,   setMySquadPlayers]   = useState([]);
  const [theirSquadPlayers,setTheirSquadPlayers] = useState([]);
  const [managerRoster,    setManagerRoster]    = useState([]);

  const squadByUserRef    = useRef({});
  const activeLeagueIdRef = useRef(null); // always holds the latest activeLeague.league_id
  // Sync ref every render so onLeagueUpdated callbacks never use a stale id.
  useLayoutEffect(() => { activeLeagueIdRef.current = activeLeague?.league_id ?? null; });
  
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [draftAllocated, setDraftAllocated] = useState(false); // lottery ran and produced allocation
  const [draftOpen, setDraftOpen] = useState(false); // deadline in future + no submission yet
  const [draftDeadlineDate, setDraftDeadlineDate] = useState(null); // for countdown banner
  const [draftSubmissionCount, setDraftSubmissionCount] = useState(0); // how many managers submitted
  const [currentGW, setCurrentGW] = useState('—'); // current GW label for league header
  const transferWindow = useTransferWindow(activeLeague?.league_id);
  const { auctions, pendingAuctions, closedAuctions, loading: auctionsLoading, placeBid, cancelListing, sellNow, confirmWin } = useAuctions(activeLeague?.league_id, mySquadId);
  const { topScorers, teamMetrics, matchdayPoints, positionPoints, captainHitData, benchData, roiData, loading: statsLoading } = useLeagueStats(activeLeague?.league_id);
  const { leaderboard, myBetsByType, loading: betLoading } = useBettingLeaderboard(activeLeague?.league_id, currentUser?.id);

  // Commissioner state + handlers consolidated into a single hook.
  // The whole object is passed as a prop to CommissionerPanel.
  // fetchOpenBets is also called inline when the admin tab becomes active.
  const commissioner = useCommissioner(
    activeLeague?.league_id,
    activeLeague?.leagues?.tournament_id,
    // Bug #1: after setting a draft deadline the panel must refresh so the
    // season stepper advances from stage 1 → stage 2.
    // Use the ref so this callback always has the freshest league id regardless
    // of when the closure was created.
    () => { const lid = activeLeagueIdRef.current; if (lid) loadLeagueById(lid); },
  );
  const { fetchOpenBets } = commissioner;

  // Create form state
  const [leagueName,       setLeagueName]       = useState('');
  const [leagueFormat,     setLeagueFormat]     = useState('classic');
  // 'noduplicate_h2h' is a UI-only value — sent to the RPC as format='noduplicate' + p_h2h_enabled=true
  const [leagueTournament, setLeagueTournament] = useState('426');
  const [tournaments,      setTournaments]      = useState([]);
  const [formLoading,      setFormLoading]      = useState(false);
  const [newLeague,        setNewLeague]        = useState(null);   // set after creation → shows invite card
  const [showModeHelp,     setShowModeHelp]     = useState(false);  // ? modal for Classic vs Draft
  // CH-4: Clubhouse-first flow
  const [createLeagueStep, setCreateLeagueStep] = useState(0);     // 0 = Clubhouse picker, 1 = league form
  const [selectedCircleId, setSelectedCircleId] = useState(null);
  const [myCircles,        setMyCircles]        = useState([]);
  const [circlesLoading,   setCirclesLoading]   = useState(false);

  // Join-by-code state — U3: seed from ?joinCode= URL param (written by JoinRoute in App.jsx)
  const [joinCode,     setJoinCode]     = useState(() => searchParams.get('joinCode') ?? '');
  const [joinLoading,  setJoinLoading]  = useState(false);
  const [joinError,    setJoinError]    = useState('');

  // Membership gate — a Clubhouse member can see a league card in "All Competitions"
  // without having joined that specific league yet. Block squad/market access until
  // they actually join, instead of letting them build a full squad and only finding
  // out at the transfer step (process-transfer's own membership check).
  const [needsJoin,      setNeedsJoin]      = useState(false);
  const [joinGateLeague, setJoinGateLeague] = useState(null);
  const { notifications, unreadCount: notificationCount, markAsRead: markNotificationAsRead, clearAll: clearAllNotifications, clearByType: clearNotificationsByType } = useNotifications(activeLeague?.league_id);
  const {
    incoming: incomingTrades,
    outgoing: outgoingTrades,
    leagueProposals: leagueTradeProposals,
    history: tradeHistory,
    submitProposal,
    acceptProposal,
    rejectProposal,
    cancelProposal,
  } = useTradeProposals(activeLeague?.league_id, mySquadId);

  const toggleListing = async (playerId) => {
    const leagueId = activeLeague?.league_id;
    if (!leagueId) return;
    if (myListings.has(playerId)) {
      await supabase.from('trade_listings').delete()
        .eq('league_id', leagueId).eq('user_id', user?.id).eq('player_id', playerId);
      setMyListings(prev => { const s = new Set(prev); s.delete(playerId); return s; });
      setLeagueListings(prev => prev.filter(l => !(l.user_id === user?.id && l.player_id === playerId)));
    } else {
      await supabase.from('trade_listings').upsert(
        { league_id: leagueId, user_id: user?.id, player_id: playerId },
        { onConflict: 'league_id,user_id,player_id' }
      );
      setMyListings(prev => new Set([...prev, playerId]));
      setLeagueListings(prev => [...prev, { user_id: user?.id, player_id: playerId }]);
    }
  };

  const loadTradeSquads = async (targetUserId) => {
    const lid = activeLeague?.league_id;
    if (!lid || !user?.id) return;
    setMySquadPlayers([]);
    setTheirSquadPlayers([]);
    // Always prefer squads.players (live roster) over draft_allocations (draft-only snapshot).
    // Free-market transfers after the draft are in squads.players but NOT in allocated_players,
    // so using allocations as primary caused pre-filled "their player" to go missing.
    const [mySquadRes, theirSquadRes] = await Promise.all([
      supabase.from('squads').select('players').eq('league_id', lid).eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('squads').select('players').eq('league_id', lid).eq('user_id', targetUserId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    let myIds    = mySquadRes?.data?.players    ?? [];
    let theirIds = theirSquadRes?.data?.players ?? [];
    // Fallback to draft_allocations for leagues that never had a squad row
    if (!myIds.length || !theirIds.length) {
      const [myAlloc, theirAlloc] = await Promise.all([
        myIds.length    ? Promise.resolve({ data: null }) : supabase.from('draft_allocations').select('allocated_players').eq('league_id', lid).eq('user_id', user.id).maybeSingle(),
        theirIds.length ? Promise.resolve({ data: null }) : supabase.from('draft_allocations').select('allocated_players').eq('league_id', lid).eq('user_id', targetUserId).maybeSingle(),
      ]);
      if (!myIds.length)    myIds    = myAlloc?.data?.allocated_players    ?? [];
      if (!theirIds.length) theirIds = theirAlloc?.data?.allocated_players ?? [];
    }
    const allIds = [...new Set([...myIds, ...theirIds])];
    if (!allIds.length) return;
    const { data: playerRows } = await supabase.from('players').select('id,name,position,club,price').in('id', allIds);
    const byId = Object.fromEntries((playerRows ?? []).map(p => [p.id, p]));
    setMySquadPlayers(myIds.map(id => byId[id]).filter(Boolean));
    setTheirSquadPlayers(theirIds.map(id => byId[id]).filter(Boolean));
  };

  const loadManagerRoster = async (targetUserId) => {
    const lid = activeLeague?.league_id;
    if (!lid || !targetUserId) return;
    setManagerRoster([]);
    // Always use the most recent squad row as the source of truth — it reflects
    // the live squad including free-market transfers after any draft phase.
    // draft_allocations only holds the subset of players allocated in the draft
    // lottery and misses transfers made after allocation.
    const { data: squad } = await supabase
      .from('squads').select('players')
      .eq('league_id', lid).eq('user_id', targetUserId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    let ids = squad?.players ?? [];
    // Fallback: draft-only leagues may have allocations without a squad row yet
    if (!ids.length) {
      const { data: allocs } = await supabase
        .from('draft_allocations').select('allocated_players')
        .eq('league_id', lid).eq('user_id', targetUserId);
      ids = (allocs ?? []).flatMap(a => a.allocated_players ?? []);
    }
    if (!ids.length) return;
    const { data: rows } = await supabase.from('players').select('id,name,position,club,price').in('id', ids);
    setManagerRoster((rows ?? []).slice().sort((a, b) => positionSortIndex(a.position) - positionSortIndex(b.position)));
  };

  const normalizePos = (pos) => (pos ?? '').toUpperCase().replace('FW', 'FWD');

  const POSITION_ORDER = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
  const positionSortIndex = (pos) => POSITION_ORDER[normalizePos(pos)] ?? 99;

  const validateAndSendProposal = async () => {
    if (isSendingProposal) return;
    if (!tradeMyPlayer || !tradeTheirPlayer || !tradeTarget) {
      setTradeError('Select a player from each squad to propose a trade.');
      return;
    }
    if (normalizePos(tradeMyPlayer.position) !== normalizePos(tradeTheirPlayer.position)) {
      setTradeError('Both players must be the same position (e.g. MID ↔ MID).');
      return;
    }
    if (!tradeTarget.squadId) {
      setTradeError('Could not find target squad. Please close and reopen the trade builder.');
      return;
    }
    setIsSendingProposal(true);
    setTradeError(null);
    try {
      await submitProposal({
        targetSquadId:   tradeTarget.squadId,
        myPlayerId:      tradeMyPlayer.id,
        theirPlayerId:   tradeTheirPlayer.id,
        cashSweetener:   tradeCash,
        pointsSweetener: tradePoints,
      });
      showToast('Trade proposal sent!', 'success');
      setShowTradeBuilder(false);
      setTradeTarget(null);
      setTradeMyPlayer(null);
      setTradeTheirPlayer(null);
      setTradeCash(0);
      setTradePoints(0);
    } catch (err) {
      const msg = {
        INSUFFICIENT_BUDGET: 'Not enough budget to offer that cash sweetener.',
        INSUFFICIENT_POINTS: 'Not enough points to offer as sweetener.',
        PROPOSER_PLAYER_NOT_IN_SQUAD: 'That player is no longer in your squad.',
        TARGET_PLAYER_NOT_IN_SQUAD: 'That player is no longer in the target squad.',
        PLAYER_ALREADY_PROPOSED: 'This player already has a pending proposal. Cancel it first.',
        POSITION_MISMATCH: 'Both players must be the same position (e.g. MID ↔ MID).',
      }[err.message] || err.message;
      setTradeError(msg);
    } finally {
      setIsSendingProposal(false);
    }
  };

  const isCommissioner = activeLeague?.leagues?.created_by === currentUser?.id
    || activeLeague?.role === 'commissioner';

  const headerStats = (() => {
    const me = members.find(m => m.user_id === (user?.id ?? currentUser?.id));
    if (!me) return [];
    const top = Math.max(...members.map(m => m.total_points ?? 0));
    const pts = me.total_points ?? 0;
    return [
      { value: me.rank ? `#${me.rank}` : '—', label: 'Rank' },
      { value: pts, label: 'Points' },
      ...(pts < top ? [{ value: `−${top - pts}`, label: 'Behind 1st' }] : []),
    ];
  })();

  // commAction, openTransferWindow, closeTransferWindow, triggerScores,
  // setLeagueDraftDeadline, createBetInstance, autoGenerateBetOptions,
  // fetchOpenBets, fetchBetSubmissions, resolveBet — all from useCommissioner above.
  const viewToTab = (v) => {
    if (v === 'detail') return 'leaderboard';
    if (v === 'betting_leaderboard') return 'betting';
    if (v === 'commissioner') return 'admin';
    if (v === 'auctions') return 'trading'; // legacy deep-link compat
    return v;
  };
  const tabToView = (t) => {
    if (t === 'leaderboard') return 'detail';
    if (t === 'betting') return 'betting_leaderboard';
    if (t === 'admin') return 'commissioner';
    if (t === 'auctions') return 'trading'; // legacy deep-link compat
    return t;
  };
  // h2h maps 1:1 (viewToTab('h2h') === 'h2h', tabToView('h2h') === 'h2h')
  // recap tab maps 1:1 (tabToView('recap') === 'recap', viewToTab('recap') === 'recap')
  // U32: set tab + sync to URL query param so ?tab=chat deep-links work
  // setSearchParams MUST be in deps: React Router v7 recreates it whenever
  // the location changes (it closes over navigate which closes over locationPathname).
  // Both /league and /league/:leagueId render the same component instance (no
  // remount), so without this dep setTab would hold a stale setSearchParams from
  // the /league render, causing tab clicks to navigate to /league?tab=X instead
  // of /league/:leagueId?tab=X.
  const setTab = useCallback((t) => {
    if (ROUTE_TABS.includes(t)) { navigate(`/${t}?leagueId=${activeLeague?.league_id ?? ''}`); return; }
    setView(tabToView(t));
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('tab', t);
      return next;
    }, { replace: true });
  }, [setSearchParams, navigate, activeLeague?.league_id]);

  // B-13: shared "show archived leagues" toggle for the My Leagues list
  const [showArchived, setShowArchived] = useShowArchived();

  const fetchTournaments = useCallback(async () => {
    const { data } = await supabase
      .from('tournaments')
      .select('forza_id, name')
      .eq('available_for_league_creation', true)
      .order('name');
    if (data?.length) {
      setTournaments(data);
      setLeagueTournament(data[0].forza_id);
    }
  }, []);

  // Pull-to-refresh reads/writes the shared #main-content scroll container
  // (AppLayout's mainRef) — this screen renders no scroll pane of its own for
  // the leagues list. The ref-population effect must commit before
  // usePullToRefresh's effect runs, so it's declared first.
  const mainContentRef = useRef(null);
  useEffect(() => { mainContentRef.current = document.getElementById('main-content'); }, []);

  const fetchLeagues = useCallback(async () => {
    try {
      setLoading(true);
      const userId = user?.id;

      const { data, error } = await supabase
        .from('league_members')
        .select(`
          league_id, rank, total_points, role,
          leagues ( id, name, format, tournament_id, created_by, h2h_enabled, draft_deadline, knockout_draft_deadline, cup_phase, league_mode, archived )
        `)
        .eq('user_id', userId);

      if (error) throw error;

      if (!data || data.length === 0) {
        setLeagues([]);
        return;
      }

      // Leagues are Clubhouse-scoped containers — restrict "My Leagues" to the
      // active Clubhouse instead of every league the user belongs to across all
      // of their Clubhouses.
      let scoped = data;
      if (activeCircleId) {
        const { data: circleLeagues } = await supabase
          .from('circle_leagues')
          .select('league_id')
          .eq('circle_id', activeCircleId);
        const allowedIds = new Set((circleLeagues ?? []).map(r => r.league_id));
        scoped = data.filter(r => allowedIds.has(r.league_id));
      }

      if (scoped.length === 0) {
        setLeagues([]);
        return;
      }

      const { data: memberRows } = await supabase
        .from('league_members')
        .select('league_id')
        .in('league_id', scoped.map(r => r.league_id));
      const memberCounts = (memberRows ?? []).reduce((acc, m) => {
        acc[m.league_id] = (acc[m.league_id] || 0) + 1;
        return acc;
      }, {});

      setLeagues((scoped.map(r => ({ ...r, member_count: memberCounts[r.league_id] })) || [])
        .sort((a, b) => (a.leagues?.name ?? '').localeCompare(b.leagues?.name ?? '')));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, activeCircleId]);

  const pullToRefresh = usePullToRefresh(mainContentRef, fetchLeagues);

  useEffect(() => {
    if (user?.id) {
      setCurrentUser(user);
      fetchLeagues();
      fetchTournaments();
    }
  // user.id is the stable identity; user object reference changes on token refresh
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, fetchLeagues, fetchTournaments]);

  // CH-4: reset Clubhouse picker step whenever user leaves the create view
  useEffect(() => {
    if (view !== 'create') { setCreateLeagueStep(0); setSelectedCircleId(null); }
  }, [view]);

  // CH-4: fetch user's Clubhouses when the create view opens (direct query, no useClubhouse import — TDZ risk)
  useEffect(() => {
    if (view !== 'create' || !user?.id) return;
    let cancelled = false;
    setCirclesLoading(true);
    supabase
      .from('circle_members')
      .select('role, circles(id, name, archived)')
      .eq('user_id', user.id)
      .then(({ data }) => {
        if (cancelled) return;
        // Archived Clubhouses aren't offered as a target for a brand-new league.
        setMyCircles((data ?? []).map(r => ({ id: r.circles?.id, name: r.circles?.name, role: r.role, archived: r.circles?.archived })).filter(c => c.id && !c.archived));
        setCirclesLoading(false);
      });
    return () => { cancelled = true; };
  }, [view, user?.id]);

  // IMP-01: Fetch current GW for the active league's tournament.
  // Prefers the most recent past deadline (the round currently being played,
  // even after its deadline passes but before it completes); falls back to
  // the next upcoming deadline pre-competition.
  useEffect(() => {
    const tournamentId = activeLeague?.leagues?.tournament_id;
    if (!tournamentId) { setCurrentGW('—'); return; }
    let cancelled = false;
    (async () => {
      const { data: past } = await supabase
        .from('matchday_deadlines').select('matchday_id')
        .eq('tournament_id', tournamentId)
        .lte('deadline_at', new Date().toISOString())
        .order('deadline_at', { ascending: false }).limit(1).maybeSingle();
      if (past?.matchday_id) {
        if (!cancelled) setCurrentGW(String(past.matchday_id).replace(/^.*-r/, ''));
        return;
      }
      const { data: upcoming } = await supabase
        .from('matchday_deadlines').select('matchday_id')
        .eq('tournament_id', tournamentId)
        .gt('deadline_at', new Date().toISOString())
        .order('deadline_at', { ascending: true }).limit(1).maybeSingle();
      if (!cancelled) setCurrentGW(upcoming?.matchday_id ? String(upcoming.matchday_id).replace(/^.*-r/, '') : '—');
    })();
    return () => { cancelled = true; };
  }, [activeLeague?.leagues?.tournament_id]);

  // U3: If a joinCode was passed via URL (?joinCode=XXX from /join?code=XXX),
  // clear the query param from the address bar (keep the code in state for the form).
  useEffect(() => {
    const code = searchParams.get('joinCode');
    if (code) {
      setSearchParams({}, { replace: true });
    }
  // Only run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadLeagueById = useCallback(async (id) => {
    if (!id || !user?.id) return;
    try {
      setMembersLoading(true);
      setView(v => v === 'list' ? 'detail' : v);
      const uid = await resolveUserId(user?.id);
      const { data: lData } = await supabase.from('leagues').select('*').eq('id', id).single();
      if (!lData) {
        // League doesn't exist or RLS denied — redirect to list view.
        setView('list');
        setMembersLoading(false);
        return;
      }

      // Membership gate — a Clubhouse's "All Competitions" list shows every league
      // linked to the circle, but that doesn't make the viewer a league member.
      // Block squad/market access until they actually join.
      const { data: memberRow } = await supabase
        .from('league_members')
        .select('user_id')
        .eq('league_id', id)
        .eq('user_id', uid)
        .maybeSingle();
      if (!memberRow) {
        setJoinGateLeague(lData);
        setJoinCode(lData.join_code ?? '');
        setNeedsJoin(true);
        setMembersLoading(false);
        return;
      }
      setNeedsJoin(false);

      setActiveLeague({ league_id: id, leagues: lData });
      const { data: mData } = await supabase.from('league_members').select('rank, total_points, user_id, users(username)').eq('league_id', id).order('total_points', { ascending: false });

      // Check if current user has an incomplete draft allocation
      const { data: alloc } = await supabase
        .from('draft_allocations')
        .select('unresolved_slots, allocated_players')
        .eq('league_id', id)
        .eq('user_id', uid)
        .maybeSingle();
      setDraftAllocated(!!(alloc?.allocated_players));

      // Check if draft is open and manager hasn't submitted yet.
      // P1-2: only draft (no-duplicate) leagues run a draft — never show draft UI
      // for a classic league even if a draft_deadline somehow got set.
      const isDraftLeague = lData?.format === 'noduplicate' || lData?.league_mode === 'draft';
      // For cup+draft leagues in group_stage phase, the active deadline is knockout_draft_deadline.
      // For all other cases (group phase or no cup phase) use draft_deadline.
      const isKnockoutWindow = lData?.cup_phase === 'group_stage' && !!lData?.knockout_draft_deadline;
      const deadline = isKnockoutWindow ? lData.knockout_draft_deadline : lData?.draft_deadline;
      const deadlineDate = deadline ? new Date(deadline) : null;
      const currentPhase = isKnockoutWindow ? 'knockout' : 'group';
      if (isDraftLeague && deadlineDate) {
        setDraftDeadlineDate(deadlineDate);
        // Check if current user submitted their wish list for this phase.
        const { data: subs } = await supabase
          .from('draft_submissions')
          .select('id')
          .eq('league_id', id)
          .eq('user_id', uid)
          .eq('phase', currentPhase)
          .limit(1);
        // Only show the "submit now" banner when the deadline is still in the future.
        setDraftOpen(!(subs && subs.length) && deadlineDate > new Date());
        // Fetch total submission count for the commissioner overview banner.
        const { count: subCount } = await supabase
          .from('draft_submissions')
          .select('id', { count: 'exact', head: true })
          .eq('league_id', id)
          .eq('phase', currentPhase);
        setDraftSubmissionCount(subCount ?? 0);
      } else {
        setDraftDeadlineDate(null);
        setDraftOpen(false);
        setDraftSubmissionCount(0);
      }

      // Fetch current user's squadId + budget + player count in this league
      const { data: squadRow } = await supabase
        .from('squads')
        .select('id, budget_remaining, players')
        .eq('league_id', id)
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setMySquadId(squadRow?.id ?? null);
      setMySquadBudget(squadRow?.budget_remaining ?? null);
      // Bug #3: verify player count against the DB rather than trusting the raw
      // array length — deleted players leave ghost IDs that inflate the count.
      const rawPlayerIds = squadRow?.players ?? [];
      let validPlayerCount = rawPlayerIds.length;
      if (rawPlayerIds.length > 0) {
        const { count } = await supabase
          .from('players')
          .select('id', { count: 'exact', head: true })
          .in('id', rawPlayerIds);
        if (count !== null) validPlayerCount = count;
      }
      setMySquadPlayerCount(squadRow ? validPlayerCount : null);

      // Build user→squadId map for trade target lookup
      const { data: allSquads } = await supabase
        .from('squads')
        .select('id, user_id')
        .eq('league_id', id)
        .order('created_at', { ascending: false });
      const byUser = {};
      (allSquads || []).forEach(s => { if (!byUser[s.user_id]) byUser[s.user_id] = s.id; });
      squadByUserRef.current = byUser;

      // Load trade listings for the league
      const { data: listings } = await supabase
        .from('trade_listings')
        .select('player_id, user_id')
        .eq('league_id', id);
      setLeagueListings(listings ?? []);
      setMyListings(new Set((listings ?? []).filter(l => l.user_id === uid).map(l => l.player_id)));

      setMembers(mData || []);
    } finally {
      setMembersLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (leagueId && user?.id) {
      // Reset league-scoped state before loading new league to avoid stale display (U29)
      setMembers([]);
      setMySquadId(null);
      setMySquadBudget(null);
      setDraftOpen(false);
      setNeedsJoin(false);
      loadLeagueById(leagueId);
    } else if (!leagueId) {
      setActiveLeague(null);
      setMembers([]);
      setNeedsJoin(false);
    }
  }, [leagueId, user?.id, loadLeagueById]);

  useEffect(() => {
    if (view === 'commissioner' && activeLeague?.league_id) {
      fetchOpenBets();
    }
  // fetchOpenBets is defined without useCallback — adding it would cause an infinite loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, activeLeague?.league_id]);

  // U32: Apply ?tab= URL param when a league loads
  useEffect(() => {
    if (!activeLeague?.league_id) return;
    const tabParam = searchParams.get('tab');
    if (tabParam) setView(tabToView(tabParam));
  // Only apply on initial league load (activeLeague change), not on every searchParam change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLeague?.league_id]);

  // U42: Auto-clear only bet-type notification badge when viewing bets tab
  useEffect(() => {
    if (view === 'bets' && activeLeague?.league_id && notificationCount > 0) {
      clearNotificationsByType('bet');
    }
  }, [view, activeLeague?.league_id, notificationCount, clearNotificationsByType]);

  // Realtime subscription: league standings — handles UPDATE (points change) and INSERT (new member joins)
  useEffect(() => {
    if (!activeLeague?.league_id) return;

    const leagueId = activeLeague.league_id;
    const membersSub = supabase
      .channel(`league_members:league_id=eq.${leagueId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'league_members', filter: `league_id=eq.${leagueId}` },
        (payload) => {
          setMembers(prev => {
            const idx = prev.findIndex(m => m.user_id === payload.new.user_id);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = { ...updated[idx], total_points: payload.new.total_points };
              return updated.sort((a, b) => (b.total_points || 0) - (a.total_points || 0));
            }
            return prev;
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'league_members', filter: `league_id=eq.${leagueId}` },
        async (payload) => {
          // Fetch the new member's username then append to the list (U30)
          const { data: userRow } = await supabase
            .from('users')
            .select('username')
            .eq('id', payload.new.user_id)
            .maybeSingle();
          const newMember = {
            user_id:      payload.new.user_id,
            rank:         payload.new.rank ?? null,
            total_points: payload.new.total_points ?? 0,
            users:        { username: userRow?.username ?? 'New Manager' },
          };
          setMembers(prev => {
            if (prev.some(m => m.user_id === newMember.user_id)) return prev;
            return [...prev, newMember].sort((a, b) => (b.total_points || 0) - (a.total_points || 0));
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(membersSub); };
  }, [activeLeague?.league_id]);

  // FB-025: atomic league creation via RPC (league + commissioner in one transaction)
  const handleCreateLeague = async (e) => {
    e.preventDefault();
    if (!leagueName.trim()) return;
    try {
      setFormLoading(true);
      const isH2H = leagueFormat === 'noduplicate_h2h';
      const createArgs = {
        p_name:          leagueName.trim(),
        p_format:        isH2H ? 'noduplicate' : leagueFormat,
        p_user_id:       user?.id,
        p_tournament_id: leagueTournament,
        p_h2h_enabled:   isH2H,
      };
      if (selectedCircleId) createArgs.p_circle_id = selectedCircleId;
      const { data, error } = await supabase.rpc('create_league', createArgs);
      if (error) throw error;
      setLeagueName('');
      setNewLeague(data);   // triggers invite card view
      fetchLeagues();
    } catch (err) {
      console.error('[createLeague]', err);
      showToast('Could not create league: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      setFormLoading(false);
    }
  };

  // FB-025: join a league by code
  const handleJoinByCode = async (e) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code || code.length < 4) return;
    try {
      setJoinLoading(true);
      setJoinError('');
      const { data, error } = await supabase.rpc('join_league_by_code', {
        p_code:    code,
        p_user_id: user?.id,
      });
      if (error) {
        const msg = error.message || '';
        if (msg.includes('LEAGUE_NOT_FOUND'))  setJoinError('No league found with that code — check the spelling.');
        else if (msg.includes('ALREADY_MEMBER')) setJoinError('You\'re already in this league.');
        else if (msg.includes('LEAGUE_FULL'))    setJoinError('This league is full.');
        else setJoinError('Something went wrong — please try again.');
        return;
      }
      setJoinCode('');
      fetchLeagues();
      // Navigate to the newly joined league (RPC returns {league_id, name})
      const joinedId = data?.league_id ?? data?.id;
      if (joinedId) navigate(`/league/${joinedId}`);
    } catch (err) {
      console.error('[joinLeague]', err);
      setJoinError('Something went wrong — please try again.');
    } finally {
      setJoinLoading(false);
    }
  };

  // Membership gate submit — join the specific league the viewer landed on
  // (from a Clubhouse competition card) rather than navigating away, so the
  // squad/market screen loads in place once membership is confirmed.
  const handleJoinGateSubmit = async (e) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code || code.length < 4 || !leagueId) return;
    try {
      setJoinLoading(true);
      setJoinError('');
      const { error } = await supabase.rpc('join_league_by_code', {
        p_code:    code,
        p_user_id: user?.id,
      });
      if (error) {
        const msg = error.message || '';
        if (msg.includes('LEAGUE_NOT_FOUND'))    setJoinError('No league found with that code — check the spelling.');
        else if (msg.includes('ALREADY_MEMBER')) setJoinError('You\'re already in this league.');
        else if (msg.includes('LEAGUE_FULL'))    setJoinError('This league is full.');
        else setJoinError('Something went wrong — please try again.');
        return;
      }
      fetchLeagues();
      await loadLeagueById(leagueId);
    } catch (err) {
      console.error('[joinLeagueGate]', err);
      setJoinError('Something went wrong — please try again.');
    } finally {
      setJoinLoading(false);
    }
  };

  // FB-025/026: Show invite card immediately after league creation
  if (newLeague) {
    return (
      <LeagueInviteCard
        league={newLeague}
        onDone={() => {
          setNewLeague(null);
          setView('list');
          if (newLeague.id) navigate(`/league/${newLeague.id}`);
        }}
      />
    );
  }

  if (view === 'create' && createLeagueStep === 0) {
    const goBack = () => { setCreateLeagueStep(0); setSelectedCircleId(null); setView('list'); };
    return (
      <div className="pb-16 min-h-screen bg-bg">
        <div className="flex items-center p-4 border-b border-border bg-surface sticky top-0 z-10">
          <button onClick={goBack} className="text-xl mr-4 text-text-secondary">←</button>
          <h1 className="fz-display text-[var(--paper)] text-[18px]">Choose Clubhouse</h1>
        </div>
        <div className="p-4 flex flex-col gap-4 mt-4">
          <p style={{ fontFamily: 'monospace', fontSize: 'var(--fs-micro)', color: 'var(--mute)', marginBottom: 4 }}>
            Link this league to a Clubhouse so all members can access it together
          </p>
          {circlesLoading ? (
            <p style={{ fontFamily: 'monospace', fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>Loading…</p>
          ) : myCircles.length > 0 ? (
            <div className="flex flex-col gap-2">
              {myCircles.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCircleId(prev => prev === c.id ? null : c.id)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 16px',
                    border: `1px solid ${selectedCircleId === c.id ? 'var(--gold)' : 'var(--rule)'}`,
                    background: selectedCircleId === c.id ? 'rgba(181,147,58,0.07)' : 'var(--surface)',
                    cursor: 'pointer', textAlign: 'left', transition: 'border-color .15s',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 'var(--fs-label)', color: 'var(--paper)', fontWeight: 700 }}>{c.name}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>{c.role}</span>
                  </div>
                  {selectedCircleId === c.id && (
                    <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ color: 'var(--paper)', fontSize: 'var(--fs-micro)', fontWeight: 900, lineHeight: 1 }}>✓</span>
                    </span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div style={{ padding: '20px 0', textAlign: 'center' }}>
              <p style={{ fontFamily: 'monospace', fontSize: 'var(--fs-micro)', color: 'var(--mute)', lineHeight: 1.6 }}>
                YOU DON&apos;T HAVE A CLUBHOUSE YET<br />
                <span style={{ color: 'var(--mute)' }}>Every league needs a Clubhouse — create one first.</span>
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              if (myCircles.length === 0) { navigate('/home'); return; }
              setCreateLeagueStep(1);
            }}
            disabled={myCircles.length > 0 && !selectedCircleId}
            className="w-full mt-2 bg-cyan text-white font-bold py-4 uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {myCircles.length === 0 ? 'Create a Clubhouse' : 'Continue'}
          </button>
        </div>
      </div>
    );
  }

  if (view === 'create') {
    return (
      <div className="pb-16 min-h-screen bg-bg">
        <div className="flex items-center p-4 border-b border-border bg-surface sticky top-0 z-10">
          <button onClick={() => setCreateLeagueStep(0)} className="text-xl mr-4 text-text-secondary">←</button>
          <h1 className="fz-display text-[var(--paper)] text-[18px]">{selectedCircleId ? `${myCircles.find(c => c.id === selectedCircleId)?.name ?? 'Clubhouse'} · New League` : 'Initialize Campaign'}</h1>
        </div>
        <form onSubmit={handleCreateLeague} className="p-4 flex flex-col gap-6 mt-4">
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">League Name</label>
            <div className="bg-surface border border-border p-1">
              <input
                type="text"
                value={leagueName}
                onChange={(e) => setLeagueName(e.target.value)}
                className="w-full bg-transparent px-3 py-3 text-[15px] font-medium outline-none text-[var(--paper)]"
                placeholder="e.g. Champions Draft League"
                maxLength={40}
                required
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">Competition</label>
            {tournaments.length > 0 ? (
              <div className="flex flex-col gap-2">
                {tournaments.map(t => (
                  <button
                    key={t.forza_id}
                    type="button"
                    onClick={() => setLeagueTournament(t.forza_id)}
                    className={`flex items-center justify-between p-3 border text-left transition-colors ${
                      leagueTournament === t.forza_id
                        ? 'border-cyan bg-cyan/5'
                        : 'border-border bg-surface hover:border-cyan/40'
                    }`}
                  >
                    <span className="text-[13px] font-bold uppercase tracking-wider text-[var(--paper)]">{t.name}</span>
                    {leagueTournament === t.forza_id && (
                      <span className="text-[11px] font-bold uppercase tracking-wider text-cyan border border-cyan/40 px-1 py-[1px] leading-none">Selected</span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <LoadingRows rows={3} />
            )}
          </div>
          {/* League Mode Help Modal */}
          {showModeHelp && (
            <div role="presentation"
              onClick={() => setShowModeHelp(false)}
              style={{
                position: 'fixed', inset: 0, zIndex: 'var(--z-popover)',
                background: 'rgba(0,0,0,0.75)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 16,
              }}
            >
              <div role="presentation"
                onClick={e => e.stopPropagation()}
                style={{
                  background: 'var(--card)',
                  border: '1px solid var(--rule)',
                  width: '100%', maxWidth: 520,
                  maxHeight: '82vh', overflowY: 'auto',
                  display: 'flex', flexDirection: 'column',
                  boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
                }}
              >
                <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 3, height: 12, background: 'var(--accent)', flexShrink: 0 }} />
                  <span style={{ fontFamily: 'monospace', fontSize: 'var(--fs-micro)', color: 'var(--paper, #e8e8e8)', flex: 1 }}>League Mode — Classic vs Draft</span>
                  <button onClick={() => setShowModeHelp(false)} style={{ background: 'none', border: 'none', color: 'var(--mute)', cursor: 'pointer', fontSize: 'var(--fs-heading)', lineHeight: 1 }}>✕</button>
                </div>
                <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {[
                    {
                      label: 'Draft + H2H', color: 'var(--gold)',
                      summary: 'Draft league with a parallel head-to-head competition. Every matchday you face one opponent — winner takes 5 H2H pts, draw 2, loss 0.',
                      rows: [
                        ['Draft', 'All draft rules apply — blind lottery, unique player ownership, first-come-first-served after allocation.'],
                        ['H2H', 'Each matchday your fantasy points total is compared against one opponent. Two parallel standings: classic pts + H2H pts.'],
                        ['Scoring', 'Win 5 pts · Draw 2 pts · Loss 0 pts (configurable). Bye = automatic win.'],
                        ['Schedule', 'Round-robin — everyone plays everyone before repeating. Commissioner sets it up via the Admin tab.'],
                        ['Best for', 'Competitive groups wanting both individual excellence (classic) and weekly head-to-head drama (H2H).'],
                      ],
                    },
                    {
                      label: 'CLASSIC', color: 'var(--mute)',
                      summary: 'All managers build freely. The same player can appear in multiple squads simultaneously.',
                      rows: [
                        ['Market', 'Fully open — buy any player at any time, no uniqueness rules.'],
                        ['Setup', 'No draft required. Managers can start picking immediately after joining.'],
                        ['Transfers', '5 per round, unlimited budget transfers at the season halfway point.'],
                        ['Cup format', 'Club cap relaxes automatically as teams are eliminated. Cannot buy from knocked-out clubs.'],
                        ['Best for', 'Casual groups, first-time leagues, tournaments where simplicity matters.'],
                      ],
                    },
                    {
                      label: 'DRAFT', color: 'var(--accent)',
                      summary: 'Each player belongs to exactly one manager at a time. The season starts with a blind draft.',
                      rows: [
                        ['Draft', 'Managers submit a ranked wishlist of up to 30 players before the deadline — no position, club, or budget constraints during submission. The allocation engine resolves conflicts by lottery and assigns squads.'],
                        ['After draft', 'Transfers are first-come-first-served from the remaining unallocated pool. No other manager can own the same player.'],
                        ['Cup format', 'A second draft runs at the group → knockout transition. Club cap and player-repeat rules relax automatically as clubs are eliminated.'],
                        ['Incomplete squad', 'If your wishlist runs out before 15 players are filled, you complete the squad from what\'s left — first come, first served.'],
                        ['Best for', 'Competitive leagues where fairness and player uniqueness define the game.'],
                      ],
                    },
                  ].map(({ label, color, summary, rows }) => (
                    <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 'var(--fs-micro)', color, fontWeight: 700 }}>{label}</span>
                        <span style={{ flex: 1, height: 1, background: 'var(--elev)' }} />
                      </div>
                      <p style={{ fontSize: 'var(--fs-label)', color: 'var(--text)', lineHeight: 1.5, margin: 0 }}>{summary}</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {rows.map(([k, v]) => (
                          <div key={k} style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 10 }}>
                            <span style={{ fontFamily: 'monospace', fontSize: 'var(--fs-micro)', color: 'var(--mute)', paddingTop: 2 }}>{k}</span>
                            <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--mute)', lineHeight: 1.55 }}>{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  <p style={{ fontSize: 'var(--fs-micro)', color: 'var(--mute)', lineHeight: 1.5, margin: 0, borderTop: '1px solid var(--rule)', paddingTop: 14 }}>
                    Regardless of mode: position rules always apply (1 GK, 3–5 DEF, 2–4 MID, 1–2 FWD) and the max 3 players per club rule applies to final squads in all formats.
                  </p>
                </div>
                <div style={{ padding: '10px 18px', borderTop: '1px solid var(--rule)', display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="hit-44" onClick={() => setShowModeHelp(false)} style={{ background: 'transparent', border: '1px solid var(--rule)', color: 'var(--mute)', padding: '6px 14px', fontSize: 'var(--fs-micro)', cursor: 'pointer', fontFamily: 'monospace' }}>CLOSE</button>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">Format</label>
              <button
                type="button"
                onClick={() => setShowModeHelp(true)}
                title="What's the difference?"
                style={{ width: 16, height: 16, borderRadius: '50%', border: '1px solid var(--rule)', background: 'transparent', color: 'var(--mute)', fontSize: 'var(--fs-micro)', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'monospace' }}
              >?</button>
            </div>
            <div className="flex flex-col gap-3">
              {/* Classic */}
              <button
                type="button"
                onClick={() => setLeagueFormat('classic')}
                className={`flex flex-col items-start gap-2 p-3 border rounded text-left transition-colors ${
                  leagueFormat === 'classic'
                    ? 'border-white bg-white/5'
                    : 'border-border bg-surface hover:border-white/30'
                }`}
              >
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--paper)]">Classic</span>
                <span className="text-[11px] leading-snug" style={{ color: 'var(--paper)' }}>All managers build freely — the same player can appear in any squad.</span>
                <ul className="flex flex-col gap-[3px]">
                  <li className="text-[11px]" style={{ color: 'var(--mute)' }}>• No draft required · join and pick</li>
                  <li className="text-[11px]" style={{ color: 'var(--mute)' }}>• 5 transfers per round</li>
                  <li className="text-[11px]" style={{ color: 'var(--mute)' }}>• Unlimited window at halfway</li>
                </ul>
              </button>

              {/* Draft (noduplicate) */}
              <button
                type="button"
                onClick={() => setLeagueFormat('noduplicate')}
                className={`flex flex-col items-start gap-2 p-3 border rounded text-left transition-colors ${
                  leagueFormat === 'noduplicate'
                    ? 'border-cyan bg-cyan/5'
                    : 'border-border bg-surface hover:border-cyan/40'
                }`}
              >
                <div className="flex items-center gap-2 w-full">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--paper)]">Draft</span>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-cyan border border-cyan/40 rounded px-1 py-[1px] leading-none">Recommended</span>
                </div>
                <span className="text-[11px] leading-snug" style={{ color: 'var(--paper)' }}>Each player owned by one manager — allocated by blind draft lottery.</span>
                <ul className="flex flex-col gap-[3px]">
                  <li className="text-[11px]" style={{ color: 'var(--mute)' }}>• Submit ranked wishlist pre-season</li>
                  <li className="text-[11px]" style={{ color: 'var(--mute)' }}>• Lottery resolves contested picks</li>
                  <li className="text-[11px]" style={{ color: 'var(--mute)' }}>• First-come-first-served after draft</li>
                </ul>
              </button>

              {/* Draft + H2H */}
              <button
                type="button"
                onClick={() => setLeagueFormat('noduplicate_h2h')}
                className={`flex flex-col items-start gap-2 p-3 border rounded text-left transition-colors ${
                  leagueFormat === 'noduplicate_h2h'
                    ? 'border-yellow-400 bg-yellow-400/5'
                    : 'border-border bg-surface hover:border-yellow-400/40'
                }`}
              >
                <div className="flex items-center gap-2 w-full">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--paper)]">Draft + H2H</span>
                  <span style={{ fontFamily: "Archivo, sans-serif", fontSize: 'var(--fs-micro)', color: 'var(--gold)', border: '1px solid rgba(240,180,0,0.4)', padding: '1px 5px' }}>⚔️ H2H</span>
                </div>
                <span className="text-[11px] leading-snug" style={{ color: 'var(--paper)' }}>Draft league with a parallel head-to-head competition each matchday.</span>
                <ul className="flex flex-col gap-[3px]">
                  <li className="text-[11px]" style={{ color: 'var(--mute)' }}>• All draft rules apply</li>
                  <li className="text-[11px]" style={{ color: 'var(--mute)' }}>• Win 5 pts · Draw 2 pts · Loss 0 pts</li>
                  <li className="text-[11px]" style={{ color: 'var(--gold)' }}>• Two parallel tables: pts + H2H</li>
                </ul>
              </button>
            </div>
            <p className="text-[11px]" style={{ color: 'var(--mute)', marginTop: 2 }}>
              Both modes: max 3 players per club · position rules always apply · club cap relaxes in cup tournaments
            </p>
          </div>
          <button type="submit" disabled={formLoading || !leagueName.trim()} className="w-full mt-4 bg-cyan text-white font-bold py-4 uppercase tracking-wider disabled:opacity-50">
            {formLoading ? 'Creating…' : 'Start Season'}
          </button>
        </form>
      </div>
    );
  }

  if (leagueId && needsJoin) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg)', color: 'var(--paper)', padding: 24, textAlign: 'center' }}>
        <div className="fk-eyebrow" style={{ marginBottom: 10 }}>Join To Continue</div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 'var(--fs-title)', letterSpacing: '-0.02em', marginBottom: 10, maxWidth: 480 }}>
          {joinGateLeague?.name || 'This league'}
        </div>
        <div style={{ fontSize: 'var(--fs-body)', color: 'var(--mute)', marginBottom: 28, maxWidth: 420 }}>
          You're not a member of this league yet — join with the code below to build your squad and use the transfer market.
        </div>
        <form onSubmit={handleJoinGateSubmit} style={{ display: 'flex', gap: 0, width: '100%', maxWidth: 360 }}>
          <input
            type="text"
            value={joinCode}
            onChange={e => {
              const val = e.target.value.toUpperCase();
              setJoinCode(val);
              setJoinError(val.trim().length > 0 && val.trim().length < 4 ? 'Codes are 6+ characters' : '');
            }}
            placeholder="XXXXXX"
            maxLength={8}
            style={{
              flex: 1, minWidth: 0, padding: '11px 16px',
              background: 'var(--card)',
              border: `1px solid ${joinError ? 'rgba(240,58,58,0.5)' : 'var(--rule)'}`,
              borderRight: 'none', color: 'var(--paper)',
              fontSize: 'var(--fs-body)', fontFamily: MONO, fontWeight: 700, outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={joinLoading || joinCode.trim().length < 4}
            className="ffl-btn ffl-btn--gold ffl-btn--md"
            style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', flexShrink: 0 }}
          >
            {joinLoading ? '…' : 'Join →'}
          </button>
        </form>
        {joinError && (
          <div style={{ marginTop: 12, fontSize: 'var(--fs-label)', color: 'var(--danger)', fontFamily: MONO }}>{joinError}</div>
        )}
        <button
          onClick={() => navigate('/league')}
          style={{ marginTop: 28, background: 'none', border: 'none', color: 'var(--mute)', fontFamily: MONO, fontSize: 'var(--fs-micro)', cursor: 'pointer' }}
        >
          ← Back to My Leagues
        </button>
      </div>
    );
  }

  if (leagueId) {
    const name       = activeLeague?.leagues?.name || activeLeague?.name || 'Syncing...';
    const h2hEnabled = activeLeague?.leagues?.h2h_enabled ?? false;
    const leagueMode = h2hEnabled ? 'draft_h2h' : (activeLeague?.leagues?.format === 'noduplicate' ? 'draft' : 'classic');

    // Reproduces NotificationPanel's row content/click-handling for the shared NotificationBell shell.
    const leagueRenderRow = (n, { onNavigated }) => (
      <div role="button" tabIndex={0} onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); (() => {
          if (!n.is_read) markNotificationAsRead(n.id);
          const link = n.link ?? n.action_url ?? n.metadata?.link;
          if (link) { navigate(link); onNavigated?.(); }
        })(e); } }}
        key={n.id}
        onClick={() => {
          if (!n.is_read) markNotificationAsRead(n.id);
          const link = n.link ?? n.action_url ?? n.metadata?.link;
          if (link) { navigate(link); onNavigated?.(); }
        }}
        style={{
          display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 14px',
          borderBottom: '1px solid var(--rule)',
          background: !n.is_read ? 'var(--accent-soft)' : 'transparent',
          cursor: 'pointer',
        }}
      >
        <div style={{ paddingTop: 5, flexShrink: 0, width: 6 }}>
          {!n.is_read && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', fontWeight: 700, color: 'var(--paper)', lineHeight: 1.3 }}>
            {n.title}
          </div>
          {n.description && (
            <div style={{ fontSize: 'var(--fs-micro)', marginTop: 2, lineHeight: 1.4, color: 'var(--mute)' }}>
              {n.description}
            </div>
          )}
          <div style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', marginTop: 4, color: 'rgba(139,149,161,0.5)' }}>
            {timeAgoLabel(n.created_at)}
          </div>
        </div>
      </div>
    );

    return (
      <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg)', color: 'var(--paper)', minHeight: '100vh', fontFamily: "'Archivo', sans-serif" }}>

        {/* â”€â”€ Guided tours â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {showLeagueTour && !loading && view === 'detail' && (
          <OnboardingTour
            steps={LEAGUE_TOUR_STEPS}
            onComplete={completeLeagueTour}
            onSkip={completeLeagueTour}
          />
        )}
        {showBetsTour && view === 'bets' && (
          <OnboardingTour
            steps={BETS_TOUR_STEPS}
            onComplete={completeBetsTour}
            onSkip={completeBetsTour}
          />
        )}
        {showCommissionerTour && view === 'commissioner' && isCommissioner && (() => {
          const isDraftLeague = activeLeague?.leagues?.format === 'noduplicate';
          const filteredSteps = COMMISSIONER_TOUR_STEPS.filter(s => isDraftLeague || !s.draftOnly);
          return (
            <OnboardingTour
              steps={filteredSteps}
              onComplete={completeCommissionerTour}
              onSkip={completeCommissionerTour}
            />
          );
        })()}
        {/* â”€â”€ Desktop chrome (hidden on mobile) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="hidden lg:block">
          <HubTopbar
            leagueName={name}
            memberCount={members.length}
            gw={currentGW}
            stats={headerStats}
            isLive={false}
            onBack={() => navigate('/clubhouse')}
            cupPhase={activeLeague?.leagues?.cup_phase}
            leagueMode={leagueMode}
            rightSlot={
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <button
                  onClick={() => view === 'commissioner' ? replayCommissionerTour() : replayLeagueTour()}
                  title={view === 'commissioner' ? 'Replay admin tour' : 'Replay league tour'}
                  aria-label={view === 'commissioner' ? 'Replay admin tour' : 'Replay league tour'}
                  className="hit-44" style={{ width: 44, height: 44, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--mute)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
                ><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7" /><circle cx="12" cy="17" r=".6" fill="currentColor" /></svg></button>
                {isCommissioner && (
                  <button
                    onClick={() => setView('commissioner')}
                    data-tour="admin-tab"
                    aria-label="League admin"
                    title="League admin"
                    aria-pressed={view === 'commissioner'}
                    className="hit-44" style={{ width: 44, height: 44, borderRadius: '50%', border: 'none', background: view === 'commissioner' ? 'var(--elev)' : 'transparent', color: view === 'commissioner' ? 'var(--accent)' : 'var(--mute)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
                  ><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg></button>
                )}
                <NotificationBell
                  notifications={notifications}
                  unreadCount={notificationCount + (activeLeague?.leagues?.format === 'noduplicate' ? incomingTrades.length : 0)}
                  onMarkAll={clearAllNotifications}
                  isDesktop={true}
                  renderRow={leagueRenderRow}
                />
              </div>
            }
          />
        </div>

        {/* â”€â”€ Mobile chrome (hidden on desktop) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="lg:hidden">
          <HubLeagueHeader
            leagueName={name}
            memberCount={members.length}
            gw={currentGW}
            stats={headerStats}
            onBack={() => navigate('/clubhouse')}
            cupPhase={activeLeague?.leagues?.cup_phase}
            leagueMode={leagueMode}
            rightSlot={
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                {isCommissioner && (
                  <button
                    onClick={() => setView('commissioner')}
                    data-tour="admin-tab"
                    aria-label="League admin"
                    title="League admin"
                    aria-pressed={view === 'commissioner'}
                    className="hit-44" style={{ width: 44, height: 44, borderRadius: '50%', border: 'none', background: view === 'commissioner' ? 'var(--elev)' : 'transparent', color: view === 'commissioner' ? 'var(--accent)' : 'var(--mute)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
                  ><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg></button>
                )}
                <NotificationBell
                  notifications={notifications}
                  unreadCount={notificationCount + (activeLeague?.leagues?.format === 'noduplicate' ? incomingTrades.length : 0)}
                  onMarkAll={clearAllNotifications}
                  isDesktop={false}
                  renderRow={leagueRenderRow}
                />
              </div>
            }
          />
        </div>

        <TransferWindowBanner {...transferWindow} />

        {/* One status bar at a time (redesign Wave 1b), highest priority first */}
        {(() => {
          const lg = activeLeague?.leagues;
          const isDraft = lg?.format === 'noduplicate';
          const goSquad = () => navigate(`/squad${activeLeague?.league_id ? `?leagueId=${activeLeague.league_id}` : ''}`);
          const act = (label, fn) => <button className="hit-44" onClick={fn} style={{ background: 'none', border: 'none', color: 'inherit', font: 'inherit', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>{label} →</button>;
          const squadChecks = mySquadPlayerCount !== null && !draftOpen && (!isDraft || draftAllocated);
          if (draftOpen) {
            const hoursLeft = draftDeadlineDate ? (draftDeadlineDate.getTime() - Date.now()) / 3_600_000 : Infinity;
            const tone = hoursLeft < 24 ? 'crit' : hoursLeft < 48 ? 'warn' : 'good';
            const msg = hoursLeft < 24 ? `Draft closes in ${Math.max(0, Math.floor(hoursLeft))}h — submit your ranked list now`
              : hoursLeft < 48 ? `Draft closes in ${Math.floor(hoursLeft)}h — submit your ranked list`
              : 'Draft is open — submit your ranked list';
            return <StatusBar tone={tone} action={act('Draft', () => navigate(`/league/${activeLeague?.league_id}/draft`))}>{msg}</StatusBar>;
          }
          if (squadChecks && mySquadPlayerCount < 11) {
            return <StatusBar tone="crit" action={act('My squad', goSquad)}>Squad too small — {mySquadPlayerCount}/11 players. Need {11 - mySquadPlayerCount} more to field a starting XI.</StatusBar>;
          }
          if (draftAllocated && mySquadPlayerCount === null) {
            return <StatusBar tone="warn" action={act('Market', () => navigate(`/market?leagueId=${activeLeague?.league_id}`))}>No squad yet — head to the market to sign players.</StatusBar>;
          }
          if (isDraft && !lg?.draft_deadline && isCommissioner) {
            return <StatusBar tone="warn" action={act('Admin', () => setView('commissioner'))}>Draft league — set a draft deadline in the Admin tab to open submissions.</StatusBar>;
          }
          if (isCommissioner && draftDeadlineDate && !draftAllocated) {
            const passed = draftDeadlineDate.getTime() <= Date.now();
            const fmt = draftDeadlineDate.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            return <StatusBar tone="warn" action={act('Admin', () => setView('commissioner'))}>Draft submissions {draftSubmissionCount}/{members?.length ?? 0} managers{passed ? ' — deadline passed, run the lottery when ready' : ` · deadline ${fmt}`}</StatusBar>;
          }
          if (squadChecks && mySquadPlayerCount < 15) {
            return <StatusBar tone="warn" action={act('My squad', goSquad)}>Squad incomplete — {mySquadPlayerCount}/15 players. {15 - mySquadPlayerCount} empty slot{15 - mySquadPlayerCount !== 1 ? 's' : ''}.</StatusBar>;
          }
          return null;
        })()}


{/* Desktop tabs (hidden on mobile) */}
        <div className="hidden lg:block" data-tour="league-tabs">
          <HubTabs
            active={viewToTab(view)}
            onTab={setTab}
            isCommissioner={isCommissioner}
            notifyBets={notificationCount > 0}
            notifyTrading={(pendingAuctions ?? []).some(a => a.highest_bidder_id === user?.id && transferWindow.status === 'open') || auctions.some(a => a.highest_bidder_id === user?.id) || incomingTrades.length > 0}
            h2hEnabled={h2hEnabled}
            isDraftLeague={activeLeague?.leagues?.format === 'noduplicate'}
          />
        </div>

        {/* Mobile tab pills (hidden on desktop) */}
        <div className="lg:hidden" data-tour="league-tabs">
          <HubTabPills
            active={viewToTab(view)}
            onTab={setTab}
            isCommissioner={isCommissioner}
            notifyBets={notificationCount > 0}
            notifyTrading={(pendingAuctions ?? []).some(a => a.highest_bidder_id === user?.id && transferWindow.status === 'open') || auctions.some(a => a.highest_bidder_id === user?.id) || incomingTrades.length > 0}
            h2hEnabled={h2hEnabled}
            isDraftLeague={activeLeague?.leagues?.format === 'noduplicate'}
          />
        </div>

        <HubSubSwitch active={viewToTab(view)} onTab={setTab} h2hEnabled={h2hEnabled} />


         {/* â”€â”€ VIEWS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}

         {view === 'detail' && (
           <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
             {/* Bug #4: Persistent pending-trades notice so managers know where
                 to find the proposals they sent or received. Only rendered when
                 at least one proposal is active. */}
             {activeLeague?.leagues?.format === 'noduplicate' && (incomingTrades.length > 0 || outgoingTrades.length > 0) && (
               <div style={{
                 display: 'flex', alignItems: 'center', gap: 10,
                 padding: '9px 16px',
                 background: 'rgba(224,168,0,0.07)',
                 borderBottom: '1px solid rgba(224,168,0,0.25)',
                 flexShrink: 0,
               }}>
                 <span style={{ fontFamily: "Archivo, sans-serif", fontSize: 'var(--fs-micro)', color: 'var(--gold)' }}>
                   ⇄ Trade proposals
                 </span>
                 {incomingTrades.length > 0 && (
                   <span style={{ fontFamily: "Archivo, sans-serif", fontSize: 'var(--fs-micro)', color: 'var(--positive)' }}>
                     {incomingTrades.length} INCOMING
                   </span>
                 )}
                 {outgoingTrades.length > 0 && (
                   <span style={{ fontFamily: "Archivo, sans-serif", fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>
                     {outgoingTrades.length} SENT
                   </span>
                 )}
                 <span style={{ fontFamily: "'Archivo', sans-serif", fontSize: 'var(--fs-micro)', color: 'var(--mute)', flex: 1 }}>
                   · Tap a manager&apos;s card to accept, decline or cancel
                 </span>
               </div>
             )}
             <LeagueDetailView
               leagueId={activeLeague?.league_id}
               members={members}
               currentUser={currentUser}
               membersLoading={membersLoading}
               currentGW={currentGW}
               onH2h={null}
               onViewManager={(mgr) => { setManagerTeamView(mgr); loadManagerRoster(mgr.user_id); }}
               h2hEnabled={h2hEnabled}
             />
           </div>
         )}
         {view === 'recap' && (
           <RecapView
             leagueId={activeLeague?.league_id}
             tournamentId={activeLeague?.leagues?.tournament_id}
             members={members}
             currentUser={currentUser}
             h2hEnabled={h2hEnabled}
           />
         )}


         {view === 'market_report' && (
           <MarketReportView
             leagueId={activeLeague?.league_id}
             members={members}
             currentUser={currentUser}
           />
         )}

         {view === 'bets' && (
           <BetsTabHub
             leagueId={activeLeague?.league_id}
             squadId={mySquadId}
             currentGW={currentGW}
           />
         )}

         {view === 'betting_leaderboard' && (
           <BettingLeaderboardView leaderboard={leaderboard} myBetsByType={myBetsByType} currentUser={currentUser} betLoading={betLoading} />
         )}
         {(view === 'trading' || view === 'auctions') && (
           <TradingView
             auctions={auctions}
             pendingAuctions={pendingAuctions}
             closedAuctions={closedAuctions}
             auctionsLoading={auctionsLoading}
             name={name}
             mySquadId={mySquadId}
             myUserId={user?.id}
             myBudget={mySquadBudget}
             placeBid={placeBid}
             cancelListing={cancelListing}
             sellNow={sellNow}
             confirmWin={confirmWin}
             windowStatus={transferWindow.status}
             incoming={incomingTrades}
             outgoing={outgoingTrades}
             leagueProposals={leagueTradeProposals}
             history={tradeHistory}
             acceptProposal={acceptProposal}
             rejectProposal={rejectProposal}
             cancelProposal={cancelProposal}
             onToast={showToast}
           />
         )}


         {view === 'stats' && (
           <StatsView
             topScorers={topScorers}
             teamMetrics={teamMetrics}
             matchdayPoints={matchdayPoints}
             positionPoints={positionPoints}
             captainHitData={captainHitData}
             benchData={benchData}
             roiData={roiData}
             members={members}
             currentUser={currentUser}
             statsLoading={statsLoading}
           />
         )}
         {view === 'h2h' && h2hEnabled && (
           <H2HView
             leagueId={activeLeague?.league_id}
             currentUser={currentUser}
             members={members}
           />
         )}
         {view === 'commissioner' && isCommissioner && (
           <CommissionerPanel
             commissioner={commissioner}
             leagueId={activeLeague?.league_id}
             tournamentId={activeLeague?.leagues?.tournament_id ?? commissioner?.tournamentId}
             windowType={transferWindow.windowType}
             replayCommissionerTour={replayCommissionerTour}
             memberCount={members.length}
             leagueName={activeLeague?.leagues?.name || activeLeague?.name || 'LEAGUE'}
             league={activeLeague?.leagues ?? null}
           />
         )}
         {showTradeBuilder && tradeTarget && (
            <div role="presentation" className="fixed inset-0 z-50 flex items-end outline-none bg-black/80 animate-in fade-in" onClick={() => setShowTradeBuilder(false)}>
               <div role="presentation" className="w-full h-[90vh] bg-[var(--bg)] rounded-t-2xl flex flex-col animate-in slide-in-from-bottom border-t border-[var(--rule)] relative" onClick={e => e.stopPropagation()}>
                  <div className="w-full flex justify-center py-3"><div className="w-12 h-1.5 bg-[var(--rule)] rounded-full" /></div>
                  <div className="px-6 py-4 border-b border-[var(--rule)] flex justify-between items-center">
                    <div>
                      <div className="text-[11px] text-[#1E88E5] font-black uppercase tracking-[.14em] mb-1">Negotiation table</div>
                      <h2 className="text-xl font-bold text-[var(--paper)]">Trade with {tradeTarget.name}</h2>
                    </div>
                    <button onClick={() => setShowTradeBuilder(false)} className="text-[var(--mute)] hover:text-[var(--paper)] transition-colors">✕</button>
                  </div>
                  <div className="flex-1 overflow-y-auto px-6 py-8 flex flex-col gap-8 no-scrollbar">
                    {/* Incoming trade proposals */}
                    {incomingTrades.length > 0 && (
                      <div>
                        <h3 style={{ color: 'var(--gold)', fontSize: 'var(--fs-label)', fontWeight: 900, letterSpacing: 2, marginBottom: 12 }}>
                          INCOMING OFFERS ({incomingTrades.length})
                        </h3>
                        {incomingTrades.map(p => (
                          <div key={p.id} style={{
                            background: 'var(--card)', border: '1px solid var(--rule)',
                            borderRadius: 4, padding: '12px 16px', marginBottom: 8,
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                              <span style={{ color: 'var(--paper)', fontSize: 'var(--fs-label)', fontWeight: 700 }}>
                                {p.proposer_player?.name} <span style={{ color: 'var(--mute)' }}>for</span> {p.target_player?.name}
                              </span>
                              <span style={{ color: 'var(--mute)', fontSize: 'var(--fs-micro)' }}>
                                {new Date(p.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            {(p.cash_sweetener !== 0 || p.points_sweetener > 0) && (
                              <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                                {p.cash_sweetener !== 0 && (
                                  <span style={{ color: p.cash_sweetener > 0 ? 'var(--positive)' : 'var(--danger)', fontSize: 'var(--fs-micro)', fontWeight: 700 }}>
                                    {p.cash_sweetener > 0 ? `+€${p.cash_sweetener}M (you receive)` : `-€${Math.abs(p.cash_sweetener)}M (you pay)`}
                                  </span>
                                )}
                                {p.points_sweetener > 0 && (
                                  <span style={{ color: 'var(--gold)', fontSize: 'var(--fs-micro)', fontWeight: 700 }}>
                                    +{p.points_sweetener} pts sweetener
                                  </span>
                                )}
                              </div>
                            )}
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button className="hit-44"
                                onClick={async () => {
                                  try {
                                    await acceptProposal(p.id);
                                    showToast('Trade accepted! Squads updated.', 'success');
                                  } catch (err) {
                                    showToast(err.message, 'error');
                                  }
                                }}
                                style={{
                                  background: 'var(--positive)', color: 'var(--on-accent)', fontSize: 'var(--fs-micro)',
                                  fontWeight: 900, padding: '6px 14px', borderRadius: 2, border: 'none', cursor: 'pointer',
                                }}
                              >
                                ACCEPT
                              </button>
                              <button className="hit-44"
                                onClick={async () => {
                                  try {
                                    await rejectProposal(p.id);
                                    showToast('Trade rejected.', 'info');
                                  } catch (err) {
                                    showToast(err.message, 'error');
                                  }
                                }}
                                style={{
                                  background: 'var(--elev)', color: 'var(--mute)', fontSize: 'var(--fs-micro)',
                                  fontWeight: 900, padding: '6px 14px', borderRadius: 2, border: 'none', cursor: 'pointer',
                                }}
                              >
                                DECLINE
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Outgoing proposals I've sent */}
                    {outgoingTrades.length > 0 && (
                      <div>
                        <h3 style={{ color: 'var(--mute)', fontSize: 'var(--fs-label)', fontWeight: 900, letterSpacing: 2, marginBottom: 12 }}>
                          SENT OFFERS ({outgoingTrades.length})
                        </h3>
                        {outgoingTrades.map(p => (
                          <div key={p.id} style={{
                            background: 'var(--card)', border: '1px solid var(--rule)',
                            borderRadius: 4, padding: '12px 16px', marginBottom: 8,
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                              <span style={{ color: 'var(--paper)', fontSize: 'var(--fs-label)', fontWeight: 700 }}>
                                {p.proposer_player?.name} <span style={{ color: 'var(--mute)' }}>for</span> {p.target_player?.name}
                              </span>
                              <span style={{ color: 'var(--mute)', fontSize: 'var(--fs-micro)' }}>awaiting response</span>
                            </div>
                            <button className="hit-44"
                              onClick={async () => {
                                try {
                                  await cancelProposal(p.id);
                                  showToast('Offer cancelled.', 'info');
                                } catch (err) {
                                  showToast(err.message, 'error');
                                }
                              }}
                              style={{
                                background: 'transparent', color: 'var(--danger)', fontSize: 'var(--fs-micro)',
                                fontWeight: 700, padding: '4px 10px', borderRadius: 2,
                                border: '1px solid var(--danger)', cursor: 'pointer',
                              }}
                            >
                              Cancel offer
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="grid grid-cols-[1fr_40px_1fr] items-center gap-2">
                      <div className="flex flex-col gap-2">
                        <label className="text-[11px] font-black text-[var(--mute)] uppercase tracking-widest text-center">My player</label>
                        <select value={tradeMyPlayer?.id || ''} onChange={(e) => {
                           const picked = mySquadPlayers.find(p => p.id === e.target.value);
                           setTradeMyPlayer(picked);
                           // tradeTheirPlayer is NOT cleared — mismatch warning + submit block handle it
                         }} className="bg-[var(--elev)] border border-[var(--rule)] p-3 rounded-sm text-[var(--paper)] text-[12px] font-bold outline-none text-center">
                           <option value="">{mySquadPlayers.length ? '(None)' : 'Loading…'}</option>
                           {[...mySquadPlayers].sort((a, b) => {
                             if (!tradeTheirPlayer) return 0;
                             const aMatch = normalizePos(a.position) === normalizePos(tradeTheirPlayer.position);
                             const bMatch = normalizePos(b.position) === normalizePos(tradeTheirPlayer.position);
                             return aMatch === bMatch ? 0 : aMatch ? -1 : 1;
                           }).map(p => {
                             const posMatch = !tradeTheirPlayer || normalizePos(p.position) === normalizePos(tradeTheirPlayer.position);
                             return <option key={p.id} value={p.id} disabled={!posMatch}>{p.position ? `[${p.position}] ` : ''}{p.name}{p.price ? ` · €${p.price}M` : ''}</option>;
                           })}
                        </select>
                        {tradeMyPlayer && (
                          <button
                            onClick={() => toggleListing(tradeMyPlayer.id)}
                            className={`text-[11px] font-black uppercase tracking-widest px-2 py-1 rounded border transition-all ${
                              myListings.has(tradeMyPlayer.id)
                                ? 'border-[var(--pos)]/40 text-[var(--pos)] bg-[var(--pos-bg)]'
                                : 'border-[var(--rule)] text-[#555]'
                            }`}
                          >
                            {myListings.has(tradeMyPlayer.id) ? '✓ Listed for trade' : '+ List for trade'}
                          </button>
                        )}
                      </div>
                      <div className="text-[#2A2A2A] text-xl mt-6 flex justify-center">↔</div>
                      <div className="flex flex-col gap-2">
                        <label className="text-[11px] font-black text-[var(--mute)] uppercase tracking-widest text-center">Their player</label>
                        <select value={tradeTheirPlayer?.id || ''} onChange={(e) => setTradeTheirPlayer(theirSquadPlayers.find(p => p.id === e.target.value))} className="bg-[var(--elev)] border border-[var(--rule)] p-3 rounded-sm text-[var(--paper)] text-[12px] font-bold outline-none text-center text-ellipsis overflow-hidden">
                           <option value="">{theirSquadPlayers.length ? '(None)' : 'Loading…'}</option>
                           {[...theirSquadPlayers].sort((a, b) => {
                             if (!tradeMyPlayer) return 0;
                             const aMatch = normalizePos(a.position) === normalizePos(tradeMyPlayer.position);
                             const bMatch = normalizePos(b.position) === normalizePos(tradeMyPlayer.position);
                             return aMatch === bMatch ? 0 : aMatch ? -1 : 1;
                           }).map(p => {
                             const posMatch = !tradeMyPlayer || normalizePos(p.position) === normalizePos(tradeMyPlayer.position);
                             return <option key={p.id} value={p.id} disabled={!posMatch}>{p.position ? `[${p.position}] ` : ''}{p.name}{p.price ? ` · €${p.price}M` : ''}</option>;
                           })}
                        </select>
                      </div>
                    </div>
                    
                    <div className="space-y-4 pt-6 border-t border-[var(--rule)]">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[12px] font-bold text-[var(--paper)]">Add Cash Sweetener</span>
                        <span className="text-[14px] font-black text-positive">€{tradeCash.toFixed(1)}M</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-[11px] text-[var(--mute)]">€0M</span>
                        <input type="range" min="-10" max="10" step="0.5" value={tradeCash} onChange={e => setTradeCash(parseFloat(e.target.value))} className="flex-1 accent-cyan" />
                        <span className="text-[11px] text-[var(--mute)]">€10M</span>
                      </div>
                      <p className="text-[11px] text-[var(--mute)] italic text-center">Shift budget caps to balance unequal player values.</p>
                    </div>

                    <div className="space-y-4 pt-6 border-t border-[var(--rule)]">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[12px] font-bold text-[var(--paper)]">Add Points Penalty</span>
                        <span className="text-[14px] font-black text-[#E53935]">{tradePoints} pts</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-[11px] text-[var(--mute)]">0</span>
                        <input type="range" min="0" max="50" step="1" value={tradePoints} onChange={e => setTradePoints(parseInt(e.target.value))} className="flex-1 accent-[#E53935]" />
                        <span className="text-[11px] text-[var(--mute)]">50</span>
                      </div>
                      <p className="text-[11px] text-[var(--mute)] italic text-center">Give up raw ranking points to secure a star player.</p>
                    </div>
                  </div>
                  <div className="p-6 border-t border-[var(--rule)] bg-[var(--bg)] space-y-3">
                    {/* Position mismatch hint */}
                    {tradeMyPlayer && tradeTheirPlayer &&
                      normalizePos(tradeMyPlayer.position) !== normalizePos(tradeTheirPlayer.position) && (
                      <div className="text-[#E53935] text-[11px] font-bold text-center">
                        ⚠ Position mismatch — trades must swap same-position players ({normalizePos(tradeMyPlayer.position)} ↔ {normalizePos(tradeTheirPlayer.position)})
                      </div>
                    )}
                    {tradeError && (
                      <div className="text-[#E53935] text-[11px] font-bold text-center">{tradeError}</div>
                    )}
                    <button
                      disabled={isSendingProposal}
                      onClick={validateAndSendProposal}
                      className="w-full py-4 bg-cyan text-white text-[13px] font-black uppercase tracking-widest rounded active:scale-95 shadow-[0_0_15px_rgba(26,111,168,0.3)]"
                      style={{ backgroundColor: 'var(--accent)' }}
                    >
                      Broadcast Proposal
                    </button>
                  </div>
               </div>
            </div>
         )}

         {managerTeamView && createPortal((() => {
           const mv = members.find(m => m.user_id === managerTeamView.user_id);
           const isMeView = managerTeamView.user_id === currentUser?.id;
           const ord = (n) => { const v = n % 100; return n + (['th', 'st', 'nd', 'rd'][(v - 20) % 10] || ['th', 'st', 'nd', 'rd'][v] || 'th'); };
           const hue = mgrHue(managerTeamView.name || '');
           const w = (managerTeamView.name || '?').trim().split(/\s+/);
           const ini = (w.length > 1 ? w[0][0] + w[1][0] : (managerTeamView.name || '?').slice(0, 2)).toUpperCase();
           const sub = [mv?.rank ? ord(mv.rank) : null, mv?.total_points != null ? `${Math.round(mv.total_points)} pts` : null].filter(Boolean).join(' · ');
           const isDraft = activeLeague?.leagues?.format === 'noduplicate';
           return (
           <div role="presentation" className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={() => setManagerTeamView(null)}>
             <div role="dialog" aria-label={`${managerTeamView.name}'s squad`} className="w-full h-[85vh] bg-[var(--bg)] rounded-t-2xl flex flex-col" onClick={e => e.stopPropagation()}>
               <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 16px 12px' }}>
                 <span aria-hidden="true" style={{ width: 44, height: 44, borderRadius: '50%', background: `${hue}26`, color: hue, display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 'var(--fs-body)', flexShrink: 0 }}>{ini}</span>
                 <div style={{ minWidth: 0, flex: 1 }}>
                   <h2 style={{ margin: 0, fontFamily: "'Archivo Black', sans-serif", fontSize: 'var(--fs-heading)', color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{managerTeamView.name}</h2>
                   {sub && <div className="num" style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>{sub}</div>}
                 </div>
                 <button onClick={() => setManagerTeamView(null)} aria-label="Close" className="hit-44" style={{ width: 44, height: 44, borderRadius: '50%', border: 'none', background: 'var(--elev)', color: 'var(--mute)', cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                 </button>
               </div>
               {h2hEnabled && !isMeView && (
                 <div style={{ padding: '0 16px 12px' }}>
                   <button
                     onClick={() => { setH2hTarget({ user_id: managerTeamView.user_id, name: managerTeamView.name, rank: mv?.rank, total_points: mv?.total_points }); setManagerTeamView(null); }}
                     style={{ width: '100%', minHeight: 'var(--tap)', borderRadius: 'var(--radius)', border: '1px solid var(--rule)', background: 'var(--card)', color: 'var(--paper)', fontFamily: 'inherit', fontSize: 'var(--fs-body)', fontWeight: 600, cursor: 'pointer' }}
                   >Compare with me</button>
                 </div>
               )}
               <div className="flex-1 overflow-y-auto no-scrollbar" style={{ padding: '0 16px 24px' }}>
                 {!managerRoster.length && <LoadingRows rows={3} />}
                 {managerRoster.length > 0 && (
                   <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                     {managerRoster.map((p, i) => {
                       const posColor = p.position === 'GK' ? 'var(--purple)' : p.position === 'DEF' ? 'var(--accent)' : p.position === 'MID' ? 'var(--gold-text)' : 'var(--danger)';
                       return (
                         <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 56, padding: '8px 14px', borderBottom: i < managerRoster.length - 1 ? '1px solid var(--rule)' : 'none' }}>
                           <span style={{ width: 36, textAlign: 'center', padding: '3px 0', borderRadius: 6, fontSize: 'var(--fs-micro)', fontWeight: 700, color: posColor, background: 'var(--elev)', flexShrink: 0 }}>{p.position}</span>
                           <ClubCrest name={p.club} size={26} />
                           <div style={{ minWidth: 0, flex: 1 }}>
                             <div style={{ fontSize: 'var(--fs-body)', fontWeight: 600, color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                             <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>{p.club}</div>
                           </div>
                           <div className="num" style={{ fontSize: 'var(--fs-label)', fontWeight: 600, color: 'var(--paper)', flexShrink: 0 }}>€{p.price}M</div>
                           {isDraft && !isMeView && (
                             <button className="hit-44"
                               onClick={() => { const t = { ...managerTeamView, squadId: squadByUserRef.current[managerTeamView.user_id] }; setTradeTarget(t); setTradeTheirPlayer(p); loadTradeSquads(managerTeamView.user_id); setManagerTeamView(null); setShowTradeBuilder(true); }}
                               style={{ fontFamily: 'inherit', fontSize: 'var(--fs-micro)', fontWeight: 600, color: 'var(--accent)', background: 'transparent', border: '1px solid var(--accent)', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', flexShrink: 0 }}
                             >Trade</button>
                           )}
                         </div>
                       );
                     })}
                   </div>
                 )}
               </div>
             </div>
           </div>
           );
         })(), document.body)}

         {h2hTarget && (
           <H2HSheet
             leagueId={activeLeague.league_id}
             myId={currentUser?.id || '0'}
             rival={h2hTarget}
             myName={currentUser?.username || "You"}
             onClose={() => setH2hTarget(null)}
           />
         )}

      </div>
    );
  }

  const inviteForm = (
    <form onSubmit={handleJoinByCode} style={{ display: 'flex', gap: 0, flex: 1, minWidth: 0 }}>
      <input
        type="text"
        value={joinCode}
        onChange={e => {
          const val = e.target.value.toUpperCase();
          setJoinCode(val);
          setJoinError(val.trim().length > 0 && val.trim().length < 4 ? 'Codes are 6+ characters' : '');
        }}
        placeholder="XXXXXX"
        maxLength={8}
        style={{
          flex:          1,
          minWidth:      0,
          padding:       '11px 16px',
          background:    'var(--card)',
          border:        `1px solid ${joinError ? 'rgba(240,58,58,0.5)' : 'var(--rule)'}`,
          borderRight:   'none',
          color:         'var(--paper)',
          fontSize: 'var(--fs-body)',
          fontFamily:    MONO,
          fontWeight:    700,
          outline:       'none',
        }}
      />
      <button
        type="submit"
        disabled={joinLoading || joinCode.trim().length < 4}
        className="ffl-btn ffl-btn--gold ffl-btn--md"
        style={{
          fontFamily:    MONO,
          fontSize: 'var(--fs-micro)',
          flexShrink:    0,
        }}
      >
        {joinLoading ? '…' : 'Join →'}
      </button>
    </form>
  );

  // B-13: hide archived leagues from the list by default
  const archivedLeagueCount = leagues.filter(l => l.leagues?.archived).length;
  const visibleLeagues = showArchived ? leagues : leagues.filter(l => !l.leagues?.archived);

  const archiveToggle = archivedLeagueCount > 0 && (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)',  }}>
      <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
      Show archived ({archivedLeagueCount})
    </label>
  );

  const emptyState = (
    <div className="p-8 text-center">
      <div className="fk-display" style={{ fontSize: 'var(--fs-title)', color: 'var(--gold)', marginBottom: '12px' }}>FFL</div>
      <div className="text-[13px] font-bold uppercase tracking-wide text-[var(--paper)] mb-2">No leagues yet</div>
      <div className="text-[11px] text-text-secondary mb-6">Create a league or enter a friend's invite code below.</div>
      <button onClick={() => setView('create')} className="px-6 py-3 bg-cyan text-white text-[11px] font-bold uppercase tracking-wider">
        Create a League
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-bg" style={{ color: 'var(--paper)' }}>
      {/* Desktop */}
      <div className="hidden lg:flex flex-col">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '28px 40px 20px', borderBottom: '1px solid var(--rule)' }}>
          <div>
            <div className="fk-eyebrow" style={{ marginBottom: 6 }}>Season</div>
            <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 'var(--fs-title)', letterSpacing: '-0.02em' }}>My Leagues</div>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            {archiveToggle}
            <div style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>
              {visibleLeagues.length} {visibleLeagues.length === 1 ? 'LEAGUE' : 'LEAGUES'}
            </div>
            <button
              onClick={() => setView('create')}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', border: '1px solid var(--accent)', color: 'var(--accent)', background: 'transparent', fontFamily: MONO, fontSize: 'var(--fs-micro)', cursor: 'pointer' }}
            >
              + Create League
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs font-bold uppercase tracking-widest opacity-50">Syncing...</div>
        ) : visibleLeagues.length === 0 ? emptyState : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr 140px 140px', gap: 0, padding: '10px 40px', borderBottom: '1px solid var(--rule)' }}>
              <span style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>Rank</span>
              <span style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>League</span>
              <span style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', textAlign: 'center' }}>Type</span>
              <span style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', textAlign: 'right' }}>Total Pts</span>
            </div>
            {visibleLeagues.map(l => {
              const { type, format } = deriveLeagueType(l.leagues ?? {});
              const medal = l.rank === 1 ? 'var(--gold)' : l.rank === 2 ? 'var(--medal-silver)' : l.rank === 3 ? 'var(--medal-bronze)' : 'var(--mute)';
              return (
                <div role="button" tabIndex={0} onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); (() => navigate(`/league/${l.league_id}`))(e); } }}
                  key={l.league_id}
                  onClick={() => navigate(`/league/${l.league_id}`)}
                  style={{
                    display: 'grid', gridTemplateColumns: '64px 1fr 140px 140px', gap: 0,
                    padding: '0 40px',
                    borderBottom: '1px solid var(--rule)',
                    borderLeft: '3px solid transparent',
                    cursor: 'pointer', alignItems: 'center', transition: 'all .1s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderLeftColor = TYPE_COLOR[type] || 'var(--mute)'; e.currentTarget.style.background = 'var(--elev)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderLeftColor = 'transparent'; e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ padding: '20px 0' }}>
                    <span style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 'var(--fs-title)', color: medal, lineHeight: 1 }}>{l.rank ? `#${l.rank}` : '—'}</span>
                  </div>
                  <div style={{ padding: '20px 16px 20px 12px', minWidth: 0 }}>
                    <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 'var(--fs-body)', letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {l.leagues?.name || l.name}
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', marginTop: 4 }}>
                      {l.member_count ?? '—'} members
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                    <TypeChip type={type} format={format} />
                    {l.leagues?.archived && <ArchivedBadge />}
                  </div>
                  <div style={{ textAlign: 'right', padding: '20px 0' }}>
                    <NumberFlow value={l.total_points || 0} style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 'var(--fs-title)', color: 'var(--positive)' }} />
                    <span style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', marginLeft: 5 }}>Pts</span>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* Invite code — inline at bottom */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '20px 40px', borderTop: '1px solid var(--rule)', marginTop: 'auto' }}>
          <div style={{ flexShrink: 0 }}>
            <div style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--accent)', marginBottom: 3 }}>Have an invite code?</div>
            <div style={{ fontSize: 'var(--fs-body)', color: 'var(--mute)' }}>Enter below to join a friend's league</div>
          </div>
          <div style={{ flex: 1, display: 'flex', maxWidth: 440 }}>
            {inviteForm}
          </div>
          {joinError && (
            <div style={{ fontSize: 'var(--fs-label)', color: 'var(--danger)', fontFamily: MONO, flexShrink: 0 }}>{joinError}</div>
          )}
        </div>
      </div>

      {/* Mobile */}
      <div className="lg:hidden pb-24">
        <PullToRefreshIndicator progress={pullToRefresh.progress} refreshing={pullToRefresh.refreshing} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px 12px', borderBottom: '1px solid var(--rule)' }}>
          <div>
            <div className="fk-eyebrow" style={{ marginBottom: 3 }}>Season</div>
            <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 'var(--fs-title)', letterSpacing: '-0.02em' }}>My Leagues</div>
          </div>
          <button
            onClick={() => setView('create')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', border: '1px solid var(--accent)', color: 'var(--accent)', background: 'transparent', fontFamily: MONO, fontSize: 'var(--fs-micro)', cursor: 'pointer' }}
          >
            + New
          </button>
        </div>

        {archivedLeagueCount > 0 && (
          <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--rule)' }}>{archiveToggle}</div>
        )}

        {loading ? (
          <div className="p-8 text-center text-xs font-bold uppercase tracking-widest opacity-50">Syncing...</div>
        ) : visibleLeagues.length === 0 ? emptyState : (
          visibleLeagues.map(l => {
            const { type, format } = deriveLeagueType(l.leagues ?? {});
            const tc = TYPE_COLOR[type] || 'var(--mute)';
            return (
              <div role="button" tabIndex={0} onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); (() => navigate(`/league/${l.league_id}`))(e); } }}
                key={l.league_id}
                onClick={() => navigate(`/league/${l.league_id}`)}
                className="active:opacity-70"
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--rule)', borderLeft: `3px solid ${tc}`, cursor: 'pointer' }}
              >
                <div style={{ width: 36, flexShrink: 0, textAlign: 'center' }}>
                  <RankBadge rank={l.rank} />
                  <div style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', marginTop: 2 }}>{l.member_count ?? '—'}P</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 'var(--fs-body)', letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {l.leagues?.name || l.name}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                    <TypeChip type={type} format={format} />
                    {l.leagues?.archived && <ArchivedBadge />}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <NumberFlow value={l.total_points || 0} style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 'var(--fs-heading)', color: 'var(--positive)', lineHeight: 1 }} />
                  <div style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', marginTop: 2 }}>Pts Total</div>
                </div>
              </div>
            );
          })
        )}

        {/* Invite row */}
        <div style={{ padding: '16px 18px', borderTop: '2px solid var(--rule)', marginTop: 4 }}>
          <div style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--accent)', marginBottom: 3 }}>Have an invite code?</div>
          <div style={{ fontSize: 'var(--fs-body)', color: 'var(--mute)', marginBottom: 12 }}>Enter below to join a friend's league</div>
          {inviteForm}
          {joinError && (
            <div style={{ marginTop: '8px', fontSize: 'var(--fs-label)', color: 'var(--danger)', fontFamily: MONO }}>{joinError}</div>
          )}
        </div>
      </div>
    </div>
  );
}
