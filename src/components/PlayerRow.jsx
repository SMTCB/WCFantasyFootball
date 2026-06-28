import { formatFixtureStatus } from '../lib/players';
import PositionChip from './PositionChip';
import StatusDot    from './StatusDot';
import CaptainPill  from './CaptainPill';

/**
 * PlayerRow — the universal row pattern (spec §4.4).
 *
 * #NN  [POS]  ●  PLAYER NAME  C    CLUB · CTY    14    AVAILABLE    [ACTION]
 *
 * Props:
 *   player          — { id, name, position, club, country, points, price, status }
 *   index           — optional row number (#NN)
 *   isCaptain       — shows CaptainPill
 *   isTripleCaptain — shows 3×C pill
 *   isSelected      — cyan left-border + tinted bg
 *   isSwapTarget    — green tinted bg
 *   showPoints      — render the points column (default true)
 *   showStatus      — render the status word column (default true)
 *   showPrice       — render €/$ price in metadata (default false)
 *   action          — React node for the rightmost column (e.g. a button)
 *   onClick         — click handler
 */
export default function PlayerRow({
  player,
  index,
  isCaptain       = false,
  isTripleCaptain = false,
  isSelected      = false,
  isSwapTarget    = false,
  showPoints      = true,
  showStatus      = true,
  showPrice       = false,
  action,
  onClick,
}) {
  if (!player) return null;

  const status   = player.intel?.status ?? player.status ?? 'fit';
  const isDummy  = player.isDummy;
  const fixtureStatus = formatFixtureStatus(player.fixtureInfo);

  const rowBg = isSelected
    ? 'rgba(0,180,216,0.08)'
    : isSwapTarget
    ? 'rgba(34,197,94,0.07)'
    : 'transparent';

  const leftBorder = isSelected
    ? '2px solid var(--cyan)'
    : isCaptain && !isSelected
    ? '2px solid var(--gold)'
    : '2px solid transparent';

  return (
    <button
      type="button"
      onClick={() => onClick?.(player)}
      disabled={isDummy || !onClick}
      className="w-full text-left relative flex items-center transition-all duration-150"
      style={{
        gap:         12,
        padding:     '10px 16px',
        borderBottom: '1px solid var(--rule)',
        borderLeft:  leftBorder,
        background:  rowBg,
        opacity:     isDummy ? 0.35 : 1,
        pointerEvents: isDummy ? 'none' : undefined,
        cursor:      onClick ? 'pointer' : 'default',
      }}
      onMouseEnter={e => {
        if (!isSelected && !isSwapTarget && !isDummy && onClick)
          e.currentTarget.style.background = 'rgba(242,238,229,0.025)';
      }}
      onMouseLeave={e => {
        if (!isSelected && !isSwapTarget)
          e.currentTarget.style.background = rowBg;
      }}
    >
      {/* Row number */}
      {index != null && (
        <span
          className="fk-mono shrink-0"
          style={{ fontSize: 9, color: 'var(--mute)', width: 20, textAlign: 'right' }}
        >
          #{String(index + 1).padStart(2, '0')}
        </span>
      )}

      {/* Position chip */}
      <PositionChip pos={player.position} empty={isDummy} />

      {/* Status dot + name block */}
      <div className="flex-1 min-w-0 flex items-center" style={{ gap: 8 }}>
        {!isDummy && <StatusDot status={status} />}

        <div className="flex-1 min-w-0">
          {/* Name line */}
          <div className="flex items-center flex-wrap" style={{ gap: 5 }}>
            <span
              className="fk-display truncate"
              style={{
                fontSize:    14,
                color:       isCaptain ? 'var(--gold)' : 'var(--paper)',
                letterSpacing: '-0.01em',
              }}
            >
              {isDummy ? 'EMPTY SLOT' : player.name.toUpperCase()}
            </span>

            {showPrice && !isDummy && player.price > 0 && (
              <span
                className="fk-mono shrink-0"
                style={{ fontSize: 10, color: 'var(--paper)', letterSpacing: '0.04em' }}
              >
                €{Number(player.price).toFixed(1)}M
              </span>
            )}

            {isCaptain && <CaptainPill triple={isTripleCaptain} />}

            {player.isJoker && (
              <span
                className="fk-mono shrink-0"
                style={{ fontSize: 9, fontWeight: 800, color: 'var(--pos-gk)', border: '1px solid var(--pos-gk)', padding: '2px 6px' }}
              >
                JOKER
              </span>
            )}

            {isSwapTarget && (
              <span
                className="fk-mono shrink-0"
                style={{ fontSize: 9, fontWeight: 800, color: 'var(--positive)', border: '1px solid var(--positive)', padding: '2px 6px' }}
              >
                SWAP
              </span>
            )}

            {player.clubEliminated && (
              <span
                className="fk-mono shrink-0"
                style={{ fontSize: 9, fontWeight: 800, color: 'var(--danger)', border: '1px solid var(--danger)', padding: '2px 6px' }}
              >
                ELIMINATED
              </span>
            )}
          </div>

          {/* Metadata line — club + fixture timing for the active matchday */}
          <div
            className="fk-mono mt-0.5 flex items-center"
            style={{ fontSize: 9, color: 'var(--mute)', letterSpacing: '0.14em', gap: 6 }}
          >
            <span className="truncate">
              {isDummy
                ? 'OPEN MARKET TO SIGN'
                : [player.club, player.country].filter(Boolean).join(' · ')}
            </span>
            {!isDummy && fixtureStatus && (
              <span className="shrink-0" style={{ color: fixtureStatus.color }}>
                · {fixtureStatus.label}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Points */}
      {showPoints && !isDummy && (
        <div
          className="fk-display shrink-0 tabular-nums"
          style={{ fontSize: 18, color: 'var(--cyan)', letterSpacing: '-0.02em', minWidth: 28, textAlign: 'right' }}
        >
          {Math.round(player.points ?? 0)}
        </div>
      )}

      {/* Status word */}
      {showStatus && !isDummy && (
        <StatusDot status={status} showLabel mobile={false} />
      )}

      {/* Right-most action slot */}
      {action && <div className="shrink-0 ml-1">{action}</div>}

      {/* Default chevron when no explicit action */}
      {!action && onClick && !isDummy && (
        <svg
          className="w-3 h-3 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          style={{ color: 'var(--mute)' }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>
      )}
    </button>
  );
}
