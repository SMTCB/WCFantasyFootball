// Fixed test league and squad for the My team tab tests (S30 / MD-11, S31 / MD-12).
// The demo user has no league in the live database, so without this the tab
// tests would always skip. Every Supabase REST call is answered from here;
// writes and unknown RPCs return empty, and `calls` records each RPC (and each
// process-transfer request, as name 'process-transfer') so a test can check
// what the tab sent. Options: `window` ('open' | 'upcoming'), `joker` (chip
// status) and `failTransfer(body)` (true makes that transfer fail).

export const MOCK_LEAGUE_ID = 'TEST_L1';
const DEMO = '00000000-0000-0000-0000-000000000000';
const future = d => new Date(Date.now() + d * 864e5).toISOString();

const PLAYERS = [
  ['p1', 'Raya', 'GK', 'Arsenal', 5.5], ['p2', 'Pickford', 'GK', 'Everton', 5.0],
  ['p3', 'Saliba', 'DEF', 'Arsenal', 6.0], ['p4', 'Gabriel', 'DEF', 'Arsenal', 6.0], ['p5', 'Gvardiol', 'DEF', 'Manchester City', 6.0],
  ['p6', 'Van Dijk', 'DEF', 'Liverpool', 6.5], ['p7', 'Mykolenko', 'DEF', 'Everton', 4.5],
  ['p8', 'Saka', 'MID', 'Arsenal', 10.0], ['p9', 'Rice', 'MID', 'Arsenal', 6.5], ['p10', 'Palmer', 'MID', 'Chelsea', 10.5],
  ['p11', 'Mbeumo', 'MID', 'Manchester United', 8.0], ['p12', 'Andreas', 'MID', 'Fulham', 5.5],
  ['p13', 'Isak', 'FWD', 'Liverpool', 10.5], ['p14', 'Haaland', 'FWD', 'Manchester City', 14.5], ['p15', 'Wissa', 'FWD', 'Newcastle United', 6.0],
].map(([id, name, position, club, price]) => ({ id, name, position, club, price, tournament_id: 'T1', forza_id: id }));
// Free agents for the Replace picker and the market sheet (S31).
const MARKET = [
  ['m1', 'Watkins', 'FWD', 'Aston Villa', 9.0], ['m2', 'Solanke', 'FWD', 'Tottenham Hotspur', 7.5],
  ['m3', 'Expensive', 'FWD', 'Real Test FC', 12.0], ['m4', 'Odegaard', 'MID', 'Arsenal', 8.5],
  ['m5', 'Wharton', 'MID', 'Crystal Palace', 5.0], ['m6', 'Munoz', 'DEF', 'Crystal Palace', 4.5],
].map(([id, name, position, club, price]) => ({ id, name, position, club, price, tournament_id: 'T1', forza_id: id }));
const XI = ['p1', 'p3', 'p4', 'p5', 'p8', 'p9', 'p10', 'p11', 'p13', 'p14', 'p15'];

const league = {
  id: MOCK_LEAGUE_ID, name: 'TEST_Sunday League', tournament_id: 'T1', format: 'classic', h2h_enabled: false,
  league_mode: 'classic', archived: false, budget_total: 100, squad_size: 15, chips_enabled: true,
  commissioner_id: DEMO, invite_code: 'TEST01', circle_id: 'TEST_C1', sport: 'football', created_at: '2026-08-01T00:00:00Z',
};

function tables() {
  return {
    league_members: [
      { league_id: MOCK_LEAGUE_ID, user_id: DEMO, rank: 2, total_points: 412, leagues: league, users: { username: 'Demo Manager' } },
      { league_id: MOCK_LEAGUE_ID, user_id: 'u2', rank: 1, total_points: 430, leagues: league, users: { username: 'Priya' } },
      { league_id: MOCK_LEAGUE_ID, user_id: 'u3', rank: 3, total_points: 388, leagues: league, users: { username: 'Tom' } },
    ],
    leagues: [league],
    squads: [{
      id: 'TEST_S1', user_id: DEMO, league_id: MOCK_LEAGUE_ID, matchday_id: 'M1', players: PLAYERS.map(p => p.id),
      starting_xi: XI, captain_id: 'p10', budget_remaining: 3.5, is_triple_captain: false, lineup_locks: {},
      created_at: '2026-11-20T00:00:00Z',
    }],
    players: [...PLAYERS, ...MARKET],
    player_status: [
      { player_id: 'p8', status: 'injured', reason: 'Hamstring', confidence: 90 },
      { player_id: 'p13', status: 'doubtful', reason: 'Knock', confidence: 50 },
    ],
    player_match_stats: [
      { player_id: 'p10', fantasy_points: 8, fixture_id: 'F1' },
      { player_id: 'p14', fantasy_points: 9, fixture_id: 'F2' },
    ],
    fixtures: [
      { id: 'F1', matchday_id: 'M1', status: 'finished', home_team: 'Chelsea', away_team: 'Arsenal', home_score: 1, away_score: 1, kickoff_at: '2026-11-20T15:00:00Z', tournament_id: 'T1' },
      { id: 'F2', matchday_id: 'M1', status: 'finished', home_team: 'Manchester City', away_team: 'Liverpool', home_score: 2, away_score: 0, kickoff_at: '2026-11-20T17:30:00Z', tournament_id: 'T1' },
    ],
    matchday_deadlines: [{ deadline_at: future(2), matchday_id: 'M1', tournament_id: 'T1' }],
  };
}

function rpcs({ window = 'open', joker = 'used' } = {}) {
  return {
    get_my_chips: { round: 'M1', disabled: false, chips: { triple_captain: { status: 'available' }, joker: { status: joker }, max_cap: { status: 'available' } } },
    get_transfer_window_status: window === 'open'
      ? { status: 'open', closes_at: future(2), opens_at: null, transfers_remaining: null, window_type: 'unlimited' }
      : { status: window, closes_at: null, opens_at: future(1), transfers_remaining: null, window_type: 'unlimited' },
    get_club_cap: 3,
    set_captain: { ok: true },
    set_lineup: { ok: true },
  };
}

// PostgREST `in.(a,b)` list, with or without quotes.
const inList = v => v.slice(4, -1).split(',').map(x => x.replace(/^"|"$/g, ''));

export async function mockMyTeam(page, opts = {}) {
  const calls = [];
  const TABLE = tables();
  const RPC = rpcs(opts);
  await page.route('**/functions/v1/process-transfer', async route => {
    const body = route.request().postDataJSON();
    calls.push({ name: 'process-transfer', args: body });
    if (opts.failTransfer?.(body)) {
      return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Squad full' }) });
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, players: [], budget_remaining: 3.5 }) });
  });
  await page.route(/\/rest\/v1\//, async route => {
    const req = route.request();
    const url = new URL(req.url());
    const m = url.pathname.match(/\/rest\/v1\/(rpc\/)?([^/?]+)/);
    const isRpc = !!m?.[1];
    const name = m?.[2];
    if (isRpc) calls.push({ name, args: req.postDataJSON?.() ?? null });
    const single = (req.headers()['accept'] || '').includes('pgrst.object');
    let body = isRpc ? (RPC[name] ?? null) : (TABLE[name] ?? []);
    if (!isRpc && Array.isArray(body)) {
      for (const [k, v] of url.searchParams) {
        if (v.startsWith('in.(')) {
          const list = inList(v);
          body = body.filter(row => !(k in row) || list.includes(String(row[k])));
          continue;
        }
        if (!v.startsWith('eq.')) continue;
        body = body.filter(row => !(k in row) || String(row[k]) === v.slice(3));
      }
    }
    if (!isRpc && req.method() !== 'GET' && req.method() !== 'HEAD') body = [];
    if (single) body = Array.isArray(body) ? (body[0] ?? null) : body;
    if (single && body === null) {
      return route.fulfill({ status: 406, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST116', message: 'none' }) });
    }
    const n = Array.isArray(body) ? body.length : 1;
    await route.fulfill({
      status: 200, contentType: 'application/json',
      headers: { 'content-range': `0-${Math.max(n - 1, 0)}/${n}` },
      body: JSON.stringify(body),
    });
  });
  return calls;
}
