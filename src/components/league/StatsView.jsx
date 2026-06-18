import { useMemo, useState } from 'react';
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

function EmptyState({ label }) {
  return (
    <div style={{ padding: '28px 0', textAlign: 'center', fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.2em' }}>
      {label}
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
    return <EmptyState label="NO SCORED MATCHDAYS YET" />;
  }

  const W = 520, H = 180;
  const PAD = { top: 14, right: 12, bottom: 24, left: 40 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;
  const maxPts = Math.max(...managerLines.flatMap(m => m.points), 1);
  const numGWs = matchdays.length;

  const toX = i => PAD.left + (numGWs > 1 ? (i / (numGWs - 1)) * cW : 0);
  const toY = v  => PAD.top + cH - Math.max(0, Math.min(1, v / maxPts)) * cH;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => ({
    t, y: PAD.top + cH - t * cH, v: Math.round(maxPts * t),
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', minWidth: 260, height: 'auto', display: 'block' }}
          aria-label="Points progression chart"
        >
          {yTicks.map(({ t, y, v }) => (
            <g key={t}>
              <line x1={PAD.left} y1={y} x2={PAD.left + cW} y2={y} stroke="var(--rule)" strokeWidth={0.6} />
              <text x={PAD.left - 6} y={y + 3.5} textAnchor="end" fontSize={8} fontFamily={MONO} fill="var(--mute)">
                {v}
              </text>
            </g>
          ))}
          {matchdays.map((gw, i) => (
            <text key={gw.id} x={toX(i)} y={H - 4} textAnchor="middle" fontSize={8} fontFamily={MONO} fill="var(--mute)">
              {gw.label}
            </text>
          ))}
          {[...managerLines].reverse().map(mgr => {
            const isMe = currentUser?.id === mgr.user_id;
            const hue  = mgrHue(mgr.username || '');
            const pts  = mgr.points;
            if (!pts.length) return null;
            const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');
            return (
              <g key={mgr.user_id}>
                {numGWs > 1 && (
                  <path d={d} fill="none" stroke={hue} strokeWidth={isMe ? 2.2 : 1.4} strokeOpacity={isMe ? 1 : 0.6} strokeLinejoin="round" />
                )}
                {pts.map((v, i) => (
                  <circle key={i} cx={toX(i)} cy={toY(v)} r={isMe ? 4 : 3} fill={hue} fillOpacity={isMe ? 1 : 0.65}>
                    <title>{mgr.username}: {v} pts{numGWs > 1 ? ' cumulative' : ''}</title>
                  </circle>
                ))}
              </g>
            );
          })}
        </svg>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px' }}>
        {managerLines.map((mgr, i) => {
          const isMe = currentUser?.id === mgr.user_id;
          const hue  = mgrHue(mgr.username || '');
          return (
            <div key={mgr.user_id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', width: 14, textAlign: 'right' }}>#{i + 1}</span>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: hue, flexShrink: 0 }} />
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', color: isMe ? hue : 'var(--mute)', fontWeight: isMe ? 700 : 400 }}>
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

// ─── Season Totals + Position Breakdown (merged) ──────────────────────────────

function SeasonTotalsWithPosition({ topScorers, positionPoints, currentUser }) {
  const rows = useMemo(() => {
    const posMap = Object.fromEntries((positionPoints || []).map(p => [p.user_id, p]));
    return (topScorers || []).map((scorer, i) => {
      const pos = posMap[scorer.user_id] || {};
      const posTotal = POS_ORDER.reduce((s, p) => s + (pos[p] || 0), 0);
      return { ...scorer, rank: i + 1, posData: pos, posTotal };
    });
  }, [topScorers, positionPoints]);

  const maxTotalPts = Math.max(...rows.map(r => Math.round(Number(r.total_points) || 0)), 1);
  const hasPositionData = rows.some(r => r.posTotal > 0);

  if (rows.length === 0) return <EmptyState label="NO MATCH DATA YET" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Position legend */}
      {hasPositionData && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
          {POS_ORDER.map(pos => (
            <div key={pos} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 9, height: 9, background: POS_COLORS[pos], flexShrink: 0 }} />
              <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.12em' }}>{pos}</span>
            </div>
          ))}
        </div>
      )}

      {rows.map(mgr => {
        const isMe     = currentUser?.id === mgr.user_id;
        const hue      = mgrHue(mgr.username || '');
        const totalPts = Math.round(Number(mgr.total_points) || 0);

        return (
          <div key={mgr.user_id} style={{ marginBottom: 14 }}>
            {/* Label row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{
                fontFamily: DISPLAY, fontSize: 13, minWidth: 28, textAlign: 'right',
                color: mgr.rank === 1 ? 'var(--gold)' : 'var(--mute)',
              }}>
                #{mgr.rank}
              </span>
              <MgrTag mono={mgrMono(mgr.username || '')} hue={hue} />
              <span style={{ fontFamily: DISPLAY, fontSize: 12, flex: 1 }}>{isMe ? 'You' : mgr.username}</span>
              <span style={{ fontFamily: DISPLAY, fontSize: 15, color: mgr.rank === 1 ? 'var(--gold)' : 'var(--paper)' }}>
                {totalPts}
                <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', marginLeft: 3 }}>PTS</span>
              </span>
            </div>

            {/* Stacked position bar */}
            <div style={{ height: 22, display: 'flex', background: 'var(--ink-3)', overflow: 'hidden', borderRadius: 1, marginLeft: 38 }}>
              {hasPositionData
                ? POS_ORDER.map(pos => {
                    const pts = mgr.posData[pos] || 0;
                    if (!pts) return null;
                    const pct = (pts / maxTotalPts) * 100;
                    return (
                      <div
                        key={pos}
                        style={{ width: `${pct}%`, background: POS_COLORS[pos], display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}
                        title={`${pos}: ${pts} pts`}
                      >
                        {pct >= 6 && (
                          <span style={{ fontFamily: MONO, fontSize: 9, color: 'rgba(0,0,0,0.85)', fontWeight: 800, whiteSpace: 'nowrap' }}>
                            {pts}
                          </span>
                        )}
                      </div>
                    );
                  })
                : (
                  <div style={{ width: `${(totalPts / maxTotalPts) * 100}%`, background: isMe ? hue : 'var(--cyan)', opacity: 0.6 }} />
                )
              }
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Best single GW ───────────────────────────────────────────────────────────

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

  if (bestByUser.length === 0) return <EmptyState label="NO MATCHDAY DATA YET" />;

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
            <span style={{ fontFamily: DISPLAY, fontSize: 15, color: i === 0 ? 'var(--gold)' : 'var(--mute)' }}>{i + 1}</span>
            <MgrTag mono={mgrMono(m.username || '')} hue={hue} />
            <div>
              <div style={{ fontFamily: DISPLAY, fontSize: 12 }}>{isMe ? 'You' : m.username}</div>
              {gwNum && <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.14em', marginTop: 2 }}>GW{gwNum}</div>}
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

// ─── Captaincy hit rate ───────────────────────────────────────────────────────

function CaptainHitRate({ captainHitData, currentUser }) {
  if (!captainHitData || captainHitData.length === 0) {
    return <EmptyState label="AVAILABLE AFTER FIRST COMPLETED MATCHDAY" />;
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <MgrTag mono={mgrMono(mgr.username || '')} hue={hue} />
                <span style={{ fontFamily: DISPLAY, fontSize: 11 }}>{isMe ? 'You' : mgr.username}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', gap: 3 }}>
                  {mgr.rounds.map(r => {
                    const gwNum = r.matchday_id?.split('-r')[1] ?? '?';
                    return (
                      <div
                        key={r.matchday_id}
                        title={`GW${gwNum}: ${r.hit ? 'HIT' : 'MISS'} (${r.captain_pts} vs ${r.max_other_pts})`}
                        style={{ width: 16, height: 16, borderRadius: 2, background: r.hit ? 'var(--positive)' : 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <span style={{ fontFamily: MONO, fontSize: 7, color: 'rgba(0,0,0,0.8)', fontWeight: 700 }}>{gwNum}</span>
                      </div>
                    );
                  })}
                </div>
                <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.1em' }}>{mgr.hits}/{mgr.total}</span>
                <span style={{ fontFamily: DISPLAY, fontSize: 14, color: pct >= 50 ? 'var(--positive)' : 'var(--danger)', minWidth: 36, textAlign: 'right' }}>{pct}%</span>
              </div>
            </div>
            <div style={{ height: 4, background: 'var(--ink-3)', borderRadius: 1, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(rate / maxRate) * 100}%`, background: pct >= 50 ? 'var(--positive)' : 'var(--danger)' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── ROI Panel ────────────────────────────────────────────────────────────────

const ROI_TAB_STYLES = {
  base: {
    fontFamily: MONO, fontSize: 10, letterSpacing: '.18em', padding: '5px 12px',
    border: '1px solid var(--rule)', cursor: 'pointer', transition: 'all .15s',
  },
};

function RoiPanel({ roiData, currentUser }) {
  const [playerTab, setPlayerTab] = useState('best');
  const { managerRoi = [], playerRoi = [] } = roiData || {};

  // Manager ROI bar
  const maxMgrRoi = Math.max(...managerRoi.map(m => m.roi), 0.01);

  // Player lists — only played players (minutes > 0)
  const playedPlayers = useMemo(() => playerRoi.filter(p => p.minutes > 0), [playerRoi]);
  const bestPlayers   = useMemo(() => [...playedPlayers].sort((a, b) => b.roi - a.roi).slice(0, 7), [playedPlayers]);
  const worstPlayers  = useMemo(() => [...playedPlayers].sort((a, b) => a.roi - b.roi).slice(0, 7), [playedPlayers]);
  const displayPlayers = playerTab === 'best' ? bestPlayers : worstPlayers;

  const noManagerData = managerRoi.length === 0 || managerRoi.every(m => m.squad_value === 0);
  const noPlayerData  = playedPlayers.length === 0;

  return (
    <div className="flex flex-col lg:grid lg:grid-cols-2" style={{ gap: 0 }}>

      {/* ── Manager ROI ───────────────────────────────────────────────── */}
      <section style={{ padding: '16px 22px', borderRight: '1px solid var(--rule)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SectionHead accent="var(--purple)" label="MANAGER ROI · PTS PER £M" />
        <p style={{ fontFamily: BODY, fontSize: 11, color: 'var(--mute)', margin: 0, lineHeight: 1.5 }}>
          Season points divided by current XI value. Who extracts the most from their budget?
        </p>

        {noManagerData
          ? <EmptyState label="AVAILABLE AFTER FIRST SCORED MATCHDAY" />
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {managerRoi.map((mgr, i) => {
                const isMe   = currentUser?.id === mgr.user_id;
                const hue    = mgrHue(mgr.username || '');
                const barPct = (mgr.roi / maxMgrRoi) * 100;
                return (
                  <div key={mgr.user_id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}>
                      <span style={{ fontFamily: DISPLAY, fontSize: 12, minWidth: 22, textAlign: 'right', color: i === 0 ? 'var(--gold)' : 'var(--mute)' }}>
                        #{i + 1}
                      </span>
                      <MgrTag mono={mgrMono(mgr.username || '')} hue={hue} />
                      <span style={{ fontFamily: DISPLAY, fontSize: 11, flex: 1 }}>{isMe ? 'You' : mgr.username}</span>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontFamily: DISPLAY, fontSize: 14, color: i === 0 ? 'var(--gold)' : 'var(--paper)' }}>
                          {mgr.roi.toFixed(2)}
                        </span>
                        <span style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', marginLeft: 3 }}>PTS/£M</span>
                      </div>
                    </div>
                    <div style={{ height: 6, background: 'var(--ink-3)', borderRadius: 1, overflow: 'hidden', marginLeft: 32 }}>
                      <div style={{
                        height: '100%', width: `${barPct}%`,
                        background: i === 0 ? 'var(--gold)' : isMe ? hue : 'var(--purple)',
                        opacity: isMe ? 1 : 0.7,
                      }} />
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.1em', marginTop: 3, marginLeft: 32 }}>
                      {mgr.total_points} PTS · £{mgr.squad_value.toFixed(1)}M XI
                    </div>
                  </div>
                );
              })}
            </div>
          )
        }
      </section>

      {/* ── Player ROI (tabbed best/worst) ────────────────────────────── */}
      <section style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Header + tab toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <SectionHead
            accent={playerTab === 'best' ? 'var(--positive)' : 'var(--danger)'}
            label={playerTab === 'best' ? 'BEST PLAYER ROI · VALUE PICKS' : 'WORST PLAYER ROI · EXPENSIVE FLOPS'}
          />
          <div style={{ display: 'flex', gap: 0, flexShrink: 0 }}>
            {[['best', '↑ BEST'], ['worst', '↓ WORST']].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setPlayerTab(key)}
                style={{
                  ...ROI_TAB_STYLES.base,
                  background: playerTab === key ? (key === 'best' ? 'var(--positive)' : 'var(--danger)') : 'transparent',
                  color: playerTab === key ? 'rgba(0,0,0,0.85)' : 'var(--mute)',
                  borderColor: playerTab === key ? 'transparent' : 'var(--rule)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <p style={{ fontFamily: BODY, fontSize: 11, color: 'var(--mute)', margin: 0, lineHeight: 1.5 }}>
          {playerTab === 'best'
            ? 'Pts per £M among players who have played. Underpriced gems that punch above their cost.'
            : 'Lowest pts per £M among players who have played. Big price tags, small returns.'
          }
        </p>

        {noPlayerData
          ? <EmptyState label="AVAILABLE AFTER FIRST SCORED MATCHDAY" />
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {/* Column headers */}
              <div style={{ display: 'grid', gridTemplateColumns: '22px 28px 1fr auto auto auto', gap: 8, alignItems: 'center', padding: '4px 8px', marginBottom: 4 }}>
                {['#', 'POS', 'PLAYER', 'PTS', '£M', 'ROI'].map(h => (
                  <span key={h} style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.16em', textAlign: h === 'PLAYER' ? 'left' : 'right' }}>{h}</span>
                ))}
              </div>

              {displayPlayers.map((p, i) => {
                const posColor = POS_COLORS[p.position] || 'var(--mute)';
                const isGood   = playerTab === 'best';
                const rankColor = i === 0 ? (isGood ? 'var(--positive)' : 'var(--danger)') : 'var(--mute)';
                return (
                  <div
                    key={p.player_id}
                    style={{
                      display: 'grid', gridTemplateColumns: '22px 28px 1fr auto auto auto',
                      gap: 8, alignItems: 'center', padding: '8px',
                      background: i % 2 === 0 ? 'var(--ink-2)' : 'transparent',
                      borderRadius: 2,
                    }}
                  >
                    <span style={{ fontFamily: MONO, fontSize: 10, color: rankColor, textAlign: 'right' }}>
                      {i + 1}
                    </span>
                    <span style={{
                      fontFamily: MONO, fontSize: 8, letterSpacing: '.1em', textAlign: 'center',
                      background: posColor, color: 'rgba(0,0,0,0.8)', padding: '2px 4px', borderRadius: 2, fontWeight: 700,
                    }}>
                      {p.position}
                    </span>
                    <span style={{ fontFamily: DISPLAY, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name}
                    </span>
                    <span style={{ fontFamily: DISPLAY, fontSize: 12, textAlign: 'right' }}>{p.pts}</span>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', textAlign: 'right' }}>
                      {p.price.toFixed(1)}
                    </span>
                    <span style={{
                      fontFamily: DISPLAY, fontSize: 13, textAlign: 'right',
                      color: isGood ? (i === 0 ? 'var(--positive)' : 'var(--paper)') : (i === 0 ? 'var(--danger)' : 'var(--paper)'),
                    }}>
                      {p.roi.toFixed(2)}
                    </span>
                  </div>
                );
              })}

              <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.12em', marginTop: 6, textAlign: 'right' }}>
                ROI = TOTAL PTS ÷ PRICE · PLAYED PLAYERS ONLY
              </div>
            </div>
          )
        }
      </section>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function StatsView({ topScorers, teamMetrics, matchdayPoints, positionPoints, captainHitData, roiData, members, currentUser, statsLoading }) {
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

          {/* ── Row 2: Season Totals + Position Breakdown (merged, full width) */}
          <section style={{ padding: '16px 22px', borderBottom: '1px solid var(--rule)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SectionHead accent="var(--cyan)" label="SEASON TOTALS · POINTS BY POSITION" />
            <p style={{ fontFamily: BODY, fontSize: 11, color: 'var(--mute)', margin: 0, lineHeight: 1.5 }}>
              Leaderboard ranked by season total. Bars show how each manager's points break down by position.
            </p>
            <SeasonTotalsWithPosition topScorers={topScorers} positionPoints={positionPoints} currentUser={currentUser} />
          </section>

          {/* ── Row 3: Best Single GW + Captaincy ────────────────────── */}
          <div className="flex flex-col lg:grid lg:grid-cols-2" style={{ borderBottom: '1px solid var(--rule)' }}>
            <section style={{ padding: '16px 22px', borderRight: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <SectionHead accent="var(--danger)" label="BEST SINGLE GAMEWEEK" />
              <BestGameweeks matchdayPoints={matchdayPoints} currentUser={currentUser} />
            </section>
            <section style={{ padding: '16px 22px', borderBottom: '1px solid var(--rule)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <SectionHead accent="var(--gold)" label="CAPTAINCY · HIT RATE" />
              <p style={{ fontFamily: BODY, fontSize: 11, color: 'var(--mute)', margin: 0, lineHeight: 1.5 }}>
                How often your captain was the top scorer in your active XI that gameweek. Green = captain outscored every other starter (correct armband). Red = someone else in your XI scored more.
              </p>
              <CaptainHitRate captainHitData={captainHitData} currentUser={currentUser} />
            </section>
          </div>

          {/* ── Row 4: ROI (manager + player, 2-col) ─────────────────── */}
          <div style={{ borderBottom: '1px solid var(--rule)' }}>
            <RoiPanel roiData={roiData} currentUser={currentUser} />
          </div>

        </div>
      )}
    </div>
  );
}
