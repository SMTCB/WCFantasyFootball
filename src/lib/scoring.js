/**
 * Shared scoring-display helpers.
 *
 * Problem: fantasy point totals are stored/rounded from raw fractional sums
 * (e.g. minutes scored at 1/60 per minute), but individual line items
 * (per-player, per-fixture) are often rounded independently for display.
 * Math.round(1.5) + Math.round(2.5) = 2 + 3 = 5, while Math.round(1.5+2.5) = 4
 * — the line items no longer sum to the displayed total, which reads as a
 * scoring error to users.
 *
 * apportionToTotal() fixes this with the "largest remainder method": each
 * item gets floor(value) or floor(value)+1, chosen so the rounded items sum
 * exactly to the given total (itself rounded from the true raw sum).
 */

/**
 * @param {number[]} rawValues - unrounded per-item values
 * @param {number} total - the displayed total these items must sum to
 * @returns {number[]} integers, same length as rawValues, summing to total
 */
export function apportionToTotal(rawValues, total) {
  if (!rawValues.length) return [];

  const floors = rawValues.map(v => Math.floor(v));
  const floorSum = floors.reduce((a, b) => a + b, 0);
  let remainder = total - floorSum;

  // Negative or out-of-range totals (e.g. penalty deductions pushed the
  // total below the sum of floors) — fall back to plain rounding rather
  // than distributing a negative remainder.
  if (remainder < 0 || remainder > rawValues.length) {
    return rawValues.map(v => Math.round(v));
  }

  const result = [...floors];
  const order = rawValues
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);

  for (let k = 0; k < remainder; k++) {
    result[order[k].i] += 1;
  }
  return result;
}
