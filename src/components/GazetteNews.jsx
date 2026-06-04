import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// Renders the last 3 breaking_news gazette entries for a league in newspaper style.
// Designed to slot into the Frontpage view (Forza Times).
export default function GazetteNews({ leagueId, ftSerif, ftMono, ftInk, ftMute, ftRed, ftRule }) {
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    if (!leagueId) return;
    supabase
      .from('gazette_entries')
      .select('id, headline, bullets, published_at')
      .eq('league_id', leagueId)
      .eq('entry_type', 'breaking_news')
      .order('published_at', { ascending: false })
      .limit(3)
      .then(({ data }) => setEntries(data ?? []));
  }, [leagueId]);

  if (!entries.length) return null;

  return (
    <div style={{ marginTop: 24, borderTop: `1px solid ${ftRule}`, paddingTop: 20 }}>
      <div style={{ fontFamily: ftMono, fontSize: 9, letterSpacing: '.22em', color: ftRed, marginBottom: 14 }}>
        FROM THE COMMISSIONER
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(entries.length, 3)}, 1fr)`, gap: 24 }}>
        {entries.map((e, i) => {
          const bullets = parseBullets(e.bullets);
          return (
            <div key={e.id} style={{ borderLeft: i > 0 ? `1px solid ${ftRule}` : 'none', paddingLeft: i > 0 ? 20 : 0 }}>
              <div style={{ fontFamily: ftSerif, fontWeight: 700, fontSize: 15, lineHeight: 1.25, color: ftInk, marginBottom: 6 }}>
                {e.headline}
              </div>
              {bullets.length > 0 && (
                <ul style={{ margin: 0, padding: '0 0 0 14px' }}>
                  {bullets.map((b, bi) => (
                    <li key={bi} style={{ fontFamily: ftSerif, fontSize: 12, color: ftMute, lineHeight: 1.5, marginBottom: 2 }}>
                      {typeof b === 'string' ? b : b?.text ?? ''}
                    </li>
                  ))}
                </ul>
              )}
              <div style={{ fontFamily: ftMono, fontSize: 9, letterSpacing: '.16em', color: ftMute, marginTop: 8 }}>
                {new Date(e.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function parseBullets(raw) {
  if (!raw) return [];
  let arr = raw;
  if (typeof arr === 'string') {
    try { arr = JSON.parse(arr); } catch { return []; }
  }
  return Array.isArray(arr) ? arr : [];
}
