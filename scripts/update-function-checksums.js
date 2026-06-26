#!/usr/bin/env node
// update-function-checksums.js
// Recomputes SHA-256 hashes for all supabase/functions/*/index.{ts,js} and
// writes them to .function-checksums.json.
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

function hashFile(p) {
  return createHash('sha256').update(readFileSync(p)).digest('hex');
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

const existing = existsSync(checksumFile)
  ? JSON.parse(readFileSync(checksumFile, 'utf8'))
  : {};

const note = existing._note ?? "SHA-256 of each supabase/functions/*/index.{ts,js} at last deploy. Run 'npm run update:checksums' after every function deploy, then commit this file. CI fails if checksums drift.";

writeFileSync(checksumFile, JSON.stringify({ _note: note, ...entries }, null, 2) + '\n', 'utf8');
console.log(`✅  Updated checksums for ${Object.keys(entries).length} Edge Functions → .function-checksums.json`);
