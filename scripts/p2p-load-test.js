#!/usr/bin/env node
/* global process */
//
// P2P-LOAD — TRACKER.md item: load test the P2P coin-betting ledger under
// concurrency. Verifies coin_wallets/coin_transactions atomicity (the
// FOR UPDATE row locking in debit_coins_to_escrow / release_escrow, and the
// create_p2p_challenge / accept_p2p_challenge RPCs built on top of them)
// stays correct when many challenges fire at once.
//
// 🛑 NEVER run this against production. It creates and deletes real
// auth.users rows and fires bulk concurrent writes. It refuses to run
// against the known pilot project ref as a hard safety check — point it at
// a local Supabase instance instead (docs/deployment/DOCKER_LOCAL_DEV.md).
//
// Usage:
//   SUPABASE_URL=http://localhost:54321 \
//   SUPABASE_ANON_KEY=... \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/p2p-load-test.js
//
// What it does:
//   Test A — single-wallet race: one user (500-coin welcome bonus) fires
//     10 concurrent 100-coin challenges. Exactly 5 must succeed, 5 must
//     fail with INSUFFICIENT_BALANCE and/or DAILY_LIMIT_REACHED (the
//     default daily_challenge_limit is 5 — same as 500/100 — so either
//     guard can legitimately reject the losing half of the race), and
//     the wallet must end at balance=0/escrow=500. Also probes
//     create_p2p_challenge's known 5-second challenge_id backfill window
//     for misattribution under load.
//   Test B — 25 pairs (50 users) fire concurrent create_p2p_challenge,
//     then concurrent accept_p2p_challenge (50 concurrent ops total,
//     touching 50 distinct wallets). Every wallet must reconcile to
//     balance+escrow == 500 afterwards (create/accept only move coins
//     between balance and escrow — they never create or destroy them).
//
// All test users + the throwaway test league are deleted at the end.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const PROD_PROJECT_REF = 'sssmvihxtqtohisghjet';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

if (SUPABASE_URL.includes(PROD_PROJECT_REF)) {
  console.error(`❌ REFUSING TO RUN: SUPABASE_URL points at the live pilot project (${PROD_PROJECT_REF}).`);
  console.error('   This script creates/deletes real auth users and fires bulk concurrent writes.');
  console.error('   Point it at a local Supabase instance instead.');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const RUN_ID = Date.now();
const WHALE_OPPONENTS = 10; // Test A: single-wallet race
const WHALE_STAKE = 100;    // 500-coin wallet / 100 stake => exactly 5 can succeed
const PAIR_COUNT = 25;      // Test B: 25 pairs => 50 concurrent challenge/accept ops
const PAIR_STAKE = 50;

const created = []; // { id, email, client }
let leagueId = null;
let failed = false;

function ok(msg) { console.log(`✅ ${msg}`); }
function warn(msg) { console.warn(`⚠️  ${msg}`); }
function fail(msg) { console.error(`❌ ${msg}`); failed = true; }

async function createTestUser(label) {
  const email = `p2pload-${RUN_ID}-${label}@test.local`;
  const password = `LoadTest!${RUN_ID}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser(${label}) failed: ${error.message}`);
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) throw new Error(`signIn(${label}) failed: ${signInErr.message}`);
  const user = { id: data.user.id, email, client };
  created.push(user);
  return user;
}

async function getWallet(userId) {
  const { data, error } = await admin.from('coin_wallets').select('balance, escrow').eq('user_id', userId).single();
  if (error) throw new Error(`getWallet(${userId}) failed: ${error.message}`);
  return data;
}

function rpcErrorMessage(settled) {
  if (settled.status === 'rejected') return String(settled.reason);
  return settled.value?.error?.message ?? null;
}

async function cleanup() {
  console.log(`\n🧹 Cleaning up ${created.length} test users${leagueId ? ' + test league' : ''}...`);
  if (leagueId) {
    const { error } = await admin.from('leagues').delete().eq('id', leagueId);
    if (error) warn(`Failed to delete test league ${leagueId}: ${error.message}`);
  }
  if (created.length > 0) {
    // public.users has no FK back to auth.users (only populated by the
    // on_auth_user_created trigger) — deleting the auth user does NOT
    // cascade here, so it must be done explicitly or rows are orphaned
    // forever. This also cascades any leftover league_members rows.
    const { error } = await admin.from('users').delete().in('id', created.map((u) => u.id));
    if (error) warn(`Failed to delete public.users rows: ${error.message}`);
  }
  for (const u of created) {
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error) warn(`Failed to delete test user ${u.email}: ${error.message}`);
  }
  ok('Cleanup complete');
}

async function main() {
  console.log(`\n🎬 P2P-LOAD test run ${RUN_ID} against ${SUPABASE_URL}\n`);

  const { data: tournaments, error: tErr } = await admin.from('tournaments').select('forza_id').limit(1);
  if (tErr || !tournaments?.length) {
    throw new Error('No tournaments found in this environment — seed at least one tournament row before running this test.');
  }
  const tournamentId = tournaments[0].forza_id;

  console.log('Creating commissioner + test league...');
  const commissioner = await createTestUser('commissioner');
  const { data: leagueJson, error: leagueErr } = await commissioner.client.rpc('create_league', {
    p_name: `P2P Load Test ${RUN_ID}`,
    p_format: 'classic',
    p_user_id: commissioner.id,
    p_tournament_id: tournamentId,
    p_h2h_enabled: false,
    p_circle_id: null,
  });
  if (leagueErr) throw new Error(`create_league failed: ${leagueErr.message}`);
  leagueId = leagueJson.id;
  ok(`Test league created: ${leagueId} (tournament ${tournamentId})`);

  console.log(`Creating ${WHALE_OPPONENTS + 1 + PAIR_COUNT * 2} more test users...`);
  const whale = await createTestUser('whale');
  const whaleOpponents = await Promise.all(
    Array.from({ length: WHALE_OPPONENTS }, (_, i) => createTestUser(`whale-opp-${i}`)),
  );
  const pairUsers = await Promise.all(
    Array.from({ length: PAIR_COUNT * 2 }, (_, i) => createTestUser(`pair-${i}`)),
  );
  const pairs = [];
  for (let i = 0; i < PAIR_COUNT; i++) pairs.push([pairUsers[i * 2], pairUsers[i * 2 + 1]]);
  ok(`${created.length} test users created and signed in`);

  const memberRows = created
    .filter((u) => u.id !== commissioner.id)
    .map((u) => ({ league_id: leagueId, user_id: u.id, role: 'member' }));
  const { error: memberErr } = await admin.from('league_members').insert(memberRows);
  if (memberErr) throw new Error(`league_members insert failed: ${memberErr.message}`);
  ok(`${memberRows.length} members added to test league`);

  // ── Test A: single-wallet race ──────────────────────────────────────
  console.log(`\n🏁 Test A — single-wallet race: whale fires ${WHALE_OPPONENTS} concurrent ${WHALE_STAKE}-coin challenges (wallet holds 500)`);
  const whaleResults = await Promise.allSettled(
    whaleOpponents.map((opp) =>
      whale.client.rpc('create_p2p_challenge', {
        p_league_id: leagueId,
        p_opponent_id: opp.id,
        p_matchday_id: `LOADTEST-${RUN_ID}`,
        p_stake_coins: WHALE_STAKE,
        p_message: null,
      }),
    ),
  );
  const whaleSucceeded = whaleResults.filter((r) => r.status === 'fulfilled' && !r.value.error);
  const whaleRejected = whaleResults.filter((r) => r.status === 'rejected' || r.value?.error);
  console.log(`   ${whaleSucceeded.length} succeeded, ${whaleRejected.length} rejected`);

  // create_p2p_challenge's daily_challenge_limit guard (default 5, from
  // p2p_config) runs before the balance check — with 500/100 the limit is
  // numerically identical to the balance ceiling, so a losing concurrent
  // request can legitimately be rejected by either guard depending on which
  // one it hits first. Both are expected, valid rejection reasons here.
  const EXPECTED_REJECTIONS = ['INSUFFICIENT_BALANCE', 'DAILY_LIMIT_REACHED'];
  const unexpectedWhaleErrors = whaleRejected.filter(
    (r) => !EXPECTED_REJECTIONS.some((reason) => (rpcErrorMessage(r) ?? '').includes(reason)),
  );
  if (whaleSucceeded.length !== 5) {
    fail(`Expected exactly 5 successful challenges (500/100), got ${whaleSucceeded.length}`);
  } else {
    ok('Exactly 5 of 10 concurrent challenges succeeded, as expected (500 balance / 100 stake)');
  }
  if (unexpectedWhaleErrors.length > 0) {
    fail(`${unexpectedWhaleErrors.length} rejection(s) were NOT an expected INSUFFICIENT_BALANCE/DAILY_LIMIT_REACHED error — possible ledger bug`);
    unexpectedWhaleErrors.forEach((r) => console.error('   ', rpcErrorMessage(r)));
  }

  const whaleWallet = await getWallet(whale.id);
  if (whaleWallet.balance !== 0 || whaleWallet.escrow !== 500) {
    fail(`Whale wallet after race: balance=${whaleWallet.balance} escrow=${whaleWallet.escrow} (expected balance=0 escrow=500)`);
  } else {
    ok('Whale wallet reconciled correctly: balance=0, escrow=500');
  }

  // create_p2p_challenge attaches challenge_id to the stake transaction via
  // a post-insert `UPDATE ... WHERE created_at > now() - interval '5 seconds'`
  // backfill (there's a chicken-and-egg: the debit happens before the
  // challenge row exists). Firing many challenges from the same user inside
  // that 5s window is exactly the scenario that could misattribute or drop
  // a challenge_id under contention — check it explicitly.
  console.log('\n🔍 Checking challenge_id attribution for whale\'s concurrent stakes (race-condition probe)...');
  const { data: whaleStakes, error: stakeErr } = await admin
    .from('coin_transactions')
    .select('challenge_id')
    .eq('user_id', whale.id)
    .eq('type', 'stake');
  if (stakeErr) throw new Error(`stake lookup failed: ${stakeErr.message}`);
  const nullChallengeId = whaleStakes.filter((t) => t.challenge_id === null).length;
  const ids = whaleStakes.map((t) => t.challenge_id).filter(Boolean);
  const uniqueIds = new Set(ids);
  if (whaleStakes.length !== whaleSucceeded.length) {
    fail(`Expected ${whaleSucceeded.length} stake transactions, found ${whaleStakes.length}`);
  } else if (nullChallengeId > 0) {
    fail(`${nullChallengeId} stake transaction(s) never got a challenge_id backfilled — the 5-second race window in create_p2p_challenge dropped a row under concurrent load`);
  } else if (uniqueIds.size !== ids.length) {
    fail('Duplicate challenge_id found across stake transactions — misattribution under concurrent load (5-second backfill window race)');
  } else {
    ok(`All ${ids.length} concurrent stake transactions correctly attributed to distinct challenge_ids`);
  }

  // ── Test B: 25 pairs, concurrent create then concurrent accept ──────
  console.log(`\n🏁 Test B — ${PAIR_COUNT} pairs, concurrent create_p2p_challenge (${PAIR_COUNT} ops)`);
  const createResults = await Promise.allSettled(
    pairs.map(([a, b]) =>
      a.client.rpc('create_p2p_challenge', {
        p_league_id: leagueId,
        p_opponent_id: b.id,
        p_matchday_id: `LOADTEST-${RUN_ID}`,
        p_stake_coins: PAIR_STAKE,
        p_message: null,
      }),
    ),
  );
  const createFailures = createResults.filter((r) => r.status === 'rejected' || r.value?.error);
  if (createFailures.length > 0) {
    fail(`${createFailures.length}/${PAIR_COUNT} concurrent challenge creations failed unexpectedly`);
    createFailures.forEach((r) => console.error('   ', rpcErrorMessage(r)));
  } else {
    ok(`All ${PAIR_COUNT} concurrent challenge creations succeeded`);
  }
  const challengeIds = createResults.map((r) => (r.status === 'fulfilled' && !r.value.error ? r.value.data.challenge_id : null));

  console.log(`🏁 Test B — concurrent accept_p2p_challenge (${PAIR_COUNT} ops)`);
  const acceptResults = await Promise.allSettled(
    pairs.map(([, b], i) =>
      challengeIds[i]
        ? b.client.rpc('accept_p2p_challenge', { p_challenge_id: challengeIds[i] })
        : Promise.resolve({ error: { message: 'no challenge_id (create failed)' } }),
    ),
  );
  const acceptFailures = acceptResults.filter((r) => r.status === 'rejected' || r.value?.error);
  if (acceptFailures.length > 0) {
    fail(`${acceptFailures.length}/${PAIR_COUNT} concurrent challenge accepts failed unexpectedly`);
    acceptFailures.forEach((r) => console.error('   ', rpcErrorMessage(r)));
  } else {
    ok(`All ${PAIR_COUNT} concurrent challenge accepts succeeded`);
  }

  // ── Reconciliation: every touched wallet must still sum to 500 ──────
  console.log(`\n🧮 Reconciling ${pairs.length * 2} pair wallets (balance+escrow must equal 500 welcome bonus)...`);
  let reconciled = 0;
  for (const [a, b] of pairs) {
    for (const user of [a, b]) {
      const w = await getWallet(user.id);
      const total = w.balance + w.escrow;
      if (total !== 500) {
        fail(`${user.email}: balance=${w.balance} escrow=${w.escrow} (total ${total} != 500)`);
      } else {
        reconciled++;
      }
    }
  }
  if (reconciled === pairs.length * 2) {
    ok(`All ${reconciled} wallets reconciled: balance+escrow == 500`);
  }

  console.log(failed ? '\n❌ P2P-LOAD: FAILED — see errors above\n' : '\n✅ P2P-LOAD: ALL CHECKS PASSED\n');
}

main()
  .catch((e) => {
    console.error('Fatal:', e);
    failed = true;
  })
  .finally(async () => {
    await cleanup().catch((e) => console.error('Cleanup error:', e));
    process.exit(failed ? 1 : 0);
  });
