import { useMemo } from 'react';
import { MgrTag } from './HubShared';
import { MONO, DISPLAY, BODY, mgrHue, mgrMono } from './HubConstants';

// ─── Design tokens ────────────────────────────────────────────────────────────
const POS_COLORS = {
  GK:  'var(--gold)',
  DEF: 'var(--cyan)',
  MID: 'var(--positive)',
  FWD: 'var(--danger)',
};
const POS_ORDER = ['GK', 'DEF', 'MID', 'FWD'];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHead({ accent, label, badge }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
      <span style={{ width: 3, height: 14, background: accent, flexShrink: 0 }} />
      <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--paper)', letterSpacing: '.22em' }}>{label}</span>
      {badge && (
        <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '.18em', color: 'var(--mute)', border: '1px solid var(--rule)', padding: '2px 5px' }}>
          {badge}
        </span>
      )}
    </div>
  );
}

// ─── Progression chart (SVG line, cumulative pts per GW) ─────────────────────

function ProgressionChart({ matchdayPoints, currentUser }) {
  const matchdays = useMemo(() => {
    const ids = [...new Set((matchdayPoints || []).map(p => p.matchday_id))];
    return ids
      .map(id => ({ id, round: parseInt(id.split('-r')[1] || '0', 10) }))
      .sort((a, b) => a.round - b.round)
      .map(d => ({ ...d, label: `GW${d.round}` }));
  }, [matchdayPoints]);

  const managerLines = useMemo(() => {
    const byUser = {};
    for (const p of (matchdayPoints || [])) {
      if (!byUser[p.user_id]) byUser[p.user_id] = { user_id: p.user_id, username: p.username, byGW: {} };
      const cur = byUser[p.user_id].byGW[p.matchday_id] || 0;
      const val = Math.round(Number(p.total) || 0);
      if (val > cur) byUser[p.user_id].byGW[p.matchday_id] = val;
    }
    return Object.values(byUser).map(mgr => {
      let cum = 0;
      const points = matchdays.map(gw => {
        cum += mgr.byGW[gw.id] || 0;
        return cum;
      });
      return { ...mgr, points, final: cum };
    }).sort((a, b) => b.final - a.final);
  }, [matchdayPoints, matchdays]);

  if (matchdays.length === 0) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center', fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.2em' }}>
        NO SCORED MATCHDAYS YET
      </div>
    );
  }

  // SVG dimensions — no right padding needed (labels moved to legend below)
  const W = 520, H = 180;
  const PAD = { top: 14, right: 12, bottom: 24, left: 40 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;
  const maxPts = Math.max(...managerLines.flatMap(m => m.points), 1);
  const numGWs = matchdays.length;

  // Single GW: dots sit at left edge (start of x-axis), not mid-canvas
  const toX = i => PAD.left + (numGWs > 1 ? (i / (numGWs - 1)) * cW : 0);
  const toY = v  => PAD.top + cH - Math.max(0, Math.min(1, v / maxPts)) * cH;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => ({
    t, y: PAD.top + cH - t * cH, v: Math.round(maxPts * t),
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Chart */}
      <div style={{ overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', minWidth: 260, height: 'auto', display: 'block' }}
          aria-label="Points progression chart"
        >
          {/* Y grid + labels */}
          {yTicks.map(({ t, y, v }) => (
            <g key={t}>
              <line x1={PAD.left} y1={y} x2={PAD.left + cW} y2={y} stroke="var(--rule)" strokeWidth={0.6} />
              <text x={PAD.left - 6} y={y + 3.5} textAnchor="end" fontSize={8} fontFamily={MONO} fill="var(--mute)">
                {v}
              </text>
            </g>
          ))}

          {/* X axis labels */}
          {matchdays.map((gw, i) => (
            <text key={gw.id} x={toX(i)} y={H - 4} textAnchor="middle" fontSize={8} fontFamily={MONO} fill="var(--mute)">
              {gw.label}
            </text>
          ))}

          {/* Manager lines — dimmed first, "me" on top */}
          {[...managerLines].reverse().map(mgr => {
            const isMe = currentUser?.id === mgr.user_id;
            const hue  = mgrHue(mgr.username || '');
            const pts  = mgr.points;
            if (!pts.length) return null;

            const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');

            return (
              <g key={mgr.user_id}>
                {numGWs > 1 && (
                  <path
                    d={d}
                    fill="none"
                    stroke={hue}
                    strokeWidth={isMe ? 2.2 : 1.4}
                    strokeOpacity={isMe ? 1 : 0.6}
                    strokeLinejoin="round"
                  />
                )}
                {pts.map((v, i) => (
                  <circle
                    key={i}
                    cx={toX(i)}
                    cy={toY(v)}
                    r={isMe ? 4 : 3}
                    fill={hue}
                    fillOpacity={isMe ? 1 : 0.65}
                  >
                    <title>{mgr.username}: {v} pts{numGWs > 1 ? ' cumulative' : ''}</title>
                  </circle>
                ))}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend — ranked, never overlaps */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px' }}>
        {managerLines.map((mgr, i) => {
          const isMe = currentUser?.id === mgr.user_id;
          const hue  = mgrHue(mgr.username || '');
          return (
            <div key={mgr.user_id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', width: 14, textAlign: 'right' }}>
                #{i + 1}
              </span>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: hue, flexShrink: 0 }} />
              <span style={{
                fontFamily: MONO, fontSize: 9, letterSpacing: '.1em',
                color: isMe ? hue : 'var(--mute)',
                fontWeight: isMe ? 700 : 400,
              }}>
                {(mgr.username || '').toUpperCase()}
              </span>
              <span style={{ fontFamily: DISPLAY, fontSize: 11, color: i === 0 ? 'var(--gold)' : 'var(--paper)' }}>
                {mgr.final}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Position breakdown (horizontal stacked bars per manager) ────────────────

function PositionBreakdown({ positionPoints, currentUser }) {
  const rows = useMemo(() => {
    return (positionPoints || [])
      .map(m => ({
        ...m,
        total: POS_ORDER.reduce((s, p) => s + (m[p] || 0), 0),
      }))
      .sort((a, b) => b.total - a.total);
  }, [positionPoints]);

  const maxTotal = Math.max(...rows.map(r => r.total), 1);

  if (rows.length === 0) {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center', fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.2em' }}>
        NO MATCH DATA YET
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {POS_ORDER.map(pos => (
          <div key={pos} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 9, height: 9, background: POS_COLORS[pos], flexShrink: 0 }} />
            <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.12em' }}>{pos}</span>
          </div>
        ))}
      </div>

      {rows.map(mgr => {
        const isMe = currentUser?.id === mgr.user_id;
        const hue  = mgrHue(mgr.username || '');
        return (
          <div key={mgr.user_id}>
            {/* Label row */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 5 }}>
              <MgrTag mono={mgrMono(mgr.username || '')} hue={hue} />
              <span style={{ fontFamily: DISPLAY, fontSize: 11, marginLeft: 8 }}>{isMe ? 'You' : mgr.username}</span>
            </div>
            {/* Bar with inline pts labels */}
            <div style={{ height: 24, display: 'flex', background: 'var(--ink-3)', overflow: 'hidden', borderRadius: 1 }}>
              {POS_ORDER.map(pos => {
                const pts = mgr[pos] || 0;
                if (!pts) return null;
                const pct = (pts / maxTotal) * 100;
                return (
                  <div
                    key={pos}
                    style={{ width: `${pct}%`, background: POS_COLORS[pos], flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
                    title={`${pos}: ${pts} pts`}
                  >
                    {pct >= 5 && (
                      <span style={{ fontFamily: MONO, fontSize: 10, color: 'rgba(0,0,0,0.85)', fontWeight: 800, whiteSpace: 'nowrap', letterSpacing: 0 }}>
                        {pts}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Captaincy hit rate ───────────────────────────────────────────────────────

function CaptainHitRate({ captainHitData, currentUser }) {
  if (!captainHitData || captainHitData.length === 0) {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center', fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.2em' }}>
        AVAILABLE AFTER FIRST COMPLETED MATCHDAY
      </div>
    );
  }

  const maxRate = Math.max(...captainHitData.map(m => m.hits / (m.total || 1)), 0.01);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {captainHitData.map(mgr => {
        const isMe  = currentUser?.id === mgr.user_id;
        const hue   = mgrHue(mgr.username || '');
        const rate  = mgr.total > 0 ? mgr.hits / mgr.total : 0;
        const pct   = Math.round(rate * 100);

        return (
          <div key={mgr.user_id}>
            {/* Label row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <MgrTag mono={mgrMono(mgr.username || '')} hue={hue} />
                <span style={{ fontFamily: DISPLAY, fontSize: 11 }}>{isMe ? 'You' : mgr.username}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Per-GW dots */}
                <div style={{ display: 'flex', gap: 3 }}>
                  {mgr.rounds.map(r => {
                    const gwNum = r.matchday_id?.split('-r')[1] ?? '?';
                    return (
                      <div
                        key={r.matchday_id}
                        title={`GW${gwNum}: ${r.hit ? 'HIT' : 'MISS'} (${r.captain_pts} vs ${r.max_other_pts})`}
                        style={{
                          width: 16, height: 16, borderRadius: 2,
                          background: r.hit ? 'var(--positive)' : 'var(--danger)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <span style={{ fontFamily: MONO, fontSize: 7, color: 'rgba(0,0,0,0.8)', fontWeight: 700 }}>
                          {gwNum}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.1em' }}>
                  {mgr.hits}/{mgr.total}
                </span>
                <span style={{ fontFamily: DISPLAY, fontSize: 14, color: pct >= 50 ? 'var(--positive)' : 'var(--danger)', minWidth: 36, textAlign: 'right' }}>
                  {pct}%
                </span>
              </div>
            </div>
            {/* Rate bar */}
            <div style={{ height: 4, background: 'var(--ink-3)', borderRadius: 1, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${(rate / maxRate) * 100}%`,
                background: pct >= 50 ? 'var(--positive)' : 'var(--danger)',
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Best single GW panel ─────────────────────────────────────────────────────

function BestGameweeks({ matchdayPoints, currentUser }) {
  const bestByUser = useMemo(() => {
    const map = {};
    for (const p of (matchdayPoints || [])) {
      const val = Math.round(Number(p.total) || 0);
      if (!map[p.user_id] || val > map[p.user_id].pts) {
        map[p.user_id] = { user_id: p.user_id, username: p.username, pts: val, gw: p.matchday_id };
      }
    }
    return Object.values(map).sort((a, b) => b.pts - a.pts);
  }, [matchdayPoints]);

  if (bestByUser.length === 0) {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center', fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.2em' }}>
        NO MATCHDAY DATA YET
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {bestByUser.map((m, i) => {
        const isMe  = currentUser?.id === m.user_id;
        const hue   = mgrHue(m.username || '');
        const gwNum = m.gw?.split('-r')[1];
        return (
          <div key={m.user_id} style={{
            display: 'grid', gridTemplateColumns: '28px auto 1fr auto',
            gap: 12, padding: '10px 12px',
            background: isMe ? `${hue}10` : 'var(--ink-2)',
            border: `1px solid ${isMe ? hue + '44' : 'var(--rule)'}`,
            alignItems: 'center',
          }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 15, color: i === 0 ? 'var(--gold)' : 'var(--mute)' }}>
              {i + 1}
            </span>
            <MgrTag mono={mgrMono(m.username || '')} hue={hue} />
            <div>
              <div style={{ fontFamily: DISPLAY, fontSize: 12 }}>{isMe ? 'You' : m.username}</div>
              {gwNum && (
                <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.14em', marginTop: 2 }}>
                  GW{gwNum}
                </div>
              )}
            </div>
            <span style={{ fontFamily: DISPLAY, fontSize: 18, color: i === 0 ? 'var(--gold)' : 'var(--paper)' }}>
              {m.pts}<span style={{ color: 'var(--mute)', fontSize: 10, marginLeft: 3 }}>PTS</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function StatsView({ topScorers, teamMetrics, matchdayPoints, positionPoints, captainHitData, members, currentUser, statsLoading }) {
  const totalPts  = (topScorers || []).reduce((s, m) => s + Math.round(Number(m.total_points) || 0), 0);
  const avgPts    = teamMetrics?.avg_points != null
    ? Math.round(Number(teamMetrics.avg_points))
    : (members.length ? Math.round(totalPts / members.length) : '—');
  const leaderPts = topScorers?.[0]?.total_points != null
    ? Math.round(Number(topScorers[0].total_points))
    : '—';

  const scoredGWs = useMemo(
    () => new Set((matchdayPoints || []).map(p => p.matchday_id)).size,
    [matchdayPoints]
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--ink)' }}>

      {/* ── Hero strip ───────────────────────────────────────────────── */}
      <div style={{ borderBottom: '1px solid var(--rule)', background: 'var(--ink-2)', flexShrink: 0 }}>
        <div style={{ padding: 'clamp(12px,2vw,20px) clamp(14px,3vw,24px)', borderBottom: '1px solid var(--rule)' }}>
          <div style={{ fontFamily: MONO, fontSize: 'clamp(9px,1.8vw,10px)', color: 'var(--purple)', letterSpacing: '.22em' }}>
            LEAGUE STATS · {scoredGWs > 0 ? `${scoredGWs} GAMEWEEK${scoredGWs !== 1 ? 'S' : ''} SCORED` : `${members.length} MEMBERS`}
          </div>
          <div style={{ fontFamily: DISPLAY, fontSize: 'clamp(18px,4vw,26px)', marginTop: 6, lineHeight: 1.1 }}>
            Numbers, the way the league reads them.
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
          {[
            { k: 'TOTAL',  v: totalPts.toLocaleString(), tone: 'var(--paper)' },
            { k: 'AVG',    v: avgPts,                    tone: 'var(--cyan)'  },
            { k: 'LEADER', v: leaderPts,                 tone: 'var(--gold)'  },
          ].map((c, i) => (
            <div key={c.k} style={{ padding: 'clamp(8px,2vw,16px) clamp(10px,2.5vw,22px)', borderRight: i < 2 ? '1px solid var(--rule)' : 'none' }}>
              <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.22em' }}>{c.k}</div>
              <div style={{ fontFamily: DISPLAY, fontSize: 'clamp(20px,4vw,30px)', color: c.tone, marginTop: 4, letterSpacing: '-0.02em' }}>{c.v}</div>
            </div>
          ))}
        </div>
      </div>

      {statsLoading ? (
        <div style={{ padding: '48px', textAlign: 'center', fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.2em' }}>LOADING…</div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>

          {/* ── Row 1: Score Progression (full width) ────────────────── */}
          <section style={{ padding: '16px 22px', borderBottom: '1px solid var(--rule)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SectionHead accent="var(--purple)" label="SCORE PROGRESSION · CUMULATIVE PTS" />
            <p style={{ fontFamily: BODY, fontSize: 11, color: 'var(--mute)', margin: 0, lineHeight: 1.5 }}>
              Cumulative season total per gameweek. Steeper slope = higher-scoring round.
            </p>
            <ProgressionChart matchdayPoints={matchdayPoints} currentUser={currentUser} />
          </section>

          {/* ── Row 2: Top Scorers + Position Breakdown ──────────────── */}
          <div className="flex flex-col lg:grid lg:grid-cols-2" style={{ borderBottom: '1px solid var(--rule)' }}>

            {/* Top scorers */}
            <section style={{ padding: '16px 22px', borderRight: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <SectionHead accent="var(--cyan)" label="SEASON TOTALS · LEADERBOARD" />
              {(topScorers || []).map((scorer, i) => {
                const hue    = mgrHue(scorer.username || '');
                const isMe   = currentUser && scorer.user_id === currentUser.id;
                const maxPts = topScorers?.[0]?.total_points || 1;
                return (
                  <div key={scorer.user_id} style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr auto auto', gap: 12, alignItems: 'center' }}>
                    <MgrTag mono={mgrMono(scorer.username || '')} hue={hue} />
                    <div>
                      <div style={{ fontFamily: DISPLAY, fontSize: 12 }}>{isMe ? 'You' : scorer.username}</div>
                      <div style={{ height: 4, background: 'var(--ink-3)', marginTop: 4, width: 120 }}>
                        <div style={{ height: '100%', width: `${(scorer.total_points / maxPts) * 100}%`, background: i === 0 ? 'var(--gold)' : 'var(--cyan)' }} />
                      </div>
                    </div>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)' }}>#{i + 1}</span>
                    <span style={{ fontFamily: DISPLAY, fontSize: 14, color: i === 0 ? 'var(--gold)' : 'var(--paper)' }}>
                      {Math.round(Number(scorer.total_points) || 0)}<span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', marginLeft: 4 }}>PTS</span>
                    </span>
                  </div>
                );
              })}
            </section>

            {/* Position breakdown */}
            <section style={{ padding: '16px 22px', borderBottom: '1px solid var(--rule)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <SectionHead accent="var(--positive)" label="POINTS BY POSITION" />
              <p style={{ fontFamily: BODY, fontSize: 11, color: 'var(--mute)', margin: 0, lineHeight: 1.5 }}>
                Where each manager's points have come from across their current starting XI.
              </p>
              <PositionBreakdown positionPoints={positionPoints} currentUser={currentUser} />
            </section>
          </div>

          {/* ── Row 3: Best Single GW + Captaincy ────────────────────── */}
          <div className="flex flex-col lg:grid lg:grid-cols-2">

            {/* Best single GW */}
            <section style={{ padding: '16px 22px', borderRight: '1px solid var(--rule)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <SectionHead accent="var(--danger)" label="BEST SINGLE GAMEWEEK" />
              <BestGameweeks matchdayPoints={matchdayPoints} currentUser={currentUser} />
            </section>

            {/* Captaincy hit rate */}
            <section style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <SectionHead accent="var(--gold)" label="CAPTAINCY · HIT RATE" />
              <p style={{ fontFamily: BODY, fontSize: 11, color: 'var(--mute)', margin: 0, lineHeight: 1.5 }}>
                Did your captain outscore every other player in your XI that gameweek? Green = hit, red = miss.
              </p>
              <CaptainHitRate captainHitData={captainHitData} currentUser={currentUser} />
            </section>
          </div>

        </div>
      )}
    </div>
  );
}
