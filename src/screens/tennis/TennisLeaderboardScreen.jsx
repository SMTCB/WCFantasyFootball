import { LoadingRows } from '../../components/Skeleton';
import { useNavigate } from 'react-router-dom';
import { usePlayerBox } from '../../hooks/tennis/usePlayerBox';
import { useTennisLeaderboard } from '../../hooks/tennis/useTennisLeaderboard';
import { CompetitionResultsHeader } from '../../components/competition/CompetitionResultsHeader';
import Button from '../../components/Button';
import { Icon } from '../../components/UiIcons';
import Card from '../../components/ui/Card';

export default function TennisLeaderboardScreen() {
  const navigate = useNavigate();
  const { myBoxes, activeBox, setActivePlayerBoxId, loading: boxLoading } = usePlayerBox();
  const { standings, seasonSummary, loading, error } = useTennisLeaderboard(activeBox?.player_box_id, 2026);

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', paddingBottom: 32 }}>
      {/* Header */}
      <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--rule)', borderLeft: '4px solid var(--ten)', padding: '20px 16px' }}>
        <div className="sport-col">
        <button onClick={() => navigate('/tennis')} style={{ background: 'none', border: 'none', color: 'var(--mute)', fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-body)', cursor: 'pointer', padding: 0, marginBottom: 10 }}>
          ← Tennis
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <h1 style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-title)', color: 'var(--text)', margin: 0 }}>
            Season Standings
          </h1>
          {myBoxes.length > 1 && (
            <select
              value={activeBox?.player_box_id ?? ''}
              onChange={e => setActivePlayerBoxId(e.target.value)}
              className="ffl-input ffl-input--sm" style={{ width: 'auto' }}
            >
              {myBoxes.map(b => (
                <option key={b.player_box_id} value={b.player_box_id}>{b.name}</option>
              ))}
            </select>
          )}
        </div>
        <p style={{ fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-label)', color: 'var(--mute)', margin: '4px 0 0' }}>
          Grand Slams (all) + Best 4 Masters 1000s + ATP Finals
        </p>
        </div>
      </div>

      {activeBox?.archived && (
        <div style={{ padding: '8px 16px', background: 'var(--elev)', borderBottom: '1px solid var(--rule)', fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>
          <div className="sport-col">ARCHIVED — this player's box is inactive.</div>
        </div>
      )}

      <div className="sport-col" style={{ padding: '16px' }}>

        {boxLoading || loading ? (
          <LoadingRows rows={3} />
        ) : !activeBox ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <p style={{ fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-body)', color: 'var(--mute)', margin: '0 0 16px' }}>Join a Player's Box to see standings.</p>
            <Button onClick={() => navigate('/tennis/box')}>
              Join a box
            </Button>
          </div>
        ) : error ? (
          <div style={{ fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-body)', color: 'var(--neg)', padding: 16 }}>{error}</div>
        ) : standings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <p style={{ fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-body)', color: 'var(--mute)' }}>No scores yet — standings update after each tournament completes.</p>
          </div>
        ) : (
          <>
            <div className="sport-split">
            {/* Masters Drop Rule note */}
            <Card padded={false} className="sport-aside" style={{ padding: '10px 14px', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 'var(--fs-body-lg)', color: 'var(--ten)', lineHeight: 1 }}><Icon name="info" /></span>
              <p style={{ fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-label)', color: 'var(--text-2)', margin: 0 }}>
                <strong>Masters Drop Rule:</strong> Only your best 4 Masters 1000 scores count. The worst score is dropped once 5 or more Masters are complete.
              </p>
            </Card>

            {/* Standings table */}
            <Card padded={false} className="sport-main" style={{ overflow: 'hidden', marginBottom: 20 }}>
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
                renderName={(row) => (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-body)', color: 'var(--paper)', fontWeight: 500 }}>
                      {row.username}
                    </span>
                    {row.tournaments_scored > 0 && (
                      <span style={{ fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>
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
            </Card>
            </div>

            {/* Per-tournament breakdown */}
            {seasonSummary.length > 0 && (
              <Card padded={false} style={{ overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--rule)' }}>
                  <span style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-body)', color: 'var(--paper)' }}>Per-Tournament Breakdown</span>
                </div>

                {/* Desktop: wide multi-column table (hidden on mobile — requires sideways scroll at 375px) */}
                <div className="hidden lg:block" style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-body)' }}>
                    <thead>
                      <tr style={{ background: 'var(--elev)' }}>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-label)', color: 'var(--mute)', fontWeight: 400 }}>Manager</th>
                        {seasonSummary[0]?.tournament_scores?.map(ts => (
                          <th key={ts.tournament_id} style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-label)', color: 'var(--mute)', fontWeight: 400, maxWidth: 96, lineHeight: 1.25, verticalAlign: 'bottom' }} title={ts.tournament_name}>
                            {ts.tournament_name}
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
                        fontSize: 'var(--fs-body)',
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
                              fontFamily: 'Archivo, sans-serif',
                              fontSize: 'var(--fs-label)',
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
                          <span style={{ fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>
                            No scores yet
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
