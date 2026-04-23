# Google Antigravity — Project Instructions

## Project Overview

**Forza Fantasy League** — EPL fantasy football app.

- **Web app**: React + Vite + Tailwind CSS 4 + Supabase (production-ready, 97.6% E2E coverage)
- **Your scope**: iOS and Android mobile apps via **Capacitor** (hybrid wrapper)
- **Other AI platform**: Claude Code handles web app and backend; do not modify `src/` or `supabase/` without coordination
- **Implementation guide**: `MOBILE_IMPLEMENTATION_GUIDE.md` (read this first)

---

## Multi-AI Collaboration Protocol

**Two AI coding platforms share this repository — never simultaneously.**

| Platform | Scope | Branch Convention |
|----------|-------|-------------------|
| Claude Code | Web app, backend, infrastructure | `claude/<slug>` |
| Google Antigravity (you) | Mobile — Capacitor iOS/Android | `antigravity/<slug>` |

**Rules before starting any session**:
1. Run `git status` — must be clean (no uncommitted changes)
2. Run `git pull origin main` — always start from latest `main`
3. Create a new branch: `git checkout -b antigravity/<feature-name>`
4. After finishing, open a PR to `main` and do not leave uncommitted work

---

## Architecture

```
forza-fantasy-league/
├── src/                    # React web app — Claude's domain (coordinate before editing)
├── backend/                # Supabase Edge Functions — Claude's domain
├── supabase/               # DB migrations — Claude's domain
├── ios/                    # Capacitor iOS project — YOUR domain
├── android/                # Capacitor Android project — YOUR domain
├── capacitor.config.ts     # Capacitor configuration — YOUR domain
├── e2e/                    # Playwright E2E tests
├── docs/                   # Technical documentation
├── .github/workflows/      # CI/CD (coordinate with Claude for new workflows)
└── public/                 # Static assets
```

---

## Key Commands

```bash
npm install               # Install dependencies
npm run build             # Build web app (required before cap sync)
npx cap sync              # Sync web build → native projects
npx cap open ios          # Open Xcode
npx cap open android      # Open Android Studio
npx cap run ios           # Run on iOS simulator
npx cap run android       # Run on Android emulator
```

---

## Important Files

| File | Purpose |
|------|---------|
| `MOBILE_IMPLEMENTATION_GUIDE.md` | **Start here** — full Antigravity implementation guide |
| `APP_STORE_ASSESSMENT.md` | Architecture decisions, cost, timeline, risk assessment |
| `BACKLOG.md` | Current known issues |
| `CLAUDE.md` | Claude Code's instructions (context for what Claude handles) |

---

## Development Guidelines

- **Never commit secrets**: `.env` files are gitignored; use `.env.example` as reference
- **Build before syncing**: Always `npm run build` before `npx cap sync`
- **Test on real devices**: Emulators are not sufficient for App Store submission
- **Preserve web app behaviour**: Capacitor wraps the existing React app — do not modify `src/` without coordinating with the web team
- **Branch discipline**: Feature branches only; PRs to `main`
