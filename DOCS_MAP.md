# Documentation Map — Forza Fantasy League

Complete index and overview of all project documentation organized by purpose and audience.

---

## Root-Level Documentation (Project Core)

**Current Session & Progress**
| File | Purpose | Audience | Last Updated |
|------|---------|----------|--------------|
| [BACKLOG.md](BACKLOG.md) | Session progress, completed features, post-MVP gaps | Team/PM | Session 58 (2026-05-31) |
| [CLEANUP_REPORT.md](CLEANUP_REPORT.md) | Git cleanup analysis, Notion verification, documentation audit | Dev team | 2026-05-17 |
| [CODE_REVIEW_REPORT.md](CODE_REVIEW_REPORT.md) | Recent code quality assessment and findings | Developers | 2026-05-16 |

**Project Instructions & Setup**
| File | Purpose | Audience | Status |
|------|---------|----------|--------|
| [README.md](README.md) | Project overview, quick-start, feature summary | New users | Current |
| [CLAUDE.md](CLAUDE.md) | **REQUIRED** — Instructions for Claude Code (AI), tech stack, git workflow, repo structure | Developers & AI | Authoritative |
| [GEMINI.md](GEMINI.md) | Instructions for Google Antigravity (mobile AI) — iOS/Android native development | Google AI | Current |

**Product & Strategy**
| File | Purpose | Audience | Last Updated |
|------|---------|----------|--------------|
| [BACKLOG.md](BACKLOG.md) | Session progress, completed features, POST-MVP roadmap (contains product strategy) | Team/PM | Session 58 (2026-05-31) |

**Deployment & Launch**
| File | Purpose | Audience | Last Updated |
|------|---------|----------|--------------|
| [APP_STORE_ASSESSMENT.md](APP_STORE_ASSESSMENT.md) | iOS/Android app store readiness, submission checklist | Mobile team | Current |

---

## Organized Documentation Folders

### 📋 **docs/architecture/** — System Design & Technical Foundation

Detailed documentation of core systems and how they work.

| File | Purpose | Key Sections |
|------|---------|--------------|
| [DRAFT_SYSTEM_DESIGN.md](docs/architecture/DRAFT_SYSTEM_DESIGN.md) | Draft lottery, league modes (Classic/Draft), cup format, relaxation formulas | Allocation engine, no-repeat rules, club cap, two-phase draft |
| [TRANSFER_WINDOW_SYSTEM.md](docs/architecture/TRANSFER_WINDOW_SYSTEM.md) | Unified transfer window model for all league and competition types | Auto open/close, config table, transfer limits, wildcard round |
| [STARTING_XI_AND_BENCH.md](docs/architecture/STARTING_XI_AND_BENCH.md) | Starting XI selection, bench, points deduction, lineup change rules | set_lineup rules, lock mechanic, scoring model |
| [FANTASY_POINTS_SCORING_LAYER.md](docs/architecture/FANTASY_POINTS_SCORING_LAYER.md) | Scoring formula, DB schema, point calculations | EPL point values, position multipliers, bonus rules |
| [APP_DYNAMICS.md](docs/architecture/APP_DYNAMICS.md) | Live match updates, real-time subscriptions, Joker chip | Realtime architecture, match state machine |
| [FORMATION_RULES.md](docs/architecture/FORMATION_RULES.md) | 11-player pitch validation rules | Position constraints, squad balance, constraints |

### 🧪 **docs/testing/** — Test Strategy & Coverage

Testing frameworks, test automation, and quality assurance.

| File | Purpose | Key Content |
|------|---------|------------|
| [README.md](docs/testing/README.md) | Testing framework index | Test tiers, CI/CD overview, getting started |
| [TESTING_STRATEGY.md](docs/testing/TESTING_STRATEGY.md) | Comprehensive testing approach | Playwright config, test organization, best practices, debugging |
| [E2E_TEST_PLAYBOOK.md](docs/testing/E2E_TEST_PLAYBOOK.md) | E2E test execution guide | Running tests locally, CI integration |
| [TEST_RESULTS.md](docs/testing/TEST_RESULTS.md) | Historical E2E test results & coverage | Test data, bug findings, session records |

### 📦 **docs/product/** — Product Strategy & Roadmap

Product roadmap, sprint planning, and business strategy.

| File | Purpose | Key Content |
|------|---------|------------|
| [README.md](docs/product/README.md) | Product documentation index | Current status, phases, timeline |
| [PIPELINE.md](docs/product/PIPELINE.md) | Sprint roadmap and delivery timeline | Phase 1–3, release dates, feature priority |
| [12_MONTH_ROADMAP_2026_2027.md](docs/product/12_MONTH_ROADMAP_2026_2027.md) | Year-long strategic vision | Q2 2026–Q2 2027 planning (archived, reference) |

### 📚 **docs/reference/** — Quick Lookup & Developer Guides

Developer setup, conventions, and best practices.

| File | Purpose | Key Content |
|------|---------|------------|
| [README.md](docs/reference/README.md) | Reference guides index | Quick navigation, common workflows |
| [LOCAL_DEVELOPMENT.md](docs/reference/LOCAL_DEVELOPMENT.md) | Local environment setup | Prerequisites, one-time setup, daily commands, debugging |
| [CONVENTIONS.md](docs/reference/CONVENTIONS.md) | Code style & naming conventions | JS/React, SQL, CSS, Git, ESLint rules |
| [MOBILE_DEVELOPMENT.md](docs/reference/MOBILE_DEVELOPMENT.md) | iOS/Android Capacitor implementation | Setup, native plugins, build & store submission |

### 🔌 **docs/api/** — External Integrations & API Reference

How we integrate with external data providers (Forza Football, etc).

| File | Purpose | Key Content |
|------|---------|-------------|
| [FORZA_API_ASSESSMENT.md](docs/api/FORZA_API_ASSESSMENT.md) | Forza Football API endpoints, gaps, workarounds | Available endpoints, missing features, authentication |
| [API_INTEGRATION_REFERENCE.md](docs/api/API_INTEGRATION_REFERENCE.md) | How we consume the API | Request patterns, data shapes, error handling |
| [FIT_GAP_ANALYSIS.md](docs/api/FIT_GAP_ANALYSIS.md) | Feature gaps vs Forza API capabilities | Missing endpoints, fallback strategies |
| [FORZA_API_KNOWLEDGE.md](docs/api/FORZA_API_KNOWLEDGE.md) | API authentication, rate limits, best practices | Security, performance, reliability |

### 🎨 **docs/brand/** — Visual Identity & Design System

Design tokens, branding guidelines, and component specs.

| File | Purpose | Key Content |
|------|---------|-------------|
| [BRANDING.md](docs/brand/BRANDING.md) | Brand identity, color palette, typography, spacing | Color codes, font families, design tokens |
| [FORZAKIT-UI-Overhaul.md](docs/brand/FORZAKIT-UI-Overhaul.md) | UI redesign specs and component patterns | Layout changes, component updates, accessibility |
| [FORZAKIT-Pitch-Fixes.md](docs/brand/FORZAKIT-Pitch-Fixes.md) | Formation display improvements and fixes | Visual rendering, responsiveness |
| [tokens.css](docs/brand/tokens.css) | **CSS design tokens** — Use these for consistent styling | CSS custom properties (--gold, --ink, --cyan, etc) |
| [admin-tab/LOGIC.md](docs/brand/admin-tab/LOGIC.md) | Admin tab behaviour spec — full wizard, lifecycle, resolve flows | Create-bet wizard, season stepper, resolve bets |
| [admin-tab/COMMISSIONER_CONTROLS.md](docs/brand/admin-tab/COMMISSIONER_CONTROLS.md) | Season lifecycle tracker — stage logic and DB column mapping | Stage reference, sub-text copy, fallback behaviour |
| [admin-tab/LIFECYCLE_OPERATIONS.md](docs/brand/admin-tab/LIFECYCLE_OPERATIONS.md) | Transfer window, Draft, Cup Phase, Score Recalculation | Status pills, preconditions, confirm dialogs |
| [admin-tab/BETS_LOGIC.md](docs/brand/admin-tab/BETS_LOGIC.md) | Create Bet wizard and Resolve Bets full spec | Step validation, bet types, publishing side-effects, VOID |

### 📦 **docs/deployment/** — Launch & DevOps

Infrastructure, deployment procedures, and operational strategy.

| File | Purpose | Key Content |
|------|---------|-------------|
| [OBSERVABILITY_STRATEGY.md](docs/deployment/OBSERVABILITY_STRATEGY.md) | Lightweight observability design (no external SaaS) | 5-minute setup per function, self-pruning logs, production readiness |
| [DATA_PIPELINE_RUNBOOK.md](docs/deployment/DATA_PIPELINE_RUNBOOK.md) | Active cron table + data activation steps for any tournament | All 13 active cron jobs, fixtures, scores, player status syncs |

---

## Archived & Consolidated Documentation

Files that were analysis/intermediate work — moved to `docs/archive/` on 2026-05-28:

| File | Purpose | Status | Note |
|------|---------|--------|------|
| `docs/archive/CODE_AUDIT_2026-05-24.md` | Full-stack code quality review | Reference | Findings extracted to BACKLOG.md |
| `docs/archive/CODE_REVIEW_REPORT.md` | Production risks & improvements | Reference | 10 improvements + bugs moved to POST-MVP |
| `docs/archive/LOGIC_AUDIT_2026-05-24.md` | Scoring, betting, standings logic audit | Reference | Deferred items moved to BACKLOG |
| `docs/archive/UI_AUDIT_2026-05-24.md` | User flow & UX audit | Reference | Deferred items moved to BACKLOG |
| `docs/archive/INGESTION_AUDIT_2026-05-24.md` | API pipeline & cron job audit | Reference | Deferred items moved to BACKLOG |
| `docs/archive/SPRINT_PLAN_2026-05-24.md` | Consolidated correction plan | Reference | Sprints 0-4 complete as of 2026-05-25 |
| `docs/archive/OBSERVABILITY_STRATEGY_2026-05-24.md` | (→ moved to docs/deployment/OBSERVABILITY_STRATEGY.md) | Applied | Lightweight observability design |
| `docs/archive/SUPABASE_HANDOFF.md` | Deployment guide | Reference | All migrations 66-87 applied; no pending tasks |
| `docs/archive/HANDOFF_PROMPT.md` | Session handoff template | Reference | Use CLAUDE.md Session Start Checklist instead |
| `docs/archive/AUDIT_EXTRACTION_2026-05-28.md` | Extraction analysis from above audits | Reference | Links to items moved to BACKLOG |
| `docs/STRATEGIC_PRODUCT_ROADMAP_ASSESSMENT.md` | Strategic analysis from earlier planning | Archive | Consolidated into BACKLOG POST-MVP |
| `docs/STRATEGIC_PRODUCT_ROADMAP_PROMPT.md` | Research & analysis notes | Archive | Consolidated into BACKLOG POST-MVP |
| `docs/12_MONTH_ROADMAP_2026_2027.md` | Year-long planning document | Archive | Consolidated into BACKLOG POST-MVP |
| `docs/WORKSPACE_REORGANIZATION_SUMMARY.md` | One-off workspace analysis | Archive | Historical only |
| `docs/archive/GIT_AND_CODE_WALKTHROUGH.md` | Historical code navigation guide | Archive | Superseded by CLAUDE.md |

---

## How to Use This Map

### For New Team Members
1. Start with [README.md](README.md) for project overview
2. Read [CLAUDE.md](CLAUDE.md) for technical setup and git workflow
3. Browse the **Product & Strategy** section for context
4. Dive into **docs/architecture/** for system understanding

### For Developers
- **Building features?** → [CLAUDE.md](CLAUDE.md) + [PIPELINE.md](PIPELINE.md)
- **Understanding scoring?** → [docs/architecture/FANTASY_POINTS_SCORING_LAYER.md](docs/architecture/FANTASY_POINTS_SCORING_LAYER.md)
- **Integrating Forza API?** → [docs/api/API_INTEGRATION_REFERENCE.md](docs/api/API_INTEGRATION_REFERENCE.md)
- **Styling components?** → [docs/brand/tokens.css](docs/brand/tokens.css)

### For Product & PM
- **What's done/pending?** → [BACKLOG.md](BACKLOG.md) + [Notion BACKLOG](https://www.notion.so/361fe9c7e4c2803c9fc7c898a0c4bbac)
- **Roadmap & timeline?** → [PIPELINE.md](PIPELINE.md)
- **Launch readiness?** → [APP_STORE_ASSESSMENT.md](APP_STORE_ASSESSMENT.md)

### For Deployment & Ops
- **Active cron jobs?** → [DATA_PIPELINE_RUNBOOK.md](docs/deployment/DATA_PIPELINE_RUNBOOK.md) (Active Crons table at the top)
- **Data pipeline setup?** → [DATA_PIPELINE_RUNBOOK.md](docs/deployment/DATA_PIPELINE_RUNBOOK.md)
- **Mobile builds?** → [MOBILE_DEVELOPMENT.md](docs/reference/MOBILE_DEVELOPMENT.md)

---

## File Organization Summary

```
Root-level (critical, always referenced):
├── README.md                      # Start here
├── CLAUDE.md                      # Authoritative project instructions (SESSION START CHECKLIST)
├── BACKLOG.md                     # Session progress + POST-MVP roadmap
├── APP_STORE_ASSESSMENT.md        # Mobile launch readiness
├── GEMINI.md                      # Mobile AI (Google Antigravity) instructions
└── DOCS_MAP.md                    # ← You are here (documentation index)

docs/architecture/                 # System design
├── DRAFT_SYSTEM_DESIGN.md
├── TRANSFER_WINDOW_SYSTEM.md
├── STARTING_XI_AND_BENCH.md
├── FANTASY_POINTS_SCORING_LAYER.md
├── APP_DYNAMICS.md
└── FORMATION_RULES.md

docs/api/                          # External integrations
├── FORZA_API_ASSESSMENT.md
├── API_INTEGRATION_REFERENCE.md
├── FIT_GAP_ANALYSIS.md
└── FORZA_API_KNOWLEDGE.md

docs/brand/                        # Design system
├── BRANDING.md
├── FORZAKIT-UI-Overhaul.md
├── FORZAKIT-Pitch-Fixes.md
├── UX_UI_REVIEW.md
├── tokens.css
└── brand_guidelines/

docs/deployment/                   # Launch & ops
├── DATA_PIPELINE_RUNBOOK.md
├── OBSERVABILITY_STRATEGY.md
└── OBSERVABILITY_STRATEGY.md

docs/testing/                      # Test strategy & coverage
├── README.md
├── TESTING_STRATEGY.md
├── E2E_TEST_PLAYBOOK.md
└── TEST_RESULTS.md

docs/product/                      # Product roadmap & strategy
├── README.md
├── PIPELINE.md
└── 12_MONTH_ROADMAP_2026_2027.md

docs/reference/                    # Developer guides & lookup
├── README.md
├── LOCAL_DEVELOPMENT.md
├── CONVENTIONS.md
└── MOBILE_DEVELOPMENT.md

docs/archive/                      # Archived & consolidated docs
├── STRATEGIC_PRODUCT_ROADMAP_ASSESSMENT.md
├── STRATEGIC_PRODUCT_ROADMAP_PROMPT.md
├── WORKSPACE_REORGANIZATION_SUMMARY.md
├── AUDIT_EXTRACTION_2026-05-28.md
├── CODE_AUDIT_2026-05-24.md
├── CODE_REVIEW_REPORT.md
├── HANDOFF_PROMPT.md
├── INGESTION_AUDIT_2026-05-24.md
├── LOGIC_AUDIT_2026-05-24.md
├── OBSERVABILITY_STRATEGY_2026-05-24.md
├── PIPELINE_DATA_PIPELINE.md
├── SPRINT_PLAN_2026-05-24.md
├── SUPABASE_HANDOFF.md
├── UI_AUDIT_2026-05-24.md
├── .old/                         # Pre-MVP early work
│   ├── PRELIMINARY_SCORING_MECHANISM.md
│   ├── README.md
│   └── brand_preview.html
└── .working-docs/                # Working session notes
    ├── BEHAVIORAL_RULES.md
    ├── GIT_WORKFLOW_GUIDE.md
    ├── ROOT_FILES_EXPLAINED.md
    ├── SESSION_WORKFLOW.md
    └── WORKSPACE_GUIDE.md
```

---

## Maintenance Notes

- **Update Frequency**: 
  - Root-level docs (BACKLOG.md, CLAUDE.md, README.md): After each session
  - Architecture docs: When features ship or systems change
  - Testing/product docs: When roadmap or strategy changes
  - Reference docs: When conventions or setup changes
  
- **Review Process**: Before any major release, verify:
  - All architecture docs match current code
  - Testing strategy reflects actual test coverage
  - PIPELINE.md aligns with current roadmap
  
- **Consolidation**: Intermediate work (audits, session notes) goes directly to `docs/archive/`; never leave temp files in root or docs/

- **Link Validation**: All links in this map should resolve correctly — if broken, update this file immediately

- **Single Source of Truth**: 
  - [BACKLOG.md](BACKLOG.md) — all open issues and completed work
  - [CLAUDE.md](CLAUDE.md) — authoritative project instructions
  - [docs/testing/TESTING_STRATEGY.md](docs/testing/TESTING_STRATEGY.md) — test framework details
  - [docs/product/PIPELINE.md](docs/product/PIPELINE.md) — delivery timeline
  - [docs/reference/CONVENTIONS.md](docs/reference/CONVENTIONS.md) — code style rules

## Documentation Reorganization Summary

**Date**: 2026-05-28  
**Scope**: Complete reorganization of 30+ documentation files across root and docs/ folder  
**Actions Taken**:
1. Created 4 new top-level doc folders (testing, product, reference + archive reorganization)
2. Moved 9 core files to appropriate categories (PIPELINE, APP_DYNAMICS, E2E_TEST_PLAYBOOK, etc)
3. Removed 3 duplicate files (APP_STORE_ASSESSMENT, MOBILE_IMPLEMENTATION_GUIDE from docs/)
4. Created 6 new documentation files (README/index files for each category + FORMATION_RULES, LOCAL_DEVELOPMENT, CONVENTIONS, TESTING_STRATEGY)
5. Archived 13 intermediate/stale files (audits, strategic docs, working notes) to docs/archive/
6. Updated DOCS_MAP.md as master index of all documentation

**Result**: 
- Root folder reduced from 18 to 8 essential files
- Documentation organized by topic (architecture, api, brand, deployment, testing, product, reference)
- Clear ownership and maintenance path for each document category
- BACKLOG.md established as single source of truth for task management
- All documentation now discoverable from DOCS_MAP.md

Last Updated: **2026-06-01** (session 66 — DATA_PIPELINE_RUNBOOK.md updated with active cron table; DRY_RUN_PREP_CHECKLIST.md archived; TRANSFER_WINDOW_SYSTEM.md + BETS_LOGIC.md + LIFECYCLE_OPERATIONS.md updated for session 66 fixes)
