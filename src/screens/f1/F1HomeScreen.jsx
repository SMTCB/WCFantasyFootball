import { LoadingRows } from '../../components/Skeleton';
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { usePaddock } from '../../hooks/f1/usePaddock';
import { useSport } from '../../context/SportContext';
import { useAuth } from '../../hooks/useAuth';
import { gpCode, picksLockAt, picksLocked, useNow, formatWhen, formatDay } from '../../lib/f1/f1-data';
import { useShowArchived } from '../../hooks/useShowArchived';
import { ArchivedBadge } from '../../components/league/LeagueBadges';
import CompetitionSettingsModal from '../../components/shared/CompetitionSettingsModal';
import {
  F1Header, GearIcon, CircuitWatermark, StartLights, MemberRow,
} from '../../components/f1/F1Kit';
import F1RacePickForm from './F1RacePickForm';

const HOUR = 3600000;

// A race counts as current until three hours after lights out (or the end of
// race day when no start time is set), so race day still shows that race.
function raceEnd(r) {
  if (r.race_at) return new Date(r.race_at).getTime() + 3 * HOUR;
  return new Date(`${r.race_date}T23:59:59Z`).getTime();
}

function heroPill(race, locked, picksIn) {
  if (race.status === 'race') return <span className="f1-pill red">Live</span>;
  if (race.status === 'finished') return <span className="f1-pill mute">Finished</span>;
  if (locked) return <span className="f1-pill mute">Picks locked</span>;
  if (picksIn) return <span className="f1-pill on">Picks in</span>;
  return <span className="f1-pill red">Picks open</span>;
}

// Quali, picks lock and race as three stops on a line, filled up to now.
function SessionTimeline({ race, now }) {
  const lock = picksLockAt(race);
  const stops = [
    { k: 'QUALI', at: race.qualifying_at ? new Date(race.qualifying_at) : null },
    { k: 'PICKS LOCK', at: lock },
    { k: 'RACE', at: race.race_at ? new Date(race.race_at) : null },
  ];
  const passed = race.status === 'finished' ? 3 : stops.filter(s => s.at && s.at.getTime() <= now).length;
  return (
    <div className="f1-tl" aria-label="Race weekend timeline">
      <span className="line" />
      <span className="fill" style={{ width: `${Math.max(0, passed - 1) * 33.4}%` }} />
      {stops.map((s, i) => (
        <div key={s.k} className="st">
          <span className={`dot${i < passed ? ' past' : i === 2 ? ' race' : ''}`} />
          <span className="k">{s.k}</span>
          <span className="t">{s.at ? formatWhen(s.at) : 'TBC'}</span>
        </div>
      ))}
    </div>
  );
}

export default function F1HomeScreen() {
  const { paddockId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setActivePaddockId } = useSport();
  const { myPaddocks, activePaddock, setActivePaddockId: switchPaddock, refresh: refreshPaddocks } = usePaddock();
  const now = useNow(30000);

  const [races, setRaces] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [myScores, setMyScores] = useState({});
  const [myPickRounds, setMyPickRounds] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [showSelector, setShowSelector] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showArchived, setShowArchived] = useShowArchived('ffl_show_archived_paddocks');
  const [selectedRound, setSelectedRound] = useState(null);
  const stripRef = useRef(null);

  const archivedPaddockCount = myPaddocks.filter(p => p.archived).length;
  const visiblePaddocks = showArchived ? myPaddocks : myPaddocks.filter(p => !p.archived);

  useEffect(() => {
    if (paddockId) setActivePaddockId(paddockId);
  }, [paddockId, setActivePaddockId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const none = Promise.resolve({ data: [] });
      const [{ data: raceData }, { data: lbData }, { data: scoreData }, { data: betData }] = await Promise.all([
        supabase.from('f1_races').select('*').eq('season', 2026).order('round_number'),
        paddockId ? supabase.rpc('get_paddock_leaderboard', { p_paddock_id: paddockId }) : none,
        user?.id ? supabase.from('f1_scores').select('round_number,total_points').eq('user_id', user.id).eq('season', 2026).eq('score_type', 'race') : none,
        user?.id ? supabase.from('f1_bets_race').select('round_number').eq('user_id', user.id).eq('season', 2026) : none,
      ]);
      if (cancelled) return;
      setRaces(raceData ?? []);
      setLeaderboard(lbData ?? []);
      setMyScores(Object.fromEntries((scoreData ?? []).map(s => [s.round_number, s.total_points])));
      setMyPickRounds(new Set((betData ?? []).map(b => b.round_number)));
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [paddockId, user?.id]);

  const nextRace = races.find(r => r.status !== 'finished' && raceEnd(r) >= now) ?? races[races.length - 1];
  const selected = races.find(r => r.round_number === selectedRound) ?? nextRace;

  // Keep the selected round tile in the middle of the strip, without scrolling the page.
  useEffect(() => {
    const strip = stripRef.current;
    const tile = selected && document.getElementById(`f1-race-row-${selected.round_number}`);
    if (!strip || !tile) return;
    const offset = tile.getBoundingClientRect().left - strip.getBoundingClientRect().left + strip.scrollLeft;
    strip.scrollTo({ left: offset - strip.clientWidth / 2 + tile.clientWidth / 2, behavior: 'smooth' });
  }, [selected?.round_number, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="f1-screen">
        <div className="sport-col f1-body"><LoadingRows rows={5} /></div>
      </div>
    );
  }

  const finishedCount = races.filter(r => r.status === 'finished').length;
  // Round numbers run past the row count when a round is missing, so count by the highest round.
  const totalRounds = races.reduce((n, r) => Math.max(n, r.round_number ?? 0), 0);
  const lockAt = nextRace ? picksLockAt(nextRace) : null;
  const nextLocked = nextRace ? picksLocked(nextRace, new Date(now)) : false;
  const nextPicksIn = nextRace ? myPickRounds.has(nextRace.round_number) : false;

  const meIdx = user ? leaderboard.findIndex(m => m.user_id === user.id) : -1;
  const me = meIdx >= 0 ? leaderboard[meIdx] : null;
  const nearby = me ? leaderboard.slice(Math.max(0, meIdx - 1), meIdx + 2) : [];
  const leaderPts = leaderboard[0]?.total_points ?? 0;
  let raceNote = null;
  if (me && meIdx > 0) {
    const ahead = leaderboard[meIdx - 1];
    const gap = (ahead.total_points ?? 0) - (me.total_points ?? 0);
    raceNote = gap === 0 ? `Level on points with P${ahead.rank}.` : `${gap} point${gap === 1 ? '' : 's'} to P${ahead.rank}.`;
  } else if (me && leaderboard.length > 1) {
    const gap = (me.total_points ?? 0) - (leaderboard[1].total_points ?? 0);
    raceNote = gap === 0 ? 'Level at the top.' : `You lead by ${gap} point${gap === 1 ? '' : 's'}.`;
  }

  function openPicks(round) {
    setSelectedRound(round);
    requestAnimationFrame(() => {
      document.getElementById('f1-race-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  const heroAction = !nextRace ? null
    : nextRace.status === 'finished'
      ? { label: 'See the race report', onClick: () => navigate(`/f1/${paddockId}/report`) }
      : nextLocked
        ? { label: 'See your picks', onClick: () => openPicks(nextRace.round_number) }
        : { label: nextPicksIn ? 'Edit your picks' : 'Make your picks', onClick: () => openPicks(nextRace.round_number) };

  const headerRight = (
    <>
      {paddockId && activePaddock?.role === 'owner' && (
        <button type="button" className="f1-ib" aria-label="League settings" onClick={() => setShowSettings(true)}><GearIcon /></button>
      )}
      {/* Visible to everyone; the admin screen checks access itself. */}
      {paddockId && (
        <button type="button" className="f1-ib wide" onClick={() => navigate(`/f1/${paddockId}/admin`)}>ADMIN</button>
      )}
    </>
  );

  return (
    <div className="f1-screen">
      <div className="sport-col f1-body">
        <F1Header
          eyebrow={activePaddock?.member_count ? `F1 2026 · ${activePaddock.member_count} members` : 'F1 2026'}
          title={<>{activePaddock?.name ?? 'F1 league'}{activePaddock?.archived && <ArchivedBadge />}</>}
          onTitleClick={() => setShowSelector(s => !s)}
          titleLabel="Switch league"
          right={headerRight}
        />

        {showSelector && (
          <div className="f1-menu" role="menu">
            {visiblePaddocks.map(p => (
              <button
                key={p.paddock_id}
                type="button"
                role="menuitem"
                className={p.paddock_id === paddockId ? 'on' : ''}
                onClick={() => { switchPaddock(p.paddock_id); navigate(`/f1/${p.paddock_id}`); setShowSelector(false); }}
              >
                <span style={{ flex: 1 }}>{p.name}</span>
                <span className="f1-mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>{p.member_count} MEMBERS</span>
                {p.archived && <ArchivedBadge />}
              </button>
            ))}
            {archivedPaddockCount > 0 && (
              <button type="button" role="menuitem" className="sub" onClick={() => setShowArchived(v => !v)}>
                {showArchived ? 'Hide' : 'Show'} archived ({archivedPaddockCount})
              </button>
            )}
            <button type="button" role="menuitem" className="sub" onClick={() => { navigate('/f1'); setShowSelector(false); }}>
              + Join or create a league
            </button>
          </div>
        )}

        {showSettings && activePaddock && (
          <CompetitionSettingsModal
            competitionType="paddock"
            competitionId={activePaddock.paddock_id}
            name={activePaddock.name}
            archived={activePaddock.archived}
            archivedAt={activePaddock.archived_at}
            onUpdated={refreshPaddocks}
            onClose={() => setShowSettings(false)}
          />
        )}

        {nextRace && (
          <section className="f1-live f1-hero" aria-label="Next race">
            <CircuitWatermark />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'relative', minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span className="f1-eb">
                  Round {nextRace.round_number} of {totalRounds}{nextRace.is_saturday ? ' · Saturday race' : ''}
                </span>
                {heroPill(nextRace, nextLocked, nextPicksIn)}
              </div>
              <div>
                <h2 className="f1-h" style={{ fontSize: 'var(--fs-title)', color: 'var(--on-accent)' }}>{nextRace.gp_name}</h2>
                <div className="f1-mono" style={{ fontSize: 'var(--fs-label)', color: 'var(--f1-navy-mute)', marginTop: 6 }}>
                  {nextRace.circuit}{lockAt && nextRace.status !== 'finished' ? ` · picks lock ${formatWhen(lockAt)}` : ''}
                </div>
              </div>
              <SessionTimeline race={nextRace} now={now} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'relative', justifyContent: 'space-between' }}>
              {nextRace.status !== 'finished' && <StartLights lockAt={nextRace.is_manual_unlock ? null : lockAt} now={now} />}
              {heroAction && (
                <button type="button" className="f1-btn" onClick={heroAction.onClick}>{heroAction.label}</button>
              )}
            </div>
          </section>
        )}

        <div className="sport-split">
          {me && (
            <div className="sport-aside">
              <div className="f1-card">
                <div className="f1-card-head">
                  <span className="f1-eb">Your race</span>
                  <span className="f1-eb">PTS · GAP</span>
                </div>
                {nearby.map((m, i) => (
                  <MemberRow
                    key={m.user_id}
                    first={i === 0}
                    rank={m.rank}
                    name={m.display_name}
                    value={m.total_points ?? 0}
                    gap={m.user_id === me.user_id ? null : (m.total_points ?? 0) - (me.total_points ?? 0)}
                    gapLabel={m.user_id === me.user_id ? '' : undefined}
                    me={m.user_id === me.user_id}
                    lead={(m.total_points ?? 0) === leaderPts && m.rank === 1}
                  />
                ))}
                {raceNote && (
                  <div style={{ padding: '10px 16px 14px', fontSize: 'var(--fs-label)', color: 'var(--text-2)', borderTop: '1px solid var(--elev)' }}>
                    {raceNote} {finishedCount} of {totalRounds} races done.
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="sport-main" style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            <div className="f1-card" style={{ padding: '12px 12px 8px' }}>
              <div className="f1-card-head" style={{ padding: '0 4px 10px' }}>
                <span className="f1-eb">2026 calendar</span>
                <span className="f1-eb">{finishedCount}/{totalRounds} done</span>
              </div>
              <div className="f1-rs" ref={stripRef} role="tablist" aria-label="Rounds">
                {races.map(r => {
                  const isNext = r.id === nextRace?.id;
                  const isSel = r.id === selected?.id;
                  let rv;
                  if (r.status === 'finished') rv = myScores[r.round_number] != null ? `${myScores[r.round_number]} PTS` : '—';
                  else if (r.status === 'race') rv = 'LIVE';
                  else if (isNext) rv = myPickRounds.has(r.round_number) ? 'IN' : picksLocked(r, new Date(now)) ? 'LOCKED' : 'OPEN';
                  else rv = formatDay(r.race_date);
                  return (
                    <button
                      key={r.id}
                      id={`f1-race-row-${r.round_number}`}
                      type="button"
                      role="tab"
                      aria-selected={isSel}
                      aria-label={`Round ${r.round_number}, ${r.gp_name}`}
                      className={`f1-r${isSel ? ' cur' : ''}${isNext ? ' next' : ''}`}
                      onClick={() => setSelectedRound(r.round_number)}
                    >
                      <span className="rn">R{r.round_number}</span>
                      <span className="cd">{gpCode(r.gp_name)}</span>
                      <span className="rv">{rv}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {selected && (
              <section id="f1-race-panel" className="f1-card" style={{ padding: 16, scrollMarginTop: 72 }} aria-label={`Round ${selected.round_number} picks`}>
                <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--elev)' }}>
                  <div className="f1-eb">
                    Round {selected.round_number} · {formatDay(selected.race_date)}{selected.is_saturday ? ' · Saturday race' : ''}
                  </div>
                  <h2 className="f1-h" style={{ fontSize: 'var(--fs-title)', marginTop: 4 }}>{selected.gp_name}</h2>
                  <div className="f1-mono" style={{ fontSize: 'var(--fs-label)', color: 'var(--text-2)', marginTop: 4 }}>{selected.circuit}</div>
                </div>
                <F1RacePickForm
                  key={selected.id}
                  race={selected}
                  paddock={activePaddock}
                  myPoints={myScores[selected.round_number] ?? null}
                  onSaved={round => setMyPickRounds(s => new Set(s).add(round))}
                  onOpenReport={() => navigate(`/f1/${paddockId}/report`)}
                />
              </section>
            )}
          </div>

          {leaderboard.length > 0 && (
            <div className="sport-aside">
              <div className="f1-card">
                <div className="f1-card-head">
                  <span className="f1-eb">Top of the league</span>
                  <button type="button" className="f1-link" onClick={() => navigate(`/f1/${paddockId}/standings`)}>Table</button>
                </div>
                {leaderboard.slice(0, 5).map((m, i) => (
                  <MemberRow
                    key={m.user_id}
                    first={i === 0}
                    rank={m.rank}
                    name={m.display_name}
                    value={m.total_points ?? 0}
                    gap={i === 0 ? null : (m.total_points ?? 0) - leaderPts}
                    me={user && m.user_id === user.id}
                    lead={i === 0}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
