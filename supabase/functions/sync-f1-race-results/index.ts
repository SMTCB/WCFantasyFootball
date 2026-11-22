import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireServiceRole } from '../_shared/auth.ts';
import { logError } from '../_shared/log.ts';
import { pickRaceSession, toPickName, finalTop3 } from './openf1-logic.js';

// ─────────────────────────────────────────────────────────────────────────────
// sync-f1-race-results — Cron-only. Replaces F1AdminScreen's "⚡ FETCH FROM
// OPENF1" button (client-side call to src/lib/f1/openf1.js, one click per
// race weekend) with an automatic fill of the podium (P1/P2/P3) as soon as
// OpenF1 has a result for that round.
//
// OpenF1 (api.openf1.org) is a free, unauthenticated public API — no
// RapidAPI-style budget concern here (contrast sync-tennis-results, gated to
// 3x/day to stay inside a 50 req/day quota). This runs every 30 minutes
// (see migration for the cron) and only does real work when there's a race
// whose scheduled start has passed and which hasn't been filled yet — an
// empty candidate set costs one cheap DB query, no OpenF1 call at all.
//
// Scope: only fills result_p1/p2/p3 and flips status to 'finished', mirroring
// exactly what F1AdminScreen's saveRaceResult() does for those 3 fields.
// DNF drivers, team-most-points, and the special-category answer are NOT
// derivable from OpenF1's position endpoint and stay 100% manual — the admin
// still opens F1AdminScreen, fills those three fields (P1/P2/P3 now already
// populated), and clicks SAVE RESULT then SCORE RACE. This cron does not
// score anything and does not set is_scored.
//
// Manual fallback: if OpenF1 has no session for a race yet (delayed/
// rescheduled race), returns fewer than 3 positions, is closed while a session
// is live, or names a driver who is not on the pick list, the row is left
// untouched and retried on the next tick — the P1/P2/P3 dropdowns on
// F1AdminScreen remain fully manual-entry-capable at all times, same as
// tennis's admin_enter_round_results fallback for cron-miss days.
//
// F1-SYNC-1 (2026-11-22): OpenF1 sessions have no round number, so the old
// `round_number=` filter got a 404 on every run and nothing ever filled. The
// race is now found by date and the drivers are mapped to the pick spelling
// (openf1-logic.js). A one-off catch-up can pass {"days": N} in the body to
// look further back than the default 14 days.
// ─────────────────────────────────────────────────────────────────────────────

const OPENF1_BASE = 'https://api.openf1.org/v1';
const OPENF1_TIMEOUT_MS = 10000;
const DEFAULT_LOOKBACK_DAYS = 14;
const MAX_LOOKBACK_DAYS = 365;

// OpenF1 answers 401 to callers without a paid key while any F1 session is
// live, and 404 when a filter matches nothing.
class OpenF1Status extends Error {
  status: number;
  constructor(status: number, url: string) {
    super(`OpenF1 ${status}: ${url}`);
    this.status = status;
  }
}

interface F1Race {
  id: string;
  season: number;
  round_number: number;
  gp_name: string;
  race_at: string | null;
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENF1_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (res.status === 404) return [];
    if (!res.ok) throw new OpenF1Status(res.status, url);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRaceSessions(year: number) {
  return await fetchWithTimeout(`${OPENF1_BASE}/sessions?year=${year}&session_name=Race`);
}

async function processRace(
  supabase: ReturnType<typeof createClient>,
  race: F1Race,
  sessionsByYear: Map<number, unknown[]>,
) {
  const tag = { race: race.gp_name, round: race.round_number };
  if (!sessionsByYear.has(race.season)) {
    sessionsByYear.set(race.season, await fetchRaceSessions(race.season));
  }
  const session = pickRaceSession(sessionsByYear.get(race.season), race.race_at);
  if (!session) return { ...tag, status: 'NO_SESSION_YET' };

  // Unfiltered on purpose: see finalTop3.
  const [positions, drivers] = await Promise.all([
    fetchWithTimeout(`${OPENF1_BASE}/position?session_key=${session.session_key}`),
    fetchWithTimeout(`${OPENF1_BASE}/drivers?session_key=${session.session_key}`),
  ]);
  const top3 = finalTop3(positions);
  if (top3.length < 3) return { ...tag, status: 'RESULT_INCOMPLETE' };

  const byNumber = new Map((drivers ?? []).map((d: { driver_number: number }) => [d.driver_number, d]));
  const names = top3.map(n => toPickName(byNumber.get(n)));
  const unmatched = top3.filter((_, i) => !names[i]);
  if (unmatched.length) {
    return { ...tag, status: 'NAME_UNMATCHED', detail: `driver number(s) ${unmatched.join(', ')} not on the pick list` };
  }

  const { error } = await supabase.from('f1_races').update({
    result_p1: names[0],
    result_p2: names[1],
    result_p3: names[2],
    status: 'finished',
  }).eq('id', race.id).is('result_p1', null);
  if (error) throw new Error(`Update failed for race ${race.id}: ${error.message}`);

  return { ...tag, status: 'FILLED', p1: names[0], p2: names[1], p3: names[2] };
}

Deno.serve(async (req) => {
  const authErr = await requireServiceRole(req);
  if (authErr) return authErr;

  try {
    const body = await req.json().catch(() => ({}));
    const days = Math.min(Math.max(Number(body?.days) || DEFAULT_LOOKBACK_DAYS, 1), MAX_LOOKBACK_DAYS);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Candidates: race already happened (2h buffer for on-track + podium/
    // steward delay) but no result filled in yet. Bounded to the last 14
    // days (or body.days) so a permanently-unfillable historical race (cancelled event,
    // OpenF1 gap) doesn't get retried forever — falls back to manual entry
    // on F1AdminScreen past that window.
    const { data: races, error: raceErr } = await supabase
      .from('f1_races')
      .select('id, season, round_number, gp_name, race_at')
      .is('result_p1', null)
      .not('race_at', 'is', null)
      .lt('race_at', new Date(Date.now() - 2 * 3600_000).toISOString())
      .gt('race_at', new Date(Date.now() - days * 24 * 3600_000).toISOString())
      .order('race_at');
    if (raceErr) throw raceErr;

    if (!races || races.length === 0) {
      return new Response(JSON.stringify({ ok: true, races_checked: 0, results: [] }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    const results = [];
    const sessionsByYear = new Map<number, unknown[]>();
    for (const race of races as F1Race[]) {
      try {
        results.push(await processRace(supabase, race, sessionsByYear));
      } catch (err) {
        if (err instanceof OpenF1Status && err.status === 401) {
          // A session is live; every further call would get the same answer.
          results.push({ race: race.gp_name, round: race.round_number, status: 'OPENF1_LIVE_LOCK' });
          break;
        }
        console.error(`[sync-f1-race-results] ${race.gp_name} failed:`, err);
        results.push({ race: race.gp_name, round: race.round_number, status: 'ERROR', detail: String(err) });
      }
    }

    console.log('[sync-f1-race-results] Done:', JSON.stringify(results));

    return new Response(JSON.stringify({ ok: true, races_checked: results.length, results }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    await logError('sync-f1-race-results', 'error', String(err));
    return new Response(JSON.stringify({ error: 'INTERNAL_ERROR', detail: String(err) }), { status: 500 });
  }
});
