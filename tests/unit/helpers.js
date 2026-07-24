/**
 * Test harness DB helpers — B2 / TEST-1
 *
 * Wraps a `pg` client pointed at the local ephemeral Postgres.
 * Each test file should call `beginTx()` in beforeEach and `rollbackTx()` in afterEach
 * so the seed state is fully restored between test suites.
 */

import pg from 'pg';

const { Client } = pg;

const DB_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/postgres';

// ── Connection ────────────────────────────────────────────────────────────────

let _client = null;

export async function getClient() {
  if (!_client) {
    _client = new Client({ connectionString: DB_URL });
    await _client.connect();
  }
  return _client;
}

export async function closeClient() {
  if (_client) {
    await _client.end();
    _client = null;
  }
}

// ── Transaction helpers ───────────────────────────────────────────────────────

export async function beginTx() {
  const client = await getClient();
  await client.query('BEGIN');
}

export async function rollbackTx() {
  const client = await getClient();
  await client.query('ROLLBACK');
}

export async function commitTx() {
  const client = await getClient();
  await client.query('COMMIT');
}

// ── RPC helpers ───────────────────────────────────────────────────────────────

/**
 * Call a Postgres function that returns a single jsonb result.
 * Simulates what the Supabase client does via rpc().
 *
 * For SECURITY DEFINER functions that check auth.uid(), pass an actingUserId
 * and we'll set a session variable that mirrors Supabase's JWT claims.
 */
export async function callRpc(fnName, params = {}, { actingUserId = null } = {}) {
  const client = await getClient();

  if (actingUserId) {
    // Mirror how Supabase sets the JWT claim for SECURITY DEFINER RPCs
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [actingUserId]);
    await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: actingUserId, role: 'authenticated' }),
    ]);
  } else {
    // Simulate cron/service-role context (auth.uid() IS NULL)
    await client.query(`SELECT set_config('request.jwt.claim.sub', '', true)`);
    await client.query(`SELECT set_config('request.jwt.claims', '{}', true)`);
  }

  const keys = Object.keys(params);
  const values = Object.values(params);
  const paramList = keys.map((k, i) => `${k} => $${i + 1}`).join(', ');
  const sql = `SELECT ${fnName}(${paramList})`;

  const res = await client.query(sql, values);
  const raw = res.rows[0]?.[fnName];

  // The function may return a jsonb, text, or void
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return raw;
}

/**
 * Direct table query helper.
 */
export async function query(sql, params = []) {
  const client = await getClient();
  const res = await client.query(sql, params);
  return res.rows;
}

export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] ?? null;
}
