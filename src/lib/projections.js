/**
 * Live Projection Engine — Feature 03
 *
 * Calculates projected final scores for fantasy squads based on:
 * - Current live points accumulated
 * - Remaining minutes per player still on pitch
 * - Position-average points-per-90 rates
 *
 * Rules (from spec):
 * - Conservative: never overshoot, undershoot is better
 * - Never go negative — floor is current score
 * - Smooth extreme swings: cap single-cycle jump at 5 pts
 * - "Stable" if projection unchanged for 2+ cycles
 */

// ─── Position averages (pts per 90min) ───────────────────────────────────────
// These are sensible defaults applicable to any football competition.
// Individual leagues can override via the leagues.position_avg JSONB column
// (read by useLeagueConfig); screens should prefer league-specific values when available.
export const POSITION_AVG = {
  GK:  2.1,
  DEF: 2.8,
  MID: 3.2,
  FWD: 4.1,
};

/**
 * Calculate projected remaining points for a single player.
 * @param {object} player  - { position, minutesPlayed, seasonAvg (optional) }
 * @param {number} matchMinute - current match minute (0–90+)
 * @returns {number} projected additional points (floored to 0)
 */
export function projectPlayerRemaining(player, matchMinute) {
  const clampedMinute = Math.min(matchMinute, 90);
  const minutesRemaining = Math.max(0, 90 - clampedMinute);

  if (minutesRemaining <= 0) return 0;

  const avgPer90 = player.seasonAvg ?? POSITION_AVG[player.position] ?? 3.0;
  const raw = avgPer90 * (minutesRemaining / 90);

  // Conservative: round down to nearest 0.5
  return Math.floor(raw * 2) / 2;
}

/**
 * Calculate full squad projected score.
 * @param {number} currentPoints  - points scored so far this matchday
 * @param {object[]} playersOnPitch - active players: [{ id, position, minutesPlayed, seasonAvg? }]
 * @param {number} matchMinute     - current fixture minute
 * @param {number|null} prevProjection - previous cycle's projection (for trend + smoothing)
 * @returns {{ projected, trend, delta, isStable }}
 */
export function calculateProjection(currentPoints, playersOnPitch, matchMinute, prevProjection = null) {
  const remaining = playersOnPitch.reduce(
    (sum, p) => sum + projectPlayerRemaining(p, matchMinute),
    0
  );

  let rawProjected = currentPoints + remaining;

  // Never go below current scored points
  rawProjected = Math.max(rawProjected, currentPoints);

  // Smooth extreme swings: cap change at +/- 5 per cycle
  if (prevProjection !== null) {
    const delta = rawProjected - prevProjection;
    if (Math.abs(delta) > 5) {
      rawProjected = prevProjection + Math.sign(delta) * 5;
    }
  }

  const projected = Math.round(rawProjected);
  const delta = prevProjection !== null ? projected - prevProjection : 0;
  const trend = delta > 0 ? 'up' : delta < 0 ? 'down' : 'stable';
  const isStable = trend === 'stable';

  return { projected, trend, delta, isStable };
}

/**
 * Format a projection result for display.
 * @param {object} proj - result from calculateProjection()
 * @returns {{ arrow, color, label }}
 */
export function formatProjectionDisplay(proj) {
  if (proj.isStable) {
    return { arrow: '—', color: '#9e9e9e', label: 'Stable' };
  }
  if (proj.trend === 'up') {
    return { arrow: '↑', color: '#22c55e', label: `from ${proj.projected - proj.delta}` };
  }
  return { arrow: '↓', color: '#ef4444', label: `from ${proj.projected - proj.delta}` };
}

// ─── Mock squad for the Live screen demo ─────────────────────────────────────
export const MOCK_SQUAD_LIVE = [
  { id: 'p9',  name: 'Mbappé',       position: 'FWD', club: 'FRA', seasonAvg: 6.2 },
  { id: 'p11', name: 'Vinicius Jr.', position: 'FWD', club: 'BRA', seasonAvg: 5.6 },
  { id: 'p6',  name: 'Bellingham',   position: 'MID', club: 'ENG', seasonAvg: 3.8 },
  { id: 'p8',  name: 'De Bruyne',    position: 'MID', club: 'BEL', seasonAvg: 4.1 },
  { id: 'p7',  name: 'Pedri',        position: 'MID', club: 'ESP', seasonAvg: 3.2 },
  { id: 'p4',  name: 'Saliba',       position: 'DEF', club: 'FRA', seasonAvg: 2.9 },
  { id: 'p2',  name: 'Hakimi',       position: 'DEF', club: 'MAR', seasonAvg: 3.1 },
  { id: 'p3',  name: 'Rúben Dias',   position: 'DEF', club: 'POR', seasonAvg: 2.6 },
  { id: 'p5',  name: 'A. Arnold',    position: 'DEF', club: 'ENG', seasonAvg: 2.8 },
  { id: 'p1',  name: 'Alisson',      position: 'GK',  club: 'BRA', seasonAvg: 2.3 },
];
