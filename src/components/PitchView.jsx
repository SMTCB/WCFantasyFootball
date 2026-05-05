import PlayerCard from "./PlayerCard";

const POS_ORDER = ['GK', 'DEF', 'MID', 'FWD'];

// Vertical position of each row as % from top (FWD at top, GK at bottom)
const ROW_TOP = { FWD: '10%', MID: '32%', DEF: '56%', GK: '78%' };

export default function PitchView({
  squad,
  onPlayerClick,
  selectedPlayerId,
  swapMode,
  jokerPlayerId
}) {
  // Group players by position, preserving order within each group
  const byPos = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const p of (squad.players ?? [])) {
    if (byPos[p.position]) byPos[p.position].push(p);
  }

  return (
    <div
      data-testid="pitch-view"
      data-tour="squad-pitch"
      className="relative w-full select-none overflow-hidden"
      style={{
        aspectRatio: '3/2',
        background: 'linear-gradient(180deg, #0E1218 0%, #0A0D12 100%)',
      }}
    >
      {/* ── Pitch markings SVG ────────────────────────────────── */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 300 200"
        preserveAspectRatio="none"
        style={{ opacity: 0.18 }}
      >
        <rect x="8" y="8" width="284" height="184" fill="none" stroke="white" strokeWidth="1.2" rx="0.5" />
        <line x1="150" y1="8" x2="150" y2="192" stroke="white" strokeWidth="0.8" />
        <circle cx="150" cy="100" r="30" fill="none" stroke="white" strokeWidth="0.8" />
        <circle cx="150" cy="100" r="2" fill="white" />
        <rect x="85" y="8" width="130" height="42" fill="none" stroke="white" strokeWidth="0.8" />
        <rect x="118" y="8" width="64" height="16" fill="none" stroke="white" strokeWidth="0.8" />
        <circle cx="150" cy="38" r="1.5" fill="white" />
        <path d="M 130 50 A 28 28 0 0 1 170 50" fill="none" stroke="white" strokeWidth="0.8" />
        <rect x="85" y="150" width="130" height="42" fill="none" stroke="white" strokeWidth="0.8" />
        <rect x="118" y="176" width="64" height="16" fill="none" stroke="white" strokeWidth="0.8" />
        <circle cx="150" cy="162" r="1.5" fill="white" />
        <path d="M 130 150 A 28 28 0 0 0 170 150" fill="none" stroke="white" strokeWidth="0.8" />
        <path d="M 8 16 A 8 8 0 0 1 16 8" fill="none" stroke="white" strokeWidth="0.6" />
        <path d="M 284 16 A 8 8 0 0 0 292 8" fill="none" stroke="white" strokeWidth="0.6" />
        <path d="M 8 184 A 8 8 0 0 0 16 192" fill="none" stroke="white" strokeWidth="0.6" />
        <path d="M 284 184 A 8 8 0 0 1 292 192" fill="none" stroke="white" strokeWidth="0.6" />
      </svg>

      {/* ── Gradient vignette ─────────────────────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.4) 100%)' }}
      />

      {/* ── Formation rows ────────────────────────────────────── */}
      {POS_ORDER.slice().reverse().map(pos => {
        const rowPlayers = byPos[pos];
        if (!rowPlayers.length) return null;
        return (
          <div
            key={pos}
            className="absolute left-0 right-0 flex items-center justify-around px-4"
            style={{
              top: ROW_TOP[pos],
              transform: 'translateY(-50%)',
              zIndex: 10,
            }}
          >
            {/* Position label */}
            <div
              className="absolute left-2 fk-mono"
              style={{ fontSize: 7, color: 'rgba(0,196,232,0.35)', letterSpacing: '0.14em', pointerEvents: 'none' }}
            >
              {pos}
            </div>
            {rowPlayers.map(player => (
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
        );
      })}

      {/* ── Daily Joker Slot ──────────────────────────────────── */}
      {!swapMode && (
        <div className="absolute right-2 top-2 z-20 flex flex-col items-center">
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
                className="w-[42px] h-[42px] flex items-center justify-center transition-all"
                style={{
                  border: '2px dashed rgba(157,95,245,0.45)',
                  background: 'rgba(157,95,245,0.08)',
                  boxShadow: '0 0 16px rgba(157,95,245,0.15)',
                }}
              >
                <span className="text-[16px] font-black leading-none" style={{ color: 'var(--pos-gk)' }}>+</span>
              </div>
              <div
                className="text-[7px] font-black uppercase mt-1"
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
