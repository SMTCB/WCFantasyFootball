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

---

## Architecture

```
forza-fantasy-league/
├── src/                    # React web app (Vite)
│   ├── components/         # UI components
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Supabase client, utilities
│   └── pages/              # Route-level components
├── backend/                # Supabase Edge Functions
├── supabase/               # Migrations, seed data, config
├── e2e/                    # Playwright E2E tests
├── docs/                   # Technical documentation
├── ios/                    # Capacitor iOS project (when added)
├── android/                # Capacitor Android project (when added)
├── .github/workflows/      # CI/CD pipelines
└── public/                 # Static assets
```

---

## Key Commands

```bash
npm run dev           # Start dev server
npm run build         # Production build
npm run test          # Run unit tests
npx playwright test   # Run E2E tests (82/84 passing)
npx cap sync          # Sync web build to native (after Capacitor added)
npx cap open ios      # Open Xcode
npx cap open android  # Open Android Studio
```

---

## Important Files

| File | Purpose |
|------|---------|
| `APP_STORE_ASSESSMENT.md` | Full mobile strategy & implementation plan |
| `BACKLOG.md` | Current issues, priorities, known bugs |
| `PIPELINE.md` | Development pipeline and status |
| `GEMINI.md` | Instructions for Google Antigravity |
| `docs/APP_DYNAMICS.md` | App dynamics documentation |

---

## Development Guidelines

- **No CLAUDE.md workarounds**: Do not use `--no-verify` or bypass hooks
- **Tests must pass**: 82/84 E2E tests must remain green; do not break existing tests
- **Mobile-first UI**: All components tested at 375px viewport minimum
- **Supabase RLS**: Never bypass Row Level Security in queries
- **Secrets**: Never commit `.env` files; use `.env.example` as template
- **Branch discipline**: Always create feature branches; never commit directly to `main`

---

## Claude Code Worktree Behaviour

Claude Code creates worktrees under `.claude/worktrees/`. These are ephemeral and gitignored. The `extensions.worktreeConfig` git setting is intentionally **not set** (its presence breaks Google Antigravity's git library — see forum issue). Claude worktrees function correctly without it.
