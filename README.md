# FrontRow — Multi-Sport Fantasy & P2P Betting Platform

Fantasy sports platform with P2P wagering, covering football, F1, and tennis.  
Web, iOS, and Android apps powered by React 19, Supabase, and Capacitor.

**Stack**: React 19 · Vite 8 · Tailwind CSS 4 · Supabase · Capacitor 6

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

## Platform Architecture

```
Sports (Football · F1 · Tennis)
         │
         ▼
  SportDataAdapter          ← provider-agnostic seam (Forza / Ergast / ATP)
         │
         ▼
  Shared DB Layer           ← circles · sport_type · trophy_ledger
         │
    ┌────┴────┐
    ▼         ▼
 Fantasy     P2P Betting    ← coin economy · escrow · peer-to-peer markets
 Scoring     (league bets · match props · outright markets)
    │
    ▼
 Gazette / Clubhouse / Forza Times   ← social layer, per-circle newspaper
```

### Key Modules

| Module | Location | Purpose |
|--------|----------|---------|
| **Football** | `src/screens/Squad*, Market*, League*` | Draft + classic fantasy, matchday scoring |
| **F1** | `supabase/functions/f1-*` | Constructor + driver fantasy, race scoring |
| **Tennis** | `supabase/functions/tennis-*` | ATP/WTA match-by-match fantasy |
| **P2P Betting** | `supabase/functions/p2p-*` | Peer-to-peer wagering on any sport |
| **Clubhouse** | `src/components/Clubhouse*` | Per-league social hub + Forza Times AI newspaper |
| **Circles** | `supabase/migrations/187_*` | Multi-sport league abstraction layer |

### Rebrand Guide

The design system uses CSS tokens only — no hardcoded colours in components.  
To rebrand, update two variables in `src/index.css`:

```css
:root {
  --accent:  #1A6FA8;   /* primary brand colour (buttons, links, active state) */
  --bg:      #F7F3ED;   /* page background */
}
```

All 109 token references update automatically. No component edits needed.

**Full token map** (`src/index.css` `:root` block):

| Token | Default | Role |
|-------|---------|------|
| `--bg` | `#F7F3ED` | Page background (cream) |
| `--card` | `#FFFFFF` | Card surface |
| `--elev` | `#EDEAE2` | Elevated / secondary surface |
| `--shell` | `#18202E` | Nav shell, sticky headers |
| `--rule` | `#E2DDD5` | Dividers and borders |
| `--paper` | `#18202E` | Body text |
| `--mute` | `#8A97A8` | Secondary / muted text |
| `--accent` | `#1A6FA8` | Primary brand colour |
| `--gold` | `#B8720E` | Premium / highlight |
| `--positive` | `#166534` | Positive / success |
| `--warn` | `#B8720E` | Warning |
| `--danger` | `#B91C1C` | Error / destructive |

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
iOS target: 15.0 · Android minSdk: 26 (Android 8.0)

---

## Key Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server |
| `npm run build` | Production build (Rolldown — checks for TDZ) |
| `npm run lint` | ESLint (0 errors, 0 warnings) |
| `npx playwright test` | CI spec: `platform.spec.js` (36 tests × 2 browsers) |
| `npx cap sync` | Sync web build → native |
| `npx supabase functions deploy <fn> --project-ref sssmvihxtqtohisghjet` | Deploy Edge Function |

---

## Source Layout

```
src/
├── screens/       # Route-level views (Squad, Market, League, Live, Draft…)
├── components/    # Shared UI — Clubhouse, Gazette, League views
├── hooks/         # Custom React hooks (useLeague, useSquad, useClubhouse…)
├── lib/           # Supabase client, Capacitor init, SportDataAdapter
├── context/       # AuthContext
└── data/          # Static fallback data

supabase/
├── functions/     # Edge Functions (Deno) — scoring, transfers, P2P, F1, tennis
└── migrations/    # SQL migrations (append-only, numbered; next: 208_ on v2 / 192_ on main)

ios/               # Xcode project (Capacitor)
android/           # Android Studio project (Capacitor)
e2e/               # Playwright E2E — platform.spec.js runs in CI
docs/              # Architecture, API, brand, deployment docs
```

---

## CI/CD

GitHub Actions on every push to `main`:
- ESLint → Vite build → Playwright E2E (Chromium + mobile-chrome)

> **Edge Functions are NOT auto-deployed by Vercel** — after any PR touching `supabase/functions/`, manually deploy each changed function with the command above.

---

## Key Docs

| File | Purpose |
|------|---------|
| `CLAUDE.md` | AI development instructions + full architecture reference |
| `BACKLOG.md` | Session progress, open issues, pilot bug log |
| `docs/architecture/SALE_READY_PROJECT_PLAN.md` | v2 platform roadmap (P2P · F1 · Tennis · Redesign) |
| `docs/deployment/DATA_PIPELINE_RUNBOOK.md` | Step-by-step fixture activation and scoring setup |
| `docs/architecture/FANTASY_POINTS_SCORING_LAYER.md` | Scoring rules and calculation engine |
| `docs/brand/BRANDING.md` | Brand identity, colour palette, typography |
| `GEMINI.md` | Instructions for Google Antigravity (mobile AI) |
