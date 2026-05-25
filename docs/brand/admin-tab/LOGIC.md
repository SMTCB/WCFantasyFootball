# LOGIC — Admin Tab behaviour spec

This document captures **new and changed behaviour** introduced by the redesign. Read it alongside `README.md`. The redesign keeps the same backend operations as the old admin screen; what changes is **how they are exposed, gated, and previewed**.

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
| Reward = single number. | Reward still a single number, but visualised as a **stepper** (−/+) and copy clarifies "Multipliers apply per pick based on league spread". |

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
- **RESET** button clears every wizard field and returns to step 1.

### 1.3 Per-step validation (forward-unlock rules)

| Step | Unlocks next step when | Notes |
|---|---|---|
| 1 — TYPE | `type !== null` | Selecting a type sets sensible defaults for Step 2 (e.g. default player pool for Top-Scorer). |
| 2 — CONFIGURE | `fixture !== ''` AND (if type=`player-block`) `blockPlayer !== ''` | For `top-scorer`, the player pool defaults to 5 popular forwards; admin can edit, but emptying the pool below 3 should warn (see 1.6). |
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

- **Empty player pool for `top-scorer`.** The auto-options would be empty. Block forward progress past Step 2 with the hint `"Add at least 3 players to the pool."`
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
- **Auto-resolve** is OFF by default and is exposed at the header for future configurability. The redesign assumes manual resolution today.

### 2.3 Edge cases

- **Custom answer.** If the actual result doesn't match any option (e.g. tied top scorer), the UI currently only allows picking from the chips. **TODO:** Add an "Other / write-in" affordance that opens a free-text input and treats the result as a custom void or split-payout — flag this for product design.
- **Late picks.** If a pick is recorded after kickoff (clock skew, etc.), server should reject — UI does not need to handle this here.

---

## 3. Lifecycle operations

Each operation card is independent. The redesign **does not change** the underlying programs, but it adds:
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

Status copy:
- `OPEN · CLOSES IN {duration}` (positive tone)
- `OPEN · NO SCHEDULED CLOSE` (warn tone)
- `SCHEDULED · OPENS {datetime}` (cyan tone)
- `CLOSED` (danger tone — neutral, just means "not currently open")

### 3.2 Draft

| Field | Behaviour |
|---|---|
| DEADLINE | Datetime input. The moment after which managers can no longer change draft picks. |
| SET DEADLINE | Persists the value; idempotent. |
| RUN ALLOCATION | **One-way.** Runs the lottery + allocation engine: resolves pick conflicts, allocates 15 players per manager, enforces £100M budget and position limits (GK ≤ 2, DEF ≤ 5, MID ≤ 5, FWD ≤ 3). **Show a confirm dialog**: "This allocates squads for all 14 managers. It can't be undone without a manual reset. Continue?" |

Preconditions:
- Allocation is **disabled** until the draft deadline has passed.
- Allocation is **hidden** once it has run successfully (status flips to `ALLOCATED · {count} CONFLICTS RESOLVED` and the button is replaced by a `↻ RE-RUN (admin reset)` ghost link).

### 3.3 Cup Phase

| Field | Behaviour |
|---|---|
| SEED CUP CLUBS | **One-way.** Initialises the no-repeat club pool: every manager gets the full 20-club list, and a per-manager used-clubs counter is created at zero. **Show a confirm dialog**: "Seeding the cup pool prevents repeat picks across cup rounds. It can't be undone for this season. Continue?" |

Preconditions:
- **Disabled** until allocation has run.
- Status reflects seeded/unseeded.

### 3.4 Score Recalculation

| Field | Behaviour |
|---|---|
| FIXTURE ID | The fixture to recalculate. The prototype uses a free-text field; production should be a typeahead bound to the fixture list. |
| RECALCULATE SCORES | Safe, idempotent. Re-fetches stats from the provider and reapplies the scoring engine to every player in the fixture. |

Side effects:
- Player scores and manager totals update; an event is logged with `before/after` diffs for audit.
- No confirmation dialog required — but the last-run line should update and a toast should confirm: `"Recalculated · {n} scores changed · {pts diff total}"`.

---

## 4. Season-state stepper

Pure presentation, but it's the **source of truth** for "what stage are we in":

| Phase | Condition for `done` | Condition for `active` |
|---|---|---|
| TRANSFER WINDOW | At least one window has opened and closed this season. | A window is currently open. |
| DRAFT DEADLINE | Deadline is set AND has passed. | Deadline is set AND in the future. |
| ALLOCATION | Allocation engine has run successfully. | Deadline has passed but allocation has not run. |
| CUP SEEDED | Cup pool is seeded. | Allocation done, cup not yet seeded. |
| IN SEASON | First fixture of the season has kicked off. | Cup seeded AND first kickoff hasn't happened. |

Only **one** phase should be `active` at a time. Multiple `done` phases stack until the active one. Past `active` phases become `done` once the next becomes `active`.

---

## 5. Permissions & access

- The `⚙ ADMIN` tab is **only rendered for users with the commissioner role**. Non-admins should not see the pill at all.
- All write actions (`PUBLISH`, `RESOLVE`, `VOID`, `OPEN`, `CLOSE NOW`, `SET DEADLINE`, `RUN ALLOCATION`, `SEED CUP CLUBS`, `RECALCULATE SCORES`) must be guarded server-side as well as in the UI.

---

## 6. Mobile-specific behaviour

- The accordion wizard (`<MobCreateBet/>`) collapses each completed step to its **one-line summary** (the value picked). Tapping the header re-expands.
- Lifecycle cards (`<MobLifecycleCard/>`) default to **collapsed** to keep scroll length manageable.
- All hit targets are ≥44px (the Apple HIG / Material minimum). Buttons span full width inside their card.
- The mobile pill row includes the admin pill at the end; horizontal scroll reveals it on the 390-wide design width.

---

## 7. Telemetry hooks (recommended)

Track these events so we know whether the new wizard helps:

```
admin.bet.wizard.start                 { type? }
admin.bet.wizard.step_complete         { step, type, msSinceStart }
admin.bet.wizard.reset                 { stepReachedBeforeReset }
admin.bet.publish                      { type, fixtureId, reward, msTotal }
admin.bet.resolve                      { betId, winningOption, mgrsAwarded }
admin.bet.void                         { betId }
admin.lifecycle.transfer.open          { scheduled: bool }
admin.lifecycle.transfer.close_now
admin.lifecycle.draft.set_deadline
admin.lifecycle.draft.run_allocation   { confirmed: bool }
admin.lifecycle.cup.seed               { confirmed: bool }
admin.lifecycle.score.recalculate      { fixtureId, scoresChanged }
```

These are recommendations — wire them to whatever analytics the codebase already uses.
