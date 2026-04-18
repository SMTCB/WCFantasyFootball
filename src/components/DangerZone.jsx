import { LINEUP_STATUS } from '../lib/intelligence';

/**
 * DangerZone — Horizontal alert rail showing at-risk squad players.
 * Compact on mobile (horizontal scroll), list on desktop within sidebar.
 */
export default function DangerZone({ players = [], onSelectPlayer }) {
  if (players.length === 0) {
    return (
      <div className="px-4 py-3 flex items-center gap-2.5">
        <div className="w-1.5 h-1.5 rounded-full bg-positive shrink-0" />
        <div
          className="text-[11px] font-semibold text-positive/70 uppercase tracking-widest"
          style={{ fontFamily: 'DM Sans, sans-serif' }}
        >
          All clear — No injury alerts
        </div>
      </div>
    );
  }

  const outCount      = players.filter(p => p.intel.status === 'out').length;
  const doubtfulCount = players.filter(p => p.intel.status === 'doubt').length;

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <div className="w-0.5 h-4 bg-negative shrink-0 rounded-full" />
        <span
          className="text-[11px] font-black uppercase tracking-[0.2em] text-negative"
          style={{ fontFamily: 'Barlow Condensed, sans-serif' }}
        >
          Danger Zone
        </span>
        <div className="flex items-center gap-1 ml-1">
          {outCount > 0 && (
            <span className="text-[8px] font-black px-1.5 py-0.5 rounded-sm bg-negative/15 text-negative uppercase tracking-wider">
              {outCount} OUT
            </span>
          )}
          {doubtfulCount > 0 && (
            <span className="text-[8px] font-black px-1.5 py-0.5 rounded-sm bg-gold/15 text-gold uppercase tracking-wider">
              {doubtfulCount} DOUBT
            </span>
          )}
        </div>
      </div>

      {/* Horizontal scroll alert cards */}
      <div className="flex gap-2 px-4 pb-3 overflow-x-auto">
        {players.map(player => {
          const cfg = LINEUP_STATUS[player.intel.status];
          if (!cfg) return null;
          return (
            <button
              key={player.id}
              onClick={() => onSelectPlayer?.(player)}
              title={`${player.name} — ${cfg.label} (${player.intel.confidence}% confidence)${player.intel.reason ? `. ${player.intel.reason}` : ''}`}
              className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-sm border transition-all hover:brightness-110 active:scale-95"
              style={{ borderColor: cfg.color + '40', backgroundColor: cfg.bg }}
            >
              <span className="text-base leading-none">{cfg.emoji}</span>
              <div className="text-left">
                <div
                  className="text-[11px] font-bold text-white leading-tight"
                  style={{ fontFamily: 'DM Sans, sans-serif' }}
                >
                  {player.name.split(' ').pop()}
                </div>
                <div
                  className="text-[9px] font-black uppercase tracking-wider"
                  style={{ color: cfg.color, fontFamily: 'Barlow Condensed, sans-serif' }}
                >
                  {cfg.label}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
