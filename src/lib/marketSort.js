// Market sort options (FB-15). Players you already own stay at the top whatever
// the sort; inside each group the chosen order applies, then price (high first),
// then name, so the list never reshuffles between renders.
//
// statsMap:   { [playerId]: [pts|null, ...] } most recent round first (usePlayerStats)
// minutesMap: { [playerId]: totalMinutes } this season (usePlayerStats)

export const MARKET_SORTS = [
  { id: 'price',    label: 'Price',    needsStats: false },
  { id: 'cheapest', label: 'Cheapest', needsStats: false },
  { id: 'points',   label: 'Points',   needsStats: true  },
  { id: 'form',     label: 'Form',     needsStats: true  },
  { id: 'minutes',  label: 'Minutes',  needsStats: true  },
];

export const DEFAULT_MARKET_SORT = 'price';

export function isMarketSort(id) {
  return MARKET_SORTS.some(s => s.id === id);
}

const sum = (rounds) => (rounds ?? []).reduce((s, v) => s + (v ?? 0), 0);

// Form = points over the last 5 rounds, the same window the form strip shows.
export const FORM_ROUNDS = 5;

function sortValue(sortKey, player, statsMap, minutesMap) {
  switch (sortKey) {
    case 'cheapest': return -(player.price ?? 0);
    case 'points':   return sum(statsMap?.[player.id]);
    case 'form':     return sum(statsMap?.[player.id]?.slice(0, FORM_ROUNDS));
    case 'minutes':  return minutesMap?.[player.id] ?? 0;
    default:         return player.price ?? 0;
  }
}

export function sortMarketPlayers(players, { sortKey = DEFAULT_MARKET_SORT, ownedIds = [], statsMap = {}, minutesMap = {} } = {}) {
  const owned = new Set(ownedIds);
  const key = isMarketSort(sortKey) ? sortKey : DEFAULT_MARKET_SORT;
  return [...players].sort((a, b) => {
    const ownedDiff = (owned.has(b.id) ? 1 : 0) - (owned.has(a.id) ? 1 : 0);
    if (ownedDiff !== 0) return ownedDiff;
    const diff = sortValue(key, b, statsMap, minutesMap) - sortValue(key, a, statsMap, minutesMap);
    if (diff !== 0) return diff;
    const priceDiff = (b.price ?? 0) - (a.price ?? 0);
    if (priceDiff !== 0) return priceDiff;
    return String(a.name ?? '').localeCompare(String(b.name ?? ''));
  });
}
