import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireServiceRole } from '../_shared/auth.ts';
import { logError } from '../_shared/log.ts';

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
// Manual fallback: if OpenF1 has no session for a round yet (delayed/
// rescheduled race) or returns fewer than 3 positions, the row is silently
// left untouched and retried on the next tick — the P1/P2/P3 dropdowns on
// F1AdminScreen remain fully manual-entry-capable at all times, same as
// tennis's admin_enter_round_results fallback for cron-miss days.
// ─────────────────────────────────────────────────────────────────────────────

const OPENF1_BASE = 'https://api.openf1.org/v1';
const OPENF1_TIMEOUT_MS = 10000;

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
    if (!res.ok) throw new Error(`OpenF1 ${res.status}: ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRaceSession(year: number, roundNumber: number) {
  const data = await fetchWithTimeout(
    `${OPENF1_BASE}/sessions?year=${year}&session_name=Race&round_number=${roundNumber}`,
  );
  return data?.[0] ?? null;
}

async function fetchTop3(sessionKey: number) {
  const [positions, drivers] = await Promise.all([
    fetchWithTimeout(`${OPENF1_BASE}/position?session_key=${sessionKey}&position<=3`),
    fetchWithTimeout(`${OPENF1_BASE}/drivers?session_key=${sessionKey}`),
  ]);

  const driverMap = new Map<number, string>();
  for (const d of drivers ?? []) {
    driverMap.set(d.driver_number, d.full_name ?? `${d.first_name} ${d.last_name}`);
  }

  const latestByDriver = new Map<number, { position: number; date: string }>();
  for (const p of positions ?? []) {
    const existing = latestByDriver.get(p.driver_number);
    if (!existing || p.date > existing.date) latestByDriver.set(p.driver_number, p);
  }

  return Array.from(latestByDriver.entries())
    .sort((a, b) => a[1].position - b[1].position)
    .slice(0, 3)
    .map(([driverNumber, p]) => ({ name: driverMap.get(driverNumber) ?? String(driverNumber), position: p.position }));
}

async function processRace(supabase: ReturnType<typeof createClient>, race: F1Race) {
  const session = await fetchRaceSession(race.season, race.round_number);
  if (!session?.session_key) {
    return { race: race.gp_name, round: race.round_number, status: 'NO_SESSION_YET' };
  }

  const top3 = await fetchTop3(session.session_key);
  if (top3.length < 3) {
    return { race: race.gp_name, round: race.round_number, status: 'RESULT_INCOMPLETE' };
  }

  const { error } = await supabase.from('f1_races').update({
    result_p1: top3[0].name,
    result_p2: top3[1].name,
    result_p3: top3[2].name,
    status: 'finished',
  }).eq('id', race.id);
  if (error) throw new Error(`Update failed for race ${race.id}: ${error.message}`);

  return { race: race.gp_name, round: race.round_number, status: 'FILLED', p1: top3[0].name, p2: top3[1].name, p3: top3[2].name };
}

Deno.serve(async (req) => {
  const authErr = await requireServiceRole(req);
  if (authErr) return authErr;

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Candidates: race already happened (2h buffer for on-track + podium/
    // steward delay) but no result filled in yet. Bounded to the last 14
    // days so a permanently-unfillable historical race (cancelled event,
    // OpenF1 gap) doesn't get retried forever — falls back to manual entry
    // on F1AdminScreen past that window.
    const { data: races, error: raceErr } = await supabase
      .from('f1_races')
      .select('id, season, round_number, gp_name, race_at')
      .is('result_p1', null)
      .not('race_at', 'is', null)
      .lt('race_at', new Date(Date.now() - 2 * 3600_000).toISOString())
      .gt('race_at', new Date(Date.now() - 14 * 24 * 3600_000).toISOString());
    if (raceErr) throw raceErr;

    if (!races || races.length === 0) {
      return new Response(JSON.stringify({ ok: true, races_checked: 0, results: [] }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    const results = [];
    for (const race of races as F1Race[]) {
      try {
        results.push(await processRace(supabase, race));
      } catch (err) {
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
