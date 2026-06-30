import { useNavigate } from 'react-router-dom';
import { usePlayerBox } from '../../hooks/tennis/usePlayerBox';
import { useTennisLeaderboard } from '../../hooks/tennis/useTennisLeaderboard';
import { CompetitionResultsHeader } from '../../components/competition/CompetitionResultsHeader';

export default function TennisLeaderboardScreen() {
  const navigate = useNavigate();
  const { myBoxes, activeBox, setActivePlayerBoxId, loading: boxLoading } = usePlayerBox();
  const { standings, seasonSummary, loading, error } = useTennisLeaderboard(activeBox?.player_box_id, 2026);

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', paddingBottom: 32 }}>
      {/* Header */}
      <div style={{ background: 'var(--shell)', padding: '20px 16px' }}>
        <button onClick={() => navigate('/tennis')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontFamily: 'Archivo, sans-serif', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 10 }}>
          ← Tennis
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <h1 style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 24, color: 'var(--on-shell)', margin: 0 }}>
            Season Standings
          </h1>
          {myBoxes.length > 1 && (
            <select
              value={activeBox?.player_box_id ?? ''}
              onChange={e => setActivePlayerBoxId(e.target.value)}
              style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, padding: '6px 10px', fontFamily: 'Archivo, sans-serif', fontSize: 12, cursor: 'pointer' }}
            >
              {myBoxes.map(b => (
                <option key={b.player_box_id} value={b.player_box_id}>{b.name}</option>
              ))}
            </select>
          )}
        </div>
        <p style={{ fontFamily: 'Archivo, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.45)', margin: '4px 0 0' }}>
          Grand Slams (all) + Best 4 Masters 1000s + ATP Finals
        </p>
      </div>

      <div style={{ padding: '16px', maxWidth: 700, margin: '0 auto' }}>

        {boxLoading || loading ? (
          <div style={{ color: 'var(--mute)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, textAlign: 'center', padding: 40 }}>Loading…</div>
        ) : !activeBox ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <p style={{ fontFamily: 'Archivo, sans-serif', fontSize: 14, color: 'var(--mute)', margin: '0 0 16px' }}>Join a Player's Box to see standings.</p>
            <button onClick={() => navigate('/tennis/box')} style={{ padding: '10px 24px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontFamily: 'Archivo, sans-serif', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Join a box
            </button>
          </div>
        ) : error ? (
          <div style={{ fontFamily: 'Archivo, sans-serif', fontSize: 14, color: 'var(--neg)', padding: 16 }}>{error}</div>
        ) : standings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <p style={{ fontFamily: 'Archivo, sans-serif', fontSize: 14, color: 'var(--mute)' }}>No scores yet — standings update after each tournament completes.</p>
          </div>
        ) : (
          <>
            {/* Masters Drop Rule note */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6, padding: '10px 14px', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 16 }}>ℹ️</span>
              <p style={{ fontFamily: 'Archivo, sans-serif', fontSize: 12, color: 'var(--text2)', margin: 0 }}>
                <strong>Masters Drop Rule:</strong> Only your best 4 Masters 1000 scores count. The worst score is dropped once 5 or more Masters are complete.
              </p>
            </div>

            {/* Standings table */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6, overflow: 'hidden', marginBottom: 20 }}>
              <CompetitionResultsHeader
                rows={standings}
                columns={[
                  { key: 'slams',   label: 'SLAMS',   width: '60px',  accessor: r => r.slam_points   > 0 ? r.slam_points.toLocaleString()   : '—', color: 'var(--text-2)' },
                  { key: 'masters', label: 'MASTERS', width: '70px',  accessor: r => r.masters_points > 0 ? r.masters_points.toLocaleString() : '—', color: 'var(--text-2)' },
                  { key: 'finals',  label: 'FINALS',  width: '60px',  accessor: r => r.finals_points  > 0 ? r.finals_points.toLocaleString()  : '—', color: 'var(--text-2)' },
                  { key: 'total',   label: 'TOTAL',   width: '70px',  accessor: r => r.season_total.toLocaleString() },
                ]}
                accent="var(--ten)"
                activeColumnKey="total"
                highlightUserId={null}
                useMedals
                renderName={(row) => (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'Archivo, sans-serif', fontSize: 14, color: 'var(--paper)', fontWeight: 500 }}>
                      {row.username}
                    </span>
                    {row.tournaments_scored > 0 && (
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', letterSpacing: '0.08em' }}>
                        {row.tournaments_scored} played
                      </span>
                    )}
                  </div>
                )}
                leadColumnKey="total"
                emptyMessage="No scores yet — standings update after each tournament completes."
                rowPadding="12px 16px"
                gap={8}
              />
            </div>

            {/* Per-tournament breakdown */}
            {seasonSummary.length > 0 && (
              <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--rule)' }}>
                  <span style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 14, color: 'var(--paper)' }}>Per-Tournament Breakdown</span>
                </div>

                {/* Desktop: wide multi-column table (hidden on mobile — requires sideways scroll at 375px) */}
                <div className="hidden lg:block" style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Archivo, sans-serif', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--elev)' }}>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400 }}>Manager</th>
                        {seasonSummary[0]?.tournament_scores?.map(ts => (
                          <th key={ts.tournament_id} style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 400, whiteSpace: 'nowrap', maxWidth: 80 }}>
                            {ts.tournament_name?.split(' ').slice(0, 1).join(' ')}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {seasonSummary.map((row, i) => (
                        <tr key={row.user_id} style={{ borderBottom: i < seasonSummary.length - 1 ? '1px solid var(--rule)' : 'none' }}>
                          <td style={{ padding: '10px 12px', color: 'var(--paper)', fontWeight: 500 }}>{row.username}</td>
                          {row.tournament_scores?.map(ts => (
                            <td key={ts.tournament_id} style={{ padding: '10px 10px', textAlign: 'right', color: ts.total_points > 0 ? 'var(--paper)' : 'var(--mute)' }}>
                              {ts.total_points > 0 ? ts.total_points.toLocaleString() : '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile: per-manager cards with tournament scores as chips */}
                <div className="lg:hidden">
                  {seasonSummary.map((row, i) => (
                    <div
                      key={row.user_id}
                      style={{
                        padding: '12px 16px',
                        borderBottom: i < seasonSummary.length - 1 ? '1px solid var(--rule)' : 'none',
                      }}
                    >
                      <div style={{
                        fontFamily: 'Archivo, sans-serif',
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--paper)',
                        marginBottom: 6,
                      }}>
                        {row.username}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {row.tournament_scores?.filter(ts => ts.total_points > 0).map(ts => (
                          <span
                            key={ts.tournament_id}
                            style={{
                              fontFamily: 'JetBrains Mono, monospace',
                              fontSize: 9,
                              letterSpacing: '0.06em',
                              color: 'var(--ten)',
                              background: 'color-mix(in srgb, var(--ten) 10%, transparent)',
                              border: '1px solid color-mix(in srgb, var(--ten) 25%, transparent)',
                              borderRadius: 4,
                              padding: '3px 7px',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {ts.tournament_name?.split(' ').slice(0, 2).join(' ')} · {ts.total_points}
                          </span>
                        ))}
                        {!row.tournament_scores?.some(ts => ts.total_points > 0) && (
                          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)' }}>
                            No scores yet
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
