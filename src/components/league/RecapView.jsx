import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { MONO, DISPLAY, mgrHue, mgrMono } from './HubConstants';
import { MgrTag, HubSectionLabel, MobSection } from './HubShared';

// ── Player breakdown fetcher ───────────────────────────────────────────────────
// Returns [{ name, position, pts, goals, assists, minutes, captain, joker }]
// sorted by starter slot (indices 0-10), bench omitted.
async function fetchPlayerBreakdown(leagueId, userId, fixtureIds) {
  if (!fixtureIds.length) return [];

  // Get the user's squad in this league
  const { data: squadRow } = await supabase
    .from('squads')
    .select('id, players, captain_id, joker_player_id, is_triple_captain')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!squadRow?.players) return [];
  const starters = (squadRow.players || []).slice(0, 11);
  if (!starters.length) return [];

  // Player names + positions
  const { data: playerRows } = await supabase
    .from('players')
    .select('id, name, position')
    .in('id', starters);

  const playerMeta = Object.fromEntries((playerRows || []).map(p => [p.id, p]));

  // Match stats for those players in this matchday's fixtures
  const { data: statRows } = await supabase
    .from('player_match_stats')
    .select('player_id, fantasy_points, goals, assists, minutes_played, clean_sheet, yellow_cards, red_cards, bonus_points')
    .in('player_id', starters)
    .in('fixture_id', fixtureIds);

  // Aggregate across fixtures (for multi-fixture matchdays)
  const statsByPlayer = {};
  for (const r of statRows || []) {
    if (!statsByPlayer[r.player_id]) {
      statsByPlayer[r.player_id] = { pts: 0, goals: 0, assists: 0, minutes: 0, cs: false, yellow: 0, red: 0, bonus: 0 };
    }
    const s = statsByPlayer[r.player_id];
    s.pts     += r.fantasy_points ?? 0;
    s.goals   += r.goals ?? 0;
    s.assists += r.assists ?? 0;
    s.minutes += r.minutes_played ?? 0;
    s.yellow  += r.yellow_cards ?? 0;
    s.red     += r.red_cards ?? 0;
    s.bonus   += r.bonus_points ?? 0;
    if (r.clean_sheet) s.cs = true;
  }

  return starters.map(pid => {
    const meta  = playerMeta[pid] || { name: pid, position: '?' };
    const stats = statsByPlayer[pid];
    let pts = stats?.pts ?? null;
    const isCaptain = pid === squadRow.captain_id;
    const isJoker   = pid === squadRow.joker_player_id;
    // Display the raw pts; multipliers already baked into fantasy_points total
    return {
      id:       pid,
      name:     meta.name,
      position: meta.position,
      pts,
      goals:    stats?.goals ?? 0,
      assists:  stats?.assists ?? 0,
      minutes:  stats?.minutes ?? 0,
      yellow:   stats?.yellow ?? 0,
      red:      stats?.red ?? 0,
      bonus:    stats?.bonus ?? 0,
      captain:  isCaptain,
      triple:   isCaptain && squadRow.is_triple_captain,
      joker:    isJoker,
      hasStats: !!stats,
    };
  });
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function RecapView({ leagueId, tournamentId, members, currentUser }) {
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
  const [loadingList,      setLoadingList]       = useState(true);
  const [loadingScores,    setLoadingScores]     = useState(false);

  // Breakdown state: userId → null | 'loading' | [playerRow]
  const [breakdown, setBreakdown] = useState({});
  const [expandedUser, setExpandedUser] = useState(null);

  // ── Load all past matchday deadlines, sorted by round number ────────────────
  useEffect(() => {
    if (!leagueId || !tournamentId) { setLoadingList(false); return; }
    let cancelled = false;
    (async () => {
      setLoadingList(true);
      const { data: rows } = await supabase
        .from('matchday_deadlines')
        .select('matchday_id, deadline_at')
        .eq('tournament_id', tournamentId)
        .lte('deadline_at', new Date().toISOString());

      if (!cancelled) {
        const list = (rows ?? []).sort((a, b) => {
          const na = parseInt(String(a.matchday_id).replace(/^.*-r/, ''), 10);
          const nb = parseInt(String(b.matchday_id).replace(/^.*-r/, ''), 10);
          return na - nb;
        });
        setAllMatchdays(list);
        if (list.length > 0) setSelectedMatchday(list[list.length - 1].matchday_id);
        setLoadingList(false);
      }
    })();
    return () => { cancelled = true; };
  }, [leagueId, tournamentId]);

  // ── Load scores + fixtures when selectedMatchday changes ────────────────────
  useEffect(() => {
    if (!leagueId || !selectedMatchday) return;
    let cancelled = false;
    setBreakdown({});
    setExpandedUser(null);

    (async () => {
      setLoadingScores(true);
      const { data: squadRows } = await supabase.from('squads').select('id, user_id').eq('league_id', leagueId);
      if (!squadRows?.length || cancelled) { setLoadingScores(false); return; }

      const latestByUser = {};
      squadRows.forEach(s => { if (!latestByUser[s.user_id]) latestByUser[s.user_id] = s.id; });
      const squadIds = Object.values(latestByUser);

      const [{ data: fpRows }, { data: fixRows }] = await Promise.all([
        supabase.from('fantasy_points').select('squad_id, total').in('squad_id', squadIds).eq('matchday_id', selectedMatchday),
        supabase.from('fixtures').select('id, home_team, away_team, home_score, away_score, status, kickoff_at').eq('matchday_id', selectedMatchday).order('kickoff_at', { ascending: true }),
      ]);

      if (cancelled) return;

      const fpMap = Object.fromEntries((fpRows ?? []).map(r => [r.squad_id, Number(r.total)]));
      const userIdBySquad = Object.fromEntries(Object.entries(latestByUser).map(([uid, sid]) => [sid, uid]));
      const memberMap = {};
      members.forEach(m => { memberMap[m.user_id] = m; });

      const list = squadIds.map(sid => {
        const uid = userIdBySquad[sid];
        const member = memberMap[uid];
        const username = (currentUser && uid === currentUser.id)
          ? 'You' : (member?.users?.username || 'Unknown');
        const hasPts = fpMap[sid] !== undefined && !Number.isNaN(fpMap[sid]);
        return { user_id: uid, squad_id: sid, username, pts: hasPts ? fpMap[sid] : null };
      }).sort((a, b) => (b.pts ?? -Infinity) - (a.pts ?? -Infinity));

      setScores(list);
      setFixtures(fixRows ?? []);
      setLoadingScores(false);
    })();
    return () => { cancelled = true; };
  }, [leagueId, selectedMatchday, members]);

  // ── Toggle player breakdown for a manager ───────────────────────────────────
  const toggleBreakdown = async (userId) => {
    if (expandedUser === userId) { setExpandedUser(null); return; }
    setExpandedUser(userId);
    if (breakdown[userId]) return; // already fetched

    setBreakdown(prev => ({ ...prev, [userId]: 'loading' }));
    const fixtureIds = fixtures.map(f => f.id);
    const rows = await fetchPlayerBreakdown(leagueId, userId, fixtureIds);
    setBreakdown(prev => ({ ...prev, [userId]: rows }));
  };

  const roundNum   = selectedMatchday ? String(selectedMatchday).replace(/^.*-r/, '') : '—';
  const roundLabel = selectedMatchday ? `GW ${roundNum}` : '—';
  const hasScores  = scores.some(s => s.pts !== null);
  const loading    = loadingList || loadingScores;

  // ── Shared: Matchday nav pills ───────────────────────────────────────────────
  function MatchdayNav({ mobile = false }) {
    if (allMatchdays.length <= 1) return null;
    const pad = mobile ? '8px 18px' : '8px 20px';
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: pad, borderBottom: '1px solid var(--rule)', background: 'var(--ink)', overflowX: 'auto', flexShrink: 0 }}>
        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--mute)', flexShrink: 0, marginRight: 4 }}>
          {mobile ? 'GW' : 'ROUND'}
        </span>
        {allMatchdays.map(md => {
          const n = String(md.matchday_id).replace(/^.*-r/, '');
          const active = md.matchday_id === selectedMatchday;
          return (
            <button key={md.matchday_id} onClick={() => setSelectedMatchday(md.matchday_id)} style={{
              padding: '4px 8px', flexShrink: 0,
              border: active ? '1px solid var(--cyan)' : '1px solid var(--rule)',
              background: active ? 'rgba(0,180,216,.12)' : 'transparent',
              color: active ? 'var(--cyan)' : 'var(--mute)',
              fontFamily: MONO, fontSize: 10, letterSpacing: '.12em', cursor: 'pointer',
            }}>{n}</button>
          );
        })}
      </div>
    );
  }

  // ── Shared: Player breakdown panel ──────────────────────────────────────────
  function PlayerBreakdown({ userId }) {
    const data = breakdown[userId];
    if (!data) return null;
    if (data === 'loading') return (
      <div style={{ padding: '10px 24px', fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.18em' }}>LOADING…</div>
    );
    if (!data.length) return (
      <div style={{ padding: '10px 24px', fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.18em' }}>NO SQUAD DATA</div>
    );
    return (
      <div style={{ borderTop: '1px solid var(--rule)', background: 'var(--ink-2)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 50px 60px', gap: 8, padding: '6px 24px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          {['POS', 'PLAYER', 'MIN', 'PTS'].map((h, i) => (
            <span key={i} style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.18em', textAlign: i >= 2 ? 'right' : 'left' }}>{h}</span>
          ))}
        </div>
        {data.map((p, i) => {
          const posColor = p.position === 'GK' ? 'var(--gold)' : p.position === 'DEF' ? 'var(--cyan)' : p.position === 'MID' ? 'var(--positive)' : 'var(--danger)';
          const badges = [];
          if (p.triple)   badges.push({ label: '3×C', color: 'var(--gold)' });
          else if (p.captain) badges.push({ label: '©', color: 'var(--gold)' });
          if (p.joker)    badges.push({ label: '2×', color: 'var(--purple)' });
          if (p.goals)    badges.push({ label: `⚽×${p.goals}`, color: 'var(--positive)' });
          if (p.assists)  badges.push({ label: `🅰×${p.assists}`, color: 'var(--cyan)' });
          if (p.yellow)   badges.push({ label: '🟨', color: 'var(--warn)' });
          if (p.red)      badges.push({ label: '🟥', color: 'var(--danger)' });
          if (p.bonus)    badges.push({ label: `+${p.bonus}B`, color: 'var(--mute)' });
          return (
            <div key={p.id} style={{
              display: 'grid', gridTemplateColumns: '28px 1fr 50px 60px', gap: 8,
              padding: '7px 24px', borderBottom: '1px solid rgba(255,255,255,0.04)',
              background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
            }}>
              <span style={{ fontFamily: MONO, fontSize: 9, color: posColor, letterSpacing: '.1em' }}>{p.position}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                <span style={{ fontFamily: DISPLAY, fontSize: 11, color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                {badges.map((b, bi) => (
                  <span key={bi} style={{ fontFamily: MONO, fontSize: 8, color: b.color, flexShrink: 0 }}>{b.label}</span>
                ))}
              </div>
              <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', textAlign: 'right' }}>
                {p.hasStats ? p.minutes : '—'}
              </span>
              <span style={{ fontFamily: DISPLAY, fontSize: 11, textAlign: 'right', color: p.pts !== null ? (p.pts > 0 ? 'var(--positive)' : p.pts < 0 ? 'var(--danger)' : 'var(--mute)') : 'var(--mute)' }}>
                {p.pts !== null ? Math.round(p.pts) : (p.hasStats ? '0' : '—')}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  // ── Shared: score row ────────────────────────────────────────────────────────
  function ScoreRow({ s, idx, desktop = true }) {
    const isMe  = currentUser && s.user_id === currentUser.id;
    const hue   = mgrHue(s.username === 'You' ? (members.find(m => m.user_id === currentUser?.id)?.users?.username || '') : s.username);
    const isTop = idx === 0 && s.pts !== null;
    const isOpen = expandedUser === s.user_id;
    const totalPts = members.find(m => m.user_id === s.user_id)?.total_points ?? null;

    if (desktop) {
      return (
        <>
          <div
            onClick={() => toggleBreakdown(s.user_id)}
            style={{
              display: 'grid', gridTemplateColumns: '40px 1fr 80px 80px 24px', gap: 12, alignItems: 'center',
              padding: '11px 24px', borderBottom: isOpen ? 'none' : '1px solid var(--rule)',
              borderLeft: isMe ? '2px solid var(--cyan)' : isTop ? '2px solid var(--gold)' : '2px solid transparent',
              background: isMe ? 'rgba(0,180,216,.04)' : isTop ? 'rgba(240,180,0,.02)' : 'transparent',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontFamily: DISPLAY, fontSize: 13, color: isTop ? 'var(--gold)' : 'var(--mute)' }}>{idx + 1}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <MgrTag mono={mgrMono(s.username)} hue={hue} />
              <span style={{ fontFamily: DISPLAY, fontSize: 13, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.username}</span>
              {isTop && <span style={{ fontFamily: MONO, fontSize: 8, background: 'var(--gold)', color: 'var(--ink)', padding: '1px 4px', letterSpacing: '.1em', flexShrink: 0 }}>TOP</span>}
            </div>
            <div style={{ textAlign: 'right', fontFamily: DISPLAY, fontSize: 14, color: isTop ? 'var(--gold)' : 'var(--paper)' }}>
              {s.pts !== null ? Math.round(s.pts) : '—'}
            </div>
            <div style={{ textAlign: 'right', fontFamily: MONO, fontSize: 11, color: 'var(--mute)' }}>
              {totalPts != null ? Math.round(totalPts) : '—'}
            </div>
            <div style={{ textAlign: 'right', fontFamily: MONO, fontSize: 11, color: 'var(--mute)' }}>
              {isOpen ? '−' : '+'}
            </div>
          </div>
          {isOpen && <PlayerBreakdown userId={s.user_id} />}
          {isOpen && <div style={{ height: 1, background: 'var(--rule)' }} />}
        </>
      );
    }

    // Mobile
    return (
      <>
        <div
          onClick={() => toggleBreakdown(s.user_id)}
          style={{
            display: 'grid', gridTemplateColumns: '28px auto 1fr auto', gap: 10, alignItems: 'center',
            padding: '10px 18px', borderBottom: isOpen ? 'none' : '1px solid var(--rule)',
            borderLeft: isMe ? '2px solid var(--cyan)' : isTop ? '2px solid var(--gold)' : '2px solid transparent',
            background: isMe ? 'rgba(0,180,216,.04)' : 'transparent',
            cursor: 'pointer',
          }}
        >
          <span style={{ fontFamily: DISPLAY, fontSize: 13, color: isTop ? 'var(--gold)' : 'var(--mute)' }}>{idx + 1}</span>
          <MgrTag mono={mgrMono(s.username)} hue={hue} size={20} />
          <div style={{ minWidth: 0 }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{s.username}</span>
            <span style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.12em' }}>TOTAL {totalPts !== null ? Math.round(totalPts) : '—'} · TAP FOR BREAKDOWN</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: DISPLAY, fontSize: 16, color: isTop ? 'var(--gold)' : 'var(--paper)' }}>{s.pts !== null ? Math.round(s.pts) : '—'}</div>
            <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.12em' }}>GW</div>
          </div>
        </div>
        {isOpen && (
          <div style={{ padding: '0 4px 4px' }}>
            <PlayerBreakdown userId={s.user_id} />
          </div>
        )}
        {isOpen && <div style={{ height: 1, background: 'var(--rule)' }} />}
      </>
    );
  }

  // ── Early returns ────────────────────────────────────────────────────────────
  if (loadingList) return (
    <div style={{ padding: '48px 24px', textAlign: 'center' }}>
      <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.2em' }}>LOADING RECAP…</div>
    </div>
  );

  if (allMatchdays.length === 0) return (
    <div style={{ padding: '48px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 28, marginBottom: 12 }}>📋</div>
      <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--mute)', letterSpacing: '.18em', marginBottom: 8 }}>NO COMPLETED MATCHDAY</div>
      <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 12, color: 'var(--mute)', opacity: 0.7, lineHeight: 1.5, maxWidth: 280, margin: '0 auto' }}>
        The recap will be available once the first matchday deadline passes and scores are calculated.
      </div>
    </div>
  );

  // ── Fixture card ─────────────────────────────────────────────────────────────
  function FixtureCard({ f }) {
    const finished = f.status === 'finished';
    const live = f.status === 'live' || f.status === 'in_progress';
    const ko = f.kickoff_at ? new Date(f.kickoff_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
    return (
      <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--rule)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--paper)', flex: 1, textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.home_team}</span>
          <span style={{ fontFamily: DISPLAY, fontSize: 13, minWidth: 52, textAlign: 'center', color: finished ? 'var(--paper)' : live ? 'var(--danger)' : 'var(--mute)' }}>
            {finished || live ? `${f.home_score ?? '–'} – ${f.away_score ?? '–'}` : ko}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--paper)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.away_team}</span>
        </div>
        {live && <div style={{ textAlign: 'center', marginTop: 3 }}><span style={{ fontFamily: MONO, fontSize: 8, color: 'var(--danger)', letterSpacing: '.18em' }}>● LIVE</span></div>}
        {finished && <div style={{ textAlign: 'center', marginTop: 3 }}><span style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.14em' }}>FT</span></div>}
      </div>
    );
  }

  // ── Desktop ──────────────────────────────────────────────────────────────────
  if (!isMobile) return (
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 380px', minHeight: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--rule)', minHeight: 0 }}>
        <HubSectionLabel
          label={`RECAP · ${roundLabel}`}
          sub="MATCHDAY SCORES"
          tone="var(--gold)"
          right={<span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)' }}>CLICK ROW FOR PLAYER BREAKDOWN</span>}
        />
        <MatchdayNav />
        <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 80px 80px 24px', gap: 12, padding: '10px 24px', borderBottom: '1px solid var(--rule)', flexShrink: 0 }}>
          {['GW#', 'MANAGER', 'GW PTS', 'TOTAL', ''].map((h, i) => (
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
            {scores.map((s, idx) => <ScoreRow key={s.user_id} s={s} idx={idx} desktop={true} />)}
          </div>
        )}
      </div>
      <aside style={{ display: 'flex', flexDirection: 'column', background: 'var(--ink-2)', overflow: 'auto' }}>
        <HubSectionLabel label="FIXTURES" sub={roundLabel} tone="var(--cyan)" />
        {fixtures.length === 0
          ? <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}><span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.2em' }}>NO FIXTURES</span></div>
          : fixtures.map(f => <FixtureCard key={f.id} f={f} />)
        }
      </aside>
    </div>
  );

  // ── Mobile ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      <MobSection label={`RECAP · ${roundLabel}`} tone="var(--gold)" right={<span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)' }}>GW SCORES</span>} />
      <MatchdayNav mobile />
      {loading ? (
        <div style={{ padding: '32px 18px', textAlign: 'center' }}>
          <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.2em' }}>LOADING…</span>
        </div>
      ) : !hasScores ? (
        <div style={{ padding: '32px 18px', textAlign: 'center' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.2em', marginBottom: 6 }}>SCORES PENDING</div>
          <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 11, color: 'var(--mute)', opacity: 0.6, lineHeight: 1.5 }}>Points are calculated after each match completes.</div>
        </div>
      ) : (
        scores.map((s, idx) => <ScoreRow key={s.user_id} s={s} idx={idx} desktop={false} />)
      )}
      {fixtures.length > 0 && (
        <>
          <MobSection label="FIXTURES" sub={roundLabel} tone="var(--cyan)" />
          {fixtures.map(f => <FixtureCard key={f.id} f={f} />)}
        </>
      )}
      <div style={{ height: 32 }} />
    </div>
  );
}
