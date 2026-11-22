import { describe, it, expect } from 'vitest';
import { validateFormation } from '../../src/lib/formations';

const xi = (gk, def, mid, fwd) => [
  ...Array(gk).fill({ position: 'GK' }),
  ...Array(def).fill({ position: 'DEF' }),
  ...Array(mid).fill({ position: 'MID' }),
  ...Array(fwd).fill({ position: 'FWD' }),
];

const RELAXED = { GK: 1, DEF: 1, MID: 1, FWD: 1 };
const CLASSIC = { GK: 1, DEF: 3, MID: 2, FWD: 1 };

describe('validateFormation', () => {
  it('accepts a normal 4-4-2', () => {
    expect(validateFormation(xi(1, 4, 4, 2), CLASSIC)).toBeNull();
  });

  it('rejects a second goalkeeper on the pitch', () => {
    expect(validateFormation(xi(2, 4, 3, 2), RELAXED)).toBe('Only 1 GK allowed in the starting XI.');
  });

  it('names the position that falls below its minimum', () => {
    expect(validateFormation(xi(1, 2, 5, 3), CLASSIC))
      .toBe('This swap leaves you with only 2 DEF on the pitch (minimum 3).');
  });

  it('reports a missing goalkeeper', () => {
    expect(validateFormation(xi(0, 4, 4, 3), CLASSIC))
      .toBe('This swap leaves you with only 0 GK on the pitch (minimum 1).');
  });

  it('allows a lopsided XI when the league relaxed its minimums', () => {
    expect(validateFormation(xi(1, 1, 8, 1), RELAXED)).toBeNull();
  });

  it('ignores players with an unknown position', () => {
    expect(validateFormation([...xi(1, 4, 4, 2), { position: 'COACH' }], CLASSIC)).toBeNull();
  });
});
