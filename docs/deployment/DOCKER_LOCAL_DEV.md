# Docker & Local Development Guide

**How to run Forza Fantasy League on your own infrastructure — three paths from `git clone` to running app.**

---

## Quick Navigation

- [Option A — Docker (frontend only)](#option-a--docker-frontend-only) — fastest, no Supabase account needed
- [Option B — Docker Compose (full local topology)](#option-b--docker-compose-full-local-topology) — frontend + Postgres + Deno function runner
- [Option C — Supabase CLI (full feature parity)](#option-c--supabase-cli-full-feature-parity) — includes Auth, Realtime, pgcron, Edge Functions
- [Schema Rehearsal Workflow](#schema-rehearsal-workflow) — rehearse a migration/schema change against a real replica before touching the live pilot DB

---

## Environment Targets

| Target | Frontend URL | Supabase instance | Auth |
|--------|-------------|-------------------|------|
| **prod** | `https://wc-fantasy-football.vercel.app` | `sssmvihxtqtohisghjet` (managed) | Supabase Auth |
| **staging** | Provision a second Supabase project + Vercel preview | Buyer-owned project | Supabase Auth |
| **local** | `http://localhost:3000` (Docker) or `http://localhost:5173` (Vite) | `supabase start` or docker compose db | Demo mode or local Auth |

---

## Prerequisites

- Docker 24+
- Node.js 20+ (for non-Docker paths)
- A `.env.local` file (copy from `.env.example`)

```bash
git clone https://github.com/SMTCB/WCFantasyFootball
cd WCFantasyFootball
cp .env.example .env.local
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
```

---

## Option A — Docker (frontend only)

**When to use:** you want to run the compiled app against an existing Supabase project (production or staging). No database or function runner needed locally.

```bash
# Build the image (bakes VITE_* vars into the JS bundle at build time)
docker build \
  --build-arg VITE_SUPABASE_URL=https://your-project.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=your_anon_key \
  --build-arg VITE_AUTH_ENABLED=true \
  -t forzafantasy .

# Run
docker run -p 3000:80 forzafantasy

# App is at http://localhost:3000
```

The image is ~25 MB (nginx:alpine). It serves the Vite-built bundle with the same security headers as the Vercel deployment.

---

## Option B — Docker Compose (full local topology)

**When to use:** local integration testing, buyer evaluation, or CI that needs the full stack without a Supabase account.

```bash
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local, then:
docker compose up --build

# Services started:
#   app       → http://localhost:3000   (nginx serving the React bundle)
#   db        → localhost:5432          (Postgres 15)
#   functions → http://localhost:54321  (Deno Edge Runtime, one function at a time)
```

### What each service covers

| Service | What works | What doesn't |
|---------|-----------|--------------|
| `app` | Full React UI, auth flow if pointed at a Supabase project | — |
| `db` | Schema queries, data exploration, unit tests | pgcron, pg_net, Supabase Auth schema (need `supabase/postgres` image) |
| `functions` | Run and test a single Edge Function | Multi-function routing, cron scheduling |

### Running a specific Edge Function

```bash
# Run the sync-fixtures function (default)
docker compose up functions

# Switch to a different function
EDGE_FUNCTION=ingest-match-events docker compose up functions

# Test it
curl -X POST http://localhost:54321 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -d '{"forza_id":"429"}'
```

### Resetting local data

```bash
docker compose down -v    # removes pgdata volume — clean slate
docker compose up --build
```

---

## Option C — Supabase CLI (full feature parity)

**When to use:** active development, full schema migration testing, or when you need Auth / Realtime / pgcron locally.

```bash
# Install Supabase CLI (if not already)
npm install -g supabase

# Link to the project (one-time, requires a Supabase account with access)
npx supabase login
npx supabase link --project-ref sssmvihxtqtohisghjet

# Start the full local Supabase stack
npx supabase start
# Prints: API URL, anon key, service role key, Studio URL, etc.

# Point the app at the local Supabase instance
# In .env.local:
#   VITE_SUPABASE_URL=http://localhost:54321
#   VITE_SUPABASE_ANON_KEY=<printed by supabase start>

# Start the React dev server
npm run dev
# App at http://localhost:5173
```

### Apply migrations to local DB

```bash
npx supabase db reset    # applies all migrations from supabase/migrations/ to local DB
```

### Run Edge Functions locally

```bash
npx supabase functions serve sync-fixtures --env-file .env.local
```

---

## Schema Rehearsal Workflow

**When to use:** you're about to change the schema (a new migration, an RLS policy tweak, an RPC signature change) and want to rehearse it against a real replica of the current 271-migration history before it touches the live pilot DB. This is a lightweight substitute for a dedicated staging environment (see [Provisioning a Staging Environment](#provisioning-a-staging-environment) below for the heavier option) — it satisfies "I want real tests in case we need to adjust the schema" without standing up a second Supabase project.

**Known limitation — plain `db reset` can fail partway on this repo.** `supabase db reset` applies every file in `supabase/migrations/` in pure lexicographic filename order. Because ASCII sorts `'1'` before `'9'`, files numbered **100+ sort before files numbered 90–99** — the apply order does not match numeric/chronological order. Combined with one genuine latent bug in an early migration (`09_sprint1_schema.sql` declares a `uuid` foreign key against a column that has always been `TEXT`; the real fix lives in `10_sprint1_fixes.sql`, which drops and recreates the table correctly), a plain `db reset` hard-fails and aborts the entire run — even though the fix migration would have resolved it had the CLI kept going.

**The fix:** [`scripts/rehearse-schema.sh`](../../scripts/rehearse-schema.sh) tries a normal `supabase db reset` first, and only falls back if that fails. The fallback re-applies every remaining migration file individually via raw `psql`, continuing past failures instead of aborting, then logs exactly which files failed so they can be spot-checked (most turn out to be ordering artifacts — a later-numbered fix ran before the migration it targets and found nothing to do — or expected-empty-local-DB conditions, not real problems). It finishes by re-granting `SELECT/INSERT/UPDATE/DELETE` to `anon`/`authenticated`/`service_role` on the `public` schema: the raw-`psql` fallback path bypasses a grant-restoration step the CLI normally runs after migrations, and without it PostgREST returns `42501 permission denied` on every table touched by the fallback — including for the `service_role` key that Edge Functions use.

```bash
npx supabase start                    # once, if the local stack isn't already up
bash scripts/rehearse-schema.sh
```

Logs land in `.rehearsal/` (gitignored): `db-reset.log` (the initial attempt), `replay.log` + `replay.log.failures` (the fallback, if triggered), `grants.log`.

Once rehearsed, serve the function(s) you're testing and exercise them exactly as they'd run in prod:

```bash
npx supabase functions serve <function-name>
curl -X POST http://127.0.0.1:54321/functions/v1/<function-name> \
  -H "Authorization: Bearer <local service_role key printed by 'supabase start'>" \
  -H "Content-Type: application/json" \
  -d '{...}'
```

For read-only reference data (e.g. a real tournament draw) that a local rehearsal needs but shouldn't fabricate, pull it from prod with a `SELECT`-only `npx supabase db query --linked` and re-insert it locally via generated `INSERT` statements — no write ever touches the live DB, consistent with the Pilot Safeguards "SELECT before any write" pattern.

---

## Environment Variables Reference

| Variable | Required | Scope | Description |
|----------|---------|-------|-------------|
| `VITE_SUPABASE_URL` | ✅ | Frontend (build-time) | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Frontend (build-time) | Supabase anon (public) key |
| `VITE_AUTH_ENABLED` | — | Frontend (build-time) | `true` = real auth; `false` = demo mode (default) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Edge Functions | Backend only | Service role key — never expose to the browser |
| `FORZA_ACCESS_TOKEN` | ✅ Edge Functions | Backend only | Forza Football API token |
| `GROQ_API_KEY` | Edge Functions | Backend only | Groq API key (frontpage edition generation) |
| `STRIPE_SECRET_KEY` | Edge Functions | Backend only | Stripe secret (purchase-coins — not yet active) |
| `POSTGRES_PASSWORD` | — | Docker compose | Local Postgres password (default: `postgres`) |
| `EDGE_FUNCTION` | — | Docker compose | Function name for the `functions` service (default: `sync-fixtures`) |

### How secrets are managed per environment

| Environment | VITE_* vars | Edge Function secrets |
|-------------|------------|----------------------|
| prod (Vercel) | Set in Vercel dashboard → Environment Variables | `npx supabase secrets set KEY=val --project-ref <ref>` |
| staging | Set in Vercel dashboard for the preview env | Same — against the staging Supabase project ref |
| local (Docker) | `--build-arg` or `.env.local` | `.env.local` (docker compose reads it) |
| local (Supabase CLI) | `.env.local` | `.env.local` (passed to `supabase functions serve`) |

**Rule:** `SUPABASE_SERVICE_ROLE_KEY`, `FORZA_ACCESS_TOKEN`, `GROQ_API_KEY`, and `STRIPE_*` are **never** `VITE_`-prefixed and never bundled into the client JS. Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` reach the browser.

---

## Provisioning a Staging Environment

1. Create a second Supabase project at [app.supabase.com](https://app.supabase.com)
2. Link and apply migrations: `npx supabase link --project-ref <new-ref> && npx supabase db push`
3. Set Edge Function secrets: `npx supabase secrets set FORZA_ACCESS_TOKEN=... --project-ref <new-ref>`
4. Deploy Edge Functions: `npx supabase functions deploy --project-ref <new-ref>`
5. Create a Vercel preview environment pointed at the new `VITE_SUPABASE_URL`

---

## Related Documents

- [`.env.example`](../../.env.example) — all variable names with descriptions
- [`Dockerfile`](../../Dockerfile) — multi-stage build (node:20-alpine → nginx:alpine)
- [`docker-compose.yml`](../../docker-compose.yml) — full local topology
- [`nginx.conf`](../../nginx.conf) — SPA routing + security headers
- [`scripts/rehearse-schema.sh`](../../scripts/rehearse-schema.sh) — schema rehearsal script (see above)
- [`DATA_PIPELINE_RUNBOOK.md`](DATA_PIPELINE_RUNBOOK.md) — cron setup and data activation
- [`SERVICE_KEY_ROTATION_RUNBOOK.md`](SERVICE_KEY_ROTATION_RUNBOOK.md) — secret rotation procedure

---

Last Updated: **2026-07-31**
