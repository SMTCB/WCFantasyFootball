import { Hono } from 'hono'
import { createClient } from '@supabase/supabase-js'

const app = new Hono()

const getSupabase = (env) => createClient(
  env.SUPABASE_URL, 
  env.SUPABASE_SERVICE_ROLE_KEY // Admin key to bypass RLS
)

app.get('/', (c) => c.text('FantasyKit API v1 - Status: Operational'))

/**
 * SYNC MATCHES & PLAYERS
 * league=1 (World Cup), season=2026
 */
app.post('/sync/kickoff', async (c) => {
  const supabase = getSupabase(c.env)
  const apiKey = c.env.API_FOOTBALL_KEY

  try {
    const response = await fetch('https://v3.football.api-sports.io/fixtures?league=1&season=2026', {
      headers: {
        'x-rapidapi-key': apiKey,
        'x-rapidapi-host': 'v3.football.api-sports.io'
      }
    });

    const body = await response.json();
    const fixtures = body.response;

    const fixturesToUpsert = fixtures.map(f => ({
      id: String(f.fixture.id),
      home_team: f.teams.home.name,
      away_team: f.teams.away.name,
      kickoff_at: f.fixture.date,
      competition: 'World Cup 2026',
      status: f.fixture.status.short === 'FT' ? 'finished' : (f.fixture.status.short === '1H' || f.fixture.status.short === '2H' ? 'live' : 'scheduled'),
      minute: String(f.fixture.status.elapsed || '')
    }));

    const { error } = await supabase.from('fixtures').upsert(fixturesToUpsert);
    if (error) throw error;

    return c.json({ success: true, count: fixturesToUpsert.length });
  } catch (err) {
    return c.json({ success: false, error: err.message }, 500);
  }
})

/**
 * PROCESS SCORING EVENTS
 * Fetches events for live matches and calculates points.
 */
app.post('/sync/calculate-points', async (c) => {
  const supabase = getSupabase(c.env)

  // 1. Get all match events that haven't been processed for points yet
  // For PoC, we will just fetch all events and recalculate
  const { data: events } = await supabase.from('match_events').select('*, players(position)');
  
  // 2. Map events to player points
  const playerPoints = {};

  events.forEach(event => {
    const pid = event.player_id;
    if (!playerPoints[pid]) playerPoints[pid] = 0;

    const pos = event.players?.position || 'MF';

    // SCORING RULES
    if (event.type === 'goal') {
      playerPoints[pid] += (pos === 'FWD' || pos === 'MID') ? 5 : 6;
    } else if (event.type === 'yellow') {
      playerPoints[pid] -= 1;
    } else if (event.type === 'red') {
      playerPoints[pid] -= 3;
    }
    // Note: Assists and minutes played require more detailed event/fixture data
  });

  // 3. Upsert into fantasy_points
  for (const [playerId, points] of Object.entries(playerPoints)) {
     // Find squads containing this player
     const { data: affectedSquads } = await supabase
       .from('squads')
       .select('id, user_id, captain_id')
       .contains('players', [playerId]);

     if (affectedSquads) {
       for (const squad of affectedSquads) {
         let finalPoints = points;
         if (squad.captain_id === playerId) finalPoints *= 2; // Captain Multiplier

         await supabase.from('fantasy_points').upsert({
           squad_id: squad.id,
           player_id: playerId,
           total: finalPoints
         });
       }
     }
  }

  // 4. Update League Member totals
  // Simplified for PoC: Recalculate everything
  const { data: members } = await supabase.from('league_members').select('user_id, league_id');
  for (const member of members) {
    const { data: squadPoints } = await supabase
      .from('fantasy_points')
      .select('total')
      .eq('squad_id', (await supabase.from('squads').select('id').eq('user_id', member.user_id).single()).data?.id);
    
    const total = squadPoints?.reduce((acc, curr) => acc + curr.total, 0) || 0;
    
    await supabase.from('league_members')
      .update({ total_points: total })
      .match({ user_id: member.user_id, league_id: member.league_id });
  }

  return c.json({ success: true });
})

app.post('/sync/events', async (c) => {
  const supabase = getSupabase(c.env)
  const apiKey = c.env.API_FOOTBALL_KEY

  // 1. Find live fixtures
  const { data: liveFixtures } = await supabase
    .from('fixtures')
    .select('id')
    .eq('status', 'live');

  if (!liveFixtures || liveFixtures.length === 0) {
    return c.json({ message: 'No live matches' });
  }

  for (const match of liveFixtures) {
    // 2. Fetch events for this match
    const response = await fetch(`https://v3.football.api-sports.io/fixtures/events?fixture=${match.id}`, {
      headers: { 'x-rapidapi-key': apiKey }
    });
    const { response: events } = await response.json();

    // 3. Transform to our match_events table
    const eventsToUpsert = events.map(e => ({
      fixture_id: match.id,
      type: mapEventType(e.type),
      player_id: String(e.player.id),
      minute: String(e.time.elapsed),
      team: e.team.name
    }));

    await supabase.from('match_events').upsert(eventsToUpsert);
    
    // 4. Trigger points calculation for affected squads
    // (This would be an internal function call)
  }

  return c.json({ success: true });
})

function mapEventType(apiType) {
  const map = {
    'Goal': 'goal',
    'Card': 'yellow', // simplified
    'subst': 'sub',
    'Var': 'var'
  };
  return map[apiType] || 'goal';
}

export default app
