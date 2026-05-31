# COMMISSIONER CONTROLS — Season Lifecycle Tracker

**The season progress bar at the top of the Admin tab. Shows which stage the league is currently in — it reflects real database state and advances automatically.**

---

## Overview

The commissioner does not click this bar to advance stages. It is a read-only indicator derived from live league data (`leagues.draft_deadline`, `leagues.cup_phase`, etc.). The actual controls that cause it to advance live in **Lifecycle Operations** (below).

Five stages are shown in linear order. Only one stage is `active` at a time; all prior stages are `done`; all future stages are `todo`.

---

## Stage Reference

| Stage | Label | Advances when… | Source column |
|---|---|---|---|
| 1 | TRANSFER WINDOW | A draft deadline is set (even if in the future) | `leagues.draft_deadline IS NOT NULL` |
| 2 | DRAFT DEADLINE | The draft deadline timestamp is set | `leagues.draft_deadline` |
| 3 | ALLOCATION | The draft deadline has passed | `draft_deadline ≤ NOW()` |
| 4 | CUP SEEDED | The cup pool has been seeded | `leagues.cup_phase ≠ 'pre_cup'` |
| 5 | IN SEASON | The cup is in an active phase | `cup_phase IN ('group_stage', 'pre_elimination', 'elimination', 'final')` |

---

## Stage Sub-text

Each stage shows a descriptive sub-text when active or done:

| Stage | Sub-text |
|---|---|
| TRANSFER WINDOW | "Open · transfers enabled" or "Closed" |
| DRAFT DEADLINE | Formatted deadline timestamp, or "Not set" |
| ALLOCATION | "Squads allocated" / "Processing…" / "Awaiting draft" |
| CUP SEEDED | Cup phase value (e.g. "GROUP STAGE"), or "Pool ready · run when set" |
| IN SEASON | "Live" or "Awaiting cup seed" |

---

## How to Advance Each Stage

| Stage | Action required |
|---|---|
| 1 → 2 | Set a draft deadline via **Lifecycle Operations → Draft → Set Deadline** |
| 2 → 3 | Wait for the deadline to pass (automatic) |
| 3 → 4 | Run allocation via **Lifecycle Operations → Draft → Run Allocation**, then seed clubs via **Lifecycle Operations → Cup Phase → Seed Cup Clubs** |
| 4 → 5 | Cup is seeded and at least one cup-phase match has started (cup_phase column updates) |

---

## Fallback / Demo Mode

If no league data is loaded (e.g. `league === null`), the stepper renders with hardcoded demo phase data so the component never crashes. This is purely a defensive fallback and is not shown to real users in a live league.

---

## Technical Notes

- `computePhases(league, memberCount)` is the function that derives the linear stage index from the `leagues` row.
- Stage advancement is **non-reversible** in normal operation (allocation and cup seeding are one-way).
- The stepper is rendered for all users with commissioner role; non-admins do not see the Admin tab at all.
- Mobile version (`MobSeasonStepper`) shows a condensed 5-dot progress bar using the same underlying `computePhases` logic.

---

Last Updated: **2026-05-31**
