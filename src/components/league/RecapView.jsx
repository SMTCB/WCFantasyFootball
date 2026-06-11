import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { MONO, DISPLAY, mgrHue, mgrMono } from './HubConstants';
import { MgrTag, HubSectionLabel, MobSection } from './HubShared';

// ── All helpers are module-level so React never sees new function references ──

function MatchdayNav({ allMatchdays, selected, onSelect, mobile }) {
  if (allMatchdays.length <= 1) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: mobile ? '8px 18px' : '8px 20px',
      borderBottom: '1px solid var(--rule)', background: 'var(--ink)',
      overflowX: 'auto', flexShrink: 0,
    }}>
      <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--mute)', flexShrink: 0, marginRight: 4 }}>
        {mobile ? 'GW' : 'ROUND'}
      </span>
      {allMatchdays.map(md => {
        const n = String(md.matchday_id).replace(/^.*-r/, '');
        const active = md.matchday_id === selected;
        const isLive = md.isLive;
        return (
          <button key={md.matchday_id} onClick={() => onSelect(md.matchday_id)} style={{
            padding: '4px 9px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4,
            border: active ? `1px solid ${isLive ? 'var(--danger)' : 'var(--cyan)'}` : '1px solid var(--rule)',
            background: active ? (isLive ? 'rgba(239,68,68,.12)' : 'rgba(0,180,216,.14)') : 'transparent',
            color: active ? (isLive ? 'var(--danger)' : 'var(--cyan)') : 'var(--mute)',
            fontFamily: MONO, fontSize: 10, letterSpacing: '.12em', cursor: 'pointer',
          }}>
            {isLive && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--danger)', flexShrink: 0 }} />}
            {n}
          </button>
        );
      })}
    </div>
  );
}

function FixtureRow({ f }) {
  const finished = f.status === 'finished';
  const live = f.status === 'live' || f.status === 'in_progress';
  const ko = f.kickoff_at
    ? new Date(f.kickoff_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '—';
  return (
    <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--rule)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--paper)', flex: 1, textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.home_team}</span>
        <span style={{ fontFamily: DISPLAY, fontSize: 13, minWidth: 52, textAlign: 'center', color: finished ? 'var(--paper)' : live ? 'var(--danger)' : 'var(--mute)' }}>
          {finished || live ? `${f.home_score ?? '–'} – ${f.away_score ?? '–'}` : ko}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--paper)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.away_team}</span>
      </div>
      {live     && <div style={{ textAlign: 'center', marginTop: 3 }}><span style={{ fontFamily: MONO, fontSize: 8, color: 'var(--danger)', letterSpacing: '.18em' }}>● LIVE</span></div>}
      {finished && <div style={{ textAlign: 'center', marginTop: 3 }}><span style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.14em' }}>FT</span></div>}
    </div>
  );
}

function PlayerBreakdown({ breakdown, penaltyDeduction = 0, betDetails = [], tradeNet = 0 }) {
  if (!breakdown || breakdown === 'loading') {
    return (
      <div style={{ padding: '10px 24px', fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.18em', borderTop: '1px solid var(--rule)' }}>
        {breakdown === 'loading' ? 'LOADING…' : 'NO SQUAD DATA'}
      </div>
    );
  }
  return (
    <div style={{ borderTop: '1px solid var(--rule)', background: 'var(--ink-2)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 50px 50px', gap: 8, padding: '6px 24px', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
        {['POS', 'PLAYER', 'MIN', 'PTS'].map((h, i) => (
          <span key={i} style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.18em', textAlign: i >= 2 ? 'right' : 'left' }}>{h}</span>
        ))}
      </div>
      {breakdown.map((p, i) => {
        const posColor = p.position === 'GK' ? 'var(--gold)' : p.position === 'DEF' ? 'var(--cyan)' : p.position === 'MID' ? 'var(--positive)' : 'var(--danger)';
        const badges = [];
        if (p.triple)        badges.push({ s: '3×C',               c: 'var(--gold)' });
        else if (p.captain)  badges.push({ s: '©',                 c: 'var(--gold)' });
        if (p.joker)         badges.push({ s: '2×',                c: 'var(--purple)' });
        if (p.goals)         badges.push({ s: `⚽×${p.goals}`,     c: 'var(--positive)' });
        if (p.assists)       badges.push({ s: `🅰×${p.assists}`,   c: 'var(--cyan)' });
        if (p.saves > 0)     badges.push({ s: `${p.saves}SV`,      c: 'var(--cyan)' });
        if (p.keyPasses > 0) badges.push({ s: `${p.keyPasses}KP`,  c: 'var(--positive)' });
        if (p.sot > 0)       badges.push({ s: `${p.sot}SoT`,       c: 'var(--positive)' });
        if (p.bigChances > 0) badges.push({ s: `${p.bigChances}BC`, c: 'var(--gold)' });
        if (p.yellow)        badges.push({ s: '🟨',                c: 'var(--warn)' });
        if (p.red)           badges.push({ s: '🟥',                c: 'var(--danger)' });
        return (
          <div key={p.id} style={{
            display: 'grid', gridTemplateColumns: '32px 1fr 50px 50px', gap: 8,
            padding: '7px 24px', borderBottom: '1px solid rgba(255,255,255,.03)',
            background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.01)',
          }}>
            <span style={{ fontFamily: MONO, fontSize: 9, color: posColor, letterSpacing: '.1em' }}>{p.position}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
              <span style={{ fontFamily: DISPLAY, fontSize: 11, color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
              {badges.map((b, bi) => <span key={bi} style={{ fontFamily: MONO, fontSize: 8, color: b.c, flexShrink: 0 }}>{b.s}</span>)}
            </div>
            <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', textAlign: 'right' }}>{p.hasStats ? p.minutes : '—'}</span>
            <span style={{ fontFamily: DISPLAY, fontSize: 11, textAlign: 'right', color: p.pts > 0 ? 'var(--positive)' : p.pts < 0 ? 'var(--danger)' : 'var(--mute)' }}>
              {p.pts !== null ? Math.round(p.pts) : (p.hasStats ? '0' : '—')}
            </span>
          </div>
        );
      })}
      {penaltyDeduction > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: '32px 1fr 50px 50px', gap: 8,
          padding: '7px 24px', borderTop: '1px solid rgba(240,58,58,0.25)',
          background: 'rgba(240,58,58,0.06)',
        }}>
          <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--danger)', letterSpacing: '.1em' }}>—</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 11, color: 'var(--danger)' }}>Transfer Penalty</span>
            <span style={{ fontFamily: MONO, fontSize: 8, color: 'rgba(240,58,58,0.6)', letterSpacing: '.08em' }}>extra buys</span>
          </div>
          <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', textAlign: 'right' }}>—</span>
          <span style={{ fontFamily: DISPLAY, fontSize: 11, textAlign: 'right', color: 'var(--danger)' }}>−{penaltyDeduction}</span>
        </div>
      )}
      {betDetails.map((b, bi) => (
        <div key={bi} style={{
          display: 'grid', gridTemplateColumns: '32px 1fr 50px 50px', gap: 8,
          padding: '7px 24px', borderTop: '1px solid rgba(240,180,0,0.25)',
          background: 'rgba(240,180,0,0.06)',
        }}>
          <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--gold)', letterSpacing: '.1em' }}>—</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 11, color: 'var(--gold)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Bet won</span>
            <span style={{ fontFamily: MONO, fontSize: 8, color: 'rgba(240,180,0,0.6)', letterSpacing: '.08em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</span>
          </div>
          <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', textAlign: 'right' }}>—</span>
          <span style={{ fontFamily: DISPLAY, fontSize: 11, textAlign: 'right', color: 'var(--gold)' }}>+{b.amount}</span>
        </div>
      ))}
      {tradeNet !== 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: '32px 1fr 50px 50px', gap: 8,
          padding: '7px 24px',
          borderTop: tradeNet > 0 ? '1px solid rgba(240,180,0,0.25)' : '1px solid rgba(240,58,58,0.25)',
          background: tradeNet > 0 ? 'rgba(240,180,0,0.06)' : 'rgba(240,58,58,0.06)',
        }}>
          <span style={{ fontFamily: MONO, fontSize: 9, color: tradeNet > 0 ? 'var(--gold)' : 'var(--danger)', letterSpacing: '.1em' }}>—</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 11, color: tradeNet > 0 ? 'var(--gold)' : 'var(--danger)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {tradeNet > 0 ? 'Trade received' : 'Trade given'}
            </span>
          </div>
          <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', textAlign: 'right' }}>—</span>
          <span style={{ fontFamily: DISPLAY, fontSize: 11, textAlign: 'right', color: tradeNet > 0 ? 'var(--gold)' : 'var(--danger)' }}>
            {tradeNet > 0 ? `+${tradeNet}` : `−${Math.abs(tradeNet)}`}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function RecapView({ leagueId, tournamentId, members, currentUser, h2hEnabled = false }) {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1024);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  const [allMatchdays,     setAllMatchdays]     = useState([]);
  const [selectedMatchday, setSelectedMatchday] = useState(null);
  const [scores,           setScores]           = useState([]);
  const [fixtures,         setFixtures]         = useState([]);
  const [loadingMds,       setLoadingMds]       = useState(true);
  const [loadingScores,    setLoadingScores]    = useState(false);
  const [breakdown,        setBreakdown]        = useState({});
  const [expandedUser,     setExpandedUser]     = useState(null);
  const [h2hStandings,     setH2hStandings]     = useState([]);
  const [betMap,           setBetMap]           = useState({});
  const [tradeMap,         setTradeMap]         = useState({});

  // Fetch H2H standings when league is H2H-enabled
  useEffect(() => {
    if (!leagueId || !h2hEnabled) return;
    supabase.rpc('get_h2h_standings', { p_league_id: leagueId })
      .then(({ data }) => setH2hStandings(data ?? []));
  }, [leagueId, h2hEnabled]);

  const h2hMap = Object.fromEntries(h2hStandings.map(r => [r.user_id, r.total_h2h_pts ?? 0]));

  // ── Effect 1: load matchday list (runs once on mount per league/tournament) ─
  useEffect(() => {
    if (!leagueId || !tournamentId) { setLoadingMds(false); return; }
    let cancelled = false;
    setLoadingMds(true);
    setAllMatchdays([]);
    setSelectedMatchday(null);

    const now = new Date().toISOString();
    Promise.all([
      // Past matchdays (deadline already passed = round locked)
      supabase.from('matchday_deadlines').select('matchday_id, deadline_at')
        .eq('tournament_id', tournamentId).lte('deadline_at', now),
      // Current/active matchday (next upcoming deadline — may have fixtures in progress)
      supabase.from('matchday_deadlines').select('matchday_id, deadline_at')
        .eq('tournament_id', tournamentId).gt('deadline_at', now)
        .order('deadline_at', { ascending: true }).limit(1),
    ]).then(async ([{ data: pastData, error }, { data: upcomingData }]) => {
      if (cancelled) return;
      if (error) { console.error('[RecapView] matchday load:', error); setLoadingMds(false); return; }

      const sorted = (pastData ?? []).sort((a, b) => {
        const na = parseInt(String(a.matchday_id).replace(/^.*-r/, ''), 10);
        const nb = parseInt(String(b.matchday_id).replace(/^.*-r/, ''), 10);
        return na - nb;
      });

      // Include the current active matchday if any of its fixtures have started.
      // This shows partial/live GW scores mid-matchday without waiting for the round to close.
      const activeMd = upcomingData?.[0] ?? null;
      if (activeMd) {
        const { data: startedFix } = await supabase
          .from('fixtures').select('id').eq('matchday_id', activeMd.matchday_id)
          .in('status', ['live', 'finished']).limit(1);
        if (!cancelled && startedFix?.length) {
          sorted.push({ ...activeMd, isLive: true });
        }
      }

      if (cancelled) return;
      setAllMatchdays(sorted);
      if (sorted.length > 0) setSelectedMatchday(sorted[sorted.length - 1].matchday_id);
      setLoadingMds(false);
    });

    return () => { cancelled = true; };
  }, [leagueId, tournamentId]);

  // ── Effect 1b: load resolved points-bet rewards, mapped onto a matchday ──────
  // bet_instances has no matchday_id column, so we approximate: each resolved
  // points-type bet maps to the matchday whose deadline is the next one on/after
  // the bet's own deadline (clamped to the last known matchday if the bet
  // resolved after every matchday deadline). The points themselves are already
  // safely included in league_members.total_points (migration 167) regardless —
  // this only controls which GW row shows the "+N BET" indicator.
  useEffect(() => {
    if (!leagueId || !allMatchdays.length) return;
    let cancelled = false;

    (async () => {
      try {
        const { data: squadRows, error: sqErr } = await supabase
          .from('squads').select('id, user_id').eq('league_id', leagueId);
        if (cancelled || sqErr || !squadRows?.length) return;

        const latestByUser = {};
        squadRows.forEach(s => { if (!latestByUser[s.user_id]) latestByUser[s.user_id] = s.id; });
        const squadIds = Object.values(latestByUser);

        const { data: betRows, error: betErr } = await supabase
          .from('bet_submissions')
          .select('squad_id, reward_awarded, bet_instances!inner(id, league_id, deadline_at, resolves_at, created_at, title, reward_type, status)')
          .in('squad_id', squadIds)
          .eq('is_correct', true)
          .not('reward_awarded', 'is', null)
          .eq('bet_instances.league_id', leagueId)
          .eq('bet_instances.reward_type', 'points')
          .eq('bet_instances.status', 'resolved');

        if (cancelled) return;
        if (betErr) { console.error('[RecapView] bet rewards:', betErr); return; }
        if (!betRows?.length) { setBetMap({}); return; }

        // allMatchdays is already ascending by round number / deadline
        const sortedMds = allMatchdays;
        const mapToMatchday = (anchorIso) => {
          const anchor = new Date(anchorIso).getTime();
          for (const md of sortedMds) {
            if (new Date(md.deadline_at).getTime() >= anchor) return md.matchday_id;
          }
          return sortedMds[sortedMds.length - 1].matchday_id;
        };

        const map = {};
        for (const row of betRows) {
          const inst = row.bet_instances;
          const anchor = inst.deadline_at ?? inst.resolves_at ?? inst.created_at;
          const mdId = mapToMatchday(anchor);
          const amount = Number(row.reward_awarded) || 0;
          if (!amount) continue;
          if (!map[row.squad_id]) map[row.squad_id] = {};
          if (!map[row.squad_id][mdId]) map[row.squad_id][mdId] = { total: 0, bets: [] };
          map[row.squad_id][mdId].total += amount;
          map[row.squad_id][mdId].bets.push({ title: inst.title || 'Bet', amount });
        }
        setBetMap(map);
      } catch (e) {
        console.error('[RecapView] bet rewards load error:', e);
      }
    })();

    return () => { cancelled = true; };
  }, [leagueId, allMatchdays]);

  // ── Effect 1c: load accepted trade points sweeteners, mapped onto a matchday ─
  // points_sweetener moves from the proposer (gives points) to the target
  // (receives points) on accept. Mapped to a matchday the same way as bet
  // rewards (next deadline on/after resolved_at). Multiple trades within the
  // same matchday net out into a single TRADING line.
  useEffect(() => {
    if (!leagueId || !allMatchdays.length) return;
    let cancelled = false;

    (async () => {
      try {
        const { data: squadRows, error: sqErr } = await supabase
          .from('squads').select('id, user_id').eq('league_id', leagueId);
        if (cancelled || sqErr || !squadRows?.length) return;

        const latestByUser = {};
        squadRows.forEach(s => { if (!latestByUser[s.user_id]) latestByUser[s.user_id] = s.id; });
        const userBySquad = Object.fromEntries(squadRows.map(s => [s.id, s.user_id]));

        const { data: tradeRows, error: tradeErr } = await supabase
          .from('trade_proposals')
          .select('proposer_squad_id, target_squad_id, points_sweetener, resolved_at, created_at')
          .eq('league_id', leagueId)
          .eq('status', 'accepted')
          .gt('points_sweetener', 0);

        if (cancelled) return;
        if (tradeErr) { console.error('[RecapView] trade points:', tradeErr); return; }
        if (!tradeRows?.length) { setTradeMap({}); return; }

        const sortedMds = allMatchdays;
        const mapToMatchday = (anchorIso) => {
          const anchor = new Date(anchorIso).getTime();
          for (const md of sortedMds) {
            if (new Date(md.deadline_at).getTime() >= anchor) return md.matchday_id;
          }
          return sortedMds[sortedMds.length - 1].matchday_id;
        };

        const map = {};
        for (const row of tradeRows) {
          const amount = Number(row.points_sweetener) || 0;
          if (!amount) continue;
          const mdId = mapToMatchday(row.resolved_at ?? row.created_at);

          const giverSquad    = latestByUser[userBySquad[row.proposer_squad_id]];
          const receiverSquad = latestByUser[userBySquad[row.target_squad_id]];

          if (giverSquad) {
            if (!map[giverSquad]) map[giverSquad] = {};
            if (!map[giverSquad][mdId]) map[giverSquad][mdId] = { net: 0 };
            map[giverSquad][mdId].net -= amount;
          }
          if (receiverSquad) {
            if (!map[receiverSquad]) map[receiverSquad] = {};
            if (!map[receiverSquad][mdId]) map[receiverSquad][mdId] = { net: 0 };
            map[receiverSquad][mdId].net += amount;
          }
        }
        setTradeMap(map);
      } catch (e) {
        console.error('[RecapView] trade points load error:', e);
      }
    })();

    return () => { cancelled = true; };
  }, [leagueId, allMatchdays]);

  // ── Effect 2: load scores + fixtures when selectedMatchday changes ───────────
  // NOTE: members intentionally NOT in deps — it's display-only, not required for loading
  useEffect(() => {
    if (!leagueId || !selectedMatchday) return;
    let cancelled = false;
    setLoadingScores(true);
    setScores([]);
    setFixtures([]);
    setBreakdown({});
    setExpandedUser(null);

    (async () => {
      try {
        // Load squads for this league
        const { data: squadRows, error: sqErr } = await supabase
          .from('squads').select('id, user_id').eq('league_id', leagueId);
        if (cancelled) return;
        if (sqErr) { console.error('[RecapView] squads:', sqErr); setLoadingScores(false); return; }

        if (!squadRows?.length) { setLoadingScores(false); return; }

        // Deduplicate: one squad per user
        const latestByUser = {};
        squadRows.forEach(s => { if (!latestByUser[s.user_id]) latestByUser[s.user_id] = s.id; });
        const squadIds = Object.values(latestByUser);

        // Load fantasy points + fixtures in parallel
        const [{ data: fpRows, error: fpErr }, { data: fixRows }] = await Promise.all([
          supabase.from('fantasy_points').select('squad_id, total, points_breakdown')
            .in('squad_id', squadIds).eq('matchday_id', selectedMatchday),
          supabase.from('fixtures')
            .select('id, home_team, away_team, home_score, away_score, status, kickoff_at')
            .eq('matchday_id', selectedMatchday).order('kickoff_at', { ascending: true }),
        ]);
        if (cancelled) return;
        if (fpErr) console.error('[RecapView] fantasy_points:', fpErr);

        const fpMap      = Object.fromEntries((fpRows ?? []).map(r => [r.squad_id, Number(r.total)]));
        // transfer_penalty_deduction is stored in points_breakdown when > 0 (set at round completion)
        const penaltyMap = Object.fromEntries(
          (fpRows ?? [])
            .filter(r => (r.points_breakdown?.transfer_penalty_deduction ?? 0) > 0)
            .map(r => [r.squad_id, r.points_breakdown.transfer_penalty_deduction])
        );
        const userIdBySquad = Object.fromEntries(Object.entries(latestByUser).map(([uid, sid]) => [sid, uid]));

        const list = squadIds.map(sid => {
          const uid = userIdBySquad[sid];
          const rawPts = fpMap[sid];
          return {
            user_id:  uid,
            squad_id: sid,
            pts:      (rawPts !== undefined && !Number.isNaN(rawPts)) ? rawPts : null,
            penalty:  penaltyMap[sid] ?? 0,
          };
        }).sort((a, b) => (b.pts ?? -Infinity) - (a.pts ?? -Infinity));

        setScores(list);
        setFixtures(fixRows ?? []);
      } catch (e) {
        console.error('[RecapView] scores load error:', e);
      }
      if (!cancelled) setLoadingScores(false);
    })();

    return () => { cancelled = true; };
  }, [leagueId, selectedMatchday]);  // ← members excluded intentionally

  // ── Toggle player breakdown ─────────────────────────────────────────────────
  const toggleBreakdown = useCallback(async (userId) => {
    if (expandedUser === userId) { setExpandedUser(null); return; }
    setExpandedUser(userId);
    if (breakdown[userId] !== undefined) return;

    setBreakdown(prev => ({ ...prev, [userId]: 'loading' }));
    try {
      const fixtureIds = fixtures.map(f => f.id);
      if (!fixtureIds.length) { setBreakdown(prev => ({ ...prev, [userId]: [] })); return; }

      const { data: squadRow } = await supabase.from('squads')
        .select('id, players, starting_xi, captain_id, joker_player_id, is_triple_captain')
        .eq('league_id', leagueId).eq('user_id', userId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();

      if (!squadRow?.players) { setBreakdown(prev => ({ ...prev, [userId]: [] })); return; }
      // Use starting_xi when set; fall back to first 11 of players array
      const starters = (squadRow.starting_xi?.length ? squadRow.starting_xi : (squadRow.players || []).slice(0, 11));

      const [{ data: playerRows }, { data: statRows }] = await Promise.all([
        supabase.from('players').select('id, name, position').in('id', starters),
        supabase.from('player_match_stats')
          .select('player_id, fantasy_points, goals, assists, minutes_played, yellow_cards, red_cards, saves, key_passes, shots_on_target, big_chances_created')
          .in('player_id', starters).in('fixture_id', fixtureIds),
      ]);

      const playerMeta = Object.fromEntries((playerRows || []).map(p => [p.id, p]));
      const statsByPlayer = {};
      for (const r of statRows || []) {
        if (!statsByPlayer[r.player_id]) statsByPlayer[r.player_id] = { pts: 0, goals: 0, assists: 0, minutes: 0, yellow: 0, red: 0, saves: 0, keyPasses: 0, sot: 0, bigChances: 0 };
        const s = statsByPlayer[r.player_id];
        s.pts       += r.fantasy_points      ?? 0;
        s.goals     += r.goals               ?? 0;
        s.assists   += r.assists             ?? 0;
        s.minutes   += r.minutes_played      ?? 0;
        s.yellow    += r.yellow_cards        ?? 0;
        s.red       += r.red_cards           ?? 0;
        s.saves     += r.saves               ?? 0;
        s.keyPasses += r.key_passes          ?? 0;
        s.sot       += r.shots_on_target     ?? 0;
        s.bigChances += r.big_chances_created ?? 0;
      }

      const rows = starters.map(pid => {
        const meta  = playerMeta[pid] || { name: pid, position: '?' };
        const stats = statsByPlayer[pid];
        return {
          id: pid, name: meta.name, position: meta.position,
          pts:       stats?.pts ?? null,
          goals:     stats?.goals     ?? 0, assists:    stats?.assists    ?? 0,
          minutes:   stats?.minutes   ?? 0, yellow:     stats?.yellow     ?? 0,
          red:       stats?.red       ?? 0, saves:      stats?.saves      ?? 0,
          keyPasses: stats?.keyPasses ?? 0, sot:        stats?.sot        ?? 0,
          bigChances: stats?.bigChances ?? 0,
          captain: pid === squadRow.captain_id,
          triple:  pid === squadRow.captain_id && squadRow.is_triple_captain,
          joker:   pid === squadRow.joker_player_id,
          hasStats: !!stats,
        };
      });
      setBreakdown(prev => ({ ...prev, [userId]: rows }));
    } catch (e) {
      console.error('[RecapView] breakdown error:', e);
      setBreakdown(prev => ({ ...prev, [userId]: [] }));
    }
  }, [expandedUser, breakdown, fixtures, leagueId]);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const roundNum      = selectedMatchday ? String(selectedMatchday).replace(/^.*-r/, '') : '—';
  const isLiveRound   = allMatchdays.find(md => md.matchday_id === selectedMatchday)?.isLive ?? false;
  const roundLabel    = selectedMatchday ? `GW ${roundNum}${isLiveRound ? ' · IN PROGRESS' : ''}` : '—';
  const hasScores     = scores.some(s => s.pts !== null);
  const loading       = loadingMds || loadingScores;

  // Resolve username from members (display-only, doesn't affect data loading)
  const memberMap = {};
  (members || []).forEach(m => { memberMap[m.user_id] = m; });
  function nameFor(userId) {
    if (currentUser && userId === currentUser.id) return 'You';
    return memberMap[userId]?.users?.username || 'Unknown';
  }

  // ── Score row renderer ───────────────────────────────────────────────────────
  function renderScoreRow(s, idx, desktop) {
    const name  = nameFor(s.user_id);
    const hue   = mgrHue(name === 'You' ? (memberMap[s.user_id]?.users?.username || '') : name);
    const isMe  = currentUser && s.user_id === currentUser.id;
    const isTop = idx === 0 && s.pts !== null;
    const isOpen = expandedUser === s.user_id;
    const totalPts = memberMap[s.user_id]?.total_points ?? null;
    const betEntry = betMap[s.squad_id]?.[selectedMatchday];
    const betPts = betEntry?.total ?? 0;
    const tradeNet = tradeMap[s.squad_id]?.[selectedMatchday]?.net ?? 0;

    const rowStyle = {
      display: 'grid',
      gridTemplateColumns: desktop ? (h2hEnabled ? '40px 1fr 80px 80px 60px 24px' : '40px 1fr 80px 80px 24px') : '28px auto 1fr auto',
      gap: desktop ? 12 : 10,
      alignItems: 'center',
      padding: desktop ? '11px 24px' : '10px 18px',
      borderBottom: isOpen ? 'none' : '1px solid var(--rule)',
      borderLeft: isMe ? '2px solid var(--cyan)' : isTop ? '2px solid var(--gold)' : '2px solid transparent',
      background: isMe ? 'rgba(0,180,216,.04)' : isTop ? 'rgba(240,180,0,.02)' : 'transparent',
      cursor: 'pointer',
    };

    return (
      <div key={s.user_id}>
        {desktop ? (
          <div onClick={() => toggleBreakdown(s.user_id)} style={rowStyle}>
            <div style={{ fontFamily: DISPLAY, fontSize: 13, color: isTop ? 'var(--gold)' : 'var(--mute)' }}>{idx + 1}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <MgrTag mono={mgrMono(name)} hue={hue} />
              <span style={{ fontFamily: DISPLAY, fontSize: 13, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
              {isTop && <span style={{ fontFamily: MONO, fontSize: 8, background: 'var(--gold)', color: 'var(--ink)', padding: '1px 4px', letterSpacing: '.1em', flexShrink: 0 }}>TOP</span>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontFamily: DISPLAY, fontSize: 14, color: isTop ? 'var(--gold)' : 'var(--paper)' }}>
                {s.pts !== null ? (isLiveRound ? '~' : '') + Math.round(s.pts) : '—'}
              </span>
              {betPts > 0 && (
                <div style={{ fontFamily: MONO, fontSize: 7, color: 'var(--gold)', letterSpacing: '.12em', marginTop: 1 }}>+{betPts} BET</div>
              )}
              {tradeNet !== 0 && (
                <div style={{ fontFamily: MONO, fontSize: 7, color: tradeNet > 0 ? 'var(--gold)' : 'var(--danger)', letterSpacing: '.12em', marginTop: 1 }}>
                  {tradeNet > 0 ? `+${tradeNet}` : `−${Math.abs(tradeNet)}`} TRADING
                </div>
              )}
              {s.penalty > 0 ? (
                <div style={{ fontFamily: MONO, fontSize: 7, color: 'var(--danger)', letterSpacing: '.12em', marginTop: 1 }}>−{s.penalty} PENALTY</div>
              ) : isLiveRound && s.pts !== null ? (
                <div style={{ fontFamily: MONO, fontSize: 7, color: 'var(--danger)', letterSpacing: '.14em', marginTop: 1 }}>LIVE</div>
              ) : null}
            </div>
            <div style={{ textAlign: 'right', fontFamily: MONO, fontSize: 11, color: 'var(--mute)' }}>
              {totalPts != null ? Math.round(totalPts) : '—'}
            </div>
            {h2hEnabled && (
              <div style={{ textAlign: 'right', fontFamily: MONO, fontSize: 11, color: 'var(--gold)' }}>
                {h2hMap[s.user_id] ?? '—'}
              </div>
            )}
            <div style={{ textAlign: 'right', fontFamily: MONO, fontSize: 12, color: 'var(--mute)' }}>{isOpen ? '−' : '+'}</div>
          </div>
        ) : (
          <div onClick={() => toggleBreakdown(s.user_id)} style={rowStyle}>
            <span style={{ fontFamily: DISPLAY, fontSize: 13, color: isTop ? 'var(--gold)' : 'var(--mute)' }}>{idx + 1}</span>
            <MgrTag mono={mgrMono(name)} hue={hue} size={20} />
            <div style={{ minWidth: 0 }}>
              <span style={{ fontFamily: DISPLAY, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{name}</span>
              <span style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.12em' }}>
                TOTAL {totalPts !== null ? Math.round(totalPts) : '—'}{h2hEnabled ? ` · H2H ${h2hMap[s.user_id] ?? '—'}` : ''} · TAP FOR BREAKDOWN
              </span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: DISPLAY, fontSize: 16, color: isTop ? 'var(--gold)' : 'var(--paper)' }}>
                {s.pts !== null ? (isLiveRound ? '~' : '') + Math.round(s.pts) : '—'}
              </div>
              {betPts > 0 && (
                <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.12em', color: 'var(--gold)' }}>+{betPts} BET</div>
              )}
              {tradeNet !== 0 && (
                <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.12em', color: tradeNet > 0 ? 'var(--gold)' : 'var(--danger)' }}>
                  {tradeNet > 0 ? `+${tradeNet}` : `−${Math.abs(tradeNet)}`} TRADING
                </div>
              )}
              <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.12em', color: s.penalty > 0 ? 'var(--danger)' : isLiveRound && s.pts !== null ? 'var(--danger)' : 'var(--mute)' }}>
                {s.penalty > 0 ? `−${s.penalty} XFER` : isLiveRound && s.pts !== null ? 'LIVE' : 'GW'}
              </div>
            </div>
          </div>
        )}
        {isOpen && <PlayerBreakdown breakdown={breakdown[s.user_id]} penaltyDeduction={s.penalty ?? 0} betDetails={betEntry?.bets ?? []} tradeNet={tradeNet} />}
        {isOpen && <div style={{ height: 1, background: 'var(--rule)' }} />}
      </div>
    );
  }

  // ── Early returns ────────────────────────────────────────────────────────────
  if (loadingMds) return (
    <div style={{ padding: '48px 24px', textAlign: 'center' }}>
      <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.2em' }}>LOADING RECAP…</div>
    </div>
  );

  if (!allMatchdays.length) return (
    <div style={{ padding: '48px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 28, marginBottom: 12 }}>📋</div>
      <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--mute)', letterSpacing: '.18em', marginBottom: 8 }}>NO COMPLETED MATCHDAY</div>
      <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 12, color: 'var(--mute)', opacity: 0.7, lineHeight: 1.5, maxWidth: 280, margin: '0 auto' }}>
        The recap will appear once the first matchday deadline passes and scores are calculated.
      </div>
    </div>
  );

  // ── Desktop ──────────────────────────────────────────────────────────────────
  if (!isMobile) return (
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 380px', minHeight: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--rule)', minHeight: 0 }}>
        <HubSectionLabel
          label={`RECAP · ${roundLabel}`}
          sub="MATCHDAY SCORES"
          tone="var(--gold)"
          right={<span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)' }}>CLICK ROW FOR BREAKDOWN</span>}
        />
        <MatchdayNav allMatchdays={allMatchdays} selected={selectedMatchday} onSelect={setSelectedMatchday} />
        <div style={{ display: 'grid', gridTemplateColumns: h2hEnabled ? '40px 1fr 80px 80px 60px 24px' : '40px 1fr 80px 80px 24px', gap: 12, padding: '10px 24px', borderBottom: '1px solid var(--rule)', flexShrink: 0 }}>
          {(h2hEnabled ? ['GW#', 'MANAGER', 'GW PTS', 'TOTAL', 'H2H', ''] : ['GW#', 'MANAGER', 'GW PTS', 'TOTAL', '']).map((h, i) => (
            <div key={i} style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', textAlign: i >= 2 ? 'right' : 'left' }}>{h}</div>
          ))}
        </div>
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.2em' }}>LOADING…</span>
          </div>
        ) : !hasScores ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', gap: 8 }}>
            <div style={{ fontSize: 28 }}>⏳</div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.2em' }}>SCORES PENDING</div>
            <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 11, color: 'var(--mute)', opacity: 0.6, textAlign: 'center', lineHeight: 1.5 }}>
              Points are calculated after each match completes.
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, overflow: 'auto' }}>
            {scores.map((s, idx) => renderScoreRow(s, idx, true))}
          </div>
        )}
      </div>
      <aside style={{ display: 'flex', flexDirection: 'column', background: 'var(--ink-2)', overflow: 'auto' }}>
        <HubSectionLabel label="FIXTURES" sub={roundLabel} tone="var(--cyan)" />
        {!fixtures.length
          ? <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}><span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.2em' }}>NO FIXTURES</span></div>
          : fixtures.map(f => <FixtureRow key={f.id} f={f} />)
        }
      </aside>
    </div>
  );

  // ── Mobile ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      <MobSection label={`RECAP · ${roundLabel}`} tone="var(--gold)" right={<span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)' }}>GW SCORES</span>} />
      <MatchdayNav allMatchdays={allMatchdays} selected={selectedMatchday} onSelect={setSelectedMatchday} mobile />

      {loading ? (
        <div style={{ padding: '32px 18px', textAlign: 'center' }}>
          <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.2em' }}>LOADING…</span>
        </div>
      ) : !hasScores ? (
        <div style={{ padding: '32px 18px', textAlign: 'center' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.2em', marginBottom: 6 }}>SCORES PENDING</div>
          <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 11, color: 'var(--mute)', opacity: 0.6, lineHeight: 1.5 }}>
            Points are calculated after each match completes.
          </div>
        </div>
      ) : (
        scores.map((s, idx) => renderScoreRow(s, idx, false))
      )}

      {fixtures.length > 0 && (
        <>
          <MobSection label="FIXTURES" sub={roundLabel} tone="var(--cyan)" />
          {fixtures.map(f => <FixtureRow key={f.id} f={f} />)}
        </>
      )}
      <div style={{ height: 32 }} />
    </div>
  );
}
