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

Deno.serve(async (req) => {
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

    // Cron mode: find leagues with pending submissions past their draft_deadline
    const { data: pendingLeagues } = await supabase
      .from('draft_submissions')
      .select('league_id, leagues!inner(draft_deadline)')
      .eq('status', 'pending')
      .lte('leagues.draft_deadline', new Date().toISOString());

    const leagueIds = [...new Set((pendingLeagues ?? []).map(r => r.league_id))];

    if (!leagueIds.length) {
      return respond(200, { message: 'No leagues past deadline with pending submissions' });
    }

    const results = await Promise.all(leagueIds.map(id => runLottery(id, 'group')));
    return respond(200, { processed: results });
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
    // 2. Load player prices for budget enforcement
    const allPlayerIds = [...new Set(submissions.flatMap(s => s.player_ids))];
    const { data: playerRows } = await supabase
      .from('players')
      .select('id, position, price')
      .in('id', allPlayerIds)
      // L5.12: filter by tournament so cross-tournament player IDs are excluded
      .eq('tournament_id', leagueRow?.tournament_id);

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
        allocated: [],
        posCounts: { GK: 0, DEF: 0, MID: 0, FWD: 0 },
        budgetUsed: 0,
      };
    }

    const droppedByWinner = []; // pids the lottery winner couldn't take

    for (const sub of submissions) {
      const uid = sub.user_id;
      const u   = userState[uid];

      for (const pid of sub.player_ids) {
        if (u.allocated.length >= SQUAD_SIZE) break;

        if (awardedTo[pid] !== uid) continue;

        const player = playerMap[pid];
        if (!player) continue;

        const pos = normalisePosition(player.position);
        if (!SQUAD_POS_CAPS[pos]) continue;

        if (u.posCounts[pos] >= SQUAD_POS_CAPS[pos] || u.budgetUsed + player.price > budget) {
          droppedByWinner.push(pid);
          continue;
        }

        u.allocated.push(pid);
        u.posCounts[pos]++;
        u.budgetUsed += player.price;
      }
    }

    // Pass 2: runner-up allocation for dropped players
    for (const pid of droppedByWinner) {
      const player = playerMap[pid];
      if (!player) continue;

      const runnerUps = (wantedBy[pid] ?? []).filter(uid => uid !== awardedTo[pid]);
      // Crypto-random shuffle so no submission order advantage
      for (let i = runnerUps.length - 1; i > 0; i--) {
        const roll = crypto.getRandomValues(new Uint32Array(1))[0] / 0xFFFFFFFF;
        const j    = Math.floor(roll * (i + 1));
        [runnerUps[i], runnerUps[j]] = [runnerUps[j], runnerUps[i]];
      }

      const pos = normalisePosition(player.position);
      for (const uid of runnerUps) {
        const u = userState[uid];
        if (!u) continue;
        if (u.allocated.length >= SQUAD_SIZE) continue;
        if (u.posCounts[pos] >= SQUAD_POS_CAPS[pos]) continue;
        if (u.budgetUsed + player.price > budget) continue;

        u.allocated.push(pid);
        u.posCounts[pos]++;
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
  const newCupPhase = phase === 'knockout' ? 'elimination' : 'group_stage';
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

  // Write allocated squads to the squads table so the Squad screen shows them.
  const squadRows = Object.entries(allocations).map(([userId, data]) => ({
    user_id:          userId,
    league_id:        leagueId,
    players:          data.allocated_players,
    budget_remaining: Math.round((budget - data.budget_used) * 100) / 100,
    matchday_id:      canonicalMatchdayId,
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

  // L5.10: Open a 48h free-agency window so managers with gaps can fill via DraftRecoveryScreen
  if (notificationRows.length > 0) {
    const now      = new Date();
    const closes   = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
    const roundNum = parseInt(String(canonicalMatchdayId).replace(/^.*-r/, ''), 10) || 1;
    await supabase
      .from('transfer_windows')
      .upsert(
        {
          league_id:           leagueId,
          round_number:        roundNum,
          opens_at:            now.toISOString(),
          closes_at:           closes,
          window_type:         'standard',
          transfers_remaining: 15,
        },
        { onConflict: 'league_id,round_number', ignoreDuplicates: true }
      );
  }
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
    headers: { 'Content-Type': 'application/json' },
  });
}
