import { describe, it, expect } from 'vitest';
import { sortMarketPlayers, isMarketSort, MARKET_SORTS } from '../../src/lib/marketSort';

const players = [
  { id: 'a', name: 'Alves',  price: 6.0 },
  { id: 'b', name: 'Bruno',  price: 9.5 },
  { id: 'c', name: 'Costa',  price: 4.5 },
  { id: 'd', name: 'Dias',   price: 6.0 },
];
// Most recent round first, as usePlayerStats returns it.
const statsMap = {
  a: [2, 2, 2, 2, 2, 20],   // 30 season, 10 form
  b: [1, 1, 1, 1, 1],       // 5 season, 5 form
  c: [8, 6, null, 4, 2],    // 20 season, 20 form
};
const minutesMap = { a: 500, b: 900, c: 120 };
const ids = (list) => list.map(p => p.id);

describe('sortMarketPlayers', () => {
  it('defaults to price, highest first, ties by name', () => {
    expect(ids(sortMarketPlayers(players))).toEqual(['b', 'a', 'd', 'c']);
  });

  it('Cheapest puts the lowest price first', () => {
    expect(ids(sortMarketPlayers(players, { sortKey: 'cheapest' }))).toEqual(['c', 'a', 'd', 'b']);
  });

  it('Points ranks by the season total', () => {
    expect(ids(sortMarketPlayers(players, { sortKey: 'points', statsMap }))).toEqual(['a', 'c', 'b', 'd']);
  });

  it('Form only counts the last 5 rounds', () => {
    expect(ids(sortMarketPlayers(players, { sortKey: 'form', statsMap }))).toEqual(['c', 'a', 'b', 'd']);
  });

  it('Minutes ranks by minutes played, players with none last', () => {
    expect(ids(sortMarketPlayers(players, { sortKey: 'minutes', minutesMap }))).toEqual(['b', 'a', 'c', 'd']);
  });

  it('keeps players you own at the top whatever the sort', () => {
    expect(ids(sortMarketPlayers(players, { sortKey: 'cheapest', ownedIds: ['b'] }))).toEqual(['b', 'c', 'a', 'd']);
  });

  it('falls back to price for an unknown sort', () => {
    expect(ids(sortMarketPlayers(players, { sortKey: 'nonsense' }))).toEqual(['b', 'a', 'd', 'c']);
  });

  it('does not reorder the list it was given', () => {
    const input = [...players];
    sortMarketPlayers(input, { sortKey: 'cheapest' });
    expect(ids(input)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('isMarketSort', () => {
  it('accepts every listed sort and rejects anything else', () => {
    for (const s of MARKET_SORTS) expect(isMarketSort(s.id)).toBe(true);
    expect(isMarketSort(null)).toBe(false);
    expect(isMarketSort('price_asc')).toBe(false);
  });
});
