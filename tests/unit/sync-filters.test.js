/**
 * sync-fixtures / sync-players relevance filters — unit tests
 *
 * Regression guard for the 2026-10-11 incident: enabling the UCL sync pulled Forza's
 * qualifying-round matches (no round number) into `fixtures`, which made sync-players
 * fetch 45 extra clubs and add ~1,400 unpriced players to the market. Pure functions,
 * no DB — plain node:test.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { keepRoundedMatches } from '../../supabase/functions/sync-fixtures/match-filter.js';
import { relevantFixtures } from '../../supabase/functions/sync-players/team-filter.js';

describe('keepRoundedMatches (sync-fixtures)', () => {
  it('drops round-less qualifiers in a round-based competition', () => {
    const out = keepRoundedMatches([{ id: 1, round: 1 }, { id: 2, round: null }, { id: 3, round: 8 }, { id: 4 }]);
    assert.deepEqual(out.map(m => m.id), [1, 3]);
  });
  it('keeps everything when no match has a round (friendlies-style tournament)', () => {
    const all = [{ id: 1, round: null }, { id: 2 }];
    assert.deepEqual(keepRoundedMatches(all), all);
  });
  it('passes empty / missing input through untouched', () => {
    assert.deepEqual(keepRoundedMatches([]), []);
    assert.equal(keepRoundedMatches(undefined), undefined);
  });
});

describe('relevantFixtures (sync-players)', () => {
  it('ignores round-less fixtures so qualifier clubs are never fetched', () => {
    const out = relevantFixtures([
      { home_team: 'Arsenal', round_number: 1 },
      { home_team: 'Lincoln Red Imps', round_number: null },
    ]);
    assert.deepEqual(out.map(f => f.home_team), ['Arsenal']);
  });
  it('keeps all fixtures when the tournament has no rounds at all', () => {
    const all = [{ home_team: 'A', round_number: null }, { home_team: 'B', round_number: null }];
    assert.deepEqual(relevantFixtures(all), all);
  });
  it('tolerates a null fixtures result', () => {
    assert.deepEqual(relevantFixtures(null), []);
  });
});
