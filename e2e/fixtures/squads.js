// @ts-check
// Deterministic squad snapshots used by E2E tests that need a known formation.
// Player IDs are placeholders — helpers resolve them against real Supabase data
// when running in integration mode.

export const squadSnapshots = {
  // Aggressive: 3-4-3 stacking forwards
  aggressiveComplete: {
    formation: '3-4-3',
    gk: ['gk_1'],
    def: ['def_1', 'def_2', 'def_3'],
    mid: ['mid_1', 'mid_2', 'mid_3', 'mid_4'],
    fwd: ['fwd_1', 'fwd_2', 'fwd_3'],
    bench: ['bench_gk_1', 'bench_def_1', 'bench_mid_1'],
    budgetRemaining: 0.5,
  },
  // Conservative: 5-4-1 defensive shell
  conservativeComplete: {
    formation: '5-4-1',
    gk: ['gk_2'],
    def: ['def_4', 'def_5', 'def_6', 'def_7', 'def_8'],
    mid: ['mid_5', 'mid_6', 'mid_7', 'mid_8'],
    fwd: ['fwd_4'],
    bench: ['bench_gk_2', 'bench_def_9', 'bench_mid_9'],
    budgetRemaining: 2.0,
  },
  // Balanced 4-4-2
  balancedComplete: {
    formation: '4-4-2',
    gk: ['gk_3'],
    def: ['def_10', 'def_11', 'def_12', 'def_13'],
    mid: ['mid_10', 'mid_11', 'mid_12', 'mid_13'],
    fwd: ['fwd_5', 'fwd_6'],
    bench: ['bench_gk_3', 'bench_def_14', 'bench_mid_14'],
    budgetRemaining: 1.2,
  },
  // Mid-build (8/11 players, used to verify auto-fill flows)
  partiallyFilled: {
    formation: '4-3-3',
    gk: ['gk_1'],
    def: ['def_1', 'def_2', 'def_3'],
    mid: ['mid_1', 'mid_2'],
    fwd: ['fwd_1', 'fwd_2'],
    bench: [],
    budgetRemaining: 25.0,
    isComplete: false,
  },
};

// Standard formation rules for validation tests.
export const FORMATION_RULES = {
  starting: { min: 11, max: 11 },
  goalkeepers: { min: 1, max: 1 },
  defenders: { min: 3, max: 5 },
  midfielders: { min: 2, max: 5 },
  forwards: { min: 1, max: 3 },
  squadSize: { min: 11, max: 15 },
  budget: { default: 100.0, currency: 'GBP_M' },
};
