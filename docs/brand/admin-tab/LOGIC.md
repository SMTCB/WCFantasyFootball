# LOGIC — Admin Tab behaviour spec

This document captures **behaviour rules for the Admin tab**. The redesign keeps the same backend operations as the old admin screen; what changes is **how they are exposed, gated, and previewed**.

---

## 1. Create-Bet wizard

### 1.1 What's new vs. the old screen

| Old | New |
|---|---|
| Single dense form: Bet Type → all-in-one config → submit. | 4-step linear wizard: **TYPE → CONFIGURE → REWARD → PUBLISH**. |
| No preview — admin had to publish to see the result. | **Live preview** of the BetRow (exactly what managers see in the BETS tab) updates on every keystroke. |
| Type-specific fields rendered together. | Type-specific fields rendered **only when relevant** (Step 2 changes based on type). |
| No auto-generated titles. | Title auto-derives from `{type}` + `{fixture}` + `{blockPlayer}`. The admin can override. |
| No "who picked what" before resolve. | Resolve flow shows monogram badges grouped by option pick. |
| Reward = single number. | Reward still a single number, visualised as a **stepper** (−/+). |

### 1.2 Step state machine

```
       step=1                       step=2                       step=3                       step=4
   ┌──────────┐ type set        ┌──────────┐ fixture set     ┌──────────┐ reward+locks    ┌──────────┐
   │   TYPE   │ ───────────────▶│ CONFIGURE│ ───────────────▶│  REWARD  │ ───────────────▶│ PUBLISH  │
   └──────────┘ ◀───────────────└──────────┘ ◀───────────────└──────────┘ ◀───────────────└──────────┘
                  back btn / step rail click on any reached step
```

Rules:
- **Forward** progress requires the current step's preconditions to be met (see 1.3).
- **Backward** progress is always allowed via Back button or by clicking any reached step in the step rail.
- The step rail only allows clicking on **reached** steps (the highest step the admin has ever advanced past, not the highest possible).
- **RESET** button clears every wizard field and returns to Step 1.

### 1.3 Per-step validation (forward-unlock rules)

| Step | Unlocks next step when | Notes |
|---|---|---|
| 1 — TYPE | `type !== null` | Selecting a type sets sensible defaults for Step 2 (e.g. default player pool for Top-Scorer). |
| 2 — CONFIGURE | `fixture !== ''` AND (if type=`player-block`) `blockPlayer !== ''` | For `top-scorer`, the player pool defaults to 5 popular forwards; admin can edit, but emptying the pool below 2 blocks forward progress (see 1.6). |
| 3 — REWARD | `reward >= 1` AND `closes !== ''` | Reward cannot be zero. Locks-at must parse as a future timestamp. |
| 4 — PUBLISH | — | Terminal step. The PUBLISH button fires the create action. |

### 1.4 Type-driven Step 2 content

| Bet type | Step 2 shows | Server-side options derivation |
|---|---|---|
| `top-scorer` | Fixture picker (radio) + player chip pool (multi-select) | Options = the selected player set. |
| `match-result` | Fixture picker (radio) only | Options = `['HOME', 'DRAW', 'AWAY']` — generated server-side from fixture metadata. |
| `player-block` | Fixture picker (radio) + single block-target dropdown | Options = `[blockPlayer]` (single-pick — managers vote yes/no to block this player). Resolution flag: `blocked` if player flops (see 1.5). |

### 1.5 Title auto-derivation

```
top-scorer    → "Top scorer · {fixture.label}"
match-result  → "Result · {fixture.label}"
player-block  → "Block · {blockPlayer}"
```

If `title` input is non-empty, the admin's value wins. The auto-derived value is shown as the input's placeholder.

### 1.6 Edge cases

- **Empty player pool for `top-scorer`.** Block forward progress past Step 2 with the hint `"Add at least 2 players to the pool."` (minimum 2 players required).
- **Past lock time.** If `closes` parses to a past timestamp, Step 4 PUBLISH must be disabled and the SummaryRow for LOCKS should display in `--danger` with sub `"In the past — can't publish."`
- **Duplicate bet.** Server should reject a second bet with the same `(fixture, type)` combination; the client should surface this as a non-blocking toast and rewind to Step 2.

### 1.7 PUBLISH side effects

1. Create the bet record (`state = 'open'`).
2. Push a notification to every manager in the league.
3. Insert a system message in the league chat ("New bet open: …").
4. The bet now appears in every manager's BETS tab under "OPEN".
5. Wizard resets to Step 1.

### 1.8 Editability after PUBLISH

A bet **can be edited** until the first manager picks. After the first pick, edits are blocked; only **VOID** is available (refunds picks, marks bet as voided). This is enforced server-side; the UI should grey out the edit affordances and show a tooltip explaining why.

---

## 2. Resolve-Bets flow

### 2.1 What's new vs. the old screen

| Old | New |
|---|---|
| Single dropdown of pending bets + RESOLVE button. | List view — every pending bet is its own card with full context. |
| No visibility into picks. | **Who-picked-what** monogram grouping is part of the resolve UI. |
| No partial-state guard. | RESOLVE is disabled until the admin selects a winning option chip. Prevents fat-finger resolutions. |
| Resolution wrote a value to a hidden field. | Answer is selected via the same option chips managers saw — visual symmetry with the bet card. |
| No void action. | Explicit **VOID** ghost button beside RESOLVE for cases where the fixture is cancelled / postponed. |

### 2.2 Behaviour

- Only **one** card is expanded at a time. Clicking another collapses the current.
- `answer[betId]` is local state — the admin can switch the picked answer freely before clicking RESOLVE.
- The footer lead-in updates live: `"AWARDS +{reward} PTS TO {N} MANAGERS"` where N is the count of managers who picked that option.
- **RESOLVE** fires the server action: `resolveBet(betId, winningOption)`. Server marks bet `state = 'resolved'`, sets `answer`, computes `won/lost` per pick, awards points, notifies the league.
- **VOID** fires `voidBet(betId)`. Bet becomes `state = 'voided'`, no points awarded, picks shown as VOIDED in managers' BETS tabs.
- **Auto-resolve** is OFF by default. The redesign assumes manual resolution today.

### 2.3 Edge cases

- **Custom answer.** If the actual result doesn't match any option (e.g. tied top scorer), the UI includes a free-text override input below the option chips. The admin types the correct answer key manually.
- **Late picks.** If a pick is recorded after kickoff (clock skew, etc.), server should reject — UI does not need to handle this here.
- **Bet still open.** `resolve_bet` returns `BET_STILL_OPEN` if called before the deadline passes. Resolution is blocked server-side until `deadline_at` has passed.

---

## 3. Lifecycle operations

Each operation card is independent. The redesign adds:
- An explicit `STATUS` pill (so the admin sees the current state without running anything).
- A `WHEN TO RUN` hint (so the admin knows whether it's the right moment).
- Colour coding by criticality.
- A confirmation gate for **one-way** operations.

### 3.1 Transfer Window

| Field | Behaviour |
|---|---|
| OPENS | Datetime input. Required to schedule an open. |
| CLOSES | Datetime input. Optional — if blank, the window stays open until CLOSE NOW. |
| LIMIT | Integer or blank. Blank = unlimited transfers per manager during the window. |
| OPEN | Sets `transferWindow.state = 'open'`, emits a league notification. |
| CLOSE NOW | Sets `state = 'closed'` immediately, regardless of the scheduled CLOSES value. **Show a confirm dialog**: "This stops all in-progress transfers. Continue?" |

**For deadline-controlled leagues (WC/tournament leagues):** Transfer windows are governed by `matchday_deadlines`, not the `transfer_windows` table. The OPEN/CLOSE buttons have no enforcement effect — a `DEADLINE-CONTROLLED` status label is shown instead and the buttons are hidden.

Status values:
- `OPEN` (positive tone) — window is active
- `CLOSED` (danger tone) — not currently open
- `DEADLINE-CONTROLLED` (warn tone) — WC/tournament league; matchday deadlines govern

### 3.2 Draft (Draft mode only)

**Draft section visibility is strictly mode- and format-driven:**

| League type | Draft section shown |
|---|---|
| Classic (any format) | **Hidden** — no draft mechanics exist |
| Draft mode, League format | **Group Stage Draft only** |
| Draft mode, Cup format | **Group Stage Draft + Knockout Draft** (Knockout Draft card hidden until cup-format evidence exists) |

"Cup-format evidence" = `cup_phase` has transitioned beyond `pre_cup` (group seeding ran) OR `knockout_draft_deadline` has been set by the admin. For League-format Draft leagues (e.g. EPL), `cup_phase` never advances, so the Knockout Draft card never appears.

#### Group Stage Draft

| Field | Behaviour |
|---|---|
| DEADLINE | Datetime input. The moment after which managers can no longer change draft picks. |
| SET DEADLINE | Persists the value; idempotent. |
| RUN ALLOCATION | **One-way.** Runs the lottery + allocation engine. **Show a confirm dialog.** |

Preconditions:
- Allocation is **disabled** until the draft deadline has passed.
- Once allocation has run, the button is disabled. Status pill updates to `ALLOCATED`. No re-run pathway is exposed to the admin.
- A cron job auto-fires allocation **4 hours before the first match** if the admin has not already triggered it.

#### Knockout Draft (Cup format only)

Same fields and behaviour as Group Stage Draft, with visibility gating:
- Card is **hidden** for League-format Draft leagues (cup_phase never advances).
- Card **appears** for Cup-format Draft leagues once `cup_phase ≠ 'pre_cup'` OR the admin has already set a `knockout_draft_deadline`.
- Once visible, the card can be in states: NOT SET, DEADLINE SET, ALLOCATED.
- Same preconditions and auto-cron as the Group Stage Draft.

### 3.3 League News

Commissioners can post breaking news headlines to the league's activity feed (Gazette). This section is always visible (mode- and format-agnostic).

| Field | Behaviour |
|---|---|
| HEADLINE | Text input (max 200 chars). Required. |
| DETAILS | Textarea. Optional — each line becomes one bullet in the gazette entry. |
| POST TO LEAGUE | Inserts a `gazette_entries` row (`entry_type = 'breaking_news'`); appears immediately in all managers' RECAP tab. |

No confirmation dialog is required — posts can be published freely.

### 3.4 Score Recalculation

| Field | Behaviour |
|---|---|
| SCORE LATEST ROUND | Re-scores all players in the most recently completed round. |
| FIXTURE ID input | Free-text field for a specific fixture ID (e.g. `f-1219435455`). |
| RECALCULATE | Re-scores only the specified fixture. |

Side effects:
- Player scores and manager totals update; an event is logged with `before/after` diffs for audit.
- No confirmation dialog required — safe and idempotent.

---

## 4. Season-state stepper

Pure presentation — the **source of truth** for "what stage are we in". The stepper is mode-aware: Draft and Classic leagues show different stage sets.

### Classic mode stepper (2 stages)

```
TRANSFER WINDOW → IN SEASON
```

No draft or allocation stages exist for Classic leagues.

### Draft mode — League format stepper (4 stages)

```
TRANSFER WINDOW → DRAFT DEADLINE → ALLOCATION → IN SEASON
```

### Draft mode — Cup format stepper (4 stages)

```
TRANSFER WINDOW → DRAFT DEADLINE → ALLOCATION → IN SEASON
```

**Same 4 stages as League format.** The Knockout Draft lifecycle is tracked in the Lifecycle Operations section (as a separate card), not as a stepper stage. This keeps the stepper simple and consistent.

### DB column mapping (all Draft modes)

| Stage | `done` condition | `active` condition | Source |
|---|---|---|---|
| TRANSFER WINDOW | Draft deadline is set | No deadline yet | `leagues.draft_deadline IS NOT NULL` |
| DRAFT DEADLINE | Allocation has run | Deadline set & in future | `leagues.draft_deadline` |
| ALLOCATION | — (same as IN SEASON) | Deadline passed, no allocation yet | `cup_phase ≠ 'pre_cup'` |
| IN SEASON | Terminal | Allocation ran | `cup_phase ≠ 'pre_cup'` |

### Sub-text per stage

| Stage | Sub text |
|---|---|
| TRANSFER WINDOW | `"Open · transfers enabled"` or `"Closed"` |
| DRAFT DEADLINE | Formatted deadline timestamp, or `"Not set"` |
| ALLOCATION | `"Squads allocated"` / `"Processing…"` / `"Awaiting draft"` |
| IN SEASON | `"Live"` or `"Awaiting allocation"` |

### Fallback

If `league` is `null` (no active league loaded), the stepper renders with hardcoded demo phase data so the component never crashes.

---

## 5. League Mode Help — ? Button Copy

A `?` button appears at the top of the Lifecycle Operations section. Tapping it opens a modal with the following copy:

---

**LEAGUE MODES — HOW THEY WORK**

**Classic**
All managers can hold the same players simultaneously. There are no uniqueness rules — if Salah is available, every manager can buy him. Points are scored independently. This mode rewards the manager who makes the best decisions, not just who gets to the market first.

Best for: casual leagues, friends groups, tournament formats where simplicity matters.

**Draft**
Each player belongs to exactly one manager at a time. The season starts with a blind draft: every manager submits a ranked list of up to 30 preferred players (no constraints during submission — pick freely). When the deadline passes, the allocation engine resolves conflicts and builds each squad. After that, the market is first-come-first-served from the remaining unallocated pool.

Best for: competitive leagues where fairness and player uniqueness are important.

---

**CUP FORMAT RULES (both modes)**

In cup tournaments, as clubs are knocked out:
- You **cannot buy** players from eliminated clubs (you can keep ones you already hold — they just score 0)
- The maximum players from the same club in your squad rises automatically as fewer clubs remain:
  - More than 8 clubs active → max 3 per club
  - 8 or fewer → max 4
  - 4 or fewer → max 5
  - Final (2 clubs) → no limit

In Draft mode, the no-repeat rule also relaxes automatically as the player pool shrinks.

**Position rules always apply** regardless of mode, format, or stage.

---

## 6. Permissions & access

- The `⚙ ADMIN` tab is **only rendered for users with the commissioner role**. Non-admins do not see the tab at all.
- All write actions (`PUBLISH`, `RESOLVE`, `VOID`, `OPEN`, `CLOSE NOW`, `SET DEADLINE`, `RUN ALLOCATION`, `RECALCULATE SCORES`, `POST TO LEAGUE`) must be guarded server-side as well as in the UI.

---

## 7. Mobile-specific behaviour

- The accordion wizard (`<MobCreateBet/>`) collapses each completed step to its **one-line summary** (the value picked). Tapping the header re-expands.
- Lifecycle cards (`<MobLifecycleCard/>`) default to **collapsed** to keep scroll length manageable.
- Card count varies by mode: Classic = 2 cards (Transfer Window + Score Recalc); Draft League format = 3 cards; Draft Cup format = 4 cards (adds Knockout Draft when cup evidence exists).
- All hit targets are ≥44px (the Apple HIG / Material minimum). Buttons span full width inside their card.
- The mobile pill row includes the admin pill at the end; horizontal scroll reveals it on the 390-wide design width.
- League News section appears after lifecycle cards on mobile.

---

## 8. Telemetry hooks (recommended)

Track these events so we know whether the new wizard helps:

```
admin.bet.wizard.start                 { type? }
admin.bet.wizard.step_complete         { step, type, msSinceStart }
admin.bet.wizard.reset                 { stepReachedBeforeReset }
admin.bet.publish                      { type, fixtureId, reward, msTotal }
admin.bet.resolve                      { betId, winningOption, mgrsAwarded }
admin.bet.void                         { betId }
admin.lifecycle.transfer.open                    { scheduled: bool }
admin.lifecycle.transfer.close_now
admin.lifecycle.draft.set_deadline               { phase: 'group' | 'knockout' }
admin.lifecycle.draft.run_allocation             { phase: 'group' | 'knockout', confirmed: bool }
admin.lifecycle.draft.auto_run_cron              { phase: 'group' | 'knockout', skipped: bool }
admin.lifecycle.score.recalculate                { fixtureId, scoresChanged }
admin.lifecycle.news.post                        { headlineLength, bulletCount }
```

These are recommendations — wire them to whatever analytics the codebase already uses.
