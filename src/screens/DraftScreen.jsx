import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { normalisePlayers } from '../lib/players';
import { useAuth } from '../hooks/useAuth';
import { useRelaxationState } from '../hooks/useRelaxationState';
import { useLeagueConfig } from '../hooks/useLeagueConfig';
import ScoringInfoModal from '../components/ScoringInfoModal';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const POS_CONFIG = {
  GK:  { label: 'GK',  color: 'var(--gold)', bg: 'rgba(240,180,0,0.14)'  },
  DEF: { label: 'DEF', color: 'var(--cyan)', bg: 'rgba(0,196,232,0.14)'  },
  MID: { label: 'MID', color: 'var(--pos-gk)', bg: 'rgba(157,95,245,0.14)' },
  FWD: { label: 'FWD', color: 'var(--danger)', bg: 'rgba(240,58,58,0.14)'  },
};

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

// ─── Sortable list row ────────────────────────────────────────────────────────
function SortableRow({ p, idx, listLength, onMoveUp, onMoveDown, onRemove }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: p.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity:   isDragging ? 0.4 : 1,
    zIndex:    isDragging ? 1 : 'auto',
  };

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, touchAction: 'none', userSelect: 'none' }}
      {...attributes}
      {...listeners}
      className="flex items-center gap-2 rounded-sm px-2 py-2 cursor-grab active:cursor-grabbing border border-[var(--rule)]"
    style={{ background: 'var(--card)' }}
    >
      {/* Visual drag affordance — the whole row is the grab target */}
      <span
        className="text-[var(--mute)] shrink-0 select-none"
        style={{ fontSize: 13, lineHeight: 1, padding: '0 2px', fontWeight: 900 }}
        aria-hidden="true"
      >
        ⠿
      </span>
      <span className="text-[var(--mute)] text-[10px] font-black w-4 text-right shrink-0">{idx + 1}</span>
      <span
        className="text-[9px] font-black px-1.5 py-0.5 rounded-sm shrink-0"
        style={{ color: POS_CONFIG[p.position]?.color, background: POS_CONFIG[p.position]?.bg }}
      >
        {p.position}
      </span>
      <span className="text-[var(--paper)] text-[11px] font-bold flex-1 truncate">{p.name}</span>
      <span className="text-[var(--mute)] text-[10px] shrink-0">€{p.price}M</span>
      {/* ▲▼ kept as fallback — useful on desktop and for accessibility */}
      <div className="flex flex-col gap-0.5 shrink-0">
        <button
          onClick={() => onMoveUp(idx)}
          disabled={idx === 0}
          className="text-[var(--mute)] hover:text-[var(--paper)] disabled:opacity-20 text-[10px] leading-none"
        >▲</button>
        <button
          onClick={() => onMoveDown(idx)}
          disabled={idx === listLength - 1}
          className="text-[var(--mute)] hover:text-[var(--paper)] disabled:opacity-20 text-[10px] leading-none"
        >▼</button>
      </div>
      <button
        onClick={() => onRemove(p.id)}
        className="text-[var(--mute)] hover:text-[var(--danger)] text-[14px] leading-none shrink-0 transition-colors"
      >✕</button>
    </div>
  );
}

export default function DraftScreen() {
  const { leagueId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [players,     setPlayers]     = useState([]);
  const [list,        setList]        = useState([]);   // ordered player objects
  const [filterPos,      setFilterPos]      = useState('ALL');
  const [filterClubs,    setFilterClubs]    = useState(new Set());
  const [clubSearch,     setClubSearch]     = useState('');
  const [showClubPicker, setShowClubPicker] = useState(false);
  const [search,         setSearch]         = useState('');
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [submitted,   setSubmitted]   = useState(false);
  const [isProcessed, setIsProcessed] = useState(false);
  const [deadline,    setDeadline]    = useState(null);
  const [expandedId,  setExpandedId]  = useState(null);
  const [lastSaved,   setLastSaved]   = useState(null);  // timestamp of last auto-save
  const [saveError,   setSaveError]   = useState(null);
  const [phase,       setPhase]       = useState('group'); // 'group' | 'knockout'
  const dirtyRef = useRef(false); // U23: heartbeat dirty flag
  const [showScoringModal, setShowScoringModal] = useState(false);

  const countdown  = useCountdown(deadline);
  const relaxation = useRelaxationState(leagueId);

  // Competition-agnostic config from the leagues row
  const cfg             = useLeagueConfig(leagueId);
  const DRAFT_POS_CAPS  = cfg.draftPositionCaps;   // kept for display info only — not enforced
  const DRAFT_LIST_SIZE = cfg.draftListSize;
  const MIN_SUBMIT      = 1;                        // any size list can be submitted

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // Load league for deadline + cup_phase (needed to determine submission phase)
        const { data: league } = await supabase
          .from('leagues')
          .select('draft_deadline, knockout_draft_deadline, cup_phase')
          .eq('id', leagueId)
          .maybeSingle();
        // group_stage means group allocation ran → next submission is for knockout
        const derivedPhase = league?.cup_phase === 'group_stage' ? 'knockout' : 'group';
        // Show the deadline relevant to the current phase
        const activeDeadline = derivedPhase === 'knockout'
          ? (league?.knockout_draft_deadline ?? league?.draft_deadline)
          : (league?.draft_deadline ?? null);
        setDeadline(activeDeadline);
        setPhase(derivedPhase);

        // Load players — RPC respects cup pool restriction.
        // For non-cup leagues returns the full pool.
        const { data: pData } = await supabase
          .rpc('get_cup_available_players', { p_league_id: leagueId });
        const normalised = normalisePlayers(pData ?? []);
        const seen = new Set();
        setPlayers(normalised.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; }));

        // Load existing submission for the current phase
        const { data: sub } = await supabase
          .from('draft_submissions')
          .select('*')
          .eq('league_id', leagueId)
          .eq('user_id', user?.id)
          .eq('phase', derivedPhase)
          .maybeSingle();

        if (sub?.player_ids?.length) {
          const ordered = sub.player_ids
            .map(id => normalisePlayers(pData ?? []).find(p => p.id === id))
            .filter(Boolean);
          setList(ordered);
          if (sub.status === 'processed') {
            setSubmitted(true);
            setIsProcessed(true);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [leagueId, user?.id]);

  // If the lottery has already been processed, redirect straight to squad management
  useEffect(() => {
    if (isProcessed) navigate(`/league/${leagueId}`);
  }, [isProcessed, leagueId, navigate]);

  // Position counts in current list
  const posCounts = useMemo(() =>
    list.reduce((acc, p) => ({ ...acc, [p.position]: (acc[p.position] ?? 0) + 1 }), {}),
    [list]
  );

  // Sorted unique club list for the club filter
  const clubs = useMemo(() => {
    const names = [...new Set(players.map(p => p.club).filter(Boolean))].sort();
    return names;
  }, [players]);

  // Filtered + searched player pool (excludes already-listed players)
  const listedIds = useMemo(() => new Set(list.map(p => p.id)), [list]);
  const filtered = useMemo(() => {
    return players.filter(p => {
      if (listedIds.has(p.id)) return false;
      if (filterPos !== 'ALL' && p.position !== filterPos) return false;
      if (filterClubs.size > 0 && !filterClubs.has(p.club)) return false;
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [players, listedIds, filterPos, filterClubs, search]);

  const canAdd = () => {
    if (list.length >= DRAFT_LIST_SIZE) return false;
    return true;
  };

  const addPlayer = (player) => {
    if (!canAdd(player)) return;
    setList(prev => {
      if (prev.some(p => p.id === player.id)) return prev; // guard against double-tap
      return [...prev, player];
    });
    dirtyRef.current = true; // U23: mark dirty on list change
    setExpandedId(null);
  };

  const removePlayer = (id) => {
    setList(prev => prev.filter(p => p.id !== id));
    dirtyRef.current = true; // U23: mark dirty on list change
  };

  const moveUp = (idx) => {
    if (idx === 0) return;
    setList(prev => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
    dirtyRef.current = true; // U23: mark dirty on reorder
  };

  const moveDown = (idx) => {
    if (idx === list.length - 1) return;
    setList(prev => {
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
    dirtyRef.current = true; // U23: mark dirty on reorder
  };

  // ─── Drag-and-drop sensors ────────────────────────────────────────────────
  // PointerSensor covers mouse + stylus; TouchSensor activates after a 250ms
  // press so normal scroll still works on mobile.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 250, tolerance: 5 } }),
  );
  const [activePlayer, setActivePlayer] = useState(null);

  const handleDragStart = ({ active }) => {
    setActivePlayer(list.find(p => p.id === active.id) ?? null);
  };

  const handleDragEnd = ({ active, over }) => {
    setActivePlayer(null);
    if (!over || active.id === over.id) return;
    setList(prev => {
      const oldIdx = prev.findIndex(p => p.id === active.id);
      const newIdx = prev.findIndex(p => p.id === over.id);
      return arrayMove(prev, oldIdx, newIdx);
    });
    dirtyRef.current = true;
  };

  const autoComplete = () => {
    const currentIds = new Set(list.map(p => p.id));
    const remaining  = DRAFT_LIST_SIZE - list.length;
    if (remaining <= 0) return;

    // U24: respect position caps when auto-filling
    const currentPosCounts = { ...posCounts }; // copy current counts
    const available = players.filter(p => !currentIds.has(p.id));
    const shuffled  = [...available].sort(() => Math.random() - 0.5);

    const picks = [];
    for (const p of shuffled) {
      if (picks.length >= remaining) break;
      const pos = p.position;
      const cap = DRAFT_POS_CAPS[pos];
      // Only add if position cap exists and not yet full
      if (cap !== undefined && (currentPosCounts[pos] ?? 0) < cap) {
        picks.push(p);
        currentPosCounts[pos] = (currentPosCounts[pos] ?? 0) + 1;
      }
    }

    dirtyRef.current = true; // U23: mark dirty
    setList(prev => [...prev, ...picks]);
  };

  // Auto-save draft 3s after list stops changing (was 30s — too slow for quick navigators)
  useEffect(() => {
    if (submitted || !user?.id || list.length === 0) return;
    const playerIds = list.map(p => p.id);
    const timer = setTimeout(async () => {
      try {
        await supabase.from('draft_submissions').upsert({
          league_id:  leagueId,
          user_id:    user?.id,
          phase,
          player_ids: playerIds,
          status:     'pending',
        }, { onConflict: 'league_id,user_id,phase' });
        setLastSaved(new Date());
        setSaveError(null);
        dirtyRef.current = false;
      } catch (autoSaveErr) {
        console.warn('Auto-save failed:', autoSaveErr);
        setSaveError('Auto-save failed — check your connection.');
      }
    }, 3000);
    // Fire-and-forget save on navigate-away: if the timer hasn't fired yet,
    // kick off the request anyway. The fetch outlives the component.
    return () => {
      clearTimeout(timer);
      if (dirtyRef.current) {
        supabase.from('draft_submissions').upsert({
          league_id:  leagueId,
          user_id:    user?.id,
          phase,
          player_ids: playerIds,
          status:     'pending',
        }, { onConflict: 'league_id,user_id,phase' }).then(null, () => {});
      }
    };
  }, [list, submitted, leagueId, user?.id, phase]);

  // U23: 2-minute heartbeat — saves if dirty regardless of whether list changed recently.
  // Prevents the 30s debounce from never firing during continuous editing.
  useEffect(() => {
    if (submitted || !user?.id) return;
    const saveIfDirty = async () => {
      if (!dirtyRef.current || list.length === 0) return;
      try {
        await supabase.from('draft_submissions').upsert({
          league_id:  leagueId,
          user_id:    user?.id,
          phase,
          player_ids: list.map(p => p.id),
          status:     'pending',
        }, { onConflict: 'league_id,user_id,phase' });
        setLastSaved(new Date());
        setSaveError(null);
        dirtyRef.current = false;
      } catch (hbErr) {
        console.warn('Heartbeat save failed:', hbErr);
      }
    };
    const hb = setInterval(saveIfDirty, 30_000);
    return () => clearInterval(hb);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted, leagueId, user?.id]);

  const handleSubmit = async () => {
    if (list.length === 0 || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { error } = await supabase.from('draft_submissions').upsert({
        league_id:    leagueId,
        user_id:      user?.id,
        phase,
        player_ids:   list.map(p => p.id),
        submitted_at: new Date().toISOString(),
        status:       'pending',
      }, { onConflict: 'league_id,user_id,phase' });

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
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
        <div className="text-[var(--mute)] text-[12px] font-bold uppercase tracking-widest animate-pulse">
          Loading Draft...
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-6 gap-6">
        <div className="text-[40px]">✅</div>
        <div className="text-center">
          <div className="text-[var(--paper)] font-black text-xl uppercase tracking-widest mb-2">
            Draft Submitted
          </div>
          <div className="text-[var(--mute)] text-[12px]">
            {list.length} players ranked. Lottery runs when the admin triggers it.
          </div>
        </div>
        <div className="w-full max-w-sm space-y-2">
          {list.map((p, i) => (
            <div key={p.id} className="flex items-center gap-3 bg-[var(--card)] rounded-sm px-3 py-2">
              <span className="text-[var(--mute)] text-[11px] font-black w-5">{i + 1}</span>
              <span
                className="text-[9px] font-black px-1.5 py-0.5 rounded-sm"
                style={{ color: POS_CONFIG[p.position]?.color, background: POS_CONFIG[p.position]?.bg }}
              >
                {p.position}
              </span>
              <span className="text-[var(--paper)] text-[12px] font-bold flex-1">{p.name}</span>
              <span className="text-[var(--mute)] text-[11px]">€{p.price}M</span>
            </div>
          ))}
        </div>
        {isProcessed ? (
          <div className="text-[var(--mute)] text-[11px] uppercase tracking-widest">
            Lottery complete — list locked
          </div>
        ) : (
          <button
            onClick={() => setSubmitted(false)}
            className="text-[var(--mute)] text-[11px] uppercase tracking-widest underline"
          >
            Edit list
          </button>
        )}
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
    <div className="min-h-screen bg-[var(--bg)] flex flex-col">

      {/* Header */}
      <div className="bg-[var(--shell)] border-b border-[var(--rule)] px-4 pt-10 pb-4 sticky top-0 z-20">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => navigate(`/league/${leagueId}`)} className="text-[var(--mute)] text-[20px] leading-none">←</button>
          <div className="text-center">
            <div className="text-[10px] font-black uppercase tracking-[0.4em] text-[var(--mute)] font-serif">
              Draft
            </div>
            <div className="text-[var(--paper)] font-black text-[15px] uppercase tracking-wider">
              Build Your List
            </div>
          </div>
          <div className="w-6" />
        </div>

        {/* Deadline + list size */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {deadline
              ? countdown === 'CLOSED'
                ? <span className="text-[var(--mute)] text-[10px] uppercase tracking-widest">Submission window closed</span>
                : <>
                    <span className="text-[var(--mute)] text-[10px] uppercase tracking-widest">Suggested deadline in</span>
                    <span className="text-[10px] font-black" style={{ color: 'var(--warn)' }}>{countdown}</span>
                  </>
              : <span className="text-[var(--mute)] text-[10px] uppercase tracking-widest">Open until lottery runs</span>
            }
          </div>
          <div className="flex gap-3">
            {['GK', 'DEF', 'MID', 'FWD'].map(pos => (
              <div key={pos} className="text-center">
                <div className="text-[9px] font-black" style={{ color: POS_CONFIG[pos].color }}>
                  {posCounts[pos] ?? 0}
                </div>
                <div className="text-[8px] text-[var(--mute)] uppercase">{pos}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pool pressure banner — cup leagues only */}
      {!relaxation.loading && relaxation.availablePool !== null && (
        <div
          className="px-4 py-2.5 flex items-center justify-between gap-3 text-[11px] font-bold"
          style={{
            background: relaxation.pressure >= 0.9
              ? 'var(--neg-bg)'
              : relaxation.pressure >= 0.7
              ? 'rgba(184,114,14,0.10)'
              : 'var(--pos-bg)',
            borderBottom: '1px solid var(--rule)',
          }}
        >
          <div className="flex items-center gap-2">
            <span style={{
              color: relaxation.pressure >= 0.9 ? 'var(--danger)'
                   : relaxation.pressure >= 0.7 ? 'var(--warn)'
                   : 'var(--positive)',
            }}>
              {relaxation.pressure >= 0.9 ? '🔴' : relaxation.pressure >= 0.7 ? '🟡' : '🟢'}
            </span>
            <span style={{ color: 'var(--mute)' }}>
              Pool pressure{' '}
              <span style={{
                color: relaxation.pressure >= 0.9 ? 'var(--danger)'
                     : relaxation.pressure >= 0.7 ? 'var(--warn)'
                     : 'var(--positive)',
                fontFamily: 'Archivo Black, sans-serif',
                fontWeight: 900,
              }}>
                {Math.round(relaxation.pressure * 100)}%
              </span>
              {relaxation.repeatsAllowed > 0
                ? ` — ${relaxation.repeatsAllowed} repeat${relaxation.repeatsAllowed > 1 ? 's' : ''} allowed per squad`
                : relaxation.repeatsAllowed === null
                ? ' — no-repeat rule lifted'
                : ' — strict no-repeat'}
            </span>
          </div>
          <span style={{ color: 'var(--mute)', fontFamily: 'Archivo Black, sans-serif', fontSize: '10px' }}>
            {relaxation.availablePool} players available
          </span>
        </div>
      )}

      <div className="flex flex-col flex-1 overflow-hidden">

        {/* Your ranked list */}
        <div className="px-4 py-3 border-b border-[var(--rule)]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--mute)]">
                Your List — {list.length}/{DRAFT_LIST_SIZE}
              </span>
              <button
                onClick={() => setShowScoringModal(true)}
                style={{ background: 'none', border: '1px solid var(--rule)', color: 'var(--mute)', fontFamily: 'Archivo Black, sans-serif', fontSize: 9, width: 18, height: 18, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                title="Scoring overview"
              >?</button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={autoComplete}
                disabled={list.length >= DRAFT_LIST_SIZE}
                className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 border border-[var(--rule)] text-[var(--mute)] bg-[var(--elev)] disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition-transform"
              >
                ⚡ Auto-Fill
              </button>
              <button
                onClick={handleSubmit}
                disabled={list.length === 0 || saving}
                className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition-transform"
                style={{
                  background: list.length > 0 ? 'var(--positive)' : 'var(--elev)',
                  color:      list.length > 0 ? '#fff'            : 'var(--mute)',
                  border:     list.length > 0 ? 'none'            : '1px solid var(--rule)',
                }}
              >
                {saving ? '...' : `Submit (${list.length})`}
              </button>
            </div>
          </div>

          {list.length === 0 ? (
            <div className="text-center py-4 text-[var(--mute)] text-[11px] font-bold uppercase tracking-widest border border-dashed border-[var(--rule)] rounded-sm">
              Add up to {DRAFT_LIST_SIZE} players — #1 is your highest priority
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              modifiers={[({ transform }) => ({ ...transform, x: 0 })]}
            >
              <SortableContext
                items={list.map(p => p.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-1">
                  {list.map((p, idx) => (
                    <SortableRow
                      key={p.id}
                      p={p}
                      idx={idx}
                      listLength={list.length}
                      onMoveUp={moveUp}
                      onMoveDown={moveDown}
                      onRemove={removePlayer}
                    />
                  ))}
                </div>
              </SortableContext>
              {/* Floating ghost row shown while dragging — fixed width so it
                  doesn't expand to full viewport inside the portal */}
              <DragOverlay>
                {activePlayer && (
                  <div
                    className="flex items-center gap-2 bg-[var(--elev)] border border-[var(--rule)] rounded-sm px-2 py-2 shadow-xl"
                    style={{ width: '320px', maxWidth: '85vw' }}
                  >
                    <span className="text-[var(--mute)] shrink-0 select-none" style={{ fontSize: 13, fontWeight: 900 }}>⠿</span>
                    <span
                      className="text-[9px] font-black px-1.5 py-0.5 rounded-sm shrink-0"
                      style={{ color: POS_CONFIG[activePlayer.position]?.color, background: POS_CONFIG[activePlayer.position]?.bg }}
                    >
                      {activePlayer.position}
                    </span>
                    <span className="text-[var(--paper)] text-[11px] font-bold truncate flex-1">{activePlayer.name}</span>
                    <span className="text-[var(--mute)] text-[10px] shrink-0">€{activePlayer.price}M</span>
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          )}
        </div>

        {/* Player pool */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search + filter */}
          <div className="px-4 py-2 border-b border-[var(--rule)] space-y-2">
            <input
              type="text"
              placeholder="Search players..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-[var(--card)] border border-[var(--rule)] rounded-sm px-3 py-2 text-[var(--paper)] text-[12px] outline-none placeholder:text-[var(--mute)] focus:border-[var(--rule)]"
            />
            <div className="flex gap-2">
              {POS_FILTER_ORDER.map(pos => (
                <button
                  key={pos}
                  onClick={() => setFilterPos(pos)}
                  className={`flex-1 py-1.5 rounded text-[10px] font-black uppercase tracking-wider transition-all ${
                    filterPos === pos
                      ? 'bg-white text-black'
                      : 'bg-[var(--card)] text-[var(--mute)] border border-[var(--rule)]'
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>
            {/* Club filter — dropdown multi-select */}
            {clubs.length > 1 && (
              <div className="relative">
                <button
                  onClick={() => setShowClubPicker(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-sm text-[10px] font-black uppercase tracking-wider transition-all"
                  style={{
                    background: filterClubs.size > 0 ? 'var(--accent-bg)' : 'var(--elev)',
                    border: filterClubs.size > 0 ? '1px solid rgba(26,111,168,0.4)' : '1px solid var(--rule)',
                    color: filterClubs.size > 0 ? 'var(--cyan)' : 'var(--mute)',
                  }}
                >
                  {filterClubs.size > 0 ? `${filterClubs.size} Club${filterClubs.size > 1 ? 's' : ''}` : 'Club ▾'}
                  <span className="text-[8px] opacity-60">{showClubPicker ? '▲' : '▼'}</span>
                </button>

                {showClubPicker && (
                  <div
                    className="absolute left-0 right-0 z-20 rounded-sm mt-1 overflow-hidden"
                    style={{ background: 'var(--card)', border: '1px solid var(--rule)' }}
                  >
                    <div className="p-2">
                      <input
                        type="text"
                        placeholder="Search clubs..."
                        value={clubSearch}
                        onChange={e => setClubSearch(e.target.value)}
                        className="w-full bg-[var(--card)] border border-[var(--rule)] rounded-sm px-2 py-1.5 text-[var(--paper)] text-[10px] outline-none placeholder:text-[var(--mute)]"
                        onClick={e => e.stopPropagation()}
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {clubs
                        .filter(c => !clubSearch || c.toLowerCase().includes(clubSearch.toLowerCase()))
                        .map(club => {
                          const checked = filterClubs.has(club);
                          return (
                            <label
                              key={club}
                              className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-white/5"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => setFilterClubs(prev => {
                                  const next = new Set(prev);
                                  checked ? next.delete(club) : next.add(club);
                                  return next;
                                })}
                                className="accent-cyan-400 w-3 h-3"
                              />
                              <span className="text-[10px] text-[var(--paper)] font-medium tracking-wide flex-1">{club}</span>
                            </label>
                          );
                        })}
                    </div>
                    <div className="flex gap-2 p-2 border-t border-white/5">
                      <button
                        onClick={() => { setFilterClubs(new Set()); setClubSearch(''); }}
                        className="flex-1 py-1.5 text-[9px] font-black uppercase tracking-wider text-[var(--mute)] hover:text-[var(--paper)] transition-colors"
                      >
                        Clear
                      </button>
                      <button
                        onClick={() => { setShowClubPicker(false); setClubSearch(''); }}
                        className="flex-1 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-sm"
                        style={{ background: 'var(--cyan)', color: '#000' }}
                      >
                        {filterClubs.size > 0 ? `Show ${filterClubs.size} Club${filterClubs.size > 1 ? 's' : ''}` : 'Apply'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Player rows */}
          <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1.5">
            {filtered.length === 0 && (
              <div className="text-center py-8 text-[var(--mute)] text-[11px] font-bold uppercase tracking-widest">
                No players found
              </div>
            )}
            {filtered.map(p => {
              const listFull = list.length >= DRAFT_LIST_SIZE;
              const disabled = listFull;
              const isExpanded = expandedId === p.id;

              return (
                <div key={p.id}>
                  <div
                    className={`flex items-center gap-3 bg-[var(--card)] rounded-sm px-3 py-2.5 cursor-pointer transition-opacity ${disabled ? 'opacity-40' : 'active:opacity-70'}`}
                    onClick={() => !disabled && setExpandedId(isExpanded ? null : p.id)}
                  >
                    <span
                      className="text-[9px] font-black px-1.5 py-0.5 rounded-sm shrink-0"
                      style={{ color: POS_CONFIG[p.position]?.color, background: POS_CONFIG[p.position]?.bg }}
                    >
                      {p.position}
                    </span>
                    <span className="text-[var(--paper)] text-[12px] font-bold flex-1 truncate">{p.name}</span>
                    <span className="text-[var(--mute)] text-[11px] shrink-0">{p.club}</span>
                    <span className="text-[var(--mute)] text-[11px] font-bold shrink-0">€{p.price}M</span>
                    {!disabled && (
                      <span className="text-[var(--mute)] text-[11px] shrink-0">{isExpanded ? '▲' : '+'}</span>
                    )}
                  </div>
                  {isExpanded && !disabled && (
                    <div className="border border-[var(--rule)] border-t-0 rounded-b-lg px-3 py-2 flex items-center justify-between" style={{ background: 'var(--elev)' }}>
                      <div className="text-[10px] text-[var(--mute)]">
                        {p.points > 0 && <span>{Math.round(p.points)} pts · </span>}
                        {p.intel?.status !== 'fit' && (
                          <span style={{ color: 'var(--warn)' }}>{p.intel?.status} · </span>
                        )}
                        <span>#{list.length + 1} priority</span>
                      </div>
                      <button
                        onClick={() => addPlayer(p)}
                        className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded active:scale-95 transition-transform"
                        style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
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
        <div className={`px-4 py-1.5 text-center text-[10px] font-bold ${saveError ? 'text-[var(--danger)]' : 'text-[var(--mute)]'}`}>
          {saveError || `Draft saved ${lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
        </div>
      )}

      {/* Bottom action bar */}
      <div className="bg-[var(--shell)] border-t border-[var(--rule)] px-4 py-4">
        <button
          onClick={handleSubmit}
          disabled={list.length === 0 || saving}
          className="w-full py-3.5 text-[11px] font-black uppercase tracking-widest rounded transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
          style={{
            background:      list.length > 0 ? 'var(--positive)' : undefined,
            color:           list.length > 0 ? '#fff'            : 'var(--mute)',
            backgroundColor: list.length === 0 ? 'var(--elev)' : undefined,
          }}
        >
          {saving ? 'Saving...' : list.length === 0 ? 'Add players to your list' : `Submit List (${list.length})`}
        </button>
      </div>
      {showScoringModal && <ScoringInfoModal onClose={() => setShowScoringModal(false)} />}
    </div>
  );
}
