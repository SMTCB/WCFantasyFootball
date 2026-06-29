import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { CompetitionResultsHeader } from '../../components/competition/CompetitionResultsHeader';

export default function F1StandingsScreen() {
  const { paddockId } = useParams();
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('total'); // total | race | year

  useEffect(() => {
    supabase.rpc('get_paddock_leaderboard', { p_paddock_id: paddockId })
      .then(({ data }) => { setRows(data ?? []); setLoading(false); });
  }, [paddockId]);

  const sorted = [...rows].sort((a, b) => {
    if (view === 'race') return b.race_points - a.race_points;
    if (view === 'year') return b.year_points - a.year_points;
    return b.total_points - a.total_points;
  });

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ background: 'var(--shell)', padding: '16px 16px 12px' }}>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>
          PADDOCK STANDINGS · 2026
        </div>
        <h1 style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 22, color: 'var(--on-shell)', margin: 0 }}>STANDINGS</h1>
      </div>

      {/* View toggle */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--rule)' }}>
        {[['total', 'TOTAL'], ['race', 'RACE PTS'], ['year', 'SEASON PTS']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            style={{ flex: 1, padding: '11px 0', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer', border: 'none', borderBottom: view === key ? '2px solid var(--f1)' : '2px solid transparent', background: 'transparent', color: view === key ? 'var(--f1)' : 'var(--mute)', marginBottom: -1 }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ padding: '12px 0' }}>
        <CompetitionResultsHeader
          rows={sorted}
          columns={[
            { key: 'race',  label: 'RACE',   width: '52px', accessor: r => r.race_points,   activeAccent: 'var(--f1)' },
            { key: 'year',  label: 'SEASON', width: '52px', accessor: r => r.year_points,   activeAccent: 'var(--f1)' },
            { key: 'total', label: 'TOTAL',  width: '52px', accessor: r => r.total_points,  activeAccent: 'var(--paper)' },
          ]}
          accent="var(--f1)"
          activeColumnKey={view}
          highlightUserId={user?.id}
          useMedals
          nameLabel="DRIVER"
          renderName={(m, isMe) => (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: 'Archivo, sans-serif', fontSize: 14, fontWeight: 600, color: 'var(--paper)' }}>
                  {m.display_name}
                </span>
                {isMe && (
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8, color: 'var(--f1)', letterSpacing: '0.1em' }}>YOU</span>
                )}
              </div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', marginTop: 1 }}>
                {m.races_scored} race{m.races_scored !== 1 ? 's' : ''} scored
              </div>
            </div>
          )}
          loading={loading}
          emptyMessage="No standings yet — picks will score after the first race."
          emptyIcon="🏁"
          rowPadding="12px 16px"
          gap={8}
        />

        {sorted.length > 0 && (
          <div style={{ margin: '16px 16px 0', padding: '10px 12px', background: 'var(--elev)', borderRadius: 6, fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', letterSpacing: '0.1em' }}>
            SCORING: 10 pts exact P1 · 8 exact P2 · 6 exact P3 · 3 wrong podium spot · 5 each for DNF / team / special · 3 all-correct bonus
          </div>
        )}
      </div>
    </div>
  );
}
