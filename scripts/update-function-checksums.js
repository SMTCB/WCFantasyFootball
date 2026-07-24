#!/usr/bin/env node
// update-function-checksums.js
// Recomputes SHA-256 hashes for all supabase/functions/*/index.{ts,js} and
// the combined _shared/*.ts digest, then writes to .function-checksums.json.
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

function hashFile(p) {
  return createHash('sha256').update(normalizedBytes(p)).digest('hex');
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

const entries = {};
for (const fn of readdirSync(functionsDir).sort()) {
  if (fn.startsWith('_')) continue;
  const dir = join(functionsDir, fn);
  if (!statSync(dir).isDirectory()) continue;
  for (const ext of ['index.ts', 'index.js']) {
    const p = join(dir, ext);
    if (existsSync(p)) { entries[fn] = hashFile(p); break; }
  }
}

const sharedHash = hashShared();

const existing = existsSync(checksumFile)
  ? JSON.parse(readFileSync(checksumFile, 'utf8'))
  : {};

const note = existing._note ?? "SHA-256 of each supabase/functions/*/index.{ts,js} + combined _shared/*.ts at last deploy. Run 'npm run update:checksums' after every function deploy, then commit this file. CI fails if checksums drift.";

const output = { _note: note };
if (sharedHash) output._shared_hash = sharedHash;
Object.assign(output, entries);

writeFileSync(checksumFile, JSON.stringify(output, null, 2) + '\n', 'utf8');
console.log(`✅  Updated checksums for ${Object.keys(entries).length} Edge Functions + _shared → .function-checksums.json`);
