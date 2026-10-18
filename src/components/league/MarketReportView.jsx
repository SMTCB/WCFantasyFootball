import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { MONO, DISPLAY, BODY, mgrHue, mgrMono } from './HubConstants';
import { MgrTag, HubSectionLabel, MobSection, miniBtnStyle } from './HubShared';
import GazetteDraftReport from '../GazetteDraftReport';
import ClubCrest from '../ClubCrest';

// League-wide transfer log grouped by matchday, plus the draft allocation
// report (overlaps/ties resolved by lottery) when one exists for this league.
// Unlike RecapScreen's "My Digest" (own transfers only), this shows every
// manager's activity — it's the league's shared market history.

const POSITION_COLOR = { GK: 'var(--gold)', DEF: 'var(--accent)', MID: 'var(--positive)', FWD: 'var(--danger)' };

// matchday_id looks like '623-r4'; null means a pre-competition move.
function roundFromMatchday(matchdayId) {
  const m = /-r(\d+)$/.exec(matchdayId ?? '');
  return m ? Number(m[1]) : null;
}

// squad_events logs a buy and a sell as separate rows; one row per event keeps
// the feed honest without guessing which sell pairs with which buy.
async function fetchLeagueTransfers(leagueId) {
  const { data, error } = await supabase.rpc('get_league_market_events', { p_league_id: leagueId });
  if (error) return { data: null, error };
  const rows = (data ?? [])
    .map(e => ({
      id: e.id,
      user_id: e.user_id,
      round_number: roundFromMatchday(e.matchday_id),
      player_in: e.player_in,
      player_out: e.player_out,
      transferred_at: e.event_at,
    }))
    .filter(t => t.round_number != null);
  return { data: rows, error: null };
}

function pillStyle(active) {
  return {
    padding: '8px 10px', minHeight: 36, flexShrink: 0,
    border: active ? '1px solid var(--accent)' : '1px solid var(--rule)',
    background: active ? 'var(--accent-soft)' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--mute)',
    fontFamily: MONO, fontSize: 'var(--fs-micro)', cursor: 'pointer',
  };
}

function RoundNav({ rounds, lastRound, selected, onSelect }) {
  if (rounds.length === 0) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '8px 20px', borderBottom: '1px solid var(--rule)', background: 'var(--card)',
      overflowX: 'auto', flexShrink: 0,
    }}>
      <span style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', flexShrink: 0, marginRight: 4 }}>
        WINDOW
      </span>
      <button className="hit-44" onClick={() => onSelect('all')} style={pillStyle(selected === 'all')}>ALL</button>
      {[...rounds].sort((a, b) => a - b).map(r => (
        <button className="hit-44" key={r} onClick={() => onSelect(r)} style={pillStyle(selected === r)}>
          MD {r}{r === lastRound ? ' · LATEST' : ''}
        </button>
      ))}
    </div>
  );
}

function formatWindowSub(w) {
  if (!w?.closes_at) return undefined;
  const closed = new Date(w.closes_at) <= new Date();
  const d = new Date(w.closes_at).toLocaleDateString([], { day: 'numeric', month: 'short' });
  return closed ? `WINDOW CLOSED ${d}` : `WINDOW CLOSES ${d}`;
}

const HEAT_COLLAPSED = 5;

function HeatMapPanel({ items, playerMap }) {
  const [expanded, setExpanded] = useState(false);
  if (!items.length) return null;
  const max = items[0].count;
  const shown = expanded ? items : items.slice(0, HEAT_COLLAPSED);
  return (
    <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--rule)' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', flex: 1 }}>
          MOST WANTED
        </span>
        {items.length > HEAT_COLLAPSED && (
          <button className="hit-44" onClick={() => setExpanded(e => !e)} style={miniBtnStyle('var(--accent)')}>
            {expanded ? 'TOP 5 ▲' : `ALL ${items.length} ▼`}
          </button>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {shown.map(({ player_id, count }) => {
          const p = playerMap[player_id];
          const pct = Math.max(8, Math.round((count / max) * 100));
          return (
            <div key={player_id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ClubCrest name={p?.club} size={18} />
              <span style={{
                fontFamily: MONO, fontSize: 'var(--fs-micro)', color: POSITION_COLOR[p?.position] || 'var(--mute)',
                width: 28, flexShrink: 0,
              }}>
                {p?.position ?? '—'}
              </span>
              <span style={{
                fontFamily: DISPLAY, fontSize: 'var(--fs-micro)', color: 'var(--paper)',
                flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {p?.name ?? player_id}
              </span>
              <div style={{ width: 64, height: 6, background: 'var(--rule)', borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
                <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)' }} />
              </div>
              <span style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', width: 18, textAlign: 'right', flexShrink: 0 }}>
                {count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MoveLine({ tone, label, player }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 28 }}>
      <span style={{
        fontFamily: MONO, fontSize: 'var(--fs-micro)', color: tone, width: 28, flexShrink: 0,
      }}>
        {label}
      </span>
      <ClubCrest name={player.club} size={16} />
      <span style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: POSITION_COLOR[player.position] || 'var(--mute)', width: 28, flexShrink: 0 }}>
        {player.position}
      </span>
      <span style={{
        fontFamily: DISPLAY, fontSize: 'var(--fs-label)', color: 'var(--paper)',
        flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {player.name}
      </span>
    </div>
  );
}

// One card per manager per matchday: their buys, then their sells. A buy and a
// sell are separate log rows with no pairing key, so they stay separate lists.
function ManagerMoves({ m, playerMap, username, isMe }) {
  const lookup = (id) => playerMap[id] ?? { name: id, position: '', club: undefined };
  const when = new Date(m.latest).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <div style={{
      padding: '10px 20px 12px', borderBottom: '1px solid var(--rule)',
      borderLeft: isMe ? '2px solid var(--accent)' : '2px solid transparent',
      background: isMe ? 'var(--accent-soft)' : 'transparent',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <MgrTag mono={mgrMono(username)} hue={mgrHue(username)} size={18} />
        <span style={{ fontFamily: DISPLAY, fontSize: 'var(--fs-body)', color: 'var(--paper)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {username}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', flexShrink: 0 }}>
          {m.ins.length} in · {m.outs.length} out · {when}
        </span>
      </div>
      {m.ins.map((id, i) => <MoveLine key={`in-${id}-${i}`} tone="var(--positive)" label="IN" player={lookup(id)} />)}
      {m.outs.map((id, i) => <MoveLine key={`out-${id}-${i}`} tone="var(--danger)" label="OUT" player={lookup(id)} />)}
    </div>
  );
}

export default function MarketReportView({ leagueId, members, currentUser }) {
  const [transfers, setTransfers] = useState([]);
  const [windows,   setWindows]   = useState([]);
  const [playerMap, setPlayerMap] = useState({});
  const [loading,   setLoading]   = useState(true);
  const [selectedRound, setSelectedRound] = useState('all');
  const [hasDraftReport, setHasDraftReport] = useState(false);
  const [draftAuditOpen, setDraftAuditOpen] = useState(false);
  const [wantedCounts, setWantedCounts] = useState([]); // [{player_id, count}], draft-mode leagues only

  useEffect(() => {
    if (!leagueId) return;
    let cancelled = false;
    supabase.from('gazette_entries')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', leagueId)
      .in('entry_type', ['draft_report', 'wishlist_draft_report'])
      .then(({ count }) => { if (!cancelled) setHasDraftReport((count ?? 0) > 0); });
    return () => { cancelled = true; };
  }, [leagueId]);

  // "Most Wanted" heat map. Draft-mode leagues: aggregate every priority-list
  // submission (season draft) and wishlist target (recurring rounds) — this is
  // the demand signal, since exclusive ownership means most of it never
  // resolves into a "purchase". Classic leagues: aggregate actual purchases
  // (transfers.player_in) since that's the closest analogue.
  useEffect(() => {
    if (!leagueId) return;
    let cancelled = false;

    (async () => {
      const { data: leagueRow } = await supabase
        .from('leagues')
        .select('format, league_mode')
        .eq('id', leagueId)
        .maybeSingle();
      if (cancelled || !leagueRow) return;

      const isDraftMode = leagueRow.format === 'noduplicate' || leagueRow.league_mode === 'draft';
      const counts = {};

      if (isDraftMode) {
        const [{ data: draftSubs }, { data: wishlistSubs }] = await Promise.all([
          supabase.from('draft_submissions').select('player_ids').eq('league_id', leagueId),
          supabase.from('wishlist_draft_submissions').select('target_ids').eq('league_id', leagueId),
        ]);
        if (cancelled) return;
        for (const row of draftSubs ?? []) {
          for (const pid of row.player_ids ?? []) counts[pid] = (counts[pid] ?? 0) + 1;
        }
        for (const row of wishlistSubs ?? []) {
          for (const pid of row.target_ids ?? []) counts[pid] = (counts[pid] ?? 0) + 1;
        }
      } else {
        const { data: allTransfers } = await fetchLeagueTransfers(leagueId);
        if (cancelled) return;
        for (const row of allTransfers ?? []) {
          if (row.player_in) counts[row.player_in] = (counts[row.player_in] ?? 0) + 1;
        }
      }

      const ranked = Object.entries(counts)
        .map(([player_id, count]) => ({ player_id, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
      if (cancelled || ranked.length === 0) return;

      const missingIds = ranked.map(r => r.player_id);
      const { data: playerRows } = await supabase.from('players').select('id, name, position, club').in('id', missingIds);
      if (cancelled) return;
      setPlayerMap(prev => ({ ...prev, ...Object.fromEntries((playerRows ?? []).map(p => [p.id, p])) }));
      setWantedCounts(ranked);
    })();

    return () => { cancelled = true; };
  }, [leagueId]);

  useEffect(() => {
    if (!leagueId) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const [{ data: transferRows, error: tErr }, { data: windowRows }] = await Promise.all([
          fetchLeagueTransfers(leagueId),
          supabase.from('transfer_windows')
            .select('round_number, opens_at, closes_at, window_type')
            .eq('league_id', leagueId)
            .order('round_number', { ascending: false }),
        ]);
        if (cancelled) return;
        if (tErr) { console.error('[MarketReportView] transfers:', tErr); setLoading(false); return; }

        setTransfers(transferRows ?? []);
        setWindows(windowRows ?? []);

        const rounds = [...new Set([
          ...(windowRows ?? []).map(w => w.round_number),
          ...(transferRows ?? []).map(t => t.round_number),
        ])];
        if (rounds.length > 0) setSelectedRound(Math.max(...rounds));

        const pidSet = new Set();
        (transferRows ?? []).forEach(t => {
          if (t.player_in)  pidSet.add(t.player_in);
          if (t.player_out) pidSet.add(t.player_out);
        });

        if (pidSet.size > 0) {
          const { data: playerRows } = await supabase.from('players').select('id, name, position, club').in('id', [...pidSet]);
          if (cancelled) return;
          setPlayerMap(Object.fromEntries((playerRows ?? []).map(p => [p.id, p])));
        } else {
          setPlayerMap({});
        }
      } catch (e) {
        console.error('[MarketReportView] load error:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [leagueId]);

  const userMap = useMemo(() => {
    const map = {};
    (members || []).forEach(m => { map[m.user_id] = m.users?.username || 'Unknown'; });
    return map;
  }, [members]);

  const windowMeta = useMemo(
    () => Object.fromEntries(windows.map(w => [w.round_number, w])),
    [windows]
  );

  const allRounds = useMemo(() => {
    const set = new Set([...windows.map(w => w.round_number), ...transfers.map(t => t.round_number)]);
    return [...set].sort((a, b) => b - a);
  }, [windows, transfers]);
  const lastRound = allRounds[0];

  const grouped = useMemo(() => {
    const rounds = {};
    for (const t of transfers) {
      if (selectedRound !== 'all' && t.round_number !== selectedRound) continue;
      const byMgr = (rounds[t.round_number] ??= {});
      const m = (byMgr[t.user_id] ??= { user_id: t.user_id, ins: [], outs: [], latest: t.transferred_at });
      if (t.player_in) m.ins.push(t.player_in);
      if (t.player_out) m.outs.push(t.player_out);
      if (t.transferred_at > m.latest) m.latest = t.transferred_at;
    }
    return Object.entries(rounds)
      .map(([r, byMgr]) => {
        const managers = Object.values(byMgr).sort((a, b) => (a.latest < b.latest ? 1 : -1));
        return { round: Number(r), managers, moves: managers.reduce((n, m) => n + m.ins.length + m.outs.length, 0) };
      })
      .sort((a, b) => b.round - a.round);
  }, [transfers, selectedRound]);

  if (loading) return (
    <div style={{ padding: '48px 24px', textAlign: 'center' }}>
      <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--mute)', }}>Loading market report…</span>
    </div>
  );

  return (
    <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      <HubSectionLabel label="Market report" sub="League transfer activity" tone="var(--accent)" />
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--rule)' }}>
        <p style={{ fontFamily: BODY, fontSize: 'var(--fs-label)', color: 'var(--mute)', lineHeight: 1.5, margin: 0 }}>
          Every manager's transfers, grouped by matchday. Pick a window below, or view All.
        </p>
      </div>

      <HeatMapPanel items={wantedCounts} playerMap={playerMap} />

      <RoundNav rounds={allRounds} lastRound={lastRound} selected={selectedRound} onSelect={setSelectedRound} />

      {grouped.length === 0 ? (
        <div style={{ padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 'var(--fs-title)', marginBottom: 12 }}>📰</div>
          <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--mute)', marginBottom: 8 }}>No transfers yet</div>
          <div style={{ fontFamily: BODY, fontSize: 'var(--fs-label)', color: 'var(--mute)', opacity: 0.7, lineHeight: 1.5, maxWidth: 320, margin: '0 auto' }}>
            Transfer activity will appear here once managers start making moves.
          </div>
        </div>
      ) : (
        grouped.map(g => (
          <div key={g.round}>
            <MobSection
              label={`Matchday ${g.round}`}
              sub={[`${g.moves} ${g.moves === 1 ? 'move' : 'moves'}`, formatWindowSub(windowMeta[g.round])].filter(Boolean).join(' · ')}
              tone="var(--gold)"
            />
            {g.managers.map(m => (
              <ManagerMoves
                key={m.user_id}
                m={m}
                playerMap={playerMap}
                username={userMap[m.user_id] ?? 'Unknown'}
                isMe={!!currentUser && m.user_id === currentUser.id}
              />
            ))}
          </div>
        ))
      )}

      {/* Permanent fixture of this tab, not a rotating news item — the header
          stays visible for the life of the league whenever draft data exists,
          independent of the matchday filter above. Collapsed by default since
          the full picking order + round-by-round pick log can run long;
          GazetteDraftReport renders newspaper-style (black text, paper
          aesthetic) by design, so it's wrapped in a light card to stay
          legible on the dark hub theme. */}
      {hasDraftReport && (
        <>
          <HubSectionLabel
            label="Draft audit"
            sub="Picking order & FULL LOG"
            tone="var(--gold)"
            right={
              <button className="hit-44" onClick={() => setDraftAuditOpen(o => !o)} style={miniBtnStyle('var(--gold)')}>
                {draftAuditOpen ? 'HIDE ▲' : 'SHOW ▼'}
              </button>
            }
          />
          {draftAuditOpen && (
            <div style={{ margin: '4px 20px 16px', padding: '16px 18px', background: '#f4f1ea', borderRadius: 4 }}>
              <GazetteDraftReport leagueId={leagueId} />
            </div>
          )}
        </>
      )}
      <div style={{ height: 32 }} />
    </div>
  );
}
