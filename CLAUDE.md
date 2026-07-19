# Claude Code — Project Instructions

⚠️ **NOTE TO USER**: This document is instructions FOR Claude Code (the AI). You should NOT need to run any git commands, terminal commands, or technical operations. Claude handles all of that automatically. Your role is to describe what you want built, and Claude manages the development workflow, testing, git operations, and deployment.

---

## 🚨 TWO-BRANCH FREEZE — READ BEFORE EVERY SESSION

**This repo runs two branches simultaneously. Read this before touching git.**

| Branch | Purpose | Deploy to Vercel? | Merge to main? |
|--------|---------|-------------------|----------------|
| `main` | Live football pilot (~50 users) | ✅ Auto on merge | N/A |
| `v2` | Platform redesign + new features (P2P, multi-sport, Kit Light UI) | ❌ Never | ❌ NOT until pilot ends (~July 2026) and all Phase 3B pre-merge checks pass |

**Rules Claude MUST follow — no exceptions:**

1. **Pilot bug fixes go on `main` only.** Branch from `main` → fix → PR → merge → done.
2. **v2 feature work goes on `v2` only.** Branch from `v2` (not main) → feature → PR into `v2` → merge.
3. **NEVER merge `v2` into `main` directly.** The v2 branch contains an incomplete redesign, new DB migrations not yet applied to production, and feature flags for unreleased products. Merging it now would break the live app for real users. This merge only happens at Week 12 per [SALE_READY_PROJECT_PLAN.md](docs/architecture/SALE_READY_PROJECT_PLAN.md).
4. **GitHub branch protection on `main` is enabled.** Direct `git push origin main` is blocked. All changes require a PR — this is the hardware backup in case the above rules are forgotten.
5. **When in doubt about which branch:** check `git branch` and this table. If the task is a pilot bug fix → `main`. If it's part of the redesign or v2 features → `v2`. If unclear, ask before branching.
6. **🛑 If the session type is not stated, ASK before touching git.** The user works on two laptops and may open a session without specifying. Do not assume. Ask: "Is this a pilot bug fix (main) or platform revision (v2) session?" Do not run a single git command until the answer is confirmed. This rule overrides the Session Start Checklist below.

**What `v2` contains today (2026-06-26):**
- Multi-sport platform: P2P coin betting, F1 module, Tennis module, Clubhouse social layer — all shipped (Phases 0–2 done)
- UX redesign (Kit Light) complete across all screens
- Phase 3B in progress — code-quality hardening done (PRs #638–#645); **DB migrations 209–211 + 5 Edge Function deploys + 2 secrets/env vars are written but NOT applied to production** — see the approval-gated table below
- Full status: [SALE_READY_PROJECT_PLAN.md](docs/architecture/SALE_READY_PROJECT_PLAN.md)

**🛑 NO SQL / MIGRATIONS / EDGE FUNCTION DEPLOYS WITHOUT EXPLICIT APPROVAL — every session, either PC**

`v2`'s pending Supabase actions (3 migrations, 5 function deploys, 2 secrets) all write to the **one shared production project** (`sssmvihxtqtohisghjet`) that also serves the live `main` pilot. Full list + risk notes: [SALE_READY_PROJECT_PLAN.md § PENDING DB & DEPLOY ACTIONS](docs/architecture/SALE_READY_PROJECT_PLAN.md).

Rule for Claude on both machines: never run any item from that table — or any other untracked migration/`db query --linked`/`functions deploy` call — without first naming the exact action in chat and getting an explicit "yes, run it" from the user **for that specific item**, in the current session. Approval does not carry across sessions or across items.

**🔒 BRANCH PROTECTION ACTIVE** — Multiple safeguards prevent accidental v2→main merge:
- ✅ Git pre-push hook (blocks direct pushes to main; prompts on v2)
- ✅ GitHub branch protection rule (requires PR review, CI green, up-to-date)
- ✅ Edge Functions not auto-deployed (manual deploy required)
- ✅ Migrations manual-only (workflow_dispatch, not automatic)
- **See [V2_BRANCH_PROTECTION.md](docs/architecture/V2_BRANCH_PROTECTION.md) for full details.**

---

## 🚀 Quick Navigation — Start Here

**First time in this project?** Use these guides in order:

| Resource | Purpose | Link |
|----------|---------|------|
| **📋 DOCS_MAP** | Complete index of all documentation | [DOCS_MAP.md](DOCS_MAP.md) — Read this first to understand what docs exist |
| **⚙️ Architecture Overview** | How the app is built (tech stack, components, systems) | See [Technical Stack & Architecture](#technical-stack--architecture) below |
| **🌳 Repository Structure** | File organization and folder layout | See [Repository Structure](#repository-structure) below |
| **📖 Ways of Working** | How Claude Code and you collaborate | See [Ways of Working](#ways-of-working) below |
| **📊 Current Progress** | What's done, what's in progress | [BACKLOG.md](BACKLOG.md) + [Notion BACKLOG](https://www.notion.so/361fe9c7e4c2803c9fc7c898a0c4bbac) |

---

## 🛡️ Pilot Safeguards — READ BEFORE EVERY DB OPERATION

**Context**: This is a single-environment setup (no dev/staging/prod split). The live database IS the pilot database. There is no Point-in-Time Recovery. A bad migration or destructive query cannot be auto-rolled back. Protect user data above all else.

### Rules Claude MUST follow — no exceptions

**1. Backup before every migration**

Before applying any `.sql` migration file to the live DB, always dump a backup first:
```bash
npx supabase db dump --linked > backups/pre_migration_$(date +%Y%m%d_%H%M%S).sql
```
The `backups/` folder is gitignored. If the dump fails, stop and tell the user before proceeding.

**2. SELECT before any UPDATE or DELETE**

Never run a bulk `UPDATE` or `DELETE` without first running the equivalent `SELECT` and showing the user which rows will be affected. Wait for explicit confirmation before executing the write.

```sql
-- Always do this first:
SELECT id, <relevant columns> FROM table WHERE <condition>;
-- Then, only after user confirms: run the UPDATE/DELETE
```

**3. Never DROP without explicit user confirmation**

`DROP TABLE`, `DROP COLUMN`, `DROP FUNCTION` — always pause, describe exactly what will be lost, and wait for the user to say "yes, do it" before executing.

**4. No test data mixed with pilot data**

All test leagues and test users must be clearly labelled (name prefix `TEST_`) or removed before the pilot launches. Never seed fake data into tables that real pilot users share (e.g. `players`, `fixtures`, `leagues`) without confirming first.

**5. Migrations are append-only**

Never modify an already-applied migration file. Always create a new numbered file. This is non-negotiable — editing applied migrations breaks the audit trail and can corrupt the schema state.

---

## 📋 BACKLOG IS SINGLE SOURCE OF TRUTH

**Critical governance rule:** [BACKLOG.md](BACKLOG.md) is the **authoritative** document for:
- ✅ Completed features and session progress
- 🚀 ALL open issues, bugs, and improvements (prioritized by tier: P0/P1/P2/P3)
- ⏱️ Effort estimates and phase allocation for each item
- 📊 Session notes and decision history

**If it's not in BACKLOG.md, it doesn't exist.** All task assignment, prioritization, and planning flows from this single document.

**Tier reference** (from BACKLOG.md):
| Tier | When | Examples |
|------|------|----------|
| **P0 — BLOCKER** | Fix before launch | RLS spoofing, concurrent races, data corruption |
| **P1 — HIGH** | Phase 2a (weeks 1-4 post-launch) | API timeouts, RLS enablement, observability |
| **P2 — MEDIUM** | Phase 2b (weeks 5-12 post-launch) | Performance improvements, deferred logic, betting features |
| **P3 — LOW** | Phase 3+ (3+ months) | Polish, refactoring, documentation |

See BACKLOG.md for the complete prioritized list with effort estimates and implementation guidance.

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

### The Two Rules (non-negotiable)

1. **Never commit directly to `main`** — always feature branch → PR → merge
2. **Delete branches immediately after merging** — stale branches accumulate fast

`main` auto-deploys to Vercel. Everything that lands on main ships live.

> ⚠️ **Edge Functions are NOT auto-deployed.** Vercel only builds the React frontend. Any change to a file under `supabase/functions/` must be manually deployed:
> ```bash
> npx supabase functions deploy <function-name> --project-ref sssmvihxtqtohisghjet
> ```
> Always run this immediately after merging a PR that touches `supabase/functions/`. The code is in git but production still runs the old binary until you do.

### Session Pattern

```bash
# 1. Start clean
git pull origin main

# 2. Create feature branch (do this FIRST, before any changes)
git checkout -b claude/description-of-work

# 3. Develop, commit, push
git add <files>
git commit -m "feat/fix/chore: description"
git push origin claude/description-of-work

# 4. Create PR (via gh CLI)
gh pr create --title "..." --body "..."

# 5. Merge PR
gh pr merge <number> --squash --delete-branch

# 6. Pull merged commit, clean up local branch
git checkout main
git pull origin main
git branch -D claude/description-of-work

# 7. Deploy Edge Functions if any supabase/functions/ file changed
#    (Vercel auto-deploys only the React frontend — functions need a manual push)
npx supabase functions deploy <function-name> --project-ref sssmvihxtqtohisghjet
```

Steps 5 and 6 must happen **every time**. Unmerged PRs = app doesn't update on Vercel. Undeleted branches = repo accumulates junk.

### GitHub API Fallback (when `gh` CLI is not installed)

`gh` CLI is **not installed** on this machine. Always use the Python urllib pattern below instead of `gh pr create` / `gh pr merge`. The token is embedded in the git remote URL — retrieve it with `git remote get-url origin`.

```python
python3 -c "
import urllib.request, json
token = '<PAT>'  # retrieve with: git remote get-url origin | grep -oP '(?<=https://).*(?=@)'
repo  = 'SMTCB/WCFantasyFootball'
branch = 'claude/your-branch-name'

# 1. Create PR
data = json.dumps({'title': 'your title', 'head': branch, 'base': 'main', 'body': 'description'}).encode()
req = urllib.request.Request(f'https://api.github.com/repos/{repo}/pulls', data=data,
  headers={'Authorization': f'Bearer {token}', 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json'})
with urllib.request.urlopen(req) as r:
    n = json.loads(r.read())['number']; print('PR #', n)

# 2. Merge (squash)
data = json.dumps({'merge_method': 'squash', 'commit_title': f'your title (#{n})'}).encode()
req = urllib.request.Request(f'https://api.github.com/repos/{repo}/pulls/{n}/merge', data=data, method='PUT',
  headers={'Authorization': f'Bearer {token}', 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json'})
with urllib.request.urlopen(req) as r: print('Merged:', json.loads(r.read()).get('merged'))

# 3. Delete remote branch
req = urllib.request.Request(f'https://api.github.com/repos/{repo}/git/refs/heads/{branch}',
  method='DELETE', headers={'Authorization': f'Bearer {token}', 'Accept': 'application/vnd.github+json'})
urllib.request.urlopen(req); print('Branch deleted')
"
```

Then clean up locally:
```bash
git checkout main
git pull origin main
git branch -D claude/your-branch-name
```

### Commit Message Format

- `feat: description` — new feature
- `fix: description` — bug fix
- `chore: description` — maintenance (docs, gitignore, cleanup)
- `#XXX: description` — when referencing a BACKLOG item number

### Branch Health — Run Periodically

Stale branches pile up fast. When the branch list gets messy, run:

```bash
# Delete all local branches already merged into main
git branch --merged origin/main | grep "claude/" | xargs git branch -d

# Delete local branches that were squash-merged (not caught above)
git branch | grep "claude/" | grep -v "active-branch-name" | xargs git branch -D

# Delete stale remote branches
git branch -r | grep "origin/claude/" | grep -v "active" | sed 's|origin/||' | xargs -I{} git push origin --delete {}

# Prune stale remote-tracking refs
git remote prune origin
```

### If Branch is Behind Main (after someone else merged)

```bash
git fetch origin
git rebase origin/main
git push --force-with-lease origin claude/your-branch
```

### Worktrees (Claude Code creates these automatically)

Claude Code creates worktrees under `.claude/worktrees/` — these are gitignored and ephemeral. After a session ends, run `git worktree prune` to clean dead refs. Active worktrees are listed with `git worktree list`.

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
│   │   ├── RecapScreen.jsx                # MY DIGEST: cross-league activity feed (gazette_entries all types + own transfers, 7 days)
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
│       ├── DRY_RUN_PREP_CHECKLIST.md      # Pre-launch verification checklist
│       ├── ADDING_A_NEW_TOURNAMENT.md     # New tournament cookbook (registration → live squads)
│       └── SERVICE_KEY_ROTATION_RUNBOOK.md # API key rotation procedure
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
│   ├── GEMINI.md                          # Instructions for Google Antigravity (mobile AI)
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
| `docs/reference/MOBILE_DEVELOPMENT.md` | Capacitor setup & native plugin docs |

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
| `ADDING_A_NEW_TOURNAMENT.md` | **New tournament cookbook** — step-by-step from Forza registration to live squads; includes friendly/test tournament pattern, squad setup, and 6-point dry run checklist |

**Special Docs:**
| File | Purpose |
|------|---------|
| `GEMINI.md` | Instructions for Google Antigravity (mobile AI) |
| `docs/testing/TEST_RESULTS.md` | Latest test results & coverage |

---

## Key Commands

```bash
npm run dev              # Dev server (http://localhost:5173)
npm run build            # Production build → dist/
npm run lint             # ESLint (CI-enforced)
npx playwright test      # CI spec only: platform.spec.js (36 tests × 2 browsers, ~3 min)
                         # Full suite (all 9 specs, requires live DB): npx playwright test e2e/
npm run build && npx cap sync   # Build + sync to native projects
npx cap open ios         # Open Xcode
npx cap open android     # Open Android Studio
```

---

## Supabase Direct DB Access

**Always use `npx supabase db query --linked` for any DB inspection or one-off data fix.**

This runs as the DB owner (bypasses RLS) and works without Docker or a DB password.

```bash
# Read query
npx supabase db query --linked "SELECT * FROM players WHERE tournament_id = '426' LIMIT 5;"

# Write query (UPDATE, INSERT, DELETE — bypasses RLS)
npx supabase db query --linked "UPDATE players SET price = 5.0 WHERE tournament_id = '426' AND price IS NULL;"

# Check cron jobs
npx supabase db query --linked "SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;"

# Multi-statement (use semicolons; last SELECT is returned)
npx supabase db query --linked "UPDATE players SET price = ROUND((RANDOM()*2+4)::NUMERIC,1) WHERE price IS NULL; SELECT COUNT(*) FROM players WHERE price IS NOT NULL;"
```

**When to use this vs other approaches:**
- `npx supabase db query --linked` — ✅ always works for reads AND writes; use this first
- Supabase JS client with anon key — ❌ blocked by RLS for most writes; only use for read-only checks
- Supabase dashboard SQL editor — fallback if CLI is not linked (run `npx supabase link --project-ref sssmvihxtqtohisghjet` first)
- `supabase functions deploy` — only for deploying Edge Functions, not DB queries

**If the CLI isn't linked yet** (new machine / fresh clone):
```bash
npx supabase login                                          # opens browser auth
npx supabase link --project-ref sssmvihxtqtohisghjet       # links to this project
```

**Project ref**: `sssmvihxtqtohisghjet`  
**Supabase dashboard**: https://supabase.com/dashboard/project/sssmvihxtqtohisghjet

---

## Supabase Migrations

Current migration count and full session-by-session pipeline facts have been moved to **[docs/architecture/MIGRATION_LOG.md](docs/architecture/MIGRATION_LOG.md)** to keep this file lean — read it when a task needs historical context on a specific migration, cron job, RLS policy, or past bug fix. Rules that still apply here, always:

- Always create a new numbered migration file — never modify an already-applied one (append-only, non-negotiable — see [Pilot Safeguards](#-pilot-safeguards--read-before-every-db-operation)).
- Check [MIGRATION_LOG.md](docs/architecture/MIGRATION_LOG.md) (or `ls supabase/migrations/` for the true source of truth) for the next free migration number before creating one.
- For current in-flight migration/deploy status, check [TRACKER.md](docs/platform_revision/TRACKER.md) (v2 sessions) or [BACKLOG.md](BACKLOG.md) (main sessions) — those are the live status docs, not this file.

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
- **Testing**: Playwright (E2E browser automation — `platform.spec.js` runs in CI; 8 other integration specs run manually against live DB)
- **Git Workflow**: Feature branches (`claude/*`) → PR → merge → delete → main stays stable

### Vercel CLI Access (set up 2026-06-01)

Claude has full Vercel CLI access — authenticated as `smtcb`, project linked to `wc-fantasy-football`.

```bash
vercel env ls                        # list env vars
vercel env add NAME environment      # add env var (pipe value via stdin)
vercel env rm NAME environment --yes # remove env var
vercel deploy --prod                 # trigger production redeploy
vercel logs wc-fantasy-football.vercel.app  # runtime logs
vercel list                          # recent deployments + status
vercel inspect wc-fantasy-football.vercel.app  # deployment details
```

**Current production env vars** (as of 2026-06-01):
| Variable | Environments | Purpose |
|----------|-------------|---------|
| `VITE_AUTH_ENABLED` | Production only | Must be `"true"` — enables real Supabase Auth (default is demo mode) |
| `VITE_SUPABASE_ANON_KEY` | All | Supabase client anon key |
| `VITE_SUPABASE_URL` | All | Supabase project URL |

**Rules:**
- Only `VITE_`-prefixed vars are bundled into the client JS — never add secrets with `VITE_` prefix
- Vercel does NOT auto-redeploy on env var changes — always run `vercel deploy --prod` after changing a var
- `SUPABASE_SERVICE_ROLE_KEY` belongs in Supabase Edge Functions only, not in Vercel (removed 2026-06-01)

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
- **E2E Tests**: `platform.spec.js` (36 tests × 2 browsers) in CI; 8 additional integration specs run manually against live Supabase data

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
- **E2E Coverage**: `platform.spec.js` (36 UI tests) green in CI. Integration specs (draft, scoring, bets) run manually — they query live production data and are not suitable for automated CI.
- **Capacitor Sync**: Native projects not yet built for store submission

---

## Session Start Checklist

**CLAUDE CODE: Do this automatically every session. User should NOT run any of these commands — that's Claude's job.**

### Step 0 — Determine session type (MANDATORY, do this before anything else)

**This project runs on two branches simultaneously. The user works on two laptops. A session opening without a stated type is common — do not guess.**

Read the user's opening message. Look for explicit signals:
- **"bug fix"**, **"pilot"**, **"production"**, **"main"**, or a specific user-reported issue → `main` session
- **"v2"**, **"platform"**, **"roadmap"**, **"P2P"**, **"F1"**, **"redesign"**, **"SALE_READY"** → `v2` session

**If no signal is present: ask before touching git.** Use this exact question:

> "Before I start — is this a **pilot bug fix** (goes to production on `main`) or a **platform revision** session (v2 branch, not deployed)?"

Do not run a single `git` command, do not read `BACKLOG.md`, do not create a branch, until the session type is confirmed.

---

### Path A — Pilot bug fix session (`main`)

*Use when: fixing something broken for the ~50 live pilot users. Changes go to production.*

1. **Orient yourself:**
   - This file (CLAUDE.md) ✓
   - [BACKLOG.md](BACKLOG.md) — pilot bug backlog

2. **Sync and branch from `main`:**
   ```bash
   git checkout main
   git pull origin main
   git status  # must be clean
   git checkout -b claude/your-fix-description
   ```

3. **Develop, commit, push, PR, merge** per [Git Workflow](#git-workflow--version-control) rules.
   PR base: `main`. After merge, Vercel auto-deploys.

4. **Test before pushing:**
   ```bash
   npm run lint
   npx playwright test
   ```

5. **After merge:** update [BACKLOG.md](BACKLOG.md) and move Notion card to Done.

6. **⚠️ Do NOT touch `v2` branch during a `main` session**, even if you notice something related to v2 work. Note it and handle in a separate v2 session.

---

### Path B — Platform revision session (`v2`)

*Use when: building the sale-ready platform (P2P betting, F1/tennis modules, UX redesign). Changes are NOT deployed until Week 12.*

1. **Orient yourself:**
   - This file (CLAUDE.md) ✓
   - [SALE_READY_PROJECT_PLAN.md](docs/architecture/SALE_READY_PROJECT_PLAN.md) — read Quick Status table and last session notes
   - Check `git log --oneline -10` on `v2` to confirm current state

2. **Sync `v2` with latest pilot fixes from `main`:**
   ```bash
   git checkout v2
   git pull origin v2
   git fetch origin main
   git merge origin/main
   # resolve any conflicts (rare — main touches football files, v2 adds new ones)
   git push origin v2
   ```

3. **Create a feature branch from `v2`:**
   ```bash
   git checkout -b claude/v2-your-feature-description
   # NOTE: branch name starts with claude/v2- to make it visually distinct
   ```

4. **Develop, commit, push, PR into `v2`** (NOT into `main`).
   PR base must be `v2`. Verify this before creating the PR.

5. **Test before pushing:**
   ```bash
   npm run lint
   npx playwright test  # platform.spec.js must stay green
   npm run build        # Rolldown TDZ check — must produce zero errors
   ```

6. **After merge:** update `SALE_READY_PROJECT_PLAN.md` Quick Status and session notes. Update memory.

7. **🚫 NEVER open a PR from a v2 feature branch into `main`.** If you catch yourself about to do this, stop and tell the user.

---

### Common to both paths

- **Before any DB migration** — save a backup of affected rows first (Docker unavailable, so `SELECT` the rows and save to `backups/*.json`; see [Pilot Safeguards](#️-pilot-safeguards--read-before-every-db-operation))
- **Dev server:** `npm run dev` → http://localhost:5173
- **Edge Functions are NOT auto-deployed by Vercel** — after any PR touching `supabase/functions/`, manually deploy each changed function

---

## 📂 Root-Level Files Reference

**Project critical** (read first):
- `CLAUDE.md` ← You are here (project instructions)
- `DOCS_MAP.md` ← Documentation index (read after this file)
- `BACKLOG.md` ← Session progress & completed work
- `README.md` ← Project overview
- `PIPELINE.md` ← Roadmap & strategy

**Reference docs**:
- `docs/testing/TEST_RESULTS.md` — Test results & coverage (historical)
- `CODE_REVIEW_REPORT.md` — Recent code quality assessment
- `APP_STORE_ASSESSMENT.md` — Mobile launch readiness
- `docs/reference/MOBILE_DEVELOPMENT.md` — Capacitor setup & native plugins
- `CLEANUP_REPORT.md` — Git/docs organization audit
- `GEMINI.md` — Google Antigravity mobile AI instructions

**Archived/Stale** (reference only, don't use for decisions):
- `GIT_AND_CODE_WALKTHROUGH.md` — Superseded by CLAUDE.md and DOCS_MAP.md

**Configuration** (build tools — don't edit):
- `package.json`, `package-lock.json` — Dependencies
- `vite.config.js` — Web bundler
- `eslint.config.js` — Code linting
- `playwright.config.js` — E2E tests
- `capacitor.config.ts` — Native app configuration
- `vercel.json` — Deployment settings
- `.env.example` — Environment template
- `index.html` — Entry point

---

## Development Guidelines

### ⚠️ Vite v8 / Rolldown — TDZ Rule (read before touching any import)

This project uses **Vite v8**, which switched from Rollup to **Rolldown** (Rust bundler). Rolldown is stricter about module evaluation order. A known crash pattern has occurred **three times** in this codebase:

> **`ReferenceError: Cannot access 'X' before initialization`** on a screen — triggered whenever the same module is imported both **directly** by a screen and **transitively** through one of its children.

**How it happens:**
```
LeagueScreen → HubShared              ← direct import (depth 1)
LeagueScreen → CommissionerPanel → BetCreatorPanel → HubShared  ← same module at depth 3
```
Rolldown sees the same module at two depths and can emit it in an order that puts it in TDZ when the screen first runs. Rollup (Vite v6/v7) was lenient about this; Rolldown is not.

**The rule — check BEFORE adding any new import:**
1. If you add an `import X from './SomeModule'` to a **child component** of LeagueScreen (or any other large screen), first `grep` whether `LeagueScreen.jsx` already imports that module.
2. If it does → **do NOT add the import to the child**. Instead: inline the value, pass it as a prop, or restructure so the module is only imported at one depth.
3. Run `npm run build` and verify the bundle builds cleanly. A TDZ crash only surfaces in **production** (minified), not dev mode.

**Past occurrences:**
| Crash | Module | Fix |
|---|---|---|
| 1 | `useTransfer` — called inside `useAutoFill` + by `SquadScreen` | Pass `buy` as prop instead |
| 2 | `BetCreatorPanel` — imported by `LeagueScreen` dead-code AND `CommissionerPanel` | Removed dead-code import from `LeagueScreen` |
| 3 | `HubShared` — imported by `LeagueScreen` (69×) AND `CommissionerPanel→BetCreatorPanel` | Inlined `MONO`/`DISPLAY` as local constants in `BetCreatorPanel` |

**Quick check command** (run before merging any PR that adds imports to league components):
```bash
npx madge --circular src/
# and manually check: does the new import's module already appear in LeagueScreen.jsx?
grep -n "^import" src/screens/LeagueScreen.jsx
```

---

- **E2E**: `platform.spec.js` must stay green — CI runs it automatically on every PR (36 tests × 2 browsers, ~3 min). Integration specs (draft/scoring/bets) run manually: `npx playwright test e2e/<spec>.spec.js`
- **Mobile-first**: All UI tested at 375px viewport minimum (use DevTools device emulation)
- **RLS**: Never bypass Supabase Row Level Security — always filter by `auth.uid()`
- **Secrets**: Never commit `.env.local` or credentials — use `.env.example` as template
- **ESLint**: Enforced in CI — `supabase/functions/` excluded (Deno uses different rules)
- **No `--no-verify`**: Never skip git hooks — they catch errors early
- **Atomic Commits**: One logical change per commit, with clear message describing why (not just what)
- **Responsive Design**: Use Tailwind breakpoints, test on mobile/tablet/desktop
- **Database Migrations**: Always create new numbered files, never modify existing ones — and always dump a backup before applying (see Pilot Safeguards)
- **Destructive queries**: SELECT first, show affected rows, wait for confirmation before running UPDATE/DELETE/DROP (see Pilot Safeguards)
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

---

## Documentation Structure Standards

**Every new documentation file must follow these standards for consistency and discoverability.**

### Documentation Categories & Locations

| Category | Location | Purpose | File Examples |
|----------|----------|---------|----------------|
| **Architecture** | `docs/architecture/` | System design, data flow, algorithms | DRAFT_SYSTEM_DESIGN.md, FANTASY_POINTS_SCORING_LAYER.md |
| **API** | `docs/api/` | External integrations, endpoints, auth | FORZA_API_ASSESSMENT.md, API_INTEGRATION_REFERENCE.md |
| **Brand** | `docs/brand/` | Design system, visual identity, tokens | BRANDING.md, FORZAKIT-UI-Overhaul.md, tokens.css |
| **Deployment** | `docs/deployment/` | DevOps, infrastructure, launch checklists | DATA_PIPELINE_RUNBOOK.md, DRY_RUN_PREP_CHECKLIST.md |
| **Testing** | `docs/testing/` | Test strategy, frameworks, coverage | TESTING_STRATEGY.md, E2E_TEST_PLAYBOOK.md |
| **Product** | `docs/product/` | Roadmap, strategy, timeline | PIPELINE.md, 12_MONTH_ROADMAP_2026_2027.md |
| **Reference** | `docs/reference/` | Developer setup, conventions, lookup | LOCAL_DEVELOPMENT.md, CONVENTIONS.md |
| **Archive** | `docs/archive/` | Stale, intermediate, or reference work | Audit files, old strategic docs |

### Standard File Structure

**Every documentation file should follow this structure:**

```markdown
# Document Title

**One-line summary of purpose and audience.**

---

## Quick Navigation (Optional)

Use this if the document has multiple sections or audiences:
- **For X**: Links to sections 1, 2, 3
- **For Y**: Links to sections A, B, C

---

## Context / Overview

Brief explanation of what this document covers, why it matters, and key assumptions.

---

## Main Content

Organized in clear sections with:
- Headings that are self-documenting
- Tables for reference data (not paragraph form)
- Code blocks for examples
- Links to related documents

---

## Related Documents

- [Related Doc 1](path/to/doc.md) — Brief description
- [Related Doc 2](path/to/doc.md) — Brief description

---

Last Updated: **YYYY-MM-DD**
```

### Specific Category Templates

#### 🏗️ Architecture Docs
- **Format**: System overview → Design decisions → Data schemas → Diagrams (if applicable)
- **Length**: 1000–3000 words
- **Update Frequency**: When architecture changes
- **Example**: `FANTASY_POINTS_SCORING_LAYER.md`

```markdown
# Feature Name — System Design

**Complete specification and design for [feature].**

---

## Overview
[What is this system? Why does it exist?]

---

## Core Components
[Key parts, data structures, algorithms]

---

## Design Decisions
[Why this approach? What were the alternatives?]

---

## Database Schema
[Tables, constraints, indexes if applicable]

---

## Integration Points
[How it connects to other systems]

---

## Related Documents
[Links to related architecture docs]

Last Updated: YYYY-MM-DD
```

#### 🎯 Product Docs
- **Format**: Index/overview → Roadmap/timeline → Details
- **Length**: 500–2000 words
- **Update Frequency**: After each release or roadmap change
- **Example**: `PIPELINE.md`

#### 🧪 Testing Docs
- **Format**: Overview → Framework/tools → Test organization → How to run → Examples
- **Length**: 1000–3000 words
- **Update Frequency**: When testing strategy changes
- **Example**: `TESTING_STRATEGY.md`

#### 📚 Reference Docs
- **Format**: Quick start → Detailed sections → Troubleshooting → Tips
- **Length**: 1000–4000 words (comprehensive reference)
- **Update Frequency**: When setup or conventions change
- **Example**: `LOCAL_DEVELOPMENT.md`, `CONVENTIONS.md`

### File Naming Conventions

| Pattern | Usage | Examples |
|---------|-------|----------|
| `{FEATURE}_{TYPE}.md` | Architecture/design | `DRAFT_SYSTEM_DESIGN.md`, `FANTASY_POINTS_SCORING_LAYER.md` |
| `{NAME}_OVERVIEW.md` or `README.md` | Category index/intro | `docs/testing/README.md` |
| `{ACTION}_{SUBJECT}.md` | How-to / guide | `LOCAL_DEVELOPMENT.md`, `DATA_PIPELINE_RUNBOOK.md` |
| `{TOPIC}_STRATEGY.md` | Strategy/approach | `TESTING_STRATEGY.md`, `OBSERVABILITY_STRATEGY.md` |
| `{CHECKLIST_TITLE}.md` | Pre-launch/verification | `DRY_RUN_PREP_CHECKLIST.md` |

### Maintenance Rules

**Every documentation file MUST:**
1. ✅ Have a "Last Updated" date at the bottom
2. ✅ Link to related documents (avoid orphaned docs)
3. ✅ Be indexed in [DOCS_MAP.md](DOCS_MAP.md) (if top-level or category-defining)
4. ✅ Use clear headings and short sections (max 500 words per section)
5. ✅ Avoid duplication (reference instead of copy)
6. ✅ Be kept current (update within 1 week of code changes affecting it)

**Never:**
- ❌ Create new files in root without adding to DOCS_MAP.md
- ❌ Duplicate content across multiple files (use links instead)
- ❌ Keep stale files in active folders (move to `docs/archive/`)
- ❌ Leave "Last Updated" dates older than the current sprint
- ❌ Add docs without considering where they belong in the category system

### How to Add a New Document

1. **Identify the category** — Which folder does this belong in?
   - If unsure, check [DOCS_MAP.md](DOCS_MAP.md) and BACKLOG.md for guidance

2. **Choose a filename** — Follow naming conventions above
   - Example: `docs/testing/LOAD_TESTING_GUIDE.md`

3. **Use the standard structure** — Follow the template above
   - Title + summary
   - Quick navigation (if needed)
   - Clear sections
   - Related documents
   - Last Updated date

4. **Update DOCS_MAP.md** — Add entry to the appropriate section
   - Table entry in the category section
   - One-line description in the file tree

5. **Commit with a clear message**:
   ```
   docs(category): add new document title
   ```
   Example:
   ```
   docs(testing): add load testing guide and stress test procedures
   ```

### When to Archive vs Update

**Archive a document** (move to `docs/archive/`) if:
- It documents a system that was replaced
- It's an audit or intermediate analysis file (snapshot in time)
- It's a template from a previous session
- It has not been updated in 3+ months and is not actively referenced

**Update a document** if:
- The feature/system it describes changed
- Code snippets are no longer accurate
- New sections needed based on recent work
- The timestamp is older than current sprint

### Cross-Referencing Best Practices

**Always use relative links** for docs in the same repo:
```markdown
[BACKLOG.md](../BACKLOG.md)           # From docs/testing/
[CONVENTIONS.md](CONVENTIONS.md)       # From docs/reference/
[BRANDING.md](../brand/BRANDING.md)   # From docs/testing/
```

**Link by category**, not just file names:
```markdown
❌ Bad: See TESTING_STRATEGY.md
✅ Good: See [Testing Strategy](../testing/TESTING_STRATEGY.md) for framework details
```

### Examples in the Codebase

These files follow the standards above and can serve as templates:
- [docs/testing/TESTING_STRATEGY.md](docs/testing/TESTING_STRATEGY.md) — Comprehensive strategy doc
- [docs/reference/LOCAL_DEVELOPMENT.md](docs/reference/LOCAL_DEVELOPMENT.md) — Detailed how-to guide
- [docs/reference/CONVENTIONS.md](docs/reference/CONVENTIONS.md) — Reference doc with tables and examples
- [docs/product/README.md](docs/product/README.md) — Category index with quick navigation
