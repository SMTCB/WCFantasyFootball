// A clubhouse on Home (MD-1, design board): the members table with who is here
// now, the clubhouse name, its newest Room line, and one row per league with your
// rank. On a phone the table is small and the line and rows run full width.
import { useEffect, useRef, useState } from 'react';
import MembersTable from '../clubhouse/MembersTable';
import { ArchivedBadge, FinishedBadge } from '../league/LeagueBadges';

const BODY = { fontFamily: 'var(--font-body)' };
const MONO = { fontFamily: 'var(--font-mono)' };
const NAME = { fontFamily: 'Archivo, sans-serif', fontWeight: 900, fontStretch: '114%', letterSpacing: '-.02em', lineHeight: 1 };

const SPORT_LABEL = { football: 'Football', f1: 'F1', tennis: 'Tennis' };
const EMPTY = new Set();

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function ago(iso, now) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86400)} d`;
}

function useNow(ms) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

// A small picture of the ground each sport is played on, with one thing moving
// on it (design board): the ball passing on the pitch, two cars lapping the
// track, the ball crossing the net. It stops while off screen, and stays still
// for people who ask their phone for less motion.
const TRACK = 'M8 28 C8 12 20 8 28 14 S44 10 44 20 S30 32 8 28Z';
const BALL_PASS = 'M14 19 L26 12 L20 27 L34 25 L26 12 L40 19 L14 19';
const BALL_RALLY = 'M14 25 Q26 1 39 13 Q26 5 14 25';

function useSmilPause(ref) {
  useEffect(() => {
    const svg = ref.current;
    if (!svg?.pauseAnimations) return undefined;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (still) {
      svg.pauseAnimations();
      svg.setCurrentTime(1.2);
      return undefined;
    }
    if (!('IntersectionObserver' in window)) return undefined;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) svg.unpauseAnimations();
      else svg.pauseAnimations();
    });
    io.observe(svg);
    return () => io.disconnect();
  }, [ref]);
}

function Swatch({ sport }) {
  const ref = useRef(null);
  useSmilPause(ref);
  const line = 'color-mix(in srgb, var(--card) 70%, transparent)';
  const dot = 'color-mix(in srgb, var(--card) 85%, transparent)';
  return (
    <span aria-hidden style={{ width: 52, height: 38, borderRadius: 8, overflow: 'hidden', flex: 'none', display: 'block' }}>
      <svg ref={ref} viewBox="0 0 52 38" width="52" height="38" style={{ display: 'block' }}>
        {sport === 'f1' ? (
          <>
            <rect width="52" height="38" fill="var(--paper)" />
            <path d={TRACK} fill="none" stroke="var(--f1)" strokeWidth="2" strokeLinejoin="round" />
            <path d="M8 24 v8" stroke="var(--card)" strokeWidth="2" />
            <rect x="-2.2" y="-1.1" width="4.4" height="2.2" rx=".9" fill="var(--card)">
              <animateMotion dur="6s" begin="-0.7s" repeatCount="indefinite" rotate="auto" path={TRACK} />
            </rect>
            <rect x="-2.2" y="-1.1" width="4.4" height="2.2" rx=".9" fill="var(--gold)" stroke="var(--paper)" strokeWidth=".4">
              <animateMotion dur="6s" repeatCount="indefinite" rotate="auto" path={TRACK} />
            </rect>
          </>
        ) : sport === 'tennis' ? (
          <>
            <rect width="52" height="38" fill="var(--ten)" />
            <rect x="7" y="6" width="38" height="26" fill="none" stroke={line} strokeWidth="1.5" />
            <path d="M7 19h38M14 6v26M38 6v26" stroke={line} strokeWidth="1" />
            <path d="M26 4v30" stroke="var(--card)" strokeWidth="1.6" />
            <circle cx="12" cy="26" r="1.8" fill={dot} />
            <circle cx="40" cy="12" r="1.8" fill="var(--gold)" />
            <circle r="1.3" fill="var(--gold)" stroke="var(--paper)" strokeWidth=".35">
              <animateMotion dur="2.6s" repeatCount="indefinite" path={BALL_RALLY} />
            </circle>
          </>
        ) : (
          <>
            <rect width="52" height="38" fill="var(--accent)" />
            <rect x="4" y="4" width="44" height="30" fill="none" stroke={line} strokeWidth="1.5" />
            <path d="M26 4v30" stroke={line} strokeWidth="1.2" />
            <circle cx="26" cy="19" r="6" fill="none" stroke={line} strokeWidth="1.2" />
            <rect x="4" y="12" width="6" height="14" fill="none" stroke={line} strokeWidth="1.2" />
            <rect x="42" y="12" width="6" height="14" fill="none" stroke={line} strokeWidth="1.2" />
            {[[14, 19], [26, 12], [20, 27], [34, 25], [40, 19]].map(([x, y]) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" fill={dot} />
            ))}
            <circle r="1.3" fill="var(--card)" stroke="var(--paper)" strokeWidth=".4">
              <animateMotion dur="5.5s" repeatCount="indefinite" path={BALL_PASS} />
            </circle>
          </>
        )}
      </svg>
    </span>
  );
}

function detailFor(league, position, live) {
  if (live?.hasLive) return live.liveCount > 0 ? `Live · ${live.liveCount} of yours playing` : 'Live now';
  if (position && position.size > 1) {
    if (position.above) {
      const g = position.above.total - position.total;
      return g === 0 ? `Level with ${position.above.name}` : `${g} pts behind ${position.above.name}`;
    }
    if (position.below) {
      const g = position.total - position.below.total;
      return g === 0 ? `Level with ${position.below.name}` : `${g} pts clear of ${position.below.name}`;
    }
  }
  return SPORT_LABEL[league.sport];
}

function LeagueRow({ league, position, live, onOpen, first }) {
  const lead = position && position.rank === 1 && position.size > 1;
  return (
    <button
      onClick={onOpen}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 12, minHeight: 'var(--tap)', padding: '9px 0',
        background: 'transparent', border: 'none', borderTop: first ? 'none' : '1px solid var(--rule)', cursor: 'pointer', textAlign: 'left',
      }}
    >
      <Swatch sport={league.sport} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <b style={{ ...BODY, fontWeight: 800, fontSize: 'var(--fs-body)', color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{league.name}</b>
          {league.finished && <FinishedBadge />}
          {league.archived && <ArchivedBadge />}
        </span>
        <span style={{ display: 'block', ...MONO, fontSize: 'var(--fs-micro)', fontWeight: 500, color: live?.hasLive ? 'var(--danger)' : 'var(--mute)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {detailFor(league, position, live)}
        </span>
      </span>
      <span style={{ flex: 'none', whiteSpace: 'nowrap' }}>
        {position ? (
          <>
            <b className="num" style={{ ...NAME, fontStretch: '120%', fontSize: 'calc(var(--fs-heading) + 4px)', color: lead ? 'var(--gold-text)' : 'var(--paper)' }}>{ordinal(position.rank)}</b>
            <span style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', marginLeft: 4 }}>of {position.size}</span>
          </>
        ) : (
          <span style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>—</span>
        )}
      </span>
    </button>
  );
}

// circle, comps ({ football, f1, tennis }), members ([{ user_id, username }] or null while loading),
// meId, hereIds (Set), latest (newest Room line or null), positions (this clubhouse's),
// liveByLeague ({ leagueId: { hasLive, liveCount } }), compact (phone).
export default function ClubhouseCard({
  circle, comps, members, meId, hereIds, latest, positions, liveByLeague, compact,
  onEnter, onEnterCompetition, onOpenRoom,
}) {
  const now = useNow(60000);
  const leagues = [
    ...(comps?.football ?? []).map(c => ({ ...c, sport: 'football' })),
    ...(comps?.f1 ?? []).map(c => ({ ...c, sport: 'f1' })),
    ...(comps?.tennis ?? []).map(c => ({ ...c, sport: 'tennis' })),
  ];
  const positionOf = l => positions.find(p => p.sport === l.sport && String(p.leagueId) === String(l.id));
  const here = hereIds ?? EMPTY;
  const hereCount = (members ?? []).filter(m => here.has(m.user_id) && m.user_id !== meId).length;
  const memberCount = members?.length ?? 0;
  const tableSize = compact ? 118 : 236;
  const leagueWord = `${leagues.length} ${leagues.length === 1 ? 'league' : 'leagues'}`;

  const table = members && members.length > 0 ? (
    <MembersTable members={members} meId={meId} hereIds={here} latest={latest} size={tableSize} compact={compact} />
  ) : (
    <div aria-hidden style={{ width: tableSize, height: tableSize, flex: 'none' }} />
  );

  const top = (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
      <button
        onClick={onEnter}
        aria-label={`Go into ${circle.name}`}
        style={{ flex: 1, minWidth: 0, padding: 0, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <span style={{ display: 'block', ...MONO, fontSize: 'var(--fs-micro)', fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--mute)' }}>
          {compact ? leagueWord : `Clubhouse · ${leagueWord}`}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 5 }}>
          <span style={{ ...NAME, fontSize: compact ? 'calc(var(--fs-heading) + 2px)' : 'var(--fs-title)', color: 'var(--paper)', overflowWrap: 'anywhere' }}>{circle.name}</span>
          {circle.archived && <ArchivedBadge />}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: compact ? 8 : 14, flexWrap: 'wrap', marginTop: compact ? 6 : 8, ...MONO, fontSize: 'var(--fs-micro)', fontWeight: 500, color: 'var(--mute)' }}>
          {hereCount > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--positive)' }}>
              <span aria-hidden className="ch-here-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--positive)' }} />
              {hereCount} here{compact ? '' : ' now'}
            </span>
          )}
          {members && <span>{memberCount} {memberCount === 1 ? 'member' : 'members'}</span>}
        </span>
      </button>
      {!compact && (
        <button
          onClick={onEnter}
          style={{ flex: 'none', minHeight: 'var(--tap)', padding: '0 16px', background: 'var(--paper)', color: 'var(--card)', border: 'none', borderRadius: 999, ...BODY, fontSize: 'var(--fs-label)', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          Go in →
        </button>
      )}
    </div>
  );

  const last = latest && (
    <button
      onClick={() => onOpenRoom(latest.id)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 9, minHeight: 42, padding: '8px 10px', marginTop: compact ? 0 : 12,
        background: 'var(--bg)', border: 'none', borderRadius: 10, cursor: 'pointer', textAlign: 'left', ...BODY, fontSize: 'var(--fs-label)', color: 'var(--text-2)',
      }}
    >
      <span aria-hidden style={{ width: 24, height: 24, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center', background: 'var(--elev)', color: 'var(--paper)', fontSize: 'var(--fs-micro)', fontWeight: 800 }}>
        {(latest.username?.[0] ?? '?').toUpperCase()}
      </span>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <b style={{ color: 'var(--paper)' }}>{latest.username}</b>{' '}
        {latest.kind === 'bet_activity' && <b style={{ color: 'var(--paper)' }}>New bet: </b>}
        {latest.content}
      </span>
      <span style={{ flex: 'none', ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', whiteSpace: 'nowrap' }}>{ago(latest.createdAt, now)}</span>
    </button>
  );

  const rows = (
    <div style={{ marginTop: compact ? 0 : 12 }}>
      {leagues.length === 0 ? (
        <div style={{ ...BODY, fontSize: 'var(--fs-label)', color: 'var(--mute)', padding: '8px 0' }}>No leagues yet.</div>
      ) : leagues.map((l, i) => (
        <LeagueRow
          key={`${l.sport}-${l.id}`}
          league={l}
          position={positionOf(l)}
          live={l.sport === 'football' ? liveByLeague[l.id] : null}
          first={i === 0 && !compact}
          onOpen={() => onEnterCompetition(circle, l, l.sport)}
        />
      ))}
    </div>
  );

  const shell = {
    position: 'relative', background: 'var(--card)', border: '1px solid var(--rule)',
    boxShadow: '0 14px 34px -20px color-mix(in srgb, var(--paper) 25%, transparent)',
  };

  if (compact) {
    return (
      <article style={{ ...shell, display: 'grid', gridTemplateColumns: '118px minmax(0, 1fr)', gap: 14, alignItems: 'center', padding: 16, borderRadius: 16 }}>
        {table}
        {top}
        <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {last}
          {rows}
        </div>
      </article>
    );
  }

  return (
    <article style={{ ...shell, display: 'grid', gridTemplateColumns: '240px minmax(0, 1fr)', gap: 26, alignItems: 'center', padding: '22px 24px 22px 18px', borderRadius: 18 }}>
      <div style={{ display: 'grid', placeItems: 'center' }}>{table}</div>
      <div style={{ minWidth: 0 }}>
        {top}
        {last}
        {rows}
      </div>
    </article>
  );
}
