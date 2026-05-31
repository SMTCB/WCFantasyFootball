# LIFECYCLE OPERATIONS — Admin Logic Reference

**Full specification for the four season-control cards in the Admin tab. Covers Transfer Window, Draft, Cup Phase, and Score Recalculation.**

---

## Overview

Lifecycle Operations are the active controls that drive a league through its season stages. Each operation card shows:
- A **STATUS pill** reflecting current state (no need to run anything to check).
- A **WHEN TO RUN** hint so the commissioner knows the right timing.
- A **confirmation gate** on one-way (irreversible) operations.

---

## 1. Transfer Window

Controls when managers can buy and sell players from the market.

| Field | Behaviour |
|---|---|
| OPENS | Datetime input. Required to schedule an opening. |
| CLOSES | Datetime input. Optional — if blank, the window stays open until CLOSE NOW is pressed. |
| LIMIT | Integer or blank. Blank = unlimited transfers per manager during this window. |
| OPEN button | Sets `transfer_windows.state = 'open'`; emits a league notification. |
| CLOSE NOW | Closes immediately regardless of the scheduled CLOSES value. Shows a confirm dialog. |

**Status copy:**
- `OPEN · CLOSES IN {duration}` — green tone
- `OPEN · NO SCHEDULED CLOSE` — warn tone
- `SCHEDULED · OPENS {datetime}` — cyan tone
- `CLOSED` — danger tone

**DEADLINE-CONTROLLED leagues (WC/tournament):**
Transfer windows for these leagues are governed by `matchday_deadlines`, not the `transfer_windows` table. The OPEN/CLOSE buttons have no enforcement effect and are hidden. Use the matchday schedule to control transfer periods.

**When to run:** Open between gameweeks. Close at least 1 hour before the first match kickoff.

---

## 2. Draft

Controls the player selection deadline and runs the squad allocation engine.

| Field | Behaviour |
|---|---|
| DEADLINE | Datetime input. The cutoff after which managers can no longer change draft picks. |
| SET DEADLINE | Saves the deadline. Idempotent — can be updated any time before it passes. |
| RUN ALLOCATION | One-way. Runs the lottery + allocation engine. |

**Allocation engine rules:**
- 15 players allocated per manager
- £100M budget per manager
- Position limits: GK ≤ 2, DEF ≤ 5, MID ≤ 5, FWD ≤ 3
- Conflicts resolved by lottery (random priority per round)

**RUN ALLOCATION preconditions:**
- Disabled until the draft deadline has passed.
- Hidden once it has run successfully (status shows `ALLOCATED · {n} CONFLICTS RESOLVED`).
- A reset link (`↻ RE-RUN`) appears for admin override in edge cases.

**Confirm dialog shown before running allocation:**
> "This allocates squads for all N managers. It can't be undone without a manual reset. Continue?"

**When to run:** After all managers have submitted their picks. Before GW1 kickoff.

---

## 3. Cup Phase

Seeds each manager with the 20-club no-repeat pool for cup rounds.

| Field | Behaviour |
|---|---|
| SEED CUP CLUBS | One-way. Initialises the cup club pool for all managers. |

**What seeding does:**
- Each manager receives the full 20 Premier League clubs.
- A per-manager "used clubs" counter starts at zero.
- The no-repeat rule prevents a manager from picking the same club twice across cup rounds.

**Preconditions:**
- Disabled until Run Allocation has completed (`cup_phase ≠ 'pre_cup'`).

**Confirm dialog shown before seeding:**
> "Seeding the cup pool prevents repeat picks across cup rounds. It can't be undone for this season. Continue?"

**Status values:**
- `UNSEEDED` — not yet seeded (warn tone)
- `SEEDED` — ready (positive tone)
- `GROUP STAGE / PRE_ELIMINATION / ELIMINATION / FINAL` — active cup phase (cyan tone)

**When to run:** After Run Allocation is complete. Before the cup-phase rounds begin.

---

## 4. Score Recalculation

Re-fetches match statistics from Forza Football and reapplies the scoring engine.

| Field | Behaviour |
|---|---|
| SCORE LATEST ROUND | Re-scores all players in the most recently completed round. |
| FIXTURE ID input | Free-text field for a specific fixture ID (e.g. `f-1219435455`). |
| RECALCULATE button | Re-scores only the specified fixture. |

**Side effects:**
- Player scores and manager totals update immediately.
- An audit event is logged with before/after score diffs.
- A toast confirms: `"Recalculated · {n} scores changed · {pts diff total}"`.

**Safe to run multiple times:** Re-running is idempotent — it only overwrites with latest data.

**When to run:** Any time a match result was corrected after the final whistle, or if scores look wrong for a specific fixture.

---

## 5. Status Pill Reference

| Status | Meaning | Tone |
|---|---|---|
| `OPEN` | Window/operation is active | Green (positive) |
| `CLOSED` | Not currently open | Red (danger) |
| `SCHEDULED` | Set to open at a future time | Cyan |
| `DEADLINE SET` | Deadline exists, not yet passed | Green (positive) |
| `DEADLINE PASSED` | Deadline has passed, awaiting allocation | Warn |
| `ALLOCATED` | Allocation has run | Green (positive) |
| `NOT SET` | No deadline configured | Muted |
| `UNSEEDED` | Cup pool not yet seeded | Warn |
| `SEEDED` | Cup pool ready | Green (positive) |
| `UTILITY · ON-DEMAND` | Score recalc (no lifecycle dependency) | Muted |
| `DEADLINE-CONTROLLED` | WC/tournament league — matchday deadlines govern | Warn |

---

Last Updated: **2026-05-31**
