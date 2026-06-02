import { memo } from 'react';

// 5-cell coloured form strip showing last-GW fantasy points.
// rounds: array up to 5 — most recent first. null = no data that GW.
// Colour scale: null=ghost, 0=red, 1–4=amber, 5–9=green, 10+=gold

function cellBg(pts) {
  if (pts === null || pts === undefined) return 'rgba(255,255,255,0.06)';
  if (pts === 0)  return 'rgba(240,58,58,0.45)';
  if (pts < 5)   return 'rgba(240,180,0,0.4)';
  if (pts < 10)  return 'rgba(24,201,107,0.4)';
  return 'rgba(240,180,0,0.75)';
}

function cellColor(pts) {
  if (pts === null || pts === undefined) return 'rgba(255,255,255,0.18)';
  if (pts === 0)  return 'rgba(240,58,58,0.9)';
  if (pts < 5)   return 'rgba(240,180,0,0.95)';
  if (pts < 10)  return 'rgba(24,201,107,0.95)';
  return '#F0B400';
}

export default memo(function FormStrip({ rounds }) {
  const cells = Array(5).fill(null);
  if (rounds) rounds.slice(0, 5).forEach((v, i) => { cells[i] = v; });

  return (
    <div style={{ display: 'flex', gap: 2, marginTop: 3 }}>
      {cells.map((pts, i) => (
        <div
          key={i}
          title={pts !== null && pts !== undefined ? `${Math.round(pts)} pts` : 'No data'}
          style={{
            width: 16,
            height: 13,
            borderRadius: 2,
            background: cellBg(pts),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 7,
            fontWeight: 700,
            color: cellColor(pts),
            letterSpacing: 0,
            flexShrink: 0,
          }}
        >
          {pts !== null && pts !== undefined ? Math.round(pts) : ''}
        </div>
      ))}
    </div>
  );
});
