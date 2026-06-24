/**
 * E2E Full Setup Script — EPL_OVERALL_E2E
 *
 * Reads credentials from environment variables:
 *   SUPABASE_URL              (e.g. https://xxxx.supabase.co)
 *   SUPABASE_PUBLISHABLE_KEY  (anon/publishable key)
 *
 * Production guard: will refuse to run against the known prod URL unless
 * --allow-prod is passed explicitly.
 *
 * Usage:
 *   SUPABASE_URL=https://xxxx.supabase.co \
 *   SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx \
 *   node scripts/e2e-setup.mjs
 *
 *   # To run against production (dangerous — think twice):
 *   node scripts/e2e-setup.mjs --allow-prod
 */

// PROD_URL is used as a safety guard to prevent accidental runs against production.
// Override via SUPABASE_PROJECT_REF env var if the production project changes.
const PROD_URL = process.env.SUPABASE_PROJECT_REF
  ? `${process.env.SUPABASE_PROJECT_REF}.supabase.co`
  : 'sssmvihxtqtohisghjet.supabase.co';

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY     = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('[FATAL] Missing env vars: SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be set.');
  process.exit(1);
}

if (SUPABASE_URL.includes(PROD_URL) && !process.argv.includes('--allow-prod')) {
  console.error('[FATAL] Refusing to run against production. Pass --allow-prod explicitly if you are sure.');
  process.exit(1);
}

const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

// Existing mock users (no auth required)
const MANAGERS = [
  { id: '00000000-0000-0000-0000-000000000000', username: 'Demo'          }, // commissioner
  { id: '33333333-3333-4333-a333-333333333333', username: 'GoalMachine'   },
  { id: '11111111-1111-4111-a111-111111111111', username: 'Zidane_99'     },
  { id: '22222222-2222-4222-a222-222222222222', username: 'TacticsTom'    },
  { id: '44444444-4444-4444-a444-444444444444', username: 'PressurePete'  },
  { id: '55555555-5555-4555-a555-555555555555', username: 'DefenderDave'  },
  { id: 'bfec6c29-4988-4ede-886d-97136fa82c13', username: 'e2e_a'        },
  { id: 'a8e495c2-f2a8-4add-80e8-6dff1ae717d1', username: 'e2e_b'        },
];

const LEAGUE_ID  = '5b1cc1a8-2c23-4d0f-b9c9-b2adab184718';
const JOIN_CODE  = '2D17E6';
const TOURNAMENT = 426;
const GW30       = '426-r30';
const GW31       = '426-r31';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg, data) {
  const ts = new Date().toLocaleTimeString();
  if (data !== undefined) {
    const str = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    console.log(`[${ts}] ${msg}`, str.length > 300 ? str.slice(0, 300) + '…' : str);
  } else {
    console.log(`[${ts}] ${msg}`);
  }
}
function err(msg, e) { console.error(`[ERR] ${msg}`, e?.message ?? JSON.stringify(e ?? '')); }

async function api(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...opts,
    headers: {
      apikey:        ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
      ...(opts.headers ?? {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { return { raw: text, status: res.status }; }
}

async function rpc(fn, args) {
  return api(`/rest/v1/rpc/${fn}`, { method: 'POST', body: args });
}

async function edge(fn, body) {
  const res = await fetch(`${FUNCTIONS_URL}/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { return { raw: text }; }
}

function shuffle(arr, seed) {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(s) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Phase 0: Check league ────────────────────────────────────────────────────

async function checkLeague() {
  const [data] = await api(`/rest/v1/leagues?id=eq.${LEAGUE_ID}&select=id,name,format,squad_size,max_members`);
  if (!data) { log('  ✗ league not found — run node e2e-setup.mjs first?'); return false; }
  log(`  ✓ league: ${data.name} (format: ${data.format}, squad_size: ${data.squad_size})`);
  return true;
}

// ─── Phase 1: Add managers ────────────────────────────────────────────────────

async function addManagers() {
  for (const mgr of MANAGERS.slice(1)) { // skip Demo (creator = already member)
    const r = await rpc('join_league_by_code', { p_code: JOIN_CODE, p_user_id: mgr.id });
    if (r?.success) log(`  ✓ ${mgr.username} joined`);
    else if (r?.error?.includes('already')) log(`  ↩ ${mgr.username} already a member`);
    else log(`  ⚠ ${mgr.username}:`, r);
  }
}

// ─── Phase 2: Get EPL players ─────────────────────────────────────────────────

async function getPlayers() {
  const data = await api(`/rest/v1/players?tournament_id=eq.${TOURNAMENT}&select=id,name,position&order=name&limit=300`);
  log(`  ✓ ${data.length} EPL players loaded`);
  return data ?? [];
}

// ─── Phase 3: Build + submit draft lists ─────────────────────────────────────

async function buildDraftLists(players) {
  if (players.length < 30) { log('  ✗ Not enough players. Sync first.'); return false; }

  // Overlap pool: first 40 players — contested across all managers
  const overlapPool = players.slice(0, 40).map(p => p.id);
  const extPool     = players.slice(40).map(p => p.id);

  const DRAFT_SIZE = 30;
  const lists = [];

  for (let i = 0; i < MANAGERS.length; i++) {
    const mgr = MANAGERS[i];
    let list;

    if (i < 3) {
      // Managers 0-2: first 20 from overlap (same for all → lots of conflict) + unique fill
      const pre = overlapPool.slice(0, 20);
      const shuffledExt = shuffle(extPool, i * 1000 + 1);
      list = [...pre, ...shuffledExt.slice(0, DRAFT_SIZE - pre.length)];
    } else {
      // Managers 3-7: first 10 from overlap + rest unique
      const pre = overlapPool.slice(0, 10);
      const shuffledRest = shuffle([...overlapPool.slice(10), ...extPool], i * 1000 + 7);
      list = [...pre, ...shuffledRest.slice(0, DRAFT_SIZE - pre.length)];
    }

    lists.push({ ...mgr, playerIds: list.slice(0, DRAFT_SIZE) });
  }

  return lists;
}

async function submitDraftLists(lists) {
  for (const { id, username, playerIds } of lists) {
    const r = await api('/rest/v1/draft_submissions', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: {
        league_id:    LEAGUE_ID,
        user_id:      id,
        player_ids:   playerIds,
        submitted_at: new Date().toISOString(),
        status:       'pending',
      },
    });
    if (r?.code) err(`submit ${username}`, r);
    else log(`  ✓ ${username}: submitted ${playerIds.length} players`);
  }
}

// ─── Phase 4: Run lottery ─────────────────────────────────────────────────────

async function runLottery() {
  log('  → calling run-draft-lottery…');
  const r = await edge('run-draft-lottery', { league_id: LEAGUE_ID });
  if (r?.managersProcessed !== undefined) {
    log(`  ✓ lottery done: ${r.managersProcessed} managers, ${r.contestedPlayers} contested`);
    if (r.incomplete?.length) log(`  ⚠ incomplete squads:`, r.incomplete);
  } else {
    log('  lottery result:', r);
  }
  return r;
}

async function verifySquads() {
  const data = await api(`/rest/v1/squads?league_id=eq.${LEAGUE_ID}&matchday_id=eq.current&select=user_id,players`);
  log(`  ✓ ${data.length} squads allocated`);

  const seen = new Set();
  const dupes = [];
  for (const s of data ?? []) {
    for (const pid of s.players ?? []) {
      if (seen.has(pid)) dupes.push(pid);
      seen.add(pid);
    }
    const mgr = MANAGERS.find(m => m.id === s.user_id);
    log(`    ${mgr?.username ?? s.user_id}: ${s.players?.length} players`);
  }

  if (dupes.length) log(`  ✗ OVERLAP: ${dupes.length} duplicate player IDs`);
  else              log(`  ✓ No player overlap across squads`);
  return data;
}

// ─── Phase 5: Create bets ─────────────────────────────────────────────────────

async function createBets() {
  const templates = await api('/rest/v1/bet_templates?select=id,slug&limit=20');
  const tMap = Object.fromEntries((templates ?? []).map(t => [t.slug, t.id]));
  log(`  ✓ ${templates?.length ?? 0} bet templates found`);

  const deadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const bets = [
    {
      league_id:   LEAGUE_ID,
      template_id: tMap['top_scorer'] ?? null,
      title:       'GW30 Top Scorer',
      prompt:      'Who scores most goals in GW30?',
      options:     JSON.stringify(['Salah', 'Haaland', 'Watkins', 'Palmer']),
      deadline_at: deadline,
      reward_value: 10, reward_type: 'points',
      scope_type: 'matchday', scope_ref: GW30, status: 'open',
    },
    {
      league_id:   LEAGUE_ID,
      template_id: tMap['match_result'] ?? null,
      title:       'GW30 Arsenal vs Man City',
      prompt:      'Predict: Arsenal vs Man City',
      options:     JSON.stringify(['Arsenal Win', 'Draw', 'Man City Win']),
      deadline_at: deadline,
      reward_value: 5, reward_type: 'points',
      scope_type: 'match', scope_ref: 'arsenal-mancity-gw30', status: 'open',
    },
    {
      league_id:   LEAGUE_ID,
      template_id: tMap['player_block'] ?? null,
      title:       'GW30 Player Block',
      prompt:      'Block an opponent — <5pts earns +4pts bonus',
      options:     JSON.stringify(['Haaland', 'Salah', 'Son', 'Saka']),
      deadline_at: deadline,
      reward_value: 4, reward_type: 'points',
      scope_type: 'matchday', scope_ref: GW30, status: 'open',
    },
  ];

  const betIds = [];
  for (const bet of bets) {
    const r = await api('/rest/v1/bet_instances', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: bet,
    });
    const id = Array.isArray(r) ? r[0]?.id : r?.id;
    if (id) { log(`  ✓ bet: ${bet.title} (${id})`); betIds.push(id); }
    else     { err(`createBet: ${bet.title}`, r);    betIds.push(null); }
  }
  return betIds;
}

// ─── Phase 6: Submit bet answers ──────────────────────────────────────────────

async function submitBetAnswers(betIds) {
  const ANSWER_SETS = [
    ['Salah',     'Arsenal Win', 'Haaland'],
    ['Haaland',   'Draw',        'Salah'  ],
    ['Watkins',   'Man City Win','Son'    ],
    ['Palmer',    'Arsenal Win', 'Saka'   ],
    ['Salah',     'Draw',        'Haaland'],
    ['Haaland',   'Man City Win','Salah'  ],
    ['Watkins',   'Arsenal Win', 'Son'    ],
    ['Palmer',    'Draw',        'Saka'   ],
  ];

  for (let mi = 0; mi < MANAGERS.length; mi++) {
    const mgr     = MANAGERS[mi];
    const answers = ANSWER_SETS[mi % ANSWER_SETS.length];

    for (let bi = 0; bi < betIds.length; bi++) {
      if (!betIds[bi]) continue;
      const r = await api('/rest/v1/bet_submissions', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: {
          bet_id:   betIds[bi],
          user_id:  mgr.id,
          answer:   answers[bi],
          submitted_at: new Date().toISOString(),
        },
      });
      if (r?.code) err(`submitBet m${mi} b${bi}`, r);
    }
    log(`  ✓ ${mgr.username} answered 3 bets`);
  }
}

// ─── Phase 7: Resolve bets ────────────────────────────────────────────────────

async function resolveBets(betIds) {
  const CORRECT = ['Salah', 'Arsenal Win', 'Haaland'];

  for (let i = 0; i < betIds.length; i++) {
    if (!betIds[i]) continue;

    await api(`/rest/v1/bet_instances?id=eq.${betIds[i]}`, {
      method: 'PATCH',
      body: { status: 'resolved', correct_answer: CORRECT[i], resolved_at: new Date().toISOString() },
    });

    await api(`/rest/v1/bet_submissions?bet_id=eq.${betIds[i]}&answer=eq.${encodeURIComponent(CORRECT[i])}`, {
      method: 'PATCH',
      body: { is_correct: true, reward_awarded: 0 },
    });
    await api(`/rest/v1/bet_submissions?bet_id=eq.${betIds[i]}&answer=neq.${encodeURIComponent(CORRECT[i])}`, {
      method: 'PATCH',
      body: { is_correct: false, reward_awarded: 0 },
    });

    log(`  ✓ resolved bet ${i + 1} — correct: ${CORRECT[i]}`);
  }
}

// ─── Phase 8: Sync fixtures ───────────────────────────────────────────────────

async function syncFixtures() {
  log('  → sync-fixtures for EPL 426…');
  const r = await edge('sync-fixtures', { forza_id: TOURNAMENT });
  log('  sync-fixtures:', r);
  return r;
}

async function getFixturesForRound(round) {
  const data = await api(`/rest/v1/fixtures?tournament_id=eq.${TOURNAMENT}&round_number=eq.${round}&select=id,home_team,away_team,forza_match_id,status,round_number&order=kickoff_at`);
  return data ?? [];
}

async function ingestAndScore(fixtureId, forzaMatchId) {
  if (forzaMatchId) {
    const r = await edge('ingest-match-events', { forza_match_id: forzaMatchId });
    if (r?.error) log(`  ⚠ ingest error for ${forzaMatchId}:`, r.error);
  }
  const r2 = await edge('calculate-scores', { fixture_id: fixtureId });
  return r2;
}

async function verifyPoints(matchdayId) {
  const data = await api(
    `/rest/v1/fantasy_points?matchday_id=eq.${matchdayId}&select=squad_id,total_points&order=total_points.desc`
  );
  if (!data?.length) { log(`  ✗ no points found for ${matchdayId}`); return; }
  log(`  ✓ Fantasy points for ${matchdayId} (${data.length} squads):`);
  data.forEach(r => log(`    squad ${r.squad_id.slice(0,8)}: ${r.total_points} pts`));
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n════════════════════════════════════════════════════════');
  console.log(' E2E SETUP — EPL_OVERALL_E2E');
  console.log(`  Target: ${SUPABASE_URL}`);
  console.log('════════════════════════════════════════════════════════\n');

  log('PHASE 0: Checking league…');
  const ok = await checkLeague();
  if (!ok) return;

  log('\nPHASE 1: Adding 7 managers via join_league_by_code…');
  await addManagers();

  const members = await api(`/rest/v1/league_members?league_id=eq.${LEAGUE_ID}&select=user_id,role`);
  log(`  ✓ ${members.length} total members in league`);

  log('\nPHASE 2: Loading EPL players…');
  const players = await getPlayers();

  log('\nPHASE 3: Building draft lists…');
  const lists = await buildDraftLists(players);
  if (!lists) return;

  log('\nPHASE 3b: Submitting draft lists…');
  await submitDraftLists(lists);

  const subs = await api(`/rest/v1/draft_submissions?league_id=eq.${LEAGUE_ID}&select=user_id,status`);
  log(`  ✓ ${subs.length} draft submissions`);

  log('\nPHASE 4: Running draft lottery…');
  await runLottery();

  log('\nVerifying squads…');
  await verifySquads();

  log('\nPHASE 5: Creating 3 bets…');
  const betIds = await createBets();

  log('\nPHASE 6: Submitting bet answers (all 8 managers)…');
  await submitBetAnswers(betIds);

  const betSubs = await api(`/rest/v1/bet_submissions?bet_id=in.(${betIds.filter(Boolean).join(',')})&select=user_id,answer,bet_id`);
  log(`  ✓ ${betSubs.length} bet submissions total`);

  log('\nPHASE 7: Resolving bets…');
  await resolveBets(betIds);

  log('\nPHASE 8: Syncing fixtures from Forza API…');
  await syncFixtures();

  log('\nPHASE 9: Ingesting & scoring GW30…');
  const gw30 = await getFixturesForRound(30);
  log(`  Found ${gw30.length} GW30 fixtures`);
  let scored30 = 0;
  for (const f of gw30) {
    if (f.status !== 'finished') { log(`  ⚠ ${f.home_team} vs ${f.away_team}: ${f.status} — skipping`); continue; }
    log(`  → ${f.home_team} vs ${f.away_team}`);
    const r = await ingestAndScore(f.id, f.forza_match_id);
    if (r?.ok) { log(`    ✓ scored: ${r.updated_squads ?? 0} squads, ${r.player_stats ?? 0} players`); scored30++; }
    else log(`    ⚠ score result:`, r);
  }
  log(`  ✓ GW30 complete: ${scored30}/${gw30.filter(f => f.status==='finished').length} fixtures scored`);
  await verifyPoints(GW30);

  log('\nPHASE 10: Ingesting & scoring GW31…');
  const gw31 = await getFixturesForRound(31);
  log(`  Found ${gw31.length} GW31 fixtures`);
  let scored31 = 0;
  for (const f of gw31) {
    if (f.status !== 'finished') { log(`  ⚠ ${f.home_team} vs ${f.away_team}: ${f.status} — skipping`); continue; }
    log(`  → ${f.home_team} vs ${f.away_team}`);
    const r = await ingestAndScore(f.id, f.forza_match_id);
    if (r?.ok) { log(`    ✓ scored: ${r.updated_squads ?? 0} squads, ${r.player_stats ?? 0} players`); scored31++; }
    else log(`    ⚠ score result:`, r);
  }
  log(`  ✓ GW31 complete: ${scored31}/${gw31.filter(f => f.status==='finished').length} fixtures scored`);
  await verifyPoints(GW31);

  console.log('\n════════════════════════════════════════════════════════');
  console.log(' SETUP COMPLETE');
  console.log('════════════════════════════════════════════════════════');
  console.log(`\n  League:    EPL_OVERALL_E2E`);
  console.log(`  ID:        ${LEAGUE_ID}`);
  console.log(`  Join code: ${JOIN_CODE}`);
  console.log(`  Members:   ${MANAGERS.length}`);
  console.log(`\n  Managers:`);
  MANAGERS.forEach(m => console.log(`    ${m.username} (${m.id.slice(0,8)})`));
  console.log(`\n  Open app: http://localhost:5174`);
  console.log(`  Admin:    http://localhost:5174/admin\n`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
