#!/usr/bin/env node
// check-function-drift.js
// Compares SHA-256 of each supabase/functions/*/index.{ts,js} against
// the committed .function-checksums.json baseline.
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

function hashFile(p) {
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}

// Hash all _shared/*.ts files combined — changing any shared module bumps this
// and causes CI to flag every function for redeployment (they bundle _shared at deploy).
function hashShared() {
  const sharedDir = join(functionsDir, '_shared');
  if (!existsSync(sharedDir)) return null;
  const h = createHash('sha256');
  for (const f of readdirSync(sharedDir).sort()) {
    if (!f.endsWith('.ts')) continue;
    h.update(f).update(readFileSync(join(sharedDir, f)));
  }
  return h.digest('hex');
}

function discoverFunctions() {
  const entries = {};
  for (const fn of readdirSync(functionsDir)) {
    if (fn.startsWith('_')) continue;
    const dir = join(functionsDir, fn);
    if (!statSync(dir).isDirectory()) continue;
    for (const ext of ['index.ts', 'index.js']) {
      const p = join(dir, ext);
      if (existsSync(p)) { entries[fn] = p; break; }
    }
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

// Check per-function index files
for (const [fn, p] of Object.entries(current)) {
  const hash = hashFile(p);
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
