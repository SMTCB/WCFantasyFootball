# Documentation Map — Forza Fantasy League

Complete index and overview of all project documentation organized by purpose and audience.

---

## Root-Level Documentation (Project Core)

**Current Session & Progress**
| File | Purpose | Audience | Last Updated |
|------|---------|----------|--------------|
| [BACKLOG.md](BACKLOG.md) | Session progress, completed features, post-MVP gaps | Team/PM | Session 25 (2026-05-17) |
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
| [PIPELINE.md](PIPELINE.md) | Product roadmap, sprint plan, timeline, feature phases | PM/Team | Current |

**Deployment & Launch**
| File | Purpose | Audience | Last Updated |
|------|---------|----------|--------------|
| [APP_STORE_ASSESSMENT.md](APP_STORE_ASSESSMENT.md) | iOS/Android app store readiness, submission checklist | Mobile team | Current |
| [MOBILE_IMPLEMENTATION_GUIDE.md](MOBILE_IMPLEMENTATION_GUIDE.md) | Capacitor setup, native plugin docs, build instructions | Developers | Current |
| [E2E_TEST_REPORT.md](E2E_TEST_REPORT.md) | Latest E2E test results, coverage metrics, known gaps | Developers/QA | 2026-05-17 |

---

## Organized Documentation Folders

### 📋 **docs/architecture/** — System Design & Technical Foundation

Detailed documentation of core systems and how they work.

| File | Purpose | Key Sections |
|------|---------|--------------|
| [DRAFT_SYSTEM_DESIGN.md](docs/architecture/DRAFT_SYSTEM_DESIGN.md) | Draft lottery & transfer window rules engine | Lottery algorithm, transfer window phases, claim deadlines |
| [FANTASY_POINTS_SCORING_LAYER.md](docs/architecture/FANTASY_POINTS_SCORING_LAYER.md) | Scoring formula, DB schema, point calculations | EPL point values, position multipliers, bonus rules |
| [APP_DYNAMICS.md](docs/architecture/APP_DYNAMICS.md) | Live match updates, real-time subscriptions, Joker chip | Realtime architecture, match state machine |
| [FORMATION_RULES.md](docs/architecture/FORMATION_RULES.md) | 11-player pitch validation rules | Position constraints, squad balance, constraints |

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

### 📦 **docs/deployment/** — Launch & DevOps

Infrastructure, deployment procedures, and pre-launch checklist.

| File | Purpose | Key Content |
|------|---------|-------------|
| [DATA_PIPELINE_RUNBOOK.md](docs/deployment/DATA_PIPELINE_RUNBOOK.md) | Supabase cron setup & data activation steps | Fixtures, scores, player status syncs |
| [DRY_RUN_PREP_CHECKLIST.md](docs/deployment/DRY_RUN_PREP_CHECKLIST.md) | Pre-launch verification checklist | Go/no-go criteria, sign-off process |

---

## Archived & Consolidated Documentation

Files that were analysis/intermediate work but may be referenced for context:

| File | Purpose | Status | Note |
|------|---------|--------|------|
| [docs/STRATEGIC_PRODUCT_ROADMAP_ASSESSMENT.md](docs/STRATEGIC_PRODUCT_ROADMAP_ASSESSMENT.md) | Strategic analysis from earlier planning | Archive | Consolidated into PIPELINE.md |
| [docs/STRATEGIC_PRODUCT_ROADMAP_PROMPT.md](docs/STRATEGIC_PRODUCT_ROADMAP_PROMPT.md) | Research & analysis notes | Archive | Consolidated into PIPELINE.md |
| [docs/12_MONTH_ROADMAP_2026_2027.md](docs/12_MONTH_ROADMAP_2026_2027.md) | Year-long planning document | Archive | Consolidated into PIPELINE.md |
| [docs/WORKSPACE_REORGANIZATION_SUMMARY.md](docs/WORKSPACE_REORGANIZATION_SUMMARY.md) | One-off workspace analysis | Archive | Historical only |
| [GIT_AND_CODE_WALKTHROUGH.md](GIT_AND_CODE_WALKTHROUGH.md) | Historical code navigation guide | Archive | Superseded by CLAUDE.md |

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
- **Launch readiness?** → [APP_STORE_ASSESSMENT.md](APP_STORE_ASSESSMENT.md) + [DRY_RUN_PREP_CHECKLIST.md](docs/deployment/DRY_RUN_PREP_CHECKLIST.md)

### For Deployment & Ops
- **Pre-launch checklist?** → [DRY_RUN_PREP_CHECKLIST.md](docs/deployment/DRY_RUN_PREP_CHECKLIST.md)
- **Data pipeline setup?** → [DATA_PIPELINE_RUNBOOK.md](docs/deployment/DATA_PIPELINE_RUNBOOK.md)
- **Mobile builds?** → [MOBILE_IMPLEMENTATION_GUIDE.md](MOBILE_IMPLEMENTATION_GUIDE.md)

---

## File Organization Summary

```
Root-level (critical, always referenced):
├── README.md                      # Start here
├── CLAUDE.md                      # Authoritative project instructions
├── BACKLOG.md                     # Session progress
├── PIPELINE.md                    # Roadmap
├── APP_STORE_ASSESSMENT.md        # Mobile launch
├── MOBILE_IMPLEMENTATION_GUIDE.md # Capacitor setup
├── E2E_TEST_REPORT.md             # Test status
├── CLEANUP_REPORT.md              # Maintenance audit
├── CODE_REVIEW_REPORT.md          # Quality assessment
├── GEMINI.md                      # Mobile AI instructions
└── DOCS_MAP.md                    # ← You are here

docs/architecture/                 # System design
├── DRAFT_SYSTEM_DESIGN.md
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
├── tokens.css
└── brand_guidelines/

docs/deployment/                   # Launch & ops
├── DATA_PIPELINE_RUNBOOK.md
└── DRY_RUN_PREP_CHECKLIST.md

docs/ (archive/consolidated):
├── STRATEGIC_PRODUCT_ROADMAP_ASSESSMENT.md
├── STRATEGIC_PRODUCT_ROADMAP_PROMPT.md
├── 12_MONTH_ROADMAP_2026_2027.md
└── WORKSPACE_REORGANIZATION_SUMMARY.md
```

---

## Maintenance Notes

- **Update Frequency**: Root-level docs updated after each session; architecture docs updated as features ship
- **Review Process**: Before any major release, verify all architecture docs match current code
- **Consolidation**: If strategic roadmap changes, update PIPELINE.md and archive old docs
- **Link Validation**: All links in this map should resolve correctly — if broken, file an issue

Last Updated: **2026-05-17** (after lint fixes and documentation cleanup)
