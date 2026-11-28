import { LoadingRows } from '../../components/Skeleton';
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { usePaddock } from '../../hooks/f1/usePaddock';
import { gpCode, driverCode, formatDay } from '../../lib/f1/f1-data';
import { F1Header, MemberRow } from '../../components/f1/F1Kit';

const YEAR_FIELDS = [
  ['driver_champion', 'Drivers’ champion'],
  ['driver_p2', 'Drivers’ championship P2'],
  ['driver_p3', 'Drivers’ championship P3'],
  ['constructor_champion', 'Constructors’ champion'],
  ['last_constructor', 'Last-placed team'],
  ['fewest_finishers_race', 'Race with fewest finishers'],
  ['most_dnfs_driver', 'Driver with most DNFs'],
  ['first_driver_replaced', 'First driver replaced'],
  ['most_poles', 'Most pole positions'],
  ['most_podiums_no_win', 'Most podiums without a win'],
];
const YEAR_FIELD_KEYS = YEAR_FIELDS.map(([key]) => key);
const YEAR_LABELS = Object.fromEntries(YEAR_FIELDS);

// Older scored rounds were written with a legacy key schema (podium_p1_pts, wrong_spot_pts as a
// single lump sum, etc.) before the current per-position p1/p2/p3 schema. Map old → new shape so
// the breakdown always renders, regardless of which pipeline scored a given round.
function normalizeBreakdown(raw) {
  if (!raw) return {};
  if (raw.p1 !== undefined || raw.p2 !== undefined || raw.p3 !== undefined) return raw;
  return {
    p1: raw.podium_p1_pts ?? 0,
    p2: raw.podium_p2_pts ?? 0,
    p3: raw.podium_p3_pts ?? 0,
    dnf: raw.dnf_pts ?? 0,
    team: raw.team_pts ?? 0,
    special: raw.special_pts ?? 0,
    bonus: raw.all_correct_bonus ?? raw.podium_bonus_pts ?? 0,
    wrongSpot: raw.wrong_spot_pts ?? 0,
  };
}

// One line of context under each pick: where that driver or team actually ended up.
function pickNote(key, pick, race) {
  if (!pick) return null;
  const podium = [race.result_p1, race.result_p2, race.result_p3];
  if (key === 'p1' || key === 'p2' || key === 'p3') {
    const at = podium.indexOf(pick);
    if (at === 0) return 'Won it';
    if (at > 0) return `Finished P${at + 1}`;
    return 'Off the podium';
  }
  if (key === 'dnf') {
    if (!race.result_dnf_drivers?.length) return 'Nobody retired';
    return race.result_dnf_drivers.includes(pick) ? 'Did not finish' : 'Finished the race';
  }
  if (key === 'team') return race.result_team_most_points ? `Top team: ${race.result_team_most_points}` : null;
  if (key === 'special') return race.special_category_answer ? `Answer: ${race.special_category_answer}` : null;
  return null;
}

function pickRows(bet, breakdown) {
  return [
    { key: 'p1', label: 'P1', pick: bet?.p1, pts: breakdown.p1 },
    { key: 'p2', label: 'P2', pick: bet?.p2, pts: breakdown.p2 },
    { key: 'p3', label: 'P3', pick: bet?.p3, pts: breakdown.p3 },
    { key: 'dnf', label: 'DNF', pick: bet?.dnf_driver, pts: breakdown.dnf },
    { key: 'team', label: 'Team', pick: bet?.team_most_points, pts: breakdown.team },
    { key: 'special', label: 'Special', pick: bet?.special_category_answer, pts: breakdown.special },
  ];
}

function PicksList({ bet, score, race, withNotes }) {
  const breakdown = normalizeBreakdown(score?.breakdown);
  const scored = !!score;
  return (
    <>
      {pickRows(bet, breakdown).map((row, i) => (
        <div key={row.key} className={`f1-kv${i === 0 ? ' first' : ''}`}>
          <span className="f1-eb">{row.label}</span>
          <span className="n" style={{ color: row.pick ? 'var(--paper)' : 'var(--mute)', fontWeight: row.pick ? 700 : 400 }}>
            {row.pick ?? 'No pick'}
            {withNotes && row.pick && pickNote(row.key, row.pick, race) && (
              <span style={{ display: 'block', fontWeight: 400, fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>
                {pickNote(row.key, row.pick, race)}
              </span>
            )}
          </span>
          <span className={`v ${scored && row.pick ? (row.pts > 0 ? 'f1-ok' : 'f1-nok') : ''}`}>
            {scored && row.pick ? (row.pts > 0 ? `+${row.pts}` : '0') : '—'}
          </span>
        </div>
      ))}
      {breakdown.wrongSpot > 0 && (
        <div className="f1-kv">
          <span className="f1-eb">Podium</span>
          <span className="n" style={{ fontWeight: 400, fontSize: 'var(--fs-label)' }}>Right driver, wrong spot</span>
          <span className="v f1-ok">+{breakdown.wrongSpot}</span>
        </div>
      )}
      {breakdown.bonus > 0 && (
        <div className="f1-kv" style={{ background: 'var(--f1-gold-wash)' }}>
          <span className="f1-eb" style={{ color: 'var(--gold-text)' }}>Bonus</span>
          <span className="n" style={{ fontWeight: 400, fontSize: 'var(--fs-label)' }}>All six right</span>
          <span className="v" style={{ color: 'var(--gold-text)' }}>+{breakdown.bonus}</span>
        </div>
      )}
    </>
  );
}

export default function F1ReportScreen() {
  const { paddockId } = useParams();
  const { user } = useAuth();
  const { myPaddocks } = usePaddock();
  const paddock = myPaddocks.find(p => p.paddock_id === paddockId);

  const [tab, setTab] = useState('race'); // 'race' | 'year'
  const [members, setMembers] = useState([]);
  const [races, setRaces] = useState([]);
  const [bets, setBets] = useState([]);
  const [scores, setScores] = useState([]);
  const [yearResults, setYearResults] = useState(null);
  const [yearBets, setYearBets] = useState([]);
  const [round, setRound] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const stripRef = useRef(null);

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

  const race = races.find(r => r.round_number === round) ?? races[races.length - 1];

  // Keep the chosen round in view on the strip.
  useEffect(() => {
    const strip = stripRef.current;
    const tile = race && document.getElementById(`f1-report-r${race.round_number}`);
    if (!strip || !tile) return;
    const offset = tile.getBoundingClientRect().left - strip.getBoundingClientRect().left + strip.scrollLeft;
    strip.scrollTo({ left: offset - strip.clientWidth / 2 + tile.clientWidth / 2, behavior: 'smooth' });
  }, [race?.round_number, loading, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const betMap = Object.fromEntries(bets.map(b => [`${b.user_id}_${b.round_number}`, b]));
  const scoreMap = Object.fromEntries(scores.map(s => [`${s.user_id}_${s.round_number}`, s]));
  const yearBetMap = Object.fromEntries(yearBets.map(b => [b.user_id, b]));

  // You first, then everyone else by name.
  const sortedMembers = [...members].sort((a, b) => {
    if (a.user_id === user?.id) return -1;
    if (b.user_id === user?.id) return 1;
    return (a.display_name ?? '').localeCompare(b.display_name ?? '');
  });

  const isBetsLocked = yearResults?.is_bets_locked ?? false;

  if (loading) {
    return <div className="f1-screen"><div className="sport-col f1-body"><LoadingRows rows={5} /></div></div>;
  }

  const settledCount = races.filter(r => r.is_scored).length;
  const eyebrow = `${paddock?.name ?? 'F1 league'} · ${settledCount} race${settledCount === 1 ? '' : 's'} settled`;

  const myScore = race ? scoreMap[`${user?.id}_${race.round_number}`] : null;
  const myBet = race ? betMap[`${user?.id}_${race.round_number}`] : null;

  // Everyone's points at the chosen race, best first, ties sharing a place.
  const raceTable = race ? members
    .map(m => ({ ...m, pts: scoreMap[`${m.user_id}_${race.round_number}`]?.total_points ?? null }))
    .sort((a, b) => (b.pts ?? -1) - (a.pts ?? -1)) : [];
  let place = 0;
  raceTable.forEach((m, i) => {
    if (i === 0 || m.pts !== raceTable[i - 1].pts) place = i + 1;
    m.pos = m.pts == null ? null : place;
  });

  return (
    <div className="f1-screen">
      <div className="sport-col f1-body">
        <F1Header eyebrow={eyebrow} title="Report" />

        <div className="f1-seg" role="tablist" aria-label="Report type" style={{ maxWidth: 420 }}>
          {[['race', 'Race bets'], ['year', 'Season bets']].map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key}
              className={tab === key ? 'on' : ''} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'race' && (races.length === 0 ? (
          <div className="f1-card" style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-2)', fontSize: 'var(--fs-body)' }}>
            No races have finished yet. The report fills in after each race is scored.
          </div>
        ) : (
          <>
            <div className="f1-card" style={{ padding: '12px 12px 8px' }}>
              <div className="f1-rs" ref={stripRef} role="tablist" aria-label="Finished rounds">
                {races.map(r => {
                  const pts = scoreMap[`${user?.id}_${r.round_number}`]?.total_points;
                  const sel = r.id === race?.id;
                  return (
                    <button
                      key={r.id}
                      id={`f1-report-r${r.round_number}`}
                      type="button"
                      role="tab"
                      aria-selected={sel}
                      aria-label={`Round ${r.round_number}, ${r.gp_name}`}
                      className={`f1-r${sel ? ' cur' : ''}`}
                      onClick={() => { setRound(r.round_number); setShowAll(false); }}
                    >
                      <span className="rn">R{r.round_number}</span>
                      <span className="cd">{gpCode(r.gp_name)}</span>
                      <span className="rv">{pts != null ? `${pts} PTS` : r.is_scored ? '—' : 'TBC'}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {race && (
              <div className="sport-split">
                <div className="sport-main" style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
                  <section className="f1-live" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }} aria-label={`${race.gp_name} result`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <div className="f1-eb">R{race.round_number} · {formatDay(race.race_date)}{race.is_saturday ? ' · Saturday race' : ''}</div>
                        <h2 className="f1-h" style={{ fontSize: 'var(--fs-title)', color: 'var(--on-accent)', marginTop: 4 }}>{race.gp_name}</h2>
                      </div>
                      {myScore && (
                        <div style={{ textAlign: 'right', flex: 'none' }}>
                          <div className="f1-eb">You scored</div>
                          <div className="f1-mono" style={{ fontSize: 'var(--fs-title)', fontWeight: 600, color: 'var(--f1-gold-hi)', lineHeight: 1.1 }}>{myScore.total_points}</div>
                        </div>
                      )}
                    </div>
                    <div className="f1-podium">
                      {[['P1', race.result_p1], ['P2', race.result_p2], ['P3', race.result_p3]].map(([k, d]) => (
                        <div key={k}>
                          <div className="k">{k}</div>
                          <div className="d" title={d ?? ''}>{d ? driverCode(d) : '—'}</div>
                        </div>
                      ))}
                    </div>
                    {!race.is_scored && (
                      <span className="f1-mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--f1-navy-mute)' }}>Points are added once the league admin scores this race.</span>
                    )}
                  </section>

                  <div className="f1-card" style={{ overflow: 'hidden' }}>
                    <div className="f1-card-head" style={{ borderBottom: '1px solid var(--elev)' }}>
                      <span className="f1-eb">Your picks</span>
                      <span className="f1-eb">PTS</span>
                    </div>
                    {myBet ? (
                      <PicksList bet={myBet} score={myScore} race={race} withNotes />
                    ) : (
                      <div style={{ padding: '16px', fontSize: 'var(--fs-body)', color: 'var(--text-2)' }}>You made no picks for this race.</div>
                    )}
                  </div>

                  <button type="button" className="f1-btn2" aria-expanded={showAll} onClick={() => setShowAll(v => !v)}>
                    {showAll ? 'Hide everyone’s picks' : 'See everyone’s picks'}
                  </button>

                  {showAll && (
                    <div className="sport-cards" style={{ gap: 12 }}>
                      {sortedMembers.filter(m => m.user_id !== user?.id).map(m => {
                        const bet = betMap[`${m.user_id}_${race.round_number}`];
                        const score = scoreMap[`${m.user_id}_${race.round_number}`];
                        return (
                          <div key={m.user_id} className="f1-card" style={{ overflow: 'hidden' }}>
                            <div className="f1-card-head" style={{ borderBottom: '1px solid var(--elev)' }}>
                              <span style={{ fontWeight: 700, fontSize: 'var(--fs-body)', color: 'var(--paper)' }}>{m.display_name}</span>
                              <span className="f1-mono" style={{ fontSize: 'var(--fs-label)', fontWeight: 600 }}>{score ? `${score.total_points} PTS` : '—'}</span>
                            </div>
                            {bet
                              ? <PicksList bet={bet} score={score} race={race} />
                              : <div style={{ padding: '12px 16px', fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>No picks for this race.</div>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="sport-aside">
                  <div className="f1-card">
                    <div className="f1-card-head">
                      <span className="f1-eb">League at {race.gp_name.replace(/ GP$/, '')}</span>
                      <span className="f1-eb">PTS</span>
                    </div>
                    {raceTable.map((m, i) => (
                      <MemberRow
                        key={m.user_id}
                        first={i === 0}
                        rank={m.pos}
                        name={m.display_name}
                        value={m.pts ?? '—'}
                        gapLabel=""
                        me={m.user_id === user?.id}
                        lead={m.pos === 1}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        ))}

        {tab === 'year' && (!isBetsLocked ? (
          <div className="f1-card" style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-2)', fontSize: 'var(--fs-body)' }}>
            Season bets stay hidden until the league admin locks them. Then everyone&rsquo;s picks show here.
          </div>
        ) : (
          <div className="sport-cards" style={{ gap: 12 }}>
            {sortedMembers.map(member => {
              const bet = yearBetMap[member.user_id];
              const isMe = member.user_id === user?.id;
              const keys = YEAR_FIELD_KEYS.filter(key => bet?.[key]);
              return (
                <div key={member.user_id} className="f1-card" style={{ overflow: 'hidden' }}>
                  <div className="f1-card-head" style={{ borderBottom: '1px solid var(--elev)', background: isMe ? 'var(--f1-gold-wash)' : undefined }}>
                    <span style={{ fontWeight: 700, fontSize: 'var(--fs-body)', color: 'var(--paper)' }}>{isMe ? 'You' : member.display_name}</span>
                    <span className="f1-eb">{keys.length}/{YEAR_FIELD_KEYS.length}</span>
                  </div>
                  {keys.length === 0 ? (
                    <div style={{ padding: '12px 16px', fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>No season picks.</div>
                  ) : keys.map((key, i) => {
                    const pick = bet[key];
                    const result = yearResults?.[key];
                    const isRight = result && pick === result;
                    return (
                      <div key={key} className={`f1-kv${i === 0 ? ' first' : ''}`} style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) auto' }}>
                        <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>{YEAR_LABELS[key]}</span>
                        <span className="n" style={{ fontSize: 'var(--fs-label)' }}>{pick}</span>
                        <span className={`v ${result ? (isRight ? 'f1-ok' : 'f1-nok') : ''}`} style={{ fontSize: 'var(--fs-label)' }}>
                          {result ? (isRight ? '+10' : '0') : '—'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
