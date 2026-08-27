// scoring-logic.ts — pure, dependency-free tennis tournament scoring extracted
// from score-tennis-tournament/index.ts. No DB/network calls; safe to
// unit-test directly with Node's test runner and to import unchanged from
// the Deno function.

export const TIER_PTS: Record<number, number> = { 1: 2, 2: 3, 3: 4, 4: 6 };
export const DEEP_ROUNDS = new Set(['sf', 'runner_up', 'champion']);
export const EARLY_EXIT  = new Set(['r128', 'r64']); // T1 early exit triggers safety_net

export interface PlayerRow {
  id: string;
  tier: number;
  rounds_won: number;
  round_reached: string | null;
  player_name: string;
}

export interface RosterRow {
  user_id: string;
  tier1_player_id:  string | null;
  tier2a_player_id: string | null;
  tier2b_player_id: string | null;
  tier3a_player_id: string | null;
  tier3b_player_id: string | null;
  tier4a_player_id: string | null;
  tier4b_player_id: string | null;
  ace_card_type: string | null;
}

export function rosterPlayerIds(r: RosterRow): (string | null)[] {
  return [
    r.tier1_player_id,
    r.tier2a_player_id, r.tier2b_player_id,
    r.tier3a_player_id, r.tier3b_player_id,
    r.tier4a_player_id, r.tier4b_player_id,
  ];
}

export function scorePlayer(player: PlayerRow, aceCard: string | null, isT4DarkHorse: boolean): number {
  const basePts = TIER_PTS[player.tier] ?? 3;
  let pts = player.rounds_won * basePts;

  // dark_horse_insurance: T4 players get floor of 6 pts even if 0 wins
  if (aceCard === 'dark_horse_insurance' && isT4DarkHorse && pts === 0) {
    pts = 6;
  }

  return pts;
}

export interface ScoreRosterResult {
  basePts: number;
  captainBonus: number;
  aceBonus: number;
  total: number;
  breakdown: Record<string, unknown>;
}

export function scoreRoster(
  roster: RosterRow,
  playerMap: Map<string, PlayerRow>,
  captainId: string | null,
): ScoreRosterResult {
  const { ace_card_type } = roster;
  const breakdown: Record<string, unknown> = { players: [] };

  let basePts = 0;
  let captainBonus = 0;
  let aceBonus = 0;

  const allPids = rosterPlayerIds(roster).filter(Boolean) as string[];
  const t4Pids = new Set([roster.tier4a_player_id, roster.tier4b_player_id].filter(Boolean) as string[]);

  // Score each player slot
  for (const pid of allPids) {
    const player = playerMap.get(pid);
    if (!player) continue;

    const isT4 = t4Pids.has(pid);
    const pts = scorePlayer(player, ace_card_type, isT4);
    basePts += pts;

    // QF captain: add equal bonus (×2 total = base + bonus)
    if (pid === captainId) {
      captainBonus += pts;
    }

    (breakdown.players as unknown[]).push({
      player_id: pid,
      player_name: player.player_name,
      tier: player.tier,
      rounds_won: player.rounds_won,
      round_reached: player.round_reached,
      base_pts: pts,
      is_captain: pid === captainId,
    });
  }

  // ── Ace card bonuses ───────────────────────────────────────────────────
  if (ace_card_type) {
    const myPlayers = allPids.map(pid => playerMap.get(pid)).filter(Boolean) as PlayerRow[];

    if (ace_card_type === 'underdog_boost') {
      // +15 if any T3/T4 player reached SF or better
      const hasDeepRun = myPlayers.some(p =>
        (p.tier === 3 || p.tier === 4) && p.round_reached && DEEP_ROUNDS.has(p.round_reached),
      );
      if (hasDeepRun) aceBonus = 15;

    } else if (ace_card_type === 'safety_net') {
      // +8 if T1 player exited in R1 or R2
      const t1Player = playerMap.get(roster.tier1_player_id ?? '');
      if (t1Player && t1Player.round_reached && EARLY_EXIT.has(t1Player.round_reached)) {
        aceBonus = 8;
      }

    } else if (ace_card_type === 'surface_specialist') {
      // +12 proxy: captain reached SF or better
      if (captainId) {
        const cap = playerMap.get(captainId);
        if (cap && cap.round_reached && DEEP_ROUNDS.has(cap.round_reached)) {
          aceBonus = 12;
        }
      }
    }
    // dark_horse_insurance: already applied per-player in scorePlayer()
  }

  const total = basePts + captainBonus + aceBonus;

  breakdown.ace_card_type    = ace_card_type;
  breakdown.ace_card_bonus   = aceBonus;
  breakdown.captain_player_id = captainId;
  breakdown.captain_bonus    = captainBonus;

  return { basePts, captainBonus, aceBonus, total, breakdown };
}
