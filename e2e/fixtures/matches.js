// @ts-check
// Deterministic match scenarios for live/scoring tests.
// Real fixtures pulled from Supabase via helpers; these fixtures describe the
// expected event shape and scoring outcomes for assertion logic.

export const matchScenarios = {
  // Classic 3-event sequence (goal, yellow, sub) — used to verify event ordering.
  steadyMatch: {
    fixtureId: 'fixture-steady-001',
    homeTeam: 'Man United',
    awayTeam: 'Arsenal',
    kickoffOffsetMinutes: 0,
    events: [
      { minute: 12, type: 'goal',         playerId: 'bruno_id',     team: 'MUN', detail: 'open_play' },
      { minute: 28, type: 'yellow_card',  playerId: 'saka_id',      team: 'ARS' },
      { minute: 60, type: 'substitution', playerId: 'salah_id',     team: 'LIV', detail: 'OUT' },
      { minute: 62, type: 'goal',         playerId: 'martinelli_id', team: 'ARS', detail: 'open_play' },
      { minute: 75, type: 'goal',         playerId: 'bruno_id',     team: 'MUN', detail: 'penalty' },
    ],
    finalScore: { home: 2, away: 1 },
  },
  // Out-of-order arrival pattern — verifies idempotent sorted display.
  outOfOrderEvents: {
    fixtureId: 'fixture-ooo-002',
    homeTeam: 'Liverpool',
    awayTeam: 'Man City',
    kickoffOffsetMinutes: 0,
    events: [
      { minute: 75, type: 'goal',         playerId: 'salah_id',     team: 'LIV' },
      { minute: 12, type: 'goal',         playerId: 'haaland_id',   team: 'MCI' },
      { minute: 45, type: 'red_card',     playerId: 'rodri_id',     team: 'MCI' },
    ],
    finalScore: { home: 1, away: 1 },
  },
  // VAR/postponement scenario.
  contentiousMatch: {
    fixtureId: 'fixture-var-003',
    homeTeam: 'Chelsea',
    awayTeam: 'Tottenham',
    kickoffOffsetMinutes: 0,
    events: [
      { minute: 22, type: 'goal',         playerId: 'palmer_id',    team: 'CHE', detail: 'var_pending' },
      { minute: 25, type: 'goal',         playerId: 'palmer_id',    team: 'CHE', detail: 'var_confirmed' },
      { minute: 67, type: 'red_card',     playerId: 'son_id',       team: 'TOT' },
      { minute: 70, type: 'red_card',     playerId: 'son_id',       team: 'TOT', detail: 'var_revoked' },
    ],
    finalScore: { home: 1, away: 0 },
  },
};

// Scoring rules used for assertion alignment (mirrors product scoring layer).
export const SCORING_RULES = {
  appearance: 1,
  goal:       { GK: 8, DEF: 6, MID: 5, FWD: 4 },
  assist:     3,
  cleanSheet: { GK: 4, DEF: 4, MID: 1, FWD: 0 },
  yellowCard: -1,
  redCard:    -3,
  penaltyMiss: -2,
  ownGoal:    -2,
  jokerMultiplier: 2,
};
