// Wishlist Draft orchestration — recurring, opt-in transfer-window allocation
// for draft-mode leagues. See supabase/migrations/252-255 and the approved
// plan for the full design. Called from two places (single source of truth):
//   - auto-open-transfer-window/index.js, inline, right before it opens the
//     market for everyone else (primary path — rides that function's cron)
//   - run-wishlist-draft/index.js (direct-call override + cron safety net)
//
// Per league+round, no-ops fast unless: the league is draft-mode AND at
// least one manager has a pending submission for that round.

import { normalisePosition, runSnakeDraft } from './snakeDraft.ts';
import { logError } from './log.ts';

const FN = 'wishlistDraft';
const DEFAULT_SQUAD_SIZE = 15;
const DEFAULT_SQUAD_POS_CAPS: Record<string, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 };

export interface WishlistDraftResult {
  leagueId: string;
  roundNumber: number;
  skipped: boolean;
  reason?: string;
  participantCount?: number;
  contestedPlayers?: number;
}

export async function processLeagueWishlistDraft(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  leagueId: string,
  roundNumber: number,
): Promise<WishlistDraftResult> {
  const base = { leagueId, roundNumber };

  const { data: leagueRow } = await supabase
    .from('leagues')
    .select('squad_size, position_limits, tournament_id, budget_total, format, league_mode')
    .eq('id', leagueId)
    .maybeSingle();

  if (!leagueRow) return { ...base, skipped: true, reason: 'league not found' };

  // Same combined check the allocator code trusts elsewhere in the repo —
  // classic (non-exclusive) leagues have no scarcity problem for this to fix.
  if (leagueRow.format !== 'noduplicate' && leagueRow.league_mode !== 'draft') {
    return { ...base, skipped: true, reason: 'not a draft-mode league' };
  }

  const { data: submissions } = await supabase
    .from('wishlist_draft_submissions')
    .select('user_id, target_ids, drop_ids')
    .eq('league_id', leagueId)
    .eq('round_number', roundNumber)
    .eq('status', 'pending');

  if (!submissions?.length) return { ...base, skipped: true, reason: 'no participants' };

  // Rotating snake-order seed: carry forward the most recent prior window's
  // seed unchanged (or start a fresh random one, first time this league ever
  // runs a wishlist window). The seed itself never advances — round_number
  // is folded into the shift calculation in rotateOrder() below, which is
  // what actually advances the rotation by one seat per round.
  const { data: priorWindow } = await supabase
    .from('wishlist_draft_windows')
    .select('snake_order_seed')
    .eq('league_id', leagueId)
    .order('round_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const seed = priorWindow?.snake_order_seed ?? Math.floor(Math.random() * 1_000_000);

  // Ensure a window row exists for this round. ignoreDuplicates keeps a
  // concurrent caller's insert from erroring — whichever caller's insert
  // lands first "wins" the seed for this round, which is fine since both
  // callers computed it from the same prior-window read moments apart.
  await supabase
    .from('wishlist_draft_windows')
    .upsert(
      { league_id: leagueId, round_number: roundNumber, snake_order_seed: seed, participant_count: submissions.length },
      { onConflict: 'league_id,round_number', ignoreDuplicates: true },
    );

  // Atomically claim the round. Only one caller's UPDATE can match
  // `processed_at IS NULL` — Postgres row-level locking serialises concurrent
  // attempts (the loser's UPDATE blocks, then re-evaluates its WHERE against
  // the now-committed row, which no longer matches). This stands in for the
  // plan's pg_advisory_xact_lock: Edge Functions call through PostgREST
  // per-statement rather than holding one DB session an xact lock could
  // span, so a claim-row update is the reliable equivalent here.
  const { data: claimedWindow } = await supabase
    .from('wishlist_draft_windows')
    .update({ processed_at: new Date().toISOString(), participant_count: submissions.length })
    .eq('league_id', leagueId)
    .eq('round_number', roundNumber)
    .is('processed_at', null)
    .select('snake_order_seed')
    .maybeSingle();

  if (!claimedWindow) return { ...base, skipped: true, reason: 'already claimed/processed' };

  try {
    const { contestedPlayers } = await runAllocation(
      supabase, leagueId, roundNumber, leagueRow, submissions, claimedWindow.snake_order_seed,
    );
    return { ...base, skipped: false, participantCount: submissions.length, contestedPlayers };
  } catch (err) {
    await logError(FN, 'critical', 'wishlist draft allocation failed', {
      leagueId, roundNumber, error: err instanceof Error ? err.message : String(err),
    });
    // Round stays marked processed (claimed above) even on failure — a
    // partial allocation should not be silently retried by the safety-net
    // cron, since retrying could double-apply squad writes. Failure is
    // surfaced via edge_function_errors/Sentry for manual follow-up.
    return { ...base, skipped: true, reason: 'allocation error' };
  }
}

// deno-lint-ignore no-explicit-any
async function runAllocation(supabase: any, leagueId: string, roundNumber: number, leagueRow: any, submissions: any[], seed: number) {
  const SQUAD_SIZE     = Number(leagueRow.squad_size ?? DEFAULT_SQUAD_SIZE);
  const SQUAD_POS_CAPS = leagueRow.position_limits   ?? DEFAULT_SQUAD_POS_CAPS;
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
  for (const row of Object.values(latestSquadByUser)) {
    for (const pid of row.players ?? []) taken.add(pid);
  }

  const allTargetIds      = [...new Set(submissions.flatMap((s) => s.target_ids ?? []))];
  const allSquadPlayerIds = [...new Set(Object.values(latestSquadByUser).flatMap((r) => r.players ?? []))];
  const allPlayerIds      = [...new Set([...allTargetIds, ...allSquadPlayerIds])];

  let playerQuery = supabase
    .from('players')
    .select('id, position, price, forza_team_id')
    .in('id', allPlayerIds.length ? allPlayerIds : ['00000000-0000-0000-0000-000000000000']);
  if (leagueRow.tournament_id) playerQuery = playerQuery.eq('tournament_id', leagueRow.tournament_id);
  const { data: playerRows } = await playerQuery;
  const playerMap = Object.fromEntries((playerRows ?? []).map((p: any) => [p.id, p]));

  // Phase 0 (drops) + working-state build. Unlike the season draft (which
  // starts every manager from an empty squad), a wishlist-draft participant
  // already has a full squad — their working state starts from what they
  // currently own, minus anything they're releasing this round.
  const userState: Record<string, { allocated: string[]; posCounts: Record<string, number>; clubCounts: Record<string, number>; budgetUsed: number; preCount: number }> = {};

  for (const sub of submissions) {
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

    userState[sub.user_id] = { allocated: keptIds, posCounts, clubCounts, budgetUsed, preCount: keptIds.length };
  }

  // Phase 1 (targets): rotate the seeded base order by one seat per round —
  // see rotateOrder() — instead of a fresh random shuffle each window, so
  // every opted-in manager cycles through every pick position over time
  // rather than being fair only "in expectation" over many windows.
  const participantIds = submissions.map((s) => s.user_id).sort();
  const order = rotateOrder(participantIds, seed, roundNumber);

  const submissionMap: Record<string, string[]> = {};
  for (const sub of submissions) submissionMap[sub.user_id] = sub.target_ids ?? [];

  const { contestedPlayers } = runSnakeDraft({
    order,
    submissionMap,
    userState,
    playerMap,
    taken,
    squadSize: SQUAD_SIZE,
    posCaps:   SQUAD_POS_CAPS,
    budget,
    clubCap:   CLUB_CAP,
  });

  // Commit: players + budget_remaining only, matching process-transfer's
  // existing minimal-touch convention for squad writes (starting_xi is
  // untouched by transfers today, so it stays untouched here too).
  for (const sub of submissions) {
    const squad = latestSquadByUser[sub.user_id];
    if (!squad) continue;
    const u = userState[sub.user_id];
    await supabase
      .from('squads')
      .update({
        players:           u.allocated,
        budget_remaining:  Math.round((budget - u.budgetUsed) * 100) / 100,
      })
      .eq('id', squad.id);
  }

  await supabase
    .from('wishlist_draft_submissions')
    .update({ status: 'processed' })
    .eq('league_id', leagueId)
    .eq('round_number', roundNumber)
    .eq('status', 'pending');

  await writeGazetteEntry(supabase, leagueId, roundNumber, submissions, userState, order);

  return { contestedPlayers };
}

// Deterministically rotates a sorted base order by `seed + roundNumber`
// seats. `seed` is a per-league constant, picked once at random the first
// time a wishlist window ever runs for that league and carried forward
// unchanged forever after (see processLeagueWishlistDraft) — it never
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
async function writeGazetteEntry(supabase: any, leagueId: string, roundNumber: number, submissions: any[], userState: any, order: string[]) {
  const bullets = order.map((uid, idx) => {
    const sub = submissions.find((s) => s.user_id === uid);
    const u = userState[uid];
    const requested = sub?.target_ids?.length ?? 0;
    const released  = sub?.drop_ids?.length ?? 0;
    const gained     = u.allocated.length - u.preCount;
    return {
      user_id:   uid,
      pick_slot: idx + 1,
      requested,
      released,
      gained,
    };
  });

  // JSON.stringify-before-insert, matching run-reverse-standings-draft's
  // convention (not run-draft-lottery's raw-object insert, which the
  // read-side's defensive JSON.parse silently fails against).
  await supabase.from('gazette_entries').insert({
    league_id:  leagueId,
    entry_type: 'wishlist_draft_report',
    headline:   `Wishlist Draft resolved for round ${roundNumber}`,
    bullets:    JSON.stringify(bullets),
    full_data:  JSON.stringify({
      round_number: roundNumber,
      order,
      submissions: submissions.map((s) => ({ user_id: s.user_id, target_ids: s.target_ids, drop_ids: s.drop_ids })),
    }),
    created_at: new Date().toISOString(),
  });
}
