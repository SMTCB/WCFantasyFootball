// Edge Function: auto-open-transfer-window
// Automatically opens transfer windows when a matchday ends
//
// Logic:
//  1. Find all active leagues
//  2. For each league, identify the latest completed matchday
//  3. If next matchday's window doesn't exist, create it (48h, 5 transfers)
//
// POST body: {} (no parameters needed)
// Returns:   { ok: true, created: N }
//
// Run via cron: every 1-2 hours

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { logError } from '../_shared/log.ts';

const FN      = 'auto-open-transfer-window';
const supabase = createClient(
  Deno.env.get('SUPABASE_URL'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
);

function respond(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return respond(405, { error: 'POST required' });

  try {
    // ── 1. Get all active leagues ────────────────────────────────────────────
    // leagues has no 'status' column — filter by is_dry_run=false to skip test leagues
    const { data: leagues } = await supabase
      .from('leagues')
      .select('id, tournament_id')
      .eq('is_dry_run', false);

    if (!leagues?.length) {
      return respond(200, { ok: true, created: 0, note: 'No active leagues' });
    }

    let created = 0;

    // ── 2. For each league, check if we need to open a new window ───────────
    for (const league of leagues) {
      try {
        // Find the highest round_number from finished fixtures in this league
        const { data: finishedFixtures } = await supabase
          .from('fixtures')
          .select('round_number')
          .eq('status', 'finished')
          .eq('tournament_id', league.tournament_id)
          .order('round_number', { ascending: false })
          .limit(1);

        if (!finishedFixtures?.length) {
          // No finished fixtures yet, skip
          continue;
        }

        const lastFinishedRound = finishedFixtures[0].round_number;
        const nextRound = lastFinishedRound + 1;

        // Check if a window already exists for the next round
        const { data: existingWindow } = await supabase
          .from('transfer_windows')
          .select('id')
          .eq('league_id', league.id)
          .eq('round_number', nextRound)
          .maybeSingle();

        if (existingWindow) {
          // Window already exists, skip
          continue;
        }

        // ── 3. Create new transfer window for next round ────────────────────
        const now = new Date();
        const opens_at = now.toISOString();

        // Close 1h before the next round's first kickoff (fallback: now + 48h).
        // Capped so the window never stays open into a live matchday.
        const { data: nextKickoff } = await supabase
          .from('fixtures')
          .select('kickoff_at')
          .eq('tournament_id', league.tournament_id)
          .eq('round_number', nextRound)
          .order('kickoff_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        const fortyEightH = new Date(now.getTime() + 48 * 60 * 60 * 1000);
        let closes_at;
        if (nextKickoff?.kickoff_at) {
          const oneHourBefore = new Date(new Date(nextKickoff.kickoff_at).getTime() - 60 * 60 * 1000);
          closes_at = (oneHourBefore < fortyEightH ? oneHourBefore : fortyEightH).toISOString();
        } else {
          closes_at = fortyEightH.toISOString();
        }

        // Idempotent: the UNIQUE (league_id, round_number) constraint (migration 26)
        // means a second run creates nothing if the window already exists.
        const { error: insertErr } = await supabase
          .from('transfer_windows')
          .upsert(
            {
              league_id: league.id,
              round_number: nextRound,
              opens_at,
              closes_at,
              window_type: 'standard',
              transfers_remaining: 5,
            },
            { onConflict: 'league_id,round_number', ignoreDuplicates: true }
          );

        if (insertErr) {
          console.error(`Failed to create window for league ${league.id}:`, insertErr.message);
          continue;
        }

        console.log(
          `Created transfer window for league ${league.id}, round ${nextRound} (closes at ${closes_at})`
        );
        created++;

      } catch (err) {
        console.error(`Error processing league ${league.id}:`, err.message);
      }
    }

    return respond(200, { ok: true, created });

  } catch (err) {
    await logError(FN, 'error', err.message, { stack: err.stack });
    return respond(500, { error: err.message });
  }
});
