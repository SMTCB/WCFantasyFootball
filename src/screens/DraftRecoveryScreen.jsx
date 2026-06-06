import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { normalisePlayers } from '../lib/players';
import { useAuth } from '../hooks/useAuth';
import { useRelaxationState } from '../hooks/useRelaxationState';
import { useLeagueConfig } from '../hooks/useLeagueConfig';

const POS_CONFIG = {
  GK:  { label: 'GK',  color: 'var(--gold)', bg: 'rgba(240,180,0,0.14)'  },
  DEF: { label: 'DEF', color: 'var(--cyan)', bg: 'rgba(0,196,232,0.14)'  },
  MID: { label: 'MID', color: 'var(--pos-gk)', bg: 'rgba(157,95,245,0.14)' },
  FWD: { label: 'FWD', color: 'var(--danger)', bg: 'rgba(240,58,58,0.14)'  },
};

const POS_FILTER_ORDER = ['ALL', 'GK', 'DEF', 'MID', 'FWD'];

function normalisePos(p) {
  const s = (p ?? '').toUpperCase().trim();
  if (s === 'FW' || s === 'FWD') return 'FWD';
  return s || 'MID';
}

export default function DraftRecoveryScreen() {
  const { leagueId } = useParams();
  const navigate     = useNavigate();
  const { user }     = useAuth();
  const relaxation   = useRelaxationState(leagueId);

  // Competition-agnostic config from the leagues row
  const cfg           = useLeagueConfig(leagueId);
  const SQUAD_POS_CAPS  = cfg.positionLimits;
  const SQUAD_SIZE      = cfg.squadSize;
  const BUDGET_TOTAL    = cfg.budgetTotal;

  const [allocation,  setAllocation]  = useState(null);  // draft_allocations row
  const [squad,       setSquad]       = useState([]);     // current player objects in squad
  const [allPlayers,  setAllPlayers]  = useState([]);     // full player pool
  const [takenIds,    setTakenIds]    = useState(new Set()); // allocated across whole league
  const [filterPos,   setFilterPos]   = useState('ALL');
  const [search,      setSearch]      = useState('');
  const [loading,     setLoading]     = useState(true);
  const [picking,     setPicking]     = useState(null);   // player id being claimed
  const [error,       setError]       = useState(null);
  const [done,        setDone]        = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // Load available players — RPC respects cup pool restriction.
        // Falls back to full pool for non-cup leagues (no cup_active_clubs rows).
        const [{ data: pData }, { data: leagueRow }] = await Promise.all([
          supabase.rpc('get_cup_available_players', { p_league_id: leagueId }),
          supabase.from('leagues').select('cup_phase').eq('id', leagueId).maybeSingle(),
        ]);
        const players = normalisePlayers(pData ?? []);
        setAllPlayers(players);

        // Derive the draft phase from cup_phase:
        // pre_elimination or beyond → knockout recovery; otherwise → group recovery
        const KO_PHASES = ['pre_elimination', 'round_of_16', 'quarter_final', 'semi_final', 'final'];
        const derivedPhase = KO_PHASES.includes(leagueRow?.cup_phase) ? 'knockout' : 'group';

        // Load this manager's allocation for the current phase
        const { data: alloc } = await supabase
          .from('draft_allocations')
          .select('*')
          .eq('league_id', leagueId)
          .eq('user_id', user?.id)
          .eq('phase', derivedPhase)
          .maybeSingle();

        setAllocation(alloc ?? null);

        const myPlayerIds = alloc?.allocated_players ?? [];
        const myPlayers   = myPlayerIds
          .map(id => players.find(p => p.id === id))
          .filter(Boolean)
          .map(p => ({ ...p, position: normalisePos(p.position) }));
        setSquad(myPlayers);

        if (myPlayers.length >= SQUAD_SIZE) setDone(true);

        // Load all taken player ids across the league
        await refreshTakenIds(myPlayerIds);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  // refreshTakenIds is stable (no deps change its identity); SQUAD_SIZE derives from leagueId
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, user?.id]);

  // Supabase realtime — update takenIds when another manager claims a player
  useEffect(() => {
    if (!leagueId) return;
    const channel = supabase
      .channel(`draft-recovery-${leagueId}`)
      .on('postgres_changes', {
        event:  '*',
        schema: 'public',
        table:  'draft_allocations',
        filter: `league_id=eq.${leagueId}`,
      }, () => { refreshTakenIds(); })
      .subscribe();
    return () => supabase.removeChannel(channel);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId]);

  const refreshTakenIds = async (myIds) => {
    const { data: allocRows } = await supabase
      .from('draft_allocations')
      .select('allocated_players, user_id')
      .eq('league_id', leagueId);

    const taken = new Set();
    for (const row of allocRows ?? []) {
      // Don't mark my own players as taken — I already hold them
      if (row.user_id === user?.id) continue;
      for (const pid of row.allocated_players ?? []) taken.add(pid);
    }
    // Also mark my own current squad as unavailable to re-add
    for (const pid of myIds ?? squad.map(p => p.id)) taken.add(pid);
    setTakenIds(taken);
  };

  // Derived squad stats
  const posCounts = useMemo(() =>
    squad.reduce((acc, p) => {
      const pos = normalisePos(p.position);
      return { ...acc, [pos]: (acc[pos] ?? 0) + 1 };
    }, {}),
    [squad]
  );

  const budgetUsed = useMemo(() =>
    squad.reduce((sum, p) => sum + (p.price ?? 0), 0),
    [squad]
  );
  const budgetLeft  = BUDGET_TOTAL - budgetUsed;
  // slotsLeft drives canPick() logic — always computed from live squad state.
  // displaySlots uses the DB-authoritative unresolved_slots when no picks have
  // been made yet, which avoids showing SQUAD_SIZE (15) when player-ID
  // mismatches prevent allocated players from resolving in the local pool.
  const slotsLeft    = SQUAD_SIZE - squad.length;
  const displaySlots = allocation
    ? Math.min(slotsLeft, allocation.unresolved_slots ?? slotsLeft)
    : slotsLeft;

  // Missing positions (what still needs to be filled)
  const missingPositions = useMemo(() => {
    const missing = [];
    for (const [pos, cap] of Object.entries(SQUAD_POS_CAPS)) {
      const have = posCounts[pos] ?? 0;
      const need = cap - have;
      if (need > 0) missing.push({ pos, need });
    }
    return missing;
  }, [posCounts]);

  // Filtered available pool
  const available = useMemo(() => {
    return allPlayers
      .filter(p => {
        const pos = normalisePos(p.position);
        if (takenIds.has(p.id))                    return false;
        if (filterPos !== 'ALL' && pos !== filterPos) return false;
        if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      })
      .map(p => ({ ...p, position: normalisePos(p.position) }));
  }, [allPlayers, takenIds, filterPos, search]);

  const canPick = (player) => {
    if (squad.length >= SQUAD_SIZE)                              return false;
    if (budgetLeft < player.price)                              return false;
    if ((posCounts[player.position] ?? 0) >= SQUAD_POS_CAPS[player.position]) return false;
    return true;
  };

  const pickPlayer = async (player) => {
    if (!canPick(player) || picking) return;
    setPicking(player.id);
    setError(null);
    try {
      // Optimistic update
      setSquad(prev => [...prev, player]);
      setTakenIds(prev => new Set([...prev, player.id]));

      // All allocation + squad materialization happens server-side in claim_draft_player:
      // it takes a per-league advisory lock (so two managers can't claim the same player),
      // re-validates ownership / budget / position caps / global uniqueness, appends the
      // pick, and writes the squads row once complete. Direct writes to draft_allocations
      // and squads are no longer permitted to the client (migration 123).
      const { data: res, error: err } = await supabase.rpc('claim_draft_player', {
        p_league_id: leagueId,
        p_player_id: player.id,
        p_phase:     allocation?.phase ?? 'group',
      });

      if (err || !res?.ok) {
        // Rollback optimistic update
        setSquad(prev => prev.filter(p => p.id !== player.id));
        setTakenIds(prev => { const s = new Set(prev); s.delete(player.id); return s; });
        setError(res?.error || 'Could not draft that player. Choose another.');
        return;
      }

      if (res.done) setDone(true);
    } finally {
      setPicking(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="text-[#9E9E9E] text-[12px] font-bold uppercase tracking-widest animate-pulse">
          Loading...
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center px-6 gap-6">
        <div className="text-[40px]">✅</div>
        <div className="text-center">
          <div className="text-white font-black text-xl uppercase tracking-widest mb-2">
            Squad Complete
          </div>
          <div className="text-[#9E9E9E] text-[12px]">
            All {SQUAD_SIZE} players locked in. Budget used: €{budgetUsed.toFixed(1)}M
          </div>
        </div>
        <button
          onClick={() => navigate(`/league/${leagueId}`)}
          className="text-cyan text-[11px] uppercase tracking-widest underline"
          style={{ color: '#00B4D8' }}
        >
          Back to League
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col">

      {/* Header */}
      <div className="bg-[#111111] border-b border-[#1E1E1E] px-4 pt-10 pb-4 sticky top-0 z-20">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => navigate(`/league/${leagueId}`)} className="text-[#9E9E9E] text-[20px] leading-none">←</button>
          <div className="text-center">
            <div className="text-[10px] font-black uppercase tracking-[0.4em] text-[#9E9E9E] font-serif">
              Draft Recovery
            </div>
            <div className="text-white font-black text-[15px] uppercase tracking-wider">
              Fill Your Gaps
            </div>
          </div>
          <div className="w-6" />
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-[#FFC107] text-[10px] font-black">{displaySlots}</span>
            <span className="text-[#9E9E9E] text-[10px] uppercase tracking-widest">slots remaining</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[#9E9E9E] text-[10px] uppercase tracking-widest">Budget</span>
            <span className={`text-[10px] font-black ${budgetLeft < 10 ? 'text-[#E53935]' : 'text-[#00C853]'}`}>
              €{budgetLeft.toFixed(1)}M
            </span>
          </div>
        </div>

        {/* Missing positions */}
        {missingPositions.length > 0 && (
          <div className="flex gap-2 mt-2">
            {missingPositions.map(({ pos, need }) => (
              <div key={pos} className="flex items-center gap-1">
                <span
                  className="text-[9px] font-black px-1.5 py-0.5 rounded-sm"
                  style={{ color: POS_CONFIG[pos]?.color, background: POS_CONFIG[pos]?.bg }}
                >
                  {pos}
                </span>
                <span className="text-[#9E9E9E] text-[9px]">×{need}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pool pressure banner — cup leagues only */}
      {!relaxation.loading && relaxation.availablePool !== null && (
        <div
          className="px-4 py-2.5 flex items-center justify-between gap-3 text-[11px] font-bold"
          style={{
            background: relaxation.pressure >= 0.9
              ? 'rgba(240,58,58,0.12)'
              : relaxation.pressure >= 0.7
              ? 'rgba(255,193,7,0.10)'
              : 'rgba(24,201,107,0.08)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div className="flex items-center gap-2">
            <span style={{ color: relaxation.pressure >= 0.9 ? 'var(--danger)' : relaxation.pressure >= 0.7 ? '#FFC107' : 'var(--positive)' }}>
              {relaxation.pressure >= 0.9 ? '🔴' : relaxation.pressure >= 0.7 ? '🟡' : '🟢'}
            </span>
            <span style={{ color: '#9E9E9E' }}>
              Pool pressure{' '}
              <span style={{
                color: relaxation.pressure >= 0.9 ? 'var(--danger)' : relaxation.pressure >= 0.7 ? '#FFC107' : 'var(--positive)',
                fontFamily: 'Archivo Black, sans-serif',
                fontWeight: 900,
              }}>
                {Math.round(relaxation.pressure * 100)}%
              </span>
              {relaxation.repeatsAllowed > 0
                ? ` — ${relaxation.repeatsAllowed} repeat(s) allowed per squad`
                : relaxation.repeatsAllowed === null
                ? ' — no-repeat rule lifted'
                : ' — strict no-repeat'}
            </span>
          </div>
          <span style={{ color: '#555', fontFamily: 'Archivo Black, sans-serif', fontSize: '10px' }}>
            {relaxation.availablePool} available
          </span>
        </div>
      )}

      {/* Alert banner */}
      {allocation ? (
        <div className="bg-[#1A1200] border-b border-[#FFC107]/20 px-4 py-2.5">
          <div className="text-[#FFC107] text-[11px] font-bold">
            ⚠ {displaySlots} player{displaySlots !== 1 ? 's' : ''} couldn't be auto-allocated during the draft — pick them now, first come first served.
          </div>
        </div>
      ) : (
        <div className="bg-[#1A0000] border-b border-[#E53935]/20 px-4 py-2.5">
          <div className="text-[#E53935] text-[11px] font-bold">
            You missed the draft deadline. Build your full squad from what's available — first come first served.
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-2 bg-[#1A0000] border-b border-[#E53935]/20">
          <div className="text-[#E53935] text-[11px] font-bold">{error}</div>
        </div>
      )}

      {/* Player pool */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Search + filter */}
        <div className="px-4 py-2 border-b border-[#1E1E1E] space-y-2">
          <input
            type="text"
            placeholder="Search available players..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-[#111] border border-[#2A2A2A] rounded-sm px-3 py-2 text-white text-[12px] outline-none placeholder:text-[#444] focus:border-[#444]"
          />
          <div className="flex gap-2">
            {POS_FILTER_ORDER.map(pos => (
              <button
                key={pos}
                onClick={() => setFilterPos(pos)}
                className={`flex-1 py-1.5 rounded text-[10px] font-black uppercase tracking-wider transition-all ${
                  filterPos === pos
                    ? 'bg-white text-black'
                    : 'bg-[#111] text-[#555] border border-[#1E1E1E]'
                }`}
              >
                {pos}
              </button>
            ))}
          </div>
        </div>

        {/* Player rows */}
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1.5">
          {available.length === 0 && (
            <div className="text-center py-8 text-[#333] text-[11px] font-bold uppercase tracking-widest">
              No available players
            </div>
          )}
          {available.map(p => {
            const disabled  = !canPick(p);
            const isBusy    = picking === p.id;
            const posAtCap  = (posCounts[p.position] ?? 0) >= SQUAD_POS_CAPS[p.position];
            const overBudget = budgetLeft < p.price;

            return (
              <div
                key={p.id}
                onClick={() => !disabled && !isBusy && pickPlayer(p)}
                className={`flex items-center gap-3 bg-[#111] rounded-sm px-3 py-3 transition-all ${
                  disabled ? 'opacity-35' : 'cursor-pointer active:opacity-70'
                } ${isBusy ? 'animate-pulse' : ''}`}
              >
                <span
                  className="text-[9px] font-black px-1.5 py-0.5 rounded-sm shrink-0"
                  style={{ color: POS_CONFIG[p.position]?.color, background: POS_CONFIG[p.position]?.bg }}
                >
                  {p.position}
                </span>
                <span className="text-white text-[12px] font-bold flex-1 truncate">{p.name}</span>
                <span className="text-[#555] text-[11px] shrink-0">{p.club}</span>
                <span className={`text-[11px] font-bold shrink-0 ${overBudget ? 'text-[#E53935]' : 'text-[#9E9E9E]'}`}>
                  €{p.price}M
                </span>
                {!disabled && (
                  <span className="text-[#00C853] text-[18px] leading-none shrink-0 font-black">+</span>
                )}
                {posAtCap && (
                  <span className="text-[9px] text-[#555] shrink-0 uppercase">cap</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
