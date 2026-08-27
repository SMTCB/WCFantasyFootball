/**
 * Cup elimination — unit tests
 *
 * Covers the two SQL functions that hold the real cup-knockout decision
 * logic (the Edge Function around them is a thin dispatcher with no logic
 * of its own, so it isn't exercised here):
 *
 *  - eliminate_cup_club (supabase/migrations/06_cup_pool_management.sql)
 *  - sync_cup_eliminations (supabase/migrations/221_sync_cup_eliminations_v2.sql)
 *    — v2: replaced a 6h timer with a "rest of the matchday is finished" guard,
 *      and added penalty-shootout resolution for draws.
 *
 * Uses the pg-client pattern (real Postgres, real SQL functions) like
 * bet.test.js / coins.test.js — this is pure-SQL business logic, not
 * extractable JS, so it isn't a candidate for the node:test-only pattern.
 *
 * Reuses seed.sql's CLASSIC_LEAGUE (tournament_id TEST_429) purely as an FK
 * target for cup_active_clubs/leagues — the league isn't otherwise in cup
 * mode in the seed, so each test seeds its own cup_active_clubs/fixtures rows.
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getClient, closeClient, beginTx, rollbackTx, callRpc, query, queryOne } from './helpers.js';

const LEAGUE = 'bbbbbbbb-0000-4000-b000-000000000001'; // TEST_Classic_League, tournament_id TEST_429
const TOURNAMENT = 'TEST_429';

async function addActiveClub(clubId, eliminatedAt = null) {
  await query(
    `INSERT INTO cup_active_clubs (league_id, club_id, eliminated_at) VALUES ($1, $2, $3)`,
    [LEAGUE, clubId, eliminatedAt],
  );
}

async function getClub(clubId) {
  return queryOne(
    `SELECT eliminated_at FROM cup_active_clubs WHERE league_id=$1 AND club_id=$2`,
    [LEAGUE, clubId],
  );
}

async function insertFixture({
  id, matchdayId, homeTeam, awayTeam, homeForzaId = null, awayForzaId = null,
  kickoffAt, status, homeScore = null, awayScore = null, roundNumber = 1,
}) {
  await query(
    `INSERT INTO fixtures (
       id, tournament_id, matchday_id, round_number,
       home_team, away_team, home_team_forza_id, away_team_forza_id,
       kickoff_at, competition, status, home_score, away_score
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [id, TOURNAMENT, matchdayId, roundNumber, homeTeam, awayTeam, homeForzaId, awayForzaId,
     kickoffAt, 'Test World Cup 2026', status, homeScore, awayScore],
  );
}

async function insertShootoutStat(fixtureId, playerId, shootoutScored) {
  await query(
    `INSERT INTO player_match_stats (fixture_id, player_id, shootout_scored) VALUES ($1, $2, $3)`,
    [fixtureId, playerId, shootoutScored],
  );
}

describe('eliminate_cup_club', () => {
  before(async () => { await getClient(); });
  after(async () => { await closeClient(); });
  beforeEach(async () => { await beginTx(); });
  afterEach(async () => { await rollbackTx(); });

  it('stamps eliminated_at on an active club', async () => {
    await addActiveClub('CupTestA');

    await callRpc('eliminate_cup_club', { p_league_id: LEAGUE, p_club_id: 'CupTestA' });

    const club = await getClub('CupTestA');
    assert.ok(club.eliminated_at, 'eliminated_at should be set');
  });

  it('raises club_not_found for a club with no active row', async () => {
    await query('SAVEPOINT before_throw');
    let threw = false;
    let message = '';
    try {
      await callRpc('eliminate_cup_club', { p_league_id: LEAGUE, p_club_id: 'NoSuchClub' });
    } catch (err) {
      threw = true;
      message = err.message || '';
      await query('ROLLBACK TO SAVEPOINT before_throw');
    }
    assert.ok(threw, 'Expected eliminate_cup_club to throw for an unknown club');
    assert.ok(message.includes('club_not_found'), `Expected club_not_found, got: ${message}`);
  });

  it('raises club_not_found when the club is already eliminated', async () => {
    await addActiveClub('CupTestB', new Date().toISOString());

    await query('SAVEPOINT before_throw');
    let threw = false;
    let message = '';
    try {
      await callRpc('eliminate_cup_club', { p_league_id: LEAGUE, p_club_id: 'CupTestB' });
    } catch (err) {
      threw = true;
      message = err.message || '';
      await query('ROLLBACK TO SAVEPOINT before_throw');
    }
    assert.ok(threw, 'Expected a second elimination attempt to throw');
    assert.ok(message.includes('club_not_found'), `Expected club_not_found, got: ${message}`);
  });
});

describe('sync_cup_eliminations', () => {
  before(async () => { await getClient(); });
  after(async () => { await closeClient(); });
  beforeEach(async () => { await beginTx(); });
  afterEach(async () => { await rollbackTx(); });

  it('is a no-op when no active club in the league has a future fixture', async () => {
    // Brazil lost, matchday fully settled — but no active club anywhere in the
    // league has a future fixture, so the global guard short-circuits before
    // the per-club loop even runs.
    await addActiveClub('Brazil');
    await insertFixture({
      id: 'cup-fx-noop-1', matchdayId: 'CUP_MD_NOOP', homeTeam: 'Brazil', awayTeam: 'Argentina',
      kickoffAt: new Date(Date.now() - 86400000).toISOString(), status: 'finished',
      homeScore: 0, awayScore: 2,
    });

    const count = await callRpc('sync_cup_eliminations', { p_league_id: LEAGUE });

    assert.equal(count, 0);
    const brazil = await getClub('Brazil');
    assert.equal(brazil.eliminated_at, null, 'Brazil should remain active — guard blocks the whole run');
  });

  it('does not eliminate a club that still has a future fixture', async () => {
    // England has the seeded future fixture (test-fixture-0001, TEST_429-r1,
    // kickoff +2 days, still scheduled) — reused here as both the guard-satisfying
    // "some active club has a future fixture" signal and the subject under test.
    await addActiveClub('England');

    const count = await callRpc('sync_cup_eliminations', { p_league_id: LEAGUE });

    assert.equal(count, 0);
    const england = await getClub('England');
    assert.equal(england.eliminated_at, null);
  });

  it('does not eliminate a clear loser while sibling fixtures in the same matchday are still pending', async () => {
    await addActiveClub('England'); // satisfies the future-fixture guard
    await addActiveClub('Brazil');
    await insertFixture({
      id: 'cup-fx-pending-1', matchdayId: 'CUP_MD_PENDING', homeTeam: 'Brazil', awayTeam: 'Argentina',
      kickoffAt: new Date(Date.now() - 86400000).toISOString(), status: 'finished',
      homeScore: 0, awayScore: 2,
    });
    await insertFixture({
      id: 'cup-fx-pending-2', matchdayId: 'CUP_MD_PENDING', homeTeam: 'Germany', awayTeam: 'France',
      kickoffAt: new Date(Date.now() + 86400000).toISOString(), status: 'scheduled',
    });

    await callRpc('sync_cup_eliminations', { p_league_id: LEAGUE });

    const brazil = await getClub('Brazil');
    assert.equal(brazil.eliminated_at, null, 'Brazil should stay active until the whole matchday settles');
  });

  it('eliminates a club on a clear loss once its matchday is fully finished', async () => {
    await addActiveClub('England'); // satisfies the future-fixture guard
    await addActiveClub('Brazil');
    await insertFixture({
      id: 'cup-fx-loss-1', matchdayId: 'CUP_MD_LOSS', homeTeam: 'Brazil', awayTeam: 'Argentina',
      kickoffAt: new Date(Date.now() - 86400000).toISOString(), status: 'finished',
      homeScore: 0, awayScore: 2,
    });

    const count = await callRpc('sync_cup_eliminations', { p_league_id: LEAGUE });

    assert.equal(count, 1);
    const brazil = await getClub('Brazil');
    assert.ok(brazil.eliminated_at, 'Brazil should be eliminated after a clear loss');
    const england = await getClub('England');
    assert.equal(england.eliminated_at, null, 'England still has a future fixture — untouched');
  });

  it('eliminates a club that drew but lost the penalty shootout', async () => {
    await addActiveClub('England'); // satisfies the future-fixture guard
    await addActiveClub('Brazil');
    await insertFixture({
      id: 'cup-fx-shootout-1', matchdayId: 'CUP_MD_SHOOTOUT', homeTeam: 'Brazil', awayTeam: 'Argentina',
      kickoffAt: new Date(Date.now() - 86400000).toISOString(), status: 'finished',
      homeScore: 1, awayScore: 1,
    });
    // Reuse seeded players whose club/nationality match the fixture's sides.
    await insertShootoutStat('cup-fx-shootout-1', 'test-mid-bra-01', 3);
    await insertShootoutStat('cup-fx-shootout-1', 'test-def-arg-01', 4);

    const count = await callRpc('sync_cup_eliminations', { p_league_id: LEAGUE });

    assert.equal(count, 1);
    const brazil = await getClub('Brazil');
    assert.ok(brazil.eliminated_at, 'Brazil scored fewer shootout penalties and should be eliminated');
  });

  it('leaves a draw active when no shootout data is recorded', async () => {
    await addActiveClub('England'); // satisfies the future-fixture guard
    await addActiveClub('Brazil');
    await insertFixture({
      id: 'cup-fx-draw-1', matchdayId: 'CUP_MD_DRAW', homeTeam: 'Brazil', awayTeam: 'Argentina',
      kickoffAt: new Date(Date.now() - 86400000).toISOString(), status: 'finished',
      homeScore: 1, awayScore: 1,
    });
    // No player_match_stats rows at all — genuine draw / incomplete data.

    const count = await callRpc('sync_cup_eliminations', { p_league_id: LEAGUE });

    assert.equal(count, 0);
    const brazil = await getClub('Brazil');
    assert.equal(brazil.eliminated_at, null, 'No shootout data means the draw is left unresolved, not eliminated');
  });

  it('self-heals a previously-eliminated club that now has a genuine future fixture', async () => {
    // England already has the seeded future fixture — mark it eliminated as if
    // sync had run before Forza published the next round, then confirm the
    // self-heal UPDATE (which runs unconditionally, before either guard) reinstates it.
    await addActiveClub('England', new Date(Date.now() - 3600000).toISOString());

    await callRpc('sync_cup_eliminations', { p_league_id: LEAGUE });

    const england = await getClub('England');
    assert.equal(england.eliminated_at, null, 'England should be reinstated once a future fixture exists');
  });
});
