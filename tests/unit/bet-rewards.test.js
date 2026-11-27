import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sumBetRewards, formatBetReward } from '../../src/lib/betRewards.js';

test('budget rewards are never added to the points total', () => {
  const totals = sumBetRewards([
    { type: 'points', amount: 5 },
    { type: 'points', amount: '8' },
    { type: 'budget', amount: 3 },
    { type: 'points', amount: null },
  ]);
  assert.deepEqual(totals, { points: 13, budget: 3 });
});

test('each reward type keeps its own unit', () => {
  assert.equal(formatBetReward('points', 5), '+5 pts');
  assert.equal(formatBetReward('budget', 3), '+€3M');
});
