#!/usr/bin/env node
/**
 * TEST_pilot_gate.js — Tier 4 (Live-Platform Verification) pre-launch gate.
 * See docs/testing/TESTING_STRATEGY.md.
 *
 * Formalizes the ad hoc TEST_QA_Manager scratch checks (PR #854) into a
 * committed, repeatable script. Read-only against production — every check
 * is a SELECT, nothing here writes or migrates. Targets prod explicitly via
 * `npx supabase db query --linked`, same as every other read documented in
 * CLAUDE.md; there is no local/default target (Tier 4 is intentionally
 * prod-only — that's the entire point of this tier).
 *
 * Usage: node scripts/TEST_pilot_gate.js
 * Exit code 0 = no FAILs (WARN/INFO are advisory, review before launch).
 * Exit code 1 = at least one FAIL — do not proceed to launch.
 */

import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

// SQL is written to a temp file and passed via `-f` instead of as a CLI
// argument — sidesteps shell-quoting differences between POSIX shells and
// Windows cmd.exe (the CLI arg form breaks identically-quoted SQL under one
// or the other; a file path is the only thing that needs quoting either way).
function query(sql) {
  const file = join(tmpdir(), `pilot-gate-${randomUUID()}.sql`);
  writeFileSync(file, sql, 'utf8');
  try {
    const out = execSync(`npx supabase db query --linked --output-format json -f "${file}"`, { encoding: 'utf8' });
    const jsonStart = out.indexOf('{');
    if (jsonStart === -1) throw new Error(`unexpected CLI output: ${out.slice(0, 200)}`);
    return JSON.parse(out.slice(jsonStart)).rows ?? [];
  } finally {
    unlinkSync(file);
  }
}

const checks = [];
function check(name, fn) { checks.push({ name, fn }); }

check('Cron jobs with 3+ consecutive failures', () => {
  const rows = query('SELECT * FROM get_cron_failure_streaks(3);');
  return rows.length === 0
    ? { status: 'PASS', detail: 'no failing cron jobs' }
    : { status: 'FAIL', detail: rows.map(r => `${r.jobname}: ${r.consecutive_failures} failures (last: ${r.last_message})`).join('; ') };
});

check('Cron jobs registered as inactive', () => {
  const rows = query('SELECT jobname FROM cron.job WHERE active = false;');
  return rows.length === 0
    ? { status: 'PASS', detail: 'all registered cron jobs active' }
    : { status: 'WARN', detail: `inactive: ${rows.map(r => r.jobname).join(', ')}` };
});

check('Fixtures stuck in scheduled status well past kickoff (sync staleness)', () => {
  const rows = query(`SELECT count(*)::int AS n FROM fixtures WHERE status = 'scheduled' AND kickoff_at < now() - interval '3 hours';`);
  const n = rows[0]?.n ?? 0;
  return n === 0
    ? { status: 'PASS', detail: 'no stale scheduled fixtures' }
    : { status: 'WARN', detail: `${n} fixture(s) kicked off 3h+ ago but still marked 'scheduled' — check the sync-fixtures cron` };
});

check('Players missing a price', () => {
  const rows = query('SELECT count(*)::int AS n FROM players WHERE price IS NULL;');
  const n = rows[0]?.n ?? 0;
  return n === 0
    ? { status: 'PASS', detail: 'all players priced' }
    : { status: 'WARN', detail: `${n} player(s) with NULL price — the Forza API doesn't provide prices; seed before any budget-dependent test (see TESTING_STRATEGY.md)` };
});

check('Edge function errors logged in the last 24h', () => {
  const rows = query(`SELECT "function", count(*)::int AS n FROM edge_function_errors WHERE created_at > now() - interval '24 hours' GROUP BY "function" ORDER BY n DESC;`);
  return rows.length === 0
    ? { status: 'PASS', detail: 'no edge function errors logged in the last 24h' }
    : { status: 'WARN', detail: rows.map(r => `${r.function}: ${r.n}`).join(', ') };
});

check('Non-dry-run, non-TEST_-prefixed leagues created in the last 24h (pilot-data hygiene)', () => {
  const rows = query(`SELECT count(*)::int AS n FROM leagues WHERE created_at > now() - interval '24 hours' AND is_dry_run = false AND name NOT ILIKE 'TEST\\_%' ESCAPE '\\';`);
  const n = rows[0]?.n ?? 0;
  return { status: 'INFO', detail: `${n} new real (non-dry-run, non-TEST_) league(s) in the last 24h — informational only, not a failure` };
});

let hasFail = false;
console.log('Tier 4 — Live-Platform Verification Gate (production, read-only)');
console.log('='.repeat(72));
for (const { name, fn } of checks) {
  let result;
  try {
    result = fn();
  } catch (err) {
    result = { status: 'FAIL', detail: `query error: ${err.message}` };
  }
  if (result.status === 'FAIL') hasFail = true;
  console.log(`[${result.status}] ${name}`);
  console.log(`        ${result.detail}`);
}
console.log('='.repeat(72));
console.log(hasFail
  ? 'GATE: FAIL — resolve the FAIL item(s) above before launch.'
  : 'GATE: PASS (review any WARN/INFO items above before launch — they are advisory, not blocking).');

process.exit(hasFail ? 1 : 0);
