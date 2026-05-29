# Forza Fantasy League — Competition Platform

Elite fantasy football platform with web, iOS, and Android apps via Capacitor.  
Support for EPL, World Cup, Champions League, and other major football competitions.

**Stack**: React 19 · Vite · Tailwind CSS 4 · Supabase · Capacitor

---

## Quick Start

```bash
npm install
npm run dev          # http://localhost:5173
```

Auth is off by default (demo mode). To enable:
```bash
# .env.local
VITE_AUTH_ENABLED=true
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

---

## Mobile (iOS / Android)

Capacitor wraps the React app. After any web change:

```bash
npm run build
npx cap sync
npx cap open ios      # Xcode
npx cap open android  # Android Studio
```

App ID: `com.forza.fantasyleague`

### App Icons

Generate app icons for both platforms from the base tactical icon SVG:

```bash
npm install  # installs sharp for image processing
npm run icons:generate
```

This creates optimized icons in:
- `ios/App/App/Assets.xcassets/AppIcon.appiconset/` (17 sizes)
- `android/app/src/main/res/mipmap-*/` (6 densities)

---

## Key Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npx playwright test` | E2E tests (82/84 passing) |
| `npx cap sync` | Sync web build → native |

---

## Project Docs

**Start here:**
| File | Purpose |
|------|---------|
| `docs/APP_DYNAMICS.md` | Application features, matchday cycle, UI flows — for users & onboarding |
| `docs/PIPELINE.md` | Backend architecture, Edge Functions, DB schema — for developers |

**Reference:**
| File | Purpose |
|------|---------|
| `DATA_PIPELINE_RUNBOOK.md` | Step-by-step guide to activating fixtures, players, and scoring for any tournament |
| `DRAFT_SYSTEM_DESIGN.md` | Draft lottery and transfer window mechanics |
| `FANTASY_POINTS_SCORING_LAYER.md` | Scoring rules and calculation engine |
| `BACKLOG.md` | Open issues and technical debt |
| `docs/reference/MOBILE_DEVELOPMENT.md` | Capacitor setup for iOS/Android |
| `CLAUDE.md` | Instructions for Claude development |
| `GEMINI.md` | Instructions for Google Antigravity |
| `API/` | Forza Football API reference |

---

## Architecture

```
src/
├── screens/       # Route-level views (Home, Squad, Market, League, Live…)
├── components/    # Shared UI components
├── hooks/         # Custom React hooks
├── lib/           # Supabase client, Capacitor init, utilities
├── context/       # AuthContext
└── data/          # Static fallback data

supabase/
├── functions/     # Edge Functions (Deno) — scoring, transfers, draft lottery
└── migrations/    # SQL migrations (numbered 01–08, next is 09_)

ios/               # Xcode project (Capacitor)
android/           # Android Studio project (Capacitor)
e2e/               # Playwright E2E tests
```

---

## CI/CD

GitHub Actions on every push to `main`:
- ESLint → Vite build → Playwright E2E (Chromium + mobile-chrome)
- Supabase migrations via `migrate.yml` (manual, with dry-run gate)
