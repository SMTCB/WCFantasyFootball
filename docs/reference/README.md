# Reference Guides

Quick lookup and reference documentation for developers and operators.

---

## Quick Navigation

**For Developers (Setting Up)**:
1. [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) — Local environment setup, dev server, debugging

**For All Developers**:
1. [CONVENTIONS.md](CONVENTIONS.md) — Code style, naming, project conventions
2. [../architecture/](../architecture/) — System design (formation rules, scoring, drafts)
3. [../api/](../api/) — API integration (Forza Football endpoints, auth)

**For Mobile Development**:
1. [MOBILE_DEVELOPMENT.md](MOBILE_DEVELOPMENT.md) — iOS/Android Capacitor setup, native plugins, store submission

**For Operations**:
1. [../deployment/DATA_PIPELINE_RUNBOOK.md](../deployment/DATA_PIPELINE_RUNBOOK.md) — Cron setup, data activation
2. [../deployment/DRY_RUN_PREP_CHECKLIST.md](../deployment/DRY_RUN_PREP_CHECKLIST.md) — Pre-launch checklist

---

## Document Overview

| File | Purpose | Audience |
|------|---------|----------|
| [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) | Local environment setup, dev commands, debugging | Developers |
| [CONVENTIONS.md](CONVENTIONS.md) | Code style, naming conventions, project structure | Developers |
| [MOBILE_DEVELOPMENT.md](MOBILE_DEVELOPMENT.md) | iOS/Android Capacitor setup, native plugins, testing, store submission | Mobile developers |

---

## Quick Reference Sections

### Environment Setup
- **Node version**: 18+ (use `nvm` or `fnm`)
- **Package manager**: npm (or `pnpm` / `yarn`)
- **Database**: Supabase PostgreSQL
- **Frontend build**: Vite + React 19
- **Mobile**: Capacitor 6

See [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) for full setup.

### Key Commands
```bash
npm run dev              # Start dev server
npm run build            # Production build
npm run lint             # ESLint check
npx playwright test      # E2E tests
npx cap sync             # Sync to native apps
npx supabase db query --linked "SELECT ..."  # DB access
```

### File Organization
```
src/
├── screens/            # Route-level components (11 screens)
├── components/         # Reusable UI building blocks
├── hooks/              # Business logic (useAuth, useSquad, etc)
├── lib/                # Singletons (Supabase, Capacitor, utils)
└── context/            # Global state (AuthContext)

supabase/
├── migrations/         # Database schema (numbered 01–89)
└── functions/          # Edge Functions (Deno)

docs/
├── architecture/       # System design
├── api/                # External integrations
├── brand/              # Design system
├── deployment/         # DevOps & launch
├── testing/            # Test strategy
├── product/            # Roadmap & strategy
└── reference/          # ← You are here
```

See [CONVENTIONS.md](CONVENTIONS.md) for naming and style guide.

### Common Workflows

**Developing a feature**:
1. Read [BACKLOG.md](../BACKLOG.md) to understand priority + effort
2. Create feature branch: `git checkout -b claude/feature-name`
3. Develop locally: `npm run dev`
4. Test: `npm run lint && npx playwright test`
5. Commit and create PR
6. Update Notion BACKLOG card to "In Progress" → "Done"

**Adding a database migration**:
1. Create `supabase/migrations/NN_description.sql`
2. Write SQL (never modify existing migrations)
3. Test locally: `npx supabase migration up`
4. Verify with `npx supabase db query --linked`
5. Commit and merge

**Deploying to production**:
1. Merge PR to main
2. Vercel auto-deploys within 30s
3. Check https://wc-fantasy-football.vercel.app
4. Monitor logs: `.github/workflows/ci.yml`

See [../deployment/DRY_RUN_PREP_CHECKLIST.md](../deployment/DRY_RUN_PREP_CHECKLIST.md) for pre-launch verification.

---

## Tech Stack

| Layer | Tool | Status |
|-------|------|--------|
| Frontend | React 19, Vite, Tailwind 4 | ✅ Live |
| Mobile | Capacitor 6, iOS 15+, Android 8+ | 🟡 Pending store submission |
| Backend | Supabase PostgreSQL, Edge Functions | ✅ Live |
| Testing | Playwright, Vitest (planned) | ✅ Platform.spec in CI |
| Hosting | Vercel (web), TBD (mobile stores) | ✅ Web live |

---

## Related Documents

- [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) — Development environment setup
- [CONVENTIONS.md](CONVENTIONS.md) — Code style and naming
- [../CLAUDE.md](../CLAUDE.md) — Project instructions for Claude Code
- [../BACKLOG.md](../BACKLOG.md) — Current task backlog
- [../architecture/](../architecture/) — System design details

---

Last Updated: 2026-05-28
