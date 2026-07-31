# Forza Fantasy League — Docs Map

> **Open [DOCS_INDEX.html](../DOCS_INDEX.html) for the full interactive mine map.**  
> That file covers every folder, file, and doc in the repo with search and category filtering.

This `.md` file exists as a plain-text pointer for terminal/CLI contexts where HTML can't be opened.

## Quick orientation

| First, read… | Why |
|---|---|
| `CLAUDE.md` (root) | Session instructions — single-branch (`main`) workflow, maintenance-mode standing instruction, git workflow, tech stack |
| `BACKLOG.md` (root) | **Single source of truth** — all open items (P0–P3) plus the full chronological history of every completed PR, migration, and bug fix |
| `docs/platform_revision/TRACKER.md` | Historical/audit-trail only (superseded banner added 2026-07-27) — migration-by-migration cutover verification log. Open items now live in BACKLOG.md, not here |

## Folder index

| Folder | Purpose |
|---|---|
| `src/` | React application source — 17 screens, 50 components, 39 hooks, lib |
| `supabase/migrations/` | SQL migration files (264+, append-only numbered sequence) |
| `supabase/functions/` | Deno Edge Functions (20 deployed; `_shared/` is helper code, not a function) |
| `e2e/` | Playwright end-to-end tests |
| `ios/` / `android/` | Capacitor native projects |
| `scripts/` | Developer utility scripts (10 files) |
| `infra/` | Infrastructure config (nginx.conf) |
| `docs/architecture/` | Football platform system design |
| `docs/api/` | Forza Football API integration |
| `docs/deployment/` | Runbooks and DevOps guides |
| `docs/reference/` | Developer setup and conventions |
| `docs/testing/` | Test strategy and results |
| `docs/platform_revision/` | Platform-revision work: due diligence, architecture, module plans, Kit Light design system, and `design_v2/` (shipped F1/Tennis/Home/Coin Challenges redesigns) |
| `docs/brand/` | FORZAKIT design exploration (League Hub, Live Centre, Scores) — distinct lineage from Kit Light and archived Forza Dark |
| `docs/archive/` | Historical reference only (7 subdirs: brand-forza-dark, completed-sprint-plans, stale-launch-docs, stale-product-plans, legacy-configs, session-audits, superseded-dd-2026-06-30) |

Last updated: 2026-07-31
