// Displays the no-repeat relaxation state as a compact sticky banner, mirroring
// TransferWindowBanner's layout. Shown only for Tier 1 leagues (repeatsAllowed === 1)
// where the pool-pressure formula has lifted the one-owner-per-player rule to allow
// exactly two managers per player — higher tiers (2/3+) are intentionally not covered
// by this message, per product decision.

export default function RelaxationBanner({ show }) {
  if (!show) return null;

  const msg = 'The player pool has tightened as clubs are eliminated — due to this pressure, it’s now possible for up to two managers in this league to own the same player.';

  return (
    <div className="fk-sysbar info" style={{ '--msg-color': 'var(--gold)' }}>
      <span className="fk-sysbar-dot" />
      <span className="fk-sysbar-tag">Shared Ownership</span>
      <span className="fk-sysbar-msg">{msg}</span>
    </div>
  );
}
