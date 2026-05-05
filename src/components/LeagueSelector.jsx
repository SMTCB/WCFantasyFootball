import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

/**
 * Small inline league picker. Fetches the user's leagues and renders a
 * styled <select>. Calls onChange(leagueId) when the selection changes.
 * Auto-selects if the user is in only one league.
 */
export default function LeagueSelector({ value, onChange }) {
  const { user } = useAuth();
  const [leagues, setLeagues] = useState([]);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('league_members')
      .select('league_id, leagues(id, name)')
      .eq('user_id', user.id)
      .then(({ data }) => {
        const list = (data ?? []).map(r => ({
          id:   r.league_id,
          name: r.leagues?.name ?? r.league_id,
        }));
        setLeagues(list);
        if (!value && list.length === 1) onChange(list[0].id);
      });
  }, [user?.id]);

  if (leagues.length === 0) return null;
  if (leagues.length === 1) {
    return (
      <span
        className="text-[11px] font-black uppercase tracking-wide px-2 py-1 rounded"
        style={{ background: 'rgba(0,196,232,0.10)', color: 'var(--cyan)', fontFamily: 'Archivo Black, sans-serif' }}
      >
        {leagues[0].name}
      </span>
    );
  }

  return (
    <select
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      className="text-[11px] font-black uppercase tracking-wide px-2 py-1 rounded appearance-none cursor-pointer"
      style={{
        background:   'rgba(0,196,232,0.10)',
        border:       '1px solid rgba(0,196,232,0.25)',
        color:        'var(--cyan)',
        fontFamily:   'Archivo Black, sans-serif',
        outline:      'none',
        letterSpacing: '0.06em',
      }}
    >
      <option value="" disabled style={{ background: 'var(--ink-2)' }}>Select league…</option>
      {leagues.map(l => (
        <option key={l.id} value={l.id} style={{ background: 'var(--ink-2)', color: 'var(--paper)' }}>
          {l.name}
        </option>
      ))}
    </select>
  );
}
