# BETS — Admin Logic Reference

**Full specification for the Create Bet wizard and the Resolve Bets flow in the Admin tab. Read alongside `LOGIC.md` sections 1 and 2.**

---

## 1. Create Bet — 4-Step Wizard

### 1.1 Overview

Commissioners create prediction challenges for the league using a 4-step linear wizard:

```
STEP 1: TYPE → STEP 2: CONFIGURE → STEP 3: REWARD → STEP 4: PUBLISH
```

Each step must be completed before the next unlocks. The admin can go back to any previously reached step at any time. RESET clears all fields and returns to Step 1.

A **live preview** of the bet card (exactly what managers see in their BETS tab) updates on every change in the right-hand panel.

---

### 1.2 Bet Types

| Type | Label | Glyph | Resolution |
|---|---|---|---|
| `top_scorer` | TOP SCORER | ◉ | Who scores the most goals across selected fixture(s)? |
| `match_result` | MATCH RESULT | ◈ | Home Win / Draw / Away Win for a single fixture |
| `player_block` | PLAYER BLOCK | ⛌ | Managers pick a player to block; they earn points if that player flops |

**Player Block flop definition:** 0 goals + ≤30 minutes played, OR a red card.

---

### 1.3 Step Validation Rules

| Step | Unlocks next when… |
|---|---|
| 1 — TYPE | A bet type is selected |
| 2 — CONFIGURE | Fixture selected (all types) AND block player selected (player-block only); top-scorer requires ≥2 players in pool |
| 3 — REWARD | Reward ≥ 1 AND a future closes-at datetime is set |
| 4 — PUBLISH | Terminal step — PUBLISH button fires the create action |

---

### 1.4 Auto-Generated Titles

The bet title is auto-derived if the admin leaves the title field blank:

| Type | Auto title |
|---|---|
| `top_scorer` | `"Top scorer · {N} matches"` or `"Top scorer · Home vs Away"` |
| `match_result` | `"Result · Home vs Away"` |
| `player_block` | `"Block · {Player Name}"` |

The admin can override the title by typing in the title field.

---

### 1.5 Top Scorer — Player Pool

- Defaults to the top 5 FWD + MID players by price for the active tournament.
- Admin can add up to 8 players total via the player search modal.
- Minimum of 2 players required to proceed to Step 3.
- Match scope: up to 4 fixtures can be selected (next 7 days shown by default; "Add from another round" for future matches).

---

### 1.6 Publishing Side Effects

When the PUBLISH button is clicked:

1. A new `bet_instances` record is created with `status = 'open'`.
2. A push notification is sent to every manager in the league.
3. A system message is posted in the league chat.
4. The bet appears in every manager's BETS tab under "OPEN".
5. The wizard resets to Step 1.

---

### 1.7 Editability After Publish

| State | Edit allowed? |
|---|---|
| No picks yet | Yes — any field can be changed |
| At least one pick submitted | No — only VOID is available |

This is enforced server-side. The UI greys out edit affordances and shows a tooltip when editing is blocked.

---

## 2. Resolve Bets Flow

### 2.1 Overview

After a match finishes, unresolved bets appear in the RESOLVE BETS column. Only one bet card is expanded at a time. The admin selects the winning option and clicks RESOLVE.

**Auto-resolve is OFF** — all resolutions require manual commissioner action.

---

### 2.2 Resolution Steps

1. Expand a bet card by clicking it.
2. View who picked what (monogram badges grouped by option).
3. Select the winning option chip (or type a custom answer key for edge cases).
4. The footer live-updates: `"AWARDS +{reward} PTS TO {N} MANAGERS"`.
5. Click RESOLVE → points are awarded instantly, bet marked as `resolved`.

---

### 2.3 VOID

Click VOID to cancel a bet when the underlying fixture is cancelled, postponed, or otherwise unresolvable:

- All picks are refunded (no points awarded).
- Bet is marked `state = 'voided'`.
- Managers see "VOIDED" in their BETS tab.
- A confirmation dialog is shown before voiding.

---

### 2.4 Edge Cases

| Case | Behaviour |
|---|---|
| No predefined options match actual result | Type the correct answer key manually in the free-text input |
| Fixture cancelled / postponed | Use VOID — do not resolve with a dummy answer |
| Late picks (after kickoff) | Server rejects; UI does not need to handle this |
| Duplicate bet same fixture + type | Server rejects; client shows a toast and rewinds to Step 2 |

---

## 3. Reward System

- Reward is a **base point value** (integer ≥ 1).
- Every manager who picks the correct answer earns exactly `reward` points.
- Points are applied to `fantasy_points` immediately upon resolution.
- Budget-type bets credit `budget_remaining` instead of fantasy points (if configured).

---

## 4. Notifications

| Event | Notification sent to |
|---|---|
| Bet published | All league managers |
| Bet resolved | All managers who submitted a pick |
| Bet voided | All managers who submitted a pick |

---

Last Updated: **2026-05-31**
