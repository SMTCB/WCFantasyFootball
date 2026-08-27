/**
 * competition_admins RPCs — unit tests (Tier 1 / TESTING_STRATEGY.md)
 *
 * set_competition_admin / remove_competition_admin / is_competition_admin are
 * the shared authorization primitive gating admin-only RPCs across all three
 * sports (League/Paddock/Player Box — see docs/architecture/COMPETITION_MODEL.md).
 * Zero prior automated coverage.
 *
 * Real signatures (confirmed against supabase/schema.sql):
 *   set_competition_admin(p_circle_id, p_competition_type, p_competition_id, p_user_id) RETURNS json
 *   remove_competition_admin(p_circle_id, p_competition_type, p_competition_id, p_user_id) RETURNS json
 *   is_competition_admin(p_competition_type, p_competition_id) RETURNS boolean
 *
 * Both mutators require the acting user to be the *circle* owner (not just a
 * competition-level commissioner), and require the competition to already be
 * linked into that circle via circle_leagues/circle_paddocks/circle_player_boxes.
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getClient, closeClient, beginTx, rollbackTx, callRpc, queryOne } from './helpers.js';

const COMMISSIONER = 'aaaaaaaa-0000-4000-a000-000000000099'; // circle owner + league commissioner
const USER_A       = 'aaaaaaaa-0000-4000-a000-000000000001'; // circle member, league member
const USER_B       = 'aaaaaaaa-0000-4000-a000-000000000002'; // circle member, league member
const NON_MEMBER   = '99999999-0000-4000-9000-000000000001'; // not in circle_members at all

const CIRCLE         = 'ffffffff-0000-4000-f000-000000000001';
const CLASSIC_LEAGUE = 'bbbbbbbb-0000-4000-b000-000000000001'; // linked to CIRCLE via circle_leagues
const DRAFT_LEAGUE   = 'bbbbbbbb-0000-4000-b000-000000000002'; // NOT linked to CIRCLE

describe('competition_admins RPCs', () => {
  before(async () => { await getClient(); });
  after(async () => { await closeClient(); });

  beforeEach(async () => { await beginTx(); });
  afterEach(async () => { await rollbackTx(); });

  // ── is_competition_admin baseline ───────────────────────────────────────────
  it('treats the league commissioner as an admin without an explicit grant', async () => {
    const result = await callRpc('is_competition_admin',
      { p_competition_type: 'league', p_competition_id: CLASSIC_LEAGUE },
      { actingUserId: COMMISSIONER });
    assert.equal(result, true);
  });

  it('treats a plain league member as not an admin', async () => {
    const result = await callRpc('is_competition_admin',
      { p_competition_type: 'league', p_competition_id: CLASSIC_LEAGUE },
      { actingUserId: USER_A });
    assert.equal(result, false);
  });

  // ── set_competition_admin — success path ────────────────────────────────────
  it('circle owner can grant a competition-admin role to a fellow circle member', async () => {
    const result = await callRpc('set_competition_admin', {
      p_circle_id: CIRCLE, p_competition_type: 'league',
      p_competition_id: CLASSIC_LEAGUE, p_user_id: USER_A,
    }, { actingUserId: COMMISSIONER });

    assert.equal(result?.ok, true, `Expected success, got: ${JSON.stringify(result)}`);

    const row = await queryOne(
      `SELECT 1 FROM competition_admins WHERE competition_type='league' AND competition_id=$1 AND user_id=$2`,
      [CLASSIC_LEAGUE, USER_A]);
    assert.ok(row, 'competition_admins row should exist after grant');

    const isAdmin = await callRpc('is_competition_admin',
      { p_competition_type: 'league', p_competition_id: CLASSIC_LEAGUE },
      { actingUserId: USER_A });
    assert.equal(isAdmin, true, 'USER_A should now read as an admin via the explicit grant');
  });

  it('is idempotent — granting the same admin twice does not duplicate the row', async () => {
    await callRpc('set_competition_admin', {
      p_circle_id: CIRCLE, p_competition_type: 'league',
      p_competition_id: CLASSIC_LEAGUE, p_user_id: USER_A,
    }, { actingUserId: COMMISSIONER });
    await callRpc('set_competition_admin', {
      p_circle_id: CIRCLE, p_competition_type: 'league',
      p_competition_id: CLASSIC_LEAGUE, p_user_id: USER_A,
    }, { actingUserId: COMMISSIONER });

    const client = await getClient();
    const res = await client.query(
      `SELECT count(*)::int AS n FROM competition_admins WHERE competition_type='league' AND competition_id=$1 AND user_id=$2`,
      [CLASSIC_LEAGUE, USER_A]);
    assert.equal(res.rows[0].n, 1, 'Second grant should be a no-op (ON CONFLICT DO NOTHING)');
  });

  // ── set_competition_admin — rejection paths ─────────────────────────────────
  it('rejects an unauthenticated caller', async () => {
    const result = await callRpc('set_competition_admin', {
      p_circle_id: CIRCLE, p_competition_type: 'league',
      p_competition_id: CLASSIC_LEAGUE, p_user_id: USER_A,
    }, { actingUserId: null });
    assert.equal(result?.error, 'UNAUTHENTICATED');
  });

  it('rejects a circle member who is not the circle owner', async () => {
    const result = await callRpc('set_competition_admin', {
      p_circle_id: CIRCLE, p_competition_type: 'league',
      p_competition_id: CLASSIC_LEAGUE, p_user_id: USER_B,
    }, { actingUserId: USER_A }); // USER_A is a member, not owner
    assert.equal(result?.error, 'NOT_OWNER');
  });

  it('rejects an invalid competition_type', async () => {
    const result = await callRpc('set_competition_admin', {
      p_circle_id: CIRCLE, p_competition_type: 'tournament',
      p_competition_id: CLASSIC_LEAGUE, p_user_id: USER_A,
    }, { actingUserId: COMMISSIONER });
    assert.equal(result?.error, 'INVALID_TYPE');
  });

  it('rejects a competition that is not linked to the given circle', async () => {
    const result = await callRpc('set_competition_admin', {
      p_circle_id: CIRCLE, p_competition_type: 'league',
      p_competition_id: DRAFT_LEAGUE, p_user_id: USER_A, // DRAFT_LEAGUE has no circle_leagues row
    }, { actingUserId: COMMISSIONER });
    assert.equal(result?.error, 'NOT_LINKED_TO_CIRCLE');
  });

  it('rejects granting admin to a user who is not a member of the circle', async () => {
    const result = await callRpc('set_competition_admin', {
      p_circle_id: CIRCLE, p_competition_type: 'league',
      p_competition_id: CLASSIC_LEAGUE, p_user_id: NON_MEMBER,
    }, { actingUserId: COMMISSIONER });
    assert.equal(result?.error, 'TARGET_NOT_CIRCLE_MEMBER');
  });

  // ── remove_competition_admin ────────────────────────────────────────────────
  it('circle owner can revoke a previously granted competition-admin role', async () => {
    await callRpc('set_competition_admin', {
      p_circle_id: CIRCLE, p_competition_type: 'league',
      p_competition_id: CLASSIC_LEAGUE, p_user_id: USER_A,
    }, { actingUserId: COMMISSIONER });

    const result = await callRpc('remove_competition_admin', {
      p_circle_id: CIRCLE, p_competition_type: 'league',
      p_competition_id: CLASSIC_LEAGUE, p_user_id: USER_A,
    }, { actingUserId: COMMISSIONER });
    assert.equal(result?.ok, true, `Expected success, got: ${JSON.stringify(result)}`);

    const isAdmin = await callRpc('is_competition_admin',
      { p_competition_type: 'league', p_competition_id: CLASSIC_LEAGUE },
      { actingUserId: USER_A });
    assert.equal(isAdmin, false, 'USER_A should no longer read as an admin after revoke');
  });

  it('rejects revocation by a non-owner', async () => {
    await callRpc('set_competition_admin', {
      p_circle_id: CIRCLE, p_competition_type: 'league',
      p_competition_id: CLASSIC_LEAGUE, p_user_id: USER_A,
    }, { actingUserId: COMMISSIONER });

    const result = await callRpc('remove_competition_admin', {
      p_circle_id: CIRCLE, p_competition_type: 'league',
      p_competition_id: CLASSIC_LEAGUE, p_user_id: USER_A,
    }, { actingUserId: USER_B }); // USER_B is a member, not owner
    assert.equal(result?.error, 'NOT_OWNER');
  });
});
