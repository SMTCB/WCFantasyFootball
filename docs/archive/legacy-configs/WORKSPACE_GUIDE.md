# Workspace Organization Guide

**Location**: `.working-docs/` — Single source of truth for session workflows and behavioral instructions

---

## 📋 Files in This Folder

### **1. [GIT_WORKFLOW_GUIDE.md](GIT_WORKFLOW_GUIDE.md) — Git Operations**
- **What**: Complete automation guide for git operations
- **Who**: Claude (automatic) — user never touches git
- **When to read**: Never — this is Claude's reference. BACKLOG.md shows user what was done.
- **Key rule**: Claude handles all commits, pushes, PR creation, merging. User describes what to fix; git is automatic.

### **2. [SESSION_WORKFLOW.md](SESSION_WORKFLOW.md) — Start Each Session Here**
- **What**: Checklist and workflow for every new session
- **Who**: Claude runs this at start of each session
- **When to read**: First thing in a new session (Claude does this automatically)
- **Key rule**: Read this before any other file

### **3. [BEHAVIORAL_RULES.md](BEHAVIORAL_RULES.md) — How Claude Operates**
- **What**: Rules for how Claude approaches work, what to avoid, what to prioritize
- **Who**: Claude reference guide for decision-making
- **When to read**: When making architectural decisions or unsure about approach
- **Key rule**: These rules are immutable and apply to all work

---

## 🗂️ Root-Level Files (Kept Simple)

| File | Purpose | Who Reads | When |
|------|---------|-----------|------|
| **CLAUDE.md** | Project tech stack & entry point | Claude at session start | Every session |
| **BACKLOG.md** | Priorities, session history, what was done | User after each session | Session end |
| **README.md** | Project overview & quick-start | First-time readers | Onboarding |

---

## 📁 Documentation Folders (Organized by Topic)

```
docs/
├── architecture/          # System design docs
│   ├── DRAFT_SYSTEM_DESIGN.md
│   ├── FANTASY_POINTS_SCORING_LAYER.md
│   └── (other design docs)
├── api/                   # API integration docs
│   ├── FORZA_API_ASSESSMENT.md
│   ├── API_INTEGRATION_REFERENCE.md
│   └── (other API docs)
├── brand/                 # Brand & design docs
│   ├── BRANDING.md
│   ├── FORZAKIT-UI-Overhaul.md
│   └── (visual identity)
├── deployment/            # Launch & infrastructure
│   ├── DATA_PIPELINE_RUNBOOK.md
│   ├── DRY_RUN_PREP_CHECKLIST.md
│   ├── APP_STORE_ASSESSMENT.md
│   ├── MOBILE_IMPLEMENTATION_GUIDE.md
│   └── (deployment guides)
└── E2E_TEST_REPORT.md    # Test results
```

---

## 📁 Archived Files (History, Not Active)

`.old/` contains stale documents from earlier phases:
- Design planning docs (already implemented)
- Old pitch decks and strategy docs
- Email drafts and obsolete notes

**When to look**: Never during normal work. Only if researching historical decisions.

---

## ✅ Workspace Rules (Moving Forward)

1. **All session instructions go in `.working-docs/`** — Never in root, never scattered
2. **Documentation stays organized in `docs/`** — One topic per folder
3. **Stale docs go to `.old/`** — Don't delete; preserve history
4. **CLAUDE.md is primary reference** — Explicitly points here for behavioral rules
5. **BACKLOG.md is session record** — Updated after every session with what was done
6. **No markdown files in root except**: CLAUDE.md, README.md, BACKLOG.md

---

## 🎯 For Claude at Session Start

1. Read CLAUDE.md (tech stack, project status)
2. Read SESSION_WORKFLOW.md (this session's checklist)
3. Read BACKLOG.md (priorities and session history)
4. Read BEHAVIORAL_RULES.md (refresh rules for this session)
5. Start work

Then at session end:
- Update BACKLOG.md with session summary
- Commit all changes with atomic commits
- Never leave hanging PRs or uncommitted work

---

## 🔄 Why This Matters

**Problem (Before)**: 16 markdown files in root, unclear which to read, duplicates, old files mixed with active files, context loss between sessions, same prompts repeated every session.

**Solution (Now)**: Clear hierarchy, single source of truth for instructions (.working-docs/), organized docs by topic, stale files archived but preserved, CLAUDE.md directs you here.

**Result**: Next session you start, you know exactly where to look. No confusion. No repeated prompts.

---

## When Files Change

- **GIT_WORKFLOW_GUIDE.md**: Rarely — only if git process changes
- **SESSION_WORKFLOW.md**: Rarely — only if session structure changes
- **BEHAVIORAL_RULES.md**: Only if user gives new guidance or Claude observes a pattern to codify
- **BACKLOG.md**: After every session (session summary + priorities)

All changes committed to git with clear messages. Nothing left hanging.
