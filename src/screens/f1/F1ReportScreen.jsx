import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { getFlag } from '../../lib/f1/f1-data';
import { FIELD_LABELS } from '../../lib/f1/scoring';

const YEAR_FIELD_KEYS = [
  'driver_champion', 'driver_p2', 'driver_p3',
  'constructor_champion', 'last_constructor',
  'fewest_finishers_race', 'most_dnfs_driver', 'first_driver_replaced',
  'most_poles', 'most_podiums_no_win',
];

const MONO = { fontFamily: 'JetBrains Mono, monospace' };

export default function F1ReportScreen() {
  const { paddockId } = useParams();
  const { user } = useAuth();

  const [tab, setTab] = useState('race'); // 'race' | 'year'
  const [members, setMembers] = useState([]);
  const [races, setRaces] = useState([]);
  const [bets, setBets] = useState([]);
  const [scores, setScores] = useState([]);
  const [yearResults, setYearResults] = useState(null);
  const [yearBets, setYearBets] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!paddockId) return;
    supabase.rpc('get_paddock_leaderboard', { p_paddock_id: paddockId }).then(({ data: m }) => {
      const memberList = m ?? [];
      setMembers(memberList);
      const memberIds = memberList.map(mm => mm.user_id);
      if (memberIds.length === 0) { setLoading(false); return; }

      Promise.all([
        supabase.from('f1_races').select('*').eq('season', 2026).eq('status', 'finished').order('round_number'),
        supabase.from('f1_bets_race').select('*').eq('season', 2026).in('user_id', memberIds),
        supabase.from('f1_scores').select('*').eq('season', 2026).eq('score_type', 'race').in('user_id', memberIds),
        supabase.from('f1_year_results').select('*').eq('season', 2026).maybeSingle(),
        supabase.from('f1_bets_year').select('*').eq('season', 2026).in('user_id', memberIds),
      ]).then(([{ data: r }, { data: b }, { data: s }, { data: yr }, { data: yb }]) => {
        setRaces(r ?? []);
        setBets(b ?? []);
        setScores(s ?? []);
        setYearResults(yr);
        setYearBets(yb ?? []);
        setLoading(false);
      });
    });
  }, [paddockId]);

  const betMap = Object.fromEntries(bets.map(b => [`${b.user_id}_${b.round_number}`, b]));
  const scoreMap = Object.fromEntries(scores.map(s => [`${s.user_id}_${s.round_number}`, s]));
  const yearBetMap = Object.fromEntries(yearBets.map(b => [b.user_id, b]));

  const sortedMembers = [...members].sort((a, b) => {
    if (a.user_id === user?.id) return -1;
    if (b.user_id === user?.id) return 1;
    return (a.display_name ?? '').localeCompare(b.display_name ?? '');
  });

  const isBetsLocked = yearResults?.is_bets_locked ?? false;

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40, color: 'var(--mute)', ...MONO, fontSize: 'var(--fs-micro)' }}>LOADING…</div>;
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <div style={{ background: 'var(--shell)', padding: '16px 16px 12px' }}>
        <div style={{ ...MONO, fontSize: 'var(--fs-micro)', letterSpacing: '0.18em', color: 'var(--on-shell-dim)', marginBottom: 4 }}>
          PADDOCK REPORT · 2026
        </div>
        <h1 style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-title)', color: 'var(--on-shell)', margin: 0 }}>REPORT</h1>
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--rule)' }}>
        {[['race', 'RACE BETS'], ['year', 'YEAR BETS']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{ flex: 1, padding: '11px 0', ...MONO, fontSize: 'var(--fs-micro)', fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer', border: 'none', borderBottom: tab === key ? '2px solid var(--f1)' : '2px solid transparent', background: 'transparent', color: tab === key ? 'var(--f1)' : 'var(--mute)', marginBottom: -1 }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'race' && (
        races.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 16px' }}>
            <div style={{ fontSize: 'var(--fs-title)', marginBottom: 12 }}>🏁</div>
            <p style={{ fontFamily: 'Archivo, sans-serif', color: 'var(--mute)', fontSize: 'var(--fs-body)' }}>No races have been scored yet.</p>
          </div>
        ) : (
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {races.map(race => {
              const myBet = betMap[`${user?.id}_${race.round_number}`];
              const myScore = scoreMap[`${user?.id}_${race.round_number}`];
              const isOpen = expanded === race.round_number;

              return (
                <div key={race.id} style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 8, overflow: 'hidden' }}>
                  {/* Race row */}
                  <button
                    onClick={() => setExpanded(isOpen ? null : race.round_number)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                  >
                    <span style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', minWidth: 24 }}>R{race.round_number}</span>
                    <span style={{ fontSize: 'var(--fs-body-lg)' }}>{getFlag(race.gp_name)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-body)', fontWeight: 600, color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {race.gp_name}
                      </div>
                      <div style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', marginTop: 1 }}>
                        {new Date(race.race_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        {!myBet && <span style={{ color: 'var(--danger)', marginLeft: 8 }}>NO PICKS</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {myScore ? (
                        <>
                          <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-heading)', color: 'var(--f1)' }}>{myScore.total_points}</div>
                          <div style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>PTS</div>
                        </>
                      ) : (
                        <div style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>—</div>
                      )}
                    </div>
                    <span style={{ ...MONO, fontSize: 'var(--fs-label)', color: 'var(--mute)', marginLeft: 4 }}>{isOpen ? '▴' : '▾'}</span>
                  </button>

                  {/* Expanded breakdown — race result + every member's picks */}
                  {isOpen && (
                    <div style={{ borderTop: '1px solid var(--rule)', padding: '12px 14px' }}>
                      {/* Results — podium bar-chart viz: P1 tallest/red, P2 mid/slate, P3 shortest/bronze */}
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ ...MONO, fontSize: 'var(--fs-micro)', letterSpacing: '0.12em', color: 'var(--mute)', marginBottom: 6 }}>RACE RESULT</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, alignItems: 'end' }}>
                          {[
                            ['🥇 P1', race.result_p1, 'var(--f1)', 44],
                            ['🥈 P2', race.result_p2, '#4A4A52', 32],
                            ['🥉 P3', race.result_p3, '#B08D57', 22],
                          ].map(([label, val, barColor, barHeight]) => (
                            <div key={label} style={{ display: 'flex', flexDirection: 'column' }}>
                              <div style={{ height: barHeight, background: barColor, borderRadius: '4px 4px 0 0' }} />
                              <div style={{ padding: '8px 10px', background: 'var(--elev)', borderRadius: '0 0 6px 6px' }}>
                                <div style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', marginBottom: 3 }}>{label}</div>
                                <div style={{ fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-label)', fontWeight: 600, color: 'var(--paper)' }}>{val ?? '—'}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Every paddock member's picks */}
                      <div style={{ ...MONO, fontSize: 'var(--fs-micro)', letterSpacing: '0.12em', color: 'var(--mute)', marginBottom: 8 }}>PADDOCK PICKS</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {sortedMembers.map(member => {
                          const bet = betMap[`${member.user_id}_${race.round_number}`];
                          const score = scoreMap[`${member.user_id}_${race.round_number}`];
                          const breakdown = score?.breakdown ?? {};
                          const isMe = member.user_id === user?.id;

                          return (
                            <div key={member.user_id}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                                <span style={{ fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-body)', fontWeight: isMe ? 700 : 600, color: isMe ? 'var(--f1)' : 'var(--paper)' }}>
                                  {member.display_name}{isMe ? ' (You)' : ''}
                                </span>
                                {score && (
                                  <span style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>{score.total_points} pts</span>
                                )}
                              </div>

                              {bet ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  {[
                                    { key: 'p1', label: '🥇 P1', pick: bet.p1, pts: breakdown.p1 },
                                    { key: 'p2', label: '🥈 P2', pick: bet.p2, pts: breakdown.p2 },
                                    { key: 'p3', label: '🥉 P3', pick: bet.p3, pts: breakdown.p3 },
                                    { key: 'dnf', label: '💥 DNF', pick: bet.dnf_driver, pts: breakdown.dnf },
                                    { key: 'team', label: '🏎 Team', pick: bet.team_most_points, pts: breakdown.team },
                                    { key: 'special', label: '⭐ Special', pick: bet.special_category_answer, pts: breakdown.special },
                                  ].filter(row => row.pick).map(row => (
                                    <div key={row.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: row.pts > 0 ? 'rgba(22,101,52,0.06)' : 'rgba(185,28,28,0.04)', borderRadius: 6, border: `1px solid ${row.pts > 0 ? 'rgba(22,101,52,0.2)' : 'rgba(185,28,28,0.1)'}` }}>
                                      <span style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', minWidth: 52 }}>{row.label}</span>
                                      <span style={{ fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-body)', color: 'var(--paper)', flex: 1 }}>{row.pick}</span>
                                      <span style={{ ...MONO, fontSize: 'var(--fs-micro)', fontWeight: 700, color: row.pts > 0 ? 'var(--positive)' : 'var(--danger)' }}>
                                        {row.pts > 0 ? `+${row.pts}` : '+0'}
                                      </span>
                                    </div>
                                  ))}
                                  {breakdown.bonus > 0 && (
                                    <div style={{ padding: '6px 10px', background: 'rgba(184,114,14,0.08)', borderRadius: 6, border: '1px solid rgba(184,114,14,0.2)', ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--gold)' }}>
                                      ⭐ All Correct Bonus +{breakdown.bonus}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', padding: '4px 0' }}>No picks submitted.</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {tab === 'year' && (
        !isBetsLocked ? (
          <div style={{ textAlign: 'center', padding: '48px 16px' }}>
            <div style={{ fontSize: 'var(--fs-title)', marginBottom: 12 }}>🔒</div>
            <p style={{ fontFamily: 'Archivo, sans-serif', color: 'var(--mute)', fontSize: 'var(--fs-body)' }}>
              Year bets are not yet locked — picks will be revealed once the paddock admin locks them.
            </p>
          </div>
        ) : (
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sortedMembers.map(member => {
              const bet = yearBetMap[member.user_id];
              const isMe = member.user_id === user?.id;

              return (
                <div key={member.user_id} style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-body)', fontWeight: isMe ? 700 : 600, color: isMe ? 'var(--f1)' : 'var(--paper)', marginBottom: 8 }}>
                    {member.display_name}{isMe ? ' (You)' : ''}
                  </div>

                  {bet ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {YEAR_FIELD_KEYS.filter(key => bet[key]).map(key => {
                        const pick = bet[key];
                        const result = yearResults?.[key];
                        const isCorrect = result && pick === result;
                        const isGraded = !!result;
                        return (
                          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: !isGraded ? 'var(--elev)' : isCorrect ? 'rgba(22,101,52,0.06)' : 'rgba(185,28,28,0.04)', borderRadius: 6, border: `1px solid ${!isGraded ? 'var(--rule)' : isCorrect ? 'rgba(22,101,52,0.2)' : 'rgba(185,28,28,0.1)'}` }}>
                            <span style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', flex: 1 }}>{FIELD_LABELS[key] ?? key}</span>
                            <span style={{ fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-body)', color: 'var(--paper)' }}>{pick}</span>
                            {isGraded && (
                              <span style={{ ...MONO, fontSize: 'var(--fs-micro)', fontWeight: 700, color: isCorrect ? 'var(--positive)' : 'var(--danger)' }}>
                                {isCorrect ? '✓ +10' : '✗'}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>No season picks submitted.</div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
