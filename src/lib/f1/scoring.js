// F1 scoring engine — ported from FantasyF1/src/lib/scoring.ts
// Framework-agnostic: no React/Next.js imports.

import { SCORING } from './f1-data.js';

/**
 * Score a single per-race bet against the actual race result.
 * Returns { total, breakdown } where breakdown has one key per field.
 */
export function scoreRaceBet(bet, race) {
  if (!race.result_p1 || !race.result_p2 || !race.result_p3) return null;

  const podium = [race.result_p1, race.result_p2, race.result_p3];
  const breakdown = {};
  let total = 0;

  // P1
  if (bet.p1 === race.result_p1) {
    breakdown.p1 = SCORING.p1_exact;
  } else if (podium.includes(bet.p1)) {
    breakdown.p1 = SCORING.p1_wrong_spot;
  } else {
    breakdown.p1 = 0;
  }
  total += breakdown.p1;

  // P2
  if (bet.p2 === race.result_p2) {
    breakdown.p2 = SCORING.p2_exact;
  } else if (podium.includes(bet.p2)) {
    breakdown.p2 = SCORING.p2_wrong_spot;
  } else {
    breakdown.p2 = 0;
  }
  total += breakdown.p2;

  // P3
  if (bet.p3 === race.result_p3) {
    breakdown.p3 = SCORING.p3_exact;
  } else if (podium.includes(bet.p3)) {
    breakdown.p3 = SCORING.p3_wrong_spot;
  } else {
    breakdown.p3 = 0;
  }
  total += breakdown.p3;

  // DNF
  if (bet.dnf_driver && race.result_dnf_drivers?.length) {
    breakdown.dnf = race.result_dnf_drivers.includes(bet.dnf_driver) ? SCORING.dnf_correct : 0;
  } else {
    breakdown.dnf = 0;
  }
  total += breakdown.dnf;

  // Team with most points
  if (bet.team_most_points && race.result_team_most_points) {
    breakdown.team = bet.team_most_points === race.result_team_most_points ? SCORING.team_correct : 0;
  } else {
    breakdown.team = 0;
  }
  total += breakdown.team;

  // Special category
  if (bet.special_category_answer && race.special_category_answer) {
    breakdown.special = bet.special_category_answer === race.special_category_answer ? SCORING.special_correct : 0;
  } else {
    breakdown.special = 0;
  }
  total += breakdown.special;

  // All-correct bonus: exact P1/P2/P3 + all other fields correct
  const allCorrect =
    breakdown.p1 === SCORING.p1_exact &&
    breakdown.p2 === SCORING.p2_exact &&
    breakdown.p3 === SCORING.p3_exact &&
    breakdown.dnf === SCORING.dnf_correct &&
    breakdown.team === SCORING.team_correct &&
    breakdown.special === SCORING.special_correct;

  if (allCorrect) {
    breakdown.bonus = SCORING.all_correct_bonus;
    total += breakdown.bonus;
  } else {
    breakdown.bonus = 0;
  }

  return { total, breakdown };
}

/**
 * Score a season bet against the year results.
 * Returns { total, breakdown }.
 */
export function scoreYearBet(bet, yearResults) {
  const FIELDS = [
    'driver_champion',
    'driver_p2',
    'driver_p3',
    'constructor_champion',
    'last_constructor',
    'fewest_finishers_race',
    'most_dnfs_driver',
    'first_driver_replaced',
    'most_poles',
    'most_podiums_no_win',
  ];

  const POINTS_PER_FIELD = 10;
  const breakdown = {};
  let total = 0;

  for (const field of FIELDS) {
    if (bet[field] && yearResults[field] && bet[field] === yearResults[field]) {
      breakdown[field] = POINTS_PER_FIELD;
      total += POINTS_PER_FIELD;
    } else {
      breakdown[field] = 0;
    }
  }

  return { total, breakdown };
}

/**
 * Human-readable label for each scoring field.
 */
export const FIELD_LABELS = {
  p1:                   'P1 (Exact)',
  p2:                   'P2 (Exact)',
  p3:                   'P3 (Exact)',
  dnf:                  'DNF Driver',
  team:                 'Team - Most Points',
  special:              'Special Category',
  bonus:                'All Correct Bonus',
  driver_champion:      'Driver Champion',
  driver_p2:            'Championship P2',
  driver_p3:            'Championship P3',
  constructor_champion: 'Constructor Champion',
  last_constructor:     'Last Constructor',
  fewest_finishers_race:'Race with Fewest Finishers',
  most_dnfs_driver:     'Most DNFs - Driver',
  first_driver_replaced:'First Driver Replaced',
  most_poles:           'Most Pole Positions',
  most_podiums_no_win:  'Most Podiums Without a Win',
};
