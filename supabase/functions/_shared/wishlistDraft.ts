// Wishlist Draft orchestration — between-matchday allocation for draft-mode
// leagues (migrations 252-255, 294).
//
// Since migration 294 the draft no longer runs the instant the previous round
// ends. A wishlist_draft_windows row is created per round with a mode
// (manual / auto / disabled), and run-wishlist-draft — the scheduler — claims
// the row (status scheduled → running, with a run_token) when it is due, then
// calls runClaimedWishlistDraft() below.
//
// The allocation is computed here from a snapshot and committed atomically by
// the commit_wishlist_draft RPC, which re-checks that snapshot under row
// locks. If anything moved in between (a free-market buy, a trade), the RPC
// answers STALE and we recompute from fresh state — so a wishlisted player
// who was bought in the meantime is simply "taken, on to the next one".

import { normalisePosition, runSnakeDraft, type DraftSkipLogEntry } from './snakeDraft.ts';
import { logError } from './log.ts';

const FN = 'wishlistDraft';
const DEFAULT_SQUAD_SIZE = 15;
const DEFAULT_SQUAD_POS_CAPS: Record<string, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
// Matches set_lineup()'s live starting-XI rule (migration 214): exactly 1 GK,
// at least 1 of each outfield position. This is the floor a manager's squad
// must clear to be able to field a legal XI at all — protected below so a
// wishlist round can never trade a manager out of a fieldable squad.
const DEFAULT_MIN_FORMATION: Record<string, number> = { GK: 1, DEF: 1, MID: 1, FWD: 1 };
const MAX_COMMIT_ATTEMPTS = 3;

export interface ClaimedWishlistWindow {
  id: string;
  league_id: string;
  round_number: number;
  snake_order_seed: number;
  run_token: string;
  run_trigger: string | null;   // 'manual' | 'auto' | 'deadline'
}

export interface WishlistDraftResult {
  leagueId: string;
  roundNumber: number;
  ok: boolean;
  reason?: string;
  participantCount?: number;
  contestedPlayers?: number;
  attempts?: number;
}

type SkipEntry = Omit<DraftSkipLogEntry, 'reason'> & {
  reason: DraftSkipLogEntry['reason'] | 'not_reached';
  detail?: string;
  owner_user_id?: string;
  picked_by?: string;
};

interface AllocationPlan {
  // deno-lint-ignore no-explicit-any
  allocations: any[];
  // deno-lint-ignore no-explicit-any
  userState: Record<string, any>;
  order: string[];
  // deno-lint-ignore no-explicit-any
  pickLog: any[];
  skipLog: SkipEntry[];
  // deno-lint-ignore no-explicit-any
  safetyNetActions: any[];
  contestedPlayers: number;
}

// Claims a due window. Exactly one caller can flip scheduled → running —
// Postgres row locking serialises concurrent UPDATEs and the loser's WHERE no
// longer matches. Returns null if someone else got there first.
export async function claimWishlistDraft(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  windowId: string,
  trigger: string,
): Promise<ClaimedWishlistWindow | null> {
  const { data } = await supabase
    .from('wishlist_draft_windows')
    .update({
      status:      'running',
      started_at:  new Date().toISOString(),
      run_token:   crypto.randomUUID(),
      run_trigger: trigger,
    })
    .eq('id', windowId)
    .eq('status', 'scheduled')
    .is('processed_at', null)
    .select('id, league_id, round_number, snake_order_seed, run_token, run_trigger')
    .maybeSingle();
  return data ?? null;
}

// Hands a claimed window back to the scheduler (its next tick retries).
// deno-lint-ignore no-explicit-any
async function releaseClaim(supabase: any, win: ClaimedWishlistWindow) {
  await supabase
    .from('wishlist_draft_windows')
    .update({ status: 'scheduled', run_token: null, started_at: null })
    .eq('id', win.id)
    .eq('run_token', win.run_token);
}

export async function runClaimedWishlistDraft(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  win: ClaimedWishlistWindow,
): Promise<WishlistDraftResult> {
  const leagueId = win.league_id;
  const roundNumber = win.round_number;
  const base = { leagueId, roundNumber };

  try {
    const { data: leagueRow } = await supabase
      .from('leagues')
      .select('squad_size, position_limits, min_formation, tournament_id, budget_total, format, league_mode')
      .eq('id', leagueId)
      .maybeSingle();
    if (!leagueRow) {
      await releaseClaim(supabase, win);
      return { ...base, ok: false, reason: 'league not found' };
    }

    for (let attempt = 1; attempt <= MAX_COMMIT_ATTEMPTS; attempt++) {
      // Submissions can't change while the row is 'running'
      // (submit_wishlist_draft refuses), but re-reading keeps every attempt a
      // pure function of current DB state.
      const { data: submissions } = await supabase
        .from('wishlist_draft_submissions')
        .select('user_id, target_ids, drop_ids, carried_over_from')
        .eq('league_id', leagueId)
        .eq('round_number', roundNumber)
        .eq('status', 'pending');
      // deno-lint-ignore no-explicit-any
      const subs = (submissions ?? []).filter((s: any) => (s.target_ids?.length ?? 0) > 0 || (s.drop_ids?.length ?? 0) > 0);

      const plan = subs.length
        ? await computeAllocation(supabase, leagueId, roundNumber, leagueRow, subs, win.snake_order_seed)
        : null;

      const { data: commit, error } = await supabase.rpc('commit_wishlist_draft', {
        p_league_id:         leagueId,
        p_round:             roundNumber,
        p_run_token:         win.run_token,
        p_allocations:       plan?.allocations ?? [],
        p_participant_count: plan?.allocations.length ?? 0,
      });
      if (error) throw new Error(`commit_wishlist_draft: ${error.message}`);

      if (commit?.ok) {
        if (plan) await writeGazetteEntry(supabase, leagueId, roundNumber, win.run_trigger, subs, plan, attempt);
        await notifyDraftDone(supabase, leagueId, roundNumber, plan?.allocations.length ?? 0);
        return {
          ...base, ok: true, attempts: attempt,
          participantCount: plan?.allocations.length ?? 0,
          contestedPlayers: plan?.contestedPlayers ?? 0,
        };
      }

      if (commit?.code === 'NOT_RUNNING') {
        // Our claim was reset (stale-run recovery) or another runner finished.
        return { ...base, ok: false, reason: 'claim lost' };
      }
      if (commit?.code !== 'STALE') throw new Error(`commit_wishlist_draft refused: ${JSON.stringify(commit)}`);
      // STALE → something moved between snapshot and commit; recompute.
    }

    await logError(FN, 'warning', 'wishlist draft kept going stale — released for next tick', { leagueId, roundNumber });
    await releaseClaim(supabase, win);
    return { ...base, ok: false, reason: 'stale after retries' };
  } catch (err) {
    await logError(FN, 'critical', 'wishlist draft allocation failed', {
      leagueId, roundNumber, error: err instanceof Error ? err.message : String(err),
    });
    // Safe to retry: nothing is written unless commit_wishlist_draft
    // succeeds, and that RPC is all-or-nothing.
    await releaseClaim(supabase, win);
    return { ...base, ok: false, reason: 'allocation error' };
  }
}

// deno-lint-ignore no-explicit-any
async function notifyDraftDone(supabase: any, leagueId: string, roundNumber: number, participants: number) {
  const { data: members } = await supabase
    .from('league_members')
    .select('user_id')
    .eq('league_id', leagueId);
  if (!members?.length) return;
  const { error } = await supabase.from('league_notifications').insert(
    members.map((m: { user_id: string }) => ({
      league_id:           leagueId,
      user_id:             m.user_id,
      notification_type:   'wishlist_draft_done',
      title:               `Round ${roundNumber} wishlist draft done — market open`,
      description:         participants
        ? `${participants} manager${participants === 1 ? '' : 's'} took part. See the Gazette for who got whom.`
        : 'No wishlists this round. The transfer market is now open.',
      related_entity_type: 'wishlist_draft',
    })),
  );
  if (error) await logError(FN, 'warning', 'wishlist draft notification insert failed', { leagueId, roundNumber, error: error.message });
}

// Planning step: reads current state, runs the snake draft in memory and
// returns the squads to write plus the audit trail. Writes nothing.
// deno-lint-ignore no-explicit-any
async function computeAllocation(supabase: any, leagueId: string, roundNumber: number, leagueRow: any, submissions: any[], seed: number): Promise<AllocationPlan> {
  const SQUAD_SIZE     = Number(leagueRow.squad_size ?? DEFAULT_SQUAD_SIZE);
  const SQUAD_POS_CAPS = leagueRow.position_limits   ?? DEFAULT_SQUAD_POS_CAPS;
  const MIN_FORMATION  = leagueRow.min_formation     ?? DEFAULT_MIN_FORMATION;
  const budget         = Number(leagueRow.budget_total ?? 100);

  const { data: clubCapData } = await supabase.rpc('get_club_cap', { p_league_id: leagueId });
  const CLUB_CAP = (clubCapData !== null && clubCapData !== undefined) ? clubCapData : 3;

  // Every current squad in the league — exclusivity is global, not limited
  // to opted-in managers.
  const { data: squadRows } = await supabase
    .from('squads')
    .select('id, user_id, players, budget_remaining')
    .eq('league_id', leagueId)
    .order('created_at', { ascending: false });

  // deno-lint-ignore no-explicit-any
  const latestSquadByUser: Record<string, any> = {};
  for (const row of squadRows ?? []) {
    if (!latestSquadByUser[row.user_id]) latestSquadByUser[row.user_id] = row;
  }

  const taken = new Set<string>();
  const ownerOf: Record<string, string> = {};
  for (const row of Object.values(latestSquadByUser)) {
    for (const pid of row.players ?? []) { taken.add(pid); ownerOf[pid] = row.user_id; }
  }

  // A manager with no squad row has nothing to allocate into.
  const participants = submissions.filter((s) => latestSquadByUser[s.user_id]);

  const allTargetIds      = [...new Set(participants.flatMap((s) => s.target_ids ?? []))];
  const allSquadPlayerIds = [...new Set(Object.values(latestSquadByUser).flatMap((r) => r.players ?? []))];
  const allPlayerIds      = [...new Set([...allTargetIds, ...allSquadPlayerIds])];

  let playerQuery = supabase
    .from('players')
    .select('id, position, price, forza_team_id')
    .in('id', allPlayerIds.length ? allPlayerIds : ['00000000-0000-0000-0000-000000000000']);
  if (leagueRow.tournament_id) playerQuery = playerQuery.eq('tournament_id', leagueRow.tournament_id);
  const { data: playerRows } = await playerQuery;
  // deno-lint-ignore no-explicit-any
  const playerMap = Object.fromEntries((playerRows ?? []).map((p: any) => [p.id, p]));

  // Phase 0 (drops) + working-state build. Unlike the season draft (which
  // starts every manager from an empty squad), a wishlist-draft participant
  // already has a full squad — their working state starts from what they
  // currently own, minus anything they're releasing this round. A release of
  // a player no longer in the squad (traded away since submitting) is ignored.
  const userState: Record<string, { allocated: string[]; posCounts: Record<string, number>; clubCounts: Record<string, number>; budgetUsed: number; preCount: number; before: string[] }> = {};

  for (const sub of participants) {
    const squad = latestSquadByUser[sub.user_id];
    const currentIds: string[] = squad?.players ?? [];
    const dropSet = new Set((sub.drop_ids ?? []).filter((pid: string) => currentIds.includes(pid)));

    const posCounts: Record<string, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    const clubCounts: Record<string, number> = {};
    let budgetUsed = 0;
    const keptIds: string[] = [];

    for (const pid of currentIds) {
      if (dropSet.has(pid)) {
        // Free the dropped player globally so other participants (or this
        // manager, via a different target) can draft them this round.
        taken.delete(pid);
        continue;
      }
      keptIds.push(pid);
      const player = playerMap[pid];
      if (!player) continue;
      const pos = normalisePosition(player.position);
      posCounts[pos] = (posCounts[pos] ?? 0) + 1;
      const teamId = player.forza_team_id;
      if (teamId) clubCounts[teamId] = (clubCounts[teamId] ?? 0) + 1;
      budgetUsed += Number(player.price ?? 0);
    }

    userState[sub.user_id] = { allocated: keptIds, posCounts, clubCounts, budgetUsed, preCount: keptIds.length, before: currentIds };
  }

  // Phase 1 (targets): rotate the seeded base order by one seat per round —
  // see rotateOrder() — instead of a fresh random shuffle each window, so
  // every opted-in manager cycles through every pick position over time
  // rather than being fair only "in expectation" over many windows.
  const participantIds = participants.map((s) => s.user_id).sort();
  const order = rotateOrder(participantIds, seed, roundNumber);

  const submissionMap: Record<string, string[]> = {};
  for (const sub of participants) submissionMap[sub.user_id] = sub.target_ids ?? [];

  const rawSkips: DraftSkipLogEntry[] = [];
  const { contestedPlayers, pickLog } = runSnakeDraft({
    order,
    submissionMap,
    userState,
    playerMap,
    taken,
    squadSize: SQUAD_SIZE,
    posCaps:   SQUAD_POS_CAPS,
    budget,
    clubCap:   CLUB_CAP,
    minFloor:  MIN_FORMATION,
    skipLog:   rawSkips,
  });

  // Last-resort guarantee: the in-loop reservation guard above stops a
  // manager's own picks from *creating* a formation deficit, but it can't
  // conjure a replacement if that manager's ranked wishlist simply never
  // named an eligible player of the position they're short (e.g. they
  // dropped their only MID and every MID on their list got taken by someone
  // else first). Should be rare — logged whenever it fires so it's visible,
  // not silent.
  const safetyNetActions = await backfillFormationFloor(
    supabase, leagueId, roundNumber, leagueRow.tournament_id, userState, playerMap, taken,
    MIN_FORMATION, SQUAD_SIZE, budget, CLUB_CAP,
  );

  // "Taken" is two different stories for the report: snapped up earlier in
  // this same draft, or already owned before it started (e.g. bought in the
  // free market while the draft was switched off).
  const pickedBy: Record<string, string> = {};
  for (const p of pickLog) pickedBy[p.player_id] = p.user_id;
  const skipLog: SkipEntry[] = rawSkips.map((sk) => {
    if (sk.reason !== 'taken') return sk;
    if (pickedBy[sk.player_id]) return { ...sk, detail: 'picked_this_round', picked_by: pickedBy[sk.player_id] };
    return { ...sk, detail: 'owned', owner_user_id: ownerOf[sk.player_id] };
  });
  // Targets the loop never reached (squad filled up / rounds ran out).
  for (const uid of order) {
    const seen = new Set<number>([
      ...pickLog.filter((p) => p.user_id === uid).map((p) => p.wishlist_rank),
      ...rawSkips.filter((sk) => sk.user_id === uid).map((sk) => sk.wishlist_rank),
    ]);
    (submissionMap[uid] ?? []).forEach((pid, i) => {
      if (!seen.has(i + 1)) {
        skipLog.push({ round: 0, order_index: 0, user_id: uid, player_id: pid, wishlist_rank: i + 1, reason: 'not_reached' });
      }
    });
  }

  // Players + budget_remaining only, matching process-transfer's existing
  // minimal-touch convention for squad writes (starting_xi is untouched by
  // transfers today, so it stays untouched here too). expected_players is the
  // snapshot commit_wishlist_draft verifies before writing.
  const allocations = participants.map((sub) => {
    const u = userState[sub.user_id];
    return {
      squad_id:         latestSquadByUser[sub.user_id].id,
      user_id:          sub.user_id,
      expected_players: u.before,
      players:          u.allocated,
      budget_remaining: Math.round((budget - u.budgetUsed) * 100) / 100,
    };
  });

  return { allocations, userState, order, pickLog, skipLog, safetyNetActions, contestedPlayers };
}

// Post-allocation safety net: tops up any manager still below `minFloor` in
// any position after the snake draft, by pulling the cheapest eligible
// untaken player of that position from the *full* tournament pool (not just
// the players named on someone's wishlist), respecting the same budget and
// club-cap rules as the draft itself. If the squad is already at capacity,
// frees a slot first by releasing that manager's most expendable player —
// the priciest player from whichever position sits furthest above its own
// floor — so the swap can never trade one deficit for another.
//
// Mutates userState/taken/playerMap in place, matching runSnakeDraft's
// convention. Returns a log of every action taken, for gazette transparency
// (kept separate from pickLog since these aren't wishlist picks).
// deno-lint-ignore no-explicit-any
async function backfillFormationFloor(
  supabase: any,
  leagueId: string,
  roundNumber: number,
  tournamentId: string | null | undefined,
  // deno-lint-ignore no-explicit-any
  userState: Record<string, any>,
  // deno-lint-ignore no-explicit-any
  playerMap: Record<string, any>,
  taken: Set<string>,
  minFloor: Record<string, number>,
  squadSize: number,
  budget: number,
  clubCap: number,
): Promise<Array<{ user_id: string; position: string; player_id: string; direction: 'added' | 'released' }>> {
  const actions: Array<{ user_id: string; position: string; player_id: string; direction: 'added' | 'released' }> = [];

  const deficientUserIds = Object.keys(userState).filter((uid) =>
    Object.keys(minFloor).some((pos) => (userState[uid].posCounts[pos] ?? 0) < (minFloor[pos] ?? 0)),
  );
  if (deficientUserIds.length === 0) return actions;

  let poolQuery = supabase
    .from('players')
    .select('id, position, price, forza_team_id')
    .order('price', { ascending: true });
  if (tournamentId) poolQuery = poolQuery.eq('tournament_id', tournamentId);
  const { data: poolRows } = await poolQuery;
  // deno-lint-ignore no-explicit-any
  const pool: any[] = poolRows ?? [];

  for (const uid of deficientUserIds) {
    const u = userState[uid];
    for (const pos of Object.keys(minFloor)) {
      while ((u.posCounts[pos] ?? 0) < (minFloor[pos] ?? 0)) {
        const candidate = pool.find((p) => {
          if (taken.has(p.id)) return false;
          if (normalisePosition(p.position) !== pos) return false;
          if (u.budgetUsed + Number(p.price ?? 0) > budget) return false;
          const teamId = p.forza_team_id;
          if (teamId && clubCap < 99 && (u.clubCounts[teamId] ?? 0) >= clubCap) return false;
          return true;
        });
        if (!candidate) {
          await logError(FN, 'critical', 'wishlist formation safety net found no eligible replacement', { leagueId, roundNumber, userId: uid, position: pos });
          break;
        }

        if (u.allocated.length >= squadSize) {
          const donorPos = Object.keys(u.posCounts).find((p2) =>
            p2 !== pos &&
            (u.posCounts[p2] ?? 0) > (minFloor[p2] ?? 0) &&
            u.allocated.some((pid: string) => normalisePosition(playerMap[pid]?.position) === p2),
          );
          if (!donorPos) {
            await logError(FN, 'critical', 'wishlist formation safety net found no expendable slot to free', { leagueId, roundNumber, userId: uid, position: pos });
            break;
          }
          const donorCandidates = u.allocated
            .filter((pid: string) => normalisePosition(playerMap[pid]?.position) === donorPos)
            .sort((a: string, b: string) => Number(playerMap[b]?.price ?? 0) - Number(playerMap[a]?.price ?? 0));
          const donorId = donorCandidates[0];
          u.allocated = u.allocated.filter((pid: string) => pid !== donorId);
          u.posCounts[donorPos] = (u.posCounts[donorPos] ?? 0) - 1;
          const donorTeam = playerMap[donorId]?.forza_team_id;
          if (donorTeam) u.clubCounts[donorTeam] = (u.clubCounts[donorTeam] ?? 0) - 1;
          u.budgetUsed -= Number(playerMap[donorId]?.price ?? 0);
          taken.delete(donorId);
          actions.push({ user_id: uid, position: donorPos, player_id: donorId, direction: 'released' });
        }

        u.allocated.push(candidate.id);
        u.posCounts[pos] = (u.posCounts[pos] ?? 0) + 1;
        const teamId = candidate.forza_team_id;
        if (teamId) u.clubCounts[teamId] = (u.clubCounts[teamId] ?? 0) + 1;
        u.budgetUsed += Number(candidate.price ?? 0);
        taken.add(candidate.id);
        playerMap[candidate.id] = candidate;
        actions.push({ user_id: uid, position: pos, player_id: candidate.id, direction: 'added' });
      }
    }
  }

  return actions;
}

// Deterministically rotates a sorted base order by `seed + roundNumber`
// seats. `seed` is a per-league constant, picked once at random the first
// time a wishlist window is created for that league and carried forward
// unchanged forever after (see create_wishlist_draft_round) — it never
// advances on its own. `roundNumber` is what actually advances the rotation:
// since it increments by 1 each successive window, folding it into the shift
// guarantees every opted-in manager's pick-order position advances by one
// seat per round, rather than being identical whenever the same set of
// managers opts in on consecutive rounds.
function rotateOrder(ids: string[], seed: number, roundNumber: number): string[] {
  if (ids.length === 0) return ids;
  const shift = (((seed + roundNumber) % ids.length) + ids.length) % ids.length;
  return [...ids.slice(shift), ...ids.slice(0, shift)];
}

// deno-lint-ignore no-explicit-any
async function writeGazetteEntry(supabase: any, leagueId: string, roundNumber: number, trigger: string | null, submissions: any[], plan: AllocationPlan, attempts: number) {
  const { userState, order, pickLog, skipLog, safetyNetActions } = plan;
  const bullets = order.map((uid, idx) => {
    const sub = submissions.find((s) => s.user_id === uid);
    const u = userState[uid];
    return {
      user_id:   uid,
      pick_slot: idx + 1,
      requested: sub?.target_ids?.length ?? 0,
      released:  sub?.drop_ids?.length ?? 0,
      gained:    u.allocated.length - u.preCount,
    };
  });

  // JSON.stringify-before-insert, matching run-reverse-standings-draft's
  // convention (not run-draft-lottery's raw-object insert, which the
  // read-side's defensive JSON.parse silently fails against). No created_at:
  // gazette_entries only has published_at (defaults to now()).
  const { error } = await supabase.from('gazette_entries').insert({
    league_id:  leagueId,
    entry_type: 'wishlist_draft_report',
    headline:   `Wishlist Draft resolved for round ${roundNumber}`,
    bullets:    JSON.stringify(bullets),
    full_data:  JSON.stringify({
      round_number: roundNumber,
      // 'manual' (commissioner pressed Run), 'auto' (scheduled time) or
      // 'deadline' (kickoff − 8h fallback).
      trigger,
      attempts,
      order,
      submissions: submissions.map((s) => ({
        user_id: s.user_id, target_ids: s.target_ids, drop_ids: s.drop_ids, carried_over_from: s.carried_over_from ?? null,
      })),
      // Per-pick audit trail (round/order_index/user_id/player_id/wishlist_rank),
      // same shape as run-draft-lottery's — lets a manager verify the pick
      // order actually rotated and no one manager always picked first.
      pick_log: pickLog ?? [],
      // Every wishlist entry that was NOT picked, and why. reason is
      // taken|unknown_player|position_full|budget|club_cap|formation_reserve|not_reached;
      // 'taken' entries carry detail owned (with owner_user_id) or
      // picked_this_round (with picked_by).
      skip_log: skipLog ?? [],
      // Formation safety-net actions (rare): only present if a manager's own
      // wishlist left them short of the minimum formation floor even after
      // the in-loop reservation guard, and a last-resort swap was made from
      // the full player pool to fix it.
      formation_safety_net: safetyNetActions ?? [],
    }),
  });
  if (error) {
    await logError(FN, 'critical', 'wishlist draft gazette insert failed', { leagueId, roundNumber, error: error.message });
  }
}
