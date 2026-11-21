import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLeagueMatchweek } from '../../hooks/useLeagueMatchweek';
import { useRoomPulse } from '../../hooks/useRoomPulse';
import { useIsMobile } from '../../hooks/useViewport';
import { teamCode } from '../../lib/fixtures';

// The league's matchweek pieces, split across two tabs since S30 (MD-11):
//   part="team":  your race, the latest Room line, your squad (passed in as children,
//                 the Squad screen's pitch unchanged) and this round's fixtures.
//   part="table": the table as it stands this week (MD-7).
// ClubCrest comes in as a prop: LeagueScreen imports it at depth 1 (TDZ rule, CLAUDE.md).

const DISPLAY = "'Archivo Black', 'Archivo', sans-serif";
const NUM = { fontVariantNumeric: 'tabular-nums' };

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function ago(iso) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86400)} d`;
}

const fmtPts = (n) => (n == null ? '—' : Math.round(Number(n)));
const roundNo = (matchdayId) => (matchdayId ? (String(matchdayId).match(/-r(\d+)$/)?.[1] ?? null) : null);

const card = { background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 16 };
const eyebrow = { fontSize: 'var(--fs-micro)', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--mute)' };
const linkBtn = {
  background: 'none', border: 'none', padding: '0 4px', minHeight: 'var(--tap)', cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 'var(--fs-label)', fontWeight: 700, color: 'var(--accent)',
};

function SectionHead({ title, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px 0', minHeight: 'var(--tap)' }}>
      <h2 style={{ margin: 0, fontSize: 'var(--fs-body)', fontWeight: 800, color: 'var(--paper)' }}>{title}</h2>
      <span style={{ flex: 1 }} />
      {right}
    </div>
  );
}

// ── Header: round, status and your points ────────────────────────────────────
function WeekHeader({ mw, rankRow, size, liveCount, compact }) {
  const anyLive = mw.fixtures.some(f => f.status === 'live');
  const allDone = mw.fixtures.length > 0 && mw.fixtures.every(f => f.status === 'finished');
  const no = roundNo(mw.matchdayId);
  let status;
  if (!mw.started) {
    status = mw.deadlineAt
      ? `Picks lock ${new Date(mw.deadlineAt).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
      : 'Not started';
  } else if (anyLive) status = liveCount > 0 ? `Live · ${liveCount} of yours playing` : 'Live';
  else if (allDone) status = 'Finished';
  else status = 'In progress';
  const moved = rankRow?.rank_before != null && rankRow?.live_rank != null ? rankRow.rank_before - rankRow.live_rank : 0;

  return (
    <div style={{ ...card, display: 'flex', alignItems: 'center', gap: compact ? 12 : 20, padding: compact ? '14px 16px' : '18px 22px' }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={eyebrow}>{no ? `Matchweek ${no}` : 'Matchweek'}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 'var(--fs-label)', fontWeight: 700, color: anyLive ? 'var(--danger)' : 'var(--mute)' }}>
          {anyLive && <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)', animation: 'pulse 1.6s ease-in-out infinite' }} />}
          {status}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="num" style={{ ...NUM, fontFamily: DISPLAY, fontSize: compact ? 'var(--fs-title)' : 'var(--fs-display)', lineHeight: 1, color: 'var(--paper)' }}>{fmtPts(mw.gwPoints ?? 0)}</div>
        <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--mute)', marginTop: 2 }}>pts this week</div>
      </div>
      {rankRow?.live_rank != null && (
        <div style={{ textAlign: 'right', paddingLeft: compact ? 12 : 20, borderLeft: '1px solid var(--rule)' }}>
          <div className="num" style={{ ...NUM, fontFamily: DISPLAY, fontSize: compact ? 'var(--fs-title)' : 'var(--fs-display)', lineHeight: 1, color: rankRow.live_rank === 1 ? 'var(--gold-text)' : 'var(--paper)' }}>{ordinal(rankRow.live_rank)}</div>
          <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--mute)', marginTop: 2 }}>
            of {size}
            {moved !== 0 && <span style={{ marginLeft: 6, fontWeight: 700, color: moved > 0 ? 'var(--positive)' : 'var(--danger)' }}>{moved > 0 ? '▲' : '▼'}{Math.abs(moved)}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Your race: the people either side of you, or this round's H2H opponent ───
function RaceCard({ rows, meId, duel, gwPoints, compact }) {
  if (duel) {
    if (duel.is_bye) {
      return <div style={{ ...card, padding: '14px 16px', fontSize: 'var(--fs-body)', color: 'var(--mute)' }}>Head to head: you have a bye this week.</div>;
    }
    const oppId = duel.home_user_id === meId ? duel.away_user_id : duel.home_user_id;
    const opp = rows.find(r => r.user_id === oppId);
    const mine = gwPoints ?? rows.find(r => r.user_id === meId)?.matchday_points ?? 0;
    const theirs = opp?.matchday_points ?? null;
    const diff = theirs == null ? null : Math.round(mine) - Math.round(theirs);
    return (
      <div style={{ ...card, padding: compact ? '14px 16px' : '16px 22px' }}>
        <div style={eyebrow}>Head to head this week</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <div style={{ fontSize: 'var(--fs-body)', fontWeight: 800, color: 'var(--paper)' }}>You</div>
          <div className="num" style={{ ...NUM, fontFamily: DISPLAY, fontSize: 'var(--fs-title)', color: 'var(--paper)', whiteSpace: 'nowrap' }}>
            {fmtPts(mine)} <span style={{ color: 'var(--mute)' }}>–</span> {fmtPts(theirs)}
          </div>
          <div style={{ fontSize: 'var(--fs-body)', fontWeight: 800, color: 'var(--paper)', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opp?.username ?? 'Opponent'}</div>
        </div>
        {diff != null && (
          <div style={{ marginTop: 6, fontSize: 'var(--fs-label)', fontWeight: 700, color: diff > 0 ? 'var(--positive)' : diff < 0 ? 'var(--danger)' : 'var(--mute)' }}>
            {diff > 0 ? `You lead by ${diff}` : diff < 0 ? `${opp?.username ?? 'They'} lead${opp ? 's' : ''} by ${-diff}` : 'Level'}
          </div>
        )}
      </div>
    );
  }

  const i = rows.findIndex(r => r.user_id === meId);
  if (i < 0 || rows.length < 2) return null;
  const me = rows[i];
  const above = rows[i - 1] ?? null;
  const below = rows[i + 1] ?? null;
  const gap = (a, b) => Math.round(Number(a.total_points)) - Math.round(Number(b.total_points));
  const cell = (row, side) => {
    if (!row) return <div />;
    const g = side === 'above' ? gap(row, me) : gap(me, row);
    return (
      <div style={{ minWidth: 0, textAlign: side === 'above' ? 'left' : 'right' }}>
        <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>{side === 'above' ? `${ordinal(i)} · ahead` : `${ordinal(i + 2)} · behind`}</div>
        <div style={{ fontSize: 'var(--fs-body)', fontWeight: 800, color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.username ?? 'Member'}</div>
        <div className="num" style={{ ...NUM, fontSize: 'var(--fs-label)', fontWeight: 700, color: side === 'above' ? 'var(--danger)' : 'var(--positive)' }}>
          {g === 0 ? 'Level' : side === 'above' ? `${g} pts ahead of you` : `${g} pts behind you`}
        </div>
      </div>
    );
  };
  return (
    <div style={{ ...card, padding: compact ? '14px 16px' : '16px 22px' }}>
      <div style={eyebrow}>Your race</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: compact ? 10 : 18, marginTop: 8 }}>
        {cell(above, 'above')}
        <div style={{ textAlign: 'center', padding: '6px 12px', borderRadius: 12, background: 'var(--accent-soft)' }}>
          <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--accent)', fontWeight: 700 }}>You</div>
          <div className="num" style={{ ...NUM, fontFamily: DISPLAY, fontSize: 'var(--fs-heading)', color: 'var(--paper)' }}>{fmtPts(me.total_points)}</div>
        </div>
        {cell(below, 'below')}
      </div>
    </div>
  );
}

// ── The table as it stands; rows slide to their new place when ranks change ───
function LiveTable({ rows, meId, showWeek, onFullTable }) {
  const els = useRef(new Map());
  const tops = useRef(new Map());
  const order = rows.map(r => r.user_id).join(',');

  useLayoutEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const next = new Map();
    els.current.forEach((el, id) => { if (el) next.set(id, el.offsetTop); });
    if (!reduce) {
      next.forEach((top, id) => {
        const old = tops.current.get(id);
        const el = els.current.get(id);
        if (el && old != null && old !== top) {
          el.style.transition = 'none';
          el.style.transform = `translateY(${old - top}px)`;
          requestAnimationFrame(() => {
            el.style.transition = 'transform 600ms cubic-bezier(.2,.8,.2,1)';
            el.style.transform = '';
          });
        }
      });
    }
    tops.current = next;
  }, [order]);

  return (
    <div data-tour="league-standings" style={{ ...card, overflow: 'hidden' }}>
      <SectionHead title="The table as it stands" right={<button type="button" onClick={onFullTable} style={linkBtn}>Full table →</button>} />
      <div role="table" aria-label="League table" style={{ position: 'relative', padding: '4px 0 8px' }}>
        <div role="row" style={{ display: 'grid', gridTemplateColumns: '34px 1fr 64px 64px', gap: 8, padding: '6px 16px', ...eyebrow }}>
          <span role="columnheader">#</span><span role="columnheader">Manager</span>
          <span role="columnheader" style={{ textAlign: 'right' }}>{showWeek ? 'Week' : ''}</span>
          <span role="columnheader" style={{ textAlign: 'right' }}>Total</span>
        </div>
        {rows.map(r => {
          const me = r.user_id === meId;
          const moved = r.rank_before != null && r.live_rank != null ? r.rank_before - r.live_rank : 0;
          return (
            <div role="row" key={r.user_id} ref={el => { if (el) els.current.set(r.user_id, el); else els.current.delete(r.user_id); }}
              style={{
                display: 'grid', gridTemplateColumns: '34px 1fr 64px 64px', gap: 8, alignItems: 'center',
                padding: '9px 16px', borderTop: '1px solid var(--rule)', position: 'relative',
                background: me ? 'var(--accent-soft)' : 'var(--card)',
              }}>
              <span role="cell" className="num" style={{ ...NUM, fontWeight: 800, color: r.live_rank === 1 ? 'var(--gold-text)' : 'var(--paper)' }}>{r.live_rank ?? '—'}</span>
              <span role="cell" style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <span style={{ fontWeight: me ? 800 : 600, color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{me ? 'You' : (r.username ?? 'Member')}</span>
                {moved !== 0 && <span aria-label={moved > 0 ? `up ${moved}` : `down ${-moved}`} style={{ fontSize: 'var(--fs-micro)', fontWeight: 700, color: moved > 0 ? 'var(--positive)' : 'var(--danger)' }}>{moved > 0 ? '▲' : '▼'}{Math.abs(moved)}</span>}
              </span>
              <span role="cell" className="num" style={{ ...NUM, textAlign: 'right', color: 'var(--mute)' }}>{showWeek ? fmtPts(r.matchday_points) : ''}</span>
              <span role="cell" className="num" style={{ ...NUM, textAlign: 'right', fontWeight: 800, color: 'var(--paper)' }}>{fmtPts(r.total_points)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Fixtures({ fixtures, crest, compact }) {
  const ClubCrest = crest;
  if (!fixtures.length) return null;
  return (
    <div style={{ ...card, overflow: 'hidden' }}>
      <SectionHead title="This week's fixtures" />
      <div style={{ padding: '4px 0 8px' }}>
        {fixtures.map(f => {
          const live = f.status === 'live';
          const done = f.status === 'finished';
          const when = live ? (f.minute ? `${f.minute}'` : 'Live') : done ? 'FT'
            : new Date(f.kickoff_at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
          const name = (t) => (compact ? teamCode(t) : t);
          return (
            <div key={f.id} style={{ display: 'grid', gridTemplateColumns: compact ? '56px 1fr auto 1fr' : '84px 1fr auto 1fr', alignItems: 'center', gap: 8, padding: '9px 16px', borderTop: '1px solid var(--rule)' }}>
              <span className="num" style={{ ...NUM, fontSize: 'var(--fs-micro)', fontWeight: 700, color: live ? 'var(--danger)' : 'var(--mute)', whiteSpace: compact ? 'normal' : 'nowrap' }}>{when}</span>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, minWidth: 0, fontSize: 'var(--fs-label)', fontWeight: 600, color: 'var(--paper)' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name(f.home_team)}</span>
                <ClubCrest name={f.home_team} size={18} />
              </span>
              <span className="num" style={{ ...NUM, minWidth: 44, textAlign: 'center', fontFamily: DISPLAY, fontSize: 'var(--fs-body)', color: live ? 'var(--danger)' : 'var(--paper)' }}>
                {live || done ? `${f.homeGoals}–${f.awayGoals}` : 'v'}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, fontSize: 'var(--fs-label)', fontWeight: 600, color: 'var(--paper)' }}>
                <ClubCrest name={f.away_team} size={18} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name(f.away_team)}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RoomLine({ circleId }) {
  const navigate = useNavigate();
  const { messages } = useRoomPulse(circleId, { limit: 1 });
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60 * 1000);
    return () => clearInterval(t);
  }, []);
  if (!circleId) return null;
  const m = messages[0];
  return (
    <button type="button" onClick={() => navigate(`/clubhouse/${circleId}?tab=room${m ? `&msg=${m.id}` : ''}`)}
      style={{ ...card, width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', minHeight: 'var(--tap)' }}>
      <span style={{ ...eyebrow, flexShrink: 0 }}>The Room</span>
      {m ? (
        <>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--fs-label)', color: 'var(--paper)' }}>
            <b>{m.username}</b> {m.content}
          </span>
          <span style={{ flexShrink: 0, fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>{ago(m.createdAt)}</span>
        </>
      ) : (
        <span style={{ flex: 1, fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>Nothing said yet. Say something →</span>
      )}
    </button>
  );
}

export default function MatchweekView(props) {
  const { leagueId, tournamentId, meId, h2hEnabled = false } = props;
  const mw = useLeagueMatchweek({ leagueId, tournamentId, userId: meId, h2hEnabled });
  return <MatchweekBody {...props} mw={mw} />;
}

export function MatchweekBody({ mw, meId, circleId, members = [], h2hEnabled = false, ClubCrest, onTab, part = 'team', children = null }) {
  const isMobile = useIsMobile();

  // Before migration 313 is applied the table function is missing: season totals only.
  const rows = useMemo(() => {
    if (mw.table?.length) return mw.table;
    return (members ?? []).map(m => ({
      user_id: m.user_id, username: m.users?.username ?? 'Member',
      total_points: m.total_points ?? 0, matchday_points: null, live_rank: m.rank ?? null, rank_before: null,
    }));
  }, [mw.table, members]);
  const showWeek = Boolean(mw.table?.length) && mw.started;
  const meRow = rows.find(r => r.user_id === meId) ?? null;
  const liveCount = (mw.squad?.players ?? []).filter(p => p.live).length;
  const pad = isMobile ? 12 : 'max(16px, 3vw)';
  const gap = isMobile ? 12 : 16;
  const column = { padding: pad, display: 'flex', flexDirection: 'column', gap, maxWidth: 1240, width: '100%', margin: '0 auto', boxSizing: 'border-box' };

  if (part === 'table') {
    if (mw.loading && !mw.matchdayId) {
      return <div style={{ padding: 32, textAlign: 'center', color: 'var(--mute)', fontSize: 'var(--fs-label)' }}>Loading the matchweek…</div>;
    }
    return (
      <div data-testid="week-table-view" style={{ ...column, paddingBottom: 32 }}>
        {!mw.matchdayId && (
          <div style={{ ...card, padding: '18px 20px', fontSize: 'var(--fs-body)', color: 'var(--mute)' }}>No matchweek on the calendar yet.</div>
        )}
        <LiveTable rows={rows} meId={meId} showWeek={mw.matchdayId ? showWeek : false} onFullTable={() => onTab('table')} />
      </div>
    );
  }

  // My team: the squad never waits on the matchweek queries; the race and fixtures
  // appear around it once there is a round on the calendar.
  const hasRound = Boolean(mw.matchdayId);
  return (
    <div data-testid="my-team-view" style={{ display: 'flex', flexDirection: 'column' }}>
      {hasRound && (
        <div style={{ ...column, paddingBottom: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1fr) minmax(0,1fr)', gap }}>
            <WeekHeader mw={mw} rankRow={meRow} size={rows.length} liveCount={liveCount} compact={isMobile} />
            <RaceCard rows={rows} meId={meId} duel={h2hEnabled ? mw.duel : null} gwPoints={mw.gwPoints} compact={isMobile} />
          </div>
          <RoomLine circleId={circleId} />
        </div>
      )}
      <div style={{ marginTop: hasRound ? gap : 0 }}>{children}</div>
      {hasRound && (
        <div style={{ ...column, paddingBottom: 32 }}>
          <Fixtures fixtures={mw.fixtures} crest={ClubCrest} compact={isMobile} />
        </div>
      )}
    </div>
  );
}
