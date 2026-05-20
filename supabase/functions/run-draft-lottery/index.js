// Edge Function: run-draft-lottery
// Triggered by cron at draft_deadline for each league.
// Resolves player conflicts via random lottery, allocates squads,
// flags incomplete squads, and writes a gazette entry.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
);

// Squad position caps applied after allocation
const SQUAD_POS_CAPS = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
const SQUAD_SIZE = 15;

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { league_id } = body;

    if (league_id) {
      // Direct call with specific league
      const result = await runLottery(league_id);
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

    const results = await Promise.all(leagueIds.map(id => runLottery(id)));
    return respond(200, { processed: results });
  } catch (err) {
    console.error(err);
    return respond(500, { error: err.message });
  }
});

async function runLottery(leagueId) {
  // 1. Load all pending submissions for this league
  const { data: submissions } = await supabase
    .from('draft_submissions')
    .select('user_id, player_ids')
    .eq('league_id', leagueId)
    .eq('status', 'pending');

  if (!submissions?.length) return { message: 'No pending submissions', leagueId };

  // 2. Load player prices for budget enforcement
  const allPlayerIds = [...new Set(submissions.flatMap(s => s.player_ids))];
  const { data: playerRows } = await supabase
    .from('players')
    .select('id, position, price')
    .in('id', allPlayerIds);

  const playerMap = Object.fromEntries(playerRows.map(p => [p.id, p]));

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
  const contestedPlayers = []; // for gazette report

  for (const [pid, wanters] of Object.entries(wantedBy)) {
    if (wanters.length === 1) {
      awardedTo[pid] = wanters[0];
    } else {
      const winner = wanters[Math.floor(Math.random() * wanters.length)];
      awardedTo[pid] = winner;
      contestedPlayers.push({ pid, wanters, winner });
    }
  }

  // 5. Allocate squads per manager using sequential priority
  //    Skip: player taken by another manager, position cap reached, budget exceeded
  const allocations = {};
  const budgetTracker = {};

  for (const sub of submissions) {
    const userId = sub.user_id;
    const allocated = [];
    const posCounts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    let budgetUsed = 0;

    for (const pid of sub.player_ids) {
      if (allocated.length >= SQUAD_SIZE) break;

      const player = playerMap[pid];
      if (!player) continue;

      // Skip if another manager won this player in the lottery
      if (awardedTo[pid] !== userId) continue;

      const pos = normalisePosition(player.position);
      if (!SQUAD_POS_CAPS[pos]) continue;

      // Skip if position cap reached
      if (posCounts[pos] >= SQUAD_POS_CAPS[pos]) continue;

      // Skip if budget exceeded (100M cap applies post-allocation)
      if (budgetUsed + player.price > 100) continue;

      allocated.push(pid);
      posCounts[pos]++;
      budgetUsed += player.price;
    }

    allocations[userId] = {
      allocated_players: allocated,
      unresolved_slots: SQUAD_SIZE - allocated.length,
      budget_used: budgetUsed,
    };
    budgetTracker[userId] = budgetUsed;
  }

  // 6. Write draft_allocations rows
  const allocationRows = Object.entries(allocations).map(([userId, data]) => ({
    league_id:         leagueId,
    user_id:           userId,
    allocated_players: data.allocated_players,
    unresolved_slots:  data.unresolved_slots,
    allocated_at:      new Date().toISOString(),
  }));

  await supabase
    .from('draft_allocations')
    .upsert(allocationRows, { onConflict: 'league_id,user_id' });

  // 6b. Write allocated squads to the squads table so the Squad screen shows them
  const squadRows = Object.entries(allocations).map(([userId, data]) => ({
    user_id:          userId,
    league_id:        leagueId,
    players:          data.allocated_players,
    budget_remaining: Math.round((100 - data.budget_used) * 10) / 10,
    matchday_id:      'current',
  }));

  await supabase
    .from('squads')
    .upsert(squadRows, { onConflict: 'user_id,league_id' });

  // 7. Mark submissions as processed
  await supabase
    .from('draft_submissions')
    .update({ status: 'processed' })
    .eq('league_id', leagueId)
    .eq('status', 'pending');

  // 8. Write gazette entry
  const gazettEntry = buildGazetteEntry(leagueId, contestedPlayers, allocations, submissions);
  await supabase.from('gazette_entries').insert(gazettEntry);

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
    bullets:      JSON.stringify(bullets),
    full_data:    JSON.stringify(fullData),
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
