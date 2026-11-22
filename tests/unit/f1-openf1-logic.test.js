/**
 * sync-f1-race-results pure OpenF1 helpers — unit tests (F1-SYNC-1)
 *
 * No Postgres needed: plain node:test against pure functions, like
 * f1-scoring-logic.test.js.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PICK_NAMES, pickRaceSession, toPickName, finalTop3,
} from '../../supabase/functions/sync-f1-race-results/openf1-logic.js';
import { DRIVERS } from '../../src/lib/f1/f1-data.js';

describe('PICK_NAMES', () => {
  it('is the same list players pick from (src/lib/f1/f1-data.js)', () => {
    assert.deepEqual(PICK_NAMES, DRIVERS);
  });
});

describe('pickRaceSession', () => {
  const sessions = [
    { session_key: 1, session_name: 'Race',   date_start: '2026-08-23T13:00:00+00:00' },
    { session_key: 2, session_name: 'Sprint', date_start: '2026-09-05T15:00:00+00:00' },
    { session_key: 3, session_name: 'Race',   date_start: '2026-09-06T13:00:00+00:00' },
  ];

  it('finds the race by date, not by round number', () => {
    assert.equal(pickRaceSession(sessions, '2026-09-06T13:00:00Z').session_key, 3);
  });

  it('allows a start time that moved by a few hours', () => {
    assert.equal(pickRaceSession(sessions, '2026-08-23T15:00:00Z').session_key, 1);
  });

  it('ignores sprint sessions', () => {
    assert.equal(pickRaceSession([sessions[1]], '2026-09-05T15:00:00Z'), null);
  });

  it('returns null when OpenF1 has no race that weekend yet', () => {
    assert.equal(pickRaceSession(sessions, '2026-11-22T06:00:00Z'), null);
  });

  it('returns null for missing input', () => {
    assert.equal(pickRaceSession(null, '2026-09-06T13:00:00Z'), null);
    assert.equal(pickRaceSession(sessions, null), null);
  });
});

describe('toPickName', () => {
  it('maps the capitalised OpenF1 surname to the pick spelling', () => {
    assert.equal(toPickName({ first_name: 'Max', last_name: 'Verstappen', full_name: 'Max VERSTAPPEN' }), 'Max Verstappen');
  });

  it('copes with a different first name', () => {
    assert.equal(toPickName({ first_name: 'Andrea Kimi', last_name: 'Antonelli' }), 'Kimi Antonelli');
    assert.equal(toPickName({ first_name: 'Alexander', last_name: 'Albon' }), 'Alex Albon');
  });

  it('copes with accents and suffixes', () => {
    assert.equal(toPickName({ last_name: 'Hulkenberg' }), 'Nico Hülkenberg');
    assert.equal(toPickName({ last_name: 'Perez' }), 'Sergio Pérez');
    assert.equal(toPickName({ last_name: 'Sainz' }), 'Carlos Sainz Jr.');
  });

  it('returns null for a driver who is not on the pick list', () => {
    assert.equal(toPickName({ first_name: 'Test', last_name: 'Reserve' }), null);
    assert.equal(toPickName({}), null);
  });

  it('returns null when two pick names share the surname', () => {
    assert.equal(toPickName({ last_name: 'Schumacher' }, ['Mick Schumacher', 'Ralf Schumacher']), null);
  });
});

describe('finalTop3', () => {
  it("uses each driver's latest position", () => {
    const positions = [
      { driver_number: 1,  position: 1, date: '2026-09-06T13:01:00' },
      { driver_number: 4,  position: 2, date: '2026-09-06T13:01:00' },
      { driver_number: 16, position: 3, date: '2026-09-06T13:01:00' },
      { driver_number: 16, position: 7, date: '2026-09-06T14:00:00' },
      { driver_number: 44, position: 3, date: '2026-09-06T14:00:00' },
    ];
    assert.deepEqual(finalTop3(positions), [1, 4, 44]);
  });

  it('returns fewer than 3 when OpenF1 has fewer drivers', () => {
    assert.deepEqual(finalTop3([{ driver_number: 1, position: 1, date: 'x' }]), [1]);
    assert.deepEqual(finalTop3(null), []);
  });
});
