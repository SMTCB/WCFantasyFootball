import { LINEUP_STATUS } from '../lib/intelligence';
import { formatFixtureStatus } from '../lib/players';
import PlayerRow    from './PlayerRow';
import PositionChip from './PositionChip';
import StatusDot    from './StatusDot';
import CaptainPill  from './CaptainPill';

import { POS_TONE } from '../lib/formations';

const lastName = (name = '') => {
  const parts = name.trim().split(' ');
  const last  = parts[parts.length - 1];
  return last.length > 8 ? last.substring(0, 8) : last;
};

/**
 * PlayerCard — two variants:
 *   variant="row"   — delegates to <PlayerRow> (spec §4.4)
 *   variant="pitch" — horizontal nameplate on the pitch (spec §4.6)
 */
export default function PlayerCard({
  player,
  isCaptain       = false,
  isTripleCaptain = false,
  isJoker         = false,
  onClick         = null,
  isSelected      = false,
  isSwapTarget    = false,
  showIntelligence = false,
  showPrice       = false,
  action          = null,
  variant         = 'pitch',
}) {
  if (!player) return null;

  const intel    = showIntelligence ? player.intel : null;
  const status   = intel?.status ?? 'fit';
  const isDummy  = player.isDummy;
  const toneColor = POS_TONE[player.position] ?? 'var(--mute)';
  const fixtureStatus = formatFixtureStatus(player.fixtureInfo);

  /* ── ROW variant — delegate to PlayerRow ──────────────────────── */
  if (variant === 'row') {
    return (
      <PlayerRow
        player={{ ...player, isJoker }}
        isCaptain={isCaptain}
        isTripleCaptain={isTripleCaptain}
        isSelected={isSelected}
        isSwapTarget={isSwapTarget}
        showPoints
        showPrice={showPrice}
        showStatus={false}
        action={action}
        onClick={onClick}
      />
    );
  }

  /* ── PITCH variant — spec §4.6 horizontal nameplate ──────────── */
  const numBg    = isCaptain ? 'var(--gold)' : 'transparent';
  const numColor = isCaptain ? 'var(--ink)'  : 'var(--cyan)';
  const numBorder = isCaptain ? 'none' : '1px solid var(--cyan)';

  const cardBorder = isSelected
    ? '1px solid var(--cyan)'
    : isSwapTarget
    ? '1px solid var(--positive)'
    : '1px solid var(--rule)';

  const cardBg = isSelected
    ? 'rgba(0,180,216,0.1)'
    : isSwapTarget
    ? 'rgba(34,197,94,0.08)'
    : 'rgba(15,18,24,0.92)';

  if (isDummy) {
    return (
      <button
        type="button"
        onClick={() => onClick?.(player)}
        disabled={!onClick}
        className={`flex items-center ${player.gridClass || ''}`}
        style={{
          gap:            6,
          minWidth:       100,
          background:     'rgba(15,18,24,0.6)',
          border:         '1px dashed var(--rule)',
          padding:        '5px 8px',
          backdropFilter: 'blur(8px)',
          transition:     'border-color 0.15s',
        }}
      >
        <div
          style={{
            width:        32,
            height:       32,
            border:       `1px dashed ${toneColor}`,
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'center',
            flexShrink:   0,
          }}
        >
          <PositionChip pos={player.position} empty mobile />
        </div>
        <div>
          <div
            className="fk-mono"
            style={{ fontSize: 8, color: toneColor, letterSpacing: '0.14em' }}
          >
            {player.position} SLOT
          </div>
          <div
            className="fk-mono"
            style={{ fontSize: 7, color: 'var(--mute)', marginTop: 1 }}
          >
            + SIGN
          </div>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onClick?.(player)}
      disabled={!onClick}
      className={`flex items-center ${player.gridClass || ''}`}
      style={{
        gap:            6,
        minWidth:       window?.innerWidth < 640 ? 80 : 148,
        background:     cardBg,
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border:         cardBorder,
        padding:        '5px 8px',
        transition:     'border-color 0.15s, background 0.15s',
      }}
      onMouseEnter={e => {
        if (!isSelected && !isSwapTarget)
          e.currentTarget.style.borderColor = 'var(--cyan)';
      }}
      onMouseLeave={e => {
        if (!isSelected && !isSwapTarget)
          e.currentTarget.style.borderColor = 'var(--rule)';
      }}
    >
      {/* Number badge — 32×32, captain=gold fill, else cyan outline */}
      <div
        style={{
          width:          32,
          height:         32,
          background:     numBg,
          border:         numBorder,
          color:          numColor,
          fontFamily:     'Archivo Black, sans-serif',
          fontSize:       12,
          fontWeight:     900,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          flexShrink:     0,
          letterSpacing:  '-0.02em',
        }}
      >
        {Math.round(player.points ?? 0)}
      </div>

      {/* Two-line block: name + metadata */}
      <div className="min-w-0 flex-1">
        {/* Status dot + name */}
        <div className="flex items-center" style={{ gap: 4 }}>
          {intel && <StatusDot status={status} mobile />}
          <span
            className="fk-display truncate"
            style={{
              fontSize:    window?.innerWidth < 640 ? 8 : 10,
              color:       isCaptain ? 'var(--gold)' : 'var(--paper)',
              letterSpacing: '-0.01em',
            }}
          >
            {lastName(player.name).toUpperCase()}
          </span>
          {isCaptain && <CaptainPill triple={isTripleCaptain} />}
        </div>

        {/* Club · pts metadata */}
        <div
          className="fk-mono"
          style={{
            fontSize:    window?.innerWidth < 640 ? 6 : 8,
            color:       'var(--mute)',
            marginTop:   1,
            letterSpacing: '0.1em',
          }}
        >
          {player.club} · {Math.round(player.points ?? 0)} PTS
        </div>

        {/* Fixture timing for the active matchday — kickoff / LIVE / FT score */}
        {fixtureStatus && (
          <div
            className="fk-mono"
            style={{
              fontSize:    window?.innerWidth < 640 ? 6 : 8,
              color:       fixtureStatus.color,
              marginTop:   1,
              letterSpacing: '0.1em',
            }}
          >
            {fixtureStatus.label}
          </div>
        )}
      </div>

      {/* Swap ring */}
      {isSwapTarget && (
        <div
          className="absolute inset-0 animate-pulse"
          style={{ border: '2px solid rgba(34,197,94,0.5)', pointerEvents: 'none' }}
        />
      )}
    </button>
  );
}
