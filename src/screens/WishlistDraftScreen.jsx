import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWishlistDraft } from '../hooks/useWishlistDraft';
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

// ─── Sortable target row ─────────────────────────────────────────────────────
function SortableRow({ p, idx, listLength, onMoveUp, onMoveDown, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity:   isDragging ? 0.4 : 1,
    zIndex:    isDragging ? 1 : 'auto',
  };

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, background: 'var(--card)' }}
      className="flex items-center gap-2 rounded-sm px-2 py-2 border border-[var(--rule)]"
    >
      {/*
        Drag listeners live ONLY on the handle, not the whole row. Two reasons:
        1. `touch-action: none` has to be scoped to the handle — applying it to the
           whole row (as before) killed native swipe-to-scroll anywhere over the
           target list, which made a long wishlist feel broken/unreachable, not
           just "hard to drag".
        2. Keeping listeners off the row means taps on the ▲/▼/✕ buttons below
           are never contested by the drag sensor's pointer capture.
      */}
      <span
        {...attributes}
        {...listeners}
        className="text-[var(--mute)] shrink-0 select-none cursor-grab active:cursor-grabbing flex items-center justify-center"
        style={{ touchAction: 'none', width: 32, height: 32, margin: '-6px 0', fontSize: 18, fontWeight: 900 }}
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
      <div className="flex flex-col shrink-0">
        <button onClick={() => onMoveUp(idx)} disabled={idx === 0}
          style={{ width: 28, height: 22 }}
          className="flex items-center justify-center text-[var(--mute)] hover:text-[var(--paper)] disabled:opacity-20 text-[11px] leading-none">▲</button>
        <button onClick={() => onMoveDown(idx)} disabled={idx === listLength - 1}
          style={{ width: 28, height: 22 }}
          className="flex items-center justify-center text-[var(--mute)] hover:text-[var(--paper)] disabled:opacity-20 text-[11px] leading-none">▼</button>
      </div>
      <button onClick={() => onRemove(p.id)}
        className="text-[var(--mute)] hover:text-[var(--danger)] text-[14px] leading-none shrink-0 transition-colors">✕</button>
    </div>
  );
}

export default function WishlistDraftScreen() {
  const { leagueId } = useParams();
  const navigate = useNavigate();

  const {
    shouldShow, roundNumber, squadPlayers, playerPool,
    existingTargets, existingDrops, maxTargets, maxDrops,
    submissionStatus, submit, loading, saving, error,
  } = useWishlistDraft(leagueId);

  const [targets,     setTargets]     = useState([]);   // ordered player objects
  const [dropIds,     setDropIds]     = useState(new Set());
  const [filterPos,      setFilterPos]      = useState('ALL');
  const [filterClubs,    setFilterClubs]    = useState(new Set());
  const [clubSearch,     setClubSearch]     = useState('');
  const [showClubPicker, setShowClubPicker] = useState(false);
  const [search,         setSearch]         = useState('');
  const [expandedId,     setExpandedId]     = useState(null);
  const [finalized,      setFinalized]      = useState(false);
  const [lastSaved,      setLastSaved]      = useState(null);
  const [saveError,      setSaveError]      = useState(null);
  const [hydrated,       setHydrated]       = useState(false);
  const dirtyRef = useRef(false);

  const isLocked = submissionStatus === 'processed';

  // Hydrate local editing state from the manager's existing submission once
  // the hook finishes loading — playerPool carries full player objects for
  // both target and squad ids.
  useEffect(() => {
    if (loading || hydrated) return;
    const poolMap = Object.fromEntries(playerPool.map(p => [p.id, p]));
    setTargets(existingTargets.map(id => poolMap[id]).filter(Boolean));
    setDropIds(new Set(existingDrops));
    setHydrated(true);
  }, [loading, hydrated, playerPool, existingTargets, existingDrops]);

  const listedIds = useMemo(() => new Set(targets.map(p => p.id)), [targets]);
  const ownedIds  = useMemo(() => new Set(squadPlayers.map(p => p.id)), [squadPlayers]);

  const clubs = useMemo(() => {
    const names = [...new Set(playerPool.map(p => p.club).filter(Boolean))].sort();
    return names;
  }, [playerPool]);

  // Target pool excludes players already owned (nothing to "target" there —
  // use the drop panel to release them) and players already ranked.
  const filteredPool = useMemo(() => {
    return playerPool.filter(p => {
      if (listedIds.has(p.id) || ownedIds.has(p.id)) return false;
      if (filterPos !== 'ALL' && p.position !== filterPos) return false;
      if (filterClubs.size > 0 && !filterClubs.has(p.club)) return false;
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [playerPool, listedIds, ownedIds, filterPos, filterClubs, search]);

  const addTarget = (player) => {
    if (targets.length >= maxTargets) return;
    setTargets(prev => (prev.some(p => p.id === player.id) ? prev : [...prev, player]));
    dirtyRef.current = true;
    setExpandedId(null);
  };

  const removeTarget = (id) => {
    setTargets(prev => prev.filter(p => p.id !== id));
    dirtyRef.current = true;
  };

  const moveUp = (idx) => {
    if (idx === 0) return;
    setTargets(prev => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
    dirtyRef.current = true;
  };

  const moveDown = (idx) => {
    if (idx === targets.length - 1) return;
    setTargets(prev => {
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
    dirtyRef.current = true;
  };

  const toggleDrop = (id) => {
    setDropIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < maxDrops) {
        next.add(id);
      }
      return next;
    });
    dirtyRef.current = true;
  };

  // Both sensors use distance-based activation, not a hold delay: since the
  // touch-action:none listeners now live only on the small grip handle (not
  // the whole row), a touch starting there already signals drag intent, so
  // there's no scroll-vs-drag ambiguity left to resolve with a long-press wait.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor,   { activationConstraint: { distance: 5 } }),
  );
  const [activePlayer, setActivePlayer] = useState(null);

  const handleDragStart = ({ active }) => {
    setActivePlayer(targets.find(p => p.id === active.id) ?? null);
  };

  const handleDragEnd = ({ active, over }) => {
    setActivePlayer(null);
    if (!over || active.id === over.id) return;
    setTargets(prev => {
      const oldIdx = prev.findIndex(p => p.id === active.id);
      const newIdx = prev.findIndex(p => p.id === over.id);
      return arrayMove(prev, oldIdx, newIdx);
    });
    dirtyRef.current = true;
  };

  const doSave = async (targetIds, dropList) => {
    const result = await submit(targetIds, dropList);
    if (result.ok) {
      setLastSaved(new Date());
      setSaveError(null);
      dirtyRef.current = false;
    } else {
      setSaveError('Auto-save failed — check your connection.');
    }
    return result;
  };

  // Auto-save 3s after either list stops changing, matching the season
  // draft screen's debounce pattern. Silent — doesn't lock the UI, since
  // status stays 'pending' either way.
  useEffect(() => {
    if (isLocked || !hydrated || (targets.length === 0 && dropIds.size === 0)) return;
    const targetIds = targets.map(p => p.id);
    const dropList  = [...dropIds];
    const timer = setTimeout(() => { doSave(targetIds, dropList); }, 3000);
    return () => {
      clearTimeout(timer);
      if (dirtyRef.current) doSave(targetIds, dropList);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets, dropIds, isLocked, hydrated]);

  // 30s heartbeat — catches the case where nothing changed for a while but
  // the last debounced save never confirmed.
  useEffect(() => {
    if (isLocked || !hydrated) return;
    const hb = setInterval(() => {
      if (!dirtyRef.current) return;
      doSave(targets.map(p => p.id), [...dropIds]);
    }, 30_000);
    return () => clearInterval(hb);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLocked, hydrated]);

  const handleSubmit = async () => {
    if (targets.length === 0 && dropIds.size === 0) return;
    const result = await doSave(targets.map(p => p.id), [...dropIds]);
    if (result.ok) setFinalized(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
        <div className="text-[var(--mute)] text-[12px] font-bold uppercase tracking-widest animate-pulse">
          Loading Wishlist...
        </div>
      </div>
    );
  }

  if (!shouldShow) {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-6 gap-4 text-center">
        <div className="text-[var(--paper)] font-black text-lg uppercase tracking-widest">
          Wishlist Draft Unavailable
        </div>
        <div className="text-[var(--mute)] text-[12px]">
          {error ?? 'There is nothing open for submissions in this league right now.'}
        </div>
        <button onClick={() => navigate(`/league/${leagueId}`)} className="text-cyan text-[11px] uppercase tracking-widest underline">
          Back to League
        </button>
      </div>
    );
  }

  if (isLocked || finalized) {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-6 gap-6">
        <div className="text-[40px]">✅</div>
        <div className="text-center">
          <div className="text-[var(--paper)] font-black text-xl uppercase tracking-widest mb-2">
            Wishlist Submitted
          </div>
          <div className="text-[var(--mute)] text-[12px]">
            {targets.length} target{targets.length !== 1 ? 's' : ''} ranked, {dropIds.size} player{dropIds.size !== 1 ? 's' : ''} released for round {roundNumber}.
            Resolves automatically before the transfer window opens.
          </div>
        </div>
        <div className="w-full max-w-sm space-y-2">
          {targets.map((p, i) => (
            <div key={p.id} className="flex items-center gap-3 bg-[var(--card)] rounded-sm px-3 py-2">
              <span className="text-[var(--mute)] text-[11px] font-black w-5">{i + 1}</span>
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-sm"
                style={{ color: POS_CONFIG[p.position]?.color, background: POS_CONFIG[p.position]?.bg }}>
                {p.position}
              </span>
              <span className="text-[var(--paper)] text-[12px] font-bold flex-1">{p.name}</span>
              <span className="text-[var(--mute)] text-[11px]">€{p.price}M</span>
            </div>
          ))}
        </div>
        {isLocked ? (
          <div className="text-[var(--mute)] text-[11px] uppercase tracking-widest">
            Round resolved — list locked
          </div>
        ) : (
          <button onClick={() => setFinalized(false)} className="text-[var(--mute)] text-[11px] uppercase tracking-widest underline">
            Edit list
          </button>
        )}
        <button onClick={() => navigate(`/league/${leagueId}`)} className="text-cyan text-[11px] uppercase tracking-widest underline">
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
          <button onClick={() => navigate(`/league/${leagueId}`)} className="text-[var(--on-shell-dim)] text-[20px] leading-none">←</button>
          <div className="text-center">
            <div className="text-[10px] font-black uppercase tracking-[0.4em] text-[var(--on-shell-dim)] font-serif">
              Wishlist Draft
            </div>
            <div className="text-[var(--paper)] font-black text-[15px] uppercase tracking-wider">
              Round {roundNumber}
            </div>
          </div>
          <div className="w-6" />
        </div>
        <div className="text-[var(--on-shell-dim)] text-[10px] uppercase tracking-widest text-center">
          No fixed deadline — resolves automatically before the market opens
        </div>
      </div>

      <div className="flex flex-col flex-1 overflow-hidden">

        {/* Release panel */}
        <div className="px-4 py-3 border-b border-[var(--rule)]">
          <div className="text-[10px] font-black uppercase tracking-widest text-[var(--mute)] mb-2">
            Willing to Release — {dropIds.size}/{maxDrops}
          </div>
          {squadPlayers.length === 0 ? (
            <div className="text-center py-3 text-[var(--mute)] text-[11px] font-bold uppercase tracking-widest border border-dashed border-[var(--rule)] rounded-sm">
              No squad players found
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
              {squadPlayers.map(p => {
                const checked = dropIds.has(p.id);
                const disabled = !checked && dropIds.size >= maxDrops;
                return (
                  <label
                    key={p.id}
                    className={`flex items-center gap-2.5 rounded-sm px-2 py-2 border border-[var(--rule)] ${disabled ? 'opacity-40' : 'cursor-pointer'}`}
                    style={{ background: checked ? 'var(--neg-bg)' : 'var(--card)' }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleDrop(p.id)}
                      className="accent-cyan-400 w-3.5 h-3.5"
                    />
                    <span
                      className="text-[9px] font-black px-1.5 py-0.5 rounded-sm shrink-0"
                      style={{ color: POS_CONFIG[p.position]?.color, background: POS_CONFIG[p.position]?.bg }}
                    >
                      {p.position}
                    </span>
                    <span className="text-[var(--paper)] text-[11px] font-bold flex-1 truncate">{p.name}</span>
                    <span className="text-[var(--mute)] text-[10px] shrink-0">€{p.price}M</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Ranked target list */}
        <div className="px-4 py-3 border-b border-[var(--rule)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--mute)]">
              Your Targets — {targets.length}/{maxTargets}
            </span>
          </div>

          {targets.length === 0 ? (
            <div className="text-center py-4 text-[var(--mute)] text-[11px] font-bold uppercase tracking-widest border border-dashed border-[var(--rule)] rounded-sm">
              Add up to {maxTargets} players — #1 is your highest priority
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              modifiers={[({ transform }) => ({ ...transform, x: 0 })]}
            >
              <SortableContext items={targets.map(p => p.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-1">
                  {targets.map((p, idx) => (
                    <SortableRow
                      key={p.id}
                      p={p}
                      idx={idx}
                      listLength={targets.length}
                      onMoveUp={moveUp}
                      onMoveDown={moveDown}
                      onRemove={removeTarget}
                    />
                  ))}
                </div>
              </SortableContext>
              <DragOverlay>
                {activePlayer && (
                  <div className="flex items-center gap-2 bg-[var(--elev)] border border-[var(--rule)] rounded-sm px-2 py-2 shadow-xl" style={{ width: '320px', maxWidth: '85vw' }}>
                    <span className="text-[var(--mute)] shrink-0 select-none" style={{ fontSize: 'var(--fs-body)', fontWeight: 900 }}>⠿</span>
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-sm shrink-0"
                      style={{ color: POS_CONFIG[activePlayer.position]?.color, background: POS_CONFIG[activePlayer.position]?.bg }}>
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

        {/* Target pool */}
        <div className="flex-1 flex flex-col overflow-hidden">
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
                    filterPos === pos ? 'bg-white text-black' : 'bg-[var(--card)] text-[var(--mute)] border border-[var(--rule)]'
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>
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
                  <div className="absolute left-0 right-0 z-20 rounded-sm mt-1 overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--rule)' }}>
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
                      {clubs.filter(c => !clubSearch || c.toLowerCase().includes(clubSearch.toLowerCase())).map(club => {
                        const checked = filterClubs.has(club);
                        return (
                          <label key={club} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-white/5">
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

          <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1.5">
            {filteredPool.length === 0 && (
              <div className="text-center py-8 text-[var(--mute)] text-[11px] font-bold uppercase tracking-widest">
                No players found
              </div>
            )}
            {filteredPool.map(p => {
              const disabled = targets.length >= maxTargets;
              const isExpanded = expandedId === p.id;
              return (
                <div key={p.id}>
                  <div
                    className={`flex items-center gap-3 bg-[var(--card)] rounded-sm px-3 py-2.5 cursor-pointer transition-opacity ${disabled ? 'opacity-40' : 'active:opacity-70'}`}
                    onClick={() => !disabled && setExpandedId(isExpanded ? null : p.id)}
                  >
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-sm shrink-0"
                      style={{ color: POS_CONFIG[p.position]?.color, background: POS_CONFIG[p.position]?.bg }}>
                      {p.position}
                    </span>
                    <span className="text-[var(--paper)] text-[12px] font-bold flex-1 truncate">{p.name}</span>
                    <span className="text-[var(--mute)] text-[11px] shrink-0">{p.club}</span>
                    <span className="text-[var(--mute)] text-[11px] font-bold shrink-0">€{p.price}M</span>
                    {!disabled && <span className="text-[var(--mute)] text-[11px] shrink-0">{isExpanded ? '▲' : '+'}</span>}
                  </div>
                  {isExpanded && !disabled && (
                    <div className="border border-[var(--rule)] border-t-0 rounded-b-lg px-3 py-2 flex items-center justify-between" style={{ background: 'var(--elev)' }}>
                      <div className="text-[10px] text-[var(--mute)]">#{targets.length + 1} priority</div>
                      <button
                        onClick={() => addTarget(p)}
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

      {(lastSaved || saveError) && (
        <div className={`px-4 py-1.5 text-center text-[10px] font-bold ${saveError ? 'text-[var(--danger)]' : 'text-[var(--mute)]'}`}>
          {saveError || `Saved ${lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
        </div>
      )}

      <div className="bg-[var(--shell)] border-t border-[var(--rule)] px-4 py-4">
        <button
          onClick={handleSubmit}
          disabled={(targets.length === 0 && dropIds.size === 0) || saving}
          className="w-full py-3.5 text-[11px] font-black uppercase tracking-widest rounded transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
          style={{
            background:      (targets.length > 0 || dropIds.size > 0) ? 'var(--positive)' : undefined,
            color:           (targets.length > 0 || dropIds.size > 0) ? '#fff'            : 'var(--on-shell-dim)',
            backgroundColor: (targets.length === 0 && dropIds.size === 0) ? 'var(--elev)' : undefined,
          }}
        >
          {saving ? 'Saving...' : (targets.length === 0 && dropIds.size === 0) ? 'Add targets or releases' : `Submit (${targets.length} targets, ${dropIds.size} releases)`}
        </button>
      </div>
    </div>
  );
}
