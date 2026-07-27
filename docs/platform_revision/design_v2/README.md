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

## Status: design-complete and implemented for all four modules

| Module | Folder | Screens | Notes | Implementation |
|---|---|---|---|---|
| Clubhouse Home + global chrome | `Home Redesign/` | S-01–S-08 | Merges Home/Recap/Chat into one persistent-rail layout; sidebar, top bar, Members, Chat, The FrontRow gazette, New Competition, Notifications | ✅ **Implemented** — merged to `main` (multiple PRs, see BACKLOG.md) |
| F1 module | `F1 Redesign/` | F1-01–F1-07 (+F1-02b variants) | UI/layout only, no scoring changes; gives F1 a consistent red identity without colliding with semantic correct/incorrect colors | ✅ **Implemented** — PR [#758](https://github.com/SMTCB/WCFantasyFootball/pull/758), merged to `main` 2026-07-25 |
| Tennis module | `Tennis Redesign/` | T-01–T-06 | Tiered roster picks, QF Captain window, Ace Cards, season leaderboard with Masters drop rule | ✅ **Implemented** — PR [#758](https://github.com/SMTCB/WCFantasyFootball/pull/758), merged to `main` 2026-07-25 |
| Coin Challenges (P2P) | `Coin Challenges Redesign/` | S01–S10 | Extends P2P bets to Clubhouse scope + adds Freeform prop bets (declare → confirm/dispute → owner-arbitrates lifecycle) | ✅ **Implemented** — PRs A/B/C ([#760](https://github.com/SMTCB/WCFantasyFootball/pull/760) migration 235, [#761](https://github.com/SMTCB/WCFantasyFootball/pull/761) migration 236, [#762](https://github.com/SMTCB/WCFantasyFootball/pull/762) migrations 237–238) + PR D ([#764](https://github.com/SMTCB/WCFantasyFootball/pull/764), migration 239) all merged to `main` 2026-07-25/26. **Migration 239 applied to prod 2026-07-26** — all four `design_v2` modules now fully live |

Every module is built against the same reconciled **Kit Light** token set (see below) — nothing here is a competing design language.

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

**Coin Challenges Redesign (S01–S10): all four PRs merged AND all migrations applied — module fully live in prod.** PRs A/B/C (#760, #761, #762, migrations 235–238) shipped the circle-scoped Competitor path. PR D (#764, migration 239) shipped the Freeform path: widened `bet_type`/`status` CHECKs, added `resolution_mode`/`question`/`proposed_winner_id`/`proposed_by`/`proposed_at`/`dispute_deadline` columns, and RPCs `declare_freeform_result`/`confirm_freeform_result`/`dispute_freeform_result`/`arbitrate_freeform_result`/`auto_void_stale_disputes`, plus the frontend for design screens S02 (bet-type picker), S05 (question field), and S08–S10 (Your Move card, owner arbitration card, Declare Result flow, Owner Arbitration screen). `get_my_challenges` was also extended so a circle owner can see disputed freeform challenges between other members, not just ones they're a party to — otherwise arbitration would be unreachable for the common case. See [`Coin Challenges Redesign/README.md`](Coin%20Challenges%20Redesign/README.md) and [`../architecture/P2P_BETTING_CLUBHOUSE_SCOPE_TECH_SPEC.md`](../architecture/P2P_BETTING_CLUBHOUSE_SCOPE_TECH_SPEC.md) for the full spec (note: the tech spec's migration numbers 235–237 are superseded — see actual applied migrations in `supabase/migrations/`). Freeform rake is 5%, same as Competitor bets; disputed freeform bets auto-refund after a 7-day owner-inactivity timeout (`auto_void_stale_disputes` cron, confirmed active in prod: hourly `0 * * * *`). **Migration 239 applied to prod 2026-07-26** — backed up first via `npx supabase db dump --linked` (Docker confirmed working again on this machine), then applied and verified: all 6 new columns present with correct types, all 4 new RPCs grant `authenticated`-only (anon confirmed blocked), and the cron job is active.

This repo is single-branch (`main` only, since the 2026-07-24 cutover) — branch from `main`, PR back into `main`, same as every other session.

**Known follow-up across modules:** admin ownership for non-football competitions (Tennis, F1) was never designed — see `ADMIN-1` in [BACKLOG.md](../../../BACKLOG.md) for the decided direction (Clubhouse owner = default admin of every competition in the Clubhouse; competition creator = admin of their own competition; central Clubhouse-level panel to assign/reassign) and the concrete gap it closes (`TennisAdminScreen.jsx`'s admin RPCs currently 403 for every real user). Not yet built.

---
Last Updated: 2026-07-27 (documentation consolidation — BACKLOG.md is once again the single source of truth for open items; added ADMIN-1 follow-up pointer)
