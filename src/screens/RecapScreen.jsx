import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

// ── Design tokens — mirror the league hub exactly ─────────────────────────────
const MONO    = "'JetBrains Mono', monospace";
const DISPLAY = "'Archivo Black', sans-serif";
const BODY    = "'Archivo', sans-serif";

// Badge metadata — exact mirror of ENTRY_META in LeagueDetailView.jsx
const ENTRY_META = {
  activity:       { badge: 'SCORES',   color: 'var(--positive)' },
  draft_report:   { badge: 'DRAFT',    color: 'var(--gold)'     },
  breaking_news:  { badge: 'NEWS',     color: 'var(--danger)'   },
  auction_result: { badge: 'AUCTION',  color: 'var(--positive)' },
};
const TRANSFER_META = { badge: 'TRANSFER', color: 'var(--cyan)' };

// ── Helpers ───────────────────────────────────────────────────────────────────

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
      fontFamily: MONO, fontSize: 8, letterSpacing: '.14em',
      color: 'var(--cyan)', padding: '2px 6px',
      border: '1px solid rgba(0,180,216,.25)',
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      maxWidth: 190, flexShrink: 0,
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
            fontFamily: MONO, fontSize: 8, letterSpacing: '.18em',
            padding: '2px 5px',
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {item.bullets.map((b, i) => (
                <div key={i} style={{
                  fontFamily: MONO, fontSize: 9, color: 'var(--mute)',
                  letterSpacing: '.1em', lineHeight: 1.4,
                }}>{b}</div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function RecapScreen() {
  const { user } = useAuth();
  const [feed,    setFeed]    = useState([]);
  const [loading, setLoading] = useState(true);

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

        // 4. Normalise gazette entries
        const gazetteItems = (gazetteRows ?? []).map(e => ({
          id:         `g-${e.id}`,
          kind:       'gazette',
          entry_type: e.entry_type,
          ts:         e.published_at,
          league_name: e.leagues?.name ?? leagueNameById[e.league_id] ?? 'League',
          headline:   e.headline,
          bullets:    e.bullets,
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

      {/* ── Feed ───────────────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.2em' }}>
            LOADING…
          </span>
        </div>
      ) : feed.length === 0 ? (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
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
            The WC 2026 kicks off 11 Jun — check back after the first round.
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
