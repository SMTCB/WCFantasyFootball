// ManualAdapter — adapter for sports where data is entered directly into the DB
// (e.g. tennis, F1 admin scoring). No external API is polled.
// listEvents / getPlayerStats are intentional no-ops — data already lives in the DB.

import type { SportDataAdapter, CanonicalEvent, CanonicalPlayerStat } from './types.ts';

export class ManualAdapter implements SportDataAdapter {
  readonly provider = 'manual';

  // deno-lint-ignore require-await
  async listEvents(_competitionKey: string): Promise<CanonicalEvent[]> {
    return [];
  }

  // deno-lint-ignore require-await
  async getPlayerStats(_matchKey: string): Promise<CanonicalPlayerStat[]> {
    return [];
  }

  // deno-lint-ignore require-await
  async health(): Promise<{ ok: boolean; detail?: string }> {
    return { ok: true, detail: 'manual provider — no external dependency' };
  }
}
