// Edge Function: run-reverse-standings-draft
// Triggered at the GROUP_STAGE → PRE_ELIMINATION transition.
// Resolves contested players in reverse standings order:
// the lowest-ranked manager (worst points) wins each conflict.
// Identical allocation logic to run-draft-lottery after resolution.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY');

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const DEFAULT_SQUAD_POS_CAPS = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
const DEFAULT_SQUAD_SIZE     = 15;

Deno.serve(async (req) => {
  try {
    const { league_id } = await req.json();
    if (!league_id) return respond(400, { error: 'league_id required' });

    // Verify caller is a commissioner of this league (if JWT provided).
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
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
    }

    const result = await runReverseDraft(league_id);
    return respond(200, result);
  } catch (err) {
    console.error(err);
    return respond(500, { error: err.message });
  }
});

async function runReverseDraft(leagueId) {
  // 0. Load per-league config (squad_size, position_limits, budget).
  const { data: leagueRow } = await supabase
    .from('leagues')
    .select('squad_size, position_limits, budget, tournament_id')
    .eq('id', leagueId)
    .maybeSingle();

  const SQUAD_SIZE     = Number(leagueRow?.squad_size ?? DEFAULT_SQUAD_SIZE);
  const SQUAD_POS_CAPS = leagueRow?.position_limits   ?? DEFAULT_SQUAD_POS_CAPS;
  const budget         = Number(leagueRow?.budget     ?? 100);

  // 1. Load standings — ordered worst → best (lowest points first)
  const { data: standings } = await supabase
    .from('league_members')
    .select('user_id, total_points, rank')
    .eq('league_id', leagueId)
    .order('total_points', { ascending: true });   // worst first

  if (!standings?.length) return { message: 'No members found', leagueId };

  // Build priority order: index 0 = lowest points = gets first pick on conflicts
  const priorityOrder = standings.map(s => s.user_id);
  const rankMap       = Object.fromEntries(standings.map(s => [s.user_id, s.total_points]));

  // 2. Load pending submissions
  const { data: submissions } = await supabase
    .from('draft_submissions')
    .select('user_id, player_ids')
    .eq('league_id', leagueId)
    .eq('status', 'pending');

  if (!submissions?.length) return { message: 'No pending submissions', leagueId };

  // 3. Load player data for allocation logic
  const allPlayerIds = [...new Set(submissions.flatMap(s => s.player_ids))];
  const { data: playerRows } = await supabase
    .from('players')
    .select('id, position, price')
    .in('id', allPlayerIds);

  const playerMap = Object.fromEntries((playerRows ?? []).map(p => [p.id, p]));

  // 4. Build conflict map
  const wantedBy = {};
  for (const sub of submissions) {
    for (const pid of sub.player_ids) {
      if (!wantedBy[pid]) wantedBy[pid] = [];
      wantedBy[pid].push(sub.user_id);
    }
  }

  // 5. Resolve conflicts: worst-ranked manager wins
  const awardedTo      = {};
  const conflictLog    = [];  // for gazette

  for (const [pid, wanters] of Object.entries(wantedBy)) {
    if (wanters.length === 1) {
      awardedTo[pid] = wanters[0];
      continue;
    }

    // Pick the wanter with the lowest points (worst standing).
    // Tiebreaker: lexicographic user_id for deterministic output.
    const winner = wanters.reduce((best, uid) => {
      const bPts = rankMap[best] ?? Infinity;
      const uPts = rankMap[uid]  ?? Infinity;
      if (uPts < bPts) return uid;
      if (uPts === bPts) return uid < best ? uid : best;
      return best;
    });
    awardedTo[pid] = winner;
    conflictLog.push({ pid, wanters, winner, method: 'reverse_standings' });
  }

  // 6. Sequential allocation (identical to lottery function)
  const allocations = {};

  for (const sub of submissions) {
    const userId   = sub.user_id;
    const allocated = [];
    const posCounts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    let budgetUsed  = 0;

    for (const pid of sub.player_ids) {
      if (allocated.length >= SQUAD_SIZE) break;

      const player = playerMap[pid];
      if (!player) continue;
      if (awardedTo[pid] !== userId) continue;

      const pos = normalisePosition(player.position);
      if (!SQUAD_POS_CAPS[pos]) continue;
      if (posCounts[pos] >= SQUAD_POS_CAPS[pos]) continue;
      if (budgetUsed + player.price > budget) continue;

      allocated.push(pid);
      posCounts[pos]++;
      budgetUsed += player.price;
    }

    allocations[userId] = {
      allocated_players: allocated,
      unresolved_slots:  SQUAD_SIZE - allocated.length,
      budget_used:       budgetUsed,
    };
  }

  // 7. Write draft_allocations (merge with existing — keep already-allocated players)
  for (const [userId, data] of Object.entries(allocations)) {
    const { data: existing } = await supabase
      .from('draft_allocations')
      .select('allocated_players')
      .eq('league_id', leagueId)
      .eq('user_id', userId)
      .maybeSingle();

    // New players = allocation result minus anything already held
    const alreadyHeld = new Set(existing?.allocated_players ?? []);
    const merged      = [
      ...(existing?.allocated_players ?? []),
      ...data.allocated_players.filter(id => !alreadyHeld.has(id)),
    ];

    await supabase.from('draft_allocations').upsert({
      league_id:         leagueId,
      user_id:           userId,
      allocated_players: merged,
      unresolved_slots:  Math.max(0, SQUAD_SIZE - merged.length),
      allocated_at:      new Date().toISOString(),
    }, { onConflict: 'league_id,user_id' });
  }

  // 8. Mark submissions processed
  await supabase
    .from('draft_submissions')
    .update({ status: 'processed' })
    .eq('league_id', leagueId)
    .eq('status', 'pending');

  // 9. Advance cup phase to PRE_ELIMINATION
  await supabase
    .from('leagues')
    .update({ cup_phase: 'pre_elimination' })
    .eq('id', leagueId);

  // 10. Write gazette entry
  const gazettEntry = buildGazetteEntry(leagueId, conflictLog, allocations, standings);
  await supabase.from('gazette_entries').insert(gazettEntry);

  const incomplete = Object.entries(allocations)
    .filter(([, d]) => d.unresolved_slots > 0)
    .map(([uid, d]) => ({ userId: uid, gaps: d.unresolved_slots }));

  return {
    leagueId,
    method:            'reverse_standings',
    managersProcessed: submissions.length,
    conflictsResolved: conflictLog.length,
    incomplete,
    cupPhase:          'pre_elimination',
  };
}

function buildGazetteEntry(leagueId, conflictLog, allocations, standings) {
  const top = conflictLog
    .sort((a, b) => b.wanters.length - a.wanters.length)
    .slice(0, 3);

  const headline = conflictLog.length > 0
    ? `ELIMINATION DRAFT: ${conflictLog.length} battle${conflictLog.length > 1 ? 's' : ''} settled by standings — underdogs get first pick`
    : 'ELIMINATION DRAFT COMPLETE: No conflicts — all squads locked for the knockouts';

  const bullets = top.map(({ pid, wanters, winner }) => ({
    player_id:   pid,
    wanted_by:   wanters.length,
    winner_id:   winner,
    method:      'reverse_standings',
  }));

  const incompleteCount = Object.values(allocations).filter(d => d.unresolved_slots > 0).length;
  if (incompleteCount > 0) {
    bullets.push({
      text: `${incompleteCount} manager${incompleteCount > 1 ? 's' : ''} still need to fill squad gaps — pick now`,
    });
  }

  return {
    league_id:    leagueId,
    entry_type:   'draft_report',
    headline,
    bullets:      JSON.stringify(bullets),
    full_data:    JSON.stringify({
      allocations: Object.entries(allocations).map(([uid, d]) => ({
        user_id:     uid,
        players:     d.allocated_players,
        gaps:        d.unresolved_slots,
        budget_used: d.budget_used,
      })),
      standings_used:    standings.map(s => ({ user_id: s.user_id, points: s.total_points })),
      conflicts_resolved: conflictLog.length,
      total_managers:     Object.keys(allocations).length,
    }),
    published_at: new Date().toISOString(),
  };
}

function normalisePosition(pos) {
  if (!pos) return 'MID';
  const p = pos.toUpperCase().trim();
  if (p === 'FW' || p === 'FWD') return 'FWD';
  if (p === 'GK')  return 'GK';
  if (p === 'DEF') return 'DEF';
  return 'MID';
}

function respond(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
