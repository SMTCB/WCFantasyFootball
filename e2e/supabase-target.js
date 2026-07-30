// B-12 guard: refuse to silently default to production.
//
// These integration specs perform real writes (leagues, transfers, drafts,
// bets) and used to each hardcode the live pilot project's URL/anon key as a
// fallback whenever SUPABASE_URL/SUPABASE_ANON_KEY weren't set. That's how a
// bare `npx playwright test` run created 4 orphan "E2E EPL Classic" leagues in
// prod on 2026-07-25 (see BACKLOG.md B-12). There is currently no local Docker
// target wired up for these specs, so until that lands the only safe behavior
// is to fail loudly at import time and require the operator to name their
// target explicitly, every run.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    '\n\n' +
    '🛑 e2e integration specs require an EXPLICIT Supabase target.\n' +
    'This suite performs real writes (leagues, transfers, drafts, bets) and used to\n' +
    'silently default to the live production database when these env vars were unset\n' +
    '— that caused a real incident (orphan leagues created in prod, 2026-07-25).\n\n' +
    'Set both before running, e.g.:\n' +
    '  SUPABASE_URL=... SUPABASE_ANON_KEY=... npx playwright test e2e/<spec>.spec.js\n\n' +
    'There is currently no local Docker target wired up for these specs (BACKLOG.md B-12).\n' +
    'If you intend to target the live pilot DB, do so explicitly and deliberately —\n' +
    'never via a hardcoded fallback.\n'
  );
}

export { SUPABASE_URL, SUPABASE_ANON_KEY };
