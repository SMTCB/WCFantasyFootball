# Auction System Design

**Complete specification for the draft-league auction mechanic: bidding, win confirmation, and transfer window integration.**

Last Updated: **2026-06-07** (rev 3 — deferred budget check, seller cancel anytime, winner name UI)

---

## Overview

The auction system allows managers in draft leagues to trade players via an open-bid mechanism. This document covers the **intended two-phase flow** (bid → confirm), the state machine, edge cases, and what needs to change from the initial implementation.

> **Classic leagues**: Auctions do not exist. The TRADING tab is hidden entirely for `format='classic'` leagues.

---

## Two-Phase Flow

### Phase 1 — Bidding (always available while `status='open'`)

1. A manager lists a player from their squad for auction (`listPlayer` from SquadScreen)
2. Other managers place bids before `deadline_at` — **no budget check at bid time**; any amount can be proposed
3. At deadline, the highest bidder "wins" — status moves to `pending_confirmation`
4. **Nothing is transferred yet.** The player stays with the seller.
5. The seller can **cancel the auction at any time** (including after bids are placed) via the CANCEL button in the TRADING tab. Two-tap confirm required.

### Phase 2 — Confirmation (buyer must act within the transfer window)

5. The winning manager sees a **CONFIRM PURCHASE** prompt in the TRADING tab
6. If their squad is full (15 players), the system **alerts them to sell a player first** — they cannot confirm until a slot is free. There is no automatic offload; the manager decides which player to sell via the transfer market, then returns to confirm.
7. The system checks budget **at confirmation time** (not at bid time). If budget is insufficient, the listing stays `pending_confirmation` — the buyer is prompted to sell a player to free up funds and retry. The listing is **not cancelled**.
8. Once a slot is free and budget is confirmed, the buyer clicks **CONFIRM** — the transfer executes immediately if the window is open

---

## State Machine

```
                          deadline passes
         has bids        ┌──────────────────► pending_confirmation
open ───────────────────►│                         │
         no bids         └──────────────────► cancelled       │
                                                               │
                          ┌────────────────────────────────────┘
                          ▼
              window open + buyer confirms
              + squad has slot + budget ok  ──────────────────► sold
                          │
              window closes without confirmation ────────────► cancelled
              (void — no transfer, no retry)
```

| Status | Meaning |
|--------|---------|
| `open` | Auction live, accepting bids |
| `pending_confirmation` | Deadline passed, buyer won, awaiting buyer action |
| `sold` | Transfer completed, buyer has player, seller received funds |
| `cancelled` | No bids placed, OR winner voided (window closed without confirm), OR squad/budget guard failed |

There is **no** second-chance mechanism (no fallback to 2nd highest bidder). Voided = cancelled, seller re-lists if they choose.

---

## Transfer Window Rules

The confirmation window **is** the transfer window. The winning manager must confirm before the window closes.

| Win scenario | When buyer can confirm | Void if |
|---|---|---|
| **Won during open window** | Immediately | Window closes before buyer confirms |
| **Won during closed window** | When next window opens | That next window closes before buyer confirms |

The player remains in the **seller's squad** throughout `pending_confirmation`. If won during a closed window, the seller legitimately fields the player during the match period — this is by design.

---

## Full Edge Cases

### Won during open transfer window

```
Window:  [──── OPEN ────────────────────]
Deadline:           ↑ win → pending
Confirm:                      ↑ must happen here (before window closes)
Void:                                              ↑ window closes → cancelled
```

### Won during closed transfer window (e.g. during live matches)

```
Window:  [── CLOSED ──][──── OPEN ────][── CLOSED ──]
Deadline:        ↑ win → pending
Window opens:               ↑ buyer can confirm now
Confirm:                          ↑ must happen here
Void:                                        ↑ window closes → cancelled
```

### Squad full at confirmation time

- `confirm_auction_win` returns `SQUAD_FULL` error
- Buyer must first sell a player via the transfer market (`execute_transfer_atomic` sell)
- Once they have a free slot (≤14 players), they retry `confirm_auction_win`
- If the transfer window closes while they are clearing space → void

### Budget insufficient at confirmation time

- No budget check at bid time — managers can propose any amount
- If insufficient at confirmation → `confirm_auction_win` returns `INSUFFICIENT_BUDGET` (actionable, same as `SQUAD_FULL`)
- Listing stays `pending_confirmation`; buyer sells a player to free funds, then retries
- Only `DUPLICATE` and `SELLER_GONE` / `BUYER_GONE` cause an outright cancel

### Seller's squad state

- Player stays in seller's `players` array until `sold`
- If `cancelled` (for any reason), no action needed — player was never removed
- No orphaned state possible

---

## DB Changes Required

### `auction_listings` table

Add one column:

```sql
ALTER TABLE auction_listings
  ADD COLUMN won_at TIMESTAMPTZ;
-- Populated when status transitions open → pending_confirmation
-- Used by the void-sweep cron to detect listings whose window has come and gone
```

The `status` column currently accepts any text. The valid values are:
`open` | `pending_confirmation` | `sold` | `cancelled`

No enum change needed (column is `text` with no CHECK constraint currently).

### No other schema changes

`confirmation_deadline_at` is NOT stored — it is computed dynamically from `get_transfer_window_status(league_id)` at the moment of confirmation and at the void sweep. This avoids stale timestamps if window schedules change.

---

## RPC Changes

### `resolve_auction_listing(p_listing_id uuid)` — modified

Currently: immediately transfers player on deadline.

New behaviour:
- **No bids** → cancel (unchanged)
- **Has bids** → set `status = 'pending_confirmation'`, set `won_at = NOW()`. **No transfer**.
- Remove all squad-size, budget, and duplicate guards (those move to `confirm_auction_win`)

This function is called by the `resolve-expired-auctions` cron every 5 minutes. The cron SQL stays the same — only the function body changes.

### `confirm_auction_win(p_listing_id uuid)` — new

Called by the buyer from the TRADING tab.

```
Guards (in order):
1. Listing exists + status = 'pending_confirmation'               → else NOT_FOUND
2. auth.uid() = listing.highest_bidder_id                         → else UNAUTHORIZED
3. get_transfer_window_status(listing.league_id).status = 'open'  → else WINDOW_CLOSED (actionable)
4. buyer squad exists                                              → else BUYER_GONE (+ cancel)
5. buyer squad not full (< squad_size)                            → else SQUAD_FULL (actionable — sell first, retry)
6. buyer has enough budget                                         → else INSUFFICIENT_BUDGET (actionable — sell first, retry)
7. player not already in buyer squad                              → else DUPLICATE (+ cancel)

On success:
  - Remove player from seller squad, add bid amount to seller budget
  - Add player to buyer squad, deduct bid amount from buyer budget
  - UPDATE auction_listings SET status = 'sold', updated_at = NOW()
  - Write gazette_entries row (entry_type='auction_result') — headline + bullet visible in FRONTPAGE/RECAP
  - RETURN { ok: true, result: 'sold', amount, player_id }
```

### Void sweep — added to `resolve-expired-auctions` cron

The existing cron (every 5 min) gains a second step after the `pending_confirmation` transition:

```sql
-- Step 1: open → pending_confirmation (existing, modified)
UPDATE auction_listings
SET status = 'pending_confirmation', won_at = NOW(), updated_at = NOW()
WHERE status = 'open' AND deadline_at < NOW() AND highest_bidder_id IS NOT NULL;

-- Cancel no-bid expired listings
UPDATE auction_listings
SET status = 'cancelled', updated_at = NOW()
WHERE status = 'open' AND deadline_at < NOW() AND highest_bidder_id IS NULL;

-- Step 2: pending_confirmation → cancelled (void sweep)
-- A listing is void if: it has been pending since before the most recent
-- transfer window opened for its league, AND that window has now closed.
-- i.e. a complete open-window cycle has passed without confirmation.
-- Implementation: for each pending listing, call get_transfer_window_status;
-- if the window is currently closed AND won_at < the time that window opened
-- (determined from matchday_deadlines) → cancel.
-- Exact SQL: handled in the migration as a plpgsql loop or a lateral join.
```

The exact cron SQL for the void sweep uses a lateral join on `matchday_deadlines` to determine whether a full window cycle has elapsed since `won_at` — specified during implementation.

---

## UI Changes (TRADING tab)

### For the winning buyer

When a listing is `pending_confirmation` and `highest_bidder_id = current_user`:

```
┌─────────────────────────────────────────────────────┐
│ 🏆 YOU WON THIS AUCTION                             │
│ Ronaldo · FWD · €8.5M                               │
│                                                     │
│ [if window closed]                                  │
│ ⏳ Awaiting transfer window — confirm when it opens │
│                                                     │
│ [if window open + squad full]                       │
│ ⚠ Squad full — sell a player first, then confirm   │
│                                                     │
│ [if window open + slot available]                   │
│ [ CONFIRM PURCHASE — €8.5M ]                        │
└─────────────────────────────────────────────────────┘
```

### For the seller

Listing shows status `PENDING BUYER CONFIRMATION` — read-only, no actions available until resolved.

### Notification dot

The TRADING tab dot fires for:
- Incoming trade proposals (existing)
- Listings where current user is `highest_bidder_id` AND status is `pending_confirmation` AND transfer window is open (action required now)

---

## What Needs to Change in Existing Code

| Component | Change |
|---|---|
| `resolve_auction_listing` (migration) | Remove transfer logic; set `pending_confirmation` + `won_at` on deadline |
| `resolve-expired-auctions` cron SQL | Add void-sweep step (or delegate to plpgsql function) |
| New migration | `won_at` column + `confirm_auction_win` RPC + updated `resolve_auction_listing` |
| `useAuctions.js` | Fetch `pending_confirmation` listings (currently only fetches `open`) |
| `AuctionCard.jsx` | Render CONFIRM button for pending_confirmation where user is winner |
| `TradingView.jsx` | Prioritise pending-confirmation won auctions at top with action prompt |
| `LeagueScreen.jsx` | Pass `user?.id` to `TradingView` to detect winner state |
| Notification dot | Add `pending_confirmation` + open window → badge fires |

---

## What Does NOT Change

- **Budget reservation** at bid time (migration 111 — already correct)
- **Duplicate bid guard** (moves from resolve to confirm)
- **RLS policies** — `confirm_auction_win` is SECURITY DEFINER, no RLS needed
- **`sell_now`** — seller-triggered early resolution; still immediately transfers (seller has consented, buyer is implicitly the current highest bidder in a live window)
- **Trade proposals** — entirely separate flow, unaffected

---

## Related Documents

- [FANTASY_POINTS_SCORING_LAYER.md](FANTASY_POINTS_SCORING_LAYER.md) — Scoring pipeline
- [TRANSFER_WINDOW_SYSTEM.md](TRANSFER_WINDOW_SYSTEM.md) — Transfer window rules and timing
- [LIVE_CENTRE_DESIGN.md](LIVE_CENTRE_DESIGN.md) — Live Centre fixture filtering

---

## Implementation Notes

- Migration number: `145_auction_two_phase.sql`
- The `resolve_auction_listing` function is currently called by the cron AND by `sell_now`. `sell_now` must NOT go through the pending_confirmation state — it should keep its current behaviour (immediate transfer, called only during an open window by the seller who has already consented).
- The void-sweep exact SQL should be benchmarked — the lateral join on `matchday_deadlines` per pending listing could be expensive if there are many leagues. A plpgsql function iterating over distinct league IDs is safer.
