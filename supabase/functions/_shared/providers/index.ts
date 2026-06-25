// Provider registry — single import point for all sport-data adapters.

import type { SportDataAdapter } from './types.ts';
import { ForzaAdapter } from './forza.ts';
import { ManualAdapter } from './manual.ts';
import { OptaAdapter } from './opta.ts';

export type { SportDataAdapter, CanonicalEvent, CanonicalPlayerStat, CanonicalMatchStatus, CanonicalPosition } from './types.ts';
export { forzaFetch, mapStatus, POSITION_MAP, ForzaAdapter } from './forza.ts';
export { ManualAdapter } from './manual.ts';
export { OptaAdapter } from './opta.ts';

const ADAPTERS: Record<string, () => SportDataAdapter> = {
  forza:  () => new ForzaAdapter(),
  manual: () => new ManualAdapter(),
  opta:   () => new OptaAdapter(),
};

export function getAdapter(provider: string): SportDataAdapter {
  const make = ADAPTERS[provider];
  if (!make) throw new Error(`No adapter for provider: ${provider}`);
  return make();
}
