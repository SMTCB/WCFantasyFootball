import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
// Empty squad shown when user has no squad yet (instead of demo data)
const EMPTY_SQUAD = {
  budget: { current: 100, total: 100 },
  captainId: null,
  players: [],
  bench: [],
};
import { getDangerZonePlayers, normalizeIntelligence, LINEUP_STATUS } from '../lib/intelligence';
import { normalisePlayer, buildFixtureInfo, formatFixtureStatus } from '../lib/players';
import { useAuth } from '../hooks/useAuth';
import { useDeadlineCountdown } from '../hooks/useDeadlineCountdown';
import { useTransferWindow } from '../hooks/useTransferWindow';
import TransferWindowBanner from '../components/TransferWindowBanner';
import { useOnboarding } from '../hooks/useOnboarding';
import { useTransfer } from '../hooks/useTransfer';
import { useLeagueConfig } from '../hooks/useLeagueConfig';
import { useAvailabilityFlag } from '../hooks/useAvailabilityFlag';
import { useAuctions } from '../hooks/useAuctions';
import { useAutoFill } from '../hooks/useAutoFill';
import { useToast } from '../hooks/useToast';
import LeagueSelector from '../components/LeagueSelector';
import OnboardingTour from '../components/OnboardingTour';
import ConfirmModal from '../components/ConfirmModal';
import Button from '../components/Button';
import PitchView from '../components/PitchView';
import PlayerCard from '../components/PlayerCard';
import PlayerPickerSheet from '../components/PlayerPickerSheet';
import SectionHeader from '../components/SectionHeader';
import PowerToolCard from '../components/PowerToolCard';
import { AvailabilityBadge } from '../components/AvailabilityBadge';
import { POS_ORDER, POS_LABEL, POS_BADGE_COLOR } from '../lib/formations';
import ScoringInfoModal from '../components/ScoringInfoModal';
import { usePlayerStats } from '../hooks/usePlayerStats';
import { useLeagueOwnership } from '../hooks/useLeagueOwnership';
import PlayerStatsDashboard from '../components/player/PlayerStatsDashboard';
import FormStrip from '../components/FormStrip';
import KnockoutKeepSelector from '../components/KnockoutKeepSelector';
import SelectLeaguePicker from '../components/league/SelectLeaguePicker';
import { deriveLeagueType } from '../components/league/LeagueBadgeHelpers';

// â"€â"€ Chip config â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
const CHIPS = [
  {
    key:         'triple_captain',
    label:       'Triple Captain',
    description: 'All-or-Nothing: your captain scores 3× points — but 0 if they don\'t play.',
    stateKey:    'isTripleCaptain',
    dbField:     'is_triple_captain',
    activeColor: 'var(--gold)',
    activeStyle: { borderColor: 'rgba(240,180,0,0.35)', background: 'rgba(240,180,0,0.07)' },
    inactiveStyle: { borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' },
  },
];

// â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

// Set to true to re-enable chip UI (Triple Captain + Matchday Joker) post-pilot
const CHIPS_ENABLED = false;

export default function SquadScreen() {
  const { user } = useAuth();
  const { show: showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const leagueIdParam = searchParams.get('leagueId');
  const [activeLeague,       setActiveLeague]      = useState(leagueIdParam);
  const [leagues,            setLeagues]           = useState(null);   // null = not yet loaded
  const [jokerPlayer,        setJokerPlayer]       = useState(null);
  const [isJokerPickerOpen,  setIsJokerPickerOpen] = useState(false);
  const [squadData,          setSquadData]         = useState(null);
  const [loading,            setLoading]           = useState(true);
  const [todayJokerId,       setTodayJokerId]      = useState(null);
  const [playingTodayTeams,  setPlayingTodayTeams] = useState([]);
  const [selectedPlayer,     setSelectedPlayer]    = useState(null);
  const [swapMode,           setSwapMode]          = useState(false);
  const [saving,             setSaving]            = useState(false);
  // Mobile tab: 'pitch' | 'squad' | 'tools'
  const [mobileTab,          setMobileTab]         = useState('pitch');
  // Desktop sub-tab: 'pitch' | 'list' | 'chips' | 'status'
  const [desktopTab,         setDesktopTab]        = useState('pitch');
  // Danger banner dismissed on mobile
  const [dangerDismissed,    setDangerDismissed]   = useState(false);
  // Transfer window lock (from matchday_deadlines table)
  const [_windowDeadline,    setWindowDeadline]    = useState(null);
  // Confirmation dialog state (FB-023)
  const [confirm,            setConfirm]           = useState(null);
  const [pickerPos,          setPickerPos]         = useState(null);
  const [fetchError,         setFetchError]        = useState(null);
  const [tournamentId,       setTournamentId]      = useState(null);
  const [showChipWizard,     setShowChipWizard]    = useState(false);
  const [showScoringModal,   setShowScoringModal]  = useState(false);

  // On mount: resolve which league to show
  useEffect(() => {
    const init = async () => {
      if (leagueIdParam) {
        // Clear any stale squad from a previous league so the loading screen
        // shows immediately instead of flashing the wrong player count.
        setSquadData(null);
        setLoading(true);
        setActiveLeague(leagueIdParam);
        return;
      }
      const { data } = await supabase
        .from('league_members')
        .select('league_id, rank, total_points, leagues(id, name, tournament_id, format, h2h_enabled, league_mode)')
        .eq('user_id', user?.id);
      const rows = data ?? [];
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
          rank: r.rank,
          totalPoints: r.total_points,
          members: memberCounts[r.league_id],
          type, format,
        };
      });
      // Always set leagues list so the selector can be shown.
      // Auto-select only when coming from a leagueId URL param (handled above).
      setLeagues(list);
    };
    if (user?.id) init();
  }, [user?.id, leagueIdParam]);

  // Resolve tournament_id whenever the active league is known or changes
  useEffect(() => {
    if (!activeLeague) return;
    supabase
      .from('leagues')
      .select('tournament_id')
      .eq('id', activeLeague)
      .maybeSingle()
      .then(({ data }) => { if (data?.tournament_id) setTournamentId(data.tournament_id); });
  }, [activeLeague]);

  // Competition-agnostic config from the selected league row
  const cfg = useLeagueConfig(activeLeague);
  const POS_LIMITS = cfg.positionLimits;

  // Draft gate: single question — has the lottery run for this league?
  // YES → stay on squad screen. NO → draft submission screen.
  useEffect(() => {
    if (cfg.loading || !user?.id) return;
    if (cfg.format !== 'noduplicate') return;
    if (!activeLeague) return;
    let cancelled = false;
    (async () => {
      const { count } = await supabase
        .from('draft_allocations')
        .select('id', { count: 'exact', head: true })
        .eq('league_id', activeLeague)
        .not('allocated_players', 'is', null);
      if (cancelled) return;
      if (!count || count === 0) navigate(`/league/${activeLeague}/draft`);
    })();
    return () => { cancelled = true; };
  }, [cfg.loading, cfg.format, user?.id, activeLeague]);

  // Form history — last 5 GW pts per player for the squad list strip
  const { statsMap: squadStatsMap } = usePlayerStats(tournamentId);

  // League ownership % per player — used in stats dashboard + action sheet
  const { ownershipMap } = useLeagueOwnership(activeLeague);

  // Full stats dashboard modal — set to a player object to open
  const [statsDashboardPlayer, setStatsDashboardPlayer] = useState(null);

  // Transfer hook — league-scoped buy/sell + no-repeat enforcement
  const { buy, sell, takenMap, isOwnedBy } = useTransfer(activeLeague);

  // Availability flags hook — league-scoped player flags for trade offers
  const { flagMap, toggleFlag } = useAvailabilityFlag(activeLeague);

  // Auction hook — list players for auction in the current league
  const { listPlayer: listForAuction, auctions: activeAuctions, cancelListing } = useAuctions(activeLeague, squadData?.squadId);
  const [auctionBusy, setAuctionBusy] = useState(null); // playerId being listed
  const [cancelBusy, setCancelBusy] = useState(null); // playerId being cancelled
  const [confirmCancelId, setConfirmCancelId] = useState(null); // playerId pending two-tap cancel confirm

  const handleAuctionBadgeClick = useCallback(async (player, listing) => {
    if (!listing) return;
    if (listing.highest_bidder_id) {
      showToast('A bid has already been placed — this listing can no longer be cancelled here. Go to the Trading tab to Sell Now.', 'info');
      return;
    }
    if (confirmCancelId !== player.id) {
      setConfirmCancelId(player.id);
      setTimeout(() => setConfirmCancelId(curr => (curr === player.id ? null : curr)), 4000);
      return;
    }
    setConfirmCancelId(null);
    setCancelBusy(player.id);
    const res = await cancelListing(listing.id);
    setCancelBusy(null);
    if (!res.ok) showToast(res.error, 'error');
    else showToast('Listing cancelled.', 'info');
  }, [cancelListing, confirmCancelId, showToast]);

  // â"€â"€ Data Fetching â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const fetchSquad = useCallback(async () => {
    try {
      setLoading(true);
      const userId = user?.id;
      const today  = new Date().toISOString().split('T')[0];

      // â"€â"€ Transfer window lock check — use latest matchday deadline â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
      // U11: scope deadline check to this league's tournament; capture matchday_id for squad filter
      // Guard: if activeLeague is known but tournamentId hasn't resolved yet (race condition
      // on URL-param navigation), skip the deadline query. Using a cross-tournament deadline
      // would inject a foreign matchday filter into the squad query, loading the wrong squad.
      // fetchSquad re-runs once tournamentId resolves via the tournament useEffect.
      let activeMatchdayId = null;
      if (tournamentId) {
        const { data: deadlineRow } = await supabase
          .from('matchday_deadlines').select('deadline_at, matchday_id')
          .gte('deadline_at', new Date().toISOString())
          .eq('tournament_id', tournamentId)
          .order('deadline_at', { ascending: true }).limit(1)
          .maybeSingle();
        if (deadlineRow?.deadline_at) setWindowDeadline(new Date(deadlineRow.deadline_at));
        activeMatchdayId = deadlineRow?.matchday_id ?? null;
      } else if (!activeLeague) {
        // No league context — global next deadline (shown on league-picker screen)
        const { data: deadlineRow } = await supabase
          .from('matchday_deadlines').select('deadline_at, matchday_id')
          .gte('deadline_at', new Date().toISOString())
          .order('deadline_at', { ascending: true }).limit(1)
          .maybeSingle();
        if (deadlineRow?.deadline_at) setWindowDeadline(new Date(deadlineRow.deadline_at));
        activeMatchdayId = deadlineRow?.matchday_id ?? null;
      }

      // Query joker by matchday_id if known, else fall back to today's date
      let jokerQuery = supabase.from('daily_jokers').select('player_id').eq('user_id', userId);
      if (activeMatchdayId) {
        jokerQuery = jokerQuery.eq('matchday_id', activeMatchdayId);
      } else {
        jokerQuery = jokerQuery.eq('joker_date', today);
      }
      const { data: jokerRec } = await jokerQuery.maybeSingle();
      let jokerP = null;
      if (jokerRec?.player_id) {
        const { data: jp } = await supabase.from('players').select('*').eq('id', jokerRec.player_id).single();
        if (jp) jokerP = { ...jp, isJoker: true };
      }
      setJokerPlayer(jokerP);
      setTodayJokerId(jokerRec?.player_id || null);

      // Most-recent squad first — ensures we get the live matchday squad, not an older one
      // U11: filter squad by active matchday when known; fall back to newest row otherwise
      let squadQuery = supabase.from('squads').select('*').eq('user_id', userId);
      if (activeLeague)      squadQuery = squadQuery.eq('league_id', activeLeague);
      if (activeMatchdayId)  squadQuery = squadQuery.eq('matchday_id', activeMatchdayId);
      let { data: squad, error } = await squadQuery.order('created_at', { ascending: false }).limit(1).maybeSingle();
      // Fallback: if exact matchday yields no squad (e.g. squad was created for an older round),
      // retry without the matchday filter to load the most recently created squad.
      if (!error && !squad && activeMatchdayId && activeLeague) {
        const { data: fallback, error: fbErr } = await supabase
          .from('squads').select('*').eq('user_id', userId).eq('league_id', activeLeague)
          .order('created_at', { ascending: false }).limit(1).maybeSingle();
        squad = fallback ?? null;
        error = fbErr ?? null;
      }
      if (error) {
        setFetchError('Could not load your squad. Tap Retry to try again.');
        setSquadData(EMPTY_SQUAD); setLoading(false); return;
      }
      if (!squad) { setSquadData(EMPTY_SQUAD); setLoading(false); return; }

      const playerIds = squad.players || [];

      // Build fixture query — filter by matchday_id column (not fixture id prefix).
      // If the current round has no finished fixtures yet, fall back to the most
      // recently completed round so the pitch always shows meaningful points.
      let fixturesQuery = supabase.from('fixtures').select('id, matchday_id').eq('status', 'finished');
      if (squad.matchday_id) {
        fixturesQuery = fixturesQuery.eq('matchday_id', squad.matchday_id);
      } else if (tournamentId) {
        fixturesQuery = fixturesQuery.eq('tournament_id', tournamentId);
      } else {
        fixturesQuery = fixturesQuery.eq('id', 'null_no_matchday');
      }

      // Active-matchday fixtures (any status) for the fixture-timing indicator —
      // strictly the squad's CURRENT matchday, never a future/past round.
      const activeFixturesQuery = squad.matchday_id
        ? supabase.from('fixtures')
            .select('home_team, away_team, status, kickoff_at, home_score, away_score')
            .eq('matchday_id', squad.matchday_id)
        : Promise.resolve({ data: [] });

      const [
        { data: players,   error: pErr },
        { data: intelData },
        { data: statsData },
        { data: currentRoundFixtures },
        { data: activeRoundFixtures },
      ] = await Promise.all([
        supabase.from('players').select('*').in('id', playerIds),
        supabase.from('player_status').select('*').in('player_id', playerIds),
        supabase.from('player_match_stats')
          .select('player_id, fantasy_points, fixture_id')
          .in('player_id', playerIds),
        fixturesQuery,
        activeFixturesQuery,
      ]);

      // If the current round has no finished fixtures, fall back to the last
      // completed round so the pitch shows last-round stats rather than all zeros.
      let fixtures = currentRoundFixtures;
      if ((!fixtures || fixtures.length === 0) && squad.matchday_id && tournamentId) {
        const { data: prevFixtures } = await supabase
          .from('fixtures')
          .select('id, matchday_id')
          .eq('tournament_id', tournamentId)
          .eq('status', 'finished')
          .order('kickoff_at', { ascending: false })
          .limit(30);
        if (prevFixtures?.length) {
          const latestMD = prevFixtures[0].matchday_id;
          fixtures = prevFixtures.filter(f => f.matchday_id === latestMD);
        }
      }
      if (pErr) throw pErr;

      // Sum fantasy_points across all finished fixtures for this matchday
      const finishedFixtureIds = new Set((fixtures || []).map(f => f.id));
      const pointsMap = {};
      for (const s of statsData || []) {
        if (finishedFixtureIds.has(s.fixture_id)) {
          pointsMap[s.player_id] = (pointsMap[s.player_id] || 0) + Number(s.fantasy_points);
        }
      }

      // Phase B: use starting_xi when set; fallback to players[0..10] for legacy squads
      const startingXiArr = squad.starting_xi?.length > 0 ? squad.starting_xi : playerIds.slice(0, 11);
      // Defensive filter: only mark players as starters if they were actually fetched.
      // Ghost IDs in starting_xi (not in squad.players) would otherwise create invisible XI slots.
      const fetchedIds    = new Set((players || []).map(p => p.id));
      const starterIds    = new Set(startingXiArr.filter(id => fetchedIds.has(id)));
      // Locked-out players (subbed out this matchday — cannot return to XI until next round)
      const lineupLocks   = squad.lineup_locks ?? {};
      const lockedIds     = new Set(lineupLocks[squad.matchday_id] ?? []);

      // Resolve captain ahead of the player map so the captain's displayed points
      // can carry the ×2/×3 multiplier (matches RecapView/LiveScreen — round the
      // raw score BEFORE multiplying, e.g. round(4.75)*2=10, not round(4.75*2)).
      const captainIdForPoints = squad.captain_id || playerIds[0] || '';
      const captainMult = squad.is_triple_captain ? 3 : 2;

      const mappedPlayers = (players || []).map((p) => {
        const playerIntel = intelData?.find(i => i.player_id === p.id);
        const isStarter   = starterIds.has(p.id);
        const isLocked    = lockedIds.has(p.id);
        const rawPts      = pointsMap[p.id] ?? 0;
        const mult        = (p.id === captainIdForPoints && isStarter) ? captainMult : 1;
        // normalisePlayer strips unknown keys — set isBench/isLineupLocked after the call
        const normalised  = normalisePlayer({
          ...p,
          points: Math.round(rawPts) * mult,
          intel:  normalizeIntelligence(playerIntel),
        });
        const fixtureInfo = buildFixtureInfo(p, activeRoundFixtures);
        const fixtureStatus = formatFixtureStatus(fixtureInfo);
        // rawPoints: unmultiplied per-fixture score, used for swap-out deduction
        // warnings (set_lineup's interim deduction is the raw value, not captain-doubled).
        return { ...normalised, rawPoints: Math.round(rawPts), isBench: !isStarter, isLineupLocked: isLocked, fixtureInfo, fixtureStatus };
      });

      // Enforce formation rules: 1 GK, 3-5 DEF, 2-4 MID, 1-2 FWD, total 11
      // If DB returned incorrect positions or counts, rebuild from scratch
      let pitchPlayers = mappedPlayers.filter(p => !p.isBench);
      let benchPlayers = mappedPlayers.filter(p => p.isBench);

      // Group by position
      const gks = pitchPlayers.filter(p => p.position === 'GK');
      // If starting_xi was empty/unset in the DB, set_lineup's own lazy-init (GK-first
      // ordering) can diverge from this client's slice(0,11)-based pitch — persist ours
      // now so the server never has to guess, and set_lineup operates on what's shown.
      let needsXiFix = !(squad.starting_xi?.length > 0);

      // Enforce rules: must have exactly 1 GK
      if (gks.length > 1) {
        const extraGks = gks.slice(1);
        benchPlayers = [...benchPlayers, ...extraGks];
        pitchPlayers = pitchPlayers.filter(p => p.position !== 'GK' || gks.indexOf(p) === 0);
        needsXiFix = true;
      } else if (gks.length === 0 && benchPlayers.length > 0) {
        // No GK on pitch — move one from bench and persist the fix
        const benchGk = benchPlayers.find(p => p.position === 'GK');
        if (benchGk) {
          benchPlayers = benchPlayers.filter(p => p.id !== benchGk.id);
          pitchPlayers = [...pitchPlayers, benchGk];
          needsXiFix = true;
        }
      }

      // If pitch doesn't have exactly 11 players, reorder
      if (pitchPlayers.length > 11) {
        benchPlayers = [...benchPlayers, ...pitchPlayers.slice(11)];
        pitchPlayers = pitchPlayers.slice(0, 11);
        needsXiFix = true;
      } else if (pitchPlayers.length < 11) {
        // Pull bench players up to fill to 11 — non-GKs first
        const nonGkBench = benchPlayers.filter(p => p.position !== 'GK');
        const gkBench    = benchPlayers.filter(p => p.position === 'GK');
        const candidates = [...nonGkBench, ...gkBench];
        while (pitchPlayers.length < 11 && candidates.length > 0) {
          const next = candidates.shift();
          pitchPlayers = [...pitchPlayers, next];
          benchPlayers = benchPlayers.filter(p => p.id !== next.id);
        }
        if (pitchPlayers.length === 11) needsXiFix = true;
      }

      // Persist corrected starting_xi to DB so it doesn't re-break on every load.
      // Fire-and-forget (self-heals on next load if it fails) but log so a persistent
      // rejection (RLS/guard) doesn't stay invisible.
      if (needsXiFix && squad.id) {
        supabase.from('squads').update({ starting_xi: pitchPlayers.map(p => p.id) }).eq('id', squad.id)
          .then(({ error }) => { if (error) console.warn('[SquadScreen] starting_xi self-heal failed:', error.message); });
      }

      // If no captain was ever set, default to first player and persist immediately
      // so scoring applies the ×2 bonus without requiring a manual squad-screen visit.
      const resolvedCaptainId = captainIdForPoints;
      if (!squad.captain_id && resolvedCaptainId && squad.id) {
        supabase.from('squads').update({ captain_id: resolvedCaptainId }).eq('id', squad.id)
          .then(({ error }) => { if (error) console.warn('[SquadScreen] captain_id auto-set failed:', error.message); });
      }

      setSquadData({
        squadId:         squad.id,
        leagueId:        squad.league_id,
        matchdayId:      squad.matchday_id,
        budget:          { current: Number(squad.budget_remaining ?? cfg.budgetTotal ?? 100), total: cfg.budgetTotal ?? 100 },
        captainId:       resolvedCaptainId,
        players:         pitchPlayers,
        bench:           benchPlayers,
        startingXi:      squad.starting_xi || [],
        lineupLocks:     lineupLocks,
        lockedIds:       lockedIds,
        isWildcard:      squad.is_wildcard,
        isTripleCaptain: squad.is_triple_captain,
        locked_at:       squad.locked_at,
      });
    } catch (err) {
      console.error(err);
      setFetchError('Could not load your squad. Showing demo data.');
      setSquadData(EMPTY_SQUAD);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, activeLeague, tournamentId]);

  // Auto-fill hook — reusable across Squad, Market, League screens
  const { handleAutoFill, autoFilling, autoFillMsg } = useAutoFill(activeLeague, squadData, fetchSquad, takenMap, buy, cfg);

  // Live countdown hook — pass tournamentId so it finds the correct deadline row.
  const deadline = useDeadlineCountdown({ tournamentId });
  // Transfer window status for the sticky banner (open / upcoming / no_window).
  const transferWindow = useTransferWindow(activeLeague);

  // KPI header: when window is in recovery (upcoming), count down to opensAt.
  // When open, use the deadline countdown (closes at next matchday).
  const [windowKpi, setWindowKpi] = useState({ label: 'Transfers', text: '', color: 'var(--mute)' });
  useEffect(() => {
    const target = transferWindow.status === 'upcoming'
      ? transferWindow.opensAt
      : transferWindow.status === 'open'
      ? transferWindow.closesAt
      : null;
    if (!target) {
      setWindowKpi({ label: 'Transfers', text: transferWindow.status === 'no_window' ? '—' : 'CLOSED', color: 'var(--mute)' });
      return;
    }
    const tick = () => {
      const ms = new Date(target) - Date.now();
      if (ms <= 0) { setWindowKpi({ label: transferWindow.status === 'upcoming' ? 'Opens In' : 'Transfers', text: '—', color: 'var(--mute)' }); return; }
      const d = Math.floor(ms / 86400000);
      const h = Math.floor((ms % 86400000) / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      const text = d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
      setWindowKpi(transferWindow.status === 'upcoming'
        ? { label: 'Opens In', text, color: 'var(--warn)' }
        : { label: 'Transfers', text, color: h < 2 ? 'var(--danger)' : 'var(--positive)' }
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [transferWindow.status, transferWindow.opensAt, transferWindow.closesAt]);

  // First-visit tour
  const { showSquadTour, completeSquadTour, replaySquadTour } = useOnboarding();

  const SQUAD_TOUR_STEPS = [
    {
      target: 'squad-pitch',
      title:  'Your Pitch',
      body:   'This is your starting XI laid out on a pitch. Tap any player to see options — swap positions, set captain, or activate your Matchday Joker.',
    },
    {
      target: 'squad-budget',
      title:  'Budget & Deadline',
      body:   'Your remaining budget and the transfer window countdown live here. When the window closes, no more transfers until the next matchday.',
    },
    {
      target: 'squad-power-tools',
      title:  'Power Tools',
      body:   'Triple Captain and Matchday Joker live here. Each is one-use — activate carefully.',
    },
    {
      target: 'squad-chips',
      title:  'Chips & Boosts',
      body:   'Triple Captain scores 3× points — or 0 if they don\'t play. Matchday Joker adds a 16th man for this matchday. Use them wisely, they\'re one-per-season.',
    },
  ];


  useEffect(() => {
    if (activeLeague) {
      fetchSquad();
      fetchDailyStatus();
    } else if (leagues !== null) {
      // No active league selected after leagues have loaded — show empty state.
      // squadData intentionally NOT in deps: including it caused an infinite loop
      // because fetchSquad sets squadData → effect reruns → fetchSquad again.
      setSquadData(EMPTY_SQUAD);
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // tournamentId included so the fixture fallback (which needs it) re-runs after async resolution.
  // squadData deliberately excluded: setting it inside fetchSquad would cause an infinite loop.
  }, [user?.id, activeLeague, leagues, tournamentId]);

  const fetchDailyStatus = async () => {
    try {
      const userId = user?.id;
      const today  = new Date().toISOString().split('T')[0];
      const { data: joker } = await supabase.from('daily_jokers').select('player_id')
        .eq('user_id', userId).eq('joker_date', today).maybeSingle();
      if (joker) setTodayJokerId(joker.player_id);
      const { data: fixtures } = await supabase.from('fixtures').select('home_team, away_team');
      const teams = new Set();
      fixtures?.forEach(f => { teams.add(f.home_team); teams.add(f.away_team); });
      setPlayingTodayTeams(Array.from(teams));
    } catch (err) { console.error('Daily status error', err); }
  };

  // â"€â"€ Actions â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const handlePlayerClick = (player) => {
    if (player.isJokerSlot) { setIsJokerPickerOpen(true); return; }
    if (swapMode && selectedPlayer) { handleSwap(selectedPlayer, player); return; }
    setSelectedPlayer(prev => prev?.id === player.id ? null : player);
  };

  // â"€â"€ FB-022: formation validation â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const validateFormation = (pitchPlayers) => {
    const MIN_FORMATION = cfg.minFormation;
    const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    pitchPlayers.forEach(p => { if (counts[p.position] !== undefined) counts[p.position]++; });
    if (counts['GK'] > 1) return 'Only 1 GK allowed in the starting XI.';
    for (const [pos, min] of Object.entries(MIN_FORMATION)) {
      if (counts[pos] < min) return `This swap leaves you with only ${counts[pos]} ${pos} on the pitch (minimum ${min}).`;
    }
    return null;
  };


  const handleSwap = (p1, p2) => {
    const isP1Bench = squadData.bench.some(b => b.id === p1.id);
    const isP2Bench = squadData.bench.some(b => b.id === p2.id);
    // Same zone — stay in swap mode, show hint toast
    if (isP1Bench === isP2Bench) {
      showToast(isP1Bench ? 'Tap a starter to bring them on' : 'Tap a bench player to substitute in', 'info');
      return;
    }

    const pitchPlayer = isP1Bench ? p2 : p1;
    const benchPlayer = isP1Bench ? p1 : p2;

    // Bench player locked out this matchday — cannot sub in
    if (benchPlayer.isLineupLocked) {
      showToast(`${benchPlayer.name} was already subbed out this round and cannot return.`, 'warning');
      setSwapMode(false);
      setSelectedPlayer(null);
      return;
    }

    // If pitcher already scored, warn about deduction before confirming.
    // Use rawPoints (unmultiplied) — set_lineup's interim deduction is the raw
    // per-fixture score, not the captain-doubled display value.
    const deductionPts = pitchPlayer.rawPoints ?? pitchPlayer.points;
    if (deductionPts > 0) {
      setConfirm({
        title:        `Move ${pitchPlayer.name} to bench?`,
        body:         `${pitchPlayer.name} has scored ${deductionPts} pts this round. Moving them to the bench will deduct those points from your total.`,
        warning:      'This action cannot be undone.',
        confirmLabel: 'Confirm (-' + deductionPts + ' pts)',
        danger:       true,
        onConfirm:    () => doSwap(pitchPlayer, benchPlayer),
      });
      setSelectedPlayer(null);
      setSwapMode(false);
      return;
    }

    doSwap(pitchPlayer, benchPlayer);
  };

  const doSwap = async (pitchPlayer, benchPlayer) => {
    if (saving) return;
    try {
      setSaving(true);
      setSelectedPlayer(null);
      setSwapMode(false);

      // Validate formation client-side first for fast feedback
      const tempGrid   = pitchPlayer.gridClass;
      const newPlayers = squadData.players.map(p =>
        p.id === pitchPlayer.id ? { ...benchPlayer, gridClass: tempGrid } : p
      );
      const formationError = validateFormation(newPlayers);
      if (formationError) {
        showToast(formationError, 'warning');
        return;
      }

      // Call set_lineup RPC — enforces server-side rules atomically
      const { data: result, error: rpcErr } = await supabase.rpc('set_lineup', {
        p_squad_id:   squadData.squadId,
        p_player_out: pitchPlayer.id,
        p_player_in:  benchPlayer.id,
      });

      if (rpcErr || !result?.ok) {
        const code = result?.code ?? '';
        const msg  = result?.error ?? rpcErr?.message ?? 'Lineup change failed';
        if (code === 'FIXTURE_COMPLETED') {
          showToast(`Cannot sub in ${benchPlayer.name} — their match already finished this gameweek. They'll be available next round.`, 'warning');
        } else if (code === 'PLAYER_LOCKED') {
          showToast(msg, 'warning');
        } else {
          showToast(msg, 'error');
        }
        return;
      }

      // Optimistic local update — only mark the benched player as locked if the
      // server actually wrote it to lineup_locks (round has kicked off). Otherwise
      // a pre-competition swap-back would be blocked client-side until a refresh.
      const newBench           = squadData.bench.map(b =>
        b.id === benchPlayer.id ? { ...pitchPlayer, gridClass: '', isLineupLocked: result.locked === true } : b
      );
      const captainBeingBenched = squadData.captainId === pitchPlayer.id;
      const newCaptainId        = captainBeingBenched ? null : squadData.captainId;

      setSquadData(prev => ({
        ...prev,
        players:     newPlayers,
        bench:       newBench,
        captainId:   newCaptainId,
        lockedIds:   result.locked === true
          ? new Set([...(prev.lockedIds ?? []), pitchPlayer.id])
          : (prev.lockedIds ?? new Set()),
      }));

      if (result.deduction > 0) {
        showToast(`−${result.deduction} pts deducted (${pitchPlayer.name} benched after scoring).`, 'warning', 5000);
      }

      if (captainBeingBenched) {
        setConfirm({
          title:        'Captain benched',
          body:         `${pitchPlayer.name} was your captain. Select a new captain from your starting XI.`,
          warning:      null,
          confirmLabel: 'Select Captain',
          danger:       false,
          onConfirm:    () => {
            setConfirm(null);
            if (newPlayers.length > 0) setSelectedPlayer(newPlayers[0]);
          },
        });
      }
    } catch (err) {
      console.error('Swap failed', err);
      showToast('Lineup change failed — please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const setCaptain = async () => {
    if (!selectedPlayer) return;
    const isInStartingXI = squadData.players.some(p => p.id === selectedPlayer.id);
    if (!isInStartingXI) {
      showToast('Only players in your starting XI can be captain.', 'warning');
      return;
    }

    // If the current captain has already scored points this round, warn that
    // switching the armband removes their captain bonus and cannot be reverted.
    const prevCaptain = allSquadPlayers.find(p => p.id === squadData.captainId);
    if (prevCaptain) {
      const mult  = squadData.isTripleCaptain ? 3 : 2;
      const bonus = (prevCaptain.rawPoints ?? 0) * (mult - 1);
      if (bonus > 0) {
        const newPlayer = selectedPlayer;
        setConfirm({
          title:        `Change captain to ${newPlayer.name}?`,
          body:         `${prevCaptain.name} has already scored points as captain this round. Switching the armband to ${newPlayer.name} will remove ${prevCaptain.name}'s captain bonus (${bonus} pts) from your total.`,
          warning:      'This action cannot be reverted.',
          confirmLabel: `Confirm (-${bonus} pts)`,
          danger:       true,
          onConfirm:    () => doSetCaptain(newPlayer),
        });
        setSelectedPlayer(null);
        return;
      }
    }

    await doSetCaptain(selectedPlayer);
  };

  const doSetCaptain = async (player) => {
    try {
      setSaving(true);
      const prevCaptainId = squadData.captainId;
      setSquadData({ ...squadData, captainId: player.id });
      const { data: result, error } = await supabase.rpc('set_captain', {
        p_squad_id: squadData.squadId,
        p_player_id: player.id,
      });
      if (error || !result?.ok) {
        // Persisting the armband failed — revert the optimistic update so the UI
        // doesn't show a captain that won't actually score.
        setSquadData(prev => ({ ...prev, captainId: prevCaptainId }));
        const code = result?.code ?? '';
        const msg  = result?.error ?? error?.message ?? 'Failed to set captain — please try again.';
        if (code === 'FIXTURE_STARTED') {
          showToast(`Cannot make ${player.name} captain — their match has already started or finished this round.`, 'warning');
        } else {
          showToast(msg, 'error');
        }
      }
    } finally { setSaving(false); setSelectedPlayer(null); }
  };

  const handleActivateJoker = async () => {
    if (!selectedPlayer || saving) return;
    try {
      setSaving(true);
      const userId     = user?.id;
      const today      = new Date().toISOString().split('T')[0];
      const matchdayId = squadData?.matchdayId ?? null;
      const row = { user_id: userId, player_id: selectedPlayer.id, joker_date: today, league_id: squadData?.leagueId ?? null };
      if (matchdayId) row.matchday_id = matchdayId;
      const { error } = await supabase.from('daily_jokers').insert(row);
      if (error) {
        if (error.code === '23505') {
          if ((error.message || '').includes('player_uq') || (error.details || '').includes('player_uq')) {
            showToast('You\'ve already used this player as your Joker this season!', 'warning');
          } else {
            showToast('You already have a Joker for this matchday!', 'warning');
          }
        }
        else throw error;
      } else {
        // DD-C13: mirror joker_player_id on squad for UI; scoring reads daily_jokers
        // (above) so this sync failing is non-critical — log rather than block.
        if (squadData?.squadId) {
          const { error: syncErr } = await supabase.from('squads').update({ joker_player_id: selectedPlayer.id }).eq('id', squadData.squadId);
          if (syncErr) console.warn('[SquadScreen] joker squad-sync failed:', syncErr.message);
        }
        setTodayJokerId(selectedPlayer.id); setSelectedPlayer(null);
      }
    } catch (err) { console.error(err); showToast('Failed to set Joker: ' + err.message, 'error'); }
    finally { setSaving(false); }
  };

  // FB-021 + FB-023: confirm sell with captain/joker safety warnings
  const handleSellPlayer = () => {
    if (!selectedPlayer) return;
    const isCaptain = selectedPlayer.id === squadData.captainId;
    const isJoker   = selectedPlayer.id === todayJokerId;
    const warnings  = [];
    if (isCaptain) warnings.push('This player is your captain — selling them removes the armband.');
    if (isJoker)   warnings.push('This player is your Matchday Joker — selling them voids today\'s boost.');

    setConfirm({
      title:        `Remove ${selectedPlayer.name}?`,
      body:         `${selectedPlayer.name} will be removed from your squad. Their slot opens up for a new signing.`,
      warning:      warnings.length ? warnings.join(' ') : null,
      confirmLabel: 'Remove',
      danger:       true,
      onConfirm:    doSellPlayer,
    });
  };

  const doSellPlayer = async () => {
    try {
      setSaving(true);
      const player = selectedPlayer;
      const result = await sell(player);
      if (!result.ok) { showToast(result.error, 'error'); return; }
      // FB-021: clear captain if selling the captain
      const newCaptainId = squadData.captainId === player.id ? null : squadData.captainId;
      setSquadData({
        ...squadData,
        players:          squadData.players.filter(p => p.id !== player.id),
        bench:            squadData.bench.filter(p  => p.id !== player.id),
        captainId:        newCaptainId,
        budget:           { ...squadData.budget, current: result.budget_remaining },
      });
      if (todayJokerId === player.id) setTodayJokerId(null);
    } catch (err) { console.error(err); }
    finally { setSaving(false); setSelectedPlayer(null); }
  };

  // FB-023: chip toggle with confirmation (activating only — deactivating is safe)
  const toggleChip = (chipKey) => {
    const chip   = CHIPS.find(c => c.key === chipKey);
    const curVal = squadData[chip.stateKey];
    if (!curVal) {
      // Activating — show confirm first
      setConfirm({
        title:        `Use ${chip.label}?`,
        body:         chip.description,
        warning:      'This cannot be undone for this matchday.',
        confirmLabel: 'Activate',
        danger:       false,
        onConfirm:    () => doToggleChip(chipKey),
      });
    } else {
      // Deactivating is safe — no confirm needed
      doToggleChip(chipKey);
    }
  };

  const doToggleChip = async (chipKey) => {
    const chip = CHIPS.find(c => c.key === chipKey);
    try {
      setSaving(true);
      const { data, error } = await supabase.rpc('activate_chip', {
        p_user_id:   user?.id,
        p_league_id: squadData.leagueId,
        p_chip_type: chipKey,
      });
      if (error) throw error;
      if (!data?.ok) {
        if (data?.code === 'CHIP_ALREADY_USED') {
          setFetchError(`${chip.label} has already been used this season and cannot be reactivated.`);
        } else {
          setFetchError(data?.error || 'Failed to toggle chip.');
        }
        return;
      }
      setSquadData({ ...squadData, [chip.stateKey]: data.active });
    } finally { setSaving(false); }
  };

  const handleJokerSelection = async (player) => {
    try {
      setSaving(true);
      const userId      = user?.id;
      const today       = new Date().toISOString().split('T')[0];
      const matchdayId  = squadData?.matchdayId ?? null;
      const row = { user_id: userId, player_id: player.id, joker_date: today, league_id: squadData?.leagueId ?? null };
      if (matchdayId) row.matchday_id = matchdayId;
      const { error } = await supabase.from('daily_jokers').insert(row);
      if (error) {
        if (error.code === '23505') {
          // Two unique constraints can fire:
          // daily_jokers_user_league_player_uq  → same player used again this season
          // daily_jokers_user_league_matchday_uq → already have a joker this matchday
          const isRepeatPlayer = (error.message || '').includes('player_uq') || (error.details || '').includes('player_uq');
          showToast(isRepeatPlayer
            ? `${player.name} was already your Joker this season — pick a different player.`
            : 'You already have a Joker for this matchday!',
            'warning');
        } else if ((error.message || '').includes('JOKER_OWN_SQUAD')) {
          showToast('Pick a player outside your squad — your own players don\'t count as Joker.', 'warning');
        } else {
          throw error;
        }
      } else {
        // DD-C13: mirror joker_player_id on squad for UI; scoring reads daily_jokers
        // (above) so this sync failing is non-critical — log rather than block.
        if (squadData?.squadId) {
          const { error: syncErr } = await supabase.from('squads').update({ joker_player_id: player.id }).eq('id', squadData.squadId);
          if (syncErr) console.warn('[SquadScreen] joker squad-sync failed:', syncErr.message);
        }
        setJokerPlayer(player); setTodayJokerId(player.id); setIsJokerPickerOpen(false);
      }
    } catch (err) { console.error(err); showToast('Failed to set Joker', 'error'); }
    finally { setSaving(false); }
  };

  // No leagues — render full UI chrome with a "join league" prompt in the body.
  // The header + tab strip must always be visible so E2E smoke tests (My Squad
  // heading, Budget label, CHIPS tab) pass even when the demo user has no leagues.
  if (leagues !== null && leagues.length === 0 && !activeLeague) {
    const NO_LEAGUE_TABS_MOBILE  = [
      { id: 'pitch',  label: '⚽ PITCH'  },
      { id: 'squad',  label: '📋 LIST'   },
      { id: 'status', label: '⚠️ STATUS' },
    ];
    const NO_LEAGUE_TABS_DESKTOP = [
      { id: 'pitch', label: 'Pitch'  },
      { id: 'list',  label: 'List'   },
      { id: 'status',label: 'Status' },
    ];
    const showChips = false; // chips hidden for pilot
    return (
      <>
        <div
          className="sticky top-0 z-40 flex items-center justify-between pl-5 pr-6 lg:pr-5 py-3"
          style={{ background: 'rgba(13,17,23,0.97)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mute)', letterSpacing: '.14em', textTransform: 'uppercase' }}>
              Tactical Sheet
            </div>
            <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 34, color: 'var(--paper)', lineHeight: 1.05, letterSpacing: '-0.01em' }}>
              My Squad
            </div>
          </div>
          <div className="text-right">
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', letterSpacing: '.14em', textTransform: 'uppercase' }}>Budget</div>
            <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 20, color: 'var(--cyan)', lineHeight: 1 }}>€100M</div>
          </div>
        </div>
        <div className="lg:hidden flex" style={{ borderBottom: '1px solid var(--rule)', background: 'var(--ink-2)' }}>
          {NO_LEAGUE_TABS_MOBILE.map(tab => (
            <button key={tab.id} onClick={() => setMobileTab(tab.id)}
              className="flex-1 py-2.5 text-center transition-all relative"
              style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: mobileTab === tab.id ? 'var(--cyan)' : 'var(--mute)', background: 'transparent' }}
            >
              {tab.label}
              {mobileTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: 'var(--cyan)' }} />}
            </button>
          ))}
        </div>
        <div className="hidden lg:flex shrink-0" style={{ borderBottom: '1px solid var(--rule)', background: 'var(--ink-2)' }}>
          {NO_LEAGUE_TABS_DESKTOP.map(tab => (
            <button key={tab.id} onClick={() => setDesktopTab(tab.id)}
              className="relative px-6 py-3 text-[10px] font-black uppercase tracking-widest transition-all"
              style={{ fontFamily: 'Archivo Black, sans-serif', color: desktopTab === tab.id ? 'var(--cyan)' : 'var(--mute)', background: 'transparent' }}
            >
              {tab.label}
              {desktopTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: 'var(--cyan)' }} />}
            </button>
          ))}
        </div>
        {showChips ? (
          <div className="px-4 py-4 max-w-lg mx-auto">
            {CHIPS.map(chip => (
              <div key={chip.key} className="mb-3 rounded p-4 border transition-all" style={chip.inactiveStyle}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="fk-display text-[12px]" style={{ color: 'var(--paper)' }}>{chip.label.toUpperCase()}</span>
                </div>
                <p className="text-[11px] leading-relaxed mb-3" style={{ color: 'var(--mute)' }}>{chip.description}</p>
                <button disabled className="w-full py-2 rounded text-[10px] font-black uppercase tracking-widest opacity-40"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--paper)', border: '1px solid rgba(255,255,255,0.12)' }}>
                  No League Yet
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 gap-4">
            <div className="text-[13px] font-black uppercase tracking-widest mb-2" style={{ color: 'var(--mute)', fontFamily: 'Archivo Black, sans-serif' }}>
              No League Yet
            </div>
            <p style={{ color: 'var(--mute)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, textAlign: 'center', maxWidth: 260, lineHeight: 1.6 }}>
              You need to join or create a league before building your squad.
            </p>
          </div>
        )}
      </>
    );
  }

  // League picker — shown when user has one or more leagues and none is selected
  if (leagues && leagues.length >= 1 && !activeLeague) {
    return (
      <SelectLeaguePicker
        leagues={leagues}
        eyebrow="MY SQUAD"
        onSelect={l => { setActiveLeague(l.id); if (l.tournament_id) setTournamentId(l.tournament_id); }}
      />
    );
  }

  // â"€â"€ Loading â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (loading || !squadData) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-center">
          <div className="fz-display text-[32px] text-cyan mb-2">MY SQUAD</div>
          <div className="fz-label text-text-tertiary animate-scan">Loading Tactical Sheet…</div>
        </div>
      </div>
    );
  }

  const { budget, players, bench, captainId, locked_at } = squadData;
  // budgetLeft/budgetLow hoisted here so the empty-state shell can display them
  const budgetLeft = Number(budget.current.toFixed(1));
  const budgetLow  = budgetLeft < 5;

  // Empty squad — no players signed yet.
  // Render the header + tab strip so the UI chrome is always visible (fixes E2E
  // tests that assert on "My Squad" heading / Budget / CHIPS tab in demo mode).
  if (!players.length && !bench.length) {
    const EMPTY_TABS_MOBILE  = [
      { id: 'pitch',  label: '⚽ PITCH'  },
      { id: 'squad',  label: '📋 LIST'   },
      { id: 'status', label: '⚠️ STATUS' },
    ];
    const EMPTY_TABS_DESKTOP = [
      { id: 'pitch', label: 'Pitch'  },
      { id: 'list',  label: 'List'   },
      { id: 'status',label: 'Status' },
    ];
    const showChips = false; // chips hidden for pilot
    return (
      <>
        {/* ── Sticky header ─────────────────────────────────────────── */}
        <div
          className="sticky top-0 z-40 flex items-center justify-between pl-5 pr-6 lg:pr-5 py-3"
          style={{ background: 'rgba(13,17,23,0.97)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mute)', letterSpacing: '.14em', textTransform: 'uppercase' }}>
              Tactical Sheet
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 34, color: 'var(--paper)', lineHeight: 1.05, letterSpacing: '-0.01em' }}>
                My Squad
              </div>
              <LeagueSelector value={activeLeague} onChange={setActiveLeague} />
            </div>
          </div>
          <div className="text-right">
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', letterSpacing: '.14em', textTransform: 'uppercase' }}>Budget</div>
            <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 20, color: budgetLow ? 'var(--danger)' : 'var(--cyan)', lineHeight: 1 }}>
              €{budgetLeft}M
            </div>
          </div>
        </div>

        {/* ── Mobile tab strip ──────────────────────────────────────── */}
        <div className="lg:hidden flex" style={{ borderBottom: '1px solid var(--rule)', background: 'var(--ink-2)' }}>
          {EMPTY_TABS_MOBILE.map(tab => (
            <button
              key={tab.id}
              onClick={() => setMobileTab(tab.id)}
              className="flex-1 py-2.5 text-center transition-all relative"
              style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: mobileTab === tab.id ? 'var(--cyan)' : 'var(--mute)', background: 'transparent' }}
            >
              {tab.label}
              {mobileTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: 'var(--cyan)' }} />}
            </button>
          ))}
        </div>

        {/* ── Desktop tab strip ─────────────────────────────────────── */}
        <div className="hidden lg:flex shrink-0" style={{ borderBottom: '1px solid var(--rule)', background: 'var(--ink-2)' }}>
          {EMPTY_TABS_DESKTOP.map(tab => (
            <button
              key={tab.id}
              onClick={() => setDesktopTab(tab.id)}
              className="relative px-6 py-3 text-[10px] font-black uppercase tracking-widest transition-all"
              style={{ fontFamily: 'Archivo Black, sans-serif', color: desktopTab === tab.id ? 'var(--cyan)' : 'var(--mute)', background: 'transparent' }}
            >
              {tab.label}
              {desktopTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: 'var(--cyan)' }} />}
            </button>
          ))}
        </div>

        {/* ── Chips tab ─────────────────────────────────────────────── */}
        {showChips ? (
          <div className="px-4 py-4 max-w-lg mx-auto">
            {CHIPS.map(chip => (
              <div
                key={chip.key}
                className="mb-3 rounded p-4 border transition-all"
                style={chip.inactiveStyle}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="fk-display text-[12px]" style={{ color: 'var(--paper)' }}>
                    {chip.label.toUpperCase()}
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed mb-3" style={{ color: 'var(--mute)' }}>
                  {chip.description}
                </p>
                <button
                  disabled
                  className="w-full py-2 rounded text-[10px] font-black uppercase tracking-widest opacity-40"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--paper)', border: '1px solid rgba(255,255,255,0.12)' }}
                >
                  No Squad Yet
                </button>
              </div>
            ))}
          </div>
        ) : (
          /* ── No-squad message ─────────────────────────────────────── */
          <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 gap-4">
            <div className="text-[13px] font-black uppercase tracking-widest mb-2" style={{ color: 'var(--mute)', fontFamily: 'Archivo Black, sans-serif' }}>
              No Squad Built Yet
            </div>
            <p style={{ color: 'var(--mute)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, textAlign: 'center', maxWidth: 280, lineHeight: 1.6 }}>
              Head to the Transfer Market to sign players and build your squad.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              {cfg.format === 'noduplicate' ? (
                <button onClick={() => navigate(`/market?leagueId=${activeLeague}`)} style={{ padding: '10px 22px', background: 'var(--gold)', color: 'var(--ink)', fontFamily: 'Archivo Black, sans-serif', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer', border: 'none' }}>
                  Transfer Market →
                </button>
              ) : (
                <button onClick={() => navigate(`/market?leagueId=${activeLeague}`)} style={{ padding: '10px 22px', background: 'var(--gold)', color: 'var(--ink)', fontFamily: 'Archivo Black, sans-serif', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer', border: 'none' }}>
                  Transfer Market →
                </button>
              )}
              {leagues && leagues.length > 1 && (
                <button
                  onClick={() => setActiveLeague(null)}
                  style={{ padding: '10px 22px', background: 'transparent', border: '1px solid var(--rule)', color: 'var(--mute)', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '.14em', cursor: 'pointer' }}
                >
                  Switch League
                </button>
              )}
            </div>
          </div>
        )}
      </>
    );
  }

  const isLocked        = deadline.isLocked;
  const allSquadPlayers = [...players, ...bench];
  const dangerPlayers   = getDangerZonePlayers(allSquadPlayers);
  const selectedIsBench = selectedPlayer && bench.some(b => b.id === selectedPlayer.id);
  // budgetLeft / budgetLow declared earlier (before empty-state guard)

  // â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  // â"€â"€ Sub-components defined inside render for squad closure access â"€â"€â"€â"€â"€â"€â"€â"€â"€
  // â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  // Chip card (full description, toggle button)
  const ChipCard = ({ chip }) => {
    const isActive = squadData[chip.stateKey];
    return (
      <div
        className="mx-4 mb-3 rounded p-4 border transition-all"
        style={isActive ? chip.activeStyle : chip.inactiveStyle}
      >
        <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span
                className="fk-display text-[12px]"
                style={{ color: isActive ? chip.activeColor : 'var(--paper)' }}
              >
                {chip.label.toUpperCase()}
              </span>
              {isActive && (
                <span
                  className="fk-mono text-[8px] px-2 py-0.5"
                  style={{ color: chip.activeColor, border: `1px solid ${chip.activeColor}` }}
                >
                  ACTIVE
                </span>
              )}
            </div>
            <p className="text-[11px] leading-relaxed mb-3" style={{ color: 'var(--mute)' }}>
              {chip.description}
            </p>
            <button
              onClick={() => toggleChip(chip.key)}
              disabled={saving || !!locked_at}
              className="w-full py-2 rounded text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-40"
              style={isActive
                ? { background: chip.activeColor + '22', color: chip.activeColor, border: `1px solid ${chip.activeColor}44` }
                : { background: 'rgba(255,255,255,0.06)', color: 'var(--paper)', border: '1px solid rgba(255,255,255,0.12)' }
              }
            >
              {locked_at ? 'Squad Locked' : isActive ? 'Deactivate' : 'Activate Chip'}
            </button>
          </div>
        </div>
    );
  };

  // Matchday Joker card
  const JokerCard = () => (
    <div className="mx-4 mb-3 rounded p-4 border" style={{ borderColor: 'rgba(157,95,245,0.2)', background: 'rgba(157,95,245,0.04)' }}>
      <div className="flex-1 min-w-0">
          <div className="fk-display text-[12px] mb-1" style={{ color: 'var(--pos-gk)' }}>
            MATCHDAY JOKER
          </div>
          <p className="text-[11px] leading-relaxed mb-3" style={{ color: 'var(--mute)', fontFamily: 'Archivo, sans-serif' }}>
            Pick one player outside your squad for this matchday. They score their real points as a bonus — no multiplier needed. One pick per matchday; each player can only be used once per season.
          </p>
          {todayJokerId ? (
            <div className="fk-mono flex items-center gap-2 py-2 px-3" style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid var(--pos-gk)', color: 'var(--pos-gk)', fontSize: 9 }}>
              JOKER LOCKED FOR THIS MATCHDAY
            </div>
          ) : (
            <button
              onClick={() => setIsJokerPickerOpen(true)}
              className="w-full py-2 rounded text-[10px] font-black uppercase tracking-widest transition-all active:scale-95"
              style={{ background: 'rgba(157,95,245,0.12)', color: 'var(--pos-gk)', border: '1px solid rgba(157,95,245,0.3)' }}
            >
              Choose Matchday Joker
            </button>
          )}
        </div>
      </div>
  );

  // Chip Guide modal — detailed explanation + replay tutorial button
  const CHIP_GUIDE = [
    {
      key: 'triple_captain',
      icon: '👑',
      label: 'Triple Captain',
      color: 'var(--gold)',
      what: 'Your captain scores 3× their fantasy points instead of the usual 2×. But if they don\'t start, they score 0.',
      when: 'Save it for a matchday when your captain is a nailed-on starter against weak opposition.',
      restriction: '1 use per season. High risk — do not activate if your captain is a doubt.',
      tip: 'Check injury news on match day. Never activate this if there\'s any chance they\'re rested.',
    },
    {
      key: 'joker',
      icon: '⚡',
      label: 'Matchday Joker',
      color: 'var(--pos-gk)',
      what: 'Pick one player from outside your 15-man squad. They score their real fantasy points as a bonus on top of your XI total — no multiplier, no squad slot required.',
      when: 'Any matchday — use it to add a top performer you couldn\'t fit in your squad, or a player from a country you\'ve already maxed out.',
      restriction: '1 pick per matchday. Each player can only be your Joker once per season — you can\'t pick the same player every matchday. Must be chosen before the matchday deadline.',
      tip: 'Don\'t waste it on a player you already own. Pick someone great who didn\'t make your 15 this round.',
    },
  ];

  const ChipWizardModal = () => (
    <div className="fixed inset-0 z-[80] flex items-end lg:items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }} onClick={() => setShowChipWizard(false)}>
      <div
        className="w-full lg:max-w-lg lg:mx-4 rounded-t-2xl lg:rounded-2xl flex flex-col animate-in slide-in-from-bottom"
        style={{ background: 'var(--ink)', border: '1px solid var(--rule)', maxHeight: '90vh', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '20px 20px 14px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--cyan)', letterSpacing: '.18em', marginBottom: 4 }}>CHIP GUIDE</div>
            <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 20, color: 'var(--paper)', letterSpacing: '-0.01em' }}>How Chips Work</div>
          </div>
          <button onClick={() => setShowChipWizard(false)} style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--rule)', color: 'var(--mute)', fontSize: 16, cursor: 'pointer', borderRadius: 4 }}>×</button>
        </div>
        {/* Chips */}
        <div style={{ overflowY: 'auto', padding: '16px 20px 8px' }}>
          {CHIP_GUIDE.map((c, i) => (
            <div key={c.key} style={{ marginBottom: i < CHIP_GUIDE.length - 1 ? 20 : 8, paddingBottom: i < CHIP_GUIDE.length - 1 ? 20 : 0, borderBottom: i < CHIP_GUIDE.length - 1 ? '1px solid var(--rule)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 22 }}>{c.icon}</span>
                <div>
                  <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 14, color: c.color, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{c.label}</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8, color: 'var(--mute)', letterSpacing: '.14em', textTransform: 'uppercase' }}>What it does · </span>
                  <span style={{ fontFamily: 'Archivo, sans-serif', fontSize: 12, color: 'var(--paper)', lineHeight: 1.5 }}>{c.what}</span>
                </div>
                <div>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8, color: 'var(--cyan)', letterSpacing: '.14em', textTransform: 'uppercase' }}>When to use · </span>
                  <span style={{ fontFamily: 'Archivo, sans-serif', fontSize: 12, color: 'var(--paper)', lineHeight: 1.5 }}>{c.when}</span>
                </div>
                <div>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8, color: 'var(--danger)', letterSpacing: '.14em', textTransform: 'uppercase' }}>Restrictions · </span>
                  <span style={{ fontFamily: 'Archivo, sans-serif', fontSize: 12, color: 'var(--paper)', lineHeight: 1.5 }}>{c.restriction}</span>
                </div>
                <div style={{ padding: '8px 10px', background: `${c.color}0A`, border: `1px solid ${c.color}22`, borderRadius: 4, marginTop: 2 }}>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8, color: c.color, letterSpacing: '.14em', textTransform: 'uppercase' }}>💡 Tip · </span>
                  <span style={{ fontFamily: 'Archivo, sans-serif', fontSize: 11, color: 'var(--paper)', lineHeight: 1.5, opacity: 0.85 }}>{c.tip}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        {/* Footer */}
        <div style={{ padding: '14px 20px 20px', borderTop: '1px solid var(--rule)', display: 'flex', gap: 10, flexShrink: 0 }}>
          <button
            onClick={() => { setShowChipWizard(false); replaySquadTour(); }}
            style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid var(--rule)', color: 'var(--mute)', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '.16em', textTransform: 'uppercase', cursor: 'pointer', borderRadius: 4 }}
          >
            ↺ REPLAY TUTORIAL
          </button>
          <button
            onClick={() => setShowChipWizard(false)}
            style={{ flex: 2, padding: '10px', background: 'var(--cyan)', border: 'none', color: 'var(--ink)', fontFamily: 'Archivo Black, sans-serif', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer', borderRadius: 4 }}
          >
            GOT IT
          </button>
        </div>
      </div>
    </div>
  );

  // Danger Zone vertical list (for sidebar / tools tab)
  const DangerList = () => {
    if (!dangerPlayers.length) {
      return (
        <div className="mx-4 my-3 flex items-center gap-2.5 p-3 rounded" style={{ background: 'rgba(24,201,107,0.06)', border: '1px solid rgba(24,201,107,0.15)' }}>
          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--positive)' }} />
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'rgba(24,201,107,0.8)' }}>
            All clear — no injury alerts
          </span>
        </div>
      );
    }
    return (
      <div className="mx-4 my-3 space-y-1.5">
        {dangerPlayers.map(p => {
          const cfg = LINEUP_STATUS[p.intel?.status];
          if (!cfg) return null;
          return (
            <button
              key={p.id}
              onClick={() => handlePlayerClick(p)}
              className="w-full flex items-center gap-3 p-3 rounded text-left transition-all hover:brightness-110"
              style={{ background: cfg.bg, border: `1px solid ${cfg.color}30` }}
            >
              
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-semibold text-white truncate">{p.name}</div>
                <div className="text-[9px] font-black uppercase tracking-wider mt-0.5" style={{ color: cfg.color }}>
                  {cfg.label}
                </div>
              </div>
              <div className="text-[9px] shrink-0" style={{ color: 'var(--mute)' }}>{p.intel?.confidence}%</div>
            </button>
          );
        })}
      </div>
    );
  };

  // Danger banner (mobile — slim strip above pitch)
  const DangerBanner = () => {
    if (!dangerPlayers.length || dangerDismissed) return null;
    const outCount    = dangerPlayers.filter(p => p.intel?.status === 'out').length;
    const doubtCount  = dangerPlayers.filter(p => p.intel?.status === 'doubt').length;
    return (
      <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: 'rgba(240,58,58,0.1)', borderBottom: '1px solid rgba(240,58,58,0.2)' }}>
        
        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          {outCount > 0 && (
            <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'rgba(240,58,58,0.2)', color: 'var(--danger)' }}>
              {outCount} OUT
            </span>
          )}
          {doubtCount > 0 && (
            <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'rgba(240,180,0,0.15)', color: 'var(--gold)' }}>
              {doubtCount} DOUBTFUL
            </span>
          )}
          <span className="text-[10px] text-text-secondary truncate">
            {dangerPlayers.slice(0, 2).map(p => p.name.split(' ').pop()).join(', ')}
            {dangerPlayers.length > 2 ? ` +${dangerPlayers.length - 2}` : ''}
          </span>
        </div>
        <button onClick={() => { setDangerDismissed(true); setMobileTab('tools'); }} className="text-[9px] font-black uppercase tracking-widest shrink-0 px-2 py-1 rounded" style={{ color: 'var(--danger)', background: 'rgba(240,58,58,0.12)' }}>
          View
        </button>
        <button onClick={() => setDangerDismissed(true)} className="text-[16px] leading-none shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }}>×</button>
      </div>
    );
  };

  const POS_CONFIG_COLORS = POS_BADGE_COLOR;

  const handlePickerBuy = async (player) => {
    if (!activeLeague) { showToast('No league selected — open your squad from the League screen.', 'warning'); return; }

    // FB-022: Validate that buying this player won't violate formation rules (especially max 1 GK on pitch)
    // Simulate adding to pitch if there's room, then check formation
    const startersFull = squadData.players.length >= 11;
    if (!startersFull) {
      const simulatedPitch = [...squadData.players, player];
      const formationError = validateFormation(simulatedPitch);
      if (formationError) { showToast(formationError, 'warning'); return; }
    }

    const result = await buy(player);
    if (!result.ok) { showToast(result.error, 'error'); return; }
    setSquadData(prev => {
      const startersFull = prev.players.length >= 11;
      return {
        ...prev,
        players: startersFull
          ? prev.players
          : [...prev.players, { ...player, isBench: false, gridClass: '' }],
        bench: startersFull
          ? [...prev.bench, { ...player, isBench: true }]
          : prev.bench,
        budget: { ...prev.budget, current: result.budget_remaining },
      };
    });
  };

  // Player list grouped by position — starters + bench unified, with START/BENCH badge
  const PlayerList = () => {
    const benchIds = new Set(bench.map(b => b.id));
    const squadFull = allSquadPlayers.length >= cfg.squadSize;
    return (
      <div>
        {POS_ORDER.map(pos => {
          const posStarters = players.filter(p => p.position === pos);
          const posBench    = bench.filter(p => p.position === pos);
          const allPos      = [...posStarters, ...posBench];
          const limit       = POS_LIMITS[pos] ?? 0;
          const emptySlots  = squadFull ? 0 : Math.max(0, limit - allPos.length);
          const posColor    = POS_CONFIG_COLORS[pos] ?? 'var(--mute)';
          if (!allPos.length && !emptySlots) return null;
          return (
            <div key={pos}>
              <SectionHeader title={POS_LABEL[pos]} />
              {allPos.map(player => {
                const isBench = benchIds.has(player.id);
                const auctionListing = activeAuctions.find(a => a.player_id === player.id);
                const isListed = !!auctionListing;
                const rowAction = (
                  <div className="flex flex-col items-end gap-1" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => setStatsDashboardPlayer(player)}
                      style={{
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: 9, fontWeight: 800,
                        letterSpacing: '0.1em',
                        padding: '2px 6px',
                        border: '1px solid rgba(0,180,216,0.4)',
                        color: 'var(--cyan)',
                        background: 'rgba(0,180,216,0.06)',
                        flexShrink: 0,
                        cursor: 'pointer',
                      }}
                    >
                      STATS ↗
                    </button>
                    <span
                      style={{
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: 9, fontWeight: 800,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        padding: '2px 6px',
                        border: isBench ? '1px solid var(--rule)' : '1px solid rgba(0,180,216,0.4)',
                        color: isBench ? 'var(--mute)' : 'var(--cyan)',
                        background: isBench ? 'transparent' : 'rgba(0,180,216,0.06)',
                        flexShrink: 0,
                        pointerEvents: 'none',
                      }}
                    >
                      {isBench ? 'BENCH' : 'START'}
                    </span>
                    <AvailabilityBadge
                      playerId={player.id}
                      isFlagged={!!flagMap[player.id]}
                      isOwn={true}
                      onToggle={() => toggleFlag(squadData.squadId, player.id)}
                    />
                    {activeLeague && !isListed && (
                      <button
                        disabled={auctionBusy === player.id}
                        onClick={async () => {
                          const bid = parseFloat(player.price ?? 0);
                          setAuctionBusy(player.id);
                          const res = await listForAuction(player.id, bid);
                          setAuctionBusy(null);
                          if (!res.ok) showToast(res.error, 'error');
                          else showToast(`${player.name} listed for auction`, 'success');
                        }}
                        style={{
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: 9, fontWeight: 800,
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          padding: '2px 6px',
                          border: '1px solid rgba(240,180,0,0.4)',
                          color: 'var(--gold)',
                          background: 'rgba(240,180,0,0.06)',
                          flexShrink: 0,
                          cursor: 'pointer',
                          opacity: auctionBusy === player.id ? 0.5 : 1,
                        }}
                      >
                        {auctionBusy === player.id ? '…' : 'AUCTION'}
                      </button>
                    )}
                    {activeLeague && isListed && (() => {
                      const isConfirming = confirmCancelId === player.id;
                      const isCancelBusy = cancelBusy === player.id;
                      return (
                        <button
                          disabled={isCancelBusy}
                          onClick={() => handleAuctionBadgeClick(player, auctionListing)}
                          style={{
                            fontFamily: 'JetBrains Mono, monospace',
                            fontSize: 9, fontWeight: 800,
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                            padding: '2px 6px',
                            border: isConfirming ? '1px solid rgba(239,68,68,0.6)' : '1px solid rgba(240,180,0,0.4)',
                            color: isConfirming ? 'var(--danger)' : 'var(--gold)',
                            background: isConfirming ? 'rgba(239,68,68,0.12)' : 'rgba(240,180,0,0.1)',
                            flexShrink: 0,
                            cursor: 'pointer',
                            opacity: isCancelBusy ? 0.5 : 1,
                          }}
                        >
                          {isCancelBusy ? '…' : isConfirming ? 'CANCEL?' : 'ON AUCTION'}
                        </button>
                      );
                    })()}
                  </div>
                );
                return (
                  <div key={player.id}>
                    <PlayerCard
                      player={player}
                      variant="row"
                      isCaptain={player.id === captainId}
                      isTripleCaptain={squadData.isTripleCaptain}
                      isJoker={player.id === todayJokerId}
                      onClick={handlePlayerClick}
                      isSelected={selectedPlayer?.id === player.id}
                      isSwapTarget={swapMode && selectedPlayer?.id !== player.id}
                      showIntelligence
                      showPrice
                      action={rowAction}
                    />
                  </div>
                );
              })}
              {Array.from({ length: emptySlots }).map((_, i) => (
                <button
                  key={`empty-${pos}-${i}`}
                  onClick={() => activeLeague && setPickerPos(pos)}
                  className="w-full flex items-center gap-3 px-5 py-3 transition-all active:opacity-70"
                  style={{
                    borderBottom:  '1px solid rgba(255,255,255,0.04)',
                    borderLeft:    `2px dashed ${posColor}40`,
                    background:    `${posColor}06`,
                    cursor:        activeLeague ? 'pointer' : 'default',
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0"
                    style={{ background: `${posColor}12`, border: `1.5px dashed ${posColor}50` }}
                  >
                    +
                  </div>
                  <div className="flex-1 text-left">
                    <div className="text-[12px] font-bold" style={{ color: posColor, fontFamily: 'Archivo Black, sans-serif', letterSpacing: '0.06em' }}>
                      {activeLeague ? `ADD ${pos}` : `EMPTY SLOT`}
                    </div>
                    <div className="text-[10px] mt-0.5" style={{ color: 'var(--mute)' }}>
                      {activeLeague ? 'Tap to sign a player' : 'Open from League to sign'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    );
  };

  // â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  // â"€â"€ RENDER â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  // â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  return (
    <div className="min-h-screen bg-bg overflow-x-hidden">

      {/* ── Knockout keep window (cup+draft leagues, group_stage phase only) ── */}
      {activeLeague && <KnockoutKeepSelector leagueId={activeLeague} />}

      {/* ── Transfer window status banner (U5) ──────────────────────────────── */}
      <TransferWindowBanner
        status={transferWindow.status}
        closesAt={transferWindow.closesAt}
        opensAt={transferWindow.opensAt}
        transfersRemaining={transferWindow.transfersRemaining}
        isUnlimited={transferWindow.isUnlimited}
      />

      {/* ── Fetch error banner ──────────────────────────────────────────────── */}
      {fetchError && (
        <div
          className="fixed top-0 left-0 right-0 z-[70] flex items-center gap-3 px-4 py-3 lg:left-[220px]"
          style={{ background: 'rgba(240,58,58,0.92)', backdropFilter: 'blur(8px)' }}
        >
          <span className="text-white text-[11px] font-bold uppercase tracking-widest flex-1">{fetchError}</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { setFetchError(null); fetchSquad(); }}
          >
            Retry
          </Button>
          <Button
            variant="icon"
            size="sm"
            onClick={() => setFetchError(null)}
            aria-label="Dismiss error"
            className="text-lg leading-none"
          >
            <span aria-hidden="true">×</span>
          </Button>
        </div>
      )}

      {/* Confirmation dialog (FB-023) */}
      {confirm && (
        <ConfirmModal
          {...confirm}
          onCancel={() => setConfirm(null)}
        />
      )}

      {showScoringModal && <ScoringInfoModal onClose={() => setShowScoringModal(false)} />}

      {/* First-visit spotlight tour */}
      {showSquadTour && !loading && (
        <OnboardingTour
          steps={SQUAD_TOUR_STEPS}
          onComplete={completeSquadTour}
          onSkip={completeSquadTour}
        />
      )}

      {/* â•â• STICKY HEADER â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <div
        className="sticky top-0 z-40 flex items-center justify-between pl-5 pr-6 lg:pr-5 py-3"
        style={{
          background: 'rgba(13,17,23,0.97)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        {/* Left: eyebrow + title + tour replay */}
        <div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mute)', letterSpacing: '.14em', textTransform: 'uppercase' }}>
            Tactical Sheet
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 34, color: 'var(--paper)', lineHeight: 1.05, letterSpacing: '-0.01em' }}>
              My Squad
            </div>
            <LeagueSelector value={activeLeague} onChange={setActiveLeague} />
            <button
              onClick={() => setShowScoringModal(true)}
              title="Scoring & game rules"
              style={{
                width: 22, height: 22, borderRadius: '50%',
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.05)',
                color: 'rgba(255,255,255,0.4)',
                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, marginTop: 6,
              }}
            >?</button>
          </div>
        </div>

        {/* Right: KPI cluster — Transfers · Squad · Budget */}
        <div className="flex items-center gap-5">
          {windowKpi.text && (
            <div className="text-right">
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', letterSpacing: '.14em', textTransform: 'uppercase' }}>{windowKpi.label}</div>
              <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 14, color: windowKpi.color, letterSpacing: '-0.01em' }}>
                {windowKpi.text}
              </div>
            </div>
          )}
          <div className="text-right">
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', letterSpacing: '.14em', textTransform: 'uppercase' }}>Squad</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
              <span style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 20, color: 'var(--paper)', lineHeight: 1 }}>{allSquadPlayers.length}</span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--mute)', letterSpacing: '.05em' }}>/15</span>
            </div>
          </div>
          <div className="text-right" data-tour="squad-budget">
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', letterSpacing: '.14em', textTransform: 'uppercase' }}>Budget</div>
            <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 20, color: budgetLow ? 'var(--danger)' : 'var(--cyan)', lineHeight: 1 }}>
              €{budgetLeft}M
            </div>
          </div>
        </div>
      </div>

      {/* â•â• MOBILE LAYOUT â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <div className="lg:hidden">

        {/* Tab strip — 4 tabs matching desktop */}
        <div className="flex" style={{ borderBottom: '1px solid var(--rule)', background: 'var(--ink-2)' }}>
          {[
            { id: 'pitch',  label: '⚽ PITCH'  },
            { id: 'squad',  label: '📋 LIST'   },
            { id: 'status', label: '⚠️ STATUS' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setMobileTab(tab.id)}
              className="flex-1 py-2.5 text-center transition-all relative"
              style={{
                fontFamily: 'Archivo Black, sans-serif',
                fontSize: 9,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: mobileTab === tab.id ? 'var(--cyan)' : 'var(--mute)',
                background: 'transparent',
              }}
            >
              {tab.label}
              {mobileTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: 'var(--cyan)' }} />
              )}
              {tab.id === 'status' && dangerPlayers.length > 0 && (
                <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full" style={{ background: 'var(--danger)' }} />
              )}
            </button>
          ))}
        </div>

        {/* Incomplete squad banner — shown on all mobile tabs */}
        {allSquadPlayers.length < 11 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'rgba(240,58,58,0.12)', borderBottom: '1px solid rgba(240,58,58,0.3)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 13, fontWeight: 900, color: 'var(--danger)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Squad too small — {allSquadPlayers.length}/11 players
              </div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'rgba(240,58,58,0.8)', marginTop: 3 }}>
                Need {11 - allSquadPlayers.length} more to field a starting XI
              </div>
            </div>
            <button onClick={() => navigate(`/market?leagueId=${activeLeague}`)} style={{ fontFamily: 'Archivo Black, sans-serif', fontWeight: 900, fontSize: 10, color: 'var(--danger)', border: '1px solid rgba(240,58,58,0.5)', padding: '6px 12px', background: 'transparent', cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0 }}>
              MARKET →
            </button>
          </div>
        ) : allSquadPlayers.length < 15 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'rgba(240,180,0,0.10)', borderBottom: '1px solid rgba(240,180,0,0.25)' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--gold)', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 13, fontWeight: 900, color: 'var(--gold)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Squad incomplete — {allSquadPlayers.length}/15 players
              </div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'rgba(240,180,0,0.7)', marginTop: 3 }}>
                {15 - allSquadPlayers.length} empty slot{15 - allSquadPlayers.length !== 1 ? 's' : ''} — sign more players
              </div>
            </div>
            <button onClick={() => navigate(`/market?leagueId=${activeLeague}`)} style={{ fontFamily: 'Archivo Black, sans-serif', fontWeight: 900, fontSize: 10, color: 'var(--gold)', border: '1px solid rgba(240,180,0,0.45)', padding: '6px 12px', background: 'transparent', cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0 }}>
              SIGN →
            </button>
          </div>
        ) : null}

        {/* â"€â"€ PITCH TAB — starting XI + bench strip for sub management â"€â"€ */}
        {mobileTab === 'pitch' && (() => {
          const captain = allSquadPlayers.find(p => p.id === captainId);
          const def = players.filter(p => p.position === 'DEF').length;
          const mid = players.filter(p => p.position === 'MID').length;
          const fwd = players.filter(p => p.position === 'FWD').length;
          const formation = [def, mid, fwd].filter(n => n > 0).join('-') || '—';
          const POS_LABEL_PITCH = { GK: 'Goalkeeper', DEF: 'Defence', MID: 'Midfield', FWD: 'Attack' };
          const statusColor = p => {
            const s = p.intel?.status;
            return s === 'out' || s === 'injured' || s === 'suspended' ? 'var(--danger)'
              : s === 'doubt' || s === 'doubtful' ? 'var(--gold)'
              : 'var(--positive)';
          };
          let no = 0;
          return (
            <div style={{ paddingBottom: swapMode ? '120px' : '96px' }}>
              {/* Section header */}
              <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--rule)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                    <div>
                      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 4 }}>Starting XI</div>
                      <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 28, color: 'var(--paper)', lineHeight: 1, letterSpacing: '-0.01em' }}>{formation || 'NO SQUAD'}</div>
                    </div>
                    <button
                      onClick={() => setShowScoringModal(true)}
                      title="Scoring & game rules"
                      style={{ marginTop: 2, background: 'none', border: '1px solid var(--rule)', color: 'var(--mute)', fontFamily: 'Archivo Black, sans-serif', fontSize: 9, width: 18, height: 18, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                    >?</button>
                  </div>
                  <button
                    onClick={handleAutoFill}
                    disabled={autoFilling}
                    style={{ marginTop: 4, padding: '6px 10px', background: 'rgba(0,196,232,0.08)', border: '1px solid rgba(0,196,232,0.25)', color: autoFilling ? 'var(--mute)' : 'var(--cyan)', fontFamily: 'Archivo Black, sans-serif', fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: autoFilling ? 'wait' : 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}
                  >
                    {autoFilling ? 'FILLING…' : '⚡ QUICK FILL'}
                  </button>
                </div>
                {autoFillMsg && (
                  <div style={{ marginTop: 6, fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: autoFillMsg?.startsWith('Added') ? 'var(--positive)' : 'var(--gold)' }}>{autoFillMsg}</div>
                )}
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', letterSpacing: '0.14em', marginTop: 6 }}>
                  {captain ? `CAPTAIN ${captain.name.split(' ').slice(-1)[0].toUpperCase()}` : 'NO CAPTAIN'}
                  {squadData.matchdayId ? ` · GW${squadData.matchdayId.split('-r')[1] ?? squadData.matchdayId} PTS` : ''}
                </div>
              </div>

              {/* Starting XI — grouped by position */}
              {['GK', 'DEF', 'MID', 'FWD'].map(pos => {
                const posPlayers = players.filter(p => p.position === pos);
                if (!posPlayers.length) return null;
                const posColor = pos === 'GK' ? 'var(--pos-gk)' : pos === 'DEF' ? 'var(--pos-def)' : pos === 'MID' ? 'var(--pos-mid)' : 'var(--pos-fwd)';
                return (
                  <div key={pos}>
                    <div style={{ padding: '8px 16px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 9, color: posColor, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{POS_LABEL_PITCH[pos]}</span>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)' }}>{posPlayers.length}</span>
                    </div>
                    {posPlayers.map(player => {
                      no++;
                      const surname = player.name?.split(' ').slice(-1)[0]?.toUpperCase() ?? '?';
                      const isSelected = selectedPlayer?.id === player.id;
                      const isSwapTarget = swapMode && !isSelected;
                      return (
                        <button
                          key={player.id}
                          onClick={() => handlePlayerClick(player)}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                            padding: '9px 16px',
                            background: isSelected ? 'rgba(0,180,216,0.07)' : isSwapTarget ? 'rgba(0,180,216,0.03)' : 'transparent',
                            borderBottom: '1px solid var(--rule)',
                            borderLeft: isSelected ? '2px solid var(--cyan)' : isSwapTarget ? '2px solid rgba(0,180,216,0.3)' : '2px solid transparent',
                            cursor: 'pointer', textAlign: 'left',
                          }}
                        >
                          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mute)', width: 28, flexShrink: 0, textAlign: 'right' }}>#{String(no).padStart(2, '0')}</div>
                          <div style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor(player), flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 14, color: 'var(--paper)', letterSpacing: '-0.01em', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{surname}</span>
                              {player.id === captainId && (
                                <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--gold)', color: '#0A0A0A', fontFamily: 'Archivo Black, sans-serif', fontSize: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>C</div>
                              )}
                              {isSwapTarget && (
                                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 7, color: 'var(--cyan)', border: '1px solid rgba(0,180,216,0.4)', padding: '1px 4px', flexShrink: 0, letterSpacing: '0.1em' }}>SWAP</span>
                              )}
                            </div>
                            {player.fixtureStatus && (
                              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 7, color: player.fixtureStatus.color, letterSpacing: '0.1em', marginTop: 1 }}>{player.fixtureStatus.label}</div>
                            )}
                          </div>
                          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', flexShrink: 0, minWidth: 28, textAlign: 'right' }}>{(player.club ?? '').substring(0, 3).toUpperCase()}</div>
                          <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 16, color: 'var(--paper)', letterSpacing: '-0.02em', flexShrink: 0, minWidth: 24, textAlign: 'right' }}>{Math.round(player.points ?? 0)}</div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}

              {/* Bench strip — always visible so sub-in/out can be completed */}
              {bench.length > 0 && (
                <>
                  {/* Bench divider */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px 6px', borderTop: '1px solid var(--rule)', marginTop: 4 }}>
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8, color: 'var(--mute)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>Substitutes</div>
                    <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8, color: 'var(--mute)' }}>{bench.length}</div>
                  </div>
                  {bench.map((player, bi) => {
                    const surname = player.name?.split(' ').slice(-1)[0]?.toUpperCase() ?? '?';
                    const posColor = player.position === 'GK' ? 'var(--pos-gk)' : player.position === 'DEF' ? 'var(--pos-def)' : player.position === 'MID' ? 'var(--pos-mid)' : 'var(--pos-fwd)';
                    const isSelected   = selectedPlayer?.id === player.id;
                    const isSwapTarget = swapMode && !isSelected;
                    const isLocked     = player.isLineupLocked;
                    return (
                      <button
                        key={player.id}
                        onClick={() => handlePlayerClick(player)}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                          padding: '9px 16px',
                          background: isSelected ? 'rgba(0,180,216,0.07)' : isSwapTarget && !isLocked ? 'rgba(0,180,216,0.03)' : 'rgba(255,255,255,0.015)',
                          borderBottom: '1px solid var(--rule)',
                          borderLeft: isSelected ? '2px solid var(--cyan)' : isSwapTarget && !isLocked ? '2px solid rgba(0,180,216,0.3)' : '2px solid transparent',
                          opacity: isLocked ? 0.4 : isSwapTarget ? 1 : 0.7,
                          cursor: isLocked ? 'not-allowed' : 'pointer', textAlign: 'left',
                        }}
                      >
                        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mute)', width: 28, flexShrink: 0, textAlign: 'right' }}>{isLocked ? '🔒' : `S${bi + 1}`}</div>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor(player), flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 14, color: 'var(--paper)', letterSpacing: '-0.01em', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{surname}</span>
                            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 7, color: posColor, border: `1px solid ${posColor}50`, padding: '1px 4px', flexShrink: 0, letterSpacing: '0.1em' }}>{player.position}</span>
                            {isSwapTarget && !isLocked && (
                              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 7, color: 'var(--cyan)', border: '1px solid rgba(0,180,216,0.4)', padding: '1px 4px', flexShrink: 0, letterSpacing: '0.1em' }}>SWAP</span>
                            )}
                            {isLocked && (
                              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 7, color: 'var(--mute)', border: '1px solid rgba(255,255,255,0.12)', padding: '1px 4px', flexShrink: 0, letterSpacing: '0.1em' }}>LOCKED</span>
                            )}
                          </div>
                          {player.fixtureStatus && (
                            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 7, color: player.fixtureStatus.color, letterSpacing: '0.1em', marginTop: 1 }}>{player.fixtureStatus.label}</div>
                          )}
                        </div>
                        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', flexShrink: 0, minWidth: 28, textAlign: 'right' }}>{(player.club ?? '').substring(0, 3).toUpperCase()}</div>
                        <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 16, color: 'var(--paper)', letterSpacing: '-0.02em', flexShrink: 0, minWidth: 24, textAlign: 'right' }}>{Math.round(player.points ?? 0)}</div>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          );
        })()}

        {/* â"€â"€ LIST TAB — full squad with empty slots + SIGN buttons â"€â"€â"€ */}
        {mobileTab === 'squad' && (() => {
          const totalSigned = allSquadPlayers.length;
          const squadSize   = Object.values(POS_LIMITS).reduce((a, b) => a + b, 0);
          const emptySlots  = Math.max(0, squadSize - totalSigned);
          const POS_LABEL_LIST  = { GK: 'Goalkeeper', DEF: 'Defenders', MID: 'Midfielders', FWD: 'Forwards' };
          return (
            <div className="pb-24">
              {/* Section header */}
              <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--rule)' }}>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 4 }}>Tactical Sheet</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 28, color: 'var(--paper)', lineHeight: 1, letterSpacing: '-0.01em' }}>MY SQUAD</div>
                  </div>
                  <LeagueSelector value={activeLeague} onChange={setActiveLeague} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div />
                  <button
                    onClick={handleAutoFill}
                    disabled={autoFilling}
                    style={{ padding: '6px 10px', background: 'rgba(0,196,232,0.08)', border: '1px solid rgba(0,196,232,0.25)', color: autoFilling ? 'var(--mute)' : 'var(--cyan)', fontFamily: 'Archivo Black, sans-serif', fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', borderRadius: 2, cursor: autoFilling ? 'wait' : 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}
                  >
                    {autoFilling ? 'FILLING…' : '⚡ FILL'}
                  </button>
                </div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', letterSpacing: '0.14em', marginTop: 6 }}>
                  {totalSigned}/{squadSize} SIGNED{emptySlots > 0 ? ` · ${emptySlots} EMPTY SLOT${emptySlots !== 1 ? 'S' : ''}` : ''}
                </div>
              </div>
              {autoFillMsg && (
                <div style={{ padding: '6px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: autoFillMsg?.startsWith('Added') ? 'var(--positive)' : 'var(--gold)', borderBottom: '1px solid var(--rule)' }}>{autoFillMsg}</div>
              )}
              {/* Starters + bench grouped by position */}
              {['GK', 'DEF', 'MID', 'FWD'].map(pos => {
                const limit       = POS_LIMITS[pos] ?? 0;
                const posStarters = players.filter(p => p.position === pos);
                const posBench    = bench.filter(p => p.position === pos);
                const allPos      = [...posStarters, ...posBench];
                const emptyCount  = totalSigned >= squadSize ? 0 : Math.max(0, limit - allPos.length);
                const posColor    = pos === 'GK' ? 'var(--pos-gk)' : pos === 'DEF' ? 'var(--pos-def)' : pos === 'MID' ? 'var(--pos-mid)' : 'var(--pos-fwd)';
                return (
                  <div key={pos}>
                    {/* Position group header */}
                    <div style={{ padding: '10px 16px 5px', display: 'flex', alignItems: 'center', gap: 8, borderLeft: `3px solid ${posColor}` }}>
                      <span style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 9, color: posColor, letterSpacing: '0.16em', textTransform: 'uppercase', flex: 1 }}>{POS_LABEL_LIST[pos]}</span>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)' }}>{allPos.length}/{limit}</span>
                    </div>
                    {/* Signed players */}
                    {allPos.map(player => {
                      const isStarter = posStarters.some(p => p.id === player.id);
                      const sc = player.intel?.status === 'out' || player.intel?.status === 'injured' || player.intel?.status === 'suspended'
                        ? 'var(--danger)' : player.intel?.status === 'doubt' || player.intel?.status === 'doubtful'
                        ? 'var(--gold)' : 'var(--positive)';
                      const auctionListing = activeAuctions.find(a => a.player_id === player.id);
                      const isListed = !!auctionListing;
                      return (
                        <div key={player.id}>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => handlePlayerClick(player)}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handlePlayerClick(player); }}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                            padding: '9px 16px',
                            background: isStarter ? 'transparent' : 'rgba(255,255,255,0.015)',
                            borderBottom: '1px solid var(--rule)',
                            borderLeft: isStarter ? '2px solid var(--cyan)' : '2px solid transparent',
                            opacity: isStarter ? 1 : 0.65,
                            cursor: 'pointer', textAlign: 'left',
                          }}
                        >
                          {/* Position badge */}
                          <div style={{ width: 34, height: 34, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${posColor}`, color: posColor, fontFamily: 'Archivo Black, sans-serif', fontSize: 9, letterSpacing: '0.08em', background: 'rgba(255,255,255,0.03)' }}>{pos}</div>
                          {/* Status dot */}
                          <div style={{ width: 7, height: 7, borderRadius: '50%', background: sc, flexShrink: 0 }} />
                          {/* Name + meta */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <span style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 13, color: 'var(--paper)', letterSpacing: '-0.01em', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{player.name.split(' ').slice(-1)[0]}</span>
                              {player.id === captainId && <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--gold)', color: '#0A0A0A', fontFamily: 'Archivo Black, sans-serif', fontSize: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>C</div>}
                              {!isStarter && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 7, color: 'var(--mute)', border: '1px solid var(--rule)', padding: '0 3px', flexShrink: 0 }}>SUB</span>}
                            </div>
                            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8, color: 'var(--mute)', letterSpacing: '0.12em', marginTop: 1 }}>{(player.club ?? '').substring(0, 3).toUpperCase()}{player.price > 0 ? ` · €${Number(player.price).toFixed(1)}M` : ''}</div>
                            {player.fixtureStatus && (
                              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8, color: player.fixtureStatus.color, letterSpacing: '0.12em', marginTop: 1 }}>{player.fixtureStatus.label}</div>
                            )}
                            <FormStrip rounds={squadStatsMap[player.id]} />
                          </div>
                          {/* Points */}
                          <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 16, color: 'var(--paper)', letterSpacing: '-0.02em', flexShrink: 0 }}>{Math.round(player.points ?? 0)}</div>
                          {/* Full stats dashboard trigger */}
                          <button
                            onClick={e => { e.stopPropagation(); setStatsDashboardPlayer(player); }}
                            style={{
                              fontFamily: 'JetBrains Mono, monospace',
                              fontSize: 8, fontWeight: 800,
                              letterSpacing: '0.1em',
                              padding: '3px 6px',
                              border: '1px solid rgba(0,180,216,0.4)',
                              color: 'var(--cyan)',
                              background: 'rgba(0,180,216,0.06)',
                              flexShrink: 0,
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            STATS ↗
                          </button>
                          {/* Auction action */}
                          {activeLeague && (
                            <div onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }}>
                              {isListed ? (() => {
                                const isConfirming = confirmCancelId === player.id;
                                const isCancelBusy = cancelBusy === player.id;
                                return (
                                  <button
                                    disabled={isCancelBusy}
                                    onClick={() => handleAuctionBadgeClick(player, auctionListing)}
                                    style={{
                                      fontFamily: 'JetBrains Mono, monospace',
                                      fontSize: 8, fontWeight: 800,
                                      letterSpacing: '0.1em',
                                      textTransform: 'uppercase',
                                      padding: '3px 6px',
                                      border: isConfirming ? '1px solid rgba(239,68,68,0.6)' : '1px solid rgba(240,180,0,0.4)',
                                      color: isConfirming ? 'var(--danger)' : 'var(--gold)',
                                      background: isConfirming ? 'rgba(239,68,68,0.12)' : 'rgba(240,180,0,0.1)',
                                      whiteSpace: 'nowrap',
                                      cursor: 'pointer',
                                      opacity: isCancelBusy ? 0.5 : 1,
                                    }}
                                  >
                                    {isCancelBusy ? '…' : isConfirming ? 'CANCEL?' : 'ON AUCTION'}
                                  </button>
                                );
                              })() : (
                                <button
                                  disabled={auctionBusy === player.id}
                                  onClick={async () => {
                                    const bid = parseFloat(player.price ?? 0);
                                    setAuctionBusy(player.id);
                                    const res = await listForAuction(player.id, bid);
                                    setAuctionBusy(null);
                                    if (!res.ok) showToast(res.error, 'error');
                                    else showToast(`${player.name} listed for auction`, 'success');
                                  }}
                                  style={{
                                    fontFamily: 'JetBrains Mono, monospace',
                                    fontSize: 8, fontWeight: 800,
                                    letterSpacing: '0.1em',
                                    textTransform: 'uppercase',
                                    padding: '3px 6px',
                                    border: '1px solid rgba(240,180,0,0.4)',
                                    color: 'var(--gold)',
                                    background: 'rgba(240,180,0,0.06)',
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                    opacity: auctionBusy === player.id ? 0.5 : 1,
                                  }}
                                >
                                  {auctionBusy === player.id ? '…' : 'AUCTION'}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        </div>
                      );
                    })}
                    {/* Empty slots */}
                    {Array.from({ length: emptyCount }).map((_, i) => (
                      <div
                        key={`empty-${pos}-${i}`}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '9px 16px',
                          borderBottom: '1px solid var(--rule)',
                          borderLeft: '2px solid transparent',
                        }}
                      >
                        <div style={{ width: 34, height: 34, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px dashed ${posColor}40`, color: `${posColor}60`, fontFamily: 'Archivo Black, sans-serif', fontSize: 9 }}>{pos}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 11, color: 'var(--mute)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Empty Slot</div>
                          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8, color: 'var(--mute)', letterSpacing: '0.1em', marginTop: 1, opacity: 0.6 }}>Open Market to Sign</div>
                        </div>
                        <button
                          onClick={() => setPickerPos(pos)}
                          style={{ padding: '5px 12px', border: '1px solid var(--cyan)', color: 'var(--cyan)', fontFamily: 'Archivo Black, sans-serif', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', background: 'transparent', cursor: 'pointer', flexShrink: 0 }}
                        >
                          SIGN
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* â"€â"€ CHIPS TAB â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
        {/* CHIPS TAB hidden for pilot */}
        {CHIPS_ENABLED && mobileTab === 'chips' && null}

        {/* â"€â"€ STATUS TAB â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
        {mobileTab === 'status' && (
          <div className="pb-24">
            <SectionHeader title="Player Status" accent="gold" />
            <DangerList />
          </div>
        )}

        {/* â"€â"€ TOOLS TAB (legacy fallback — now unused) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
        {CHIPS_ENABLED && mobileTab === 'tools' && (
          <div className="pb-6">

            {/* Section 1: Active Features Summary */}
            {(squadData.isTripleCaptain || jokerPlayer) && (
              <div className="mx-4 mt-4 mb-4 pb-3 border-b border-white/5">
                <div className="text-[9px] font-black uppercase tracking-[0.1em]" style={{ color: 'var(--mute)', marginBottom: '8px' }}>
                  Active Features
                </div>
                <div className="flex flex-wrap gap-2">
                  {squadData.isTripleCaptain && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded" style={{ background: 'rgba(240,180,0,0.1)', border: '1px solid rgba(240,180,0,0.25)' }}>
                      
                      <span className="text-[8px] font-black uppercase tracking-widest" style={{ color: 'var(--gold)' }}>Triple Capt.</span>
                    </div>
                  )}
                  {jokerPlayer && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded" style={{ background: 'rgba(157,95,245,0.1)', border: '1px solid rgba(157,95,245,0.25)' }}>
                      
                      <span className="text-[8px] font-black uppercase tracking-widest" style={{ color: 'var(--pos-gk)' }}>Joker: {jokerPlayer.name.split(' ')[0]}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Section 2: Power Tools */}
            <div className="mx-4" data-tour="squad-power-tools">
              <div className="text-[11px] font-black uppercase tracking-[0.1em] mb-3" style={{ color: 'var(--gold)' }}>
                POWER TOOLS
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                {/* Triple Captain */}
                <PowerToolCard
                  
                  label="Triple Cap."
                  description="3× captain points — or 0 if they don't play"
                  isActive={squadData.isTripleCaptain}
                  accentColor="var(--gold)"
                  bgColor="rgba(240,180,0,0.08)"
                  borderColor="rgba(240,180,0,0.15)"
                  actionLabel={squadData.isTripleCaptain ? 'Active' : 'Activate'}
                  onAction={() => {
                    if (!isLocked) {
                      setConfirm({
                        title: squadData.isTripleCaptain ? 'Deactivate Triple Captain?' : 'Activate Triple Captain?',
                        body: squadData.isTripleCaptain
                          ? 'Your captain will earn normal points.'
                          : 'Your captain will earn 3× points this matchday. 1 use per season.',
                        onConfirm: () => doToggleChip('triple'),
                        confirmLabel: 'Confirm',
                        warning: squadData.isTripleCaptain ? null : 'This action cannot be undone this gameweek.',
                      });
                    }
                  }}
                />

              </div>
            </div>

            {/* Section 3: Matchday Joker */}
            <div className="mx-4 mb-4">
              <div className="p-3 rounded-sm" style={{ background: 'var(--ink-2)', border: '1.5px solid rgba(157,95,245,0.15)' }}>
                <div className="fk-display" style={{ fontSize: 16, textAlign: 'center', color: 'var(--pos-gk)', marginBottom: '4px' }}>JOKER</div>
                <div style={{
                  fontSize: '12px',
                  fontFamily: 'Archivo Black, sans-serif',
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--pos-gk)',
                  textAlign: 'center',
                  marginBottom: '4px',
                }}>
                  Matchday Joker
                </div>
                <div style={{
                  fontSize: '10px',
                  color: 'rgba(240,242,245,0.6)',
                  textAlign: 'center',
                  marginBottom: '8px',
                  lineHeight: 1.4,
                  fontFamily: 'Archivo, sans-serif',
                }}>
                  Pick one player outside your squad. They score their real points as a bonus — one pick per matchday, each player once per season.
                </div>
                <button
                  onClick={() => setIsJokerPickerOpen(true)}
                  disabled={isLocked}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: jokerPlayer ? 'rgba(157,95,245,0.15)' : 'rgba(157,95,245,0.25)',
                    color: 'var(--pos-gk)',
                    border: '1px solid rgba(157,95,245,0.3)',
                    borderRadius: '6px',
                    fontSize: '10px',
                    fontFamily: 'Archivo Black, sans-serif',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    cursor: isLocked ? 'not-allowed' : 'pointer',
                    opacity: isLocked ? 0.5 : 1,
                  }}
                >
                  {jokerPlayer ? `âœ" Set: ${jokerPlayer.name}` : 'Pick Joker'}
                </button>
              </div>
            </div>

            {/* Section 4: Player Status */}
            <div className="mx-4">
              <SectionHeader title="PLAYER STATUS" accent="red" />
              <div className="mt-3">
                <DangerList />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* â•â• DESKTOP LAYOUT â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {/* Shrink container by swap-banner height (â‰ˆ64px) so bench strip stays above the fixed banner */}
      <div className="hidden lg:flex flex-col" style={{ height: swapMode ? 'calc(100vh - 88px - 64px)' : 'calc(100vh - 88px)' }}>

        {/* â"€â"€ Sub-tab row: Pitch / List / Chips / Status â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
        <div className="flex shrink-0 items-center" style={{ borderBottom: '1px solid var(--rule)', background: 'var(--ink-2)' }}>
          {[
            { id: 'pitch',  label: 'Pitch'  },
            { id: 'list',   label: 'List'   },
            { id: 'status', label: 'Status' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setDesktopTab(tab.id)}
              className="relative px-6 py-3 text-[10px] font-black uppercase tracking-widest transition-all"
              style={{
                fontFamily: 'Archivo Black, sans-serif',
                color: desktopTab === tab.id ? 'var(--cyan)' : 'var(--mute)',
                background: 'transparent',
              }}
            >
              {tab.label}
              {desktopTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: 'var(--cyan)' }} />
              )}
              {tab.id === 'status' && dangerPlayers.length > 0 && (
                <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full" style={{ background: 'var(--danger)' }} />
              )}
            </button>
          ))}
        </div>

        {/* Incomplete squad banner — desktop */}
        {allSquadPlayers.length < 11 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', background: 'rgba(240,58,58,0.10)', borderBottom: '1px solid rgba(240,58,58,0.28)', flexShrink: 0 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)', flexShrink: 0 }} />
            <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 13, fontWeight: 900, color: 'var(--danger)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Squad too small — {allSquadPlayers.length}/11 players
            </div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'rgba(240,58,58,0.8)' }}>
              Need {11 - allSquadPlayers.length} more to field a starting XI
            </div>
            <button onClick={() => navigate(`/market?leagueId=${activeLeague}`)} style={{ marginLeft: 'auto', fontFamily: 'Archivo Black, sans-serif', fontWeight: 900, fontSize: 10, color: 'var(--danger)', border: '1px solid rgba(240,58,58,0.5)', padding: '6px 14px', background: 'transparent', cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0 }}>
              GO TO MARKET →
            </button>
          </div>
        ) : allSquadPlayers.length < 15 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', background: 'rgba(240,180,0,0.09)', borderBottom: '1px solid rgba(240,180,0,0.22)', flexShrink: 0 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--gold)', flexShrink: 0 }} />
            <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 13, fontWeight: 900, color: 'var(--gold)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Squad incomplete — {allSquadPlayers.length}/15 players
            </div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'rgba(240,180,0,0.75)' }}>
              {15 - allSquadPlayers.length} empty slot{15 - allSquadPlayers.length !== 1 ? 's' : ''} — sign more players to complete your squad
            </div>
            <button onClick={() => navigate(`/market?leagueId=${activeLeague}`)} style={{ marginLeft: 'auto', fontFamily: 'Archivo Black, sans-serif', fontWeight: 900, fontSize: 10, color: 'var(--gold)', border: '1px solid rgba(240,180,0,0.45)', padding: '6px 14px', background: 'transparent', cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0 }}>
              SIGN PLAYERS →
            </button>
          </div>
        ) : null}

        {/* â"€â"€ Tab content â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
        <div className="flex-1 overflow-hidden flex">

          {/* â"€â"€ PITCH TAB — XI on pitch + bench strip below â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
          {desktopTab === 'pitch' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Pitch — flex:1 to fill most of the height */}
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <PitchView
                  variant="desktop"
                  squad={{ players, captainId, isTripleCaptain: squadData.isTripleCaptain, joker: jokerPlayer }}
                  onPlayerClick={handlePlayerClick}
                  selectedPlayerId={selectedPlayer?.id}
                  jokerPlayerId={todayJokerId}
                  matchdayLabel={squadData.matchdayId ? `GW · ${squadData.matchdayId}` : ''}
                />
              </div>
              {/* Bench strip — single row of HybridToken-style pills */}
              {bench.length > 0 && (
                <div style={{
                  flexShrink: 0, borderTop: '1px solid var(--rule)',
                  background: 'rgba(8,9,12,0.95)', padding: '12px 40px',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', letterSpacing: '0.18em', flexShrink: 0 }}>BENCH</div>
                  <div style={{ flex: 1, display: 'flex', gap: 10, flexWrap: 'nowrap', overflow: 'hidden' }}>
                    {bench.map((player) => {
                      const pos = player.position;
                      const posColor = pos === 'GK' ? 'var(--pos-gk)' : pos === 'DEF' ? 'var(--pos-def)' : pos === 'MID' ? 'var(--pos-mid)' : 'var(--pos-fwd)';
                      const surname = player.name?.split(' ').slice(-1)[0]?.toUpperCase() ?? '?';
                      return (
                        <button
                          key={player.id}
                          onClick={() => handlePlayerClick(player)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '6px 10px 6px 8px',
                            background: selectedPlayer?.id === player.id ? 'rgba(0,180,216,0.08)' : 'rgba(15,18,24,0.92)',
                            border: `1px solid ${selectedPlayer?.id === player.id ? 'var(--cyan)' : 'var(--rule)'}`,
                            borderRadius: 4, cursor: 'pointer', flexShrink: 0,
                          }}
                        >
                          <div style={{
                            width: 28, height: 28, flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: `1.5px solid ${posColor}`, color: posColor,
                            fontFamily: 'Archivo Black, sans-serif', fontSize: 9,
                          }}>{pos}</div>
                          <div>
                            <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 11, color: 'var(--paper)', letterSpacing: '-0.01em' }}>{surname}</div>
                            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8, color: 'var(--mute)', letterSpacing: '0.1em' }}>{(player.club ?? '').substring(0, 3).toUpperCase()}{player.price > 0 ? ` · €${Number(player.price).toFixed(1)}M` : ''} · {Math.round(player.points ?? 0)} PTS</div>
                            {player.fixtureStatus && (
                              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8, color: player.fixtureStatus.color, letterSpacing: '0.1em', marginTop: 1 }}>{player.fixtureStatus.label}</div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* â"€â"€ LIST TAB — player list + bench panel â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
          {desktopTab === 'list' && (
            <>
              <div className="flex-1 min-w-0 overflow-y-auto">
                <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--rule)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 14, color: 'var(--paper)', letterSpacing: '0.02em' }}>Squad List</div>
                    <button onClick={() => setShowScoringModal(true)} style={{ background: 'none', border: '1px solid var(--rule)', color: 'var(--mute)', fontFamily: 'Archivo Black, sans-serif', fontSize: 9, width: 18, height: 18, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>?</button>
                  </div>
                  <button
                    onClick={handleAutoFill}
                    disabled={autoFilling}
                    style={{ padding: '8px 12px', background: 'rgba(0,196,232,0.08)', border: '1px solid rgba(0,196,232,0.25)', color: autoFilling ? 'var(--mute)' : 'var(--cyan)', fontFamily: 'Archivo Black, sans-serif', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', borderRadius: 2, cursor: autoFilling ? 'wait' : 'pointer', flexShrink: 0 }}
                  >
                    {autoFilling ? 'FILLING…' : '⚡ QUICK FILL'}
                  </button>
                </div>
                {autoFillMsg && (
                  <div style={{ padding: '6px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: autoFillMsg?.startsWith('Added') ? 'var(--positive)' : 'var(--gold)', borderBottom: '1px solid var(--rule)' }}>{autoFillMsg}</div>
                )}
                <PlayerList />
              </div>
            </>
          )}

          {/* â"€â"€ CHIPS TAB â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
          {/* CHIPS TAB hidden for pilot */}
          {CHIPS_ENABLED && desktopTab === 'chips' && null}

          {/* â"€â"€ STATUS TAB â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
          {desktopTab === 'status' && (
            <div className="flex-1 overflow-y-auto max-w-xl">
              <SectionHeader title="Player Status" accent="gold" />
              <DangerList />
              <div className="mt-4">
                <SectionHeader title="Captain" />
                {(() => {
                  const cap = allSquadPlayers.find(p => p.id === captainId);
                  if (!cap) return null;
                  return (
                    <div className="px-4 py-3 flex items-center gap-3">
                      <div className="w-8 h-8 flex items-center justify-center text-[10px] font-black shrink-0" style={{ background: 'rgba(224,168,0,0.15)', border: '1px solid rgba(224,168,0,0.4)', color: 'var(--gold)' }}>C</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold text-white truncate">{cap.name}</div>
                        <div className="text-[10px] mt-0.5" style={{ color: 'var(--mute)' }}>{cap.position} · {cap.club} · €{cap.price}M</div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* â•â• PLAYER ACTION BOTTOM SHEET â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {selectedPlayer && !swapMode && createPortal(
        <>
          {/* Tap-outside dismiss — portaled to body so iOS WebKit stacking context doesn't trap z-index */}
          <div
            className="fixed inset-0 z-[59] lg:left-[220px]"
            onClick={() => setSelectedPlayer(null)}
          />
        <div
          className="fixed bottom-0 left-0 right-0 lg:left-[220px] z-[60] animate-slide-up"
          style={{
            background: 'rgba(20,26,36,0.98)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            borderTop: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 -8px 40px rgba(0,0,0,0.6)',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          <div className="max-w-2xl mx-auto px-5 pt-4 pb-5">
            {/* Handle */}
            <div className="flex justify-center mb-3">
              <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }} />
            </div>
            {/* Player info */}
            <div className="flex items-start justify-between mb-4 gap-3">
              <div className="flex items-start gap-3">
                {/* Position badge — matches player list row style */}
                <div style={{
                  width: 44,
                  height: 44,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(255,255,255,0.05)',
                  border: `1.5px solid ${
                    selectedPlayer.position === 'GK' ? 'var(--pos-gk)' :
                    selectedPlayer.position === 'DEF' ? 'var(--pos-def)' :
                    selectedPlayer.position === 'MID' ? 'var(--pos-mid)' :
                    'var(--pos-fwd)'
                  }`,
                  color: selectedPlayer.position === 'GK' ? 'var(--pos-gk)' :
                    selectedPlayer.position === 'DEF' ? 'var(--pos-def)' :
                    selectedPlayer.position === 'MID' ? 'var(--pos-mid)' :
                    'var(--pos-fwd)',
                  fontFamily: 'Archivo Black, sans-serif',
                  fontSize: 10,
                  letterSpacing: '0.08em',
                }}>
                  {selectedPlayer.position}
                </div>
                <div>
                  <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 18, color: 'var(--paper)', lineHeight: 1.1, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    {selectedPlayer.name}
                    {selectedPlayer.price > 0 && (
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: 'var(--paper)', letterSpacing: '0.04em' }}>
                        €{Number(selectedPlayer.price).toFixed(1)}M
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mute)', letterSpacing: '0.14em', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {selectedPlayer.club}
                    {selectedPlayer.id === captainId && (
                      <span style={{ color: 'var(--gold)', background: 'rgba(224,168,0,0.12)', border: '1px solid rgba(224,168,0,0.3)', padding: '1px 6px', borderRadius: 2 }}>CAPTAIN</span>
                    )}
                    {selectedPlayer.id === todayJokerId && (
                      <span style={{ color: 'var(--pos-gk)', background: 'rgba(157,95,245,0.1)', border: '1px solid rgba(157,95,245,0.3)', padding: '1px 6px', borderRadius: 2 }}>JOKER</span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedPlayer(null)}
                style={{ width: 28, height: 28, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--mute)', fontSize: 16, cursor: 'pointer' }}
              >×</button>
            </div>
            {/* Form + next fixture + ownership context strip */}
            <div className="flex items-stretch gap-3 mb-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)', borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '10px 0' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8, color: 'var(--mute)', letterSpacing: '0.2em', marginBottom: 6 }}>FORM</div>
                <FormStrip rounds={squadStatsMap[selectedPlayer.id]} />
              </div>
              <div style={{ flex: 1, minWidth: 0, borderLeft: '1px solid rgba(255,255,255,0.07)', paddingLeft: 12 }}>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8, color: 'var(--mute)', letterSpacing: '0.2em', marginBottom: 6 }}>NEXT FIXTURE</div>
                <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 12, color: selectedPlayer.fixtureStatus?.color || 'var(--paper)', letterSpacing: '-0.01em' }}>
                  {selectedPlayer.fixtureStatus?.label || 'NO FIXTURE'}
                </div>
              </div>
            </div>
            {/* View full stats dashboard */}
            <button
              onClick={() => setStatsDashboardPlayer(selectedPlayer)}
              className="w-full mb-3 py-2 rounded-sm transition-all active:scale-95"
              style={{ background: 'rgba(0,180,216,0.06)', color: 'var(--cyan)', border: '1px solid rgba(0,180,216,0.35)', fontFamily: 'Archivo Black, sans-serif', fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase' }}
            >
              VIEW FULL STATS DASHBOARD ↗
            </button>
            {/* Actions */}
            <div className="flex gap-2 mb-3">
              {!selectedIsBench && (
                <button
                  onClick={setCaptain}
                  disabled={saving || captainId === selectedPlayer.id}
                  className="flex-1 py-2.5 rounded-sm transition-all active:scale-95 disabled:opacity-30"
                  style={{
                    background: captainId === selectedPlayer.id ? 'rgba(224,168,0,0.12)' : 'var(--gold)',
                    color: captainId === selectedPlayer.id ? 'var(--gold)' : '#0A0A0A',
                    border: captainId === selectedPlayer.id ? '1px solid rgba(224,168,0,0.35)' : '1px solid var(--gold)',
                    fontFamily: 'Archivo Black, sans-serif', fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase',
                  }}
                >
                  {captainId === selectedPlayer.id ? 'CURRENT CAPTAIN' : 'MAKE CAPTAIN'}
                </button>
              )}
              {selectedIsBench && squadData.players.length < 11 ? (
                // Direct promotion: if starters < 11, just add bench player to pitch without swapping anyone out
                <button
                  onClick={async () => {
                    try {
                      setSaving(true);
                      const benchP = selectedPlayer;
                      const newPlayers = [...squadData.players, benchP];
                      const formationError = validateFormation(newPlayers);
                      if (formationError) { showToast(formationError, 'warning'); return; }
                      const newBench = squadData.bench.filter(b => b.id !== benchP.id);
                      setSquadData({ ...squadData, players: newPlayers, bench: newBench });
                      setSelectedPlayer(null);
                      await supabase.from('squads').update({
                        players: [...newPlayers, ...newBench].map(p => p.id),
                      }).eq('id', squadData.squadId);
                    } finally { setSaving(false); }
                  }}
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-sm transition-all active:scale-95 disabled:opacity-40"
                  style={{ background: 'var(--cyan)', color: '#0A0A0A', border: '1px solid var(--cyan)', fontFamily: 'Archivo Black, sans-serif', fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase' }}
                >
                  ADD TO PITCH
                </button>
              ) : (
                // Swap mode: only if starters = 11 and user wants to swap
                <button
                  onClick={() => setSwapMode(true)}
                  disabled={saving || (selectedIsBench && squadData.players.length >= 11 && squadData.bench.length === 1)}
                  className="flex-1 py-2.5 rounded-sm transition-all active:scale-95 disabled:opacity-40"
                  style={{ background: 'transparent', color: 'var(--cyan)', border: '1px solid var(--cyan)', fontFamily: 'Archivo Black, sans-serif', fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase' }}
                >
                  {selectedIsBench ? 'SUB IN' : 'SUB OUT'}
                </button>
              )}
              <button
                onClick={handleSellPlayer}
                disabled={saving}
                className="px-5 py-2.5 rounded-sm transition-all active:scale-95 disabled:opacity-40"
                style={{ background: 'transparent', color: 'var(--danger)', border: '1px solid var(--danger)', fontFamily: 'Archivo Black, sans-serif', fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase' }}
              >
                SELL
              </button>
            </div>
            {/* Matchday Joker section — hidden for pilot (CHIPS_ENABLED=false) */}
            {CHIPS_ENABLED && <div className="pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              {todayJokerId ? (
                <div className="flex items-center gap-2 p-2.5 rounded-sm" style={{ background: 'rgba(157,95,245,0.08)', border: '1px solid rgba(157,95,245,0.2)' }}>

                  <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--pos-gk)', fontFamily: 'Archivo Black, sans-serif' }}>
                    Joker already locked for today
                  </div>
                </div>
              ) : (
                <>
                  <button
                    onClick={handleActivateJoker}
                    disabled={saving || !playingTodayTeams.includes(selectedPlayer.club)}
                    className="w-full py-3 rounded-sm transition-all active:scale-95"
                    style={{
                      background: playingTodayTeams.includes(selectedPlayer.club) ? 'var(--pos-gk)' : 'rgba(255,255,255,0.04)',
                      color: playingTodayTeams.includes(selectedPlayer.club) ? '#fff' : 'var(--mute)',
                      border: playingTodayTeams.includes(selectedPlayer.club) ? 'none' : '1px solid rgba(255,255,255,0.07)',
                      fontFamily: 'Archivo Black, sans-serif', fontSize: '11px', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
                      cursor: playingTodayTeams.includes(selectedPlayer.club) ? 'pointer' : 'not-allowed',
                      boxShadow: playingTodayTeams.includes(selectedPlayer.club) ? '0 0 12px rgba(157,95,245,0.3)' : 'none',
                    }}
                  >
                    {playingTodayTeams.includes(selectedPlayer.club) ? 'ACTIVATE JOKER' : 'âœ— Not Playing Today'}
                  </button>
                  <p className="mt-1.5 text-[9px] text-center uppercase tracking-wide" style={{ color: 'var(--mute)', fontFamily: 'Archivo, sans-serif' }}>
                    1 Joker per matchday · Country limit exempt · Locked once set
                  </p>
                </>
              )}
            </div>}
          </div>
        </div>
        </>,
        document.body
      )}

      {/* â•â• PLAYER PICKER SHEET â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {CHIPS_ENABLED && showChipWizard && <ChipWizardModal />}

      {/* Full player stats dashboard */}
      {statsDashboardPlayer && (
        <PlayerStatsDashboard
          player={statsDashboardPlayer}
          ownershipPct={ownershipMap[statsDashboardPlayer.id]}
          onClose={() => setStatsDashboardPlayer(null)}
        />
      )}

      {pickerPos && (
        <PlayerPickerSheet
          position={pickerPos}
          budget={squadData?.budget?.current ?? 100}
          takenMap={takenMap}
          isOwnedBy={isOwnedBy}
          onSelect={handlePickerBuy}
          onClose={() => setPickerPos(null)}
          tournamentId={tournamentId}
        />
      )}

      {/* â•â• SWAP MODE BANNER â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {swapMode && (
        <div
          className="fixed bottom-0 left-0 right-0 lg:left-[220px] z-[60] px-5 py-3 flex justify-between items-center"
          style={{
            background: 'rgba(8,10,14,0.97)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderTop: '2px solid var(--cyan)',
            boxShadow: '0 -4px 24px rgba(0,180,216,0.12)',
            paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
          }}
        >
          <div>
            <div className="font-black text-[11px] uppercase tracking-widest" style={{ fontFamily: 'Archivo Black, sans-serif', color: 'var(--cyan)' }}>
              {selectedIsBench ? 'Select a starter to replace' : 'Select a bench player to bring on'}
            </div>
            <div className="text-[10px] mt-0.5" style={{ color: 'var(--mute)', fontFamily: 'JetBrains Mono, monospace' }}>
              Swapping out: {selectedPlayer?.name}
            </div>
          </div>
          <button
            onClick={() => { setSwapMode(false); setSelectedPlayer(null); }}
            className="px-4 py-1.5 rounded-sm font-bold uppercase text-[10px] tracking-widest"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--paper)', border: '1px solid rgba(255,255,255,0.1)', fontFamily: 'Archivo Black, sans-serif' }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* â•â• JOKER PICKER MODAL â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {CHIPS_ENABLED && isJokerPickerOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={() => setIsJokerPickerOpen(false)} />
          <div className="w-full max-w-lg bg-surface border border-purple/30 rounded-sm shadow-[0_0_50px_rgba(168,85,247,0.2)] overflow-hidden flex flex-col max-h-[80vh] relative z-10">
            <div className="px-5 py-4 border-b border-border flex justify-between items-center bg-purple/5">
              <div>
                <div className="fz-label text-purple">Matchday Joker Selection</div>
                <div className="fz-display text-lg text-white">CHOOSE YOUR 16TH MAN</div>
              </div>
              <button onClick={() => setIsJokerPickerOpen(false)} className="text-text-tertiary hover:text-white text-2xl">×</button>
            </div>
            {/* Only show team strip when there are fixtures */}
            {playingTodayTeams.length > 0 && (
              <div className="p-3 bg-bg flex items-center gap-2 border-b border-border">
                <span className="text-[10px] text-text-tertiary uppercase tracking-widest font-black shrink-0">Playing Today:</span>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {playingTodayTeams.map(t => (
                    <span key={t} className="px-2 py-0.5 bg-surface border border-border rounded-full text-[9px] text-white font-bold shrink-0">{t}</span>
                  ))}
                </div>
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              <JokerList
                teams={playingTodayTeams}
                squadPlayerIds={[...players, ...bench].map(p => p.id)}
                onSelect={handleJokerSelection}
                saving={saving}
              />
            </div>
            <div className="p-4 border-t border-border bg-surface text-[9px] text-text-tertiary uppercase text-center tracking-widest">
              Must be outside your squad · Real points, no multiplier · Once per matchday, each player once per season
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// â"€â"€ Supporting UI: Joker picker list (FB-024: proper empty/error states) â"€â"€â"€â"€â"€
function JokerList({ teams, squadPlayerIds, onSelect, saving }) {
  const [players,    setPlayers]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [fetchError, setFetchError] = useState(false);

  const load = async () => {
    setLoading(true);
    setFetchError(false);
    try {
      const { data, error } = await supabase
        .from('players').select('*')
        .in('club', teams)
        .order('price', { ascending: false });
      if (error) throw error;
      setPlayers(data || []);
    } catch (err) {
      console.error('[JokerList]', err);
      setFetchError(true);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (teams.length) load(); else setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teams]);

  const EmptyState = ({ emoji, title, sub, action }) => (
    <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
      <div style={{ fontSize: '36px' }}>{emoji}</div>
      <div style={{ fontFamily: 'Archivo Black, sans-serif', fontWeight: 800, fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--paper)' }}>{title}</div>
      {sub && <div style={{ fontSize: '12px', color: 'rgba(240,242,245,0.45)', lineHeight: 1.5, maxWidth: '220px' }}>{sub}</div>}
      {action}
    </div>
  );

  if (loading) return (
    <EmptyState title="Scouting Active Teams…" sub={null} action={
      <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: '10px', letterSpacing: '0.15em', color: 'var(--mute)', textTransform: 'uppercase' }} className="animate-scan">Loading</div>
    } />
  );

  // FB-024: error state with retry
  if (fetchError) return (
    <EmptyState title="Couldn't load players" sub="Check your connection and try again." action={
      <button onClick={load} style={{ padding: '8px 20px', background: 'var(--gold)', color: 'var(--ink-2)', fontSize: '11px', fontFamily: 'Archivo Black, sans-serif', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
        Retry
      </button>
    } />
  );

  // FB-024: no matches today
  if (!teams.length) return (
    <EmptyState title="No Matches Today" sub="The Matchday Joker is only available on matchdays. Check back when fixtures are scheduled." action={null} />
  );

  // Joker must be from outside the manager's own squad.
  // Filter out own-squad players — the DB trigger also enforces this, but the
  // picker should not show them at all to avoid confusing the user.
  const availablePlayers = players.filter(p => !squadPlayerIds?.includes(p.id));

  if (!availablePlayers.length) return (
    <EmptyState emoji="🏟️" title="No available players" sub="All players from today's fixtures are already in your squad." action={null} />
  );

  const PlayerRow = ({ p }) => (
    <button
      key={p.id}
      onClick={() => onSelect(p)}
      disabled={saving}
      className="w-full flex items-center gap-3 p-3 bg-bg border border-border hover:border-purple/50 rounded-sm transition-all group"
    >
      <div className="w-10 h-10 rounded-full border border-border flex items-center justify-center font-bold text-[10px] text-white bg-surface shrink-0 group-hover:border-purple/30">
        {p.club.substring(0, 3)}
      </div>
      <div className="flex-1 text-left min-w-0">
        <div className="text-[13px] font-bold text-white group-hover:text-purple transition-colors truncate">{p.name}</div>
        <div className="text-[9px] text-text-tertiary uppercase tracking-tighter">
          {p.position} · {p.club}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-[13px] font-black text-cyan tabular-nums">€{p.price}M</div>
        <div className="text-[8px] text-positive font-bold uppercase tracking-widest">Pick</div>
      </div>
    </button>
  );

  return (
    <div className="space-y-1">
      {availablePlayers.map(p => <PlayerRow key={p.id} p={p} />)}
    </div>
  );
}
