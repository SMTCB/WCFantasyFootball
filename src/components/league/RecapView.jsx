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
        return (
          <button key={md.matchday_id} onClick={() => onSelect(md.matchday_id)} style={{
            padding: '4px 9px', flexShrink: 0,
            border: active ? '1px solid var(--cyan)' : '1px solid var(--rule)',
            background: active ? 'rgba(0,180,216,.14)' : 'transparent',
            color: active ? 'var(--cyan)' : 'var(--mute)',
            fontFamily: MONO, fontSize: 10, letterSpacing: '.12em', cursor: 'pointer',
          }}>{n}</button>
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

function PlayerBreakdown({ breakdown }) {
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

    supabase
      .from('matchday_deadlines')
      .select('matchday_id, deadline_at')
      .eq('tournament_id', tournamentId)
      .lte('deadline_at', new Date().toISOString())
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { console.error('[RecapView] matchday load:', error); setLoadingMds(false); return; }
        const sorted = (data ?? []).sort((a, b) => {
          const na = parseInt(String(a.matchday_id).replace(/^.*-r/, ''), 10);
          const nb = parseInt(String(b.matchday_id).replace(/^.*-r/, ''), 10);
          return na - nb;
        });
        setAllMatchdays(sorted);
        if (sorted.length > 0) setSelectedMatchday(sorted[sorted.length - 1].matchday_id);
        setLoadingMds(false);
      });

    return () => { cancelled = true; };
  }, [leagueId, tournamentId]);

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
          supabase.from('fantasy_points').select('squad_id, total')
            .in('squad_id', squadIds).eq('matchday_id', selectedMatchday),
          supabase.from('fixtures')
            .select('id, home_team, away_team, home_score, away_score, status, kickoff_at')
            .eq('matchday_id', selectedMatchday).order('kickoff_at', { ascending: true }),
        ]);
        if (cancelled) return;
        if (fpErr) console.error('[RecapView] fantasy_points:', fpErr);

        const fpMap = Object.fromEntries((fpRows ?? []).map(r => [r.squad_id, Number(r.total)]));
        const userIdBySquad = Object.fromEntries(Object.entries(latestByUser).map(([uid, sid]) => [sid, uid]));

        const list = squadIds.map(sid => {
          const uid = userIdBySquad[sid];
          const rawPts = fpMap[sid];
          return {
            user_id:  uid,
            squad_id: sid,
            pts:      (rawPts !== undefined && !Number.isNaN(rawPts)) ? rawPts : null,
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
        .select('id, players, captain_id, joker_player_id, is_triple_captain')
        .eq('league_id', leagueId).eq('user_id', userId)
        .order('created_at', { ascending: true }).limit(1).maybeSingle();

      if (!squadRow?.players) { setBreakdown(prev => ({ ...prev, [userId]: [] })); return; }
      const starters = (squadRow.players || []).slice(0, 11);

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
  const roundNum   = selectedMatchday ? String(selectedMatchday).replace(/^.*-r/, '') : '—';
  const roundLabel = selectedMatchday ? `GW ${roundNum}` : '—';
  const hasScores  = scores.some(s => s.pts !== null);
  const loading    = loadingMds || loadingScores;

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
            <div style={{ textAlign: 'right', fontFamily: DISPLAY, fontSize: 14, color: isTop ? 'var(--gold)' : 'var(--paper)' }}>
              {s.pts !== null ? Math.round(s.pts) : '—'}
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
                {s.pts !== null ? Math.round(s.pts) : '—'}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.12em' }}>GW</div>
            </div>
          </div>
        )}
        {isOpen && <PlayerBreakdown breakdown={breakdown[s.user_id]} />}
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
