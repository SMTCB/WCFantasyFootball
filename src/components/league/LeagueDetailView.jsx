import { useState, useEffect, useRef } from 'react';
import { HubSectionLabel, MobSection } from './HubShared';
import { MONO, DISPLAY, mgrHue } from './HubConstants';
import { supabase } from '../../lib/supabase';
import CompetitionRankBadge from '../CompetitionRankBadge';

// Maps gazette entry_type (DB enum) to a filter category and display label.
// Current enum values: draft_report, breaking_news, activity, auction_result, trade_result, p2p_challenge, p2p_result, wishlist_draft_report
const ENTRY_META = {
  draft_report:     { filter: 'GAME',   badge: 'DRAFT',      color: 'var(--gold-text)' },
  breaking_news:    { filter: 'GAME',   badge: 'NEWS',       color: 'var(--danger)' },
  activity:         { filter: 'GAME',   badge: 'SCORES',     color: 'var(--positive)' },
  auction_result:   { filter: 'TRADES', badge: 'AUCTION',    color: 'var(--positive)' },
  trade_result:     { filter: 'TRADES', badge: 'TRADE',      color: 'var(--accent)' },
  rank_change:      { filter: 'GAME',   badge: 'RANKS',      color: 'var(--accent)' },
  relaxation:       { filter: 'GAME',   badge: 'POOL',       color: 'var(--accent)' },
  cup_elimination:  { filter: 'GAME',   badge: 'CUP',        color: 'var(--danger)' },
  transfer:         { filter: 'TRADES', badge: 'TRANSFER',   color: 'var(--positive)' },
  classified:       { filter: 'GAME',   badge: 'CLASSIFIED', color: 'var(--gold-text)' },
  p2p_challenge:    { filter: 'TRADES', badge: 'CHALLENGE',  color: 'var(--gold-text)' },
  p2p_result:       { filter: 'TRADES', badge: 'P2P',        color: 'var(--gold-text)' },
  wishlist_draft_report: { filter: 'GAME', badge: 'WISHLIST', color: 'var(--gold-text)' },
};

// Normalise a single gazette bullet to a display string.
// bullets can be: string | {text} | {player_id, wanted_by, winner_id} | other object
function bulletText(b) {
  if (typeof b === 'string') return b;
  if (b && typeof b === 'object') {
    if (b.text) return b.text;
    // draft_report contest objects — not meaningful without player name lookups; skip
    return null;
  }
  return null;
}

// Handle bullets stored as raw JSON string (older rows) or already-parsed array
function parseBullets(raw) {
  if (!raw) return [];
  let arr = raw;
  if (typeof arr === 'string') {
    try { arr = JSON.parse(arr); } catch { return []; }
  }
  return Array.isArray(arr) ? arr : [];
}

// Limit breaking_news to the 3 most recent for display (entries already sorted DESC).
// Older posts are kept in the DB but not shown.
function capBreakingNews(entries, max = 3) {
  let count = 0;
  return entries.filter(e => {
    if (e.entry_type !== 'breaking_news') return true;
    count++;
    return count <= max;
  });
}

function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function Avatar({ name, size = 34 }) {
  const hue = mgrHue(name);
  const w = name.trim().split(/\s+/);
  const ini = (w.length > 1 ? w[0][0] + w[1][0] : name.slice(0, 2)).toUpperCase();
  return (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: '50%', background: `${hue}26`, color: hue, display: 'inline-grid', placeItems: 'center', fontWeight: 700, fontSize: size >= 44 ? 'var(--fs-body)' : 'var(--fs-label)', flexShrink: 0 }}>{ini}</span>
  );
}

export default function LeagueDetailView({ leagueId, members, currentUser, membersLoading, currentGW = '—', onViewManager, h2hEnabled = false }) {
  const [activityFilter, setActivityFilter] = useState('ALL');
  const [activityCollapsed, setActivityCollapsed] = useState(false);
  const [entries, setEntries] = useState([]);
  const [h2hStandings, setH2hStandings] = useState([]); // { user_id, total_h2h_pts, h2h_rank }
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const channelRef = useRef(null);

  const toggleExpanded = (id) => setExpandedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // Fetch H2H standings when league is H2H-enabled
  useEffect(() => {
    if (!leagueId || !h2hEnabled) return;
    supabase.rpc('get_h2h_standings', { p_league_id: leagueId })
      .then(({ data }) => setH2hStandings(data ?? []));
  }, [leagueId, h2hEnabled]);

  // Build user_id → h2h_pts lookup
  const h2hMap = Object.fromEntries(h2hStandings.map(r => [r.user_id, r.total_h2h_pts ?? 0]));

  useEffect(() => {
    if (!leagueId) return;

    supabase
      .from('gazette_entries')
      .select('id, entry_type, headline, bullets, published_at')
      .eq('league_id', leagueId)
      .order('published_at', { ascending: false })
      .limit(30)
      .then(({ data }) => setEntries(data ?? []));

    // Realtime: prepend new entries as they arrive (draft lottery, cup events, etc.)
    channelRef.current = supabase
      .channel(`gazette:${leagueId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'gazette_entries',
        filter: `league_id=eq.${leagueId}`,
      }, (payload) => {
        setEntries(prev => [payload.new, ...prev]);
      })
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [leagueId]);
  const nameOf = (m) => m.users?.username || 'Unknown';
  const open = (m) => onViewManager({ user_id: m.user_id, name: nameOf(m) });
  const cols = h2hEnabled ? '32px 38px minmax(0,1fr) 56px 64px' : '32px 38px minmax(0,1fr) 64px';
  const podium = members.length >= 3 ? [members[1], members[0], members[2]] : [];
  const standings = (
    <div style={{ padding: '16px max(16px, 3vw) 8px' }}>
      {podium.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, alignItems: 'end', marginBottom: 16 }}>
          {podium.map((m, i) => {
            const first = i === 1;
            const place = first ? 1 : i === 0 ? 2 : 3;
            return (
              <button key={m.user_id} onClick={() => open(m)} aria-label={`${nameOf(m)}, place ${place}, ${Math.round(m.total_points ?? 0)} points`}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0, font: 'inherit', color: 'inherit' }}>
                <Avatar name={nameOf(m)} size={first ? 52 : 44} />
                <span style={{ fontFamily: DISPLAY, fontSize: 'var(--fs-label)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameOf(m)}</span>
                <span className="num" style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>{Math.round(m.total_points ?? 0)} pts</span>
                <span className="num" style={{ width: '100%', height: first ? 64 : place === 2 ? 48 : 38, borderRadius: '10px 10px 0 0', background: first ? 'var(--gold-soft)' : 'var(--elev)', color: first ? 'var(--gold-text)' : 'var(--mute)', display: 'grid', placeItems: 'center', fontFamily: DISPLAY, fontSize: 'var(--fs-title)' }}>{place}</span>
              </button>
            );
          })}
        </div>
      )}
      <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <div role="row" style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, alignItems: 'center', padding: '8px 14px', borderBottom: '1px solid var(--rule)', fontSize: 'var(--fs-micro)', fontWeight: 600, color: 'var(--mute)' }}>
          <span className="num" style={{ textAlign: 'center' }}>#</span>
          <span />
          <span>Manager</span>
          {h2hEnabled && <span style={{ textAlign: 'right' }}>H2H</span>}
          <span style={{ textAlign: 'right' }}>Pts</span>
        </div>
        {membersLoading && members.length === 0 ? (
          <div style={{ padding: '28px 18px', textAlign: 'center', fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>Syncing standings…</div>
        ) : members.map((m, i) => {
          const isMe = currentUser && m.user_id === currentUser.id;
          return (
            <div key={m.user_id} role="button" tabIndex={0} onClick={() => open(m)}
              onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(m); } }}
              style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, alignItems: 'center', minHeight: 56, padding: '6px 14px', cursor: 'pointer', borderBottom: i < members.length - 1 ? '1px solid var(--rule)' : 'none', background: isMe ? 'var(--accent-soft)' : 'transparent' }}>
              <span className="num" style={{ textAlign: 'center', fontFamily: DISPLAY, fontSize: 'var(--fs-body)', color: m.rank === 1 ? 'var(--gold-text)' : 'var(--paper)' }}>{m.rank || '—'}</span>
              <Avatar name={nameOf(m)} />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontFamily: DISPLAY, fontSize: 'var(--fs-body)', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameOf(m)}</span>
                {(isMe || m.rank === 1) && <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>{isMe ? 'You' : 'Leader'}{isMe && m.rank === 1 ? ' · Leader' : ''}</span>}
              </span>
              {h2hEnabled && <span className="num" style={{ textAlign: 'right', color: 'var(--gold-text)', fontWeight: 600 }}>{h2hMap[m.user_id] ?? '—'}</span>}
              <span className="num" style={{ textAlign: 'right', fontFamily: DISPLAY, fontSize: 'var(--fs-body)' }}>{Math.round(m.total_points ?? 0)}</span>
            </div>
          );
        })}
      </div>
      <div className="num" style={{ marginTop: 8, fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>Gameweek {currentGW} · tap a manager to see their squad</div>
    </div>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>

      {/* ── DESKTOP: standings + activity rail ─────────────────────────── */}
      <div className="hidden lg:grid" style={{ flex: 1, gridTemplateColumns: activityCollapsed ? '1fr 40px' : '1fr 400px', minHeight: 0, transition: 'grid-template-columns 0.15s ease' }}>
        <div data-tour="league-standings" style={{ display: 'flex', flexDirection: 'column', overflow: 'auto', borderRight: '1px solid var(--rule)' }}>
          {standings}
        </div>

        {/* Activity rail */}
        <aside style={{ display: 'flex', flexDirection: 'column', background: 'var(--card)', overflow: 'hidden' }}>
          {activityCollapsed ? (
            <button
              onClick={() => setActivityCollapsed(false)}
              aria-label="Expand league activity"
              style={{
                flex: 1, background: 'transparent', border: 'none', borderLeft: '1px solid var(--rule)',
                cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'flex-start', gap: 10, paddingTop: 16, color: 'var(--mute)',
              }}
            >
              <span style={{ fontSize: 'var(--fs-body)' }}>‹</span>
              <span style={{
                fontFamily: MONO, fontSize: 'var(--fs-micro)', letterSpacing: '.22em', color: 'var(--gold-text)',
                writingMode: 'vertical-rl', transform: 'rotate(180deg)',
              }}>ACTIVITY</span>
            </button>
          ) : (
          <>
          <HubSectionLabel
            label="League activity"
            tone="var(--gold)"
            right={
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>RECENT</span>
                <button className="hit-44"
                  onClick={() => setActivityCollapsed(true)}
                  aria-label="Collapse league activity"
                  style={{ background: 'transparent', border: '1px solid var(--rule)', color: 'var(--mute)', cursor: 'pointer', padding: '2px 6px', fontSize: 'var(--fs-micro)', lineHeight: 1 }}
                >›</button>
              </div>
            }
          />
          {/* Feed */}
          {(() => {
            const capped   = capBreakingNews(entries);
            const filtered = activityFilter === 'ALL'
              ? capped
              : capped.filter(e => (ENTRY_META[e.entry_type]?.filter ?? 'GAME') === activityFilter);
            if (filtered.length === 0) return (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 18px', gap: 8 }}>
                <div style={{ fontSize: 'var(--fs-title)' }}>⚽</div>
                <div style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', letterSpacing: '.2em', textAlign: 'center' }}>NO ACTIVITY YET</div>
                <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 'var(--fs-micro)', color: 'var(--mute)', opacity: 0.6, textAlign: 'center', lineHeight: 1.5 }}>
                  Draft results, rank changes, match scores, and league news will appear here as the season unfolds.
                </div>
              </div>
            );
            return (
              <div style={{ flex: 1, overflow: 'auto' }}>
                {filtered.map((e) => {
                  const meta = ENTRY_META[e.entry_type] ?? { badge: e.entry_type.toUpperCase(), color: 'var(--mute)' };
                  return (
                    <div key={e.id} style={{ padding: '12px 18px', borderBottom: '1px solid var(--rule)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <span style={{
                          fontSize: 'var(--fs-micro)', fontWeight: 700, padding: '1px 8px', borderRadius: 999, border: `1px solid ${meta.color}`, color: meta.color, flexShrink: 0
                        }}>{meta.badge.toLowerCase()}</span>
                        <span style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>
                          {timeAgo(e.published_at)}
                        </span>
                      </div>
                      {(() => {
                        const bullets = parseBullets(e.bullets);
                        const isExpanded = expandedIds.has(e.id);
                        return (
                          <>
                            {bullets.length > 0 ? (
                              <button
                                onClick={() => toggleExpanded(e.id)}
                                style={{
                                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                                  width: '100%', padding: 0, background: 'transparent', border: 'none', cursor: 'pointer',
                                  textAlign: 'left', marginBottom: isExpanded ? 6 : 0,
                                }}
                              >
                                <span style={{ fontFamily: "'Archivo', sans-serif", fontSize: 'var(--fs-label)', fontWeight: 600, color: 'var(--paper)', lineHeight: 1.35 }}>
                                  {e.headline}
                                </span>
                                <span style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', flexShrink: 0 }}>
                                  {isExpanded ? '−' : '+'}
                                </span>
                              </button>
                            ) : (
                              <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 'var(--fs-label)', fontWeight: 600, color: 'var(--paper)', lineHeight: 1.35 }}>
                                {e.headline}
                              </div>
                            )}
                            {isExpanded && bullets.length > 0 && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                {bullets.map((b, i) => {
                                  const text = bulletText(b);
                                  if (!text) return null;
                                  return (
                                    <div key={i} style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', letterSpacing: '.1em', lineHeight: 1.4 }}>
                                      {text}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            );
          })()}
          {/* Filter bar */}
          <div style={{ padding: '12px 18px', borderTop: '1px solid var(--rule)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <span style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', letterSpacing: '.18em' }}>FILTER</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {['ALL', 'GAME', 'TRADES'].map((f) => {
                const active = activityFilter === f;
                return (
                  <button className="hit-44"
                    key={f}
                    onClick={() => setActivityFilter(f)}
                    style={{
                      fontFamily: MONO, fontSize: 'var(--fs-micro)', letterSpacing: '.18em',
                      padding: '3px 6px',
                      border: `1px solid ${active ? 'var(--accent)' : 'var(--rule)'}`,
                      color: active ? 'var(--accent)' : 'var(--mute)',
                      background: active ? 'rgba(0,180,216,.08)' : 'transparent',
                      cursor: 'pointer',
                    }}
                  >{f}</button>
                );
              })}
            </div>
          </div>
          </>
          )}
        </aside>
      </div>

      {/* ── MOBILE: single-col standings list ─────────────────────────── */}
      <div className="lg:hidden" style={{ flex: 1, overflow: 'auto' }}>
        <div data-tour="league-standings">{standings}</div>

        {/* ── Mobile activity feed ───────────────────────────────────── */}
        <MobSection
          label="League activity"
          tone="var(--gold)"
          right={<span style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', letterSpacing: '.14em' }}>RECENT</span>}
        />
        {(() => {
          if (entries.length === 0) return (
            <div style={{ padding: '24px 18px', textAlign: 'center' }}>
              <div style={{ fontSize: 'var(--fs-heading)', marginBottom: 8 }}>⚽</div>
              <div style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', letterSpacing: '.18em', marginBottom: 6 }}>NO ACTIVITY YET</div>
              <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 'var(--fs-micro)', color: 'var(--mute)', opacity: 0.6, lineHeight: 1.5, maxWidth: 280, margin: '0 auto' }}>
                Draft results, rank changes, and league news will appear here as the season unfolds.
              </div>
            </div>
          );
          return capBreakingNews(entries).slice(0, 8).map((e) => {
            const meta = ENTRY_META[e.entry_type] ?? { badge: e.entry_type.toUpperCase(), color: 'var(--mute)' };
            const bullets = parseBullets(e.bullets);
            const isExpanded = expandedIds.has(e.id);
            return (
              <div key={e.id} style={{ padding: '11px 18px', borderBottom: '1px solid var(--rule)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span style={{ fontSize: 'var(--fs-micro)', fontWeight: 700, padding: '1px 8px', borderRadius: 999, border: `1px solid ${meta.color}`, color: meta.color, flexShrink: 0 }}>
                    {meta.badge.toLowerCase()}
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>{timeAgo(e.published_at)}</span>
                </div>
                {bullets.length > 0 ? (
                  <button
                    onClick={() => toggleExpanded(e.id)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                      width: '100%', padding: 0, background: 'transparent', border: 'none', cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ fontFamily: "'Archivo', sans-serif", fontSize: 'var(--fs-label)', fontWeight: 600, color: 'var(--paper)', lineHeight: 1.35 }}>
                      {e.headline}
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', flexShrink: 0 }}>
                      {isExpanded ? '−' : '+'}
                    </span>
                  </button>
                ) : (
                  <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 'var(--fs-label)', fontWeight: 600, color: 'var(--paper)', lineHeight: 1.35 }}>
                    {e.headline}
                  </div>
                )}
                {isExpanded && bullets.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
                    {bullets.map((b, i) => {
                      const text = bulletText(b);
                      if (!text) return null;
                      return (
                        <div key={i} style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', letterSpacing: '.1em', lineHeight: 1.4 }}>
                          {text}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          });
        })()}

        <div style={{ height: 32 }} />
      </div>
    </div>
  );
}
