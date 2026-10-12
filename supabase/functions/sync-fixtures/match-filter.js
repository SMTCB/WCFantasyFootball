// Pure helper (no DB/network) so the rule is unit-testable — see tests/unit/sync-filters.test.js.
//
// Forza's UCL feed also carries qualifying-round matches with no round number. They can
// never be scored or locked, and each sync would re-insert them if deleted, so drop them —
// but only for round-based competitions; friendlies-style tournaments legitimately have
// no rounds at all.
export function keepRoundedMatches(matches) {
  const roundBased = !!matches?.some(m => m.round);
  return roundBased ? matches.filter(m => m.round) : matches;
}
