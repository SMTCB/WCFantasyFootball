# Session Handoff Prompt — Forza Fantasy League

**Use this prompt at the start of a new Claude Code session on any PC.**

Copy and paste everything below the line.

---

## PASTE THIS INTO A NEW SESSION:

We're continuing work on the Forza Fantasy League project. Read this carefully before doing anything.

**Step 1 — Sync this PC first:**
```bash
git pull origin main
git status  # Should be clean and on main
```

---

**Current state (as of 2026-05-27 — session 48):**
- Sprints 0–4: ✅ ALL COMPLETE and merged to `main`
- Sessions 44–48: ✅ Full E2E live-data test complete + all open bugs fixed + UI/CI polish done
- Migrations applied to production: 66–84 (next migration: **`85_`**)
- Edge Functions: ✅ ALL 14 deployed (including `config.toml` with `.js` entrypoints)
- E2E test suite: 84/84 passing

---

**What was recently done (session 48 — PRs #210 + #211):**
- **E2E-01 (PR #210)**: Fixed 3 `platform.spec.js` SquadScreen failures after DEPLOY-2's production build switch — SquadScreen empty state now renders the full header ("My Squad" + budget), mobile/desktop tab strips (including ⚡ CHIPS tab), and chips content even when no players are allocated. Also fixed `provisionTestUsers()` throwing on "already registered" Supabase Auth responses.
- **BUG-NEW-07 (PR #211)**: Added duplicate bet instance guard in `BetCreatorPanel` — commissioner now gets a user-visible error if an `upcoming/open/closed` bet already exists for the same `(league_id, template_id, scope_ref)` before a new one can be created.

---

**What was recently done (session 47 — PR #209):**
- **DEPLOY-2**: CI E2E now runs against production Vite bundle (`npm run build && npm run preview`) instead of dev server — Rolldown TDZ bugs are now catchable in CI
- **LOW-4 / U92**: Replaced `html2canvas` with `modern-screenshot` (`domToPng`) — invite card PNG no longer has transparent background; CSS vars resolved correctly
- **U82 / U83**: Removed dead MD (matchday points) column from standings table + hardcoded `TrendPill(0)` — both always showed placeholder data
- **U88**: AuctionCard cancel now requires confirmation tap (two-step: first tap turns red, second tap within 4s fires cancel)
- **U93**: `+ INVITE` button disabled (opacity 0.4) until `join_code` is loaded — prevents rendering invite card with `undefined` code
- **U98**: Removed misleading `transfersMade: 0` hardcoded stat from RecapCard (transfer history not tracked yet)
- **U101**: LiveScreen now refreshes immediately when tab regains focus via `visibilitychange` listener
- **U105**: Triple Captain badge shows `×3` (was always `×2`) — `is_triple_captain` now fetched in squad query and passed into recap object

---

**What was recently done (sessions 44–46 + post-sprint UI polish):**
- Full end-to-end test with real Forza API data (8 managers, GW30/31 scoring, bets, transfers, auctions)
- **Migrations 79–84 applied to production:**
  - `79`: `fantasy_points.total` → NUMERIC (was INTEGER, rejected decimal scores)
  - `80`: `auction_bids` FK fix
  - `81`: draft pool tournament filter
  - `82`: public read RLS policies
  - `83`: `submit_bet` fix
  - `84`: `resolve_bet` fix
- Bug fixes: `run-draft-lottery` wrong column names, draft pool filter, bet submission/resolution RPCs, admin panel auth tokens, LiveScreen tournament filter, RecapScreen demo mode
- New docs: `docs/BUG_TRACKER.md`, `docs/E2E_TEST_PLAYBOOK.md`
- New config: `supabase/config.toml` (explicit `.js` entrypoints + `verify_jwt = false` on cron-triggered functions)
- UI polish PRs #192–195: league tab nav, RecapScreen multi-league selector, encoding fixes, pitch/calendar UX

---

**Known open bugs:**
- ✅ All bugs from `docs/BUG_TRACKER.md` are now fixed (as of session 48, PRs #210 + #211)
- No open bugs remaining in `docs/BUG_TRACKER.md`

---

**Key schema facts (still relevant):**
- `bet_submissions.bet_instance_id` — NOT `bet_id`
- `squads` updatable columns via RLS: `captain_id`, `joker_player_id`, `is_wildcard`, `is_triple_captain`
- `fantasy_points.matchday_id` format: `'{tournament_id}-r{round}'` e.g. `'426-r35'`
- `matchday_deadlines.matchday_id` format: `'426-rN'` (canonical, written by `sync-fixtures`)
- `calculate-scores` uses `scoring_rules` table (not `scoring_templates`) keyed by `tournament_id`
- `run-draft-lottery` uses `budget_total` column (NOT `budget`) on `leagues` table
- Next migration number: **`85_`**

---

**Key TDZ rule (Vite v8 / Rolldown — this has crashed us 4 times):**
Before adding any import to a child component of `LeagueScreen`, check whether `LeagueScreen.jsx` already imports that module. If it does, do NOT add the import to the child — pass values as props or inline them instead. Run `npm run build` after any import changes near league components. Silent production-only crash, doesn't appear in dev mode.

---

**Key reference files:**
- `BACKLOG.md` — full session history + current open items
- `docs/BUG_TRACKER.md` — open bugs with severity and reproduction steps
- `docs/E2E_TEST_PLAYBOOK.md` — full E2E test results and verified flows
- `SUPABASE_HANDOFF.md` — migration history and edge function deploy guide
- `SPRINT_PLAN_2026-05-24.md` — sprints 0–4 reference (all complete)

**Live app:** https://wc-fantasy-football.vercel.app  
**Notion backlog:** https://www.notion.so/361fe9c7e4c2803c9fc7c898a0c4bbac
