import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

// ── Design tokens — mirror the league hub exactly ─────────────────────────────
const MONO    = "'JetBrains Mono', monospace";
const DISPLAY = "'Archivo Black', sans-serif";
const BODY    = "'Archivo', sans-serif";

// Badge metadata — exact mirror of ENTRY_META in LeagueDetailView.jsx
const ENTRY_META = {
  activity:       { badge: 'SCORES',    color: 'var(--positive)' },
  draft_report:   { badge: 'DRAFT',     color: 'var(--gold)'     },
  breaking_news:  { badge: 'NEWS',      color: 'var(--danger)'   },
  auction_result: { badge: 'AUCTION',   color: 'var(--positive)' },
  trade_result:   { badge: 'TRADE',     color: 'var(--cyan)'     },
  p2p_challenge:  { badge: 'CHALLENGE', color: 'var(--gold)'     },
  p2p_result:     { badge: 'P2P',       color: 'var(--gold)'     },
};
const TRANSFER_META = { badge: 'TRANSFER', color: 'var(--cyan)' };

// ── Helpers ───────────────────────────────────────────────────────────────────

// Normalise gazette bullets to an array of display strings.
// bullets can be: string[] | object[] | JSON string | null
function normalizeBullets(raw) {
  let arr = raw;
  if (typeof arr === 'string') {
    try { arr = JSON.parse(arr); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  return arr.map(b => {
    if (typeof b === 'string') return b;
    if (b && typeof b === 'object') {
      if (b.text) return b.text;
      // draft_report contest objects {player_id, wanted_by, winner_id}
      // headline already covers the summary — drop these to avoid clutter
      if (b.player_id) return null;
    }
    return null;
  }).filter(Boolean);
}

function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function dayLabel(iso) {
  const d   = new Date(iso);
  const now = new Date();
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString())  return 'TODAY';
  if (d.toDateString() === yest.toDateString()) return 'YESTERDAY';
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }).toUpperCase();
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DaySeparator({ label }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 20px',
      background: 'var(--ink-2)',
      borderBottom: '1px solid var(--rule)',
    }}>
      <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--mute)', flexShrink: 0 }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
    </div>
  );
}

function LeagueTag({ name }) {
  return (
    <span style={{
      fontFamily: MONO, fontSize: 10, fontWeight: 800, letterSpacing: '.12em',
      color: 'var(--cyan)', padding: '3px 8px',
      border: '1px solid rgba(26,111,168,.35)',
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      maxWidth: 200, flexShrink: 0,
    }}>
      {(name || '').toUpperCase()}
    </span>
  );
}

function FeedItem({ item }) {
  const meta = item.kind === 'transfer'
    ? TRANSFER_META
    : (ENTRY_META[item.entry_type] ?? { badge: (item.entry_type ?? '—').toUpperCase(), color: 'var(--mute)' });

  return (
    <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--rule)' }}>

      {/* Row 1: type badge + time ←→ league tag */}
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 8, marginBottom: 7,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontFamily: MONO, fontSize: 10, fontWeight: 800, letterSpacing: '.14em',
            padding: '3px 7px',
            border: `1px solid ${meta.color}`,
            color: meta.color, flexShrink: 0,
          }}>{meta.badge}</span>
          <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)' }}>
            {timeAgo(item.ts)}
          </span>
        </div>
        <LeagueTag name={item.league_name} />
      </div>

      {/* Row 2+: content */}
      {item.kind === 'transfer' ? (
        <div style={{ fontFamily: BODY, fontSize: 12, color: 'var(--paper)', lineHeight: 1.4 }}>
          {item.text}
        </div>
      ) : (
        <>
          {item.headline && (
            <div style={{
              fontFamily: BODY, fontSize: 12, fontWeight: 600,
              color: 'var(--paper)', lineHeight: 1.35,
              marginBottom: Array.isArray(item.bullets) && item.bullets.length ? 7 : 0,
            }}>
              {item.headline}
            </div>
          )}
          {Array.isArray(item.bullets) && item.bullets.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {item.bullets.map((b, i) => (
                <div key={i} style={{
                  fontFamily: BODY, fontSize: 12, color: 'var(--paper)',
                  lineHeight: 1.5, opacity: 0.85,
                }}>{b}</div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── LiveMatchdayCard ──────────────────────────────────────────────────────────
// Pinned above the feed when a matchday is in progress.
// Shows the user's starting XI split by fixture (finished or upcoming),
// with accumulated pts per player and the running GW total.

const POS_COLOR = { GK: '#A855F7', DEF: 'var(--cyan)', MID: 'var(--gold)', FWD: 'var(--danger)' };

function LiveMatchdayCard({ card }) {
  const { gwLabel, totalPts, roundComplete, fixtures, noGamePlayers, leagueName } = card;

  return (
    <div style={{ borderBottom: '2px solid var(--rule)', background: 'rgba(255,255,255,.018)' }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '11px 20px 9px', gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {!roundComplete && (
            <span className="animate-live-pulse" style={{
              width: 6, height: 6, borderRadius: '50%',
              background: 'var(--danger)', flexShrink: 0,
            }} />
          )}
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.18em', color: 'var(--paper)', flexShrink: 0 }}>
            {gwLabel}
          </span>
          <span style={{
            fontFamily: MONO, fontSize: 8, letterSpacing: '.14em', flexShrink: 0,
            color: roundComplete ? 'var(--positive)' : 'var(--danger)',
            padding: '1px 5px',
            border: `1px solid ${roundComplete ? 'rgba(22,101,52,.4)' : 'rgba(185,28,28,.4)'}`,
          }}>
            {roundComplete ? 'COMPLETE' : 'IN PROGRESS'}
          </span>
          <span style={{
            fontFamily: MONO, fontSize: 9, color: 'var(--mute)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {(leagueName || '').toUpperCase()}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, flexShrink: 0 }}>
          <span style={{ fontFamily: DISPLAY, fontSize: 22, letterSpacing: '-0.02em', color: 'var(--paper)' }}>
            {totalPts}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.12em' }}>PTS</span>
        </div>
      </div>

      {/* One section per fixture that has user's players */}
      {fixtures.map(fx => (
        <div key={fx.id} style={{ borderTop: '1px solid var(--rule)' }}>

          {/* Fixture sub-header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '5px 20px',
            background: 'rgba(255,255,255,.025)',
          }}>
            <span style={{
              fontFamily: MONO, fontSize: 9, letterSpacing: '.16em', flexShrink: 0,
              color: fx.status === 'live' ? 'var(--danger)' : fx.status === 'finished' ? 'var(--positive)' : 'var(--mute)',
            }}>
              {fx.status === 'live' ? 'LIVE' : fx.status === 'finished' ? 'FT' : fx.kickoffStr}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)' }}>
              {fx.home_team}{fx.status !== 'scheduled' ? ` ${fx.home_score}–${fx.away_score} ` : ' vs '}{fx.away_team}
            </span>
          </div>

          {/* Players rows */}
          {fx.players.map(p => {
            const showPts = fx.status !== 'scheduled';
            const ptsDisplay = showPts ? Math.round(p.rawPts) : '—';
            return (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 20px',
                borderTop: '1px solid rgba(255,255,255,.04)',
              }}>
                <span style={{
                  fontFamily: MONO, fontSize: 8,
                  color: POS_COLOR[p.position] ?? 'var(--mute)',
                  width: 24, flexShrink: 0,
                }}>
                  {p.position}
                </span>
                <span style={{
                  fontFamily: DISPLAY, fontSize: 12, letterSpacing: '-0.01em',
                  flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {p.name.split(' ').pop().toUpperCase()}
                </span>
                {p.isCaptain && (
                  <span style={{
                    fontFamily: DISPLAY, fontSize: 8,
                    background: 'var(--gold)', color: 'var(--ink)',
                    padding: '0 4px', flexShrink: 0,
                  }}>C</span>
                )}
                <span style={{
                  fontFamily: MONO, fontSize: 9, color: 'var(--mute)',
                  width: 28, textAlign: 'right', flexShrink: 0,
                }}>
                  {showPts && p.minutes != null ? `${p.minutes}'` : '—'}
                </span>
                <span style={{
                  fontFamily: DISPLAY, fontSize: 14,
                  color: showPts && p.rawPts > 0 ? 'var(--paper)' : 'var(--mute)',
                  width: 24, textAlign: 'right', flexShrink: 0,
                }}>
                  {ptsDisplay}
                </span>
              </div>
            );
          })}
        </div>
      ))}

      {/* Players with no fixture this round — compact footer */}
      {noGamePlayers.length > 0 && (
        <div style={{
          padding: '6px 20px 9px',
          borderTop: '1px solid var(--rule)',
        }}>
          <span style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.1em' }}>
            {'NO FIXTURE · '}
            {noGamePlayers.map(p => p.name.split(' ').pop().toUpperCase()).join(' · ')}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function RecapScreen() {
  const { user } = useAuth();
  const [feed,         setFeed]         = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [liveMatchdays, setLiveMatchdays] = useState([]);

  // ── Live matchday scorecard — separate effect so it loads independently ──────
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    (async () => {
      try {
        // 1. Memberships with tournament info
        const { data: memberRows } = await supabase
          .from('league_members')
          .select('league_id, leagues(id, name, tournament_id)')
          .eq('user_id', user.id);
        if (cancelled || !memberRows?.length) return;

        const tourIds = [...new Set(memberRows.map(r => r.leagues?.tournament_id).filter(Boolean))];

        // 2. Most recent past deadline per tournament → active matchday_id
        const { data: mdRows } = await supabase
          .from('matchday_deadlines')
          .select('matchday_id, tournament_id')
          .in('tournament_id', tourIds)
          .lte('deadline_at', new Date().toISOString())
          .order('deadline_at', { ascending: false });

        const activeMdByTournament = {};
        for (const row of mdRows ?? []) {
          if (!activeMdByTournament[row.tournament_id]) {
            activeMdByTournament[row.tournament_id] = row.matchday_id;
          }
        }

        // 3. One card per league
        const cards = (await Promise.all(
          memberRows.map(async (m) => {
            const tournamentId = m.leagues?.tournament_id;
            const leagueId     = m.league_id;
            const leagueName   = m.leagues?.name ?? 'League';
            const matchdayId   = activeMdByTournament[tournamentId];
            if (!matchdayId) return null;

            const gwNum  = matchdayId.split('-r')[1] ?? '?';
            const gwLabel = `GW${gwNum}`;

            // Parallel: squad + fixtures for this matchday
            const [{ data: squadRows }, { data: fixRows }] = await Promise.all([
              supabase.from('squads')
                .select('id, players, starting_xi, captain_id')
                .eq('user_id', user.id)
                .eq('league_id', leagueId)
                .limit(1),
              supabase.from('fixtures')
                .select('id, home_team, away_team, status, kickoff_at, home_score, away_score')
                .eq('matchday_id', matchdayId)
                .order('kickoff_at'),
            ]);

            const squad = squadRows?.[0];
            if (!squad || !fixRows?.length) return null;

            const startingIds  = squad.starting_xi?.length > 0 ? squad.starting_xi : (squad.players ?? []).slice(0, 11);
            if (!startingIds.length) return null;

            const roundComplete  = (fixRows ?? []).every(f => f.status === 'finished');
            // Only show the card while the round is still in progress
            if (roundComplete) return null;

            const finishedFixIds = (fixRows ?? []).filter(f => f.status === 'finished').map(f => f.id);

            // Parallel: player details + stats (finished fixtures only) + GW total
            const [{ data: playerRows }, { data: statsRows }, { data: fpRows }] = await Promise.all([
              supabase.from('players')
                .select('id, name, position, nationality')
                .in('id', startingIds),
              finishedFixIds.length
                ? supabase.from('player_match_stats')
                    .select('player_id, fantasy_points, minutes_played')
                    .in('player_id', startingIds)
                    .in('fixture_id', finishedFixIds)
                : Promise.resolve({ data: [] }),
              supabase.from('fantasy_points')
                .select('total')
                .eq('squad_id', squad.id)
                .eq('matchday_id', matchdayId)
                .limit(1),
            ]);

            const playerLookup = Object.fromEntries((playerRows ?? []).map(p => [p.id, p]));
            const statsMap     = {};
            for (const s of statsRows ?? []) {
              statsMap[s.player_id] = { rawPts: Number(s.fantasy_points ?? 0), minutes: s.minutes_played ?? 0 };
            }

            const captainId = squad.captain_id;
            const totalPts  = Number(fpRows?.[0]?.total ?? 0);

            // Group players by fixture using nationality as team identifier
            const fixtureData = (fixRows ?? []).map(fx => {
              const teams = new Set([fx.home_team, fx.away_team]);
              const fxPlayers = startingIds
                .map(id => playerLookup[id])
                .filter(p => p && teams.has(p.nationality))
                .map(p => ({
                  ...p,
                  isCaptain: p.id === captainId,
                  rawPts:    statsMap[p.id]?.rawPts ?? 0,
                  minutes:   statsMap[p.id]?.minutes ?? null,
                }));
              if (!fxPlayers.length) return null;

              const kickoffDate = new Date(fx.kickoff_at);
              const kickoffStr  = kickoffDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

              return { ...fx, kickoffStr, players: fxPlayers };
            }).filter(Boolean);

            // Players with no fixture in this round
            const inFixture     = new Set(fixtureData.flatMap(fx => fx.players.map(p => p.id)));
            const noGamePlayers = startingIds
              .map(id => playerLookup[id])
              .filter(p => p && !inFixture.has(p.id));

            return { gwLabel, totalPts, roundComplete: false, fixtures: fixtureData, noGamePlayers, leagueName };
          })
        )).filter(Boolean);

        if (!cancelled) setLiveMatchdays(cards);
      } catch (err) {
        console.error('[RecapScreen] liveMatchday', err);
      }
    })();

    return () => { cancelled = true; };
  }, [user?.id]);

  // ── Feed (gazette + transfers) ────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setLoading(true);
    const since = new Date(Date.now() - 7 * 86400000).toISOString();

    (async () => {
      try {
        // 1. User's leagues (for transfer league-name lookup)
        const { data: memberRows } = await supabase
          .from('league_members')
          .select('league_id, leagues(name)')
          .eq('user_id', user.id);

        if (cancelled) return;

        const leagueNameById = Object.fromEntries(
          (memberRows ?? []).map(r => [r.league_id, r.leagues?.name ?? 'League'])
        );

        // 2. Gazette (all types, scoped by RLS) + own transfers — parallel
        const [{ data: gazetteRows }, { data: transferRows }] = await Promise.all([
          supabase
            .from('gazette_entries')
            .select('id, entry_type, league_id, headline, bullets, published_at, leagues(name)')
            .gte('published_at', since)
            .order('published_at', { ascending: false }),
          supabase
            .from('transfers')
            .select('id, league_id, player_in, player_out, round_number, transferred_at')
            .eq('user_id', user.id)
            .gte('transferred_at', since)
            .order('transferred_at', { ascending: false }),
        ]);

        if (cancelled) return;

        // 3. Batch-fetch player names for all transfer rows
        const pidSet = new Set();
        for (const t of transferRows ?? []) {
          if (t.player_in)  pidSet.add(t.player_in);
          if (t.player_out) pidSet.add(t.player_out);
        }
        let playerMap = {};
        if (pidSet.size > 0) {
          const { data: playerRows } = await supabase
            .from('players')
            .select('id, name, position')
            .in('id', [...pidSet]);
          playerMap = Object.fromEntries((playerRows ?? []).map(p => [p.id, p]));
        }

        if (cancelled) return;

        // 4. Normalise gazette entries — bullets always become string[]
        // Cap breaking_news to 3 most recent per league (entries already sorted DESC)
        const newsCountByLeague = {};
        const gazetteItems = (gazetteRows ?? [])
          .filter(e => {
            if (e.entry_type !== 'breaking_news') return true;
            const c = (newsCountByLeague[e.league_id] ?? 0) + 1;
            newsCountByLeague[e.league_id] = c;
            return c <= 3;
          })
          .map(e => ({
            id:         `g-${e.id}`,
            kind:       'gazette',
            entry_type: e.entry_type,
            ts:         e.published_at,
            league_name: e.leagues?.name ?? leagueNameById[e.league_id] ?? 'League',
            headline:   e.headline,
            bullets:    normalizeBullets(e.bullets),
          }));

        // 5. Normalise transfers — show what player came in / went out
        const transferItems = (transferRows ?? []).map(t => {
          const pIn  = t.player_in  ? playerMap[t.player_in]  : null;
          const pOut = t.player_out ? playerMap[t.player_out] : null;
          const parts = [];
          if (pIn)  parts.push(`▲ ${pIn.name}  ${pIn.position}`);
          if (pOut) parts.push(`▼ ${pOut.name}  ${pOut.position}`);
          return {
            id:          `t-${t.id}`,
            kind:        'transfer',
            ts:          t.transferred_at,
            league_name: leagueNameById[t.league_id] ?? 'League',
            text:        parts.length ? parts.join('   ·   ') : `GW ${t.round_number} transfer`,
          };
        });

        // 6. Merge + sort newest first
        const allItems = [...gazetteItems, ...transferItems]
          .sort((a, b) => new Date(b.ts) - new Date(a.ts));

        if (!cancelled) { setFeed(allItems); setLoading(false); }
      } catch (err) {
        console.error('[RecapScreen]', err);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user?.id]);

  // ── Group feed by calendar day ────────────────────────────────────────────
  const grouped = [];
  let lastLabel = null;
  for (const item of feed) {
    const label = dayLabel(item.ts);
    if (label !== lastLabel) {
      grouped.push({ type: 'sep', label, id: `sep-${label}` });
      lastLabel = label;
    }
    grouped.push({ type: 'item', item, id: item.id });
  }

  const todayStr = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  }).toUpperCase();

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--ink)' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '16px 20px 14px',
        borderBottom: '1px solid var(--rule)',
        flexShrink: 0,
      }}>
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--mute)', marginBottom: 4 }}>
          {todayStr} · ALL LEAGUES
        </div>
        <div style={{ fontFamily: DISPLAY, fontSize: 22, letterSpacing: '-0.01em', color: 'var(--paper)' }}>
          MY DIGEST
        </div>
      </div>

      {/* ── Live matchday scorecards — pinned above the feed ───────────────── */}
      {liveMatchdays.length > 0 && (
        <div style={{ flexShrink: 0 }}>
          {liveMatchdays.map((card, i) => (
            <LiveMatchdayCard key={i} card={card} />
          ))}
        </div>
      )}

      {/* ── Feed ───────────────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.2em' }}>
            LOADING…
          </span>
        </div>
      ) : feed.length === 0 ? (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '48px 24px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 32, marginBottom: 14 }}>📋</div>
            <div style={{ fontFamily: DISPLAY, fontSize: 18, color: 'var(--paper)', marginBottom: 8 }}>
              ALL QUIET
            </div>
            <div style={{
              fontFamily: BODY, fontSize: 13, color: 'var(--mute)',
              lineHeight: 1.55, maxWidth: 280,
            }}>
              No activity in your leagues in the last 7 days.
            </div>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto' }}>
          {grouped.map(g =>
            g.type === 'sep'
              ? <DaySeparator key={g.id} label={g.label} />
              : <FeedItem     key={g.id} item={g.item} />
          )}
          <div style={{ height: 32 }} />
        </div>
      )}
    </div>
  );
}
