// @ts-check
// Reusable manager profiles for E2E test scenarios.
// Each manager has a distinct risk profile so tests can exercise varied behaviour.

export const managers = {
  aggressiveTrader: {
    id: 'fixture-mgr-aggressive',
    email: 'aggressive@test.com',
    name: 'Aggressive Trader',
    riskProfile: 'high_risk',
    startingBudget: 80.0,
  },
  conservativePlayer: {
    id: 'fixture-mgr-conservative',
    email: 'conservative@test.com',
    name: 'Conservative Player',
    riskProfile: 'low_risk',
    startingBudget: 90.0,
  },
  activeCompetitor: {
    id: 'fixture-mgr-active',
    email: 'active@test.com',
    name: 'Active Competitor',
    riskProfile: 'balanced',
    startingBudget: 100.0,
  },
  newcomer: {
    id: 'fixture-mgr-newcomer',
    email: 'newcomer@test.com',
    name: 'Newcomer',
    riskProfile: 'low_risk',
    startingBudget: 100.0,
  },
  veteran: {
    id: 'fixture-mgr-veteran',
    email: 'veteran@test.com',
    name: 'Veteran',
    riskProfile: 'high_risk',
    startingBudget: 95.0,
  },
};

export const managerList = Object.values(managers);
