// Canonical sport-data types — provider-agnostic interface for all data adapters.
// Concrete implementations: ForzaAdapter (football), ManualAdapter (tennis/manual),
// OptaAdapter (stub for B2B acquisition target).

export type CanonicalMatchStatus = 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled';

export interface CanonicalEvent {
  providerKey: string;
  sport: 'football' | 'f1' | 'tennis';
  status: CanonicalMatchStatus;
  homeTeamKey?: string;
  awayTeamKey?: string;
  kickoffAt?: string;
  roundNumber?: number | null;
}

export type CanonicalPosition = 'GK' | 'DEF' | 'MID' | 'FWD';

export interface CanonicalPlayerStat {
  playerKey: string;
  position: CanonicalPosition;
  minutes: number;
  goals?: number;
  assists?: number;
  yellowCards?: number;
  saves?: number;
  shotsOnTarget?: number;
  tacklesWon?: number;
  interceptions?: number;
  keyPasses?: number;
  bigChancesCreated?: number;
  goalsConceeded?: number;
  cleanSheet?: boolean;
  redCards?: number;
  penaltyMissed?: number;
  penaltyScored?: number;
  ownGoals?: number;
}

export interface SportDataAdapter {
  readonly provider: string;
  listEvents(competitionKey: string): Promise<CanonicalEvent[]>;
  getPlayerStats(matchKey: string): Promise<CanonicalPlayerStat[]>;
  health(): Promise<{ ok: boolean; detail?: string }>;
}
