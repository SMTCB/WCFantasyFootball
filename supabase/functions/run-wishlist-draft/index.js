// Edge Function: run-wishlist-draft
//
// The between-rounds wishlist draft scheduler + runner (migration 294).
// auto-open-transfer-window only *creates* a round's wishlist_draft_windows
// row when the previous round finishes; this function decides when it runs.
//
// Two entry points:
//   1. Cron (every 15 min, ADMIN_TRIGGER_KEY / service role): for every
//      pending round —
//        • run it when due: commissioner pressed "Run now" (trigger manual),
//          auto mode reached scheduled_at (auto), or the kickoff − 8h hard
//          deadline arrived in any mode except disabled (deadline);
//        • expire it if the first kickoff passed without a run;
//        • remind commissioners of a manual round 24h before kickoff;
//        • alert commissioners when a round still has no kickoff date 72h
//          after the previous round ended (no deadline can be computed).
//      Also un-sticks rows left 'running' by a crashed invocation and fills
//      in kickoff times for rounds created before their fixtures synced.
//   2. Direct (commissioner JWT, body { league_id }): "Run draft now" —
//      flags the round via request_wishlist_draft_run (auth + checks live in
//      SQL) and runs it immediately. If this call dies, cron picks the flag
//      up within 15 minutes.
//
// Concurrency: claimWishlistDraft flips scheduled → running for exactly one
// caller; commit_wishlist_draft is atomic and re-validated (see
// _shared/wishlistDraft.ts), so a cron tick racing a manual run is harmless.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { logError } from '../_shared/log.ts';
import { requireServiceRole } from '../_shared/auth.ts';
import { claimWishlistDraft, runClaimedWishlistDraft } from '../_shared/wishlistDraft.ts';

const FN           = 'run-wishlist-draft';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY');

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const HOUR                 = 60 * 60 * 1000;
const STALE_RUNNING_MS     = 10 * 60 * 1000;
const MANUAL_REMINDER_MS   = 24 * HOUR;   // before first kickoff
const KICKOFF_UNKNOWN_MS   = 72 * HOUR;   // after previous round ended

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
};

function respond(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return respond(405, { error: 'POST required' });

  try {
    const body = await req.json().catch(() => ({}));
    if (body?.league_id) return await runNow(req, body.league_id);

    const authErr = await requireServiceRole(req);
    if (authErr) return authErr;
    return respond(200, await sweep());
  } catch (err) {
    await logError(FN, 'critical', err.message, { stack: err.stack });
    return respond(500, { error: err.message });
  }
});

// ── Direct: commissioner "Run draft now" ─────────────────────────────────────

async function runNow(req, leagueId) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return respond(401, { error: 'Unauthorized' });

  // Called as the user so request_wishlist_draft_run's auth.uid() commissioner
  // check applies — the SQL is the single source of truth for who may run it.
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: req_, error: rpcErr } = await userClient.rpc('request_wishlist_draft_run', { p_league_id: leagueId });
  if (rpcErr) return respond(401, { ok: false, error: rpcErr.message });
  if (!req_?.ok) return respond(req_?.code === 'FORBIDDEN' ? 403 : 409, req_ ?? { ok: false });

  const win = await claimWishlistDraft(supabase, req_.window_id, 'manual');
  if (!win) {
    // Someone (cron) claimed it between the flag and here — it's running.
    return respond(200, { ok: true, running_elsewhere: true, round_number: req_.round_number });
  }
  const result = await runClaimedWishlistDraft(supabase, win);
  return respond(result.ok ? 200 : 500, result);
}

// ── Cron sweep ───────────────────────────────────────────────────────────────

async function sweep() {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  // 1. Un-stick rows a crashed invocation left 'running'. Safe: the commit is
  //    all-or-nothing, so a dead run wrote nothing.
  const { data: unstuck } = await supabase
    .from('wishlist_draft_windows')
    .update({ status: 'scheduled', run_token: null, started_at: null })
    .eq('status', 'running')
    .is('processed_at', null)
    .lt('started_at', new Date(now - STALE_RUNNING_MS).toISOString())
    .select('league_id, round_number');
  for (const u of unstuck ?? []) {
    await logError(FN, 'warning', 'reset stale running wishlist draft', { leagueId: u.league_id, round: u.round_number });
  }

  // 2. Kickoff times for rounds created before their fixtures synced.
  const { error: syncErr } = await supabase.rpc('sync_wishlist_draft_kickoffs');
  if (syncErr) await logError(FN, 'error', 'sync_wishlist_draft_kickoffs failed', { error: syncErr.message });

  // 3. Every pending round.
  const { data: pending, error: pendErr } = await supabase
    .from('wishlist_draft_windows')
    .select('id, league_id, round_number, mode, scheduled_at, hard_deadline_at, first_kickoff_at, round_ended_at, created_at, run_requested_at, reminder_sent_at, kickoff_alert_sent_at')
    .eq('status', 'scheduled')
    .is('processed_at', null);
  if (pendErr) throw new Error(`pending windows read failed: ${pendErr.message}`);

  const results = [];
  for (const w of pending ?? []) {
    try {
      results.push(await handleWindow(w, now, nowIso));
    } catch (err) {
      await logError(FN, 'error', 'wishlist scheduler failed for round', { leagueId: w.league_id, round: w.round_number, error: err.message });
      results.push({ leagueId: w.league_id, roundNumber: w.round_number, ok: false, reason: err.message });
    }
  }

  return { ok: true, unstuck: unstuck?.length ?? 0, checked: pending?.length ?? 0, results: results.filter(Boolean) };
}

const ts = (v) => (v ? new Date(v).getTime() : null);

async function handleWindow(w, now, nowIso) {
  const kickoff  = ts(w.first_kickoff_at);
  const deadline = ts(w.hard_deadline_at);

  // Round already started without a draft (disabled rounds end up here too —
  // their market has been open all along, nothing is lost).
  if (kickoff !== null && now >= kickoff) {
    await supabase.from('wishlist_draft_windows').update({ status: 'expired' }).eq('id', w.id).eq('status', 'scheduled');
    if (w.mode !== 'disabled') {
      await logError(FN, 'critical', 'wishlist draft round expired without running', { leagueId: w.league_id, round: w.round_number, mode: w.mode });
    }
    return { leagueId: w.league_id, roundNumber: w.round_number, ok: w.mode === 'disabled', reason: 'expired' };
  }

  if (w.mode === 'disabled') return null;

  let trigger = null;
  if (w.run_requested_at)                                              trigger = 'manual';
  else if (w.mode === 'auto' && w.scheduled_at && ts(w.scheduled_at) <= now) trigger = 'auto';
  else if (deadline !== null && now >= deadline)                       trigger = 'deadline';

  if (trigger) {
    const win = await claimWishlistDraft(supabase, w.id, trigger);
    if (!win) return { leagueId: w.league_id, roundNumber: w.round_number, ok: true, reason: 'claimed elsewhere' };
    return await runClaimedWishlistDraft(supabase, win);
  }

  // Manual round, commissioner hasn't run it yet — one nudge 24h before kickoff.
  if (w.mode === 'manual' && kickoff !== null && !w.reminder_sent_at && now >= kickoff - MANUAL_REMINDER_MS) {
    await notifyCommissioners(w.league_id, 'wishlist_draft_reminder',
      `Round ${w.round_number} wishlist draft not run yet`,
      `Run it from the Commissioner panel — otherwise it runs automatically at ${fmtUtc(w.hard_deadline_at)} UTC (8h before kickoff).`);
    await supabase.from('wishlist_draft_windows').update({ reminder_sent_at: nowIso }).eq('id', w.id);
    return null;
  }

  // No kickoff date means no hard deadline — make sure a human knows.
  if (kickoff === null && !w.kickoff_alert_sent_at) {
    const since = ts(w.round_ended_at) ?? ts(w.created_at);
    if (since !== null && now >= since + KICKOFF_UNKNOWN_MS) {
      await notifyCommissioners(w.league_id, 'wishlist_draft_no_kickoff',
        `Round ${w.round_number}: no kickoff date yet`,
        w.mode === 'auto'
          ? `The wishlist draft runs at ${fmtUtc(w.scheduled_at)} UTC as planned, but the 8h-before-kickoff safety net can't be set until fixtures are published.`
          : 'Fixtures for this round aren\'t published yet, so the 8h-before-kickoff safety net can\'t be set. Run the draft yourself or switch it to Auto.');
      await logError(FN, 'warning', 'wishlist draft round has no kickoff date', { leagueId: w.league_id, round: w.round_number, mode: w.mode });
      await supabase.from('wishlist_draft_windows').update({ kickoff_alert_sent_at: nowIso }).eq('id', w.id);
    }
  }
  return null;
}

async function notifyCommissioners(leagueId, type, title, description) {
  const { data: comms } = await supabase
    .from('league_members')
    .select('user_id')
    .eq('league_id', leagueId)
    .eq('role', 'commissioner');
  if (!comms?.length) return;
  const { error } = await supabase.from('league_notifications').insert(
    comms.map((c) => ({
      league_id: leagueId,
      user_id: c.user_id,
      notification_type: type,
      title,
      description,
      related_entity_type: 'wishlist_draft',
    })),
  );
  if (error) await logError(FN, 'warning', 'commissioner notification insert failed', { leagueId, type, error: error.message });
}

function fmtUtc(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toUTCString().replace(/:\d\d GMT$/, '');
}
