import { useNavigate } from 'react-router-dom';
import { useClubhouse } from '../hooks/useClubhouse';
import { useAuth } from '../hooks/useAuth';

const MONO = { fontFamily: 'JetBrains Mono, monospace' };
const HEAD = { fontFamily: 'Archivo Black, sans-serif', letterSpacing: '-0.02em' };

function timeAgo(iso) {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60)    return `${Math.floor(s)}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

const SPORT_CONFIG = {
  football: { label: 'Football', color: 'var(--accent)', colorBg: 'var(--abg)', emoji: '⚽', ctaText: 'Squad →', ctaPath: '/squad' },
  f1:       { label: 'Formula 1', color: 'var(--f1)',   colorBg: 'var(--f1bg)', emoji: '🏎', ctaText: 'Picks →', ctaPath: '/f1' },
  tennis:   { label: 'Tennis',   color: 'var(--ten)',   colorBg: 'var(--tenbg)', emoji: '🎾', ctaText: 'Track →', ctaPath: '/tennis' },
};

const FEED_SPORT_COLORS = {
  football: 'var(--accent)',
  f1:       'var(--f1)',
  tennis:   'var(--ten)',
};

// ── Sport module card ──────────────────────────────────────────────────────────
function SportModuleCard({ sport, items }) {
  const navigate = useNavigate();
  const cfg = SPORT_CONFIG[sport];
  if (!cfg || items.length === 0) return null;

  const first = items[0];

  return (
    <div
      onClick={() => navigate(cfg.ctaPath)}
      style={{
        background: 'var(--card)', border: '1px solid var(--rule)',
        borderRadius: 6, overflow: 'hidden', cursor: 'pointer',
        transition: 'box-shadow .15s',
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px -8px rgba(24,32,46,.18)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
    >
      {/* Sport color bar */}
      <div style={{ height: 3, background: cfg.color }} />
      <div style={{ padding: '14px 16px 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 11 }}>
          <div>
            <div style={{ ...HEAD, fontSize: 15 }}>{cfg.label}</div>
            <div style={{ ...MONO, fontSize: 7.5, letterSpacing: '0.1em', color: 'var(--mute)', textTransform: 'uppercase', marginTop: 2 }}>
              {first.name}{items.length > 1 ? ` +${items.length - 1}` : ''}
            </div>
          </div>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            ...MONO, fontSize: 7.5, letterSpacing: '0.1em', textTransform: 'uppercase',
            padding: '3px 8px', borderRadius: 100, background: cfg.colorBg, color: cfg.color,
          }}>
            Active
          </span>
        </div>
        {/* Rank */}
        <div style={{ ...MONO, fontSize: 7.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--mute)' }}>
          Competitions
        </div>
        <div style={{ ...HEAD, fontSize: 30, color: cfg.color, lineHeight: 1, letterSpacing: '-0.03em' }}>
          {items.length}
        </div>
        {/* CTA */}
        <div style={{ marginTop: 13, borderTop: '1px solid var(--rule2)', paddingTop: 11, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.35 }}>
            {items.slice(0, 2).map(i => i.name).join(', ')}
          </div>
          <button
            onClick={e => { e.stopPropagation(); navigate(cfg.ctaPath); }}
            style={{
              ...MONO, fontSize: 8.5, letterSpacing: '0.12em', textTransform: 'uppercase',
              padding: '5px 10px', borderRadius: 6, border: 'none',
              background: cfg.color, color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {cfg.ctaText}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Gazette item ───────────────────────────────────────────────────────────────
function GazetteItem({ item }) {
  const sport = item.sport_type ?? 'football';
  const color = FEED_SPORT_COLORS[sport] ?? 'var(--accent)';
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '11px 0', borderBottom: '1px solid var(--rule2)' }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 5 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', lineHeight: 1.35 }}>
          {item.headline ?? item.text ?? item.title ?? '—'}
        </div>
        <div style={{ ...MONO, fontSize: 8, letterSpacing: '0.08em', color: 'var(--mute)', marginTop: 3 }}>
          {item.league_name ?? ''}{item.league_name && item.created_at ? ' · ' : ''}{timeAgo(item.created_at)}
        </div>
      </div>
      {item.pts != null && (
        <div style={{ ...HEAD, fontSize: 15, color, flexShrink: 0 }}>
          {item.pts > 0 ? `+${item.pts}` : item.pts}
        </div>
      )}
    </div>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────
export default function MultiSportHomeScreen() {
  const { user } = useAuth();
  const {
    activeCircle, competitions, feed, metaStandings, loading,
  } = useClubhouse();

  const username = user?.user_metadata?.username ?? user?.email?.split('@')[0] ?? 'Manager';

  const activeSportCount = [
    competitions.football.length > 0,
    competitions.f1.length > 0,
    competitions.tennis.length > 0,
  ].filter(Boolean).length;

  const myEntry = metaStandings.find(r => r.user_id === user?.id);
  const myRank  = myEntry?.rank ?? null;
  const myTrophies = myEntry?.trophy_count ?? 0;

  if (loading && !activeCircle) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mute)', ...MONO, fontSize: 11 }}>
        Loading…
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* ── Screen header ── */}
      <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--rule)', padding: '14px 26px 14px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ ...MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--mute)', marginBottom: 4 }}>
              Multi-Sport Hub{activeCircle ? ` · ${activeCircle.name}` : ''}
            </div>
            <div style={{ ...HEAD, fontSize: 23, color: 'var(--text)', lineHeight: 1 }}>
              {greeting()}, {username.split(' ')[0]}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start', paddingTop: 2 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ ...MONO, fontSize: 7.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--mute)', marginBottom: 3 }}>Active sports</div>
              <div style={{ ...HEAD, fontSize: 18, color: 'var(--accent)', letterSpacing: '-0.02em' }}>{activeSportCount}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ ...MONO, fontSize: 7.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--mute)', marginBottom: 3 }}>Trophies won</div>
              <div style={{ ...HEAD, fontSize: 18, color: 'var(--gold)', letterSpacing: '-0.02em' }}>{myTrophies}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ ...MONO, fontSize: 7.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--mute)', marginBottom: 3 }}>Group rank</div>
              <div style={{ ...HEAD, fontSize: 18, letterSpacing: '-0.02em' }}>{myRank != null ? `#${myRank}` : '—'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 26px', display: 'flex', gap: 20 }}>

        {/* Main column */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Sport module cards */}
          {(activeSportCount > 0) && (
            <div>
              <div style={{ ...MONO, fontSize: 8.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--mute)', marginBottom: 9 }}>
                Your active sports
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                <SportModuleCard sport="football" items={competitions.football} />
                <SportModuleCard sport="f1"       items={competitions.f1} />
                <SportModuleCard sport="tennis"   items={competitions.tennis} />
              </div>
              {activeSportCount === 0 && (
                <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6, padding: '32px 24px', textAlign: 'center' }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>🏟️</div>
                  <div style={{ ...HEAD, fontSize: 16, marginBottom: 6 }}>No competitions linked yet</div>
                  <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                    Visit your group and link a football league, F1 paddock, or tennis player box.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* No group joined */}
          {!activeCircle && !loading && (
            <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6, padding: '40px 32px', textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>🏠</div>
              <div style={{ ...HEAD, fontSize: 20, marginBottom: 8 }}>Welcome to Multi-Sport</div>
              <div style={{ fontSize: 13, color: 'var(--text2)', maxWidth: 320, margin: '0 auto 20px' }}>
                Join or create a group to see your cross-sport dashboard, meta-standings, and activity gazette.
              </div>
              <a
                href="#/clubhouse"
                style={{ ...MONO, fontSize: 8.5, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '10px 20px', borderRadius: 6, background: 'var(--accent)', color: '#fff', textDecoration: 'none', display: 'inline-block' }}
              >
                Go to Clubhouse →
              </a>
            </div>
          )}

          {/* Activity gazette */}
          {feed.length > 0 && (
            <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6 }}>
              <div style={{ padding: '12px 15px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ ...HEAD, fontSize: 13 }}>Activity Gazette</div>
                <span style={{ ...MONO, fontSize: 7, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 100, background: 'var(--elev)', color: 'var(--mute)' }}>
                  Today
                </span>
              </div>
              <div style={{ padding: '0 15px' }}>
                {feed.slice(0, 8).map((item, i) => (
                  <GazetteItem key={item.id ?? i} item={item} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div style={{ width: 256, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Trophy teaser */}
          {activeCircle && (
            <div style={{ background: 'var(--shell)', borderRadius: 6, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, color: '#fff' }}>
              <div style={{ flexShrink: 0 }}>
                <div style={{ ...HEAD, fontSize: 36, color: 'var(--gold)', lineHeight: 1 }}>{myTrophies}</div>
                <div style={{ ...MONO, fontSize: 7.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,.38)', marginTop: 2 }}>Trophies</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ ...HEAD, fontSize: 15, lineHeight: 1.2 }}>
                  {myRank != null ? `#${myRank} overall` : 'Your group'} in {activeCircle.name}
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,.55)', marginTop: 4 }}>
                  {activeSportCount} active sport{activeSportCount !== 1 ? 's' : ''}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  {competitions.football.length > 0 && <div style={{ width: 26, height: 26, borderRadius: 5, background: 'rgba(26,111,168,.25)', display: 'grid', placeItems: 'center', fontSize: 13 }}>⚽</div>}
                  {competitions.f1.length > 0       && <div style={{ width: 26, height: 26, borderRadius: 5, background: 'rgba(193,57,27,.25)', display: 'grid', placeItems: 'center', fontSize: 13 }}>🏎</div>}
                  {competitions.tennis.length > 0   && <div style={{ width: 26, height: 26, borderRadius: 5, background: 'rgba(26,138,107,.25)', display: 'grid', placeItems: 'center', fontSize: 13 }}>🎾</div>}
                </div>
              </div>
            </div>
          )}

          {/* Group meta-rank table */}
          {metaStandings.length > 0 && (
            <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6 }}>
              <div style={{ padding: '12px 15px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ ...HEAD, fontSize: 13 }}>Group Meta-Rank</div>
                <span style={{ ...MONO, fontSize: 7.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--mute)' }}>
                  {activeCircle?.name ?? ''}
                </span>
              </div>
              <div style={{ padding: '10px 12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '22px 1fr 50px', padding: '0 6px 7px', borderBottom: '2px solid var(--rule)', marginBottom: 4 }}>
                  {['#', 'Manager', 'Trophy'].map(h => (
                    <span key={h} style={{ ...MONO, fontSize: 7.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--mute)', textAlign: h === 'Trophy' ? 'right' : 'left' }}>{h}</span>
                  ))}
                </div>
                {metaStandings.slice(0, 6).map(row => {
                  const isMe = row.user_id === user?.id;
                  return (
                    <div
                      key={row.user_id}
                      style={{
                        display: 'grid', gridTemplateColumns: '22px 1fr 50px',
                        padding: '10px 6px', borderBottom: '1px solid var(--rule2)',
                        background: isMe ? 'var(--abg)' : 'transparent',
                        borderRadius: isMe ? 4 : 0,
                        marginBottom: isMe ? 2 : 0,
                      }}
                    >
                      <div style={{ ...HEAD, fontSize: 12, color: row.rank === 1 ? 'var(--accent)' : 'var(--mute)' }}>{row.rank}</div>
                      <div style={{ ...HEAD, fontSize: 13, letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: 7 }}>
                        {row.username}
                        {isMe && <span style={{ ...MONO, fontSize: 6, letterSpacing: '0.1em', textTransform: 'uppercase', border: '1px solid var(--accent)', color: 'var(--accent)', borderRadius: 2, padding: '1px 3px' }}>You</span>}
                      </div>
                      <div style={{ ...HEAD, fontSize: 14, textAlign: 'right', letterSpacing: '-0.01em', color: 'var(--accent)' }}>{row.trophy_count}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty sidebar state */}
          {!activeCircle && !loading && (
            <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6, padding: '20px 16px', textAlign: 'center' }}>
              <div style={{ ...MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--mute)', marginBottom: 8 }}>No group yet</div>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>Join a Clubhouse to see meta-standings and trophies here.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
