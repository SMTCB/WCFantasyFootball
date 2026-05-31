import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { MONO, DISPLAY, mgrHue, mgrMono } from './HubConstants';
import { MgrTag, HubSectionLabel, MobSection } from './HubShared';

export default function RecapView({ leagueId, tournamentId, members, currentUser }) {
  const [allMatchdays,     setAllMatchdays]     = useState([]); // [{matchday_id, deadline_at}] past→present
  const [selectedMatchday, setSelectedMatchday] = useState(null);
  const [scores,           setScores]           = useState([]);
  const [fixtures,         setFixtures]         = useState([]);
  const [loadingList,      setLoadingList]       = useState(true);
  const [loadingScores,    setLoadingScores]     = useState(false);

  // ── Step 1: load all past matchday deadlines for this tournament ────────────
  useEffect(() => {
    if (!leagueId || !tournamentId) { setLoadingList(false); return; }
    let cancelled = false;

    (async () => {
      setLoadingList(true);
      const { data: rows } = await supabase
        .from('matchday_deadlines')
        .select('matchday_id, deadline_at')
        .eq('tournament_id', tournamentId)
        .lte('deadline_at', new Date().toISOString())
        .order('deadline_at', { ascending: true });

      if (!cancelled) {
        const list = rows ?? [];
        setAllMatchdays(list);
        // Default to the latest (last in ascending order)
        if (list.length > 0) setSelectedMatchday(list[list.length - 1].matchday_id);
        setLoadingList(false);
      }
    })();

    return () => { cancelled = true; };
  }, [leagueId, tournamentId]);

  // ── Step 2: load scores + fixtures whenever selectedMatchday changes ────────
  useEffect(() => {
    if (!leagueId || !selectedMatchday) return;
    let cancelled = false;

    (async () => {
      setLoadingScores(true);

      // Squads in this league
      const { data: squadRows } = await supabase
        .from('squads')
        .select('id, user_id')
        .eq('league_id', leagueId);

      if (!squadRows?.length || cancelled) { setLoadingScores(false); return; }

      // One squad per user (first created wins — consistent ordering)
      const latestByUser = {};
      squadRows.forEach(s => { if (!latestByUser[s.user_id]) latestByUser[s.user_id] = s.id; });
      const squadIds = Object.values(latestByUser);

      // Fantasy points — column is "total", not "total_points"
      const { data: fpRows } = await supabase
        .from('fantasy_points')
        .select('squad_id, total')
        .in('squad_id', squadIds)
        .eq('matchday_id', selectedMatchday);

      // Fixtures for this matchday
      const { data: fixRows } = await supabase
        .from('fixtures')
        .select('id, home_team, away_team, home_score, away_score, status, kickoff_at')
        .eq('matchday_id', selectedMatchday)
        .order('kickoff_at', { ascending: true });

      if (cancelled) return;

      const fpMap = Object.fromEntries((fpRows ?? []).map(r => [r.squad_id, Number(r.total)]));
      const userIdBySquad = Object.fromEntries(Object.entries(latestByUser).map(([uid, sid]) => [sid, uid]));
      const memberMap = {};
      members.forEach(m => { memberMap[m.user_id] = m; });

      const list = squadIds.map(sid => {
        const uid = userIdBySquad[sid];
        const member = memberMap[uid];
        const username = (currentUser && uid === currentUser.id)
          ? 'You'
          : (member?.users?.username || 'Unknown');
        const hasPts = fpMap[sid] !== undefined && !Number.isNaN(fpMap[sid]);
        return {
          user_id:  uid,
          squad_id: sid,
          username,
          pts:      hasPts ? fpMap[sid] : null,
          rank:     member?.rank ?? null,
        };
      }).sort((a, b) => (b.pts ?? -Infinity) - (a.pts ?? -Infinity));

      setScores(list);
      setFixtures(fixRows ?? []);
      setLoadingScores(false);
    })();

    return () => { cancelled = true; };
  }, [leagueId, selectedMatchday, members]);

  const roundNum   = selectedMatchday ? String(selectedMatchday).replace(/^.*-r/, '') : '—';
  const roundLabel = selectedMatchday ? `GW ${roundNum}` : '—';
  const hasScores  = scores.some(s => s.pts !== null);
  const loading    = loadingList || loadingScores;

  // ── Matchday nav pill row ───────────────────────────────────────────────────
  function MatchdayNav() {
    if (allMatchdays.length <= 1) return null;
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4, padding: '8px 20px',
        borderBottom: '1px solid var(--rule)', background: 'var(--ink)',
        overflowX: 'auto', flexShrink: 0,
      }}>
        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--mute)', flexShrink: 0, marginRight: 4 }}>ROUND</span>
        {allMatchdays.map(md => {
          const n = String(md.matchday_id).replace(/^.*-r/, '');
          const active = md.matchday_id === selectedMatchday;
          return (
            <button
              key={md.matchday_id}
              onClick={() => setSelectedMatchday(md.matchday_id)}
              style={{
                padding: '4px 8px',
                border: active ? '1px solid var(--cyan)' : '1px solid var(--rule)',
                background: active ? 'rgba(0,180,216,.12)' : 'transparent',
                color: active ? 'var(--cyan)' : 'var(--mute)',
                fontFamily: MONO, fontSize: 10, letterSpacing: '.12em',
                cursor: 'pointer', flexShrink: 0,
              }}
            >
              {n}
            </button>
          );
        })}
      </div>
    );
  }

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

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>

      {/* ── Desktop layout ─────────────────────────────────────────────── */}
      <div className="hidden lg:grid" style={{ flex: 1, gridTemplateColumns: '1fr 380px', minHeight: 0 }}>

        {/* Left: matchday scores */}
        <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--rule)', minHeight: 0 }}>
          <HubSectionLabel
            label={`RECAP · ${roundLabel}`}
            sub="MATCHDAY SCORES"
            tone="var(--gold)"
            right={<span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)' }}>SORTED BY GW PTS</span>}
          />
          <MatchdayNav />

          {/* Header row */}
          <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 80px 80px', gap: 12, padding: '10px 24px', borderBottom: '1px solid var(--rule)', color: 'var(--mute)', flexShrink: 0 }}>
            {['GW#', 'MANAGER', 'GW PTS', 'TOTAL'].map((h, i) => (
              <div key={i} style={{ fontFamily: MONO, fontSize: 9, textAlign: i >= 2 ? 'right' : 'left' }}>{h}</div>
            ))}
          </div>

          {loading ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.2em' }}>LOADING…</div>
            </div>
          ) : !hasScores ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', gap: 8 }}>
              <div style={{ fontSize: 28 }}>⏳</div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.2em' }}>SCORES PENDING</div>
              <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 11, color: 'var(--mute)', opacity: 0.6, textAlign: 'center', lineHeight: 1.5 }}>
                Points are calculated after each match completes. Check back after the final whistle.
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, overflow: 'auto' }}>
              {scores.map((s, idx) => {
                const isMe = currentUser && s.user_id === currentUser.id;
                const hue = mgrHue(s.username === 'You' ? (members.find(m => m.user_id === currentUser?.id)?.users?.username || '') : s.username);
                const isTop = idx === 0 && s.pts !== null;
                return (
                  <div key={s.user_id} style={{
                    display: 'grid', gridTemplateColumns: '40px 1fr 80px 80px', gap: 12, alignItems: 'center',
                    padding: '12px 24px', borderBottom: '1px solid var(--rule)',
                    borderLeft: isMe ? '2px solid var(--cyan)' : isTop ? '2px solid var(--gold)' : '2px solid transparent',
                    background: isMe ? 'rgba(0,180,216,.04)' : isTop ? 'rgba(240,180,0,.03)' : 'transparent',
                  }}>
                    <div style={{ fontFamily: DISPLAY, fontSize: 13, color: isTop ? 'var(--gold)' : 'var(--mute)' }}>
                      {idx + 1}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <MgrTag mono={mgrMono(s.username)} hue={hue} />
                      <span style={{ fontFamily: DISPLAY, fontSize: 13, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.username}</span>
                      {isTop && <span style={{ fontFamily: MONO, fontSize: 8, background: 'var(--gold)', color: 'var(--ink)', padding: '1px 4px', letterSpacing: '.1em', flexShrink: 0 }}>TOP</span>}
                    </div>
                    <div style={{ textAlign: 'right', fontFamily: DISPLAY, fontSize: 14, color: isTop ? 'var(--gold)' : 'var(--paper)' }}>
                      {s.pts !== null ? Math.round(s.pts) : '—'}
                    </div>
                    <div style={{ textAlign: 'right', fontFamily: MONO, fontSize: 11, color: 'var(--mute)' }}>
                      {members.find(m => m.user_id === s.user_id)?.total_points != null
                        ? Math.round(members.find(m => m.user_id === s.user_id).total_points)
                        : '—'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: fixtures */}
        <aside style={{ display: 'flex', flexDirection: 'column', background: 'var(--ink-2)', overflow: 'auto' }}>
          <HubSectionLabel label="FIXTURES" sub={roundLabel} tone="var(--cyan)" />
          {fixtures.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
              <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.2em' }}>NO FIXTURES</div>
            </div>
          ) : fixtures.map(f => {
            const finished = f.status === 'finished';
            const live = f.status === 'live' || f.status === 'in_progress';
            const ko = f.kickoff_at ? new Date(f.kickoff_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
            return (
              <div key={f.id} style={{ padding: '10px 18px', borderBottom: '1px solid var(--rule)' }}>
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
          })}
        </aside>
      </div>

      {/* ── Mobile layout ──────────────────────────────────────────────── */}
      <div className="lg:hidden" style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <MobSection label={`RECAP · ${roundLabel}`} tone="var(--gold)" right={<span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)' }}>GW SCORES</span>} />

        {/* Mobile matchday nav */}
        {allMatchdays.length > 1 && (
          <div style={{ display: 'flex', gap: 4, padding: '8px 18px', borderBottom: '1px solid var(--rule)', overflowX: 'auto' }}>
            <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', color: 'var(--mute)', flexShrink: 0, alignSelf: 'center', marginRight: 4 }}>GW</span>
            {allMatchdays.map(md => {
              const n = String(md.matchday_id).replace(/^.*-r/, '');
              const active = md.matchday_id === selectedMatchday;
              return (
                <button key={md.matchday_id} onClick={() => setSelectedMatchday(md.matchday_id)} style={{
                  padding: '4px 8px', flexShrink: 0,
                  border: active ? '1px solid var(--cyan)' : '1px solid var(--rule)',
                  background: active ? 'rgba(0,180,216,.12)' : 'transparent',
                  color: active ? 'var(--cyan)' : 'var(--mute)',
                  fontFamily: MONO, fontSize: 10, cursor: 'pointer',
                }}>
                  {n}
                </button>
              );
            })}
          </div>
        )}

        {loading ? (
          <div style={{ padding: '32px 18px', textAlign: 'center' }}>
            <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.2em' }}>LOADING…</div>
          </div>
        ) : !hasScores ? (
          <div style={{ padding: '32px 18px', textAlign: 'center' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.2em', marginBottom: 6 }}>SCORES PENDING</div>
            <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 11, color: 'var(--mute)', opacity: 0.6, lineHeight: 1.5 }}>
              Points are calculated after each match completes.
            </div>
          </div>
        ) : scores.map((s, idx) => {
          const isMe = currentUser && s.user_id === currentUser.id;
          const hue = mgrHue(s.username === 'You' ? (members.find(m => m.user_id === currentUser?.id)?.users?.username || '') : s.username);
          const isTop = idx === 0 && s.pts !== null;
          const totalPts = members.find(m => m.user_id === s.user_id)?.total_points ?? null;
          return (
            <div key={s.user_id} style={{
              display: 'grid', gridTemplateColumns: '28px auto 1fr auto', gap: 10, alignItems: 'center',
              padding: '10px 18px', borderBottom: '1px solid var(--rule)',
              borderLeft: isMe ? '2px solid var(--cyan)' : isTop ? '2px solid var(--gold)' : '2px solid transparent',
              background: isMe ? 'rgba(0,180,216,.04)' : 'transparent',
            }}>
              <span style={{ fontFamily: DISPLAY, fontSize: 13, color: isTop ? 'var(--gold)' : 'var(--mute)' }}>{idx + 1}</span>
              <MgrTag mono={mgrMono(s.username)} hue={hue} size={20} />
              <div style={{ minWidth: 0 }}>
                <span style={{ fontFamily: DISPLAY, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{s.username}</span>
                <span style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.12em' }}>TOTAL {totalPts !== null ? Math.round(totalPts) : '—'}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: DISPLAY, fontSize: 16, color: isTop ? 'var(--gold)' : 'var(--paper)' }}>{s.pts !== null ? Math.round(s.pts) : '—'}</div>
                <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.12em' }}>GW</div>
              </div>
            </div>
          );
        })}

        {fixtures.length > 0 && (
          <>
            <MobSection label="FIXTURES" sub={roundLabel} tone="var(--cyan)" />
            {fixtures.map(f => {
              const finished = f.status === 'finished';
              const live = f.status === 'live' || f.status === 'in_progress';
              const ko = f.kickoff_at ? new Date(f.kickoff_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
              return (
                <div key={f.id} style={{ padding: '9px 18px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--paper)', flex: 1, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.home_team}</span>
                  <span style={{ fontFamily: DISPLAY, fontSize: 13, minWidth: 48, textAlign: 'center', color: finished ? 'var(--paper)' : live ? 'var(--danger)' : 'var(--mute)', flexShrink: 0 }}>
                    {finished || live ? `${f.home_score ?? '–'}–${f.away_score ?? '–'}` : ko}
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--paper)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.away_team}</span>
                </div>
              );
            })}
          </>
        )}

        <div style={{ height: 32 }} />
      </div>
    </div>
  );
}
