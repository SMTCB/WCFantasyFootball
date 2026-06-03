# Service-Role Key Rotation Runbook (DD-M15)

**Rotate the Supabase service-role key before the pilot. It is currently committed in plaintext in migration cron bodies (git history), so it must be treated as compromised.**

---

## Why

The service-role JWT bypasses all RLS — it is the database master credential. It appears hardcoded in `cron.schedule` bodies across migrations (e.g. `108_security_lockdown.sql`, `110_session66_high_items.sql`, `122_session78_live_timing_and_cup_seed.sql`). Anyone with repo read access holds full DB read/write. Rotation means (a) issuing a new key and (b) updating **every** consumer in lockstep, because the old key stops working the moment it's rotated.

## Consumers that use the service-role key (update ALL in one pass)

1. **pg_cron job bodies** — every `net.http_post` with `Authorization: Bearer eyJ...service_role...`. Find them all:
   ```sql
   SELECT jobname FROM cron.job WHERE command LIKE '%service_role%' OR command LIKE '%eyJ%';
   ```
   Known at time of writing: `ingest-match-events-live`, `calculate-scores-post-match`, `calculate-scores-late-finishers`, `calculate-scores-live`, `run-draft-lottery`, `run-reverse-standings-draft`, `sync-wc-fixtures-30m`, `sync-wc-players-6h`, `resolve-finished-bets`, `auto-close-bets`, `resolve-expired-auctions`, `sync-cup-eliminations`.
2. **Edge function secrets** — functions read `SUPABASE_SERVICE_ROLE_KEY` from `Deno.env`. This is set in Dashboard → Project Settings → Edge Functions → Secrets, NOT in the repo. It must be updated to the new key.
3. **Edge function auth guards** — `calculate-scores` and `ingest-match-events` accept `Bearer <SUPABASE_SERVICE_ROLE_KEY>` (exact match) AND a `role:service_role` JWT claim. Both keep working after rotation as long as the env secret is updated and the cron bodies carry the new JWT.
4. **Vercel** — confirm the service-role key is NOT present (it was removed 2026-06-01; verify with `vercel env ls`). Only `VITE_`-prefixed public vars belong there.

## Target end state

Stop hardcoding the key. Store it once and have crons read it:
- Set it as a database setting: `ALTER DATABASE postgres SET app.settings.service_key = '<NEW_JWT>';` (or use Supabase Vault), and build cron bodies with `current_setting('app.settings.service_key')`.
- Then a future rotation updates **one** setting instead of N cron bodies.

> Note: earlier migrations switched cron bodies AWAY from `current_setting('...')` to hardcoded JWTs because the setting was unset and crons silently 401'd. If reintroducing `current_setting`, set the GUC FIRST in the same migration and verify a cron run succeeds before relying on it.

## Procedure

1. **Issue the new key**: Dashboard → Project Settings → API → roll the `service_role` key. (This immediately invalidates the old one — do steps 2–4 promptly.)
2. **Update the edge-function secret**: Dashboard → Edge Functions → Secrets → set `SUPABASE_SERVICE_ROLE_KEY` to the new key. Redeploy functions if needed.
3. **Store the new key for crons** (preferred): `ALTER DATABASE postgres SET app.settings.service_key = '<NEW_JWT>';` then in a new migration `reschedule` every cron above to use `current_setting('app.settings.service_key')` in the `Authorization` header. (Interim fallback: paste the new JWT into each cron body — but then you're back to hardcoding.)
4. **Verify**: after rescheduling, confirm each cron's next run is 2xx:
   ```sql
   SELECT j.jobname, d.status, d.return_message, d.start_time
   FROM cron.job_run_details d JOIN cron.job j ON j.jobid = d.jobid
   WHERE d.start_time > NOW() - INTERVAL '15 minutes'
   ORDER BY d.start_time DESC;
   ```
   And smoke-test a guarded function directly (expect 200 with the new JWT, 401 with the old one).
5. **Scrub history** (optional, post-pilot): the old key remains in git history. Since it's rotated/invalid, this is low-urgency, but consider `git filter-repo` to remove it if the repo is ever made public.

## Acceptance criteria
- [ ] Old key returns 401 from guarded functions.
- [ ] All crons in the list above run 2xx after rotation.
- [ ] Live scoring (`ingest-match-events-live` → `calculate-scores-live`) produces points on a test fixture.
- [ ] No `service_role` / `eyJ...` literal remains in newly-added migrations.

---

Last Updated: **2026-06-03** (session 78 — created; rotation scheduled for before WC kickoff 2026-06-11)
