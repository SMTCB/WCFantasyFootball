// @ts-check
// Reusable league scenarios for E2E test setups.
// Used by helpers to seed predictable league state when possible, or to drive
// assertion shapes when the app is operating against real Supabase data.

export const leagueScenarios = {
  fourManagersBalanced: {
    name: 'Test League — Balanced',
    mode: 'h2h',
    managers: ['aggressiveTrader', 'conservativePlayer', 'activeCompetitor', 'newcomer'],
    draftMode: 'allocation',
    transferWindowOpen: true,
    maxSquadSize: 14,
    rules: { competition: 'EPL', scoring: 'standard' },
  },
  threeManagersAuction: {
    name: 'Test League — Auction House',
    mode: 'h2h',
    managers: ['aggressiveTrader', 'activeCompetitor', 'veteran'],
    draftMode: 'auction',
    transferWindowOpen: true,
    maxSquadSize: 14,
    rules: { competition: 'EPL', scoring: 'standard' },
  },
  fiveManagersChat: {
    name: 'Test League — Banter Republic',
    mode: 'league',
    managers: ['aggressiveTrader', 'conservativePlayer', 'activeCompetitor', 'newcomer', 'veteran'],
    draftMode: 'allocation',
    transferWindowOpen: false,
    maxSquadSize: 14,
    rules: { competition: 'EPL', scoring: 'standard' },
  },
  multiLeagueManager: [
    {
      name: 'EPL Casual',
      mode: 'h2h',
      managers: ['activeCompetitor', 'newcomer'],
      draftMode: 'allocation',
      rules: { competition: 'EPL', scoring: 'standard' },
    },
    {
      name: 'EPL Competitive',
      mode: 'league',
      managers: ['activeCompetitor', 'veteran', 'aggressiveTrader'],
      draftMode: 'auction',
      rules: { competition: 'EPL', scoring: 'standard' },
    },
    {
      name: 'La Liga Experiment',
      mode: 'h2h',
      managers: ['activeCompetitor', 'conservativePlayer'],
      draftMode: 'allocation',
      rules: { competition: 'LALIGA', scoring: 'standard' },
    },
  ],
};

export const leagueScenarioList = Object.entries(leagueScenarios).map(([key, value]) => ({
  key,
  ...(Array.isArray(value) ? { multi: true, leagues: value } : { multi: false, ...value }),
}));
