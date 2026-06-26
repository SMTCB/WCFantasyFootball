# Platform Revision — Central Tracker

**Read this at the start of every v2 session. Everything that is open, pending, or blocked lives here.**

> **Goal:** ship a multi-sport platform (Football + F1 + Tennis + P2P betting) that can be presented to a buyer with all features implemented — not on a roadmap. Target buyout score: **8/10**.
>
> **Branch:** `v2` — not deployed until Week 12. Live pilot runs on `main` and is completely untouched.
>
> **Detailed sprint history:** [SALE_READY_PROJECT_PLAN.md](due_diligence/SALE_READY_PROJECT_PLAN.md) — go there for full session notes, architecture decisions, and sprint task breakdowns.

---

## Phase Status

| Phase | Track | Status | Notes |
|---|---|---|---|
| **0** | Foundation seams (sport abstraction, circle layer, trophy ledger) | ✅ Done | Migrations 187–189 applied |
| **1A** | P2P Betting (coin ledger, challenges, auto-resolution, economy) | ✅ Done | Sprints P2P-0 through P2P-6 (PRs #627–#629, migrations 202–207) |
| **1B** | F1 Module (paddocks, picks, scoring, OpenF1) | ✅ Done | Sprints F1-0 through F1-3 (PR #606) |
| **1C** | UX Redesign (Kit Light token pass, multi-sport shell) | ✅ Done | Sprints UX-0, UX-1, UX-2 (PRs #632–#633) |
| **1D-A** | HMAC-SHA256 JWT fix (requireServiceRole) | ✅ Code done | Deploy deferred to Week 12 |
| **1D-B** | Schema reproducibility baseline (000_baseline.sql) | ⏸ On hold | Do as final step before 3B merge |
| **1E** | Clubhouse social architecture (channels, DMs, frontpage, inbox) | ✅ Done | Sprints CH-0 through CH-9 (PRs #607–#615) |
| **2** | Tennis Module (Player's Box, roster picks, Ace Cards, ATP Finals) | ✅ Done | Sprints T-0 through T-4 (PRs #617–#620, #625) |
| **3A** | Buyout hygiene batch 2 (provider adapter, containerisation, envs) | ✅ Done | PRs #634–#636 |
| **3B** | v2 integration & deploy | 🔄 In progress | Code quality gates ✅ — smoke tests + deploy remaining |

**Next session:** Phase 3B smoke tests → deploy sequence. See [Phase 3B checklist](#phase-3b-pre-merge-checklist) below.

---

## ⚠️ Pending DB & Deploy Actions

> **APPROVAL GATE — read before running anything**
>
> Every row below writes to the **shared production Supabase project** (`sssmvihxtqtohisghjet`) — the same DB that serves the live pilot. Claude must:
> 1. State which specific row(s) it intends to run in plain language in chat.
> 2. Wait for explicit "yes, proceed" before executing. A prior approval does NOT carry over.
> 3. Never batch-run multiple rows on one approval.
>
> These must run from the **Supabase-linked PC only**.

| # | Status | Action | Command |
|---|--------|--------|---------|
| 1 | ⬜ | Apply migration 209 — coin currency compliance | `npx supabase db query --linked --file supabase/migrations/209_coin_ledger_compliance.sql` |
| 2 | ⬜ | Apply migration 210 — SEC-1 is_admin guard trigger | `npx supabase db query --linked --file supabase/migrations/210_guard_users_is_admin.sql` |
| 3 | ⬜ | Apply migration 211 — MONEY-1 reference_id UNIQUE | `npx supabase db query --linked --file supabase/migrations/211_coin_reference_id_unique.sql` |
| 4 | ⬜ | Deploy `score-f1-race` (SEC-2) | `npx supabase functions deploy score-f1-race --project-ref sssmvihxtqtohisghjet` |
| 5 | ⬜ | Deploy `score-tennis-tournament` (SEC-2) | `npx supabase functions deploy score-tennis-tournament --project-ref sssmvihxtqtohisghjet` |
| 6 | ⬜ | Deploy `score-atp-finals` (SEC-2) | `npx supabase functions deploy score-atp-finals --project-ref sssmvihxtqtohisghjet` |
| 7 | ⬜ | Deploy `sync-tennis-players` (SEC-2) | `npx supabase functions deploy sync-tennis-players --project-ref sssmvihxtqtohisghjet` |
| 8 | ⬜ | Deploy `calculate-scores` (SEC-3) | `npx supabase functions deploy calculate-scores --project-ref sssmvihxtqtohisghjet` |
| 9 | ⬜ | Set FRONTEND_URL secret (MONEY-1 CORS) | `npx supabase secrets set FRONTEND_URL=https://wc-fantasy-football.vercel.app --project-ref sssmvihxtqtohisghjet` |
| 10 | ⬜ | SEC-4: Rotate GitHub PAT + switch to SSH | Manual — see [TECHNICAL_DUE_DILIGENCE.md](due_diligence/TECHNICAL_DUE_DILIGENCE.md) → SEC-4 |
| 11 | ⬜ | Add `VITE_SENTRY_DSN` to Vercel (OPS-2) | Vercel dashboard → Settings → Env vars (Production only): `https://3d26f98051c484e03c58e2d32a260a89@o4511632696213504.ingest.de.sentry.io/4511632708927568` |

**Next migration on v2:** `212_`

---

## Phase 3B Pre-Merge Checklist

These must all be green before opening the v2 → main PR.

### Smoke Tests
- [ ] `platform.spec.js` green on v2 (84 tests × 1 browser) — last confirmed 84/84 on 2026-06-23
- [ ] Football smoke pass: login → squad → transfer → league → live → recap
- [ ] P2P smoke pass: create wallet → purchase test coins (`MOCK_PAYMENTS=true`) → create challenge → resolve
- [ ] F1 smoke pass: create paddock → submit picks → enter test result → verify scores
- [ ] Tennis smoke pass: submit picks → enter result → verify scores
- [ ] `npx madge --circular src/` — no new cycles

### Final Steps (do last, in order)
- [ ] Phase 1D-B: generate `000_baseline.sql` schema snapshot (on hold until schema settled)
- [ ] Merge `main` into `v2` one final time (pick up any last pilot fixes)
- [ ] Apply all pending DB actions (rows 1–11 in table above)
- [ ] Run `platform.spec.js` one final time after the merge

### Deploy Sequence
- [ ] Open PR: `v2` → `main`
- [ ] Review diff — confirm no football data or auth paths broken
- [ ] Merge PR (squash)
- [ ] Vercel auto-deploys → verify deployment succeeds
- [ ] Post-deploy pilot smoke: login with a real pilot user, verify squad/points intact
- [ ] Deploy ALL Edge Functions manually:
  ```bash
  npx supabase functions deploy calculate-scores discover-tournament sync-fixtures sync-players sync-player-status ingest-match-events generate-frontpage-edition purchase-coins score-f1-race score-tennis-tournament score-atp-finals sync-tennis-players score-f1-race --project-ref sssmvihxtqtohisghjet
  ```
- [ ] Verify all crons running: `SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;`

---

## Remaining DD Items

From [TECHNICAL_DUE_DILIGENCE.md](due_diligence/TECHNICAL_DUE_DILIGENCE.md). Sequenced by phase.

### Phase 1 — Complex, currently deferred
| Item | Description | Effort |
|------|-------------|--------|
| DATA-1 | PII audit — map all columns storing PII, add `pg_audit` event logging | ~4h |
| OPS-1 | Structured logging — replace ad-hoc `console.log` in Edge Functions with a uniform `log(level, msg, context)` helper | ~3h |

### Phase 2 — Post-3B, before buyer demos
| Item | Description | Effort |
|------|-------------|--------|
| TEST-1 | Coverage metrics — integrate Vitest + `@vitest/coverage-v8`; target 60% line coverage on hooks and RPCs | ~6h |
| DATA-2 | GDPR deletion RPC — `delete_user_data(p_user_id)` cascades PII columns; admin-only | ~3h |
| DATA-3 | Data classification doc — label each table column (PII / financial / game data / public) | ~2h |
| CODE-3 | Error boundaries — `ErrorBoundary` wrapper on each major screen; fallback UI + Sentry capture | ~2h |

### Phase 3 — Before sale close
| Item | Description |
|------|-------------|
| CODE-2 | TypeScript migration — convert `src/lib/`, `src/hooks/`, `src/context/` to `.ts`/`.tsx` |
| CODE-4 | Component tests — Storybook or Playwright component tests for the 5 most complex components |
| DEPS-2 | Supply chain hardening — `npm ci` with `--ignore-scripts`; `package-lock.json` integrity hash |
| INFRA-1 | Multi-region readiness — document Supabase region selection rationale; buyer can migrate |
| LOW-2 | Storybook or Ladle component catalogue |
| LOW-3 | API rate-limit headers (429 with `Retry-After`) on all Edge Functions |
| LOW-6 | Mobile push notifications (Capacitor + FCM/APNs) |
| LOW-9 | Accessibility audit (WCAG 2.1 AA minimum) |

---

## Open Product Decisions

These require a human decision before the relevant sprint can continue.

| Decision | Blocks | Status |
|----------|--------|--------|
| Staging environment — second Supabase project for buyer demos | Phase 3A (noted), buyer demos | ⬜ Not decided |
| Meta-league scoring formula (trophy count vs Olympic points vs hybrid) | Phase 3B leaderboard | ⬜ Deferred — ledger built, formula is a swappable function |
| Non-playing member UX (user in Clubhouse with no leagues) | Clubhouse empty state | ⬜ Needs design |
| F1 scoring weights (pts per correct round pick) | F1 admin scoring | ⬜ Not decided (F1-4 deferred) |
| Clubhouse admin responsibility scope | CH-8 follow-up | ⬜ Will surface during next Clubhouse iteration |
| Stripe account confirmation | P2P Sprint P2P-2 completion | ⬜ Business decision — zero code changes needed when ready |

---

## Module Status Summary

| Module | Screens | Hooks | DB (migrations) | Edge Functions | Status |
|--------|---------|-------|----------------|----------------|--------|
| **Football** | 11 screens | 10 hooks | 191 migrations (main) | `calculate-scores`, `process-transfer`, `process-trade`, `update-player-status`, `handle-chat-notifications`, `generate-frontpage-edition` | ✅ Live on main |
| **Clubhouse** | `ClubhouseScreen` + tabs | `useClubhouse`, `useClubhouseChat`, `useDirectMessages`, `useClubhouseFrontpage` | Migrations 188, 193–196 (v2) | `generate-frontpage-edition` (extended) | ✅ v2 only |
| **P2P Betting** | `WalletScreen`, `ChallengeScreen` | `useWallet`, `useChallenges` | Migrations 202–207 (v2) | `purchase-coins`, `resolve-p2p-challenges` | ✅ v2 only — Stripe plug-in ready |
| **F1** | 7 screens | `usePaddock`, `useF1Bets`, `useF1Standings` | Migrations 190–192 (v2) | `score-f1-race` | ✅ v2 only — deploy pending |
| **Tennis** | 7 screens | `usePlayerBox`, `useTennisCalendar`, `useTennisTournament`, `useTennisLeaderboard`, `useAtpFinalsPicks` | Migrations 197–201 (v2) | `score-tennis-tournament`, `score-atp-finals`, `sync-tennis-players` | ✅ v2 only — deploy pending |

---

## Key Documents

| Purpose | File |
|---------|------|
| Full sprint history + session notes | [SALE_READY_PROJECT_PLAN.md](due_diligence/SALE_READY_PROJECT_PLAN.md) |
| Buyout assessment (what an acquirer tests) | [B2B_BUYOUT_TECHNICAL_DUE_DILIGENCE.md](architecture/B2B_BUYOUT_TECHNICAL_DUE_DILIGENCE.md) |
| DD remediation backlog (SEC-/DATA-/CODE- IDs) | [TECHNICAL_DUE_DILIGENCE.md](due_diligence/TECHNICAL_DUE_DILIGENCE.md) |
| Tech documentation for buyers | [TECH_DOCUMENTATION.md](due_diligence/TECH_DOCUMENTATION.md) |
| P2P betting data model + security | [P2P_BETTING_SYSTEM_DESIGN.md](architecture/P2P_BETTING_SYSTEM_DESIGN.md) |
| Multi-sport platform architecture | [MULTI_SPORT_PLATFORM_ARCHITECTURE.md](architecture/MULTI_SPORT_PLATFORM_ARCHITECTURE.md) |
| F1 module plan (authoritative) | [F1_MODULE_IMPLEMENTATION_PLAN.md](modules/F1_MODULE_IMPLEMENTATION_PLAN.md) |
| Tennis module plan (authoritative) | [TENNIS_MODULE_IMPLEMENTATION_PLAN.md](modules/TENNIS_MODULE_IMPLEMENTATION_PLAN.md) |
| P2P sprint delivery plan | [P2P_BETTING_IMPLEMENTATION_ROADMAP.md](modules/P2P_BETTING_IMPLEMENTATION_ROADMAP.md) |
| Design system tokens + handoffs | [design/](design/) |
| v2 branch rules (what must NOT merge) | [V2_BRANCH_PROTECTION.md](architecture/V2_BRANCH_PROTECTION.md) |
| Claude Code session instructions | [CLAUDE.md](../../CLAUDE.md) |
| Live session log (completed PRs, bugs) | [BACKLOG.md](../../BACKLOG.md) |

---

## Cross-Cutting Rules (Every Sprint)

1. **Migrations are append-only.** Next free number on v2: `212_`. Never edit an applied migration.
2. **Backup before every migration.** Docker unavailable — `SELECT` affected rows and save to `backups/*.json` first.
3. **Football stays green.** `platform.spec.js` + manual smoke pass after any sprint touching shared infrastructure.
4. **Value moves only through `SECURITY DEFINER` RPCs.** Clients never write directly to coin or budget columns.
5. **All non-ASCII in SQL via `chr()`.** Windows encoding corrupts literal emoji/arrows — see migration 154.
6. **`gazette_entry_type` new values require `ALTER TYPE ... ADD VALUE IF NOT EXISTS`** + registration in `ENTRY_META` in `LeagueDetailView.jsx`.
7. **All modals/bottom-sheets use `createPortal(node, document.body)`.** `AppLayout#main-content` breaks `position:fixed`.
8. **Never `.catch()` on a Supabase query builder** — use `.then(null, handler)`.
9. **Rolldown TDZ rule:** grep before adding any import to a child of a large screen. Run `npm run build` before merging.
10. **Stripe keys are Edge Function secrets only** — never `VITE_`-prefixed, never in git.
11. **Edge Functions are NOT auto-deployed by Vercel** — manually deploy after every PR touching `supabase/functions/`.

---

Last Updated: **2026-06-26**
