// The Market entry point on My team (desktop header and phone header). A pill with a swap
// icon; when transfers are pending a gold badge shows how many, so the manager can see
// at a glance that something is waiting to be confirmed.
export default function MarketButton({ onClick, pendingCount = 0, testId, style, compact = false }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      aria-label={pendingCount > 0 ? `Market, ${pendingCount} pending change${pendingCount === 1 ? '' : 's'}` : 'Market'}
      className="transition-all active:scale-95"
      style={{
        position: 'relative', display: 'inline-flex', alignItems: 'center', gap: compact ? 5 : 8, flexShrink: 0,
        minHeight: 44, padding: compact ? '0 12px 0 9px' : '0 16px 0 12px', borderRadius: 999, cursor: 'pointer',
        background: 'linear-gradient(180deg, var(--accent) 0%, #14567f 100%)', color: '#fff',
        border: '1px solid #14567f', boxShadow: '0 2px 6px rgba(26,111,168,0.28)',
        fontFamily: 'Archivo Black, sans-serif', fontSize: compact ? 'var(--fs-micro)' : 'var(--fs-label)', letterSpacing: compact ? '0.04em' : '0.08em', textTransform: 'uppercase',
        ...style,
      }}
    >
      <svg width={compact ? 15 : 18} height={compact ? 15 : 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M7 4 3 8l4 4" /><path d="M3 8h13" /><path d="m17 20 4-4-4-4" /><path d="M21 16H8" />
      </svg>
      Market
      {pendingCount > 0 && (
        <span
          data-testid="market-btn-badge"
          style={{
            position: 'absolute', top: -6, right: -2, minWidth: 20, height: 20, padding: '0 5px', borderRadius: 999,
            background: 'var(--gold)', color: '#0A0A0A', border: '2px solid var(--card)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Archivo Black, sans-serif', fontSize: 11, letterSpacing: 0, lineHeight: 1,
          }}
        >
          {pendingCount}
        </span>
      )}
    </button>
  );
}
