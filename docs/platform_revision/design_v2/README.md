# design_v2 — Claude Design Output (Kit Light Redesign)

**What this folder is:** the finished visual design for the sale-ready platform redesign — high-fidelity HTML mockups plus handoff docs, produced by Claude Design from the briefs in [`docs/platform_revision/design/design_handoffs/`](../design/design_handoffs/). This is design output to be implemented, not a spec written by Claude Code and not production code.

**Relationship to `design_handoffs/`:**
| Folder | Author | Contents |
|---|---|---|
| `design/design_handoffs/<module>/` | Claude Code | The original brief sent *to* Claude Design (product scope, data model pointers, engineering context) |
| `design_v2/<Module> Redesign/` | Claude Design | The output *from* that brief — a pannable HTML mockup canvas + a richer handoff `README.md` describing exactly what shipped, source-file mapping, and final token usage |

Each `design_v2` module folder also carries a copy of its original brief for reference, named `README_<MODULE>.md` — consistent across all four (the Coin Challenges folder briefly had a second, CRLF-duplicate copy named `Original Design Brief.md`; removed 2026-07-24, references updated to `README_COIN.md`).

## Platform rebrand: FantasyKit → Frontrow

The product is being renamed **Frontrow** — *"Your seat to all the action."* This surfaced through the Home Redesign brief/output, not through a prior product decision recorded elsewhere. Replace the FantasyKit wordmark/logo across the app shell with the Frontrow logo system (`logo/`). The in-app gazette feature name, "The FrontRow," is a separate, pre-existing feature name kept as-is — an intentional naming collision, not the same thing as the platform rebrand.

## Status: all four core modules are design-complete

| Module | Folder | Screens | Notes |
|---|---|---|---|
| Clubhouse Home + global chrome | `Home Redesign/` | S-01–S-08 | Merges Home/Recap/Chat into one persistent-rail layout; sidebar, top bar, Members, Chat, The FrontRow gazette, New Competition, Notifications |
| Coin Challenges (P2P) | `Coin Challenges Redesign/` | S01–S10 | Extends P2P bets to Clubhouse scope + adds Freeform prop bets (declare → confirm/dispute → owner-arbitrates lifecycle) |
| F1 module | `F1 Redesign/` | F1-01–F1-07 (+F1-02b variants) | UI/layout only, no scoring changes; gives F1 a consistent red identity without colliding with semantic correct/incorrect colors |
| Tennis module | `Tennis Redesign/` | T-01–T-06 | Tiered roster picks, QF Captain window, Ace Cards, season leaderboard with Masters drop rule |

Every module is built against the same reconciled **Kit Light** token set (see below) — nothing here is a competing design language, and none of the four should be re-briefed before implementation.

## Logo system

`logo/` is the finalized Frontrow logo package: primary wordmark ("The Tiers," gold + accent bars) plus per-sport badge marks for football/F1/tennis, each with `-normal`/`-live` SVG variants. Full construction spec in `logo/README.md`. It's a sibling top-level folder here in `design_v2/`, referenced from `Home Redesign/README.md` via `../logo/` (corrected 2026-07-24 — that doc previously described it as nested inside the Home Redesign folder).

## Design tokens (Kit Light — shared across every module)

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#F7F3ED` | Page background |
| `--card` | `#FFFFFF` | Card surface |
| `--elev` | `#EDEAE2` | Elevated panels |
| `--shell` / `--paper` | `#18202E` | The one dark surface (sidebar, headers) / primary text |
| `--mute` | `#8A97A8` | Secondary/muted text |
| `--rule` | `#E2DDD5` | Borders, dividers |
| `--accent` | `#1A6FA8` | Buttons, active states, football sport color, Freeform bet identity |
| `--gold` | `#B8720E` | Emphasis, Competitor bet identity, FrontRow/gazette accents |
| `--positive` / `--danger` | `#166534` / `#B91C1C` | Semantic win/loss, correct/incorrect — never reused for brand color |
| `--f1` | `#E10600` | F1 brand red — action/brand moments only, never correctness signaling |
| `--ten` | `#1B7A52` | Tennis sport color |

Typography: **Archivo Black** (display/headlines/wordmark), **Archivo** (body/UI), **JetBrains Mono** (eyebrows/labels, sparingly). Radius 6px throughout — the one exception is logo badge chrome at 24px (decorative). The FrontRow gazette screen (S-04) is a deliberate, documented exception to the whole system: cream/dark-ink broadsheet look, Georgia serif.

## What's next

Per [`TRACKER.md`](../TRACKER.md), the next v2 session's stated focus is implementing these designs into the React codebase — not resuming Phase 3/4 of the cutover (maintenance wall and migration 217 stay untouched until the user explicitly says otherwise). Suggested order: **Home Redesign first** (it's the global chrome everything else sits inside — sidebar, top bar, Clubhouse switcher), then the three module screens can land independently in any order.

---
Last Updated: 2026-07-24
