#!/usr/bin/env node
// check-function-drift.js
// Compares SHA-256 of each supabase/functions/*/**.{ts,js} (all files in the
// function's own dir) against the committed .function-checksums.json baseline.
//
// Exits 1 (CI-blocking) when:
//   - a function's code changed but checksums weren't updated (deploy pending)
//   - a new function exists that has no checksum entry yet
//
// Workflow: change code → deploy → npm run update:checksums → commit → merge

import { createHash } from 'node:crypto';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const checksumFile = join(root, '.function-checksums.json');
const functionsDir = join(root, 'supabase', 'functions');

// Normalize CRLF→LF before hashing so checksums match across Windows
// working trees (core.autocrlf=true) and Linux CI checkouts.
function normalizedBytes(p) {
  return readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
}

// Hash all _shared/**/*.ts files combined (recursive — includes providers/) —
// changing any shared module bumps this and causes CI to flag every function
// for redeployment (they bundle _shared at deploy).
function hashShared() {
  const sharedDir = join(functionsDir, '_shared');
  if (!existsSync(sharedDir)) return null;
  const h = createHash('sha256');
  const files = readdirSync(sharedDir, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.ts'))
    .sort();
  for (const f of files) {
    h.update(f.replace(/\\/g, '/')).update(normalizedBytes(join(sharedDir, f)));
  }
  return h.digest('hex');
}

// Hash every .ts/.js file directly inside a function's own directory (not just
// index.*) so sibling modules (e.g. calculate-scores/scoring-logic.js) are covered —
// otherwise a change to a sibling file would go undetected by drift checking.
function hashFunctionDir(dir) {
  const files = readdirSync(dir)
    .filter((f) => /\.(ts|js)$/.test(f))
    .sort();
  const h = createHash('sha256');
  for (const f of files) {
    h.update(f).update(normalizedBytes(join(dir, f)));
  }
  return h.digest('hex');
}

function discoverFunctions() {
  const entries = {};
  for (const fn of readdirSync(functionsDir)) {
    if (fn.startsWith('_')) continue;
    const dir = join(functionsDir, fn);
    if (!statSync(dir).isDirectory()) continue;
    const hasIndex = ['index.ts', 'index.js'].some((ext) => existsSync(join(dir, ext)));
    if (hasIndex) entries[fn] = dir;
  }
  return entries;
}

if (!existsSync(checksumFile)) {
  console.error('❌  .function-checksums.json not found.');
  console.error('    Run: npm run update:checksums');
  process.exit(1);
}

const committed = JSON.parse(readFileSync(checksumFile, 'utf8'));
const current = discoverFunctions();

const drifted = [];
const added   = [];

// Check per-function directories
for (const [fn, dir] of Object.entries(current)) {
  const hash = hashFunctionDir(dir);
  if (!(fn in committed)) {
    added.push(fn);
  } else if (committed[fn] !== hash) {
    drifted.push(fn);
  }
}

// Check _shared — if it changed, every function needs redeployment
const currentSharedHash = hashShared();
if (currentSharedHash !== null && committed._shared_hash !== currentSharedHash) {
  const allFunctions = Object.keys(current);
  for (const fn of allFunctions) {
    if (!drifted.includes(fn) && !added.includes(fn)) {
      drifted.push(fn);
    }
  }
  console.error('⚠️   _shared/*.ts changed — all functions need redeployment (they bundle _shared at deploy time).\n');
}

if (drifted.length === 0 && added.length === 0) {
  console.log(`✅  All ${Object.keys(current).length} Edge Functions match deployed checksums.`);
  process.exit(0);
}

if (drifted.length > 0) {
  console.error('❌  Edge Functions changed since last recorded deploy:\n');
  for (const fn of drifted) {
    console.error(`    ${fn}`);
    console.error(`    → npx supabase functions deploy ${fn} --project-ref sssmvihxtqtohisghjet\n`);
  }
}
if (added.length > 0) {
  console.error('❌  New Edge Functions with no checksum entry:\n');
  for (const fn of added) {
    console.error(`    ${fn}`);
    console.error(`    → npx supabase functions deploy ${fn} --project-ref sssmvihxtqtohisghjet\n`);
  }
}

console.error('After deploying all listed functions, run:');
console.error('    npm run update:checksums');
console.error('Then commit .function-checksums.json alongside your code changes.\n');
process.exit(1);
