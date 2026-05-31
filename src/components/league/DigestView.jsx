import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { MONO } from './HubConstants';

function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function DigestView({ onSelectLeague }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    supabase
      .from('gazette_entries')
      .select('id, league_id, headline, bullets, published_at, leagues(name)')
      .eq('entry_type', 'activity')
      .gte('published_at', since)
      .order('published_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error('[DigestView]', error);
        setEntries(data ?? []);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (loading) return (
    <div style={{ padding: '48px 24px', textAlign: 'center' }}>
      <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.2em' }}>LOADING DIGEST…</div>
    </div>
  );

  if (!entries.length) return (
    <div style={{ flex: 1, padding: '48px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 28, marginBottom: 12 }}>📋</div>
      <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--mute)', letterSpacing: '.18em', marginBottom: 8 }}>
        NOTHING TO REPORT
      </div>
      <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 12, color: 'var(--mute)', opacity: 0.7, lineHeight: 1.5, maxWidth: 280, margin: '0 auto' }}>
        No matches have been scored in your leagues in the last 7 days.
      </div>
    </div>
  );

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      {entries.map(e => (
        <div
          key={e.id}
          onClick={() => onSelectLeague(e.league_id)}
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--rule)',
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{
                fontFamily: MONO, fontSize: 8, letterSpacing: '.18em',
                padding: '2px 5px', border: '1px solid var(--positive)',
                color: 'var(--positive)',
              }}>SCORES</span>
              <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)' }}>
                {timeAgo(e.published_at)}
              </span>
            </div>
            <span style={{
              fontFamily: MONO, fontSize: 8, letterSpacing: '.14em',
              color: 'var(--cyan)', padding: '2px 6px',
              border: '1px solid rgba(0,180,216,.3)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              maxWidth: 200,
            }}>
              {(e.leagues?.name || '').toUpperCase()}
            </span>
          </div>
          <div style={{
            fontFamily: "'Archivo', sans-serif", fontSize: 12, fontWeight: 600,
            color: 'var(--paper)', lineHeight: 1.35,
            marginBottom: Array.isArray(e.bullets) && e.bullets.length ? 6 : 0,
          }}>
            {e.headline}
          </div>
          {Array.isArray(e.bullets) && e.bullets.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {e.bullets.map((b, i) => (
                <div key={i} style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.1em', lineHeight: 1.4 }}>
                  {b}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      <div style={{ height: 32 }} />
    </div>
  );
}
