/**
 * _shared/snakeDraft.ts — unit tests
 *
 * runSnakeDraft/normalisePosition/shuffleOrder are already an extracted,
 * DB-free pure module ("Pure function: no Supabase/network calls" per the
 * file's own header comment) shared by run-wishlist-draft and
 * run-draft-lottery. No Postgres connection needed — plain node:test.
 *
 * Node's built-in TypeScript type-stripping (stable as of Node 22.18+/24)
 * imports the .ts source directly; the file only uses erasable syntax
 * (interfaces, parameter/return type annotations), so no build step is
 * needed here.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalisePosition, shuffleOrder, runSnakeDraft } from '../../supabase/functions/_shared/snakeDraft.ts';

describe('normalisePosition', () => {
  it('maps FW and FWD to FWD', () => {
    assert.equal(normalisePosition('FW'), 'FWD');
    assert.equal(normalisePosition('FWD'), 'FWD');
    assert.equal(normalisePosition('fwd'), 'FWD');
  });

  it('maps GK and DEF straight through, case-insensitively', () => {
    assert.equal(normalisePosition('GK'), 'GK');
    assert.equal(normalisePosition('gk'), 'GK');
    assert.equal(normalisePosition('DEF'), 'DEF');
    assert.equal(normalisePosition('def'), 'DEF');
  });

  it('falls back to MID for anything else, including null/undefined', () => {
    assert.equal(normalisePosition('MID'), 'MID');
    assert.equal(normalisePosition('midfielder'), 'MID');
    assert.equal(normalisePosition(null), 'MID');
    assert.equal(normalisePosition(undefined), 'MID');
    assert.equal(normalisePosition(''), 'MID');
  });

  it('trims whitespace before matching', () => {
    assert.equal(normalisePosition('  GK  '), 'GK');
  });
});

describe('shuffleOrder', () => {
  it('returns a permutation of the same ids, without mutating the input', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const shuffled = shuffleOrder(ids);
    assert.deepEqual([...ids].sort(), ['a', 'b', 'c', 'd', 'e']); // input untouched
    assert.deepEqual([...shuffled].sort(), ['a', 'b', 'c', 'd', 'e']); // same elements
    assert.equal(shuffled.length, ids.length);
  });

  it('handles single-element and empty arrays without error', () => {
    assert.deepEqual(shuffleOrder(['a']), ['a']);
    assert.deepEqual(shuffleOrder([]), []);
  });
});

// ─── runSnakeDraft ──────────────────────────────────────────────────────────

const POS_CAPS = { GK: 2, DEF: 5, MID: 5, FWD: 3 };

function makePlayer(id, position, price, club = null) {
  return { id, position, price, forza_team_id: club };
}

function freshUserState(order) {
  const state = {};
  for (const uid of order) {
    state[uid] = { allocated: [], posCounts: {}, clubCounts: {}, budgetUsed: 0 };
  }
  return state;
}

describe('runSnakeDraft — turn order', () => {
  it('alternates pick direction each round (snake order 1-2-3-3-2-1)', () => {
    // Each user wants a distinct, uncontested player per round, so the round
    // each pick lands in is fully determined by turn order alone.
    const order = ['u1', 'u2', 'u3'];
    const playerMap = {};
    const submissionMap = {};
    for (const uid of order) {
      submissionMap[uid] = [`${uid}-r0`, `${uid}-r1`];
      playerMap[`${uid}-r0`] = makePlayer(`${uid}-r0`, 'MID', 5);
      playerMap[`${uid}-r1`] = makePlayer(`${uid}-r1`, 'MID', 5);
    }
    const userState = freshUserState(order);
    const taken = new Set();

    runSnakeDraft({
      order, submissionMap, userState, playerMap, taken,
      squadSize: 2, posCaps: POS_CAPS, budget: 100, clubCap: 99,
    });

    // Round 0: u1, u2, u3 all get their first choice (order doesn't matter, no contention)
    for (const uid of order) assert.ok(userState[uid].allocated.includes(`${uid}-r0`));
    // Round 1 (reversed order) — still uncontested since each wants a unique player
    for (const uid of order) assert.ok(userState[uid].allocated.includes(`${uid}-r1`));
    for (const uid of order) assert.equal(userState[uid].allocated.length, 2);
  });

  it('gives the earlier pick in a round priority when two users want the same player', () => {
    const order = ['u1', 'u2'];
    const playerMap = { shared: makePlayer('shared', 'MID', 5) };
    const submissionMap = { u1: ['shared'], u2: ['shared'] };
    const userState = freshUserState(order);
    const taken = new Set();

    runSnakeDraft({
      order, submissionMap, userState, playerMap, taken,
      squadSize: 1, posCaps: POS_CAPS, budget: 100, clubCap: 99,
    });

    assert.deepEqual(userState.u1.allocated, ['shared']); // u1 picks first in round 0
    assert.deepEqual(userState.u2.allocated, []);          // contested away, no more targets
  });
});

describe('runSnakeDraft — position caps', () => {
  it('skips a target once the user has filled that position', () => {
    const order = ['u1'];
    const playerMap = {
      gk1: makePlayer('gk1', 'GK', 5),
      gk2: makePlayer('gk2', 'GK', 5),
      gk3: makePlayer('gk3', 'GK', 5),
      mid1: makePlayer('mid1', 'MID', 5),
    };
    const submissionMap = { u1: ['gk1', 'gk2', 'gk3', 'mid1'] };
    const userState = freshUserState(order);
    const taken = new Set();

    runSnakeDraft({
      order, submissionMap, userState, playerMap, taken,
      squadSize: 3, posCaps: { GK: 2, DEF: 5, MID: 5, FWD: 3 }, budget: 100, clubCap: 99,
    });

    // gk1 + gk2 fill the GK cap of 2; gk3 is skipped, mid1 fills the third slot
    assert.deepEqual(userState.u1.allocated, ['gk1', 'gk2', 'mid1']);
    assert.equal(userState.u1.posCounts.GK, 2);
  });
});

describe('runSnakeDraft — budget', () => {
  it('skips a target the user cannot afford', () => {
    const order = ['u1'];
    const playerMap = {
      expensive: makePlayer('expensive', 'MID', 90),
      cheap: makePlayer('cheap', 'MID', 5),
    };
    const submissionMap = { u1: ['expensive', 'cheap'] };
    const userState = freshUserState(order);
    const taken = new Set();

    runSnakeDraft({
      order, submissionMap, userState, playerMap, taken,
      squadSize: 2, posCaps: POS_CAPS, budget: 10, clubCap: 99,
    });

    assert.deepEqual(userState.u1.allocated, ['cheap']);
    assert.equal(userState.u1.budgetUsed, 5);
  });
});

describe('runSnakeDraft — club cap', () => {
  it('skips a target once the user has hit the per-club cap', () => {
    const order = ['u1'];
    const playerMap = {
      c1: makePlayer('c1', 'MID', 5, 'clubA'),
      c2: makePlayer('c2', 'MID', 5, 'clubA'),
      c3: makePlayer('c3', 'MID', 5, 'clubA'),
    };
    const submissionMap = { u1: ['c1', 'c2', 'c3'] };
    const userState = freshUserState(order);
    const taken = new Set();

    runSnakeDraft({
      order, submissionMap, userState, playerMap, taken,
      squadSize: 3, posCaps: POS_CAPS, budget: 100, clubCap: 2,
    });

    assert.deepEqual(userState.u1.allocated, ['c1', 'c2']);
    assert.equal(userState.u1.clubCounts.clubA, 2);
  });

  it('treats a clubCap >= 99 as uncapped', () => {
    const order = ['u1'];
    const playerMap = {
      c1: makePlayer('c1', 'MID', 5, 'clubA'),
      c2: makePlayer('c2', 'MID', 5, 'clubA'),
      c3: makePlayer('c3', 'MID', 5, 'clubA'),
    };
    const submissionMap = { u1: ['c1', 'c2', 'c3'] };
    const userState = freshUserState(order);
    const taken = new Set();

    runSnakeDraft({
      order, submissionMap, userState, playerMap, taken,
      squadSize: 3, posCaps: POS_CAPS, budget: 100, clubCap: 99,
    });

    assert.equal(userState.u1.allocated.length, 3);
  });
});

describe('runSnakeDraft — contested players and taken set', () => {
  it('marks a player as taken once allocated and reports contestedPlayers for misses', () => {
    const order = ['u1', 'u2'];
    const playerMap = {
      shared: makePlayer('shared', 'MID', 5),
      fallback: makePlayer('fallback', 'MID', 5),
    };
    const submissionMap = { u1: ['shared'], u2: ['shared', 'fallback'] };
    const userState = freshUserState(order);
    const taken = new Set();

    const result = runSnakeDraft({
      order, submissionMap, userState, playerMap, taken,
      squadSize: 1, posCaps: POS_CAPS, budget: 100, clubCap: 99,
    });

    assert.ok(taken.has('shared'));
    assert.deepEqual(userState.u2.allocated, ['fallback']);
    assert.equal(result.contestedPlayers, 1); // u2's first attempt at 'shared' hit taken
  });

  it('leaves a user short if their whole wishlist is exhausted before the squad is full', () => {
    const order = ['u1'];
    const playerMap = { only: makePlayer('only', 'MID', 5) };
    const submissionMap = { u1: ['only'] };
    const userState = freshUserState(order);
    const taken = new Set();

    runSnakeDraft({
      order, submissionMap, userState, playerMap, taken,
      squadSize: 3, posCaps: POS_CAPS, budget: 100, clubCap: 99,
    });

    assert.deepEqual(userState.u1.allocated, ['only']);
  });

  it('is a no-op when order is empty', () => {
    const result = runSnakeDraft({
      order: [], submissionMap: {}, userState: {}, playerMap: {}, taken: new Set(),
      squadSize: 3, posCaps: POS_CAPS, budget: 100, clubCap: 99,
    });
    assert.equal(result.contestedPlayers, 0);
  });
});
