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
| 16–62 | `16_forza_integration.sql` → `62_*.sql` | Forza API integration, EPL/WC setup, scoring, auctions, bets, chat |
| 63 | `63_fantasy_points_unique_constraint.sql` | UNIQUE (squad_id, matchday_id) on fantasy_points — enables correct upsert per round |
| 66 | `66_security_hardening.sql` | Sprint 0: SEC-1–7, L3.1/3.2, L1.1, DATA-1/3/11/12, I1 |
| 67 | `67_ingest_events_cron.sql` | Sprint 0: live ingest cron (every 5 min), post-match score cron (22:30 UTC) |
| 68 | `68_wc_cron_key_fix.sql` | Sprint 0: WC crons corrected to send forza_id key |
| 69 | `69_rank_trigger.sql` | Sprint 1: recompute_league_ranks() + AFTER UPDATE OF total_points trigger |
| 70 | `70_scoring_fixes.sql` | Sprint 1: aggregate_league_member_points (UUID,UUID) signature + L3.7 reward_type filter |
| 71–77 | `71_*.sql` → `77_security_polish.sql` | Sprints 1-3: observability, draft fixes, bet logic, relaxation, security hardening |
| 78 | `78_dead_code_cleanup.sql` | Sprint 4: drop `calculate_player_points` SQL function (superseded by Edge Function since migration 53) |
| 79–87 | `79_*.sql` → `87_*.sql` | Sprint 4–5: fantasy_points NUMERIC, auction FK fix, draft pool filter, RLS hardening, bet submit/resolve fixes, WC cron URL fix, score cron status fix |
| 88 | `88_wc_bug_fixes.sql` | Session 51: trade proposal duplicate guard, get_league_stats RPC, WC matchday deadlines r4–r7 |
| 89 | `89_bet_notification_trigger_fix.sql` | Session 51: notify_league_on_bet_creation → SECURITY DEFINER (was blocking all bet creation with 403) |
| 90 | `90_fix_wc_sync_crons.sql` | Session 53: fix sync-wc-fixtures-6h + sync-wc-players-6h crons (current_setting → hardcoded URL) |
| 91 | `91_fix_remaining_current_setting_crons.sql` | Session 53: fix resolve-finished-bets (failing) + ingest-match-events-live (ticking bomb) |
| 92 | `92_cron_status_rpc.sql` | Session 53: cron_job_status() RPC for admin error monitor panel |
| 93 | `93_tdd_p0_fixes.sql` | Session 55: execute_transfer_atomic() FOR UPDATE lock; squads_captain_not_joker CHECK; draft_deadline_check trigger; penalty_scored column |
| 94 | `94_pilot04_player_price_tiers.sql` | Session 55: 4-tier nation pricing for WC 2026 (Tier S £7.0 → Tier C £4.0 base + position adj) |
| 95 | `95_p1_fixes.sql` | Session 55: execute_transfer_atomic() position cap + squad size in lock; accept_trade_proposal() FOR UPDATE; drop squads_public_read policy |
| 96–96 | `96_club_cap_enforcement.sql`, `96_daily_joker_matchday.sql` | Sessions 55–57: club cap enforcement, daily joker matchday scoping |
| 97 | `97_resolve_bet_auth.sql` | Session 58: resolve_bet commissioner auth guard (AUDIT-57-01/A7) |
| 98 | `98_submit_bet_ownership.sql` | Session 58: submit_bet squad ownership check (AUDIT-57-02) |
| 99 | `99_resolve_bet_budget_rewards.sql` | Session 58: resolve_bet credits budget_remaining for budget-type bets (AUDIT-57-03) |
| 100 | `100_auction_fixes.sql` | Session 58: place_bid budget guard; resolve_auction_listing stuck-listing cancel + matchday squad fix (AUDIT-57-04/05/07) |
| 101 | `101_void_bet.sql` | Session 58: void_bet() RPC with commissioner auth guard (AUDIT-58-A5) |
| 102 | `102_transfer_window_closed_gap.sql` | Session 58: get_transfer_window_status 6h recovery window for WC leagues (AUDIT-57-11) |
| 103 | `103_gazette_policies.sql` | Session 59: INSERT policy on gazette_entries for commissioners (breaking news form) |
| 104 | `104_league_mode_and_phase.sql` | Session 61: add league_mode (classic/draft), knockout_draft_deadline, phase column on draft_submissions + draft_allocations; update UNIQUE constraints to include phase; get_club_cap() function; club-cap league_config defaults |
| 105 | `105_league_mode_data_fix.sql` | Session 61: fix league_mode data (was 'draft' for all); add trg_sync_league_mode trigger; sync_cup_eliminations() function; sync-cup-eliminations cron every 6h |
| 106 | `106_transfer_window_unification.sql` | Session 62: squads.round_transfers; enforce_transfer_window tournament early-exit; transfer config keys seeded; get_transfer_window_status config-driven; get_club_cap() config-driven; execute_transfer_atomic transfer-limit enforcement; create_league seeds config |
| 107 | `107_starting_xi_and_bench.sql` | Session 62: squads.starting_xi + lineup_locks; lineup_lock_per_fixture config; set_lineup() atomic swap function; lock_lineups_for_fixture() cron helper |
| 108 | `108_security_lockdown.sql` | Session 64: execute_transfer_atomic ownership+server-price; set_lineup ownership+live-lock; resolve_bet double-resolve guard; REVOKE chip column grants; REVOKE execute_transfer_atomic from anon/authenticated; fix run-draft-lottery+run-reverse-standings-draft crons to service-role; cancel stuck draft submissions; WC knockout round_number backfill |
| 109 | `109_auth_uid_league_functions.sql` | Session 65: create_league (both overloads) + join_league_by_code use auth.uid() instead of trusting client p_user_id |
| 110 | `110_session66_high_items.sql` | Session 66: resolve_bet BET_STILL_OPEN guard; place_bid FOR UPDATE locks; leagues commissioner UPDATE RLS; sync-wc-fixtures-6h → sync-wc-fixtures-30m; calculate-scores-post-match expired JWT replaced with service-role key |
| 111 | `111_session66b_h1_budget_reservation.sql` | Session 66: place_bid budget reservation — sums all open winning bids before accepting; rejects if new bid exceeds available (unreserved) budget |
| 112a | `112_auction_chip_fixes.sql` | Session 67/68: resolve_auction_listing squad size + duplicate guards (DD-M7); activate_chip matchday deadline check (DD-M11) |
| 112b | `112_fix_player_id_types.sql` | Session 68: execute_transfer_atomic + set_lineup p_player_id/p_player_out/p_player_in changed uuid→text (DD-M3); GK auto-init sorts GKs first; backfill existing squads with missing GK in starting_xi |
| 112c | `112_void_bet_use_cancelled.sql` | Session 69: void_bet() status fixed from 'voided' → 'cancelled' (constraint only allows cancelled) |
| 113 | `113_fix_ghost_starting_xi.sql` | Session 69: remove ghost IDs from squads.starting_xi (IDs present in starting_xi but absent from squad.players) |
| 114 | `114_fix_transfer_limit_pre_competition.sql` | Session 69: bypass per-round transfer limit for non-standard matchday IDs (squads created before WC competition starts) |
| 115 | `115_purge_cross_tournament_players.sql` | Session 70: purge cross-tournament players from squads; DB-level trigger to prevent future cross-tournament adds |
| 116 | `116_drop_draft_submissions_legacy_unique.sql` | Session 71: drop legacy (league_id, user_id) unique constraint on draft_submissions — blocked multi-phase inserts (group + knockout) |
| 117 | `117_draft_allocations_user_update_rls.sql` | Session 71: UPDATE RLS policy on draft_allocations for users' own rows (needed by DraftRecoveryScreen client picks) |
| 118 | `118_scoring_v2.sql` | Session 73: V2 additive scoring — key_passes + big_chances_created columns on player_match_stats; scoring_rules updated for tournaments 426, 429, 1593; calculate-scores v22 deployed |
| 119 | `119_low_bug_sweep.sql` | Session 74: auction_listings UPDATE policy narrowed (DD-L3); place_bid seller self-bid blocked (DD-L4); void_bet budget reversal (DD-L5); auto-close-bets cron hourly (DD-L6); sync_cup_eliminations status filter fixed 'completed'→'finished' (DD-M14) |
| 120 | `120_dd_m13_late_scoring.sql` | Session 75: calculate-scores-live expired anon JWT fixed → service-role; new calculate-scores-late-finishers cron 23:30+00:30 UTC with 3h window for late WC finishers (DD-M13) |
| 121 | `121_session78_dd_corrections.sql` | Session 78 final DD: C5 sanitize_starting_xi trigger (starting_xi ⊆ players); DR4 recreate sync_league_mode() (absent in prod) + fire on all insert/update; C2 activate_chip rejects 'wildcard' + clear is_wildcard |
| 122 | `122_session78_live_timing_and_cup_seed.sql` | Session 78: D1 flip-fixtures-live cron (kickoff-driven scheduled→live) + ingest-match-events-live re-ingests finished-within-3h; seed_cup_clubs(uuid) scoped to league tournament |
| 123 | `123_session78_security_lockdown.sql` | Session 78 authz DD: guard_squad_protected_columns() trigger (blocks direct client writes to squads budget/identity/round_transfers; players reorder-only) — closes a proven P0 self-tamper; drop draft_allocations direct UPDATE policy + claim_draft_player() RPC (advisory-locked, fixes draft double-claim); activate_chip auth.uid() guard; accept_trade_proposal proposer-budget recheck |
| 124 | `124_session78_resolve_bet_cron.sql` | Session 78: resolve_bet allows cron/service-role context (auth.uid() IS NULL) — auto-resolve cron was getting UNAUTHORIZED on every call so bets never auto-resolved; authenticated non-commissioners still rejected |
| 125 | `125_session78_quickwins.sql` | Session 78: daily_jokers deadline gate (client can't set a joker after the matchday deadline; owner/service-role exempt for seeds) (#16); void_bet budget claw-back floored at 0 (#11) |
| 126 | `126_wc429_knockout_round_number.sql` | Session 80: WC 429 knockout `round_number` backfill (Forza returns `round=null` for knockouts → scoring hard-failed). Stage→round map: r4=R32 / r5=R16 / r6=QF / r7=SF / r8=Final+3rd (16/8/4/2/2). `derive_fixture_round_number()` BEFORE INSERT/UPDATE trigger re-fills `round_number` from `matchday_id` on every write so the 30-min sync cron can't re-null it; knockout deadlines corrected to each stage's first kickoff (B4) |
| 129 | `129_protect_manual_matchday_id.sql` | Pilot session: preserve_manual_matchday_id() BEFORE UPDATE trigger on fixtures — prevents sync cron from overwriting manually-set matchday_id with null (sync writes null for knockout rounds and int'l friendly rounds) |
| 130 | `130_wc429_knockout_matchday_backfill.sql` | Pilot session: backfill 32 WC 429 knockout fixtures whose matchday_id was wiped by sync-wc-fixtures-30m after migration 126 set them |
| 131 | `131_fix_cup_available_players_tournament_filter.sql` | Pilot session: get_cup_available_players cup path had no tournament_id filter — joined cup_active_clubs by club name only, pulling players from ALL tournaments with matching club names (WC 429 + UCL + int'l friendlies). Fixed by resolving tournament_id before the cup/non-cup branch |
| 132 | `132_late_joiner_allocation.sql` | Pilot session: create_late_joiner_allocation(p_league_id) RPC — creates empty draft_allocations row (unresolved_slots=draft_list_size) for users who join after lottery ran. Note: superseded by simplified draft gate (draft ran? yes→squad, no→draft); effectively unused in main flow |
| 133 | `133_drop_draft_deadline_trigger.sql` | Pilot session: drop draft_deadline_check trigger on draft_submissions — deadline is now informational only; lottery is always manually triggered by commissioner; run-draft-lottery cron disabled |
| 134 | `134_resolve_bet_commissioner_override.sql` | Pilot session: resolve_bet reordered — commissioner check now runs BEFORE BET_STILL_OPEN guard; commissioners can resolve any bet at any time regardless of deadline; BET_STILL_OPEN only blocks the auto-resolve cron (auth.uid() IS NULL) |
| 135 | `135_transfer_window_matchday_aware.sql` | Pilot session: get_transfer_window_status now closes the window for the full matchday duration. Reopen time = MAX(kickoff_at for matchday) + 2h match buffer + 6h scoring window (8h total from last kickoff). Falls back to deadline + 6h if no fixtures found for matchday_id |
| 136 | `136_h2h_competition.sql` | Session H2H: Draft+H2H mode — `h2h_enabled` on leagues; `h2h_schedule` table (RLS); `generate_h2h_schedule` RPC (Berger circle round-robin); `get_h2h_standings` RPC; updated `create_league` with `p_h2h_enabled` param + H2H config seeding (5/2/0) |
| 137 | `137_fix_generate_h2h_schedule.sql` | Session H2H bugfix: `generate_h2h_schedule` used `ORDER BY created_at` on `league_members` (no such column) — fixed to `ORDER BY user_id` |
| 138 | `138_fix_h2h_standings_ambiguity.sql` | Session H2H bugfix: `get_h2h_standings` had ambiguous `user_id` column reference in auth check — fixed with explicit table alias `lm.user_id` |
| 139 | `139_intfriendly_reset.sql` | Mini-league reset: re-assign tournament 623 fixtures to MD1 (Jun 6: Portugal-Chile, USA-Germany, Switzerland-Australia, England-New Zealand) and MD2 (Jun 7: Morocco-Norway, Croatia-Slovenia, Greece-Italy); update matchday_deadlines (r1=Jun 6 17:00, r2=Jul 7 18:00), delete stale r3-r8 deadlines; copy Morocco/Norway/Croatia players from WC (429) preserving price; copy Slovenia (30) + Italy (26) from tournament 1593 with random £4–7 price; delete polluting nationalities (France, Ivory Coast, Mexico, Montenegro, Serbia, Sweden, null) |
| 140 | `140_reset_pre_competition_transfer_counters.sql` | Session 2026-06-06: reset `round_transfers = '{}'` for squads in leagues whose configured matchdays (matchday_deadlines) have no live/finished fixtures — clears stale counters accumulated pre-competition. Companion to process-transfer fix that passes `p_matchday_id=null` when competition hasn't started (PR #386) |
| 141 | `141_initial_build_exemption.sql` | Session 2026-06-06: `squads.initial_build_complete boolean DEFAULT false` — one-way latch. While false: per-round transfer limit bypassed. Flips to true atomically inside `execute_transfer_atomic` when squad first reaches 15 players. Selling below 15 never resets it (prevents abuse). Backfill: existing 15-player squads set to true. Also adds `v_flip_latch` logic and `initial_build_complete OR v_flip_latch` in the UPDATE (PR #387) |
| 142 | `142_fix_claim_draft_player_squad_update.sql` | Session 2026-06-06: (A) `claim_draft_player` now finds the manager's existing squad (ORDER BY created_at DESC) and UPDATEs it on every pick — no longer INSERTs a new row with a wrong far-future matchday_id; late joiners with no squad get INSERT with nearest upcoming deadline. (B) `run-draft-lottery` club cap enforcement added: `forza_team_id` fetched per player, `clubCounts` map per manager, `get_club_cap()` RPC read; enforced in Pass 1 and Pass 2. (C) Knockout squad clearing: when phase='knockout', player arrays cleared from all non-current-matchday squads before writing new knockout squads (fixes no-repeat check pollution). (D) `run-draft-lottery` cron path hard-disabled with 405. (E) `initial_build_complete` set correctly by the lottery (true for full allocations) (PR #388) |
| 143 | `143_knockout_keep_submissions.sql` | Session 2026-06-06: `knockout_keep_submissions` table (league_id, user_id, player_ids[], UNIQUE per manager per league) + RLS (members read, own-row write). `submit_knockout_keeps` RPC: validates cup+draft format, `cup_phase='group_stage'` guard (prevents submission during group draft), slot limit (default 5, `knockout_keep_slots` config key), player ownership, club elimination. `run-draft-lottery` Pass 0: loads keeps, pre-allocates kept players before lottery (same position/budget/club cap checks), marks `awardedTo[pid]=uid`, skips kept pids in Pass 1/2 — no-op if no keeps exist (PR #389) |
| 144 | `144_free_transfer_window.sql` | Session 2026-06-06: `ALTER TABLE transfer_windows ALTER COLUMN round_number DROP NOT NULL` — free windows (window_type='unlimited', transfers_remaining=NULL) are not tied to a specific round; PostgreSQL treats multiple NULLs as distinct in the UNIQUE (league_id, round_number) constraint so multiple free windows can be created over a season. `process-transfer` checks for active unlimited window first and bypasses deadline/live-fixture locks and 3/round limit when found. CommissionerPanel FREE TRANSFER WINDOW lifecycle card added (PR #393) |
| 145 | `145_auction_two_phase.sql` | Session 2026-06-07: Two-phase auction flow — `auction_listings.won_at` column; `resolve_auction_listing` sets `pending_confirmation` on deadline (no auto-transfer); `confirm_auction_win()` RPC (window open + squad slot + budget at confirmation + duplicate guard → transfer + gazette_entries auction_result; SQUAD_FULL is actionable not a cancel); `sweep_void_auction_confirmations()` cancels pending listings where a full window cycle elapsed without confirmation; `process_auction_deadlines()` wrapper; `resolve-expired-auctions` cron updated (PR #401) |
| 146 | `146_md3_int_friendly_seed.sql` | Session 2026-06-07: MD3 fixtures for tournament 623 (Netherlands-Uzbekistan, France-NI, Spain-Peru) assigned matchday_id='623-r3', deadline Jun 8 18:00 UTC; Netherlands/France/Spain/Uzbekistan players copied from WC 429; synthetic Peru + Northern Ireland squads (23 players each, prices 3.5–4.5, forza_player_id='syn-{nation}-NNN') (PR #403) |
| 147 | `147_auction_status_constraint_fix.sql` | Session 2026-06-07: add 'pending_confirmation' to auction_listings CHECK constraint — migration 145 introduced the status but never updated the constraint, causing sell_now to fail (PR #404) |
| 148 | `148_sweep_window_guard.sql` | Session 2026-06-07: `sweep_void_auction_confirmations` — add `AND (get_transfer_window_status(league_id)->>'status') <> 'open'` guard; was cancelling pending_confirmation listings in leagues with an unlimited/free window because matchday_deadlines still exist (PR #406) |
| 149 | `149_confirm_auction_win_squad_lookup.sql` | Session 2026-06-07: `confirm_auction_win` buyer squad lookup — drop `matchday_id` filter (was finding next upcoming deadline e.g. '623-r3', then failing to find squads still on '623-r1' → BUYER_GONE → cancel on first click). Use `ORDER BY created_at DESC` only (PR #407) |
| 150 | `150_accept_trade_points_and_gazette.sql` | Session 2026-06-07: `accept_trade_proposal` — (A) ADD points_sweetener to target manager (was only subtracting from proposer — target never received points); (B) write gazette_entries(entry_type='trade_result') on accept so trades appear in League Activity + Frontpage (PR #410) |
| 151 | `151_same_position_trade_validation.sql` | Session 2026-06-07: POSITION_MISMATCH guard in `submit_trade_proposal` and `accept_trade_proposal` — prevents cross-position trades that corrupt squad formation counts (PR #413) |
| 152 | `152_trade_accept_window_check.sql` | Session 2026-06-07: `accept_trade_proposal` calls `get_transfer_window_status()` before executing swap — returns WINDOW_CLOSED if window not open; proposals and declines always available (PR #414) |
| 153 | `153_gazette_trade_result_enum.sql` | Session 2026-06-07: `ALTER TYPE gazette_entry_type ADD VALUE IF NOT EXISTS 'trade_result'` — value was missing from the Postgres ENUM, causing runtime error on every trade acceptance (PR #418) |
| 154 | `154_fix_accept_trade_encoding.sql` | Session 2026-06-07: rewrite `accept_trade_proposal` using `chr()` for all non-ASCII chars (chr(129309)=🤝, chr(8644)=⇄, chr(8212)=—, chr(8364)=€) to fix Windows file-encoding corruption of SQL string literals; repair one existing garbled gazette entry (PR #419) |
| 155 | `155_clean_sheet_bet_template.sql` | Session 2026-06-07: INSERT `clean_sheet` bet template (answerType='team_pick', scope='match'); SET `player_block` is_active=false (retired from UI) (PR #420) |

| 156 | `156_draft_list_size_45.sql` | Session 2026-06-08: `ALTER TABLE leagues ALTER COLUMN draft_list_size SET DEFAULT 45`; UPDATE all existing draft leagues with draft_list_size ≤ 30 → 45; all draft leagues (with and without H2H) now have 45 slots. `useLeagueConfig.js` DEFAULTS.draftListSize also updated to 45 (PR #441) |
| 156b | `156_auction_deferred_budget_check.sql` | Session 2026-06-08: `place_bid` budget reservation guard removed — budget validated at `confirm_auction_win` instead of bid time; `INSUFFICIENT_BUDGET` changed from cancel → actionable (listing stays `pending_confirmation` so buyer can free budget and retry) (PR #450) |
| 157 | `157_sell_free_penalty_transfers.sql` | Session 2026-06-08: `execute_transfer_atomic` — sells no longer count against per-round transfer limit (only BUYs count); `squads.penalty_transfers` JSONB column tracks over-limit buys per round; `calculate-scores` v23 deducts configured penalty per extra buy (`transfer_penalty` config key, default 4 pts, supports flat or escalating array) (PR #450) |
| 157b | `157_md4_scoring_fixes.sql` | Session 2026-06-08: tournament 623 MD4 (Argentina-Iceland, Portugal-Nigeria); deadline 2026-06-09 23:00 UTC; Argentina players copied from WC 429; synthetic Iceland + Nigeria squads (23 players each, prices €4–5); scoring_rules for 623 updated: GK goal→6, MID shot_on_target→0.25, FWD big_chance_created→0.5, penalty_missed→−2; per-60 minutes + DEF 45-min clean sheet gate in calculate-scores v24 (PR #451) |
| 158 | `158_club_cap_per_round.sql` | Session 2026-06-08: `club_cap_rules` table (tournament_id, round_suffix, cap, label) — single-row edits change any round's cap; seeded r1-r4=3, r5=4, r6-r7=5, r8=6 for tournaments 429 + 623; `get_club_cap()` updated to accept optional `p_matchday_id` and look up table before falling back to cup-based logic; `MarketScreen` uses dynamic clubCap from RPC; `process-transfer` passes activeMatchdayId to get_club_cap (PR #452) |
| 161 | `161_advance_squad_matchday_on_transfer.sql` | Session 2026-06-10: `execute_transfer_atomic` final UPDATE adds `matchday_id = COALESCE(p_matchday_id, matchday_id)` — squad's matchday_id advances to the active round whenever a transfer is made with `p_matchday_id` set. (Logic was patched into the live function ahead of this file being committed; committed here for audit-trail completeness — see #487/#488 session.) |
| 162 | `162_set_lineup_precompetition_lock_bypass.sql` | Session 2026-06-10: `set_lineup` skips the PLAYER_LOCKED check and doesn't append to `lineup_locks` when the active round hasn't started yet (`v_round_started` = any fixture for that round is `live`/`finished`); pre-competition lineup tinkering is sub-at-will, same guarantee as transfers. Backfill clears stale `429-r1` `lineup_locks` for 4 squads (PR #488) |
| 163 | `163_sync_squad_matchday_active_round.sql` | Session 2026-06-10: one-time data fix advances 3 TEST_2_H2H_DRAFT (623) squads' `matchday_id` from `623-r1` → `623-r4` (stuck pre-#161-fix); new `sync_squad_matchdays()` function recomputes each squad's `matchday_id` to the tournament's active round (lowest round with a scheduled/live fixture, same logic as `set_lineup`) whenever it falls behind — fixes the case where a squad makes zero transfers and its pitch keeps showing a stale prior round's points. Run once + scheduled every 30 min (`sync-squad-matchdays` cron) |
| 164 | `164_set_lineup_return_locked_flag.sql` | Session 2026-06-10: `set_lineup` RETURN now includes `'locked', v_round_started`. Fixes Mundial do Eder (429) pre-competition sub bug: `SquadScreen.doSwap()` was unconditionally setting `isLineupLocked: true` on the benched player regardless of whether the server actually wrote `lineup_locks` (only happens once the round starts) — the very next swap-back attempt was then blocked client-side with "already subbed out this round" until a hard refresh. `doSwap` now sets `isLineupLocked: result.locked === true`. Also fixed `PitchView.jsx` — pitch tokens had `onClick={swapMode ? () => {} : onPlayerClick}`, making starting-XI taps a no-op while in swap mode (bench→SUB IN→tap-XI-player did nothing; XI→SUB OUT→tap-bench worked because the bench strip isn't rendered via `PitchView`). Now always calls `onPlayerClick`. |
| 165 | `165_fix_missed_429r1_stale_lock.sql` | Session 2026-06-10: data fix — clears stale `lineup_locks->'429-r1'` for one squad in Mundial do Eder (429) missed by migration 162's backfill (xavierazcue@gmail.com, squad `6ef9a431-2326-4282-8a4e-736f0eb6b491`, was carrying `["fp-1423322-429","fp-588619-429"]`). Same root cause as migration 164 but for pre-existing stale data — round 429-r1 has 0 live/finished fixtures, so the server-side gate already permits the swap, but the client's `isLineupLocked` was still derived from this stale entry. Confirmed this was the only remaining squad in tournament 429 with a stale `429-r1` lock. |
| 166 | `166_set_captain_validation.sql` | `set_captain()` RPC — rejects assigning captaincy to a player whose active-round fixture is `live`/`finished` (prevents retroactive hindsight captaincy mid-matchday); `guard_squad_protected_columns` now blocks direct client writes to `captain_id` — must go through this RPC. |
| 167 | `167_resolve_bet_points_aggregation.sql` | `resolve_bet` now calls `aggregate_league_member_points` for each winning manager on a 'points'-type bet, so `league_members.total_points` reflects the reward immediately instead of waiting for the next `calculate-scores` pass (which may never come post-matchday). |
| 168 | `168_fix_lineup_lock_and_matchday_id.sql` | Session 2026-06-12: **(Bug #1)** `set_lineup`'s lineup-lock write/read condition changed from round-level `v_round_started` to the benched player's own fixture status (`v_pout_status IN ('live','finished')`) — fixes false "already subbed out and cannot return" (reported: Cristian Romero, Draft Mundial 26) caused by one WC fixture going live locking every sub-out across every league regardless of that player's own match timing; subsumes migration 162's pre-competition bypass. Self-healing backfill rebuilt `lineup_locks` for all squads, removing 21 stale entries (19 legitimately-locked entries preserved) across 7 squads/6 leagues. **(Bug #2)** new `get_active_matchday_id(tournament_id)` helper (same logic as `sync_squad_matchdays`: lowest round with scheduled/live fixture, else highest finished round) replaces the "nearest upcoming `matchday_deadlines.deadline_at`" lookups in `run-draft-lottery` (`canonicalMatchdayId`) and `process-transfer` (`activeMatchdayId`) — both previously jumped to the NEXT round the instant a round's deadline passed even while that round's fixtures were still mostly `scheduled`. Backfilled 6 squads created by the post-deadline lottery run from `429-r2` back to `429-r1` (WC Round 1 was still 23/24 scheduled). |
| 169 | `169_transfer_windows_commissioner_write.sql` | Session 2026-06-12: `transfer_windows` had RLS enabled (migration 66) with only a SELECT policy — every commissioner-initiated open/close transfer-window action (`openTransferWindow`/`closeTransferWindow`/old Free Transfer Window) was silently rejected by RLS; table had zero rows in prod since migration 66. Adds commissioner-scoped INSERT/UPDATE policies (same `league_members.role='commissioner'` pattern as migration 103's gazette_entries policy). Verified via simulated-JWT RLS test: commissioner insert succeeds, non-commissioner insert rejected (PR #509). |
| 170 | `170_set_captain_recompute_total.sql` | Session 2026-06-12: `set_captain()` self-heals `fantasy_points.total` for the active round when a captain change happens after some of the round's fixtures are already scored — recomputes `total = round(sum(starting_xi pts) + captain_pts * (mult-1))` and writes it back, same formula `calculate-scores` uses pre-`roundComplete`. One-off: corrected RTrocado's stale `429-r1` total (5→2) in "Draft Mundial 26" (PR #513). |
| 171 | `171_set_captain_aggregate_points.sql` | Session 2026-06-12: `set_captain()` additionally calls `aggregate_league_member_points()` after the `fantasy_points.total` self-heal (migration 170 only fixed the GW total — `league_members.total_points`, the leaderboard TOT/rank, is a separately cached aggregate that was left stale). One-off re-aggregation corrected RTrocado's leaderboard total (5.00→2.00, rank 1→2) and tommyazcue's rank (2→1) in "Draft Mundial 26" (PR #514). |
| 172 | `172_set_lineup_aggregate_points.sql` | Session 2026-06-12: same fix as migration 171, applied to `set_lineup()` — benching a player whose fixture already finished triggers an immediate `fantasy_points.total` deduction (migration 168), but `league_members.total_points` was only refreshed by the next `calculate-scores-live` pass (every 2 min while a fixture is live). Once a round is fully `finished`, no further live pass runs, so a post-round bench swap could leave the leaderboard stale. `set_lineup` now calls `aggregate_league_member_points()` at the end, same as `set_captain`. |
| 173 | `173_set_lineup_round_deduction.sql` | Session 2026-06-12 (reported: TEST_WC_CONTROL_CLASSIC): `set_lineup`'s returned `deduction` (shown in the SquadScreen toast) was the raw unrounded `player_match_stats.fantasy_points` (e.g. `1.4`), but every other points display in SquadScreen uses `Math.round(player.points)` for the same value (e.g. `1`). `fantasy_points.total` was already deducted by the rounded amount (migration 168's `ROUND(v_deduction)`) — only the returned/toast value was unrounded. `v_deduction` is now `ROUND(v_pout_pts)` so the toast matches the on-screen points. |
| 174 | `174_fix_active_transfer_window_null_check.sql` | Session 2026-06-12 (reported: Munaial '26): toggling EMERGENCY TRANSFERS ON (PR #517) inserted a `transfer_windows` row with `window_type='unlimited'`, `round_number=NULL`, `transfers_remaining=NULL` (same shape as migration 144's Free Transfer Window), but PLAYER MARKET still showed "WINDOW CLOSED". `get_transfer_window_status` did `win := get_active_transfer_window(...); IF win IS NOT NULL THEN ...` — for a `transfer_windows` composite, SQL row semantics make `IS NOT NULL` true only if **every** field is non-null; a found row with `round_number`/`transfers_remaining` NULL is neither `IS NULL` nor `IS NOT NULL`, so the active-window branch was skipped entirely. **Rule: when checking "was a row found?" on a composite/record variable that may have legitimately-NULL fields, test a NOT NULL column (e.g. `win.id IS NOT NULL`), never `win IS NOT NULL`.** Fixed in both the active-window and future-window checks. |
| 175 | `175_scoring_v2_bucket_ab.sql` | Session 2026-06-13: Scoring v2 Buckets A+B for tournament 429 — full `scoring_rules` rewrite per position. Bucket A (config-only): goal values up GK 5→8, DEF 5→6, MID 4→5 (FWD unchanged 4); `big_chance_created`/`interception`/`key_pass`/`shot_on_target`/`tackle` now score for all positions; MID gains `clean_sheet: 1` (new, 60-min gate); `penalty_missed` -1→-2 (UNIVERSAL). Bucket B (config half — code half in calculate-scores v26): new `conceded_2plus_penalty: -0.5` for GK/DEF (each goal conceded beyond the first); legacy unused `conceded_per_goal` key dropped. `calculate-scores` v26: GK clean-sheet minutes threshold lowered from 60→45 (matches DEF); `goals_conceded` penalty applied in `scorePlayer()`/`buildBreakdown()`. `ScoringInfoModal.jsx` POSITIONS rewritten to match. Bucket C (MOTM/free-kick/corner goal/penalty won/committed feasibility) deferred to BACKLOG P3 item B-04 — verify during a live match. Retroactive rescore of the 4 finished `429-r1` fixtures executed (idempotent per-fixture `calculate-scores` call with service-role JWT extracted from `cron.job` commands) — totals shifted up as expected, no errors, no gazette/H2H side effects (round not yet `roundComplete`). Pre-change `scoring_rules` snapshot: `backups/scoring_rules_429_pre_v2_20260613_083947.json` (PR #524). |
| 176 | `176_set_captain_round_per_player.sql` | Session 2026-06-15: `set_captain()` mid-round self-heal rewritten to use round-per-player formula (same as calculate-scores v27): `total = SUM over starting XI of ROUND(player's round points) * mult`. |
| 177 | `177_set_lineup_round_per_player.sql` | Session 2026-06-15: `set_lineup()` mid-round recompute rewritten to use the same full v27 formula as `set_captain` (migration 176) — fixes stale surplus when captain is benched mid-round (B-07). |
| 178 | `178_free_transfers_classic.sql` | Session 2026-06-15: free transfer window support for classic leagues. |
| 179 | `179_round_aware_transfer_reopen.sql` | Session 2026-06-17 (B-02): `get_transfer_window_status()` rewritten — round suffix extracted from `matchday_id` (`split_part(v_prev_matchday_id, '-r', 2)::int`); r1–r3 → `v_reopen_hours=1` (3h total from last kickoff), r4+ → `v_reopen_hours=6` (8h total). Commissioner override via `league_config.transfer_reopen_hours` still respected. 12 default-seeded `transfer_reopen_hours=6` entries deleted from `league_config` (never real overrides). Managers now gain ~5h extra transfer time after group-stage rounds (PR #563). |
| 180 | `180_interactive_frontpage.sql` | Session 2026-06-18: `frontpage_editions` (AI content per league per day — headline/deck/hot_take/wooden_spoon/transfer_rumour, edition_number, is_manual flag, generated_at); `frontpage_reactions` (emoji reactions per member per section per day — five emojis 🔥💀😂👑😤, five sections lead/hot_take/transfers/scores/commissioner, UNIQUE per league+date+section+user+emoji — toggle via insert/delete); `frontpage_comments` (140-char letters to editor per section, INSERT any member, DELETE own or commissioner); `classified` added to `gazette_entry_type` enum (commissioner classified ad posts). RLS on all three tables: members SELECT, own-row write, service role bypasses (Edge Function). |
| 181 | `181_frontpage_edition_cron.sql` | Session 2026-06-18: `generate-frontpage-editions` cron at `0 5 * * *` UTC — calls `generate-frontpage-edition` Edge Function with `{mode:'cron'}` + service-role JWT via `net.http_post`. Cron skip: `is_manual=true AND generated_at > now()-12h` (league already had a fresh manual edition that day). |
| 183 | `183_squad_events.sql` | Session 2026-06-19 (BI-03): `squad_events` append-only audit table (`event_type`, `league_id`, `user_id`, `squad_id`, `matchday_id`, `player_in`, `player_out`, `meta`, `event_at`). RLS: commissioners read their league; managers read their own events. `_log_squad_event()` SECURITY DEFINER helper (non-fatal — EXCEPTION WHEN OTHERS → NULL). Wired into 8 RPCs: `execute_transfer_atomic` (transfer_buy/transfer_sell), `place_bid` (auction_bid), `confirm_auction_win` (auction_win), `submit_trade_proposal` (trade_propose), `accept_trade_proposal` (trade_accept ×2 — one per squad), `set_lineup` (lineup_swap), `set_captain` (captain_change), `claim_draft_player` (draft_pick). Also in this session: B-10 fix (`isValidFormation` GK guard `>= 1` → `=== 1`, PR #587) and B-09 bench display in RecapView (PR #588). |
| 184 | `184_league_config_rls.sql` | Session 2026-06-19 (Forza Times polish): `league_config` had RLS enabled since migration 66 with zero policies — every commissioner write (PIN QUOTE upsert, any `league_config` key) was silently rejected. Adds member SELECT policy (`league_members` existence check) and commissioner INSERT/UPDATE/DELETE policy (`role='commissioner'`). |
| 185 | `185_captain_change_meta_delta.sql` | Session 2026-06-19: `set_captain()` was logging empty `{}` meta for `captain_change` events in `squad_events`. Captures `v_old_total` from `fantasy_points` before the recompute and logs `delta_pts = new_total - old_total` in meta (positive = pts gained, negative = pts lost from the swap — PR #594). |
| 190 | `190_round_backups.sql` | Session 2026-06-22 (BI-02): `round_backups` table — one row per `matchday_id` (UNIQUE). Stores `squads_snapshot` (all squads: XI/bench/captain/budget/round_transfers/initial_build_complete + username), `fantasy_points_snapshot` (total + full points_breakdown per squad), `league_members_snapshot` (total_points + rank per member). RLS enabled, no policies — service-role only. Written by `calculate-scores` at `roundComplete` via `writeRoundBackup()` (non-fatal, idempotent). PR #604. |

| 191 | `191_clean_sheet_retroactive_fix.sql` | Session 2026-06-24: Retroactive R2 clean sheet correction — R2 was `roundComplete` (v29 guard blocked auto-recompute). Direct DB fix: +4 pts to `player_match_stats.fantasy_points` + `breakdown.clean_sheet=4` for 5 DEF rows (Romero ARG, Meunier BEL, Cornelius CAN, Bombito CAN, Hardani IRN); `fantasy_points.total` +4 for 5 affected pilot squads (Oliver Knott, SB7, Titan, tommyazcue, Zepp); `league_members.total_points` re-aggregated, ranks recomputed via trigger. Cancelo/Semedo (POR) were already correct. Root cause: 60-min gate baked into `ingest-match-events` `clean_sheet` flag (fixed in PR #616 previous session). PR #630. |
| 192 | `192_knockout_scoring.sql` | Session 2026-06-29 (PR #672): **Part A** — `player_match_stats` gains `shootout_scored/missed/saved INT DEFAULT 0`. Shootout scoring: +1/−1/+0.5. `ingest-match-events` detects shootout period by `period.name/type` containing "penalt"; ET duration auto-detected (90 vs 120) from max event minute — fixes E5 starter fallback + sub-in calc. `calculate-scores` UNIVERSAL keys added; `scorePlayer`/`buildBreakdown` updated. **Part B** — `resolve_bet` commissioner override: commissioners bypass `ALREADY_RESOLVED`; old rewards reversed + old winners re-aggregated. Commissioner panel: resolved bets show AUTO-RESOLVED badge + OVERRIDE button. ✅ **APPLIED TO PRODUCTION 2026-06-29** — migration run + both Edge Functions (`ingest-match-events`, `calculate-scores`) redeployed. Pre-change `resolve_bet` snapshot: `backups/pre_migration192_resolve_bet_20260629.json`. See BACKLOG `DEPLOY-672`. |
| 197 | `197_tennis_core_schema.sql` | Sprint T-0 (v2 branch only): `player_boxes`, `player_box_members`, `circle_player_boxes`; `tennis_seasons` (2026); `tennis_tournaments` (14-event 2026 ATP calendar, `external_id INT` for API sync); `tennis_tournament_type`/`tennis_surface` enums; RPCs `create_player_box`, `join_player_box_by_code`, `get_my_player_boxes`; RLS on all 5 tables. |
| 198 | `198_tennis_game_tables.sql` | Sprint T-0: `tennis_tournament_players` (partial unique index on `external_player_id WHERE NOT NULL`), `tennis_rosters`, `tennis_qf_captains`, `tennis_ace_cards`, `tennis_tournament_scores`, `tennis_atp_finals_matches`, `tennis_atp_finals_picks`; `gazette_entry_type` extended with `'tennis_result'`; RLS on all 7 tables. |
| 199 | `199_tennis_t1_rpcs.sql` | Sprint T-1: `submit_tennis_roster` (tier validation, ace card, re-submit idempotency), `set_tennis_qf_captain`, `submit_atp_finals_group_picks`, `submit_atp_finals_knockout_picks`, `get_tennis_tournament_for_user` (rich single-call payload), `issue_season_ace_cards` (service_role-only). |
| 200 | `200_tennis_admin_rpcs.sql` | Sprint T-2: 9 service_role-only admin RPCs — `admin_open_tournament`, `admin_start_tournament`, `admin_seed_tournament_players`, `admin_enter_round_results`, `admin_open_qf_window`, `admin_set_champion`, `admin_complete_tournament`, `admin_seed_atp_finals_matches`, `admin_enter_atp_finals_result`. All REVOKE from public/authenticated/anon + GRANT to service_role. |
| 201 | `201_tennis_leaderboard_rpcs.sql` | Sprint T-3: `get_player_box_leaderboard` (Masters Drop Rule when ≥5 standard tournaments complete), `get_tennis_season_summary` (per-tournament breakdown per user), `get_tennis_tournament_list` (calendar + player counts + has_my_roster). |

| 215 | `215_clubhouse_centric_model.sql` | Session 2026-06-28 (v2 branch only): add nullable `circle_id uuid REFERENCES circles(id)` to `leagues`, `paddocks`, `player_boxes`; backfill from junction tables (`circle_leagues`, `circle_paddocks`, `circle_player_boxes`); `CREATE OR REPLACE FUNCTION create_paddock` writes `circle_id` directly (was already in signature but not persisted); `CREATE OR REPLACE FUNCTION create_player_box` same fix; new 6-param `create_league` overload adds `p_circle_id uuid DEFAULT NULL` (inserts both `leagues.circle_id` and `circle_leagues` row for backwards compat). **⚠️ File committed, NOT yet applied to production DB** — apply from Supabase-linked PC. |

**Next migration**: `218_` (v2 branch) / `193_` (main)

**Key pipeline facts (2026-06-29 — Redesign Phase C, PR #676, v2 branch):**
- **`useActiveCompetition()` hook** (`src/hooks/useActiveCompetition.js`): derives `{sport, competitionId}` from `useLocation().pathname` only — no context, no global state. Football matched by `/league/`, `/live`, `/squad`, `/market`, `/recap`; F1 by `/f1/`; tennis by `/tennis/tournament/`. `SportContext.activeSport`/`setActiveSport` **removed entirely**. `AppLayout`, `ClubhouseScreen`, `F1HomeScreen`, `PaddockLobbyScreen`, `PlayerBoxScreen` all cleaned of `setActiveSport()` calls. `SportContext` retains `activePaddockId`/`activePlayerBoxId` (used by `usePaddock`/`usePlayerBox` for localStorage).
- **`CompetitionResultsHeader`** (`src/components/competition/CompetitionResultsHeader.jsx`): shared CSS-grid standings component. Configurable `columns` array: `{key, label, width, accessor(row), color?, activeAccent?}`. `accent` = global sport colour; per-column `activeAccent` overrides it when that column is `activeColumnKey`. `highlightUserId` row: left border + `color-mix(in srgb, accent 6%, transparent)` bg. `useMedals` → 🥇🥈🥉 for rank 1/2/3. `renderName(row, isMe)` + `renderActions(row, isMe)` callbacks. Adopted in: **F1** (`F1StandingsScreen`, RACE/SEASON/TOTAL toggle, `--f1` accent, TOTAL activeAccent = `--paper`); **Tennis** (`TennisLeaderboardScreen`, SLAMS/MASTERS/FINALS/TOTAL, `--ten` accent); **Football** (`LeagueDetailView` desktop standings, TOT + optional H2H `color:'var(--gold)'`, `--cyan` accent, `MgrTag`/`miniBtnStyle` via callbacks).
- **TDZ safety**: all screens including the three above are `React.lazy()` → separate Rolldown chunks → no TDZ risk from `CompetitionResultsHeader`. `useActiveCompetition` only imports `react-router-dom` (package dep, never a local module). No new circular deps (madge confirmed).
- **Clubhouse Redesign status**: Phase A ✅ (PR #671), Phase B ✅ (PR #675, migration 216 applied), Phase C ✅ (PR #676). **Next: Phase D** — naming pass ("Clubhouse"/"Competition", remove user-facing "circle") + visual polish from mock Screen 7.

**Key pipeline facts (2026-06-28 — UX-3/5/7 + ARCH-1/2/3, PR #666, v2 branch):**
- **Kit Light token map (v2, authoritative):** `--bg`=#F7F3ED (page bg), `--card`=#FFFFFF (card surface), `--elev`=#EDEAE2 (elevated/input bg), `--paper`=#18202E (PRIMARY text — dark navy), `--text-2`=#4B5568 (secondary text), `--mute`=#8A97A8 (muted labels), `--rule`=#E2DDD5 (borders), `--gold`=#B8720E (accent gold), `--accent`=var(--brand-accent) (blue). **`--text` does NOT exist** — always use `--paper` for primary text. `--ink`=`--bg`, `--ink-2`=`--card`, `--ink-3`=`--elev` (legacy aliases, still valid). `--shell`=#18202E is the ONE dark element (sidebar) — never use for page/card backgrounds.
- **OnboardingWizard Kit Light (UX-3)**: all dark overlay/card/text rgba hard-codes replaced with tokens. Overlay = `rgba(247,243,237,0.98)` (`--bg` colour, no CSS variable opacity). Card = `var(--card)` + `1px solid var(--rule)`. Shadow lightened to `0 8px 32px rgba(24,32,46,0.12)`. Heading/input text = `var(--paper)`. Body text = `var(--text-2)`. Muted labels = `var(--mute)`. Inactive progress dots = `var(--rule)`. CTA gold button text stays `#fff` (white on gold — correct contrast). Confetti `#3B9EFF` decorative value is acceptable (no semantic equivalent in Kit Light).
- **PitchView green field (UX-5)**: pitch surface `linear-gradient(180deg, #3d6e4a 0%, #2a5035 100%)`. Lane lines/halfway/centre circle = `rgba(255,255,255,0.18)`. Lane label bg = `rgba(0,0,0,0.3)`, text = `rgba(255,255,255,0.7)`. Three depth-shading bands at y=34/58/81%, height=12%, `linear-gradient(180deg, rgba(0,0,0,0.08) 0%, transparent 100%)`. Outer container bg = `#2a5035` (green, not `var(--bg)` — pitch frame should be green, not cream). HybridToken dark pills unchanged (dark `rgba(15,18,24,.92)` reads well on green).
- **ARCH-1 Clubhouse-centric model (migration 215)**: `leagues`, `paddocks`, `player_boxes` all gained nullable `circle_id uuid REFERENCES circles(id)`. Backfill from junction tables (may return 0 rows if no circles existed). `create_paddock` + `create_player_box` now write `circle_id` directly on INSERT AND still write junction table row for backwards compat. `create_league` new 6-param overload adds `p_circle_id uuid DEFAULT NULL` as a new overload (does not replace existing 5-param overloads — no grant loss). **Rule: never `DROP FUNCTION` in migrations that also re-create — use `CREATE OR REPLACE`.**
- **ARCH-2 Clubhouse picker in PaddockLobbyScreen**: `get_my_circles` RPC called on mount; `<select>` dropdown rendered above paddock name only when user has ≥1 circle; `createPaddock(name, circleId)` already accepted the param — no hook change needed.
- **ARCH-3 OnboardingWizard Clubhouse step**: new step (id `'clubhouse'`, `isClubhouseStep: true`) inserted between `welcome` and `squad` in `buildSteps()`. CREATE/JOIN toggle; calls `create_circle({p_name})` or `join_circle_by_code({p_invite_code})`; falls through (skip) on empty inputs. `supabase` was already imported in `OnboardingWizard.jsx`. `clubhouseStepDone` key added to `useOnboarding.js` `K` map.

**Key pipeline facts (2026-06-24 — Tennis Module T-0 through T-4 complete, v2 branch):**
- **Tennis Module 100% complete** (PRs #617–#620 + #625, migrations 197–201, v2 branch): all DB schema, RPCs, Edge Functions, and UI screens shipped. Phase 2 done.
- **Tennis UI (PR #625, Sprint T-4)**: 7 screens (`TennisHomeScreen`, `TennisTournamentScreen`, `TennisLeaderboardScreen`, `TennisAtpFinalsScreen`, `TennisAdminScreen`, `PlayerBoxScreen`, `TennisProfileView`) + 5 hooks (`useTennisCalendar`, `useTennisTournament`, `useTennisLeaderboard`, `usePlayerBox`, `useAtpFinalsPicks`) + routes in `App.jsx`. `SportContext` extended with `activePlayerBoxId` (localStorage, mirrors F1 `activePaddockId` pattern). All screens Kit Light compliant.
- **Tennis API**: RapidAPI `tennis-api-atp-wta-itf`, free plan 50 req/day. `sync-tennis-players` Edge Function is admin-triggered only (never cron) — 1 API call per invocation. Requires `tennis_tournaments.external_id` set via `admin_open_tournament` first. ~28 total calls for 14-tournament 2026 season.
- **Tier mapping** (applied in `sync-tennis-players` and `admin_seed_tournament_players`): seeds 1–4=T1 (2pts/round), 5–16=T2 (3pts), 17–32=T3 (4pts), unseeded=T4 (6pts).
- **Tennis scoring model** (`score-tennis-tournament`): tier-based per-round points. QF Captain doubles their contribution (+equal bonus). Ace cards: `underdog_boost` +15 if T3/T4 reaches SF+; `safety_net` +8 if T1 exits r128/r64; `surface_specialist` +12 if captain reaches SF+; `dark_horse_insurance` floors T4 at 6pts even if 0 wins.
- **Masters Drop Rule** (in `get_player_box_leaderboard`): when ≥5 standard tournaments complete, drops each user's worst standard score. ATP Finals never dropped. Applied in leaderboard RPC, not scoring function.
- **ATP Finals** (`score-atp-finals`): 15-match pick'em, group=3pts/SF=5pts/Final=8pts (max 54). Idempotent partial scoring. No ace cards or captain.
- **Ace card re-submit idempotency**: `submit_tennis_roster` availability check uses `(used_tournament_id IS NULL OR used_tournament_id = p_tournament_id)` — allows roster re-submission to the same tournament without forcing card swap.
- **Partial unique index pattern**: `tennis_ttp_external_id_idx` on `tennis_tournament_players(tournament_id, external_player_id) WHERE external_player_id IS NOT NULL` — manual players can have NULL external_player_id; API-synced players must be unique.
- **4 deployed Tennis Edge Functions** (v2): `sync-tennis-players`, `score-tennis-tournament`, `score-atp-finals`, `score-f1-race`. None have crons — all admin-triggered.
- **GitHub API rule**: use PowerShell `Invoke-RestMethod` with single-line string bodies (backtick escape `n for newlines). Python urllib heredoc approach fails in bash because the commit message body gets shell-interpolated. PowerShell works for PR create/merge/delete. Bash heredoc git commits still use `git commit -m "$(cat <<'EOF'...)"` format.

**Key pipeline facts (2026-06-29 — Round-of-32 duplicate-fixture scoring bug):**
- **Forza re-issues match IDs for knockout fixtures after the bracket is confirmed.** Observed on tournament 429 Round-of-32 (`round_number=4`): 5 of 16 matches got a brand-new `forza_match_id`/fixture row once team pairings were finalized, while the *old* placeholder fixture row (manually backfilled with `matchday_id='429-r4'` back in migration 130) was left behind untouched. Forza's live feed (`ingest-match-events`, score sync) writes to the **new** row, which has no `matchday_id`/`round_number` — so `calculate-scores`'s `rollupSquads()` (`supabase/functions/calculate-scores/index.js`) silently no-ops with `"fixture has no round_number"` and squads never get scored, even though the live score itself displays correctly (scores live on the `fixtures` table directly, independent of scoring).
- **Detection query** — find duplicate fixture rows for the same real match by team-ID pair + kickoff time, not by `id`/`forza_match_id` (those differ across the duplicate):
  ```sql
  SELECT home_team_forza_id, away_team_forza_id, kickoff_at, COUNT(*), array_agg(id), array_agg(matchday_id)
  FROM fixtures WHERE tournament_id IN ('429','623') GROUP BY 1,2,3 HAVING COUNT(*) > 1;
  ```
- **Fix pattern**: (1) copy `matchday_id`+`round_number` onto the row Forza is actually updating (the one with non-null `scores`/live status); (2) null `matchday_id`/`round_number` on the stale row — requires `ALTER TABLE fixtures DISABLE TRIGGER trg_preserve_manual_matchday_id;` first (that trigger restores the old non-null value otherwise per migration 129), then re-enable immediately after; (3) manually re-invoke `calculate-scores` for the now-correctly-tagged live fixture to backfill immediately rather than waiting for the next 2-min cron pass (extract a fresh service-role key via `npx supabase projects api-keys --project-ref sssmvihxtqtohisghjet` if the JWT baked into `cron.job` commands has gone stale).
- **Why it matters beyond live scoring**: `rollupSquads()` requires every fixture in a round to be `status='finished'` before setting `roundComplete=true` (gates auto-subs, captain reassignment, gazette entries, H2H resolution). A stale duplicate row that Forza never updates again would permanently block round completion if left untouched.
- **Expect this to recur** at later knockout stages (R16, QF, SF, Final) as Forza re-issues IDs again once each round's pairings are confirmed. No periodic detection job exists yet — flagged as a BACKLOG follow-up, not yet built.

**Key pipeline facts (2026-06-22 — round backups + knockout draft drop):**
- **`round_backups` table** (migration 190, PR #604): one row per `matchday_id` written by `calculate-scores` at `roundComplete`. Three JSONB columns: `squads_snapshot` (all squad rows for that tournament — players/starting_xi/captain_id/budget_remaining/round_transfers/penalty_transfers/initial_build_complete + username lookup), `fantasy_points_snapshot` (total + full points_breakdown), `league_members_snapshot` (total_points + rank). RLS enabled, zero policies — only service role can access. Non-fatal: backup errors are caught + warned but never block scoring. Idempotent: UNIQUE on `matchday_id` means one write per round, ever. Recovery workflow: `SELECT squads_snapshot FROM round_backups WHERE matchday_id='429-r2'` → restore as needed.
- **`writeRoundBackup()` in calculate-scores** (v32): fires inside the `if (roundComplete)` branch alongside gazette writes and H2H resolution. Early-returns if a `round_backups` row already exists for this `matchday_id` (idempotency guard). Fetches usernames from `users` table via batch `in('id', userIds)` lookup. Builds `fpSnapshot` from the `fantasyPointsUpserts` array already in memory — no extra DB read for points data.
- **`KNOCKOUT_DRAFT_ENABLED = false`** (`CommissionerPanel.jsx` line 18, `SquadScreen.jsx` line 64): same named-constant pattern as `CHIPS_ENABLED`. Gates CommissionerPanel knockout draft section (desktop + mobile IIFE blocks) and SquadScreen `KnockoutKeepSelector`. Set to `true` to re-enable. The underlying DB tables (`knockout_keep_submissions`, `submit_knockout_keeps` RPC, `run-draft-lottery` Pass 0 keep pre-allocation) all still exist — code change required only in these two files.
- **Group→knockout transition** now works as a normal transfer window: `process-transfer` bypasses per-round limits for draft leagues (`if (leagueMode === 'draft') { limitMatchdayId = null }`, line 279); `cup_active_clubs`/`sync_cup_eliminations` restricts the market to surviving nations; no-repeat relaxation (`calculate_relaxation_state`, migration 07) auto-relaxes as pool shrinks. No commissioner action needed beyond the transfer window being open.

**Key pipeline facts (2026-06-18 — Forza Times interactive frontpage):**
- **Edition gate**: all new frontpage UI is gated on a `frontpage_editions` row existing for today's date in the active league. If no row exists, the frontpage renders exactly as before. Real leagues see zero change until the Edge Function is deployed and triggered.
- **`generate-frontpage-edition` Edge Function** (`supabase/functions/generate-frontpage-edition/index.ts`) — ⚠️ **NOT YET DEPLOYED TO PROD** as of 2026-06-18 (pending test-league validation). Two modes: cron (`{mode:'cron'}` + service-role JWT — loops all active leagues, skips if manual edition < 12h old) and manual (`{league_id}` + user JWT — commissioner only, 4h rate limit). Uses Groq `llama-3.1-8b-instant` via OpenAI-compatible API with `response_format:{type:'json_object'}`. Collects: standings top5+bottom1, last 24h transfers, last 3 chat messages, upcoming fixtures 48h, gazette entries (breaking_news + classified + activity), league_config pinned quote. Output shape: `{headline, deck, hot_take, wooden_spoon, transfer_rumour}`.
- **`GROQ_API_KEY`** — stored as a Supabase Edge Function secret only. Never in code or git. Set via `npx supabase secrets set GROQ_API_KEY=<key> --project-ref sssmvihxtqtohisghjet`. Deploy command: `npx supabase functions deploy generate-frontpage-edition --project-ref sssmvihxtqtohisghjet`.
- **`frontpage_editions` cron skip logic**: `is_manual=true AND generated_at > now()-12h` → the 05:00 UTC cron skips that league. Commissioners can post a special edition at any time (4h rate limit); the next morning cron only fires if no fresh manual edition was posted after ~17:00 UTC the previous day.
- **`gazette_entry_type` now includes `classified`** (migration 180). Posted via CommissionerPanel → LEAGUE NEWS → CLASSIFIED AD tab. Appears in `gazette_entries` table alongside `breaking_news`. `GazetteNews.jsx` currently only renders `breaking_news` — classifieds will appear in the LEAGUE tab activity feed (existing ENTRY_META in `LeagueDetailView.jsx` needs `classified` registered there; deferred as a follow-up).
- **Pin Quote** — commissioner sets `league_config` keys `frontpage_pinned_quote` + `frontpage_pinned_quote_author` via the PIN QUOTE tab in CommissionerPanel. Replaces "May the best manager win." in the sidebar; label changes to COMMISSIONER SAYS. `useFrontpageEdition` fetches both keys alongside edition/reactions/comments.
- **`useFrontpageEdition` hook** (`src/hooks/useFrontpageEdition.js`) — single hook per league: fetches edition + reactions + comments + pinned quote in one useEffect. `toggleReaction` is optimistic (temp ID → real ID on confirm, rolls back on error). `addComment`/`deleteComment` update local state immediately. `getReactionCounts(sectionKey)` / `isMyReaction(sectionKey, emoji)` / `getComments(sectionKey)` are memoized callbacks — no re-renders unless `reactions`/`comments` arrays change.
- **`FrontpageInteractive.jsx`** — two named exports: `ReactionStrip` (five emoji toggle buttons, highlighted border + cream background when user has reacted, no portal needed — in-place) and `LettersPanel` (collapsible, `timeAgoFT` formatter, owner/commissioner delete button, 140-char compose with remaining-chars counter, Enter to send).
- **Section keys** (enforced by DB CHECK constraint): `'lead'`, `'hot_take'`, `'transfers'`, `'scores'`, `'commissioner'`. Any reaction or comment with a different key will be rejected by Postgres.
- **CommissionerPanel NewsPostForm** extended: type selector tabs (BREAKING NEWS / CLASSIFIED AD / PIN QUOTE). Below the form: **GENERATE SPECIAL EDITION →** button (gold, calls `supabase.functions.invoke('generate-frontpage-edition', {body:{league_id}})` with the user's JWT — commissioner check happens server-side).

**Key pipeline facts (2026-06-18 — MD1→MD2 transition fixes):**
- **Squad screen no longer falls back to previous round stats** (PR #571): The `fetchSquad` fallback block that loaded the last completed round's fixtures when the current round had no finished fixtures was removed. Between rounds, all players show 0 pts — correct behaviour. Historical scores are in RECAP only. Do NOT re-add a previous-round fallback.
- **Deduction warning gated on fixture status** (PR #570): The client-side `deductionPts > 0` guard before showing the "−N pts" bench dialog now also checks `pitchPlayer.fixtureInfo?.status ∈ ['live','finished']`. If the player's current-matchday fixture hasn't started, the warning is suppressed. The server-side `set_lineup` is still authoritative for the actual deduction.
- **`TransferWindowBanner` `windowType` prop** (PR #572): Banner now accepts a `windowType` prop (from `useTransferWindow`, already returned by `get_transfer_window_status`). Logic: `windowType === 'unlimited'` → "Unlimited transfers"; `isUnlimited && windowType !== 'unlimited'` (i.e. `matchday` natural window) → "Free transfers available · extra buys cost points"; `transfersRemaining !== null` → "N transfers left". `SquadScreen` passes `transferWindow.windowType`.
- **`get_transfer_window_status` returns `window_type='matchday'`** for the natural between-rounds window (no `transfer_windows` row exists for the league — status is computed from fixture timing). `window_type='unlimited'` is only returned when an admin-opened `transfer_windows` row with `window_type='unlimited'` is active.
- **MD1 verified complete** (2026-06-18): `gazette_entries` with `entry_type='activity'` and `matchday_id='429-r1'` exist for every pilot league — confirms `roundComplete=true` fired. `fantasy_points.total` rows for `429-r1` are final. Transfers that advanced squads to `429-r2` did not corrupt MD1 scores — `fantasy_points` is keyed `(squad_id, matchday_id)` and is not modified by transfers.
- **RECAP matchday squares** appear from two sources: (a) past matchdays where `deadline_at <= now`; (b) the upcoming matchday if any of its fixtures are `live`/`finished`. Between rounds, only the completed GW shows. The second square appears the moment the next deadline passes or the first game of the new round kicks off.
- **Split transfers across sessions are fully supported**: `squads.round_transfers` is a cumulative JSONB counter keyed by `matchday_id`. Making 1 transfer now and 2 more later in the same round accumulates to `{"429-r2": 3}` — no penalty as long as total ≤ free limit (default 3).

**Key pipeline facts (2026-06-19 — bench_players snapshot + scoring pipeline hardening):**
- **`points_breakdown.bench_players`** (calculate-scores v28, PR #582): new field stored at `roundComplete` time. Computed as `squad.players.filter(pid => !pitchPlayers.includes(pid))` — relative to the **post-auto-sub effective XI** (`pitchPlayers`), NOT the `baseXI`. This matters because a player auto-subbed from bench into the XI should appear in `effective_xi`, not in both lists.
- **Why not baseXI for bench**: if player X was benched, then auto-subbed IN, `bench = squad.players - baseXI` would include them in both XI and bench. `bench = squad.players - pitchPlayers` correctly excludes them.
- **Historical bench data availability**: `bench_players` is only populated for rounds where calculate-scores v28+ ran at `roundComplete`. Round 1 (429-r1) has no `bench_players` data — the round completed before v28 was deployed, and reconstruction is impossible because transfers have since mutated `squad.players`. Round 1 shows 0 missed pts for SELECTION EFFICIENCY — correct and expected. Accurate data starts from Round 2 onwards.
- **`useLeagueStats.js` bench fix (PR #582)**: `allBenchPids` now reads from `points_breakdown.bench_players` instead of deriving bench as `meta.players.filter(p => !xiSet.has(p))`. The old approach used the current (post-transfer) squad — players transferred IN for Round 2 who played Round 1 fixtures were wrongly counted as Round 1 bench. Rows without `bench_players` return `[]` → 0 missed pts, not wrong data.
- **Selection Efficiency / Missed Pts metric**: opportunity cost per round — for each bench player, `max(0, bench_player_pts - min_starter_pts)`. Only computed for matchdays where ALL fixtures are `status='finished'` (`finishedMatchdays` set in `useLeagueStats`). 0 = bench never would have outscored any starter. Accurate from Round 2 onwards.
- **calculate-scores v29 (PR #583)**: settled-round guard — blocks rescoring of rounds already marked `roundComplete=true` via `gazette_entries(entry_type='activity')`. Prevents accidental point mutations after a round is settled.
- **calculate-scores v30 (PR #584)**: `squad_matchday_snapshots` table — live XI freeze stored per squad per round at the moment a round starts (first `calculate-scores-live` pass after fixtures go live). Enables future per-round squad history queries without relying on mutating `squad.players`.
- **calculate-scores v31 (PR #585)**: additional rescore guard — checks if matchday is settled before writing to `fantasy_points`; complements v29's gazette-based check with a direct `roundComplete` flag read.
- **Bench scores in Recap — BUILT (PR #588, 2026-06-19)**: `RecapView.jsx` now renders bench players below the XI. Settled rounds use `points_breakdown.bench_players`; in-progress rounds approximate `squad.players − starting_xi`. Bench rows have a thin divider + BENCH label and 0.45 opacity. Bench pts are displayed only — never added to `gwTotal`. R1 hides cleanly (no `bench_players` field).

**Key pipeline facts (2026-06-19 — B-10, B-09, BI-03):**
- **B-10: double-GK auto-sub guard (PR #587)** — `isValidFormation()` in `calculate-scores` changed `c.GK >= 1` → `c.GK === 1`. Prevents `applyAutoSubs()` from accepting a bench GK as a valid replacement when the XI already contains a GK. **Deploy required after merge**: `npx supabase functions deploy calculate-scores --project-ref sssmvihxtqtohisghjet`.
- **B-09: bench scores in Recap (PR #588)** — see note above under 2026-06-19 bench_players entry.
- **BI-03: `squad_events` audit table (PR #589, migration 183)** — append-only table capturing every squad mutation. 9 event types: `transfer_buy`, `transfer_sell`, `auction_bid`, `auction_win`, `trade_propose`, `trade_accept` (logged twice — once per squad in the swap), `lineup_swap`, `captain_change`, `draft_pick`. All inserted via `_log_squad_event()` SECURITY DEFINER helper (non-fatal — EXCEPTION WHEN OTHERS → NULL ensures audit failure never blocks a transfer or lineup swap). RLS: commissioners SELECT their league; managers SELECT their own events; no direct client INSERT. Together with `squad_matchday_snapshots` (XI at round start) and `points_breakdown.effective_xi` (XI at round end), provides a complete timeline of every squad state change during a matchday.

**Key pipeline facts (2026-06-13 — Scoring v2 Buckets A+B):**
- **Tournament 429 `scoring_rules` v2** (migration 175, calculate-scores v26): goal points raised (GK 8, DEF 6, MID 5, FWD 4); `big_chance_created`/`interception`/`key_pass`/`shot_on_target`/`tackle` now score for ALL positions (previously DEF/MID/FWD only, varying); MID gets a new `clean_sheet: 1` (60-min gate, same as before for MID); `penalty_missed` is -2 for everyone. New `conceded_2plus_penalty: -0.5` key for GK/DEF — `calculate-scores` applies it as `max(0, goals_conceded - 1) * conceded_2plus_penalty` (only the 2nd+ goal conceded is penalised). GK clean-sheet minutes threshold lowered to 45 (matches DEF) — only MID still requires 60.
- **Bucket C INFEASIBLE (verified 2026-06-17, two live + one finished match)** — Checked Portugal vs Congo DR (live), Argentina vs Algeria (finished), England vs Croatia (live). Conclusive findings: **(a) Free-kick/corner goal** — `goal.detail` is ONLY `"penalty"` or `null` across all three matches, zero free-kick/corner variants seen. **(b) Penalty won/committed** — E9 has an `awarded_penalty` event (seen: England-Croatia min 9, `team_side:"home"`) but **no `player` field** — team attribution only, cannot identify the fouled player. `penalty_won` and `penalty_committed` scoring remain infeasible. **(c) All Bucket C items removed from scoring roadmap** except proxy-MOTM demoted to P3 B-04b. **E9 event types now fully enumerated across three matches**: `goal`, `missed_goal`, `card`, `substitution`, `injury`, `match_start`, `match_end`, `stoppage_time`, `var_decision`, `awarded_penalty`. **v3 ratings are `null` during live match** — only finalize post-match. Proxy-MOTM (`rating` from `/v3/matches/:id/lineups`) must therefore run in the post-match scoring pass (same cron as `calculate-scores-post-match`), not in the live 2-min pass.
- **Ad-hoc rescoring technique** (used for the `429-r1` retroactive rescore): `calculate-scores` is idempotent per `fixture_id` — re-POSTing recomputes `player_match_stats`/`fantasy_points`/`breakdown` and upserts `fantasy_points.total` for `(squad_id, matchday_id)`. To call the deployed function directly: extract the service-role JWT from an existing cron command (`SELECT jobname, command FROM cron.job WHERE jobname IN ('calculate-scores-live', ...)`), then `curl -X POST https://sssmvihxtqtohisghjet.supabase.co/functions/v1/calculate-scores -H "Authorization: Bearer <jwt>" -d '{"fixture_id":"..."}'`. Safe to do mid-tournament as long as the round isn't `roundComplete` yet (gazette/H2H/auto-subs won't double-fire) — `npx supabase functions invoke` is NOT a valid subcommand on this CLI version, use curl.
- **`npx supabase db dump --linked` is broken on this machine** (Docker Desktop unavailable) — for any migration needing a pre-change snapshot, SELECT the specific rows being changed and save to JSON under `backups/` instead of a full dump.

**Key pipeline facts (2026-06-07 session 2 — Trading polish + Live + Bets):**
- **`accept_trade_proposal`** (migrations 151–154, cumulative): (1) POSITION_MISMATCH guard — both players must be same position or call returns error; (2) WINDOW_CLOSED guard — `get_transfer_window_status()` checked before swap, proposals/declines always allowed; (3) Unicode encoding fixed — all emoji/arrows/dashes written via `chr()` to avoid SQL source file encoding corruption (chr(129309)=🤝, chr(8644)=⇄, chr(8212)=—, chr(8364)=€). **Rule: any SQL function writing non-ASCII must use `chr()` not literal characters.**
- **Trade proposals UI**: `useTradeProposals` returns `leagueProposals` (all pending, no squad filter) alongside `incoming`/`outgoing`/`history`. History is league-wide last 14 days (not personal). `TradingView` LEAGUE PROPOSALS section shows all pending trades read-only to third parties; own proposals keep action buttons in INCOMING/SENT sections. MY PLAYER and THEIR PLAYER dropdowns both filter to matching position when either side is pre-filled.
- **captain_id null handling**: `captain_id` defaults to NULL when squads are created via draft lottery (never persisted until manager visits Squad screen). Backfill applied (`SET captain_id = players[1]`). `SquadScreen` now auto-persists first player as captain on load when null. `LiveScreen` falls back to `startingXi[0] ?? squadPlayerIds[0]` when null. The gold C badge in `MiniTok` was also invisible due to `overflow:hidden` clipping — badge moved outside the card div.
- **LiveScreen per-league market status**: `fetchAll` calls `get_transfer_window_status(league_id)` for every user league in parallel (same 60s poll). Each league object gets `windowStatus` + `windowClosesAt`. Displayed on mobile league cards and desktop tabs independently per league.
- **Bet creator — matchday scoping**: `fetchFixtures` and `fetchTeams` in `BetCreatorPanel` now query `matchday_deadlines` first to find the next upcoming `matchday_id` for the tournament, then filter fixtures/teams by that matchday_id. Eliminates the hundreds of `matchday_id=null` global Forza fixtures from tournament 623. Deadline field auto-fills from matchday deadline (`deadlineEdited` ref prevents overwriting manual entries). Match Result enforces single-fixture selection (replace, not append on toggle).
- **`clean_sheet` bet type** (migration 155): slug `clean_sheet`, `answer_type='team_pick'`, `scope_type='match'`. Team list = unique sorted teams from next matchday fixtures. Commissioner selects options; managers pick one team; commissioner manually resolves. `player_block` template marked `is_active=false` and removed from UI (existing `player_block` bets still resolve via commissioner).
- **gazette_entry_type ENUM** (migration 153, corrected in CLAUDE.md note): IS a Postgres ENUM. New values require `ALTER TYPE gazette_entry_type ADD VALUE IF NOT EXISTS '...'` in a migration. Current values: `draft_report`, `breaking_news`, `activity`, `auction_result`, `trade_result`. Missing this causes runtime error on INSERT.
- **Frontpage TRANSFER DESK** (`LeagueScreen.jsx`): now shows both `auction_result` and `trade_result` entries with dynamic TRADE/AUCTION badge label. Previously only `auction_result` rendered despite both being fetched.

**Key pipeline facts (2026-06-07):**
- **Auction two-phase flow** (migration 145): `resolve_auction_listing` no longer auto-transfers. Deadline → `pending_confirmation` + `won_at`. Buyer must call `confirm_auction_win()` during an open transfer window. `SQUAD_FULL` is actionable (listing stays `pending_confirmation`); budget/duplicate failures cancel. On `sold`: `gazette_entries(entry_type='auction_result')` written. `sweep_void_auction_confirmations()` cancels listings where a full window cycle elapsed AND window is currently closed (migration 148 guard: do NOT cancel when window is open). `process_auction_deadlines()` wrapper runs both steps every 5 min. `sell_now` still immediate (seller-triggered, unchanged).
- **confirm_auction_win buyer squad lookup** (migration 149): does NOT filter by matchday_id — uses `ORDER BY created_at DESC`. Squads only advance their matchday_id on transfer, so the lookup must not require the next upcoming matchday_id.
- **accept_trade_proposal points fix** (migration 150): points_sweetener is now debited from proposer AND credited to target. Previously only debited. Also writes `gazette_entries(entry_type='trade_result')` — appears in League Activity (TRADES filter) and Frontpage (TRANSFER DESK section).
- **TRADING tab** (PR #399 + subsequent sessions): replaces AUCTIONS tab, draft leagues only. `TradingView.jsx` — active auctions + `pending_confirmation` won listings with CONFIRM button + trade proposals (incoming/outgoing) + 30-day history for both. `useAuctions` enriches listings with `bidder_name`. `useTradeProposals` enriches proposals with `proposer_name` + `target_name` (batch squad→username lookup). Currency is € throughout. `?` help button inline next to title. Player selects show `[POS] Name · €XM`. Points slider step=1.
- **Gazette ENTRY_META** (`LeagueDetailView.jsx`): maps entry_type to display filter + badge + color. `auction_result` → TRADES/AUCTION/green; `trade_result` → TRADES/TRADE/cyan. Frontpage fetch includes `['activity', 'auction_result', 'trade_result']`.
- **LiveScreen squad display** (PR #395): fetches `starting_xi` alongside `players`; uses it as authoritative XI. Fallback to `pickValidStarters()` for legacy squads. Fixes mismatch between LiveScreen and SquadScreen when user has set a custom lineup.
- **Scoring job timing** (documented 2026-06-07): three crons — `calculate-scores-live` (every 2 min, live fixtures), `calculate-scores-post-match` (22:30 UTC daily, 24h window), `calculate-scores-late-finishers` (23:30+00:30 UTC, 3h window). H2H resolves in the same call as the last fixture, gated on `roundComplete=true`. Auto-sub same gate.

**Key pipeline facts (2026-06-08 — Draft UX session):**
- **`draft_list_size` default is 45** — `leagues.draft_list_size` column default changed from 30 to 45 (migration 156). All draft leagues (classic and H2H) now allow 45 ranked players. `useLeagueConfig.js` DEFAULTS.draftListSize = 45.
- **Drag-and-drop reorder in DraftScreen** (PRs #442–#445): uses `@dnd-kit/core@6.3.1` + `@dnd-kit/sortable@10.0.0` + `@dnd-kit/utilities@3.2.2`. Key implementation decisions: (1) listeners on the **entire row div** (not a small handle span) for reliable mobile grab; (2) `touchAction: 'none'` + `userSelect: 'none'` inline on row — browser can't steal touch events; (3) `modifiers={[({ transform }) => ({ ...transform, x: 0 })]}` on `DndContext` locks ghost to vertical axis only; (4) `DragOverlay` ghost constrained to `width: 320px, maxWidth: 85vw` to prevent full-viewport expansion in portal. ▲▼ buttons kept as fallback. Revert tag `pre-dnd-reorder` on origin. P3 backlog item B-01 added for future drag-from-pool enhancement.
- **`ScoringInfoModal` uses `createPortal`** (PR #448): **Rule for all modals going forward.** `AppLayout#main-content` has `WebkitOverflowScrolling: 'touch'` which creates a new stacking context on iOS Safari — `position: fixed` children are positioned relative to that scroll container, not the viewport, making bottom sheets invisible. `createPortal(modal, document.body)` bypasses all parent stacking contexts entirely. Any new modal/sheet with `position: fixed` MUST use `createPortal`.
- **Scoring `?` button**: added to Draft screen (next to "Your List — X/45") and Market screen (left of X/15 SQUAD indicator). Both open `ScoringInfoModal`. Pattern: `const [showScoringModal, setShowScoringModal] = useState(false)` + circular button + `{showScoringModal && <ScoringInfoModal onClose={...} />}` as last child of the root div.
- **Minutes scoring clarification**: `minute_per_90 = 1` (hardcoded fallback; not in DB `scoring_rules`). Formula: `(minutes_played / 90) * 1` — proportional, not flat. Full 90 min = 1 pt, 45 min = 0.5 pt, sub appearance of 15 min = 0.17 pt. Individual player pts can be decimal; squad total is `Math.round(total)` before DB write.

**Key pipeline facts (2026-06-08 — Scoring v2 + Chips hidden + Club cap):**
- **Scoring v2 (calculate-scores v24, migration 157b)** — tournament 623 rules updated: GK goal +6 (was +5); DEF clean sheet requires 45+ min (GK/others still 60 min); MID shot_on_target +0.25; FWD big_chance_created +0.5; penalty_missed −2 (all positions); minutes now scored per-60 not per-90 (`pts += (mins / 60) * UNIVERSAL.minute_per_90`). Edge Function reads position-specific threshold: `const csMinThreshold = pos === 'DEF' ? 45 : 60`.
- **Chips hidden for pilot** (PR #452): Triple Captain + Matchday Joker activation buttons removed from all SquadScreen surfaces using `{false && ...}` wrappers (chips tab, tools tab, wizard modal, joker picker). Scoring code untouched — chips can be re-enabled post-pilot by removing the `false &&`. No chip activation UI exists on any other screen (LiveScreen shows informational display only).
- **`club_cap_rules` table** (migration 158, PR #452): round-specific club cap stored in `(tournament_id, round_suffix, cap, label)`. Edit a single row to change any round's cap. Seeded for 429 + 623: r1-r4=3, r5=4, r6-r7=5, r8=6. `get_club_cap(p_league_id, p_matchday_id DEFAULT NULL)` — when `p_matchday_id` provided, extracts `split_part(matchday_id, '-', 2)` as round_suffix and looks up table; falls back to cup-based logic. Callers: `MarketScreen` (client fetch on load), `process-transfer` Edge Function (passes activeMatchdayId), `run-draft-lottery` (still uses default, returns group-phase cap = 3).
- **Penalty transfers** (migration 157, PR #450): `execute_transfer_atomic` — only BUYs count against per-round limit; SELLs are free. Over-limit buys allowed; cost tracked in `squads.penalty_transfers JSONB` (`{ "623-r3": 2 }` = 2 penalty buys). Deducted at scoring by calculate-scores v23 via `transfer_penalty` league_config key (default 4 pts flat; supports escalating array `[1,2,4]`). MarketScreen shows transfer quota chip (green→amber→red) + ⚠️ toast before each penalty buy.
- **Migration numbering note**: two `156_` and two `157_` files exist on disk due to concurrent work in the same session. Numbered 156b and 157b in this table for clarity. The DB was applied correctly via direct `db query --linked` calls; Supabase migration history is not used in this project.
- **ScoringInfoModal two-tab layout** (PR #451): Tab 1 = scoring rules (all updated values, minute-threshold notes per row); Tab 2 = squad rules (formation limits, dynamic club cap schedule by round, transfer rules). Uses `createPortal` — see PR #448 rule.
- **DraftScreen club filter** (PR #451): horizontal scrollable chip row replaced with searchable dropdown multi-select (`filterClubs` Set state + `showClubPicker` + `clubSearch`). Same UX pattern as MarketScreen team picker.
- **MarketScreen price filter** (PR #451): `priceMin` / `priceMax` number inputs (step=0.5) above position tabs; Reset button visible when active; filter applied in `filteredPlayers` useMemo.

**Key pipeline facts (2026-06-09 — Transfer basket UX + penalty visibility):**
- **Transfer basket paired rows** (PR #472): basket list shows `OUT ⇄ IN` on the same line (sell paired with buy); unpaired side shows `—`; header count = `max(sells, buys)` transfers, not total items; red `−Npts` in header when basket has over-limit buys; player card button renamed `BUYING` (was `QUEUED`).
- **`penaltyPointsCost` useMemo** (MarketScreen): pre-computes transfer penalty cost from basket state, used in both the header transfer quota chip and the basket footer — do not compute inline in JSX.
- **Transfer penalty deduction in `points_breakdown`** (PR #473, calculate-scores redeployed): `penaltyDeduction` now stored as `points_breakdown.transfer_penalty_deduction` when > 0, written only on `roundComplete` pass. Previously baked silently into `total` with no audit trail.
- **RecapView penalty display** (PR #473): fetches `points_breakdown` alongside `total`; builds `penaltyMap`; GW score sub-label shows red `−8 XFER` (mobile) / `−8 PENALTY` (desktop); expanded player breakdown shows a red "Transfer Penalty — extra buys −8" footer row.
- **Penalty timing**: deduction is applied at `roundComplete=true` only — not during live scoring, not on transfer confirmation. `points_breakdown.transfer_penalty_deduction` is absent until the round settles. The `−Npts` basket warning is always informational; there is no points-balance block on transfers.

**Key pipeline facts (2026-06-10 — Auto-fill basket staging + transfer quota):**
- **`useAutoFill` is basket-staging only** (PR #479): `buy` param replaced with `addToBasket(player)` — no backend calls during fill. Effective squad and budget are computed from basket state: pending sells free slots+budget, pending buys occupy them. `addToBasket(candidate)` called synchronously; `budgetLeft -= candidate.price` tracked locally. Result message: "Added N players to basket — review and confirm". Basket UX contract: FILL never commits anything — user reviews and clicks Confirm once for the whole basket.
- **`preCompetition` state** (PR #481, `MarketScreen`): `COUNT(*) FROM fixtures WHERE tournament_id=X AND status IN ('live','finished')` — lightweight HEAD request in `fetchData`. If count=0, `preCompetition=true` → transfers are unlimited. Clears automatically once first fixture goes live. Do NOT infer competition state from `activeMatchdayId` or deadline dates — check actual fixture statuses.
- **Three unlimited-transfer rules** (all enforced in `isUnlimited` JSX variable and `penaltyPointsCost` useMemo): (1) `mySquad?.initial_build_complete === false` — squad still being built; (2) `preCompetition === true` — no fixture has gone live yet; (3) `transferWindow?.windowType === 'unlimited'` — admin opened a free window. All three cases: quota chip shows `∞ free`, basket hides `-Xpts`, no penalty applied at scoring.
- **`penaltyPointsCost` useMemo guards** (PR #480): returns 0 for all three unlimited cases above; `transferWindow` added to dependency array. Never show penalty pts to a user who has unlimited transfers.
- **Migration 160** (`160_fix_classic_draft_list_size.sql`): fixes `draft_position_caps` default and patches existing leagues whose caps summed to 30 ({GK:4,DEF:10,MID:10,FWD:6}) instead of 45 ({GK:6,DEF:15,MID:15,FWD:9}). Migration 156 only patched `league_mode='draft'` leagues — classic-mode leagues were missed. Rule: whenever changing `draft_list_size`, always check `draft_position_caps` sums to the same value.
- **Next migration**: `159_` was already applied (set_lineup active matchday fix). **Next new migration file**: `161_`.

**Key pipeline facts (2026-06-11 — Recap bet/trade indicators + fixture-timing on pitch + transfer-window exemption):**
- **Recap bet-win indicator** (PR #497): My Digest GW score rows show a gold `+N BET` line when a manager won a resolved points-bet that round. `bet_instances` has no `matchday_id` — attribution uses deadline-based clamping: a bet is assigned to the first matchday whose deadline is ≥ the bet's `deadline_at`/`resolves_at`/`created_at`, clamped to the last known matchday if it resolves after all deadlines. `PlayerBreakdown` shows one "Bet won — <title> +N" footer row per resolved bet.
- **RECAP TRADING line** (PR #499): same GW score rows also show a TRADING line — net points from `trade_proposals` where `status='accepted'` and `points_sweetener > 0`, attributed to the matchday in which the trade was accepted. Gold for the receiving manager, red (`-N TRADE`) for the giving manager. No per-trade segregation — multiple trades in the same round net into one line. `PlayerBreakdown` gets a parallel "Trade" footer row.
- **Squad fixture-timing indicator** (PRs #497/#498/#499): `buildFixtureInfo`/`formatFixtureStatus` (`src/lib/players.js`, locale hardcoded `'en-GB'`) match a player's `club`/`nationality` against the squad's *current matchday only* fixtures, returning `{label, color}` for LIVE/FT-score/scheduled-kickoff or `null` if no fixture this round. `SquadScreen.mappedPlayers` computes `player.fixtureStatus` once per player. PR #499 extended the display (originally desktop LIST tab only) to: `PitchView`/`HybridToken` tokens (desktop + mobile pitch, small 8px line with `overflow:hidden`/`ellipsis`/`nowrap` to fit the cramped pitch token), the desktop bench strip, and the mobile squad LIST tab rows. `PlayerCard.jsx`'s unused "pitch" variant had dead duplicate fixture-status code (added by #497, never rendered since only `variant="row"` is used) — removed in #499.
- **Transfer-window exemption for never-completed squads** (PR #500, `supabase/functions/process-transfer/index.js`, deployed 2026-06-11 19:00 UTC): squads with `initial_build_complete=false` (e.g. left short by a draft lottery run after a matchday started, or pool/no-repeat exhaustion) were still hard-blocked by the `WINDOW_CLOSED` check even though the per-round transfer-limit exemption already applied to them. The window-closed gate is now skipped for these squads — the cost-lock (live-fixture price freeze) check still applies. Uses the existing one-way `initial_build_complete` latch, so it never re-applies once a squad completes and later sells below full size.
- **Fixture-timing label format updated** (PR #505): `formatFixtureStatus` scheduled-fixture label is now `Mon 15/06 22h00` (day + DD/MM + HHhMM), was `Mon 22:00`. Date/time parts built from `getDate()`/`getMonth()`/`getHours()`/`getMinutes()` (locale-independent); weekday still via `toLocaleDateString('en-GB', {weekday:'short'})`.
- **TRADING tab mobile/auction polish** (PR #503): mobile Squad LIST tab now has the same AUCTION listing button as desktop's `<PlayerList />` (row wrapper changed from `<button>` to `<div role="button" tabIndex={0}>` to allow nesting the AUCTION `<button>`). `AuctionCard` shows "Listed by \<manager>" (new `seller_name` enrichment in `useAuctions`, via `squads → users(username)` join on `seller_id`) alongside the existing bidder name.

**Key pipeline facts (2026-06-10 — RECAP tab GW breakdown + Live stats window):**
- **LiveScreen stats window** (PR #483): was `kickoff_at >= NOW()-6h` → missed overnight games (Argentina 00:30 UTC shows 0 pts if checked at 08:00). Fixed: primary path fetches all `status='finished'` fixture IDs for `activeMatchdayIds`; 6h window kept only as fallback when no active matchday is known.
- **MY DIGEST live matchday card** (PR #484): `RecapScreen.jsx` (standalone screen, Recap nav icon) now shows a `LiveMatchdayCard` pinned above the gazette feed when `roundComplete=false`. Per-fixture sections list the manager's starting XI with position, name, captain badge, minutes, pts. Uses `player.nationality` matched to `fixtures.home_team`/`away_team` for international tournaments. Upcoming fixtures show "NO FIXTURE" footer.
- **RecapView `starting_xi` fix** (PR #485): `toggleBreakdown` in `src/components/league/RecapView.jsx` was calling `players.slice(0, 11)` — the raw squad array in insertion order. Bench players at positions 0–10 appeared while actual starters (set via `set_lineup`) were missing. Fix: fetch `starting_xi` alongside `players`; use `starting_xi` when non-empty, fall back to `players.slice(0,11)` only for legacy squads that never called `set_lineup`.
- **RecapView squad ORDER BY** (PR #486): `toggleBreakdown` used `ORDER BY created_at ASC` (oldest row first). Managers who made transfers (which creates a new squad row) got stale data. Fixed to `DESC`.
- **`RecapView.toggleBreakdown` data contract**: fetches `player_match_stats` for ALL fixture IDs of the selected matchday (including upcoming). Finished games → real pts + minutes. Upcoming games → `hasStats=false` → shows `—` in MIN and PTS columns. Captain multiplier is in `fantasy_points.total` (not in `player_match_stats.fantasy_points`) — player breakdown shows raw per-player pts pre-multiplication.

**Key pipeline facts (2026-06-10 — Squad screen sub-in fix):**
- **`createPortal` on player action bottom sheet** (PR #474): The bottom sheet and tap-outside overlay in `SquadScreen` were `position: fixed` inside `AppLayout#main-content` which has `WebkitOverflowScrolling: touch`. On iOS Safari this creates a new stacking context where z-indices are evaluated locally — the overlay (z-[59]) could intercept taps meant for the button (z-[60]), clearing `selectedPlayer` before the user could tap a starter. Fix: `createPortal(content, document.body)` on the full fragment (overlay + sheet). **Rule: ALL `position: fixed` modals and bottom sheets must use `createPortal` — this is a repeat of the ScoringInfoModal fix from PR #448.**
- **Sub direction**: After the portal fix, bench→starter (SUB IN) and starter→bench (SUB OUT) both work symmetrically. The `handleSwap` logic was always correct; only the DOM event interception was wrong.
- **FIXTURE_COMPLETED message**: When a bench player's match has ended this round, toast now says "They'll be available next round" so managers understand it's a per-round gate, not a permanent block.
- **GW label**: `squadData.matchdayId` format is `'{tournament}-r{N}'`. Display as `GW{N} PTS` (e.g., `GW4 PTS`) using `matchdayId.split('-r')[1]`. The raw `GW 623-r4` label was confusing.

**Key pipeline facts (2026-06-09 — UI cleanup):**
- **Supabase `PostgrestFilterBuilder` `.catch()` rule**: The builder implements `PromiseLike` (has `.then()`) but NOT `.catch()`. Calling `.catch()` on a query builder throws `TypeError: catch is not a function` synchronously inside React effect cleanups, which React catches as a render error → ErrorBoundary. **Always use `.then(null, errorHandler)` for fire-and-forget error swallowing. Never use `.catch()` on a Supabase query.**
- **`ScoringInfoModal` — 3 tabs** (PR #465): SCORING · SQUAD RULES · GAME RULES. `initialTab` prop opens it on a specific tab. All `?` buttons across the app now open this modal — Squad header, Squad LIST, Squad mobile PITCH, Market title, Live Centre header, Draft list. No screen should still have a `?` opening the onboarding tour (those have all been replaced/removed).
- **`CHIPS_ENABLED` constant** (`SquadScreen.jsx` line 56): `const CHIPS_ENABLED = false`. All chip activation UI (Triple Captain, Matchday Joker) is gated behind this. Set to `true` to re-enable post-pilot. Using `false &&` literal (not the constant) triggers the `no-constant-binary-expression` ESLint rule — always reference the named constant.
- **`OnboardingTour` visible-element fix** (PR #466): `getRect` and `waitForElement` now use `querySelectorAll` and iterate to find the first element with non-zero `getBoundingClientRect` dimensions. Previously `querySelector` returned the first DOM match, which could be a `hidden lg:block` element with zero dimensions on mobile. The zero-dimension fallback sent the tooltip to `position: fixed; top: 50%; left: 50%` which is off-screen under iOS WebKit's scroll stacking context. Rule: whenever two elements share a `data-tour` attribute (responsive show/hide pattern), the tour finds the visible one automatically.
- **`?` button placement convention**: one `?` per screen/view, in the title/header area. Opens `ScoringInfoModal`. Do NOT add a second `?` elsewhere on the same screen — the history has had to consolidate duplicates twice (PR #465 added extras, PR #466 removed them).

**Key pipeline facts (2026-06-08 — Live UX polish):**
- **Scoring flow summary** (canonical reference): (1) Fixture goes live → `calculate-scores-live` every 2 min → `player_match_stats` + `fantasy_points` updated in DB (running matchday total). (2) Fixture ends → post-match/late-finishers cron finalises `fantasy_points` for that fixture, accumulated into the matchday row via UPSERT. (3) All fixtures in the round `finished` → `roundComplete=true` → gazette `activity` entry written + H2H resolved. Gazette and H2H never fire mid-matchday.
- **`fantasy_points` accumulation**: one row per `(squad_id, matchday_id)` — UPSERT on conflict. Each fixture run fetches `player_match_stats` from all OTHER fixtures in the same round and merges them into the total. So after fixture 2 of 3 finishes, the row contains pts from fixtures 1+2. This is the source for the Live tab GW pill and Recap tab partial scores.
- **Live tab `DeltaPill`** (PR #432): `delta` on each enriched league object is now the current GW total from `fantasy_points` (fetched for `activeMatchdayIds` per tournament). Shows `+N GW`. `null` (no data yet) renders `— GW`. Previously hardcoded to 0. Requires `squads.id` in the squads select query.
- **Recap tab active matchday** (PR #432): `RecapView` Effect 1 fetches the next upcoming deadline in addition to past ones. If any fixture for that matchday has `status IN (live, finished)`, the matchday is appended to `allMatchdays` with `isLive: true`. `MatchdayNav` renders it with a red dot. Score rows show `~N` prefix + red `LIVE` sub-label when `isLiveRound`. Both clear when the deadline passes (round moves to past matchdays list). No new DB tables required — reads existing `fantasy_points`.
- **Gazette headline** (PR #431): `writeGazetteEntries` in `calculate-scores` uses `GW N — Matchday complete — X leads with Y pts` (not the fixture name). The fixture name was misleading because the cron fires once per fixture but pts represent the full round total.

**Key pipeline facts (2026-06-05):**
- `calculate-scores` uses `scoring_rules` table (not `scoring_templates`) keyed by `tournament_id`
- `calculate-scores` (session 78): chips are derived **per-round** — triple captain from `chips_used` (chip_type='triple_captain' AND matchday_id=roundMatchdayId), joker from `daily_jokers` (matchday_id=roundMatchdayId). The persistent `squads.is_triple_captain`/`joker_player_id`/`is_wildcard` columns are NOT read for scoring (they were never reset and re-fired every round). Wildcard +10% is removed entirely. Scoring dedups to **one squad row per (league,user) per round** (prefer exact-round matchday_id, else most recent) to avoid multi-counting per-gameweek rows. `verify_jwt: false`; requires service-role key OR valid user JWT; uses `starting_xi` with fallback to `players[0..10]`; multiplier rule `Math.max(captainMult, jokerMult)` — chips do not stack
- `calculate-scores` writes a `gazette_entries` row (`entry_type='activity'`) per league after scoring — **only when `roundComplete = true`** (all fixtures in the round are finished). Idempotent: deletes existing row for `(league_id, entry_type='activity', full_data->>'matchday_id')` and reinserts. Headline format: `GW N — Matchday complete — X leads with Y pts` (PR #431: fixture name removed — pts are always the full matchday total, not one match). Bullets: ranked list `🥇 Manager N pts this GW`.
- `calculate-scores` stores integer points: `Math.round(total)` — no decimals in `fantasy_points.total`
- `fantasy_points` column for squad total is `total` (not `total_points`) — integer
- `fantasy_points.matchday_id` format: `'{tournament_id}-r{round}'` e.g. `'426-r35'`
- `matchday_deadlines.matchday_id` format: `'426-rN'` (canonical, written by `sync-fixtures`)
- **Knockout `round_number`** (migration 126): Forza does NOT number knockout matches — `sync-fixtures` writes `round_number = m.round ?? null` = NULL for them, which makes `calculate-scores` hard-fail ('critical', rollup skipped). The `derive_fixture_round_number()` BEFORE INSERT/UPDATE trigger re-fills `round_number` from `fixtures.matchday_id` (`'{tournament}-rN'`) on every write — `sync-fixtures` never writes `matchday_id`, so it survives the 30-min sync and the trigger keeps `round_number` populated. **Do NOT clear `fixtures.matchday_id` on knockout rows, and do NOT rely on a one-off `round_number` UPDATE** (the cron re-nulls it). For WC 429: r4=R32, r5=R16, r6=QF, r7=SF, r8=Final+3rd. A new tournament's knockout needs `matchday_id` seeded the same way before its first knockout match scores.
- `bet_submissions` uses `bet_instance_id` column (not `bet_id`) — references `bet_instances(id)`
- `gazette_entries.entry_type` is a **Postgres ENUM type** (`gazette_entry_type`). Current values: `draft_report`, `breaking_news`, `activity`, `auction_result`, `trade_result`. To add a new value you MUST run `ALTER TYPE gazette_entry_type ADD VALUE IF NOT EXISTS 'new_value';` in a migration — failing to do so causes a runtime error on INSERT. Also register in `ENTRY_META` in `LeagueDetailView.jsx`.
- `gazette_entries` INSERT: commissioners only (RLS policy, migration 103); SELECT: league members (is_league_member)
- `gazette_entries.bullets` field is NOT always `string[]` — shapes vary by type:
  - `activity`: `string[]` (e.g. `"🥇 TestComm  8 pts this GW"`)
  - `breaking_news`: `{text: string}[]`
  - `draft_report`: `{player_id, wanted_by, winner_id}[]` (contested picks) + optional `{text}` trailing item
  - older rows: `bullets` stored as a JSON-encoded string (not parsed JSONB)
  - Always use `normalizeBullets()` from `RecapScreen.jsx` before rendering; never render bullets directly
- **Cron names** (active in prod): `sync-wc-fixtures-30m` (every 30 min), `calculate-scores-post-match` (22:30 UTC daily, 24h window), `calculate-scores-late-finishers` (23:30 + 00:30 UTC, 3h window — catches late WC finishers), `ingest-match-events-live` (every 5 min — session 78: now selects `status='live'` OR `status='finished' AND kickoff_at > NOW()-3h`, so the final-whistle pass is guaranteed), `flip-fixtures-live` (session 78, every 2 min — flips `scheduled→live` off `kickoff_at`, independent of fixture sync), `calculate-scores-live` (every 2 min, `status='live'` — all now use service-role JWT), `sync-wc-players-6h`, `resolve-finished-bets`, `sync-cup-eliminations`, `run-reverse-standings-draft` (session 78: now has cron-batch mode for the knockout elimination draft), `auto-close-bets` (hourly), `prune-error-logs`, `resolve-expired-auctions`, `cron_job_status` helper
- **`run-draft-lottery` cron is DISABLED** (pilot session): cron set `active=false` via `cron.alter_job`. Lottery is always manually triggered by the commissioner via Admin tab → Draft → Run Allocation button. The Edge Function still supports both modes: commissioner call (with `{league_id}` body + user JWT) and cron/batch mode (empty body `{}`). Do NOT re-enable the cron without explicit product decision.
- **Wildcard chip fully retired** (session 78): the +10% scoring multiplier is removed from `calculate-scores`, `activate_chip` rejects `chip_type='wildcard'`, and all `is_wildcard` flags were cleared. The `squads.is_wildcard` column still exists but is inert. Do NOT re-introduce a wildcard without a defined, disclosed effect. (Originally hidden from UI in session 66.)
- **Chips never auto-reset on the squad row** — `activate_chip` sets `is_triple_captain` permanently and the joker is mirrored onto `squads.joker_player_id` but never cleared. Session 78 made scoring ignore those persistent columns and derive chips per-round from `chips_used`/`daily_jokers` instead. If you add new scoring code, read chips per-round — do NOT trust the persistent squad columns.
- **place_bid** (migration 111): budget reservation — sums all open winning bids before accepting new bid; `v_reserved` = SUM of current_bid on other open auctions where caller is `highest_bidder_id`; new bid rejected if `budget_remaining - v_reserved < p_bid_amount`
- **process-transfer** recovery window fix: if squad not found for `activeMatchdayId`, falls back to most recently created squad for the league (`ORDER BY created_at DESC`) before creating a new empty one; `execute_transfer_atomic` called with `squad.matchday_id` not `activeMatchdayId` — ensures transfer limits tracked for correct round
- `squads` **direct client writes** (migration 123 `guard_squad_protected_columns` trigger): a client (authenticated/anon) may only set `captain_id`, `starting_xi`, `lineup_locks`, `joker_player_id`, `is_triple_captain` and **reorder** `players` (same set). `budget_remaining`, `user_id`, `league_id`, `matchday_id`, `round_transfers`, and roster add/remove are BLOCKED for direct writes — they change only through SECURITY DEFINER RPCs (`execute_transfer_atomic`, `set_lineup`, `claim_draft_player`, `accept_trade_proposal`), which run as owner and bypass the guard. Do NOT add client code that writes those columns directly; route through an RPC. (Closes a proven P0: clients previously had table-wide UPDATE and could set their own budget/roster.)
- **Draft picks** go through `claim_draft_player(p_league_id, p_player_id, p_phase)` (advisory-locked per league+phase → no concurrent double-claim; validates uniqueness/budget/position; materializes the squad when complete). The client no longer writes `draft_allocations`/`squads` directly during recovery.
- `squads.starting_xi` TEXT[] — the 11 player IDs that score this round; empty `{}` → scoring falls back to `players[0..10]`
- `squads.lineup_locks` JSONB — `{ matchday_id: [player_id, ...] }` — players subbed out, cannot re-enter XI until next matchday
- `squads.round_transfers` JSONB — `{ matchday_id: count }` — buy+sell transfers used per round; enforced by `execute_transfer_atomic`
- `set_lineup(p_squad_id, p_player_out, p_player_in)` — atomic RPC to swap starters/bench; enforces lock, fixture-complete, formation rules; deducts points if scorer subbed out
- `lock_lineups_for_fixture(p_fixture_id)` — called fire-and-forget by `ingest-match-events`; adds XI players with started fixtures to `lineup_locks`
- **Auto-subs (session 78)**: `calculate-scores` replaces DNP starters (0 minutes) with the highest-priority bench player who played, keeping formation valid (1 GK / 3–5 DEF / 2–5 MID / 1–3 FWD) — but ONLY once every fixture in the round is finished (`roundComplete`). During live scoring the XI is scored as-is. Bench priority = `squads.players` array order.
- **Captain reassignment (session 78)**: if the captain isn't in the (auto-subbed) XI, the bonus moves only to a starter who scored **> 0** — never onto a negative score. An actual captain who played and scored negative still gets the ×2/×3 (standard).
- `resolve_bet` (migration 134): commissioners can resolve any bet at any time regardless of deadline — the `BET_STILL_OPEN` guard now only fires for the auto-resolve cron (`auth.uid() IS NULL`). Commissioner check runs BEFORE the deadline check. The draft deadline on bets is informational (submission window), not a resolution gate.
- **Draft gate (pilot session)**: simplified to a single question — did the lottery run for this league? Check: `SELECT COUNT(*) FROM draft_allocations WHERE league_id=X AND allocated_players IS NOT NULL`. If count > 0 → squad management screen. If 0 → draft submission screen. No per-user allocation check, no unresolved_slots routing, no recovery screen in the main flow.
- **Draft deadline is informational** (migration 133): the `draft_deadline_check` trigger on `draft_submissions` is dropped. Managers can submit/update their wish list any time until the commissioner triggers the lottery. The deadline field in the admin is displayed as a suggested window but has no technical effect.
- **Transfer window** (migration 135): `get_transfer_window_status` closes for the full matchday duration. Reopen = `MAX(kickoff_at for current matchday) + 2h + 6h`. Both WC/cup leagues (matchday-deadline path) and classic leagues without manual `transfer_windows` rows use this automatic logic. The 8h total from last kickoff is the natural fallback for stuck fixtures.
- **AUTH_ENABLED** (pilot session): `AuthContext` now uses `VITE_AUTH_ENABLED === 'true'` only — the previous `|| import.meta.env.PROD` fallback was removed. Vercel production has `VITE_AUTH_ENABLED=true` set explicitly. CI E2E builds with `VITE_AUTH_ENABLED=false` now correctly use demo mode.
- **Known scoring approximations (documented, not bugs to fix pre-pilot)**: `penalty_saved` is inferred from opposing *missed* penalties (no save-specific Forza signal — can over-credit on posts/shootouts; low group-stage impact); starter minutes default to 90 (extra-time not represented); abandoned/cancelled matches map to `finished`. `set_lineup`'s point deduction is an interim value that the next `calculate-scores` recompute overwrites correctly.
- **Draft + H2H mode** (migrations 136–138, PRs #362–#364): `leagues.h2h_enabled boolean DEFAULT false`. `h2h_schedule` table stores both schedule (scores null) and results (scores + h2h_pts + resolved_at). H2H scoring config in `league_config`: `h2h_win_pts` (default 5), `h2h_draw_pts` (default 2), `h2h_loss_pts` (default 0). `generate_h2h_schedule(p_league_id, p_start_matchday_id)` — commissioner-only, Berger circle round-robin, handles odd manager count (bye = auto-win), sorts members by `user_id`. `get_h2h_standings(p_league_id)` — returns W/D/L/pts/rank. H2H resolution runs inside `calculate-scores` after `rollupSquads` gated on `roundComplete = true` (all round fixtures finished) — safe for multi-day WC matchdays. `create_league` updated with `p_h2h_enabled boolean DEFAULT false`. UI: `leagueFormat === 'noduplicate_h2h'` maps to `p_format='noduplicate' + p_h2h_enabled=true`. H2H tab is slot 2 (after BOARD). Leaderboard and Recap show H2H pts column (gold) next to TOTAL when h2h_enabled. Frontpage shows scoring + H2H activity entries in a "LATEST SCORES & H2H RESULTS" section. Architecture doc: `docs/architecture/H2H_COMPETITION_DESIGN.md`.

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
