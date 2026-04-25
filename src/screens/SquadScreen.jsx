import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { squad as fallbackSquad } from '../data/squad';
import { getDangerZonePlayers, normalizeIntelligence, LINEUP_STATUS } from '../lib/intelligence';
import { normalisePlayer } from '../lib/players';
import { useAuth } from '../hooks/useAuth';
import { useDeadlineCountdown } from '../hooks/useDeadlineCountdown';
import { useOnboarding } from '../hooks/useOnboarding';
import { useTransfer } from '../hooks/useTransfer';
import LeagueSelector from '../components/LeagueSelector';
import OnboardingTour from '../components/OnboardingTour';
import ConfirmModal from '../components/ConfirmModal';
import PitchView from '../components/PitchView';
import PlayerCard from '../components/PlayerCard';
import PlayerPickerSheet from '../components/PlayerPickerSheet';
import SectionHeader from '../components/SectionHeader';
import PowerToolCard from '../components/PowerToolCard';

// ── Position order ────────────────────────────────────────────────────────────
const POS_ORDER = ['GK', 'DEF', 'MID', 'FWD'];
const POS_LABEL = { GK: 'Goalkeeper', DEF: 'Defenders', MID: 'Midfielders', FWD: 'Forwards' };

// ── Chip config ───────────────────────────────────────────────────────────────
const CHIPS = [
  {
    key:         'wildcard',
    icon:        '🃏',
    label:       'Wildcard',
    description: 'Make unlimited free transfers this matchday. No point penalties.',
    stateKey:    'isWildcard',
    dbField:     'is_wildcard',
    activeColor: '#18C96B',
    activeStyle: { borderColor: 'rgba(24,201,107,0.35)', background: 'rgba(24,201,107,0.07)' },
    inactiveStyle: { borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' },
  },
  {
    key:         'triple',
    icon:        '🚀',
    label:       'Triple Captain',
    description: 'All-or-Nothing: your captain scores 3× points — but 0 if they don\'t play.',
    stateKey:    'isTripleCaptain',
    dbField:     'is_triple_captain',
    activeColor: '#F0B400',
    activeStyle: { borderColor: 'rgba(240,180,0,0.35)', background: 'rgba(240,180,0,0.07)' },
    inactiveStyle: { borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
const POS_LIMITS = { GK: 2, DEF: 5, MID: 5, FWD: 3 };

export default function SquadScreen() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [leagueId, setLeagueId] = useState(searchParams.get('leagueId'));
  const [jokerPlayer,        setJokerPlayer]       = useState(null);
  const [isJokerPickerOpen,  setIsJokerPickerOpen] = useState(false);
  const [isRouletteSpinning, setIsRouletteSpinning] = useState(false);
  const [squadData,          setSquadData]         = useState(null);
  const [loading,            setLoading]           = useState(true);
  const [todayJokerId,       setTodayJokerId]      = useState(null);
  const [playingTodayTeams,  setPlayingTodayTeams] = useState([]);
  const [selectedPlayer,     setSelectedPlayer]    = useState(null);
  const [swapMode,           setSwapMode]          = useState(false);
  const [saving,             setSaving]            = useState(false);
  // Mobile tab: 'pitch' | 'squad' | 'tools'
  const [mobileTab,          setMobileTab]         = useState('pitch');
  // Desktop right-pane tab: 'bench' | 'chips' | 'status'
  const [desktopTab,         setDesktopTab]        = useState('bench');
  // Danger banner dismissed on mobile
  const [dangerDismissed,    setDangerDismissed]   = useState(false);
  // Transfer window lock (from matchday_deadlines table)
  const [isLocked,           setWindowLocked]      = useState(false);
  const [_windowDeadline,    setWindowDeadline]    = useState(null);
  // Confirmation dialog state (FB-023)
  const [confirm,            setConfirm]           = useState(null);
  const [pickerPos,          setPickerPos]         = useState(null);
  const [fetchError,         setFetchError]        = useState(null);

  // Transfer hook — league-scoped buy/sell + no-repeat enforcement
  const { buy, sell, takenMap, isOwnedBy } = useTransfer(leagueId);

  // Live countdown hook — replaces static window lock badge
  const deadline = useDeadlineCountdown();

  // First-visit tour
  const { showSquadTour, completeSquadTour } = useOnboarding();

  const SQUAD_TOUR_STEPS = [
    {
      target: 'squad-pitch',
      title:  'Your Pitch',
      body:   'This is your starting XI laid out on a pitch. Tap any player to see options — swap positions, set captain, or activate your Daily Joker.',
    },
    {
      target: 'squad-budget',
      title:  'Budget & Deadline',
      body:   'Your remaining budget and the transfer window countdown live here. When the window closes, no more transfers until the next matchday.',
    },
    {
      target: 'squad-power-tools',
      title:  'Power Tools',
      body:   'Wildcard, Triple Captain, Roulette, and Daily Joker live here. Each is one-use — activate carefully.',
    },
    {
      target: 'squad-chips',
      title:  'Chips & Boosts',
      body:   'Wildcard lets you make unlimited free transfers. Triple Captain scores 3× points — or 0 if they don\'t play. Use them wisely, they\'re one-per-season.',
    },
  ];

  // Sync live countdown → windowLocked so chip/joker guards stay up to date
  useEffect(() => { if (deadline.isLocked) setWindowLocked(true); }, [deadline.isLocked]);

  useEffect(() => { fetchSquad(); fetchDailyStatus(); }, [user]);

  // ── Data Fetching ─────────────────────────────────────────────────────────
  const fetchDailyStatus = async () => {
    try {
      const userId = user?.id;
      const today  = new Date().toISOString().split('T')[0];
      const { data: joker } = await supabase.from('daily_jokers').select('player_id')
        .eq('user_id', userId).eq('match_date', today).maybeSingle();
      if (joker) setTodayJokerId(joker.player_id);
      const { data: fixtures } = await supabase.from('fixtures').select('home_team, away_team');
      const teams = new Set();
      fixtures?.forEach(f => { teams.add(f.home_team); teams.add(f.away_team); });
      setPlayingTodayTeams(Array.from(teams));
    } catch (err) { console.error('Daily status error', err); }
  };

  const fetchSquad = async () => {
    try {
      setLoading(true);
      const userId = user?.id;
      const today  = new Date().toISOString().split('T')[0];

      // ── Transfer window lock check — use latest matchday deadline ──────────
      const { data: deadlineRow } = await supabase
        .from('matchday_deadlines').select('deadline_at').order('deadline_at', { ascending: false }).limit(1).maybeSingle();
      if (deadlineRow?.deadline_at) {
        const deadline = new Date(deadlineRow.deadline_at);
        setWindowDeadline(deadline);
        setWindowLocked(new Date() >= deadline);
      }

      const { data: jokerRec } = await supabase.from('daily_jokers').select('player_id')
        .eq('user_id', userId).eq('match_date', today).maybeSingle();
      let jokerP = null;
      if (jokerRec?.player_id) {
        const { data: jp } = await supabase.from('players').select('*').eq('id', jokerRec.player_id).single();
        if (jp) jokerP = { ...jp, isJoker: true };
      }
      setJokerPlayer(jokerP);
      setTodayJokerId(jokerRec?.player_id || null);

      // Most-recent squad first — ensures we get the live matchday squad, not an older one
      const squadQuery = supabase.from('squads').select('*').eq('user_id', userId);
      if (leagueId) squadQuery.eq('league_id', leagueId);
      const { data: squad, error } = await squadQuery.order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error || !squad) { setSquadData(fallbackSquad); setLoading(false); return; }

      const playerIds = squad.players || [];
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
        supabase.from('fixtures').select('id').eq('status', 'finished').like('id', `${squad.matchday_id}%`),
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

      const mappedPlayers = (players || []).map((p, idx) => {
        const playerIntel = intelData?.find(i => i.player_id === p.id);
        const isStarter   = idx < 11;
        return normalisePlayer({
          ...p,
          points:    pointsMap[p.id] ?? 0,
          intel:     normalizeIntelligence(playerIntel),
          isBench:   !isStarter,
        });
      });

      const pitchPlayers = mappedPlayers.filter(p => !p.isBench);
      const benchPlayers = mappedPlayers.filter(p => p.isBench);

      setSquadData({
        squadId:         squad.id,
        leagueId:        squad.league_id,
        matchdayId:      squad.matchday_id,
        budget:          { current: Number(squad.budget_remaining ?? 17), total: 100 },
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
      setSquadData(fallbackSquad);
    } finally {
      setLoading(false);
    }
  };

  // ── Actions ───────────────────────────────────────────────────────────────
  const handlePlayerClick = (player) => {
    if (player.isJokerSlot) { setIsJokerPickerOpen(true); return; }
    if (swapMode && selectedPlayer) { handleSwap(selectedPlayer, player); return; }
    setSelectedPlayer(prev => prev?.id === player.id ? null : player);
  };

  // ── FB-022: formation validation ─────────────────────────────────────────
  const MIN_FORMATION = { GK: 1, DEF: 3, MID: 2, FWD: 1 };
  const validateFormation = (pitchPlayers) => {
    const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    pitchPlayers.forEach(p => { if (counts[p.position] !== undefined) counts[p.position]++; });
    for (const [pos, min] of Object.entries(MIN_FORMATION)) {
      if (counts[pos] < min) return `This swap leaves you with only ${counts[pos]} ${pos} on the pitch (minimum ${min}).`;
    }
    return null;
  };

  const handleSwap = async (p1, p2) => {
    try {
      setSaving(true);
      const isP1Bench = squadData.bench.some(b => b.id === p1.id);
      const isP2Bench = squadData.bench.some(b => b.id === p2.id);
      if (isP1Bench === isP2Bench) {
        alert('Can only swap between pitch and bench.');
        return;
      }
      const pitchPlayer  = isP1Bench ? p2 : p1;
      const benchPlayer  = isP1Bench ? p1 : p2;
      const tempGrid     = pitchPlayer.gridClass;
      const newPlayers   = squadData.players.map(p =>
        p.id === pitchPlayer.id ? { ...benchPlayer, gridClass: tempGrid } : p
      );
      // FB-022: validate formation before committing
      const formationError = validateFormation(newPlayers);
      if (formationError) {
        alert(formationError);
        return;
      }
      const newBench     = squadData.bench.map(b =>
        b.id === benchPlayer.id ? { ...pitchPlayer, gridClass: '' } : b
      );
      const newCaptainId = squadData.captainId === pitchPlayer.id ? benchPlayer.id : squadData.captainId;
      setSquadData({ ...squadData, players: newPlayers, bench: newBench, captainId: newCaptainId });
      await supabase.from('squads').update({
        players:    [...newPlayers, ...newBench].map(p => p.id),
        captain_id: newCaptainId,
      }).eq('id', squadData.squadId);
    } catch (err) { console.error('Swap failed', err); }
    finally { setSelectedPlayer(null); setSwapMode(false); setSaving(false); }
  };

  const setCaptain = async () => {
    try {
      setSaving(true);
      setSquadData({ ...squadData, captainId: selectedPlayer.id });
      await supabase.from('squads').update({ captain_id: selectedPlayer.id }).eq('id', squadData.squadId);
    } finally { setSaving(false); setSelectedPlayer(null); }
  };

  const handleActivateJoker = async () => {
    if (!selectedPlayer) return;
    try {
      setSaving(true);
      const userId = user?.id;
      const today  = new Date().toISOString().split('T')[0];
      const { error } = await supabase.from('daily_jokers').insert({ user_id: userId, player_id: selectedPlayer.id, match_date: today });
      if (error) {
        if (error.code === '23505') alert('You already used your daily Joker today!');
        else throw error;
      } else { setTodayJokerId(selectedPlayer.id); setSelectedPlayer(null); }
    } catch (err) { console.error(err); alert('Failed to set Joker: ' + err.message); }
    finally { setSaving(false); }
  };

  // FB-021 + FB-023: confirm sell with captain/joker safety warnings
  const handleSellPlayer = () => {
    if (!selectedPlayer) return;
    const isCaptain = selectedPlayer.id === squadData.captainId;
    const isJoker   = selectedPlayer.id === todayJokerId;
    const warnings  = [];
    if (isCaptain) warnings.push('This player is your captain — selling them removes the armband.');
    if (isJoker)   warnings.push('This player is your Daily Joker — selling them voids today\'s boost.');

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
      if (!result.ok) { alert(result.error); return; }
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
        confirmLabel: `Activate ${chip.label}`,
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

  const handleChipToggle = async (type) => {
    if (!squadData) return;
    const chip = CHIPS.find(c => c.key === type);
    if (!chip) return;
    const newVal = !squadData[chip.stateKey];
    setSquadData(prev => ({ ...prev, [chip.stateKey]: newVal }));
    try {
      setSaving(true);
      await supabase.from('squads').update({ [chip.dbField]: newVal }).eq('id', squadData.squadId);
    } finally { setSaving(false); }
  };

  // FB-023: roulette with confirmation
  const activateRoulette = () => {
    if (isRouletteSpinning || !squadData) return;
    setConfirm({
      title:        'Spin Captain Roulette?',
      body:         'Your captain will be randomly selected from your entire squad. The result is final for this matchday.',
      warning:      null,
      confirmLabel: '🎰 Spin',
      danger:       false,
      onConfirm:    doActivateRoulette,
    });
  };

  const handleRouletteStart = activateRoulette;

  const doActivateRoulette = () => {
    setIsRouletteSpinning(true);
    const all = [...squadData.players, ...squadData.bench];
    let idx = 0;
    const interval = setInterval(() => { setSelectedPlayer(all[idx++ % all.length]); }, 80);
    setTimeout(() => {
      clearInterval(interval);
      const winner = all[Math.floor(Math.random() * all.length)];
      setSelectedPlayer(winner);
      setTimeout(async () => {
        try {
          setSaving(true);
          setSquadData(prev => ({ ...prev, captainId: winner.id }));
          await supabase.from('squads').update({ captain_id: winner.id }).eq('id', squadData.squadId);
        } finally { setSaving(false); setIsRouletteSpinning(false); }
      }, 400);
    }, 2500);
  };

  const handleJokerSelection = async (player) => {
    try {
      setSaving(true);
      const userId = user?.id;
      const today  = new Date().toISOString().split('T')[0];
      const { error } = await supabase.from('daily_jokers').insert({ user_id: userId, player_id: player.id, match_date: today });
      if (error) {
        if (error.code === '23505') alert('You already have a Joker for today!');
        else throw error;
      } else { setJokerPlayer(player); setTodayJokerId(player.id); setIsJokerPickerOpen(false); }
    } catch (err) { console.error(err); alert('Failed to set Joker'); }
    finally { setSaving(false); }
  };

  // ── Loading ───────────────────────────────────────────────────────────────
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
  const isLocked        = deadline.isLocked;
  const allSquadPlayers = [...players, ...bench];
  const dangerPlayers   = getDangerZonePlayers(allSquadPlayers);
  const selectedIsBench = selectedPlayer && bench.some(b => b.id === selectedPlayer.id);
  const budgetLeft      = Number((budget.total - budget.current).toFixed(1));
  const budgetLow       = budgetLeft < 5;

  // ─────────────────────────────────────────────────────────────────────────
  // ── Sub-components defined inside render for squad closure access ─────────
  // ─────────────────────────────────────────────────────────────────────────

  // Chip card (full description, toggle button)
  const ChipCard = ({ chip }) => {
    const isActive = squadData[chip.stateKey];
    return (
      <div
        className="mx-4 mb-3 rounded p-4 border transition-all"
        style={isActive ? chip.activeStyle : chip.inactiveStyle}
      >
        <div className="flex items-start gap-3">
          <span className="text-2xl shrink-0 mt-0.5">{chip.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span
                className="text-[12px] font-black uppercase tracking-wide"
                style={{ fontFamily: 'Barlow Condensed, sans-serif', color: isActive ? chip.activeColor : '#F0F2F5' }}
              >
                {chip.label}
              </span>
              {isActive && (
                <span
                  className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
                  style={{ background: chip.activeColor + '22', color: chip.activeColor, border: `1px solid ${chip.activeColor}44` }}
                >
                  Active
                </span>
              )}
            </div>
            <p className="text-[11px] leading-relaxed mb-3" style={{ color: '#7D8A96' }}>
              {chip.description}
            </p>
            <button
              onClick={() => toggleChip(chip.key)}
              disabled={saving || !!locked_at}
              className="w-full py-2 rounded text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-40"
              style={isActive
                ? { background: chip.activeColor + '22', color: chip.activeColor, border: `1px solid ${chip.activeColor}44` }
                : { background: 'rgba(255,255,255,0.06)', color: '#F0F2F5', border: '1px solid rgba(255,255,255,0.12)' }
              }
            >
              {locked_at ? 'Squad Locked' : isActive ? 'Deactivate' : 'Activate Chip'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Captain Roulette card
  const RouletteCard = () => (
    <div className="mx-4 mb-3 rounded p-4 border" style={{ borderColor: 'rgba(240,180,0,0.2)', background: 'rgba(240,180,0,0.04)' }}>
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0 mt-0.5">🎰</span>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-black uppercase tracking-wide mb-1" style={{ fontFamily: 'Barlow Condensed, sans-serif', color: '#F0B400' }}>
            Captain Roulette
          </div>
          <p className="text-[11px] leading-relaxed mb-3" style={{ color: '#7D8A96' }}>
            Can't decide? Let fate choose your captain. Randomly picks from your full 15-man squad.
          </p>
          <button
            onClick={activateRoulette}
            disabled={isRouletteSpinning || saving || !!locked_at}
            className="w-full py-2 rounded text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-40"
            style={{
              background: isRouletteSpinning ? '#F0B400' : 'rgba(240,180,0,0.1)',
              color: isRouletteSpinning ? '#000' : '#F0B400',
              border: '1px solid rgba(240,180,0,0.3)',
            }}
          >
            {isRouletteSpinning ? '🎰 Spinning…' : 'Spin the Roulette'}
          </button>
        </div>
      </div>
    </div>
  );

  // Daily Joker card
  const JokerCard = () => (
    <div className="mx-4 mb-3 rounded p-4 border" style={{ borderColor: 'rgba(157,95,245,0.2)', background: 'rgba(157,95,245,0.04)' }}>
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0 mt-0.5">🃏</span>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-black uppercase tracking-wide mb-1" style={{ fontFamily: 'Barlow Condensed, sans-serif', color: '#9D5FF5' }}>
            Daily Joker
          </div>
          <p className="text-[11px] leading-relaxed mb-3" style={{ color: '#7D8A96' }}>
            Pick a 16th man today — exempt from country limit rules. Choose any player currently playing. Locked once set.
          </p>
          {todayJokerId ? (
            <div className="flex items-center gap-2 py-2 px-3 rounded" style={{ background: 'rgba(157,95,245,0.1)', border: '1px solid rgba(157,95,245,0.2)' }}>
              <span className="text-xs">🔒</span>
              <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#9D5FF5' }}>
                Joker locked for today
              </span>
            </div>
          ) : (
            <button
              onClick={() => setIsJokerPickerOpen(true)}
              className="w-full py-2 rounded text-[10px] font-black uppercase tracking-widest transition-all active:scale-95"
              style={{ background: 'rgba(157,95,245,0.12)', color: '#9D5FF5', border: '1px solid rgba(157,95,245,0.3)' }}
            >
              Choose 16th Man
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // Danger Zone vertical list (for sidebar / tools tab)
  const DangerList = () => {
    if (!dangerPlayers.length) {
      return (
        <div className="mx-4 my-3 flex items-center gap-2.5 p-3 rounded" style={{ background: 'rgba(24,201,107,0.06)', border: '1px solid rgba(24,201,107,0.15)' }}>
          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: '#18C96B' }} />
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
              <span className="text-base shrink-0">{cfg.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-semibold text-white truncate">{p.name}</div>
                <div className="text-[9px] font-black uppercase tracking-wider mt-0.5" style={{ color: cfg.color }}>
                  {cfg.label}
                </div>
              </div>
              <div className="text-[9px] shrink-0" style={{ color: '#7D8A96' }}>{p.intel?.confidence}%</div>
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
        <span className="text-sm shrink-0">⚠️</span>
        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          {outCount > 0 && (
            <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'rgba(240,58,58,0.2)', color: '#F03A3A' }}>
              {outCount} OUT
            </span>
          )}
          {doubtCount > 0 && (
            <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'rgba(240,180,0,0.15)', color: '#F0B400' }}>
              {doubtCount} DOUBTFUL
            </span>
          )}
          <span className="text-[10px] text-text-secondary truncate">
            {dangerPlayers.slice(0, 2).map(p => p.name.split(' ').pop()).join(', ')}
            {dangerPlayers.length > 2 ? ` +${dangerPlayers.length - 2}` : ''}
          </span>
        </div>
        <button onClick={() => { setDangerDismissed(true); setMobileTab('tools'); }} className="text-[9px] font-black uppercase tracking-widest shrink-0 px-2 py-1 rounded" style={{ color: '#F03A3A', background: 'rgba(240,58,58,0.12)' }}>
          View
        </button>
        <button onClick={() => setDangerDismissed(true)} className="text-[16px] leading-none shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }}>×</button>
      </div>
    );
  };

  const POS_CONFIG_COLORS = {
    GK:  '#F0B400', DEF: '#00C4E8', MID: '#9D5FF5', FWD: '#F03A3A',
  };

  const handlePickerBuy = async (player) => {
    if (!leagueId) { alert('No league selected — open your squad from the League screen.'); return; }
    const result = await buy(player);
    if (!result.ok) { alert(result.error); return; }
    setSquadData(prev => ({
      ...prev,
      players: [...prev.players, { ...player, isBench: false, gridClass: '' }],
      budget:  { ...prev.budget, current: result.budget_remaining },
    }));
    setPickerPos(null);
  };

  // Player list grouped by position (row variant)
  const PlayerList = ({ showBench = false }) => (
    <div>
      {POS_ORDER.map(pos => {
        const posPlayers  = players.filter(p => p.position === pos);
        const limit       = POS_LIMITS[pos] ?? 0;
        const emptySlots  = Math.max(0, limit - posPlayers.length);
        const posColor    = POS_CONFIG_COLORS[pos] ?? '#7D8A96';
        if (!posPlayers.length && !emptySlots) return null;
        return (
          <div key={pos}>
            <SectionHeader title={POS_LABEL[pos]} />
            {posPlayers.map(player => (
              <PlayerCard
                key={player.id}
                player={player}
                variant="row"
                isCaptain={player.id === captainId}
                isTripleCaptain={squadData.isTripleCaptain}
                isJoker={player.id === todayJokerId}
                onClick={isRouletteSpinning ? () => {} : handlePlayerClick}
                isSelected={selectedPlayer?.id === player.id}
                isSwapTarget={swapMode && selectedPlayer?.id !== player.id}
                showIntelligence
              />
            ))}
            {Array.from({ length: emptySlots }).map((_, i) => (
              <button
                key={`empty-${pos}-${i}`}
                onClick={() => leagueId && setPickerPos(pos)}
                className="w-full flex items-center gap-3 px-5 py-3 transition-all active:opacity-70"
                style={{
                  borderBottom:  '1px solid rgba(255,255,255,0.04)',
                  borderLeft:    `2px dashed ${posColor}40`,
                  background:    `${posColor}06`,
                  cursor:        leagueId ? 'pointer' : 'default',
                }}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0"
                  style={{ background: `${posColor}12`, border: `1.5px dashed ${posColor}50` }}
                >
                  +
                </div>
                <div className="flex-1 text-left">
                  <div className="text-[12px] font-bold" style={{ color: posColor, fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '0.06em' }}>
                    {leagueId ? `ADD ${pos}` : `EMPTY SLOT`}
                  </div>
                  <div className="text-[10px] mt-0.5" style={{ color: '#3D4B5C' }}>
                    {leagueId ? 'Tap to sign a player' : 'Open from League to sign'}
                  </div>
                </div>
              </button>
            ))}
          </div>
        );
      })}
      {showBench && (
        <div>
          <SectionHeader title="Substitutes" />
          {bench.map(player => (
            <PlayerCard
              key={player.id}
              player={player}
              variant="row"
              isCaptain={player.id === captainId}
              isJoker={player.id === todayJokerId}
              onClick={isRouletteSpinning ? () => {} : handlePlayerClick}
              isSelected={selectedPlayer?.id === player.id}
              isSwapTarget={swapMode && selectedPlayer?.id !== player.id}
              showIntelligence
            />
          ))}
        </div>
      )}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // ── RENDER ────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-bg overflow-x-hidden">

      {/* ── Fetch error banner ──────────────────────────────────────────────── */}
      {fetchError && (
        <div
          className="fixed top-0 left-0 right-0 z-[70] flex items-center gap-3 px-4 py-3 lg:left-[220px]"
          style={{ background: 'rgba(240,58,58,0.92)', backdropFilter: 'blur(8px)' }}
        >
          <span className="text-white text-[11px] font-bold uppercase tracking-widest flex-1">{fetchError}</span>
          <button
            onClick={() => { setFetchError(null); fetchSquad(); }}
            className="text-white text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-sm transition-opacity hover:opacity-70"
            style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)' }}
          >Retry</button>
          <button onClick={() => setFetchError(null)} className="text-white opacity-60 hover:opacity-100 text-lg leading-none">×</button>
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

      {/* ══ STICKY HEADER ═══════════════════════════════════════════════════ */}
      <div
        className="sticky top-0 z-40 flex items-center justify-between px-5 py-3"
        style={{
          background: 'rgba(13,17,23,0.97)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <div>
          <div className="fz-label" style={{ color: '#3D4B5C' }}>Tactical Sheet</div>
          <div className="flex items-center gap-2 mt-0.5">
            <div className="text-[24px] font-black uppercase leading-tight tracking-tight" style={{ fontFamily: 'Barlow Condensed, sans-serif', color: '#F0F2F5' }}>
              My Squad
            </div>
            <LeagueSelector value={leagueId} onChange={setLeagueId} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!deadline.loading && (
            <div className="text-right">
              <div className="fz-label" style={{ color: '#3D4B5C' }}>Transfers</div>
              <div
                className="text-[11px] font-black uppercase leading-tight tabular-nums"
                style={{ fontFamily: 'Barlow Condensed, sans-serif', color: deadline.color }}
              >
                {deadline.isLocked ? '🔒 Closed' : deadline.timeLeft}
              </div>
            </div>
          )}
          <div className="text-right" data-tour="squad-budget">
            <div className="fz-label" style={{ color: '#3D4B5C' }}>Budget</div>
            <div className="text-[20px] font-black leading-tight tabular-nums" style={{ fontFamily: 'Barlow Condensed, sans-serif', color: budgetLow ? '#F03A3A' : '#F0F2F5' }}>
              ${budgetLeft}M
            </div>
          </div>
        </div>
      </div>

      {/* ══ MOBILE LAYOUT ═══════════════════════════════════════════════════ */}
      <div className="lg:hidden">

        {/* Tab strip */}
        <div className="flex" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: '#0D1117' }}>
          {[
            { id: 'pitch', label: '⚽', text: 'Pitch' },
            { id: 'squad', label: '📋', text: 'Squad' },
            { id: 'tools', label: '⚙️', text: 'Tools' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setMobileTab(tab.id)}
              className="flex-1 py-3 text-center transition-all relative"
              style={{
                fontFamily: 'Barlow Condensed, sans-serif',
                background: mobileTab === tab.id ? 'rgba(0,196,232,0.08)' : 'transparent',
                borderRadius: mobileTab === tab.id ? '4px 4px 0 0' : '0',
              }}
            >
              <div style={{ fontSize: '18px', marginBottom: '2px' }}>{tab.label}</div>
              <div
                className="text-[9px] font-black uppercase tracking-widest"
                style={{
                  color: mobileTab === tab.id ? '#00C4E8' : '#3D4B5C',
                }}
              >
                {tab.text}
              </div>
              {mobileTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-[3px] rounded-t-full" style={{ background: '#00C4E8' }} />
              )}
              {tab.id === 'tools' && dangerPlayers.length > 0 && (
                <div className="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full" style={{ background: '#F03A3A' }} />
              )}
            </button>
          ))}
        </div>

        {/* ── PITCH TAB ─────────────────────────────────────────────── */}
        {mobileTab === 'pitch' && (
          <div data-tour="squad-pitch">
            <DangerBanner />
            {isRouletteSpinning && (
              <div className="absolute inset-0 bg-black/70 z-10 flex flex-col items-center justify-center gap-3" style={{ pointerEvents: 'none' }}>
                <div className="text-4xl animate-bounce">🎰</div>
                <div className="fz-display text-[14px] text-gold tracking-[0.2em]">Roulette Active…</div>
              </div>
            )}
            <PitchView
              squad={{ players, captainId, isTripleCaptain: squadData.isTripleCaptain, joker: jokerPlayer }}
              onPlayerClick={isRouletteSpinning ? () => {} : handlePlayerClick}
              selectedPlayerId={selectedPlayer?.id}
              swapMode={swapMode}
              jokerPlayerId={todayJokerId}
            />
            {/* Bench in pitch format below the pitch */}
            <div className="mt-2 mb-4 px-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.07)' }} />
                <span className="text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: '#3D4B5C', fontFamily: 'Barlow Condensed, sans-serif' }}>Substitutes</span>
                <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.07)' }} />
              </div>
              <div className="flex justify-around">
                {bench.map(player => (
                  <PlayerCard
                    key={player.id}
                    player={player}
                    variant="pitch"
                    isCaptain={player.id === captainId}
                    isJoker={player.id === todayJokerId}
                    onClick={handlePlayerClick}
                    isSelected={selectedPlayer?.id === player.id}
                    isSwapTarget={swapMode && selectedPlayer?.id !== player.id}
                    showIntelligence
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── SQUAD TAB ─────────────────────────────────────────────── */}
        {mobileTab === 'squad' && (
          <div className="pb-6">
            <PlayerList showBench />
          </div>
        )}

        {/* ── TOOLS TAB ─────────────────────────────────────────────── */}
        {mobileTab === 'tools' && (
          <div className="pb-6">

            {/* Section 1: Active Features Summary */}
            {(squadData.isWildcard || squadData.isTripleCaptain || jokerPlayer) && (
              <div className="mx-4 mt-4 mb-4 pb-3 border-b border-white/5">
                <div className="text-[9px] font-black uppercase tracking-[0.1em]" style={{ color: '#3D4B5C', marginBottom: '8px' }}>
                  Active Features
                </div>
                <div className="flex flex-wrap gap-2">
                  {squadData.isWildcard && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded" style={{ background: 'rgba(24,201,107,0.1)', border: '1px solid rgba(24,201,107,0.25)' }}>
                      <span className="text-xs">🃏</span>
                      <span className="text-[8px] font-black uppercase tracking-widest" style={{ color: '#18C96B' }}>Wildcard</span>
                    </div>
                  )}
                  {squadData.isTripleCaptain && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded" style={{ background: 'rgba(240,180,0,0.1)', border: '1px solid rgba(240,180,0,0.25)' }}>
                      <span className="text-xs">🚀</span>
                      <span className="text-[8px] font-black uppercase tracking-widest" style={{ color: '#F0B400' }}>Triple Capt.</span>
                    </div>
                  )}
                  {jokerPlayer && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded" style={{ background: 'rgba(157,95,245,0.1)', border: '1px solid rgba(157,95,245,0.25)' }}>
                      <span className="text-xs">🔒</span>
                      <span className="text-[8px] font-black uppercase tracking-widest" style={{ color: '#9D5FF5' }}>Joker: {jokerPlayer.name.split(' ')[0]}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Section 2: Power Tools */}
            <div className="mx-4" data-tour="squad-power-tools">
              <div className="text-[11px] font-black uppercase tracking-[0.1em] mb-3" style={{ color: '#F0B400' }}>
                ⚡ Power Tools
              </div>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {/* Wildcard */}
                <PowerToolCard
                  icon="🃏"
                  label="Wildcard"
                  isActive={squadData.isWildcard}
                  accentColor="#18C96B"
                  bgColor="rgba(24,201,107,0.08)"
                  borderColor="rgba(24,201,107,0.15)"
                  actionLabel={squadData.isWildcard ? 'Active' : 'Activate'}
                  onAction={() => {
                    if (!isLocked) {
                      setConfirm({
                        title: squadData.isWildcard ? 'Deactivate Wildcard?' : 'Activate Wildcard?',
                        message: squadData.isWildcard
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
                  icon="🚀"
                  label="Triple Cap."
                  isActive={squadData.isTripleCaptain}
                  accentColor="#F0B400"
                  bgColor="rgba(240,180,0,0.08)"
                  borderColor="rgba(240,180,0,0.15)"
                  actionLabel={squadData.isTripleCaptain ? 'Active' : 'Activate'}
                  onAction={() => {
                    if (!isLocked) {
                      setConfirm({
                        title: squadData.isTripleCaptain ? 'Deactivate Triple Captain?' : 'Activate Triple Captain?',
                        message: squadData.isTripleCaptain
                          ? 'Your captain will earn normal points.'
                          : 'Your captain will earn 3× points this matchday. 1 use per season.',
                        onConfirm: () => doToggleChip('triple'),
                        confirmLabel: 'Confirm',
                        warning: squadData.isTripleCaptain ? null : 'This action cannot be undone this gameweek.',
                      });
                    }
                  }}
                />

                {/* Roulette */}
                <PowerToolCard
                  icon="🎰"
                  label="Roulette"
                  isActive={false}
                  accentColor="#F0B400"
                  bgColor="rgba(240,180,0,0.08)"
                  borderColor="rgba(240,180,0,0.15)"
                  actionLabel="Spin"
                  onAction={() => {
                    if (!isLocked && captainId) {
                      handleRouletteStart();
                    }
                  }}
                />
              </div>
            </div>

            {/* Section 3: Daily Joker */}
            <div className="mx-4 mb-4">
              <div className="p-3 rounded-lg" style={{ background: '#0D1117', border: '1.5px solid rgba(157,95,245,0.15)' }}>
                <div style={{ fontSize: '32px', marginBottom: '4px', textAlign: 'center', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}>
                  🃏
                </div>
                <div style={{
                  fontSize: '12px',
                  fontFamily: 'Barlow Condensed, sans-serif',
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#9D5FF5',
                  textAlign: 'center',
                  marginBottom: '4px',
                }}>
                  Daily Joker – Your 16th Man
                </div>
                <div style={{
                  fontSize: '10px',
                  color: 'rgba(240,242,245,0.6)',
                  textAlign: 'center',
                  marginBottom: '8px',
                  lineHeight: 1.4,
                  fontFamily: 'DM Sans, sans-serif',
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
                    color: '#9D5FF5',
                    border: '1px solid rgba(157,95,245,0.3)',
                    borderRadius: '6px',
                    fontSize: '10px',
                    fontFamily: 'Barlow Condensed, sans-serif',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    cursor: isLocked ? 'not-allowed' : 'pointer',
                    opacity: isLocked ? 0.5 : 1,
                  }}
                >
                  {jokerPlayer ? `✓ Set: ${jokerPlayer.name}` : 'Pick Joker'}
                </button>
              </div>
            </div>

            {/* Section 4: Player Status */}
            <div className="mx-4">
              <SectionHeader title="⚠️ Player Status" accent="red" />
              <div className="mt-3">
                <DangerList />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ══ DESKTOP LAYOUT ══════════════════════════════════════════════════ */}
      <div className="hidden lg:flex" style={{ height: 'calc(100vh - 57px)' }}>

        {/* ── LEFT PANE: Pitch + roster list ────────────────────────────── */}
        <div className="flex-1 min-w-0 overflow-y-auto">

          {/* Roulette overlay */}
          {isRouletteSpinning && (
            <div className="fixed inset-0 bg-black/60 z-30 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <div className="text-6xl animate-bounce mb-4">🎰</div>
                <div className="fz-display text-[20px] text-gold tracking-[0.25em]">Roulette Active…</div>
              </div>
            </div>
          )}

          {/* Pitch view */}
          <div className="px-6 pt-6 pb-4">
            <div className="max-w-xl mx-auto">
              {/* Active chip badges */}
              {(squadData.isWildcard || squadData.isTripleCaptain) && (
                <div className="flex gap-2 mb-3">
                  {squadData.isWildcard && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded" style={{ background: 'rgba(24,201,107,0.1)', border: '1px solid rgba(24,201,107,0.25)' }}>
                      <span className="text-xs">🃏</span>
                      <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#18C96B' }}>Wildcard Active</span>
                    </div>
                  )}
                  {squadData.isTripleCaptain && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded" style={{ background: 'rgba(240,180,0,0.1)', border: '1px solid rgba(240,180,0,0.25)' }}>
                      <span className="text-xs">🚀</span>
                      <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#F0B400' }}>Triple Captain Active</span>
                    </div>
                  )}
                </div>
              )}
              <PitchView
                squad={{ players, captainId, isTripleCaptain: squadData.isTripleCaptain, joker: jokerPlayer }}
                onPlayerClick={isRouletteSpinning ? () => {} : handlePlayerClick}
                selectedPlayerId={selectedPlayer?.id}
                swapMode={swapMode}
                jokerPlayerId={todayJokerId}
              />
            </div>
          </div>

          {/* Player list grouped by position */}
          <div className="border-t border-border">
            <div className="px-0">
              {/* Daily Joker row */}
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
                  className="w-full flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-purple/5 group transition-all"
                >
                  <div className="w-8 h-8 rounded-full border-2 border-dashed border-purple/30 flex items-center justify-center text-purple font-black group-hover:border-purple">+</div>
                  <div className="flex-1 text-left">
                    <div className="text-[12px] font-black uppercase tracking-widest" style={{ color: '#9D5FF5', fontFamily: 'Barlow Condensed, sans-serif' }}>
                      Select 16th Man
                    </div>
                    <div className="text-[10px] mt-0.5" style={{ color: '#3D4B5C' }}>Exempt from country limit rules today</div>
                  </div>
                </button>
              )}

              <PlayerList showBench={false} />
            </div>
          </div>
        </div>

        {/* ── RIGHT PANE: Tabbed sidebar ────────────────────────────────── */}
        <div
          className="w-[300px] shrink-0 flex flex-col"
          style={{ borderLeft: '1px solid rgba(255,255,255,0.07)' }}
        >
          {/* Tab strip */}
          <div className="flex shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: '#0D1117' }}>
            {[
              { id: 'bench',  label: 'Bench' },
              { id: 'chips',  label: 'Chips' },
              { id: 'status', label: 'Status' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setDesktopTab(tab.id)}
                className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all relative"
                style={{
                  fontFamily: 'Barlow Condensed, sans-serif',
                  color: desktopTab === tab.id ? '#00C4E8' : '#3D4B5C',
                  background: 'transparent',
                }}
              >
                {tab.label}
                {desktopTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-full" style={{ background: '#00C4E8' }} />
                )}
                {tab.id === 'status' && dangerPlayers.length > 0 && (
                  <div className="absolute top-2 right-[calc(50%-14px)] w-1.5 h-1.5 rounded-full" style={{ background: '#F03A3A' }} />
                )}
              </button>
            ))}
          </div>

          {/* Tab content — scrollable */}
          <div className="flex-1 overflow-y-auto">

            {/* BENCH TAB */}
            {desktopTab === 'bench' && (
              <div>
                <SectionHeader title="Substitutes" />
                {bench.map(player => (
                  <PlayerCard
                    key={player.id}
                    player={player}
                    variant="row"
                    isCaptain={player.id === captainId}
                    isJoker={player.id === todayJokerId}
                    onClick={isRouletteSpinning ? () => {} : handlePlayerClick}
                    isSelected={selectedPlayer?.id === player.id}
                    isSwapTarget={swapMode && selectedPlayer?.id !== player.id}
                    showIntelligence
                  />
                ))}
                <div className="px-4 py-3 mt-2">
                  <p className="text-[10px] leading-relaxed" style={{ color: '#3D4B5C' }}>
                    Tap a player on the pitch or in the list to sub them in or out. You can also swap players within starters or within bench.
                  </p>
                </div>
              </div>
            )}

            {/* CHIPS TAB */}
            {desktopTab === 'chips' && (
              <div className="pt-4 mx-4">
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <PowerToolCard
                    icon="🃏"
                    label="Wildcard"
                    isActive={squadData.isWildcard}
                    accentColor="#18C96B"
                    bgColor="rgba(24,201,107,0.08)"
                    borderColor="rgba(24,201,107,0.15)"
                    actionLabel={squadData.isWildcard ? 'Active' : 'Activate'}
                    onAction={() => {
                      if (!isLocked) {
                        setConfirm({
                          title: squadData.isWildcard ? 'Deactivate Wildcard?' : 'Activate Wildcard?',
                          message: squadData.isWildcard
                            ? 'You will no longer have unlimited free transfers.'
                            : 'You\'ll have unlimited free transfers this matchday. 1 use per season.',
                          onConfirm: () => doToggleChip('wildcard'),
                          confirmLabel: 'Confirm',
                          warning: squadData.isWildcard ? null : 'This action cannot be undone this gameweek.',
                        });
                      }
                    }}
                  />
                  <PowerToolCard
                    icon="🚀"
                    label="Triple Cap."
                    isActive={squadData.isTripleCaptain}
                    accentColor="#F0B400"
                    bgColor="rgba(240,180,0,0.08)"
                    borderColor="rgba(240,180,0,0.15)"
                    actionLabel={squadData.isTripleCaptain ? 'Active' : 'Activate'}
                    onAction={() => {
                      if (!isLocked) {
                        setConfirm({
                          title: squadData.isTripleCaptain ? 'Deactivate Triple Captain?' : 'Activate Triple Captain?',
                          message: squadData.isTripleCaptain
                            ? 'Your captain will earn normal points.'
                            : 'Your captain will earn 3× points this matchday. 1 use per season.',
                          onConfirm: () => doToggleChip('triple'),
                          confirmLabel: 'Confirm',
                          warning: squadData.isTripleCaptain ? null : 'This action cannot be undone this gameweek.',
                        });
                      }
                    }}
                  />
                  <RouletteCard />
                </div>
                <JokerCard />
              </div>
            )}

            {/* STATUS TAB */}
            {desktopTab === 'status' && (
              <div>
                <SectionHeader title="Player Status" accent="gold" />
                <DangerList />
                <div className="mt-4">
                  <SectionHeader title="Captain" />
                  {(() => {
                    const cap = allSquadPlayers.find(p => p.id === captainId);
                    if (!cap) return null;
                    return (
                      <div className="px-4 py-3 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black shrink-0" style={{ background: 'rgba(240,180,0,0.15)', border: '1px solid rgba(240,180,0,0.4)', color: '#F0B400' }}>C</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-semibold text-white truncate">{cap.name}</div>
                          <div className="text-[10px] mt-0.5" style={{ color: '#7D8A96' }}>{cap.position} · {cap.club} · ${cap.price}M</div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══ PLAYER ACTION BOTTOM SHEET ═══════════════════════════════════════ */}
      {selectedPlayer && !swapMode && !isRouletteSpinning && (
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
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center font-black text-[11px] uppercase"
                  style={{ background: selectedPlayer.color || '#1C2333', border: '1.5px solid rgba(255,255,255,0.12)', color: '#F0F2F5', fontFamily: 'Barlow Condensed, sans-serif' }}
                >
                  {selectedPlayer.club}
                </div>
                <div>
                  <div className="text-[16px] font-semibold leading-tight" style={{ fontFamily: 'DM Sans, sans-serif', color: '#F0F2F5' }}>
                    {selectedPlayer.name}
                  </div>
                  <div className="fz-label mt-0.5" style={{ color: '#7D8A96' }}>
                    {selectedPlayer.position} · ${selectedPlayer.price}M
                    {selectedPlayer.id === captainId && <span className="ml-2 text-gold">★ Captain</span>}
                    {selectedPlayer.id === todayJokerId && <span className="ml-2" style={{ color: '#9D5FF5' }}>🃏 Joker</span>}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedPlayer(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-colors text-lg"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#7D8A96' }}
              >×</button>
            </div>
            {/* Actions */}
            <div className="flex gap-2 mb-3">
              {!selectedIsBench && (
                <button
                  onClick={setCaptain}
                  disabled={saving || captainId === selectedPlayer.id}
                  className="flex-1 py-2.5 rounded-sm transition-all active:scale-95 disabled:opacity-30"
                  style={{
                    background: captainId === selectedPlayer.id ? 'rgba(240,180,0,0.15)' : '#F0B400',
                    color: captainId === selectedPlayer.id ? '#F0B400' : '#000',
                    border: captainId === selectedPlayer.id ? '1px solid rgba(240,180,0,0.3)' : 'none',
                    fontFamily: 'Barlow Condensed, sans-serif', fontSize: '11px', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
                  }}
                >
                  {captainId === selectedPlayer.id ? '✓ Captain' : 'Make Captain'}
                </button>
              )}
              <button
                onClick={() => setSwapMode(true)}
                className="flex-1 py-2.5 rounded-sm transition-all active:scale-95"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#F0F2F5', border: '1px solid rgba(255,255,255,0.1)', fontFamily: 'Barlow Condensed, sans-serif', fontSize: '11px', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}
              >
                {selectedIsBench ? '↑ Sub In' : '↓ Sub Out'}
              </button>
              <button
                onClick={handleSellPlayer}
                disabled={saving}
                className="px-5 py-2.5 rounded-sm transition-all active:scale-95"
                style={{ background: 'rgba(240,58,58,0.12)', color: '#F03A3A', border: '1px solid rgba(240,58,58,0.2)', fontFamily: 'Barlow Condensed, sans-serif', fontSize: '11px', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}
              >
                Sell
              </button>
            </div>
            {/* Daily Joker section */}
            <div className="pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              {todayJokerId ? (
                <div className="flex items-center gap-2 p-2.5 rounded-sm" style={{ background: 'rgba(157,95,245,0.08)', border: '1px solid rgba(157,95,245,0.2)' }}>
                  <span>🔒</span>
                  <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#9D5FF5', fontFamily: 'Barlow Condensed, sans-serif' }}>
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
                      background: playingTodayTeams.includes(selectedPlayer.club) ? '#9D5FF5' : 'rgba(255,255,255,0.04)',
                      color: playingTodayTeams.includes(selectedPlayer.club) ? '#fff' : '#3D4B5C',
                      border: playingTodayTeams.includes(selectedPlayer.club) ? 'none' : '1px solid rgba(255,255,255,0.07)',
                      fontFamily: 'Barlow Condensed, sans-serif', fontSize: '11px', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
                      cursor: playingTodayTeams.includes(selectedPlayer.club) ? 'pointer' : 'not-allowed',
                      boxShadow: playingTodayTeams.includes(selectedPlayer.club) ? '0 0 12px rgba(157,95,245,0.3)' : 'none',
                    }}
                  >
                    {playingTodayTeams.includes(selectedPlayer.club) ? '🃏 Activate Daily Joker' : '✗ Not Playing Today'}
                  </button>
                  <p className="mt-1.5 text-[9px] text-center uppercase tracking-wide" style={{ color: '#3D4B5C', fontFamily: 'DM Sans, sans-serif' }}>
                    1 Joker per day · Country limit exempt · Locked once set
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ PLAYER PICKER SHEET ═════════════════════════════════════════════ */}
      {pickerPos && (
        <PlayerPickerSheet
          position={pickerPos}
          budget={squadData?.budget?.current ?? 100}
          takenMap={takenMap}
          isOwnedBy={isOwnedBy}
          onSelect={handlePickerBuy}
          onClose={() => setPickerPos(null)}
        />
      )}

      {/* ══ SWAP MODE BANNER ═════════════════════════════════════════════════ */}
      {swapMode && (
        <div
          className="fixed bottom-0 left-0 right-0 lg:left-[220px] z-[60] px-5 py-3 flex justify-between items-center"
          style={{ background: '#18C96B', color: '#000', boxShadow: '0 -4px 20px rgba(24,201,107,0.4)', paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}
        >
          <div>
            <div className="font-black text-[11px] uppercase tracking-widest" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
              Select a {selectedIsBench ? 'starter' : 'bench player'} to swap
            </div>
            <div className="text-[10px] opacity-60 mt-0.5">Swapping: {selectedPlayer?.name}</div>
          </div>
          <button
            onClick={() => { setSwapMode(false); setSelectedPlayer(null); }}
            className="px-4 py-1.5 rounded-sm font-bold uppercase text-[10px] tracking-widest"
            style={{ background: 'rgba(0,0,0,0.2)', fontFamily: 'Barlow Condensed, sans-serif' }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* ══ JOKER PICKER MODAL ═══════════════════════════════════════════════ */}
      {isJokerPickerOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={() => setIsJokerPickerOpen(false)} />
          <div className="w-full max-w-lg bg-surface border border-purple/30 rounded-sm shadow-[0_0_50px_rgba(168,85,247,0.2)] overflow-hidden flex flex-col max-h-[80vh] relative z-10">
            <div className="px-5 py-4 border-b border-border flex justify-between items-center bg-purple/5">
              <div>
                <div className="fz-label text-purple">Daily Joker Selection</div>
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
              Independent of your 15-man squad · Ignores country limits
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Supporting UI: Joker picker list (FB-024: proper empty/error states) ─────
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
      <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#F0F2F5' }}>{title}</div>
      {sub && <div style={{ fontSize: '12px', color: 'rgba(240,242,245,0.45)', lineHeight: 1.5, maxWidth: '220px' }}>{sub}</div>}
      {action}
    </div>
  );

  if (loading) return (
    <EmptyState emoji="🔍" title="Scouting Active Teams…" sub={null} action={
      <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '10px', letterSpacing: '0.15em', color: '#3D4B5C', textTransform: 'uppercase' }} className="animate-scan">Loading</div>
    } />
  );

  // FB-024: error state with retry
  if (fetchError) return (
    <EmptyState emoji="⚠️" title="Couldn't load players" sub="Check your connection and try again." action={
      <button onClick={load} style={{ padding: '8px 20px', background: '#F0B400', color: '#0D1117', fontSize: '11px', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
        Retry
      </button>
    } />
  );

  // FB-024: no matches today
  if (!teams.length) return (
    <EmptyState emoji="📅" title="No Matches Today" sub="The Daily Joker is only available on matchdays. Check back when fixtures are scheduled." action={null} />
  );

  // FB-024: none of your squad plays today
  const playingSquadPlayers = players.filter(p => squadPlayerIds?.includes(p.id));
  const otherPlayers        = players.filter(p => !squadPlayerIds?.includes(p.id));
  const noSquadOverlap      = squadPlayerIds?.length && !playingSquadPlayers.length;

  if (!players.length) return (
    <EmptyState emoji="🏟️" title="None of your players are in today's matches" sub="You can still pick any player from the active squads below as your Joker." action={null} />
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
          {p.position} · {p.club}
          {highlight && <span style={{ color: '#9D5FF5', marginLeft: '6px' }}>· Your squad</span>}
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
      <span style={{ fontSize: '9px', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#3D4B5C' }}>{label}</span>
      <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.07)' }} />
    </div>
  );

  return (
    <div className="space-y-1">
      {/* Squad players playing today shown first */}
      {playingSquadPlayers.length > 0 && (
        <>
          <SectionLabel label="Your squad — playing today" />
          {playingSquadPlayers.map(p => <PlayerRow key={p.id} p={p} highlight />)}
          {otherPlayers.length > 0 && <SectionLabel label="All active players" />}
        </>
      )}
      {noSquadOverlap && <SectionLabel label="None of your squad plays today — pick any Joker" />}
      {otherPlayers.map(p => <PlayerRow key={p.id} p={p} highlight={false} />)}
    </div>
  );
}
