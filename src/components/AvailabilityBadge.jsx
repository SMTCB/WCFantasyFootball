// Padlock — open (unlocked shackle) vs closed (locked shackle). The two
// states swap on toggle rather than tracing a single morphing path; the
// `.ffl-icon-morph` bounce (see index.css) sells the transition instead.
function PadlockIcon({ open }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="5" y="10" width="14" height="10" rx="1.5" stroke="currentColor" strokeWidth="2" />
      {open ? (
        <path d="M8 10V7a4 4 0 0 1 7.6-1.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      ) : (
        <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      )}
    </svg>
  );
}

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
        <span key="open" className="ffl-icon-morph" data-active="true">
          <PadlockIcon open />
        </span>
        OPEN FOR TRADE
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
            : 'bg-ink-3 text-paper hover:bg-ink-2 hover:text-paper'
        }`}
        title="Tap to list this player as open for trade proposals"
      >
        <span key="closed" className="ffl-icon-morph" data-active="true">
          <PadlockIcon open={false} />
        </span>
        LIST FOR TRADE
      </button>
    );
  }

  return null;
}
