# ForzaKit — Fantasy League Platform

EPL fantasy football web app with iOS and Android native apps via Capacitor.

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

App ID: `com.fantasykit.forzaedition`

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

| File | Purpose |
|------|---------|
| `BACKLOG.md` | Open issues and priorities |
| `PIPELINE.md` | Product roadmap and sprint plan |
| `APP_STORE_ASSESSMENT.md` | Mobile strategy and store submission guide |
| `MOBILE_IMPLEMENTATION_GUIDE.md` | Capacitor implementation guide (for Antigravity) |
| `DRAFT_SYSTEM_DESIGN.md` | Draft lottery and transfer window design |
| `FANTASY_POINTS_SCORING_LAYER.md` | Scoring system and DB schema |
| `CLAUDE.md` | Instructions for Claude Code |
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
