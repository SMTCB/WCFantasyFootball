import { memo } from 'react';

// Coloured form strip showing every finished GW's fantasy points.
// rounds: full-season array — most recent first. null = no data that GW.
// Colour scale: null=ghost, 0=red, 1–4=amber, 5–9=green, 10+=cyan
// (10+ used to reuse the same amber hue as 1–4, just more opaque —
// visually indistinguishable at a glance. Cyan gives every tier its own hue.)

function cellBg(pts) {
  if (pts === null || pts === undefined) return 'rgba(255,255,255,0.06)';
  if (pts === 0)  return 'rgba(240,58,58,0.45)';
  if (pts < 5)   return 'rgba(240,180,0,0.4)';
  if (pts < 10)  return 'rgba(24,201,107,0.4)';
  return 'rgba(0,180,216,0.4)';
}

function cellColor(pts) {
  if (pts === null || pts === undefined) return 'rgba(255,255,255,0.18)';
  if (pts === 0)  return 'rgba(240,58,58,0.9)';
  if (pts < 5)   return 'rgba(240,180,0,0.95)';
  if (pts < 10)  return 'rgba(24,201,107,0.95)';
  return '#00B4D8';
}

export default memo(function FormStrip({ rounds }) {
  const cells = rounds ?? [];

  return (
    <div style={{ display: 'flex', gap: 2, marginTop: 3, overflowX: 'auto', maxWidth: '100%' }}>
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
