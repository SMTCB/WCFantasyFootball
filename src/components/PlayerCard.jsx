import { LINEUP_STATUS } from '../lib/intelligence';

/* ── Position colour config ─────────────────────────────────────────────────── */
const POS_CONFIG = {
  GK:  { bg: 'rgba(240,180,0,0.14)',  color: '#F0B400', label: 'GK'  },
  DEF: { bg: 'rgba(0,196,232,0.14)',  color: '#00C4E8', label: 'DEF' },
  MID: { bg: 'rgba(157,95,245,0.14)', color: '#9D5FF5', label: 'MID' },
  FWD: { bg: 'rgba(240,58,58,0.14)',  color: '#F03A3A', label: 'FWD' },
};

/* ── Flag map ───────────────────────────────────────────────────────────────── */
const FLAG_MAP = {
  FRA: '🇫🇷', BRA: '🇧🇷', ENG: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  ESP: '🇪🇸', BEL: '🇧🇪', POR: '🇵🇹',
  MAR: '🇲🇦', URU: '🇺🇾', ITA: '🇮🇹',
  NOR: '🇳🇴', GER: '🇩🇪', ARG: '🇦🇷',
  EGY: '🇪🇬', NED: '🇳🇱', CRO: '🇭🇷',
};

/* ── Helpers ────────────────────────────────────────────────────────────────── */
const lastName = (name = '') => {
  const parts = name.trim().split(' ');
  const last  = parts[parts.length - 1];
  return last.length > 7 ? last.substring(0, 7) : last;
};

/**
 * PlayerCard — two variants:
 *   variant="pitch"  — compact node for the pitch grid (default)
 *   variant="row"    — full-width horizontal list item
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
  variant         = 'pitch',
}) {
  if (!player) return null;

  const intel    = showIntelligence ? player.intel : null;
  const intelCfg = intel ? LINEUP_STATUS[intel.status] : null;
  const atRisk   = intel && intel.status !== 'fit';
  const flag     = FLAG_MAP[player.club] ?? '🌍';
  const posCfg   = POS_CONFIG[player.position] || POS_CONFIG.MID;
  const isDummy  = player.isDummy;

  const captainTip = isTripleCaptain
    ? 'Triple Captain — All-or-Nothing (3× or 0)'
    : 'Captain — 2× points this matchday';
  const jokerTip  = 'Daily Joker — Country limit exempt';
  const intelTip  = intel
    ? `${intelCfg?.label ?? 'Unknown'} · ${intel.confidence}% confidence${intel.reason ? `. ${intel.reason}` : ''}`
    : '';

  /* ════════════════════════════════════════════════════════════════════════════
     ROW variant — desktop horizontal list
  ════════════════════════════════════════════════════════════════════════════ */
  if (variant === 'row') {
    return (
      <button
        type="button"
        onClick={() => onClick?.(player)}
        className="w-full text-left relative flex items-center gap-3 px-4 py-3 transition-all duration-150 cursor-pointer"
        style={{
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: isSelected
            ? 'rgba(0,196,232,0.08)'
            : isSwapTarget
            ? 'rgba(24,201,107,0.07)'
            : isDummy
            ? 'transparent'
            : 'transparent',
          borderLeft: isSelected ? '2px solid #00C4E8' : isCaptain && !isSelected ? '2px solid #F0B400' : '2px solid transparent',
          opacity: isDummy ? 0.35 : 1,
          pointerEvents: isDummy ? 'none' : 'auto',
        }}
        onMouseEnter={e => {
          if (!isSelected && !isSwapTarget && !isDummy)
            e.currentTarget.style.background = 'rgba(255,255,255,0.025)';
        }}
        onMouseLeave={e => {
          if (!isSelected && !isSwapTarget)
            e.currentTarget.style.background = 'transparent';
        }}
      >
        {/* Position badge */}
        <div
          className="shrink-0 w-[30px] text-center rounded-sm py-[3px]"
          style={{
            background: posCfg.bg,
            color: posCfg.color,
            fontFamily: 'Barlow Condensed, sans-serif',
            fontSize: '9px',
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {player.position}
        </div>

        {/* Flag */}
        <span className="text-[15px] shrink-0 leading-none">{flag}</span>

        {/* Name + status */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className="text-[13.5px] font-semibold leading-tight truncate"
              style={{
                fontFamily: 'DM Sans, sans-serif',
                color: isCaptain ? '#F0B400' : '#F0F2F5',
              }}
            >
              {player.name}
            </span>

            {isCaptain && (
              <span
                title={captainTip}
                className="shrink-0 text-[8px] font-black px-1.5 py-0.5 rounded-sm"
                style={{
                  background: isTripleCaptain ? '#F0B400' : 'rgba(240,180,0,0.2)',
                  color: isTripleCaptain ? '#000' : '#F0B400',
                  fontFamily: 'Barlow Condensed, sans-serif',
                  letterSpacing: '0.06em',
                }}
              >
                {isTripleCaptain ? '3×C' : 'C'}
              </span>
            )}

            {isJoker && (
              <span
                title={jokerTip}
                className="shrink-0 text-[8px] font-black px-1.5 py-0.5 rounded-sm"
                style={{ background: 'rgba(157,95,245,0.2)', color: '#9D5FF5', fontFamily: 'Barlow Condensed, sans-serif' }}
              >
                JOKER
              </span>
            )}

            {isSwapTarget && (
              <span
                className="shrink-0 text-[8px] font-black px-1.5 py-0.5 rounded-sm"
                style={{ background: 'rgba(24,201,107,0.15)', color: '#18C96B', fontFamily: 'Barlow Condensed, sans-serif' }}
              >
                SWAP
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] font-medium" style={{ color: '#3D4B5C' }}>{player.club}</span>
            {intelCfg && intel && (
              <span
                title={intelTip}
                className="text-[8px] font-black px-1.5 py-0.5 rounded-sm uppercase tracking-wider"
                style={{ color: intelCfg.color, background: intelCfg.bg, fontFamily: 'Barlow Condensed, sans-serif' }}
              >
                {intelCfg.label}
              </span>
            )}
          </div>
        </div>

        {/* Points */}
        <div
          className="text-[22px] font-black tabular-nums shrink-0 leading-none"
          style={{ fontFamily: 'Barlow Condensed, sans-serif', color: '#F0F2F5' }}
        >
          {player.points || 0}
          <span className="text-[9px] font-normal ml-0.5" style={{ color: '#3D4B5C' }}>pts</span>
        </div>

        {/* Chevron */}
        <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: '#3D4B5C' }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    );
  }

  /* ════════════════════════════════════════════════════════════════════════════
     PITCH variant — compact node displayed on the pitch grid
  ════════════════════════════════════════════════════════════════════════════ */
  const ringColor = isSelected
    ? '#00C4E8'
    : isSwapTarget
    ? '#18C96B'
    : isCaptain
    ? '#F0B400'
    : isJoker
    ? '#9D5FF5'
    : atRisk
    ? 'rgba(240,58,58,0.5)'
    : isDummy
    ? 'rgba(255,255,255,0.12)'
    : 'rgba(255,255,255,0.18)';

  return (
    <button
      type="button"
      onClick={() => !isDummy && onClick?.(player)}
      disabled={isDummy || !onClick}
      className={`flex flex-col items-center -space-y-0.5 bg-transparent border-0 p-0 ${!isDummy && onClick ? 'cursor-pointer' : ''} ${player.gridClass || ''}`}
      style={{ transition: 'transform 0.12s ease' }}
      onMouseEnter={e => { if (!isDummy && onClick) e.currentTarget.style.transform = 'scale(1.06)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
    >
      <div className="relative">
        {/* Avatar circle */}
        <div
          className="w-[46px] h-[46px] rounded-full flex flex-col items-center justify-center relative overflow-hidden shadow-lg"
          style={{
            background: isSelected
              ? 'rgba(0,196,232,0.18)'
              : isSwapTarget
              ? 'rgba(24,201,107,0.12)'
              : isDummy
              ? 'transparent'
              : '#0D1117',
            border: `2px solid ${ringColor}`,
            boxShadow: isSelected
              ? `0 0 0 3px rgba(0,196,232,0.25), 0 4px 16px rgba(0,0,0,0.5)`
              : isJoker
              ? `0 0 12px rgba(157,95,245,0.4)`
              : isCaptain
              ? `0 0 10px rgba(240,180,0,0.3)`
              : `0 3px 10px rgba(0,0,0,0.4)`,
            borderStyle: isDummy ? 'dashed' : 'solid',
          }}
        >
          {/* Position colour stripe at top */}
          {!isDummy && (
            <div
              className="absolute top-0 left-0 right-0 h-[3px]"
              style={{ background: posCfg.color, opacity: 0.7 }}
            />
          )}
          <span
            className="text-[11px] font-black uppercase mt-0.5"
            style={{ color: isDummy ? '#3D4B5C' : posCfg.color, fontFamily: 'Barlow Condensed, sans-serif' }}
          >
            {isDummy ? '+' : player.name.substring(0, 2)}
          </span>
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent pointer-events-none" />
        </div>

        {/* Flag — top right */}
        <div
          className="absolute -top-1 -right-1 w-[18px] h-[18px] rounded-full flex items-center justify-center overflow-hidden shadow-md"
          style={{ background: '#1C2333', border: '1.5px solid #080A0E', fontSize: '10px' }}
        >
          {isDummy ? '' : flag}
        </div>

        {/* Captain badge — bottom left */}
        {isCaptain && !isDummy && (
          <div
            title={captainTip}
            className="absolute -bottom-0.5 -left-0.5 min-w-[16px] h-[16px] rounded-[3px] flex items-center justify-center px-0.5 z-10 cursor-help"
            style={{
              background: isTripleCaptain ? '#F0B400' : 'rgba(240,180,0,0.85)',
              color: '#000',
              fontFamily: 'Barlow Condensed, sans-serif',
              fontSize: '8px',
              fontWeight: 900,
              boxShadow: '0 0 6px rgba(240,180,0,0.4)',
            }}
          >
            {isTripleCaptain ? '3×' : 'C'}
          </div>
        )}

        {/* Joker badge — bottom left (if no captain) */}
        {isJoker && !isCaptain && !isDummy && (
          <div
            title={jokerTip}
            className="absolute -bottom-0.5 -left-0.5 w-4 h-4 rounded-[3px] flex items-center justify-center z-10 cursor-help"
            style={{
              background: '#9D5FF5',
              color: '#fff',
              fontFamily: 'Barlow Condensed, sans-serif',
              fontSize: '7px',
              fontWeight: 900,
            }}
          >
            J
          </div>
        )}

        {/* Intel dot — top left */}
        {intelCfg && !isDummy && (
          <div
            title={intelTip}
            className="absolute -top-0.5 -left-0.5 w-[10px] h-[10px] rounded-full border border-bg z-10 cursor-help"
            style={{ background: intelCfg.color }}
          />
        )}

        {/* Points badge — bottom right */}
        {!isDummy && (
          <div
            className="absolute -bottom-1.5 -right-1.5 px-1.5 py-[2px] rounded-sm shadow-lg tabular-nums z-10"
            style={{
              background: '#fff',
              color: '#000',
              fontFamily: 'Barlow Condensed, sans-serif',
              fontSize: '10px',
              fontWeight: 900,
              border: '1.5px solid rgba(0,0,0,0.15)',
            }}
          >
            {player.points || 0}
          </div>
        )}

        {/* Swap pulse ring */}
        {isSwapTarget && (
          <div
            className="absolute inset-0 rounded-full animate-pulse"
            style={{ border: '2px solid rgba(24,201,107,0.5)' }}
          />
        )}
      </div>

      {/* Name label */}
      <div className="pt-3 text-center" style={{ maxWidth: '68px' }}>
        <div
          className="text-[9.5px] font-bold uppercase truncate tracking-tight leading-tight"
          style={{
            color: isSelected ? '#00C4E8' : atRisk ? '#F0B400' : '#F0F2F5',
            fontFamily: 'Barlow Condensed, sans-serif',
            letterSpacing: '0.04em',
          }}
        >
          {isDummy ? 'Empty' : lastName(player.name)}
        </div>

        {intelCfg && atRisk && !isDummy && (
          <div
            className="text-[7px] font-black uppercase leading-none mt-0.5"
            style={{ color: intelCfg.color, fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '0.08em' }}
          >
            {intelCfg.label}
          </div>
        )}

        {isCaptain && isTripleCaptain && !isDummy && (
          <div
            className="text-[6px] font-black uppercase mt-0.5 animate-pulse"
            style={{ color: '#F0B400', fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '0.06em' }}
          >
            All or Nothing
          </div>
        )}
      </div>
    </button>
  );
}
