import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import { useClubhouseContext } from '../context/ClubhouseContext';

// One "things waiting for me" list for Home (all Clubhouses) and the Room (one Clubhouse).
// Both read the same data, so the counts match. Each item clears once it is done.
export function useYourMove(circleId = null) {
  const { user } = useAuth();
  const { myCircles } = useClubhouseContext();
  const [bets, setBets] = useState([]);
  const [challenges, setChallenges] = useState([]);
  const [squads, setSquads] = useState([]);
  const [loading, setLoading] = useState(true);

  const circleKey = (myCircles ?? []).filter(c => !c.archived).map(c => c.id).join(',');

  const load = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    const ids = circleKey ? circleKey.split(',') : [];
    const [betRes, chRes, sqRes] = await Promise.all([
      Promise.all(ids.map(id => supabase.rpc('get_clubhouse_bets', { p_circle_id: id }))),
      supabase.rpc('get_my_challenges', { p_circle_id: null }),
      supabase
        .from('squads')
        .select('league_id, initial_build_complete, leagues!inner(name, circle_id, archived)')
        .eq('user_id', user.id)
        .eq('leagues.archived', false),
    ]);
    setBets(betRes.flatMap(r => (Array.isArray(r.data) ? r.data : [])));
    setChallenges(Array.isArray(chRes.data) ? chRes.data : []);
    setSquads(sqRes.data ?? []);
    setLoading(false);
  }, [user?.id, circleKey]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase.channel(`your-move:${user.id}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'p2p_bets' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'p2p_bet_participants' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'p2p_challenges' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, load]);

  return useMemo(() => {
    const me = user?.id;
    const inScope = (cid) => !circleId || cid === circleId;
    const items = [];

    for (const b of bets) {
      if (!inScope(b.circle_id)) continue;
      if (b.status === 'open' && !b.is_participant && b.creator_id !== me) {
        items.push({ key: `bet-${b.id}`, kind: 'accept', circleId: b.circle_id, title: b.question, sub: `Take or pass · ${b.stake_coins} coins`, cta: 'Take or pass' });
      } else if (b.status === 'closed' && b.creator_id === me) {
        items.push({ key: `declare-${b.id}`, kind: 'declare', circleId: b.circle_id, title: b.question, sub: 'Declare the result', cta: 'Declare', to: '/challenges?tab=bets' });
      }
    }
    for (const c of challenges) {
      if (!inScope(c.circle_id)) continue;
      if (c.status === 'pending' && c.opponent_id === me) {
        items.push({ key: `ch-${c.id}`, kind: 'accept', circleId: c.circle_id, title: c.question ?? c.message ?? 'Head-to-head challenge', sub: `Take or pass · ${c.stake_coins} coins`, cta: 'Take or pass' });
      } else if (c.status === 'accepted' && c.proposed_by && c.proposed_by !== me) {
        items.push({ key: `confirm-${c.id}`, kind: 'confirm', circleId: c.circle_id, title: c.question ?? c.message ?? 'Head-to-head challenge', sub: 'Confirm the result', cta: 'Confirm', to: '/bets' });
      }
    }
    const finished = new Set(squads.filter(s => s.initial_build_complete).map(s => s.league_id));
    const seen = new Set();
    for (const s of squads) {
      if (s.initial_build_complete || finished.has(s.league_id) || seen.has(s.league_id)) continue;
      seen.add(s.league_id);
      if (!inScope(s.leagues?.circle_id)) continue;
      items.push({ key: `squad-${s.league_id}`, kind: 'lineup', circleId: s.leagues?.circle_id, title: `Set your lineup in ${s.leagues?.name ?? 'your league'}`, sub: 'Your squad is not finished', cta: 'Set lineup', to: `/league/${s.league_id}` });
    }

    const openBets =
      bets.filter(b => inScope(b.circle_id) && (b.status === 'open' || b.status === 'closed')).length +
      challenges.filter(c => inScope(c.circle_id) && (c.status === 'pending' || c.status === 'accepted')).length;

    return { items, count: items.length, openBets, loading };
  }, [bets, challenges, squads, user?.id, circleId, loading]);
}
