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
import { processLeagueWishlistDraft } from '../_shared/wishlistDraft.ts';

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
    // leagues has no 'status' column — filter by is_dry_run=false to skip test
    // leagues, and archived=false so a finished tournament's leagues don't get
    // swept into opening a phantom next-round window once nothing further is
    // ever going to finish for them (this function has no other signal for
    // "this tournament is over").
    const { data: leagues } = await supabase
      .from('leagues')
      .select('id, tournament_id')
      .eq('is_dry_run', false)
      .eq('archived', false);

    if (!leagues?.length) {
      return respond(200, { ok: true, created: 0, note: 'No active leagues' });
    }

    let created = 0;

    // ── 2. For each league, check if we need to open a new window ───────────
    for (const league of leagues) {
      try {
        // A round only counts as "finished" once EVERY fixture in it is
        // finished — not just the highest round_number with any finished
        // fixture. The old query used the latter, which opened next-round
        // windows the moment a handful of a round's games wrapped up.
        const { data: allFixtures } = await supabase
          .from('fixtures')
          .select('round_number, status')
          .eq('tournament_id', league.tournament_id);

        if (!allFixtures?.length) {
          continue;
        }

        const roundsByNumber = new Map();
        for (const f of allFixtures) {
          const r = roundsByNumber.get(f.round_number) ?? { total: 0, finished: 0 };
          r.total++;
          if (f.status === 'finished') r.finished++;
          roundsByNumber.set(f.round_number, r);
        }

        let lastFinishedRound = null;
        for (const [roundNum, counts] of roundsByNumber) {
          if (counts.finished === counts.total && (lastFinishedRound === null || roundNum > lastFinishedRound)) {
            lastFinishedRound = roundNum;
          }
        }

        if (lastFinishedRound === null) {
          // No round is fully finished yet, skip
          continue;
        }

        const nextRound = lastFinishedRound + 1;

        // Don't open a window for a round with no scheduled fixtures at all —
        // guards against dormant/short tournaments (fewer rounds than the
        // highest finished round + 1) producing a phantom window.
        if (!roundsByNumber.has(nextRound)) {
          continue;
        }

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

        // Resolve any opted-in wishlist draft submissions for this round before
        // the market opens to everyone else — this is what removes the
        // "whoever's online first" timezone bias for draft-mode leagues.
        // No-ops fast for non-draft leagues and rounds with zero participants.
        // A failure here must never block the window from opening for
        // everyone else, so it's isolated in its own try/catch.
        try {
          await processLeagueWishlistDraft(supabase, league.id, nextRound);
        } catch (err) {
          await logError(FN, 'error', 'wishlist draft pre-step failed', { leagueId: league.id, round: nextRound, error: err.message });
        }

        // ── 3. Create new transfer window for next round ────────────────────
        const now = new Date();
        const opens_at = now.toISOString();

        // Close 1h before the next round's first kickoff, however far off that
        // is — a competition with short weekly-ish gaps (EPL, World Cup) ends
        // up with a shortish window this way; one with long gaps between
        // rounds (e.g. UCL league-phase, ~monthly) stays open for the whole
        // gap instead of being cut short by an arbitrary cap. 48h is only a
        // fallback for the rare case where we have no next-round kickoff data
        // at all (e.g. that round's fixtures haven't been synced yet) — it
        // must never stay open indefinitely in that case.
        const { data: nextKickoff } = await supabase
          .from('fixtures')
          .select('kickoff_at')
          .eq('tournament_id', league.tournament_id)
          .eq('round_number', nextRound)
          .order('kickoff_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        let closes_at;
        if (nextKickoff?.kickoff_at) {
          closes_at = new Date(new Date(nextKickoff.kickoff_at).getTime() - 60 * 60 * 1000).toISOString();
        } else {
          closes_at = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
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
              // NULL, not a fixed count: the real free-transfer allowance/penalty
              // system lives in league_config.transfers_per_round + squads.round_transfers
              // (computed client-side in MarketScreen). transfers_remaining is only
              // enforced for legacy non-tournament leagues via enforce_transfer_window()
              // on the `transfers` table; tournament leagues (which this function serves)
              // never touch that path, so a fixed 5 here was always a display-only lie —
              // NULL makes the banner correctly show the real allowance instead.
              transfers_remaining: null,
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
