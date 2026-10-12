// Pure helper (no DB/network) so the rule is unit-testable — see tests/unit/sync-filters.test.js.
//
// sync-players derives the clubs to fetch from the fixtures table. In a round-based
// competition only fixtures with a round count: round-less rows are qualifying matches whose
// clubs are not in the competition and would flood the player pool with unpriced players.
export function relevantFixtures(fixtures) {
  const list = fixtures ?? [];
  const roundBased = list.some(f => f.round_number != null);
  return roundBased ? list.filter(f => f.round_number != null) : list;
}
