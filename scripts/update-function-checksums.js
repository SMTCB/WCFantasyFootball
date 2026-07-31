#!/usr/bin/env node
// update-function-checksums.js
// Recomputes SHA-256 hashes for all supabase/functions/*/**.{ts,js} (all files in
// each function's own dir) and the combined _shared/*.ts digest, then writes to
// .function-checksums.json.
//
// Run this AFTER deploying Edge Functions — before committing your PR.
//   npm run update:checksums

import { createHash } from 'node:crypto';
import { readFileSync, existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
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
// stored as _shared_hash in the JSON. When any shared module changes, this
// value changes and CI flags all functions.
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
// index.*) so sibling modules (e.g. calculate-scores/scoring-logic.js) are covered.
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

const entries = {};
for (const fn of readdirSync(functionsDir).sort()) {
  if (fn.startsWith('_')) continue;
  const dir = join(functionsDir, fn);
  if (!statSync(dir).isDirectory()) continue;
  const hasIndex = ['index.ts', 'index.js'].some((ext) => existsSync(join(dir, ext)));
  if (hasIndex) entries[fn] = hashFunctionDir(dir);
}

const sharedHash = hashShared();

const existing = existsSync(checksumFile)
  ? JSON.parse(readFileSync(checksumFile, 'utf8'))
  : {};

const note = existing._note ?? "SHA-256 of each supabase/functions/*/**.{ts,js} (all files in the function's own dir) + combined _shared/*.ts at last deploy. Run 'npm run update:checksums' after every function deploy, then commit this file. CI fails if checksums drift.";

const output = { _note: note };
if (sharedHash) output._shared_hash = sharedHash;
Object.assign(output, entries);

writeFileSync(checksumFile, JSON.stringify(output, null, 2) + '\n', 'utf8');
console.log(`✅  Updated checksums for ${Object.keys(entries).length} Edge Functions + _shared → .function-checksums.json`);
