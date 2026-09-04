import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { MONO, DISPLAY, BODY, mgrHue, mgrMono } from './HubConstants';
import { MgrTag, HubSectionLabel, MobSection } from './HubShared';
import GazetteDraftReport from '../GazetteDraftReport';

// League-wide transfer log grouped by matchday, plus the draft allocation
// report (overlaps/ties resolved by lottery) when one exists for this league.
// Unlike RecapScreen's "My Digest" (own transfers only), this shows every
// manager's activity — it's the league's shared market history.

const POSITION_COLOR = { GK: 'var(--gold)', DEF: 'var(--cyan)', MID: 'var(--positive)', FWD: 'var(--danger)' };

function pillStyle(active) {
  return {
    padding: '8px 10px', minHeight: 36, flexShrink: 0,
    border: active ? '1px solid var(--cyan)' : '1px solid var(--rule)',
    background: active ? 'rgba(0,180,216,.14)' : 'transparent',
    color: active ? 'var(--cyan)' : 'var(--mute)',
    fontFamily: MONO, fontSize: 'var(--fs-micro)', letterSpacing: '.12em', cursor: 'pointer',
  };
}

function RoundNav({ rounds, lastRound, selected, onSelect }) {
  if (rounds.length === 0) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '8px 20px', borderBottom: '1px solid var(--rule)', background: 'var(--ink)',
      overflowX: 'auto', flexShrink: 0,
    }}>
      <span style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', letterSpacing: '.2em', color: 'var(--mute)', flexShrink: 0, marginRight: 4 }}>
        WINDOW
      </span>
      <button onClick={() => onSelect('all')} style={pillStyle(selected === 'all')}>ALL</button>
      {rounds.map(r => (
        <button key={r} onClick={() => onSelect(r)} style={pillStyle(selected === r)}>
          MD {r}{r === lastRound ? ' · LAST' : ''}
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

function TransferRow({ t, playerMap, username, isMe }) {
  const pOut = playerMap[t.player_out];
  const pIn  = playerMap[t.player_in];
  const when = t.transferred_at
    ? new Date(t.transferred_at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8,
      padding: '10px 20px', borderBottom: '1px solid var(--rule)',
      borderLeft: isMe ? '2px solid var(--cyan)' : '2px solid transparent',
      background: isMe ? 'rgba(0,180,216,.04)' : 'transparent',
    }}>
      <MgrTag mono={mgrMono(username)} hue={mgrHue(username)} size={18} />
      <span style={{ fontFamily: DISPLAY, fontSize: 'var(--fs-body)', color: 'var(--paper)', flexShrink: 0 }}>
        {isMe ? 'You' : username}
      </span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {pOut && (
          <span style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: POSITION_COLOR[pOut.position] || 'var(--mute)' }}>
            {pOut.position}
          </span>
        )}
        <span style={{ fontFamily: DISPLAY, fontSize: 'var(--fs-micro)', color: 'var(--danger)', textDecoration: 'line-through', opacity: 0.85 }}>
          {pOut?.name ?? t.player_out ?? '—'}
        </span>
        <span style={{ color: 'var(--mute)' }}>→</span>
        {pIn && (
          <span style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: POSITION_COLOR[pIn.position] || 'var(--mute)' }}>
            {pIn.position}
          </span>
        )}
        <span style={{ fontFamily: DISPLAY, fontSize: 'var(--fs-micro)', color: 'var(--positive)' }}>
          {pIn?.name ?? t.player_in ?? '—'}
        </span>
      </span>
      <span style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', flexShrink: 0 }}>{when}</span>
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

  useEffect(() => {
    if (!leagueId) return;
    let cancelled = false;
    supabase.from('gazette_entries')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', leagueId)
      .eq('entry_type', 'draft_report')
      .then(({ count }) => { if (!cancelled) setHasDraftReport((count ?? 0) > 0); });
    return () => { cancelled = true; };
  }, [leagueId]);

  useEffect(() => {
    if (!leagueId) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const [{ data: transferRows, error: tErr }, { data: windowRows }] = await Promise.all([
          supabase.from('transfers')
            .select('id, user_id, round_number, player_in, player_out, transferred_at')
            .eq('league_id', leagueId)
            .order('round_number', { ascending: false })
            .order('transferred_at', { ascending: false }),
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
          const { data: playerRows } = await supabase.from('players').select('id, name, position').in('id', [...pidSet]);
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
    const map = {};
    for (const t of transfers) {
      if (selectedRound !== 'all' && t.round_number !== selectedRound) continue;
      (map[t.round_number] ??= []).push(t);
    }
    return Object.entries(map)
      .map(([r, list]) => ({ round: Number(r), list }))
      .sort((a, b) => b.round - a.round);
  }, [transfers, selectedRound]);

  if (loading) return (
    <div style={{ padding: '48px 24px', textAlign: 'center' }}>
      <span style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', letterSpacing: '.2em' }}>LOADING MARKET REPORT…</span>
    </div>
  );

  return (
    <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      <HubSectionLabel label="MARKET REPORT" sub="LEAGUE TRANSFER ACTIVITY" tone="var(--cyan)" />
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--rule)' }}>
        <p style={{ fontFamily: BODY, fontSize: 'var(--fs-label)', color: 'var(--mute)', lineHeight: 1.5, margin: 0 }}>
          Every transfer made across the league, grouped by matchday. Pick a single window below to see just the last transfer window, or view All for the full season.
        </p>
      </div>

      <RoundNav rounds={allRounds} lastRound={lastRound} selected={selectedRound} onSelect={setSelectedRound} />

      {grouped.length === 0 ? (
        <div style={{ padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 'var(--fs-title)', marginBottom: 12 }}>📰</div>
          <div style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', letterSpacing: '.18em', marginBottom: 8 }}>NO TRANSFERS YET</div>
          <div style={{ fontFamily: BODY, fontSize: 'var(--fs-label)', color: 'var(--mute)', opacity: 0.7, lineHeight: 1.5, maxWidth: 320, margin: '0 auto' }}>
            Transfer activity will appear here once managers start making moves.
          </div>
        </div>
      ) : (
        grouped.map(g => (
          <div key={g.round}>
            <MobSection label={`MATCHDAY ${g.round}`} sub={formatWindowSub(windowMeta[g.round])} tone="var(--gold)" />
            {g.list.map(t => (
              <TransferRow
                key={t.id}
                t={t}
                playerMap={playerMap}
                username={userMap[t.user_id] ?? 'Unknown'}
                isMe={!!currentUser && t.user_id === currentUser.id}
              />
            ))}
          </div>
        ))
      )}

      {/* GazetteDraftReport renders newspaper-style (black text, paper aesthetic) by
          design — wrap it in a light card so it stays legible on the dark hub theme.
          Only rendered when a draft_report entry actually exists, else it's an empty box. */}
      {hasDraftReport && (
        <div style={{ margin: '4px 20px 0', padding: '16px 18px', background: '#f4f1ea', borderRadius: 4 }}>
          <GazetteDraftReport leagueId={leagueId} />
        </div>
      )}
      <div style={{ height: 32 }} />
    </div>
  );
}
