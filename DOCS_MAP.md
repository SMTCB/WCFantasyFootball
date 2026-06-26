# Documentation Map — Forza Fantasy League

For interactive search and filtering open **[DOCS_INDEX.html](DOCS_INDEX.html)** in a browser.

---

## Root Files

| File | Purpose |
|------|---------|
| `README.md` | Project overview and quick-start |
| `CLAUDE.md` | **Read first** — Claude Code session instructions, git workflow, tech stack |
| `BACKLOG.md` | Live session log: every completed PR, migration, bug fix |
| `GEMINI.md` | Google Antigravity (mobile AI) instructions |
| `DOCS_INDEX.html` | Interactive doc browser (search + category filter) |
| `DOCS_MAP.md` | This file — text-based quick reference |

---

## Platform Revision — `docs/platform_revision/`

All v2 / sale-ready platform work lives here.

| Path | Purpose |
|------|---------|
| **`TRACKER.md`** | **Central open-items tracker — read at the start of every v2 session** |
| `due_diligence/` | SALE_READY_PROJECT_PLAN (sprint history), TECH_DOCUMENTATION, TECHNICAL_DUE_DILIGENCE, VALUATION_ANALYSIS, TECH_OVERVIEW |
| `architecture/` | B2B_BUYOUT DD, P2P_BETTING_SYSTEM_DESIGN, MULTI_SPORT_PLATFORM_ARCHITECTURE, V2_BRANCH_PROTECTION, assessments |
| `modules/` | F1, Tennis, P2P, multi-sport implementation plans |
| `design/` | Kit Light tokens (`tokens/kit.css`), BRIEF, TOKEN_MIGRATION, HANDOFF-STATUS, screen handoffs |
| `PRODUCT_ROADMAP_DECK.html` | Strategic product roadmap HTML presentation for buyers |

---

## Core Architecture — `docs/architecture/`

Football platform specs shared between `main` and `v2`.

| File | Purpose |
|------|---------|
| `FANTASY_POINTS_SCORING_LAYER.md` | Scoring formula, cron schedule, matchday timeline |
| `DRAFT_SYSTEM_DESIGN.md` | Draft lottery, allocation engine, no-repeat rules, club cap |
| `H2H_COMPETITION_DESIGN.md` | Head-to-head competition layer on draft leagues |
| `AUCTION_SYSTEM_DESIGN.md` | Two-phase auction flow (bid → pending → confirm) |
| `TRANSFER_WINDOW_SYSTEM.md` | Auto open/close, config table, transfer limits |
| `STARTING_XI_AND_BENCH.md` | XI selection, bench rules, lineup lock |
| `POOL_RELAXATION_SYSTEM.md` | Player-repeat and club-cap relaxation formulas |
| `SCORING_INTEGRITY.md` | Round lock, replay guards, audit trails |
| `LIVE_CENTRE_DESIGN.md` | Fixture filter logic, squad display, starting_xi authority |
| `APP_DYNAMICS.md` | Live match updates, Realtime subscriptions |
| `DRAFT_MECHANICS_FOR_DUMMIES.md` | Plain-English draft walkthrough + glossary |
| `FORMATION_RULES.md` | 11-player pitch validation constraints |
| `DRAFT_UNLIMITED_TRANSFERS.md` | Draft league transfer bypass behaviour |
| `TRANSFERS_AND_LINEUP_GUIDE.md` | Transfers + lineup combined user guide |
| `CHIPS_TRIPLE_CAPTAIN_AND_MATCHDAY_JOKER.md` | Chip mechanics and scoring application |

---

## API — `docs/api/`

| File | Purpose |
|------|---------|
| `API_INTEGRATION_REFERENCE.md` | Field-by-field Forza API reference (authoritative) |
| `FORZA_API_KNOWLEDGE.md` | Quirks, edge cases, debugging tips |
| `FIT_GAP_ANALYSIS.md` | Gap analysis vs platform requirements |

---

## Deployment & Ops — `docs/deployment/` · `docs/ops/`

| File | Purpose |
|------|---------|
| `deployment/DATA_PIPELINE_RUNBOOK.md` | Cron/sync architecture, active cron table |
| `deployment/ADDING_A_NEW_TOURNAMENT.md` | New tournament onboarding cookbook |
| `deployment/DOCKER_LOCAL_DEV.md` | Docker local dev setup |
| `deployment/OBSERVABILITY_STRATEGY.md` | Sentry, logging, alerting |
| `deployment/SERVICE_KEY_ROTATION_RUNBOOK.md` | API key rotation procedure |
| `ops/MD1_CORRECTION_RUNBOOK.md` | Post-matchday rescore procedure |

---

## Reference — `docs/reference/`

| File | Purpose |
|------|---------|
| `CONVENTIONS.md` | Code conventions, naming, git workflow |
| `LOCAL_DEVELOPMENT.md` | Dev environment setup |
| `MOBILE_DEVELOPMENT.md` | Capacitor iOS/Android setup |
| `license-summary.txt` | npm dependency license summary |

---

## Testing — `docs/testing/`

| File | Purpose |
|------|---------|
| `TESTING_STRATEGY.md` | Testing philosophy, Playwright config, tiers |
| `E2E_TEST_PLAYBOOK.md` | E2E execution guide, test matrix |
| `TEST_RESULTS.md` | Historical test results and session records |

---

## Archive — `docs/archive/`

Historical reference only — do not use for decisions.

| Folder | Contents |
|--------|----------|
| `brand-forza-dark/` | Old Forza dark design direction (superseded by Kit Light) |
| `stale-product-plans/` | PIPELINE.md, 12_MONTH_ROADMAP (archived) |
| `stale-launch-docs/` | DRY_RUN_PREP, APP_STORE_ASSESSMENT, BUG_TRACKER (archived May 2026) |
| `completed-sprint-plans/` | Five completed superpowers sprint plans |

---

Last Updated: **2026-06-26**
