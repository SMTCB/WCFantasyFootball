// Edge Function: run-draft-lottery
// Triggered by cron at draft_deadline for each league.
// Resolves player conflicts via random lottery, allocates squads,
// flags incomplete squads, and writes a gazette entry.
//
// Security: direct calls require a valid JWT from a league commissioner.
// Cron calls originate from service role (no Authorization header required).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { logError } from '../_shared/log.ts';

const FN           = 'run-draft-lottery';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY');

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// Default squad position caps and size — overridden per league via DB
const DEFAULT_SQUAD_POS_CAPS = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
const DEFAULT_SQUAD_SIZE = 15;

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    const { league_id } = body;
    const phase = body.phase ?? 'group';

    // Direct league call: verify caller is a commissioner of that league.
    // Cron mode (no league_id): originates from service role — no JWT needed.
    if (league_id) {
      // DD-C4: always require a valid user JWT for direct league calls.
      // Cron uses service-role key + empty body (no league_id) — it never reaches this branch.
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) return respond(401, { error: 'Unauthorized' });

      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authErr } = await userClient.auth.getUser();
      if (authErr || !user) return respond(401, { error: 'Unauthorized' });

      const { data: membership } = await supabase
        .from('league_members')
        .select('role')
        .eq('league_id', league_id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!membership || membership.role !== 'commissioner') {
        return respond(403, { error: 'Forbidden — commissioner only' });
      }

      // Idempotency gate: if no pending submissions remain, the draft is already committed.
      const { data: pendingSub } = await supabase
        .from('draft_submissions')
        .select('id')
        .eq('league_id', league_id)
        .eq('phase', phase)
        .eq('status', 'pending')
        .limit(1)
        .maybeSingle();

      if (!pendingSub) {
        return respond(200, { message: 'Draft already processed', leagueId: league_id, phase, skipped: true });
      }

      const result = await runLottery(league_id, phase);
      return respond(200, result);
    }

    // Cron-mode allocation is permanently disabled. Draft allocation is ALWAYS
    // manually triggered by the league commissioner via Admin → Run Allocation.
    // Each league has different timing, manager readiness, and competitive dynamics
    // that make automated triggering inappropriate. The pg_cron job is set
    // active=false; this guard enforces the same rule at the code level.
    return respond(405, { error: 'Automated draft allocation is disabled — use the commissioner panel to run the draft for each league.' });
  } catch (err) {
    await logError(FN, 'critical', err.message, { stack: err.stack });
    return respond(500, { error: err.message });
  }
});

async function runLottery(leagueId, phase = 'group') {
  // 1. Load league config (squad_size, position_limits, tournament_id, budget_total, draft_list_size, format, league_mode) + pending submissions
  const [{ data: leagueRow }, { data: submissions }, { data: existingAllocations }] = await Promise.all([
    supabase.from('leagues')
      .select('squad_size, position_limits, tournament_id, budget_total, draft_list_size, format, league_mode')
      .eq('id', leagueId)
      .maybeSingle(),
    supabase.from('draft_submissions')
      .select('user_id, player_ids')
      .eq('league_id', leagueId)
      .eq('phase', phase)
      .eq('status', 'pending')
      .order('user_id'),  // L5.5: deterministic submission order
    // Re-entry check: Phase 1 may have committed before a prior crash.
    supabase.from('draft_allocations')
      .select('user_id, allocated_players, unresolved_slots')
      .eq('league_id', leagueId)
      .eq('phase', phase),
  ]);

  if (!submissions?.length) return { message: 'No pending submissions', leagueId };

  // P1-2: only draft (no-duplicate) leagues run a lottery. A classic league that somehow
  // has a draft_deadline + pending submissions must never be allocated by the lottery.
  if (leagueRow && leagueRow.format !== 'noduplicate' && leagueRow.league_mode !== 'draft') {
    return { message: 'Not a draft league — lottery skipped', leagueId, skipped: true };
  }

  // Per-league squad size, position caps, and budget (fall back to defaults)
  const SQUAD_SIZE     = Number(leagueRow?.squad_size ?? DEFAULT_SQUAD_SIZE);
  const SQUAD_POS_CAPS = leagueRow?.position_limits   ?? DEFAULT_SQUAD_POS_CAPS;
  const budget         = Number(leagueRow?.budget_total ?? 100);

  // L5.13: cap each submission's player_ids to draft_list_size from league config
  const maxLen = leagueRow?.draft_list_size ?? 30;
  submissions.forEach(s => { s.player_ids = (s.player_ids || []).slice(0, maxLen); });

  // Re-entry guard: if a prior invocation crashed after writing allocations but before
  // writing squads, skip the lottery (preserving the original random result) and jump
  // straight to Phase 2. isReEntry also suppresses gazette/notifications so they are
  // not duplicated on the recovery run.
  const isReEntry = (existingAllocations?.length ?? 0) > 0;
  let allocations;
  let contestedPlayers = [];

  if (isReEntry) {
    // Phase 1 already committed — rebuild from DB rows, no re-randomization.
    allocations = {};
    for (const row of existingAllocations) {
      allocations[row.user_id] = {
        allocated_players: row.allocated_players,
        unresolved_slots:  row.unresolved_slots,
        budget_used:       0,
      };
    }
    // Recompute budget_used from player prices so squads get accurate budget_remaining.
    const reentryPlayerIds = [...new Set(existingAllocations.flatMap(r => r.allocated_players ?? []))];
    if (reentryPlayerIds.length > 0) {
      const { data: reentryPrices } = await supabase
        .from('players')
        .select('id, price')
        .in('id', reentryPlayerIds)
        .eq('tournament_id', leagueRow?.tournament_id);
      const priceMap = Object.fromEntries((reentryPrices ?? []).map(p => [p.id, p.price ?? 0]));
      for (const a of Object.values(allocations)) {
        a.budget_used = (a.allocated_players ?? []).reduce((sum, pid) => sum + (priceMap[pid] ?? 0), 0);
      }
    }
  } else {
    // Pass 0: load keep submissions for the knockout phase.
    // For all other phases (group, etc.) this query returns nothing and the
    // keepsByManager / keptPlayerIds structures are empty — true no-op.
    const { data: keepRows } = phase === 'knockout'
      ? await supabase.from('knockout_keep_submissions').select('user_id, player_ids').eq('league_id', leagueId)
      : { data: [] };

    const keepsByManager = {};   // user_id → player_ids[]
    const keptPlayerIds  = new Set();  // all kept pids — excluded from lottery pool
    for (const row of keepRows ?? []) {
      keepsByManager[row.user_id] = row.player_ids ?? [];
      for (const pid of row.player_ids ?? []) keptPlayerIds.add(pid);
    }

    // 2. Load player data (price, position, club) for allocation enforcement.
    // Include keep player IDs so playerMap contains data needed for Pass 0 cap checks.
    // forza_team_id is the club identifier used for club-cap enforcement.
    const wishListIds  = [...new Set(submissions.flatMap(s => s.player_ids))];
    const allPlayerIds = [...new Set([...wishListIds, ...keptPlayerIds])];
    const { data: playerRows } = await supabase
      .from('players')
      .select('id, position, price, forza_team_id')
      .in('id', allPlayerIds)
      // L5.12: filter by tournament so cross-tournament player IDs are excluded
      .eq('tournament_id', leagueRow?.tournament_id);

    // Fetch the active club cap for this league (relaxes in cup as clubs are eliminated).
    const { data: clubCapData } = await supabase.rpc('get_club_cap', { p_league_id: leagueId });
    const CLUB_CAP = (clubCapData !== null && clubCapData !== undefined) ? clubCapData : 3;

    const playerMap = Object.fromEntries((playerRows ?? []).map(p => [p.id, p]));

    // 3. Build conflict map: player_id → [user_ids who want them]
    const wantedBy = {};
    for (const sub of submissions) {
      for (const pid of sub.player_ids) {
        if (!wantedBy[pid]) wantedBy[pid] = [];
        wantedBy[pid].push(sub.user_id);
      }
    }

    // 4. Resolve conflicts: random lottery winner per contested player
    const awardedTo = {}; // player_id → winning user_id

    for (const [pid, wanters] of Object.entries(wantedBy)) {
      if (wanters.length === 1) {
        awardedTo[pid] = wanters[0];
      } else {
        // Use crypto-random for fairness; log roll for audit trail.
        const roll   = crypto.getRandomValues(new Uint32Array(1))[0] / 0xFFFFFFFF;
        const winner = wanters[Math.floor(roll * wanters.length)];
        awardedTo[pid] = winner;
        contestedPlayers.push({ pid, wanters, winner, roll: roll.toFixed(6) });
      }
    }

    // 5. Two-pass squad allocation.
    //    Pass 1 — allocate lottery winners; record players the winner couldn't
    //             take due to position cap or budget.
    //    Pass 2 — offer each dropped player to runner-up contestants (shuffled
    //             with crypto-random so no submission ordering advantage).

    const userState = {};
    for (const sub of submissions) {
      userState[sub.user_id] = {
        allocated:  [],
        posCounts:  { GK: 0, DEF: 0, MID: 0, FWD: 0 },
        clubCounts: {},
        budgetUsed: 0,
      };
    }

    // Pass 0: pre-allocate kept players before the lottery runs.
    // Kept players are awarded directly to their keeper and excluded from
    // the lottery pool — other managers cannot win them in Pass 1 or Pass 2.
    // Same position/budget/club cap rules apply. If a keep fails validation
    // (e.g. cap exceeded) it is silently skipped; the manager fills that slot
    // via the lottery wish list instead.
    for (const [uid, keepPids] of Object.entries(keepsByManager)) {
      // Create a state entry for managers who submitted keeps but no wish list.
      if (!userState[uid]) {
        userState[uid] = { allocated: [], posCounts: { GK: 0, DEF: 0, MID: 0, FWD: 0 }, clubCounts: {}, budgetUsed: 0 };
      }
      const u = userState[uid];
      for (const pid of keepPids) {
        if (u.allocated.length >= SQUAD_SIZE) break;
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
        awardedTo[pid] = uid; // lock out other managers — cannot be won via lottery
      }
    }

    const droppedByWinner = []; // pids the lottery winner couldn't take

    for (const sub of submissions) {
      const uid = sub.user_id;
      const u   = userState[uid];

      for (const pid of sub.player_ids) {
        if (u.allocated.length >= SQUAD_SIZE) break;

        if (keptPlayerIds.has(pid)) continue;  // handled in Pass 0 — skip lottery processing
        if (awardedTo[pid] !== uid) continue;

        const player = playerMap[pid];
        if (!player) continue;

        const pos = normalisePosition(player.position);
        if (!SQUAD_POS_CAPS[pos]) continue;

        const teamId    = player.forza_team_id;
        const clubCount = teamId ? (u.clubCounts[teamId] ?? 0) : 0;
        if (
          u.posCounts[pos] >= SQUAD_POS_CAPS[pos] ||
          u.budgetUsed + player.price > budget      ||
          (teamId && CLUB_CAP < 99 && clubCount >= CLUB_CAP)
        ) {
          droppedByWinner.push(pid);
          continue;
        }

        u.allocated.push(pid);
        u.posCounts[pos]++;
        if (teamId) u.clubCounts[teamId] = clubCount + 1;
        u.budgetUsed += player.price;
      }
    }

    // Pass 2: runner-up allocation for dropped players
    for (const pid of droppedByWinner) {
      if (keptPlayerIds.has(pid)) continue;  // kept in Pass 0 — cannot be runner-up allocated
      const player = playerMap[pid];
      if (!player) continue;

      const runnerUps = (wantedBy[pid] ?? []).filter(uid => uid !== awardedTo[pid]);
      // Crypto-random shuffle so no submission order advantage
      for (let i = runnerUps.length - 1; i > 0; i--) {
        const roll = crypto.getRandomValues(new Uint32Array(1))[0] / 0xFFFFFFFF;
        const j    = Math.floor(roll * (i + 1));
        [runnerUps[i], runnerUps[j]] = [runnerUps[j], runnerUps[i]];
      }

      const pos    = normalisePosition(player.position);
      const teamId = player.forza_team_id;
      for (const uid of runnerUps) {
        const u         = userState[uid];
        if (!u) continue;
        if (u.allocated.length >= SQUAD_SIZE) continue;
        if (u.posCounts[pos] >= SQUAD_POS_CAPS[pos]) continue;
        if (u.budgetUsed + player.price > budget) continue;
        const clubCount = teamId ? (u.clubCounts[teamId] ?? 0) : 0;
        if (teamId && CLUB_CAP < 99 && clubCount >= CLUB_CAP) continue;

        u.allocated.push(pid);
        u.posCounts[pos]++;
        if (teamId) u.clubCounts[teamId] = clubCount + 1;
        u.budgetUsed += player.price;
        break;
      }
    }

    allocations = {};
    for (const [uid, u] of Object.entries(userState)) {
      allocations[uid] = {
        allocated_players: u.allocated,
        unresolved_slots:  Math.max(0, SQUAD_SIZE - u.allocated.length),
        budget_used:       u.budgetUsed,
      };
    }

    // 6. Write draft_allocations rows (Phase 1 commit point)
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
  }

  // 6c. Update cup_phase on the league to signal allocation is done.
  //     If phase='knockout', mark elimination stage; otherwise group_stage.
  const newCupPhase = phase === 'knockout' ? 'pre_elimination' : 'group_stage';
  await supabase.from('leagues').update({ cup_phase: newCupPhase }).eq('id', leagueId);

  // 6d. For group-phase cup leagues, auto-seed cup clubs from the allocated squads.
  if (phase === 'group' && leagueRow?.format === 'cup') {
    await supabase.rpc('seed_cup_clubs', { p_league_id: leagueId });
  }

  // 6b. Fetch the canonical matchday_id for this league's tournament.
  //     Try the nearest upcoming deadline first; fall back to the most recent past
  //     deadline (IMP-02 fix — avoids 'active' when season is over).
  const leagueWithTournament = leagueRow?.tournament_id;
  let canonicalMatchdayId = 'active';
  if (leagueWithTournament) {
    const { data: upcoming } = await supabase
      .from('matchday_deadlines')
      .select('matchday_id')
      .eq('tournament_id', leagueWithTournament)
      .gt('deadline_at', new Date().toISOString())
      .order('deadline_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (upcoming?.matchday_id) {
      canonicalMatchdayId = upcoming.matchday_id;
    } else {
      const { data: past } = await supabase
        .from('matchday_deadlines')
        .select('matchday_id')
        .eq('tournament_id', leagueWithTournament)
        .lte('deadline_at', new Date().toISOString())
        .order('deadline_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (past?.matchday_id) canonicalMatchdayId = past.matchday_id;
    }
  }

  // Bug E fix: for the knockout phase, clear player lists from all group-stage squad rows
  // before writing the new knockout squads. Without this, stale group-stage squads remain
  // in the squads table and pollute the no-repeat check in process-transfer — blocking
  // managers from buying players that are no longer owned by anyone in the new phase.
  // Only clears squads with a different matchday_id (i.e. from previous phases).
  // Historical fantasy_points rows reference squad_id and are unaffected by this clearing.
  if (phase === 'knockout') {
    await supabase
      .from('squads')
      .update({ players: [], starting_xi: [], lineup_locks: {} })
      .eq('league_id', leagueId)
      .neq('matchday_id', canonicalMatchdayId);
  }

  // Write allocated squads to the squads table so the Squad screen shows them.
  // initial_build_complete is set true for managers who received a full squad from the
  // lottery — they should not receive the initial-build exemption on the transfer limit.
  // Managers with incomplete allocations (< SQUAD_SIZE) keep it false so they can fill
  // their squad without hitting the 3/round cap.
  const squadRows = Object.entries(allocations).map(([userId, data]) => ({
    user_id:                userId,
    league_id:              leagueId,
    players:                data.allocated_players,
    budget_remaining:       Math.round((budget - data.budget_used) * 100) / 100,
    matchday_id:            canonicalMatchdayId,
    initial_build_complete: data.unresolved_slots === 0,
  }));

  await supabase
    .from('squads')
    .upsert(squadRows, { onConflict: 'league_id,user_id,matchday_id' });

  // Commit marker: once submissions are flipped to 'processed', the idempotency gate
  // (no pending submissions) will catch any future invocation and skip cleanly.
  await supabase
    .from('draft_submissions')
    .update({ status: 'processed' })
    .eq('league_id', leagueId)
    .eq('phase', phase)
    .eq('status', 'pending');

  // Gazette, notifications, and transfer window are side effects written after the
  // commit marker. On a re-entry run these are skipped to avoid duplicates.
  if (!isReEntry) {
  // 8. Write gazette entry
  const gazettEntry = buildGazetteEntry(leagueId, contestedPlayers, allocations, submissions);
  await supabase.from('gazette_entries').insert(gazettEntry);

  // TDD-14: Notify managers who never submitted a draft list — they have no squad.
  const { data: allMembers } = await supabase
    .from('league_members')
    .select('user_id')
    .eq('league_id', leagueId);

  const submittedUserIds = new Set(submissions.map(s => s.user_id));
  const missedRows = (allMembers ?? [])
    .filter(m => !submittedUserIds.has(m.user_id))
    .map(m => ({
      league_id:           leagueId,
      user_id:             m.user_id,
      notification_type:   'draft',
      title:               'Draft complete — no wishlist submitted',
      description:         'The draft lottery ran but you had no wishlist. You have no squad yet — contact your league commissioner to arrange a recovery pick.',
      related_entity_type: 'draft_allocation',
    }));
  if (missedRows.length > 0) {
    await supabase.from('league_notifications').insert(missedRows);
    await logError(FN, 'warning', `${missedRows.length} manager(s) missed draft deadline in league ${leagueId}`,
      { league_id: leagueId, user_ids: missedRows.map(r => r.user_id) });
  }

  // L5.10: Notify users with unresolved slots to complete squad on recovery screen
  const notificationRows = Object.entries(allocations)
    .filter(([, d]) => d.unresolved_slots > 0)
    .map(([userId, d]) => ({
      league_id:         leagueId,
      user_id:           userId,
      notification_type: 'draft',
      title:             'Draft complete — squad has empty slots',
      description:       `Your squad has ${d.unresolved_slots} unfilled slot(s) — complete it on the recovery screen.`,
      related_entity_type: 'draft_allocation',
    }));
  if (notificationRows.length > 0) {
    await supabase.from('league_notifications').insert(notificationRows);
  }

  // NOTE: The 48h free-agency transfer_windows row (L5.10) is intentionally NOT created
  // for tournament leagues. Tournament leagues use matchday_deadlines for window timing.
  // Incomplete managers are already exempt from the per-round transfer limit via the
  // initial_build_complete latch (migration 141, squads.initial_build_complete=false),
  // which provides unlimited transfers until the squad reaches 15 without requiring a
  // manual transfer_windows row. Creating that row overrides the matchday deadline system
  // (get_transfer_window_status checks manual windows first), producing incorrect "15
  // transfers left" and wrong close times for managers.
  } // end if (!isReEntry)

  // 9. Summary for caller
  const incomplete = Object.entries(allocations)
    .filter(([, d]) => d.unresolved_slots > 0)
    .map(([uid, d]) => ({ userId: uid, gaps: d.unresolved_slots }));

  return {
    leagueId,
    managersProcessed: submissions.length,
    contestedPlayers: contestedPlayers.length,
    incomplete,
  };
}

// ── Gazette entry builder ────────────────────────────────────────────────────

function buildGazetteEntry(leagueId, contested, allocations, submissions) {
  const topContested = contested
    .sort((a, b) => b.wanters.length - a.wanters.length)
    .slice(0, 3);

  const headline = topContested.length > 0
    ? `DRAFT SETTLED: ${topContested.length} battle${topContested.length > 1 ? 's' : ''} decided by the lottery`
    : 'DRAFT COMPLETE: All squads allocated without conflicts';

  const bullets = [];

  for (const { pid, wanters, winner } of topContested) {
    bullets.push({
      player_id: pid,
      wanted_by: wanters.length,
      winner_id: winner,
    });
  }

  const incompleteCount = Object.values(allocations).filter(d => d.unresolved_slots > 0).length;
  if (incompleteCount > 0) {
    bullets.push({
      text: `${incompleteCount} manager${incompleteCount > 1 ? 's' : ''} enter the draft with incomplete squads — first available picks now open`,
    });
  }

  const fullData = {
    allocations: Object.entries(allocations).map(([userId, data]) => ({
      user_id:   userId,
      players:   data.allocated_players,
      gaps:      data.unresolved_slots,
      budget_used: data.budget_used,
    })),
    contested_count: contested.length,
    total_managers:  submissions.length,
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

// ── Helpers ──────────────────────────────────────────────────────────────────

// DB seed uses 'FW' not 'FWD' — normalise to match SQUAD_POS_CAPS keys
function normalisePosition(pos) {
  if (!pos) return 'MID';
  const p = pos.toUpperCase().trim();
  if (p === 'FW' || p === 'FWD') return 'FWD';
  if (p === 'GK')  return 'GK';
  if (p === 'DEF') return 'DEF';
  if (p === 'MID') return 'MID';
  return 'MID';
}

function respond(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
