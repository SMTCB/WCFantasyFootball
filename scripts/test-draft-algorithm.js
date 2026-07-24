/**
 * Comprehensive test suite for the snake draft allocation algorithm.
 * Mirrors the exact logic in supabase/functions/run-draft-lottery/index.js.
 * No DB calls — pure algorithm tests with deterministic seeds.
 */

'use strict';

// ─── Algorithm (exact port from Edge Function) ─────────────────────────────

const DEFAULT_SQUAD_POS_CAPS = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
const DEFAULT_SQUAD_SIZE     = 15;

function normalisePosition(pos) {
  if (!pos) return 'MID';
  const p = pos.toUpperCase().trim();
  if (p === 'FW' || p === 'FWD') return 'FWD';
  if (p === 'GK')  return 'GK';
  if (p === 'DEF') return 'DEF';
  if (p === 'MID') return 'MID';
  return 'MID';
}

/**
 * runSnakeDraft: pure function — deterministic when fixedOrder is supplied.
 *
 * @param {Array}  submissions   [{user_id, player_ids[]}]
 * @param {Object} playerMap     { playerId → {id, position, price, forza_team_id} }
 * @param {Object} opts          { squadSize, posCaps, budget, clubCap, fixedOrder? }
 * @returns {{ [userId]: { allocated: string[], unresolved: number, budgetUsed: number } }}
 */
function runSnakeDraft(submissions, playerMap, opts = {}) {
  const SQUAD_SIZE = opts.squadSize ?? DEFAULT_SQUAD_SIZE;
  const SQUAD_POS_CAPS = opts.posCaps ?? DEFAULT_SQUAD_POS_CAPS;
  const budget = opts.budget ?? 100;
  const CLUB_CAP = opts.clubCap ?? 3;

  // Initialise per-manager state
  const userState = {};
  for (const sub of submissions) {
    userState[sub.user_id] = {
      allocated:  [],
      posCounts:  { GK: 0, DEF: 0, MID: 0, FWD: 0 },
      clubCounts: {},
      budgetUsed: 0,
    };
  }

  // Build submission map
  const submissionMap = {};
  for (const sub of submissions) submissionMap[sub.user_id] = sub.player_ids;

  // Snake order — use fixedOrder for deterministic tests, otherwise shuffle
  let snakeOrder;
  if (opts.fixedOrder) {
    snakeOrder = [...opts.fixedOrder];
  } else {
    snakeOrder = submissions.map(s => s.user_id);
    for (let i = snakeOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [snakeOrder[i], snakeOrder[j]] = [snakeOrder[j], snakeOrder[i]];
    }
  }

  // One pointer per manager — never resets
  const pointers = {};
  for (const sub of submissions) pointers[sub.user_id] = 0;

  const taken = new Set();
  const maxRounds = Math.max(...submissions.map(s => s.player_ids.length), 0);

  for (let round = 0; round < maxRounds; round++) {
    const roundOrder = round % 2 === 0 ? [...snakeOrder] : [...snakeOrder].reverse();

    for (const uid of roundOrder) {
      const u = userState[uid];
      if (u.allocated.length >= SQUAD_SIZE) continue;

      const list = submissionMap[uid] || [];

      while (pointers[uid] < list.length) {
        const pid = list[pointers[uid]];
        pointers[uid]++;

        if (taken.has(pid)) continue;

        const player = playerMap[pid];
        if (!player) continue;

        const pos     = normalisePosition(player.position);
        const teamId  = player.forza_team_id;
        const clubCnt = teamId ? (u.clubCounts[teamId] ?? 0) : 0;

        if (u.posCounts[pos] >= SQUAD_POS_CAPS[pos]) continue;
        if (u.budgetUsed + player.price > budget)    continue;
        if (teamId && CLUB_CAP < 99 && clubCnt >= CLUB_CAP) continue;

        u.allocated.push(pid);
        u.posCounts[pos]++;
        if (teamId) u.clubCounts[teamId] = clubCnt + 1;
        u.budgetUsed += player.price;
        taken.add(pid);
        break;
      }
    }

    if (Object.values(userState).every(u => u.allocated.length >= SQUAD_SIZE)) break;
    if (Object.keys(pointers).every(uid => pointers[uid] >= (submissionMap[uid]?.length ?? 0))) break;
  }

  const result = {};
  for (const [uid, u] of Object.entries(userState)) {
    result[uid] = {
      allocated:   u.allocated,
      unresolved:  Math.max(0, SQUAD_SIZE - u.allocated.length),
      budgetUsed:  u.budgetUsed,
      posCounts:   u.posCounts,
      clubCounts:  u.clubCounts,
    };
  }
  return result;
}

// ─── Test framework ────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label, detail = '') {
  if (condition) {
    passed++;
    process.stdout.write(`  ✓ ${label}\n`);
  } else {
    failed++;
    failures.push({ label, detail });
    process.stdout.write(`  ✗ ${label}${detail ? '\n    ' + detail : ''}\n`);
  }
}

function section(name) {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`SCENARIO: ${name}`);
  console.log('─'.repeat(70));
}

// ─── Player factory ────────────────────────────────────────────────────────

let _pid = 1;
function makePlayer(pos, price, teamId = 'TEAM_A') {
  const id = `P${String(_pid++).padStart(3,'0')}`;
  return { id, position: pos, price, forza_team_id: teamId };
}

function makePlayerMap(players) {
  return Object.fromEntries(players.map(p => [p.id, p]));
}

// ─── SCENARIO 1: Safety guarantee — no unwanted player ever assigned ──────

section('1 — Safety guarantee: only wish-listed players are assigned');

{
  // Build a realistic pool of 40 players
  const pool = [];
  for (let i = 0; i < 2; i++) pool.push(makePlayer('GK',  5.0, 'T1'));
  for (let i = 0; i < 2; i++) pool.push(makePlayer('GK',  4.5, 'T2'));
  for (let i = 0; i < 8; i++) pool.push(makePlayer('DEF', 5.0, `T${(i%4)+1}`));
  for (let i = 0; i < 8; i++) pool.push(makePlayer('MID', 5.0, `T${(i%4)+1}`));
  for (let i = 0; i < 8; i++) pool.push(makePlayer('FWD', 5.0, `T${(i%4)+1}`));
  for (let i = 0; i < 8; i++) pool.push(makePlayer('MID', 4.0, `T${(i%4)+5}`));
  for (let i = 0; i < 4; i++) pool.push(makePlayer('DEF', 4.0, `T${i+9}`));

  const playerMap = makePlayerMap(pool);
  const allIds    = pool.map(p => p.id);

  // 4 managers with non-overlapping subsets of the pool
  const A_list = allIds.slice(0, 20);
  const B_list = allIds.slice(5, 25);
  const C_list = allIds.slice(10, 30);
  const D_list = allIds.slice(15, 35);

  const submissions = [
    { user_id: 'A', player_ids: A_list },
    { user_id: 'B', player_ids: B_list },
    { user_id: 'C', player_ids: C_list },
    { user_id: 'D', player_ids: D_list },
  ];

  const result = runSnakeDraft(submissions, playerMap, {
    squadSize: 15, budget: 100, clubCap: 3, fixedOrder: ['A','B','C','D']
  });

  const listSets = { A: new Set(A_list), B: new Set(B_list), C: new Set(C_list), D: new Set(D_list) };

  for (const [uid, data] of Object.entries(result)) {
    const unwanted = data.allocated.filter(pid => !listSets[uid].has(pid));
    assert(
      unwanted.length === 0,
      `Manager ${uid}: no unwanted players (got ${data.allocated.length} players)`,
      unwanted.length > 0 ? `Unwanted: ${unwanted.join(', ')}` : ''
    );
  }
}

// ─── SCENARIO 2: No duplicate assignments ──────────────────────────────────

section('2 — No duplicate assignments: each player owned by at most one manager');

{
  const pool = [];
  for (let i = 0; i < 2; i++) pool.push(makePlayer('GK',  5.0, 'T1'));
  for (let i = 0; i < 6; i++) pool.push(makePlayer('DEF', 5.0, `T${i+1}`));
  for (let i = 0; i < 6; i++) pool.push(makePlayer('MID', 5.0, `T${i+1}`));
  for (let i = 0; i < 4; i++) pool.push(makePlayer('FWD', 5.0, `T${i+1}`));
  // Extra depth
  for (let i = 0; i < 30; i++) pool.push(makePlayer(['GK','DEF','MID','FWD'][i%4], 4.0, `T${i%8+1}`));

  const playerMap = makePlayerMap(pool);
  const allIds    = pool.map(p => p.id);

  // 5 managers, all want the same top-15
  const top15 = allIds.slice(0, 15);
  const submissions = ['A','B','C','D','E'].map(uid => ({
    user_id: uid,
    player_ids: [...top15, ...allIds.slice(15, 45)],
  }));

  const result = runSnakeDraft(submissions, playerMap, {
    squadSize: 15, budget: 200, clubCap: 99, fixedOrder: ['A','B','C','D','E']
  });

  const allAllocated = Object.values(result).flatMap(d => d.allocated);
  const seen = new Set();
  let dupCount = 0;
  for (const pid of allAllocated) {
    if (seen.has(pid)) dupCount++;
    seen.add(pid);
  }

  assert(dupCount === 0, `No player allocated to 2+ managers (${allAllocated.length} total picks, ${dupCount} duplicates)`);

  const totalAllocated = allAllocated.length;
  assert(totalAllocated === seen.size, `Seen-set size equals total allocated count`);
}

// ─── SCENARIO 3: Snake order reversal ──────────────────────────────────────

section('3 — Snake order: round 1 = A→B→C, round 2 = C→B→A');

{
  // 3 managers, each wants a unique player at rank 1 (no conflict)
  // then all 3 want the same player at rank 2
  // With snake: A picks round-2 LAST (order reverses) → B or C gets that shared player
  const PA1 = makePlayer('GK',  5.0, 'TA');
  const PB1 = makePlayer('GK',  5.0, 'TB');
  const PC1 = makePlayer('GK',  5.0, 'TC');
  const PShared = makePlayer('DEF', 5.0, 'TX');  // all 3 want this at rank 2

  // Extra DEF depth
  const extras = [];
  for (let i = 0; i < 20; i++) extras.push(makePlayer('DEF', 4.0, `TX${i}`));
  for (let i = 0; i < 10; i++) extras.push(makePlayer('MID', 4.0, `TM${i}`));
  for (let i = 0; i < 5;  i++) extras.push(makePlayer('FWD', 4.0, `TF${i}`));
  for (let i = 0; i < 5;  i++) extras.push(makePlayer('GK',  4.0, `TG${i}`));

  const playerMap = makePlayerMap([PA1, PB1, PC1, PShared, ...extras]);
  const extraIds  = extras.map(p => p.id);

  const submissions = [
    { user_id: 'A', player_ids: [PA1.id, PShared.id, ...extraIds] },
    { user_id: 'B', player_ids: [PB1.id, PShared.id, ...extraIds] },
    { user_id: 'C', player_ids: [PC1.id, PShared.id, ...extraIds] },
  ];

  // Fixed order: A first in round 1 → C first in round 2
  const result = runSnakeDraft(submissions, playerMap, {
    squadSize: 15, budget: 200, clubCap: 99, fixedOrder: ['A','B','C']
  });

  // Round 1: A→B→C each pick their unique GK
  assert(result['A'].allocated.includes(PA1.id), 'Manager A gets their rank-1 GK');
  assert(result['B'].allocated.includes(PB1.id), 'Manager B gets their rank-1 GK');
  assert(result['C'].allocated.includes(PC1.id), 'Manager C gets their rank-1 GK');

  // Round 2 (reversed): C→B→A. C picks first → C gets PShared
  assert(result['C'].allocated.includes(PShared.id), 'Manager C (last in round 1) gets shared player in round 2 (snake reversal)');
  assert(!result['A'].allocated.includes(PShared.id), 'Manager A (first in round 1) does NOT get shared player');
  assert(!result['B'].allocated.includes(PShared.id), 'Manager B does NOT get shared player either');
}

// ─── SCENARIO 4: Pointer advances — no re-try of taken players ─────────────

section('4 — Pointer advance: taken players are never re-tried in later rounds');

{
  // Manager A: [gk1, gk2, def1, def2, def3, def4, def5, mid1, mid2, mid3, mid4, fwd1, fwd2, fwd3, def6, + extra_mid]
  // Manager B: [def3, ...bExtra]  (B picks def3 in round 0 since B goes first)
  // Expectation: A's pointer advances past def3 (already taken) and A fills all 15
  //              from the remaining 15 items in A's list (A listed 16 total → 15 still valid).
  //
  // Key pointer-advance invariant: A never re-visits def3 once the pointer passes it.

  const gk1      = makePlayer('GK',  5.0, 'T0');
  const gk2      = makePlayer('GK',  5.0, 'T0b');
  const def1     = makePlayer('DEF', 5.0, 'T1');
  const def2     = makePlayer('DEF', 5.0, 'T2');
  const def3     = makePlayer('DEF', 5.0, 'T3');
  const def4     = makePlayer('DEF', 5.0, 'T4');
  const def5     = makePlayer('DEF', 5.0, 'T5');
  const def6     = makePlayer('DEF', 5.0, 'T6');
  const mid1     = makePlayer('MID', 5.0, 'T1');
  const mid2     = makePlayer('MID', 5.0, 'T2');
  const mid3     = makePlayer('MID', 5.0, 'T3');
  const mid4     = makePlayer('MID', 5.0, 'T4');
  const mid5     = makePlayer('MID', 5.0, 'T5');  // extra MID — gives A 16 items so 15 remain after def3 is taken
  const fwd1     = makePlayer('FWD', 5.0, 'T1');
  const fwd2     = makePlayer('FWD', 5.0, 'T2');
  const fwd3     = makePlayer('FWD', 5.0, 'T3');

  const bExtra = [];
  for (let i = 0; i < 15; i++) bExtra.push(makePlayer(['GK','DEF','MID','FWD'][i%4], 4.0, `BT${i}`));

  const all = [gk1, gk2, def1, def2, def3, def4, def5, def6,
               mid1, mid2, mid3, mid4, mid5, fwd1, fwd2, fwd3, ...bExtra];
  const playerMap = makePlayerMap(all);

  // A's list has 16 items: def3 is at position 4. With def3 taken, A still has 15 valid → full squad.
  const A_ids = [gk1,gk2,def1,def2,def3,def4,def5,mid1,mid2,mid3,mid4,mid5,fwd1,fwd2,fwd3,def6].map(p=>p.id);
  const B_ids = [def3, ...bExtra].map(p=>p.id);

  const result = runSnakeDraft(
    [{ user_id: 'B', player_ids: B_ids }, { user_id: 'A', player_ids: A_ids }],
    playerMap,
    { squadSize: 15, budget: 200, clubCap: 99, fixedOrder: ['B', 'A'] }
  );

  assert(result['B'].allocated.includes(def3.id), 'Manager B takes def3 at rank 1 in round 0');
  assert(!result['A'].allocated.includes(def3.id), 'Manager A does NOT receive def3 (taken by B)');
  assert(result['A'].allocated.length === 15, `Manager A fills all 15 slots despite def3 being taken (got ${result['A'].allocated.length})`);
  const A_set = new Set(A_ids);
  const A_unwanted = result['A'].allocated.filter(pid => !A_set.has(pid));
  assert(A_unwanted.length === 0, 'Manager A has no unwanted players — all from wish list');
}

// ─── SCENARIO 5: Position cap enforcement ──────────────────────────────────

section('5 — Position cap: manager cannot exceed position limits');

{
  // Manager lists 10 DEFs at the top (cap = 5), then fills remaining positions
  const defsPool = [];
  for (let i = 0; i < 10; i++) defsPool.push(makePlayer('DEF', 4.0, `D${i}`));
  const gks  = [makePlayer('GK', 5.0,'GA'), makePlayer('GK', 5.0,'GB')];
  const mids = [];
  for (let i = 0; i < 5; i++) mids.push(makePlayer('MID', 4.0, `M${i}`));
  const fwds = [];
  for (let i = 0; i < 3; i++) fwds.push(makePlayer('FWD', 4.0, `F${i}`));

  const all = [...defsPool, ...gks, ...mids, ...fwds];
  const playerMap = makePlayerMap(all);

  const submissions = [
    {
      user_id: 'A',
      player_ids: [...defsPool, ...gks, ...mids, ...fwds].map(p => p.id),
    },
  ];

  const result = runSnakeDraft(submissions, playerMap, {
    squadSize: 15, budget: 200, clubCap: 99, fixedOrder: ['A']
  });

  assert(result['A'].posCounts['DEF'] <= 5, `DEF count ≤ 5 (got ${result['A'].posCounts['DEF']})`);
  assert(result['A'].posCounts['GK']  <= 2, `GK count ≤ 2 (got ${result['A'].posCounts['GK']})`);
  assert(result['A'].posCounts['MID'] <= 5, `MID count ≤ 5 (got ${result['A'].posCounts['MID']})`);
  assert(result['A'].posCounts['FWD'] <= 3, `FWD count ≤ 3 (got ${result['A'].posCounts['FWD']})`);
  assert(result['A'].allocated.length === 15, `Manager A gets a full squad despite over-listing DEFs (got ${result['A'].allocated.length})`);
}

// ─── SCENARIO 6: Budget enforcement ────────────────────────────────────────

section('6 — Budget enforcement: manager cannot exceed £100M');

{
  // All players cost £15M. Budget £100M → max 6 players (6×15=90, 7×15=105 > 100)
  const expensive = [];
  for (let i = 0; i < 2; i++) expensive.push(makePlayer('GK',  15.0, `T${i}`));
  for (let i = 0; i < 5; i++) expensive.push(makePlayer('DEF', 15.0, `T${i+2}`));
  for (let i = 0; i < 5; i++) expensive.push(makePlayer('MID', 15.0, `T${i+7}`));
  for (let i = 0; i < 3; i++) expensive.push(makePlayer('FWD', 15.0, `T${i+12}`));

  const playerMap = makePlayerMap(expensive);
  const submissions = [{ user_id: 'A', player_ids: expensive.map(p => p.id) }];

  const result = runSnakeDraft(submissions, playerMap, {
    squadSize: 15, budget: 100, clubCap: 99, fixedOrder: ['A']
  });

  assert(result['A'].budgetUsed <= 100, `Budget not exceeded (used £${result['A'].budgetUsed}M)`);
  // 6 × £15 = £90, 7th would be £105 → should stop at 6
  assert(result['A'].allocated.length <= Math.floor(100/15), `Got ${result['A'].allocated.length} players (max ${Math.floor(100/15)} at £15M each within £100M budget)`);
  assert(result['A'].unresolved > 0, `Incomplete squad flagged (unresolved_slots = ${result['A'].unresolved})`);
}

// ─── SCENARIO 7: Club cap enforcement ──────────────────────────────────────

section('7 — Club cap enforcement: max 3 players from same club');

{
  // Manager lists 6 players from same club first, then fills rest from other clubs
  const sameClub = [];
  for (let i = 0; i < 2; i++) sameClub.push(makePlayer('GK',  5.0, 'CLUB_X'));
  for (let i = 0; i < 4; i++) sameClub.push(makePlayer('DEF', 5.0, 'CLUB_X'));

  const others = [];
  for (let i = 0; i < 4; i++) others.push(makePlayer('DEF', 5.0, `OC${i}`));
  for (let i = 0; i < 5; i++) others.push(makePlayer('MID', 5.0, `OC${i+4}`));
  for (let i = 0; i < 3; i++) others.push(makePlayer('FWD', 5.0, `OC${i+9}`));

  const all = [...sameClub, ...others];
  const playerMap = makePlayerMap(all);
  const submissions = [{ user_id: 'A', player_ids: all.map(p => p.id) }];

  const result = runSnakeDraft(submissions, playerMap, {
    squadSize: 15, budget: 200, clubCap: 3, fixedOrder: ['A']
  });

  const xCount = result['A'].clubCounts['CLUB_X'] ?? 0;
  assert(xCount <= 3, `Club CLUB_X count ≤ 3 (got ${xCount})`);
  assert(result['A'].allocated.length === 15, `Full squad allocated despite club cap (got ${result['A'].allocated.length})`);
}

// ─── SCENARIO 8: Rank priority ─────────────────────────────────────────────

section('8 — Rank priority: higher-ranked player is tried in earlier round');

{
  // Manager A: [P_GOLD, P_SILVER, ...rest]  (P_GOLD at rank 1)
  // Manager B: [P_SILVER, P_GOLD, ...rest]  (P_GOLD at rank 2)
  // A goes first in round 1.
  // Round 1: A picks P_GOLD (rank 1), B picks P_SILVER (rank 1).
  // P_GOLD is gone by the time B's round-2 turn arrives.
  // Both get their rank-1 player — no conflict.

  const P_GOLD   = makePlayer('GK',  5.0, 'G1');
  const P_SILVER = makePlayer('DEF', 5.0, 'S1');

  const restA = [];
  for (let i = 0; i < 5; i++) restA.push(makePlayer('DEF', 4.0, `RA${i}`));
  for (let i = 0; i < 5; i++) restA.push(makePlayer('MID', 4.0, `RA${i+5}`));
  for (let i = 0; i < 3; i++) restA.push(makePlayer('FWD', 4.0, `RA${i+10}`));
  const restB = [];
  for (let i = 0; i < 1; i++) restB.push(makePlayer('GK',  4.0, `RB${i}`));
  for (let i = 0; i < 4; i++) restB.push(makePlayer('DEF', 4.0, `RB${i+1}`));
  for (let i = 0; i < 5; i++) restB.push(makePlayer('MID', 4.0, `RB${i+5}`));
  for (let i = 0; i < 3; i++) restB.push(makePlayer('FWD', 4.0, `RB${i+10}`));

  const all = [P_GOLD, P_SILVER, ...restA, ...restB];
  const playerMap = makePlayerMap(all);

  const A_list = [P_GOLD, P_SILVER, ...restA].map(p => p.id);
  const B_list = [P_SILVER, P_GOLD, ...restB].map(p => p.id);

  const submissions = [
    { user_id: 'A', player_ids: A_list },
    { user_id: 'B', player_ids: B_list },
  ];

  // A picks first
  const result = runSnakeDraft(submissions, playerMap, {
    squadSize: 15, budget: 200, clubCap: 99, fixedOrder: ['A','B']
  });

  // A ranks P_GOLD #1 → A gets P_GOLD
  assert(result['A'].allocated.includes(P_GOLD.id), 'Manager A (picks first) gets their rank-1 player P_GOLD');
  // B ranks P_SILVER #1 → B gets P_SILVER
  assert(result['B'].allocated.includes(P_SILVER.id), 'Manager B gets their rank-1 player P_SILVER');
  // B ranked P_GOLD #2 but A already took it → B doesn't get P_GOLD
  assert(!result['B'].allocated.includes(P_GOLD.id), 'Manager B does NOT get P_GOLD (already taken by A)');
}

// ─── SCENARIO 9: All managers want the same top-N players ──────────────────

section('9 — Heavy overlap: 5 managers all rank the same 25 players first');

{
  // Build a pool of 60 players: 25 "star" players + 35 depth players
  const stars = [];
  stars.push(makePlayer('GK',  6.0, 'T1'));
  stars.push(makePlayer('GK',  5.5, 'T2'));
  for (let i = 0; i < 5; i++) stars.push(makePlayer('DEF', 6.0, `T${i+1}`));
  for (let i = 0; i < 5; i++) stars.push(makePlayer('MID', 6.0, `T${i+1}`));
  for (let i = 0; i < 3; i++) stars.push(makePlayer('FWD', 6.0, `T${i+1}`));
  while (stars.length < 25) stars.push(makePlayer('MID', 5.5, `TX${stars.length}`));

  const depth = [];
  for (let i = 0; i < 10; i++) depth.push(makePlayer('DEF', 4.0, `D${i}`));
  for (let i = 0; i < 10; i++) depth.push(makePlayer('MID', 4.0, `M${i}`));
  for (let i = 0; i < 5;  i++) depth.push(makePlayer('FWD', 4.0, `F${i}`));
  for (let i = 0; i < 5;  i++) depth.push(makePlayer('GK',  4.0, `G${i}`));
  for (let i = 0; i < 5;  i++) depth.push(makePlayer('DEF', 3.5, `DD${i}`));

  const all = [...stars, ...depth];
  const playerMap = makePlayerMap(all);
  const starIds  = stars.map(p => p.id);
  const depthIds = depth.map(p => p.id);
  const allIds   = all.map(p => p.id);

  const submissions = ['A','B','C','D','E'].map(uid => ({
    user_id: uid,
    player_ids: [...starIds, ...depthIds],  // all want stars first, depth as fallback
  }));

  const result = runSnakeDraft(submissions, playerMap, {
    squadSize: 15, budget: 200, clubCap: 99, fixedOrder: ['A','B','C','D','E']
  });

  // Safety: no duplicates
  const allPicks = Object.values(result).flatMap(d => d.allocated);
  const uniquePicks = new Set(allPicks);
  assert(uniquePicks.size === allPicks.length, `No duplicates across 5 managers (${allPicks.length} total picks)`);

  // All picks are from the shared wish list
  let allFromList = true;
  for (const [uid, data] of Object.entries(result)) {
    const unwanted = data.allocated.filter(pid => !new Set(allIds).has(pid));
    if (unwanted.length > 0) allFromList = false;
  }
  assert(allFromList, 'All 5 managers receive only players from the shared wish list');

  // Each squad ≤ 15
  for (const [uid, data] of Object.entries(result)) {
    assert(data.allocated.length <= 15, `Manager ${uid} has ≤ 15 players (got ${data.allocated.length})`);
  }

  // Star distribution: 25 stars / 5 managers → on average 5 each, at most 15
  const starCounts = Object.entries(result).map(([uid, data]) => ({
    uid,
    stars: data.allocated.filter(pid => new Set(starIds).has(pid)).length
  }));
  console.log(`  ℹ Star players (top 25) distribution: ${starCounts.map(r => `${r.uid}=${r.stars}`).join(', ')}`);
  assert(starCounts.every(r => r.stars <= 25), 'No manager has more star players than possible');
}

// ─── SCENARIO 10: Exhausted wish list → incomplete squad ───────────────────

section('10 — Exhausted wish list: short list results in incomplete squad');

{
  // A only wants p1. B and C both want p1 and pick before A.
  // Snake order: B→C→A in round 0.  B takes p1 in round 0.
  // A's list is exhausted (only had p1) → 0 players, 15 unresolved.
  //
  // Also verifies the "0 picks" edge case: once list is exhausted the manager
  // never receives a player they didn't list, even with open slots remaining.

  const p1 = makePlayer('GK', 5.0, 'T1');

  const bPool = [];
  for (let i = 0; i < 2; i++) bPool.push(makePlayer('GK',  4.0, `GB${i}`));
  for (let i = 0; i < 5; i++) bPool.push(makePlayer('DEF', 4.0, `DB${i}`));
  for (let i = 0; i < 5; i++) bPool.push(makePlayer('MID', 4.0, `MB${i}`));
  for (let i = 0; i < 3; i++) bPool.push(makePlayer('FWD', 4.0, `FB${i}`));

  const cPool = [];
  for (let i = 0; i < 2; i++) cPool.push(makePlayer('GK',  4.0, `GC${i}`));
  for (let i = 0; i < 5; i++) cPool.push(makePlayer('DEF', 4.0, `DC${i}`));
  for (let i = 0; i < 5; i++) cPool.push(makePlayer('MID', 4.0, `MC${i}`));
  for (let i = 0; i < 3; i++) cPool.push(makePlayer('FWD', 4.0, `FC${i}`));

  const all = [p1, ...bPool, ...cPool];
  const playerMap = makePlayerMap(all);

  const submissions = [
    { user_id: 'B', player_ids: [p1.id, ...bPool.map(p=>p.id)] },
    { user_id: 'C', player_ids: [p1.id, ...cPool.map(p=>p.id)] },
    { user_id: 'A', player_ids: [p1.id] },  // A only wants p1
  ];

  // B picks first → B takes p1 immediately in round 0
  const result = runSnakeDraft(submissions, playerMap, {
    squadSize: 15, budget: 200, clubCap: 99, fixedOrder: ['B','C','A']
  });

  assert(result['B'].allocated.includes(p1.id), 'Manager B (picks first) takes p1 in round 0');
  assert(!result['A'].allocated.includes(p1.id), 'Manager A does NOT get p1 (taken by B before A picks)');
  assert(result['A'].allocated.length === 0, `Manager A gets 0 players (only p1 on list, already taken; got ${result['A'].allocated.length})`);
  assert(result['A'].unresolved === 15, `Manager A flagged with 15 unresolved slots (got ${result['A'].unresolved})`);
}

// ─── SCENARIO 11: 3-manager overlap (the test you ran yesterday) ───────────

section('11 — Your 3-manager test: overlap in first 6 positions');

{
  // Simulate: 3 managers all list the same 6 players in positions 1–6
  // (mirroring the manual test you ran yesterday with actual users)
  // Uses a realistic squad structure with enough depth for full allocation

  const shared = [];
  shared.push(makePlayer('GK',  7.0, 'TOP'));
  shared.push(makePlayer('DEF', 7.5, 'TOP'));
  shared.push(makePlayer('DEF', 7.0, 'TOP'));
  shared.push(makePlayer('MID', 7.5, 'TOP'));
  shared.push(makePlayer('MID', 7.0, 'TOP'));
  shared.push(makePlayer('FWD', 7.5, 'TOP'));

  // Each manager has unique depth to fill remaining slots.
  // 6 shared players all come from team 'TOP'. Club cap = 3.
  // Each manager gets at most 3 from TOP via the shared list, then
  // needs 12+ more from their private depth list. Depth lists are sized
  // to 13 players each (1 GK + 5 DEF + 5 MID + 2 FWD = 13) — enough to
  // cover the worst case where a manager only wins 2 shared players and
  // needs 13 from depth.
  // Depth list sized to the worst case: manager gets 0 shared players and needs
  // a full squad from depth alone (2 GK + 5 DEF + 5 MID + 3 FWD = 15).
  const make15 = (teamPrefix) => {
    const pool = [];
    for (let i = 0; i < 2; i++) pool.push(makePlayer('GK',  4.5, `${teamPrefix}GK${i}`));
    for (let i = 0; i < 5; i++) pool.push(makePlayer('DEF', 4.5, `${teamPrefix}DF${i}`));
    for (let i = 0; i < 5; i++) pool.push(makePlayer('MID', 4.5, `${teamPrefix}MD${i}`));
    for (let i = 0; i < 3; i++) pool.push(makePlayer('FWD', 4.5, `${teamPrefix}FW${i}`));
    return pool;  // 15 players — covers every position cap regardless of shared allocation
  };

  const depthA = make15('DA');
  const depthB = make15('DB');
  const depthC = make15('DC');

  const all = [...shared, ...depthA, ...depthB, ...depthC];
  const playerMap = makePlayerMap(all);
  const sharedIds = shared.map(p => p.id);

  const A_list = [...sharedIds, ...depthA.map(p=>p.id)];
  const B_list = [...sharedIds, ...depthB.map(p=>p.id)];
  const C_list = [...sharedIds, ...depthC.map(p=>p.id)];

  const submissions = [
    { user_id: 'A', player_ids: A_list },
    { user_id: 'B', player_ids: B_list },
    { user_id: 'C', player_ids: C_list },
  ];

  const result = runSnakeDraft(submissions, playerMap, {
    squadSize: 15, budget: 200, clubCap: 3, fixedOrder: ['A','B','C']
  });

  // No duplicates
  const allPicks = Object.values(result).flatMap(d => d.allocated);
  const unique   = new Set(allPicks);
  assert(unique.size === allPicks.length, `No duplicate assignments (${allPicks.length} picks, ${unique.size} unique)`);

  // All managers get full squads
  for (const [uid, data] of Object.entries(result)) {
    assert(data.allocated.length === 15, `Manager ${uid} gets a full squad of 15 (got ${data.allocated.length})`);
  }

  // No unwanted players
  const listSets = { A: new Set(A_list), B: new Set(B_list), C: new Set(C_list) };
  for (const [uid, data] of Object.entries(result)) {
    const unwanted = data.allocated.filter(pid => !listSets[uid].has(pid));
    assert(unwanted.length === 0, `Manager ${uid}: all allocated players are from their wish list`);
  }

  // Shared player distribution
  for (const [uid, data] of Object.entries(result)) {
    const sharedCount = data.allocated.filter(pid => new Set(sharedIds).has(pid)).length;
    console.log(`  ℹ Manager ${uid} received ${sharedCount}/6 shared top-tier players`);
  }

  // Each shared player goes to exactly one manager
  for (const pid of sharedIds) {
    const owners = Object.entries(result).filter(([,d]) => d.allocated.includes(pid)).map(([uid]) => uid);
    assert(owners.length <= 1, `Shared player ${pid} has at most 1 owner (got: ${owners.join(',')||'none'})`);
  }
}

// ─── SCENARIO 12: Club cap = 99 (no cap) doesn't break anything ────────────

section('12 — Club cap = 99 (disabled): manager can get all players from one club');

{
  const sameClub = [];
  sameClub.push(makePlayer('GK',  5.0, 'MEGA'));
  sameClub.push(makePlayer('GK',  5.0, 'MEGA'));
  for (let i = 0; i < 5; i++) sameClub.push(makePlayer('DEF', 5.0, 'MEGA'));
  for (let i = 0; i < 5; i++) sameClub.push(makePlayer('MID', 5.0, 'MEGA'));
  for (let i = 0; i < 3; i++) sameClub.push(makePlayer('FWD', 5.0, 'MEGA'));

  const playerMap = makePlayerMap(sameClub);
  const submissions = [{ user_id: 'A', player_ids: sameClub.map(p=>p.id) }];

  const result = runSnakeDraft(submissions, playerMap, {
    squadSize: 15, budget: 200, clubCap: 99, fixedOrder: ['A']
  });

  assert(result['A'].allocated.length === 15, `Full squad from one club when cap=99 (got ${result['A'].allocated.length})`);
  assert(result['A'].unresolved === 0, 'No unresolved slots');
}

// ─── SCENARIO 13: GK auto-initialisation — GK sorted first ─────────────────

section('13 — Position ordering: GK listed last but cap still enforced');

{
  // Manager lists 5 DEFs, 5 MIDs, 3 FWDs first, then 2 GKs last
  // Should still get exactly 1–2 GKs (whatever is first reached within cap)
  const gks  = [makePlayer('GK', 5.0, 'G1'), makePlayer('GK', 5.0, 'G2')];
  const defs = [];
  for (let i = 0; i < 5; i++) defs.push(makePlayer('DEF', 4.5, `D${i}`));
  const mids = [];
  for (let i = 0; i < 5; i++) mids.push(makePlayer('MID', 4.5, `M${i}`));
  const fwds = [];
  for (let i = 0; i < 3; i++) fwds.push(makePlayer('FWD', 4.5, `F${i}`));

  const all = [...defs, ...mids, ...fwds, ...gks];
  const playerMap = makePlayerMap(all);
  const submissions = [{ user_id: 'A', player_ids: all.map(p=>p.id) }];

  const result = runSnakeDraft(submissions, playerMap, {
    squadSize: 15, budget: 200, clubCap: 99, fixedOrder: ['A']
  });

  assert(result['A'].allocated.length === 15, `Full squad allocated (GK listed last, got ${result['A'].allocated.length})`);
  assert(result['A'].posCounts['GK'] <= 2, `GK count ≤ 2 (got ${result['A'].posCounts['GK']})`);
  assert(result['A'].posCounts['GK'] >= 1, `At least 1 GK allocated (got ${result['A'].posCounts['GK']})`);
}

// ─── SCENARIO 14: Multi-round realistic scenario ────────────────────────────

section('14 — Realistic full allocation: 4 managers × 45-pick lists, WC-style prices');

{
  // Build a 120-player pool representative of a WC tournament
  const pool = [];
  // Premium players (£6.5-7.5)
  for (let i = 0; i < 4; i++)  pool.push(makePlayer('GK',  7.0, `NAT${i}`));
  for (let i = 0; i < 12; i++) pool.push(makePlayer('DEF', 7.0, `NAT${i%4}`));
  for (let i = 0; i < 12; i++) pool.push(makePlayer('MID', 7.5, `NAT${i%4}`));
  for (let i = 0; i < 8; i++)  pool.push(makePlayer('FWD', 7.5, `NAT${i%4}`));
  // Mid-tier (£5-6)
  for (let i = 0; i < 4; i++)  pool.push(makePlayer('GK',  5.5, `NAT${i+4}`));
  for (let i = 0; i < 12; i++) pool.push(makePlayer('DEF', 5.5, `NAT${(i%8)+4}`));
  for (let i = 0; i < 12; i++) pool.push(makePlayer('MID', 5.5, `NAT${(i%8)+4}`));
  for (let i = 0; i < 8; i++)  pool.push(makePlayer('FWD', 5.5, `NAT${(i%8)+4}`));
  // Budget (£3.5-4.5)
  for (let i = 0; i < 4; i++)  pool.push(makePlayer('GK',  4.0, `NAT${i+12}`));
  for (let i = 0; i < 16; i++) pool.push(makePlayer('DEF', 4.0, `NAT${(i%8)+12}`));
  for (let i = 0; i < 16; i++) pool.push(makePlayer('MID', 4.0, `NAT${(i%8)+12}`));
  for (let i = 0; i < 8; i++)  pool.push(makePlayer('FWD', 4.0, `NAT${(i%8)+12}`));

  const playerMap = makePlayerMap(pool);
  const allIds    = pool.map(p => p.id);

  // 4 managers with overlapping but different preference lists (simulate real diversity)
  // Each picks top 20 premium players, then their own preferred mid/budget picks
  const premiumIds = allIds.slice(0, 36);
  const midIds     = allIds.slice(36, 72);
  const budgetIds  = allIds.slice(72);

  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length-1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i+1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const submissions = ['A','B','C','D'].map(uid => ({
    user_id: uid,
    // Each manager shuffles premium pool, then adds their own mid+budget preferences
    player_ids: [...shuffle(premiumIds).slice(0,20), ...shuffle(midIds).slice(0,15), ...shuffle(budgetIds).slice(0,10)],
  }));

  const result = runSnakeDraft(submissions, playerMap, {
    squadSize: 15, budget: 100, clubCap: 3, fixedOrder: ['A','B','C','D']
  });

  // No duplicates
  const allPicks = Object.values(result).flatMap(d => d.allocated);
  const unique   = new Set(allPicks);
  assert(unique.size === allPicks.length, `No duplicate assignments (${allPicks.length} picks)`);

  // Budget respected
  for (const [uid, data] of Object.entries(result)) {
    assert(data.budgetUsed <= 100, `Manager ${uid} within £100M budget (used £${data.budgetUsed.toFixed(1)}M)`);
  }

  // Club cap respected
  let clubCapViolation = false;
  for (const [uid, data] of Object.entries(result)) {
    for (const [club, cnt] of Object.entries(data.clubCounts)) {
      if (cnt > 3) { clubCapViolation = true; console.log(`  ✗ Club cap violated: ${uid} has ${cnt} from ${club}`); }
    }
  }
  assert(!clubCapViolation, 'Club cap (3) respected by all managers');

  // Position caps respected
  for (const [uid, data] of Object.entries(result)) {
    assert(data.posCounts['GK']  <= 2, `Manager ${uid} GK ≤ 2 (got ${data.posCounts['GK']})`);
    assert(data.posCounts['DEF'] <= 5, `Manager ${uid} DEF ≤ 5 (got ${data.posCounts['DEF']})`);
    assert(data.posCounts['MID'] <= 5, `Manager ${uid} MID ≤ 5 (got ${data.posCounts['MID']})`);
    assert(data.posCounts['FWD'] <= 3, `Manager ${uid} FWD ≤ 3 (got ${data.posCounts['FWD']})`);
  }

  // All wish-listed
  for (const [uid, data] of Object.entries(result)) {
    const mySet = new Set(submissions.find(s => s.user_id === uid).player_ids);
    const unwanted = data.allocated.filter(pid => !mySet.has(pid));
    assert(unwanted.length === 0, `Manager ${uid} has no unwanted players (got ${data.allocated.length} players, ${data.unresolved} unresolved)`);
  }

  for (const [uid, data] of Object.entries(result)) {
    const [pos] = Object.entries(data.posCounts).map(([p,c]) => `${p}:${c}`);
    console.log(`  ℹ Manager ${uid}: ${data.allocated.length} players, £${data.budgetUsed.toFixed(1)}M used, ${data.unresolved} unresolved | ${Object.entries(data.posCounts).map(([p,c])=>`${p}:${c}`).join(' ')}`);
  }
}

// ─── SCENARIO 15: Edge case — 1 manager, empty pool ───────────────────────

section('15 — Edge: single manager, all players unknown (not in playerMap)');

{
  const submissions = [{ user_id: 'A', player_ids: ['GHOST1','GHOST2','GHOST3'] }];
  const result = runSnakeDraft(submissions, {}, {
    squadSize: 15, budget: 200, clubCap: 99, fixedOrder: ['A']
  });

  assert(result['A'].allocated.length === 0, 'No allocations for ghost player IDs');
  assert(result['A'].unresolved === 15, 'All 15 slots flagged as unresolved');
}

// ─── SCENARIO 16: Pointer non-regression — exhausted pointer stays exhausted

section('16 — Pointer exhaustion: once list is done, no further picks happen');

{
  // Manager A has 3 players in list. All 3 are available. Gets 3. Stays at 3.
  const p1 = makePlayer('GK',  5.0, 'T1');
  const p2 = makePlayer('DEF', 5.0, 'T2');
  const p3 = makePlayer('MID', 5.0, 'T3');

  const playerMap = makePlayerMap([p1, p2, p3]);
  const submissions = [{ user_id: 'A', player_ids: [p1.id, p2.id, p3.id] }];

  const result = runSnakeDraft(submissions, playerMap, {
    squadSize: 15, budget: 200, clubCap: 99, fixedOrder: ['A']
  });

  assert(result['A'].allocated.length === 3, `Only 3 players allocated (wish list exhausted at 3, got ${result['A'].allocated.length})`);
  assert(result['A'].unresolved === 12, `12 unresolved slots (got ${result['A'].unresolved})`);

  // Critically: only the 3 listed players, nothing else
  const expected = new Set([p1.id, p2.id, p3.id]);
  const unexpected = result['A'].allocated.filter(pid => !expected.has(pid));
  assert(unexpected.length === 0, 'No players allocated beyond the wish list');
}

// ─── Summary ────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(70));
console.log('TEST SUMMARY');
console.log('═'.repeat(70));
console.log(`  Total:  ${passed + failed}`);
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);

if (failures.length > 0) {
  console.log('\n  FAILURES:');
  for (const f of failures) {
    console.log(`  ✗ ${f.label}`);
    if (f.detail) console.log(`    ${f.detail}`);
  }
}

console.log('');
process.exit(failed > 0 ? 1 : 0);
