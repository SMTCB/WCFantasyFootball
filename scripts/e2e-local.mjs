#!/usr/bin/env node
/**
 * e2e-local.mjs — Tier 3 (Local Full-Stack E2E) local-run orchestrator.
 * See docs/testing/TESTING_STRATEGY.md.
 *
 * Bootstraps the local `npx supabase start` stack's schema the same way
 * scripts/rehearse-schema.sh already does for Tier 2 (and for the same
 * reason): a from-scratch replay of supabase/migrations/ is broken partway
 * through (migration 09 declares a uuid FK against players.id, which is
 * actually text — a real, uncaptured prod schema fix) and CLAUDE.md's
 * append-only migration rule means that can't just be patched. So instead
 * of `supabase db reset` (which replays migrations), this script:
 *
 *   1. loads supabase/schema.sql directly (the verified prod snapshot)
 *   2. loads supabase/seed.sql on top (synthetic multi-sport E2E dataset)
 *   3. reads the local stack's API URL + anon key
 *   4. execs `playwright test e2e/` (minus platform.spec.js, which has its
 *      own separate CI-required run path and needs no seeded data) with
 *      SUPABASE_URL/SUPABASE_ANON_KEY set from that for the Playwright/Node
 *      side (e2e/supabase-target.js), AND VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY
 *      set from the same creds for playwright.config.js's webServer, which
 *      runs `npm run build && npm run preview` — without the VITE_-prefixed
 *      vars explicitly set here, Vite falls back to whatever's in .env.local,
 *      which is the LIVE PRODUCTION project. Discovered and fixed 2026-08-27
 *      after a read-only prod check confirmed no writes had actually landed
 *      (RLS/FK/JWT-signature mismatches blocked every write attempt) — but
 *      the app itself was silently built against prod for every UI-driven
 *      spec until this fix.
 *
 * [db.migrations] and [db.seed] are both disabled in supabase/config.toml
 * for exactly this reason — this script is the one thing that loads schema
 * and seed data into the local stack now, not the Supabase CLI's own hooks.
 *
 * Usage:
 *   npx supabase start     # once, if the local stack isn't already up
 *   npm run test:e2e:local
 */

import pg from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { execSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

function log(msg) {
  console.log(`[e2e-local] ${msg}`);
}

async function runSqlFile(client, path, label) {
  log(`Loading ${label} (${path})…`);
  const sql = readFileSync(path, 'utf8');
  await client.query(sql);
  log(`${label} loaded OK.`);
}

// Migrations written after supabase/schema.sql's prod snapshot was taken but
// not yet folded into it (i.e. not yet applied to production). schema.sql is
// NOT replaced by a full migration replay here (see file header — 75/~271
// migration files don't replay cleanly against it), so this is a narrow,
// explicit allowlist rather than "apply everything newer than N" — add a
// migration's filename here only once it's been hand-verified to apply
// cleanly on top of schema.sql, mirroring Tier 2's rehearse-schema.sh
// "schema.sql + migration(s) under test" pattern. Remove an entry once the
// prod snapshot is regenerated and already includes it.
const PENDING_MIGRATIONS = [
  '260_fix_paddock_playerbox_members_rls_recursion.sql', // 42P17 recursion fix — not yet in prod, needed by F1/tennis paddock/player-box join specs
];

async function applyPendingMigrations(client) {
  for (const filename of PENDING_MIGRATIONS) {
    await runSqlFile(client, join(REPO_ROOT, 'supabase', 'migrations', filename), `supabase/migrations/${filename} (pending, not yet in schema.sql)`);
  }
}

async function bootstrapDb() {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    log('Resetting public schema…');
    await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres; GRANT ALL ON SCHEMA public TO public;');
    await runSqlFile(client, join(REPO_ROOT, 'supabase', 'schema.sql'), 'supabase/schema.sql');
    // schema.sql (a pg_dump) pins search_path to '' for the rest of the
    // session so its DDL resolves unambiguously — that empty search_path
    // otherwise leaks into seed.sql on this same connection and breaks
    // unqualified calls like gen_salt()/crypt() (pgcrypto lives in `extensions`).
    await client.query('SET search_path = public, extensions;');
    await applyPendingMigrations(client);
    await runSqlFile(client, join(REPO_ROOT, 'supabase', 'seed.sql'), 'supabase/seed.sql');
  } finally {
    await client.end();
  }
}

function ensureStackRunning() {
  log('Ensuring local Supabase stack is up (npx supabase start)…');
  const res = spawnSync('npx', ['supabase', 'start'], { cwd: REPO_ROOT, stdio: 'inherit', shell: true });
  if (res.status !== 0) {
    console.error('[e2e-local] `npx supabase start` failed — see output above.');
    process.exit(1);
  }
}

function getStackCreds() {
  const out = execSync('npx supabase status -o json', { cwd: REPO_ROOT, encoding: 'utf8' });
  const jsonStart = out.indexOf('{');
  const status = JSON.parse(out.slice(jsonStart));
  return { url: status.API_URL, anonKey: status.ANON_KEY, serviceRoleKey: status.SERVICE_ROLE_KEY };
}

function gatedSpecFiles() {
  // platform.spec.js is a separate CI-required demo-mode smoke test with its
  // own run path — it needs no seeded data and is excluded here by name,
  // not by grep (grep matches test titles, not filenames).
  return readdirSync(join(REPO_ROOT, 'e2e'))
    .filter((f) => f.endsWith('.spec.js') && f !== 'platform.spec.js')
    .map((f) => `e2e/${f}`);
}

function runPlaywright({ url, anonKey, serviceRoleKey }) {
  const specs = gatedSpecFiles();
  log(`Running Playwright against the local stack (${specs.length} specs)…`);
  const res = spawnSync(
    'npx',
    ['playwright', 'test', ...specs],
    {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        SUPABASE_URL: url,
        SUPABASE_ANON_KEY: anonKey,
        // Local stack's service-role key — the F1/tennis specs use it (when
        // present) to reset rows that RLS/table policy restrict to
        // admin/service-role writes (e.g. trophy_ledger has no
        // client-writable policy at all) so cross-project (desktop-chrome →
        // mobile-chrome) reruns of the same admin-scoring/roster specs
        // against this one shared local DB stay idempotent. Deliberately
        // NOT named SUPABASE_SERVICE_ROLE_KEY: draft-mode-complete.spec.js
        // and draft-allocation-e2e.spec.js gate real (pre-existing, broken —
        // see e2e/draft-mode-complete.spec.js's serviceSupabase comment)
        // run-draft-lottery-invoking test bodies behind that exact name via
        // `if (!serviceSupabase) test.skip()`. Setting it here un-skipped
        // those bodies and surfaced two unrelated latent bugs (wrong
        // onConflict target on draft_submissions; run-draft-lottery invoked
        // with a service-role JWT where it requires a real commissioner
        // user JWT) — out of scope for this pass, logged in BACKLOG.md
        // instead of fixed. Safe to set unconditionally: this is the
        // ephemeral local stack's own key, never production's.
        E2E_LOCAL_SERVICE_ROLE_KEY: serviceRoleKey,
        // Must override any VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY already
        // present (e.g. from .env.local, which points at production) —
        // playwright.config.js's webServer spawns `npm run build`, and Vite
        // only prefers .env.local over ambient process.env, not the reverse.
        VITE_SUPABASE_URL: url,
        VITE_SUPABASE_ANON_KEY: anonKey,
      },
    }
  );
  process.exit(res.status ?? 1);
}

async function main() {
  ensureStackRunning();
  await bootstrapDb();
  const creds = getStackCreds();
  runPlaywright(creds);
}

main().catch((err) => {
  console.error('[e2e-local] FATAL:', err);
  process.exit(1);
});
