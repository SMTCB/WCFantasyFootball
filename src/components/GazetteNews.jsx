import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// Renders the last 3 breaking_news + classified gazette entries for a league in newspaper style.
// Accepts optional fpEd/reactionProps/letterProps to render the commissioner reaction strip inline.
export default function GazetteNews({
  leagueId,
  ftSerif, ftMono, ftInk, ftMute, ftRed, ftRule,
  fpEd,
  ReactionStrip,
  LettersPanel,
  reactionProps,
  letterProps,
}) {
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    if (!leagueId) return;
    supabase
      .from('gazette_entries')
      .select('id, entry_type, headline, bullets, published_at')
      .eq('league_id', leagueId)
      .in('entry_type', ['breaking_news', 'classified'])
      .order('published_at', { ascending: false })
      .limit(4)
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
          const isClassified = e.entry_type === 'classified';
          return (
            <div key={e.id} style={{ borderLeft: i > 0 ? `1px solid ${ftRule}` : 'none', paddingLeft: i > 0 ? 20 : 0 }}>
              {isClassified && (
                <div style={{ fontFamily: ftMono, fontSize: 8, letterSpacing: '.22em', color: ftRed, marginBottom: 4 }}>
                  CLASSIFIED
                </div>
              )}
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
      {fpEd && ReactionStrip && LettersPanel && (
        <div style={{ marginTop: 8 }}>
          <ReactionStrip sectionKey="commissioner" {...reactionProps} />
          <LettersPanel sectionKey="commissioner" {...letterProps} />
        </div>
      )}
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
