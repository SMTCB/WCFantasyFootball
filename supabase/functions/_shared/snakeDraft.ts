// Shared snake-draft allocation core.
//
// Extracted from run-draft-lottery (behavior-preserving) so run-draft-lottery,
// run-wishlist-draft, and any future caller share one allocation loop instead
// of drifting copies (run-reverse-standings-draft already has a second,
// simpler copy — pre-existing drift, out of scope to fix here).
//
// Pure function: no Supabase/network calls. Callers own loading state in and
// writing results out.

export interface DraftPlayer {
  id: string;
  position: string;      // raw position string, normalised internally
  price: number;
  forza_team_id?: string | null;
}

export interface UserDraftState {
  allocated: string[];
  posCounts: Record<string, number>;
  clubCounts: Record<string, number>;
  budgetUsed: number;
}

export interface SnakeDraftOptions {
  order: string[];                          // user_ids, in pick order for round 0
  submissionMap: Record<string, string[]>;  // user_id -> ranked target player_ids
  userState: Record<string, UserDraftState>;
  playerMap: Record<string, DraftPlayer>;
  taken: Set<string>;                       // player_ids already unavailable (mutated in place)
  squadSize: number;
  posCaps: Record<string, number>;
  budget: number;
  clubCap: number;                          // >= 99 means uncapped
  minFloor?: Record<string, number>;        // optional — reserve slots so no position
                                             // finishes below this count (wishlist draft
                                             // only; other callers omit it, no behavior change)
}

export interface DraftPickLogEntry {
  round: number;          // 1-indexed
  order_index: number;    // 1-indexed turn position within the round
  user_id: string;
  player_id: string;
  wishlist_rank: number;  // 1-indexed position in that manager's submitted list
}

export interface SnakeDraftResult {
  contestedPlayers: number;
  pickLog: DraftPickLogEntry[];
}

export function normalisePosition(pos: string | null | undefined): string {
  if (!pos) return 'MID';
  const p = pos.toUpperCase().trim();
  if (p === 'FW' || p === 'FWD') return 'FWD';
  if (p === 'GK')  return 'GK';
  if (p === 'DEF') return 'DEF';
  return 'MID';
}

// Fisher-Yates shuffle using crypto randomness, matching run-draft-lottery's
// existing approach exactly (behavior-preserving extraction).
export function shuffleOrder(ids: string[]): string[] {
  const order = [...ids];
  for (let i = order.length - 1; i > 0; i--) {
    const roll = crypto.getRandomValues(new Uint32Array(1))[0] / 0xFFFFFFFF;
    const j = Math.floor(roll * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

// Runs the snake-draft loop in place: mutates `userState` (allocated/posCounts/
// clubCounts/budgetUsed) and `taken`. Returns how many pick attempts hit an
// already-taken player (informational, used for gazette copy).
export function runSnakeDraft(opts: SnakeDraftOptions): SnakeDraftResult {
  const { order, submissionMap, userState, playerMap, taken, squadSize, posCaps, budget, clubCap, minFloor } = opts;

  const pointers: Record<string, number> = {};
  for (const uid of order) pointers[uid] = 0;

  const maxRounds = Math.max(0, ...order.map(uid => (submissionMap[uid] || []).length));
  let contestedPlayers = 0;
  const pickLog: DraftPickLogEntry[] = [];

  for (let round = 0; round < maxRounds; round++) {
    const roundOrder = round % 2 === 0 ? [...order] : [...order].reverse();
    roundOrder.forEach((uid, orderIdx) => {
      const u = userState[uid];
      if (!u || u.allocated.length >= squadSize) return;
      const list = submissionMap[uid] || [];
      while (pointers[uid] < list.length) {
        const pid = list[pointers[uid]];
        const wishlistRank = pointers[uid] + 1;
        pointers[uid]++;
        if (taken.has(pid)) { contestedPlayers++; continue; }
        const player = playerMap[pid];
        if (!player) continue;
        const pos = normalisePosition(player.position);
        const teamId = player.forza_team_id;
        const clubCnt = teamId ? (u.clubCounts[teamId] ?? 0) : 0;
        if ((u.posCounts[pos] ?? 0) >= (posCaps[pos] ?? 0)) continue;
        if (u.budgetUsed + player.price > budget) continue;
        if (teamId && clubCap < 99 && clubCnt >= clubCap) continue;
        // Reserve remaining slots for positions still below the required
        // floor (e.g. don't let a manager's last free slot go to a 3rd FWD
        // while they're still short their only MID) — skip this pick if it
        // doesn't fill a deficit and there isn't slack beyond what the
        // deficit needs. Only engaged when a caller opts in via minFloor.
        if (minFloor) {
          const deficit = Object.keys(minFloor).reduce(
            (sum, p) => sum + Math.max(0, (minFloor[p] ?? 0) - (u.posCounts[p] ?? 0)), 0,
          );
          const fillsDeficit = (u.posCounts[pos] ?? 0) < (minFloor[pos] ?? 0);
          const remainingSlots = squadSize - u.allocated.length;
          if (deficit > 0 && remainingSlots <= deficit && !fillsDeficit) continue;
        }
        u.allocated.push(pid);
        u.posCounts[pos] = (u.posCounts[pos] ?? 0) + 1;
        if (teamId) u.clubCounts[teamId] = clubCnt + 1;
        u.budgetUsed += player.price;
        taken.add(pid);
        pickLog.push({ round: round + 1, order_index: orderIdx + 1, user_id: uid, player_id: pid, wishlist_rank: wishlistRank });
        break;
      }
    });
    if (Object.values(userState).every(u => u.allocated.length >= squadSize)) break;
    if (order.every(uid => pointers[uid] >= (submissionMap[uid]?.length ?? 0))) break;
  }

  return { contestedPlayers, pickLog };
}
