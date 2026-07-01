/**
 * Test harness setup — B2 / TEST-1
 *
 * Loads the schema and seed into the local ephemeral Postgres.
 * Called by `npm run test:unit` before any test files run.
 *
 * Usage:
 *   node tests/unit/setup.js          # schema-load + seed
 *   node tests/unit/setup.js --seed   # seed only (schema already loaded)
 */

import { readFileSync, existsSync } from 'node:fs';
import pg from 'pg';

const { Client } = pg;

const DB_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/postgres';

const SCHEMA_PATH = 'supabase/schema.sql';
const SEED_PATH = 'tests/unit/seed.sql';

async function run() {
  const seedOnly = process.argv.includes('--seed');

  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  try {
    if (!seedOnly) {
      if (!existsSync(SCHEMA_PATH)) {
        console.error(
          `❌  ${SCHEMA_PATH} not found.\n` +
          '   Run Phase A1 first: pg_dump --schema-only prod > supabase/schema.sql\n' +
          '   Or use `npx supabase start` and run against the local Supabase stack.'
        );
        process.exit(1);
      }

      console.log('Loading schema…');
      const schema = readFileSync(SCHEMA_PATH, 'utf8');
      await client.query(schema);
      console.log('✅  Schema loaded');
    }

    console.log('Loading seed…');
    const seed = readFileSync(SEED_PATH, 'utf8');
    await client.query(seed);
    console.log('✅  Seed loaded');

  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
