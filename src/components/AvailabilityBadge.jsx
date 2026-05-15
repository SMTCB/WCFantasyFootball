/**
 * AvailabilityBadge
 * Displays trade-availability status on player cards.
 * When isOwn=true, click to toggle the trade-listing flag on/off.
 */
export function AvailabilityBadge({ isFlagged, isOwn, onToggle, loading = false }) {
  if (!isFlagged && !isOwn) return null;

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onToggle && !loading) {
      onToggle();
    }
  };

  if (isFlagged) {
    return (
      <div
        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold ${
          isOwn
            ? 'bg-cyan-500 text-ink-2 cursor-pointer hover:bg-cyan-600'
            : 'bg-paper border border-rule text-mute'
        }`}
        onClick={isOwn ? handleClick : undefined}
        title={isOwn ? 'Listed for trade — click to remove' : 'Open for trade proposals'}
      >
        <span>🔓 OPEN FOR TRADE</span>
      </div>
    );
  }

  // Not flagged, but editable (isOwn = true)
  if (isOwn) {
    return (
      <button
        onClick={handleClick}
        disabled={loading}
        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition-colors ${
          loading
            ? 'bg-rule text-mute cursor-not-allowed'
            : 'bg-ink-3 text-mute hover:bg-ink-2 hover:text-paper'
        }`}
        title="Tap to list this player as open for trade proposals"
      >
        <span>📋 LIST FOR TRADE</span>
      </button>
    );
  }

  return null;
}
