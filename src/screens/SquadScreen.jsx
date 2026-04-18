import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { squad as fallbackSquad } from '../data/squad';
import { getDangerZonePlayers, normalizeIntelligence } from '../lib/intelligence';
import PitchView from '../components/PitchView';
import PlayerCard from '../components/PlayerCard';
import DangerZone from '../components/DangerZone';
import SectionHeader from '../components/SectionHeader';

// ── Position order for the roster list ───────────────────────────────────────
const POS_ORDER = ['GK', 'DEF', 'MID', 'FWD'];
const POS_LABEL = { GK: 'Goalkeeper', DEF: 'Defenders', MID: 'Midfielders', FWD: 'Forwards' };

// ── Chip config ───────────────────────────────────────────────────────────────
const CHIP_CONFIG = {
  wildcard: {
    icon: '🃏',
    label: 'Wildcard',
    desc: 'Unlimited free transfers this matchday',
    activeClass: 'border-positive bg-positive/10 text-positive',
    inactiveClass: 'border-border-2 bg-surface text-text-tertiary opacity-50',
  },
  triple: {
    icon: '🚀',
    label: 'Triple Capt.',
    desc: 'All-or-Nothing: 3× points or 0 if captain doesn\'t play',
    activeClass: 'border-gold bg-gold/10 text-gold',
    inactiveClass: 'border-border-2 bg-surface text-text-tertiary opacity-50',
  },
};

export default function SquadScreen() {
  const [jokerPlayer,         setJokerPlayer]        = useState(null);
  const [isJokerPickerOpen,   setIsJokerPickerOpen]  = useState(false);
  const [isRouletteSpinning, setIsRouletteSpinning] = useState(false);
  const [squadData,          setSquadData]          = useState(null);
  const [loading,            setLoading]            = useState(true);
  const [todayJokerId,       setTodayJokerId]       = useState(null);
  const [playingTodayTeams,  setPlayingTodayTeams]  = useState([]);
  const [selectedPlayer,     setSelectedPlayer]     = useState(null);
  const [swapMode,           setSwapMode]           = useState(false);
  const [saving,             setSaving]             = useState(false);

  useEffect(() => {
    fetchSquad();
    fetchDailyStatus();
  }, []);

  // ── Data Fetching ─────────────────────────────────────────────────────────
  const fetchDailyStatus = async () => {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id || '00000000-0000-0000-0000-000000000000';
      const today  = new Date().toISOString().split('T')[0];

      const { data: joker } = await supabase
        .from('daily_jokers').select('player_id')
        .eq('user_id', userId).eq('match_date', today).maybeSingle();
      if (joker) setTodayJokerId(joker.player_id);

      const { data: fixtures } = await supabase.from('fixtures').select('home_team, away_team');
      const teams = new Set();
      fixtures?.forEach(f => { teams.add(f.home_team); teams.add(f.away_team); });
      setPlayingTodayTeams(Array.from(teams));
    } catch (err) {
      console.error('Daily status error', err);
    }
  };

  const fetchSquad = async () => {
    try {
      setLoading(true);
      const userId = '00000000-0000-0000-0000-000000000000';
      const today  = new Date().toISOString().split('T')[0];

      // 1. Fetch Today's Joker ID
      const { data: jokerRec } = await supabase
        .from('daily_jokers').select('player_id')
        .eq('user_id', userId).eq('match_date', today).maybeSingle();
      
      let jokerP = null;
      if (jokerRec?.player_id) {
        const { data: jp } = await supabase.from('players').select('*').eq('id', jokerRec.player_id).single();
        if (jp) jokerP = { ...jp, isJoker: true };
      }
      setJokerPlayer(jokerP);
      setTodayJokerId(jokerRec?.player_id || null);

      // 2. Fetch Squad
      const { data: squad, error } = await supabase
        .from('squads').select('*').eq('user_id', userId).limit(1).single();

      if (error || !squad) { setSquadData(fallbackSquad); return; }

      const { data: players, error: pErr } = await supabase
        .from('players').select('*').in('id', squad.players);
      if (pErr) throw pErr;

      const { data: intelData } = await supabase
        .from('player_status').select('*').in('player_id', squad.players);

      const mappedPlayers = (players || []).map((p, idx) => {
        const pitchMatch = fallbackSquad.players.find(mp => mp.id === p.id) || 
                           fallbackSquad.bench.find(mp => mp.id === p.id);
        const playerIntel = intelData?.find(i => i.player_id === p.id);
        
        // Starters are the first 11 in the array if not specified
        const isStarter = idx < 11;
        
        return {
          ...p,
          points: 0,
          intel: normalizeIntelligence(playerIntel),
          color: pitchMatch?.color || '#333',
          // Use gridClass from mock match if available, otherwise use a default grid pos based on index for starters
          gridClass: pitchMatch?.gridClass || (isStarter ? `col-start-${(idx % 5) + 1} row-start-${Math.floor(idx / 5) + 1}` : ''),
          isBench: !isStarter,
        };
      });

      let pitchPlayers = mappedPlayers.filter(p => !p.isBench);
      let benchPlayers = mappedPlayers.filter(p => p.isBench);

      // 3. Add Fallbacks from mock if DB is empty or partial (demo requirement: always 11 on field)
      if (pitchPlayers.length < 11) {
        const existingIds = new Set(pitchPlayers.map(p => p.id));
        const fillers = fallbackSquad.players
          .filter(p => !existingIds.has(p.id))
          .map(p => ({ ...p, points: 0, isBench: false }));
        pitchPlayers = [...pitchPlayers, ...fillers].slice(0, 11);
      }
      if (benchPlayers.length < 4) {
        const existingIds = new Set([...pitchPlayers, ...benchPlayers].map(p => p.id));
        const fillers = fallbackSquad.bench
          .filter(p => !existingIds.has(p.id))
          .map(p => ({ ...p, points: 0, isBench: true }));
        benchPlayers = [...benchPlayers, ...fillers].slice(0, 4);
      }

      setSquadData({
        squadId:        squad.id,
        budget:         fallbackSquad.budget,
        captainId:      squad.captain_id || 'p1', // Mbappé
        players:        pitchPlayers,
        bench:          benchPlayers,
        isWildcard:     squad.is_wildcard,
        isTripleCaptain: squad.is_triple_captain,
        locked_at:      squad.locked_at,
      });
    } catch (err) {
      console.error(err);
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

  const handleSwap = async (p1, p2) => {
    try {
      setSaving(true);
      const isP1Bench = squadData.bench.some(b => b.id === p1.id);
      const isP2Bench = squadData.bench.some(b => b.id === p2.id);
      if (isP1Bench === isP2Bench) { alert('Can only swap between field and bench.'); return; }

      const pitchPlayer = isP1Bench ? p2 : p1;
      const benchPlayer = isP1Bench ? p1 : p2;
      const tempGrid    = pitchPlayer.gridClass;

      const newPlayers    = squadData.players.map(p => p.id === pitchPlayer.id ? { ...benchPlayer, gridClass: tempGrid } : p);
      const newBench      = squadData.bench.map(b   => b.id === benchPlayer.id ? { ...pitchPlayer, gridClass: '' }       : b);
      const newCaptainId  = squadData.captainId === pitchPlayer.id ? benchPlayer.id : squadData.captainId;

      setSquadData({ ...squadData, players: newPlayers, bench: newBench, captainId: newCaptainId });
      const allPlayerIds = [...newPlayers, ...newBench].map(p => p.id);
      await supabase.from('squads').update({ players: allPlayerIds, captain_id: newCaptainId }).eq('id', squadData.squadId);
    } catch (err) {
      console.error('Swap failed', err);
    } finally {
      setSelectedPlayer(null);
      setSwapMode(false);
      setSaving(false);
    }
  };

  const setCaptain = async () => {
    try {
      setSaving(true);
      setSquadData({ ...squadData, captainId: selectedPlayer.id });
      await supabase.from('squads').update({ captain_id: selectedPlayer.id }).eq('id', squadData.squadId);
    } finally {
      setSaving(false);
      setSelectedPlayer(null);
    }
  };

  const handleActivateJoker = async () => {
    if (!selectedPlayer) return;
    try {
      setSaving(true);
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id || '00000000-0000-0000-0000-000000000000';
      const today  = new Date().toISOString().split('T')[0];
      const { error } = await supabase.from('daily_jokers').insert({ user_id: userId, player_id: selectedPlayer.id, match_date: today });
      if (error) {
        if (error.code === '23505') alert('You already used your daily Joker today!');
        else throw error;
      } else {
        setTodayJokerId(selectedPlayer.id);
        setSelectedPlayer(null);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to set Joker: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSellPlayer = async () => {
    try {
      setSaving(true);
      const newPitch = squadData.players.filter(p => p.id !== selectedPlayer.id).map(p => p.id);
      const newBench = squadData.bench.filter(p => p.id !== selectedPlayer.id).map(p => p.id);
      await supabase.from('squads').update({ players: [...newPitch, ...newBench] }).eq('id', squadData.squadId);
      setSquadData({
        ...squadData,
        players: squadData.players.filter(p => p.id !== selectedPlayer.id),
        bench:   squadData.bench.filter(p => p.id !== selectedPlayer.id),
      });
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
      setSelectedPlayer(null);
    }
  };

  const toggleChip = async (chipType) => {
    try {
      setSaving(true);
      const field  = chipType === 'wildcard' ? 'is_wildcard' : 'is_triple_captain';
      const curVal = chipType === 'wildcard' ? squadData.isWildcard : squadData.isTripleCaptain;
      await supabase.from('squads').update({ [field]: !curVal }).eq('id', squadData.squadId);
      setSquadData({ ...squadData, [chipType === 'wildcard' ? 'isWildcard' : 'isTripleCaptain']: !curVal });
    } finally {
      setSaving(false);
    }
  };

  const activateRoulette = () => {
    if (isRouletteSpinning || !squadData) return;
    setIsRouletteSpinning(true);
    const allPlayers = [...squadData.players, ...squadData.bench];
    let idx = 0;
    const interval = setInterval(() => {
      setSelectedPlayer(allPlayers[idx % allPlayers.length]);
      idx++;
    }, 80);
    setTimeout(() => {
      clearInterval(interval);
      const newCaptain = allPlayers[Math.floor(Math.random() * allPlayers.length)];
      setSelectedPlayer(newCaptain);
      setTimeout(async () => {
        try {
          setSaving(true);
          setSquadData(prev => ({ ...prev, captainId: newCaptain.id }));
          await supabase.from('squads').update({ captain_id: newCaptain.id }).eq('id', squadData.squadId);
        } finally {
          setSaving(false);
          setIsRouletteSpinning(false);
        }
      }, 400);
    }, 2500);
  };

  // ── Loading / Guard ────────────────────────────────────────────────────────
  if (loading || !squadData) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-center">
          <div className="fz-display text-[32px] text-cyan mb-2">MY SQUAD</div>
          <div className="fz-label text-text-tertiary animate-scan">LOADING TACTICAL SHEET</div>
        </div>
      </div>
    );
  }

  const { budget, players, bench, captainId, locked_at } = squadData;
  const allSquadPlayers  = [...players, ...bench];
  const dangerPlayers    = getDangerZonePlayers(allSquadPlayers);
  const selectedIsBench  = selectedPlayer && bench.some(b => b.id === selectedPlayer.id);

  const handleJokerSelection = async (player) => {
    try {
      setSaving(true);
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id || '00000000-0000-0000-0000-000000000000';
      const today  = new Date().toISOString().split('T')[0];

      const { error } = await supabase.from('daily_jokers').insert({
        user_id: userId,
        player_id: player.id,
        match_date: today
      });

      if (error) {
        if (error.code === '23505') alert('You already have a Joker for today!');
        else throw error;
      } else {
        setJokerPlayer(player);
        setTodayJokerId(player.id);
        setIsJokerPickerOpen(false);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to set Joker');
    } finally {
      setSaving(false);
    }
  };

  // ── Chips row ──────────────────────────────────────────────────────────────
  const ChipsRow = () => (
    <div className="flex gap-2 px-4 py-3">
      {/* Wildcard */}
      <button
        onClick={() => toggleChip('wildcard')}
        title={CHIP_CONFIG.wildcard.desc}
        className={`flex-1 py-2.5 px-2 rounded-sm border transition-all flex flex-col items-center gap-1 ${
          squadData.isWildcard ? CHIP_CONFIG.wildcard.activeClass : CHIP_CONFIG.wildcard.inactiveClass
        }`}
      >
        <span className="text-lg leading-none">{CHIP_CONFIG.wildcard.icon}</span>
        <span className="text-[8px] font-black uppercase tracking-widest text-center leading-tight" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
          Wild<br />Card
        </span>
      </button>

      {/* Triple Captain */}
      <button
        onClick={() => toggleChip('triple')}
        title={CHIP_CONFIG.triple.desc}
        className={`flex-1 py-2.5 px-2 rounded-sm border transition-all flex flex-col items-center gap-1 ${
          squadData.isTripleCaptain ? CHIP_CONFIG.triple.activeClass : CHIP_CONFIG.triple.inactiveClass
        }`}
      >
        <span className="text-lg leading-none">{CHIP_CONFIG.triple.icon}</span>
        <span className="text-[8px] font-black uppercase tracking-widest text-center leading-tight" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
          Triple<br />Capt.
        </span>
      </button>

      {/* Captain Roulette */}
      <button
        onClick={activateRoulette}
        disabled={isRouletteSpinning}
        title="Captain Roulette — Randomly select your captain from your squad"
        className={`flex-[1.5] py-2.5 px-2 rounded-sm border transition-all flex flex-col items-center gap-1 ${
          isRouletteSpinning
            ? 'bg-gold border-gold text-black animate-pulse'
            : 'bg-surface border-gold/40 text-gold hover:bg-gold/10'
        }`}
      >
        <span className={`text-lg leading-none ${isRouletteSpinning ? 'animate-spin' : ''}`}>🎰</span>
        <span className="text-[8px] font-black uppercase tracking-widest leading-tight" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
          {isRouletteSpinning ? 'Spinning…' : 'Captain\nRoulette'}
        </span>
      </button>
    </div>
  );

  // ── Bench (row of PlayerCard rows or pitch circles) ────────────────────────
  const BenchSection = ({ useRowVariant = false }) => (
    <div>
      <SectionHeader title="Substitutes" />
      <div className={useRowVariant ? 'divide-y divide-border' : 'grid grid-cols-3 gap-x-2 gap-y-6 p-4 bg-surface rounded-sm border border-border mx-4 mb-4'}>
        {bench.map(player => (
          <PlayerCard
            key={player.id}
            player={player}
            variant={useRowVariant ? 'row' : 'pitch'}
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
  );

  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-bg">

      {/* ── Page Header ───────────────────────────────────────── */}
      <div className="sticky top-0 z-40 bg-surface border-b border-border flex items-center justify-between px-5 py-3">
        <div>
          <div className="fz-label text-text-tertiary">Tactical Sheet</div>
          <div className="fz-display text-[22px] text-white leading-tight">MY SQUAD</div>
        </div>
        <div className="flex items-center gap-4">
          {locked_at && (
            <div
              className="text-[9px] font-black text-negative uppercase tracking-widest border border-negative/30 px-2 py-1 rounded-sm"
              title="Squad locked — no changes until next matchday"
            >
              🔒 Locked
            </div>
          )}
          <div className="text-right">
            <div className="fz-label text-text-tertiary">Budget</div>
            <div
              className="text-[20px] font-black text-white leading-tight tabular-nums"
              style={{ fontFamily: 'Barlow Condensed, sans-serif' }}
            >
              ${Number((budget.total - budget.current).toFixed(1))}M
            </div>
          </div>
        </div>
      </div>

      {/* ── Two-column layout ──────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row min-h-[calc(100vh-57px)]">

        {/* ══ LEFT COLUMN ══════════════════════════════════════ */}
        <div className="flex-1 min-w-0">

          {/* ── MOBILE ONLY: Chips + DangerZone + Pitch + Bench ── */}
          <div className="lg:hidden">
            <div className="border-b border-border">
              <ChipsRow />
            </div>
            {dangerPlayers.length > 0 && (
              <div className="border-b border-border">
                <DangerZone players={dangerPlayers} onSelectPlayer={setSelectedPlayer} />
              </div>
            )}

            {/* Triple Captain warning — mobile */}
            {squadData.isTripleCaptain && (
              <div className="mx-4 my-3 p-3 bg-gold/10 border-l-2 border-gold rounded-sm">
                <div className="flex gap-2 items-start">
                  <span>⚠️</span>
                  <div>
                    <div className="fz-label text-gold mb-1">Triple Captain Rules</div>
                    <div className="text-xs text-text-secondary leading-relaxed">
                      <strong className="text-white">All-or-Nothing</strong> chip active. If your captain doesn't play, you score <strong className="text-white">0 points</strong>.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Pitch view */}
            <div className="relative">
              {isRouletteSpinning && (
                <div className="absolute inset-0 bg-black/70 z-10 flex flex-col items-center justify-center gap-3">
                  <div className="text-4xl animate-bounce">🎰</div>
                  <div className="fz-display text-[14px] text-gold tracking-[0.2em]">
                    Roulette Active…
                  </div>
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

            {/* Bench */}
            <div className="mt-6 mb-4">
              <BenchSection useRowVariant={false} />
            </div>
          </div>

          {/* ── DESKTOP ONLY: Grouped position roster list ─────── */}
          <div className="hidden lg:block">
            {/* Roulette overlay */}
            {isRouletteSpinning && (
              <div className="fixed inset-0 bg-black/60 z-30 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-6xl animate-bounce mb-4">🎰</div>
                  <div className="fz-display text-[20px] text-gold tracking-[0.25em]">Roulette Active…</div>
                </div>
              </div>
            )}

            {/* Daily Joker Section (Desktop) */}
            <SectionHeader title="Daily Joker" />
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
                <div className="fz-display text-[11px] text-purple tracking-widest uppercase">Select Booster Man (Rule Exempt)</div>
              </button>
            )}

            {/* Player rows grouped by position */}
            {POS_ORDER.map(pos => {
              const posPlayers = players.filter(p => p.position === pos);
              if (!posPlayers.length) return null;
              return (
                <div key={pos}>
                  <SectionHeader title={`${POS_LABEL[pos]}`} />
                  <div>
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
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ══ RIGHT COLUMN — Desktop sidebar ═══════════════════ */}
        <div className="hidden lg:flex lg:flex-col w-[300px] border-l border-border shrink-0">

          {/* Chips */}
          <div className="border-b border-border">
            <SectionHeader title="Power Chips" />
            <ChipsRow />
          </div>

          {/* Triple Captain warning */}
          {squadData.isTripleCaptain && (
            <div className="mx-4 my-3 p-3 bg-gold/10 border-l-2 border-gold rounded-sm">
              <div className="fz-label text-gold mb-1">All-or-Nothing Active</div>
              <div className="text-xs text-text-secondary leading-relaxed">
                Your captain must play or you score 0 pts.
              </div>
            </div>
          )}

          {/* Danger Zone */}
          {dangerPlayers.length > 0 && (
            <div className="border-b border-border">
              <DangerZone players={dangerPlayers} onSelectPlayer={setSelectedPlayer} />
            </div>
          )}

          {/* Bench */}
          <div className="flex-1">
            <BenchSection useRowVariant={true} />
          </div>
        </div>
      </div>

      {/* ══ PLAYER ACTION BOTTOM SHEET ═══════════════════════════ */}
      {selectedPlayer && !swapMode && !isRouletteSpinning && (
        <div className="fixed bottom-0 left-0 right-0 lg:bottom-0 lg:left-[200px] bg-surface-2 border-t border-border z-50 shadow-2xl animate-slide-up">
          <div className="max-w-2xl mx-auto px-5 py-4">

            {/* Player info header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-full border border-border-2 flex items-center justify-center font-bold text-[11px] uppercase"
                  style={{ background: selectedPlayer.color || '#1E2535' }}
                >
                  {selectedPlayer.club}
                </div>
                <div>
                  <div className="text-[16px] font-bold text-white" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                    {selectedPlayer.name}
                  </div>
                  <div className="fz-label text-text-secondary">
                    {selectedPlayer.position} · ${selectedPlayer.price}M
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedPlayer(null)}
                className="w-8 h-8 rounded-full bg-surface border border-border flex items-center justify-center text-text-secondary hover:text-white transition-colors text-lg"
              >
                ×
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 mb-3">
              {!selectedIsBench && (
                <button
                  onClick={setCaptain}
                  disabled={saving || captainId === selectedPlayer.id}
                  title="Make this player your squad captain — they earn 2× points"
                  className="flex-1 py-2.5 bg-gold text-black font-bold text-[11px] uppercase tracking-widest rounded-sm disabled:opacity-30 active:scale-95 transition-transform"
                  style={{ fontFamily: 'Barlow Condensed, sans-serif' }}
                >
                  {captainId === selectedPlayer.id ? '✓ Captain' : 'Make Captain'}
                </button>
              )}
              <button
                onClick={() => setSwapMode(true)}
                title={selectedIsBench ? 'Sub this player into the starting XI' : 'Sub this player out to the bench'}
                className="flex-1 py-2.5 bg-surface border border-border-2 text-white font-bold text-[11px] uppercase tracking-widest rounded-sm active:scale-95 transition-transform"
                style={{ fontFamily: 'Barlow Condensed, sans-serif' }}
              >
                {selectedIsBench ? '↑ Sub In' : '↓ Sub Out'}
              </button>
              <button
                onClick={handleSellPlayer}
                disabled={saving}
                title="Permanently remove this player from your squad and reclaim their transfer value"
                className="px-5 py-2.5 bg-negative/15 text-negative font-bold text-[11px] uppercase tracking-widest rounded-sm active:scale-95 transition-transform"
                style={{ fontFamily: 'Barlow Condensed, sans-serif' }}
              >
                Sell
              </button>
            </div>

            {/* Joker section */}
            <div className="border-t border-border pt-3">
              {todayJokerId ? (
                <div className="flex items-center gap-2 p-2.5 bg-purple/10 border border-purple/20 rounded-sm">
                  <span>🔒</span>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-purple" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                    Joker already locked for today
                  </div>
                </div>
              ) : (
                <>
                  <button
                    onClick={handleActivateJoker}
                    disabled={saving || !playingTodayTeams.includes(selectedPlayer.club)}
                    title="Activate the Daily Joker for this player — they become exempt from the 3-per-country limit today"
                    className={`w-full py-3 text-[11px] font-black uppercase tracking-widest rounded-sm transition-all ${
                      playingTodayTeams.includes(selectedPlayer.club)
                        ? 'bg-purple text-white hover:bg-purple/90 shadow-[0_0_12px_rgba(168,85,247,0.3)]'
                        : 'bg-surface border border-border text-text-tertiary cursor-not-allowed opacity-50'
                    }`}
                    style={{ fontFamily: 'Barlow Condensed, sans-serif' }}
                  >
                    {playingTodayTeams.includes(selectedPlayer.club)
                      ? '🃏 Activate Daily Joker'
                      : '❌ Not Playing Today'}
                  </button>
                  <p className="mt-1.5 text-[9px] text-center text-text-tertiary uppercase tracking-normal">
                    1 Joker per day · Country limit exempt · Locked once set
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Swap mode banner ──────────────────────────────────── */}
      {swapMode && (
        <div className="fixed bottom-0 left-0 right-0 lg:left-[200px] bg-positive text-black z-50 px-5 py-3 flex justify-between items-center shadow-2xl">
          <div>
            <div className="font-black text-[11px] uppercase tracking-widest" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
              Select a {selectedIsBench ? 'starter' : 'bench player'} to swap
            </div>
            <div className="text-[10px] opacity-70 mt-0.5">Swapping: {selectedPlayer?.name}</div>
          </div>
          <button
            onClick={() => { setSwapMode(false); setSelectedPlayer(null); }}
            className="px-4 py-1.5 bg-black/20 font-bold uppercase text-[10px] tracking-widest rounded-sm"
          >
            Cancel
          </button>
        </div>
      )}
        {/* ══ JOKER PICKER MODAL ═══════════════════════════════════ */}
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
              <div className="p-3 bg-bg flex items-center gap-2 border-b border-border">
                <span className="text-[10px] text-text-tertiary uppercase tracking-widest font-black">Playing Today:</span>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {playingTodayTeams.map(t => (
                    <span key={t} className="px-2 py-0.5 bg-surface border border-border rounded-full text-[9px] text-white font-bold">{t}</span>
                  ))}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                <JokerList 
                  teams={playingTodayTeams} 
                  onSelect={handleJokerSelection} 
                  saving={saving}
                />
              </div>
              <div className="p-4 border-t border-border bg-surface text-[9px] text-text-tertiary uppercase text-center tracking-widest">
                This selection is independent of your 15-man squad and ignores country limits.
              </div>
            </div>
          </div>
        )}
      </div>
    );
}

// ── Supporting UI: Joker List ───────────────────────────────────────────────
function JokerList({ teams, onSelect, saving }) {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPickerPlayers = async () => {
      try {
        const { data, error } = await supabase
          .from('players')
          .select('*')
          .in('club', teams)
          .order('price', { ascending: false });
        if (error) throw error;
        setPlayers(data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    if (teams.length) fetchPickerPlayers();
    else setLoading(false);
  }, [teams]);

  if (loading) return <div className="p-10 text-center fz-label text-text-tertiary animate-scan uppercase">Scouting Active Teams...</div>;
  if (!players.length) return <div className="p-10 text-center fz-label text-text-tertiary uppercase">No matches found for today</div>;

  return (
    <div className="space-y-1">
      {players.map(p => (
        <button 
          key={p.id}
          onClick={() => onSelect(p)}
          disabled={saving}
          className="w-full flex items-center gap-3 p-3 bg-bg border border-border hover:border-purple/50 rounded-sm transition-all group"
        >
          <div className="w-10 h-10 rounded-full border border-border flex items-center justify-center font-bold text-[10px] text-white bg-surface shrink-0 group-hover:border-purple/30">
            {p.club.substring(0,3)}
          </div>
          <div className="flex-1 text-left">
            <div className="text-[13px] font-bold text-white group-hover:text-purple transition-colors">{p.name}</div>
            <div className="text-[9px] text-text-tertiary uppercase tracking-tighter">{p.position} · {p.club}</div>
          </div>
          <div className="text-right">
            <div className="text-[13px] font-black text-cyan tabular-nums">${p.price}M</div>
            <div className="text-[8px] text-positive font-bold uppercase tracking-widest">PICK</div>
          </div>
        </button>
      ))}
    </div>
  );
}
