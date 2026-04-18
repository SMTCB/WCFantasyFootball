import PlayerCard from "./PlayerCard";

export default function PitchView({
  squad,
  onPlayerClick,
  selectedPlayerId,
  swapMode,
  jokerPlayerId
}) {
  return (
    <div className="relative w-full aspect-[3/2] overflow-hidden select-none" style={{ background: '#051A0A' }}>

      {/* ── Pitch markings ───────────────────────────────────── */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 300 200"
        preserveAspectRatio="none"
        style={{ opacity: 0.15 }}
      >
        {/* Outer border */}
        <rect x="10" y="10" width="280" height="180" fill="none" stroke="white" strokeWidth="1" />
        {/* Centre line */}
        <line x1="150" y1="10" x2="150" y2="190" stroke="white" strokeWidth="1" />
        {/* Centre circle */}
        <circle cx="150" cy="100" r="28" fill="none" stroke="white" strokeWidth="1" />
        <circle cx="150" cy="100" r="2" fill="white" />
        {/* Top penalty box */}
        <rect x="90" y="10" width="120" height="36" fill="none" stroke="white" strokeWidth="1" />
        {/* Top 6-yard box */}
        <rect x="120" y="10" width="60" height="14" fill="none" stroke="white" strokeWidth="1" />
        {/* Top penalty spot */}
        <circle cx="150" cy="35" r="1.5" fill="white" />
        {/* Bottom penalty box */}
        <rect x="90" y="154" width="120" height="36" fill="none" stroke="white" strokeWidth="1" />
        {/* Bottom 6-yard box */}
        <rect x="120" y="176" width="60" height="14" fill="none" stroke="white" strokeWidth="1" />
        {/* Bottom penalty spot */}
        <circle cx="150" cy="165" r="1.5" fill="white" />
      </svg>

      {/* ── Subtle pitch texture gradient ─────────────────────── */}
      <div
        className="absolute inset-0"
        style={{
          background: 'repeating-linear-gradient(0deg, transparent, transparent 22px, rgba(0,0,0,0.08) 22px, rgba(0,0,0,0.08) 44px)'
        }}
      />

      {/* ── Player Grid ──────────────────────────────────────── */}
      <div className="absolute inset-0 px-2 pt-6 pb-2 z-10 grid grid-cols-5 grid-rows-4 items-center justify-items-center">
        {squad.players.map(player => (
          <PlayerCard
            key={player.id}
            player={player}
            variant="pitch"
            isCaptain={player.id === squad.captainId}
            isTripleCaptain={squad.isTripleCaptain}
            isJoker={player.id === jokerPlayerId}
            onClick={onPlayerClick}
            isSelected={selectedPlayerId === player.id}
            isSwapTarget={swapMode && selectedPlayerId !== player.id}
            showIntelligence
          />
        ))}

        {/* 🃏 Daily Joker Slot (Extra 12th Man) */}
        {!swapMode && (
          <div className="absolute right-4 top-4 flex flex-col items-center">
            {squad.joker ? (
              <PlayerCard
                player={{...squad.joker, gridClass: ''}}
                variant="pitch"
                isJoker={true}
                onClick={onPlayerClick}
                isSelected={selectedPlayerId === squad.joker.id}
                showIntelligence
              />
            ) : (
              <button
                onClick={() => onPlayerClick({ id: 'joker-empty', isJokerSlot: true })}
                className="w-12 h-12 rounded-full border-2 border-dashed border-purple/40 bg-purple/10 flex items-center justify-center group hover:border-purple transition-all shadow-[0_0_15px_rgba(168,85,247,0.2)]"
              >
                <div className="flex flex-col items-center gap-0">
                  <span className="text-purple text-xl font-bold group-hover:scale-125 transition-transform">+</span>
                  <span className="text-[7px] font-black text-purple/80 tracking-tighter -mt-1" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>JOKER</span>
                </div>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
