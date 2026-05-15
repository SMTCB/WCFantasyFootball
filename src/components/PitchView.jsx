/**
 * PitchView — renders the squad on a pitch surface.
 *
 * Desktop (variant="desktop"): flex:1 container, fills available column height.
 *   Tokens are absolute-positioned at x%/y% within the inner pitch surface.
 *
 * Mobile (variant="mobile"): fixed aspect-ratio container (3/2).
 *   Same tokens, same layout.
 *
 * Pitch anatomy (spec-exact, z-order back→front):
 *   1. Pitch surface — dark gradient rect, border-radius 8, inset 1px border
 *   2. Four horizontal lane lines at y=22/46/70/92%, cyan-tint
 *   3. Centre circle (160px) + halfway line — nothing else
 *   4. Lane labels FWD/MID/DEF/GK — inside pitch at left:18, on top of lines
 *   5. Fixture context strip — top:14px, mono 10px
 *   6. Player HybridToken pills
 */

// X positions for each row count (spec values, wider spacing)
const X_BY_COUNT = {
  1: [50],
  2: [33, 67],
  3: [22, 50, 78],
  4: [14, 38, 62, 86],
  5: [12, 28, 50, 72, 88],
};

// Y position (% from top) for each position band
const POS_Y = { FWD: 22, MID: 46, DEF: 70, GK: 92 };

const STATUS_COLOR = {
  fit:        'var(--positive)',
  doubt:      'var(--gold)',
  out:        'var(--danger)',
  doubtful:   'var(--gold)',
  injured:    'var(--danger)',
  suspended:  'var(--danger)',
};

function xPositions(n) {
  return X_BY_COUNT[n] ?? Array.from({ length: n }, (_, i) => ((i + 1) * 100) / (n + 1));
}

// ── HybridToken — the only token style (spec §Token spec) ─────────────────────
function HybridToken({ player, no, x, y, isCaptain, onClick, isSelected, compact }) {
  const surname = player.name?.split(' ').slice(-1)[0]?.toUpperCase() ?? player.name?.toUpperCase() ?? '?';
  const club    = (player.club ?? '').substring(0, 3).toUpperCase();
  const pts     = player.points ?? 0;
  const sc      = STATUS_COLOR[player.intel?.status] ?? 'var(--positive)';

  if (compact) {
    // Compact token: position-coloured pill, surname, pts — no number badge
    const posColor = player.position === 'GK' ? 'var(--pos-gk)'
      : player.position === 'DEF' ? 'var(--pos-def)'
      : player.position === 'MID' ? 'var(--pos-mid)'
      : 'var(--pos-fwd)';
    return (
      <div
        data-testid={`token-${player.id}`}
        onClick={() => onClick(player)}
        style={{
          position:    'absolute',
          left:        `${x}%`,
          top:         `${y}%`,
          transform:   'translate(-50%, -50%)',
          display:     'flex',
          flexDirection: 'column',
          alignItems:  'center',
          gap:         2,
          cursor:      'pointer',
          zIndex:      10,
          userSelect:  'none',
        }}
      >
        <div style={{
          padding:      '3px 7px',
          background:   'rgba(15,18,24,.92)',
          border:       `1px solid ${isSelected ? 'var(--cyan)' : posColor}`,
          borderRadius: 3,
          fontFamily:   'Archivo Black, sans-serif',
          fontSize:     10,
          letterSpacing: '-0.01em',
          textTransform: 'uppercase',
          color:        'var(--paper)',
          whiteSpace:   'nowrap',
        }}>
          {surname}
        </div>
        <div style={{
          fontFamily:   'JetBrains Mono, monospace',
          fontSize:     8,
          color:        pts > 0 ? 'var(--positive)' : 'var(--mute)',
          letterSpacing: '.1em',
        }}>
          {pts > 0 ? `+${pts}` : club}
        </div>
        {isCaptain && (
          <div style={{
            position:    'absolute',
            top: -6, right: -6,
            width: 14, height: 14,
            borderRadius: '50%',
            background:  'var(--gold)',
            color:       '#0A0A0A',
            fontFamily:  'Archivo Black, sans-serif',
            fontSize:    7,
            display:     'flex',
            alignItems:  'center',
            justifyContent: 'center',
            border:      '1.5px solid var(--ink)',
          }}>C</div>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid={`token-${player.id}`}
      onClick={() => onClick(player)}
      style={{
        position:       'absolute',
        left:           `${x}%`,
        top:            `${y}%`,
        transform:      'translate(-50%, -50%)',
        display:        'flex',
        alignItems:     'center',
        gap:            10,
        padding:        '8px 12px 8px 10px',
        background:     'rgba(15,18,24,.92)',
        backdropFilter: 'blur(4px)',
        border:         `1px solid ${isSelected ? 'var(--cyan)' : 'var(--rule)'}`,
        borderRadius:   4,
        minWidth:       148,
        cursor:         'pointer',
        zIndex:         10,
        userSelect:     'none',
        boxSizing:      'border-box',
      }}
    >
      {/* Number badge */}
      <div style={{
        width:           36,
        height:          36,
        flexShrink:      0,
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        background:      isCaptain ? 'var(--gold)' : 'transparent',
        border:          `1.5px solid ${isCaptain ? 'var(--gold)' : 'var(--cyan)'}`,
        color:           isCaptain ? '#0A0A0A' : 'var(--cyan)',
        fontFamily:      'Archivo Black, sans-serif',
        fontSize:        14,
      }}>
        {no}
      </div>

      {/* Name + sub-line */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Status dot */}
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: sc, flexShrink: 0 }} />
          <span style={{
            fontFamily:     'Archivo Black, sans-serif',
            fontSize:       13,
            letterSpacing:  '-0.01em',
            textTransform:  'uppercase',
            color:          'var(--paper)',
            whiteSpace:     'nowrap',
            overflow:       'hidden',
            textOverflow:   'ellipsis',
          }}>
            {surname}
          </span>
        </div>
        <div style={{
          fontFamily:    'JetBrains Mono, monospace',
          fontSize:      9,
          color:         'var(--mute)',
          letterSpacing: '.14em',
          marginTop:     2,
        }}>
          {club} · {pts} PTS
        </div>
      </div>

      {/* Captain badge */}
      {isCaptain && (
        <div style={{
          position:       'absolute',
          top:            -7,
          right:          -7,
          width:          18,
          height:         18,
          borderRadius:   '50%',
          background:     'var(--gold)',
          color:          '#0A0A0A',
          fontFamily:     'Archivo Black, sans-serif',
          fontSize:       9,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          border:         '2px solid var(--ink)',
        }}>
          C
        </div>
      )}
    </div>
  );
}

// ── PitchView ─────────────────────────────────────────────────────────────────
export default function PitchView({
  squad,
  onPlayerClick,
  selectedPlayerId,
  swapMode,
  variant = 'desktop',   // 'desktop' | 'mobile' | 'compact'
  matchdayLabel = '',
}) {
  const isCompact = variant === 'compact';
  // Group players by position
  const byPos = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const p of (squad.players ?? [])) {
    if (byPos[p.position]) byPos[p.position].push(p);
  }

  // Build token list with absolute x/y + sequential number
  const tokens = [];
  let no = 1;
  for (const pos of ['GK', 'DEF', 'MID', 'FWD']) {
    const posPlayers = byPos[pos];
    const y  = POS_Y[pos];
    const xs = xPositions(posPlayers.length);
    posPlayers.forEach((p, i) => {
      tokens.push({
        player:    p,
        no:        no++,
        x:         xs[i],
        y,
        isCaptain: p.id === squad.captainId,
      });
    });
  }

  // Formation string (e.g. "4-3-3")
  const def = byPos.DEF.length, mid = byPos.MID.length, fwd = byPos.FWD.length;
  const formation = [def, mid, fwd].filter(n => n > 0).join('-') || '—';

  // Outer container sizing
  const outerStyle = isCompact
    ? { position: 'relative', width: '100%', height: 220, background: '#08090C', padding: '12px 16px 14px' }
    : variant === 'desktop'
    ? { flex: 1, position: 'relative', background: '#08090C', padding: '28px 40px 32px' }
    : {
        position:    'relative',
        width:       '100%',
        aspectRatio: '3/2',
        background:  '#08090C',
        padding:     '16px 20px 20px',
      };

  const insetStyle = isCompact
    ? { position: 'absolute', inset: '12px 16px 14px' }
    : variant === 'desktop'
    ? { position: 'absolute', inset: '28px 40px 32px' }
    : { position: 'absolute', inset: '16px 20px 20px' };

  return (
    <div
      data-testid="pitch-view"
      data-tour="squad-pitch"
      style={outerStyle}
    >
      <div style={{
        ...insetStyle,
        background:   'linear-gradient(180deg, #0E1218 0%, #0A0D12 100%)',
        borderRadius: 8,
        overflow:     'hidden',
        boxShadow:    'inset 0 0 0 1px var(--rule)',
      }}>

        {/* ── Lane lines ─────────────────────────────────────────── */}
        {[22, 46, 70, 92].map(y => (
          <div key={y} style={{
            position:   'absolute',
            left:       24,
            right:      24,
            top:        `${y}%`,
            height:     1,
            background: 'rgba(0,180,216,.10)',
          }} />
        ))}

        {/* ── Lane labels (on top of lines) ──────────────────────── */}
        {[
          { y: 22, label: 'FWD' },
          { y: 46, label: 'MID' },
          { y: 70, label: 'DEF' },
          { y: 92, label: 'GK'  },
        ].map(l => (
          <div key={l.label} style={{
            position:      'absolute',
            left:          18,
            top:           `${l.y}%`,
            transform:     'translateY(-50%)',
            fontFamily:    'JetBrains Mono, monospace',
            fontSize:      9,
            color:         'rgba(0,180,216,.5)',
            background:    '#0A0D12',
            padding:       '2px 4px',
            letterSpacing: '.18em',
            zIndex:        5,
          }}>
            {l.label}
          </div>
        ))}

        {/* ── Centre accent: halfway line + circle ───────────────── */}
        <div style={{
          position:   'absolute',
          left:       '10%',
          right:      '10%',
          top:        '50%',
          height:     1,
          background: 'rgba(242,238,229,.08)',
        }} />
        <div style={{
          position:     'absolute',
          left:         '50%',
          top:          '50%',
          transform:    'translate(-50%,-50%)',
          width:        160,
          height:       160,
          borderRadius: '50%',
          border:       '1px solid rgba(242,238,229,.06)',
        }} />

        {/* ── Fixture context strip ───────────────────────────────── */}
        <div style={{
          position:        'absolute',
          top:             14,
          left:            18,
          right:           18,
          display:         'flex',
          justifyContent:  'space-between',
          zIndex:          5,
          pointerEvents:   'none',
        }}>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mute)', letterSpacing: '.22em' }}>
            STARTING XI · {formation}
          </div>
          {matchdayLabel && (
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mute)', letterSpacing: '.22em' }}>
              {matchdayLabel}
            </div>
          )}
        </div>

        {/* ── Player tokens ───────────────────────────────────────── */}
        {tokens.map(({ player, no, x, y, isCaptain }) => (
          <HybridToken
            key={player.id}
            player={player}
            no={no}
            x={x}
            y={y}
            isCaptain={isCaptain}
            onClick={swapMode ? () => {} : (onPlayerClick ?? (() => {}))}
            isSelected={selectedPlayerId === player.id}
            compact={isCompact}
          />
        ))}
      </div>
    </div>
  );
}
