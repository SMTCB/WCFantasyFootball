import { useLocation } from 'react-router-dom';

/**
 * Derives { sport, competitionId } from the current route.
 * sport is always route-derived — never from a global state variable.
 * No context imports here (avoids Rolldown TDZ since AppLayout also
 * imports react-router-dom at depth 1, but package deps are split chunks).
 */
export function useActiveCompetition() {
  const { pathname } = useLocation();

  const leagueMatch  = pathname.match(/^\/league\/([^/]+)/);
  const f1Match      = pathname.match(/^\/f1\/([^/]+)/);
  const tennisMatch  = pathname.match(/^\/tennis\/tournament\/([^/]+)/);

  if (leagueMatch) return { sport: 'football', competitionId: leagueMatch[1] };
  if (f1Match)     return { sport: 'f1',       competitionId: f1Match[1] };
  if (tennisMatch) return { sport: 'tennis',   competitionId: tennisMatch[1] };

  if (pathname.startsWith('/f1'))     return { sport: 'f1',       competitionId: null };
  if (pathname.startsWith('/tennis')) return { sport: 'tennis',   competitionId: null };

  const FOOTBALL_PATHS = ['/live', '/squad', '/league', '/market', '/recap'];
  if (FOOTBALL_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    return { sport: 'football', competitionId: null };
  }

  return { sport: null, competitionId: null };
}
