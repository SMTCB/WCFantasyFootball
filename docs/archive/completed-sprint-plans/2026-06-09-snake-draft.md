# Snake Draft Allocation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat random lottery in `run-draft-lottery` with a snake draft that respects wish-list rank, then update all affected docs.

**Architecture:** A single random roll assigns the initial pick order. Rounds alternate direction (snake). Each manager's turn walks their wish list forward from a pointer, skipping taken/invalid players, until one valid pick is found. Pass 0 (knockout keeps) is unchanged. Everything after allocation (squads write, gazette, notifications) is unchanged except the gazette headline/full_data which now records the snake order.

**Tech Stack:** Deno Edge Function (supabase/functions), JavaScript, Supabase JS client, crypto.getRandomValues for fairness.

---

## Files

| Action | File |
|--------|------|
| Modify | `supabase/functions/run-draft-lottery/index.js` |
| Modify | `docs/architecture/DRAFT_SYSTEM_DESIGN.md` |
| Modify | `docs/architecture/DRAFT_MECHANICS_FOR_DUMMIES.md` |

---

## Task 1: Create feature branch

- [ ] **Step 1.1: Pull main and create branch**

```bash
git checkout main
git pull origin main
git checkout -b claude/snake-draft-allocation
```

---

## Task 2: Rewrite allocation logic in run-draft-lottery

**File:** `supabase/functions/run-draft-lottery/index.js`

The section to replace runs from line 159 (start of `else {`) to line 338 (end of `allocations = {}` block, just before the `// 6. Write draft_allocations rows` comment at line 342).

Everything outside that block — auth checks, re-entry guard, cup_phase update, squads upsert, submissions flip, gazette call, notifications — stays byte-for-byte identical.

- [ ] **Step 2.1: Replace the allocation block**

Replace the entire `else {` block (lines 159–354, from `} else {` through the closing `}` of that else, which is the line just before `// 6c. Update cup_phase`) with the following:

```js
  } else {
    // Pass 0: load keep submissions for the knockout phase.
    // For all other phases (group, etc.) this query returns nothing — true no-op.
    const { data: keepRows } = phase === 'knockout'
      ? await supabase.from('knockout_keep_submissions').select('user_id, player_ids').eq('league_id', leagueId)
      : { data: [] };

    const keepsByManager = {};
    for (const row of keepRows ?? []) {
      keepsByManager[row.user_id] = row.player_ids ?? [];
    }

    // Load player data for all wish-list and keep player IDs.
    const wishListIds  = [...new Set(submissions.flatMap(s => s.player_ids))];
    const keepIds      = [...new Set(Object.values(keepsByManager).flat())];
    const allPlayerIds = [...new Set([...wishListIds, ...keepIds])];

    const { data: playerRows } = await supabase
      .from('players')
      .select('id, position, price, forza_team_id')
      .in('id', allPlayerIds)
      .eq('tournament_id', leagueRow?.tournament_id);

    const { data: clubCapData } = await supabase.rpc('get_club_cap', { p_league_id: leagueId });
    const CLUB_CAP = (clubCapData !== null && clubCapData !== undefined) ? clubCapData : 3;

    const playerMap = Object.fromEntries((playerRows ?? []).map(p => [p.id, p]));

    // Initialise per-manager state for every submitter.
    const userState = {};
    for (const sub of submissions) {
      userState[sub.user_id] = {
        allocated:  [],
        posCounts:  { GK: 0, DEF: 0, MID: 0, FWD: 0 },
        clubCounts: {},
        budgetUsed: 0,
      };
    }

    // Pass 0: pre-allocate kept players (knockout only).
    // kept players go into `taken` — the snake loop will skip them naturally.
    const taken = new Set();
    for (const [uid, keepPids] of Object.entries(keepsByManager)) {
      if (!userState[uid]) {
        userState[uid] = { allocated: [], posCounts: { GK: 0, DEF: 0, MID: 0, FWD: 0 }, clubCounts: {}, budgetUsed: 0 };
      }
      const u = userState[uid];
      for (const pid of keepPids) {
        if (u.allocated.length >= SQUAD_SIZE) break;
        const player = playerMap[pid];
        if (!player) continue;
        const pos    = normalisePosition(player.position);
        const teamId = player.forza_team_id;
        const clubCnt = teamId ? (u.clubCounts[teamId] ?? 0) : 0;
        if (u.posCounts[pos] >= SQUAD_POS_CAPS[pos]) continue;
        if (u.budgetUsed + player.price > budget)    continue;
        if (teamId && CLUB_CAP < 99 && clubCnt >= CLUB_CAP) continue;

        u.allocated.push(pid);
        u.posCounts[pos]++;
        if (teamId) u.clubCounts[teamId] = clubCnt + 1;
        u.budgetUsed += player.price;
        taken.add(pid);
      }
    }

    // Snake draft allocation.
    //
    // One random roll assigns the initial pick order (Fisher-Yates shuffle).
    // Rounds alternate direction: even rounds = original order, odd = reversed.
    // On each turn a manager walks their wish list forward from their pointer,
    // skipping players already taken or that violate caps/budget, and takes the
    // first valid pick. The pointer never resets — it carries across rounds.
    // This means a player ranked #1 is tried in round 1; a player ranked #6 is
    // not tried until that manager's 6th available turn, giving higher-ranked
    // picks genuine priority over lower-ranked ones.

    // Assign random initial order
    const snakeOrder = submissions.map(s => s.user_id);
    for (let i = snakeOrder.length - 1; i > 0; i--) {
      const roll = crypto.getRandomValues(new Uint32Array(1))[0] / 0xFFFFFFFF;
      const j    = Math.floor(roll * (i + 1));
      [snakeOrder[i], snakeOrder[j]] = [snakeOrder[j], snakeOrder[i]];
    }

    // One pointer per manager — tracks position in their wish list
    const pointers = {};
    for (const sub of submissions) pointers[sub.user_id] = 0;

    const submissionMap = {};
    for (const sub of submissions) submissionMap[sub.user_id] = sub.player_ids;

    const maxRounds = Math.max(...submissions.map(s => s.player_ids.length), 0);

    for (let round = 0; round < maxRounds; round++) {
      const roundOrder = round % 2 === 0 ? [...snakeOrder] : [...snakeOrder].reverse();

      for (const uid of roundOrder) {
        const u = userState[uid];
        if (u.allocated.length >= SQUAD_SIZE) continue;

        const list = submissionMap[uid] || [];

        while (pointers[uid] < list.length) {
          const pid = list[pointers[uid]];
          pointers[uid]++;

          if (taken.has(pid)) continue;

          const player = playerMap[pid];
          if (!player) continue;

          const pos     = normalisePosition(player.position);
          const teamId  = player.forza_team_id;
          const clubCnt = teamId ? (u.clubCounts[teamId] ?? 0) : 0;

          if (u.posCounts[pos] >= SQUAD_POS_CAPS[pos]) continue;
          if (u.budgetUsed + player.price > budget)    continue;
          if (teamId && CLUB_CAP < 99 && clubCnt >= CLUB_CAP) continue;

          u.allocated.push(pid);
          u.posCounts[pos]++;
          if (teamId) u.clubCounts[teamId] = clubCnt + 1;
          u.budgetUsed += player.price;
          taken.add(pid);
          break;
        }
      }

      // Early exit: all squads full
      if (Object.values(userState).every(u => u.allocated.length >= SQUAD_SIZE)) break;
      // Early exit: all wish lists exhausted
      if (Object.keys(pointers).every(uid => pointers[uid] >= (submissionMap[uid]?.length ?? 0))) break;
    }

    allocations = {};
    for (const [uid, u] of Object.entries(userState)) {
      allocations[uid] = {
        allocated_players: u.allocated,
        unresolved_slots:  Math.max(0, SQUAD_SIZE - u.allocated.length),
        budget_used:       u.budgetUsed,
      };
    }

    // Phase 1 commit point: write draft_allocations
    const allocationRows = Object.entries(allocations).map(([userId, data]) => ({
      league_id:         leagueId,
      user_id:           userId,
      phase,
      allocated_players: data.allocated_players,
      unresolved_slots:  data.unresolved_slots,
      allocated_at:      new Date().toISOString(),
    }));

    const { error: allocErr } = await supabase
      .from('draft_allocations')
      .upsert(allocationRows, { onConflict: 'league_id,user_id,phase' });
    if (allocErr) await logError(FN, 'critical', 'draft_allocations upsert failed', { leagueId, phase, error: allocErr.message });

    // Pass snake order into the gazette builder via a module-level variable.
    // Gazette is written later (after re-entry guard), so we capture it here.
    runLottery._lastSnakeOrder = snakeOrder;
  }
```

- [ ] **Step 2.2: Update the gazette call**

In the `if (!isReEntry)` block (around line 439 in the original), the gazette call is:

```js
const gazettEntry = buildGazetteEntry(leagueId, contestedPlayers, allocations, submissions);
```

Change it to:

```js
const snakeOrder = runLottery._lastSnakeOrder ?? [];
const gazettEntry = buildGazetteEntry(leagueId, snakeOrder, allocations, submissions);
```

Also delete the line `let contestedPlayers = [];` from the re-entry guard section (around line 134 in the original — it's the line just after `let allocations;`).

- [ ] **Step 2.3: Replace buildGazetteEntry**

Replace the entire `buildGazetteEntry` function with:

```js
function buildGazetteEntry(leagueId, snakeOrder, allocations, submissions) {
  const totalManagers  = submissions.length;
  const incompleteCount = Object.values(allocations).filter(d => d.unresolved_slots > 0).length;

  const headline = incompleteCount > 0
    ? `DRAFT SETTLED: ${totalManagers} squads allocated — ${incompleteCount} with open slots`
    : `DRAFT SETTLED: All ${totalManagers} squads fully allocated`;

  const bullets = [];
  if (incompleteCount > 0) {
    bullets.push({
      text: `${incompleteCount} manager${incompleteCount > 1 ? 's' : ''} enter with incomplete squads — first available picks now open`,
    });
  }

  const fullData = {
    snake_order: snakeOrder,   // round-1 pick order (reverses every round)
    allocations: Object.entries(allocations).map(([userId, data]) => ({
      user_id:     userId,
      players:     data.allocated_players,
      gaps:        data.unresolved_slots,
      budget_used: data.budget_used,
    })),
    total_managers: totalManagers,
  };

  return {
    league_id:    leagueId,
    entry_type:   'draft_report',
    headline,
    bullets,
    full_data:    fullData,
    published_at: new Date().toISOString(),
  };
}
```

- [ ] **Step 2.4: Verify the file builds cleanly**

```bash
cd "C:\Users\segismundo.braganca\OneDrive - Accenture\ClaudeCode2ndBrain\Side Projects\Forza Fantasy League"
npm run lint
npm run build
```

Expected: no errors. The Edge Function itself can only be tested via deploy (see Task 4).

- [ ] **Step 2.5: Commit**

```bash
git add supabase/functions/run-draft-lottery/index.js
git commit -m "feat: replace flat lottery with snake draft in run-draft-lottery"
```

---

## Task 3: Update DRAFT_SYSTEM_DESIGN.md — Algorithm section

**File:** `docs/architecture/DRAFT_SYSTEM_DESIGN.md`

- [ ] **Step 3.1: Replace Section 4 algorithm block**

Find the `### Algorithm` heading inside `## 4. Draft Allocation Engine` and replace the entire code block and surrounding text (the ```...``` fence that contains the Pass 0/1/2 pseudo-code) with:

```markdown
### Algorithm

```
Pass 0 (knockout phase only — see Section 8):
  Pre-allocate kept players before the snake draft.
  Kept players go into the `taken` set — snake skips them naturally.

Snake draft allocation:

  1. One random roll assigns the initial pick order
     (Fisher-Yates shuffle of all submitting managers).

  2. For each round (up to max wish-list length):
     a. Even round  → process managers in original order (1 → N)
        Odd round   → process managers in reversed order  (N → 1)
     b. Each manager's turn:
        Walk forward through their wish list from their current pointer.
        Skip each player that is: already taken, unknown, over position
        cap, over budget, or over club cap.
        Take the first valid player found; advance pointer past it.
        If the list is exhausted without a valid pick, skip this turn.

  3. Early exit when all squads have 15 players OR all wish lists
     are exhausted.

  4. Write results → draft_allocations (commit point)
  5. Write squads (upsert by league_id, user_id, matchday_id)
  6. Flag unresolved_slots for managers with < 15 players
  7. Write gazette_entry (headline + snake order + full allocation table)
  8. Push notification to all managers
```

**Why rank matters:** A player at rank 1 is tried in round 1. A player at rank 6 is not tried until the manager's 6th turn. If two managers listed the same player, the one who ranked it higher gets priority in an earlier round. The only remaining luck is the initial random order assignment — which the snake reversal partially compensates for across rounds.

**Tie-breaking:** If two managers have the same player at the same effective rank (both on their 3rd turn, say), whichever appears first in that round's snake order wins it.
```

- [ ] **Step 3.2: Update Section 3 ("No Constraints by Design") to remove the mention of Pass 2**

Find the sentence that mentions "Pass 2 — Runner-up offers" or "runner-up contestants" in Section 3 or elsewhere in the doc and remove or replace it. (Section 3 currently has no Pass 2 mention — only check Section 4 and Section 12.)

In Section 12 Decision Log, add a new row:

```markdown
| 11 | Snake draft replaces flat lottery | Flat lottery (rank ignored) | Rank in wish list now gives genuine priority — higher-ranked picks are tried in earlier rounds |
```

- [ ] **Step 3.3: Update Section 3 to reflect 45-pick list purpose**

Find the paragraph starting "**Why this is correct:**" in Section 3. After the existing paragraph add:

```markdown
**How ranking works in the snake draft:** The position of a player in your list determines which round they are "tried". Rank 1 is tried in round 1, rank 6 in round 6. A longer list with well-considered ordering gives significantly better outcomes than a short or randomly ordered one.
```

- [ ] **Step 3.4: Update Last Updated date**

Change `Last Updated: **2026-06-06**` to `Last Updated: **2026-06-09**` and extend the parenthetical note to include `snake draft allocation replaces flat lottery`.

- [ ] **Step 3.5: Commit**

```bash
git add docs/architecture/DRAFT_SYSTEM_DESIGN.md
git commit -m "docs: update DRAFT_SYSTEM_DESIGN for snake draft algorithm"
```

---

## Task 4: Rewrite DRAFT_MECHANICS_FOR_DUMMIES.md

**File:** `docs/architecture/DRAFT_MECHANICS_FOR_DUMMIES.md`

This doc needs a full rewrite of Sections "What happens when the commissioner runs the allocation", the worked example, and the "What the ranking does" section. The intro ("This is NOT a snake draft") must be flipped.

- [ ] **Step 4.1: Replace the intro paragraph**

Replace:

```markdown
## The Big Idea: This is NOT a snake draft

Most fantasy football drafts work like a queue: Manager A picks, then B, then C, then back to A. Order matters. Being first is an advantage.

**This draft is different.** It is a **sealed-bid lottery**:

1. Everyone submits their wish list privately, at the same time.
2. When the commissioner presses "Run Allocation", a lottery resolves everything in one go.
3. No one picks in real time. No one sees what others are submitting. There is no turn order.
```

With:

```markdown
## The Big Idea: Sealed wish lists + snake draft

There are two parts to this draft:

1. **Sealed submission** — everyone submits their ranked wish list privately, before the draft runs. No one sees what others listed. No real-time picking.
2. **Snake draft on those lists** — when the commissioner presses "Run Allocation", the system processes the wish lists round by round in a snake order. Your ranking directly determines when each player is "tried" for you.

This combines the convenience of a sealed bid (no one needs to be online at the same time) with the fairness of a snake draft (rank matters — your #1 pick is tried before your #6).
```

- [ ] **Step 4.2: Replace "Phase 1 — The Lottery" section**

Replace the entire `### Phase 1 — The Lottery (one roll per contested player)` section (including the example table and the "Key point" paragraph) with:

```markdown
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

**Alice's higher ranking gave her priority.** Under the old flat lottery, both had 50/50 odds. Under the snake draft, the manager who values a player more (ranks them higher) gets meaningful priority.

The only remaining luck is the initial random snake order — and the snake reversal partially compensates for that across rounds.
```

- [ ] **Step 4.3: Replace the worked example**

Replace the entire `## Worked example end to end` section with:

```markdown
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

Note how Alice's pointer has advanced past 4 players in round 2 — she skipped everything already taken. In round 3, her pointer starts at rank 6.

**Rounds continue until all squads reach 15 players.**
```

- [ ] **Step 4.4: Replace "What the ranking does" section**

Replace the entire `## What the ranking in your wish list actually does` section with:

```markdown
## What the ranking in your wish list actually does

The ranking has **two distinct effects:**

**1. It determines when a player is tried**
Your rank-1 pick is tried in round 1. Your rank-6 pick is not tried until your 6th turn. The earlier a player is tried, the less likely it is that someone else has already taken them.

**2. It determines priority when your own wins compete for the same position slot**
If you end up with 6 midfielders but can only hold 5, the ones you ranked higher get the slots. The 6th is simply not allocated to you — it stays available for others.

### The rank 1 vs rank 6 example

Alice lists Salah at rank 1. Charlie lists Salah at rank 6.

- Round 1: Alice tries Salah. If Salah is available (no one earlier in this round took him), Alice gets him.
- Charlie won't try Salah until her 6th turn — by which point Alice almost certainly already has him.

**Alice's rank-1 placement gave her a real advantage.** This is the key change from the old flat lottery, where both had equal 50/50 odds regardless of rank.

### What the snake order means for ties

If Alice AND Charlie both list Salah at rank 1, whoever appears first in round 1's snake order wins Salah. The other manager's pointer advances past Salah to their rank-2 pick immediately. This is the only remaining luck — a tie-break for genuinely equal priority.
```

- [ ] **Step 4.5: Update the Fairness table**

Replace the existing `## Why is this fair?` table with:

```markdown
## Why is this fair?

| Concern | Answer |
|---------|--------|
| Does being first to submit help? | No — all submissions are sealed. No one sees others' lists before the draft runs. |
| Does the initial snake order matter? | It determines tie-breaks when two managers list the same player at the same rank. The snake reversal compensates across rounds. |
| Are popular players always won by the luckiest person? | No. The manager who ranked the player higher has priority — they try for him in an earlier round. |
| What if I have a short list? | You get fewer turns. With a 10-player list you can get at most 10 players, guaranteeing 5 empty slots. List at least 15 good options. |
| What if my budget runs out before 15 players? | Remaining slots are empty; you fill them via Squad Recovery from the open pool. |
```

- [ ] **Step 4.6: Update the Glossary**

Remove the entries for `awardedTo` and `Dropped player` / `Runner-up` (those concepts no longer exist). Replace with:

```markdown
| **Snake order** | The pick sequence for round 1, assigned by a single random shuffle. Reverses every round. |
| **Pointer** | Each manager's current position in their wish list. Advances forward, never resets. A player tried and skipped (taken/invalid) still advances the pointer. |
| **Turn** | One manager's opportunity in a round — walk forward from pointer, skip taken/invalid, take first valid pick. |
```

- [ ] **Step 4.7: Update Last Updated**

Change `Last Updated: **2026-06-08**` to `Last Updated: **2026-06-09**`.

- [ ] **Step 4.8: Commit**

```bash
git add docs/architecture/DRAFT_MECHANICS_FOR_DUMMIES.md
git commit -m "docs: rewrite DRAFT_MECHANICS_FOR_DUMMIES for snake draft"
```

---

## Task 5: Deploy Edge Function + smoke test

- [ ] **Step 5.1: Deploy the function**

```bash
npx supabase functions deploy run-draft-lottery --project-ref sssmvihxtqtohisghjet
```

Expected output: `Deployed run-draft-lottery`

- [ ] **Step 5.2: Verify the function is reachable**

```bash
npx supabase functions list --project-ref sssmvihxtqtohisghjet
```

Expected: `run-draft-lottery` appears in the list with a recent updated timestamp.

- [ ] **Step 5.3: Manual smoke test — check commissioner call is rejected without auth**

```bash
curl -X POST https://sssmvihxtqtohisghjet.supabase.co/functions/v1/run-draft-lottery \
  -H "Content-Type: application/json" \
  -d '{"league_id":"00000000-0000-0000-0000-000000000000"}'
```

Expected: `{"error":"Unauthorized"}` with status 401.

- [ ] **Step 5.4: Verify cron-mode is still disabled**

```bash
curl -X POST https://sssmvihxtqtohisghjet.supabase.co/functions/v1/run-draft-lottery \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected: `{"error":"Automated draft allocation is disabled..."}` with status 405.

- [ ] **Step 5.5: Commit deploy marker**

```bash
git add supabase/.temp/cli-latest
git commit -m "chore: deploy run-draft-lottery snake draft to production"
```

---

## Task 6: Lint, build, E2E, PR, merge

- [ ] **Step 6.1: Lint and build**

```bash
npm run lint && npm run build
```

Expected: no errors.

- [ ] **Step 6.2: Run CI spec**

```bash
npx playwright test
```

Expected: 36 tests pass across 2 browsers (platform.spec.js — unaffected by this change).

- [ ] **Step 6.3: Create PR**

Retrieve the token and create the PR:

```python
python3 -c "
import urllib.request, json, subprocess
token = subprocess.check_output(['git', 'remote', 'get-url', 'origin']).decode().strip().split('https://')[1].split('@')[0]
repo  = 'SMTCB/WCFantasyFootball'
branch = 'claude/snake-draft-allocation'

data = json.dumps({
  'title': 'feat: snake draft allocation — rank-based pick priority (#XXX)',
  'head': branch,
  'base': 'main',
  'body': '''## Summary
- Replace flat random lottery with snake draft in `run-draft-lottery` Edge Function
- Rank position now determines pick priority: rank 1 tried in round 1, rank 6 in round 6
- Initial pick order assigned by one random shuffle; direction reverses each round
- Pass 0 (knockout keeps) unchanged; all post-allocation logic unchanged

## Test plan
- [ ] Deploy smoke test: 401 on missing auth, 405 on empty body
- [ ] Manual commissioner test via Admin panel on a test league
- [ ] platform.spec.js green (unaffected)

🤖 Generated with Claude Code'''
}).encode()

req = urllib.request.Request(
  f'https://api.github.com/repos/{repo}/pulls', data=data,
  headers={'Authorization': f'Bearer {token}', 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json'})
with urllib.request.urlopen(req) as r:
  pr = json.loads(r.read())
  print('PR #', pr['number'], pr['html_url'])
"
```

- [ ] **Step 6.4: Merge and clean up**

```python
python3 -c "
import urllib.request, json, subprocess
token = subprocess.check_output(['git', 'remote', 'get-url', 'origin']).decode().strip().split('https://')[1].split('@')[0]
repo   = 'SMTCB/WCFantasyFootball'
n      = <PR_NUMBER>   # from step 6.3
branch = 'claude/snake-draft-allocation'

data = json.dumps({'merge_method': 'squash', 'commit_title': f'feat: snake draft allocation — rank-based pick priority (#{n})'}).encode()
req = urllib.request.Request(f'https://api.github.com/repos/{repo}/pulls/{n}/merge', data=data, method='PUT',
  headers={'Authorization': f'Bearer {token}', 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json'})
with urllib.request.urlopen(req) as r: print('Merged:', json.loads(r.read()).get('merged'))

req = urllib.request.Request(f'https://api.github.com/repos/{repo}/git/refs/heads/{branch}',
  method='DELETE', headers={'Authorization': f'Bearer {token}', 'Accept': 'application/vnd.github+json'})
urllib.request.urlopen(req); print('Branch deleted')
"
```

```bash
git checkout main
git pull origin main
git branch -D claude/snake-draft-allocation
```

---

## Self-Review

**Spec coverage:**
- ✅ Random initial snake order
- ✅ Direction reverses each round
- ✅ On your turn: advance pointer, skip taken/invalid, take first valid
- ✅ If list exhausted on a turn: skip (no pick this round)
- ✅ Pass 0 (knockout keeps) unchanged
- ✅ Auth, idempotency, re-entry guard unchanged
- ✅ Squads write, gazette, notifications unchanged (except gazette signature)
- ✅ DRAFT_SYSTEM_DESIGN.md updated
- ✅ DRAFT_MECHANICS_FOR_DUMMIES.md updated
- ✅ `contestedPlayers` variable removed (no longer exists)
- ✅ `keptPlayerIds` Set removed (replaced by `taken`)
- ✅ `wantedBy`, `awardedTo`, `droppedByWinner` removed
- ✅ `_lastSnakeOrder` module-level variable used to pass snake order to gazette builder (only set in non-reentry path, which is the only path that calls buildGazetteEntry)

**Placeholder scan:** None found.

**Type consistency:** `buildGazetteEntry(leagueId, snakeOrder, allocations, submissions)` — signature matches call site in Task 2.2.
