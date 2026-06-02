import { memo } from 'react';

// Colour for pts value — mirrors FormStrip scale
function ptColor(pts) {
  if (pts === null || pts === undefined) return 'var(--mute)';
  if (pts === 0)  return 'rgba(240,58,58,0.9)';
  if (pts < 5)   return 'rgba(240,180,0,0.95)';
  if (pts < 10)  return 'rgba(24,201,107,0.95)';
  return '#F0B400';
}

const TH = ({ children, right }) => (
  <th style={{
    fontFamily: 'JetBrains Mono, monospace', fontSize: 7, fontWeight: 700,
    color: 'var(--mute)', letterSpacing: '0.18em', textTransform: 'uppercase',
    padding: '0 4px 5px', textAlign: right ? 'right' : 'left', whiteSpace: 'nowrap',
  }}>{children}</th>
);

const TD = ({ children, right, bold, color }) => (
  <td style={{
    fontFamily: 'JetBrains Mono, monospace', fontSize: 9, fontWeight: bold ? 700 : 400,
    color: color ?? 'var(--paper)', padding: '3px 4px',
    textAlign: right ? 'right' : 'left', whiteSpace: 'nowrap',
  }}>{children}</td>
);

export default memo(function PlayerStatsPanel({
  detail, position, isOwned, canBuy, saving, isLocked, onAction,
}) {
  const showCS = position === 'GK' || position === 'DEF';

  if (!detail) {
    return (
      <div style={{
        padding: '8px 16px 10px', borderBottom: '1px solid var(--rule)',
        background: 'rgba(255,255,255,0.02)',
      }}>
        <div className="fk-mono animate-pulse" style={{ fontSize: 8, color: 'var(--mute)', letterSpacing: '0.18em' }}>
          LOADING STATS…
        </div>
      </div>
    );
  }

  const { rounds, season } = detail;

  return (
    <div style={{
      borderBottom: '1px solid var(--rule)',
      background: 'rgba(255,255,255,0.025)',
      padding: '10px 16px 12px 52px', // indent past position chip
    }}>

      {/* ── Last 5 GW table ─────────────────────────────────── */}
      {rounds.length > 0 ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
          <thead>
            <tr>
              <TH>GW</TH>
              <TH>Fixture</TH>
              <TH right>Min</TH>
              <TH right>G</TH>
              <TH right>A</TH>
              {showCS && <TH right>CS</TH>}
              <TH right>Pts</TH>
            </tr>
          </thead>
          <tbody>
            {rounds.map((r, i) => (
              <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <TD color="var(--mute)">{r.gw}</TD>
                <TD>{r.fixture}</TD>
                <TD right color="var(--mute)">{r.mins ?? 0}'</TD>
                <TD right>{r.goals}</TD>
                <TD right>{r.assists}</TD>
                {showCS && <TD right color={r.cs ? 'var(--positive)' : 'var(--mute)'}>{r.cs ? '✓' : '–'}</TD>}
                <TD right bold color={ptColor(r.pts)}>{Math.round(r.pts ?? 0)}</TD>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="fk-mono" style={{ fontSize: 8, color: 'var(--mute)', letterSpacing: '0.14em', marginBottom: 8 }}>
          NO STATS YET THIS SEASON
        </div>
      )}

      {/* ── Season totals ────────────────────────────────────── */}
      {season && season.apps > 0 && (
        <div className="fk-mono" style={{ fontSize: 8, color: 'var(--mute)', letterSpacing: '0.12em', marginBottom: 10 }}>
          {season.apps} APPS · {season.goals}G · {season.assists}A · {season.pts} PTS · AVG {season.avgPts}/GW
        </div>
      )}

      {/* ── Action button ─────────────────────────────────────── */}
      {!isLocked && (
        isOwned ? (
          <button
            onClick={() => onAction('sell')}
            disabled={saving}
            className="fk-mono transition-all active:scale-95 disabled:opacity-40"
            style={{
              padding: '6px 16px', border: '1px solid var(--danger)',
              color: 'var(--danger)', background: 'transparent',
              fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', cursor: 'pointer',
            }}
          >
            SELL
          </button>
        ) : (
          <button
            onClick={() => onAction('buy')}
            disabled={saving || !canBuy}
            className="fk-mono transition-all active:scale-95 disabled:opacity-40"
            style={{
              padding: '6px 16px',
              border: `1px solid ${canBuy ? 'var(--cyan)' : 'var(--rule)'}`,
              color: canBuy ? 'var(--cyan)' : 'var(--mute)',
              background: 'transparent',
              fontSize: 10, fontWeight: 800, letterSpacing: '0.14em',
              cursor: canBuy ? 'pointer' : 'not-allowed',
            }}
          >
            BUY
          </button>
        )
      )}
    </div>
  );
});
