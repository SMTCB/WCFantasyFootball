# Claude Code — Project Instructions

## Project Overview

**Forza Fantasy League** — Elite fantasy football web + native mobile app.

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

## Git Workflow & Version Control

### Branch Strategy (Solo Developer Pre-Launch)

**Branch Model**: Simple feature-branch model
- **`main`** — production-ready code, auto-deployed to Vercel, always stable
- **`claude/<kebab-case-description>`** — feature branches for each session
  - Created fresh from `main` at session start
  - Deleted immediately after PR merge
  - Example: `claude/fix-squad-formation-bug`, `claude/implement-league-chat`

### Session Workflow

**Before starting work:**
```bash
git pull origin main                          # Sync latest
git checkout -b claude/feature-description   # Create feature branch
```

**During development:**
- Commit frequently with atomic, well-described messages
- Run tests before pushing: `npx playwright test`
- Keep commits focused (one logical change per commit)

**Before merging:**
```bash
npm run lint                 # Check code quality
npx playwright test          # Run E2E tests
git push origin claude/...   # Push to remote
# Create PR on GitHub, ensure all checks pass
# Merge via GitHub (use squash for cleaner history)
git branch -D claude/...     # DELETE local branch immediately
git pull origin main         # Pull latest
```

### Commit Message Format

Follow this convention for consistency:
- **Features**: `#XXX: Description` (e.g., `#027: Implement League Chat Backend`)
- **Fixes**: `Fix: Description` (e.g., `Fix: Remove unused playerId param`)
- **Docs**: `Update BACKLOG: ...` or `docs: ...`
- **Refactoring**: `Refactor: Description`

Each commit should be **atomic**: one logical change, no mixing features.

### Important Rules

- ✅ **Always create a feature branch** — never commit directly to `main`
- ✅ **Delete branches after merging** — keeps repo clean
- ✅ **Pull before starting** — avoid merge conflicts
- ✅ **Run tests before pushing** — catch issues early
- ✅ **Never use `--no-verify`** — git hooks exist to help
- ✅ **Keep main always deployable** — every commit on main should work

---

## Repository Structure

```
forza-fantasy-league/
├── src/                              # React application source
│   ├── screens/                      # 11 route-level views
│   ├── components/                   # Reusable UI components
│   ├── hooks/                        # Custom React hooks
│   ├── lib/                          # supabase.js, capacitor.js, utils
│   ├── context/                      # AuthContext
│   └── data/                         # Fallback demo data
├── supabase/
│   ├── functions/                    # Deployed Edge Functions (Deno)
│   └── migrations/                   # SQL migrations (numbered 01–25)
├── public/                           # Static assets (SVG brandmark, icons)
├── docs/                             # Documentation (organized by topic)
│   ├── architecture/                 # System design, scoring, draft system
│   ├── api/                          # Forza Football API reference
│   ├── brand/                        # Branding guidelines, brandmark
│   ├── deployment/                   # Launch checklist, deployment runbook
│   └── APP_DYNAMICS.md               # Live-match and real-time architecture
├── ios/                              # Capacitor Xcode project
├── android/                          # Capacitor Android Studio project
├── e2e/                              # Playwright E2E tests (116 tests)
├── .github/workflows/                # CI/CD pipelines (lint → build → E2E)
├── .claude/                          # Claude Code internal (gitignored)
│   └── worktrees/                    # Ephemeral session worktrees
├── BACKLOG.md                        # Issues, priorities, progress **update weekly**
├── PIPELINE.md                       # Product roadmap & sprint plan
├── APP_STORE_ASSESSMENT.md           # Mobile store strategy
└── package.json                      # Dependencies & scripts
```

**Key Points:**
- `docs/` is organized by topic (not chronological) for easy reference
- Build outputs (`dist/`, `e2e-report/`) are gitignored
- Worktrees in `.claude/worktrees/` are ephemeral — not tracked
- `.env.local` is gitignored; use `.env.example` as template

---

## Key Reference Documents

**Root-level (always updated):**
| File | Purpose |
|------|---------|
| `BACKLOG.md` | Open issues, priorities, session notes — **UPDATE WEEKLY** |
| `PIPELINE.md` | Product roadmap, sprint plan, timeline |
| `APP_STORE_ASSESSMENT.md` | Mobile store strategy & launch readiness |
| `MOBILE_IMPLEMENTATION_GUIDE.md` | Capacitor setup & native plugin docs |

**Architecture Docs** (`docs/architecture/`):
| File | Purpose |
|------|---------|
| `DRAFT_SYSTEM_DESIGN.md` | Draft lottery & transfer window rules |
| `FANTASY_POINTS_SCORING_LAYER.md` | Scoring formula & database schema |
| `APP_DYNAMICS.md` | Live-match, real-time, Realtime subscriptions |

**API Docs** (`docs/api/`):
| File | Purpose |
|------|---------|
| `FORZA_API_ASSESSMENT.md` | Forza Football API assessment & gaps |
| `API_INTEGRATION_REFERENCE.md` | Endpoints, auth, data shapes |
| `FIT_GAP_ANALYSIS.md` | Feature coverage & missing endpoints |

**Brand Docs** (`docs/brand/`):
| File | Purpose |
|------|---------|
| `BRANDING.md` | Brand identity, colors, typography |
| `FORZAKIT-UI-Overhaul.md` | UI design overhaul notes |

**Deployment** (`docs/deployment/`):
| File | Purpose |
|------|---------|
| `DATA_PIPELINE_RUNBOOK.md` | Supabase cron setup & data activation |
| `DRY_RUN_PREP_CHECKLIST.md` | Pre-launch verification checklist |

**Special Docs:**
| File | Purpose |
|------|---------|
| `GEMINI.md` | Instructions for Google Antigravity (mobile AI) |
| `E2E_TEST_REPORT.md` | Latest test results & coverage |

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
| 09 | `09_scoring_schema.sql` | Scoring pipeline + calculate-scores Edge Function |
| 13 | `13_scoring_schema_align.sql` | player_match_stats scoring columns + unique constraints |
| 14 | `14_fixtures_pl_clubs.sql` | Replace World Cup dummy fixtures with PL clubs |
| 15 | `15_player_status_pl_alerts.sql` | Seed player status alerts for real squad |

**Next migration**: `16_`

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
