import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { normalisePlayers } from '../lib/players';
import { useAuth } from '../hooks/useAuth';

const POS_CONFIG = {
  GK:  { label: 'GK',  color: '#F0B400', bg: 'rgba(240,180,0,0.14)'  },
  DEF: { label: 'DEF', color: '#00C4E8', bg: 'rgba(0,196,232,0.14)'  },
  MID: { label: 'MID', color: '#9D5FF5', bg: 'rgba(157,95,245,0.14)' },
  FWD: { label: 'FWD', color: '#F03A3A', bg: 'rgba(240,58,58,0.14)'  },
};

// Draft list position caps (scaled for 30-slot list, not 15-slot squad)
const DRAFT_POS_CAPS = { GK: 4, DEF: 10, MID: 10, FWD: 6 };
const DRAFT_LIST_SIZE = 30;
const MIN_SUBMIT = 15;

const POS_FILTER_ORDER = ['ALL', 'GK', 'DEF', 'MID', 'FWD'];

function useCountdown(deadline) {
  const [remaining, setRemaining] = useState('');
  useEffect(() => {
    if (!deadline) return;
    const tick = () => {
      const diff = new Date(deadline) - Date.now();
      if (diff <= 0) { setRemaining('CLOSED'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${h}h ${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadline]);
  return remaining;
}

export default function DraftScreen() {
  const { leagueId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [players,     setPlayers]     = useState([]);
  const [list,        setList]        = useState([]);   // ordered player objects
  const [filterPos,   setFilterPos]   = useState('ALL');
  const [search,      setSearch]      = useState('');
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [submitted,   setSubmitted]   = useState(false);
  const [deadline,    setDeadline]    = useState(null);
  const [expandedId,  setExpandedId]  = useState(null);
  const [posRatio,    setPosRatio]    = useState(DRAFT_POS_CAPS);  // from league_config
  const [lastSaved,   setLastSaved]   = useState(null);  // timestamp of last auto-save
  const [saveError,   setSaveError]   = useState(null);
  const autoSaveTimer = useState(null);

  const countdown = useCountdown(deadline);
  const isClosed  = countdown === 'CLOSED';

  useEffect(() => { fetchData(); }, [leagueId]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Load league for deadline
      const { data: league } = await supabase
        .from('leagues')
        .select('draft_deadline')
        .eq('id', leagueId)
        .maybeSingle();
      setDeadline(league?.draft_deadline ?? null);

      // Load league_config ratio (falls back to DRAFT_POS_CAPS if not seeded yet)
      const { data: cfgRows } = await supabase
        .from('league_config')
        .select('config_key, config_value')
        .eq('league_id', leagueId)
        .eq('config_key', 'draft_auto_complete_ratio')
        .maybeSingle();
      if (cfgRows?.config_value) setPosRatio(cfgRows.config_value);

      // Load players — RPC respects cup pool restriction.
      // For non-cup leagues returns the full pool.
      const { data: pData } = await supabase
        .rpc('get_cup_available_players', { p_league_id: leagueId });
      setPlayers(normalisePlayers(pData ?? []));

      // Load existing submission if any
      const { data: sub } = await supabase
        .from('draft_submissions')
        .select('*')
        .eq('league_id', leagueId)
        .eq('user_id', user?.id)
        .maybeSingle();

      if (sub?.player_ids?.length) {
        const ordered = sub.player_ids
          .map(id => normalisePlayers(pData ?? []).find(p => p.id === id))
          .filter(Boolean);
        setList(ordered);
        if (sub.status === 'processed') setSubmitted(true);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Position counts in current list
  const posCounts = useMemo(() =>
    list.reduce((acc, p) => ({ ...acc, [p.position]: (acc[p.position] ?? 0) + 1 }), {}),
    [list]
  );

  // Filtered + searched player pool (excludes already-listed players)
  const listedIds = useMemo(() => new Set(list.map(p => p.id)), [list]);
  const filtered = useMemo(() => {
    return players.filter(p => {
      if (listedIds.has(p.id)) return false;
      if (filterPos !== 'ALL' && p.position !== filterPos) return false;
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [players, listedIds, filterPos, search]);

  const canAdd = (player) => {
    if (list.length >= DRAFT_LIST_SIZE) return false;
    if ((posCounts[player.position] ?? 0) >= DRAFT_POS_CAPS[player.position]) return false;
    return true;
  };

  const addPlayer = (player) => {
    if (!canAdd(player)) return;
    setList(prev => [...prev, player]);
    setExpandedId(null);
  };

  const removePlayer = (id) => {
    setList(prev => prev.filter(p => p.id !== id));
  };

  const moveUp = (idx) => {
    if (idx === 0) return;
    setList(prev => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  };

  const moveDown = (idx) => {
    if (idx === list.length - 1) return;
    setList(prev => {
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  };

  const autoComplete = () => {
    const currentIds  = new Set(list.map(p => p.id));
    const currentCounts = list.reduce(
      (acc, p) => ({ ...acc, [p.position]: (acc[p.position] ?? 0) + 1 }), {}
    );

    // How many more of each position we still need to reach the target ratio
    const slotsNeeded = Object.entries(posRatio).reduce((acc, [pos, target]) => {
      const have = currentCounts[pos] ?? 0;
      const need = Math.max(0, target - have);
      if (need > 0) acc[pos] = need;
      return acc;
    }, {});

    const totalNeeded = Math.min(
      Object.values(slotsNeeded).reduce((a, b) => a + b, 0),
      DRAFT_LIST_SIZE - list.length
    );
    if (totalNeeded === 0) return;

    // Proportionally scale down if we have fewer open slots than needed
    const totalWanted = Object.values(slotsNeeded).reduce((a, b) => a + b, 0);
    const scale = totalNeeded / totalWanted;

    const picks = [];
    for (const [pos, need] of Object.entries(slotsNeeded)) {
      const count   = Math.round(need * scale);
      const pool    = players.filter(p => p.position === pos && !currentIds.has(p.id));
      // Fisher-Yates shuffle then take first `count`
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      shuffled.slice(0, count).forEach(p => {
        currentIds.add(p.id);
        picks.push(p);
      });
    }

    setList(prev => [...prev, ...picks]);
  };

  // Auto-save draft every 30s whenever list changes (status stays 'pending')
  useEffect(() => {
    if (submitted || isClosed || !user?.id || list.length === 0) return;
    const timer = setTimeout(async () => {
      try {
        await supabase.from('draft_submissions').upsert({
          league_id:  leagueId,
          user_id:    user?.id,
          player_ids: list.map(p => p.id),
          status:     'pending',
        }, { onConflict: 'league_id,user_id' });
        setLastSaved(new Date());
        setSaveError(null);
      } catch (err) {
        setSaveError('Auto-save failed — check your connection.');
      }
    }, 30000);
    return () => clearTimeout(timer);
  }, [list, submitted, isClosed]);

  const handleSubmit = async () => {
    if (list.length < MIN_SUBMIT || saving || isClosed) return;
    setSaving(true);
    setSaveError(null);
    try {
      // Validate against server time — client clock may be wrong
      const { data: serverNow } = await supabase.rpc('get_server_time').single().catch(() => ({ data: null }));
      if (serverNow && deadline && new Date(serverNow) >= new Date(deadline)) {
        setSaveError('Draft deadline has passed — submission rejected.');
        return;
      }

      const { error } = await supabase.from('draft_submissions').upsert({
        league_id:    leagueId,
        user_id:      user?.id,
        player_ids:   list.map(p => p.id),
        submitted_at: new Date().toISOString(),
        status:       'pending',
      }, { onConflict: 'league_id,user_id' });

      if (error) throw error;
      setLastSaved(new Date());
      setSubmitted(true);
    } catch (err) {
      setSaveError('Failed to submit — please try again.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="text-[#9E9E9E] text-[12px] font-bold uppercase tracking-widest animate-pulse">
          Loading Draft...
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center px-6 gap-6">
        <div className="text-[40px]">✅</div>
        <div className="text-center">
          <div className="text-white font-black text-xl uppercase tracking-widest mb-2">
            Draft Submitted
          </div>
          <div className="text-[#9E9E9E] text-[12px]">
            {list.length} players ranked. Lottery runs at deadline.
          </div>
        </div>
        <div className="w-full max-w-sm space-y-2">
          {list.map((p, i) => (
            <div key={p.id} className="flex items-center gap-3 bg-[#111] rounded-lg px-3 py-2">
              <span className="text-[#555] text-[11px] font-black w-5">{i + 1}</span>
              <span
                className="text-[9px] font-black px-1.5 py-0.5 rounded-sm"
                style={{ color: POS_CONFIG[p.position]?.color, background: POS_CONFIG[p.position]?.bg }}
              >
                {p.position}
              </span>
              <span className="text-white text-[12px] font-bold flex-1">{p.name}</span>
              <span className="text-[#555] text-[11px]">€{p.price}M</span>
            </div>
          ))}
        </div>
        <button
          onClick={() => setSubmitted(false)}
          className="text-[#9E9E9E] text-[11px] uppercase tracking-widest underline"
        >
          Edit list
        </button>
        <button
          onClick={() => navigate(`/league/${leagueId}`)}
          className="text-cyan text-[11px] uppercase tracking-widest underline"
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
              Draft
            </div>
            <div className="text-white font-black text-[15px] uppercase tracking-wider">
              Build Your List
            </div>
          </div>
          <div className="w-6" />
        </div>

        {/* Deadline + list size */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {isClosed
              ? <span className="text-[#E53935] text-[10px] font-black uppercase tracking-widest">Draft Closed</span>
              : deadline
                ? <>
                    <span className="text-[#9E9E9E] text-[10px] uppercase tracking-widest">Closes in</span>
                    <span className="text-[#FFC107] text-[10px] font-black">{countdown}</span>
                  </>
                : <span className="text-[#555] text-[10px] uppercase tracking-widest">No deadline set</span>
            }
          </div>
          <div className="flex gap-3">
            {Object.entries(DRAFT_POS_CAPS).map(([pos, cap]) => (
              <div key={pos} className="text-center">
                <div className="text-[9px] font-black" style={{ color: POS_CONFIG[pos].color }}>
                  {posCounts[pos] ?? 0}/{cap}
                </div>
                <div className="text-[8px] text-[#555] uppercase">{pos}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col flex-1 overflow-hidden">

        {/* Your ranked list */}
        <div className="px-4 py-3 border-b border-[#1E1E1E]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#9E9E9E]">
              Your List — {list.length}/{DRAFT_LIST_SIZE}
            </span>
            {list.length < MIN_SUBMIT && (
              <span className="text-[9px] text-[#E53935] font-bold">
                Min {MIN_SUBMIT} to submit
              </span>
            )}
          </div>

          {list.length === 0 ? (
            <div className="text-center py-4 text-[#333] text-[11px] font-bold uppercase tracking-widest border border-dashed border-[#222] rounded-lg">
              Add players below — #1 is your highest priority
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-1">
              {list.map((p, idx) => (
                <div key={p.id} className="flex items-center gap-2 bg-[#111] rounded-lg px-2 py-2">
                  <span className="text-[#444] text-[10px] font-black w-4 text-right shrink-0">{idx + 1}</span>
                  <span
                    className="text-[9px] font-black px-1.5 py-0.5 rounded-sm shrink-0"
                    style={{ color: POS_CONFIG[p.position]?.color, background: POS_CONFIG[p.position]?.bg }}
                  >
                    {p.position}
                  </span>
                  <span className="text-white text-[11px] font-bold flex-1 truncate">{p.name}</span>
                  <span className="text-[#444] text-[10px] shrink-0">€{p.price}M</span>
                  {/* Reorder controls */}
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button
                      onClick={() => moveUp(idx)}
                      disabled={idx === 0}
                      className="text-[#444] hover:text-white disabled:opacity-20 text-[10px] leading-none"
                    >▲</button>
                    <button
                      onClick={() => moveDown(idx)}
                      disabled={idx === list.length - 1}
                      className="text-[#444] hover:text-white disabled:opacity-20 text-[10px] leading-none"
                    >▼</button>
                  </div>
                  <button
                    onClick={() => removePlayer(p.id)}
                    className="text-[#333] hover:text-[#E53935] text-[14px] leading-none shrink-0 transition-colors"
                  >✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Player pool */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search + filter */}
          <div className="px-4 py-2 border-b border-[#1E1E1E] space-y-2">
            <input
              type="text"
              placeholder="Search players..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-[#111] border border-[#2A2A2A] rounded-lg px-3 py-2 text-white text-[12px] outline-none placeholder:text-[#444] focus:border-[#444]"
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
            {filtered.length === 0 && (
              <div className="text-center py-8 text-[#333] text-[11px] font-bold uppercase tracking-widest">
                No players found
              </div>
            )}
            {filtered.map(p => {
              const posAtCap = (posCounts[p.position] ?? 0) >= DRAFT_POS_CAPS[p.position];
              const listFull = list.length >= DRAFT_LIST_SIZE;
              const disabled = posAtCap || listFull || isClosed;
              const isExpanded = expandedId === p.id;

              return (
                <div key={p.id}>
                  <div
                    className={`flex items-center gap-3 bg-[#111] rounded-lg px-3 py-2.5 cursor-pointer transition-opacity ${disabled ? 'opacity-40' : 'active:opacity-70'}`}
                    onClick={() => !disabled && setExpandedId(isExpanded ? null : p.id)}
                  >
                    <span
                      className="text-[9px] font-black px-1.5 py-0.5 rounded-sm shrink-0"
                      style={{ color: POS_CONFIG[p.position]?.color, background: POS_CONFIG[p.position]?.bg }}
                    >
                      {p.position}
                    </span>
                    <span className="text-white text-[12px] font-bold flex-1 truncate">{p.name}</span>
                    <span className="text-[#555] text-[11px] shrink-0">{p.club}</span>
                    <span className="text-[#9E9E9E] text-[11px] font-bold shrink-0">€{p.price}M</span>
                    {!disabled && (
                      <span className="text-[#9E9E9E] text-[11px] shrink-0">{isExpanded ? '▲' : '+'}</span>
                    )}
                  </div>
                  {isExpanded && !disabled && (
                    <div className="bg-[#0D0D0D] border border-[#1E1E1E] border-t-0 rounded-b-lg px-3 py-2 flex items-center justify-between">
                      <div className="text-[10px] text-[#9E9E9E]">
                        {p.points > 0 && <span>{p.points} pts · </span>}
                        {p.intel?.status !== 'fit' && (
                          <span className="text-[#FFC107]">{p.intel?.status} · </span>
                        )}
                        <span>#{list.length + 1} priority</span>
                      </div>
                      <button
                        onClick={() => addPlayer(p)}
                        className="bg-cyan text-black text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded active:scale-95 transition-transform"
                        style={{ backgroundColor: '#00B4D8' }}
                      >
                        Add to List
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Save status */}
      {(lastSaved || saveError) && (
        <div className={`px-4 py-1.5 text-center text-[10px] font-bold ${saveError ? 'text-[#E53935]' : 'text-[#555]'}`}>
          {saveError || `Draft saved ${lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
        </div>
      )}

      {/* Bottom action bar */}
      <div className="bg-[#111111] border-t border-[#1E1E1E] px-4 py-4 flex gap-3">
        <button
          onClick={autoComplete}
          disabled={list.length >= DRAFT_LIST_SIZE || isClosed}
          className="flex-1 py-3.5 bg-[#1A1A1A] text-[#9E9E9E] text-[11px] font-black uppercase tracking-widest rounded border border-[#2A2A2A] transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Auto-Complete
        </button>
        <button
          onClick={handleSubmit}
          disabled={list.length < MIN_SUBMIT || saving || isClosed}
          className="flex-1 py-3.5 text-[11px] font-black uppercase tracking-widest rounded transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
          style={{
            background: list.length >= MIN_SUBMIT && !isClosed ? '#00C853' : undefined,
            color:      list.length >= MIN_SUBMIT && !isClosed ? '#000' : '#555',
            backgroundColor: list.length < MIN_SUBMIT || isClosed ? '#1A1A1A' : undefined,
          }}
        >
          {saving ? 'Saving...' : isClosed ? 'Draft Closed' : `Submit (${list.length}/${MIN_SUBMIT})`}
        </button>
      </div>
    </div>
  );
}
