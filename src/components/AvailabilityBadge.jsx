/**
 * AvailabilityBadge
 * Displays "🔓 AVAILABLE" badge for flagged players.
 * When isOwn=true, click to toggle flag on/off.
 */
export function AvailabilityBadge({ playerId, isFlagged, isOwn, onToggle, loading = false }) {
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
        title={isOwn ? 'Click to remove availability flag' : `Open for proposals (not yours)`}
      >
        <span>🔓 AVAILABLE</span>
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
        title="Click to flag as available for trades"
      >
        <span>🔒 UNAVAILABLE</span>
      </button>
    );
  }

  return null;
}
