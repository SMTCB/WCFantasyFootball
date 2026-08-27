// scoring-logic.js — pure, dependency-free F1 bet scoring extracted from
// score-f1-race/index.ts. No DB/network calls; safe to unit-test directly
// with Node's test runner and to import unchanged from the Deno function.

export const SCORING = {
  p1_exact: 10, p2_exact: 8, p3_exact: 6,
  wrong_spot: 3,
  dnf: 5, team: 5, special: 5,
  all_correct_bonus: 3,
};

export function scoreRaceBet(bet, race) {
  const breakdown = {};
  let total = 0;
  let allCorrect = true;

  // P1
  if (bet.p1 && race.result_p1) {
    if (bet.p1 === race.result_p1) {
      breakdown.p1 = SCORING.p1_exact; total += SCORING.p1_exact;
    } else if ([race.result_p2, race.result_p3].includes(bet.p1)) {
      breakdown.p1 = SCORING.wrong_spot; total += SCORING.wrong_spot; allCorrect = false;
    } else {
      breakdown.p1 = 0; allCorrect = false;
    }
  } else { allCorrect = false; }

  // P2
  if (bet.p2 && race.result_p2) {
    if (bet.p2 === race.result_p2) {
      breakdown.p2 = SCORING.p2_exact; total += SCORING.p2_exact;
    } else if ([race.result_p1, race.result_p3].includes(bet.p2)) {
      breakdown.p2 = SCORING.wrong_spot; total += SCORING.wrong_spot; allCorrect = false;
    } else {
      breakdown.p2 = 0; allCorrect = false;
    }
  } else { allCorrect = false; }

  // P3
  if (bet.p3 && race.result_p3) {
    if (bet.p3 === race.result_p3) {
      breakdown.p3 = SCORING.p3_exact; total += SCORING.p3_exact;
    } else if ([race.result_p1, race.result_p2].includes(bet.p3)) {
      breakdown.p3 = SCORING.wrong_spot; total += SCORING.wrong_spot; allCorrect = false;
    } else {
      breakdown.p3 = 0; allCorrect = false;
    }
  } else { allCorrect = false; }

  // DNF
  if (bet.dnf_driver && race.result_dnf_drivers?.length > 0) {
    if (race.result_dnf_drivers.includes(bet.dnf_driver)) {
      breakdown.dnf = SCORING.dnf; total += SCORING.dnf;
    } else {
      breakdown.dnf = 0; allCorrect = false;
    }
  } else if (bet.dnf_driver) {
    breakdown.dnf = 0; allCorrect = false;
  }

  // Team most points
  if (bet.team_most_points && race.result_team_most_points) {
    if (bet.team_most_points === race.result_team_most_points) {
      breakdown.team = SCORING.team; total += SCORING.team;
    } else {
      breakdown.team = 0; allCorrect = false;
    }
  } else if (bet.team_most_points) {
    breakdown.team = 0; allCorrect = false;
  }

  // Special category
  if (bet.special_category_answer && race.special_category_answer) {
    const normalise = s => s?.trim().toLowerCase();
    if (normalise(bet.special_category_answer) === normalise(race.special_category_answer)) {
      breakdown.special = SCORING.special; total += SCORING.special;
    } else {
      breakdown.special = 0; allCorrect = false;
    }
  } else if (bet.special_category_answer) {
    breakdown.special = 0; allCorrect = false;
  }

  // All correct bonus
  if (allCorrect && total > 0) {
    breakdown.bonus = SCORING.all_correct_bonus;
    total += SCORING.all_correct_bonus;
  }

  return { total, breakdown };
}
