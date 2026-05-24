# Session Handoff Prompt — Forza Fantasy League

**Use this prompt at the start of a new Claude Code session on the main PC.**

Copy and paste everything below the line.

---

## PASTE THIS INTO A NEW SESSION:

We're continuing Sprint 0 / Sprint 1 work on the Forza Fantasy League project. Read this carefully before doing anything.

**What's already done (do NOT redo any of this):**
- SQL migrations 66, 67, 68 are already applied to Supabase production
- All 5 Edge Functions have updated code committed to `main` — they just need `supabase functions deploy` (see `SUPABASE_HANDOFF.md`)
- Audit documents (`CODE_AUDIT_2026-05-24.md`, `LOGIC_AUDIT_2026-05-24.md`, `INGESTION_AUDIT_2026-05-24.md`, `UI_AUDIT_2026-05-24.md`) are updated and committed
- `e2e-setup.mjs` credentials have been redacted (moved to env vars)
- Build issue in `HubShared.jsx` (duplicated export) is fixed
- L6.1 (relaxation enforcement in `process-transfer`) is fixed
- L6.2 (pressure % display in `DraftScreen` / `DraftRecoveryScreen`) is fixed
- Branch `claude/sprint-0-release-blockers` is merged to `main`

**Step 1 — Sync this PC:**
```bash
git pull origin main
git status  # Should be clean
```

**Step 2 — Deploy Edge Functions (THIS PC HAS SUPABASE CLI):**
Read `SUPABASE_HANDOFF.md` for the exact commands. Deploy all 5 functions listed there. Verify with `supabase functions list`.

**Step 3 — Start Sprint 1:**
Read `SPRINT_PLAN_2026-05-24.md` — go to the Sprint 1 section. Start with the highest-priority unblocked items. The recommended order is:

1. **FRONT-2/3/4**: Fix Realtime channel leaks in `useLeague.js`, `useChatMessages.js`, `useLiveScores.js` — these cause memory exhaustion over time, easy wins
2. **L3.3**: Add DB trigger to maintain `league_members.rank` after each scoring run — required for standings correctness
3. **L1.x**: Scoring math fixes (captain multiplier, GK edge cases) — check `LOGIC_AUDIT_2026-05-24.md` for exact details
4. **DATA-4/5**: Fixture sync — handle cancelled/postponed matches in `sync-fixtures` function

**Key schema facts (burned us before — memorise these):**
- `bet_submissions.bet_instance_id` — NOT `bet_id`
- `squads` updatable columns: `captain_id`, `joker_player_id`, `is_wildcard`, `is_triple_captain` — no `formation`, no `joker_used`
- `relaxation_state` table exists now (migration 66 creates it)
- `is_league_member(uuid)` helper is defined — declared in migration 66
- Next migration number: `69_`
- `fantasy_points.matchday_id` format: `'{tournament_id}-r{round}'` e.g. `'426-r35'`

**Key TDZ rule (Vite v8 / Rolldown — this has crashed us 3 times):**
Before adding any import to a child component of `LeagueScreen`, check whether `LeagueScreen.jsx` already imports that module. If it does, do NOT add the import to the child — pass values as props or inline them instead. Run `npm run build` after any import changes near league components.

**Audit files to reference:**
- `SPRINT_PLAN_2026-05-24.md` — prioritised sprint backlog
- `CODE_AUDIT_2026-05-24.md` — code quality issues (FRONT-x, SEC-x, DATA-x)
- `LOGIC_AUDIT_2026-05-24.md` — business logic issues (L1.x through L6.x)
- `INGESTION_AUDIT_2026-05-24.md` — data pipeline issues
- `UI_AUDIT_2026-05-24.md` — frontend/UX issues
- `SUPABASE_HANDOFF.md` — what still needs deploying and why

**Live app:** https://wc-fantasy-football.vercel.app  
**Notion backlog:** https://www.notion.so/361fe9c7e4c2803c9fc7c898a0c4bbac
