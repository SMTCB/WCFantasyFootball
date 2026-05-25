import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
// Empty squad shown when user has no squad yet (instead of demo data)
const EMPTY_SQUAD = {
  budget: { current: 100, total: 100 },
  captainId: null,
  players: [],
  bench: [],
};
import { getDangerZonePlayers, normalizeIntelligence, LINEUP_STATUS } from '../lib/intelligence';
import { normalisePlayer } from '../lib/players';
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

// â”€â”€ Chip config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const CHIPS = [
  {
    key:         'wildcard',
    label:       'Wildcard',
    description: 'Make unlimited free transfers this matchday. No point penalties.',
    stateKey:    'isWildcard',
    dbField:     'is_wildcard',
    activeColor: 'var(--positive)',
    activeStyle: { borderColor: 'rgba(24,201,107,0.35)', background: 'rgba(24,201,107,0.07)' },
    inactiveStyle: { borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' },
  },
  {
    key:         'triple',
    label:       'Triple Captain',
    description: 'All-or-Nothing: your captain scores 3Ã— points â€” but 0 if they don\'t play.',
    stateKey:    'isTripleCaptain',
    dbField:     'is_triple_captain',
    activeColor: 'var(--gold)',
    activeStyle: { borderColor: 'rgba(240,180,0,0.35)', background: 'rgba(240,180,0,0.07)' },
    inactiveStyle: { borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' },
  },
];

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function SquadScreen() {
  const { user } = useAuth();
  const { show: showToast } = useToast();
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

  // On mount: resolve which league to show
  useEffect(() => {
    const init = async () => {
      if (leagueIdParam) {
        setActiveLeague(leagueIdParam);
        return;
      }
      const { data } = await supabase
        .from('league_members')
        .select('league_id, leagues(id, name, tournament_id)')
        .eq('user_id', user?.id);
      const list = (data ?? []).map(r => ({ id: r.league_id, name: r.leagues?.name ?? r.league_id, tournament_id: r.leagues?.tournament_id }));
      if (list.length === 1) {
        setActiveLeague(list[0].id);
        setLeagues([]);
      } else {
        setLeagues(list);
      }
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

  // Transfer hook â€” league-scoped buy/sell + no-repeat enforcement
  const { buy, sell, takenMap, isOwnedBy } = useTransfer(activeLeague);

  // Availability flags hook â€” league-scoped player flags for trade offers
  const { flagMap, toggleFlag } = useAvailabilityFlag(activeLeague);

  // Auction hook â€” list players for auction in the current league
  const { listPlayer: listForAuction, auctions: activeAuctions } = useAuctions(activeLeague, squadData?.squadId);
  const [auctionBusy, setAuctionBusy] = useState(null); // playerId being listed

  // â”€â”€ Data Fetching â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const fetchSquad = useCallback(async () => {
    try {
      setLoading(true);
      const userId = user?.id;
      const today  = new Date().toISOString().split('T')[0];

      // â”€â”€ Transfer window lock check â€” use latest matchday deadline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // U11: scope deadline check to this league's tournament; capture matchday_id for squad filter
      let dlQuery = supabase
        .from('matchday_deadlines').select('deadline_at, matchday_id').order('deadline_at', { ascending: false }).limit(1);
      if (tournamentId) dlQuery = dlQuery.eq('tournament_id', tournamentId);
      const { data: deadlineRow } = await dlQuery.maybeSingle();
      if (deadlineRow?.deadline_at) {
        setWindowDeadline(new Date(deadlineRow.deadline_at));
      }
      const activeMatchdayId = deadlineRow?.matchday_id ?? null;

      const { data: jokerRec } = await supabase.from('daily_jokers').select('player_id')
        .eq('user_id', userId).eq('joker_date', today).maybeSingle();
      let jokerP = null;
      if (jokerRec?.player_id) {
        const { data: jp } = await supabase.from('players').select('*').eq('id', jokerRec.player_id).single();
        if (jp) jokerP = { ...jp, isJoker: true };
      }
      setJokerPlayer(jokerP);
      setTodayJokerId(jokerRec?.player_id || null);

      // Most-recent squad first â€” ensures we get the live matchday squad, not an older one
      // U11: filter squad by active matchday when known; fall back to newest row otherwise
      let squadQuery = supabase.from('squads').select('*').eq('user_id', userId);
      if (activeLeague)      squadQuery = squadQuery.eq('league_id', activeLeague);
      if (activeMatchdayId)  squadQuery = squadQuery.eq('matchday_id', activeMatchdayId);
      const { data: squad, error } = await squadQuery.order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error) {
        setFetchError('Could not load your squad. Tap Retry to try again.');
        setSquadData(EMPTY_SQUAD); setLoading(false); return;
      }
      if (!squad) { setSquadData(EMPTY_SQUAD); setLoading(false); return; }

      const playerIds = squad.players || [];

      // Build fixture query â€” handle missing matchday_id for some tournaments
      let fixturesQuery = supabase.from('fixtures').select('id').eq('status', 'finished');
      if (squad.matchday_id) {
        fixturesQuery = fixturesQuery.like('id', `${squad.matchday_id}%`);
      } else {
        // No matchday â€” return empty set so points calculation doesn't crash
        fixturesQuery = fixturesQuery.eq('id', 'null_no_matchday');
      }

      const [
        { data: players,   error: pErr },
        { data: intelData },
        { data: statsData },
        { data: fixtures  },
      ] = await Promise.all([
        supabase.from('players').select('*').in('id', playerIds),
        supabase.from('player_status').select('*').in('player_id', playerIds),
        // Points from all finished/live fixtures for this matchday
        supabase.from('player_match_stats')
          .select('player_id, fantasy_points, fixture_id')
          .in('player_id', playerIds),
        fixturesQuery,
      ]);
      if (pErr) throw pErr;

      // Sum fantasy_points across all finished fixtures for this matchday
      const finishedFixtureIds = new Set((fixtures || []).map(f => f.id));
      const pointsMap = {};
      for (const s of statsData || []) {
        if (finishedFixtureIds.has(s.fixture_id)) {
          pointsMap[s.player_id] = (pointsMap[s.player_id] || 0) + Number(s.fantasy_points);
        }
      }

      const starterIds    = new Set(playerIds.slice(0, 11));
      const mappedPlayers = (players || []).map((p) => {
        const playerIntel = intelData?.find(i => i.player_id === p.id);
        const isStarter   = starterIds.has(p.id);
        // normalisePlayer strips unknown keys â€” set isBench after the call
        const normalised  = normalisePlayer({
          ...p,
          points: pointsMap[p.id] ?? 0,
          intel:  normalizeIntelligence(playerIntel),
        });
        return { ...normalised, isBench: !isStarter };
      });

      // Enforce formation rules: 1 GK, 3-5 DEF, 2-4 MID, 1-2 FWD, total 11
      // If DB returned incorrect positions or counts, rebuild from scratch
      let pitchPlayers = mappedPlayers.filter(p => !p.isBench);
      let benchPlayers = mappedPlayers.filter(p => p.isBench);

      // Group by position
      const gks = pitchPlayers.filter(p => p.position === 'GK');

      // Enforce rules: must have exactly 1 GK
      if (gks.length > 1) {
        const extraGks = gks.slice(1);
        benchPlayers = [...benchPlayers, ...extraGks];
        pitchPlayers = pitchPlayers.filter(p => p.position !== 'GK' || gks.indexOf(p) === 0);
      } else if (gks.length === 0 && benchPlayers.length > 0) {
        // If somehow no GK on pitch, try to move one from bench
        const benchGk = benchPlayers.find(p => p.position === 'GK');
        if (benchGk) {
          benchPlayers = benchPlayers.filter(p => p.id !== benchGk.id);
          pitchPlayers = [...pitchPlayers, benchGk];
        }
      }

      // If pitch doesn't have exactly 11 players, reorder
      if (pitchPlayers.length > 11) {
        benchPlayers = [...benchPlayers, ...pitchPlayers.slice(11)];
        pitchPlayers = pitchPlayers.slice(0, 11);
      }

      setSquadData({
        squadId:         squad.id,
        leagueId:        squad.league_id,
        matchdayId:      squad.matchday_id,
        budget:          { current: Number(squad.budget_remaining ?? cfg.budgetTotal ?? 100), total: cfg.budgetTotal ?? 100 },
        captainId:       squad.captain_id || playerIds[0] || '',
        players:         pitchPlayers,
        bench:           benchPlayers,
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

  // Auto-fill hook â€” reusable across Squad, Market, League screens
  const { handleAutoFill, autoFilling, autoFillMsg } = useAutoFill(activeLeague, squadData, fetchSquad, takenMap, buy, cfg);

  // Live countdown hook — pass tournamentId so it finds the correct deadline row.
  const deadline = useDeadlineCountdown({ tournamentId });
  // Transfer window status for the sticky banner (open / upcoming / no_window).
  const transferWindow = useTransferWindow(activeLeague);

  // First-visit tour
  const { showSquadTour, completeSquadTour, replaySquadTour } = useOnboarding();

  const SQUAD_TOUR_STEPS = [
    {
      target: 'squad-pitch',
      title:  'Your Pitch',
      body:   'This is your starting XI laid out on a pitch. Tap any player to see options â€” swap positions, set captain, or activate your Daily Joker.',
    },
    {
      target: 'squad-budget',
      title:  'Budget & Deadline',
      body:   'Your remaining budget and the transfer window countdown live here. When the window closes, no more transfers until the next matchday.',
    },
    {
      target: 'squad-power-tools',
      title:  'Power Tools',
      body:   'Wildcard, Triple Captain, and Daily Joker live here. Each is one-use â€” activate carefully.',
    },
    {
      target: 'squad-chips',
      title:  'Chips & Boosts',
      body:   'Wildcard lets you make unlimited free transfers. Triple Captain scores 3Ã— points â€” or 0 if they don\'t play. Use them wisely, they\'re one-per-season.',
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
  }, [user?.id, activeLeague, leagues]);

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

  // â”€â”€ Actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handlePlayerClick = (player) => {
    if (player.isJokerSlot) { setIsJokerPickerOpen(true); return; }
    if (swapMode && selectedPlayer) { handleSwap(selectedPlayer, player); return; }
    setSelectedPlayer(prev => prev?.id === player.id ? null : player);
  };

  // â”€â”€ FB-022: formation validation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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


  const handleSwap = async (p1, p2) => {
    const isP1Bench = squadData.bench.some(b => b.id === p1.id);
    const isP2Bench = squadData.bench.some(b => b.id === p2.id);
    // Same zone — stay in swap mode, show hint toast
    if (isP1Bench === isP2Bench) {
      showToast(isP1Bench ? 'Tap a starter to bring them on' : 'Tap a bench player to substitute in', 'info');
      return;
    }

    try {
      setSaving(true);
      const pitchPlayer  = isP1Bench ? p2 : p1;
      const benchPlayer  = isP1Bench ? p1 : p2;
      const tempGrid     = pitchPlayer.gridClass;
      const newPlayers   = squadData.players.map(p =>
        p.id === pitchPlayer.id ? { ...benchPlayer, gridClass: tempGrid } : p
      );
      // Validate formation â€” only block if it's actually a formation violation
      const formationError = validateFormation(newPlayers);
      if (formationError) {
        showToast(formationError, 'warning');
        setSwapMode(false);
        setSelectedPlayer(null);
        return;
      }
      const newBench     = squadData.bench.map(b =>
        b.id === benchPlayer.id ? { ...pitchPlayer, gridClass: '' } : b
      );
      const captainBeingBenched = squadData.captainId === pitchPlayer.id;
      const newCaptainId = captainBeingBenched ? null : squadData.captainId;
      setSquadData({ ...squadData, players: newPlayers, bench: newBench, captainId: newCaptainId });
      setSelectedPlayer(null);
      setSwapMode(false);
      await supabase.from('squads').update({
        players:    [...newPlayers, ...newBench].map(p => p.id),
        captain_id: newCaptainId,
      }).eq('id', squadData.squadId);
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
    } catch (err) { console.error('Swap failed', err); }
    finally { setSaving(false); }
  };

  const setCaptain = async () => {
    try {
      if (!selectedPlayer) return;
      const isInStartingXI = squadData.players.some(p => p.id === selectedPlayer.id);
      if (!isInStartingXI) {
        showToast('Only players in your starting XI can be captain.', 'warning');
        return;
      }
      setSaving(true);
      setSquadData({ ...squadData, captainId: selectedPlayer.id });
      await supabase.from('squads').update({ captain_id: selectedPlayer.id }).eq('id', squadData.squadId);
    } finally { setSaving(false); setSelectedPlayer(null); }
  };

  const handleActivateJoker = async () => {
    if (!selectedPlayer || saving) return;
    try {
      setSaving(true);
      const userId = user?.id;
      const today  = new Date().toISOString().split('T')[0];
      const { error } = await supabase.from('daily_jokers').insert({ user_id: userId, player_id: selectedPlayer.id, joker_date: today });
      if (error) {
        if (error.code === '23505') showToast('You already used your daily Joker today!', 'warning');
        else throw error;
      } else { setTodayJokerId(selectedPlayer.id); setSelectedPlayer(null); }
    } catch (err) { console.error(err); showToast('Failed to set Joker: ' + err.message, 'error'); }
    finally { setSaving(false); }
  };

  // FB-021 + FB-023: confirm sell with captain/joker safety warnings
  const handleSellPlayer = () => {
    if (!selectedPlayer) return;
    const isCaptain = selectedPlayer.id === squadData.captainId;
    const isJoker   = selectedPlayer.id === todayJokerId;
    const warnings  = [];
    if (isCaptain) warnings.push('This player is your captain â€” selling them removes the armband.');
    if (isJoker)   warnings.push('This player is your Daily Joker â€” selling them voids today\'s boost.');

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

  // FB-023: chip toggle with confirmation (activating only â€” deactivating is safe)
  const toggleChip = (chipKey) => {
    const chip   = CHIPS.find(c => c.key === chipKey);
    const curVal = squadData[chip.stateKey];
    if (!curVal) {
      // Activating â€” show confirm first
      setConfirm({
        title:        `Use ${chip.label}?`,
        body:         chip.description,
        warning:      'This cannot be undone for this matchday.',
        confirmLabel: `Activate ${chip.label}`,
        danger:       false,
        onConfirm:    () => doToggleChip(chipKey),
      });
    } else {
      // Deactivating is safe â€” no confirm needed
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
      const userId = user?.id;
      const today  = new Date().toISOString().split('T')[0];
      const { error } = await supabase.from('daily_jokers').insert({ user_id: userId, player_id: player.id, joker_date: today });
      if (error) {
        if (error.code === '23505') showToast('You already have a Joker for today!', 'warning');
        else throw error;
      } else { setJokerPlayer(player); setTodayJokerId(player.id); setIsJokerPickerOpen(false); }
    } catch (err) { console.error(err); showToast('Failed to set Joker', 'error'); }
    finally { setSaving(false); }
  };

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
            onClick={() => { setActiveLeague(l.id); if (l.tournament_id) setTournamentId(l.tournament_id); }}
            className="w-full max-w-sm px-5 py-4 rounded-sm text-left transition-all active:opacity-70"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--paper)' }}
          >
            <div className="text-[14px] font-semibold">{l.name}</div>
          </button>
        ))}
      </div>
    );
  }

  // â”€â”€ Loading â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (loading || !squadData) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-center">
          <div className="fz-display text-[32px] text-cyan mb-2">MY SQUAD</div>
          <div className="fz-label text-text-tertiary animate-scan">Loading Tactical Sheetâ€¦</div>
        </div>
      </div>
    );
  }

  const { budget, players, bench, captainId, locked_at } = squadData;
  const isLocked        = deadline.isLocked;
  const allSquadPlayers = [...players, ...bench];
  const dangerPlayers   = getDangerZonePlayers(allSquadPlayers);
  const selectedIsBench = selectedPlayer && bench.some(b => b.id === selectedPlayer.id);
  const budgetLeft      = Number(budget.current.toFixed(1));
  const budgetLow       = budgetLeft < 5;

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // â”€â”€ Sub-components defined inside render for squad closure access â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  // Daily Joker card
  const JokerCard = () => (
    <div className="mx-4 mb-3 rounded p-4 border" style={{ borderColor: 'rgba(157,95,245,0.2)', background: 'rgba(157,95,245,0.04)' }}>
      <div className="flex-1 min-w-0">
          <div className="fk-display text-[12px] mb-1" style={{ color: 'var(--pos-gk)' }}>
            DAILY JOKER
          </div>
          <p className="text-[11px] leading-relaxed mb-3" style={{ color: 'var(--mute)', fontFamily: 'Archivo, sans-serif' }}>
            Pick a 16th man today â€” exempt from country limit rules. Choose any player currently playing. Locked once set.
          </p>
          {todayJokerId ? (
            <div className="fk-mono flex items-center gap-2 py-2 px-3" style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid var(--pos-gk)', color: 'var(--pos-gk)', fontSize: 9 }}>
              JOKER LOCKED FOR TODAY
            </div>
          ) : (
            <button
              onClick={() => setIsJokerPickerOpen(true)}
              className="w-full py-2 rounded text-[10px] font-black uppercase tracking-widest transition-all active:scale-95"
              style={{ background: 'rgba(157,95,245,0.12)', color: 'var(--pos-gk)', border: '1px solid rgba(157,95,245,0.3)' }}
            >
              Choose 16th Man
            </button>
          )}
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
            All clear â€” no injury alerts
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

  // Danger banner (mobile â€” slim strip above pitch)
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
        <button onClick={() => setDangerDismissed(true)} className="text-[16px] leading-none shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }}>Ã—</button>
      </div>
    );
  };

  const POS_CONFIG_COLORS = POS_BADGE_COLOR;

  const handlePickerBuy = async (player) => {
    if (!activeLeague) { showToast('No league selected â€” open your squad from the League screen.', 'warning'); return; }

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

  // Player list grouped by position â€” starters + bench unified, with START/BENCH badge
  const PlayerList = () => {
    const benchIds = new Set(bench.map(b => b.id));
    return (
      <div>
        {POS_ORDER.map(pos => {
          const posStarters = players.filter(p => p.position === pos);
          const posBench    = bench.filter(p => p.position === pos);
          const allPos      = [...posStarters, ...posBench];
          const limit       = POS_LIMITS[pos] ?? 0;
          const emptySlots  = Math.max(0, limit - allPos.length);
          const posColor    = POS_CONFIG_COLORS[pos] ?? 'var(--mute)';
          if (!allPos.length && !emptySlots) return null;
          return (
            <div key={pos}>
              <SectionHeader title={POS_LABEL[pos]} />
              {allPos.map(player => {
                const isBench = benchIds.has(player.id);
                const isListed = activeAuctions.some(a => a.player_id === player.id);
                const rowAction = (
                  <div className="flex flex-col items-end gap-1" onClick={e => e.stopPropagation()}>
                    <span
                      style={{
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: 7,
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                        padding: '2px 5px',
                        border: isBench ? '1px solid var(--rule)' : '1px solid rgba(0,180,216,0.3)',
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
                    {activeLeague && !isListed && (cfg.format === 'auction' || cfg.format === 'hybrid') && (
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
                          fontSize: 7,
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          padding: '2px 5px',
                          border: '1px solid rgba(240,180,0,0.3)',
                          color: 'var(--gold)',
                          background: 'rgba(240,180,0,0.06)',
                          flexShrink: 0,
                          cursor: 'pointer',
                          opacity: auctionBusy === player.id ? 0.5 : 1,
                        }}
                      >
                        {auctionBusy === player.id ? 'â€¦' : 'Auction'}
                      </button>
                    )}
                    {activeLeague && isListed && (cfg.format === 'auction' || cfg.format === 'hybrid') && (
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 7, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '2px 5px', border: '1px solid rgba(240,180,0,0.4)', color: 'var(--gold)', background: 'rgba(240,180,0,0.1)', flexShrink: 0 }}>
                        On auction
                      </span>
                    )}
                  </div>
                );
                return (
                  <PlayerCard
                    key={player.id}
                    player={player}
                    variant="row"
                    isCaptain={player.id === captainId}
                    isTripleCaptain={squadData.isTripleCaptain}
                    isJoker={player.id === todayJokerId}
                    onClick={handlePlayerClick}
                    isSelected={selectedPlayer?.id === player.id}
                    isSwapTarget={swapMode && selectedPlayer?.id !== player.id}
                    showIntelligence
                    action={rowAction}
                  />
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

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // â”€â”€ RENDER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <div className="min-h-screen bg-bg overflow-x-hidden">

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
            <span aria-hidden="true">Ã—</span>
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
        className="sticky top-0 z-40 flex items-center justify-between px-5 py-3"
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
          <div className="flex items-center gap-2">
            <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 34, color: 'var(--paper)', lineHeight: 1.05, letterSpacing: '-0.01em' }}>
              My Squad
            </div>
            <button
              onClick={replaySquadTour}
              title="Replay squad tour"
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

        {/* Right: KPI cluster â€” Transfers Â· Squad Â· Budget */}
        <div className="flex items-center gap-5">
          {!deadline.loading && (
            <div className="text-right">
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', letterSpacing: '.14em', textTransform: 'uppercase' }}>Transfers</div>
              <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 14, color: deadline.color, letterSpacing: '-0.01em' }}>
                {deadline.isLocked ? 'CLOSED' : deadline.timeLeft}
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
              Â£{budgetLeft}M
            </div>
          </div>
        </div>
      </div>

      {/* â•â• MOBILE LAYOUT â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <div className="lg:hidden">

        {/* Tab strip â€” 4 tabs matching desktop */}
        <div className="flex" style={{ borderBottom: '1px solid var(--rule)', background: 'var(--ink-2)' }}>
          {[
            { id: 'pitch',  label: 'âš½ PITCH'  },
            { id: 'squad',  label: 'ðŸ“‹ LIST'   },
            { id: 'chips',  label: 'âš¡ CHIPS'  },
            { id: 'status', label: 'âš ï¸ STATUS' },
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

        {/* â”€â”€ PITCH TAB â€” starting XI + bench strip for sub management â”€â”€ */}
        {mobileTab === 'pitch' && (() => {
          const captain = allSquadPlayers.find(p => p.id === captainId);
          const def = players.filter(p => p.position === 'DEF').length;
          const mid = players.filter(p => p.position === 'MID').length;
          const fwd = players.filter(p => p.position === 'FWD').length;
          const formation = [def, mid, fwd].filter(n => n > 0).join('-') || 'â€”';
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
                  <div>
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 4 }}>Starting XI</div>
                    <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 28, color: 'var(--paper)', lineHeight: 1, letterSpacing: '-0.01em' }}>{formation || 'NO SQUAD'}</div>
                  </div>
                  <button
                    onClick={handleAutoFill}
                    disabled={autoFilling}
                    style={{ marginTop: 4, padding: '6px 10px', background: 'rgba(0,196,232,0.08)', border: '1px solid rgba(0,196,232,0.25)', color: autoFilling ? 'var(--mute)' : 'var(--cyan)', fontFamily: 'Archivo Black, sans-serif', fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: autoFilling ? 'wait' : 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}
                  >
                    {autoFilling ? 'FILLINGâ€¦' : 'âš¡ QUICK FILL'}
                  </button>
                </div>
                {autoFillMsg && (
                  <div style={{ marginTop: 6, fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--positive)' }}>{autoFillMsg}</div>
                )}
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', letterSpacing: '0.14em', marginTop: 6 }}>
                  {captain ? `CAPTAIN ${captain.name.split(' ').slice(-1)[0].toUpperCase()}` : 'NO CAPTAIN'}
                  {squadData.matchdayId ? ` Â· GW ${squadData.matchdayId}` : ''}
                </div>
              </div>

              {/* Starting XI â€” grouped by position */}
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
                          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 14, color: 'var(--paper)', letterSpacing: '-0.01em', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{surname}</span>
                            {player.id === captainId && (
                              <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--gold)', color: '#0A0A0A', fontFamily: 'Archivo Black, sans-serif', fontSize: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>C</div>
                            )}
                            {isSwapTarget && (
                              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 7, color: 'var(--cyan)', border: '1px solid rgba(0,180,216,0.4)', padding: '1px 4px', flexShrink: 0, letterSpacing: '0.1em' }}>SWAP</span>
                            )}
                          </div>
                          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', flexShrink: 0, minWidth: 28, textAlign: 'right' }}>{(player.club ?? '').substring(0, 3).toUpperCase()}</div>
                          <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 16, color: 'var(--paper)', letterSpacing: '-0.02em', flexShrink: 0, minWidth: 24, textAlign: 'right' }}>{player.points ?? 0}</div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}

              {/* Bench strip â€” always visible so sub-in/out can be completed */}
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
                    const isSelected = selectedPlayer?.id === player.id;
                    const isSwapTarget = swapMode && !isSelected;
                    return (
                      <button
                        key={player.id}
                        onClick={() => handlePlayerClick(player)}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                          padding: '9px 16px',
                          background: isSelected ? 'rgba(0,180,216,0.07)' : isSwapTarget ? 'rgba(0,180,216,0.03)' : 'rgba(255,255,255,0.015)',
                          borderBottom: '1px solid var(--rule)',
                          borderLeft: isSelected ? '2px solid var(--cyan)' : isSwapTarget ? '2px solid rgba(0,180,216,0.3)' : '2px solid transparent',
                          opacity: isSwapTarget ? 1 : 0.7,
                          cursor: 'pointer', textAlign: 'left',
                        }}
                      >
                        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mute)', width: 28, flexShrink: 0, textAlign: 'right' }}>S{bi + 1}</div>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor(player), flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 14, color: 'var(--paper)', letterSpacing: '-0.01em', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{surname}</span>
                          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 7, color: posColor, border: `1px solid ${posColor}50`, padding: '1px 4px', flexShrink: 0, letterSpacing: '0.1em' }}>{player.position}</span>
                          {isSwapTarget && (
                            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 7, color: 'var(--cyan)', border: '1px solid rgba(0,180,216,0.4)', padding: '1px 4px', flexShrink: 0, letterSpacing: '0.1em' }}>SWAP</span>
                          )}
                        </div>
                        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', flexShrink: 0, minWidth: 28, textAlign: 'right' }}>{(player.club ?? '').substring(0, 3).toUpperCase()}</div>
                        <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 16, color: 'var(--paper)', letterSpacing: '-0.02em', flexShrink: 0, minWidth: 24, textAlign: 'right' }}>{player.points ?? 0}</div>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          );
        })()}

        {/* â”€â”€ LIST TAB â€” full squad with empty slots + SIGN buttons â”€â”€â”€ */}
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
                    {autoFilling ? 'FILLINGâ€¦' : 'âš¡ FILL'}
                  </button>
                </div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', letterSpacing: '0.14em', marginTop: 6 }}>
                  {totalSigned}/{squadSize} SIGNED{emptySlots > 0 ? ` Â· ${emptySlots} EMPTY SLOT${emptySlots !== 1 ? 'S' : ''}` : ''}
                </div>
              </div>
              {autoFillMsg && (
                <div style={{ padding: '6px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--positive)', borderBottom: '1px solid var(--rule)' }}>{autoFillMsg}</div>
              )}
              {/* Starters + bench grouped by position */}
              {['GK', 'DEF', 'MID', 'FWD'].map(pos => {
                const limit       = POS_LIMITS[pos] ?? 0;
                const posStarters = players.filter(p => p.position === pos);
                const posBench    = bench.filter(p => p.position === pos);
                const allPos      = [...posStarters, ...posBench];
                const emptyCount  = Math.max(0, limit - allPos.length);
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
                      return (
                        <button
                          key={player.id}
                          onClick={() => handlePlayerClick(player)}
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
                            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8, color: 'var(--mute)', letterSpacing: '0.12em', marginTop: 1 }}>{(player.club ?? '').substring(0, 3).toUpperCase()} Â· Â£{player.price}M</div>
                          </div>
                          {/* Points */}
                          <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 16, color: 'var(--paper)', letterSpacing: '-0.02em', flexShrink: 0 }}>{player.points ?? 0}</div>
                        </button>
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

        {/* â”€â”€ CHIPS TAB â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {mobileTab === 'chips' && (
          <div className="pb-24 pt-2">
            {CHIPS.map(chip => <ChipCard key={chip.key} chip={chip} />)}
            <JokerCard />
          </div>
        )}

        {/* â”€â”€ STATUS TAB â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {mobileTab === 'status' && (
          <div className="pb-24">
            <SectionHeader title="Player Status" accent="gold" />
            <DangerList />
          </div>
        )}

        {/* â”€â”€ TOOLS TAB (legacy fallback â€” now unused) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {mobileTab === 'tools' && (
          <div className="pb-6">

            {/* Section 1: Active Features Summary */}
            {(squadData.isWildcard || squadData.isTripleCaptain || jokerPlayer) && (
              <div className="mx-4 mt-4 mb-4 pb-3 border-b border-white/5">
                <div className="text-[9px] font-black uppercase tracking-[0.1em]" style={{ color: 'var(--mute)', marginBottom: '8px' }}>
                  Active Features
                </div>
                <div className="flex flex-wrap gap-2">
                  {squadData.isWildcard && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded" style={{ background: 'rgba(24,201,107,0.1)', border: '1px solid rgba(24,201,107,0.25)' }}>
                      
                      <span className="text-[8px] font-black uppercase tracking-widest" style={{ color: 'var(--positive)' }}>Wildcard</span>
                    </div>
                  )}
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
                {/* Wildcard */}
                <PowerToolCard
                  
                  label="Wildcard"
                  description="Unlimited free transfers this matchday"
                  isActive={squadData.isWildcard}
                  accentColor="var(--positive)"
                  bgColor="rgba(24,201,107,0.08)"
                  borderColor="rgba(24,201,107,0.15)"
                  actionLabel={squadData.isWildcard ? 'Active' : 'Activate'}
                  onAction={() => {
                    if (!isLocked) {
                      setConfirm({
                        title: squadData.isWildcard ? 'Deactivate Wildcard?' : 'Activate Wildcard?',
                        body: squadData.isWildcard
                          ? 'You will no longer have unlimited free transfers.'
                          : 'You\'ll have unlimited free transfers this matchday. 1 use per season.',
                        onConfirm: () => doToggleChip('wildcard'),
                        confirmLabel: 'Confirm',
                        warning: squadData.isWildcard ? null : 'This action cannot be undone this gameweek.',
                      });
                    }
                  }}
                />

                {/* Triple Captain */}
                <PowerToolCard
                  
                  label="Triple Cap."
                  description="3Ã— captain points â€” or 0 if they don't play"
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
                          : 'Your captain will earn 3Ã— points this matchday. 1 use per season.',
                        onConfirm: () => doToggleChip('triple'),
                        confirmLabel: 'Confirm',
                        warning: squadData.isTripleCaptain ? null : 'This action cannot be undone this gameweek.',
                      });
                    }
                  }}
                />

              </div>
            </div>

            {/* Section 3: Daily Joker */}
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
                  Daily Joker â€“ Your 16th Man
                </div>
                <div style={{
                  fontSize: '10px',
                  color: 'rgba(240,242,245,0.6)',
                  textAlign: 'center',
                  marginBottom: '8px',
                  lineHeight: 1.4,
                  fontFamily: 'Archivo, sans-serif',
                }}>
                  Pick one extra player outside your 15. Exempt from country limits.
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
                  {jokerPlayer ? `âœ“ Set: ${jokerPlayer.name}` : 'Pick Joker'}
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

        {/* â”€â”€ Sub-tab row: Pitch / List / Chips / Status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="flex shrink-0" style={{ borderBottom: '1px solid var(--rule)', background: 'var(--ink-2)' }}>
          {[
            { id: 'pitch',  label: 'Pitch'  },
            { id: 'list',   label: 'List'   },
            { id: 'chips',  label: 'Chips'  },
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

        {/* â”€â”€ Tab content â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="flex-1 overflow-hidden flex">

          {/* â”€â”€ PITCH TAB â€” XI on pitch + bench strip below â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {desktopTab === 'pitch' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Pitch â€” flex:1 to fill most of the height */}
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <PitchView
                  variant="desktop"
                  squad={{ players, captainId, isTripleCaptain: squadData.isTripleCaptain, joker: jokerPlayer }}
                  onPlayerClick={handlePlayerClick}
                  selectedPlayerId={selectedPlayer?.id}
                  swapMode={swapMode}
                  jokerPlayerId={todayJokerId}
                  matchdayLabel={squadData.matchdayId ? `GW Â· ${squadData.matchdayId}` : ''}
                />
              </div>
              {/* Bench strip â€” single row of HybridToken-style pills */}
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
                            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8, color: 'var(--mute)', letterSpacing: '0.1em' }}>{player.club} Â· {player.points ?? 0} PTS</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* â”€â”€ LIST TAB â€” player list + bench panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {desktopTab === 'list' && (
            <>
              <div className="flex-1 min-w-0 overflow-y-auto">
                <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--rule)' }}>
                  <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 14, color: 'var(--paper)', letterSpacing: '0.02em' }}>Squad List</div>
                  <button
                    onClick={handleAutoFill}
                    disabled={autoFilling}
                    style={{ padding: '8px 12px', background: 'rgba(0,196,232,0.08)', border: '1px solid rgba(0,196,232,0.25)', color: autoFilling ? 'var(--mute)' : 'var(--cyan)', fontFamily: 'Archivo Black, sans-serif', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', borderRadius: 2, cursor: autoFilling ? 'wait' : 'pointer', flexShrink: 0 }}
                  >
                    {autoFilling ? 'FILLINGâ€¦' : 'âš¡ QUICK FILL'}
                  </button>
                </div>
                {autoFillMsg && (
                  <div style={{ padding: '6px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--positive)', borderBottom: '1px solid var(--rule)' }}>{autoFillMsg}</div>
                )}
                <SectionHeader title="Daily Joker" accent="purple" />
                {jokerPlayer ? (
                  <PlayerCard
                    player={jokerPlayer}
                    variant="row"
                    isJoker={true}
                    onClick={handlePlayerClick}
                    isSelected={selectedPlayer?.id === jokerPlayer.id}
                    showIntelligence
                  />
                ) : (
                  <button
                    onClick={() => setIsJokerPickerOpen(true)}
                    className="w-full flex items-center gap-3 px-4 py-3 border-b border-border hover:opacity-80 transition-all"
                  >
                    <div className="w-8 h-8 border-2 border-dashed flex items-center justify-center font-black" style={{ borderColor: 'var(--pos-gk)', color: 'var(--pos-gk)' }}>+</div>
                    <div className="flex-1 text-left">
                      <div className="text-[12px] font-black uppercase tracking-widest" style={{ color: 'var(--pos-gk)', fontFamily: 'Archivo Black, sans-serif' }}>Select 16th Man</div>
                      <div className="text-[10px] mt-0.5" style={{ color: 'var(--mute)' }}>Exempt from country limit rules today</div>
                    </div>
                  </button>
                )}
                <PlayerList />
              </div>
            </>
          )}

          {/* â”€â”€ CHIPS TAB â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {desktopTab === 'chips' && (
            <div className="flex-1 overflow-y-auto pt-2 max-w-xl" data-tour="squad-chips">
              {CHIPS.map(chip => <ChipCard key={chip.key} chip={chip} />)}
              <JokerCard />
            </div>
          )}

          {/* â”€â”€ STATUS TAB â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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
                        <div className="text-[10px] mt-0.5" style={{ color: 'var(--mute)' }}>{cap.position} Â· {cap.club} Â· Â£{cap.price}M</div>
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
      {selectedPlayer && !swapMode && (
        <>
          {/* Tap-outside dismiss â€” no background dim */}
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
                {/* Position badge â€” matches player list row style */}
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
                  <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 18, color: 'var(--paper)', lineHeight: 1.1 }}>
                    {selectedPlayer.name}
                  </div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mute)', letterSpacing: '0.14em', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {selectedPlayer.club} Â· Â£{selectedPlayer.price}M
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
              >Ã—</button>
            </div>
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
            {/* Daily Joker section */}
            <div className="pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
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
                    1 Joker per day Â· Country limit exempt Â· Locked once set
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
        </>
      )}

      {/* â•â• PLAYER PICKER SHEET â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
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
      {isJokerPickerOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={() => setIsJokerPickerOpen(false)} />
          <div className="w-full max-w-lg bg-surface border border-purple/30 rounded-sm shadow-[0_0_50px_rgba(168,85,247,0.2)] overflow-hidden flex flex-col max-h-[80vh] relative z-10">
            <div className="px-5 py-4 border-b border-border flex justify-between items-center bg-purple/5">
              <div>
                <div className="fz-label text-purple">Daily Joker Selection</div>
                <div className="fz-display text-lg text-white">CHOOSE YOUR 16TH MAN</div>
              </div>
              <button onClick={() => setIsJokerPickerOpen(false)} className="text-text-tertiary hover:text-white text-2xl">Ã—</button>
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
              Independent of your 15-man squad Â· Ignores country limits
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// â”€â”€ Supporting UI: Joker picker list (FB-024: proper empty/error states) â”€â”€â”€â”€â”€
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
    <EmptyState title="Scouting Active Teamsâ€¦" sub={null} action={
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
    <EmptyState title="No Matches Today" sub="The Daily Joker is only available on matchdays. Check back when fixtures are scheduled." action={null} />
  );

  // FB-024: none of your squad plays today
  const playingSquadPlayers = players.filter(p => squadPlayerIds?.includes(p.id));
  const otherPlayers        = players.filter(p => !squadPlayerIds?.includes(p.id));
  const noSquadOverlap      = squadPlayerIds?.length && !playingSquadPlayers.length;

  if (!players.length) return (
    <EmptyState emoji="ðŸŸï¸" title="None of your players are in today's matches" sub="You can still pick any player from the active squads below as your Joker." action={null} />
  );

  const PlayerRow = ({ p, highlight }) => (
    <button
      key={p.id}
      onClick={() => onSelect(p)}
      disabled={saving}
      className="w-full flex items-center gap-3 p-3 bg-bg border border-border hover:border-purple/50 rounded-sm transition-all group"
      style={highlight ? { borderColor: 'rgba(157,95,245,0.35)', background: 'rgba(157,95,245,0.05)' } : {}}
    >
      <div className="w-10 h-10 rounded-full border border-border flex items-center justify-center font-bold text-[10px] text-white bg-surface shrink-0 group-hover:border-purple/30">
        {p.club.substring(0, 3)}
      </div>
      <div className="flex-1 text-left min-w-0">
        <div className="text-[13px] font-bold text-white group-hover:text-purple transition-colors truncate">{p.name}</div>
        <div className="text-[9px] text-text-tertiary uppercase tracking-tighter">
          {p.position} Â· {p.club}
          {highlight && <span style={{ color: 'var(--pos-gk)', marginLeft: '6px' }}>Â· Your squad</span>}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-[13px] font-black text-cyan tabular-nums">${p.price}M</div>
        <div className="text-[8px] text-positive font-bold uppercase tracking-widest">Pick</div>
      </div>
    </button>
  );

  const SectionLabel = ({ label }) => (
    <div className="flex items-center gap-2 px-1 py-2">
      <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.07)' }} />
      <span style={{ fontSize: '9px', fontFamily: 'Archivo Black, sans-serif', fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--mute)' }}>{label}</span>
      <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.07)' }} />
    </div>
  );

  return (
    <div className="space-y-1">
      {/* Squad players playing today shown first */}
      {playingSquadPlayers.length > 0 && (
        <>
          <SectionLabel label="Your squad â€” playing today" />
          {playingSquadPlayers.map(p => <PlayerRow key={p.id} p={p} highlight />)}
          {otherPlayers.length > 0 && <SectionLabel label="All active players" />}
        </>
      )}
      {noSquadOverlap && <SectionLabel label="None of your squad plays today â€” pick any Joker" />}
      {otherPlayers.map(p => <PlayerRow key={p.id} p={p} highlight={false} />)}
    </div>
  );
}
