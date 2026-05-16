// @ts-check
// Mock response bodies for Forza Football API endpoints.
// Used by tests that intercept network calls via `page.route()`.

export const forzaApiMocks = {
  liveScoresQuiet: {
    matches: [],
    updatedAt: '2026-05-16T15:00:00Z',
  },
  liveScoresActive: {
    matches: [
      {
        id: 'forza-match-001',
        homeTeam: { name: 'Man United', shortCode: 'MUN' },
        awayTeam: { name: 'Arsenal',    shortCode: 'ARS' },
        scoreHome: 2,
        scoreAway: 1,
        minute: 75,
        status: 'in_progress',
      },
      {
        id: 'forza-match-002',
        homeTeam: { name: 'Liverpool', shortCode: 'LIV' },
        awayTeam: { name: 'Man City',  shortCode: 'MCI' },
        scoreHome: 1,
        scoreAway: 1,
        minute: 45,
        status: 'in_progress',
      },
    ],
    updatedAt: '2026-05-16T15:15:00Z',
  },
  matchEvents: [
    { id: 'ev-1', fixtureId: 'forza-match-001', minute: 12, type: 'goal',         playerId: 'bruno_id',  team: 'MUN' },
    { id: 'ev-2', fixtureId: 'forza-match-001', minute: 28, type: 'yellow_card',  playerId: 'saka_id',   team: 'ARS' },
    { id: 'ev-3', fixtureId: 'forza-match-001', minute: 62, type: 'goal',         playerId: 'martinelli_id', team: 'ARS' },
    { id: 'ev-4', fixtureId: 'forza-match-001', minute: 75, type: 'goal',         playerId: 'bruno_id',  team: 'MUN' },
  ],
  playerStatus: {
    salah_id:  { injuryStatus: 'fit', suspendedUntil: null },
    saka_id:   { injuryStatus: 'fit', suspendedUntil: null },
    bruno_id:  { injuryStatus: 'fit', suspendedUntil: null },
    rodri_id:  { injuryStatus: 'doubtful', suspendedUntil: null },
    son_id:    { injuryStatus: 'out', suspendedUntil: '2026-05-30' },
  },
  errorResponses: {
    serverError:   { status: 500, body: { error: 'Internal Server Error' } },
    rateLimited:   { status: 429, body: { error: 'Too many requests', retryAfter: 30 } },
    upstreamDown:  { status: 502, body: { error: 'Bad gateway' } },
    networkTimeout: { abort: 'timedout' },
  },
};

// Helper to register a `page.route()` interception against a Playwright page.
// Pattern: matches any URL containing the substring, returns the mock body.
export async function mockForzaEndpoint(page, urlSubstring, mockBody, status = 200) {
  await page.route(`**${urlSubstring}**`, (route) => {
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(mockBody),
    });
  });
}

// Helper to simulate a network failure for any URL matching the substring.
export async function abortForzaEndpoint(page, urlSubstring, errorCode = 'failed') {
  await page.route(`**${urlSubstring}**`, (route) => route.abort(errorCode));
}
