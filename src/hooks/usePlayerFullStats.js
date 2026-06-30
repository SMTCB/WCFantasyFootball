import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { teamCode } from '../lib/fixtures';

// Maps player_match_stats.breakdown JSONB keys -> display labels.
// All 16 keys are always present in the row; zero values are skipped.
const BREAKDOWN_LABELS = {
  minutes: 'APPEARANCE',
  goals: 'GOALS',
  assists: 'ASSISTS',
  clean_sheet: 'CLEAN SHEET',
  saves: 'SAVES',
  penalty_saved: 'PENALTY SAVED',
  penalty_scored: 'PENALTY SCORED',
  tackles: 'TACKLES',
  interceptions: 'INTERCEPTIONS',
  key_passes: 'KEY PASSES',
  big_chances: 'BIG CHANCES CREATED',
  shots_on_target: 'SHOTS ON TARGET',
  own_goals: 'OWN GOAL',
  yellow_cards: 'YELLOW CARD',
  red_cards: 'RED CARD',
  penalty_missed: 'PENALTY MISSED',
  shootout_scored: 'SHOOTOUT GOAL',
  shootout_missed: 'SHOOTOUT MISS',
  shootout_saved: 'SHOOTOUT SAVE',
};

const NEG_KEYS = new Set(['own_goals', 'yellow_cards', 'red_cards', 'penalty_missed', 'shootout_missed']);

// Converts a GW record's breakdown JSONB + bonus points into display rows.
// gw.totalPts is authoritative — these items are display-only.
export function buildBreakdownItems(gw) {
  const items = [];
  const breakdown = gw?.breakdown || {};
  for (const [key, label] of Object.entries(BREAKDOWN_LABELS)) {
    const pts = breakdown[key];
    if (!pts) continue;
    items.push({ label, pts, kind: NEG_KEYS.has(key) ? 'neg' : 'pos' });
  }
  if (gw?.bonusPts) {
    items.push({ label: 'BONUS POINTS', pts: gw.bonusPts, kind: 'bonus' });
  }
  return items;
}

function buildPosStats(position, season) {
  switch (position) {
    case 'GK':
      return [
        { label: 'CLEAN SHEETS', value: season.cleanSheets },
        { label: 'SAVES', value: season.saves },
        { label: 'PEN SAVES', value: season.penSaves },
        { label: 'CONCEDED', value: season.conceded },
      ];
    case 'DEF':
      return [
        { label: 'CLEAN SHEETS', value: season.cleanSheets },
        { label: 'GOALS', value: season.goals },
        { label: 'ASSISTS', value: season.assists },
        { label: 'TACKLES', value: season.tackles },
      ];
    case 'MID':
      return [
        { label: 'GOALS', value: season.goals },
        { label: 'ASSISTS', value: season.assists },
        { label: 'KEY PASSES', value: season.keyPasses },
        { label: 'CHANCES CREATED', value: season.bigChances },
      ];
    case 'FWD':
    default:
      return [
        { label: 'GOALS', value: season.goals },
        { label: 'ASSISTS', value: season.assists },
        { label: 'SHOTS ON TGT', value: season.shotsOnTarget },
        { label: 'xG', value: season.xgTotal.toFixed(2) },
      ];
  }
}

// Full GW history + season aggregates + position stats for one player.
// player: { id, position, club, nationality }
export function usePlayerFullStats(player) {
  const [gwHistory, setGwHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!player?.id) return;
    let cancelled = false;
    setLoading(true);

    const load = async () => {
      try {
        const { data: stats } = await supabase
          .from('player_match_stats')
          .select('*')
          .eq('player_id', player.id);

        if (cancelled) return;
        if (!stats?.length) {
          setGwHistory([]);
          setLoading(false);
          return;
        }

        const fixtureIds = stats.map(s => s.fixture_id);
        const { data: fixtures } = await supabase
          .from('fixtures')
          .select('id, matchday_id, home_team, away_team, kickoff_at, status')
          .in('id', fixtureIds);

        if (cancelled) return;

        const fixtureById = {};
        for (const f of fixtures || []) fixtureById[f.id] = f;

        const playerTeams = [player.club, player.nationality].filter(Boolean);

        const rows = stats
          .map(s => {
            const f = fixtureById[s.fixture_id];
            if (!f) return null;
            const isHome = playerTeams.includes(f.home_team);
            const isAway = playerTeams.includes(f.away_team);
            const opponent = isHome ? f.away_team : isAway ? f.home_team : null;
            const round = f.matchday_id?.includes('-r') ? f.matchday_id.split('-r')[1] : '';
            return {
              fixtureId: f.id,
              matchdayId: f.matchday_id,
              gw: round ? `R${round}` : '—',
              kickoffAt: f.kickoff_at,
              status: f.status,
              isHome,
              opponent: opponent ? teamCode(opponent) : '—',
              minutes_played: s.minutes_played,
              goals: s.goals,
              assists: s.assists,
              clean_sheet: s.clean_sheet,
              yellow_cards: s.yellow_cards,
              red_cards: s.red_cards,
              own_goals: s.own_goals,
              penalty_missed: s.penalty_missed,
              penalty_scored: s.penalty_scored,
              penalty_saved: s.penalty_saved,
              saves: s.saves,
              tackles_won: s.tackles_won,
              interceptions: s.interceptions,
              key_passes: s.key_passes,
              big_chances_created: s.big_chances_created,
              shots_on_target: s.shots_on_target,
              xg: s.xg,
              xa: s.xa,
              goals_conceded: s.goals_conceded,
              breakdown: s.breakdown,
              bonusPts: Number(s.bonus_points) || 0,
              totalPts: Math.round(Number(s.fantasy_points) || 0),
            };
          })
          .filter(Boolean)
          .sort((a, b) => new Date(b.kickoffAt) - new Date(a.kickoffAt));

        setGwHistory(rows);
      } catch (err) {
        console.error('usePlayerFullStats: failed to load', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [player?.id, player?.club, player?.nationality]);

  const season = {
    apps: gwHistory.filter(r => (r.minutes_played || 0) > 0).length,
    goals: gwHistory.reduce((sum, r) => sum + (r.goals || 0), 0),
    assists: gwHistory.reduce((sum, r) => sum + (r.assists || 0), 0),
    totalPts: gwHistory.reduce((sum, r) => sum + r.totalPts, 0),
    avgPts: gwHistory.length
      ? gwHistory.reduce((sum, r) => sum + r.totalPts, 0) / gwHistory.length
      : 0,
    cleanSheets: gwHistory.reduce((sum, r) => sum + (r.clean_sheet ? 1 : 0), 0),
    tackles: gwHistory.reduce((sum, r) => sum + (r.tackles_won || 0), 0),
    interceptions: gwHistory.reduce((sum, r) => sum + (r.interceptions || 0), 0),
    keyPasses: gwHistory.reduce((sum, r) => sum + (r.key_passes || 0), 0),
    bigChances: gwHistory.reduce((sum, r) => sum + (r.big_chances_created || 0), 0),
    shotsOnTarget: gwHistory.reduce((sum, r) => sum + (r.shots_on_target || 0), 0),
    saves: gwHistory.reduce((sum, r) => sum + (r.saves || 0), 0),
    penSaves: gwHistory.reduce((sum, r) => sum + (r.penalty_saved || 0), 0),
    conceded: gwHistory.reduce((sum, r) => sum + (r.goals_conceded || 0), 0),
    xgTotal: gwHistory.reduce((sum, r) => sum + (Number(r.xg) || 0), 0),
  };

  const posStats = buildPosStats(player?.position, season);

  return { gwHistory, season, posStats, loading };
}
