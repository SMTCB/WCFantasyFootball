/**
 * EventTimeline — Enhanced match events display
 * Shows match events in a vertical timeline with icons, minutes, and team/player info
 *
 * Features:
 * - Event icons (⚽ goal, 🅰️ assist, 🟨 yellow, 🔴 red, 🔄 sub, 🥅 save, ⚫ own goal, ⚠️ VAR)
 * - Minute markers on the left
 * - Color-coded event types
 * - Team name and player info
 * - Points value
 * - Smooth animations
 */
export function EventTimeline({ events = [], loading = false }) {
  const EVENT_ICONS = {
    goal: { emoji: '⚽', label: 'GOAL', color: 'var(--positive)', bgColor: 'rgba(34,197,86,0.1)' },
    assist: { emoji: '🅰️', label: 'ASSIST', color: 'var(--positive)', bgColor: 'rgba(34,197,86,0.08)' },
    yellow: { emoji: '🟨', label: 'YELLOW', color: 'var(--warn)', bgColor: 'rgba(245,158,11,0.08)' },
    red: { emoji: '🔴', label: 'RED', color: 'var(--danger)', bgColor: 'rgba(239,68,68,0.1)' },
    sub: { emoji: '🔄', label: 'SUBSTITUTION', color: 'var(--cyan)', bgColor: 'rgba(0,180,216,0.08)' },
    penalty_saved: { emoji: '🥅', label: 'PENALTY SAVED', color: 'var(--cyan)', bgColor: 'rgba(0,180,216,0.08)' },
    own_goal: { emoji: '⚫', label: 'OWN GOAL', color: 'var(--danger)', bgColor: 'rgba(239,68,68,0.1)' },
    var: { emoji: '⚠️', label: 'VAR REVIEW', color: 'var(--warn)', bgColor: 'rgba(245,158,11,0.08)' },
  };

  const getEventInfo = (type) => EVENT_ICONS[type] || { emoji: '•', label: 'EVENT', color: 'var(--mute)', bgColor: 'rgba(255,255,255,0.03)' };

  const getPointsColor = (type) => {
    if (type === 'goal' || type === 'penalty_saved') return 'var(--positive)';
    if (type === 'red' || type === 'own_goal') return 'var(--danger)';
    if (type === 'yellow') return 'var(--warn)';
    return 'var(--mute)';
  };

  const getPoints = (type) => {
    const pointMap = {
      goal: '+6',
      assist: '+3',
      yellow: '−1',
      red: '−3',
      penalty_saved: '+5',
      own_goal: '−2',
      var: '...',
    };
    return pointMap[type] || '';
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-xs text-text-tertiary font-bold uppercase tracking-widest animate-pulse">
        Loading live events...
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="p-8 text-center text-xs text-text-tertiary font-bold uppercase tracking-widest">
        ⏳ Awaiting Kickoff...
      </div>
    );
  }

  return (
    <div className="bg-[#0d0d0d]">
      {/* Timeline header with minute scale hint */}
      <div className="px-4 py-2 border-b border-white/5 flex items-center gap-3">
        <div className="text-[9px] font-bold uppercase tracking-widest text-text-tertiary">
          Timeline
        </div>
        <div className="flex-1 h-px bg-white/5" />
      </div>

      {/* Events list with vertical timeline */}
      <div className="relative">
        {/* Vertical timeline line */}
        <div
          className="absolute left-[52px] top-0 bottom-0 w-px bg-gradient-to-b from-white/10 to-transparent"
          style={{ opacity: 0.3 }}
        />

        {events.map((e, i) => {
          const info = getEventInfo(e.type);
          const isVar = e.type === 'var';
          const minute = e.minute ? `${e.minute}'` : '—';

          return (
            <div
              key={i}
              className="relative px-4 py-3.5 border-b border-white/5 flex gap-4 items-stretch transition-all hover:bg-white/3"
              style={{
                background: isVar ? 'rgba(255,179,0,0.04)' : info.bgColor,
                animationDelay: `${i * 30}ms`,
              }}
            >
              {/* Minute marker on the left */}
              <div
                className="flex flex-col items-center justify-start shrink-0 w-12 pt-1"
                style={{
                  borderLeft: '2px solid',
                  borderColor: info.color,
                  paddingLeft: '10px',
                }}
              >
                <div
                  className="text-[10px] font-black tabular-nums uppercase tracking-widest mb-1"
                  style={{ color: info.color }}
                >
                  {minute}
                </div>
                {/* Dot on timeline */}
                <div
                  className="w-2.5 h-2.5 rounded-full -ml-[19px] border-2 border-bg"
                  style={{
                    backgroundColor: info.color,
                    boxShadow: `0 0 8px ${info.color}40`,
                  }}
                />
              </div>

              {/* Event icon and info */}
              <div className="flex-1 min-w-0 flex gap-3 items-start">
                {/* Event icon */}
                <div
                  className="text-2xl shrink-0 flex items-center justify-center w-8 h-8 rounded-sm"
                  style={{ backgroundColor: `${info.color}20` }}
                >
                  {info.emoji}
                </div>

                {/* Event details */}
                <div className="flex-1 min-w-0 pt-0.5">
                  {isVar ? (
                    <>
                      <div
                        className="text-[13px] font-black leading-tight uppercase tracking-wider"
                        style={{ color: info.color }}
                      >
                        {info.label}
                      </div>
                      <div className="text-[11px] text-text-tertiary mt-0.5">
                        Goal decision in review — {e.playerName || e.players?.name} ({e.team})
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-[13px] font-bold truncate leading-tight">
                        {e.playerName || e.players?.name}
                      </div>
                      <div className="text-[11px] text-text-tertiary mt-0.5 flex items-center gap-2 flex-wrap">
                        <span>{e.team}</span>
                        <span className="text-white/30">·</span>
                        <span
                          className="font-semibold uppercase tracking-wider"
                          style={{ color: info.color }}
                        >
                          {info.label}
                        </span>
                        {e.leagueName && (
                          <>
                            <span className="text-white/30">·</span>
                            <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-sm" style={{ background: 'rgba(0,180,216,0.12)', color: 'var(--cyan)' }}>
                              {e.leagueName}
                            </span>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Points badge */}
                <div className="shrink-0 flex flex-col items-end gap-1">
                  <div
                    className="text-[13px] font-black tabular-nums px-2 py-1 rounded-sm"
                    style={{ color: getPointsColor(e.type) }}
                  >
                    {getPoints(e.type)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer with event count */}
      <div className="px-4 py-2 border-t border-white/5 text-[9px] text-text-tertiary font-semibold uppercase tracking-widest">
        {events.length} event{events.length !== 1 ? 's' : ''} · Live
      </div>
    </div>
  );
}
