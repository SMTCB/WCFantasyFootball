# Claude Code — Project Instructions

## Project Overview

**Forza Fantasy League** — EPL fantasy football web app (React + Vite + Tailwind CSS 4 + Supabase).

- **Web app**: live on Vercel
- **Backend**: Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- **Mobile**: Capacitor-based iOS/Android apps in progress (see `APP_STORE_ASSESSMENT.md`)
- **AI platforms active**: Claude Code (primary) + Google Antigravity (mobile work)

---

## Multi-AI Collaboration Protocol

**Two AI coding platforms operate on this repository — never simultaneously.**

| Platform | Scope | Branch Convention |
|----------|-------|-------------------|
| Claude Code | Web app, backend, infrastructure | `claude/<slug>` |
| Google Antigravity | Mobile (iOS/Android Capacitor) | `antigravity/<slug>` |

**Rules**:
- Always work from `main` as base; merge PRs to `main` before switching platforms
- Do not leave uncommitted changes when handing off to the other platform
- Check `git status` is clean before starting any session
- Each platform's worktrees/temp files are gitignored (see `.gitignore`)

### Claude Code Worktree Behaviour

Claude Code creates worktrees under `.claude/worktrees/`. These are ephemeral and gitignored. The `extensions.worktreeConfig` git setting is intentionally **not set** — its presence breaks Google Antigravity's embedded git library. Claude worktrees function correctly without it.

---

## Repository Structure

```
forza-fantasy-league/
├── src/                          # React web app (Vite)
│   ├── components/               # UI components
│   ├── hooks/                    # Custom React hooks
│   ├── lib/                      # Supabase client, utilities
│   ├── context/                  # React context providers
│   ├── data/                     # Static data / constants
│   └── screens/                  # Route-level screen components
├── backend/                      # Supabase Edge Functions (Deno)
├── supabase/
│   ├── functions/                # Deployed Edge Functions
│   └── migrations/               # SQL migrations (numbered sequence)
├── e2e/                          # Playwright E2E tests
├── docs/                         # Technical documentation
│   └── APP_DYNAMICS.md
├── API/                          # Forza Football API reference
│   ├── API_INTEGRATION_REFERENCE.md
│   ├── FORZA_API_KNOWLEDGE.md
│   ├── API ACCESS DATA.txt
│   └── forza_data_api_documentation.html
├── Product Pitch/                # Business pitch materials (HTML)
├── ios/                          # Capacitor iOS project (to be added)
├── android/                      # Capacitor Android project (to be added)
├── .github/workflows/            # CI/CD pipelines
└── public/                       # Static assets
```

---

## Key Reference Documents

| File | Purpose |
|------|---------|
| `BACKLOG.md` | Current issues, priorities, known bugs — update after every session |
| `APP_STORE_ASSESSMENT.md` | Mobile strategy: architecture decision, cost, 6-week roadmap |
| `MOBILE_IMPLEMENTATION_GUIDE.md` | Antigravity's step-by-step Capacitor implementation guide |
| `GEMINI.md` | Instructions for Google Antigravity |
| `DRAFT_SYSTEM_DESIGN.md` | Draft lottery and transfer window system design |
| `FANTASY_POINTS_SCORING_LAYER.md` | Scoring system design and DB schema |
| `PRELIMINARY_SCORING_MECHANISM.md` | Early scoring mechanism specification |
| `SQUAD_SCREEN_IMPROVEMENT_PLAN.md` | Squad screen UX improvement plan |
| `E2E_TEST_REPORT.md` | E2E test coverage report (82/84 passing) |
| `PIPELINE.md` | Full development pipeline and feature status |
| `FORZA_API_ASSESSMENT.md` | Forza Football API integration assessment |
| `API/API_INTEGRATION_REFERENCE.md` | API endpoints, auth, data shapes reference |
| `docs/APP_DYNAMICS.md` | App dynamics and behaviour documentation |

---

## Key Commands

```bash
npm run dev             # Start dev server
npm run build           # Production build
npm run lint            # Run ESLint
npx playwright test     # Run E2E tests (82/84 passing as of 2026-04-24)
npx cap sync            # Sync web build to native (after Capacitor added)
npx cap open ios        # Open Xcode
npx cap open android    # Open Android Studio
```

---

## Supabase Migrations

Migrations are numbered sequentially in `supabase/migrations/`. Always create a new migration file; never modify existing ones.

Current migrations:
- `01_` — initial schema
- `02_draft_system.sql`
- `03_draft_lottery_cron.sql`
- `04_transfer_window_enforcement.sql`
- `05_trade_listings.sql`
- `06_cup_pool_management.sql`
- `07_relaxation_formula.sql`
- `08_reverse_draft_cron.sql`

Next migration should be numbered `09_`.

---

## Development Guidelines

- **Tests must pass**: 82/84 E2E tests must remain green; do not break existing tests
- **Mobile-first UI**: All components tested at 375px viewport minimum
- **Supabase RLS**: Never bypass Row Level Security in queries
- **Secrets**: Never commit `.env` files; use `.env.example` as template
- **Branch discipline**: Always create feature branches; never commit directly to `main`
- **ESLint**: CI enforces lint — run `npm run lint` before pushing; Deno functions in `supabase/functions/` are excluded from ESLint
- **No `--no-verify`**: Never skip git hooks
