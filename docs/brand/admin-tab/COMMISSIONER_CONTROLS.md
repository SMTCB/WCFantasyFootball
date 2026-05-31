# COMMISSIONER CONTROLS — Season Lifecycle Tracker

**The season progress bar at the top of the Admin tab. Shows which stage the league is currently in — it reflects real database state and advances automatically.**

---

## Overview

The commissioner does not click this bar to advance stages. It is a read-only indicator derived from live league data. The actual controls that cause it to advance live in **Lifecycle Operations** (below).

The stepper is **mode-aware**: Classic and Draft leagues show different stage sets.

---

## Stage Sets by League Mode

### Classic Mode (`format = 'classic'`)

Two stages only — no draft mechanics exist.

| Stage | Label | Active when… |
|---|---|---|
| 1 | TRANSFER WINDOW | Always (from league creation) |
| 2 | IN SEASON | The league is live |

### Draft Mode — League Format (`format = 'noduplicate'`, season-long)

Four stages.

| Stage | Label | Advances when… | Source |
|---|---|---|---|
| 1 | TRANSFER WINDOW | Always active from creation | — |
| 2 | DRAFT DEADLINE | A draft deadline is set | `leagues.draft_deadline IS NOT NULL` |
| 3 | ALLOCATION | Allocation has run | `cup_phase ≠ 'pre_cup'` |
| 4 | IN SEASON | Allocation complete | `cup_phase ≠ 'pre_cup'` |

### Draft Mode — Cup Format (`format = 'noduplicate'`, cup/knockout tournament)

Same four stages — the Knockout Draft is tracked separately in Lifecycle Operations and does not add a stepper stage.

---

## Stage Colours

| Colour | Meaning |
|---|---|
| ✓ Green | Stage complete |
| ● Cyan | Current stage (YOU ARE HERE) |
| Grey | Not yet reached |

---

## Stage Sub-text

Each stage shows a descriptive sub-text when active or done:

| Stage | Sub-text |
|---|---|
| TRANSFER WINDOW | "Open · transfers enabled" or "Closed" |
| DRAFT DEADLINE | Formatted deadline timestamp, or "Not set" |
| ALLOCATION | "Squads allocated" / "Processing…" / "Awaiting draft" |
| IN SEASON | "Live" or "Awaiting allocation" |

---

## How to Advance Each Stage (Draft Mode)

| Stage | Action required |
|---|---|
| 1 → 2 | Set a draft deadline via **Lifecycle Operations → Group Stage Draft → Set Deadline** |
| 2 → 3 | Wait for the deadline to pass (automatic), then **Run Allocation** (or cron auto-runs 4h before first match) |
| 3 → 4 | Automatic — allocation running sets `cup_phase = 'group_stage'` |

---

## Fallback / Demo Mode

If no league data is loaded (`league === null`), the stepper renders with hardcoded demo phase data. This is a defensive fallback only.

---

## Technical Notes

- `computePhases(league, memberCount)` derives the stage set and current index from the `leagues` row.
- Draft mode detected via `league.format === 'noduplicate'`.
- `allocationDone` = `league.cup_phase && league.cup_phase !== 'pre_cup'`.
- `knockoutAllocationDone` = `cup_phase` ∈ `['elimination', 'round_of_16', 'quarter_final', 'semi_final', 'final']`.
- Stage advancement is non-reversible in normal operation.
- Mobile (`MobSeasonStepper`) shows a condensed dot-progress bar using the same `computePhases` logic.

---

Last Updated: **2026-05-31**
