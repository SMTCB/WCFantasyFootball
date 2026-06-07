import { useState, useEffect, useRef } from 'react';
import { MgrTag, HubSectionLabel, MobFormDots, MobSection } from './HubShared';
import { MONO, DISPLAY, miniBtnStyle, mgrHue, mgrMono } from './HubConstants';
import { supabase } from '../../lib/supabase';

// Maps gazette entry_type (DB enum) to a filter category and display label.
// Current enum values: draft_report, breaking_news, activity, auction_result, trade_result
const ENTRY_META = {
  draft_report:     { filter: 'GAME',   badge: 'DRAFT',    color: 'var(--gold)' },
  breaking_news:    { filter: 'GAME',   badge: 'NEWS',     color: 'var(--danger)' },
  activity:         { filter: 'GAME',   badge: 'SCORES',   color: 'var(--positive)' },
  auction_result:   { filter: 'TRADES', badge: 'AUCTION',  color: 'var(--positive)' },
  trade_result:     { filter: 'TRADES', badge: 'TRADE',    color: 'var(--cyan)' },
  rank_change:      { filter: 'GAME',   badge: 'RANKS',    color: 'var(--cyan)' },
  relaxation:       { filter: 'GAME',   badge: 'POOL',     color: 'var(--cyan)' },
  cup_elimination:  { filter: 'GAME',   badge: 'CUP',      color: 'var(--danger)' },
  bet_result:       { filter: 'BETS',   badge: 'BETS',     color: '#A855F7' },
  transfer:         { filter: 'TRADES', badge: 'TRANSFER', color: 'var(--positive)' },
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

export default function LeagueDetailView({ leagueId, members, currentUser, membersLoading, currentGW = '—', onH2h, onViewManager, h2hEnabled = false }) {
  const [activityFilter, setActivityFilter] = useState('ALL');
  const [entries, setEntries] = useState([]);
  const [h2hStandings, setH2hStandings] = useState([]); // { user_id, total_h2h_pts, h2h_rank }
  const channelRef = useRef(null);

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
  const myEntry   = members.find(m => currentUser && m.user_id === currentUser.id);
  const myRank    = myEntry?.rank ?? '—';
  const myPts     = myEntry?.total_points ?? '—';
  const leader    = members[0];
  const leaderName = leader
    ? (currentUser && leader.user_id === currentUser.id ? 'You' : leader.users?.username || 'Unknown')
    : '—';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>

      {/* ── DESKTOP: 4-col spotlight strip ────────────────────────────── */}
      <div className="hidden lg:grid" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr', borderBottom: '1px solid var(--rule)', flexShrink: 0 }}>
        {/* GW card */}
        <div style={{ padding: '18px 22px', borderRight: '1px solid var(--rule)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--cyan)', letterSpacing: '.22em' }}>LEAGUE · SEASON</div>
            <div style={{ fontFamily: DISPLAY, fontSize: 28, marginTop: 4, letterSpacing: '-0.02em' }}>GW {currentGW}</div>
            <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', marginTop: 6, letterSpacing: '.16em' }}>{members.length} MANAGERS · STANDINGS</div>
          </div>
          {members[0] && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: DISPLAY, fontSize: 16, color: 'var(--positive)' }}>{Math.round(members[0].total_points ?? 0)}</div>
              <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.18em', marginTop: 4 }}>LEAD SCORE</div>
            </div>
          )}
        </div>
        {/* Podium 1–3 */}
        {members.slice(0, 3).map((m, idx) => {
          const mName = (currentUser && m.user_id === currentUser.id) ? 'You' : (m.users?.username || 'Unknown');
          const hue = mgrHue(m.users?.username || '');
          const medal = ['var(--gold)', '#C0C0C0', '#CD7F32'][idx];
          return (
            <div key={m.user_id} style={{ padding: '18px 22px', borderRight: idx < 2 ? '1px solid var(--rule)' : 'none', display: 'flex', gap: 14, alignItems: 'center' }}>
              <div style={{ width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${medal}18`, border: `1px solid ${medal}66`, fontFamily: DISPLAY, fontSize: 22, color: medal }}>
                {idx + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <MgrTag mono={mgrMono(mName)} hue={hue} />
                  <div style={{ fontFamily: DISPLAY, fontSize: 13, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mName}</div>
                </div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', marginTop: 4, letterSpacing: '.14em' }}>RANK #{idx + 1}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: DISPLAY, fontSize: 16, color: 'var(--positive)' }}>{Math.round(m.total_points ?? 0)}</div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', marginTop: 4, letterSpacing: '.18em' }}>TOT</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── MOBILE: 2-col hero cards ───────────────────────────────────── */}
      <div className="lg:hidden" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '14px 18px', borderBottom: '1px solid var(--rule)', flexShrink: 0 }}>
        {/* Your rank */}
        <div style={{ padding: '10px 12px', background: 'var(--ink-2)', border: '1px solid var(--rule)', borderLeft: '2px solid var(--cyan)' }}>
          <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--cyan)', letterSpacing: '.2em' }}>YOUR RANK</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 24 }}>{myRank}</span>
            <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)' }}>/ {members.length}</span>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', marginTop: 4, letterSpacing: '.14em' }}>{myPts !== '—' ? Math.round(myPts) : '—'} TOT</div>
        </div>
        {/* Leader */}
        <div style={{ padding: '10px 12px', background: 'var(--ink-2)', border: '1px solid var(--rule)', borderLeft: '2px solid var(--gold)' }}>
          <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--gold)', letterSpacing: '.2em' }}>LEADER · {mgrMono(leaderName)}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 24 }}>{leader?.total_points != null ? Math.round(leader.total_points) : '—'}</span>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', marginTop: 4, letterSpacing: '.14em' }}>{leaderName}</div>
        </div>
      </div>

      {/* ── DESKTOP: standings table + activity rail ───────────────────── */}
      <div className="hidden lg:grid" style={{ flex: 1, gridTemplateColumns: '1fr 400px', minHeight: 0 }}>
        {/* Standings table */}
        <div data-tour="league-standings" style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--rule)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: h2hEnabled ? '48px 1fr 80px 60px 100px' : '48px 1fr 80px 100px', gap: 14, padding: '12px 24px', borderBottom: '1px solid var(--rule)', color: 'var(--mute)' }}>
            {(h2hEnabled ? ['#', 'MANAGER', 'TOT', 'H2H', ''] : ['#', 'MANAGER', 'TOT', '']).map((h, i) => (
              <div key={i} style={{ fontFamily: MONO, fontSize: 9, textAlign: (h2hEnabled ? i >= 2 && i < 4 : i >= 2 && i < 3) ? 'right' : 'left' }}>{h}</div>
            ))}
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {membersLoading && members.length === 0 ? (
              <div style={{ padding: '48px 24px', textAlign: 'center' }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.2em' }}>SYNCING STANDINGS…</div>
              </div>
            ) : members.map((m) => {
              const isMe = currentUser && m.user_id === currentUser.id;
              const mName = isMe ? 'You' : (m.users?.username || 'Unknown');
              const hue = mgrHue(m.users?.username || '');
              return (
                <div key={m.user_id} style={{
                  display: 'grid', gridTemplateColumns: h2hEnabled ? '48px 1fr 80px 60px 100px' : '48px 1fr 80px 100px', gap: 14, alignItems: 'center',
                  padding: '12px 24px', borderBottom: '1px solid var(--rule)',
                  borderLeft: isMe ? '2px solid var(--cyan)' : '2px solid transparent',
                  background: isMe ? 'rgba(0,180,216,.04)' : 'transparent',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: DISPLAY, fontSize: 14, minWidth: 18 }}>{m.rank || '—'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <MgrTag mono={mgrMono(mName)} hue={hue} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontFamily: DISPLAY, fontSize: 13, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>{mName}</span>
                        {m.rank === 1 && <span style={{ fontFamily: DISPLAY, fontSize: 8, background: 'var(--gold)', color: 'var(--ink)', padding: '1px 4px', letterSpacing: '.1em' }}>LEADER</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontFamily: DISPLAY, fontSize: 13 }}>{Math.round(m.total_points ?? 0)}</div>
                  {h2hEnabled && (
                    <div style={{ textAlign: 'right', fontFamily: DISPLAY, fontSize: 13, color: 'var(--gold)' }}>
                      {h2hMap[m.user_id] ?? '—'}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    {!isMe && (
                      <>
                        {onH2h && <button onClick={() => onH2h({ ...m, name: mName })} style={miniBtnStyle('var(--cyan)')}>H2H</button>}
                        <button onClick={() => onViewManager({ user_id: m.user_id, name: mName })} style={miniBtnStyle('var(--mute)')}>VIEW</button>
                      </>
                    )}
                    {isMe && <button onClick={() => onViewManager({ user_id: m.user_id, name: mName })} style={miniBtnStyle('var(--cyan)')}>VIEW</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Activity rail */}
        <aside style={{ display: 'flex', flexDirection: 'column', background: 'var(--ink-2)' }}>
          <HubSectionLabel label="LEAGUE ACTIVITY" sub="LIVE" tone="var(--gold)" right={<span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)' }}>RECENT</span>} />
          {/* Feed */}
          {(() => {
            const capped   = capBreakingNews(entries);
            const filtered = activityFilter === 'ALL'
              ? capped
              : capped.filter(e => (ENTRY_META[e.entry_type]?.filter ?? 'GAME') === activityFilter);
            if (filtered.length === 0) return (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 18px', gap: 8 }}>
                <div style={{ fontSize: 24 }}>⚽</div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.2em', textAlign: 'center' }}>NO ACTIVITY YET</div>
                <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 11, color: 'var(--mute)', opacity: 0.6, textAlign: 'center', lineHeight: 1.5 }}>
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
                          fontFamily: MONO, fontSize: 8, letterSpacing: '.18em',
                          padding: '2px 5px', border: `1px solid ${meta.color}`,
                          color: meta.color, flexShrink: 0,
                        }}>{meta.badge}</span>
                        <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)' }}>
                          {timeAgo(e.published_at)}
                        </span>
                      </div>
                      <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 12, fontWeight: 600, color: 'var(--paper)', lineHeight: 1.35, marginBottom: e.bullets?.length ? 6 : 0 }}>
                        {e.headline}
                      </div>
                      {parseBullets(e.bullets).length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {parseBullets(e.bullets).map((b, i) => {
                            const text = bulletText(b);
                            if (!text) return null;
                            return (
                              <div key={i} style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.1em', lineHeight: 1.4 }}>
                                {text}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
          {/* Filter bar */}
          <div style={{ padding: '12px 18px', borderTop: '1px solid var(--rule)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.18em' }}>FILTER</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {['ALL', 'GAME', 'BETS', 'TRADES'].map((f) => {
                const active = activityFilter === f;
                return (
                  <button
                    key={f}
                    onClick={() => setActivityFilter(f)}
                    style={{
                      fontFamily: MONO, fontSize: 9, letterSpacing: '.18em',
                      padding: '3px 6px',
                      border: `1px solid ${active ? 'var(--cyan)' : 'var(--rule)'}`,
                      color: active ? 'var(--cyan)' : 'var(--mute)',
                      background: active ? 'rgba(0,180,216,.08)' : 'transparent',
                      cursor: 'pointer',
                    }}
                  >{f}</button>
                );
              })}
            </div>
          </div>
        </aside>
      </div>

      {/* ── MOBILE: single-col standings list ─────────────────────────── */}
      <div className="lg:hidden" style={{ flex: 1, overflow: 'auto' }}>
        <MobSection
          label="STANDINGS"
          tone="var(--cyan)"
          right={<span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.14em' }}>SORT · TOT</span>}
        />
        {membersLoading && members.length === 0 ? (
          <div style={{ padding: '32px 18px', textAlign: 'center' }}>
            <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.2em' }}>SYNCING…</div>
          </div>
        ) : members.map((m) => {
          const isMe = currentUser && m.user_id === currentUser.id;
          const mName = isMe ? 'You' : (m.users?.username || 'Unknown');
          const hue = mgrHue(m.users?.username || '');
          return (
            <div
              key={m.user_id}
              onClick={() => onViewManager({ user_id: m.user_id, name: mName })}
              style={{
                display: 'grid', gridTemplateColumns: '28px auto 1fr auto auto', gap: 10, alignItems: 'center',
                padding: '10px 18px', borderBottom: '1px solid var(--rule)', cursor: 'pointer',
                borderLeft: isMe ? '2px solid var(--cyan)' : '2px solid transparent',
                background: isMe ? 'rgba(0,180,216,.04)' : 'transparent',
              }}
            >
              {/* Rank + trend */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontFamily: DISPLAY, fontSize: 14 }}>{m.rank || '—'}</span>
              </div>
              {/* Monogram */}
              <MgrTag mono={mgrMono(mName)} hue={hue} size={20} />
              {/* Name + captain stub */}
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontFamily: DISPLAY, fontSize: 13, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{mName}</span>
                  {m.rank === 1 && <span style={{ fontFamily: DISPLAY, fontSize: 7, background: 'var(--gold)', color: 'var(--ink)', padding: '1px 4px', letterSpacing: '.1em', flexShrink: 0 }}>1st</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <span style={{ width: 5, height: 5, background: 'var(--gold)', display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.12em' }}>C · —</span>
                </div>
              </div>
              {/* Form dots */}
              <MobFormDots form={[]} />
              {/* Points */}
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: DISPLAY, fontSize: 14 }}>{Math.round(m.total_points ?? 0)}</div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.14em', marginTop: 2 }}>TOT</div>
                {h2hEnabled && (
                  <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--gold)', letterSpacing: '.12em', marginTop: 1 }}>
                    {h2hMap[m.user_id] ?? '—'} H2H
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* ── Mobile activity feed ───────────────────────────────────── */}
        <MobSection
          label="LEAGUE ACTIVITY"
          tone="var(--gold)"
          right={<span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.14em' }}>RECENT</span>}
        />
        {(() => {
          if (entries.length === 0) return (
            <div style={{ padding: '24px 18px', textAlign: 'center' }}>
              <div style={{ fontSize: 20, marginBottom: 8 }}>⚽</div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.18em', marginBottom: 6 }}>NO ACTIVITY YET</div>
              <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 11, color: 'var(--mute)', opacity: 0.6, lineHeight: 1.5, maxWidth: 280, margin: '0 auto' }}>
                Draft results, rank changes, and league news will appear here as the season unfolds.
              </div>
            </div>
          );
          return capBreakingNews(entries).slice(0, 8).map((e) => {
            const meta = ENTRY_META[e.entry_type] ?? { badge: e.entry_type.toUpperCase(), color: 'var(--mute)' };
            return (
              <div key={e.id} style={{ padding: '11px 18px', borderBottom: '1px solid var(--rule)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.16em', padding: '1px 4px', border: `1px solid ${meta.color}`, color: meta.color, flexShrink: 0 }}>
                    {meta.badge}
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)' }}>{timeAgo(e.published_at)}</span>
                </div>
                <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 12, fontWeight: 600, color: 'var(--paper)', lineHeight: 1.35 }}>
                  {e.headline}
                </div>
              </div>
            );
          });
        })()}

        <div style={{ height: 32 }} />
      </div>
    </div>
  );
}
