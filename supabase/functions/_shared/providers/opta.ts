// OptaAdapter — stub for future Opta Sports integration (B2B acquisition target).
// health() returns false until API credentials and endpoint mapping are agreed
// post-acquisition. listEvents / getPlayerStats throw to make the gap visible.

import type { SportDataAdapter, CanonicalEvent, CanonicalPlayerStat } from './types.ts';

export class OptaAdapter implements SportDataAdapter {
  readonly provider = 'opta';

  // deno-lint-ignore require-await
  async listEvents(_competitionKey: string): Promise<CanonicalEvent[]> {
    throw new Error('OptaAdapter.listEvents: not implemented — awaiting API credentials');
  }

  // deno-lint-ignore require-await
  async getPlayerStats(_matchKey: string): Promise<CanonicalPlayerStat[]> {
    throw new Error('OptaAdapter.getPlayerStats: not implemented — awaiting API credentials');
  }

  // deno-lint-ignore require-await
  async health(): Promise<{ ok: boolean; detail?: string }> {
    return { ok: false, detail: 'Opta integration pending — no credentials configured' };
  }
}
