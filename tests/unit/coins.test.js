/**
 * Coin RPCs — unit tests (B2 / TEST-1 + LEGAL-1 / C3)
 *
 * Real schema (confirmed against supabase/schema.sql):
 *  - coin_wallets column is `escrow`, not `escrow_balance`.
 *  - coin_transactions has NO `balance_after` column
 *    (id, user_id, type, amount, challenge_id, meta, created_at, status, currency, reference_id).
 *  - release_escrow(p_user_id, p_amount, p_challenge_id, p_meta) moves coins from
 *    that SAME user's escrow back to their OWN balance (a self-refund, e.g. on a
 *    declined/cancelled challenge) — it does NOT transfer to a different recipient.
 *    Winner payouts are a separate flow (resolve_p2p_challenge), not covered here.
 *
 * Covers:
 *  ✓ credit_coins: balance increases correctly
 *  ✓ debit_coins_to_escrow: balance decreases, escrow increases
 *  ✓ release_escrow: escrow cleared, own balance restored
 *  ✓ LEGAL-1 assertion: no cash-out type exists in coin_transactions CHECK constraint
 *  ✓ LEGAL-1 assertion: no withdraw/payout/cash_out RPC exists
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getClient, closeClient, beginTx, rollbackTx, callRpc, query, queryOne } from './helpers.js';

const USER_A = 'aaaaaaaa-0000-4000-a000-000000000001';
const USER_B = 'aaaaaaaa-0000-4000-a000-000000000002';

describe('coin RPCs', () => {
  before(async () => { await getClient(); });
  after(async () => { await closeClient(); });

  beforeEach(async () => { await beginTx(); });
  afterEach(async () => { await rollbackTx(); });

  // ── 1. credit_coins ─────────────────────────────────────────────────────────
  it('credit_coins increases the user balance', async () => {
    const before = await queryOne('SELECT balance FROM coin_wallets WHERE user_id=$1', [USER_A]);

    await callRpc('credit_coins', {
      p_user_id: USER_A,
      p_amount:  100,
      p_type:    'admin',
    });

    const after = await queryOne('SELECT balance FROM coin_wallets WHERE user_id=$1', [USER_A]);
    assert.equal(after.balance, before.balance + 100, 'balance should increase by 100');
  });

  // ── 2. debit_coins_to_escrow ─────────────────────────────────────────────────
  it('debit_coins_to_escrow moves coins from balance to escrow', async () => {
    const before = await queryOne(
      'SELECT balance, escrow FROM coin_wallets WHERE user_id=$1', [USER_A]
    );

    await callRpc('debit_coins_to_escrow', {
      p_user_id: USER_A,
      p_amount:  50,
    });

    const after = await queryOne(
      'SELECT balance, escrow FROM coin_wallets WHERE user_id=$1', [USER_A]
    );
    assert.equal(after.balance, before.balance - 50, 'balance should decrease by 50');
    assert.equal(after.escrow,  before.escrow + 50,  'escrow should increase by 50');
  });

  it('debit_coins_to_escrow rejects when balance is insufficient', async () => {
    // Real function RAISE EXCEPTIONs 'INSUFFICIENT_BALANCE' — a hard throw,
    // not a returned error object. A hard throw aborts the enclosing Postgres
    // transaction (this test's beginTx() BEGIN), so a SAVEPOINT is needed to
    // keep the transaction usable for the assertion query below.
    await query('SAVEPOINT before_throw');

    let threw = false;
    let message = '';
    try {
      await callRpc('debit_coins_to_escrow', {
        p_user_id: USER_B,  // USER_B has 200 coins
        p_amount:  9999,
      });
    } catch (err) {
      threw = true;
      message = err.message || '';
      await query('ROLLBACK TO SAVEPOINT before_throw');
    }

    assert.ok(threw, 'Expected debit_coins_to_escrow to throw on insufficient balance');
    assert.ok(message.includes('INSUFFICIENT_BALANCE'),
      `Expected INSUFFICIENT_BALANCE error, got: ${message}`);

    const wallet = await queryOne('SELECT balance FROM coin_wallets WHERE user_id=$1', [USER_B]);
    assert.equal(wallet.balance, 200, 'Balance must be unchanged on insufficient funds');
  });

  // ── 3. release_escrow ───────────────────────────────────────────────────────
  // Real signature: release_escrow(p_user_id, p_amount, p_challenge_id, p_meta).
  // It refunds coins from a user's OWN escrow back to their OWN balance (e.g. on
  // a declined/cancelled challenge) — there is no separate recipient parameter.
  it('release_escrow moves coins from escrow back to the same user\'s balance', async () => {
    await callRpc('debit_coins_to_escrow', { p_user_id: USER_A, p_amount: 100 });

    const before = await queryOne('SELECT balance, escrow FROM coin_wallets WHERE user_id=$1', [USER_A]);
    assert.equal(before.escrow, 100, 'escrow should hold the 100 debited above');

    await callRpc('release_escrow', {
      p_user_id: USER_A,
      p_amount:  100,
    });

    const after = await queryOne('SELECT balance, escrow FROM coin_wallets WHERE user_id=$1', [USER_A]);

    assert.equal(after.escrow, 0, 'escrow should be cleared');
    assert.equal(after.balance, before.balance + 100, 'balance should be restored by the released amount');
  });
});

// ── LEGAL-1: No-cash-out schema assertions ────────────────────────────────────
// These tests run against the DB schema itself, not the RPCs.
// A buyer can run these to prove the no-cash-out rule is a schema guarantee.

describe('LEGAL-1 — no-cash-out schema guarantee', () => {
  before(async () => { await getClient(); });
  after(async () => { await closeClient(); });

  it('coin_transactions CHECK constraint exists and is named no_external_cash_out', async () => {
    const row = await queryOne(`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'coin_transactions'
        AND constraint_type = 'CHECK'
        AND constraint_name = 'no_external_cash_out'
    `);
    assert.ok(row, 'no_external_cash_out constraint must exist on coin_transactions');
  });

  it('coin_transactions CHECK constraint rejects a cash_out type insert', async () => {
    let rejected = false;
    try {
      await query(`
        INSERT INTO coin_transactions (user_id, amount, type)
        VALUES ($1, 100, 'cash_out')
      `, [USER_A]);
    } catch (err) {
      // Postgres will throw a check_violation (23514)
      rejected = err.code === '23514' || err.message?.includes('no_external_cash_out');
    }
    assert.ok(rejected, 'INSERT with type=cash_out must be rejected by the DB constraint');
  });

  it('coin_transactions CHECK constraint rejects a withdrawal type insert', async () => {
    let rejected = false;
    try {
      await query(`
        INSERT INTO coin_transactions (user_id, amount, type)
        VALUES ($1, 100, 'withdrawal')
      `, [USER_A]);
    } catch (err) {
      rejected = err.code === '23514' || err.message?.includes('no_external_cash_out');
    }
    assert.ok(rejected, 'INSERT with type=withdrawal must be rejected by the DB constraint');
  });

  it('no cash_out, withdraw, or payout RPC exists in the public schema', async () => {
    const rows = await query(`
      SELECT proname FROM pg_proc
      WHERE pronamespace = 'public'::regnamespace
        AND (
          proname ILIKE '%cash_out%' OR
          proname ILIKE '%withdraw%' OR
          proname ILIKE '%payout%'
        )
    `);
    assert.equal(rows.length, 0,
      `Found unexpected cash-out RPCs: ${rows.map(r => r.proname).join(', ')}`
    );
  });

  it('all existing coin_transactions have a valid internal type', async () => {
    const rows = await query(`
      SELECT COUNT(*) AS bad_count
      FROM coin_transactions
      WHERE type NOT IN (
        'purchase','admin','stake','wager_placement','win','wager_win',
        'loss','rake','refund','wager_refund','entry_fee'
      )
    `);
    assert.equal(Number(rows[0].bad_count), 0,
      'All coin_transactions must have an approved internal type');
  });
});
