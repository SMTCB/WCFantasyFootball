// ForzaAdapter — concrete SportDataAdapter for the Forza Football API.
// Also exports forzaFetch, POSITION_MAP, and mapStatus as standalone helpers
// so existing sync functions can import them without adopting the full class.

import type { SportDataAdapter, CanonicalEvent, CanonicalPlayerStat, CanonicalMatchStatus, CanonicalPosition } from './types.ts';

export const FORZA_BASE = 'https://api.forzafootball.com';

export const POSITION_MAP: Record<string, CanonicalPosition> = {
  goalkeeper: 'GK',
  defender:   'DEF',
  midfielder: 'MID',
  attacker:   'FWD',
};

// Map Forza match status to the canonical CanonicalMatchStatus enum.
// Non-enum Forza values: postponed → scheduled; cancelled/abandoned → finished.
// status_detail on the fixture row carries the raw Forza value for audit purposes.
export function mapStatus(forzaStatus: string): CanonicalMatchStatus {
  if (forzaStatus === 'live')                                      return 'live';
  if (forzaStatus === 'after')                                     return 'finished';
  if (forzaStatus === 'cancelled' || forzaStatus === 'abandoned')  return 'finished';
  if (forzaStatus === 'postponed')                                 return 'scheduled';
  return 'scheduled';
}

// Shared HTTP primitive — retry with exponential backoff on 429/5xx.
// Exported so sync functions can replace their inline copies with a single import.
export async function forzaFetch(path: string, retries = 3): Promise<unknown> {
  const token = Deno.env.get('FORZA_ACCESS_TOKEN');
  const url = `${FORZA_BASE}${path}?access_token=${token}`;
  let lastErr: Error | undefined;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (res.status === 204) return null;
      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        lastErr = new Error(`Forza ${path} → HTTP ${res.status}`);
        if (attempt < retries) await new Promise(r => setTimeout(r, attempt * 1_000));
        continue;
      }
      if (!res.ok) throw new Error(`Forza ${path} → HTTP ${res.status}`);
      return res.json();
    } catch (err) {
      lastErr = err as Error;
      if (attempt < retries) await new Promise(r => setTimeout(r, attempt * 1_000));
    }
  }
  throw lastErr;
}

// ── ForzaAdapter ──────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
type ForzaMatch = Record<string, any>;
// deno-lint-ignore no-explicit-any
type ForzaStatEntry = { player_id: unknown; team_id?: unknown; value: unknown; [k: string]: any };

export class ForzaAdapter implements SportDataAdapter {
  readonly provider = 'forza';

  async listEvents(competitionKey: string): Promise<CanonicalEvent[]> {
    const data = await forzaFetch(`/v1/tournaments/${competitionKey}/matches`) as { matches?: ForzaMatch[] } | null;
    const matches: ForzaMatch[] = data?.matches ?? [];
    return matches.map(m => ({
      providerKey:  `f-${m.id}`,
      sport:        'football' as const,
      status:       mapStatus(String(m.status ?? '')),
      homeTeamKey:  m.home_team?.id != null ? String(m.home_team.id) : undefined,
      awayTeamKey:  m.away_team?.id != null ? String(m.away_team.id) : undefined,
      kickoffAt:    m.kickoff_at ?? undefined,
      roundNumber:  m.round ?? null,
    }));
  }

  async getPlayerStats(matchKey: string): Promise<CanonicalPlayerStat[]> {
    const [lineupsRaw, statsRaw] = await Promise.allSettled([
      forzaFetch(`/v1/matches/${matchKey}/lineups`),
      forzaFetch(`/v2/matches/${matchKey}/player_statistics`),
    ]);

    const lineupsData = lineupsRaw.status === 'fulfilled' ? lineupsRaw.value as { lineups?: Record<string, { pitch_players?: { player_id: unknown; position?: string }[]; bench_players?: { player_id: unknown; position?: string }[] }> } | null : null;
    const statsData   = statsRaw.status   === 'fulfilled' ? statsRaw.value   as { player_statistics?: Record<string, ForzaStatEntry[]> } | null : null;

    // Build flat stat map: forza_player_id → { stat: value }
    const statMap: Record<string, Record<string, number>> = {};
    for (const [stat, entries] of Object.entries(statsData?.player_statistics ?? {})) {
      for (const entry of entries ?? []) {
        const pid = String(entry.player_id);
        if (!statMap[pid]) statMap[pid] = {};
        statMap[pid][stat] = Number(entry.value);
      }
    }

    // Build position lookup from lineups (E10 player_statistics omits players with all-zero stats)
    const positionFromLineup: Record<string, string> = {};
    const lineups = lineupsData?.lineups ?? {};
    for (const side of ['home', 'away'] as const) {
      const lineup = lineups[side];
      if (!lineup) continue;
      for (const p of [...(lineup.pitch_players ?? []), ...(lineup.bench_players ?? [])]) {
        if (p.player_id != null && p.position) {
          positionFromLineup[String(p.player_id)] = p.position;
        }
      }
    }

    return Object.entries(statMap).map(([fpid, s]) => {
      const rawPos = positionFromLineup[fpid];
      const pos = (rawPos ? (POSITION_MAP[rawPos] ?? 'MID') : 'MID') as CanonicalPosition;
      return {
        playerKey:         fpid,
        position:          pos,
        minutes:           s.minutes_played          ?? 0,
        goals:             s.goals,
        assists:           s.assists,
        yellowCards:       s.yellow_cards,
        saves:             s.saves,
        shotsOnTarget:     s.shots_on_target,
        tacklesWon:        s.won_tackles,
        interceptions:     s.interceptions,
        keyPasses:         s.key_passes,
        bigChancesCreated: s.big_chances_created,
      };
    });
  }

  async health(): Promise<{ ok: boolean; detail?: string }> {
    try {
      await forzaFetch('/v1/tournaments/429', 1);
      return { ok: true };
    } catch (err) {
      return { ok: false, detail: (err as Error).message };
    }
  }
}
