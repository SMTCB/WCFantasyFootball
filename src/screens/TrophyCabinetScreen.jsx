import { useState, useEffect } from 'react';
import { useClubhouse } from '../hooks/useClubhouse';
import { useAuth } from '../hooks/useAuth';
import { useIsMobile } from '../hooks/useViewport';
import { supabase } from '../lib/supabase';

const MONO = { fontFamily: 'JetBrains Mono, monospace' };
const HEAD = { fontFamily: 'Archivo Black, sans-serif', letterSpacing: '-0.02em' };

const SPORT_CONFIG = {
  football: { label: 'Football', color: 'var(--accent)', bg: 'var(--abg)',   tag: 'fb'  },
  f1:       { label: 'F1',       color: 'var(--f1)',    bg: 'var(--f1bg)', tag: 'f1'  },
  tennis:   { label: 'Tennis',   color: 'var(--ten)',   bg: 'var(--tenbg)',tag: 'ten' },
};

function timeAgoShort(iso) {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 86400)  return 'Today';
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const d = new Date(iso);
  return `${months[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
}

const TIER_ICONS = { gold: '🏆', silver: '🥈', bronze: '🥉', participation: '⭐' };

// ── Trophy card ────────────────────────────────────────────────────────────────
function TrophyCard({ trophy }) {
  const icon = TIER_ICONS[trophy.tier] ?? '🏅';
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6, padding: '11px 13px', minWidth: 108 }}>
      <div style={{ fontSize: 18, marginBottom: 5 }}>{icon}</div>
      <div style={{ ...HEAD, fontSize: 11.5, lineHeight: 1.25 }}>{trophy.label ?? trophy.reason ?? 'Trophy'}</div>
      <div style={{ ...MONO, fontSize: 7.5, letterSpacing: '0.08em', color: 'var(--mute)', marginTop: 3 }}>
        {trophy.league_name ? `${trophy.league_name} · ` : ''}{timeAgoShort(trophy.awarded_at)}
      </div>
    </div>
  );
}

// ── Sport breakdown card ───────────────────────────────────────────────────────
function SportBreakdownCard({ sport, competitions }) {
  const cfg = SPORT_CONFIG[sport];
  if (!cfg) return null;
  const items = competitions[sport] ?? [];
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6, padding: '14px 15px' }}>
      <div style={{ ...MONO, fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--mute)', marginBottom: 7 }}>{cfg.label}</div>
      <div style={{ ...HEAD, fontSize: 27, letterSpacing: '-0.03em', lineHeight: 1, color: cfg.color }}>
        {items.length > 0 ? `${items.length} ✓` : '—'}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 5 }}>
        {items.length > 0 ? items.slice(0, 2).map(i => i.name).join(', ') : 'No competitions'}
      </div>
    </div>
  );
}

// ── Activity item ──────────────────────────────────────────────────────────────
function ActivityItem({ item }) {
  const sport = item.sport_type ?? 'football';
  const color = SPORT_CONFIG[sport]?.color ?? 'var(--accent)';
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--rule2)' }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 5 }} />
      <div style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.45, flex: 1 }}>
        {item.headline ?? item.text ?? item.title ?? '—'}
      </div>
      <div style={{ ...MONO, fontSize: 7.5, letterSpacing: '0.08em', color: 'var(--mute)', flexShrink: 0 }}>
        {timeAgoShort(item.created_at)}
      </div>
    </div>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────
export default function TrophyCabinetScreen() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { activeCircle, activeCircleId, competitions, feed, metaStandings } = useClubhouse();
  const [trophies, setTrophies] = useState([]);

  const username = user?.user_metadata?.username ?? user?.email?.split('@')[0] ?? 'Manager';
  const initial  = username[0]?.toUpperCase() ?? 'M';

  const myEntry    = metaStandings.find(r => r.user_id === user?.id);
  const myRank     = myEntry?.rank ?? null;
  const myTrophies = myEntry?.trophy_count ?? 0;
  const myGold     = myEntry?.gold_count ?? 0;
  const mySilver   = myEntry?.silver_count ?? 0;

  useEffect(() => {
    if (!user?.id || !activeCircleId) return;
    supabase
      .from('trophy_ledger')
      .select('id, tier, label, reason, league_name, sport_type, awarded_at')
      .eq('circle_id', activeCircleId)
      .eq('user_id', user.id)
      .order('awarded_at', { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (!error) setTrophies(data ?? []);
      }, () => {});
  }, [user?.id, activeCircleId]);

  const trophiesBySport = {
    football: trophies.filter(t => (t.sport_type ?? 'football') === 'football'),
    f1:       trophies.filter(t => t.sport_type === 'f1'),
    tennis:   trophies.filter(t => t.sport_type === 'tennis'),
  };

  const activeSports = [
    competitions.football.length > 0 && 'football',
    competitions.f1.length > 0       && 'f1',
    competitions.tennis.length > 0   && 'tennis',
  ].filter(Boolean);

  // Shareable card — rendered inline on mobile, in sidebar on desktop
  const shareableCard = (
    <div style={{ background: 'var(--elev)', border: '1px solid var(--rule)', borderRadius: 6 }}>
      <div style={{ padding: '16px', textAlign: 'center' }}>
        <div style={{ ...MONO, fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--mute)', marginBottom: 8 }}>
          Shareable card
        </div>
        <div style={{ ...HEAD, fontSize: 15, letterSpacing: '-0.01em', marginBottom: 4 }}>{username}</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
          {myTrophies} trophies · {activeSports.length} sport{activeSports.length !== 1 ? 's' : ''}
          {activeCircle ? ` · ${activeCircle.name}` : ''}
        </div>
        <button
          style={{
            width: '100%', ...MONO, fontSize: 8.5, letterSpacing: '0.12em', textTransform: 'uppercase',
            padding: '8px 0', borderRadius: 6, border: '1.5px solid var(--rule)', background: 'transparent',
            color: 'var(--text2)', cursor: 'pointer', minHeight: 44,
          }}
        >
          Export image →
        </button>
      </div>
    </div>
  );

  // Mobile: page scrolls in document flow; Desktop: fixed-height flex column
  const rootStyle = isMobile
    ? { display: 'flex', flexDirection: 'column', background: 'var(--bg)', minHeight: '100%' }
    : { height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' };

  return (
    <div style={rootStyle}>

      {/* ── Dark header ── */}
      <div style={{
        background: 'var(--shell)',
        padding: isMobile ? '20px 16px 18px' : '24px 26px 22px',
        display: 'flex', gap: 16, alignItems: 'flex-start', flexShrink: 0,
        flexWrap: isMobile ? 'wrap' : 'nowrap',
      }}>
        {/* Avatar */}
        <div style={{ width: 52, height: 52, borderRadius: 10, background: 'var(--accent)', display: 'grid', placeItems: 'center', ...HEAD, fontSize: 21, color: '#fff', flexShrink: 0 }}>
          {initial}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...HEAD, fontSize: 21, color: '#fff', lineHeight: 1 }}>{username}</div>

          {/* Per-sport badges */}
          <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
            {activeSports.map(sport => (
              <div key={sport} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'rgba(255,255,255,.55)' }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: SPORT_CONFIG[sport].color, flexShrink: 0 }} />
                {SPORT_CONFIG[sport].label}
              </div>
            ))}
          </div>

          {/* Stats row — wraps on mobile */}
          <div style={{
            display: 'flex', gap: isMobile ? 18 : 26, marginTop: 16, paddingTop: 14,
            borderTop: '1px solid rgba(255,255,255,.09)', flexWrap: 'wrap',
          }}>
            {[
              { value: myTrophies,            label: 'Trophies', color: '#fff' },
              { value: activeSports.length || '—', label: 'Sports',   color: '#fff' },
              { value: myGold,                label: 'Gold',     color: 'var(--gold)' },
              { value: mySilver,              label: 'Silver',   color: 'rgba(255,255,255,.65)' },
            ].map(({ value, label, color }) => (
              <div key={label}>
                <div style={{ ...HEAD, fontSize: 22, color, letterSpacing: '-0.02em' }}>{value}</div>
                <div style={{ ...MONO, fontSize: 7.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,.3)', marginTop: 1 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Overall rank — beside avatar row on desktop; full-width row on mobile */}
        {myRank != null && (
          <div style={{
            textAlign: isMobile ? 'left' : 'center',
            flexShrink: 0,
            ...(isMobile ? { width: '100%', paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.09)', display: 'flex', alignItems: 'center', gap: 12 } : {}),
          }}>
            <div style={{ ...HEAD, fontSize: isMobile ? 28 : 38, color: 'var(--gold)', letterSpacing: '-0.03em', lineHeight: 1 }}>
              #{myRank}
            </div>
            <div>
              <div style={{ ...MONO, fontSize: 7.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,.35)' }}>
                Group overall
              </div>
              {activeCircle && (
                <div style={{ ...MONO, fontSize: 8, letterSpacing: '0.08em', color: 'rgba(255,255,255,.3)', marginTop: 2 }}>
                  {activeCircle.name}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div style={{
        flex: 1,
        overflowY: isMobile ? 'visible' : 'auto',
        padding: isMobile ? '16px 16px 24px' : '20px 26px',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        gap: 20,
      }}>

        {/* Main column */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Sport breakdown — auto-fill collapses to 1-col at 375px */}
          <div>
            <div style={{ ...MONO, fontSize: 8.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--mute)', marginBottom: 9 }}>
              Season standing by sport
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
              <SportBreakdownCard sport="football" competitions={competitions} />
              <SportBreakdownCard sport="f1"       competitions={competitions} />
              <SportBreakdownCard sport="tennis"   competitions={competitions} />
            </div>
          </div>

          {/* Trophy shelf */}
          {trophies.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {['football', 'f1', 'tennis'].map(sport => {
                const list = trophiesBySport[sport];
                if (list.length === 0) return null;
                const cfg = SPORT_CONFIG[sport];
                return (
                  <div key={sport}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
                      <span style={{ ...MONO, fontSize: 7, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 100, fontWeight: 600, background: cfg.bg, color: cfg.color }}>
                        {cfg.label}
                      </span>
                      <div style={{ ...HEAD, fontSize: 13.5 }}>{cfg.label} trophies</div>
                    </div>
                    <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
                      {list.map(t => <TrophyCard key={t.id} trophy={t} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6, padding: '40px 32px', textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>🏅</div>
              <div style={{ ...HEAD, fontSize: 18, marginBottom: 8 }}>No trophies yet</div>
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                Win a gameweek, top a leaderboard, or be awarded a trophy by a commissioner to see them here.
              </div>
            </div>
          )}

          {/* Mobile: export card inline below trophies */}
          {isMobile && shareableCard}
        </div>

        {/* Desktop: right sidebar */}
        {!isMobile && (
          <div style={{ width: 256, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Activity history */}
            {feed.length > 0 && (
              <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6 }}>
                <div style={{ padding: '12px 15px', borderBottom: '1px solid var(--rule)' }}>
                  <div style={{ ...HEAD, fontSize: 13 }}>Activity history</div>
                </div>
                <div style={{ padding: '10px 14px' }}>
                  {feed.slice(0, 8).map((item, i) => (
                    <ActivityItem key={item.id ?? i} item={item} />
                  ))}
                </div>
              </div>
            )}

            {shareableCard}
          </div>
        )}
      </div>
    </div>
  );
}
