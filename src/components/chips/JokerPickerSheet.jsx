import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import PositionChip from '../PositionChip';

const POSITIONS = ['ALL', 'GK', 'DEF', 'MID', 'FWD'];

/**
 * JokerPickerSheet — bottom sheet listing players OUTSIDE the manager's squad.
 * The server re-checks ownership (set_joker → JOKER_OWN_SQUAD); the owned filter here is UX only.
 */
export default function JokerPickerSheet({ tournamentId, ownedIds, onPick, onClose }) {
  const [query,   setQuery]   = useState('');
  const [pos,     setPos]     = useState('ALL');
  const [rows,    setRows]    = useState(null);   // null = loading

  useEffect(() => {
    if (!tournamentId) return undefined;
    let cancelled = false;
    const t = setTimeout(async () => {
      let q = supabase.from('players')
        .select('id, name, position, club, price')
        .eq('tournament_id', tournamentId)
        .eq('is_active', true)
        .order('price', { ascending: false })
        .limit(80);
      if (pos !== 'ALL')    q = q.eq('position', pos);
      if (query.trim())     q = q.ilike('name', `%${query.trim()}%`);
      const { data } = await q;
      if (!cancelled) setRows(data ?? []);
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [tournamentId, pos, query]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const owned = new Set(ownedIds);
  const list = (rows ?? []).filter(p => !owned.has(p.id));

  return createPortal(
    <>
      <div role="presentation" className="fixed inset-0 z-[59]" style={{ background: 'rgba(24,32,46,0.35)' }} onClick={onClose} />
      <div
        role="dialog" aria-modal="true" aria-label="Choose your Joker"
        className="fixed bottom-0 left-0 right-0 z-[60] animate-slide-up"
        style={{
          background: 'var(--card)', borderTop: '1px solid var(--rule)',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.12)', paddingBottom: 'env(safe-area-inset-bottom)',
          maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        }}
      >
        <div className="max-w-2xl mx-auto w-full px-5 pt-4" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
          <div className="flex justify-center mb-3">
            <div className="w-10 h-1 rounded-full" style={{ background: 'var(--rule)' }} />
          </div>
          <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>Joker · ×2 points this round</div>
          <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-heading)', color: 'var(--paper)', letterSpacing: '-0.01em', marginBottom: 10 }}>
            Choose a player outside your squad
          </div>

          <input
            type="search" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search players" aria-label="Search players"
            style={{
              width: '100%', minHeight: 44, padding: '0 12px', marginBottom: 8,
              background: 'var(--elev)', border: '1px solid var(--rule)', borderRadius: 0,
              color: 'var(--paper)', fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-body)',
            }}
          />
          <div role="group" aria-label="Filter by position" className="flex gap-2 mb-2" style={{ overflowX: 'auto' }}>
            {POSITIONS.map(p => (
              <button
                key={p} onClick={() => setPos(p)} aria-pressed={pos === p}
                className="hit-44 fk-mono"
                style={{
                  padding: '6px 12px', fontSize: 'var(--fs-micro)', letterSpacing: '0.14em', cursor: 'pointer',
                  background: pos === p ? 'var(--accent)' : 'transparent',
                  color: pos === p ? 'var(--on-accent)' : 'var(--mute)',
                  border: `1px solid ${pos === p ? 'var(--accent)' : 'var(--rule)'}`, borderRadius: 0,
                }}
              >{p}</button>
            ))}
          </div>

          <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, marginInline: -20, paddingBottom: 16 }}>
            {rows === null && <div style={{ padding: 20, color: 'var(--mute)', fontSize: 'var(--fs-label)' }}>Loading players…</div>}
            {rows !== null && list.length === 0 && (
              <div style={{ padding: 20, color: 'var(--mute)', fontSize: 'var(--fs-label)' }}>No players match.</div>
            )}
            {list.map(p => (
              <button
                key={p.id} onClick={() => onPick(p)}
                className="w-full flex items-center gap-3 text-left"
                style={{ minHeight: 56, padding: '8px 20px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--rule)', cursor: 'pointer' }}
              >
                <PositionChip pos={p.position} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontFamily: 'Archivo, sans-serif', fontWeight: 600, fontSize: 'var(--fs-body)', color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                  <span style={{ display: 'block', fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>{p.club}</span>
                </span>
                <span className="fk-mono" style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>€{p.price}M</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
