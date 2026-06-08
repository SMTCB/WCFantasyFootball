# Draft Mechanics for Dummies

**A plain-English, step-by-step explanation of how the Forza Fantasy League draft works — no jargon, no code.**

---

## The Big Idea: Sealed wish lists + snake draft

There are two parts to this draft:

1. **Sealed submission** — everyone submits their ranked wish list privately, before the draft runs. No one sees what others listed. No real-time picking.
2. **Snake draft on those lists** — when the commissioner presses "Run Allocation", the system processes the wish lists round by round in a snake order. Your ranking directly determines when each player is "tried" for you.

This combines the convenience of a sealed bid (no one needs to be online at the same time) with the fairness of a snake draft (rank matters — your #1 pick is tried before your #6).

---

## What managers do before the draft

Each manager submits a **ranked wish list** of up to 45 players. Rank 1 = most wanted.

There are **no constraints during submission**:
- You can list 20 defenders if you want.
- You can list 10 players from the same club.
- You can list players you can't afford.

The strategy is to think carefully about your ranking — players you list higher get tried earlier — and to list plenty of backup options lower down in case your top picks are taken by others.

---

## What happens when the commissioner runs the allocation

### Phase 0 — Keeps (knockout phase only)

Before anything else, players that managers "kept" from the group stage are locked in. They bypass the snake entirely and go straight to their keeper's squad. If a keep would violate a cap it is silently skipped. If there are no keeps (or it's the group stage draft), this phase is a complete no-op.

---

### Phase 1 — Assign a random snake order

One random roll shuffles the managers into a pick order. For example:

**Round 1 order: Bob → Alice → Charlie**
**Round 2 order: Charlie → Alice → Bob** (reversed)
**Round 3 order: Bob → Alice → Charlie** (back to original)
…and so on.

This is the only randomness in the entire draft. Every manager has an equal chance of being first.

---

### Phase 2 — Snake rounds

The system processes rounds one at a time. In each round, every manager gets **one turn** in the snake order.

**On your turn:** the system walks forward through your wish list from where it last left off, skipping any player that is already taken or would violate a cap, and picks the first valid one it finds. Your pointer stays where it landed — next round it continues from there.

**Example with 3 managers, round 1 order Bob → Alice → Charlie:**

| Turn | Manager | Tries | Result |
|------|---------|-------|--------|
| 1 | Bob | #1 Mbappe → available | **Bob gets Mbappe** |
| 2 | Alice | #1 Salah → available | **Alice gets Salah** |
| 3 | Charlie | #1 Haaland → available | **Charlie gets Haaland** |

**Round 2 order: Charlie → Alice → Bob**

| Turn | Manager | Tries | Result |
|------|---------|-------|--------|
| 4 | Charlie | #2 Mbappe → **taken** → #3 Bellingham → available | **Charlie gets Bellingham** |
| 5 | Alice | #2 De Bruyne → available | **Alice gets De Bruyne** |
| 6 | Bob | #2 Kane → available | **Bob gets Kane** |

Rounds continue until all squads have 15 players or all lists are exhausted.

---

### Why rank now genuinely matters

Alice has Salah at rank 1. Charlie has Salah at rank 6.

- Round 1: Alice tries her rank-1 pick (Salah) → gets it.
- Charlie won't even try Salah until her 6th turn. By then Alice already has him.

**Alice's higher ranking gave her priority.** Under the old flat lottery, both had 50/50 odds regardless of rank. Under the snake draft, the manager who values a player more (ranks them higher) gets meaningful priority.

The only remaining luck is the initial random snake order — and the snake reversal partially compensates for that across rounds.

---

## Worked example end to end

**League:** 3 managers, squad size 15, budget £100M, club cap 3.

**Random snake order assigned: Alice → Bob → Charlie**

**Submitted wishlists (top 6 shown):**

| Rank | Alice | Bob | Charlie |
|------|-------|-----|---------|
| 1 | Salah | Mbappe | Haaland |
| 2 | Haaland | Salah | Mbappe |
| 3 | De Bruyne | De Bruyne | Bellingham |
| 4 | Bellingham | Kane | Salah |
| 5 | Kane | Rashford | Kane |
| 6 | Rashford | Bellingham | De Bruyne |

**Round 1 (Alice → Bob → Charlie):**

| Turn | Manager | Tries | Outcome |
|------|---------|-------|---------|
| 1 | Alice | Salah (rank 1) → free | ✓ Alice gets **Salah** |
| 2 | Bob | Mbappe (rank 1) → free | ✓ Bob gets **Mbappe** |
| 3 | Charlie | Haaland (rank 1) → free | ✓ Charlie gets **Haaland** |

**Round 2 (Charlie → Bob → Alice):**

| Turn | Manager | Tries | Outcome |
|------|---------|-------|---------|
| 4 | Charlie | Mbappe (rank 2) → **taken** → Bellingham (rank 3) → free | ✓ Charlie gets **Bellingham** |
| 5 | Bob | Salah (rank 2) → **taken** → De Bruyne (rank 3) → free | ✓ Bob gets **De Bruyne** |
| 6 | Alice | Haaland (rank 2) → **taken** → De Bruyne (rank 3) → **taken** → Bellingham (rank 4) → **taken** → Kane (rank 5) → free | ✓ Alice gets **Kane** |

Note how Alice's pointer advanced past 4 players in round 2 — she skipped everything already taken. In round 3 her pointer starts at rank 6.

**Rounds continue until all squads reach 15 players.**

---

## Why is this fair?

| Concern | Answer |
|---------|--------|
| Does being first to submit help? | No — all submissions are sealed. No one sees others' lists before the draft runs. |
| Does the initial snake order matter? | It determines tie-breaks when two managers list the same player at the same rank. The snake reversal compensates across rounds. |
| Are popular players always won by the luckiest person? | No. The manager who ranked the player higher has priority — they try for them in an earlier round. |
| What if I have a short list? | You get fewer turns. With a 10-player list you can get at most 10 players, guaranteeing 5 empty slots. List at least 15 good options; 45 gives full coverage. |
| What if my budget runs out before 15 players? | Remaining slots are empty; you fill them via Squad Recovery from the open pool. |

---

## What the ranking in your wish list actually does

The ranking has **two distinct effects:**

**1. It determines when a player is tried**
Your rank-1 pick is tried in round 1. Your rank-6 pick is not tried until your 6th turn. The earlier a player is tried, the less likely it is that someone else has already taken them.

**2. It determines priority when your own picks compete for the same position slot**
If you end up with 6 midfielders but can only hold 5, the ones you ranked higher get the slots. The 6th is simply not allocated to you — it stays available for others.

### The rank 1 vs rank 6 example

Alice lists Salah at rank 1. Charlie lists Salah at rank 6.

- Round 1: Alice tries Salah. If no one earlier in that round took him, Alice gets him.
- Charlie won't try Salah until her 6th turn — by which point Alice almost certainly already has him.

**Alice's rank-1 placement gave her a real advantage.**

### What the snake order means for ties

If Alice AND Charlie both list Salah at rank 1, whoever appears first in round 1's snake order wins Salah. The other manager's pointer advances past Salah to their rank-2 pick immediately. This is the only remaining luck — a tie-break for genuinely equal priority.

---

## Glossary

| Term | Meaning |
|------|---------|
| **Wish list** | A manager's ranked list of players submitted before the draft runs |
| **Snake order** | The pick sequence for round 1, assigned by a single random shuffle. Reverses every round. |
| **Pointer** | Each manager's current position in their wish list. Advances forward, never resets. A player tried and skipped (taken/invalid) still advances the pointer. |
| **Turn** | One manager's opportunity in a round — walk forward from pointer, skip taken/invalid, take first valid pick. |
| **Pass 0** | Knockout phase only — keeps are pre-allocated before the snake runs |
| **Squad Recovery** | Post-draft screen where managers with < 15 players fill empty slots FCFS |
| **Initial build latch** | Managers with < 15 players after the draft are exempt from the 3-transfer-per-round limit until their squad reaches 15 |

---

## Related Documents

- [DRAFT_SYSTEM_DESIGN.md](DRAFT_SYSTEM_DESIGN.md) — Full technical spec: DB schema, admin controls, two-phase cup draft, decision log
- [POOL_RELAXATION_SYSTEM.md](POOL_RELAXATION_SYSTEM.md) — How the no-repeat and club-cap rules relax as the pool shrinks
- [TRANSFER_WINDOW_SYSTEM.md](TRANSFER_WINDOW_SYSTEM.md) — Post-draft transfers

---

Last Updated: **2026-06-09** (full rewrite — snake draft replaces flat lottery)
