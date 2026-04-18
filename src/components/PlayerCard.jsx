import { LINEUP_STATUS } from '../lib/intelligence';

// ── Position colour config ────────────────────────────────────────────────────
const POS_CONFIG = {
  GK:  { bg: 'rgba(224,168,0,0.12)',  color: '#E0A800', class: 'pos-gk'  },
  DEF: { bg: 'rgba(0,180,216,0.12)',  color: '#00B4D8', class: 'pos-def' },
  MID: { bg: 'rgba(168,85,247,0.12)', color: '#A855F7', class: 'pos-mid' },
  FWD: { bg: 'rgba(239,68,68,0.12)',  color: '#EF4444', class: 'pos-fwd' },
};

// ── Flag map ──────────────────────────────────────────────────────────────────
const FLAG_MAP = {
  FRA: '🇫🇷', BRA: '🇧🇷', ENG: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  ESP: '🇪🇸', BEL: '🇧🇪', POR: '🇵🇹',
  MAR: '🇲🇦', URU: '🇺🇾', ITA: '🇮🇹',
  NOR: '🇳🇴', GER: '🇩🇪', ARG: '🇦🇷',
};

/**
 * PlayerCard — supports two variants:
 *
 *   variant="pitch"  (default) — compact circular card for the pitch view on mobile
 *   variant="row"    — full-width horizontal list row for the desktop roster view
 */
export default function PlayerCard({
  player,
  isCaptain = false,
  isTripleCaptain = false,
  isJoker = false,
  onClick = null,
  isSelected = false,
  isSwapTarget = false,
  showIntelligence = false,
  variant = 'pitch',
}) {
  if (!player) return null;

  const intel    = showIntelligence ? player.intel : null;
  const intelCfg = intel ? LINEUP_STATUS[intel.status] : null;
  const atRisk   = intel && intel.status !== 'fit';
  const flag     = FLAG_MAP[player.club] ?? '🌍';
  const posCfg   = POS_CONFIG[player.position] || POS_CONFIG.MID;

  // ── Build tooltip strings ─────────────────────────────────────────────────
  const captainTooltip = isTripleCaptain
    ? 'Triple Captain chip active — All-or-Nothing (3× points or 0)'
    : 'Squad Captain — 2× points multiplier this matchday';
  const jokerTooltip = 'Daily Joker — Country limit exempt this matchday';
  const intelTooltip = intel
    ? `${intelCfg?.label ?? 'Unknown'} — ${intel.confidence}% confidence${intel.reason ? `. ${intel.reason}` : ''}`
    : '';

  // ══════════════════════════════════════════════════════════════════════════
  // VARIANT: ROW — Desktop horizontal list item
  // ══════════════════════════════════════════════════════════════════════════
  if (variant === 'row') {
    return (
      <div
        onClick={() => onClick?.(player)}
        className={`relative flex items-center gap-3 px-4 py-3 border-b border-border transition-all cursor-pointer
          ${isSelected    ? 'bg-cyan/10 border-l-2 border-l-cyan'                   : ''}
          ${isSwapTarget  ? 'bg-positive/10 ring-1 ring-inset ring-positive/40'     : ''}
          ${player.isDummy ? 'opacity-40 grayscale pointer-events-none'            : ''}
          ${!isSelected && !isSwapTarget && !player.isDummy ? 'hover:bg-surface-2'  : ''}
        `}
      >
        {/* Captain gold bar accent */}
        {isCaptain && !isSelected && (
          <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gold" />
        )}

        {/* Position badge */}
        <div
          className="shrink-0 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-sm tabular-nums"
          style={{ background: posCfg.bg, color: posCfg.color, fontFamily: 'Barlow Condensed, sans-serif' }}
        >
          {player.position}
        </div>

        {/* Flag */}
        <span className="text-sm shrink-0 leading-none">{flag}</span>

        {/* Name + status */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`text-[13px] font-semibold leading-tight truncate ${isCaptain ? 'text-gold' : 'text-white'}`}
              style={{ fontFamily: 'DM Sans, sans-serif' }}
            >
              {player.name}
            </span>

            {isCaptain && (
              <span
                title={captainTooltip}
                className="fz-tooltip shrink-0 text-[8px] font-black px-1.5 py-0.5 rounded-sm cursor-help"
                style={{ background: isTripleCaptain ? '#E0A800' : 'rgba(224,168,0,0.2)', color: isTripleCaptain ? '#000' : '#E0A800', fontFamily: 'Barlow Condensed, sans-serif' }}
              >
                {isTripleCaptain ? '3×C' : 'C'}
              </span>
            )}

            {isJoker && (
              <span
                title={jokerTooltip}
                className="shrink-0 text-[8px] font-black bg-purple/20 text-purple px-1.5 py-0.5 rounded-sm cursor-help"
                style={{ fontFamily: 'Barlow Condensed, sans-serif' }}
              >
                JOKER
              </span>
            )}
          </div>

          {/* Subtitle: club + status */}
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-text-tertiary font-medium">{player.club}</span>
            {intel && intelCfg && (
              <span
                title={intelTooltip}
                className="text-[9px] font-black px-1.5 py-0.5 rounded-sm cursor-help uppercase tracking-wider"
                style={{ color: intelCfg.color, background: intelCfg.bg, fontFamily: 'Barlow Condensed, sans-serif' }}
              >
                {intelCfg.label}
              </span>
            )}
          </div>
        </div>

        {/* Points */}
        <div
          className="text-[20px] font-black tabular-nums text-white shrink-0 leading-none"
          style={{ fontFamily: 'Barlow Condensed, sans-serif' }}
        >
          {player.points || 0}
          <span className="text-[9px] text-text-tertiary font-normal ml-0.5">pts</span>
        </div>

        {/* Chevron */}
        <svg className="w-3 h-3 text-text-tertiary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VARIANT: PITCH — Compact circular card for mobile pitch view
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div
      onClick={() => !player.isDummy && onClick?.(player)}
      className={`flex flex-col items-center justify-center -space-y-1 ${!player.isDummy && onClick ? 'cursor-pointer active:scale-95 transition-transform' : ''} ${player.gridClass || ''}`}
    >
      <div className="relative group">
        {/* Avatar circle */}
        <div
          className={`w-11 h-11 rounded-full flex flex-col items-center justify-center shadow-lg transition-all relative overflow-hidden border-[1.5px] ${
            isSelected   ? 'border-cyan scale-110 shadow-[0_0_12px_rgba(0,180,216,0.5)]' :
            isSwapTarget ? 'border-positive animate-pulse'                                 :
            isCaptain    ? 'border-gold'                                                   :
            isJoker      ? 'border-purple shadow-[0_0_8px_rgba(168,85,247,0.4)]'            :
            atRisk       ? 'border-negative/40'                                            :
            player.isDummy ? 'border-border/30 border-dashed'                              :
            'border-border-2'
          }`}
          style={{ background: isSelected ? 'rgba(0,180,216,0.15)' : player.isDummy ? 'transparent' : '#0F1218' }}
        >
          <span className="text-[10px] font-black uppercase" style={{ color: posCfg.color }}>
            {player.name.substring(0, 2)}
          </span>
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        </div>

        {/* Flag badge (top-right) */}
        <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full border border-black shadow-md flex items-center justify-center text-[9px] bg-surface-2 overflow-hidden">
          {flag}
        </div>

        {/* Captain badge (bottom-left) */}
        {isCaptain && (
          <div
            title={captainTooltip}
            className={`absolute -bottom-0.5 -left-0.5 text-[7px] font-black min-w-[14px] h-[14px] rounded-[2px] flex items-center justify-center z-10 px-0.5 cursor-help fz-tooltip
              ${isTripleCaptain
                ? 'bg-gold text-black shadow-[0_0_6px_rgba(224,168,0,0.5)]'
                : 'bg-gold/90 text-black'
              }`}
            style={{ fontFamily: 'Barlow Condensed, sans-serif' }}
          >
            {isTripleCaptain ? '3×' : 'C'}
          </div>
        )}

        {/* Joker badge (bottom-left, if no captain) */}
        {isJoker && !isCaptain && (
          <div
            title={jokerTooltip}
            className="absolute -bottom-0.5 -left-0.5 bg-purple text-white text-[7px] font-black w-3.5 h-3.5 rounded-[2px] flex items-center justify-center shadow-sm z-10 cursor-help"
            style={{ fontFamily: 'Barlow Condensed, sans-serif' }}
          >
            J
          </div>
        )}

        {/* Intelligence status dot (top-left) */}
        {intelCfg && (
          <div
            title={intelTooltip}
            className="absolute -top-0.5 -left-0.5 w-3 h-3 rounded-full border border-black z-10 cursor-help"
            style={{ backgroundColor: intelCfg.color }}
          />
        )}

        {/* Points badge (bottom-right) */}
        <div
          className="absolute -bottom-1 -right-1.5 bg-white text-black text-[10px] font-black px-1.5 py-0.5 rounded-sm shadow-[0_2px_4px_rgba(0,0,0,0.5)] tabular-nums border border-black/10"
          style={{ fontFamily: 'Barlow Condensed, sans-serif' }}
        >
          {player.points || 0}
        </div>
      </div>

      {/* Name label */}
      <div className="pt-2 text-center max-w-[80px]">
        <div className={`text-[9px] font-bold truncate uppercase tracking-tight ${isSelected ? 'text-cyan' : atRisk ? 'text-gold/80' : 'text-text-primary'}`}>
          {player.name.split(' ').pop()}
        </div>
        {intelCfg && atRisk && (
          <div
            className="text-[7px] font-black uppercase tracking-wider mt-[1px] leading-none"
            style={{ color: intelCfg.color, fontFamily: 'Barlow Condensed, sans-serif' }}
          >
            {intelCfg.label}
          </div>
        )}
        {isCaptain && isTripleCaptain && (
          <div
            className="text-[6px] font-black text-gold uppercase tracking-widest mt-0.5 animate-pulse"
            style={{ fontFamily: 'Barlow Condensed, sans-serif' }}
          >
            All or Nothing
          </div>
        )}
      </div>
    </div>
  );
}
