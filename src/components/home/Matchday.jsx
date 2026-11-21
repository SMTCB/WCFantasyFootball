// Home "Matchday" pieces (MD-1): headline, score ticker, live hero, next
// deadline, and the "Where you stand" list. Light page; the live card is the
// one dark surface, as on the design board.
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { teamCode } from '../../lib/fixtures';
import NumberFlow from '../motion/NumberFlow';

const BODY = { fontFamily: 'var(--font-body)' };
const MONO = { fontFamily: 'var(--font-mono)' };
const HEAD = { fontFamily: 'Archivo Black, sans-serif' };

const SPORT_LABEL = { football: 'Football', f1: 'F1', tennis: 'Tennis' };
const SPORT_COLOR = { football: 'var(--accent)', f1: 'var(--f1)', tennis: 'var(--ten)' };

const ON_DARK      = 'var(--bg)';
const ON_DARK_MUTE = 'color-mix(in srgb, var(--bg) 68%, transparent)';
const DARK_TILE    = 'color-mix(in srgb, var(--card) 7%, transparent)';
const DARK_LINE    = 'color-mix(in srgb, var(--card) 16%, transparent)';

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function plural(n, one, many = `${one}s`) { return `${n} ${n === 1 ? one : many}`; }

function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function formatCountdown(ms) {
  if (ms <= 0) return 'now';
  const mins = Math.floor(ms / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m`;
}

function LiveDot({ size = 8 }) {
  return <span className="animate-live-pulse" aria-hidden style={{ width: size, height: size, borderRadius: '50%', background: 'var(--danger)', flexShrink: 0, display: 'inline-block' }} />;
}

function Pill({ children }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 34, padding: '0 13px', borderRadius: 999,
      background: 'var(--card)', border: '1px solid var(--rule)',
      ...BODY, fontSize: 'var(--fs-label)', color: 'var(--text-2)', whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

// ── Score ticker: live fixtures only. Renders nothing when nothing is live. ──
export function ScoreTicker({ fixtures }) {
  if (!fixtures?.length) return null;
  return (
    <div
      role="region"
      aria-label="Live scores"
      style={{ background: 'var(--paper)', color: ON_DARK, overflowX: 'auto', whiteSpace: 'nowrap', scrollbarWidth: 'none' }}
    >
      <div style={{ display: 'inline-flex', alignItems: 'center', minHeight: 40, padding: '0 16px', gap: 22 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, ...MONO, fontSize: 'var(--fs-micro)', letterSpacing: '.16em', fontWeight: 700 }}>
          <LiveDot size={7} />LIVE
        </span>
        {fixtures.map(f => (
          <span key={f.id} style={{ ...MONO, fontSize: 'var(--fs-label)', display: 'inline-flex', gap: 6, alignItems: 'baseline' }}>
            <span>{teamCode(f.home_team)}</span>
            <b style={{ color: 'var(--card)' }}>{f.homeGoals}–{f.awayGoals}</b>
            <span>{teamCode(f.away_team)}</span>
            {f.minute != null && <span style={{ color: ON_DARK_MUTE }}>{f.minute}′</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Headline: "You lead N of your M leagues", the closest race, live pills ──
export function HomeHeadline({ summary, clubhouseCount, liveLeagueCount, isMobile }) {
  const now = useNow(30000);
  const today = new Date(now).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const { leading, total, contested, closest, best } = summary;

  const eyebrow = [
    today,
    liveLeagueCount > 0 ? 'Match day' : null,
    total > 0 ? `${plural(clubhouseCount, 'clubhouse')}, ${plural(total, 'league')}` : null,
  ].filter(Boolean).join(' · ');

  let headline;
  if (total === 0) {
    headline = <>Welcome to the Clubhouse.</>;
  } else if (contested === 0) {
    headline = <>Your {total === 1 ? 'league is' : `${total} leagues are`} waiting for rivals.</>;
  } else if (leading > 0) {
    headline = <>You lead <em style={EM}>{leading}</em> of your {plural(total, 'league')}.</>;
  } else {
    headline = <>You're <em style={EM}>{ordinal(best.rank)}</em> in {best.leagueName}.</>;
  }

  let sub = null;
  if (closest) {
    const where = `${closest.position.leagueName} · ${closest.position.circleName}`;
    sub = closest.gap === 0
      ? <>Closest race: level with <b style={{ color: 'var(--paper)' }}>{closest.other}</b> in {where}.</>
      : <>Closest race: {closest.gap} {closest.gap === 1 ? 'point' : 'points'} {closest.dir} <b style={{ color: 'var(--paper)' }}>{closest.other}</b> in {where}.</>;
  } else if (total === 0) {
    sub = clubhouseCount > 0
      ? <>Open a clubhouse and add a league to start playing.</>
      : <>Join a clubhouse or start one, then pick a league to play in.</>;
  }

  return (
    <section style={{ padding: isMobile ? '18px 0 4px' : '6px 0 4px' }}>
      <div style={{ ...MONO, fontSize: 'var(--fs-micro)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--mute)' }}>{eyebrow}</div>
      <h1 style={{ ...HEAD, fontSize: isMobile ? 34 : 'clamp(40px, 5vw, 60px)', lineHeight: 1.02, letterSpacing: '-0.03em', color: 'var(--paper)', margin: '12px 0 14px', maxWidth: '16ch' }}>
        {headline}
      </h1>
      {sub && <p style={{ ...BODY, fontSize: isMobile ? 'var(--fs-body)' : 'var(--fs-body-lg)', lineHeight: 1.45, color: 'var(--text-2)', margin: '0 0 16px', maxWidth: '48ch' }}>{sub}</p>}
      {liveLeagueCount > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Pill><LiveDot size={7} /><b style={{ ...MONO, color: 'var(--paper)' }}>{liveLeagueCount}</b> {liveLeagueCount === 1 ? 'league' : 'leagues'} live now</Pill>
        </div>
      )}
    </section>
  );
}

const EM = { fontStyle: 'normal', color: 'var(--gold-text)', background: 'linear-gradient(var(--gold-soft), var(--gold-soft)) 0 88% / 100% 24% no-repeat' };

// ── Live hero: your players in the league you pick, and your race in it ──
export function LiveHero({ leagues, fixtures, positionByLeague, circleByLeague, isMobile }) {
  const navigate = useNavigate();
  const [pickedId, setPickedId] = useState(null);
  const league = leagues.find(l => l.leagueId === pickedId) ?? leagues[0];
  if (!league) return null;

  const fx = fixtures.filter(f => f.tournament_id === league.tournamentId);
  const firstFx = fx[0];
  const shown = league.starters
    .filter(p => p.live || (p.minutes ?? 0) > 0)
    .sort((a, b) => (b.live - a.live) || (b.displayPoints - a.displayPoints));
  const maxTiles = isMobile ? 4 : 8;
  const pos = positionByLeague[league.leagueId];

  return (
    <section style={{ background: 'var(--paper)', color: ON_DARK, borderRadius: 16, padding: isMobile ? '16px 16px' : '20px 22px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <LiveDot />
        <span style={{ ...HEAD, fontSize: 'var(--fs-body-lg)', color: 'var(--card)' }}>Your players, live</span>
        {firstFx && (
          <span style={{ marginLeft: 'auto', ...MONO, fontSize: 'var(--fs-label)', color: ON_DARK_MUTE }}>
            {teamCode(firstFx.home_team)} <b style={{ color: 'var(--card)' }}>{firstFx.homeGoals}–{firstFx.awayGoals}</b> {teamCode(firstFx.away_team)}
            {firstFx.minute != null && ` · ${firstFx.minute}′`}
            {fx.length > 1 && ` · +${fx.length - 1} more`}
          </span>
        )}
      </div>

      {leagues.length > 1 && (
        <div role="tablist" aria-label="Live leagues" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {leagues.map(l => {
            const on = l.leagueId === league.leagueId;
            return (
              <button
                key={l.leagueId}
                role="tab"
                aria-selected={on}
                onClick={() => setPickedId(l.leagueId)}
                style={{
                  minHeight: 32, padding: '0 11px', borderRadius: 999, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  background: on ? 'color-mix(in srgb, var(--card) 14%, transparent)' : 'transparent',
                  border: on ? '1px solid transparent' : `1px solid ${DARK_LINE}`,
                  color: on ? 'var(--card)' : ON_DARK_MUTE, ...BODY, fontSize: 'var(--fs-micro)', fontWeight: 600, whiteSpace: 'nowrap',
                }}
              >
                {l.liveCount > 0 && <LiveDot size={6} />}
                {l.name}{circleByLeague[l.leagueId] ? ` · ${circleByLeague[l.leagueId]}` : ''}
              </button>
            );
          })}
        </div>
      )}
      {leagues.length === 1 && circleByLeague[league.leagueId] && (
        <div style={{ ...MONO, fontSize: 'var(--fs-micro)', color: ON_DARK_MUTE, marginBottom: 12 }}>
          {league.name} · {circleByLeague[league.leagueId]}
        </div>
      )}

      {shown.length === 0 ? (
        <div style={{ ...BODY, fontSize: 'var(--fs-label)', color: ON_DARK_MUTE, padding: '6px 0 2px' }}>
          None of your players has kicked off yet in this league.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${isMobile ? 2 : 4}, minmax(0, 1fr))`, gap: 8 }}>
          {shown.slice(0, maxTiles).map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: DARK_TILE, borderRadius: 10, padding: '9px 11px', minWidth: 0 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...BODY, fontSize: 'var(--fs-label)', fontWeight: 700, color: 'var(--card)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}
                </div>
                <div style={{ ...MONO, fontSize: 'var(--fs-micro)', color: ON_DARK_MUTE, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {teamCode(p.club)} · {p.position}{p.isCaptain ? ' · C' : ''}{p.live ? '' : ' · FT'}
                </div>
              </div>
              <NumberFlow value={p.displayPoints} style={{ ...MONO, fontSize: 'var(--fs-heading)', fontWeight: 700, color: p.live ? 'var(--card)' : ON_DARK_MUTE }} />
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
        {pos && <RaceStrip pos={pos} />}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, marginLeft: 'auto' }}>
          {league.gwPoints != null && (
            <span style={{ ...MONO, fontSize: 'var(--fs-label)', color: ON_DARK_MUTE }}>
              This round <b style={{ color: 'var(--card)' }}><NumberFlow value={league.gwPoints} /></b>
            </span>
          )}
          <button
            onClick={() => navigate(`/league/${league.leagueId}?tab=matchweek`)}
            style={{ minHeight: 'var(--tap)', padding: '0 14px', borderRadius: 999, border: `1px solid ${DARK_LINE}`, background: 'transparent', color: 'var(--card)', ...BODY, fontSize: 'var(--fs-label)', fontWeight: 700, cursor: 'pointer' }}
          >Open matchweek →</button>
        </span>
      </div>
    </section>
  );
}

function RaceStrip({ pos }) {
  let text;
  if (pos.size <= 1) text = 'Only you so far';
  else if (pos.above) {
    const gap = pos.above.total - pos.total;
    text = gap === 0 ? `Level with ${pos.above.name}` : `${pos.above.name} ${gap} ahead`;
  } else if (pos.below) {
    const gap = pos.total - pos.below.total;
    text = gap === 0 ? `Level with ${pos.below.name}` : `${gap} clear of ${pos.below.name}`;
  }
  return (
    <span style={{ ...MONO, fontSize: 'var(--fs-label)', color: ON_DARK_MUTE }}>
      You <b style={{ color: 'var(--card)' }}>{pos.total}</b> · {ordinal(pos.rank)} of {pos.size}{text ? ` · ${text}` : ''}
    </span>
  );
}

// ── Next deadline: shown in the hero slot when none of your matches is on ──
export function NextDeadlineCard({ nextDeadline, leagues, onOpen }) {
  const now = useNow(30000);
  if (!nextDeadline) return null;
  const ms = new Date(nextDeadline.at).getTime() - now;
  if (ms <= 0) return null;
  const when = new Date(nextDeadline.at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const first = leagues[0];
  return (
    <section style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderLeft: '4px solid var(--gold)', borderRadius: 'var(--radius)', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
        <div style={{ ...MONO, fontSize: 'var(--fs-micro)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--mute)' }}>Next deadline</div>
        <div style={{ ...HEAD, fontSize: 'var(--fs-heading)', color: 'var(--paper)', margin: '6px 0 4px' }}>
          Picks close in <span style={{ color: 'var(--gold-text)' }}>{formatCountdown(ms)}</span>
        </div>
        <div style={{ ...BODY, fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>
          {when}
          {first ? ` · ${first.leagueName} · ${first.circleName}` : ''}
          {leagues.length > 1 ? ` and ${plural(leagues.length - 1, 'more league')}` : ''}
        </div>
      </div>
      {first && (
        <button
          onClick={() => onOpen(first)}
          style={{ minHeight: 'var(--tap)', padding: '0 16px', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 'var(--radius)', ...BODY, fontSize: 'var(--fs-label)', fontWeight: 700, cursor: 'pointer' }}
        >Check your team</button>
      )}
    </section>
  );
}

// ── Where you stand: one row per league, labelled with its clubhouse ──
export function WhereYouStand({ positions, liveLeagueIds, onOpen }) {
  if (!positions.length) return null;
  const rows = positions.slice().sort((a, b) => (a.rank - b.rank) || a.leagueName.localeCompare(b.leagueName));
  return (
    <section style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', padding: '16px 16px 8px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <h2 style={{ margin: 0, ...BODY, fontSize: 'var(--fs-body)', fontWeight: 700, color: 'var(--paper)' }}>Where you stand</h2>
        <span style={{ marginLeft: 'auto', ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>{plural(positions.length, 'league')}</span>
      </div>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {rows.map((p, i) => {
          const lead = p.rank === 1 && p.size > 1;
          // The gap reads as a figure over a short label, so the league and
          // clubhouse names keep the width.
          let figure = '';
          let label = '';
          let gapUp = false;
          if (p.size <= 1) label = 'only you';
          else if (p.above) {
            const g = p.above.total - p.total;
            figure = g === 0 ? '=' : `−${g}`;
            label = g === 0 ? `with ${p.above.name}` : `to ${p.above.name}`;
          } else if (p.below) {
            const g = p.total - p.below.total;
            figure = g === 0 ? '=' : `+${g}`;
            label = g === 0 ? `with ${p.below.name}` : `on ${p.below.name}`;
            gapUp = g > 0;
          }
          return (
            <li key={p.key} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--rule)' }}>
              <button
                onClick={() => onOpen(p)}
                style={{ width: '100%', display: 'grid', gridTemplateColumns: '44px minmax(0, 1fr) auto', alignItems: 'center', gap: 10, minHeight: 'var(--tap)', padding: '10px 2px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
              >
                <span style={{ ...MONO, fontSize: 'var(--fs-heading)', fontWeight: 800, lineHeight: 1, color: lead ? 'var(--gold-text)' : 'var(--paper)' }}>
                  {p.rank}<small style={{ fontSize: 'var(--fs-micro)', fontWeight: 600, color: lead ? 'var(--gold-text)' : 'var(--mute)' }}>{ordinal(p.rank).slice(String(p.rank).length)}</small>
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', ...BODY, fontSize: 'var(--fs-label)', fontWeight: 700, color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span aria-hidden style={{ display: 'inline-block', width: 3, height: 11, borderRadius: 2, background: SPORT_COLOR[p.sport], marginRight: 7, verticalAlign: 'baseline' }} />
                    {p.leagueName}
                  </span>
                  <span style={{ display: 'block', ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.circleName} · {SPORT_LABEL[p.sport]}
                    {liveLeagueIds.has(p.leagueId) && <i style={{ fontStyle: 'normal', color: 'var(--danger)' }}> · live</i>}
                  </span>
                </span>
                <span style={{ ...MONO, textAlign: 'right', maxWidth: 92, minWidth: 0 }}>
                  {figure && (
                    <span style={{ display: 'block', fontSize: 'var(--fs-body)', fontWeight: 800, lineHeight: 1.1, color: gapUp ? 'var(--positive)' : 'var(--paper)' }}>{figure}</span>
                  )}
                  <span style={{ display: 'block', fontSize: 'var(--fs-micro)', color: 'var(--mute)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function ago(iso, now) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// MD-10: the latest Room lines from all your clubhouses, each naming its clubhouse,
// with the friends who have a clubhouse open right now on top.
// items: [{ id, username, content, kind, createdAt, circleId }]
// here:  [{ circleId, circleName, names: [string] }]
export function AcrossYourClubhouses({ items, here, circleNames, onOpen }) {
  const now = useNow(60000);
  if (!items.length && !here.length) return null;
  return (
    <section style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', padding: '16px 16px 8px' }}>
      <h2 style={{ margin: '0 0 8px', ...BODY, fontSize: 'var(--fs-body)', fontWeight: 700, color: 'var(--paper)' }}>Across your clubhouses</h2>

      {here.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 6 }}>
          {here.map(h => (
            <button
              key={h.circleId}
              onClick={() => onOpen(h.circleId)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 'var(--tap)', padding: '6px 2px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}
            >
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--positive)', boxShadow: '0 0 0 3px color-mix(in srgb, var(--positive) 22%, transparent)', flexShrink: 0 }} />
              <span style={{ minWidth: 0, ...BODY, fontSize: 'var(--fs-label)', color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <b style={{ color: 'var(--paper)' }}>{h.names.length > 2 ? `${h.names.slice(0, 2).join(', ')} +${h.names.length - 2}` : h.names.join(' and ')}</b>
                {' '}{h.names.length === 1 ? 'is' : 'are'} in {h.circleName} now
              </span>
            </button>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {items.map((m, i) => (
            <li key={m.id} style={{ borderTop: i === 0 && !here.length ? 'none' : '1px solid var(--rule)' }}>
              <button
                onClick={() => onOpen(m.circleId, m.id)}
                style={{ width: '100%', display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr)', gap: 10, alignItems: 'start', minHeight: 'var(--tap)', padding: '10px 2px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
              >
                <span aria-hidden style={{ width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'var(--elev)', color: 'var(--paper)', ...BODY, fontSize: 'var(--fs-micro)', fontWeight: 800 }}>
                  {(m.username?.[0] ?? '?').toUpperCase()}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'flex', gap: 6, ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', whiteSpace: 'nowrap' }}>
                    <b style={{ color: 'var(--paper)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1, minWidth: 0 }}>{m.username}</b>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>in {circleNames[m.circleId] ?? 'a clubhouse'}</span>
                    <span style={{ marginLeft: 'auto', flexShrink: 0 }}>{ago(m.createdAt, now)}</span>
                  </span>
                  <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginTop: 2, ...BODY, fontSize: 'var(--fs-label)', color: 'var(--text-2)', lineHeight: 1.35, overflowWrap: 'anywhere' }}>
                    {m.kind === 'bet_activity' && <b style={{ color: 'var(--paper)' }}>New bet: </b>}
                    {m.content}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
