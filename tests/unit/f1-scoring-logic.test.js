/**
 * score-f1-race pure scoring logic — unit tests
 *
 * scoreRaceBet has zero DB/network calls (extracted verbatim from
 * supabase/functions/score-f1-race/index.ts into scoring-logic.js), so unlike
 * the other tests/unit/*.test.js files, no Postgres connection is needed here —
 * plain node:test against a pure function.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SCORING, scoreRaceBet } from '../../supabase/functions/score-f1-race/scoring-logic.js';

const RACE = {
  result_p1: 'VER',
  result_p2: 'NOR',
  result_p3: 'LEC',
  result_dnf_drivers: ['SAR', 'BOT'],
  result_team_most_points: 'Red Bull',
  special_category_answer: 'Safety Car',
};

describe('scoreRaceBet — podium picks', () => {
  it('awards exact points for a correct P1/P2/P3 pick', () => {
    const { total, breakdown } = scoreRaceBet({ p1: 'VER', p2: 'NOR', p3: 'LEC' }, RACE);
    assert.equal(breakdown.p1, SCORING.p1_exact);
    assert.equal(breakdown.p2, SCORING.p2_exact);
    assert.equal(breakdown.p3, SCORING.p3_exact);
    // all correct -> bonus applies
    assert.equal(breakdown.bonus, SCORING.all_correct_bonus);
    assert.equal(total, SCORING.p1_exact + SCORING.p2_exact + SCORING.p3_exact + SCORING.all_correct_bonus);
  });

  it('awards wrong_spot points when the pick lands on the podium but the wrong step', () => {
    const { total, breakdown } = scoreRaceBet({ p1: 'NOR', p2: 'VER', p3: 'SAR' }, RACE);
    assert.equal(breakdown.p1, SCORING.wrong_spot); // NOR actually finished P2
    assert.equal(breakdown.p2, SCORING.wrong_spot); // VER actually finished P1
    assert.equal(breakdown.p3, 0);                  // SAR didn't finish top 3
    assert.equal(total, SCORING.wrong_spot * 2);
    assert.equal(breakdown.bonus, undefined);
  });

  it('awards zero and marks incorrect for a pick outside the podium entirely', () => {
    const { breakdown } = scoreRaceBet({ p1: 'HAM' }, RACE);
    assert.equal(breakdown.p1, 0);
  });

  it('does not score a position that has no pick', () => {
    const { total, breakdown } = scoreRaceBet({ p2: 'NOR' }, RACE);
    assert.equal(breakdown.p1, undefined);
    assert.equal(breakdown.p2, SCORING.p2_exact);
    assert.equal(total, SCORING.p2_exact);
  });
});

describe('scoreRaceBet — DNF pick', () => {
  it('awards dnf points when the picked driver is in the DNF list', () => {
    const { total, breakdown } = scoreRaceBet({ dnf_driver: 'SAR' }, RACE);
    assert.equal(breakdown.dnf, SCORING.dnf);
    assert.equal(total, SCORING.dnf);
  });

  it('awards zero when the picked driver did not DNF', () => {
    const { breakdown } = scoreRaceBet({ dnf_driver: 'VER' }, RACE);
    assert.equal(breakdown.dnf, 0);
  });

  it('awards zero when a DNF pick was made but the race recorded no DNFs', () => {
    const { breakdown } = scoreRaceBet({ dnf_driver: 'SAR' }, { ...RACE, result_dnf_drivers: [] });
    assert.equal(breakdown.dnf, 0);
  });
});

describe('scoreRaceBet — team most points', () => {
  it('awards team points on an exact match', () => {
    const { total, breakdown } = scoreRaceBet({ team_most_points: 'Red Bull' }, RACE);
    assert.equal(breakdown.team, SCORING.team);
    assert.equal(total, SCORING.team);
  });

  it('awards zero on a mismatch', () => {
    const { breakdown } = scoreRaceBet({ team_most_points: 'Ferrari' }, RACE);
    assert.equal(breakdown.team, 0);
  });
});

describe('scoreRaceBet — special category', () => {
  it('matches case- and whitespace-insensitively', () => {
    const { total, breakdown } = scoreRaceBet({ special_category_answer: '  safety CAR  ' }, RACE);
    assert.equal(breakdown.special, SCORING.special);
    assert.equal(total, SCORING.special);
  });

  it('awards zero when the answer does not match', () => {
    const { breakdown } = scoreRaceBet({ special_category_answer: 'Red Flag' }, RACE);
    assert.equal(breakdown.special, 0);
  });
});

describe('scoreRaceBet — all-correct bonus', () => {
  it('is not applied unless every made pick is correct', () => {
    const { total, breakdown } = scoreRaceBet(
      { p1: 'VER', p2: 'NOR', p3: 'LEC', team_most_points: 'Ferrari' },
      RACE,
    );
    assert.equal(breakdown.bonus, undefined);
    assert.equal(total, SCORING.p1_exact + SCORING.p2_exact + SCORING.p3_exact);
  });

  it('applies across all five categories when every pick is correct', () => {
    const { total, breakdown } = scoreRaceBet(
      {
        p1: 'VER', p2: 'NOR', p3: 'LEC',
        dnf_driver: 'SAR',
        team_most_points: 'Red Bull',
        special_category_answer: 'Safety Car',
      },
      RACE,
    );
    assert.equal(breakdown.bonus, SCORING.all_correct_bonus);
    assert.equal(
      total,
      SCORING.p1_exact + SCORING.p2_exact + SCORING.p3_exact +
      SCORING.dnf + SCORING.team + SCORING.special + SCORING.all_correct_bonus,
    );
  });

  it('is never applied when no picks were made and total stays 0', () => {
    const { total, breakdown } = scoreRaceBet({}, RACE);
    assert.equal(total, 0);
    assert.equal(breakdown.bonus, undefined);
  });
});
