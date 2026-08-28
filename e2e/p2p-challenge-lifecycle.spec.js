// e2e/p2p-challenge-lifecycle.spec.js — Tier 3 local full-stack E2E for the
// P2P challenge cycle (the actual "fake coins move between two users"
// mechanism the pilot depends on, run without Stripe). Targets the local
// `npx supabase start` stack via scripts/e2e-local.mjs (npm run test:e2e:local).
// B-12 guard: never runs against production.
//
// Complements tests/unit/p2p-challenges.test.js's deep resolve/payout math
// coverage (SAVEPOINT-based, runs as the DB owner) with proof the real
// authenticated-client RLS/RPC-grant wiring works end to end. This spec
// deliberately does NOT re-enumerate win/loss payout math — that's Task 1's
// job and it already regression-tests the migration-205/235 bugs.
//
// Balance-isolation note: e2e/wallet-screen.spec.js asserts a hardcoded
// literal USER_A balance (/500/). All Tier 3 specs share one local DB with
// no reset between spec files, and Playwright's parallel workers don't
// guarantee cross-file run order — so any spec here that left USER_A's
// coin_wallets.balance permanently changed could flake that assertion
// depending on run order. This spec sidesteps the problem entirely by
// exercising the freeform PUSH path (declare_freeform_result with
// p_winner_id = null): confirm_freeform_result's push branch returns both
// stakes to their owners via release_escrow with no rake taken (see
// supabase/schema.sql), so USER_A's balance is guaranteed to be back at
// its pre-challenge value once the cycle completes — regardless of what
// else has already run against this DB.

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-target.js';

test.describe.configure({ retries: 0 });

const USER_A = { email: 'e2e_a@fantasykit.test', password: 'E2ePass!99' };
const USER_B = { email: 'e2e_b@fantasykit.test', password: 'E2ePass!99' };
const CIRCLE = 'c1000000-0000-4000-a000-000000000001';
const STAKE  = 25;

async function signIn(email, password) {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data?.session) throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  return { client, session: data.session };
}

async function getWallet(client, userId) {
  const { data, error } = await client
    .from('coin_wallets')
    .select('balance, escrow')
    .eq('user_id', userId)
    .single();
  if (error) throw new Error(`wallet read failed for ${userId}: ${error.message}`);
  return data;
}

let clientA, sessionA, clientB, sessionB;

test.beforeAll(async () => {
  if (!sessionA) ({ client: clientA, session: sessionA } = await signIn(USER_A.email, USER_A.password));
  if (!sessionB) ({ client: clientB, session: sessionB } = await signIn(USER_B.email, USER_B.password));
});

test.describe('P2P challenge lifecycle', () => {
  test('4.1 create → accept → declare push → confirm — both stakes escrowed then fully refunded', async () => {
    const question = `E2E P2P push ${Date.now()}?`;

    const walletABefore = await getWallet(clientA, sessionA.user.id);
    const walletBBefore = await getWallet(clientB, sessionB.user.id);

    let challengeId;

    await test.step('USER_A creates a freeform challenge — stake escrowed', async () => {
      const { data, error } = await clientA.rpc('create_p2p_challenge', {
        p_circle_id:   CIRCLE,
        p_opponent_id: sessionB.user.id,
        p_bet_type:    'freeform',
        p_stake_coins: STAKE,
        p_question:    question,
      });

      expect(error, `create_p2p_challenge errored: ${error?.message}`).toBeNull();
      expect(data?.challenge_id).toBeTruthy();
      challengeId = data.challenge_id;

      const walletA = await getWallet(clientA, sessionA.user.id);
      expect(walletA.balance).toBe(walletABefore.balance - STAKE);
      expect(walletA.escrow).toBe(walletABefore.escrow + STAKE);
    });

    await test.step('USER_B accepts — their stake is also escrowed', async () => {
      const { data, error } = await clientB.rpc('accept_p2p_challenge', {
        p_challenge_id: challengeId,
      });

      expect(error, `accept_p2p_challenge errored: ${error?.message}`).toBeNull();
      expect(data?.status).toBe('accepted');

      const walletB = await getWallet(clientB, sessionB.user.id);
      expect(walletB.balance).toBe(walletBBefore.balance - STAKE);
      expect(walletB.escrow).toBe(walletBBefore.escrow + STAKE);
    });

    await test.step('USER_A declares a push (no winner)', async () => {
      const { data, error } = await clientA.rpc('declare_freeform_result', {
        p_challenge_id: challengeId,
        p_winner_id:    null,
      });

      expect(error, `declare_freeform_result errored: ${error?.message}`).toBeNull();
      expect(data?.ok).toBe(true);
    });

    await test.step('USER_B confirms the push — both stakes released, no rake, no net balance change', async () => {
      const { data, error } = await clientB.rpc('confirm_freeform_result', {
        p_challenge_id: challengeId,
      });

      expect(error, `confirm_freeform_result errored: ${error?.message}`).toBeNull();
      expect(data?.status).toBe('resolved');
      expect(data?.winner_id).toBeNull();

      const walletA = await getWallet(clientA, sessionA.user.id);
      const walletB = await getWallet(clientB, sessionB.user.id);
      expect(walletA).toEqual(walletABefore);
      expect(walletB).toEqual(walletBBefore);

      console.log(`✅ P2P: push cycle complete — both wallets back to pre-challenge state (A: ${walletA.balance}, B: ${walletB.balance})`);
    });
  });

  test('4.2 non-participant cannot confirm another pair\'s challenge (RLS-adjacent RPC guard)', async () => {
    const question = `E2E P2P guard ${Date.now()}?`;

    const { data: created, error: createErr } = await clientA.rpc('create_p2p_challenge', {
      p_circle_id:   CIRCLE,
      p_opponent_id: sessionB.user.id,
      p_bet_type:    'freeform',
      p_stake_coins: STAKE,
      p_question:    question,
    });
    expect(createErr, `create_p2p_challenge errored: ${createErr?.message}`).toBeNull();
    const challengeId = created.challenge_id;

    // USER_A (the challenger, not yet a confirmable participant on a pending
    // challenge) attempts to confirm before it's even accepted/declared.
    const { data, error } = await clientA.rpc('confirm_freeform_result', {
      p_challenge_id: challengeId,
    });

    expect(data, 'confirm on a non-accepted, non-declared challenge unexpectedly succeeded').toBeNull();
    expect(error, 'confirm_freeform_result should reject an invalid-status challenge').toBeTruthy();
    expect(error.message).toMatch(/INVALID_STATUS|NO_PROPOSAL/);

    // Clean up: decline so this pending challenge doesn't trip the daily
    // freeform-challenge limit (5/24h) for later runs in the same DB.
    await clientB.rpc('decline_p2p_challenge', { p_challenge_id: challengeId });
    console.log('✅ P2P: invalid-status confirm correctly rejected');
  });
});
