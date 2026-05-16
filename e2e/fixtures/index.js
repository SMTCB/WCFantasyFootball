// @ts-check
// Barrel export for all E2E test fixtures.
// Import { managers, leagueScenarios, squadSnapshots, matchScenarios, forzaApiMocks } from './fixtures/index.js';

export { managers, managerList } from './managers.js';
export { leagueScenarios, leagueScenarioList } from './leagues.js';
export { squadSnapshots, FORMATION_RULES } from './squads.js';
export { matchScenarios, SCORING_RULES } from './matches.js';
export { forzaApiMocks, mockForzaEndpoint, abortForzaEndpoint } from './api-mocks.js';
