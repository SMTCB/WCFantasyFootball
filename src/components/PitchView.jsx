import PlayerCard from "./PlayerCard";

export default function PitchView({
  squad,
  onPlayerClick,
  selectedPlayerId,
  swapMode,
  jokerPlayerId
}) {
  return (
    <div
      data-testid="pitch-view"
      className="relative w-full select-none overflow-hidden"
      style={{
        aspectRatio: '3/2',
        background: 'linear-gradient(180deg, #041A08 0%, #062310 40%, #041A08 100%)',
      }}
    >
      {/* ── Alternating pitch stripe texture ─────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `repeating-linear-gradient(
            180deg,
            rgba(255,255,255,0.025) 0px,
            rgba(255,255,255,0.025) 24px,
            rgba(0,0,0,0.06) 24px,
            rgba(0,0,0,0.06) 48px
          )`,
        }}
      />

      {/* ── Pitch markings SVG ────────────────────────────────── */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 300 200"
        preserveAspectRatio="none"
        style={{ opacity: 0.22 }}
      >
        {/* Outer border */}
        <rect x="8" y="8" width="284" height="184" fill="none" stroke="white" strokeWidth="1.2" rx="0.5" />

        {/* Centre line */}
        <line x1="150" y1="8" x2="150" y2="192" stroke="white" strokeWidth="0.8" />

        {/* Centre circle */}
        <circle cx="150" cy="100" r="30" fill="none" stroke="white" strokeWidth="0.8" />
        <circle cx="150" cy="100" r="2" fill="white" />

        {/* Top penalty box */}
        <rect x="85" y="8" width="130" height="42" fill="none" stroke="white" strokeWidth="0.8" />
        {/* Top 6-yard box */}
        <rect x="118" y="8" width="64" height="16" fill="none" stroke="white" strokeWidth="0.8" />
        {/* Top penalty spot */}
        <circle cx="150" cy="38" r="1.5" fill="white" />
        {/* Top penalty arc */}
        <path d="M 130 50 A 28 28 0 0 1 170 50" fill="none" stroke="white" strokeWidth="0.8" />

        {/* Bottom penalty box */}
        <rect x="85" y="150" width="130" height="42" fill="none" stroke="white" strokeWidth="0.8" />
        {/* Bottom 6-yard box */}
        <rect x="118" y="176" width="64" height="16" fill="none" stroke="white" strokeWidth="0.8" />
        {/* Bottom penalty spot */}
        <circle cx="150" cy="162" r="1.5" fill="white" />
        {/* Bottom penalty arc */}
        <path d="M 130 150 A 28 28 0 0 0 170 150" fill="none" stroke="white" strokeWidth="0.8" />

        {/* Corner arcs */}
        <path d="M 8 16 A 8 8 0 0 1 16 8" fill="none" stroke="white" strokeWidth="0.6" />
        <path d="M 284 16 A 8 8 0 0 0 292 8" fill="none" stroke="white" strokeWidth="0.6" />
        <path d="M 8 184 A 8 8 0 0 0 16 192" fill="none" stroke="white" strokeWidth="0.6" />
        <path d="M 284 184 A 8 8 0 0 1 292 192" fill="none" stroke="white" strokeWidth="0.6" />
      </svg>

      {/* ── Gradient vignette ─────────────────────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.35) 100%)',
        }}
      />

      {/* ── Player Grid ──────────────────────────────────────── */}
      <div className="absolute inset-0 px-3 pt-6 pb-3 z-10 grid grid-cols-5 grid-rows-4 items-center justify-items-center">
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
      </div>

      {/* ── Daily Joker Slot ──────────────────────────────────── */}
      {!swapMode && (
        <div className="absolute right-3 top-3 z-20 flex flex-col items-center">
          {squad.joker ? (
            <PlayerCard
              player={{ ...squad.joker, gridClass: '' }}
              variant="pitch"
              isJoker={true}
              onClick={onPlayerClick}
              isSelected={selectedPlayerId === squad.joker.id}
              showIntelligence
            />
          ) : (
            <button
              onClick={() => onPlayerClick({ id: 'joker-empty', isJokerSlot: true })}
              className="flex flex-col items-center gap-0.5 group"
            >
              <div
                className="w-[46px] h-[46px] rounded-full flex items-center justify-center transition-all"
                style={{
                  border: '2px dashed rgba(157,95,245,0.45)',
                  background: 'rgba(157,95,245,0.08)',
                  boxShadow: '0 0 16px rgba(157,95,245,0.15)',
                }}
              >
                <span
                  className="text-[18px] font-black leading-none"
                  style={{ color: 'var(--pos-gk)' }}
                >
                  +
                </span>
              </div>
              <div
                className="text-[7.5px] font-black uppercase mt-1.5"
                style={{ color: 'rgba(157,95,245,0.7)', fontFamily: 'Archivo Black, sans-serif', letterSpacing: '0.1em' }}
              >
                Joker
              </div>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
