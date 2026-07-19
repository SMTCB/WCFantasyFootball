/**
 * place_bid / confirm_auction_win — unit tests (B2 / TEST-1)
 *
 * Real signatures (confirmed against supabase/schema.sql):
 *   place_bid(p_listing_id uuid, p_bid_amount numeric) RETURNS jsonb
 *   confirm_auction_win(p_listing_id uuid) RETURNS jsonb
 *
 * place_bid validation order (all rejections return only {ok:false, error} —
 * NO 'code' key anywhere in this function, unlike confirm_auction_win below):
 *   1. listing must exist                                  → 'Listing not found'
 *   2. listing.status must be 'open'                        → 'Auction is not open'
 *   3. listing.deadline_at must not have passed              → 'Auction deadline passed'
 *   4. p_bid_amount >= GREATEST(starting_bid, current_bid + min_increment)
 *                                                             → 'Bid too low. Minimum: X'
 *   5. caller must have a squad in the listing's league       → 'Squad not found'
 *   6. caller's squad must not be the seller                  → 'You cannot bid on your own listing'
 * On success: current_bid/highest_bidder_id updated (highest_bidder_id stores
 * auth.uid() — a USER id, not a squad id), auction_bids upserted
 * (ON CONFLICT (listing_id, bidder_id)), returns {ok:true} only.
 * auction_listings.min_increment DEFAULTs to 0.5 (confirmed in schema.sql
 * table DDL) — seed AUCTION_1 has starting_bid=2.0, current_bid=2.0, so its
 * live minimum bid is GREATEST(2.0, 2.0+0.5) = 2.5.
 *
 * confirm_auction_win validation order (rejections carry a 'code' key):
 *   1. listing must exist AND status = 'pending_confirmation' → (no code) 'Auction not found or not awaiting confirmation.'
 *   2. auth.uid() must equal listing.highest_bidder_id         → UNAUTHORIZED
 *   3. get_transfer_window_status(league_id).status = 'open'   → WINDOW_CLOSED
 *   4. seller squad must still exist                           → SELLER_GONE (listing cancelled)
 *   5. caller must have a squad in the league                  → BUYER_GONE (listing cancelled)
 *   6. buyer squad must have room (< league squad_size, default 15) → SQUAD_FULL (listing left pending_confirmation — actionable)
 *   7. buyer.budget_remaining >= current_bid                   → INSUFFICIENT_BUDGET (listing left pending_confirmation — actionable)
 *   8. buyer must not already own player_id                    → DUPLICATE (listing cancelled)
 * On success: player moved seller→buyer, budgets adjusted, listing status='sold',
 * a gazette_entries(entry_type='auction_result') row is written, returns
 * {ok:true, result:'sold', amount, player_id}.
 *
 * ── SEED QUIRK (not a prod bug) ───────────────────────────────────────────────
 * Seed AUCTION_1 lists 'test-mid-fra-01' from SQUAD_B_CLASSIC, but
 * SQUAD_A_CLASSIC (the only other classic-league member, and thus the only
 * realistic bidder) already independently owns 'test-mid-fra-01' in its own
 * players array — fine for a classic (non-no-duplicate) league, where player
 * ownership isn't globally exclusive, but it means confirming AUCTION_1 as-is
 * would always hit the DUPLICATE guard. place_bid tests use AUCTION_1 directly
 * (place_bid never checks buyer ownership). confirm_auction_win tests instead
 * insert their own fresh, internally-consistent listings (seller genuinely
 * owns the listed player, buyer doesn't) so each test isolates the single
 * guard it's meant to exercise.
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getClient, closeClient, beginTx, rollbackTx, callRpc, query, queryOne } from './helpers.js';

// ── Seed IDs (must match seed.sql) ───────────────────────────────────────────
const USER_A     = 'aaaaaaaa-0000-4000-a000-000000000001';
const USER_B     = 'aaaaaaaa-0000-4000-a000-000000000002';
const LEAGUE_CLS = 'bbbbbbbb-0000-4000-b000-000000000001';
const SQUAD_A    = 'cccccccc-0000-4000-c000-000000000001'; // user A, budget 47.0
const SQUAD_B    = 'cccccccc-0000-4000-c000-000000000002'; // user B, budget 45.5
const TOURNAMENT = 'TEST_429';
const MATCHDAY   = 'TEST_429-r1';
const AUCTION_1  = 'eeeeeeee-0000-4000-e000-000000000001'; // seller SQUAD_B, player test-mid-fra-01, bid 2.0

async function insertListing(id, { sellerId, playerId, currentBid, highestBidderId, status = 'pending_confirmation' }) {
  await query(`
    INSERT INTO auction_listings (
      id, league_id, seller_id, player_id,
      starting_bid, current_bid, highest_bidder_id,
      status, deadline_at
    ) VALUES ($1, $2, $3, $4, $5, $5, $6, $7, NOW() + INTERVAL '1 day')
  `, [id, LEAGUE_CLS, sellerId, playerId, currentBid, highestBidderId, status]);
}

describe('place_bid', () => {
  before(async () => { await getClient(); });
  after(async () => { await closeClient(); });

  beforeEach(async () => { await beginTx(); });
  afterEach(async () => { await rollbackTx(); });

  // ── 1. Happy path ────────────────────────────────────────────────────────────
  it('accepts a valid bid above the minimum and records it', async () => {
    const result = await callRpc('place_bid', {
      p_listing_id: AUCTION_1,
      p_bid_amount: 10.0,
    }, { actingUserId: USER_A });

    assert.equal(result?.ok, true, `Expected success, got: ${JSON.stringify(result)}`);

    const listing = await queryOne(
      'SELECT current_bid, highest_bidder_id FROM auction_listings WHERE id = $1', [AUCTION_1]
    );
    assert.equal(Number(listing.current_bid), 10.0, 'current_bid should update to the new bid');
    assert.equal(listing.highest_bidder_id, USER_A, 'highest_bidder_id should store the bidding USER id');

    const bid = await queryOne(
      'SELECT amount FROM auction_bids WHERE listing_id = $1 AND bidder_id = $2', [AUCTION_1, USER_A]
    );
    assert.equal(Number(bid.amount), 10.0, 'auction_bids row should be upserted with the bid amount');
  });

  // ── 2. Self-bid guard ────────────────────────────────────────────────────────
  it('rejects the seller bidding on their own listing', async () => {
    const result = await callRpc('place_bid', {
      p_listing_id: AUCTION_1,
      p_bid_amount: 10.0,
    }, { actingUserId: USER_B }); // USER_B owns SQUAD_B, the seller

    assert.equal(result?.ok, false, 'Self-bid should be rejected');
    assert.equal(result?.error, 'You cannot bid on your own listing',
      `Expected self-bid rejection, got: ${JSON.stringify(result)}`);
  });

  // ── 3. Below minimum ─────────────────────────────────────────────────────────
  it('rejects a bid below starting_bid/current_bid + min_increment', async () => {
    // min_increment defaults to 0.5 → live minimum is GREATEST(2.0, 2.0+0.5) = 2.5
    const result = await callRpc('place_bid', {
      p_listing_id: AUCTION_1,
      p_bid_amount: 2.0,
    }, { actingUserId: USER_A });

    assert.equal(result?.ok, false, 'Under-minimum bid should be rejected');
    assert.ok(result?.error?.startsWith('Bid too low'),
      `Expected "Bid too low" rejection, got: ${JSON.stringify(result)}`);
  });

  // ── 4. Deadline passed ───────────────────────────────────────────────────────
  it('rejects a bid once the auction deadline has passed', async () => {
    await query(`UPDATE auction_listings SET deadline_at = NOW() - INTERVAL '1 hour' WHERE id = $1`, [AUCTION_1]);

    const result = await callRpc('place_bid', {
      p_listing_id: AUCTION_1,
      p_bid_amount: 10.0,
    }, { actingUserId: USER_A });

    assert.equal(result?.error, 'Auction deadline passed',
      `Expected deadline rejection, got: ${JSON.stringify(result)}`);
  });

  // ── 5. Listing not open ──────────────────────────────────────────────────────
  it('rejects a bid on a listing that is not open', async () => {
    await query(`UPDATE auction_listings SET status = 'pending_confirmation' WHERE id = $1`, [AUCTION_1]);

    const result = await callRpc('place_bid', {
      p_listing_id: AUCTION_1,
      p_bid_amount: 10.0,
    }, { actingUserId: USER_A });

    assert.equal(result?.error, 'Auction is not open',
      `Expected not-open rejection, got: ${JSON.stringify(result)}`);
  });
});

describe('confirm_auction_win', () => {
  before(async () => { await getClient(); });
  after(async () => { await closeClient(); });

  beforeEach(async () => { await beginTx(); });
  afterEach(async () => { await rollbackTx(); });

  // ── 1. Happy path ────────────────────────────────────────────────────────────
  it('confirms a win, transfers the player, and adjusts both budgets', async () => {
    const LISTING = 'eeeeeeee-0000-4000-e000-000000000010';
    // Genuinely owned by seller (SQUAD_B), NOT owned by buyer (SQUAD_A) —
    // see SEED QUIRK note at the top of this file.
    await insertListing(LISTING, {
      sellerId: SQUAD_B, playerId: 'test-def-fra-01',
      currentBid: 10.0, highestBidderId: USER_A,
    });

    const result = await callRpc('confirm_auction_win', { p_listing_id: LISTING }, { actingUserId: USER_A });

    assert.equal(result?.ok, true, `Expected success, got: ${JSON.stringify(result)}`);
    assert.equal(result?.result, 'sold');
    assert.equal(Number(result?.amount), 10.0);
    assert.equal(result?.player_id, 'test-def-fra-01');

    const seller = await queryOne('SELECT players, budget_remaining FROM squads WHERE id = $1', [SQUAD_B]);
    assert.ok(!seller.players.includes('test-def-fra-01'), 'Seller should no longer own the player');
    assert.equal(Number(seller.budget_remaining), 55.5, 'Seller budget should increase by the sale amount (45.5+10)');

    const buyer = await queryOne('SELECT players, budget_remaining FROM squads WHERE id = $1', [SQUAD_A]);
    assert.ok(buyer.players.includes('test-def-fra-01'), 'Buyer should now own the player');
    assert.equal(Number(buyer.budget_remaining), 37.0, 'Buyer budget should decrease by the sale amount (47.0-10)');

    const listing = await queryOne('SELECT status FROM auction_listings WHERE id = $1', [LISTING]);
    assert.equal(listing.status, 'sold');

    const gazette = await queryOne(
      `SELECT entry_type FROM gazette_entries WHERE league_id = $1 AND entry_type = 'auction_result'
       ORDER BY published_at DESC LIMIT 1`, [LEAGUE_CLS]
    );
    assert.ok(gazette, 'A gazette_entries auction_result row should be written');
  });

  // ── 2. Unauthorized (not the winning bidder) ────────────────────────────────
  it('rejects confirmation by anyone other than the winning bidder', async () => {
    const LISTING = 'eeeeeeee-0000-4000-e000-000000000011';
    await insertListing(LISTING, {
      sellerId: SQUAD_B, playerId: 'test-def-fra-01',
      currentBid: 10.0, highestBidderId: USER_A,
    });

    const result = await callRpc('confirm_auction_win', { p_listing_id: LISTING }, { actingUserId: USER_B });

    assert.equal(result?.ok, false);
    assert.equal(result?.code, 'UNAUTHORIZED', `Expected UNAUTHORIZED, got: ${JSON.stringify(result)}`);
  });

  // ── 3. Window closed ─────────────────────────────────────────────────────────
  it('rejects confirmation while the transfer window is closed', async () => {
    await query(`
      UPDATE matchday_deadlines SET deadline_at = NOW() - INTERVAL '1 day'
      WHERE tournament_id = $1 AND matchday_id = $2
    `, [TOURNAMENT, MATCHDAY]);

    const LISTING = 'eeeeeeee-0000-4000-e000-000000000012';
    await insertListing(LISTING, {
      sellerId: SQUAD_B, playerId: 'test-def-fra-01',
      currentBid: 10.0, highestBidderId: USER_A,
    });

    const result = await callRpc('confirm_auction_win', { p_listing_id: LISTING }, { actingUserId: USER_A });

    assert.equal(result?.code, 'WINDOW_CLOSED', `Expected WINDOW_CLOSED, got: ${JSON.stringify(result)}`);
  });

  // ── 4. Insufficient budget — actionable, listing stays pending_confirmation ──
  it('rejects confirmation over budget and leaves the listing actionable', async () => {
    const LISTING = 'eeeeeeee-0000-4000-e000-000000000013';
    await insertListing(LISTING, {
      sellerId: SQUAD_B, playerId: 'test-def-fra-01',
      currentBid: 999.0, highestBidderId: USER_A, // buyer (SQUAD_A) only has 47.0
    });

    const result = await callRpc('confirm_auction_win', { p_listing_id: LISTING }, { actingUserId: USER_A });

    assert.equal(result?.code, 'INSUFFICIENT_BUDGET',
      `Expected INSUFFICIENT_BUDGET, got: ${JSON.stringify(result)}`);

    const listing = await queryOne('SELECT status FROM auction_listings WHERE id = $1', [LISTING]);
    assert.equal(listing.status, 'pending_confirmation',
      'INSUFFICIENT_BUDGET should leave the listing pending — buyer can free budget and retry');
  });

  // ── 5. Duplicate ownership guard — cancels the listing ──────────────────────
  it('rejects confirmation when the buyer already owns the player and cancels the listing', async () => {
    const LISTING = 'eeeeeeee-0000-4000-e000-000000000014';
    await insertListing(LISTING, {
      // test-mid-fra-01 is already in SQUAD_A's players array (see SEED QUIRK note)
      sellerId: SQUAD_B, playerId: 'test-mid-fra-01',
      currentBid: 10.0, highestBidderId: USER_A,
    });

    const result = await callRpc('confirm_auction_win', { p_listing_id: LISTING }, { actingUserId: USER_A });

    assert.equal(result?.code, 'DUPLICATE', `Expected DUPLICATE, got: ${JSON.stringify(result)}`);

    const listing = await queryOne('SELECT status FROM auction_listings WHERE id = $1', [LISTING]);
    assert.equal(listing.status, 'cancelled', 'DUPLICATE should cancel the listing (not leave it actionable)');
  });
});
