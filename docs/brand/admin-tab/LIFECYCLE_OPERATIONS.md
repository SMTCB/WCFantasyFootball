# LIFECYCLE OPERATIONS — Admin Logic Reference

**Full specification for the season-control cards in the Admin tab. Covers Transfer Window, Draft (Group + Knockout), and Score Recalculation.**

---

## Overview

Lifecycle Operations are the active controls that drive a league through its season stages. Each card shows:
- A **STATUS pill** reflecting current state (no need to run anything to check).
- A **WHEN TO RUN** hint so the commissioner knows the right timing.
- A **confirmation gate** on one-way (irreversible) operations.

**Draft cards are only shown for Draft-mode leagues** (`format = 'noduplicate'`). Classic-mode leagues hide the Draft section entirely.

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
Transfer windows for these leagues are governed by `matchday_deadlines`, not the `transfer_windows` table. The OPEN/CLOSE buttons have no enforcement effect and are labelled DEADLINE-CONTROLLED.

**When to run:** Open between gameweeks. Close at least 1 hour before the first match kickoff.

---

## 2. Group Stage Draft _(Draft mode only)_

Controls the initial player selection deadline and runs the squad allocation engine for the group stage.

| Field | Behaviour |
|---|---|
| DEADLINE | Datetime input. The cutoff after which managers can no longer change draft picks. |
| SET DEADLINE | Saves the deadline. Idempotent — can be updated any time before it passes. |
| RUN ALLOCATION | One-way. Runs the lottery + allocation engine for the group phase. |

**Allocation engine rules (applied at run time — no constraints during submission):**
- 15 players allocated per manager
- £100M budget per manager
- Position limits: GK ≤ 2, DEF ≤ 5, MID ≤ 5, FWD ≤ 3
- Club cap: max 3 players per club (see Club Cap Relaxation below)
- Conflicts resolved by random lottery

**Preconditions:**
- RUN ALLOCATION disabled until the draft deadline has passed.
- RUN ALLOCATION disabled once allocation is done (`cup_phase ≠ 'pre_cup'`) — button stays visible but greyed out. Status pill updates to `ALLOCATED`. No re-run is exposed to the commissioner.
- If the admin does not run allocation manually, a cron job fires automatically **4 hours before the first match**.

**Confirm dialog:**
> "This allocates squads for all N managers. It can't be undone without a manual reset. Continue?"

**After allocation runs:**
- Squad rows are written for all managers.
- Gazette entry published with contested picks and any incomplete squads.
- For cup-format leagues: cup clubs are auto-seeded (no manual step required).
- `cup_phase` is set to `group_stage` on the league row, signalling to the Season Stepper that allocation is done.

**When to run:** After all managers have submitted their picks. Before GW1 kickoff.

---

## 3. Knockout Draft _(Draft mode + cup format only)_

A second draft run at the group-stage → knockout transition. Same mechanics as the Group Stage Draft.

| Field | Behaviour |
|---|---|
| KNOCKOUT DEADLINE | Datetime input. The cutoff for knockout-phase draft picks. |
| RUN KNOCKOUT ALLOCATION | One-way. Runs the lottery + allocation engine for the knockout phase (`phase = 'knockout'`). |

**Preconditions:**
- **Locked** (non-interactive) until Group Stage allocation is confirmed complete (`cup_phase ≠ 'pre_cup'`). A status label explains why.
- Once unlocked: admin sets a new deadline, managers submit 30 new picks from the surviving club pool.
- Same auto-run cron applies: fires 4 hours before the first knockout match if not already triggered.
- After running, button stays visible but is disabled. Status pill updates to `ALLOCATED`. No re-run exposed.
- `cup_phase` is set to `elimination` after a successful knockout allocation run.

**Status values:**
- `LOCKED` — group allocation not yet complete (muted tone)
- `NOT SET` — group done, no knockout deadline yet (warn tone)
- `DEADLINE SET` — deadline exists, allocation not yet run (positive tone)
- `ALLOCATED` — knockout squads built (positive tone)

**When to run:** After the group stage ends and before the first knockout match.

---

## 4. Cup Format Rules (automatic — no admin action needed)

These rules apply automatically in cup tournaments and require no manual lifecycle operations.

**Eliminated club restriction:**
Once a club is knocked out of the tournament, managers can no longer buy that club's players. Managers who already hold eliminated players can keep them (they score 0).

Club elimination is detected automatically every 6 hours by the `sync-cup-eliminations` cron, which checks the fixtures table for clubs with no remaining future fixtures. Safety guard: if no club has future fixtures (API data not yet available), no eliminations are made.

**Club cap relaxation:**
As clubs exit the tournament and the pool shrinks, the 3-players-per-club cap rises automatically:

| Active clubs | Cap |
|---|---|
| > 8 | 3 (default) |
| ≤ 8 | 4 |
| ≤ 4 | 5 |
| ≤ 2 (final) | No cap |

This applies to all market buys and to the knockout allocation engine.

**Player-repeat relaxation (Draft mode only):**
When pool pressure becomes high (many managers chasing a small player pool), the no-repeat rule is automatically relaxed in tiers (0 → 1 → 3 → unlimited repeats allowed). A gazette entry is published when the tier changes.

---

## 5. Score Recalculation

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

**Safe to run multiple times:** Re-running is idempotent — it only overwrites with the latest data.

**When to run:** Any time a match result was corrected, or if scores look wrong for a specific fixture.

---

## 6. Status Pill Reference

| Status | Meaning | Tone |
|---|---|---|
| `OPEN` | Transfer window is active | Green (positive) |
| `CLOSED` | Window not currently open | Red (danger) |
| `SCHEDULED` | Set to open at a future time | Cyan |
| `DEADLINE SET` | Deadline exists, not yet passed | Green (positive) |
| `DEADLINE PASSED` | Deadline has passed, awaiting allocation | Warn |
| `ALLOCATED` | Allocation has run for this phase | Green (positive) |
| `NOT SET` | No deadline configured yet | Muted |
| `LOCKED` | Precondition not met (earlier step incomplete) | Muted |
| `UTILITY · ON-DEMAND` | Score recalc (no lifecycle dependency) | Muted |
| `DEADLINE-CONTROLLED` | WC/tournament league — matchday deadlines govern | Warn |

---

Last Updated: **2026-05-31**
