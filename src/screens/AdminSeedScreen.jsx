import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { fixtures as mockFixtures } from '../data/fixtures';
import { squad as mockSquad } from '../data/squad';


export default function AdminSeedScreen() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  const seedData = async () => {
    try {
      setLoading(true);
      setStatus('Seeding players...');
      
      // 1. Seed Players
      const playersToInsert = mockSquad.players.map(p => ({
        id: p.id,
        name: p.name,
        position: p.position,
        club: p.club,
        price: p.price,
      }));
      
      const { error: pErr } = await supabase.from('players').upsert(playersToInsert);
      if (pErr) throw pErr;

      setStatus('Seeding fixtures...');
      // 2. Seed Fixtures
      const fixturesToInsert = mockFixtures.map(f => ({
        id: f.id,
        home_team: f.homeTeam.name,
        away_team: f.awayTeam.name,
        kickoff_at: new Date().toISOString(),
        competition: f.competition,
        status: f.status === 'LIVE' ? 'live' : (f.status === 'FT' ? 'finished' : 'scheduled'),
        minute: f.minute || null
      }));

      const { error: fErr } = await supabase.from('fixtures').upsert(fixturesToInsert);
      if (fErr) throw fErr;

      setStatus('Creating default league...');
      // 3. Create a default league
      const userId = '00000000-0000-0000-0000-000000000000';
      const { data: newLeague, error: lErr } = await supabase
        .from('leagues')
        .insert({
          name: 'World Cup Official',
          format: 'classic',
          created_by: userId
        })
        .select()
        .single();
      
      if (lErr && lErr.code !== '23505') throw lErr; // ignore if league exists

      setStatus('Adding you to league...');
      const leagueId = newLeague?.id || (await supabase.from('leagues').select('id').eq('name', 'World Cup Official').single()).data.id;
      
      await supabase.from('league_members').upsert({
        league_id: leagueId,
        user_id: userId,
        rank: 3,
        total_points: 42
      });

      setStatus('Creating your squad...');
      // 4. Create default squad
      const { error: sErr } = await supabase.from('squads').upsert({
        league_id: leagueId,
        user_id: userId,
        matchday_id: 'md1',
        players: mockSquad.players.map(p => p.id),
        captain_id: mockSquad.captainId,
        locked_at: new Date(Date.now() + 1000 * 60 * 60 * 2).toISOString()
      });

      if (sErr) throw sErr;

      setStatus('Spawning dummy rivals...');
      // 5. Create 3 Dummy Managers to populate the leaderboard
      const dummies = [
        { id: '11111111-1111-4111-a111-111111111111', username: 'AlexTactics', xp: 1200, points: 56, rank: 1 },
        { id: '22222222-2222-4222-a222-222222222222', username: 'JordanFC', xp: 800, points: 48, rank: 2 },
        { id: '33333333-3333-4333-a333-333333333333', username: 'Taylor United', xp: 2100, points: 30, rank: 4 }
      ];

      for (let dummy of dummies) {
        // Upsert dummy user
        await supabase.from('users').upsert({
          id: dummy.id,
          username: dummy.username,
          xp: dummy.xp
        });

        // Add dummy to league
        await supabase.from('league_members').upsert({
          league_id: leagueId,
          user_id: dummy.id,
          rank: dummy.rank,
          total_points: dummy.points
        });
      }

      setStatus('Seeding complete! Refresh your app.');
    } catch (err) {
      setStatus('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const simulateLiveEvents = async () => {
    try {
      setLoading(true);
      setStatus('Finding matches...');
      // 1. Pick 2 fixtures
      const { data: fixtures } = await supabase.from('fixtures').select('*').limit(2);
      if (!fixtures || fixtures.length === 0) return setStatus('No fixtures found. Seed first.');
      
      const fIds = fixtures.map(f => f.id);
      
      setStatus('Setting matches to live...');
      // 2. Update to live
      await supabase.from('fixtures')
        .update({ status: 'live', minute: '64' })
        .in('id', fIds);

      setStatus('Generating interactive events...');
      // 3. Clear old events to avoid clutter
      await supabase.from('match_events').delete().in('fixture_id', fIds);

      // 4. Create a dense set of events
      const { data: squad } = await supabase.from('squads').select('players').limit(1);
      const players = squad?.[0]?.players || [];
      
      const mockEvents = [
        { fixture_id: fIds[0], type: 'goal', player_id: players[0] || 'p1', minute: '12', team: fixtures[0].home_team },
        { fixture_id: fIds[0], type: 'yellow', player_id: players[5] || 'p6', minute: '28', team: fixtures[0].home_team },
        { fixture_id: fIds[1], type: 'goal', player_id: players[1] || 'p2', minute: '41', team: fixtures[1].away_team },
        { fixture_id: fIds[0], type: 'goal', player_id: players[2] || 'p3', minute: '55', team: fixtures[0].away_team },
        { fixture_id: fIds[1], type: 'red', player_id: players[10] || 'p11', minute: '61', team: fixtures[1].home_team }
      ];

      await supabase.from('match_events').insert(mockEvents);

      setStatus('Live Simulation ACTIVE! Go to the Live tab.');
    } catch(err) {
      console.error(err);
      setStatus('Simulation failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const triggerVarCheck = async () => {
    try {
      setLoading(true);
      const { data: fixtures } = await supabase.from('fixtures').select('*').limit(1);
      const { data: squad } = await supabase.from('squads').select('players').limit(1);
      if(!fixtures || !squad) return setStatus('No data to hook VAR to.');
      
      await supabase.from('match_events').insert({
        fixture_id: fixtures[0].id,
        type: 'var',
        player_id: squad[0].players[2] || 'p3',
        minute: '63',
        team: fixtures[0].away_team
      });
      setStatus('VAR Review Triggered! Check Live Tab.');
    } catch (err) {
      setStatus('Failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const resolveVarReversed = async () => {
    try {
      setLoading(true);
      // Delete the var event and the goal event for this player (p3)
      await supabase.from('match_events').delete().in('type', ['goal', 'var']).eq('player_id', 'p3').eq('team', 'KOR');
      setStatus('Goal Reversed! Projections updated.');
    } catch (err) {
      setStatus('Failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg p-6">
      <h1 className="text-xl font-bold uppercase mb-8">Admin Tools</h1>
      
      <div className="bg-surface border border-border p-6 rounded flex flex-col gap-4">
        <div>
           <h2 className="text-sm font-bold uppercase mb-1">Initial Data Seed</h2>
           <p className="text-xs text-text-secondary mb-4">Populate World Cup fixtures, players, and dummy rivals.</p>
           <button onClick={seedData} disabled={loading} className="w-full bg-white text-black font-black py-4 uppercase tracking-widest disabled:opacity-50">
             {loading ? 'Processing...' : 'Seed Data'}
           </button>
        </div>

        <div className="border-t border-border pt-4">
           <h2 className="text-sm font-bold uppercase mb-1">Simulate Live Game</h2>
           <p className="text-xs text-text-secondary mb-4">Triggers fake goals and sets matches to 'live' for the Live Tab.</p>
           <div className="flex flex-col gap-2">
             <button onClick={simulateLiveEvents} disabled={loading} className="w-full bg-surface border-2 border-border text-white font-black py-4 uppercase tracking-widest disabled:opacity-50">
               Trigger Live Simulation
             </button>
             <div className="flex gap-2 w-full">
               <button onClick={triggerVarCheck} disabled={loading} className="flex-1 bg-[#1a1100] border border-[#FFB300] text-[#FFB300] font-black py-3 uppercase tracking-widest rounded-sm disabled:opacity-50 text-[10px]">
                 Trigger VAR Check
               </button>
               <button onClick={resolveVarReversed} disabled={loading} className="flex-1 bg-[#2b0c0c] border border-negative text-negative font-black py-3 uppercase tracking-widest rounded-sm disabled:opacity-50 text-[10px]">
                 Resolve (Goal Off)
               </button>
             </div>
           </div>
        </div>
        {status && (
          <div className="mt-2 p-4 bg-bg border border-border text-[11px] font-mono font-bold text-positive uppercase tracking-widest text-center">
            {status}
          </div>
        )}
      </div>
    </div>
  );
}
