import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { getFlag } from '../../lib/f1/f1-data';
import { FIELD_LABELS } from '../../lib/f1/scoring';

export default function F1ReportScreen() {
  useParams();
  const { user } = useAuth();

  const [races, setRaces] = useState([]);
  const [bets, setBets] = useState([]);
  const [scores, setScores] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    Promise.all([
      supabase.from('f1_races').select('*').eq('season', 2026).eq('status', 'finished').order('round_number'),
      supabase.from('f1_bets_race').select('*').eq('user_id', user.id).eq('season', 2026),
      supabase.from('f1_scores').select('*').eq('user_id', user.id).eq('season', 2026).eq('score_type', 'race'),
    ]).then(([{ data: r }, { data: b }, { data: s }]) => {
      setRaces(r ?? []);
      setBets(b ?? []);
      setScores(s ?? []);
      setLoading(false);
    });
  }, [user?.id]);

  const betMap = Object.fromEntries(bets.map(b => [b.round_number, b]));
  const scoreMap = Object.fromEntries(scores.map(s => [s.round_number, s]));

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40, color: 'var(--mute)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>LOADING…</div>;
  }

  return (
    <div style={{ background: 'var(--ink)', minHeight: '100vh' }}>
      <div style={{ background: 'var(--shell)', padding: '16px 16px 12px' }}>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>
          RACE REPORT · 2026
        </div>
        <h1 style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 22, color: '#fff', margin: 0 }}>RESULTS</h1>
      </div>

      {races.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 16px' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🏁</div>
          <p style={{ fontFamily: 'Archivo, sans-serif', color: 'var(--mute)', fontSize: 14 }}>No races have been scored yet.</p>
        </div>
      ) : (
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {races.map(race => {
            const bet = betMap[race.round_number];
            const score = scoreMap[race.round_number];
            const isOpen = expanded === race.round_number;
            const breakdown = score?.breakdown ?? {};

            return (
              <div key={race.id} style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 8, overflow: 'hidden' }}>
                {/* Race row */}
                <button
                  onClick={() => setExpanded(isOpen ? null : race.round_number)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                >
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mute)', minWidth: 24 }}>R{race.round_number}</span>
                  <span style={{ fontSize: 16 }}>{getFlag(race.gp_name)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'Archivo, sans-serif', fontSize: 14, fontWeight: 600, color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {race.gp_name}
                    </div>
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', marginTop: 1 }}>
                      {new Date(race.race_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      {!bet && <span style={{ color: 'var(--danger)', marginLeft: 8 }}>NO PICKS</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {score ? (
                      <>
                        <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 18, color: 'var(--paper)' }}>{score.total_points}</div>
                        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8, color: 'var(--mute)' }}>PTS</div>
                      </>
                    ) : (
                      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mute)' }}>—</div>
                    )}
                  </div>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--mute)', marginLeft: 4 }}>{isOpen ? '▴' : '▾'}</span>
                </button>

                {/* Expanded breakdown */}
                {isOpen && (
                  <div style={{ borderTop: '1px solid var(--rule)', padding: '12px 14px' }}>
                    {/* Results */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.12em', color: 'var(--mute)', marginBottom: 6 }}>RACE RESULT</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                        {[['🥇 P1', race.result_p1], ['🥈 P2', race.result_p2], ['🥉 P3', race.result_p3]].map(([label, val]) => (
                          <div key={label} style={{ padding: '8px 10px', background: 'var(--elev)', borderRadius: 6 }}>
                            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8, color: 'var(--mute)', marginBottom: 3 }}>{label}</div>
                            <div style={{ fontFamily: 'Archivo, sans-serif', fontSize: 12, fontWeight: 600, color: 'var(--paper)' }}>{val ?? '—'}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* My picks vs result */}
                    {bet && score && (
                      <div>
                        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.12em', color: 'var(--mute)', marginBottom: 6 }}>MY PICKS</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {[
                            { key: 'p1', label: '🥇 P1', pick: bet.p1, result: race.result_p1, pts: breakdown.p1 },
                            { key: 'p2', label: '🥈 P2', pick: bet.p2, result: race.result_p2, pts: breakdown.p2 },
                            { key: 'p3', label: '🥉 P3', pick: bet.p3, result: race.result_p3, pts: breakdown.p3 },
                            { key: 'dnf', label: '💥 DNF', pick: bet.dnf_driver, result: race.result_dnf_drivers?.join(', '), pts: breakdown.dnf },
                            { key: 'team', label: '🏎 Team', pick: bet.team_most_points, result: race.result_team_most_points, pts: breakdown.team },
                            { key: 'special', label: '⭐ Special', pick: bet.special_category_answer, result: race.special_category_answer, pts: breakdown.special },
                          ].filter(row => row.pick).map(row => (
                            <div key={row.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: row.pts > 0 ? 'rgba(22,101,52,0.06)' : 'rgba(185,28,28,0.04)', borderRadius: 6, border: `1px solid ${row.pts > 0 ? 'rgba(22,101,52,0.2)' : 'rgba(185,28,28,0.1)'}` }}>
                              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', minWidth: 52 }}>{row.label}</span>
                              <span style={{ fontFamily: 'Archivo, sans-serif', fontSize: 13, color: 'var(--paper)', flex: 1 }}>{row.pick}</span>
                              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fontWeight: 700, color: row.pts > 0 ? 'var(--positive)' : 'var(--mute)' }}>
                                {row.pts > 0 ? `+${row.pts}` : '—'}
                              </span>
                            </div>
                          ))}
                          {breakdown.bonus > 0 && (
                            <div style={{ padding: '7px 10px', background: 'rgba(184,114,14,0.08)', borderRadius: 6, border: '1px solid rgba(184,114,14,0.2)', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--gold)' }}>
                              ⭐ All Correct Bonus +{breakdown.bonus}
                            </div>
                          )}
                          <div style={{ padding: '8px 10px', background: 'var(--elev)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', fontFamily: 'Archivo Black, sans-serif', fontSize: 16, color: 'var(--paper)' }}>
                            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mute)', alignSelf: 'center' }}>TOTAL</span>
                            <span>{score.total_points} pts</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {!bet && <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--mute)', textAlign: 'center', padding: '12px 0' }}>No picks submitted for this race.</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
