# Claude Code — Project Instructions

## Project Overview

**ForzaKit / Forza Fantasy League** — EPL fantasy football web + native mobile app.

- **Web app**: React 19 + Vite + Tailwind CSS 4 + Supabase, deployed on Vercel
- **Mobile**: Capacitor iOS + Android (both native projects live in `ios/` and `android/`)
- **Backend**: Supabase (PostgreSQL + Auth + Edge Functions + Realtime)
- **AI platforms**: Claude Code (web/backend) + Google Antigravity (mobile)

---

## Multi-AI Collaboration Protocol

**Two AI platforms share this repo — never simultaneously.**

| Platform | Scope | Branch convention |
|----------|-------|-------------------|
| Claude Code | Web app, backend, infrastructure | `claude/<slug>` |
| Google Antigravity | Mobile — Capacitor iOS/Android | `antigravity/<slug>` |

**Rules**:
- Start every session from clean `main`: `git pull origin main && git status`
- Never commit directly to `main` — always use a feature branch + PR
- Never leave uncommitted changes when handing off between platforms
- Each platform's local files are gitignored (`.claude/worktrees/`, `.antigravity/`, `.gemini/`)

### Claude Code Worktree Note

Claude creates worktrees under `.claude/worktrees/` — ephemeral and gitignored. The `extensions.worktreeConfig` git setting is intentionally **not set**: its presence breaks Google Antigravity's embedded git library. Claude worktrees work fine without it.

---

## Repository Structure

```
forza-fantasy-league/
├── src/
│   ├── screens/          # Route-level views (11 screens)
│   ├── components/       # Shared UI components
│   ├── hooks/            # Custom React hooks
│   ├── lib/              # supabase.js, capacitor.js, utilities
│   ├── context/          # AuthContext
│   └── data/             # Static fallback data (squad, players)
├── supabase/
│   ├── functions/        # Deployed Edge Functions (Deno)
│   └── migrations/       # SQL migrations — numbered sequence (01–08)
├── ios/                  # Capacitor Xcode project
├── android/              # Capacitor Android Studio project
├── e2e/                  # Playwright E2E tests (82/84 passing)
├── backend/              # Legacy Supabase Edge Functions (Deno)
├── docs/                 # Technical documentation
├── API/                  # Forza Football API reference materials
├── Product Pitch/        # Business pitch HTML assets
└── .github/workflows/    # CI/CD (lint → build → E2E)
```

---

## Key Reference Documents

| File | Purpose |
|------|---------|
| `BACKLOG.md` | Open issues and priorities — **update after every session** |
| `PIPELINE.md` | Product roadmap and sprint plan |
| `APP_STORE_ASSESSMENT.md` | Mobile strategy, architecture decision, store submission guide |
| `MOBILE_IMPLEMENTATION_GUIDE.md` | Capacitor implementation guide (Antigravity's working doc) |
| `GEMINI.md` | Instructions for Google Antigravity |
| `DRAFT_SYSTEM_DESIGN.md` | Draft lottery and transfer window system design |
| `FANTASY_POINTS_SCORING_LAYER.md` | Scoring system design and DB schema |
| `SQUAD_SCREEN_IMPROVEMENT_PLAN.md` | Squad screen UX plan |
| `FORZA_API_ASSESSMENT.md` | Forza Football API integration assessment |
| `API/API_INTEGRATION_REFERENCE.md` | API endpoints, auth, data shapes |

---

## Key Commands

```bash
npm run dev              # Dev server (http://localhost:5173)
npm run build            # Production build → dist/
npm run lint             # ESLint (CI-enforced)
npx playwright test      # E2E tests — 82/84 passing
npm run build && npx cap sync   # Build + sync to native projects
npx cap open ios         # Open Xcode
npx cap open android     # Open Android Studio
```

---

## Supabase Migrations

Always create a new file — never modify existing migrations.

| # | File | Content |
|---|------|---------|
| 01 | `01_*.sql` | Initial schema |
| 02 | `02_draft_system.sql` | Draft submissions, allocations |
| 03 | `03_draft_lottery_cron.sql` | Cron for draft lottery |
| 04 | `04_transfer_window_enforcement.sql` | Window triggers |
| 05 | `05_trade_listings.sql` | Trade listings table |
| 06 | `06_cup_pool_management.sql` | Cup pool + active clubs |
| 07 | `07_relaxation_formula.sql` | No-repeat relaxation |
| 08 | `08_reverse_draft_cron.sql` | Reverse-standings draft cron |

**Next migration**: `09_`

---

## Capacitor — Mobile Workflow

```bash
# After any web app change you want reflected in the native apps:
npm run build
npx cap sync

# To run on device/simulator:
npx cap open ios      # then Build + Run in Xcode
npx cap open android  # then Run in Android Studio
```

App ID: `com.fantasykit.forzaedition` (changeable until first store submission)  
iOS deployment target: 15.0 · Android minSdk: 26 (Android 8.0) · targetSdk: 36

`src/lib/capacitor.js` — all native plugin init (status bar, splash, app resume). Import `isNative` and `platform` from here for platform-detection anywhere in the app.

---

## Development Guidelines

- **E2E**: 82/84 tests must stay green — run `npx playwright test` before merging
- **Mobile-first**: All UI tested at 375px viewport minimum
- **RLS**: Never bypass Supabase Row Level Security
- **Secrets**: Never commit `.env`; use `.env.example` as template
- **ESLint**: Enforced in CI — `supabase/functions/` excluded (Deno)
- **No `--no-verify`**: Never skip git hooks
