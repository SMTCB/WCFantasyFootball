/**
 * VARReviewBanner — Enhanced VAR review indicator
 * Shows prominent banner when a goal decision is under VAR review
 *
 * Features:
 * - Animated pulsing banner with gold/yellow theme
 * - Player name and team info
 * - "Under Review" animated text
 * - Countdown/waiting indicator
 * - Auto-dismisses when review resolves
 */
export function VARReviewBanner({ event, isVisible = true }) {
  if (!isVisible || !event) return null;

  return (
    <div className="relative overflow-hidden bg-gradient-to-r from-[#1a1100] to-[#2a1a00] border-l-4 border-[#FFB300] py-3 px-4 flex items-center gap-3 animate-slide-up">
      {/* Animated background pulse */}
      <div
        className="absolute inset-0 opacity-20 animate-pulse"
        style={{
          background: 'linear-gradient(90deg, #FFB300 0%, transparent 50%, #FFB300 100%)',
          animation: 'slideHorizontal 3s ease-in-out infinite',
        }}
      />

      {/* Content container */}
      <div className="relative z-10 flex items-start gap-3 w-full">
        {/* VAR icon with animation */}
        <div className="shrink-0 flex flex-col items-center justify-center">
          <div className="text-2xl animate-bounce" style={{ animationDuration: '1.5s' }}>
            ⚠️
          </div>
          <div
            className="fk-mono text-[10px] font-black text-[#FFB300] uppercase tracking-[0.15em] mt-1 animate-pulse"
            style={{ animationDuration: '1s' }}
          >
            VAR
          </div>
        </div>

        {/* Text content */}
        <div className="flex-1 min-w-0">
          <div
            className="text-[13px] font-black text-[#FFB300] uppercase tracking-[0.15em] mb-1"
            style={{
              textShadow: '0 0 12px rgba(255,179,0,0.5)',
              animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            }}
          >
            GOAL UNDER REVIEW
          </div>
          <div className="text-[12px] font-bold text-white mb-0.5">
            {event.playerName || event.players?.name}
          </div>
          <div className="text-[10px] text-[#D4A574] flex items-center gap-2">
            <span>{event.team}</span>
            <span className="text-white/40">·</span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#FFB300] animate-pulse" />
              Decision pending...
            </span>
          </div>
        </div>

        {/* Action indicator */}
        <div className="shrink-0 text-right">
          <div className="text-[10px] font-black text-[#FFB300] uppercase tracking-widest">
            LIVE
          </div>
          <div className="text-[9px] text-[#9E9E9E] font-semibold mt-1">
            Projections locked
          </div>
        </div>
      </div>

      {/* Subtle animation styles */}
      <style>{`
        @keyframes slideHorizontal {
          0%, 100% { transform: translateX(-100%); }
          50% { transform: translateX(100%); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}
