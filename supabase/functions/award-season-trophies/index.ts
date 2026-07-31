import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireServiceRole } from '../_shared/auth.ts';
import { logError } from '../_shared/log.ts';

// ─────────────────────────────────────────────────────────────────────────────
// award-season-trophies (ARCH-1d) — cross-sport season_win trophy sweep
//
// Called on a cron schedule (registered inactive alongside the rest of the
// frozen crons — see BACKLOG.md ARCH-1). Scans each sport's season boundary
// and awards a season_win trophy to the champion of every League / Paddock /
// Player Box whose season has ended. Read-only against tournaments/
// tennis_tournaments/f1_seasons — never mutates their status, since this
// project doesn't yet have an audited "who/what transitions status to
// completed" contract for those tables; award_trophy()'s own idempotency
// (partial unique index from migration 246) makes re-running this sweep any
// number of times safe.
//
// Per-sport champion + season-boundary detection:
//   Football — leagues.tournament_id (text) joins tournaments.forza_id (text,
//     NOT tournaments.id). Season = tournaments row itself; boundary =
//     ends_at < now(). Champion = get_h2h_standings() rank-1 row (H2H leagues)
//     or league_members.total_points top row (classic leagues); ties (no
//     single top row) are skipped, matching round_win's draws-are-skipped
//     precedent.
//   F1 — season = f1_seasons row (migration 248); boundary = ends_at < now().
//     Champion = get_paddock_leaderboard() rank-1 row per paddock in that
//     season. That RPC has no internal auth.uid() check, so it's safe to call
//     under the service-role context this function runs in.
//   Tennis — no season-level table exists (unlike football/F1, a tennis
//     "season" is many tennis_tournaments rows, not one). Boundary = every
//     tennis_tournaments row for a season_year has status='completed'.
//     Champion = cumulative total_points per player_box member across that
//     season_year's tournaments, applying the same Masters Drop Rule as
//     get_player_box_leaderboard() (drop worst non-ATP-Finals score once ≥5
//     standard tournaments are completed). That RPC unconditionally raises
//     NOT_A_MEMBER when auth.uid() is null (always true for a service-role
//     caller), so it can't be reused here — the aggregation is reimplemented
//     inline instead. trophy_ledger.tournament_id has no season-level tennis
//     row to point to, so the season's last-completed tournament (by
//     end_date) is used as the season's tournament_id anchor — tournament_id
//     is documented as sport-scoped/opaque (migration 248) and nothing reads
//     it directly (TrophyCabinetScreen renders off the denormalized meta
//     jsonb only), so this is a safe stand-in, not a semantic promise that
//     the column always means "one specific event."
// ─────────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function awardFootballSeasons(supabase, results) {
  const { data: sport } = await supabase.from('sports').select('id').eq('name', 'Football').maybeSingle();
  if (!sport?.id) return;

  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('id, forza_id, name, ends_at')
    .eq('status', 'active')
    .lt('ends_at', new Date().toISOString());

  for (const tournament of (tournaments ?? [])) {
    const { data: leagues } = await supabase
      .from('leagues')
      .select('id, name, circle_id, h2h_enabled')
      .eq('tournament_id', tournament.forza_id);

    for (const league of (leagues ?? [])) {
      let champion = null;
      let reason = '';

      if (league.h2h_enabled) {
        const { data: standings } = await supabase.rpc('get_h2h_standings', { p_league_id: league.id });
        const top = (standings ?? []).filter(s => s.h2h_rank === 1);
        if (top.length === 1) {
          champion = top[0].user_id;
          reason = `${top[0].wins}W-${top[0].draws}D-${top[0].losses}L, ${top[0].total_h2h_pts} H2H pts`;
        }
      } else {
        const { data: members } = await supabase
          .from('league_members')
          .select('user_id, total_points')
          .eq('league_id', league.id)
          .order('total_points', { ascending: false })
          .limit(2);
        if (members?.length === 1 || (members?.length >= 2 && members[0].total_points > members[1].total_points)) {
          champion = members[0].user_id;
          reason = `${members[0].total_points} pts`;
        }
      }

      if (!champion) continue;

      const { error } = await supabase.rpc('award_trophy', {
        p_circle_id:     league.circle_id,
        p_league_id:     league.id,
        p_user_id:       champion,
        p_sport_id:      sport.id,
        p_tournament_id: tournament.id,
        p_trophy_type:   'season_win',
        p_tier:          'gold',
        p_meta: {
          label:       'Season Champion',
          reason:      `${tournament.name} — ${reason}`,
          league_name: league.name,
          sport_type:  'football',
        },
      });
      results.push({ sport: 'football', league: league.name, champion, error: error?.message ?? null });
    }
  }
}

async function awardF1Seasons(supabase, results) {
  const { data: sport } = await supabase.from('sports').select('id').eq('name', 'Formula 1').maybeSingle();
  if (!sport?.id) return;

  const { data: seasons } = await supabase
    .from('f1_seasons')
    .select('id, season, ends_at')
    .lt('ends_at', new Date().toISOString());

  for (const season of (seasons ?? [])) {
    const { data: paddocks } = await supabase
      .from('paddocks')
      .select('id, name, circle_id')
      .eq('season', season.season)
      .eq('sport_id', sport.id);

    for (const paddock of (paddocks ?? [])) {
      const { data: leaderboard } = await supabase.rpc('get_paddock_leaderboard', { p_paddock_id: paddock.id });
      const top = (leaderboard ?? []).filter(r => r.rank === 1 && r.total_points > 0);
      if (top.length !== 1) continue;

      const { error } = await supabase.rpc('award_trophy', {
        p_circle_id:     paddock.circle_id,
        p_league_id:     paddock.id,
        p_user_id:       top[0].user_id,
        p_sport_id:      sport.id,
        p_tournament_id: season.id,
        p_trophy_type:   'season_win',
        p_tier:          'gold',
        p_meta: {
          label:       'Season Champion',
          reason:      `${season.season} season — ${top[0].total_points} pts`,
          league_name: paddock.name,
          sport_type:  'f1',
        },
      });
      results.push({ sport: 'f1', league: paddock.name, champion: top[0].user_id, error: error?.message ?? null });
    }
  }
}

async function awardTennisSeasons(supabase, results) {
  const { data: sport } = await supabase.from('sports').select('id').eq('name', 'Tennis').maybeSingle();
  if (!sport?.id) return;

  const { data: allTournaments } = await supabase
    .from('tennis_tournaments')
    .select('id, season_year, tournament_type, status, end_date');
  if (!allTournaments?.length) return;

  const seasonYears = [...new Set(allTournaments.map(t => t.season_year))];

  for (const seasonYear of seasonYears) {
    const seasonTournaments = allTournaments.filter(t => t.season_year === seasonYear);
    const allCompleted = seasonTournaments.every(t => t.status === 'completed');
    if (!allCompleted) continue;

    const anchorTournament = [...seasonTournaments].sort((a, b) => (a.end_date < b.end_date ? 1 : -1))[0];

    const completedStandardCount = seasonTournaments.filter(
      t => t.tournament_type !== 'atp_finals' && t.status === 'completed',
    ).length;

    const { data: boxes } = await supabase
      .from('player_boxes').select('id, name, circle_id').eq('season_year', seasonYear);

    for (const box of (boxes ?? [])) {
      const { data: members } = await supabase
        .from('player_box_members').select('user_id').eq('player_box_id', box.id);
      if (!members?.length) continue;

      const memberIds = members.map(m => m.user_id);
      const { data: scores } = await supabase
        .from('tennis_tournament_scores')
        .select('user_id, tournament_id, total_points')
        .in('user_id', memberIds)
        .in('tournament_id', seasonTournaments.map(t => t.id));

      const scoresByUser = new Map();
      for (const s of (scores ?? [])) {
        if (!scoresByUser.has(s.user_id)) scoresByUser.set(s.user_id, []);
        const tType = seasonTournaments.find(t => t.id === s.tournament_id)?.tournament_type;
        scoresByUser.get(s.user_id).push({ total_points: s.total_points, tournament_type: tType });
      }

      let topUser = null;
      let topTotal = -1;
      let tie = false;
      for (const uid of memberIds) {
        const rows = scoresByUser.get(uid) ?? [];
        if (rows.length === 0) continue;
        let total = rows.reduce((sum, r) => sum + r.total_points, 0);
        if (completedStandardCount >= 5) {
          const standardRows = rows.filter(r => r.tournament_type !== 'atp_finals');
          if (standardRows.length > 0) {
            total -= Math.min(...standardRows.map(r => r.total_points));
          }
        }
        if (total > topTotal) { topTotal = total; topUser = uid; tie = false; }
        else if (total === topTotal) { tie = true; }
      }
      if (!topUser || tie || topTotal <= 0) continue;

      const { error } = await supabase.rpc('award_trophy', {
        p_circle_id:     box.circle_id,
        p_league_id:     box.id,
        p_user_id:       topUser,
        p_sport_id:      sport.id,
        p_tournament_id: anchorTournament.id,
        p_trophy_type:   'season_win',
        p_tier:          'gold',
        p_meta: {
          label:       'Season Champion',
          reason:      `${seasonYear} season — ${topTotal} pts`,
          league_name: box.name,
          sport_type:  'tennis',
        },
      });
      results.push({ sport: 'tennis', league: box.name, champion: topUser, error: error?.message ?? null });
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authErr = await requireServiceRole(req);
  if (authErr) return authErr;

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    );

    const results = [];
    await awardFootballSeasons(supabase, results);
    await awardF1Seasons(supabase, results);
    await awardTennisSeasons(supabase, results);

    return new Response(JSON.stringify({ ok: true, awarded: results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    await logError('award-season-trophies', 'error', String(err));
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
