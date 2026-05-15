# Claude Code — Project Instructions

⚠️ **NOTE TO USER**: This document is instructions FOR Claude Code (the AI). You should NOT need to run any git commands, terminal commands, or technical operations. Claude handles all of that automatically. Your role is to describe what you want built, and Claude manages the development workflow, testing, git operations, and deployment.

---

## Ways of Working

### Your Role (Non-Technical User)
✅ **What you do:**
- Describe features you want: "Add user authentication" or "Fix the squad screen layout"
- Review Notion BACKLOG board to see what's open
- Provide direction and priorities: "Do the notifications system next"
- Answer clarification questions when Claude needs them
- Test the live app at https://wc-fantasy-football.vercel.app and report issues

❌ **What you DON'T do:**
- Run git commands (`git pull`, `git push`, `git checkout`, etc.)
- Run terminal commands (`npm install`, `npm run build`, etc.)
- Open code editors or modify code files directly
- Handle database migrations or schema changes manually
- Deploy or manage infrastructure

### Claude's Role (All Technical Operations)
✅ **What Claude does:**
- Read your requirements and translate them to tasks
- Pull latest code from main branch
- Create feature branches automatically
- Write and test code
- Run test suites (E2E, ESLint, build verification)
- Commit changes with clear messages
- Create pull requests on GitHub
- Merge PRs when ready
- Update Notion BACKLOG cards
- Handle all git operations (you never type git commands)

**Result**: You stay focused on product decisions. Claude handles all the technical execution.

---

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

**📖 For non-technical overview: see [GIT_AND_CODE_WALKTHROUGH.md](GIT_AND_CODE_WALKTHROUGH.md)**

### 🚨 CRITICAL RULE: NEVER COMMIT DIRECTLY TO `main`

**Violations cause:**
- GitHub error emails (branch protection failures)
- CI/CD pipeline failures
- Deployment issues
- Confusion about what commits should be merged vs. directly pushed

**The rule is absolute.** Every single change — even small doc updates — must go through a feature branch + PR + review + merge. No exceptions.

### Branch Strategy (Solo Developer Pre-Launch)

**Branch Model**: Simple feature-branch model
- **`main`** — production-ready code, auto-deployed to Vercel, always stable
  - Only receives commits via PR merges from feature branches
  - Never accepts direct commits or force pushes
  - Always deployable; every commit works
- **`claude/<kebab-case-description>`** — feature branches for each session
  - Created fresh from `main` at session start
  - Deleted immediately after PR merge
  - Example: `claude/fix-squad-formation-bug`, `claude/implement-league-chat`

### Session Workflow (Step-by-Step)

**Step 1: Start Session**
```bash
git pull origin main                          # Fetch latest from remote
git status                                    # Verify clean working tree
```
**Expected output:** `nothing to commit, working tree clean` and `Your branch is up to date with 'origin/main'`

**Step 2: Create Feature Branch (Before Any Changes)**
```bash
git checkout -b claude/your-feature-slug     # e.g. claude/fix-chat-lag
```
**Do this FIRST.** Never make changes on `main`.

**Step 3: During Development**
- Work normally; commit frequently with atomic, well-described messages
- Run tests before pushing: `npx playwright test`
- Keep commits focused (one logical change per commit)

**Step 4: Before Pushing**
```bash
npm run lint                 # Must pass (enforced in CI)
npx playwright test          # Should stay green
```

**Step 5: Push to Remote**
```bash
git push origin claude/your-feature-slug     # Pushes branch to GitHub
```

**Step 6: Create PR on GitHub**
- Go to the GitHub PR link from the push output
- Fill in title (concise, e.g. "Implement chat unread badge")
- Fill in description (what changed, why)
- Ensure CI checks pass (auto-run on PR)

**Step 7: Merge PR**
- Click "Merge pull request" on GitHub (prefer "Squash and merge" for cleaner history)
- Confirm the merge
- **Delete the branch** on GitHub (button appears after merge)

**Step 8: Clean Up Local Branch**
```bash
git checkout main                             # Switch back to main
git pull origin main                          # Pull the merged commit
git branch -D claude/your-feature-slug        # Delete local feature branch
```

### Commit Message Format

Follow this convention for consistency:
- **Features**: `#XXX: Description` (e.g., `#027: Implement League Chat Backend`)
- **Fixes**: `Fix: Description` (e.g., `Fix: Remove unused playerId param`)
- **Docs**: `Update BACKLOG: ...` or `docs: ...`
- **Refactoring**: `Refactor: Description`

Each commit should be **atomic**: one logical change, no mixing features.

### Important Rules

- ✅ **Always create a feature branch FIRST** — before making any changes
- ✅ **Never commit to `main` directly** — always via PR
- ✅ **Delete branches after merging** — keeps repo clean
- ✅ **Pull before starting each session** — stay up to date
- ✅ **Run tests before pushing** — catch issues early
- ✅ **Never use `--no-verify`** — git hooks exist to help
- ✅ **Keep `main` always deployable** — every commit on main should work

### Troubleshooting: What Went Wrong

**"I committed to `main` by mistake!"**
```bash
git reset --soft HEAD~1            # Undo the commit, keep changes staged
git checkout -b claude/fix-branch  # Create proper feature branch
git push origin claude/fix-branch  # Push feature branch
# Then create PR on GitHub
```

**"I'm on `main` but haven't committed yet"**
```bash
git status                                    # Confirm which branch you're on
git checkout -b claude/your-feature-slug     # Create feature branch
# Now make your changes and commit
```

**"Branch is behind `main`"**
```bash
git rebase main                    # Rebase feature branch onto latest main
git push --force-with-lease origin claude/your-feature-slug
```

**"Feature branch exists but worktree is on `main`"**
```bash
git checkout claude/existing-branch           # Switch worktree to correct branch
git rebase main                    # Ensure up to date
git stash pop                      # Restore any stashed changes
```

### 🔴 CRITICAL: Merge to Main for Every Feature or Bug Fix

**This is the step that makes your live app on Vercel update.**

Every time Claude completes a feature or bug fix:
1. A PR is created
2. GitHub tests pass automatically
3. **PR is merged to `main`** ← THIS IS REQUIRED
4. Vercel auto-deploys (30–60 seconds)
5. Your live app updates

**Without step 3 (merge to main), your code stays in a feature branch and NEVER reaches your live app.**

If you notice your Vercel app isn't updated with the latest fixes, the most common cause is a pending PR that hasn't been merged to `main` yet. Always check: are there open PRs waiting to merge?

---

## Repository Structure

### Complete Directory Tree

```
forza-fantasy-league/
│
├── 📦 src/                                  # React application source (client-side)
│   ├── screens/                            # Route-level page components (11 screens)
│   │   ├── ScoresScreen.jsx               # Home: match fixtures & live scores
│   │   ├── SquadScreen.jsx                # User's squad builder & formation
│   │   ├── LeagueScreen.jsx               # League standings & chat interface
│   │   ├── LiveScreen.jsx                 # Live match updates & Joker chip
│   │   ├── MarketScreen.jsx               # Transfer market player search
│   │   ├── LeagueCreationWizard.jsx       # Multi-step league creation flow
│   │   ├── LoginScreen.jsx                # Authentication entry point
│   │   ├── OnboardingScreen.jsx           # First-time user setup
│   │   ├── SettingsScreen.jsx             # User preferences & profile
│   │   ├── ChipSelectorModal.jsx          # Chip selection UI overlay
│   │   └── NotFoundScreen.jsx             # 404 error page
│   │
│   ├── components/                         # Reusable UI components
│   │   ├── AppLayout.jsx                  # Main shell: nav, header, footer
│   │   ├── OnboardingWizard.jsx           # 4-step full-screen overlay
│   │   ├── BrandMark.jsx                  # Logo & branding component
│   │   ├── NavIcons.jsx                   # Tactical icons for navigation
│   │   ├── AvailabilityBadge.jsx          # Player availability flag UI
│   │   ├── GazetteDraftReport.jsx         # Draft results publication card
│   │   ├── LeagueSelector.jsx             # League dropdown picker
│   │   ├── LeagueInviteCard.jsx           # Invite code display & sharing
│   │   ├── PlayerCard.jsx                 # Squad card with stats/actions
│   │   ├── PowerToolCard.jsx              # Chip & tool action buttons
│   │   ├── ChipCard.jsx                   # Chip selection card (Joker, etc)
│   │   ├── FormationDisplay.jsx           # Visual 11-player formation
│   │   ├── H2HSheet.jsx                   # Head-to-head matchup details
│   │   ├── LiveJokerCard.jsx              # Active Joker multiplier display
│   │   ├── ScoringBreakdown.jsx           # Points calculation details
│   │   └── ChatMessage*.jsx               # League chat components
│   │
│   ├── hooks/                              # Custom React hooks (state + logic)
│   │   ├── useAuth.js                     # Supabase auth state management
│   │   ├── useSquad.js                    # Squad fetching & management
│   │   ├── useTransfer.js                 # Transfer logic & validation
│   │   ├── useLeague.js                   # League & standings queries
│   │   ├── useOnboarding.js               # Onboarding flow state
│   │   ├── useAvailabilityFlag.js         # Player availability flag toggle
│   │   ├── useChatMessages.js             # League chat real-time subscriptions
│   │   ├── useChipSelection.js            # Chip selection state
│   │   ├── useFormationValidator.js       # 11-player formation rules
│   │   └── useLiveScores.js               # Live match data polling
│   │
│   ├── lib/                                # Utilities & client config
│   │   ├── supabase.js                    # Supabase client initialization
│   │   ├── capacitor.js                   # Native plugin setup & helpers
│   │   ├── utils.js                       # General utilities (formatters, etc)
│   │   └── api.js                         # API client & Forza Football integration
│   │
│   ├── context/                            # React Context providers
│   │   └── AuthContext.jsx                # Global auth state (user, session)
│   │
│   ├── data/                               # Fallback data (demo/testing)
│   │   ├── players.json                   # Dummy player list
│   │   ├── squads.json                    # Demo squad data
│   │   └── fixtures.json                  # Sample match fixtures
│   │
│   ├── App.jsx                            # Router setup & provider wrapping
│   ├── index.css                          # Global styles (Tailwind imports)
│   └── main.jsx                           # Entry point (Vite)
│
├── 🗄️ supabase/                            # Backend infrastructure
│   ├── migrations/                        # SQL migration files (numbered sequence)
│   │   ├── 01_initial_schema.sql          # Core tables: users, squads, leagues
│   │   ├── 02_draft_system.sql            # Draft submissions & allocations
│   │   ├── 03_draft_lottery_cron.sql      # Cron job for draft lottery
│   │   ├── 04_transfer_window_enforcement.sql  # Transfer deadline triggers
│   │   ├── 05_trade_listings.sql          # Player trade requests
│   │   ├── 06_cup_pool_management.sql     # Cup tournament structure
│   │   ├── 07_relaxation_formula.sql      # No-repeat relaxation rules
│   │   ├── 08_reverse_draft_cron.sql      # Reverse-order draft automation
│   │   ├── 09_scoring_schema.sql          # Points calculation tables
│   │   ├── 13_scoring_schema_align.sql    # Match stats scoring columns
│   │   ├── 14_fixtures_pl_clubs.sql       # Real Premier League fixtures
│   │   ├── 15_player_status_pl_alerts.sql # Player injury/availability alerts
│   │   └── 16_*.sql                       # (Next migration to create)
│   │
│   └── functions/                         # Deployed Edge Functions (Deno)
│       ├── calculate-scores/              # Compute weekly fantasy points
│       ├── process-transfer/              # Handle squad transfers & budgeting
│       ├── process-trade/                 # League-wide trade approval logic
│       ├── update-player-status/          # Sync injury/suspension from API
│       └── handle-chat-notifications/     # Real-time chat notifications
│
├── 📄 public/                              # Static assets (served by Vite)
│   ├── ffl-brandmark.svg                  # Logo (Editorial Brandmark)
│   ├── nav-icons/                         # Tactical nav icons
│   │   ├── scores.svg
│   │   ├── squad.svg
│   │   ├── league.svg
│   │   ├── live.svg
│   │   └── market.svg
│   └── favicon.ico
│
├── 📚 docs/                                # Documentation (organized by topic)
│   ├── architecture/                      # System design & technical foundation
│   │   ├── DRAFT_SYSTEM_DESIGN.md         # Draft lottery rules & algorithm
│   │   ├── FANTASY_POINTS_SCORING_LAYER.md   # Scoring formula, DB schema
│   │   ├── APP_DYNAMICS.md                # Live-match updates, Realtime subscriptions
│   │   └── FORMATION_RULES.md             # 11-player pitch validation rules
│   │
│   ├── api/                               # External integrations & API reference
│   │   ├── FORZA_API_ASSESSMENT.md        # Forza Football API endpoints & gaps
│   │   ├── API_INTEGRATION_REFERENCE.md   # How we consume the API
│   │   ├── FIT_GAP_ANALYSIS.md            # Missing endpoints & workarounds
│   │   └── FORZA_API_KNOWLEDGE.md         # API authentication & rate limits
│   │
│   ├── brand/                             # Visual identity & design
│   │   ├── BRANDING.md                    # Color palette, typography, spacing
│   │   ├── FORZAKIT-UI-Overhaul.md        # UI redesign specs & components
│   │   ├── FORZAKIT-Pitch-Fixes.md        # Formation display fixes
│   │   ├── tokens.css                     # CSS design tokens (--gold, --ink, etc)
│   │   └── brand_guidelines/              # Brand asset folder
│   │
│   └── deployment/                        # Launch & DevOps
│       ├── DATA_PIPELINE_RUNBOOK.md       # Supabase cron & data activation steps
│       └── DRY_RUN_PREP_CHECKLIST.md      # Pre-launch verification checklist
│
├── 📱 ios/                                 # Capacitor iOS native project
│   ├── App/                               # Xcode project files
│   ├── Podfile                            # CocoaPods dependencies
│   └── (Xcode workspace)
│
├── 📱 android/                             # Capacitor Android native project
│   ├── app/                               # Android Studio project
│   ├── build.gradle                       # Gradle build config
│   └── (Android Studio workspace)
│
├── 🧪 e2e/                                 # Playwright end-to-end tests
│   ├── tests/                             # Test suites
│   │   ├── auth.spec.js                  # Login/signup flows
│   │   ├── squad.spec.js                 # Squad building & formation
│   │   ├── transfer.spec.js               # Player trades & transfers
│   │   ├── league.spec.js                 # League creation & management
│   │   ├── chat.spec.js                   # League chat messaging
│   │   └── live.spec.js                   # Live match & Joker chip
│   │
│   ├── playwright.config.js               # Test runner configuration
│   └── (test reports in e2e-report/)
│
├── .github/
│   └── workflows/                         # CI/CD automation
│       ├── ci.yml                         # Web build + lint + E2E test pipeline
│       └── mobile-build.yml               # iOS & Android CI builds
│
├── 🔧 .claude/                             # Claude Code session data (GITIGNORED)
│   ├── worktrees/                         # Ephemeral session worktrees
│   │   └── (e.g., elegant-burnell-aeccac/)
│   └── (other Claude internal files)
│
├── 🌐 Root-level Config Files
│   ├── package.json                       # Dependencies & npm scripts
│   ├── package-lock.json                  # Lock file (commited)
│   ├── vite.config.js                     # Vite bundler config
│   ├── tailwind.config.js                 # Tailwind CSS configuration
│   ├── eslint.config.js                   # ESLint rules (flat config v9)
│   ├── playwright.config.js               # E2E test runner config
│   ├── .gitignore                         # Git exclusions
│   ├── .env.example                       # Environment template (copy to .env.local)
│   └── capacitor.config.ts                # Capacitor native app config
│
├── 📋 Root-level Documentation
│   ├── README.md                          # Project overview & quick-start
│   ├── BACKLOG.md                         # Open issues, priorities, session notes
│   │                                      # **UPDATE WEEKLY with progress**
│   ├── PIPELINE.md                        # Product roadmap, sprint plan, timeline
│   ├── APP_STORE_ASSESSMENT.md            # Mobile store strategy & launch readiness
│   ├── MOBILE_IMPLEMENTATION_GUIDE.md     # Capacitor setup & native plugin docs
│   ├── GEMINI.md                          # Instructions for Google Antigravity (mobile AI)
│   ├── E2E_TEST_REPORT.md                 # Latest test results & coverage
│   └── CLAUDE.md                          # THIS FILE — session onboarding & reference
│
├── 📦 Build & Dist (GITIGNORED)
│   ├── dist/                              # Production build output
│   ├── node_modules/                      # npm dependencies
│   ├── e2e-report/                        # Playwright test report
│   └── .env.local                         # Local environment secrets
│
└── 🚀 Deployment
    └── Vercel                             # Auto-deployed from main branch
        └── https://wc-fantasy-football.vercel.app
```

### Key Points on Organization

**`src/` Structure:**
- **screens/** — Each file is one full-screen route view. 11 total screens cover all major flows.
- **components/** — Reusable UI building blocks. If a component appears in 2+ screens, it belongs here.
- **hooks/** — Business logic extracted from components. Each hook is a single responsibility (auth, squad data, etc).
- **lib/** — Singleton clients: Supabase config, Capacitor init, utility functions.
- **context/** — Global state that multiple screens share (e.g., authenticated user).

**`supabase/` Structure:**
- **migrations/** — Never modify existing; always create new numbered files. Current schema is at migration 15.
- **functions/** — Deployed Deno code. Triggered by webhooks, crons, or RPC calls.

**`docs/` Structure:**
- **Organized by topic**, not chronologically. Each folder is a self-contained subject.
- Markdown files stay current with code changes. Always update after architectural shifts.

**Build & Testing:**
- `dist/` — Production build output. Generated by `npm run build`. **Gitignored**.
- `node_modules/` — npm dependencies. Excluded from git; restored by `npm install`.
- `e2e-report/` — Playwright HTML test report. Gitignored but crucial for debugging failures.

**Root-level Config:**
- All config files are committed to git (except `.env.local` and `.claude/worktrees/`).
- **vite.config.js** — Build system, import aliases, dev server port.
- **tailwind.config.js** — Design tokens, spacing scale, custom utilities.
- **eslint.config.js** — Flat config (v9). Rules for React, hooks, code quality.
- **capacitor.config.ts** — Native app bundling, splash screen, app ID.

**Key Gitignore Patterns:**
```
dist/                           # Build output
node_modules/                   # Dependencies
.env.local                       # Secrets
.claude/worktrees/              # Session ephemeral data
e2e-report/                     # Test artifacts
.DS_Store                        # macOS system files
```

---

## Key Reference Documents

**Root-level (always updated):**
| File | Purpose |
|------|---------|
| `BACKLOG.md` | Session progress, completed features, post-MVP gaps — **UPDATE WEEKLY** |
| **Notion BACKLOG** | **https://www.notion.so/361fe9c7e4c2803c9fc7c898a0c4bbac** — Kanban board for task prioritization & tracking |
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

## Technical Stack & Architecture

### Frontend (Web)
- **Framework**: React 19 with JSX (functional components + hooks)
- **Build Tool**: Vite (ES modules, instant HMR, optimized production builds)
- **Styling**: Tailwind CSS 4 + inline styles for dynamic values
- **Routing**: React Router v6 (11 screens, hash-based for Capacitor compatibility)
- **Real-time**: Supabase Realtime subscriptions (PostgreSQL LISTEN/NOTIFY)
- **State Management**: React Context (AuthContext) + component-level hooks + TanStack Query patterns
- **UI Patterns**: Responsive mobile-first (375px minimum), full-height layouts with safe areas

### Backend (Supabase)
- **Database**: PostgreSQL (15+) hosted on Supabase
- **Authentication**: Supabase Auth (email/password, OAuth ready)
- **Authorization**: Row-Level Security (RLS) policies enforce data isolation per user
- **Functions**: Deno Edge Functions (deployed serverless, written in TypeScript)
- **Webhooks**: Database triggers → HTTP webhooks to functions
- **Crons**: Supabase pgcron for scheduled tasks (draft lottery, daily alerts)
- **Realtime**: PostgreSQL LISTEN/NOTIFY for live chat, score updates

### Mobile (Native)
- **Framework**: Capacitor 6 (cross-platform wrapper)
- **iOS**: Xcode 15+, deployment target 15.0, native Swift/Objective-C for plugins
- **Android**: Android Studio, minSdk 26 (Android 8.0), targetSdk 36
- **Native Plugins**: Status bar color, splash screen, app resume handling
- **Build Sync**: `npm run build && npx cap sync` copies web build → native projects

### DevOps & CI/CD
- **Hosting**: Vercel (auto-deploys from `main` branch, ~30s deployment)
- **CI Pipeline**: GitHub Actions (lint → build → E2E test)
- **Testing**: Playwright (E2E browser automation, 116 tests)
- **Git Workflow**: Feature branches (`claude/*`) → PR → merge → delete → main stays stable

---

## Current Implementation Status

### ✅ Completed Features
- **Authentication**: Login/signup with Supabase Auth, session persistence
- **Onboarding**: 4-step wizard for new users, cached to localStorage
- **Squad Building**: 11-player formation validation (1 GK, 3–5 DEF, 2–4 MID, 1–2 FWD)
- **Transfer Market**: Browse all players, filter by position/price, buy/sell
- **League Creation**: Multi-step flow with invite codes, H2H mode only
- **League Standings**: Points table, head-to-head matchup details
- **League Chat**: Real-time Realtime subscriptions, message persistence
- **Live Scores**: Fetch live match data, Joker chip multiplier selection
- **Scoring Pipeline**: Weekly points calculation from Forza Football API
- **Player Status**: Injury alerts, suspension tracking, injury history
- **Design**: Editorial Brandmark, tactical navigation icons, dark theme with gold accents
- **Mobile**: Capacitor wrapper for iOS/Android, responsive layout at 375px+
- **E2E Tests**: 116 tests covering major user flows

### 🚧 In Progress / Planned
- **Trade System**: Submit/approve player swap requests between managers
- **Cup Tournament**: Knockout competitions within leagues
- **Power Tools**: Chip modifiers (Free Hit, Triple Captain, Bench Boost)
- **Draft System**: Fantasy draft with lottery/reverse-order modes
- **Full Mobile App**: Standalone iOS/Android builds (Capacitor compiled)
- **API Data**: Real-time fixture/result data from Forza Football API
- **Push Notifications**: Native alerts for match events, friend actions
- **Offline Mode**: Draft & view squad without internet (Capacitor OfflineDB)

### 🔴 Known Issues & Debt
- **React Compiler**: 3 pre-existing memoization warnings in `useAvailabilityFlag.js` (downgraded to warnings)
- **Android Build**: Gradle/signing issues in CI (mobile builds pending local debug)
- **E2E Coverage**: 116/116 tests passing, but Joker/chip flows need edge-case coverage
- **Capacitor Sync**: Native projects not yet built for store submission

---

## Session Start Checklist

**CLAUDE CODE: Do this automatically every session. User should NOT run any of these commands — that's Claude's job.**

1. **Read this file (CLAUDE.md)** to understand the tech stack and current state
2. **Check BACKLOG.md** for session notes and completed items
3. **Review Notion BACKLOG** board for open/in-progress items:
   - Navigate to: https://www.notion.so/361fe9c7e4c2803c9fc7c898a0c4bbac
   - Check "Not started" column for priorities (HIGH priority first)
   - Move a card to "In progress" if starting work on it
4. **Sync with main** (Claude does this):
   ```bash
   git pull origin main
   git status  # Should be clean
   ```
5. **Create feature branch** (Claude does this):
   ```bash
   git checkout -b claude/your-feature-description
   ```
6. **Understand the task** by reading BACKLOG.md, Notion card, or the GitHub issue
7. **Run dev server** to test locally:
   ```bash
   npm run dev  # http://localhost:5173
   ```
8. **Develop, commit, push, PR, merge** (Claude does all git operations) per Git Workflow rules above
9. **Always test before pushing** (Claude does this automatically):
   ```bash
   npm run lint        # Must pass
   npx playwright test # Should stay green
   ```
10. **After completing work, move Notion card to "Done"** (Claude does this) and update BACKLOG.md

---

## Development Guidelines

- **E2E**: 148 tests must stay green — run `npx playwright test` before merging (CI enforces this)
- **Mobile-first**: All UI tested at 375px viewport minimum (use DevTools device emulation)
- **RLS**: Never bypass Supabase Row Level Security — always filter by `auth.uid()`
- **Secrets**: Never commit `.env.local` or credentials — use `.env.example` as template
- **ESLint**: Enforced in CI — `supabase/functions/` excluded (Deno uses different rules)
- **No `--no-verify`**: Never skip git hooks — they catch errors early
- **Atomic Commits**: One logical change per commit, with clear message describing why (not just what)
- **Responsive Design**: Use Tailwind breakpoints, test on mobile/tablet/desktop
- **Database Migrations**: Always create new numbered files, never modify existing ones
- **Comments**: Only explain WHY, not WHAT — code names should be self-documenting
- **Notion Backlog**: When bugs/gaps found during dev, immediately create a Notion card with [CATEGORY] header (see BACKLOG Management section)

## BACKLOG Management — Markdown + Notion Sync

**Two-tier system for task tracking:**

### 1. **BACKLOG.md** (Source of Truth)
- **Location**: Root project file (`BACKLOG.md`)
- **Purpose**: Primary record of completed/in-progress work, session notes, audit history
- **Update Timing**: After every major milestone or session completion
- **Key Rule**: If it's done and merged to main, it must be in BACKLOG.md

### 2. **Notion BACKLOG Database** (Open Items Board)
- **Location**: https://www.notion.so/361fe9c7e4c2803c9fc7c898a0c4bbac
- **Purpose**: Visual kanban board for prioritization, sprint planning, and real-time status tracking
- **Columns**: "Not started" | "In progress" | "Done"
- **Card Format**:
  ```
  [CATEGORY] Card Title
  
  Description
  ---
  Priority: HIGH/MEDIUM/LOW
  Effort: Xh (estimated hours)
  Status: Not started / In progress / Done
  Assigned: [optional user]
  ```
  **CATEGORY options:**
  - **[FEATURE]** — New functionality or capability
  - **[BUG]** — Defect or issue to fix
  - **[TECH DEBT]** — Refactoring, performance, infrastructure
  - **[DOCS]** — Documentation updates

#### When to Create a Notion Card

1. **New bugs discovered during development/testing**:
   - Title: `[BUG] Brief description`
   - Include: Steps to reproduce, expected vs. actual behavior, severity
   - Status: "Not started" (unless you're fixing immediately)

2. **Post-MVP backlog items** identified during feature work:
   - Title: `[FEATURE] Brief description` or `[TECH DEBT] Brief description`
   - Include: Implementation approach, effort estimate, priority
   - Status: "Not started"

3. **Ideas or gaps found during code review**:
   - Title: `[FEATURE] Description` or `[BUG] Description`
   - Include: Why it matters, acceptance criteria
   - Status: "Not started"

#### Notion Card Template

For each new backlog item, create a card in the Notion BACKLOG database with:

```
Title: [CATEGORY] Description (e.g., "[BUG] Fix auto-fill not respecting budget")

Description:
- What is the current state?
- What should happen instead?
- Why does it matter?

Implementation (if known):
- Suggested approach
- Affected files/systems
- Estimated complexity

Acceptance Criteria:
- [x] Clear, testable outcomes

Priority: HIGH / MEDIUM / LOW
Effort: Xh (estimated development time)
Type: Bug / Feature / Tech Debt / Docs
Assign: [optional Claude / team member]
```

---

## BACKLOG.md Maintenance & Audit Methodology

**Why This Matters:**
Stale BACKLOG entries cause duplicate work and wasted time. Before planning any session, verify that BACKLOG status matches actual code state.

**When to Audit:**
- Start of each new session (quick 10-minute check)
- Before planning medium/large features (ensure no duplicates exist)
- If uncertain whether a feature is done or not

**How to Audit (Quick Method):**
```bash
# Search git history for feature commits
git log --all --oneline | grep -i "#034\|#035\|Auction\|Chat"

# Search codebase for code presence
grep -r "useAuctions\|PointBoost\|opponent_block" src/ supabase/ --include="*.js" --include="*.jsx" --include="*.sql"
```

**Audit Result Classification:**
- **✅ DONE**: Found in git history (commits) AND code is present
- **❌ NOT STARTED**: No git history AND no code found
- **🔄 IN PROGRESS**: Git history exists but code not yet visible
- **⚠️ PARTIAL**: Feature partially done

**Real Example (2026-05-12):**
- #037 Auto-fill marked "NOT STARTED" → Audit found commits + code → Corrected to DONE
- #020 Notifications marked "NOT STARTED" → Audit found commit 25a9d7f → Corrected to DONE
- **Result**: 10-minute audit prevented hours of duplicate work

**Keep BACKLOG Accurate:**
- When completing feature: Update BACKLOG.md before merging PR
- When starting work: Audit first to verify not already done
- When stale entries found: Fix them immediately (one git commit)
- **Golden Rule**: If it's done and merged to main, it must be in both BACKLOG.md AND moved to "Done" in Notion

---

## Workflow: From Issue Discovery to Notion Card

**Step 1: Issue Found**
During dev/testing, you discover a bug or gap.

**Step 2: Create Notion Card**
- Go to https://www.notion.so/361fe9c7e4c2803c9fc7c898a0c4bbac
- Click "New" → fill in card with [CATEGORY] title and details
- Set status to "Not started"
- Assign priority + effort

**Step 3: If Fixing Immediately**
- Move card to "In progress"
- Create PR with prefix matching category:
  - `Fix: [description]` for [BUG]
  - `#XXX: [description]` for [FEATURE]
  - `Refactor: [description]` for [TECH DEBT]
- Update BACKLOG.md with session notes

**Step 4: After PR Merge**
- Move Notion card to "Done"
- Update BACKLOG.md to reflect completion
- Link PR/commit in card for audit trail

**Step 5: If Deferring**
- Card stays "Not started" in Notion
- Add note: "Deferred to Phase 2" or "Post-MVP"
- Reference in BACKLOG.md under appropriate section
